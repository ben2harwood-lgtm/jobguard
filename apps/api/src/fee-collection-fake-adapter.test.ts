import { describe, expect, it } from "vitest";
import { createFeeCollectionFakeEventValidator, compareFeeCollectionFakeEvents, FeeCollectionFakeEventError } from "./fee-collection-fake-adapter.js";

const event = () => ({
  version: "fee-collection-adapter-event.v1", adapter: "fee_collection_fake.v1", environment: "synthetic_demo",
  tenantId: "11111111-1111-4111-8111-111111111111", jobId: "22222222-2222-4222-8222-222222222222",
  attemptId: "33333333-3333-4333-8333-333333333333", eventId: "44444444-4444-4444-8444-444444444444",
  effectKey: "fee-effect", kind: "accepted", action: "collection", principal: { pence: 28200, currency: "GBP" },
  target: "jobguard_synthetic_fee_account",
});
describe("fake-event validation only; no invocation, durable facts or reconciliation", () => {
  it.each([undefined, "", "production", "pilot_no_charge", "provider_sandbox", "synthetic_reference"])("refuses server mode %s", mode => {
    expect(() => createFeeCollectionFakeEventValidator(mode)).toThrow(FeeCollectionFakeEventError);
  });
  it("separates accepted and settled without creating or authenticating either", () => {
    const validator = createFeeCollectionFakeEventValidator("synthetic_demo");
    expect(validator.validate(event()).kind).toBe("accepted");
    for (const kind of ["pending", "outcome_unknown", "definite_failure", "settled"])
      expect(validator.validate({ ...event(), kind }).kind).toBe(kind);
    expect(validator.validate({ ...event(), action: "refund" }).action).toBe("refund");
    expect(Object.keys(validator)).toEqual(["validate"]);
  });
  it("rejects every forged/invalid field with a redacted typed error", () => {
    const validator = createFeeCollectionFakeEventValidator("synthetic_demo");
    for (const patch of [
      { version: "v2" }, { adapter: "fake_capture" }, { environment: "production" },
      { tenantId: "bad" }, { jobId: "bad" }, { attemptId: "bad" }, { eventId: "bad" },
      { effectKey: "" }, { effectKey: "a".repeat(201) }, { kind: "redirect" }, { action: "subscription" },
      { target: "real_account" }, { success: true }, { mode: "synthetic_demo" },
      { principal: { pence: 1, currency: "EUR" } }, { principal: { pence: 1, currency: "GBP", vat: 0 } },
      ...[0, -1, 0.5, NaN, Infinity, 1_000_000_000_001, Number.MAX_SAFE_INTEGER + 1].map(pence => ({ principal: { pence, currency: "GBP" } })),
    ]) expect(() => validator.validate({ ...event(), ...patch })).toThrow("INVALID_FEE_COLLECTION_FAKE_EVENT");
    expect(validator.validate({ ...event(), principal: { pence: 1_000_000_000_000, currency: "GBP" } }).principal.pence).toBe(1_000_000_000_000);
  });
  it("classifies replay/conflict without storing or applying a fact", () => {
    expect(compareFeeCollectionFakeEvents(event(), event())).toBe("same_event");
    const newId = "55555555-5555-4555-8555-555555555555";
    expect(compareFeeCollectionFakeEvents(event(), { ...event(), eventId: newId })).toBe("same_fact");
    expect(compareFeeCollectionFakeEvents(event(), { ...event(), eventId: newId, kind: "settled" })).toBe("distinct");
    for (const patch of [{ kind: "settled" }, { effectKey: "other" }, { action: "refund" },
      { tenantId: newId }, { jobId: newId }, { attemptId: newId }, { principal: { pence: 1, currency: "GBP" } }])
      expect(() => compareFeeCollectionFakeEvents(event(), { ...event(), ...patch })).toThrow(FeeCollectionFakeEventError);
    for (const patch of [{ jobId: newId }, { attemptId: newId }, { action: "refund" }, { principal: { pence: 1, currency: "GBP" } }])
      expect(() => compareFeeCollectionFakeEvents(event(), { ...event(), eventId: newId, ...patch })).toThrow(FeeCollectionFakeEventError);
    expect(compareFeeCollectionFakeEvents(event(), { ...event(), eventId: newId, effectKey: "other" })).toBe("distinct");
    expect(compareFeeCollectionFakeEvents(event(), { ...event(), eventId: newId, tenantId: newId })).toBe("distinct");
    expect(() => compareFeeCollectionFakeEvents({}, event())).toThrow(FeeCollectionFakeEventError);
    expect(() => compareFeeCollectionFakeEvents(event(), {})).toThrow(FeeCollectionFakeEventError);
  });
  it("returns a copied, frozen object and has zero external ports", () => {
    const raw = event(); const validator = createFeeCollectionFakeEventValidator("synthetic_demo");
    const result = validator.validate(raw); raw.principal.pence = 1;
    expect(result.principal.pence).toBe(28200);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.principal)).toBe(true);
    expect(Object.isFrozen(validator)).toBe(true);
  });
});
