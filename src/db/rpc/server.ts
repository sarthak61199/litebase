import type { DbRequests, DbResponses } from './protocol';
import type { Method, RpcRequest } from './shared';
import { serializeError } from './shared';

export type Handlers = {
  [M in Method]: (payload: DbRequests[M]) => Promise<DbResponses[M]>;
};

export function serveWorker(handlers: Handlers): void {
  self.onmessage = async (event: MessageEvent<RpcRequest>) => {
    const { id, method, payload } = event.data;

    const handler = (handlers as Record<string, unknown>)[method];

    if (typeof handler !== 'function') {
      self.postMessage({
        id,
        method,
        ok: false,
        error: serializeError(new Error(`Unknown method: ${method}`)),
      });
      return;
    }

    try {
      const result = await (handler as (p: unknown) => Promise<unknown>)(payload);
      self.postMessage({ id, method, ok: true, result });
    } catch (err) {
      self.postMessage({ id, method, ok: false, error: serializeError(err) });
    }
  };
}
