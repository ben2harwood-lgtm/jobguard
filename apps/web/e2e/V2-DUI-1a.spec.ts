import { expect, test } from "@playwright/test";
import type { CaptureWorkspaceResponse } from "@jobguard/api/capture-contracts";
import { openNewJob } from "./helpers/spoken-quote-journey";
import { expectDesigned, expectNoSideScroll, expectResponsiveGrid, expectTallButtons } from "./helpers/designed-v2";

// V2-SQ-I-1 / V2-DUI-1a (ported from #918's DUI-1a): on V2, an empty draft says what to add, then a typed job reaches
// pricing through the designed review and customer-and-site card. Runs in the desktop (1280) and mobile-360 projects.
const source = `JOB: Practice decorating
ITEM: Protect room | £200.00
ITEM: Prepare walls | £200.00
ITEM: Paint walls | £200.00
ITEM: Finish trim | £200.00
ITEM: Clean site | £100.00
ITEM: Replace shelves
QUESTION: Confirm disposal`;

test("V2-DUI-1a: empty draft message, then the designed review and customer-and-site card reach pricing", async ({ page }) => {
  test.setTimeout(150_000);
  await openNewJob(page);
  const capture = page.locator(".designed-capture");
  const makeDraft = capture.getByRole("button", { name: "Make my draft", exact: true });
  // TOMMY-DEMO: an empty "Make my draft" says what to add and keeps what is there.
  await page.getByLabel("Work details").fill("");
  await makeDraft.click();
  await expect(capture.getByText("We could not make the draft: add the work details first. Your original text is still here; change it or try again.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Work details")).toHaveValue("");
  await page.screenshot({ path: `test-results/V2-DUI-1a-empty-draft-${test.info().project.name}.png`, fullPage: true });

  await page.getByLabel("Work details").fill(source);
  const created = page.waitForResponse(response => response.url().endsWith("/api/jobs/capture") && response.request().method() === "POST");
  await makeDraft.click();
  const savedCapture = await (await created).json() as CaptureWorkspaceResponse;
  const jobId = savedCapture.jobId;
  await expect(page.getByTestId("proposal-line-count")).toHaveText("6");
  await page.getByRole("button", { name: "Check and edit my draft", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${jobId}/work$`, "u"));

  const review = page.locator(".designed-review");
  const confirmScope = review.getByRole("button", { name: "Confirm scope", exact: true });
  await expectDesigned(page, review, confirmScope);
  await expectResponsiveGrid(page, review.locator(".review-layout"));
  await expect(review.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  await expect(review.getByRole("button", { name: "Preview quote", exact: true })).toBeDisabled();
  await expectTallButtons(review);
  await expectNoSideScroll(page);
  await page.screenshot({ path: `test-results/V2-DUI-1a-review-${test.info().project.name}.png`, fullPage: true });

  const parties = page.getByRole("region", { name: "Customer and site", exact: true });
  const saveParties = parties.getByRole("button", { name: "Save customer and site", exact: true });
  await expectDesigned(page, parties, saveParties);
  await parties.getByLabel("Customer name", { exact: true }).fill("DUI Practice Customer");
  await parties.getByLabel("Premises address", { exact: true }).fill("14 Fictional Lane");
  await saveParties.click();
  await expect(parties.getByTestId("party-customer")).toHaveText("DUI Practice Customer");
  await expect(parties.getByRole("form", { name: "Customer and site details" }).locator("fieldset")).toBeEnabled();
  await page.screenshot({ path: `test-results/V2-DUI-1a-customer-and-site-${test.info().project.name}.png`, fullPage: true });

  for (const item of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) {
    await review.getByRole("button", { name: `Accept ${item}`, exact: true }).click();
  }
  await review.getByRole("button", { name: "Dismiss Replace shelves", exact: true }).click();
  await review.getByLabel("Dismissal reason Replace shelves").fill("Outside this fictional job");
  await review.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
  await confirmScope.click();
  await expect(review.getByRole("heading", { name: "Scope confirmed", exact: true })).toBeVisible();
  await expect(page.getByTestId("confirmed-line-count")).toHaveText("5");

  await review.getByRole("button", { name: "Price the work", exact: true }).click();
  const pricing = page.locator(".designed-quote");
  await expect(pricing).toHaveAttribute("data-quote-ready", "true");
  await expect(pricing).toHaveAttribute("data-job-id", jobId);
  await expect(pricing.getByTestId("quote-net")).toHaveText("GBP 900.00");
  await expectNoSideScroll(page);
});
