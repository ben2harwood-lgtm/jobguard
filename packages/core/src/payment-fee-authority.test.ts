import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "./money.js";
import {
  parsePaymentFeeApprovalIntent, paymentFeeApprovalIntentV1, paymentFeeBindingV1,
  paymentFeePreparationV1, paymentFeeRefusalV1, PaymentFeeBoundaryError,
} from "./payment-fee-authority.js";

const id = "a0000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
const reference = { statementId: id, statementRevision: 1, statementHash: hash, sourceHash: hash };
const intent = { version: "payment-fee-approval-intent.v1", action: "approve_exact_statement", commandId: id, ...reference };
const binding = {
  version: "payment-fee-binding.v1", action: "collect_payment_fee", ...reference,
  principal: { pence: 8_000, currency: "GBP" }, recipientRef: "platform:jobguard",
  policyVersion: "reference_fee_policy_v3",
};
const preparation = {
  version: "payment-fee-preparation.v1", environment: "synthetic_demo", productionEnabled: false,
  realExternalActions: 0, state: "dependency_bound", approval: null, standingAuthority: null,
};
const refusal = { version: "payment-fee-refusal.v1", code: "PAYMENT_FEE_DEPENDENCY_BOUND" };

describe("MON4A-S01 policy-independent boundary preparation (not an executable command union)", () => {
  it("validates exact immutable statement/source references without granting approval", () => {
    expect(parsePaymentFeeApprovalIntent(intent)).toEqual(intent);
    expect(paymentFeeBindingV1.parse(binding)).toEqual(binding);
    expect(paymentFeePreparationV1.parse(preparation)).toEqual(preparation);
    expect(paymentFeeRefusalV1.parse(refusal)).toEqual(refusal);
  });

  for (const field of ["tenantId", "actorId", "membershipId", "role", "settlementStatus", "verified", "feePence", "price", "vat", "environment", "mode", "approval", "authorizationId", "policyVersion", "principal", "recipientRef"]) {
    it(`rejects client-supplied ${field}`, () => {
      expect(() => parsePaymentFeeApprovalIntent({ ...intent, [field]: "forged" })).toThrow(PaymentFeeBoundaryError);
    });
  }
  for (const [field, values] of Object.entries({
    version: ["payment-fee-approval-intent.v2", 1, null],
    action: ["grant_standing_authority", "create_statement", "approve", "dispatch", "resolve_dispute"],
    commandId: ["not-uuid", id.toUpperCase(), null],
    statementId: ["not-uuid", id.toUpperCase(), null],
    statementRevision: [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null],
    statementHash: ["a".repeat(63), "A".repeat(64), "z".repeat(64), null],
    sourceHash: ["a".repeat(65), "A".repeat(64), "z".repeat(64), null],
  })) {
    it(`rejects malformed or unsupported ${field} and missing ${field}`, () => {
      for (const value of values) expect(paymentFeeApprovalIntentV1.safeParse({ ...intent, [field]: value }).success).toBe(false);
      const missing: Record<string, unknown> = { ...intent }; delete missing[field];
      expect(paymentFeeApprovalIntentV1.safeParse(missing).success).toBe(false);
    });
  }
  it("returns a stable typed validation error without leaking input details", () => {
    for (const input of [null, [], "secret-session-value", {}, { ...intent, commandId: "secret-session-value" }]) {
      try { parsePaymentFeeApprovalIntent(input); expect.fail("expected invalid intent"); }
      catch (error) {
        expect(error).toBeInstanceOf(PaymentFeeBoundaryError);
        expect(error).toMatchObject({ code: "INVALID_PAYMENT_FEE_BOUNDARY", message: "Invalid payment fee boundary" });
        expect(String(error)).not.toContain("secret-session-value");
      }
    }
  });
  it("keeps parsed intent and nested server binding immutable", () => {
    const parsed = parsePaymentFeeApprovalIntent(intent);
    expect(Object.isFrozen(parsed)).toBe(true);
    const parsedBinding = paymentFeeBindingV1.parse(binding);
    expect(Object.isFrozen(parsedBinding)).toBe(true);
    expect(Object.isFrozen(parsedBinding.principal)).toBe(true);
    expect(Object.isFrozen(paymentFeePreparationV1.parse(preparation))).toBe(true);
    expect(Object.isFrozen(paymentFeeRefusalV1.parse(refusal))).toBe(true);
  });
  it("uses the existing safe GBP money limit, with no floating-point fee derivation", () => {
    for (const pence of [0, MAX_MONEY_PENCE]) expect(paymentFeeBindingV1.safeParse({ ...binding, principal: { pence, currency: "GBP" } }).success).toBe(true);
    for (const pence of [-1, 0.1, NaN, Infinity, MAX_MONEY_PENCE + 1, Number.MAX_SAFE_INTEGER + 1, "8000"]) {
      expect(paymentFeeBindingV1.safeParse({ ...binding, principal: { pence, currency: "GBP" } }).success).toBe(false);
    }
    for (const currency of ["EUR", "gbp", null]) expect(paymentFeeBindingV1.safeParse({ ...binding, principal: { pence: 8000, currency } }).success).toBe(false);
    expect(paymentFeeBindingV1.safeParse({ ...binding, principal: { ...binding.principal, vat: 0 } }).success).toBe(false);
  });
  it("refuses unknown fields in every preparation envelope", () => {
    expect(paymentFeeBindingV1.safeParse({ ...binding, tenantId: id }).success).toBe(false);
    expect(paymentFeePreparationV1.safeParse({ ...preparation, feePence: 0 }).success).toBe(false);
    expect(paymentFeeRefusalV1.safeParse({ ...refusal, sql: "secret" }).success).toBe(false);
  });
  it("requires the exact server binding fields without supplying authority policy", () => {
    for (const field of Object.keys(binding)) {
      const missing: Record<string, unknown> = { ...binding }; delete missing[field];
      expect(paymentFeeBindingV1.safeParse(missing).success).toBe(false);
    }
    for (const value of ["", " ", "x".repeat(301)]) expect(paymentFeeBindingV1.safeParse({ ...binding, recipientRef: value }).success).toBe(false);
    for (const value of ["", " ", "x".repeat(81)]) expect(paymentFeeBindingV1.safeParse({ ...binding, policyVersion: value }).success).toBe(false);
    expect(paymentFeeBindingV1.safeParse({ ...binding, action: "send_quote" }).success).toBe(false);
    expect(paymentFeeBindingV1.safeParse({ ...binding, version: "payment-fee-binding.v2" }).success).toBe(false);
  });
  it("preparation never presents an approval, standing authority or live capability", () => {
    const attacks = {
      version: "payment-fee-preparation.v2", environment: "production_billing", productionEnabled: true,
      realExternalActions: 1, state: "approved", approval: { id }, standingAuthority: { id },
    };
    for (const [field, value] of Object.entries(attacks)) {
      expect(paymentFeePreparationV1.safeParse({ ...preparation, [field]: value }).success).toBe(false);
      const missing: Record<string, unknown> = { ...preparation }; delete missing[field];
      expect(paymentFeePreparationV1.safeParse(missing).success).toBe(false);
    }
  });
  it("refusals are versioned and cannot claim permission", () => {
    expect(paymentFeeRefusalV1.safeParse({ ...refusal, version: "payment-fee-refusal.v2" }).success).toBe(false);
    expect(paymentFeeRefusalV1.safeParse({ ...refusal, code: "PERMITTED" }).success).toBe(false);
    expect(paymentFeeRefusalV1.safeParse({ ...refusal, code: "INVALID_PAYMENT_FEE_BOUNDARY" }).success).toBe(true);
  });
});
