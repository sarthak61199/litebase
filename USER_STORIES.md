# User Stories

~~## US-01 — Cancellation spike: measure statement_timeout on CPU-bound queries~~
Run a real PGlite-in-Node spike: execute a large cross-join (CPU-bound, not `pg_sleep`) with `statement_timeout` set and measure whether it actually aborts mid-execution. Record the result (fires / does not fire) and the latency. This decides whether cancellation layer 2 is worth building.

**Acceptance:** Script exits with a printed verdict: timeout fired or did not fire, and the measured elapsed time.

---

~~## US-02 — Cancellation spike: measure terminate + respawn time~~
In the same Node spike environment, measure how long `worker.terminate()` + spawning a fresh PGlite worker takes from call to `ready`. This decides whether hard-stop is fast enough to be a viable UX default.

**Acceptance:** Printed measurement in ms; documented decision in the spike file.

---

~~## US-03 — Scaffold Vite + React + TypeScript project~~
Initialize `package.json`, `tsconfig.json`, `vite.config.ts`, and `index.html` for a React + TS Vite project. Worker support must be wired (`new Worker(new URL(...), { type: 'module' })`). No COOP/COEP headers (not needed for `memory://`).

**Acceptance:** `npm run dev` starts without errors; `npm run build` produces a `dist/` folder.

---

~~## US-04 — Define shared RPC protocol types~~
Create `src/db/rpc/protocol.ts` with the `DbRequests` and `DbResponses` type maps keyed by method name (`init`, `query`, `ping`). Types only — no runtime code.

**Acceptance:** File compiles with zero TS errors; wrong payload shapes are compile errors.

---

~~## US-05 — Implement RPC envelope types and error serialization~~
Create `src/db/rpc/shared.ts` with envelope types, `SerializedError`, `PgError` class, `serializeError`, and `deserializeError`. `PgError` must preserve Postgres `code`, `detail`, `hint`, and `position`.

**Acceptance:** Round-tripping a `PgError` through serialize/deserialize preserves all four PG fields; a plain `Error` round-trips without crashing.

---

~~## US-06 — Implement serveWorker (worker-side RPC router)~~
Create `src/db/rpc/server.ts` with `serveWorker(handlers)`. It registers a single `onmessage` listener, dispatches to the correct handler by method, and posts the response or serialized error back. Exhaustive over every method in `DbRequests`.

**Acceptance:** Calling an unknown method returns a serialized error; calling a known method invokes the handler and posts its result.

---

~~## US-07 — Implement WorkerRpc (main-thread RPC client)~~
Create `src/db/rpc/client.ts` with `WorkerRpc`: message-ID correlation, a pending-promise map, per-call `timeoutMs` and `AbortSignal` support, and `terminate()` + `restart()` that call `rejectAll(reason)` so no promise dangles after a hard stop. Fresh worker instance per generation prevents stale responses resolving new calls.

**Acceptance:** A call that times out rejects its promise; `terminate()` rejects all pending calls; a response from a terminated generation is silently dropped.

---

~~## US-08 — Implement createHandlers (pure PGlite handler factory)~~
Create `src/db/handlers.ts` with `createHandlers(db)` returning `init`, `query`, and `ping` handlers. `query` uses `rowMode: 'array'` and applies a hard row cap (default 10 000), returning `{ fields, rows, totalRows, capped }`.

**Acceptance:** Running against a real `memory://` PGlite in Node: DDL + DML + SELECT round-trips correctly; a query returning 20 000 rows returns exactly 10 000 with `capped: true`.

---

~~## US-09 — Implement the PGlite Web Worker~~
Create `src/db/worker.ts`: instantiate `new PGlite('memory://')`, prewarm with `SELECT 1`, then call `serveWorker(createHandlers(db))`. The worker must post a `ready` signal after prewarm.

**Acceptance:** After the worker is constructed and `ready` is received, a `ping` call returns successfully.

---

~~## US-25 — Set up Vitest with coverage gate~~
Configure Vitest + jsdom + v8 coverage in `vite.config.ts` (or a separate `vitest.config.ts`). Gate: 80% lines / functions / statements / branches. Exclude `rpc/protocol.ts`, `main.tsx`, and `vite-env.d.ts` from coverage.

**Acceptance:** `npm run test:coverage` fails below 80% and passes at or above 80%; excluded files do not appear in the report.

---

~~## US-26 — Unit test: RPC error serialization~~
Write Vitest tests for `serializeError` / `deserializeError` in `rpc/shared.ts`. Cover: `PgError` round-trip preserving `code/detail/hint/position`; plain `Error` round-trip; non-Error value normalization.

**Acceptance:** All cases pass; no mocks needed (pure functions).

---

~~## US-27 — Unit test: WorkerRpc with FakeWorker~~
Write Vitest tests for `WorkerRpc` (`rpc/client.ts`) using an injected `FakeWorker`. Cover: ID correlation, per-call timeout cleanup, `AbortSignal` cancellation, `terminate()`/`restart()` rejecting all pending promises, and stale-generation responses being silently dropped.

**Acceptance:** All cases pass without a real Worker or browser environment.

---

## US-28 — Unit test: serveWorker routing
Write Vitest tests for `serveWorker` (`rpc/server.ts`). Cover: known method routes to the handler and posts the result; unknown method posts a serialized error; handler rejection is serialized and posted.

**Acceptance:** All cases pass; no real Worker environment needed.

---

## US-36 — Integration test: createHandlers DDL + DML + SELECT
Write a Vitest integration test (Node, real `memory://` PGlite) for `createHandlers`. Cover: CREATE TABLE, INSERT, SELECT returning correct `fields` and `rows` in `rowMode: 'array'`; a query error returns a `PgError` with a Postgres `code`.

**Acceptance:** Runs against real PGlite in Node without a Worker; all assertions pass.

---

## US-37 — Integration test: row cap enforced
Write a Vitest integration test (Node, real PGlite) asserting that `createHandlers` returns exactly 10 000 rows for a query that produces more, with `capped: true` and `totalRows > 10000`.

**Acceptance:** Row count is exactly the cap; `capped` flag is true; test runs in Node without a Worker.

---

## US-10 — Apply session-level statement_timeout in DBClient
Create `src/db/client.ts`. On init and whenever the timeout value changes, issue `SET statement_timeout = <ms>` as a session-level command (not inside a transaction wrapper, so user SQL is semantically untouched).

**Acceptance:** A query that exceeds the timeout is cancelled by Postgres (if statement_timeout fires); the SET is not wrapped in BEGIN/COMMIT.

---

## US-11 — Implement soft-cancel in DBClient
In `DBClient.run(sql, { timeoutMs })`, create an `AbortController` and a main-thread timer. When cancelled or timed out, immediately reject the pending promise so the UI updates instantly, without waiting for the worker.

**Acceptance:** Cancelling a running query resolves the UI promise as rejected within one JS event-loop tick; the worker may still be executing in the background.

---

## US-12 — Implement hard-stop (terminate + respawn) in DBClient
In `DBClient`, after a soft-cancel, poll a short grace period. If the worker is still busy, call `worker.terminate()`, reject all pending RPC promises, and spawn a fresh `memory://` worker. Emit an `engine:restarting` then `engine:ready` event sequence.

**Acceptance:** After a hard stop, the engine emits `ready`, a new query can run, and tables created before the stop are gone.

---

## US-13 — Enforce single in-flight query in DBClient
`DBClient.run()` must reject immediately if a query is already in flight, rather than queuing a second call.

**Acceptance:** Calling `run()` twice concurrently causes the second call to reject with an `AlreadyRunningError` (or equivalent).

---

## US-29 — Unit test: DBClient cancellation and timeout logic
Write Vitest tests for `DBClient` (`db/client.ts`) using a mock `WorkerRpc` and `vi.useFakeTimers()`. Cover: session `statement_timeout` applied on init, successful run, error run, soft-cancel, timeout-to-cancel sequence, hard-stop terminate + respawn sequence, and single-in-flight rejection.

**Acceptance:** All cases pass with fake timers; no real Worker.

---

## US-38 — Integration test: statement_timeout behavior
Write a Vitest integration test (Node, real PGlite) covering both the spike cases: (1) `pg_sleep`-based query with `statement_timeout` — assert it aborts; (2) CPU-bound cross-join with `statement_timeout` — record whether it aborts or runs to completion, and print the verdict (this is documentation, not a pass/fail assertion).

**Acceptance:** Test runs without hanging; the `pg_sleep` case aborts; the cross-join verdict is printed to the test output.

---

## US-14 — Implement useEngineStore
Create `src/stores/engineStore.ts` (Zustand). State: `status: 'booting' | 'ready' | 'restarting' | 'crashed'` and `engineError`. Expose only its own setters; no imports of other stores.

**Acceptance:** Each status transition is reachable via a setter; the store has no dependency on other stores.

---

## US-15 — Implement useEditorStore
Create `src/stores/editorStore.ts` (Zustand). State: `sql: string` and `setSql(sql: string)`. No imports of other stores.

**Acceptance:** `setSql` updates `sql`; store has no cross-store imports.

---

## US-16 — Implement useResultStore
Create `src/stores/resultStore.ts` (Zustand). State: `phase: 'idle' | 'running' | 'cancelling'`, `runId`, `result`, `error`, `durationMs`. Setters: `beginRun`, `succeed`, `fail`, `cancelling`, `reset`.

**Acceptance:** Each setter drives the correct phase transition; invalid transitions (e.g. `succeed` when idle) do not corrupt state.

---

## US-17 — Implement useSettingsStore
Create `src/stores/settingsStore.ts` (Zustand). State: `timeoutMs: number` (default 10 000) and `setTimeoutMs`. No imports of other stores.

**Acceptance:** Default is 10 000; `setTimeoutMs` updates the value.

---

## US-30 — Unit test: store transitions
Write Vitest tests for each Zustand store (`engineStore`, `editorStore`, `resultStore`, `settingsStore`). Cover every setter and all valid phase transitions in `resultStore`.

**Acceptance:** All stores tested in isolation; no cross-store imports in test files.

---

## US-18 — Wire DBClient events to stores in db/bindings.ts
Create `src/db/bindings.ts`: subscribe to `DBClient` events and route each to the correct store setter (`engine:booting` → `useEngineStore`, `run:begin` → `useResultStore.beginRun`, etc.). This must be the only place that couples events to stores.

**Acceptance:** Emitting each `DBClient` event produces the expected store mutation and nothing else.

---

## US-31 — Unit test: db/bindings event routing
Write Vitest tests for `db/bindings.ts`. For each `DBClient` event, assert the correct store setter is called and no other store is mutated.

**Acceptance:** All event-to-store routes covered; stores are real (not mocked) to catch selector mistakes.

---

## US-19 — Implement useRunController hook
Create `src/hooks/useRunController.ts`. Read `sql` from `useEditorStore` and `timeoutMs` from `useSettingsStore`. Expose `run()` and `cancel()`. `run()` calls `DBClient.run(sql, { timeoutMs })`; `cancel()` calls `DBClient.cancel()`. This is the only hook that reads multiple stores and drives the client.

**Acceptance:** `run()` triggers a query with the current sql and timeout; `cancel()` calls the client cancel without touching stores directly.

---

## US-35 — Component test: useRunController orchestration
Write RTL tests for `useRunController`. Cover: `run()` calls `DBClient.run` with sql + timeout; `cancel()` calls `DBClient.cancel`; hook does not call store setters directly.

**Acceptance:** Orchestration paths covered; `DBClient` is mocked at the interface boundary.

---

## US-20 — Build CodeMirror SQL editor component
Create `src/components/Editor.tsx`: CodeMirror 6 with `@codemirror/lang-sql` PostgreSQL dialect. Bind value to `useEditorStore`. `Cmd+Enter` / `Ctrl+Enter` calls `controller.run()`.

**Acceptance:** Typing SQL updates the store; pressing the keyboard shortcut fires a run; the PostgreSQL dialect keywords are highlighted.

---

## US-21 — Build virtualized results table
Create `src/components/ResultsTable.tsx` using `@tanstack/react-virtual`. Render rows from `rowMode: 'array'` using `fields` metadata for column headers. Handle: empty result, affected-rows (no SELECT), error state, and row-cap "Showing first N of M rows" banner. Memoize row rendering.

**Acceptance:** A 10 000-row result renders without jank; only visible rows are in the DOM; the cap banner appears when `capped: true`.

---

## US-22 — Build toolbar component
Create `src/components/Toolbar.tsx`. Show: Run button (disabled while running/restarting), Cancel button (enabled while running/cancelling), timeout input (number, bound to `useSettingsStore`), engine status badge, execution time, and row count after a result.

**Acceptance:** Run is disabled during a query; Cancel is only enabled when a query is in flight; timing and row count update after each result.

---

## US-23 — Build App layout and global styles
Create `src/App.tsx`, `src/main.tsx`, and `src/styles.css`. Layout: editor on top, results below, toolbar across the top. Clean modern appearance (no framework dependency — plain CSS is fine).

**Acceptance:** The app renders all three panels without layout overflow; it looks presentable on a 1280×800 viewport.

---

## US-24 — Add hard-stop warning in the UI
When the engine status transitions to `restarting` (hard-stop triggered), display a visible warning that the in-memory database has been reset. The warning must appear before the new worker is ready.

**Acceptance:** Triggering a hard stop shows the reset warning; after the engine reports `ready`, the warning clears.

---

## US-32 — Component test: Toolbar rendering and interaction
Write RTL tests for `Toolbar.tsx`. Cover: Run disabled when `phase !== 'idle'`; Cancel enabled when `phase === 'running'`; timeout input updates `useSettingsStore`; timing and row count render after a result.

**Acceptance:** All cases pass with a real store (no mocked Zustand).

---

## US-33 — Component test: ResultsTable states
Write RTL tests for `ResultsTable.tsx`. Cover: columns from `fields`, rows rendered, empty state, affected-rows (INSERT/UPDATE), error state, and row-cap banner when `capped: true`.

**Acceptance:** Each state renders the correct text/structure; no virtual-scroll library needs to be mocked.

---

## US-34 — Component test: Editor keyboard shortcut
Write RTL tests for `Editor.tsx`. Cover: value change propagates to `useEditorStore`; `Cmd+Enter` and `Ctrl+Enter` call `controller.run()`.

**Acceptance:** Both shortcuts fire `run`; value sync works.

---

## US-39 — E2E test: boot to ready and run a query
Write a Playwright test: load the app, wait for engine status `ready`, type a SELECT, click Run, assert results appear in the table.

**Acceptance:** Test passes against `npm run dev` or `npm run preview` with the real WASM worker.

---

## US-40 — E2E test: cancel a runaway query and recover
Write a Playwright test: run a long-running query (e.g. `pg_sleep(60)`), click Cancel before it completes, assert the UI shows cancelled, then run a simple query and assert it succeeds.

**Acceptance:** Cancel completes within 2 seconds; recovery query succeeds; no frozen UI.

---

## US-41 — E2E test: timeout recovery
Write a Playwright test: set the timeout to a low value (e.g. 500 ms), run a `pg_sleep(10)` query, assert the query times out and the UI shows the timed-out state, then run a simple query and assert it succeeds.

**Acceptance:** Timeout triggers within ~1 second; recovery query succeeds.

---

## US-42 — E2E test: force-stop resets DB with warning
Write a Playwright test: create a table, trigger a hard-stop (simulate a stuck worker), assert the reset warning appears, wait for ready, then assert the previously created table is gone.

**Acceptance:** Warning appears during restart; table is absent after ready.

---

## US-43 — E2E test: large SELECT enforces row cap
Write a Playwright test: run a query that would return more than 10 000 rows (e.g. generate a large series), assert the "Showing first N of M rows" banner appears and the page does not crash or exceed a memory threshold.

**Acceptance:** Banner renders; browser tab does not crash; memory stays within an acceptable range.

---

## US-44 — Deploy: build and upload to S3 with correct content types
Write a deploy script (or document the `aws s3 sync` command) that uploads `dist/` to S3 with: `.wasm` → `application/wasm`, `.data` and hashed assets → `Cache-Control: public, max-age=31536000, immutable`, `index.html` → `Cache-Control: no-cache`.

**Acceptance:** Running the script produces no MIME or cache-control errors; `instantiateStreaming` works in the deployed app.

---

## US-45 — Deploy: CloudFront invalidation of index.html
Add a step to the deploy script (or CI workflow) that invalidates `/index.html` on the CloudFront distribution after each `s3 sync`.

**Acceptance:** After deploy, a hard refresh fetches the new `index.html` without a CDN-cached stale version.
