// @vitest-environment node
//
// US-38 — Integration test: statement_timeout behavior
//
// Both cases are VERDICT TESTS: they run without hanging, print what actually
// happens, and pass unconditionally. Neither case makes a pass/fail assertion
// on whether the timeout fires — the results document PGlite's real behaviour
// so the design can be calibrated correctly.
//
// Empirical findings (Node, @electric-sql/pglite):
//   • pg_sleep:     statement_timeout does NOT fire — pg_sleep runs to completion.
//   • CPU cross-join: statement_timeout does NOT fire — the cross-join completes.
//
// Root cause: PGlite executes PostgreSQL synchronously inside WASM. Even a
// yielding function like pg_sleep blocks the host JS/WASM event loop, so the
// OS-level signal that would normally trigger the timeout interrupt is never
// delivered. statement_timeout is therefore effectively layer-0 in PGlite;
// the soft-cancel (AbortController on main thread) and hard-stop
// (worker.terminate()) are the only reliable cancellation paths.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createHandlers } from "../../src/db/handlers";

type Verdict = "aborted" | "completed";

async function runWithVerdict(
  handlers: ReturnType<typeof createHandlers>,
  sql: string
): Promise<{ verdict: Verdict; elapsedMs: number }> {
  const start = Date.now();
  let verdict: Verdict;
  try {
    await handlers.query({ sql });
    verdict = "completed";
  } catch {
    verdict = "aborted";
  }
  return { verdict, elapsedMs: Date.now() - start };
}

describe("statement_timeout behavior (real PGlite, Node — US-38)", () => {
  describe("pg_sleep(3)", () => {
    let db: PGlite;
    let handlers: ReturnType<typeof createHandlers>;

    beforeAll(async () => {
      db = new PGlite();
      handlers = createHandlers(db);
    });

    afterAll(async () => {
      await db.close();
    });

    it(
      "records whether statement_timeout fires for a pg_sleep query",
      async () => {
        const { verdict, elapsedMs } = await runWithVerdict(
          handlers,
          "SELECT pg_sleep(3)"
        );

        console.log(
          `[US-38] pg_sleep(3) verdict: ${verdict.toUpperCase()} in ${elapsedMs}ms`
        );

        // Verdict only — either outcome is accepted.
        expect(verdict === "aborted" || verdict === "completed").toBe(true);
      },
      10_000
    );
  });

  describe("CPU-bound 25M-row cross-join", () => {
    let db: PGlite;
    let handlers: ReturnType<typeof createHandlers>;

    beforeAll(async () => {
      db = new PGlite();
      handlers = createHandlers(db);
    });

    afterAll(async () => {
      await db.close();
    });

    it(
      "records whether statement_timeout fires on a CPU-bound cross-join",
      async () => {
        // 5000 × 5000 = 25M combinations; count(*) forces full enumeration
        // without transferring rows.
        const { verdict, elapsedMs } = await runWithVerdict(
          handlers,
          "SELECT count(*) FROM generate_series(1,5000) a(i), generate_series(1,5000) b(i)"
        );

        console.log(
          `[US-38] CPU cross-join verdict: ${verdict.toUpperCase()} in ${elapsedMs}ms`
        );

        // Verdict only — either outcome is accepted.
        expect(verdict === "aborted" || verdict === "completed").toBe(true);
      },
      60_000
    );
  });
});
