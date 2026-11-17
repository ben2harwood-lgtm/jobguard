import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "./money.js";
import { VAT_FIXTURE_LABEL, VAT_SUPPORT_MATRIX_VERSION, type DarkVatTreatment } from "./vat-treatments.js";
import { CIS_ENABLED, CIS_FIXTURE_LABEL, CIS_POLICY_VERSION, CisDeductionError,
  reconcileCisFixtures, assertCisIssueAllowed, appendCisFixtureStatement, type CisFixtureBook } from "./cis-deductions.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenantId = id(1), jobId = id(2);
const context = (n: number) => ({ id: id(n), tenantId, jobId });
function fixture(code: DarkVatTreatment = "standard_20", status: "gross_payment" | "registered" | "unregistered" = "registered"): CisFixtureBook {
  const registered = code !== "non_vat", drc = code.startsWith("drc");
  return {
    version: "cis.fixture-book.v1", environment: "synthetic", label: CIS_FIXTURE_LABEL, policyVersion: CIS_POLICY_VERSION,
    tenantId, jobId, direction: "customer_receipt", contractorReference: "Fictional contractor", subcontractorReference: "Fictional builder",
    vatBook: {
      version: "vat.fixture-book.v1", matrixVersion: VAT_SUPPORT_MATRIX_VERSION, environment: "synthetic", label: VAT_FIXTURE_LABEL,
      tenantId, jobId, supplierReference: "Fictional builder", customerReference: "Fictional contractor",
      taxBasis: "full_net", roundingVersion: "fixture_cumulative_group_half_up_v1",
      documents: [{ id: id(10), previousDocumentId: null, kind: "interim", documentReference: "VAT-fixture-1",
        documentDate: "2026-10-01", interimCertificationId: id(11), retentionProfileId: id(20), retentionReleaseId: null, creditOfDocumentId: null,
        groups: [{ treatment: code, cumulativeNetPence: 10000, retainedNetPence: 1000, eligibility: {
          source: "human_fixture", actorId: id(3), evidenceId: id(4), supplierVatRegistered: registered,
          supplierVatNumber: registered ? "fixture-vat" : null, customerVatRegistered: true, customerVatNumber: "fixture-customer-vat",
          customerEndUser: !drc, intermediarySupplier: false, constructionReverseChargeInScope: drc, qualifyingBasisReference: "fixture-basis",
        } }],
      }],
    },
    retentionBook: { version: "retention.book.v1", environment: "synthetic", tenantId, jobId, records: [{
      ...context(20), version: "retention.profile.v1", revision: 1, previousProfileId: null,
      contractProfileVersion: "fixture-v1", fixtureApprovalId: id(5), taxTreatmentVersion: "fixture-full-net-v1",
      retained: { netPence: 1000, taxPence: 0 }, alreadyBilled: { netPence: 0, taxPence: 0 },
      conditions: [{ id: id(21), milestone: "completion", description: "Fictional completion", dueDate: "2027-01-01",
        source: { kind: "human_input", actorId: id(3), inputId: id(4) }, dateSource: { kind: "human_input", actorId: id(3), inputId: id(4) },
        cumulativeLimit: { netPence: 1000, taxPence: 0 } }],
    }] },
    verifications: [{ ...context(30), version: "cis.verification-fixture.v1", contractorReference: "Fictional contractor",
      subcontractorReference: "Fictional builder", status, evidenceId: id(31), evidenceReference: "fictional-status-record", recordedBy: id(3),
      validFrom: "2026-10-01", validThrough: "2026-11-05" }],
    payments: [], statements: [{ ...context(40), version: "cis.statement-fixture.v1", previousStatementId: null,
      kind: "payment", correctionOfStatementId: null, documentReference: "CIS-fixture-1", documentDate: "2026-10-31", taxMonthEnd: "2026-11-05",
      humanApproval: { actorId: id(3), decisionId: id(6), sourceCalculationReference: "fictional-calculation-1" },
      verificationId: id(30), vatDocumentId: id(10), retentionProfileId: id(20), cumulativePaidNetPence: 4000,
      cumulativeDirectMaterialsPence: 1000, materialsEvidenceId: id(32), cumulativePaidVatPence: 0, paymentRecordIds: [],
    }],
  };
}
function last(book: CisFixtureBook) { return reconcileCisFixtures(book).statements.at(-1)!; }
function rejects(book: unknown, code: string) {
  expect(() => reconcileCisFixtures(book)).toThrow(CisDeductionError);
  try { reconcileCisFixtures(book); } catch (error) { expect(error).toMatchObject({ code }); }
}
function addPayment(book: CisFixtureBook, n: number, cashPence: number, reversalOfPaymentId: string | null = null) {
  book.payments.push({ ...context(n), version: "cis.payment-fixture.v1", paymentReference: `fictional-payment-${n}`,
    paymentDate: "2026-10-31", evidenceId: id(n + 100), cashPence, reversalOfPaymentId });
  book.statements.at(-1)!.paymentRecordIds.push(id(n));
}
function next(book: CisFixtureBook, correction = false) {
  const previous = book.statements.at(-1)!;
  book.statements.push({ ...structuredClone(previous), id: id(41), previousStatementId: previous.id,
    kind: correction ? "correction" : "payment", correctionOfStatementId: correction ? previous.id : null,
    documentReference: "CIS-fixture-2", paymentRecordIds: [] });
  return book.statements.at(-1)!;
}

describe("M4-22 dark CIS fixtures", () => {
  it.each([["gross_payment", 0], ["registered", 600], ["unregistered", 900]] as const)("requires evidenced %s status", (status, deduction) => {
    const result = last(fixture("standard_20", status));
    expect(result.deductionBase.pence).toBe(3000); expect(result.cisDeduction.pence).toBe(deduction);
    expect(result.expectedCash.pence).toBe(4000 - deduction);
    expect(result.verification.evidenceId).toBe(id(31));
  });
  it.each(["standard_20", "zero", "reduced_5", "non_vat", "drc_20", "drc_5"] as const)("separates VAT, CIS, retention and cash for %s", code => {
    const book = fixture(code), s = book.statements[0]!;
    const vat = code === "standard_20" ? 2000 : code === "reduced_5" ? 500 : 0;
    s.cumulativePaidNetPence = 9000; s.cumulativeDirectMaterialsPence = 2000; s.cumulativePaidVatPence = vat;
    const expected = 9000 + vat - 1400; addPayment(book, 50, expected);
    const result = last(book);
    expect(result).toMatchObject({ invoiceNet: { pence: 10000 }, vatToSupplier: { pence: vat }, retention: { pence: 1000 },
      deductionBase: { pence: 7000 }, cisDeduction: { pence: 1400 }, expectedCash: { pence: expected },
      actualCash: { pence: expected }, unpaidCash: { pence: 0 }, feeEligibleRecovery: { pence: 0 } });
    expect(result.invoiceGross.pence).toBe(result.retention.pence + result.cisDeduction.pence + result.actualCash.pence);
    expect(result.reverseChargeVat.pence).toBe(code === "drc_20" ? 2000 : code === "drc_5" ? 500 : 0);
  });
  it("reconciles separate partial payments and cumulative rounding without charging on materials or VAT", () => {
    const book = fixture(); addPayment(book, 50, 3400);
    const s = next(book); s.cumulativePaidNetPence = 9000; s.cumulativeDirectMaterialsPence = 2000; s.cumulativePaidVatPence = 2000;
    addPayment(book, 51, 6200);
    const output = reconcileCisFixtures(book), result = output.statements[1]!;
    expect(result.delta).toMatchObject({ deduction: { pence: 800 }, expectedCash: { pence: 6200 } });
    expect(result.actualCash.pence).toBe(9600); expect(result.unpaidCash.pence).toBe(0);
    expect(output.statements[0]!.cisDeduction.pence).toBe(600);
    expect(Object.isFrozen(result.source.humanApproval)).toBe(true);
    expect(output.label).toBe(CIS_FIXTURE_LABEL); expect(output.approval).toBe("not adviser-approved");
  });
  it("appends calculation corrections and bounded compensating cash, preserving prior statements", () => {
    const book = fixture(); addPayment(book, 50, 3400);
    const original = structuredClone(book.statements[0]);
    const s = next(book, true); s.cumulativePaidNetPence = 2000; s.cumulativeDirectMaterialsPence = 500;
    expect(last(book)).toMatchObject({ cisDeduction: { pence: 300 }, refundDue: { pence: 1700 }, delta: { deduction: { pence: -300 } } });
    addPayment(book, 51, 1700, id(50));
    expect(last(book)).toMatchObject({ actualCash: { pence: 1700 }, refundDue: { pence: 0 }, unpaidCash: { pence: 0 } });
    expect(book.statements[0]).toEqual(original);
    expect(appendCisFixtureStatement(book, book.statements[0])).toEqual(book);
    expect(() => appendCisFixtureStatement(book, { ...book.statements[0], cumulativePaidNetPence: 1 })).toThrowError(/cannot rewrite/);
    book.payments[1]!.cashPence = 3401; rejects(book, "VALUE_LIMIT");
  });
  it("keeps missing actual cash separate from evidenced CIS and recovery entitlement", () => {
    const result = last(fixture());
    expect(result.unpaidCash.pence).toBe(3400); expect(result.cisDeduction.pence).toBe(600); expect(result.feeEligibleRecovery.pence).toBe(0);
  });
  it("never defaults missing, unsupported, future or stale status to a rate", () => {
    const missing = fixture(); missing.verifications = []; rejects(missing, "INVALID_INPUT");
    const unknown = fixture(); unknown.statements[0]!.verificationId = id(999); rejects(unknown, "MISSING_SOURCE");
    const stale = fixture(); stale.verifications[0]!.validThrough = "2026-10-30"; rejects(stale, "STALE_VERIFICATION");
    const future = fixture(); future.verifications[0]!.validFrom = "2026-11-01"; rejects(future, "STALE_VERIFICATION");
    const evidence = fixture(); rejects({ ...evidence, verifications: [{ ...evidence.verifications[0], evidenceId: null }] }, "INVALID_INPUT");
    rejects({ ...fixture(), verifications: [{ ...fixture().verifications[0], status: "unknown" }] }, "INVALID_INPUT");
  });
  it("requires status validity for actual payment dates too", () => {
    const book = fixture(); addPayment(book, 50, 100); book.payments[0]!.paymentDate = "2026-09-30";
    rejects(book, "STALE_VERIFICATION");
  });
  it("rejects cross-tenant, cross-job and cross-party sources", () => {
    const tenant = fixture(); tenant.verifications[0]!.tenantId = id(99); rejects(tenant, "CONTEXT_MISMATCH");
    const job = fixture(); job.retentionBook.jobId = id(99); rejects(job, "CONTEXT_MISMATCH");
    const party = fixture(); party.vatBook.customerReference = "Another fictional customer"; rejects(party, "CONTEXT_MISMATCH");
    const status = fixture(); status.verifications[0]!.subcontractorReference = "Other fictional builder"; rejects(status, "CONTEXT_MISMATCH");
  });
  it("rejects missing VAT/profile lineage and inconsistent retained balances", () => {
    const missing = fixture(); missing.statements[0]!.vatDocumentId = id(999); rejects(missing, "MISSING_SOURCE");
    const profile = fixture(); profile.statements[0]!.retentionProfileId = id(999); rejects(profile, "MISSING_SOURCE");
    const retained = fixture(); retained.vatBook.documents[0]!.groups[0]!.retainedNetPence = 999; rejects(retained, "VALUE_LIMIT");
  });
  it("rejects duplicate/replayed identities, references, payments and unallocated payment records", () => {
    const duplicate = fixture(); duplicate.verifications.push(structuredClone(duplicate.verifications[0]!)); rejects(duplicate, "REPLAY_CONFLICT");
    const replay = fixture(); addPayment(replay, 50, 100); next(replay).paymentRecordIds = [id(50)]; rejects(replay, "REPLAY_CONFLICT");
    const ref = fixture(); addPayment(ref, 50, 100); addPayment(ref, 51, 100); ref.payments[1]!.paymentReference = ref.payments[0]!.paymentReference; rejects(ref, "REPLAY_CONFLICT");
    const unused = fixture(); addPayment(unused, 50, 100); unused.statements[0]!.paymentRecordIds = []; rejects(unused, "MISSING_SOURCE");
  });
  it("requires corrections and refuses status rewrites and broken lineage", () => {
    const correction = fixture(); next(correction).cumulativePaidNetPence = 2000; rejects(correction, "INVALID_LINEAGE");
    const lineage = fixture(); next(lineage, true).correctionOfStatementId = id(999); rejects(lineage, "INVALID_LINEAGE");
    const status = fixture(); status.verifications.push({ ...status.verifications[0]!, id: id(33), status: "gross_payment" });
    next(status).verificationId = id(33); rejects(status, "INVALID_LINEAGE");
  });
  it("bounds materials, paid VAT, retained net, and monetary magnitudes", () => {
    for (const [key, value] of [["cumulativeDirectMaterialsPence", 4001], ["cumulativePaidVatPence", 2001],
      ["cumulativePaidNetPence", 9001], ["cumulativePaidNetPence", MAX_MONEY_PENCE + 1], ["cumulativePaidNetPence", 1.5]] as const) {
      const book = fixture(); book.statements[0]![key] = value;
      rejects(book, value > MAX_MONEY_PENCE || value === 1.5 ? "INVALID_INPUT" : "VALUE_LIMIT");
    }
  });
  it("uses exact cumulative rounding for tiny part payments and inverse corrections", () => {
    const book = fixture(), s = book.statements[0]!; s.cumulativePaidNetPence = 2; s.cumulativeDirectMaterialsPence = 0;
    const second = next(book); second.cumulativePaidNetPence = 3;
    const results = reconcileCisFixtures(book).statements;
    expect(results.map(item => item.cisDeduction.pence)).toEqual([0, 1]);
    expect(results.map(item => item.delta.deduction.pence)).toEqual([0, 1]);
    const inverse = { ...second, id: id(42), previousStatementId: second.id, kind: "correction" as const,
      correctionOfStatementId: second.id, documentReference: "CIS-fixture-3", cumulativePaidNetPence: 0 };
    const corrected = appendCisFixtureStatement(book, inverse);
    expect(last(corrected).delta.deduction.pence).toBe(-1);
  });
  it("keeps deferred retained VAT separate using the M4-20 profile", () => {
    const book = fixture(); book.vatBook.taxBasis = "net_after_retention";
    const profile = book.retentionBook.records[0]!;
    if (profile.version !== "retention.profile.v1") throw new Error("Expected fixture profile");
    profile.retained.taxPence = 200; profile.conditions[0]!.cumulativeLimit.taxPence = 200;
    const s = book.statements[0]!; s.cumulativePaidNetPence = 9000;
    s.cumulativeDirectMaterialsPence = 2000; s.cumulativePaidVatPence = 1800;
    addPayment(book, 50, 9400);
    expect(last(book)).toMatchObject({ vatToSupplier: { pence: 1800 }, deferredRetainedVat: { pence: 200 },
      cisDeduction: { pence: 1400 }, invoiceExpectedCash: { pence: 9400 }, invoiceUnpaidCash: { pence: 0 } });
  });
  it("separates unallocated invoice value and VAT from partial-payment cash", () => {
    const book = fixture(); addPayment(book, 50, 3400);
    const result = last(book);
    expect(result).toMatchObject({ unpaidCash: { pence: 0 }, invoiceUnpaidCash: { pence: 7000 },
      unallocatedInvoiceNet: { pence: 5000 }, unallocatedInvoiceVat: { pence: 2000 } });
    expect(result.invoiceGross.pence).toBe(result.retention.pence + result.cisDeduction.pence
      + result.actualCash.pence + result.invoiceUnpaidCash.pence - result.invoiceRefundDue.pence);
  });
  it("uses checked BigInt at the magnitude boundary", () => {
    const book = fixture("non_vat"), s = book.statements[0]!;
    book.vatBook.documents[0]!.groups[0]!.cumulativeNetPence = MAX_MONEY_PENCE;
    s.cumulativePaidNetPence = 999999999000; s.cumulativeDirectMaterialsPence = 0;
    expect(last(book).cisDeduction.pence).toBe(199999999800);
    expect(last(book).expectedCash.pence).toBe(799999999200);
    addPayment(book, 50, MAX_MONEY_PENCE); addPayment(book, 51, 1);
    rejects(book, "VALUE_LIMIT");
  });
  it("refuses cash reversals without original reconciled payment lineage", () => {
    const book = fixture(); addPayment(book, 50, 10, id(999)); rejects(book, "INVALID_LINEAGE");
    const future = fixture(); addPayment(future, 50, 10); future.payments[0]!.paymentDate = "2026-11-01";
    rejects(future, "STALE_VERIFICATION");
  });
  it("supports both fictional cash directions and always refuses real issue/returns", () => {
    const book = fixture(); book.direction = "subcontractor_payment";
    expect(reconcileCisFixtures(book).direction).toBe("subcontractor_payment");
    expect(CIS_ENABLED).toBe(false); expect(() => assertCisIssueAllowed()).toThrowError(/disabled/);
    rejects({ ...book, enabled: true }, "INVALID_INPUT");
    rejects({ ...book, environment: "production" }, "INVALID_INPUT");
  });
});
