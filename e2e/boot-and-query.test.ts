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

  // Results table should show the column headers
  await expect(page.getByText("answer")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("greeting")).toBeVisible();

  // The row values should appear
  await expect(page.getByText("42")).toBeVisible();
  await expect(page.getByText("hello")).toBeVisible();
});
