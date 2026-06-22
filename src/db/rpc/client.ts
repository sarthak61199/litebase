import type { DbRequests, DbResponses } from './protocol';
import type { Method, RpcMessage, RpcRequest } from './shared';
import { deserializeError } from './shared';

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  cleanup: () => void;
}

export interface WorkerLike {
  postMessage(msg: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

export class WorkerRpc {
  private readonly spawn: () => WorkerLike;
  private worker: WorkerLike;
  private pending = new Map<string, PendingCall>();
  private generation = 0;
  private nextId = 0;

  constructor(spawn: () => WorkerLike) {
    this.spawn = spawn;
    this.worker = this.spawnWorker();
  }

  private spawnWorker(): WorkerLike {
    const gen = this.generation;
    const worker = this.spawn();
    worker.onmessage = (event: MessageEvent<RpcMessage>) => {
      if (gen !== this.generation) return;
      this.handleMessage(event.data);
    };
    return worker;
  }

  private handleMessage(msg: RpcMessage): void {
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    pending.cleanup();
    this.pending.delete(msg.id);
    if (msg.ok) {
      pending.resolve(msg.result);
    } else {
      pending.reject(deserializeError(msg.error));
    }
  }

  private rejectAll(reason: unknown): void {
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(reason);
    }
    this.pending.clear();
  }

  call<M extends Method>(
    method: M,
    payload: DbRequests[M],
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<DbResponses[M]> {
    return new Promise((resolve, reject) => {
      const id = `${this.generation}-${this.nextId++}`;

      if (options.signal?.aborted) {
        reject(options.signal.reason ?? new Error('Aborted'));
        return;
      }

      const cleanupFns: Array<() => void> = [];
      const cleanup = () => cleanupFns.forEach(fn => fn());

      if (options.signal) {
        const sig = options.signal;
        const onAbort = () => {
          if (!this.pending.has(id)) return;
          this.pending.delete(id);
          cleanup();
          reject(sig.reason ?? new Error('Aborted'));
        };
        sig.addEventListener('abort', onAbort, { once: true });
        cleanupFns.push(() => sig.removeEventListener('abort', onAbort));
      }

      if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
        const ms = options.timeoutMs;
        const timer = setTimeout(() => {
          if (!this.pending.has(id)) return;
          this.pending.delete(id);
          cleanup();
          reject(new Error(`RPC call '${method}' timed out after ${ms}ms`));
        }, ms);
        cleanupFns.push(() => clearTimeout(timer));
      }

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        cleanup,
      });

      const request: RpcRequest<M> = { id, method, payload };
      this.worker.postMessage(request);
    });
  }

  terminate(): void {
    this.generation++;
    this.worker.terminate();
    this.rejectAll(new Error('Worker terminated'));
  }

  restart(): void {
    this.generation++;
    this.worker.terminate();
    this.rejectAll(new Error('Worker restarted'));
    this.worker = this.spawnWorker();
  }
}
