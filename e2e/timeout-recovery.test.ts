import { test, expect } from "@playwright/test";

test("US-41: query timeout triggers and app recovers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Ready")).toBeVisible({ timeout: 30_000 });

  // Lower the timeout to 500ms so the runaway query expires quickly
  const timeoutInput = page.getByRole("spinbutton");
  await timeoutInput.fill("500");
  await timeoutInput.press("Tab");

  // Type the runaway query into the CodeMirror editor
  const editor = page.getByTestId("editor");
  await editor.click();
  await page.keyboard.type("SELECT pg_sleep(10)");

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText("Running…")).toBeVisible({ timeout: 5_000 });

  // Acceptance: timeout triggers within ~1 second
  await expect(
    page.getByText(/timed out after 500ms/)
  ).toBeVisible({ timeout: 3_000 });

  // Hard-stop follows automatically: 500ms ping grace + worker terminate + respawn.
  // Wait for the full sequence before attempting the recovery query.
  await page.waitForTimeout(2_000);

  // Restore a safe timeout so the recovery query isn't itself timed out
  // before the freshly spawned worker finishes initialising.
  await timeoutInput.fill("10000");
  await timeoutInput.press("Tab");

  // Acceptance: recovery query succeeds
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("SELECT 42 AS answer");

  await page.getByRole("button", { name: "Run" }).click();

  await expect(page.getByText("answer")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("42")).toBeVisible();
});
