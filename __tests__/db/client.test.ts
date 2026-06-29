import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DBClient, AlreadyRunningError } from "../../src/db/client";
import type { DbClientEvent, QueryResult } from "../../src/db/client";
import type { WorkerRpc } from "../../src/db/rpc/client";

const EMPTY_RESULT: QueryResult = {
  fields: [],
  rows: [],
  totalRows: 0,
  capped: false,
};

type CallFn = (
  method: string,
  payload: unknown,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
) => Promise<unknown>;

function makeMockRpc() {
  const call = vi.fn<CallFn>();
  const restart = vi.fn<() => void>();
  const whenReady = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const rpc = { call, restart, whenReady } as unknown as WorkerRpc;
  return { rpc, call, restart, whenReady };
}

function hangUntilAbort(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener(
      "abort",
      () => reject(signal.reason ?? new Error("Aborted")),
      { once: true }
    );
  });
}

describe("DBClient", () => {
  let mock: ReturnType<typeof makeMockRpc>;
  let client: DBClient;
  let events: DbClientEvent[];

  beforeEach(() => {
    vi.useFakeTimers();
    mock = makeMockRpc();
    client = new DBClient(mock.rpc, 10_000);
    events = [];
    client.on((e) => events.push(e));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const eventTypes = () => events.map((e) => e.type);

  describe("boot()", () => {
    it("emits engine:booting then engine:ready", async () => {
      await client.boot();
      expect(eventTypes()).toEqual(["engine:booting", "engine:ready"]);
    });
  });

  describe("successful run", () => {
    beforeEach(() => {
      mock.call.mockResolvedValue(EMPTY_RESULT);
    });

    it("emits run:begin then run:succeed", async () => {
      await client.run("SELECT 1");
      expect(eventTypes()).toEqual(["run:begin", "run:succeed"]);
    });

    it("returns the query result", async () => {
      const result = await client.run("SELECT 1");
      expect(result).toEqual(EMPTY_RESULT);
    });

    it("calls query with the provided sql", async () => {
      await client.run("SELECT 42");
      expect(mock.call).toHaveBeenCalledWith(
        "query",
        { sql: "SELECT 42" },
        expect.objectContaining({ signal: expect.any(Object) })
      );
    });

    it("allows a second run after the first completes", async () => {
      await client.run("SELECT 1");
      await expect(client.run("SELECT 2")).resolves.toEqual(EMPTY_RESULT);
    });
  });

  describe("error run", () => {
    it("emits run:begin then run:fail", async () => {
      mock.call.mockRejectedValue(new Error("syntax error"));
      await expect(client.run("INVALID SQL")).rejects.toThrow("syntax error");
      expect(eventTypes()).toEqual(["run:begin", "run:fail"]);
    });

    it("does not trigger ping for a non-abort error", async () => {
      mock.call.mockRejectedValue(new Error("syntax error"));
      await expect(client.run("INVALID SQL")).rejects.toThrow();
      expect(mock.call).not.toHaveBeenCalledWith(
        "ping",
        expect.anything(),
        expect.anything()
      );
    });

    it("allows a second run after a query error", async () => {
      mock.call.mockRejectedValueOnce(new Error("syntax error"));
      mock.call.mockResolvedValueOnce(EMPTY_RESULT);
      await expect(client.run("BAD")).rejects.toThrow("syntax error");
      await expect(client.run("SELECT 1")).resolves.toEqual(EMPTY_RESULT);
    });
  });

  describe("single in-flight", () => {
    it("rejects a second run with AlreadyRunningError while a query is in flight", async () => {
      mock.call
        .mockImplementationOnce((_m, _p, opts) => hangUntilAbort(opts?.signal))
        .mockResolvedValueOnce({ ok: true });

      const first = client.run("SELECT 1");
      await expect(client.run("SELECT 2")).rejects.toBeInstanceOf(
        AlreadyRunningError
      );

      client.cancel();
      await first.catch(() => {});
      await Promise.resolve();
    });
  });

  describe("cancel()", () => {
    it("is a no-op when nothing is running", () => {
      expect(() => client.cancel()).not.toThrow();
    });

    it("emits run:cancelling", async () => {
      mock.call
        .mockImplementationOnce((_m, _p, opts) => hangUntilAbort(opts?.signal))
        .mockResolvedValueOnce({ ok: true });

      const p = client.run("SELECT pg_sleep(10)");
      client.cancel();

      await expect(p).rejects.toThrow();
      expect(eventTypes()).toContain("run:cancelling");
    });

    it("does not restart the engine when ping succeeds after cancel", async () => {
      mock.call
        .mockImplementationOnce((_m, _p, opts) => hangUntilAbort(opts?.signal))
        .mockResolvedValueOnce({ ok: true });

      const p = client.run("SELECT pg_sleep(10)");
      client.cancel();
      await expect(p).rejects.toThrow();

      await Promise.resolve();
      await Promise.resolve();

      expect(eventTypes()).not.toContain("engine:restarting");
      expect(mock.restart).not.toHaveBeenCalled();
    });
  });

  describe("timeout-to-cancel sequence", () => {
    it("aborts the query after timeoutMs elapses", async () => {
      mock.call
        .mockImplementationOnce((_m, _p, opts) => hangUntilAbort(opts?.signal))
        .mockResolvedValueOnce({ ok: true });

      const p = client.run("SELECT 1", { timeoutMs: 200 });
      vi.advanceTimersByTime(200);

      await expect(p).rejects.toThrow("Query timed out after 200ms");
      expect(eventTypes()).toContain("run:fail");
    });

    it("uses the per-call timeoutMs rather than the default", async () => {
      mock.call
        .mockImplementationOnce((_m, _p, opts) => hangUntilAbort(opts?.signal))
        .mockResolvedValueOnce({ ok: true });

      const p = client.run("SELECT 1", { timeoutMs: 300 });
      vi.advanceTimersByTime(299);
      vi.advanceTimersByTime(1);

      await expect(p).rejects.toThrow("Query timed out after 300ms");
    });

    it("does not abort when timeoutMs is 0", async () => {
      mock.call.mockResolvedValue(EMPTY_RESULT);

      const p = client.run("SELECT 1", { timeoutMs: 0 });
      vi.advanceTimersByTime(999_999);

      await expect(p).resolves.toEqual(EMPTY_RESULT);
    });
  });

  describe("hard-stop terminate + respawn", () => {
    function waitForReady(): Promise<void> {
      return new Promise((resolve) => {
        const off = client.on((e) => {
          if (e.type === "engine:ready") {
            off();
            resolve();
          }
        });
      });
    }

    function setupHardStop() {
      mock.call
        .mockImplementationOnce((_m, _p, opts) => hangUntilAbort(opts?.signal))
        .mockRejectedValueOnce(
          new Error("RPC call 'ping' timed out after 500ms")
        );
    }

    it("emits engine:restarting then engine:ready when ping times out after cancel", async () => {
      setupHardStop();
      const ready = waitForReady();
      const p = client.run("SELECT 1");
      client.cancel();
      await expect(p).rejects.toThrow();
      await ready;
      expect(eventTypes()).toContain("engine:restarting");
      expect(eventTypes()).toContain("engine:ready");
    });

    it("calls rpc.restart() on hard stop", async () => {
      setupHardStop();
      const ready = waitForReady();
      const p = client.run("SELECT 1");
      client.cancel();
      await expect(p).rejects.toThrow();
      await ready;
      expect(mock.restart).toHaveBeenCalledTimes(1);
    });

    it("allows a new run after hard stop completes", async () => {
      setupHardStop();
      const ready = waitForReady();
      const p = client.run("SELECT 1");
      client.cancel();
      await expect(p).rejects.toThrow();
      await ready;
      mock.call.mockResolvedValueOnce(EMPTY_RESULT);
      await expect(client.run("SELECT 2")).resolves.toEqual(EMPTY_RESULT);
    });

    it("rejects a new run while a restart is still in progress", async () => {
      let pingReject!: (e: Error) => void;
      const pingHangs = new Promise<never>((_, reject) => {
        pingReject = reject;
      });

      mock.call
        .mockImplementationOnce((_m, _p, opts) => hangUntilAbort(opts?.signal))
        .mockReturnValueOnce(pingHangs)
        .mockResolvedValueOnce({ ok: true });

      const p = client.run("SELECT 1");
      client.cancel();
      await expect(p).rejects.toThrow();

      await expect(client.run("SELECT 2")).rejects.toThrow(
        "Engine is restarting"
      );

      const ready = waitForReady();
      pingReject(new Error("ping timed out"));
      await ready;
    });
  });

  describe("setTimeoutMs()", () => {
    it("uses the updated timeout for subsequent runs", async () => {
      client.setTimeoutMs(300);

      mock.call
        .mockImplementationOnce((_m, _p, opts) => hangUntilAbort(opts?.signal))
        .mockResolvedValueOnce({ ok: true });

      const p = client.run("SELECT 1");
      vi.advanceTimersByTime(300);

      await expect(p).rejects.toThrow("Query timed out after 300ms");
    });
  });
});
