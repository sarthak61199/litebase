import { test, expect } from "@playwright/test";

test("US-40: cancel a runaway query and recover", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Ready")).toBeVisible({ timeout: 30_000 });

  // Start a query that blocks the WASM event loop indefinitely
  const editor = page.getByTestId("editor");
  await editor.click();
  await page.keyboard.type("SELECT pg_sleep(60)");

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText("Running…")).toBeVisible({ timeout: 5_000 });

  // Click Cancel — soft-cancel fires immediately on the main thread
  await page.getByRole("button", { name: "Cancel" }).click();

  // Acceptance: cancel completes (UI shows cancelled state) within 2 seconds
  await expect(page.getByText("Cancelled by user")).toBeVisible({
    timeout: 2_000,
  });

  // The background hard-stop now runs: a ping waits 500ms for the stuck worker,
  // then terminates it and spawns a fresh one. engine:restarting and engine:ready
  // are emitted synchronously so React 18 may batch the renders — we wait a fixed
  // 1.5s rather than polling for the transient restarting state.
  await page.waitForTimeout(1_500);

  // Recovery: clear the editor and run a simple query
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("SELECT 42 AS answer");

  await page.getByRole("button", { name: "Run" }).click();

  // Recovery query must succeed and show results
  await expect(page.getByText("answer")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("42")).toBeVisible();
});
