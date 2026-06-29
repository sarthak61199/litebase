import type { DbResponses } from "./rpc/protocol";
import type { WorkerRpc } from "./rpc/client";

export class AlreadyRunningError extends Error {
  constructor() {
    super("A query is already in flight");
    this.name = "AlreadyRunningError";
  }
}

export type QueryResult = DbResponses["query"];

export type DbClientEvent =
  | { type: "engine:booting" }
  | { type: "engine:ready" }
  | { type: "engine:restarting" }
  | { type: "engine:crashed"; error: Error }
  | { type: "run:begin"; runId: string }
  | {
      type: "run:succeed";
      runId: string;
      result: QueryResult;
      durationMs: number;
    }
  | { type: "run:fail"; runId: string; error: Error; durationMs: number }
  | { type: "run:cancelling"; runId: string };

// How long to wait for a post-cancel ping before declaring the worker stuck.
const HARD_STOP_GRACE_MS = 500;

export class DBClient {
  private readonly rpc: WorkerRpc;
  private timeoutMs: number;
  private readonly listeners = new Set<(event: DbClientEvent) => void>();
  private runCounter = 0;
  private currentAc: AbortController | null = null;
  private currentRunId: string | null = null;
  private restarting = false;

  constructor(rpc: WorkerRpc, timeoutMs = 10_000) {
    this.rpc = rpc;
    this.timeoutMs = timeoutMs;
  }

  on(listener: (event: DbClientEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: DbClientEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  async boot(): Promise<void> {
    this.emit({ type: "engine:booting" });
    // Wait for the worker to actually register its message handler before
    // declaring the engine ready. Emitting ready early lets the UI send a
    // query into a worker that isn't serving yet; that request is dropped and
    // hangs forever.
    await this.rpc.whenReady();
    this.emit({ type: "engine:ready" });
  }

  setTimeoutMs(ms: number): void {
    this.timeoutMs = ms;
  }

  async run(
    sql: string,
    options: { timeoutMs?: number } = {}
  ): Promise<QueryResult> {
    if (this.restarting) {
      throw new Error("Engine is restarting; please wait for ready");
    }
    if (this.currentRunId !== null) {
      throw new AlreadyRunningError();
    }

    const runId = String(++this.runCounter);
    const perCallMs = options.timeoutMs ?? this.timeoutMs;

    const ac = new AbortController();
    this.currentAc = ac;
    this.currentRunId = runId;

    let softTimer: ReturnType<typeof setTimeout> | undefined;
    if (perCallMs > 0) {
      softTimer = setTimeout(() => {
        ac.abort(new Error(`Query timed out after ${perCallMs}ms`));
      }, perCallMs);
    }

    this.emit({ type: "run:begin", runId });
    const t0 = performance.now();
    try {
      const result = await this.rpc.call(
        "query",
        { sql },
        { signal: ac.signal }
      );
      clearTimeout(softTimer);
      const durationMs = performance.now() - t0;
      this.emit({ type: "run:succeed", runId, result, durationMs });
      return result;
    } catch (err) {
      clearTimeout(softTimer);
      const durationMs = performance.now() - t0;
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit({ type: "run:fail", runId, error, durationMs });
      if (ac.signal.aborted) {
        void this.maybeHardStop();
      }
      throw error;
    } finally {
      if (this.currentRunId === runId) {
        this.currentAc = null;
        this.currentRunId = null;
      }
    }
  }

  cancel(): void {
    if (!this.currentAc || !this.currentRunId) return;
    this.emit({ type: "run:cancelling", runId: this.currentRunId });
    this.currentAc.abort(new Error("Cancelled by user"));
  }

  private async maybeHardStop(): Promise<void> {
    this.restarting = true;
    try {
      await this.rpc.call("ping", {}, { timeoutMs: HARD_STOP_GRACE_MS });
      this.restarting = false;
    } catch {
      this.emit({ type: "engine:restarting" });
      this.rpc.restart();
      // Wait for the freshly spawned worker to finish WASM initialisation and
      // register its message handler before emitting ready. Without this, the
      // next query can be posted into a worker that isn't serving yet and hang
      // forever. The restarting state stays visible for the full respawn, which
      // also gives React/Playwright time to observe it.
      await this.rpc.whenReady();
      this.emit({ type: "engine:ready" });
      this.restarting = false;
    }
  }
}
