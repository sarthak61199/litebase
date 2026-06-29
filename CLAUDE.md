# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server on port 3000
npm run build        # tsc -b + vite build → dist/
npm run test         # vitest run (all tests)
npm run test:coverage # vitest run --coverage (must pass 80% gate)
npm run test:e2e     # playwright test (requires built app; webServer auto-starts preview)
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
| Bindings | `src/db/bindings.ts` | `bindClientToStores(client)` — subscribes to DBClient events and routes to Zustand stores |
| Stores | `src/stores/` | Zustand stores: `engineStore` (status), `resultStore` (phase/result/error), `editorStore` (sql), `settingsStore` (timeoutMs) |
| Run hook | `src/hooks/useRunController.ts` | `useRunController(client)` — reads sql+timeoutMs from stores, delegates to `client.run`/`client.cancel` |
| Components | `src/components/` | `Editor` (CodeMirror 6 + SQL dialect), `ResultsTable` (virtualized via `@tanstack/react-virtual`), `Toolbar` (run/cancel/status/timeout) |
| App | `src/app.tsx` | Instantiates `WorkerRpc`+`DBClient`, calls `bindClientToStores`, mounts layout + hard-stop banner |

### Cancellation strategy (the core design)

Two effective layers (US-46 removed layer 2 — `statement_timeout` is a complete no-op in PGlite; WASM blocks the JS event loop for all query types, so the interrupt is never delivered):

1. **Soft-cancel** — `AbortController` + timer on the main thread. Rejects the UI promise instantly so the UI stays responsive. The worker may still be executing.
2. **Hard-stop** — after soft-cancel, `DBClient` sends a `ping` to the worker with a 500ms grace window. If no response, it calls `worker.terminate()` then `rpc.restart()`, spawning a fresh `memory://` worker (~1s). Because the DB is `memory://`, this **wipes all tables**. The engine enters `engine:restarting` immediately, then emits `engine:ready` when the new worker is ready. Run must stay disabled during this window.

### `DBClient` events

`DBClient` is store-agnostic and communicates via typed events. `src/db/bindings.ts` is the single place that subscribes to these events and routes to Zustand stores:

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

Everything through E2E tests is complete. Only deploy tasks remain:

- **Deploy** (US-44–45): S3 upload with correct MIME/cache-control headers; CloudFront invalidation of `index.html`

### Build notes
CodeMirror is split into its own `codemirror` chunk via `manualChunks` in `vite.config.ts` to keep the main bundle small. `.wasm` files from PGlite need `application/wasm` content type on S3 for `instantiateStreaming` to work.
