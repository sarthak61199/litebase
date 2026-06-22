import type { PGlite } from "@electric-sql/pglite";
import type { Handlers } from "./rpc/server";
import { PgError } from "./rpc/shared";

const DEFAULT_ROW_CAP = 10_000;

function liftPgError(err: unknown): never {
  if (err instanceof Error) {
    const e = err as Error & {
      code?: string;
      detail?: string;
      hint?: string;
      position?: string;
    };
    throw new PgError(e.message, {
      code: e.code,
      detail: e.detail,
      hint: e.hint,
      position: e.position,
    });
  }
  throw err;
}

export function createHandlers(db: PGlite): Handlers {
  return {
    async init({ timeoutMs }) {
      try {
        await db.exec(`SET statement_timeout = ${Math.floor(timeoutMs)}`);
      } catch (err) {
        liftPgError(err);
      }
      return { ok: true };
    },

    async query({ sql, rowCapOverride }) {
      const cap = rowCapOverride ?? DEFAULT_ROW_CAP;
      try {
        const result = await db.query<unknown[]>(sql, [], { rowMode: "array" });
        const rows = result.rows as unknown[][];
        const totalRows = rows.length;
        const capped = totalRows > cap;
        return {
          fields: result.fields.map((f) => ({
            name: f.name,
            dataTypeID: f.dataTypeID,
          })),
          rows: capped ? rows.slice(0, cap) : rows,
          totalRows,
          capped,
        };
      } catch (err) {
        liftPgError(err);
      }
    },

    async ping(_payload) {
      return { ok: true };
    },
  };
}
