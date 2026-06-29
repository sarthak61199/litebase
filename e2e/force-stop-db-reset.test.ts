import { test, expect } from "@playwright/test";

test("US-42: force-stop resets DB and shows warning", async ({ page }) => {
  // DDL + hard-stop + recovery in sequence; PGlite DDL can be slow on cold WASM.
  test.setTimeout(90_000);

  await page.goto("/");
  await expect(page.getByText("Ready")).toBeVisible({ timeout: 30_000 });

  const editor = page.getByTestId("editor");
  const timeoutInput = page.getByRole("spinbutton");

  // Disable the soft-cancel timeout for setup queries so slow PGlite DDL isn't
  // cut off before it completes.
  await timeoutInput.fill("0");
  await timeoutInput.press("Tab");

  // Warm up the PGlite worker with a SELECT before DDL.  DDL is the first
  // write operation and exercises the catalog-write / filesystem-sync path that
  // is cold on first use; a prior SELECT primes the worker into a stable state.
  await editor.click();
  await page.keyboard.type("SELECT 1 AS warmup");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("button", { name: "Run" })).toBeEnabled({
    timeout: 15_000,
  });

  // Create the sentinel table (CTAS avoids column-definition parens that can
  // interact with CodeMirror's SQL autocomplete popup).
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("CREATE TABLE us42_sentinel AS SELECT 42 AS id");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("button", { name: "Run" })).toBeEnabled({
    timeout: 30_000,
  });

  // Confirm the table exists by querying it.  The editor now holds
  // "SELECT * FROM us42_sentinel" so "id" in the DOM is only the column header.
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("SELECT * FROM us42_sentinel");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText("id", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  // Restore timeout before the hard-stop scenario
  await timeoutInput.fill("10000");
  await timeoutInput.press("Tab");

  // Step 2: run a query that permanently blocks the WASM event loop
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("SELECT pg_sleep(60)");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText("Running…")).toBeVisible({ timeout: 5_000 });

  // Step 3: cancel — soft-cancel fires immediately, then maybeHardStop pings
  // the worker with a 500ms grace window before calling terminate+respawn
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Cancelled by user")).toBeVisible({
    timeout: 2_000,
  });

  // Step 4: assert the reset warning appears while the engine is restarting.
  // The warning banner (role="alert") renders when engineStatus === 'restarting'.
  // maybeHardStop holds the restarting state for 500ms before emitting ready,
  // giving React and Playwright time to observe it.
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 3_000 });
  await expect(page.getByRole("alert")).toContainText(
    "in-memory database has been wiped"
  );

  // Step 5: wait for the engine to finish restarting and become ready again.
  // The alert persists after recovery (hadRestart stays true) to keep warning
  // the user that their tables were wiped.
  await expect(page.getByText("Ready")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("alert")).toBeVisible();

  // Step 6: verify the sentinel table is gone — hard-stop wiped the memory:// DB.
  // With timeout=0, the query waits indefinitely (table not found = instant error).
  await timeoutInput.fill("0");
  await timeoutInput.press("Tab");

  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("SELECT * FROM us42_sentinel");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText(/does not exist/)).toBeVisible({
    timeout: 15_000,
  });
});
