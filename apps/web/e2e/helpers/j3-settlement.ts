import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { jsonResult } from "./customer-invoice-journey";
import type { PricedCatch } from "./j3-customer-approval";

const tenantId = "11111111-1111-4111-8111-111111111111";
const nativeImport = <T>(path: string) => (new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<T>)(pathToFileURL(join(process.cwd(), path)).href);

/** Continue the SAME captured job. The normal command routes own every monetary
 * write; admin queries below only read the post-lock source identity and hash. */
export async function settleJ3(page: Page, jobId: string, lockId: string, catches: PricedCatch[], info: TestInfo) {
 const path = `/api/jobs/${jobId}`;
 const read = (suffix: string) => jsonResult(page.request.get(`${path}/${suffix}`), suffix);
 const post = (suffix: string, data: unknown) => jsonResult(page.request.post(`${path}/${suffix}`, { data }), suffix);
 // Customer approval may advance the bill. Read its current revision after
 // approval, assemble from that revision, then refresh the page's lock view.
 const current = await read("final-account");
 const assembled = await post("final-account", { version: "final-account.assemble.v1", commandId: randomUUID(), expectedRevision: current.account.revision });
 const stale = await page.request.post(`${path}/final-account/lock`, { data: {
  version: "lock-bound-invoice.issue.v1", commandId: randomUUID(), invoiceKind: "final",
  finalAccountRevisionId: assembled.account.id, expectedSourceHash: "0".repeat(64),
  recipient: "practice-customer@example.invalid", issuedOn: "2026-10-31",
 } });
 expect(stale.status()).toBe(409);
 expect(await stale.json()).toEqual({ code: "STALE_REVISION" });
 const final = await read("final-account/lock");
 expect(final.lock.id).toBe(lockId);
 expect(final.account.id).not.toBe(final.lock.finalAccountRevisionId);
 expect(final.invoiceGuard).toBeNull();
 expect(final.account.issueBlocked).toBe(false);
 expect(final.account.totals).toMatchObject({ net: { pence: 3440000 }, tax: { pence: 688000 }, total: { pence: 4128000 } });
 // The legacy practice endpoint only accepts the original locked revision.
 // Use 0413's checked combined-final path, as the existing J3 DB journey does.
 const issue = { version: "lock-bound-invoice.issue.v1", commandId: randomUUID(), invoiceKind: "final", finalAccountRevisionId: final.account.id, expectedSourceHash: final.account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-10-31" };
 const issued = await post("final-account/lock", issue);
 expect(await post("final-account/lock", issue)).toEqual(issued);
 expect(issued.invoices).toHaveLength(1);
 const invoice = issued.invoices[0];
 expect(invoice).toMatchObject({ finalAccountRevisionId: final.account.id, sourceHash: final.account.sourceHash, netPence: 3440000, totalPence: 4128000, balancePence: 4128000 });
 const receiptPath = `customer-invoices/${invoice.id}/receipts`;
 const recorded = await post(receiptPath, { version: "practice-customer-receipt.record.v1", commandId: randomUUID(), invoiceId: invoice.id, paidOn: "2026-10-31", amountPence: 4128000, method: "bank_transfer", reference: "Fictional receipt-41280" });
 expect(recorded.receipts).toHaveLength(1);
 const paymentId = recorded.receipts[0].id as string;
 let feed = await post("practice-feed", { version: "practice-feed-command.v1", commandId: randomUUID(), action: "connect", expectedRevision: 0 });
 feed = await post("practice-feed", { version: "practice-feed-command.v1", commandId: randomUUID(), action: "advance", movement: "receipt-41280", step: "settled", expectedRevision: feed.revision });
 await post("practice-feed", { version: "practice-feed-command.v1", commandId: randomUUID(), action: "match_receipt", movement: "receipt-41280", paymentId, expectedRevision: feed.revision });
 expect((await read("customer-invoices")).invoices).toEqual([expect.objectContaining({ id: invoice.id, balancePence: 0 })]);
 const allocation = (target: "receipt_lines" | "case", command: unknown) => post("receipt-case-allocations", { version: "receipt-case-allocation-command.v1", target, command });
 const snapshot = await read("receipt-case-allocations");
 const review = await allocation("receipt_lines", { version: "receipt-line-facts-command.v1", action: "review", commandId: randomUUID(), paymentId, expectedSourceRevision: snapshot.revision });
 const approve = { version: "receipt-line-facts-command.v1", action: "approve", commandId: randomUUID(), reviewId: review.reviewId, approvalHash: review.approvalHash, expectedSourceRevision: review.sourceRevision };
 const alteredReceiptApproval = await page.request.post(`${path}/receipt-case-allocations`, { data: { version: "receipt-case-allocation-command.v1", target: "receipt_lines", command: { ...approve, commandId: randomUUID(), approvalHash: "0".repeat(64) } } });
 expect(alteredReceiptApproval.status()).toBe(409);
 expect(await alteredReceiptApproval.json()).toMatchObject({ code: "RECEIPT_LINE_APPROVAL_CHANGED" });
 const produced = await allocation("receipt_lines", approve);
 expect(await allocation("receipt_lines", approve)).toEqual({ ...produced, replayed: true });
 const lines = await read("receipt-case-allocations");
 const cases = (await read("recovery-cases")).cases;
 const admin = new Pool({ connectionString: process.env.E2E_ADMIN_DATABASE_URL, max: 1 });
 const assessments = [];
 const packs: { caseId: string; manifestHash: string }[] = [];
 try {
  for (const item of catches) {
   const recovery = cases.find((row: { caseType: string; sourceRefs: string[] }) => row.caseType === "missed_variation_final_account" && row.sourceRefs.includes(`variation:${item.id}`));
   expect(recovery, "Pricing must open the source-bound catch case").toBeDefined();
   const currentRevision = item.revisions.find(row => row.id === item.currentRevisionId)!;
   expect(recovery.claimedNetPence).toBe(currentRevision.signedDeltaPence);
   const line = lines.rows.find((row: { commercialRevisionId: string }) => row.commercialRevisionId === item.currentRevisionId);
   expect(line, "Combined invoice must contain the exact approved revision").toBeDefined();
   expect(line.net).toEqual({ numerator: String(currentRevision.signedDeltaPence), denominator: "1" });
   const signalId = recovery.sourceRefs.find((ref: string) => ref.startsWith("signal:")).slice(7);
   const workId = (await admin.query("SELECT work_id FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND id=$3", [tenantId, jobId, signalId])).rows[0].work_id as string;
   const command = { version: "stored-receipt-case-command.v1", action: "review", commandId: randomUUID(), factLineId: line.lineAllocationId, caseId: recovery.id, workId, expectedCaseRevision: recovery.revision };
   const allocationReview = await allocation("case", command);
   const exact = { ...command, action: "approve", commandId: randomUUID(), reviewId: allocationReview.reviewId, approvalHash: allocationReview.approvalHash };
   const alteredCaseApproval = await page.request.post(`${path}/receipt-case-allocations`, { data: { version: "receipt-case-allocation-command.v1", target: "case", command: { ...exact, commandId: randomUUID(), approvalHash: "0".repeat(64) } } });
   expect(alteredCaseApproval.status()).toBe(409);
   expect(await alteredCaseApproval.json()).toMatchObject({ code: "STORED_RECEIPT_APPROVAL_CHANGED" });
   const saved = await allocation("case", exact);
   expect(await allocation("case", exact)).toEqual({ ...saved, replayed: true });
   const assessCommand = { version: "recovery-attribution-command.v1", action: "assess", commandId: randomUUID(), caseId: recovery.id, workId, lineId: line.lineId, lockId, expectedCaseRevision: recovery.revision, expectedAttributionRevision: 0 };
   const assessed = await post("success-fee-attribution", assessCommand);
   expect(await post("success-fee-attribution", assessCommand)).toEqual(assessed);
   expect(assessed.assessment).toMatchObject({ assessmentOutcome: "eligible_for_review", reasonCodes: [], remainingPrincipal: line.net });
   for (const fact of Object.values(assessed.assessment.facts.facts) as { holds: boolean }[]) expect(fact.holds).toBe(true);
   // The existing SQL canonicalizer is authoritative for the full review artifact.
   const hash = (await admin.query("SELECT app.final_lock_hash($1::jsonb) hash", [assessed.assessment])).rows[0].hash as string;
   const reviewCommand = { ...assessCommand, action: "approve_review", commandId: randomUUID(), expectedAttributionRevision: assessed.assessment.revision, assessmentId: assessed.assessment.assessmentId, expectedSourceHash: assessed.assessment.sourceHash, reviewArtifactHash: hash };
   const approved = await post("success-fee-attribution", reviewCommand);
   expect(approved).toMatchObject({ effect: "review_recorded", productionEnabled: false, realExternalActions: 0 });
   expect(await post("success-fee-attribution", reviewCommand)).toEqual(approved);
   assessments.push(assessed);
  }
  const { sumExactPence, parseExactPence, serializeExactPence, verifyStandalonePackV3 } = await nativeImport<typeof import("@jobguard/core")>("../../packages/core/dist/index.js");
  expect(serializeExactPence(sumExactPence(assessments.map(row => parseExactPence(row.assessment.remainingPrincipal))))).toEqual({ numerator: "80000", denominator: "1" });
  expect(assessments.reduce((sum, row) => sum + row.valueReceipt.fee.pence, 0)).toBe(8000);
  expect(serializeExactPence(sumExactPence(assessments.map(row => parseExactPence(row.valueReceipt.yoursBeforeVatAndTax))))).toEqual({ numerator: "72000", denominator: "1" });
  await page.goto(`/jobs/${jobId}`);
  await page.getByRole("button", { name: "Prepare fee statement", exact: true }).click();
  await expect(page.getByTestId("payment-received")).toHaveText("£41,280.00");
  await expect(page.getByTestId("payment-qualifying-net")).toHaveText("£800.00");
  await expect(page.getByTestId("payment-fee")).toHaveText("£80.00");
  await expect(page.getByTestId("payment-yours-before-tax")).toHaveText("£720.00");
  await expect(page.getByRole("region", { name: "Receipt fee statements" })).toContainText("VAT not calculated in this simulation");
  await page.getByRole("button", { name: "Approve this exact fee statement", exact: true }).click();
  await expect(page.getByRole("region", { name: "Receipt fee statements" })).toContainText("Approved for simulation");
  // Each catch has its own automatic case; prove both source chains, not only one.
  for (const assessed of assessments) {
   await page.goto(`/jobs/${jobId}`);
   const recovery = cases.find((row: { id: string }) => row.id === assessed.assessment.caseId);
   const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(recovery.claimedNetPence / 100);
   await page.getByRole("button", { name: `missed variation final account · ${amount}`, exact: true }).click();
   await expect(page.getByRole("article", { name: "Selected recovery case" })).toContainText(recovery.sourceRefs.find((ref: string) => ref.startsWith("variation:")));
   await page.getByRole("button", { name: "Open lock and reveal packs", exact: true }).click();
   await page.getByRole("button", { name: "Build lock and reveal pack", exact: true }).click();
   const explorer = page.getByTestId("pack-v3-explorer");
   await expect(explorer).toContainText("Content matches manifest", { timeout: 180_000 });
   const url = await explorer.getByRole("link", { name: "Download lock and reveal pack" }).getAttribute("href");
   const response = await page.request.get(url!); expect(response.ok()).toBe(true);
   const text = await response.text(), verified = verifyStandalonePackV3(text), artifact = JSON.parse(text);
   await expect(explorer.getByTestId("pack-v3-manifest-hash")).toHaveText(verified.manifestHash);
   expect(artifact.manifest.sections.every((section: { status: string }) => section.status === "present")).toBe(true);
   for (const sourceId of [`customer_payment:${paymentId}`, `recovery_attribution_revision:${assessed.assessment.assessmentId}`]) expect(artifact.sources.some((source: { sourceId: string }) => source.sourceId === sourceId)).toBe(true);
   const file = info.outputPath(`${assessed.assessment.caseId}-pack.txt`); await writeFile(file, text);
   const cli = spawnSync(process.execPath, [resolve(process.cwd(), "../../packages/db/tools/verify-evidence-pack.mjs"), file], { encoding: "utf8" });
   expect(cli.error).toBeUndefined(); expect(JSON.parse(cli.stdout)).toMatchObject(verified);
   expect(cli.status).toBe(1); // No independent checkpoint supplied; retain that limitation.
   await explorer.getByRole("button", { name: "Approve lock and reveal pack for attachment", exact: true }).click();
   await expect(explorer).toContainText("Approval recorded for these exact hashes", { timeout: 180_000 });
   packs.push({ caseId: assessed.assessment.caseId, manifestHash: verified.manifestHash });
  }
 } finally { await admin.end(); }
 return { invoice, paymentId, assessments, packs, final };
}
