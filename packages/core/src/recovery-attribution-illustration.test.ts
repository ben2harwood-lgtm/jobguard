import { describe, expect, it } from "vitest";
import { deriveAttributionBillingPaymentProof as derive, AttributionBillingPaymentProofError } from "./recovery-attribution-illustration.js";

const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { tenantId: id(1), jobId: id(2) };
const target = { ...scope, caseId: id(3), workId: id(4), scopeItemId: id(5), commercialRevisionId: id(6),
  approvalId: id(7), lockId: id(8), accountRevisionId: id(9), accountLineId: id(10), invoiceId: id(11), invoiceLineId: id(12) };
// Internal synthetic snapshots, not source-owner API fixtures or database records.
const fixture = () => ({
  version: "attribution-billing-payment-proof.v1", environment: "synthetic_demo", productionEnabled: false, target: { ...target },
  billing: {
    commercial: { ...scope, caseId: target.caseId, workId: target.workId, scopeItemId: target.scopeItemId,
      commercialRevisionId: target.commercialRevisionId, approvalId: target.approvalId, status: "approved" },
    accountLine: { ...scope, lockId: target.lockId, accountRevisionId: target.accountRevisionId, accountLineId: target.accountLineId,
      scopeItemId: target.scopeItemId, commercialRevisionId: target.commercialRevisionId, approvalId: target.approvalId },
    invoiceLine: { ...scope, invoiceId: target.invoiceId, invoiceLineId: target.invoiceLineId, accountRevisionId: target.accountRevisionId,
      accountLineId: target.accountLineId, scopeItemId: target.scopeItemId, commercialRevisionId: target.commercialRevisionId,
      approvalId: target.approvalId, status: "issued", netPence: 80000 },
  },
  payment: {
    movement: { ...scope, movementId: id(13), accountId: id(14), eventId: id(15), sourceHash: "a".repeat(64),
      state: "settled", identity: "identified", duplicateHeld: false, grossPence: 96000 },
    receipt: { ...scope, paymentId: id(16), invoiceId: target.invoiceId, amountPence: 96000 },
    match: { ...scope, paymentId: id(16), accountId: id(14), settledEventId: id(15), matchedPence: 96000 },
    allocation: { ...scope, allocationId: id(17), caseId: target.caseId, workId: target.workId, invoiceId: target.invoiceId,
      invoiceLineId: target.invoiceLineId, paymentId: id(16), movementId: id(13), movementHash: "a".repeat(64),
      net: { numerator: "2000000", denominator: "43" } },
  },
});
const zero = { numerator: "0", denominator: "1" };
describe("SV6-06/07 pure proof guards (persisted-source acceptance dependency-bound)", () => {
  it("SV6-06 qualification requires the exact approved invoiced catch line", () => {
    const raw = fixture(), original = structuredClone(raw);
    const yes = derive(raw);
    expect(yes.billedThroughFinalAccountRevisionAndInvoice).toBe(true);
    expect(yes.invoiceLineId).toBe(target.invoiceLineId);
    expect(yes.billingReasons).toEqual([]);
    for (const source of ["commercial", "accountLine", "invoiceLine"] as const) {
      for (const key of Object.keys(raw.billing[source]).filter(k => k.endsWith("Id"))) {
        const changed = fixture();
        Object.assign(changed.billing[source], { [key]: id(99) });
        const result = derive(changed);
        expect(result.billedThroughFinalAccountRevisionAndInvoice, `${source}.${key}`).toBe(false);
        expect(result.billingReasons).toContain(`${source}.${key}`);
        expect(result.customerPaymentSettledAndAllocatedToThatLine).toBe(false);
        expect(result.supportedPaidPrincipal).toEqual(zero);
      }
    }
    // Changing the server-selected target alone must likewise fail every identity join.
    for (const key of Object.keys(target)) {
      const changed = fixture(); Object.assign(changed.target, { [key]: id(99) });
      expect(derive(changed).billedThroughFinalAccountRevisionAndInvoice, `target.${key}`).toBe(false);
    }
    for (const status of ["proposed", "rejected", "revoked", "superseded"]) {
      const changed = fixture(); changed.billing.commercial.status = status;
      expect(derive(changed).billingReasons).toContain("commercial.status");
    }
    for (const status of ["draft", "void"]) {
      const changed = fixture(); changed.billing.invoiceLine.status = status;
      expect(derive(changed).billingReasons).toContain("invoiceLine.status");
    }
    const missing = derive({ ...raw, billing: null });
    expect(missing.billedThroughFinalAccountRevisionAndInvoice).toBe(false);
    expect(missing.billingReasons).toEqual(["missing_billing_proof"]);
    expect(missing.supportedPaidPrincipal).toEqual(zero);
    const unpaid = derive({ ...raw, payment: null });
    expect(unpaid.billedThroughFinalAccountRevisionAndInvoice).toBe(true);
    expect(unpaid.customerPaymentSettledAndAllocatedToThatLine).toBe(false);
    expect(unpaid.supportedPaidPrincipal).toEqual(zero);
    expect(raw).toEqual(original);
    expect(Object.isFrozen(yes)).toBe(true);
  });
  it("SV6-07 only matched settled money can qualify", () => {
    const raw = fixture(), original = structuredClone(raw), yes = derive(raw);
    expect(yes.customerPaymentSettledAndAllocatedToThatLine).toBe(true);
    expect(yes.savedAllocationId).toBe(raw.payment.allocation.allocationId);
    expect(yes.supportedPaidPrincipal).toEqual(raw.payment.allocation.net);
    expect(yes.paymentReasons).toEqual([]);
    const fail = (changed: unknown, reason: string) => {
      const result = derive(changed);
      expect(result.billedThroughFinalAccountRevisionAndInvoice).toBe(true);
      expect(result.customerPaymentSettledAndAllocatedToThatLine, reason).toBe(false);
      expect(result.paymentReasons).toContain(reason);
      expect(result.savedAllocationId).toBeNull();
      expect(result.supportedPaidPrincipal).toEqual(zero);
    };
    for (const source of ["movement", "receipt", "match", "allocation"] as const) {
      for (const key of Object.keys(raw.payment[source]).filter(k => k.endsWith("Id"))) {
        // The movement/payment primary keys are linked from match/allocation rather than a target.
        // A saved allocation's own ID is an output reference, not a second authority claim.
        if (key === "allocationId") continue;
        const changed = fixture(); Object.assign(changed.payment[source], { [key]: id(99) });
        const result = derive(changed);
        expect(result.customerPaymentSettledAndAllocatedToThatLine, `${source}.${key}`).toBe(false);
        expect(result.supportedPaidPrincipal).toEqual(zero);
      }
    }
    for (const state of ["pending", "reversed", "possible_duplicate"]) {
      const changed = fixture(); changed.payment.movement.state = state; fail(changed, "movement.state");
    }
    const unidentified = fixture(); unidentified.payment.movement.identity = "unidentified"; fail(unidentified, "movement.identity");
    const held = fixture(); held.payment.movement.duplicateHeld = true; fail(held, "movement.duplicateHeld");
    const movementHash = fixture(); movementHash.payment.movement.sourceHash = "b".repeat(64); fail(movementHash, "allocation.movementHash");
    const allocationHash = fixture(); allocationHash.payment.allocation.movementHash = "b".repeat(64); fail(allocationHash, "allocation.movementHash");
    const amount = fixture(); amount.payment.movement.grossPence++; fail(amount, "receipt.amountPence");
    const receiptAmount = fixture(); receiptAmount.payment.receipt.amountPence++; fail(receiptAmount, "receipt.amountPence");
    const matchAmount = fixture(); matchAmount.payment.match.matchedPence++; fail(matchAmount, "match.matchedPence");
    const emptyMovement = fixture(); emptyMovement.payment.movement.grossPence = 0;
    emptyMovement.payment.receipt.amountPence = 0; emptyMovement.payment.match.matchedPence = 0; fail(emptyMovement, "movement.zero");
    const emptyAllocation = fixture(); emptyAllocation.payment.allocation.net.numerator = "0"; fail(emptyAllocation, "allocation.zero");
    for (const source of ["movement", "match", "allocation"] as const)
      fail({ ...raw, payment: { ...raw.payment, [source]: null } }, `missing_${source}_proof`);
    fail({ ...raw, payment: null }, "missing_payment_proof");
    // Manual mark-paid: customer receipt exists but has no movement, match or saved allocation.
    fail({ ...raw, payment: { ...raw.payment, movement: null, match: null, allocation: null } }, "missing_movement_proof");
    const unreduced = fixture(); unreduced.payment.allocation.net = { numerator: "4000000", denominator: "86" };
    expect(derive(unreduced).supportedPaidPrincipal).toEqual({ numerator: "4000000", denominator: "86" });
    expect(raw).toEqual(original);
    expect(Object.isFrozen(yes.supportedPaidPrincipal)).toBe(true);
  });
  it("rejects malformed snapshots and client/model authority without permissive defaults", () => {
    const raw = fixture();
    for (const value of [undefined, {}, { ...raw, version: "unknown.v0" }, { ...raw, environment: "production" }, { ...raw, productionEnabled: true },
      { ...raw, modelOutput: { paid: true, fee: 8000 } }, { ...raw, target: { ...target, tenantId: undefined } },
      { ...raw, target: { ...target, tenantId: "not-a-tenant" } }, { ...raw, billing: undefined }, { ...raw, payment: undefined }])
      expect(() => derive(value)).toThrow(AttributionBillingPaymentProofError);
    for (const net of [{ numerator: "-1", denominator: "1" }, { numerator: "1", denominator: "0" },
      { numerator: "01", denominator: "1" }, { numerator: "1", denominator: "01" },
      { numerator: "1.5", denominator: "1" }, { numerator: "1000000000001", denominator: "1" }]) {
      const changed = fixture(); changed.payment.allocation.net = net;
      expect(() => derive(changed)).toThrow(AttributionBillingPaymentProofError);
    }
    for (const value of [-1, 0.5, 1000000000001, Number.NaN, Number.POSITIVE_INFINITY]) {
      const changed = fixture(); changed.payment.movement.grossPence = value;
      expect(() => derive(changed)).toThrow(AttributionBillingPaymentProofError);
    }
    const invalidHash = fixture(); invalidHash.payment.movement.sourceHash = "not-a-hash";
    expect(() => derive(invalidHash)).toThrow(AttributionBillingPaymentProofError);
    expect(() => derive({ ...raw, billing: { ...raw.billing, holds: true } })).toThrow(AttributionBillingPaymentProofError);
    // Absent mandatory nested proof is invalid input, never an implicit successful proof.
    for (const source of ["commercial", "accountLine", "invoiceLine"] as const)
      expect(() => derive({ ...raw, billing: { ...raw.billing, [source]: undefined } })).toThrow(AttributionBillingPaymentProofError);
    const mixedCase = fixture(); mixedCase.target.workId = "ABCDEF00-0000-4000-8000-000000000001";
    expect(() => derive(mixedCase)).toThrow(AttributionBillingPaymentProofError);
  });
});

it("#356 saved allocation net cannot exceed the invoice line net, including rational fractions",()=>{
 const raw=fixture();raw.payment.allocation.net={numerator:"160001",denominator:"2"};
 expect(derive(raw).paymentReasons).toContain("allocation.exceeds_line_net");
 expect(derive(raw).supportedPaidPrincipal).toEqual({numerator:"0",denominator:"1"});
 raw.payment.allocation.net={numerator:"160000",denominator:"2"};
 expect(derive(raw).customerPaymentSettledAndAllocatedToThatLine).toBe(true);
});
