import type { DbResponses } from './rpc/protocol';
import type { WorkerRpc } from './rpc/client';

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

export class DBClient {
  private readonly rpc: WorkerRpc;
  private timeoutMs: number;
  private readonly listeners = new Set<(event: DbClientEvent) => void>();
  private runCounter = 0;

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

  async run(sql: string): Promise<QueryResult> {
    const runId = String(++this.runCounter);
    this.emit({ type: 'run:begin', runId });
    const t0 = performance.now();
    try {
      const result = await this.rpc.call('query', { sql });
      const durationMs = performance.now() - t0;
      this.emit({ type: 'run:succeed', runId, result, durationMs });
      return result;
    } catch (err) {
      const durationMs = performance.now() - t0;
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit({ type: 'run:fail', runId, error, durationMs });
      throw error;
    }
  }
}
