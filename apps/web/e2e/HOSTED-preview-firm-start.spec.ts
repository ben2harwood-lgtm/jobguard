import { expect, test } from "@playwright/test";

// V2-SQ-B: on the exact address that will be shared, a fresh browser profile starts its own practice firm and
// reaches New job. A refused POST /api/practice-company fails the run. Hosted only (playwright.hosted.config.ts).
const hosted = process.env.JOBGUARD_HOSTED_URL;
test.skip(!hosted, "hosted acceptance only: set JOBGUARD_HOSTED_URL");

test("a fresh browser on the shared address starts a practice firm and reaches New job", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/jobs/new");
  expect(new URL(page.url()).origin).toBe(new URL(hosted!).origin);
  const start = page.waitForResponse(response => new URL(response.url()).pathname === "/api/practice-company" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Start my own practice firm", exact: true }).click();
  const response = await start;
  // Status only: the page navigates on success, so its body may no longer be readable. Read it only to explain a refusal.
  if (!response.ok()) throw new Error(`POST /api/practice-company returned ${response.status()} ${await response.text().catch(() => "")}`);
  await expect(page.getByText("The practice workspace couldn’t open. Please try again.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Walk the job" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
