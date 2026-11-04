import { describe, expect, it } from "vitest";
import { feeCollectionReferenceV1, projectFeeCollectionReference, refundableFeeCollectionReference,
  checkFeeCollectionTransition, compareFeeCollectionIdentity, FeeCollectionError } from "./fee-collection.js";
import { MAX_MONEY_PENCE } from "./money.js";

const amount = (pence: number) => ({ pence, currency: "GBP" });
const attempt = (id = "collection", state = "settled", pence = 28200, originalCollectionId: string | null = null) =>
  ({ id, effectKey: `effect-${id}`, kind: originalCollectionId === null ? "collection" : "refund", state, principal: amount(pence), originalCollectionId });
const reference = (current = 28200, attempts: unknown[] = []) =>
  ({ version: "fee-collection-reference.v1", environment: "synthetic_demo", currentFeePrincipal: amount(current), attempts });
const project = (current = 28200, attempts: unknown[] = []) => projectFeeCollectionReference(reference(current, attempts));

describe("fee collection independent reference arithmetic (no authority or persisted facts)", () => {
  it("represents the 282/250/32 example without deriving a fee or executing compensation", () => {
    expect(project().outstandingPrincipal.pence).toBe(28200);
    const collected = project(28200, [attempt()]);
    expect(collected.settledPrincipal.pence).toBe(28200);
    expect(collected.outstandingPrincipal.pence).toBe(0);
    expect(project(3200, [attempt()]).refundDue.pence).toBe(25000);
    const refunded = project(3200, [attempt(), attempt("refund", "settled", 25000, "collection")]);
    expect(refunded.refundedPrincipal.pence).toBe(25000);
    expect(refunded.retainedPrincipal.pence).toBe(3200);
    expect(refunded.refundDue.pence).toBe(0);
    expect(refunded.version).toBe("fee-collection-reference-projection.v1");
    expect(refunded.environment).toBe("synthetic_demo");
  });
  it.each(["pending", "accepted", "outcome_unknown"])("%s keeps its reservation and contributes no settled principal", state => {
    const p = project(28200, [attempt("collection", state)]);
    expect(p.settledPrincipal.pence).toBe(0);
    expect(p.collectionReservedPrincipal.pence).toBe(28200);
    expect(p.collectionCapacity.pence).toBe(0);
    expect(p.unknownOutcome).toBe(state === "outcome_unknown");
  });
  it("unknown blocks replacement even when the held amount is smaller than outstanding", () => {
    expect(project(28200, [attempt("collection", "outcome_unknown", 1)]).collectionCapacity.pence).toBe(0);
  });
  it("definite failure releases capacity; accepted never does", () => {
    expect(project(28200, [attempt("collection", "definite_failure")]).collectionCapacity.pence).toBe(28200);
    expect(project(28200, [attempt("collection", "accepted", 100)]).collectionCapacity.pence).toBe(28100);
  });
  it("pending refund reserves without reducing retained principal; bounded by original and family", () => {
    const raw = reference(3200, [attempt(), attempt("refund", "pending", 10000, "collection")]);
    const p = projectFeeCollectionReference(raw);
    expect(p.refundReservedPrincipal.pence).toBe(10000);
    expect(p.retainedPrincipal.pence).toBe(28200);
    expect(p.refundedPrincipal.pence).toBe(0);
    expect(refundableFeeCollectionReference(raw, "collection").pence).toBe(15000);
    expect(refundableFeeCollectionReference(reference(0, [attempt("a", "settled", 100), attempt("b", "settled", 200)]), "a").pence).toBe(100);
    expect(refundableFeeCollectionReference(reference(0, [attempt("a", "settled", 100), attempt("b", "settled", 100), attempt("r", "settled", 50, "a")]), "a").pence).toBe(50);
    expect(refundableFeeCollectionReference(reference(0, [attempt(), attempt("r", "settled", 25000, "collection")]), "collection").pence).toBe(3200);
  });
  it("unknown refund prevents replacement payout and collection", () => {
    const raw = reference(3200, [attempt(), attempt("r", "outcome_unknown", 1, "collection")]);
    expect(refundableFeeCollectionReference(raw, "collection").pence).toBe(0);
    expect(projectFeeCollectionReference(raw).collectionCapacity.pence).toBe(0);
  });
  it("ignores failed refund amounts while preserving settled originals", () => {
    const raw = reference(0, [attempt(), attempt("r", "definite_failure", 28201, "collection")]);
    expect(refundableFeeCollectionReference(raw, "collection").pence).toBe(28200);
    expect(projectFeeCollectionReference(raw).refundReservedPrincipal.pence).toBe(0);
  });
  it("clamps capacity at zero after a supplied correction reduces B below existing reservations", () => {
    expect(project(0, [attempt("c", "pending")]).collectionCapacity.pence).toBe(0);
    expect(refundableFeeCollectionReference(reference(28200, [attempt(), attempt("r", "pending", 100, "collection")]), "collection").pence).toBe(0);
  });
  it.each(["pending", "accepted", "outcome_unknown", "definite_failure"])("refuses refund against a %s collection", state => {
    expect(() => project(0, [attempt("c", state), attempt("r", "pending", 1, "c")])).toThrow(FeeCollectionError);
  });
  it("refuses missing originals, refunds of refunds, over-refunds and duplicate identities/effects", () => {
    for (const attempts of [
      [attempt("r", "pending", 1, "absent")],
      [attempt(), attempt("r", "settled", 1, "collection"), attempt("r2", "pending", 1, "r")],
      [attempt(), attempt("r", "settled", 28201, "collection")],
      [attempt(), attempt("r", "pending", 28201, "collection")],
      [attempt(), attempt()],
      [attempt(), { ...attempt(), effectKey: "other" }],
      [attempt(), { ...attempt("other"), effectKey: "effect-collection" }],
    ]) expect(() => project(0, attempts)).toThrow(FeeCollectionError);
    expect(() => refundableFeeCollectionReference(reference(), "missing")).toThrow(FeeCollectionError);
    expect(() => refundableFeeCollectionReference(reference(0, [attempt("c", "pending")]), "c")).toThrow(FeeCollectionError);
    expect(() => refundableFeeCollectionReference(reference(0, [attempt(), attempt("r", "settled", 1, "collection")]), "r")).toThrow(FeeCollectionError);
    expect(() => project(0, [attempt(), attempt()])).toThrow("FEE_COLLECTION_IDENTITY_CONFLICT");
  });
  it("rejects aggregate overflow using checked bigint intermediates", () => {
    expect(() => project(0, [attempt("a", "settled", MAX_MONEY_PENCE), attempt("b", "settled", 1)])).toThrow(FeeCollectionError);
    expect(() => project(0, [attempt("a", "pending", MAX_MONEY_PENCE), attempt("b", "pending", 1)])).toThrow(FeeCollectionError);
    expect(project(MAX_MONEY_PENCE).outstandingPrincipal.pence).toBe(MAX_MONEY_PENCE);
    expect(project(0).refundDue.pence).toBe(0);
  });
  it("conserves integer balances over a range of supplied facts", () => {
    for (let c = 1; c <= 60; c++) for (let r = 0; r <= c; r++) {
      const p = project(17, [attempt("c", "settled", c), ...(r ? [attempt("r", "settled", r, "c")] : [])]);
      expect(p.retainedPrincipal.pence).toBe(c - r);
      expect(p.outstandingPrincipal.pence).toBe(Math.max(0, 17 - c + r));
      expect(p.refundDue.pence).toBe(Math.max(0, c - r - 17));
    }
  });
  it("copies inputs and returns frozen money/projection without mutating source", () => {
    const raw = reference(0, [attempt()]); const before = JSON.stringify(raw);
    const p = projectFeeCollectionReference(raw);
    expect(Object.isFrozen(p)).toBe(true); expect(Object.isFrozen(p.settledPrincipal)).toBe(true);
    expect(JSON.stringify(raw)).toBe(before);
  });
});

describe("strict reference schema and typed boundary", () => {
  it("uses redacted typed failures", () => {
    expect(() => projectFeeCollectionReference({})).toThrow("INVALID_FEE_COLLECTION_REFERENCE");
    expect(() => checkFeeCollectionTransition("settled", "pending")).toThrow("INVALID_FEE_COLLECTION_TRANSITION");
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, MAX_MONEY_PENCE + 1])("refuses invalid current pence %s", pence => {
    expect(feeCollectionReferenceV1.safeParse(reference(pence)).success).toBe(false);
    expect(() => project(pence)).toThrow(FeeCollectionError);
  });
  it("refuses forged success, settlement, mode, tenant, tax and authority fields", () => {
    for (const field of ["success", "settled", "tenantId", "actor", "mode", "authority", "vat", "subscriptionOffset"])
      expect(feeCollectionReferenceV1.safeParse({ ...reference(), [field]: true }).success).toBe(false);
    for (const raw of [null, {}, { ...reference(), version: "v2" }, { ...reference(), environment: "production" },
      { ...reference(), currentFeePrincipal: { pence: 1, currency: "EUR" } },
      { ...reference(), currentFeePrincipal: { ...amount(1), extra: true } },
      reference(1, [{ ...attempt(), extra: true }]), reference(1, [attempt("", "settled")]),
      reference(1, [{ ...attempt(), effectKey: "" }]), reference(1, [attempt("x".repeat(201))]),
      reference(1, [{ ...attempt(), effectKey: "x".repeat(201) }]),
      reference(1, [attempt("c", "redirect")]), reference(1, [attempt("c", "settled", 0)]),
      reference(1, [attempt("c"), { ...attempt("s", "pending", 1, "c"), kind: "subscription" }]), reference(1, [{ ...attempt(), kind: "subscription" }]), reference(1, [{ ...attempt(), kind: "refund" }]), reference(1, [{ ...attempt(), originalCollectionId: "c" }]),
      reference(1, [attempt("r", "pending", 1, "")]), reference(1, [attempt("r", "pending", 1, "x".repeat(201))]),
      reference(1, Array.from({ length: 10001 }, (_, i) => attempt(String(i)))),
    ]) expect(() => projectFeeCollectionReference(raw)).toThrow(FeeCollectionError);
  });
});

describe("rule-independent transition and identity checks", () => {
  const states = ["pending", "accepted", "outcome_unknown", "definite_failure", "settled"];
  it("allows only the explicit transition matrix (no redirect, timeout or terminal regression)", () => {
    const allowed: Record<string, string[]> = {
      pending: ["pending", "accepted", "outcome_unknown", "definite_failure", "settled"],
      accepted: ["accepted", "outcome_unknown", "definite_failure", "settled"],
      outcome_unknown: ["outcome_unknown", "definite_failure", "settled"],
      definite_failure: ["definite_failure"], settled: ["settled"],
    };
    for (const from of states) for (const to of states) {
      if (allowed[from]!.includes(to)) expect(checkFeeCollectionTransition(from, to)).toBe(to);
      else expect(() => checkFeeCollectionTransition(from, to)).toThrow(FeeCollectionError);
    }
    expect(() => checkFeeCollectionTransition("redirect", "settled")).toThrow(FeeCollectionError);
    expect(() => checkFeeCollectionTransition("pending", "timeout")).toThrow(FeeCollectionError);
  });
  const identity = { version: "fee-collection-identity.v1", tenantId: "11111111-1111-4111-8111-111111111111", jobId: "22222222-2222-4222-8222-222222222222", actorId: "33333333-3333-4333-8333-333333333333", commandId: "44444444-4444-4444-8444-444444444444", payloadHash: "a".repeat(64) };
  it("compares the full identity; does not fetch or authorize a replay", () => {
    expect(compareFeeCollectionIdentity(identity, { ...identity })).toBe("same");
    for (const field of ["tenantId", "jobId", "actorId", "commandId"])
      expect(compareFeeCollectionIdentity(identity, { ...identity, [field]: "55555555-5555-4555-8555-555555555555" })).toBe("conflict");
    expect(compareFeeCollectionIdentity(identity, { ...identity, payloadHash: "b".repeat(64) })).toBe("conflict");
    for (const field of ["tenantId", "jobId", "actorId", "commandId"])
      expect(() => compareFeeCollectionIdentity(identity, { ...identity, [field]: "bad" })).toThrow(FeeCollectionError);
    expect(() => compareFeeCollectionIdentity({}, identity)).toThrow(FeeCollectionError);
    for (const patch of [{ version: "v2" }, { tenantId: "bad" }, { payloadHash: "bad" }, { extra: true }])
      expect(() => compareFeeCollectionIdentity(identity, { ...identity, ...patch })).toThrow(FeeCollectionError);
  });
});
