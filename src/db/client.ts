import type { DbResponses } from './rpc/protocol';
import type { WorkerRpc } from './rpc/client';

export class AlreadyRunningError extends Error {
  constructor() {
    super('A query is already in flight');
    this.name = 'AlreadyRunningError';
  }
}

export type QueryResult = DbResponses['query'];

export type DbClientEvent =
  | { type: 'engine:booting' }
  | { type: 'engine:ready' }
  | { type: 'engine:restarting' }
  | { type: 'engine:crashed'; error: Error }
  | { type: 'run:begin'; runId: string }
  | { type: 'run:succeed'; runId: string; result: QueryResult; durationMs: number }
  | { type: 'run:fail'; runId: string; error: Error; durationMs: number }
  | { type: 'run:cancelling'; runId: string };

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
    this.listeners.forEach(l => l(event));
  }

  private async applyTimeout(): Promise<void> {
    await this.rpc.call('init', { timeoutMs: this.timeoutMs });
  }

  async boot(): Promise<void> {
    this.emit({ type: 'engine:booting' });
    await this.applyTimeout();
    this.emit({ type: 'engine:ready' });
  }

  async setTimeoutMs(ms: number): Promise<void> {
    this.timeoutMs = ms;
    await this.applyTimeout();
  }

  async run(sql: string, options: { timeoutMs?: number } = {}): Promise<QueryResult> {
    if (this.restarting) {
      throw new Error('Engine is restarting; please wait for ready');
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

    this.emit({ type: 'run:begin', runId });
    const t0 = performance.now();
    try {
      const result = await this.rpc.call('query', { sql }, { signal: ac.signal });
      clearTimeout(softTimer);
      const durationMs = performance.now() - t0;
      this.emit({ type: 'run:succeed', runId, result, durationMs });
      return result;
    } catch (err) {
      clearTimeout(softTimer);
      const durationMs = performance.now() - t0;
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit({ type: 'run:fail', runId, error, durationMs });
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
    this.emit({ type: 'run:cancelling', runId: this.currentRunId });
    this.currentAc.abort(new Error('Cancelled by user'));
  }

  // Probes the worker after a soft-cancel. If it responds within the grace
  // period the worker freed itself (statement_timeout fired). If not, we
  // terminate and respawn — the only guaranteed stop.
  private async maybeHardStop(): Promise<void> {
    this.restarting = true;
    try {
      await this.rpc.call('ping', {}, { timeoutMs: HARD_STOP_GRACE_MS });
      // Worker responded — it freed itself, no restart needed.
      this.restarting = false;
    } catch {
      // Worker did not respond in time — terminate and respawn.
      this.emit({ type: 'engine:restarting' });
      this.rpc.restart();
      try {
        await this.applyTimeout();
        this.emit({ type: 'engine:ready' });
      } catch (bootErr) {
        const error = bootErr instanceof Error ? bootErr : new Error(String(bootErr));
        this.emit({ type: 'engine:crashed', error });
      } finally {
        this.restarting = false;
      }
    }
  }
}
