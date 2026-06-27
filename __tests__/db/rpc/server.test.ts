import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { serveWorker } from '../../../src/db/rpc/server';
import type { Handlers } from '../../../src/db/rpc/server';

function makeHandlers(overrides: Partial<Handlers> = {}): Handlers {
  return {
    query: vi.fn().mockResolvedValue({ fields: [], rows: [], totalRows: 0, capped: false }),
    ping: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

// Trigger the onmessage listener serveWorker registers on self
function fire(data: unknown) {
  const event = new MessageEvent('message', { data });
  (self.onmessage as (ev: MessageEvent) => void)(event);
}

// Flush all pending microtasks/macrotasks
function flush() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('serveWorker', () => {
  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    postSpy = vi.spyOn(self, 'postMessage').mockImplementation(() => {});
  });

  afterEach(() => {
    postSpy.mockRestore();
    self.onmessage = null;
  });

  it('routes a known method to its handler and posts ok + result', async () => {
    const handlers = makeHandlers();
    serveWorker(handlers);

    fire({ id: 'r1', method: 'ping', payload: {} });
    await flush();

    expect(postSpy).toHaveBeenCalledOnce();
    expect(postSpy).toHaveBeenCalledWith({ id: 'r1', method: 'ping', ok: true, result: { ok: true } });
    expect(handlers.ping).toHaveBeenCalledWith({});
  });

  it('forwards the full payload to the handler', async () => {
    const handlers = makeHandlers();
    serveWorker(handlers);

    const payload = { sql: 'SELECT 1', rowCapOverride: 500 };
    fire({ id: 'r2', method: 'query', payload });
    await flush();

    expect(handlers.query).toHaveBeenCalledWith(payload);
    const [msg] = postSpy.mock.calls[0];
    expect(msg.ok).toBe(true);
    expect(msg.id).toBe('r2');
  });

  it('posts a serialized error for an unknown method', async () => {
    serveWorker(makeHandlers());

    fire({ id: 'r3', method: 'doesNotExist', payload: {} });
    await flush();

    expect(postSpy).toHaveBeenCalledOnce();
    const [msg] = postSpy.mock.calls[0];
    expect(msg.id).toBe('r3');
    expect(msg.ok).toBe(false);
    expect(msg.error.message).toMatch(/Unknown method/i);
  });

  it('serializes and posts a handler rejection', async () => {
    const handlers = makeHandlers({
      query: vi.fn().mockRejectedValue(new Error('query blew up')),
    });
    serveWorker(handlers);

    fire({ id: 'r4', method: 'query', payload: { sql: 'bad' } });
    await flush();

    expect(postSpy).toHaveBeenCalledOnce();
    const [msg] = postSpy.mock.calls[0];
    expect(msg.id).toBe('r4');
    expect(msg.method).toBe('query');
    expect(msg.ok).toBe(false);
    expect(msg.error.message).toBe('query blew up');
    expect(msg.error.name).toBe('Error');
  });

  it('preserves id and method in all response paths', async () => {
    const handlers = makeHandlers({
      query: vi.fn().mockRejectedValue(new Error('query failed')),
    });
    serveWorker(handlers);

    fire({ id: 'r5', method: 'query', payload: { sql: 'bad sql' } });
    await flush();

    const [msg] = postSpy.mock.calls[0];
    expect(msg.id).toBe('r5');
    expect(msg.method).toBe('query');
  });
});
