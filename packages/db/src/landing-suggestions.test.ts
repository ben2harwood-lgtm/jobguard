import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { RecoveryAllocationRepository } from "./recovery-allocation-repository.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const tenant = uuid(1), job = uuid(2), payment = uuid(3), invoice = uuid(4), evidence = uuid(5), caseId = uuid(6);
function snapshot() {
  return {
    receipts: [{ tenant_id: tenant, job_id: job, id: payment, invoice_id: invoice, movement_id: uuid(7),
      movement_hash: "a".repeat(64), movement_identity: "sandbox-account:receipt-384", final_account_revision_id: uuid(8), invoice_net_pence: "1880000", invoice_gross_pence: "2256000",
      amount_pence: "38400", settled_at: "2026-10-29T12:00:00.000001Z", paid_date: "2026-10-29", issued_date: "2026-10-01",
      counterparties: ["Fictional customer"], duplicate_held: false, reversed: false }],
    cases: [{ tenant_id: tenant, job_id: job, id: caseId, revision: 3, state: "evidence_assembled", case_type: "withheld_customer_payment",
      source_refs: [invoice], counterparty: "Fictional customer", case_created_at: "2026-10-29T12:00:00.000000Z",
      claim_pence: "32000", landed: "0", written_off: "0", evidenced_net_pence: "32000", synthetic: true,
      eligibility_status: "approved", eligibility_classification: "eligible_for_review" }],
    evidence: [{ id: evidence, invalidated: false, object_version_id: "proof-v1", sha256: "b".repeat(64), evidence_type: "site_photo" }],
    allocations: [] as Record<string, any>[], reversals: [] as Record<string, any>[], lines: [], invoices: [{ total_pence: "2256000" }],
    payments: [{ id: payment, amount_pence: "38400", reversed: false }], credits: [] as Record<string, any>[],
    paymentReversals: [] as Record<string, any>[], review: null,
  };
}
// Exercise the real projection with server-side row doubles. PostgreSQL/RLS is covered separately in CI.
function project(rows: ReturnType<typeof snapshot>) {
  return (new RecoveryAllocationRepository({} as Pool) as any).project(rows, job, tenant);
}
describe("M4-8 stored-fact landing projection", () => {
  it("returns proposals without recording allocation, reviewer, authorization or evidence approval", () => {
    const rows = snapshot(), before = JSON.stringify(rows), view = project(rows);
    expect(view.suggestions).toEqual([{ caseId, paymentId: payment, expectedCaseRevision: 3, grossPence: 38400,
      eligibleNetPence: 32000, taxPence: 6400, ambiguous: false, requiresHumanReview: true }]);
    expect(view.allocations).toEqual([]); expect(view.review).toBeNull(); expect(JSON.stringify(rows)).toBe(before);
  });
  it("does not import unmatched M1 mark-paid records as proof", () => {
    const rows = snapshot(); rows.receipts = [];
    expect(project(rows)).toMatchObject({ suggestions: [], grossMovementsPence: 0, eligibleNetPence: 0 });
  });
  it("uses remaining approved evidence and cash after partial reversals", () => {
    const rows = snapshot();
    rows.allocations.push({ id: uuid(9), case_id: caseId, payment_id: payment, invoice_id: invoice, gross_pence: "19200",
      eligible_net_pence: "16000", tax_pence: "3200", evidence_id: evidence, evidence_hash: "b".repeat(64), movement_hash: "a".repeat(64) });
    rows.reversals.push({ allocation_id: uuid(9), gross_pence: "6000", eligible_net_pence: "5000", tax_pence: "1000" });
    rows.cases[0]!.landed = "11000";
    expect(project(rows)).toMatchObject({ paused: true, suggestions: [{ grossPence: 25200, eligibleNetPence: 21000, taxPence: 4200 }] });
  });
  it("pauses immediately on chargeback, duplicate hold or credit before a human appends a reversal", () => {
    for (const kind of ["chargeback", "duplicate", "credit"]) {
      const rows = snapshot();
      rows.allocations.push({ id: uuid(9), case_id: caseId, payment_id: payment, invoice_id: invoice, gross_pence: "38400",
        eligible_net_pence: "32000", tax_pence: "6400", evidence_id: evidence, evidence_hash: "b".repeat(64), movement_hash: "a".repeat(64) });
      if (kind === "chargeback") { rows.receipts[0]!.reversed = true; rows.paymentReversals.push({ payment_id: payment, id: uuid(10) }); }
      if (kind === "duplicate") rows.receipts[0]!.duplicate_held = true;
      if (kind === "credit") rows.credits.push({ id: uuid(10), invoice_id: invoice, amount_pence: "6000" });
      const before = JSON.stringify(rows);
      expect(project(rows).paused).toBe(true);
      expect(JSON.stringify(rows)).toBe(before);
    }
  });
  it("ignores unrelated invoice credits and filters cross-tenant/cross-job candidates", () => {
    const rows = snapshot(); rows.credits.push({ id: uuid(10), invoice_id: uuid(99), amount_pence: "6000" });
    expect(project(rows).paused).toBe(false);
    rows.cases[0]!.tenant_id = uuid(99); expect(project(rows).suggestions).toEqual([]);
    rows.cases[0]!.tenant_id = tenant; rows.receipts[0]!.job_id = uuid(99); expect(project(rows).suggestions).toEqual([]);
  });
  it("does not expose lock identities or react to hidden/shadow records", () => {
    const rows = snapshot(), before = project(rows);
    Object.assign(rows, { shadowSignals: [{ id: uuid(99), amount: 100000 }], hiddenCount: 500 });
    expect(project(rows)).toEqual(before);
    expect(JSON.stringify(before.suggestions)).not.toContain(uuid(8));
    rows.receipts[0]!.final_account_revision_id = uuid(100);
    expect(project(rows).suggestions).toEqual(before.suggestions);
    rows.evidence[0]!.invalidated = true; expect(project(rows).suggestions).toEqual([]);
  });
  it.each(["production", "pilot_no_charge", "provider_sandbox", "unconfigured"])("refuses %s before acquiring a database connection", async environment => {
    const pool = { connect: () => { throw new Error("must not connect"); } } as unknown as Pool;
    await expect(new RecoveryAllocationRepository(pool, environment).view({ tenantId: tenant } as never,
      { membershipId: uuid(11), identityUserId: uuid(12) }, "a".repeat(64), job)).rejects.toMatchObject({ code: "ALLOCATION_SYNTHETIC_ONLY" });
  });
});
