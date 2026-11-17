import { z } from "zod";
import { MAX_MONEY_PENCE, money, moneyFromBigInt } from "./money.js";

/** M4-20 dark fixture model. IDs below describe synthetic lineage, never verified authority.
 * No persistence, scheduler, invoice, notice, payment provider or fee posting is connected.
 * A future durable adapter must persist these records atomically and enforce command authorization.
 */
export const RETENTION_BALANCES_ENABLED = false as const;
export const RETENTION_REVIEW_OWNER = "retention-release-review-v1" as const;
const id = z.guid().transform(value => value.toLowerCase());
const pence = z.number().int().min(0).max(MAX_MONEY_PENCE);
const amount = z.object({ netPence: pence, taxPence: pence }).strict();
const source = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("contract_profile"), profileVersion: z.string().min(1).max(120), clause: z.string().min(1).max(120) }).strict(),
  z.object({ kind: z.literal("human_input"), actorId: id, inputId: id }).strict(),
]);
const condition = z.object({
  id, milestone: z.enum(["completion", "defects"]), description: z.string().min(1).max(500),
  source, dueDate: z.iso.date(), dateSource: source, cumulativeLimit: amount,
}).strict();
const context = { id, tenantId: id, jobId: id };
export const retentionProfileV1 = z.object({
  ...context, version: z.literal("retention.profile.v1"), revision: z.number().int().positive(), previousProfileId: id.nullable(),
  contractProfileVersion: z.string().min(1).max(120), fixtureApprovalId: id,
  taxTreatmentVersion: z.string().min(1).max(120), retained: amount, alreadyBilled: amount,
  conditions: z.array(condition).min(1).max(20),
}).strict();
export const retentionReviewV1 = z.object({
  ...context, version: z.literal("retention.review.v1"), profileId: id, conditionId: id,
  owner: z.literal(RETENTION_REVIEW_OWNER), trigger: z.enum(["timer", "human"]), raisedOn: z.iso.date(),
}).strict();
export const retentionResolutionV1 = z.object({
  ...context, version: z.literal("retention.resolution.v1"), reviewId: id,
  outcome: z.enum(["approved", "rejected", "deferred"]), conditionSatisfied: z.boolean(),
  humanSource: z.object({ actorId: id, inputId: id }).strict(), amount,
}).strict();
export const retentionReleaseV1 = z.object({
  ...context, version: z.literal("retention.release.v1"), resolutionId: id,
}).strict();
export const retentionReceiptV1 = z.object({
  ...context, version: z.literal("retention.receipt.v1"), releaseId: id, grossPence: pence,
}).strict();
export const retentionReversalV1 = z.object({
  ...context, version: z.literal("retention.reversal.v1"), receiptId: id, grossPence: pence,
}).strict();
export const retentionRecordV1 = z.discriminatedUnion("version", [retentionProfileV1, retentionReviewV1,
  retentionResolutionV1, retentionReleaseV1, retentionReceiptV1, retentionReversalV1]);
export const retentionBookV1 = z.object({
  version: z.literal("retention.book.v1"), environment: z.literal("synthetic"), tenantId: id, jobId: id,
  records: z.array(retentionRecordV1).max(10000),
}).strict();
export type RetentionBook = z.infer<typeof retentionBookV1>;
export type RetentionRecord = z.infer<typeof retentionRecordV1>;
type Amount = z.infer<typeof amount>;
type Profile = z.infer<typeof retentionProfileV1>;
export type RetentionErrorCode = "INVALID_INPUT" | "CONTEXT_MISMATCH" | "REPLAY_CONFLICT" | "STALE_PROFILE"
  | "MISSING_SOURCE" | "VALUE_LIMIT" | "CONDITION_UNMET" | "ISSUE_DISABLED";
export class RetentionError extends Error {
  constructor(public readonly code: RetentionErrorCode, message: string) { super(message); this.name = "RetentionError"; }
}
function fail(code: RetentionErrorCode, message: string): never { throw new RetentionError(code, message); }
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) fail("INVALID_INPUT", "Invalid versioned synthetic retention input");
  return result.data;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(child => freeze(child)); Object.freeze(value);
  }
  return value;
}
const sum = (...values: number[]) => moneyFromBigInt(values.reduce((n, value) => n + BigInt(value), 0n)).pence;
const gross = (value: Amount) => sum(value.netPence, value.taxPence);
const add = (a: Amount, b: Amount): Amount => ({ netPence: sum(a.netPence, b.netPence), taxPence: sum(a.taxPence, b.taxPence) });
const subtract = (a: Amount, b: Amount): Amount => ({ netPence: sum(a.netPence, -b.netPence), taxPence: sum(a.taxPence, -b.taxPence) });
function bounded(value: Amount, limit: Amount) {
  gross(value);
  if (value.netPence < 0 || value.taxPence < 0 || value.netPence > limit.netPence || value.taxPence > limit.taxPence) {
    fail("VALUE_LIMIT", "Retention principal or tax exceeds its separate limit");
  }
}
function validateProfile(profile: Profile, previous: Profile | undefined) {
  if (profile.revision !== (previous?.revision ?? 0) + 1 || profile.previousProfileId !== (previous?.id ?? null)) {
    fail("STALE_PROFILE", "Profile revisions must extend current history");
  }
  if (new Set(profile.conditions.map(item => item.id)).size !== profile.conditions.length) fail("INVALID_INPUT", "Duplicate condition identity");
  bounded(profile.alreadyBilled, profile.retained);
  let prior: Amount = { netPence: 0, taxPence: 0 };
  for (const item of profile.conditions) {
    for (const reference of [item.source, item.dateSource]) {
      if (reference.kind === "contract_profile" && reference.profileVersion !== profile.contractProfileVersion) {
        fail("MISSING_SOURCE", "Condition or deadline references a different contract profile");
      }
    }
    bounded(item.cumulativeLimit, profile.retained);
    bounded(prior, item.cumulativeLimit); prior = item.cumulativeLimit;
  }
  if (JSON.stringify(prior) !== JSON.stringify(profile.retained)) fail("VALUE_LIMIT", "Final condition must reconcile all retained principal and tax");
  if (previous) {
    // This first dark slice permits sourced date changes only. New commercial terms need a separate contract change.
    const terms = (value: Profile) => ({
      contractProfileVersion: value.contractProfileVersion, taxTreatmentVersion: value.taxTreatmentVersion,
      retained: value.retained, alreadyBilled: value.alreadyBilled,
      conditions: value.conditions.map(({ dueDate: _date, dateSource: _source, ...rest }) => rest),
    });
    if (JSON.stringify(terms(profile)) !== JSON.stringify(terms(previous))) fail("STALE_PROFILE", "A date revision cannot rewrite retention terms or opening balances");
  }
}
function project(book: RetentionBook) {
  let profile: Profile | undefined;
  let released: Amount = { netPence: 0, taxPence: 0 };
  const reviews = new Map<string, z.infer<typeof retentionReviewV1>>();
  const resolutions = new Map<string, z.infer<typeof retentionResolutionV1>>();
  const resolved = new Set<string>(), consumed = new Set<string>(), reviewKeys = new Set<string>();
  const releases = new Map<string, Amount>();
  const receipts = new Map<string, z.infer<typeof retentionReceiptV1>>();
  const reversed = new Map<string, number>(), cash = new Map<string, number>();
  const ids = new Set<string>();
  for (const record of book.records) {
    if (record.tenantId !== book.tenantId || record.jobId !== book.jobId) fail("CONTEXT_MISMATCH", "Retention record belongs to another tenant or job");
    if (ids.has(record.id)) fail("REPLAY_CONFLICT", "Duplicate record identity");
    ids.add(record.id);
    if (record.version === "retention.profile.v1") { validateProfile(record, profile); profile = record; continue; }
    if (!profile) fail("MISSING_SOURCE", "Retention requires a contract profile");
    switch (record.version) {
      case "retention.review.v1": {
        if (record.profileId !== profile.id) fail("STALE_PROFILE", "Review must reference the current profile");
        const term = profile.conditions.find(item => item.id === record.conditionId);
        if (!term) fail("MISSING_SOURCE", "Unknown release condition");
        if (record.trigger === "timer" && record.raisedOn < term.dueDate) fail("CONDITION_UNMET", "Timer is not due");
        const key = `${profile.id}:${term.id}`;
        if (reviewKeys.has(key)) fail("REPLAY_CONFLICT", "Only one review per condition and profile revision");
        reviewKeys.add(key); reviews.set(record.id, record); break;
      }
      case "retention.resolution.v1": {
        const review = reviews.get(record.reviewId);
        if (!review) fail("MISSING_SOURCE", "Resolution requires a review");
        if (review.profileId !== profile.id) fail("STALE_PROFILE", "Changed dates require a fresh review");
        if (resolved.has(review.id)) fail("REPLAY_CONFLICT", "Review already resolved; revise the profile for a new review");
        if (record.outcome === "approved" && (!record.conditionSatisfied || gross(record.amount) === 0)) {
          fail("CONDITION_UNMET", "Approval needs explicit human satisfaction and a positive exact amount");
        }
        if (record.outcome !== "approved" && gross(record.amount) !== 0) fail("VALUE_LIMIT", "Unapproved resolution cannot reserve value");
        resolved.add(review.id); resolutions.set(record.id, record); break;
      }
      case "retention.release.v1": {
        const resolution = resolutions.get(record.resolutionId);
        if (!resolution) fail("MISSING_SOURCE", "Release requires a resolution");
        const review = reviews.get(resolution.reviewId)!;
        if (review.profileId !== profile.id) fail("STALE_PROFILE", "Changed dates invalidate unconsumed approvals");
        if (resolution.outcome !== "approved" || !resolution.conditionSatisfied) fail("CONDITION_UNMET", "Release needs explicit human approval");
        if (consumed.has(resolution.id)) fail("REPLAY_CONFLICT", "Resolution was already consumed");
        const term = profile.conditions.find(item => item.id === review.conditionId)!;
        const next = add(released, resolution.amount);
        bounded(add(profile.alreadyBilled, next), term.cumulativeLimit);
        consumed.add(resolution.id); released = next; releases.set(record.id, resolution.amount); break;
      }
      case "retention.receipt.v1": {
        const release = releases.get(record.releaseId);
        if (!release) fail("MISSING_SOURCE", "Cash references a separate released allocation");
        const next = sum(cash.get(record.releaseId) ?? 0, record.grossPence);
        if (record.grossPence === 0 || next > gross(release)) fail("VALUE_LIMIT", "Receipt exceeds released gross");
        cash.set(record.releaseId, next); receipts.set(record.id, record); break;
      }
      case "retention.reversal.v1": {
        const receipt = receipts.get(record.receiptId);
        if (!receipt) fail("MISSING_SOURCE", "Reversal requires an earlier receipt");
        const total = sum(reversed.get(receipt.id) ?? 0, record.grossPence);
        if (record.grossPence === 0 || total > receipt.grossPence) fail("VALUE_LIMIT", "Reversal exceeds its receipt");
        reversed.set(receipt.id, total);
        cash.set(receipt.releaseId, sum(cash.get(receipt.releaseId) ?? 0, -record.grossPence)); break;
      }
    }
  }
  return { profile, released, reviews, resolved, cash };
}
function validated(input: unknown) {
  const book = parse(retentionBookV1, input); project(book); return book;
}
/** Append-only fixture history, serializable for a future durable adapter; exact retries are no-ops. */
export function appendRetentionRecord(bookInput: unknown, recordInput: unknown): RetentionBook {
  const book = validated(bookInput), record = parse(retentionRecordV1, recordInput);
  const prior = book.records.find(item => item.id === record.id);
  if (prior) {
    if (JSON.stringify(prior) !== JSON.stringify(record)) fail("REPLAY_CONFLICT", "Record identity reused with different content");
    return freeze(book);
  }
  return freeze(validated({ ...book, records: [...book.records, record] }));
}
export function reconcileRetentionBook(input: unknown) {
  const state = project(validated(input));
  const zero = { netPence: 0, taxPence: 0 };
  const billed = state.profile?.alreadyBilled ?? zero;
  const remaining = subtract(state.profile?.retained ?? zero, add(billed, state.released));
  const received = moneyFromBigInt([...state.cash.values()].reduce((n, value) => n + BigInt(value), 0n));
  return freeze({
    watermark: "SYNTHETIC RETENTION REVIEW - NOT FOR ISSUE", owner: RETENTION_REVIEW_OWNER,
    retained: state.profile?.retained ?? zero, alreadyBilled: billed, released: state.released, remaining,
    grossReceived: received, grossReleasedOutstanding: money(sum(gross(state.released), -received.pence)),
    pendingReviewIds: [...state.reviews.values()].filter(review => review.profileId === state.profile?.id && !state.resolved.has(review.id)).map(review => review.id),
    // No automatic recovery attribution or qualifying settlement path exists in this dark model.
    feeEligibleRecovery: money(0), issueBlockers: ["FEATURE_DISABLED", "D02_D06_REVIEW_REQUIRED", "DURABLE_ADAPTER_REQUIRED"],
  });
}
export function assertRetentionIssueAllowed(): never { return fail("ISSUE_DISABLED", "Retention notices and invoices are disabled"); }
