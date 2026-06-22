// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createHandlers } from "../../src/db/handlers";

const ROW_CAP = 10_000;
const GENERATED_ROWS = 20_000;

describe("createHandlers — row cap enforcement (real PGlite memory://)", () => {
  let db: PGlite;
  let handlers: ReturnType<typeof createHandlers>;

  beforeAll(async () => {
    db = new PGlite();
    handlers = createHandlers(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it("returns exactly 10 000 rows when the query produces more", async () => {
    const result = await handlers.query({
      sql: `SELECT * FROM generate_series(1, ${GENERATED_ROWS}) AS s(n)`,
    });

    expect(result.rows).toHaveLength(ROW_CAP);
    expect(result.capped).toBe(true);
    expect(result.totalRows).toBeGreaterThan(ROW_CAP);
  });

  it("rows are plain arrays (rowMode: 'array') even when capped", async () => {
    const result = await handlers.query({
      sql: `SELECT * FROM generate_series(1, ${GENERATED_ROWS}) AS s(n)`,
    });

    expect(Array.isArray(result.rows[0])).toBe(true);
  });

  it("totalRows reflects the full result count, not the capped count", async () => {
    const result = await handlers.query({
      sql: `SELECT * FROM generate_series(1, ${GENERATED_ROWS}) AS s(n)`,
    });

    expect(result.totalRows).toBe(GENERATED_ROWS);
    expect(result.rows).toHaveLength(ROW_CAP);
  });

  it("rowCapOverride lets callers set a custom cap", async () => {
    const customCap = 50;
    const result = await handlers.query({
      sql: `SELECT * FROM generate_series(1, 200) AS s(n)`,
      rowCapOverride: customCap,
    });

    expect(result.rows).toHaveLength(customCap);
    expect(result.capped).toBe(true);
    expect(result.totalRows).toBe(200);
  });

  it("does not cap when the result is at or below the limit", async () => {
    const result = await handlers.query({
      sql: `SELECT * FROM generate_series(1, ${ROW_CAP}) AS s(n)`,
    });

    expect(result.rows).toHaveLength(ROW_CAP);
    expect(result.capped).toBe(false);
    expect(result.totalRows).toBe(ROW_CAP);
  });
});
