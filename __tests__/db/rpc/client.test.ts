import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerRpc, type WorkerLike } from '../../../src/db/rpc/client';
import type { RpcMessage } from '../../../src/db/rpc/shared';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  messages: unknown[] = [];
  terminated = false;

  postMessage(msg: unknown): void {
    this.messages.push(msg);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(msg: RpcMessage): void {
    this.onmessage?.(new MessageEvent('message', { data: msg }));
  }

  lastRequest(): { id: string; method: string } {
    return this.messages[this.messages.length - 1] as { id: string; method: string };
  }
}

describe('WorkerRpc', () => {
  let fakeWorker: FakeWorker;
  let rpc: WorkerRpc;

  beforeEach(() => {
    vi.useFakeTimers();
    fakeWorker = new FakeWorker();
    rpc = new WorkerRpc(() => fakeWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ID correlation', () => {
    it('resolves with the result when the matching id responds', async () => {
      const p = rpc.call('ping', {});
      const { id } = fakeWorker.lastRequest();
      fakeWorker.respond({ id, method: 'ping', ok: true, result: { ok: true } });
      await expect(p).resolves.toEqual({ ok: true });
    });

    it('routes out-of-order responses to the correct promise', async () => {
      const p1 = rpc.call('ping', {});
      const p2 = rpc.call('init', { timeoutMs: 5000 });
      const req1 = fakeWorker.messages[0] as { id: string };
      const req2 = fakeWorker.messages[1] as { id: string };

      // respond to p2 first, then p1
      fakeWorker.respond({ id: req2.id, method: 'init', ok: true, result: { ok: true } });
      fakeWorker.respond({ id: req1.id, method: 'ping', ok: true, result: { ok: true } });

      await expect(p1).resolves.toEqual({ ok: true });
      await expect(p2).resolves.toEqual({ ok: true });
    });

    it('rejects with a deserialized error on an error response', async () => {
      const p = rpc.call('ping', {});
      const { id } = fakeWorker.lastRequest();
      fakeWorker.respond({
        id,
        method: 'ping',
        ok: false,
        error: { message: 'worker blew up', name: 'Error' },
      });
      await expect(p).rejects.toThrow('worker blew up');
    });

    it('ignores a response for an unknown id', () => {
      // No call in flight — responding to a random id must not throw
      expect(() =>
        fakeWorker.respond({ id: 'no-such-id', method: 'ping', ok: true, result: { ok: true } }),
      ).not.toThrow();
    });
  });

  describe('per-call timeout', () => {
    it('rejects after timeoutMs elapses', async () => {
      const p = rpc.call('ping', {}, { timeoutMs: 100 });
      vi.advanceTimersByTime(100);
      await expect(p).rejects.toThrow("RPC call 'ping' timed out after 100ms");
    });

    it('does not reject when response arrives before timeout', async () => {
      const p = rpc.call('ping', {}, { timeoutMs: 1000 });
      const { id } = fakeWorker.lastRequest();
      fakeWorker.respond({ id, method: 'ping', ok: true, result: { ok: true } });
      await expect(p).resolves.toEqual({ ok: true });
    });

    it('cleans up the timer after resolution so no dangling callback fires', async () => {
      const p = rpc.call('ping', {}, { timeoutMs: 500 });
      const { id } = fakeWorker.lastRequest();
      fakeWorker.respond({ id, method: 'ping', ok: true, result: { ok: true } });
      await p;
      // Advancing past the timeout must not cause an unhandled rejection
      expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    });

    it('does not start a timer when timeoutMs is 0', async () => {
      // A zero timeoutMs should not reject
      const p = rpc.call('ping', {}, { timeoutMs: 0 });
      vi.advanceTimersByTime(10_000);
      const { id } = fakeWorker.lastRequest();
      fakeWorker.respond({ id, method: 'ping', ok: true, result: { ok: true } });
      await expect(p).resolves.toEqual({ ok: true });
    });
  });

  describe('AbortSignal cancellation', () => {
    it('rejects immediately when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort(new Error('pre-aborted'));
      const p = rpc.call('ping', {}, { signal: controller.signal });
      await expect(p).rejects.toThrow('pre-aborted');
    });

    it('rejects when signal aborts mid-flight', async () => {
      const controller = new AbortController();
      const p = rpc.call('ping', {}, { signal: controller.signal });
      controller.abort(new Error('user cancelled'));
      await expect(p).rejects.toThrow('user cancelled');
    });

    it('does not reject if response arrives before the abort', async () => {
      const controller = new AbortController();
      const p = rpc.call('ping', {}, { signal: controller.signal });
      const { id } = fakeWorker.lastRequest();
      fakeWorker.respond({ id, method: 'ping', ok: true, result: { ok: true } });
      await expect(p).resolves.toEqual({ ok: true });
      // abort after resolution must be a no-op
      controller.abort();
    });

    it('cleans up the abort listener after resolution', async () => {
      const controller = new AbortController();
      const p = rpc.call('ping', {}, { signal: controller.signal });
      const { id } = fakeWorker.lastRequest();
      fakeWorker.respond({ id, method: 'ping', ok: true, result: { ok: true } });
      await p;
      // aborting now must not throw or reject anything
      expect(() => controller.abort()).not.toThrow();
    });
  });

  describe('terminate()', () => {
    it('calls terminate on the underlying worker', () => {
      rpc.terminate();
      expect(fakeWorker.terminated).toBe(true);
    });

    it('rejects all pending calls', async () => {
      const p1 = rpc.call('ping', {});
      const p2 = rpc.call('init', { timeoutMs: 5000 });
      rpc.terminate();
      await expect(p1).rejects.toThrow('Worker terminated');
      await expect(p2).rejects.toThrow('Worker terminated');
    });

    it('leaves no pending calls after rejection', () => {
      rpc.call('ping', {}).catch(() => {});
      rpc.terminate();
      // A subsequent terminate should not double-reject (no second error thrown)
      expect(() => rpc.terminate()).not.toThrow();
    });
  });

  describe('restart()', () => {
    it('rejects all pending calls with "Worker restarted"', async () => {
      const p = rpc.call('ping', {});
      rpc.restart();
      await expect(p).rejects.toThrow('Worker restarted');
    });

    it('terminates the old worker', () => {
      rpc.restart();
      expect(fakeWorker.terminated).toBe(true);
    });

    it('spawns a fresh worker and routes new calls to it', async () => {
      const workers: FakeWorker[] = [];
      const rpc2 = new WorkerRpc(() => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      });

      rpc2.restart();
      expect(workers).toHaveLength(2);

      const p = rpc2.call('ping', {});
      const { id } = workers[1].lastRequest();
      workers[1].respond({ id, method: 'ping', ok: true, result: { ok: true } });
      await expect(p).resolves.toEqual({ ok: true });
    });
  });

  describe('stale-generation responses', () => {
    it('silently drops a response posted by the old worker after restart', async () => {
      const workers: FakeWorker[] = [];
      const rpc2 = new WorkerRpc(() => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      });

      const staleP = rpc2.call('ping', {});
      const oldWorker = workers[0];
      const staleReq = oldWorker.lastRequest();

      rpc2.restart();
      await expect(staleP).rejects.toThrow('Worker restarted');

      // Start a new call on the fresh worker (generation 1)
      const freshP = rpc2.call('ping', {});
      const newWorker = workers[1];
      const freshReq = newWorker.lastRequest();

      // Old worker fires a late response — must be silently dropped
      oldWorker.respond({ id: staleReq.id, method: 'ping', ok: true, result: { ok: true } });

      // New worker responds correctly — freshP must resolve normally
      newWorker.respond({ id: freshReq.id, method: 'ping', ok: true, result: { ok: true } });
      await expect(freshP).resolves.toEqual({ ok: true });
    });

    it('silently drops a response posted by the old worker after terminate', async () => {
      const workers: FakeWorker[] = [];
      const rpc2 = new WorkerRpc(() => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      });

      const p = rpc2.call('ping', {});
      const oldWorker = workers[0];
      const req = oldWorker.lastRequest();

      rpc2.terminate();
      await expect(p).rejects.toThrow('Worker terminated');

      // Old worker fires a response for the now-gone pending call — must not throw
      expect(() =>
        oldWorker.respond({ id: req.id, method: 'ping', ok: true, result: { ok: true } }),
      ).not.toThrow();
    });
  });
});
