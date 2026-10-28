// PostgreSQL negative-source regressions only. Full positive SV6-06/07 source integration is
// DEPENDENCY-BOUND on accepted SV-5/CH-7/M4-8 adapters. No positive catch is fabricated here.
// NOT RUN locally: the issued sandbox cannot bind localhost or start PostgreSQL.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deriveAttributionBillingPaymentProof } from "../../core/src/recovery-attribution-illustration.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { createLockFixture, closeLockFixture, seedAccount, asFixtureTenant, LOCK_OWNER, type LockFixture } from "./final-account-lock.integration.test.js";

const missingCatchTarget = (a: Awaited<ReturnType<typeof seedAccount>>, invoiceId: string) => ({
  tenantId: a.tenantId, jobId: a.jobId, caseId: randomUUID(), workId: randomUUID(), scopeItemId: randomUUID(),
  commercialRevisionId: randomUUID(), approvalId: randomUUID(), lockId: randomUUID(),
  accountRevisionId: a.revisionId, accountLineId: randomUUID(), invoiceId, invoiceLineId: randomUUID(),
});
describe("SV6-06/07 persisted missing-proof regressions (positive chain dependency-bound)", () => {
  let f: LockFixture;
  beforeAll(async () => { f = await createLockFixture(); }, 90_000);
  afterAll(async () => { if (f) await closeLockFixture(f); });
  it("SV6-06 qualification requires the exact approved invoiced catch line", async () => {
    const a = await seedAccount(f.admin);
    const invoices = new PracticeInvoiceRepository(f.runtime);
    await invoices.issue(a.context, { jobId: a.jobId, finalAccountRevisionId: a.revisionId,
      actorMembershipId: LOCK_OWNER, commandId: randomUUID(), recipient: "fictional@example.invalid", issuedOn: "2026-10-24" });
    const rows = await asFixtureTenant(f.runtime, a.tenantId, db => db.query<{ id: string }>(
      "SELECT id FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId]));
    expect(rows.rows).toHaveLength(1);
    const target = missingCatchTarget(a, rows.rows[0]!.id);
    // An actual baseline invoice exists, but there is no lock-bound invoiced catch line.
    const bound = await asFixtureTenant(f.runtime, a.tenantId, db => db.query(
      `SELECT l.final_account_line_id FROM app.final_account_invoiced_line l
       JOIN app.final_account_invoice_binding b ON (b.tenant_id,b.job_id,b.invoice_id)=(l.tenant_id,l.job_id,l.invoice_id)
       WHERE l.tenant_id=$1 AND l.job_id=$2 AND l.invoice_id=$3 AND l.final_account_line_id=$4
       AND b.lock_id=$5 AND l.commercial_revision_id=$6`,
      [a.tenantId, a.jobId, target.invoiceId, target.accountLineId, target.lockId, target.commercialRevisionId]));
    expect(bound.rows).toEqual([]);
    const result = deriveAttributionBillingPaymentProof({ version: "attribution-billing-payment-proof.v1",
      environment: "synthetic_demo", productionEnabled: false, target, billing: null, payment: null });
    expect(result.billedThroughFinalAccountRevisionAndInvoice).toBe(false);
    expect(result.billingReasons).toEqual(["missing_billing_proof"]);
    expect(result.supportedPaidPrincipal).toEqual({ numerator: "0", denominator: "1" });
  });
  it("SV6-07 only matched settled money can qualify", async () => {
    const a = await seedAccount(f.admin), invoices = new PracticeInvoiceRepository(f.runtime);
    await invoices.issue(a.context, { jobId: a.jobId, finalAccountRevisionId: a.revisionId,
      actorMembershipId: LOCK_OWNER, commandId: randomUUID(), recipient: "fictional@example.invalid", issuedOn: "2026-10-24" });
    const invoice = (await asFixtureTenant(f.runtime, a.tenantId, db => db.query<{ id: string }>(
      "SELECT id FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId]))).rows[0]!;
    await invoices.recordReceipt(a.context, { jobId: a.jobId, invoiceId: invoice.id, actorMembershipId: LOCK_OWNER,
      commandId: randomUUID(), paidOn: "2026-10-24", amountPence: 96000, method: "bank_transfer", reference: "Fictional manual receipt" });
    const receipts = await asFixtureTenant(f.runtime, a.tenantId, db => db.query<{ id: string; amount_pence: string }>(
      "SELECT id,amount_pence FROM app.customer_payment WHERE tenant_id=$1 AND job_id=$2 AND invoice_id=$3", [a.tenantId, a.jobId, invoice.id]));
    expect(receipts.rows).toHaveLength(1);
    const receipt = receipts.rows[0]!;
    for (const table of ["practice_feed_receipt_match", "receipt_line_allocation"] as const) {
      const rows = await asFixtureTenant(f.runtime, a.tenantId, db => db.query(
        `SELECT payment_id FROM app.${table} WHERE tenant_id=$1 AND job_id=$2 AND payment_id=$3`, [a.tenantId, a.jobId, receipt.id]));
      expect(rows.rows).toEqual([]);
    }
    const result = deriveAttributionBillingPaymentProof({ version: "attribution-billing-payment-proof.v1",
      environment: "synthetic_demo", productionEnabled: false, target: missingCatchTarget(a, invoice.id), billing: null,
      payment: { movement: null, match: null, allocation: null,
        receipt: { tenantId: a.tenantId, jobId: a.jobId, paymentId: receipt.id, invoiceId: invoice.id, amountPence: Number(receipt.amount_pence) } } });
    expect(result.customerPaymentSettledAndAllocatedToThatLine).toBe(false);
    expect(result.paymentReasons).toContain("missing_movement_proof");
    expect(result.savedAllocationId).toBeNull();
    expect(result.supportedPaidPrincipal).toEqual({ numerator: "0", denominator: "1" });
  });
});
