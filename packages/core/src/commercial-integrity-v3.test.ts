import { describe, expect, it } from "vitest";
import { evaluateCommercialIntegrityV3 } from "./commercial-integrity-v3.js";

export const tenantId = "10000000-0000-4000-8000-000000000001";
export const jobId = "20000000-0000-4000-8000-000000000001";
export const otherJob = "20000000-0000-4000-8000-000000000002";
export const start = "2026-01-01T00:00:00.000000Z", end = "2026-04-01T00:00:00.000000Z";
export const source = (id: string, job = jobId) => ({ tenantId, jobId: job, scopeId: "owned-practice-session", sourceId: id, sourceType: "synthetic_fixture", revision: "1", hash: "a".repeat(64), recordedAt: start, provenance: "builder_attested" });
export const amount = (pence: number) => ({ pence, currency: "GBP", basis: "net" });
export function fixture() {
 return { version: "commercial-integrity-input.v3", environment: "synthetic_demo", tenantId, jobId, scopeId: "owned-practice-session", evaluatedAt: "2026-04-02T00:00:00.000000Z", profile: { version: "synthetic_fixture.v3", ruleVersion: "fixture-rules.1", window: { start, end }, allocation: { minimumPayments: 2 }, won: { delayMicroseconds: "604800000000" }, quote: { basis: "net", endpoint: "inclusive", windowDays: 90 }, restart: { minimumCycles: 2 } }, phase: "pre_lock", ordinaryFacts: { lockState: "absent", quotes: [], activations: [], activity: [], workEvents: [], assertions: [] } };
}
export const evaluate = (value: unknown) => evaluateCommercialIntegrityV3(value);
export function postFixture() {
 return { ...fixture(), phase: "post_lock", ordinaryFacts: { ...fixture().ordinaryFacts, lockState: "present" }, published: { lockId: "30000000-0000-4000-8000-000000000001", contractVersion: "synthetic-published-fixture.1", cutoff: end, lockSource: { ...source("30000000-0000-4000-8000-000000000001"), recordedAt: end, provenance: "server_recorded" }, lockedAccount: amount(100), catches: [], completions: [], receipts: [], corrections: [], allocations: [] } };
}
const quote = (id: string, job = jobId, pence = 199999, at = start) => ({ source: source(id, job), status: "accepted", customerId: "customer", siteId: "flat-1", bindingConfirmed: true, value: amount(pence), acceptedAt: at });

describe("CH6-C nine advisory families", () => {
 it("CI-F01 requires published not-completed dismissal and verified matching original proof", () => {
  const input = postFixture();
  const raw = { ...input, published: { ...input.published, catches: [{ source: source("catch"), catchId: "c", status: "dismissed_not_completed", includedInLockedAccount: false, value: amount(10), invoiceLineId: "line" }], completions: [{ source: { ...source("proof"), provenance: "server_recorded" }, catchId: "c", state: "verified", original: true, objectVersionId: "immutable-version", byteLength: 10 }] } };
  expect(evaluate(raw).findings.map(f => f.kind)).toContain("dismissed_not_completed_with_completion_evidence");
  for (const proof of [{ ...raw.published.completions[0], catchId: "unrelated" }, { ...raw.published.completions[0], state: "pending" }, { ...raw.published.completions[0], original: false }, { ...raw.published.completions[0], state: "invalidated" }, { ...raw.published.completions[0], source: source("proof") }]) expect(evaluate({ ...raw, published: { ...raw.published, completions: [proof] } }).findings).toHaveLength(0);
 });
 it("CI-F02 exact one penny, duplicate deposit, reversals, additional confirmed catches and basis", () => {
  const base = postFixture(), receipt = { source: source("deposit"), value: amount(101), reversed: false };
  const run = (receipts: unknown[], catches: unknown[] = []) => evaluate({ ...base, published: { ...base.published, receipts, catches } });
  expect(run([receipt, receipt]).findings).toHaveLength(1);
  expect(run([{ ...receipt, value: amount(100) }]).findings).toHaveLength(0);
  expect(run([{ ...receipt, reversed: true }]).findings).toHaveLength(0);
  expect(run([receipt], [{ source: source("c"), catchId: "c", status: "confirmed", includedInLockedAccount: false, value: amount(1), invoiceLineId: "line" }]).findings).toHaveLength(0);
  expect(run([receipt], [{ source: source("included"), catchId: "c", status: "confirmed", includedInLockedAccount: true, value: amount(100), invoiceLineId: "line" }]).findings).toHaveLength(1);
  const credited = evaluate({ ...base, published: { ...base.published, receipts: [receipt], corrections: [{ source: source("credit"), correctionKind: "credit", invoiceLineId: null, value: amount(1), actual: true }] } });
  expect(credited.findings).toHaveLength(0);
  expect(credited.unavailable).toContainEqual({ kind: "receipts_exceed_locked_account_and_confirmed_catches", reason: "credit_basis_unavailable" });
  expect(run([{ ...receipt, value: { ...amount(101), basis: "gross" } }]).unavailable.some(x => x.reason === "basis_unavailable")).toBe(true);
 });
 it("CI-F02 duplicate deposit cannot cross the locked-account threshold", () => {
  const base = postFixture(), deposit = { source: source("deposit"), value: amount(60), reversed: false };
  const run = (receipts: unknown[]) => evaluate({ ...base, published: { ...base.published, receipts } }).findings.filter(f => f.kind === "receipts_exceed_locked_account_and_confirmed_catches");
  // 60p is below the 100p account; only counting its replay twice would exceed it.
  expect(run([deposit])).toHaveLength(0);
  expect(run([deposit, structuredClone(deposit)])).toHaveLength(0);
  // A distinct receipt of the same amount really does cross the threshold.
  expect(run([deposit, { ...deposit, source: source("second-deposit") }])).toHaveLength(1);
 });
 it("CI-F03 requires actual mapped catch-line correction", () => {
  const base = postFixture(), c = { source: source("c"), catchId: "c", status: "confirmed", includedInLockedAccount: true, value: amount(10), invoiceLineId: "line" };
  for (const correctionKind of ["credit", "writeoff"]) {
   const correction = { source: source(correctionKind), correctionKind, invoiceLineId: "line", value: amount(1), actual: true };
   const run = (patch: object) => evaluate({ ...base, published: { ...base.published, catches: [c], corrections: [{ ...correction, ...patch }] } });
   expect(run({}).findings).toHaveLength(1);
   expect(run({ invoiceLineId: "baseline" }).findings).toHaveLength(0);
   expect(run({ invoiceLineId: null }).unavailable.some(x => x.reason === "line_source_absent")).toBe(true);
   expect(run({ actual: false }).findings).toHaveLength(0);
  }
 });
 it("CI-F04 distinguishes explicit repeated avoidance from proportional, reversed or partial payment", () => {
  const base = postFixture(), c = { source: source("c"), catchId: "c", status: "confirmed", includedInLockedAccount: true, value: amount(10), invoiceLineId: "line" };
  const a = (id: string) => ({ source: source(id), receiptId: id, method: "explicit_user", reversed: false, catchOutstanding: amount(10), catchAllocated: amount(0), ordinaryAllocated: amount(5), catchLineIds: ["line"] });
  const run = (allocations: unknown[]) => evaluate({ ...base, published: { ...base.published, catches: [c], receipts: ["a", "b"].map(id => ({ source: { ...source(id), sourceType: "receipt" }, value: amount(5), reversed: false })), allocations } });
  expect(run([a("a"), a("b")]).findings).toHaveLength(1);
  for (const allocations of [[a("a")], [a("a"), a("a")], [{ ...a("a"), method: "normal_allocator" }, a("b")], [{ ...a("a"), reversed: true }, a("b")], [{ ...a("a"), catchAllocated: amount(5) }, a("b")]]) expect(run(allocations).findings).toHaveLength(0);
 });
 it("CI-F05 ordinary invoice/payment without lock is advice including legal interim flows", () => {
  for (const activityKind of ["invoice", "payment"]) {
   const base = fixture(), raw = { ...base, ordinaryFacts: { ...base.ordinaryFacts, activity: [{ source: source(activityKind), activityKind }] } };
   expect(evaluate(raw).findings[0]?.kind).toBe("invoice_or_payment_without_lock");
   expect(evaluate({ ...raw, ordinaryFacts: { ...raw.ordinaryFacts, lockState: "present" } }).findings).toHaveLength(0);
  }
 });
 it("CI-F06 exact acceptance/delay and activation, cancelled and revised states", () => {
  const base = fixture(), raw = { ...base, ordinaryFacts: { ...base.ordinaryFacts, quotes: [quote("q")] } };
  expect(evaluate(raw).findings[0]?.kind).toBe("won_never_switched_live");
  for (const status of ["cancelled", "revised"]) expect(evaluate({ ...raw, ordinaryFacts: { ...raw.ordinaryFacts, quotes: [{ ...quote("q"), status }] } }).findings).toHaveLength(0);
  expect(evaluate({ ...raw, ordinaryFacts: { ...raw.ordinaryFacts, activations: [{ source: source("activation") }] } }).findings).toHaveLength(0);
  expect(evaluate({ ...raw, evaluatedAt: "2026-01-08T00:00:00.000000Z" }).findings).toHaveLength(0);
 });
 it("CI-F07 distinct jobs exact customer/site and 90-day microsecond endpoints", () => {
  // Wider observation window makes the +/- microsecond checks exercise the 90-day rule itself.
  const base = { ...fixture(), profile: { ...fixture().profile, window: { start, end: "2026-04-02T00:00:00.000000Z" } } };
  const run = (q: object) => evaluate({ ...base, ordinaryFacts: { ...base.ordinaryFacts, quotes: [quote("q"), { ...quote("q2", otherJob), ...q }] } }).findings.filter(f => f.kind === "related_sub2000_quotes_90_days");
  expect(run({})).toHaveLength(1);
  for (const pence of [200000, 200001]) expect(run({ value: amount(pence) })).toHaveLength(0);
  for (const patch of [{ siteId: "flat-2" }, { customerId: "near-match" }, { bindingConfirmed: false }]) expect(run(patch)).toHaveLength(0);
  expect(run({ acceptedAt: "2026-03-31T23:59:59.999999Z" })).toHaveLength(1);
  expect(run({ acceptedAt: end })).toHaveLength(1);
  const exclusive = { ...base.profile, quote: { ...base.profile.quote, endpoint: "exclusive" } };
  const endpointInput = { ...base, profile: exclusive, ordinaryFacts: { ...base.ordinaryFacts, quotes: [quote("q"), quote("q2", otherJob, 199999, end)] } };
  expect(evaluate(endpointInput).findings.filter(f => f.kind === "related_sub2000_quotes_90_days")).toHaveLength(0);
  const revisions = [quote("q"), { ...quote("old"), status: "revised" }, quote("q2", otherJob)];
  expect(evaluate({ ...base, ordinaryFacts: { ...base.ordinaryFacts, quotes: revisions } }).findings.filter(f => f.kind === "related_sub2000_quotes_90_days")).toHaveLength(1);
  expect(() => evaluate({ ...base, ordinaryFacts: { ...base.ordinaryFacts, quotes: [quote("q"), quote("newer"), quote("q2", otherJob)] } })).toThrow("INVALID_COMMERCIAL_INTEGRITY_V3_INPUT");
  expect(run({ acceptedAt: "2026-04-01T00:00:00.000001Z" })).toHaveLength(0);
 });
 it("CI-F08 original ordered linked cycles dedupe replays and delayed processing", () => {
  const base = fixture();
  const event = (id: string, kind: string, predecessorId: string | null, recordedAt: string) => ({ source: { ...source(id), recordedAt }, kind, predecessorId });
  const events = [event("f1", "finish", null, start), event("r1", "resume", "f1", "2026-01-02T00:00:00.000000Z"), event("f2", "close", null, "2026-01-03T00:00:00.000000Z"), event("r2", "reopen", "f2", "2026-01-04T00:00:00.000000Z")];
  const run = (workEvents: unknown[]) => evaluate({ ...base, ordinaryFacts: { ...base.ordinaryFacts, workEvents } });
  expect(run([...events].reverse()).findings).toHaveLength(1);
  expect(run([...events, ...events]).findings).toEqual(run(events).findings);
  expect(run(events.slice(0, 2)).findings).toHaveLength(0);
 });
 it("CI-F09 opaque assertions for every identifier, expired/wrong scope and innocent sharing", () => {
  for (const identifierKind of ["user", "phone", "card"]) {
   const base = fixture(), assertion = { source: source(identifierKind), identifierKind, scopeId: base.scopeId, subjectRef: "opaque-subject", authorityRef: "synthetic-authority", purpose: "synthetic_integrity", validFrom: start, validUntil: "2026-05-01T00:00:00.000000Z", sharing: "unexplained" };
   const run = (patch: object) => evaluate({ ...base, ordinaryFacts: { ...base.ordinaryFacts, assertions: [{ ...assertion, ...patch }] } });
   expect(run({}).findings).toHaveLength(1);
   for (const patch of [{ sharing: "family" }, { sharing: "company" }, { scopeId: "another-session" }, { validUntil: end }]) expect(run(patch).findings).toHaveLength(0);
  }
 });
});
