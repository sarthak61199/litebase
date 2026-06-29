import { test, expect } from "@playwright/test";

test("US-39: boot to ready and run a SELECT query", async ({ page }) => {
  await page.goto("/");

  // Wait for PGlite WASM to boot — engine badge shows "Ready"
  await expect(page.getByText("Ready")).toBeVisible({ timeout: 30_000 });

  // Type a query into the CodeMirror editor
  const editor = page.getByTestId("editor");
  await editor.click();
  await page.keyboard.type("SELECT 42 AS answer, 'hello' AS greeting");

  // Click Run
  await page.getByRole("button", { name: "Run" }).click();

  // Results table should show the column headers. Use exact matches so these
  // target the result-table header cells and not the matching substrings in the
  // editor's SQL text ("SELECT 42 AS answer, 'hello' AS greeting").
  await expect(page.getByText("answer", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("greeting", { exact: true })).toBeVisible();

  // The row values should appear in the results table cells (text-gray-300),
  // again scoped away from the identical text in the editor.
  const cells = page.locator("span.text-gray-300");
  await expect(cells.getByText("42", { exact: true })).toBeVisible();
  await expect(cells.getByText("hello", { exact: true })).toBeVisible();
});
