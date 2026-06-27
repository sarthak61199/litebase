// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createHandlers } from "../../src/db/handlers";
import { PgError } from "../../src/db/rpc/shared";

describe("createHandlers — integration (real PGlite memory://)", () => {
  let db: PGlite;
  let handlers: ReturnType<typeof createHandlers>;

  beforeAll(async () => {
    db = new PGlite();
    handlers = createHandlers(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it("query: CREATE TABLE executes without error", async () => {
    const result = await handlers.query({
      sql: "CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL)",
    });
    expect(result.rows).toEqual([]);
    expect(result.totalRows).toBe(0);
    expect(result.capped).toBe(false);
  });

  it("query: INSERT executes without error", async () => {
    const result = await handlers.query({
      sql: "INSERT INTO users (name) VALUES ('Alice'), ('Bob')",
    });
    expect(result.rows).toEqual([]);
    expect(result.capped).toBe(false);
  });

  it("query: SELECT returns correct fields and rows in array mode", async () => {
    const result = await handlers.query({
      sql: "SELECT id, name FROM users ORDER BY id",
    });

    // fields metadata
    expect(result.fields).toHaveLength(2);
    expect(result.fields[0].name).toBe("id");
    expect(result.fields[1].name).toBe("name");
    expect(typeof result.fields[0].dataTypeID).toBe("number");
    expect(typeof result.fields[1].dataTypeID).toBe("number");

    // rows are plain arrays (rowMode: 'array')
    expect(result.rows).toHaveLength(2);
    expect(Array.isArray(result.rows[0])).toBe(true);
    expect(result.rows[0][1]).toBe("Alice");
    expect(result.rows[1][1]).toBe("Bob");

    expect(result.totalRows).toBe(2);
    expect(result.capped).toBe(false);
  });

  it("query: error rejects with PgError carrying a Postgres code", async () => {
    let caught: unknown;
    try {
      await handlers.query({ sql: "SELECT * FROM table_that_does_not_exist" });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PgError);
    const pgErr = caught as PgError;
    // 42P01 = undefined_table
    expect(pgErr.code).toBe("42P01");
    expect(pgErr.message).toMatch(/table_that_does_not_exist/);
  });
});
