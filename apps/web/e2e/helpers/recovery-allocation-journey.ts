import { expect, type Page } from "@playwright/test";
import { openReview } from "./capture-journey";
import { click, enterQuote, jsonResult } from "./customer-invoice-journey";

/** Existing UI and real application commands create each source; no mocked success or fixture database writes. */
export async function allocationSources(page: Page) {
  await openReview(page);
  for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await click(page, `Accept ${name}`);
  await click(page, "Dismiss Replace shelves");
  await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this fictional quote");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
  await click(page, "Confirm scope"); await enterQuote(page);
  await page.getByLabel("Unit rate Protect room", { exact: true }).fill("18100.00");
  await expect(page.getByTestId("quote-net")).toHaveText("GBP 18,800.00");
  await click(page, "Save draft revision"); await click(page, "Preview immutable quote");
  await click(page, "Simulate sending this quote"); await click(page, "Continue fake worker");
  await click(page, "Record practice acceptance"); await click(page, "Start this practice job");
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  expect(jobId).toMatch(/^[a-f0-9-]{36}$/u);
  const send = (path: string, data: Record<string, unknown>, step: string) => jsonResult(page.request.post(path, { data: { commandId: crypto.randomUUID(), ...data } }), step);
  await send("/api/decisions", { version: "finding-evaluation-command.v1", tenantId: "11111111-1111-4111-8111-111111111111", jobId }, "Evaluate proof requirements");
  const finalPath = `/api/jobs/${jobId}/final-account`, proofPath = `/api/jobs/${jobId}/proof`;
  const blocked = await send(finalPath, { version: "final-account.assemble.v1", expectedRevision: 0 }, "Assemble final account");
  const proof = await jsonResult(page.request.get(proofPath), "Read required proof");
  const selected = await send(proofPath, { version: "practice-proof-command.v1", action: "select_generated", scopeItemId: proof.scopeItemId, fixture: "completion-photo" }, "Select generated original");
  const finalized = await send(proofPath, { version: "practice-proof-command.v1", action: "finalize", uploadId: selected.upload.id, objectVersionId: selected.upload.objectVersionId }, "Finalize original");
  expect(finalized.upload.state).toBe("verified");
  await send(proofPath, { version: "practice-proof-command.v1", action: "complete", evidenceId: finalized.upload.evidenceId, scopeItemId: proof.scopeItemId }, "Record completion");
  const final = await send(finalPath, { version: "final-account.assemble.v1", expectedRevision: blocked.account.revision }, "Assemble with proof");
  expect(final.account.issueBlocked).toBe(false);
  const invoice = await send(`/api/jobs/${jobId}/customer-invoices`, { version: "practice-customer-invoice.issue.v1", finalAccountRevisionId: final.account.id, expectedSourceHash: final.account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-09-19" }, "Issue fictional invoice");
  const invoiceId = invoice.invoices.at(-1).id as string;
  const cases: string[] = [];
  for (const amount of [32000, 250000]) {
    const path = `/api/jobs/${jobId}/recovery-cases`;
    const opened = await send(path, { version: "recovery-case-command.v1", action: "open", caseType: "withheld_customer_payment", claimedNetPence: amount, counterparty: "Fictional Customer", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"], reviewerRef: "practice-owner", expectedRevision: 0 }, "Open exact claim");
    const claim = opened.cases.at(-1);
    const reviewed = await send(`${path}/eligibility`, { version: "recovery-eligibility-command.v1", action: "review", caseId: claim.id, scenario: "evidence_backed_withheld_payment", expectedCaseRevision: claim.revision, evidenceRevision: 1, policyVersion: "reference-d03.v1", policyRevision: 1 }, "Review recovery attribution");
    const current = reviewed.cases.find((item: { id: string }) => item.id === claim.id);
    await send(`${path}/eligibility`, { version: "recovery-eligibility-command.v1", action: "approve", caseId: claim.id, expectedCaseRevision: current.revision, expectedEvidenceRevision: current.eligibility.evidenceRevision, expectedPolicyRevision: 1, expectedReviewRevision: current.eligibility.revision }, "Approve exact eligibility");
    cases.push(claim.id);
  }
  await page.reload();
  const feed = page.getByRole("region", { name: "Practice receipts", exact: true });
  await feed.getByRole("button", { name: "Connect practice feed", exact: true }).click();
  await expect(page.getByTestId("practice-feed-state")).toHaveText("Connected");
  await page.getByLabel("Generated receipt scenario", { exact: true }).selectOption("settled_384");
  await feed.getByRole("button", { name: "Advance practice executor", exact: true }).click();
  await expect(page.getByTestId("movement-state")).toHaveText("Simulated settled movement");
  await page.reload();
  return { jobId, invoiceId, caseIds: cases, evidenceId: finalized.upload.evidenceId as string };
}
