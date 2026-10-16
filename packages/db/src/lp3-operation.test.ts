import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { lp3CanonicalInput, lp3OperationV1Schema, lp3PayloadHash } from "./lp3-operation.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const actorMembershipId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";
const evidenceId = "55555555-5555-4555-8555-555555555555";
const otherId = "66666666-6666-4666-8666-666666666666";
const at = "2026-10-16T12:34:56.123Z";
const common = { version: "lp3-input.v1", tenantId, actorMembershipId, jobId };
const document = { documentId, documentVersion: 1, documentHash: "a".repeat(64), expectedJobRevision: 0 };
const activation = { ...common, operation: "job.switch_live", acceptedDocumentId: documentId,
  acceptedDocumentVersion: 1, acceptedDocumentHash: document.documentHash, expectedJobRevision: 0,
  acceptedNetValuePence: 100100, recoveryCapPence: 1502, mode: "pilot_no_charge",
  activationTermsVersion: "pilot_no_charge.v1", feePolicyVersion: "reference_fee_policy_v1",
  amountPence: null, currency: null, recipient: null, activatedAt: at };
const settlement = { ...common, operation: "synthetic.settlement", obligationId: documentId,
  providerEventId: "fictional-event-1", amountPence: 7900, currency: "GBP",
  policyVersion: "synthetic_demo_illustrative.v1", simulatedAt: at };
const acceptance = { ...common, ...document, operation: "quote.acceptance.attest", acceptedTotalPence: 120120,
  currency: "GBP", statedCustomerName: "Fictional 🧱 Café", statedMethod: "email", acceptedAt: at,
  evidenceId: null, policyVersion: "builder-attestation.v1" };
const disposition = { ...common, ...document, operation: "quote.superseded", kind: "superseded",
  occurredAt: at, amountPence: null, currency: null, recipient: null, policyVersion: "quote-disposition.v1" };
const samples = [activation, settlement, acceptance, disposition,
  { ...disposition, operation: "quote.declined", kind: "declined" },
  { ...disposition, operation: "quote.acceptance_cancelled", kind: "acceptance_cancelled" }];

describe("LP3-A01 exact input is strict and hashing is deterministic", () => {
  it.each(samples)("accepts the complete $operation envelope", input => {
    expect(lp3OperationV1Schema.parse(input)).toEqual(input);
    expect(lp3PayloadHash(input)).toMatch(/^[0-9a-f]{64}$/u);
    expect(lp3PayloadHash(Object.fromEntries(Object.entries(input).reverse()))).toBe(lp3PayloadHash(input));
  });

  const invalid: [string, unknown][] = [
    ["unknown field", { ...acceptance, approved: true }],
    ["unknown version", { ...acceptance, version: "lp3-input.v2" }],
    ["unknown operation", { ...acceptance, operation: "quote.send" }],
    ["malformed UUID", { ...acceptance, jobId: "invalid" }],
    ["noncanonical UUID", { ...acceptance, jobId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }],
    ["malformed hash", { ...acceptance, documentHash: "a".repeat(63) }],
    ["uppercase hash", { ...acceptance, documentHash: "A".repeat(64) }],
    ["missing explicit NULL", { ...acceptance, evidenceId: undefined }],
    ["non-null disposition money", { ...disposition, amountPence: 0, currency: "GBP" }],
    ["non-null disposition recipient", { ...disposition, recipient: "fictional@example.invalid" }],
    ["wrong disposition kind", { ...disposition, kind: "declined" }],
    ["negative pence", { ...acceptance, acceptedTotalPence: -1 }],
    ["fractional pence", { ...acceptance, acceptedTotalPence: 1.5 }],
    ["unsafe pence", { ...acceptance, acceptedTotalPence: Number.MAX_SAFE_INTEGER + 1 }],
    ["over-limit pence", { ...acceptance, acceptedTotalPence: 1_000_000_000_001 }],
    ["negative zero", { ...acceptance, acceptedTotalPence: -0 }],
    ["infinite pence", { ...acceptance, acceptedTotalPence: Infinity }],
    ["NaN pence", { ...acceptance, acceptedTotalPence: NaN }],
    ["string pence", { ...acceptance, acceptedTotalPence: "7900" }],
    ["wrong settlement amount", { ...settlement, amountPence: 7901 }],
    ["wrong settlement policy", { ...settlement, policyVersion: "reference_fee_policy_v3" }],
    ["wrong activation policy", { ...activation, feePolicyVersion: "reference_fee_policy_v3" }],
    ["wrong activation terms", { ...activation, activationTermsVersion: "synthetic_demo_illustrative.v1" }],
    ["pilot amount", { ...activation, amountPence: 7900, currency: "GBP" }],
    ["illustration without amount", { ...activation, mode: "synthetic_demo", activationTermsVersion: "synthetic_demo_illustrative.v1" }],
    ["invalid currency", { ...acceptance, currency: "EUR" }],
    ["negative revision", { ...acceptance, expectedJobRevision: -1 }],
    ["out-of-range PostgreSQL integer", { ...acceptance, documentVersion: 2147483648 }],
    ["zero document version", { ...acceptance, documentVersion: 0 }],
    ["invalid calendar date", { ...acceptance, acceptedAt: "2026-02-30T00:00:00.000Z" }],
    ["PostgreSQL year zero", { ...acceptance, acceptedAt: "0000-01-01T00:00:00.000Z" }],
    ["noncanonical offset", { ...acceptance, acceptedAt: "2026-10-16T13:34:56.123+01:00" }],
    ["lost timestamp precision", { ...acceptance, acceptedAt: "2026-10-16T12:34:56.123456Z" }],
    ["untyped Date", { ...acceptance, acceptedAt: new Date(at) }],
    ["blank customer", { ...acceptance, statedCustomerName: " " }],
    ["untrimmed customer", { ...acceptance, statedCustomerName: " Fictional" }],
    ["oversize customer", { ...acceptance, statedCustomerName: "x".repeat(161) }],
    ["invalid method", { ...acceptance, statedMethod: "authenticated_customer" }],
    ["empty provider event", { ...settlement, providerEventId: "" }],
    ["oversize provider event", { ...settlement, providerEventId: "x".repeat(201) }],
    ["NUL string", { ...settlement, providerEventId: "fictional\u0000event" }],
    ["unpaired surrogate", { ...acceptance, statedCustomerName: "fictional\ud800" }],
    ["generated identity in input", { ...activation, activationId: otherId }],
    ["caller digest", { ...acceptance, payloadHash: "b".repeat(64) }],
  ];
  it.each(invalid)("rejects %s", (_label, input) => {
    expect(lp3OperationV1Schema.safeParse(input).success).toBe(false);
    expect(() => lp3PayloadHash(input)).toThrow();
  });

  it("uses UTF-8 byte lengths, explicit NULLs and the documented field order", () => {
    const tokens = ["lp3-input.v1", "quote.acceptance.attest", tenantId, actorMembershipId, jobId,
      documentId, "1", "a".repeat(64), "0", "120120", "GBP", "Fictional 🧱 Café", "email", at, null,
      "builder-attestation.v1"];
    const expected = tokens.map(value => value === null ? "-1:" : `${Buffer.byteLength(value, "utf8")}:${value}`).join("");
    expect(expected).toContain("20:Fictional 🧱 Café");
    expect(lp3CanonicalInput(acceptance)).toBe(expected);
    expect(lp3PayloadHash(acceptance)).toBe(createHash("sha256").update(expected, "utf8").digest("hex"));
  });

  it("distinguishes embedded delimiters, empty values, NULL, and Unicode normalization", () => {
    const inputs = ["fictional:1:a", "fictional:1:a\n", "null", "-1:", "Café", "Cafe\u0301"];
    expect(new Set(inputs.map(providerEventId => lp3PayloadHash({ ...settlement, providerEventId }))).size).toBe(inputs.length);
    expect(lp3PayloadHash(acceptance)).not.toBe(lp3PayloadHash({ ...acceptance, evidenceId }));
  });

  it("binds every significant field for every operation", () => {
    const replacements: Record<string, unknown> = {
      tenantId: otherId, actorMembershipId: otherId, jobId: otherId, documentId: otherId,
      documentVersion: 2, documentHash: "b".repeat(64), expectedJobRevision: 1,
      acceptedDocumentId: otherId, acceptedDocumentVersion: 2, acceptedDocumentHash: "b".repeat(64),
      acceptedNetValuePence: 100101, recoveryCapPence: 1503, activatedAt: "2026-10-16T12:34:56.124Z",
      obligationId: otherId, providerEventId: "fictional-event-2", simulatedAt: "2026-10-16T12:34:56.124Z",
      acceptedTotalPence: 120121, statedCustomerName: "Another fictional customer", statedMethod: "verbal",
      acceptedAt: "2026-10-16T12:34:56.124Z", evidenceId, occurredAt: "2026-10-16T12:34:56.124Z",
    };
    for (const input of samples) for (const [field, value] of Object.entries(replacements)) {
      if (!(field in input)) continue;
      expect(lp3PayloadHash({ ...input, [field]: value }), `${input.operation}.${field}`).not.toBe(lp3PayloadHash(input));
    }
    expect(lp3PayloadHash({ ...activation, mode: "synthetic_demo", activationTermsVersion: "synthetic_demo_illustrative.v1",
      amountPence: 7900, currency: "GBP" })).not.toBe(lp3PayloadHash(activation));
    expect(new Set(samples.map(lp3PayloadHash)).size).toBe(samples.length);
  });

  it("accepts the money limit and keeps millisecond differences significant", () => {
    expect(lp3OperationV1Schema.safeParse({ ...acceptance, acceptedTotalPence: 1_000_000_000_000 }).success).toBe(true);
    expect(lp3PayloadHash({ ...acceptance, acceptedAt: "2026-10-16T12:34:56.124Z" })).not.toBe(lp3PayloadHash(acceptance));
  });
});
