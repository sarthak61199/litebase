import type { DbRequests, DbResponses } from './protocol';

// ── Envelope types ──────────────────────────────────────────────────────────

export type Method = keyof DbRequests;

export interface RpcRequest<M extends Method = Method> {
  id: string;
  method: M;
  payload: DbRequests[M];
}

export interface RpcResponse<M extends Method = Method> {
  id: string;
  method: M;
  ok: true;
  result: DbResponses[M];
}

export interface RpcError {
  id: string;
  method: Method;
  ok: false;
  error: SerializedError;
}

export type RpcMessage<M extends Method = Method> = RpcResponse<M> | RpcError;

// ── Error serialization ──────────────────────────────────────────────────────

export interface SerializedError {
  message: string;
  name: string;
  stack?: string;
  // Postgres-specific fields
  code?: string;
  detail?: string;
  hint?: string;
  position?: string;
}

export class PgError extends Error {
  code?: string;
  detail?: string;
  hint?: string;
  position?: string;

  constructor(message: string, fields: Omit<SerializedError, 'message' | 'name' | 'stack'> = {}) {
    super(message);
    this.name = 'PgError';
    this.code = fields.code;
    this.detail = fields.detail;
    this.hint = fields.hint;
    this.position = fields.position;
  }
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof PgError) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      position: err.position,
    };
  }
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
    };
  }
  return {
    message: String(err),
    name: 'Error',
  };
}

export function deserializeError(serialized: SerializedError): Error {
  const hasPgFields =
    serialized.code !== undefined ||
    serialized.detail !== undefined ||
    serialized.hint !== undefined ||
    serialized.position !== undefined;

  if (hasPgFields || serialized.name === 'PgError') {
    const err = new PgError(serialized.message, {
      code: serialized.code,
      detail: serialized.detail,
      hint: serialized.hint,
      position: serialized.position,
    });
    err.stack = serialized.stack;
    return err;
  }

  const err = new Error(serialized.message);
  err.name = serialized.name;
  err.stack = serialized.stack;
  return err;
}
