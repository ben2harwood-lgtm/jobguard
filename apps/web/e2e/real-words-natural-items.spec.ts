import { expect, test, type Page } from "@playwright/test";
import type { CaptureWorkspaceResponse } from "@jobguard/api/capture-contracts";

test.setTimeout(120_000);
const decorating = "Paint the hall, stairs and landing for Mr Example at 9 Notreal Road, two coats, woodwork in gloss, should be about 900 quid, four days.";
const bathroom = "Bathroom refit for Mrs Sample at 4 Madeup Lane. Rip out the old suite and take it away, fit a new bath, basin and toilet, tile the walls and floor, new extractor fan. About 4800 pounds all in, should take two weeks.";
const fallback = "Check this line. Use Split to make separate work items, then edit and accept each one.";

async function draft(page: Page, text: string) {
  await page.goto("/");
  await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready for your first job", exact: true })).toBeVisible();
  const jobs = await page.request.get(`/api/jobs?tenantId=${await page.getByLabel("Select workspace").inputValue()}`);
  expect(jobs.ok()).toBe(true);
  expect((await jobs.json()).jobs).toEqual([]);
  await page.getByRole("button", { name: "＋ Start a new job", exact: true }).click();
  await page.getByLabel("Work details").fill(text);
  const captured = page.waitForResponse(response => response.url().endsWith("/api/jobs/capture") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Make my draft", exact: true }).click();
  const response = await captured;
  expect(response.status()).toBe(201);
  const result = await response.json();
  expect(result.source.text).toBe(text);
  await page.getByRole("button", { name: "Check and edit my draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  await expect(page.locator("#captured-job-workspace > header h1")).toHaveText(result.proposal.title);
  return result as CaptureWorkspaceResponse;
}

async function savedReview(page: Page, text: string, descriptions: string[], questions: string[]) {
  const title = await page.locator("#captured-job-workspace > header h1").textContent();
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await expect(page.locator("#captured-job-workspace > header h1")).toHaveText(title!);
    await expect(page.locator(".review-line")).toHaveCount(descriptions.length);
    for (const description of descriptions) {
      await expect(page.getByRole("textbox", { name: `Description ${description}`, exact: true })).toHaveValue(description);
    }
    for (const line of await page.locator(".review-line").all()) await expect(line).toContainText("Price needed");
    for (const question of questions) await expect(page.locator(".questions")).toContainText(question);
    await expect(page.locator(".source pre")).toHaveText(text);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const selector of [".review-line", ".questions", ".source"]) {
      expect(await page.locator(selector).evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
    }
  }
}

test("walk 2 ordinary words become reviewable work", async ({ page, browser }, testInfo) => {
  if (testInfo.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
  const result = await draft(page, decorating);
  expect(result.proposal.title).toBe("Paint the hall, stairs and landing");
  await savedReview(page, decorating, ["Paint the hall, stairs and landing, two coats", "woodwork in gloss"], ["900 quid", "four days"]);
  // A second cookie jar starts an independent empty firm, using the same real routes.
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin, viewport: page.viewportSize()! });
  try {
    const second = await context.newPage();
    const result = await draft(second, bathroom);
    expect(result.proposal.title).toBe("Bathroom refit");
    await savedReview(second, bathroom, ["Rip out the old suite and take it away", "fit a new bath, basin and toilet", "tile the walls and floor", "new extractor fan"], ["4800 pounds", "two weeks"]);
  } finally { await context.close(); }
});

for (const amount of ["900 pounds", "£900"]) {
  test(`ordinary words keep ${amount} as an overall-price question`, async ({ page }, testInfo) => {
    if (testInfo.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
    const text = decorating.replace("900 quid", amount);
    await draft(page, text);
    await savedReview(page, text, ["Paint the hall, stairs and landing, two coats", "woodwork in gloss"], [amount, "four days"]);
  });
}

test("unsupported wording retains one editable unpriced line and the honest Split prompt", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
  const text = "Please inspect the fictional shed. The customer mentioned £200 but has not confirmed the scope or quantities.";
  await draft(page, text);
  await savedReview(page, text, [text], [fallback]);
  await expect(page.getByRole("button", { name: `Split ${text}`, exact: true })).toBeVisible();
});
