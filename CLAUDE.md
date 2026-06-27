# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server on port 3000
npm run build        # tsc -b + vite build → dist/
npm run test         # vitest run (all tests)
npm run test:coverage # vitest run --coverage (must pass 80% gate)
```

Run a single test file:
```bash
npx vitest run __tests__/db/handlers.test.ts
```

Run tests in node environment (required for real PGlite integration tests):
```bash
npx vitest run --reporter=verbose __tests__/db/handlers.test.ts
```

## Architecture

**litebase** is a 100% client-side PostgreSQL playground. Real Postgres 17 runs via PGlite (`memory://`) inside a Web Worker. The main thread never blocks. Data is ephemeral — nothing persists across reloads.

```
React UI → DBClient (main thread) → WorkerRpc → Web Worker → PGlite (memory://)
```

### Layer map

| Layer | File | Role |
|---|---|---|
| RPC types | `src/db/rpc/protocol.ts` | `DbRequests`/`DbResponses` type maps (types only, no runtime) |
| RPC envelopes & errors | `src/db/rpc/shared.ts` | `RpcRequest/Response/Error`, `PgError`, `serializeError`/`deserializeError` |
| Worker router | `src/db/rpc/server.ts` | `serveWorker(handlers)` — single `onmessage` dispatcher |
| Main-thread RPC | `src/db/rpc/client.ts` | `WorkerRpc` — ID correlation, per-call timeout/abort, terminate+rejectAll, generation tracking |
| PGlite handlers | `src/db/handlers.ts` | `createHandlers(db)` — `query` (row cap), `ping` |
| Worker entry | `src/db/worker.ts` | Instantiates PGlite, prewarms with `SELECT 1`, calls `serveWorker` |
| DBClient | `src/db/client.ts` | Orchestrates the two-layer cancellation strategy; emits typed events |

### Cancellation strategy (the core design)

Two effective layers (US-46 removed layer 2 — `statement_timeout` is a complete no-op in PGlite; WASM blocks the JS event loop for all query types, so the interrupt is never delivered):

1. **Soft-cancel** — `AbortController` + timer on the main thread. Rejects the UI promise instantly so the UI stays responsive. The worker may still be executing.
2. **Hard-stop** — after soft-cancel, `DBClient` sends a `ping` to the worker with a 500ms grace window. If no response, it calls `worker.terminate()` then `rpc.restart()`, spawning a fresh `memory://` worker (~1s). Because the DB is `memory://`, this **wipes all tables**. The engine enters `engine:restarting` immediately, then emits `engine:ready` when the new worker is ready. Run must stay disabled during this window.

### `DBClient` events

`DBClient` is store-agnostic and communicates via typed events. Future `src/db/bindings.ts` is the single place that subscribes to these events and routes to Zustand stores:

```
engine:booting | engine:ready | engine:restarting | engine:crashed
run:begin | run:succeed | run:fail | run:cancelling
```

### Query result shape

`query` always returns `rowMode: 'array'` results:
```ts
{ fields: Array<{name, dataTypeID}>, rows: unknown[][], totalRows: number, capped: boolean }
```
Default row cap is 10 000. `capped: true` when results were truncated.

## Tests

Tests live in `__tests__/`. Integration tests that need real PGlite use `// @vitest-environment node` at the top of the file. Unit tests default to `jsdom`.

Coverage excludes `src/db/rpc/protocol.ts`, `src/main.tsx`, `src/vite-env.d.ts`.

## Remaining work (USER_STORIES.md)

The unfinished user stories are US-46 (done) and US-14 onward. The `src/` currently has no Zustand stores, no React components (besides a stub `App`), no `bindings.ts`, and no `useRunController`. The `DBClient` and entire `src/db/` layer are complete and tested.
