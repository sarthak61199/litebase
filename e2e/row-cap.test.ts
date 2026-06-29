import { test, expect } from "@playwright/test";

test("US-43: large SELECT enforces row cap and banner renders", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await page.goto("/");
  await expect(page.getByText("Ready")).toBeVisible({ timeout: 30_000 });

  // Disable soft-cancel timeout so the large generate_series query runs to
  // completion instead of being killed by the main-thread abort timer.
  const timeoutInput = page.getByRole("spinbutton");
  await timeoutInput.fill("0");
  await timeoutInput.press("Tab");

  // Run a query that produces 20 000 rows — double the 10 000 row cap.
  const editor = page.getByTestId("editor");
  await editor.click();
  await page.keyboard.type("SELECT generate_series(1, 20000) AS n");

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByText("Running…")).toBeVisible({ timeout: 5_000 });

  // Acceptance: banner renders (capped: true, totalRows > cap).
  // toLocaleString() output varies by OS locale so match on the fixed suffix.
  await expect(page.getByText(/row cap applied/)).toBeVisible({
    timeout: 30_000,
  });

  // The column header "n" should be present — results actually rendered.
  await expect(page.getByText("n", { exact: true })).toBeVisible();

  // Acceptance: browser tab did not crash — toolbar is still interactive.
  await expect(page.getByText("Ready")).toBeVisible();

  // Acceptance: memory stays within an acceptable range.
  // performance.memory is Chromium-only; skip gracefully on other engines.
  const heapBytes = await page.evaluate(
    () =>
      (performance as { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize ?? null
  );
  if (heapBytes !== null) {
    // 500 MB is a generous ceiling — the actual heap for 10 k integer rows is
    // well under 50 MB; this catches genuine OOM / leak regressions.
    expect(heapBytes).toBeLessThan(500 * 1024 * 1024);
  }
});
