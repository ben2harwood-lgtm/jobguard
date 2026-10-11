import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { openReview } from "./capture-journey";

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function click(page: Page, name: string) { await expect(button(page, name)).toBeEnabled(); await button(page, name).click(); }
export async function get(page: Page, path: string) { const response = await page.request.get(path); expect(response.ok(), await response.text()).toBe(true); return response.json(); }
export async function post(page: Page, path: string, data: unknown) { const response = await page.request.post(path, { data }); expect(response.ok(), await response.text()).toBe(true); return response.json(); }

/** A verified, generated proof photo recorded through the real proof API; optionally completes the scope item. */
export async function recordedProof(page: Page, jobId: string, complete = false) {
  const path = `/api/jobs/${jobId}/proof`, before = await get(page, path);
  await post(page, path, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "select_generated", fixture: "completion-photo", scopeItemId: before.scopeItemId });
  const pending = await get(page, path);
  await post(page, path, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "finalize", uploadId: pending.upload.id, objectVersionId: pending.upload.objectVersionId });
  const verified = await get(page, path);
  expect(verified.upload.state).toBe("verified");
  if (complete) await post(page, path, { version: "practice-proof-command.v1", commandId: randomUUID(), action: "complete", scopeItemId: verified.scopeItemId, evidenceId: verified.upload.evidenceId });
  return verified.upload.evidenceId as string;
}

/** The persisted practice job every recovery journey starts from: accepted quote, approved extra, proof, issued customer invoice. */
export async function persistedRecoverySources(page: Page) {
  await openReview(page);
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await click(page, `Accept ${name}`);
  await click(page, "Dismiss Replace shelves");
  await page.getByLabel("Dismissal reason Replace shelves").fill("Not included in this fictional job");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
  await click(page, "Confirm scope");
  const price = button(page, "Price the work"), heading = page.getByRole("heading", { name: "Price the work", exact: true });
  await Promise.race([price.waitFor({ state: "visible", timeout: 30_000 }), heading.waitFor({ state: "visible", timeout: 30_000 })]);
  if (await price.isVisible()) await click(page, "Price the work");
  await expect(heading).toBeVisible();
  await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
  await page.getByLabel("Unit rate Clean site").fill("200.00");
  await click(page, "Save draft revision"); await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await click(page, "Preview immutable quote"); await click(page, "Simulate sending this quote");
  await click(page, "Continue fake worker"); await click(page, "Record practice acceptance"); await click(page, "Start this practice job");
  // Activation is asynchronous: wait for its persisted result before calling live-job APIs.
  await expect(page.getByRole("heading", { name: "Live · baseline frozen" })).toBeVisible();
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const quote = await get(page, `/api/jobs/${jobId}/quotes/delivery`);
  const variationsPath = `/api/jobs/${jobId}/variations`, variationBefore = await get(page, variationsPath);
  const proposalId = randomUUID();
  const proposed = await post(page, variationsPath, {
    version: "variation-command.v1", action: "propose", proposalId, scopeItemId: randomUUID(), existingScopeItemId: null,
    lineageParentScopeItemId: variationBefore.parentScopeItemId, description: "Fictional extra preparation", captureText: "Fictional extra preparation",
    price: { quantity: "1", unit: "each", unitRatePence: 12500, direction: "addition" },
  });
  const variation = proposed.variations.find((item: { id: string }) => item.id === proposalId);
  await post(page, variationsPath, { version: "variation-command.v1", action: "approve", variationId: proposalId, revisionId: variation.currentRevisionId, approvalId: randomUUID(), attestation: "Builder-recorded practice acceptance — not an authenticated customer signature" });
  const proofId = await recordedProof(page, jobId, true);
  const final = await post(page, `/api/jobs/${jobId}/final-account`, { version: "final-account.assemble.v1", commandId: randomUUID() });
  expect(final.account.issueBlocked).toBe(false);
  const invoices = await post(page, `/api/jobs/${jobId}/customer-invoices`, { version: "practice-customer-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: final.account.id, expectedSourceHash: final.account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-09-25" });
  return { jobId, quoteId: quote.documentId as string, proofId, variationId: variation.currentRevisionId as string, invoiceId: invoices.invoices.at(-1).id as string, scopeItemId: variationBefore.parentScopeItemId as string };
}
