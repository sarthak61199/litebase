import { test, expect } from "@playwright/test";

test("smoke: app loads and has correct title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/litebase/i);
});
