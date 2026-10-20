import { z } from "zod";

export class FreeFirstJobError extends Error {
  constructor(readonly code: "INVALID_FREE_FIRST_JOB_INPUT" | "FREE_FIRST_JOB_ACCESS_DENIED" | "FREE_FIRST_JOB_SYNTHETIC_ONLY") {
    super(code); this.name = "FreeFirstJobError";
  }
}
export function parseFreeFirstJob<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new FreeFirstJobError("INVALID_FREE_FIRST_JOB_INPUT");
  return parsed.data;
}
const environment = z.literal("synthetic_demo");
const id = z.string().uuid();
const opaque = z.string().min(1).max(200).regex(/^[\x21-\x7e]+$/u);
const instant = z.string().datetime().refine(value => {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value && value >= "2000" && value < "9999";
}, "Canonical millisecond UTC instant required for the reference preview");

/** Reference-only technical choices. No approved clock or identity-verification policy is implied. */
export const freeFirstJobReferencePolicyV1 = Object.freeze({
  version: "free-first-job.reference.v1" as const,
  pricingPolicyVersion: "subscription_pricing_policy_v4" as const,
  status: "proposed_reference_only" as const,
  trialDays: 90,
  expiryClock: "elapsed_24_hour_days" as const,
});
export const freeFirstJobIdentityV1 = z.object({
  version: z.literal("free-first-job-identity.v1"), environment,
  companyNumber: opaque.nullable(), normalizedPhone: opaque.nullable(), cardFingerprint: opaque.startsWith("sim_fp_").nullable(),
}).strict().readonly();

/** All independently derivable keys, with stable v1 bytes. No verification is performed. */
export function freeFirstJobKeys(raw: unknown): readonly string[] {
  const identity = parseFreeFirstJob(freeFirstJobIdentityV1, raw);
  const keys: string[] = [];
  if (identity.companyNumber !== null) keys.push(JSON.stringify(["free-first-job.v1", "company", identity.companyNumber]));
  if (identity.normalizedPhone !== null && identity.cardFingerprint !== null)
    keys.push(JSON.stringify(["free-first-job.v1", "phone_card", identity.normalizedPhone, "simulated", identity.cardFingerprint]));
  return Object.freeze(keys);
}

/** @deprecated Compatibility only; unsuitable for entitlement decisions. Use freeFirstJobKeys. */
export function freeFirstJobKey(raw: unknown) {
  const identity = parseFreeFirstJob(freeFirstJobIdentityV1, raw);
  if (identity.companyNumber !== null) return { status: "identified" as const,
    key: JSON.stringify(["free-first-job.v1", "company", identity.companyNumber]) };
  if (identity.normalizedPhone !== null && identity.cardFingerprint !== null) return { status: "identified" as const,
    key: JSON.stringify(["free-first-job.v1", "phone_card", identity.normalizedPhone, "simulated", identity.cardFingerprint]) };
  return { status: "identity_required" as const, key: null };
}

const cardScope = { version: z.literal("free-first-job-card.v1"), environment, tenantId: id };
export const freeFirstJobCardV1 = z.discriminatedUnion("status", [
  z.object({ ...cardScope, status: z.literal("completed"), provider: z.literal("simulated"),
    reference: opaque.startsWith("sim_ref_"), fingerprint: opaque.startsWith("sim_fp_") }).strict(),
  z.object({ ...cardScope, status: z.literal("requested") }).strict(),
  z.object({ ...cardScope, status: z.literal("cancelled") }).strict(),
  z.object({ ...cardScope, status: z.literal("failed") }).strict(),
  z.object({ ...cardScope, status: z.literal("outcome_unknown") }).strict(),
  z.object({ ...cardScope, status: z.literal("redirect_only") }).strict(),
]).readonly();

export const freeFirstJobPreviewInputV1 = z.object({
  version: z.literal("free-first-job-preview.v1"), environment, tenantId: id, jobId: id,
  identity: freeFirstJobIdentityV1, priorLiveJobIds: z.array(id).max(10000).readonly(),
  consumedKeys: z.array(z.string().min(1).max(1000)).max(10000).readonly(), card: freeFirstJobCardV1.nullable(),
}).strict().refine(input => input.card === null || input.card.tenantId === input.tenantId,
  "Card must belong to the supplied tenant").readonly();
const previewFacts = {
  environment: "synthetic_demo" as const, hypothetical: true as const, realExternalActions: 0 as const,
  policyVersion: freeFirstJobReferencePolicyV1.version,
};

/** A proposal over supplied facts, NEVER an activation permission or consumed entitlement. */
export function previewFreeFirstJob(raw: unknown) {
  const input = parseFreeFirstJob(freeFirstJobPreviewInputV1, raw);
  const existing = input.priorLiveJobIds.includes(input.jobId);
  const first = input.priorLiveJobIds.length === 0;
  const keys = freeFirstJobKeys(input.identity);
  const trial = existing ? "existing_job" : !first ? "not_first_job" : keys.length === 0 ? "identity_required"
    : keys.some(key => input.consumedKeys.includes(key)) ? "already_consumed" : "candidate";
  const requiresCard = !existing && !first && input.card?.status !== "completed";
  return Object.freeze({
    ...previewFacts, version: "free-first-job-preview-result.v1" as const, activationAuthorized: false as const,
    trial, offerCard: first && input.card?.status !== "completed", offerSkip: first,
    cardGate: existing ? "existing_job" as const : requiresCard ? "card_required" as const
      : input.card?.status === "completed" ? "satisfied" as const : "first_job_optional" as const,
    nextAction: requiresCard ? "add_card" as const : null, label: requiresCard ? "Add a card" as const : null,
  });
}

const trialEvent = z.object({
  tenantId: id, jobId: id, kind: z.enum(["lock", "close", "switch_live"]), occurredAt: instant,
}).strict().readonly();
export const freeFirstJobEndPreviewInputV1 = z.object({
  version: z.literal("free-first-job-end-preview.v1"), environment, tenantId: id, jobId: id,
  startedAt: instant, now: instant, events: z.array(trialEvent).max(10000).readonly(),
}).strict().refine(input => input.now >= input.startedAt && input.events.every(event =>
  event.tenantId === input.tenantId && event.occurredAt >= input.startedAt &&
  (event.kind !== "switch_live" || event.jobId !== input.jobId || event.occurredAt === input.startedAt)),
"Events must be same-tenant facts after the immutable start; now cannot precede start").readonly();

/** Does not calculate a chargeable date, mutate history, schedule expiry or affect Final Check. */
export function previewFreeFirstJobEnd(raw: unknown) {
  const input = parseFreeFirstJob(freeFirstJobEndPreviewInputV1, raw);
  const deadlineAt = new Date(Date.parse(input.startedAt) + freeFirstJobReferencePolicyV1.trialDays * 86400000).toISOString();
  const candidates: { at: string; reason: "lock" | "close" | "day_90" | "second_job" }[] = [{ at: deadlineAt, reason: "day_90" }];
  for (const event of input.events) {
    if (event.kind === "switch_live" && event.jobId !== input.jobId) candidates.push({ at: event.occurredAt, reason: "second_job" });
    if (event.jobId === input.jobId && event.kind !== "switch_live") candidates.push({ at: event.occurredAt, reason: event.kind });
  }
  // Equal instants have one economic boundary; reason text uses stable lexical order only.
  candidates.sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0);
  const end = candidates[0]!;
  const active = end.at > input.now;
  return Object.freeze({ ...previewFacts, version: "free-first-job-end-preview-result.v1" as const,
    deadlineAt, active, endedAt: active ? null : end.at, endReason: active ? null : end.reason });
}
