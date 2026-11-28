import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

// V2-SQ3: the spoken quote's ordinary journey, from words in Work details to a saved quote that reopens unchanged.
export type Row = { description: string; quantity: string; unit: string; price: string; fill?: string };

export function pinnedFixture(path: string, sha256: string) {
  const bytes = readFileSync(resolve(path));
  expect(createHash("sha256").update(bytes).digest("hex"), `${path} is not the untouched fixture`).toBe(sha256);
  return bytes;
}

async function click(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled(); await button.click();
}

/** A fresh practice firm, then the ordinary V2 New job route. */
export async function openNewJob(page: Page) {
  await page.goto("/practice-company");
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await page.goto("/jobs/new");
  await expect(page.getByRole("heading", { name: "Walk the job" })).toBeVisible();
}

export function speechRequests(page: Page) {
  const seen: { url: string; method: string; bytes: number }[] = [];
  page.context().on("request", request => {
    if (/speech|transcri|audio/iu.test(request.url())) seen.push({ url: request.url(), method: request.method(), bytes: request.postDataBuffer()?.length ?? 0 });
  });
  return seen;
}

export async function pounds(page: Page, selector: string) { return (await page.getByTestId(selector).textContent())?.trim(); }

async function reviewRows(page: Page) {
  const lines = page.locator(".review-line");
  const rows: Omit<Row, "fill">[] = [];
  for (let i = 0; i < await lines.count(); i++) {
    const line = lines.nth(i);
    rows.push({
      description: await line.getByRole("textbox", { name: /^Description /u }).inputValue(),
      quantity: await line.getByRole("textbox", { name: /^Quantity /u }).inputValue(),
      unit: await line.getByRole("textbox", { name: /^Unit /u }).inputValue(),
      price: await line.getByRole("textbox", { name: /^Price /u }).inputValue(),
    });
  }
  return rows;
}

/**
 * From "Make my draft" to a saved draft revision, then a reload and a reopen from the jobs list.
 * Rows are checked as drafted (before any edit), then blank prices are filled in the review.
 */
export async function draftSaveAndReopen(page: Page, { words, rows, before, after, net, shot, wholeJob }: {
  words: string; rows: Row[]; before: string; after: string; net: string; shot: string; wholeJob?: string;
}) {
  await expect(page.getByLabel("Work details")).toHaveValue(words);
  const captured = page.waitForResponse(r => r.url().endsWith("/api/jobs/capture") && r.request().method() === "POST");
  await click(page, "Make my draft");
  const capture = await (await captured).json() as { jobId: string; captureId: string; source: { kind: string; text: string; [key: string]: unknown } };
  expect(capture.source.text).toBe(words);
  await click(page, "Check and edit my draft");
  await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname.split("/")[2]).toBe(capture.jobId);
  expect(await reviewRows(page)).toEqual(rows.map(({ fill: _fill, ...row }) => row));
  await expect(page.getByTestId("running-total")).toHaveText(before);
  // A whole-job figure is shown for review and never written into a row.
  if (wholeJob) await expect(page.getByTestId("whole-job")).toHaveText(wholeJob);
  else await expect(page.getByTestId("whole-job")).toHaveCount(0);
  await page.getByLabel("Customer name", { exact: true }).fill("Practice Customer");
  await page.getByLabel("Premises address", { exact: true }).fill("1 Practice Street");
  await expect(page.getByLabel("UK postcode", { exact: true })).not.toHaveValue("");
  await click(page, "Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  const lines = page.locator(".review-line");
  for (const [index, row] of rows.entries()) {
    const line = lines.nth(index);
    if (row.fill) await line.getByRole("textbox", { name: /^Price /u }).fill(row.fill);
    await line.getByRole("button", { name: /^Accept /u }).click();
  }
  await expect(page.getByTestId("running-total")).toHaveText(after);
  const answers = page.getByRole("textbox", { name: /^Answer /u });
  for (let i = 0; i < await answers.count(); i++) await answers.nth(i).fill("Builder removes the waste in this practice job.");
  await page.screenshot({ path: `test-results/${shot}-review.png`, fullPage: true });
  await click(page, "Save review");
  await click(page, "Confirm scope");
  await click(page, "Price the work");
  const quote = page.locator(".quote-editor");
  await expect(quote).toHaveAttribute("data-quote-ready", "true");
  await expect(page.getByTestId("quote-net")).toHaveText(net);
  const rates = await quote.getByRole("textbox", { name: /^Unit rate /u }).evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
  await click(page, "Save draft revision");
  await expect(page.getByTestId("quote-revision")).toHaveText("1");

  // Reload, then reopen from the jobs list: the same job, rows, rates, net and revision.
  await page.reload();
  await page.goto("/jobs");
  const listed = page.locator(".job-row");
  await expect(listed).toHaveCount(1);
  await listed.getByRole("button", { name: "Open job →" }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${capture.jobId}/overview$`, "u"));
  await page.getByRole("navigation", { name: "Job sections" }).getByRole("button", { name: "Work", exact: true }).click();
  await click(page, "Price the work");
  await expect(quote).toHaveAttribute("data-quote-ready", "true");
  await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await expect(page.getByTestId("quote-net")).toHaveText(net);
  expect(await quote.getByRole("textbox", { name: /^Unit rate /u }).evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(rates);
  await page.screenshot({ path: `test-results/${shot}-quote-after-reload.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  return capture;
}

/** Every button on the walk is at least 44 px tall (the phone touch-target rule). */
export async function walkButtonsTall(page: Page) {
  const heights = await page.locator(".walk button:visible").evaluateAll(buttons => buttons.map(button => [button.textContent?.trim(), button.getBoundingClientRect().height] as const));
  for (const [name, height] of heights) expect(height, `${name} is under 44 px`).toBeGreaterThanOrEqual(44);
}
