import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRunController } from "../../src/hooks/useRunController";
import { useEditorStore } from "../../src/stores/editorStore";
import { useSettingsStore } from "../../src/stores/settingsStore";
import type { DBClient } from "../../src/db/client";

function makeMockClient(): DBClient {
  return {
    run: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    boot: vi.fn(),
    on: vi.fn(),
    setTimeoutMs: vi.fn(),
  } as unknown as DBClient;
}

beforeEach(() => {
  useEditorStore.setState({ sql: "" });
  useSettingsStore.setState({ timeoutMs: 10000 });
});

describe("useRunController", () => {
  it("run() calls client.run with current sql and timeoutMs", async () => {
    useEditorStore.setState({ sql: "SELECT 1" });
    useSettingsStore.setState({ timeoutMs: 5000 });
    const client = makeMockClient();

    const { result } = renderHook(() => useRunController(client));

    await act(async () => {
      await result.current.run();
    });

    expect(client.run).toHaveBeenCalledOnce();
    expect(client.run).toHaveBeenCalledWith("SELECT 1", { timeoutMs: 5000 });
  });

  it("run() picks up updated sql from the store", async () => {
    const client = makeMockClient();
    const { result } = renderHook(() => useRunController(client));

    act(() => {
      useEditorStore.setState({ sql: "SELECT 2" });
    });

    await act(async () => {
      await result.current.run();
    });

    expect(client.run).toHaveBeenCalledWith("SELECT 2", { timeoutMs: 10000 });
  });

  it("run() picks up updated timeoutMs from the store", async () => {
    useEditorStore.setState({ sql: "SELECT 3" });
    const client = makeMockClient();
    const { result } = renderHook(() => useRunController(client));

    act(() => {
      useSettingsStore.setState({ timeoutMs: 3000 });
    });

    await act(async () => {
      await result.current.run();
    });

    expect(client.run).toHaveBeenCalledWith("SELECT 3", { timeoutMs: 3000 });
  });

  it("cancel() calls client.cancel", () => {
    const client = makeMockClient();
    const { result } = renderHook(() => useRunController(client));

    act(() => {
      result.current.cancel();
    });

    expect(client.cancel).toHaveBeenCalledOnce();
  });

  it("cancel() does not touch any store setter", () => {
    const setSql = vi.spyOn(useEditorStore.getState(), "setSql");
    const setTimeoutMs = vi.spyOn(useSettingsStore.getState(), "setTimeoutMs");
    const client = makeMockClient();
    const { result } = renderHook(() => useRunController(client));

    act(() => {
      result.current.cancel();
    });

    expect(setSql).not.toHaveBeenCalled();
    expect(setTimeoutMs).not.toHaveBeenCalled();
  });

  it("run() does not call any store setter", async () => {
    const setSql = vi.spyOn(useEditorStore.getState(), "setSql");
    const setTimeoutMs = vi.spyOn(useSettingsStore.getState(), "setTimeoutMs");
    const client = makeMockClient();
    const { result } = renderHook(() => useRunController(client));

    await act(async () => {
      await result.current.run();
    });

    expect(setSql).not.toHaveBeenCalled();
    expect(setTimeoutMs).not.toHaveBeenCalled();
  });
});
