import { prepareInvoiceFinalCheck } from "./customer-invoice-journey";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { pounds } from "../../app/lib/pounds";
import { expect, type APIResponse, type Page } from "@playwright/test";
import { openQuotingWatchdogJob } from "./capture-journey";
import { jsonResult } from "./customer-invoice-journey";
import type { RecoveryAllocationView } from "../../../api/src/recovery-allocation.contracts";

// Playwright's CommonJS loader cannot require @jobguard/core (its exports have only an "import" condition), directly or through
// apps/api/src/recovery-allocation.contracts. Both are therefore loaded from their BUILT ESM output with a native dynamic
// import, the mechanism apps/web/e2e/M4-3-S.spec.ts uses for core. The real core pounds parser and the real compiled view
// schema run here; nothing is stubbed. Playwright runs from apps/web, so process.cwd() is apps/web.
const nativeImport = <T>(fromWebRoot: string) => (new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<T>)(pathToFileURL(join(process.cwd(), fromWebRoot)).href);
const loadCore = () => nativeImport<typeof import("@jobguard/core")>("../../packages/core/dist/index.js");
const loadContracts = () => nativeImport<typeof import("../../../api/src/recovery-allocation.contracts")>("../api/dist/recovery-allocation.contracts.js");

export const allocationPanel = (page: Page) => page.getByTestId("recovery-allocation-workbench");
export const allocationPath = (jobId: string) => `/api/jobs/${jobId}/recovery-allocations`;
/** Validates a view with the real compiled schema (apps/api/dist), so a malformed saved view fails the journey. */
export async function parseAllocationView(value: unknown): Promise<RecoveryAllocationView> {
  return (await loadContracts()).recoveryAllocationViewV1.parse(value);
}
export async function readAllocations(page: Page, jobId: string): Promise<RecoveryAllocationView> {
  return parseAllocationView(await jsonResult(page.request.get(allocationPath(jobId)), "Read saved allocation"));
}
export async function post(page: Page, path: string, body: unknown) {
  return jsonResult(page.request.post(path, { data: body }), "Save real synthetic command");
}
const id = () => crypto.randomUUID();
export async function readyAllocations(page: Page) {
  await expect(allocationPanel(page)).toHaveAttribute("aria-busy", "false");
  await expect(allocationPanel(page).getByTestId("eligible-net")).toHaveCount(1);
}
/** Synthetic source setup uses real quote, proof, invoice, eligibility and feed commands.
 * No success response or allocation output is mocked. All workbench allocations use its public routes.
 */
export async function recovery18800(page: Page) {
  const { parsePoundsToPence } = await loadCore();
  await openQuotingWatchdogJob(page);
  for (const input of await page.getByLabel(/Unit rate/u).all()) await input.fill("1.00");
  const clean = page.getByLabel("Unit rate Clean site", { exact: true });
  await clean.fill("0.00");
  const otherLines = parsePoundsToPence((await page.getByTestId("quote-net").innerText()).replace("GBP ", "").replaceAll(",", ""));
  await clean.fill(pounds(1880000 - otherLines).slice(1).replaceAll(",", ""));
  await expect(page.getByTestId("quote-net")).toHaveText("GBP 18,800.00");
  for (const name of ["Save draft revision", "Preview immutable quote", "Simulate sending this quote", "Continue fake worker", "Record practice acceptance", "Start this practice job"]) {
    await page.getByRole("button", { name, exact: true }).click();
    if (name === "Save draft revision") await expect(page.getByTestId("quote-revision")).toHaveText("1");
  }
  await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const proofPath = `/api/jobs/${jobId}/proof`;
  const source = await jsonResult(page.request.get(proofPath), "Read source scope");
  async function evidence() {
    const selected = await post(page, proofPath, { version: "practice-proof-command.v1", action: "select_generated", commandId: id(), scopeItemId: source.scopeItemId, fixture: "completion-photo" });
    const finalized = await post(page, proofPath, { version: "practice-proof-command.v1", action: "finalize", commandId: id(), uploadId: selected.upload.id, objectVersionId: selected.upload.objectVersionId });
    expect(finalized.upload.state).toBe("verified");
    return finalized.upload.evidenceId as string;
  }
  const evidence1 = await evidence();
  await post(page, proofPath, { version: "practice-proof-command.v1", action: "complete", commandId: id(), evidenceId: evidence1, scopeItemId: source.scopeItemId });
  const evidence2 = await evidence();
  const finalPath = `/api/jobs/${jobId}/final-account`;
  const before = await jsonResult(page.request.get(finalPath), "Read final account revision");
  const final = await post(page, finalPath, { version: "final-account.assemble.v1", commandId: id(), expectedRevision: before.account?.revision ?? 0 });
  expect(final.account.issueBlocked).toBe(false);
  await prepareInvoiceFinalCheck(page,jobId,final.account);
  const issued = await post(page, `/api/jobs/${jobId}/customer-invoices`, { version: "practice-customer-invoice.issue.v1", commandId: id(), finalAccountRevisionId: final.account.id, expectedSourceHash: final.account.sourceHash, recipient: "practice-customer@example.invalid", issuedOn: "2026-10-12" });
  const invoice = issued.invoices.at(-1); expect(invoice).toMatchObject({ netPence: 1880000, totalPence: 2256000 });
  const invoiceId = invoice.id as string, receiptPath = `/api/jobs/${jobId}/customer-invoices/${invoiceId}/receipts`;
  const cases: { caseId: string; evidenceId: string; paymentId: string; grossPence: number; claimedNetPence: number }[] = [];
  let feed = await post(page, `/api/jobs/${jobId}/practice-feed`, { version: "practice-feed-command.v1", commandId: id(), expectedRevision: 0, action: "connect" });
  for (const [net, gross, movement, evidenceId] of [[32000, 38400, "receipt-384", evidence1], [250000, 300000, "receipt-3000", evidence2]] as const) {
    const opened = await post(page, `/api/jobs/${jobId}/recovery-cases`, { version: "recovery-case-command.v1", action: "open", commandId: id(), caseType: "withheld_customer_payment", claimedNetPence: net, counterparty: "Fictional customer", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: [invoiceId], expectedRevision: 0 });
    const caseId = opened.affectedCaseId as string;
    let current = opened.cases.find((row: { id: string }) => row.id === caseId);
    const assembled = await post(page, `/api/jobs/${jobId}/recovery-cases`, { version: "recovery-case-command.v1", action: "transition", commandId: id(), caseId, eventType: "assemble_evidence", expectedRevision: current.revision });
    current = assembled.cases.find((row: { id: string }) => row.id === caseId);
    const reviewed = await post(page, `/api/jobs/${jobId}/recovery-cases/eligibility`, { version: "recovery-eligibility-command.v1", action: "review", commandId: id(), caseId, scenario: "evidence_backed_withheld_payment", expectedCaseRevision: current.revision, evidenceRevision: 1, policyVersion: "reference-d03.v1", policyRevision: 1 });
    current = reviewed.cases.find((row: { id: string }) => row.id === caseId);
    await post(page, `/api/jobs/${jobId}/recovery-cases/eligibility`, { version: "recovery-eligibility-command.v1", action: "approve", commandId: id(), caseId, expectedCaseRevision: current.revision, expectedEvidenceRevision: current.eligibility.evidenceRevision, expectedPolicyRevision: current.eligibility.policyRevision, expectedReviewRevision: current.eligibility.revision });
    const receipt = await post(page, receiptPath, { version: "practice-customer-receipt.record.v1", commandId: id(), invoiceId, paidOn: "2026-10-13", amountPence: gross, method: "bank_transfer", reference: `Fictional ${movement}` });
    const paymentId = receipt.receipts.at(-1).id as string;
    feed = await post(page, `/api/jobs/${jobId}/practice-feed`, { version: "practice-feed-command.v1", commandId: id(), expectedRevision: feed.revision, action: "advance", movement, step: "settled" });
    feed = await post(page, `/api/jobs/${jobId}/practice-feed`, { version: "practice-feed-command.v1", commandId: id(), expectedRevision: feed.revision, action: "match_receipt", movement, paymentId });
    cases.push({ caseId, evidenceId, paymentId, grossPence: gross, claimedNetPence: net });
  }
  await page.reload(); await readyAllocations(page);
  return { jobId, invoiceId, receiptPath, cases };
}
export async function allocateThroughUi(page: Page, source: { caseId: string; evidenceId: string; paymentId: string }, pounds: string, split: string) {
  const panel = allocationPanel(page);
  await panel.getByRole("combobox", { name: "Recovery case", exact: true }).selectOption(source.caseId);
  await panel.getByRole("combobox", { name: "Matched receipt", exact: true }).selectOption(source.paymentId);
  await panel.getByRole("combobox", { name: "Recovery evidence on file", exact: true }).selectOption(source.evidenceId);
  await panel.getByLabel("Allocation gross (£)", { exact: true }).fill(pounds);
  await panel.getByRole("button", { name: "Review receipt allocation", exact: true }).click();
  await expect(panel.getByTestId("allocation-review-split")).toHaveText(split);
  await panel.getByRole("button", { name: "Approve exact receipt allocation", exact: true }).click();
  await expect(panel.getByTestId("allocation-review-split")).toHaveCount(0);
  await readyAllocations(page);
}
export async function refused(request: Promise<APIResponse>, status: number, code: string) {
  const response = await request; expect(response.status(), await response.text()).toBe(status);
  expect(await response.json()).toEqual({ version: "recovery-allocation-error.v1", code });
}

/** Independent read through the actual application login and RLS, for persisted browser provenance/original-fact assertions. */
export async function allocationDatabase(jobId: string) {
  const { Pool } = await import("pg");
  const { DEMO_TENANT_ID } = await import("@jobguard/db");
  const passphrase = ["sbox", "e2e", "runtime"].join("-");
  const pool = new Pool({ host: "127.0.0.1", port: 55432, database: "jobguard_synthetic_demo", user: "jobguard_runtime", password: passphrase, max: 1 });
  try {
    // One pooled client in one transaction with the tenant set transaction-locally (what the package's own tenant wrapper does), written out
    // here so no TypeScript source of the db package is loaded through Playwright's loaders (CI run 38328750351).
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [DEMO_TENANT_ID]);
      const params = [DEMO_TENANT_ID, jobId];
      const allocated = await client.query("SELECT id,case_id,payment_id,invoice_id,movement_id,evidence_id,evidence_hash,object_version_id,policy_version,reviewer_ref,authorization_id,gross_pence,eligible_net_pence,tax_pence FROM app.recovery_case_allocation WHERE tenant_id=$1 AND job_id=$2 ORDER BY id", params);
      const originals: Record<string, unknown> = {};
      for (const table of ["recovery_case_allocation", "customer_payment", "practice_feed_event", "practice_feed_receipt_match"] as const) {
        const selected = await client.query(`SELECT row_to_json(t)::text value FROM app.${table} t WHERE tenant_id=$1 AND job_id=$2 ORDER BY id`, params);
        originals[table] = selected.rows.map(row => row.value);
      }
      await client.query("COMMIT");
      return { allocated: allocated.rows, originals };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  } finally { await pool.end(); }
}
