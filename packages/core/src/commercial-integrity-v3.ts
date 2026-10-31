import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
import { workFactTimeV1 } from "./job-work-state.js";

const id = z.string().min(1).max(300), uuid = z.string().uuid();
const time = workFactTimeV1;
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const windowSchema = z.object({ start: time, end: time }).strict().refine(v => v.start <= v.end, "Window is reversed");
const valueSchema = z.object({ pence: z.number().int().safe().min(0).max(MAX_MONEY_PENCE), currency: z.literal("GBP"), basis: z.enum(["net", "gross", "unknown"]) }).strict();
const sourceSchema = z.object({ tenantId: uuid, jobId: uuid, scopeId: id, sourceId: id, sourceType: id, revision: id, hash, recordedAt: time,
 provenance: z.enum(["builder_attested", "synthetic_settled", "published_final_check", "server_recorded"]),
}).strict();
const quoteSchema = z.object({ source: sourceSchema, status: z.enum(["accepted", "cancelled", "revised", "draft"]), customerId: id, siteId: id, bindingConfirmed: z.boolean(), value: valueSchema, acceptedAt: time }).strict();
const ordinarySchema = z.object({ lockState: z.enum(["absent", "present", "unknown"]), quotes: z.array(quoteSchema),
 activations: z.array(z.object({ source: sourceSchema }).strict()),
 activity: z.array(z.object({ source: sourceSchema, activityKind: z.enum(["invoice", "payment"]) }).strict()),
 workEvents: z.array(z.object({ source: sourceSchema, kind: z.enum(["finish", "cancel_finish", "resume", "close", "reopen"]), predecessorId: id.nullable() }).strict()),
 assertions: z.array(z.object({ source: sourceSchema, identifierKind: z.enum(["user", "phone", "card"]), scopeId: id, subjectRef: id, authorityRef: id, purpose: z.literal("synthetic_integrity"), validFrom: time, validUntil: time, sharing: z.enum(["unexplained", "family", "company"]) }).strict()),
}).strict();
const lockFactSchema = z.object({ source: sourceSchema, lockedAccount: valueSchema, lockId: uuid, cutoff: time, contractVersion: id }).strict();
const catchSchema = z.object({ source: sourceSchema, catchId: id, status: z.enum(["confirmed", "dismissed_not_completed", "dismissed_other"]), includedInLockedAccount: z.boolean(), value: valueSchema, invoiceLineId: id.nullable() }).strict();
const publishedSchema = z.object({ lockId: uuid, contractVersion: id, cutoff: time, lockSource: sourceSchema, lockedAccount: valueSchema,
 catches: z.array(catchSchema),
 completions: z.array(z.object({ source: sourceSchema, catchId: id, state: z.enum(["verified", "pending", "invalidated", "rejected"]), original: z.boolean(), objectVersionId: id, byteLength: z.number().int().positive().safe() }).strict()),
 receipts: z.array(z.object({ source: sourceSchema, value: valueSchema, reversed: z.boolean() }).strict()),
 corrections: z.array(z.object({ source: sourceSchema, correctionKind: z.enum(["credit", "writeoff"]), invoiceLineId: id.nullable(), value: valueSchema, actual: z.boolean() }).strict()),
 allocations: z.array(z.object({ source: sourceSchema, receiptId: id, method: z.enum(["explicit_user", "normal_allocator"]), reversed: z.boolean(), catchOutstanding: valueSchema, catchAllocated: valueSchema, ordinaryAllocated: valueSchema, catchLineIds: z.array(id).min(1) }).strict()),
}).strict();
/** No adapter defaults. Optional rule configuration means policy_absent, never an inferred threshold. */
const profileSchema = z.object({ version: z.string().regex(/^synthetic_fixture[.:-]/u).max(300), ruleVersion: id, window: windowSchema,
 allocation: z.object({ minimumPayments: z.number().int().min(2).max(10000) }).strict().optional(),
 won: z.object({ delayMicroseconds: z.string().regex(/^(0|[1-9]\d{0,17})$/u) }).strict().optional(),
 quote: z.object({ basis: z.literal("net"), endpoint: z.enum(["inclusive", "exclusive"]), windowDays: z.literal(90) }).strict().optional(),
 restart: z.object({ minimumCycles: z.number().int().min(2).max(10000) }).strict().optional(),
}).strict();
const common = { version: z.literal("commercial-integrity-input.v3"), environment: z.literal("synthetic_demo"), tenantId: uuid, jobId: uuid, scopeId: id, evaluatedAt: time, profile: profileSchema, ordinaryFacts: ordinarySchema };
const inputShape = z.discriminatedUnion("phase", [z.object({ ...common, phase: z.literal("pre_lock") }).strict(), z.object({ ...common, phase: z.literal("post_lock"), published: publishedSchema }).strict()]);
export const commercialIntegrityV3InputSchema = inputShape.superRefine((input, ctx) => {
 const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
 const groups: { source: Source }[][] = [input.ordinaryFacts.quotes, input.ordinaryFacts.activations, input.ordinaryFacts.activity, input.ordinaryFacts.workEvents, input.ordinaryFacts.assertions];
 if (input.phase === "post_lock") {
  if (input.ordinaryFacts.lockState !== "present" || input.published.cutoff > input.evaluatedAt) fail("Published lock/cutoff mismatch");
  groups.push([{ source: input.published.lockSource }], input.published.catches, input.published.completions, input.published.receipts, input.published.corrections, input.published.allocations);
 }
 const seen = new Map<string, string>();
 for (const group of groups) for (const fact of group) {
  if (fact.source.scopeId !== input.scopeId || fact.source.tenantId !== input.tenantId || (group !== input.ordinaryFacts.quotes && fact.source.jobId !== input.jobId)) fail("Source scope mismatch");
  if (fact.source.recordedAt > input.evaluatedAt) fail("Future source");
  const key = sourceIdentity(fact.source), encoded = canonical(fact), prior = seen.get(key);
  if (prior !== undefined && prior !== encoded) fail("Conflicting source identity");
  seen.set(key, encoded);
 }
 const acceptedJobs = new Set<string>();
 for (const quote of unique(input.ordinaryFacts.quotes)) {
  if (quote.acceptedAt > input.evaluatedAt) fail("Future acceptance");
  if (quote.status === "accepted") {
   if (acceptedJobs.has(quote.source.jobId)) fail("Ambiguous current accepted quote");
   acceptedJobs.add(quote.source.jobId);
  }
 }
 for (const assertion of input.ordinaryFacts.assertions) if (assertion.validFrom > assertion.validUntil) fail("Assertion validity reversed");
 if (input.phase === "post_lock") {
  const pub = input.published;
  if (pub.lockSource.sourceId !== pub.lockId || pub.lockSource.recordedAt !== pub.cutoff || pub.lockSource.provenance !== "server_recorded") fail("Published locked bill identity mismatch");
  const receiptIds = new Set<string>();
  for (const receipt of unique(pub.receipts)) {
   if (receiptIds.has(receipt.source.sourceId)) fail("Conflicting receipt identity");
   receiptIds.add(receipt.source.sourceId);
  }
  const catches = new Set<string>(), lines = new Set<string>();
  for (const c of unique(input.published.catches)) {
   if (catches.has(c.catchId) || (c.invoiceLineId !== null && lines.has(c.invoiceLineId))) fail("Conflicting catch/line identity");
   catches.add(c.catchId); if (c.invoiceLineId !== null) lines.add(c.invoiceLineId);
  }
 }
});
export type CommercialIntegrityV3Input = z.infer<typeof commercialIntegrityV3InputSchema>;
type Source = z.infer<typeof sourceSchema>;
export const commercialIntegrityV3Kinds = ["dismissed_not_completed_with_completion_evidence", "receipts_exceed_locked_account_and_confirmed_catches", "catch_line_credit_or_writeoff", "explicit_allocations_avoid_catch_lines", "invoice_or_payment_without_lock", "won_never_switched_live", "related_sub2000_quotes_90_days", "repeated_finish_restart", "account_identifier_reuse"] as const;
const kindSchema = z.enum(commercialIntegrityV3Kinds);
const snapshotShape = z.object({ version: z.literal("commercial-integrity-source-snapshot.v3"), tenantId: uuid, jobId: uuid, scopeId: id, family: z.literal("v3"), phase: z.enum(["pre_lock", "post_lock"]), kind: kindSchema, findingKey: z.string().min(1), profile: profileSchema, window: windowSchema,
 // Facts are a strict union; caller JSON/free text cannot become a source snapshot.
 facts: z.array(z.union([lockFactSchema, quoteSchema, z.object({ source: sourceSchema }).strict(), ordinarySchema.shape.activity.element, ordinarySchema.shape.workEvents.element, ordinarySchema.shape.assertions.element, catchSchema, publishedSchema.shape.completions.element, publishedSchema.shape.receipts.element, publishedSchema.shape.corrections.element, publishedSchema.shape.allocations.element])),
 compared: z.record(z.string(), z.union([z.string(), z.number().int().safe(), z.boolean(), z.null()])),
}).strict();
export const commercialIntegrityReviewSourceSnapshotV3Schema = snapshotShape;
export type CommercialIntegrityReviewSourceSnapshotV3 = z.infer<typeof snapshotShape>;
const findingSchema = z.object({ key: z.string().min(1), kind: kindSchema, advisory: z.literal(true), reason: z.string().min(1), sourceReferences: z.array(sourceSchema).min(1), window: windowSchema, sourceSnapshot: snapshotShape }).strict();
export const commercialIntegrityV3ResultSchema = z.object({ version: z.literal("commercial-integrity-result.v3"), advisory: z.literal(true), syntheticOnly: z.literal(true), evaluatedAt: time, profileVersion: id, findings: z.array(findingSchema), unavailable: z.array(z.object({ kind: kindSchema, reason: z.enum(["policy_absent", "source_absent", "line_source_absent", "basis_unavailable", "credit_basis_unavailable"]) }).strict()) }).strict();
export type CommercialIntegrityV3Result = z.infer<typeof commercialIntegrityV3ResultSchema>;
export const commercialIntegrityReviewV3Schema = z.object({ version: z.literal("commercial-integrity-review.v3"), commandId: uuid, findingKey: z.string().min(1), findingSnapshotHash: hash, outcome: z.literal("dismissed_false_positive"), explanation: z.string().trim().min(1).max(500) }).strict();
export type CommercialIntegrityReviewV3 = z.infer<typeof commercialIntegrityReviewV3Schema>;
export const commercialIntegrityFamilyV1Schema = z.object({ version: z.literal("commercial-integrity-family.v1"), environment: z.literal("synthetic_demo"), jobId: uuid, family: z.enum(["v1", "v3"]), realExternalActions: z.literal(0) }).strict();
export type CommercialIntegrityFamilyV1 = z.infer<typeof commercialIntegrityFamilyV1Schema>;
export class CommercialIntegrityV3Error extends Error {
 constructor(readonly code: "INVALID_COMMERCIAL_INTEGRITY_V3_INPUT") { super(code); this.name = "CommercialIntegrityV3Error"; }
}

/** UTF-16 ordinal key ordering, undefined object keys omitted, JSON scalar encoding, set-like arrays sorted/deduplicated by canonical bytes.
 * SQL must implement this exact representation (not jsonb::text); hashing belongs outside pure core. */
function canonical(value: unknown): string {
 if (Array.isArray(value)) return `[${[...new Set(value.map(canonical))].sort().join(",")}]`;
 if (value !== null && typeof value === "object") return `{${Object.keys(value).filter(k => (value as Record<string, unknown>)[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
 return JSON.stringify(value);
}
export function canonicalCommercialIntegritySnapshot(raw: CommercialIntegrityReviewSourceSnapshotV3): string {
 return canonical(commercialIntegrityReviewSourceSnapshotV3Schema.parse(raw));
}
function sourceIdentity(s: Source): string { return canonical({ tenantId: s.tenantId, jobId: s.jobId, scopeId: s.scopeId, sourceType: s.sourceType, sourceId: s.sourceId }); }
function unique<T extends { source: Source }>(facts: readonly T[]): T[] {
 return [...new Map(facts.map(f => [sourceIdentity(f.source), f])).values()].sort((a, b) => (sourceIdentity(a.source) < sourceIdentity(b.source) ? -1 : sourceIdentity(a.source) > sourceIdentity(b.source) ? 1 : 0));
}
// Calendar validation is reused from workFactTimeV1. Date only reads whole seconds; fractional microseconds use bigint.
function micros(value: string): bigint { return BigInt(Date.parse(`${value.slice(0, 19)}Z`)) * 1000n + BigInt(value.slice(20, 26)); }
function freeze<T>(value: T): T {
 if (value !== null && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
 return value;
}

/** Pure synthetic advisory evaluation. Accepts no authority, action or settlement commands. */
export function evaluateCommercialIntegrityV3(raw: unknown): CommercialIntegrityV3Result {
 const parsed = commercialIntegrityV3InputSchema.safeParse(raw);
 if (!parsed.success) throw new CommercialIntegrityV3Error("INVALID_COMMERCIAL_INTEGRITY_V3_INPUT");
 const input = parsed.data, o = input.ordinaryFacts, p = input.profile, window = p.window;
 const findings: CommercialIntegrityV3Result["findings"] = [], unavailable: CommercialIntegrityV3Result["unavailable"] = [];
 const inWindow = (s: Source) => s.recordedAt >= window.start && s.recordedAt <= window.end;
 const unavailableRule = (kind: typeof commercialIntegrityV3Kinds[number], reason: CommercialIntegrityV3Result["unavailable"][number]["reason"]) => { if (!unavailable.some(x => x.kind === kind && x.reason === reason)) unavailable.push({ kind, reason }); };
 const add = (kind: typeof commercialIntegrityV3Kinds[number], facts: CommercialIntegrityReviewSourceSnapshotV3["facts"], compared: CommercialIntegrityReviewSourceSnapshotV3["compared"], reason: string) => {
  const sourceReferences = unique(facts).map(f => f.source);
  const key = canonical({ kind, ruleVersion: p.ruleVersion, sources: sourceReferences.map(sourceIdentity).sort(), window });
  const sourceSnapshot: CommercialIntegrityReviewSourceSnapshotV3 = { version: "commercial-integrity-source-snapshot.v3", tenantId: input.tenantId, jobId: input.jobId, scopeId: input.scopeId, family: "v3", phase: input.phase, kind, findingKey: key, profile: p, window, facts, compared };
  if (!findings.some(f => f.key === key)) findings.push({ key, kind, advisory: true, sourceReferences, window, sourceSnapshot, reason });
 };
 const quotes = unique(o.quotes), activity = unique(o.activity).filter(f => inWindow(f.source));
 const wonKind = "won_never_switched_live", quoteKind = "related_sub2000_quotes_90_days", restartKind = "repeated_finish_restart", allocationKind = "explicit_allocations_avoid_catch_lines";
 if (!p.won) unavailableRule(wonKind, "policy_absent");
 else for (const q of quotes.filter(q => q.source.jobId === input.jobId && q.status === "accepted")) {
  if (!o.activations.some(a => a.source.jobId === q.source.jobId) && micros(input.evaluatedAt) - micros(q.acceptedAt) > BigInt(p.won.delayMicroseconds)) add(wonKind, [q], { acceptedAt: q.acceptedAt, delayMicroseconds: p.won.delayMicroseconds, activation: "absent" }, "Recorded acceptance has no recorded switch-live; check this practice job.");
 }
 if (o.lockState === "unknown") unavailableRule("invoice_or_payment_without_lock", "source_absent");
 else if (o.lockState === "absent") for (const a of activity) add("invoice_or_payment_without_lock", [a], { lockState: "absent", activityKind: a.activityKind }, "Invoice or payment activity has no recorded final-account lock; interim and deposit flows may be legitimate.");
 if (!p.quote) unavailableRule(quoteKind, "policy_absent");
 else {
  const candidates = quotes.filter(q => q.status === "accepted" && q.bindingConfirmed && q.value.basis === "net" && q.value.pence < 200000 && q.acceptedAt >= window.start && q.acceptedAt <= window.end);
  for (let i = 0; i < candidates.length; i++) for (const b of candidates.slice(i + 1)) {
   const a = candidates[i]!;
   if (a.source.jobId === b.source.jobId || (a.source.jobId !== input.jobId && b.source.jobId !== input.jobId) || a.customerId !== b.customerId || a.siteId !== b.siteId) continue;
   const difference = micros(a.acceptedAt) - micros(b.acceptedAt), distance = difference < 0n ? -difference : difference, maximum = 90n * 86400000000n;
   if (p.quote.endpoint === "inclusive" ? distance <= maximum : distance < maximum) add(quoteKind, [a, b], { firstPence: a.value.pence, secondPence: b.value.pence, basis: "net", maximumPenceExclusive: 200000, distanceMicroseconds: distance.toString(), endpoint: p.quote.endpoint }, "Distinct related practice jobs have accepted net quotes below £2,000 within the declared 90-day window; review their context.");
  }
 }
 if (!p.restart) unavailableRule(restartKind, "policy_absent");
 else {
  const events = unique(o.workEvents).filter(e => inWindow(e.source)).sort((a, b) => a.source.recordedAt < b.source.recordedAt ? -1 : a.source.recordedAt > b.source.recordedAt ? 1 : sourceIdentity(a.source) < sourceIdentity(b.source) ? -1 : 1), pairs = new Map<string, typeof events>();
  for (const restart of events) {
   if (!["resume", "cancel_finish", "reopen"].includes(restart.kind)) continue;
   const finish = events.find(f => f.source.sourceId === restart.predecessorId && (f.kind === "finish" || f.kind === "close") && f.source.recordedAt < restart.source.recordedAt);
   if (finish && (restart.kind === "reopen" ? finish.kind === "close" : finish.kind === "finish") && !pairs.has(finish.source.sourceId)) pairs.set(finish.source.sourceId, [finish, restart]);
  }
  if (pairs.size >= p.restart.minimumCycles) add(restartKind, [...pairs.values()].flat(), { cycles: pairs.size, minimumCycles: p.restart.minimumCycles }, "Repeated linked finish/restart events occurred in the declared practice window; review their context.");
 }
 for (const a of unique(o.assertions)) if (a.scopeId === input.scopeId && a.validFrom <= input.evaluatedAt && input.evaluatedAt <= a.validUntil && a.sharing === "unexplained" && inWindow(a.source)) add("account_identifier_reuse", [a], { identifierKind: a.identifierKind, subjectRef: a.subjectRef, authorityRef: a.authorityRef }, "An authorised opaque synthetic equality assertion needs review; sharing does not establish wrongdoing.");
 if (!o.assertions.some(a => a.scopeId === input.scopeId && a.validFrom <= input.evaluatedAt && input.evaluatedAt <= a.validUntil)) unavailableRule("account_identifier_reuse", "source_absent");
 if (!p.allocation) unavailableRule(allocationKind, "policy_absent");
 if (input.phase === "post_lock") {
  const pub = input.published, catches = unique(pub.catches), confirmed = catches.filter(c => c.status === "confirmed"), lockFact = { source: pub.lockSource, lockedAccount: pub.lockedAccount, lockId: pub.lockId, cutoff: pub.cutoff, contractVersion: pub.contractVersion };
  for (const c of catches.filter(c => c.status === "dismissed_not_completed")) for (const proof of unique(pub.completions)) if (proof.catchId === c.catchId && proof.state === "verified" && proof.source.provenance === "server_recorded" && proof.original && proof.source.recordedAt <= pub.cutoff) add("dismissed_not_completed_with_completion_evidence", [c, proof, lockFact], { catchId: c.catchId, disposition: c.status, evidenceState: proof.state, cutoff: pub.cutoff, lockId: pub.lockId }, "Published not-completed dismissal has matching verified completion evidence; review the evidence.");
  const receipts = unique(pub.receipts), additional = confirmed.filter(c => !c.includedInLockedAccount), values = [pub.lockedAccount, ...receipts.filter(r => !r.reversed).map(r => r.value), ...additional.map(c => c.value)];
  if (pub.corrections.some(c => c.actual)) unavailableRule("receipts_exceed_locked_account_and_confirmed_catches", "credit_basis_unavailable");
  else if (values.some(v => v.basis === "unknown" || v.basis !== pub.lockedAccount.basis)) unavailableRule("receipts_exceed_locked_account_and_confirmed_catches", "basis_unavailable");
  else {
   const received = receipts.filter(r => !r.reversed).reduce((n, r) => n + BigInt(r.value.pence), 0n), account = BigInt(pub.lockedAccount.pence) + additional.reduce((n, c) => n + BigInt(c.value.pence), 0n);
   if (received > account) add("receipts_exceed_locked_account_and_confirmed_catches", [lockFact, ...additional, ...receipts], { receiptPence: received.toString(), accountPence: account.toString(), basis: pub.lockedAccount.basis, lockId: pub.lockId, cutoff: pub.cutoff }, "Recorded receipts exceed the locked account and additional confirmed catches on the same basis; attestations are not settlement proof.");
  }
  for (const correction of unique(pub.corrections).filter(c => c.actual)) {
   if (correction.invoiceLineId === null) { unavailableRule("catch_line_credit_or_writeoff", "line_source_absent"); continue; }
   const c = confirmed.find(c => c.invoiceLineId === correction.invoiceLineId);
   if (c && (correction.value.basis === "unknown" || correction.value.basis !== c.value.basis)) { unavailableRule("catch_line_credit_or_writeoff", "basis_unavailable"); continue; }
   if (c && correction.value.pence > 0) add("catch_line_credit_or_writeoff", [c, correction, lockFact], { correctionKind: correction.correctionKind, pence: correction.value.pence, basis: correction.value.basis, lineId: correction.invoiceLineId, lockId: pub.lockId }, "An actual line-specific credit or write-off refers to a published confirmed catch; review its context.");
  }
  if (p.allocation) {
   const saved = unique(pub.allocations).filter(a => !a.reversed);
   const allocations = saved.filter(a => {
    if (!inWindow(a.source) || a.method !== "explicit_user") return false;
    const receipt = receipts.find(r => r.source.sourceId === a.receiptId);
    if (!receipt) { unavailableRule(allocationKind, "source_absent"); return false; }
    if (receipt.reversed) return false;
    const basis = receipt.value.basis;
    if (basis === "unknown" || [a.catchOutstanding, a.catchAllocated, a.ordinaryAllocated].some(v => v.basis !== basis)) {
     unavailableRule(allocationKind, "basis_unavailable"); return false;
    }
    const lines = [...new Set(a.catchLineIds)].map(line => confirmed.find(c => c.invoiceLineId === line));
    if (lines.some(c => !c)) { unavailableRule(allocationKind, "line_source_absent"); return false; }
    if (lines.some(c => c!.value.basis !== basis)) { unavailableRule(allocationKind, "basis_unavailable"); return false; }
    const total = saved.filter(other => other.receiptId === a.receiptId);
    if (total.some(other => other.catchAllocated.basis !== basis || other.ordinaryAllocated.basis !== basis) ||
     total.reduce((sum, other) => sum + BigInt(other.catchAllocated.pence) + BigInt(other.ordinaryAllocated.pence), 0n) > BigInt(receipt.value.pence) ||
     BigInt(a.catchOutstanding.pence) > lines.reduce((sum, c) => sum + BigInt(c!.value.pence), 0n) || a.catchAllocated.pence > a.catchOutstanding.pence) {
     unavailableRule(allocationKind, "source_absent"); return false;
    }
    return a.catchOutstanding.pence > 0 && a.catchAllocated.pence === 0 && a.ordinaryAllocated.pence > 0;
   });
   const payments = new Set(allocations.map(a => a.receiptId));
   if (payments.size >= p.allocation.minimumPayments) add(allocationKind, [lockFact, ...confirmed.filter(c => allocations.some(a => c.invoiceLineId !== null && a.catchLineIds.includes(c.invoiceLineId))), ...allocations, ...receipts.filter(r => allocations.some(a => a.receiptId === r.source.sourceId))], { payments: payments.size, minimumPayments: p.allocation.minimumPayments, lockId: pub.lockId }, "Repeated saved explicit allocations avoid outstanding confirmed catch lines in the declared window; no allocation is changed.");
  }
 }
 return freeze(commercialIntegrityV3ResultSchema.parse({ version: "commercial-integrity-result.v3", advisory: true, syntheticOnly: true, evaluatedAt: input.evaluatedAt, profileVersion: p.version, findings: findings.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0), unavailable: unavailable.sort((a, b) => canonical(a) < canonical(b) ? -1 : 1) }));
}
