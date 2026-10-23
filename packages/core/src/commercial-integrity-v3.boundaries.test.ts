import { expect, it } from "vitest";
import { canonicalCommercialIntegritySnapshot, commercialIntegrityFamilyV1Schema, commercialIntegrityReviewV3Schema, commercialIntegrityV3InputSchema, commercialIntegrityV3ResultSchema, evaluateCommercialIntegrityV3 } from "./commercial-integrity-v3.js";
const tenantId = "10000000-0000-4000-8000-000000000001", jobId = "20000000-0000-4000-8000-000000000001", otherJob = "20000000-0000-4000-8000-000000000002";
const start = "2026-01-01T00:00:00.000000Z", end = "2026-04-01T00:00:00.000000Z";
const source = (sourceId: string, job = jobId) => ({ tenantId, jobId: job, scopeId: "owned-practice-session", sourceId, sourceType: "synthetic_fixture", revision: "1", hash: "a".repeat(64), recordedAt: start, provenance: "builder_attested" });
const amount = (pence: number) => ({ pence, currency: "GBP", basis: "net" });
function fixture() { return { version: "commercial-integrity-input.v3", environment: "synthetic_demo", tenantId, jobId, scopeId: "owned-practice-session", evaluatedAt: "2026-04-02T00:00:00.000000Z", profile: { version: "synthetic_fixture.v3", ruleVersion: "fixture-rules.1", window: { start, end } }, phase: "pre_lock", ordinaryFacts: { lockState: "absent", quotes: [], activations: [], activity: [], workEvents: [], assertions: [] } }; }
function postFixture() { return { ...fixture(), phase: "post_lock", ordinaryFacts: { ...fixture().ordinaryFacts, lockState: "present" }, published: { lockId: "30000000-0000-4000-8000-000000000001", contractVersion: "synthetic-published-fixture.1", cutoff: end, lockSource: source("lock"), lockedAccount: amount(100), catches: [], completions: [], receipts: [], corrections: [], allocations: [] } }; }

const withFinding = () => {
 const base = fixture();
 return { ...base, ordinaryFacts: { ...base.ordinaryFacts, activity: [{ source: source("invoice"), activityKind: "invoice" }] } };
};
it("CI-C01 strict external schemas refuse actor/tenant overrides and unapproved modes", () => {
 const input = withFinding();
 for (const patch of [{ actorId: "forged" }, { environment: "production_billing" }, { evaluatedAt: "2026-02-30T00:00:00.000000Z" }, { evaluatedAt: "2026-01-01T00:00:00.0000001Z" }, { tenantId: "forged" }, { unexpected: true }, { published: postFixture().published }]) expect(commercialIntegrityV3InputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
 for (const patch of [{ tenantId: "10000000-0000-4000-8000-000000000002" }, { jobId: otherJob }, { scopeId: "another-session" }]) expect(commercialIntegrityV3InputSchema.safeParse({ ...input, ordinaryFacts: { ...input.ordinaryFacts, activity: [{ source: { ...source("invoice"), ...patch }, activityKind: "invoice" }] } }).success).toBe(false);
 const review = { version: "commercial-integrity-review.v3", commandId: jobId, findingKey: "stable-key", findingSnapshotHash: "a".repeat(64), outcome: "dismissed_false_positive", explanation: "  Innocent shared company account  " };
 expect(commercialIntegrityReviewV3Schema.parse(review).explanation).toBe("Innocent shared company account");
 for (const patch of [{ actor: "forged" }, { tenantId }, { evaluatedAt: start }, { profile: {} }, { outcome: "approved" }, { explanation: " " }, { explanation: "x".repeat(501) }, { findingSnapshotHash: "forged" }]) expect(commercialIntegrityReviewV3Schema.safeParse({ ...review, ...patch }).success).toBe(false);
 expect(commercialIntegrityFamilyV1Schema.safeParse({ version: "commercial-integrity-family.v1", environment: "synthetic_demo", jobId, family: "v3", realExternalActions: 0, acceptedCapPence: 1 }).success).toBe(false);
});
it("CI-C01 unsafe pence, unsupported currency and conflicting duplicate identities fail closed", () => {
 for (const value of [amount(1000000000001), amount(Number.MAX_SAFE_INTEGER + 1), amount(0.5), { ...amount(1), currency: "EUR" }]) expect(commercialIntegrityV3InputSchema.safeParse({ ...postFixture(), published: { ...postFixture().published, lockedAccount: value } }).success).toBe(false);
 const input = withFinding(), first = input.ordinaryFacts.activity[0]!;
 expect(() => evaluateCommercialIntegrityV3({ ...input, ordinaryFacts: { ...input.ordinaryFacts, activity: [first, { ...first, source: { ...first.source, revision: "changed" } }] } })).toThrow("INVALID_COMMERCIAL_INTEGRITY_V3_INPUT");
});
it("CI-C03 stable keys, canonical values and replay dedup survive ordering and unrelated findings", () => {
 const input = withFinding(), first = input.ordinaryFacts.activity[0]!;
 const original = evaluateCommercialIntegrityV3(input).findings[0]!;
 const replay = evaluateCommercialIntegrityV3({ ...input, ordinaryFacts: { ...input.ordinaryFacts, activity: [first, first] } }).findings[0]!;
 expect(replay).toEqual(original);
 const more = evaluateCommercialIntegrityV3({ ...input, ordinaryFacts: { ...input.ordinaryFacts, activity: [first, { ...first, source: source("second") }] } }).findings;
 expect(more.find(f => f.key === original.key)).toEqual(original);
 const a = { ...postFixture(), published: { ...postFixture().published, receipts: [{ source: source("r1"), value: amount(101), reversed: false }, { source: source("r2"), value: amount(2), reversed: false }] } };
 const snapshot = evaluateCommercialIntegrityV3(a).findings[0]!.sourceSnapshot;
 const reversed = evaluateCommercialIntegrityV3({ ...a, published: { ...a.published, receipts: [...a.published.receipts].reverse() } }).findings[0]!.sourceSnapshot;
 expect(canonicalCommercialIntegritySnapshot(snapshot)).toBe(canonicalCommercialIntegritySnapshot(reversed));
});
it("CI-C04 evaluator never mutates frozen inputs; result has advisory-only fixed schema", () => {
 const input = withFinding(), before = JSON.stringify(input);
 const deepFreeze = (value: object) => { for (const v of Object.values(value)) if (v && typeof v === "object") deepFreeze(v); Object.freeze(value); };
 deepFreeze(input);
 const result = evaluateCommercialIntegrityV3(input);
 expect(JSON.stringify(input)).toBe(before);
 expect(Object.isFrozen(result.findings[0]!.sourceSnapshot)).toBe(true);
 expect(result.advisory).toBe(true);
 for (const forbidden of ["feePence", "eligibility", "meterDays", "accountStatus", "penalty", "acceptedCapPence"]) expect(commercialIntegrityV3ResultSchema.safeParse({ ...result, [forbidden]: 1 }).success).toBe(false);
});
it("CI-C06 absent policies and ordinary sources are explicit, never fabricated", () => {
 const input = fixture(), profile = { version: "synthetic_fixture.absent", ruleVersion: "held", window: { start, end } };
 const result = evaluateCommercialIntegrityV3({ ...input, profile });
 expect(result.findings).toHaveLength(0);
 expect(result.unavailable.filter(x => x.reason === "policy_absent").map(x => x.kind).sort()).toEqual(["explicit_allocations_avoid_catch_lines", "won_never_switched_live", "related_sub2000_quotes_90_days", "repeated_finish_restart"].sort());
 expect(result.unavailable).toContainEqual({ kind: "account_identifier_reuse", reason: "source_absent" });
});
it("CI-C07 source snapshots bind revisions/hashes/amount/profile/anchor but exclude read time", () => {
 const input = withFinding(), initial = evaluateCommercialIntegrityV3(input).findings[0]!;
 const canonical = canonicalCommercialIntegritySnapshot(initial.sourceSnapshot);
 const later = evaluateCommercialIntegrityV3({ ...input, evaluatedAt: "2026-05-01T00:00:00.000000Z" }).findings[0]!;
 expect(canonicalCommercialIntegritySnapshot(later.sourceSnapshot)).toBe(canonical);
 for (const patch of [{ revision: "2" }, { hash: "b".repeat(64) }]) {
  const next = evaluateCommercialIntegrityV3({ ...input, ordinaryFacts: { ...input.ordinaryFacts, activity: [{ source: { ...source("invoice"), ...patch }, activityKind: "invoice" }] } }).findings[0]!;
  expect(next.key).toBe(initial.key);
  expect(canonicalCommercialIntegritySnapshot(next.sourceSnapshot)).not.toBe(canonical);
 }
 const profileChanged = evaluateCommercialIntegrityV3({ ...input, profile: { ...input.profile, version: "synthetic_fixture.changed" } }).findings[0]!;
 expect(canonicalCommercialIntegritySnapshot(profileChanged.sourceSnapshot)).not.toBe(canonical);
 const windowChanged = evaluateCommercialIntegrityV3({ ...input, profile: { ...input.profile, window: { start, end: "2026-04-02T00:00:00.000000Z" } } }).findings[0]!;
 expect(windowChanged.key).not.toBe(initial.key);
 const base = postFixture(), paid = { ...base, published: { ...base.published, receipts: [{ source: source("r"), value: amount(101), reversed: false }] } };
 const fingerprint = (value: unknown) => canonicalCommercialIntegritySnapshot(evaluateCommercialIntegrityV3(value).findings[0]!.sourceSnapshot);
 expect(fingerprint(paid)).not.toBe(fingerprint({ ...paid, published: { ...paid.published, receipts: [{ ...paid.published.receipts[0], value: amount(102) }] } }));
 expect(fingerprint(paid)).not.toBe(fingerprint({ ...paid, published: { ...paid.published, contractVersion: "changed" } }));
});
it("CI-C02 quote scope rejects foreign tenant/session and post-lock input is structurally impossible pre-lock", () => {
 const input = fixture(), quote = { source: source("q", otherJob), status: "accepted", customerId: "customer", siteId: "flat", bindingConfirmed: true, value: amount(1), acceptedAt: start };
 for (const patch of [{ tenantId: "10000000-0000-4000-8000-000000000002" }, { scopeId: "other-session" }]) expect(commercialIntegrityV3InputSchema.safeParse({ ...input, ordinaryFacts: { ...input.ordinaryFacts, quotes: [{ ...quote, source: { ...quote.source, ...patch } }] } }).success).toBe(false);
 for (const hidden of ["catches", "shadowSignals", "hiddenCount", "completions"]) expect(commercialIntegrityV3InputSchema.safeParse({ ...input, ordinaryFacts: { ...input.ordinaryFacts, [hidden]: [] } }).success).toBe(false);
});
it("CI-C03 unrelated published catches do not alter receipt finding identity or snapshot", () => {
 const base = postFixture();
 const raw = { ...base, published: { ...base.published, receipts: [{ source: source("r"), value: amount(101), reversed: false }] } };
 const first = evaluateCommercialIntegrityV3(raw).findings[0]!;
 const extra = { source: source("unrelated"), catchId: "u", status: "dismissed_other", includedInLockedAccount: false, value: amount(20), invoiceLineId: null };
 const second = evaluateCommercialIntegrityV3({ ...raw, published: { ...raw.published, catches: [extra] } }).findings[0]!;
 expect(second.key).toBe(first.key);
 expect(canonicalCommercialIntegritySnapshot(second.sourceSnapshot)).toBe(canonicalCommercialIntegritySnapshot(first.sourceSnapshot));
});
