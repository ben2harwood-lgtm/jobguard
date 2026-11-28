import { expect, test, type Locator, type Page } from "@playwright/test";
import type { CaptureWorkspaceResponse } from "@jobguard/api/capture-contracts";
import { openCaptureDesigned } from "./helpers/capture-journey-designed";

const panelScreenshot = {
  animations: "disabled",
  style: ".rr-mobile-nav, .sandbox-banner { visibility: hidden; }",
} as const;

const source = `JOB: Practice decorating
ITEM: Protect room | £200.00
ITEM: Prepare walls | £200.00
ITEM: Paint walls | £200.00
ITEM: Finish trim | £200.00
ITEM: Clean site | £100.00
ITEM: Replace shelves
QUESTION: Confirm disposal`;

async function expectDesigned(panel: Locator, page: Page, control: Locator) {
  await expect(panel).toBeVisible();
  await expect(panel.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' jgd-legacy ')]")).toHaveCount(0);
  // The generated reference button has a teal gradient and an 8px radius.
  await expect(control).toHaveCSS("background-image", /linear-gradient/u);
  await expect(control).toHaveCSS("border-top-left-radius", "8px");
  const { x, width } = (await panel.boundingBox())!;
  expect(x).toBeGreaterThanOrEqual(0);
  expect(x + width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function expectResponsiveGrid(grid: Locator, page: Page) {
  await expect(grid).toHaveCSS("display", "grid");
  const columnCount = page.viewportSize()!.width > 760 ? 2 : 1;
  await expect.poll(() => grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length))
    .toBe(columnCount);
}

test("DUI-1a: a fresh own job reaches existing pricing with its saved capture, review and details", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openCaptureDesigned(page);
  const capture = page.locator(".designed-capture");
  const makeDraft = capture.getByRole("button", { name: "Make my draft", exact: true });
  await expectDesigned(capture, page, makeDraft);
  await expectResponsiveGrid(capture.locator(".walk-grid"), page);
  await page.getByLabel("Work details").fill(source);
  const createdResponse = page.waitForResponse(response => response.url().endsWith("/api/jobs/capture") && response.request().method() === "POST");
  await makeDraft.click();
  const created = await createdResponse;
  expect(created.ok()).toBe(true);
  const savedCapture = await created.json() as CaptureWorkspaceResponse;
  const jobId = savedCapture.jobId;
  expect(savedCapture.status).toBe("draft");
  expect(savedCapture.source.text).toBe(source);
  await expect(page.getByTestId("proposal-line-count")).toHaveText("6");
  if (process.env.DUI_1A_SCREENSHOTS) await capture.screenshot({ path: testInfo.outputPath("capture.png"), ...panelScreenshot });
  await page.getByRole("button", { name: "Check and edit my draft", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}/work$`, "u"));
  await expect(page.getByTestId("workspace-job-id")).toHaveAttribute("data-job-id", jobId);

  const review = page.locator(".designed-review");
  const confirmScope = review.getByRole("button", { name: "Confirm scope", exact: true });
  await expectDesigned(review, page, confirmScope);
  await expectResponsiveGrid(review.locator(".review-layout"), page);
  await expect(review.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  await expect(review.getByRole("button", { name: "Preview quote", exact: true })).toBeDisabled();
  await expect(page.locator(".quote-editor")).toHaveCount(0);
  for (const item of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) {
    await review.getByRole("button", { name: `Accept ${item}`, exact: true }).click();
  }
  await review.getByRole("button", { name: "Dismiss Replace shelves", exact: true }).click();
  await review.getByLabel("Dismissal reason Replace shelves").fill("Outside this fictional job");
  await review.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  if (process.env.DUI_1A_SCREENSHOTS) {
    await review.evaluate(panel => window.scrollBy(0, panel.getBoundingClientRect().top - 60));
    await page.screenshot({ path: testInfo.outputPath("scope-review.png"), animations: "disabled" });
  }
  await confirmScope.click();
  await expect(review.getByRole("heading", { name: "Scope confirmed", exact: true })).toBeVisible();
  await expect(page.getByTestId("confirmed-line-count")).toHaveText("5");
  if (process.env.DUI_1A_SCREENSHOTS) await review.screenshot({ path: testInfo.outputPath("scope-confirmed.png"), ...panelScreenshot });

  const parties = page.getByRole("region", { name: "Customer and site", exact: true });
  const saveParties = parties.getByRole("button", { name: "Save customer and site", exact: true });
  await expectDesigned(parties, page, saveParties);
  await parties.getByLabel("Customer name", { exact: true }).fill("DUI Practice Customer");
  await parties.getByLabel("Premises address", { exact: true }).fill("14 Fictional Lane");
  await saveParties.click();
  await expect(parties.getByTestId("party-customer")).toHaveText("DUI Practice Customer");
  await expect(parties.getByTestId("party-site")).toContainText("14 Fictional Lane");
  if (process.env.DUI_1A_SCREENSHOTS) await parties.screenshot({ path: testInfo.outputPath("customer-and-site.png"), ...panelScreenshot });

  const proposalPath = `/api/jobs/${jobId}/proposal`;
  const saved = await (await page.request.get(proposalPath)).json() as CaptureWorkspaceResponse;
  expect(saved).toMatchObject({ jobId, source: savedCapture.source, status: "quoting", proposalId: savedCapture.proposalId });
  expect(saved.review?.revision).toBeGreaterThan(0);
  const scopeIds = saved.review!.lines.filter(line => line.disposition === "accepted").map(line => line.scopeItemId);
  expect(scopeIds).toHaveLength(5);
  expect(saved.proposal.lines.map(line => line.scopeItemId)).toEqual(savedCapture.proposal.lines.map(line => line.scopeItemId));

  await review.getByRole("button", { name: "Price the work", exact: true }).click();
  const pricing = page.locator(".jgd-legacy .quote-editor");
  await expect(pricing).toBeVisible();
  await expect(pricing).toHaveAttribute("data-quote-ready", "true");
  await expect(pricing).toHaveAttribute("data-job-id", jobId);
  await expect(pricing.getByTestId("quote-net")).toHaveText("GBP 900.00");
  await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}/work$`, "u"));
  expect(await (await page.request.get(proposalPath)).json()).toEqual(saved);
});
