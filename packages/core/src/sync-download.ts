import { z } from "zod";

const uuid = z.guid({ error: "Invalid uuid" });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
/** Whole seconds since the epoch (JWT NumericDate). Milliseconds are never accepted under these names. */
const seconds = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const head = { environment: z.literal("synthetic_demo") };

/** The only profile this slice understands: the existing contractor assigned-job field set. Any other profile is refused. */
export const syncProfileV1 = z.literal("contractor_assigned_jobs.v1");
/** Roles the existing site-visit read admits. Anything else receives nothing. */
const syncRoles: readonly string[] = ["operative", "supervisor"];

/** A selector only. A job list can narrow the result, never widen it; there is no tenant, actor or role field. */
export const syncSubscriptionRequestV1 = z.object({
 version: z.literal("sync-subscription-request.v1"), requestedTenantId: uuid, profile: syncProfileV1,
 jobIds: z.array(uuid).max(1000).optional(),
}).strict();

/** Facts about the authenticated principal, supplied by the server after it rechecked current membership. Never request data. */
export const syncAuthorityFactsV1 = z.object({
 userId: uuid, tenantId: uuid, membershipId: uuid, role: z.string().min(1).max(50), status: z.string().min(1).max(50),
 assignedJobIds: z.array(uuid).max(100000),
}).strict();

/** Replication rows may be wider than the profile; unknown fields are tolerated here and never copied out. */
const syncSourceRowV1 = z.object({ tenantId: uuid, jobId: uuid }).passthrough();

/** Authority is parsed separately so that a missing or malformed value is an authority refusal, never an invalid request. */
export const syncDownloadFactsV1 = z.object({
 version: z.literal("sync-download-facts.v1"), ...head, request: syncSubscriptionRequestV1,
 authority: z.unknown().optional(), source: z.array(syncSourceRowV1).max(200000),
}).strict();

export const syncJobProjectionV1 = z.object({
 jobId: uuid, workOrderId: uuid, reference: z.string().min(1).max(100), priority: z.enum(["routine", "urgent", "emergency"]),
 issuedOn: day, dueOn: day.nullable(), openVisitId: uuid.nullable(),
}).strict();
export type SyncJobProjectionV1 = z.infer<typeof syncJobProjectionV1>;
const projectionFields = ["jobId", "workOrderId", "reference", "priority", "issuedOn", "dueOn", "openVisitId"] as const;

export type SyncRefusalReasonV1 = "invalid_request" | "authority_required" | "source_invalid";
export interface SyncDownloadDecisionV1 {
 readonly version: "sync-download-decision.v1";
 readonly environment: "synthetic_demo";
 readonly outcome: "allowed" | "refused";
 readonly reason: SyncRefusalReasonV1 | null;
 readonly rows: readonly SyncJobProjectionV1[];
 /** Job ids current authority still admits (identity only). Lets cleanup run even when a download is refused for source quality. */
 readonly admittedJobIds: readonly string[];
 readonly cleanup: "none" | "required";
}

/** Bounded classification only: no Zod issues, raw input, tokens or provider details. */
export class SyncDownloadContractError extends Error {
 constructor(readonly code: "SYNC_DOWNLOAD_INVALID_INPUT") { super(code); this.name = "SyncDownloadContractError"; }
}

export function parseSyncSubscriptionRequestV1(raw: unknown): z.infer<typeof syncSubscriptionRequestV1> {
 const result = syncSubscriptionRequestV1.safeParse(raw);
 if (!result.success) throw new SyncDownloadContractError("SYNC_DOWNLOAD_INVALID_INPUT");
 return result.data;
}

function refuse(reason: SyncRefusalReasonV1, admittedJobIds: readonly string[] = []): SyncDownloadDecisionV1 {
 return { version: "sync-download-decision.v1", environment: "synthetic_demo", outcome: "refused", reason, rows: [], admittedJobIds, cleanup: reason === "invalid_request" ? "none" : "required" };
}

/**
 * A pure specimen of the download policy, evaluated over explicit facts. It authenticates nobody, signs nothing and is
 * never a substitute for the provider's own stream rules or for server revalidation. Every refusal about authority is identical.
 */
export function evaluateSyncDownloadV1(raw: unknown): SyncDownloadDecisionV1 {
 const parsed = syncDownloadFactsV1.safeParse(raw);
 if (!parsed.success) return refuse("invalid_request");
 const { request, source } = parsed.data;
 const authorityParse = syncAuthorityFactsV1.safeParse(parsed.data.authority);
 // Missing, undefined or malformed authority is a loss of authority: identical refusal, local cleanup required.
 if (!authorityParse.success) return refuse("authority_required");
 const authority = authorityParse.data;
 if ( authority.status !== "active" || !syncRoles.includes(authority.role)
  || authority.tenantId !== request.requestedTenantId) return refuse("authority_required");
 const assigned = new Set(authority.assignedJobIds);
 const narrow = request.jobIds ? new Set(request.jobIds) : null;
 const rows: SyncJobProjectionV1[] = [];
 const admitted = new Set<string>();
 let duplicate = false;
 let invalid = false;
 for (const row of source) {
  if (row.tenantId !== authority.tenantId || !assigned.has(row.jobId) || (narrow && !narrow.has(row.jobId))) continue;
  if (admitted.has(row.jobId)) duplicate = true;
  admitted.add(row.jobId);
  const picked: Record<string, unknown> = {};
  for (const field of projectionFields) picked[field] = row[field];
  const projection = syncJobProjectionV1.safeParse(picked);
  if (!projection.success) invalid = true; else rows.push(projection.data);
 }
 // Fail closed for downloads, but keep the authority-admitted ids so cleanup of removed assignments still happens.
 if (invalid || duplicate) return refuse("source_invalid", [...admitted].sort());
 rows.sort((a, b) => (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0));
 return { version: "sync-download-decision.v1", environment: "synthetic_demo", outcome: "allowed", reason: null, rows, admittedJobIds: rows.map(r => r.jobId), cleanup: "none" };
}

export interface SyncPageV1 extends SyncDownloadDecisionV1 { readonly nextAfterJobId: string | null }

/** Stable keyset pages over the current decision. Repeating a cursor returns the same rows; each page re-evaluates current authority. */
export function pageSyncDownloadV1(input: { facts: unknown; afterJobId: string | null; pageSize: number }): SyncPageV1 {
 const args = z.object({ afterJobId: uuid.nullable(), pageSize: z.number().int().min(1).max(1000) }).safeParse({ afterJobId: input.afterJobId, pageSize: input.pageSize });
 if (!args.success) throw new SyncDownloadContractError("SYNC_DOWNLOAD_INVALID_INPUT");
 const decision = evaluateSyncDownloadV1(input.facts);
 if (decision.outcome === "refused") return { ...decision, nextAfterJobId: null };
 const rest = args.data.afterJobId === null ? decision.rows : decision.rows.filter(r => r.jobId > args.data.afterJobId!);
 const rows = rest.slice(0, args.data.pageSize);
 return { ...decision, rows, nextAfterJobId: rest.length > rows.length ? rows[rows.length - 1]!.jobId : null };
}

const syncDecisionInputV1 = z.object({
 version: z.literal("sync-download-decision.v1"), ...head, outcome: z.enum(["allowed", "refused"]),
 reason: z.enum(["invalid_request", "authority_required", "source_invalid"]).nullable(),
 rows: z.array(syncJobProjectionV1), admittedJobIds: z.array(uuid).max(100000), cleanup: z.enum(["none", "required"]),
}).strict().refine(d => {
 if (d.outcome === "allowed") return d.reason === null && d.cleanup === "none" && d.admittedJobIds.length === d.rows.length && d.rows.every(r => d.admittedJobIds.includes(r.jobId));
 if (d.rows.length > 0 || d.reason === null) return false;
 if (d.reason === "authority_required") return d.cleanup === "required" && d.admittedJobIds.length === 0;
 if (d.reason === "source_invalid") return d.cleanup === "required";
 return d.cleanup === "none" && d.admittedJobIds.length === 0;
}, { message: "inconsistent decision" });
export const syncReconcileInputV1 = z.object({ version: z.literal("sync-reconcile.v1"), delivered: z.array(uuid).max(100000), decision: syncDecisionInputV1 }).strict();

export interface SyncReconcilePlanV1 {
 readonly version: "sync-reconcile-plan.v1";
 readonly environment: "synthetic_demo";
 readonly outcome: "in_sync" | "cleanup_required" | "hold";
 /** Identity only: a tombstone never carries removed content and never deletes authoritative history. */
 readonly tombstones: readonly { readonly jobId: string }[];
 readonly keep: readonly string[];
}

/** Obligations only: which delivered identities must be removed locally. Producing the plan proves no device cleaned anything. */
export function planSyncReconcileV1(raw: unknown): SyncReconcilePlanV1 {
 const parsed = syncReconcileInputV1.safeParse(raw);
 if (!parsed.success) throw new SyncDownloadContractError("SYNC_DOWNLOAD_INVALID_INPUT");
 const { decision } = parsed.data;
 const delivered = [...new Set(parsed.data.delivered)];
 const base = { version: "sync-reconcile-plan.v1", environment: "synthetic_demo" } as const;
 if (decision.outcome === "refused" && decision.cleanup !== "required") return { ...base, outcome: "hold", tombstones: [], keep: [...delivered] };
 const permitted = new Set(decision.admittedJobIds);
 const tombstones = delivered.filter(id => !permitted.has(id)).map(jobId => ({ jobId }));
 return { ...base, outcome: tombstones.length > 0 ? "cleanup_required" : "in_sync", tombstones, keep: delivered.filter(id => permitted.has(id)) };
}

/** Claims name who and what, never a role, secret or business authority. Times are whole seconds (JWT NumericDate); lifetimes are explicit inputs: no default exists. */
export const syncTokenClaimsV1 = z.object({
 version: z.literal("sync-token-claims.v1"), ...head, sub: uuid, tenantId: uuid, membershipId: uuid, profile: syncProfileV1,
 generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), aud: z.string().min(1).max(100), iat: seconds, exp: seconds,
}).strict().refine(c => c.exp > c.iat, { message: "expiry must follow issue time", path: ["exp"] });
export type SyncTokenClaimsV1 = z.infer<typeof syncTokenClaimsV1>;

const syncTokenInputV1 = z.object({
 version: z.literal("sync-token-input.v1"), ...head, facts: z.unknown().optional(), generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
 issuedAtSeconds: seconds, expiresAtSeconds: seconds, audience: z.string().min(1).max(100),
}).strict();

/** Derives claim content only. It signs nothing and issues no credential; current authority must already allow the subscription. */
export function deriveSyncTokenClaimsV1(raw: unknown): SyncTokenClaimsV1 {
 const input = syncTokenInputV1.safeParse(raw);
 if (!input.success) throw new SyncDownloadContractError("SYNC_DOWNLOAD_INVALID_INPUT");
 const facts = syncDownloadFactsV1.safeParse(input.data.facts);
 const authority = facts.success ? syncAuthorityFactsV1.safeParse(facts.data.authority) : null;
 if (!facts.success || !authority?.success || evaluateSyncDownloadV1(facts.data).outcome !== "allowed") throw new SyncDownloadContractError("SYNC_DOWNLOAD_INVALID_INPUT");
 const claims = syncTokenClaimsV1.safeParse({
  version: "sync-token-claims.v1", environment: "synthetic_demo", sub: authority.data.userId, tenantId: authority.data.tenantId,
  membershipId: authority.data.membershipId, profile: facts.data.request.profile, generation: input.data.generation,
  aud: input.data.audience, iat: input.data.issuedAtSeconds, exp: input.data.expiresAtSeconds,
 });
 if (!claims.success) throw new SyncDownloadContractError("SYNC_DOWNLOAD_INVALID_INPUT");
 return claims.data;
}
