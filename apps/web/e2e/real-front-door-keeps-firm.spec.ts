import { expect, test, type Page } from "@playwright/test";

async function expectSelectedPracticeFirm(page: Page) {
  await page.getByRole("button", { name: "Practice profile", exact: true }).click();
  const settings = page.getByRole("dialog");
  await expect(settings.getByRole("button", { name: "✓ Builder's practice firm", exact: true, pressed: true })).toBeVisible();
  await settings.getByRole("button", { name: "Close", exact: true }).click();
}

test("blank practice firm survives closing the browser", async ({ page, context, browser }, info) => {
  if (info.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });

  const viewport = page.viewportSize()!;
  const job = "Paint the hall, stairs and landing";
  await page.goto("/");
  const baseURL = new URL(page.url()).origin;
  await page.getByRole("button", { name: "Start my own practice firm", exact: true }).click();
  await expectSelectedPracticeFirm(page);
  await page.goto("/jobs");
  await page.getByRole("button", { name: "Start a new job", exact: true }).click();
  await page.getByLabel("Work details").fill("Paint the hall, stairs and landing. Paint the woodwork in gloss. It should take four days.");
  await page.getByRole("button", { name: "Make my draft", exact: true }).click();
  await page.getByRole("button", { name: "Check and edit my draft", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[^/]+\/work$/u);
  await page.goto("/jobs");
  await expect(page.getByTestId("designed-jobs-list").getByText(job, { exact: true })).toBeVisible();

  const cookies = await context.cookies();
  const practiceSession = cookies.find(cookie => cookie.name === "jg_session");
  const now = Date.now() / 1000;
  expect(practiceSession?.expires).toBeGreaterThan(now);
  expect(practiceSession?.expires).toBeLessThanOrEqual(now + 7 * 24 * 60 * 60);
  await context.close();

  const reopened = await browser.newContext({ baseURL, viewport });
  try {
    await reopened.addCookies(cookies.filter(cookie => cookie.expires > now));
    const jobsPage = await reopened.newPage();
    await jobsPage.goto("/jobs");
    await expectSelectedPracticeFirm(jobsPage);
    await expect(jobsPage.getByTestId("designed-jobs-list").getByText(job, { exact: true })).toBeVisible();
  } finally {
    await reopened.close();
  }
});
