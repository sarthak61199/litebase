# Cancellation Spike Report

**Date:** 2026-06-22
**Environment:** Node.js v24.15.0, @electric-sql/pglite ^0.3.0, Linux (x86_64)

---

## US-01 — Does `statement_timeout` fire on a CPU-bound query?

### Setup
- PGlite `memory://` instance in Node.js (no Web Worker)
- Workload: `SELECT count(*) FROM generate_series(1,5000) a CROSS JOIN generate_series(1,5000) b` — 25M rows, pure CPU, no I/O or sleep
- Calibration run (no timeout) measured baseline duration, then re-ran with `statement_timeout` set to **half** the baseline so the timeout should have fired mid-execution

### Results

| Run | Duration | Outcome |
|-----|----------|---------|
| Baseline (no timeout) | 1901ms | Completed — count = 25,000,000 |
| With `statement_timeout = 950ms` | 1694ms | **Completed anyway** — timeout did not fire |

### Why it doesn't fire
PGlite executes Postgres synchronously on a single WASM thread. While a tight CPU loop is running, the JS event loop is fully blocked — the timeout callback cannot be delivered. Postgres's interrupt check points are not reached often enough (or at all) inside a cross-join hot path.

### Verdict
> **`statement_timeout` is unreliable for CPU-bound queries.**
> It may fire for I/O-bound or `pg_sleep`-style queries that yield regularly, but cannot be counted on to abort a tight compute loop. Layer 2 provides no reliability guarantee for the workload that most needs cancellation.

---

## US-02 — How long does `terminate()` + respawn take?

### Setup
- Node.js `worker_threads` used to simulate Web Worker lifecycle
- Each trial: start a live worker (PGlite init + `SELECT 1` prewarm) → `terminate()` → spawn fresh worker → wait for `ready`
- 5 trials

### Results

| Trial | Duration |
|-------|----------|
| 1 | 1082ms |
| 2 | 803ms |
| 3 | 934ms |
| 4 | 1153ms |
| 5 | 1203ms |
| **min** | **803ms** |
| **max** | **1203ms** |
| **avg** | **1035ms** |

### Browser caveat
These numbers are Node `worker_threads` with a cold `.wasm` load each time. In a browser, the `.wasm` file is cached after the first page load, so subsequent hard-stops should be measurably faster. Treat ~1s as a **conservative upper bound**.

### Verdict
> **Hard-stop (terminate + respawn) is viable as a fallback**, but ~1s is noticeable.
> The UI must transition to a `restarting` state immediately on trigger so the user sees feedback rather than a frozen button. Run must be disabled until the new worker reports `ready`.

---

## Combined Architecture Decision

| Layer | Mechanism | Reliability | Decision |
|-------|-----------|-------------|----------|
| 1 — Soft-cancel | Main-thread `AbortController` + timer | **Always works** — JS only, no WASM involvement | **Keep. Primary UX path.** |
| 2 — `statement_timeout` | Session-level `SET statement_timeout = <ms>` | **Unreliable** for CPU-bound queries | **Keep as best-effort** (fires for `pg_sleep` / I/O-bound work, costs nothing), but do not design the cancellation contract around it. |
| 3 — Hard-stop | `worker.terminate()` + fresh `memory://` worker | **Guaranteed**, ~1s, resets the DB | **Keep as the fallback guarantee.** Trigger after a short grace period post-soft-cancel. Show `restarting…` warning — the in-memory DB is wiped. |

### Bottom line
The three-layer architecture from the plan is **validated and worth building**. Soft-cancel handles the UX instantly; hard-stop is the guaranteed escape hatch. Layer 2 is a free bonus on cooperative queries. The `restarting` spinner and DB-reset warning are not optional — they are required given the ~1s respawn time and data loss on hard-stop.
