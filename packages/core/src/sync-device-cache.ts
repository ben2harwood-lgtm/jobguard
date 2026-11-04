import { z } from "zod";
import { syncJobProjectionV1, syncProfileV1 } from "./sync-download.js";
import { mobileCleanupV1 } from "./mobile-auth.js";
import { planMobileCleanupV1 } from "./mobile-device-lifecycle.js";

const uuid = z.guid();
const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const scope = { userId: uuid, tenantId: uuid, profile: syncProfileV1 };
const unique = (ids: readonly string[]) => new Set(ids).size === ids.length;
const pendingV1 = z.object({ sequence: counter.positive(), kind: z.enum(["subscribe", "page"]), afterJobId: uuid.nullable() }).strict();

/** Local metadata only. A subscription is a boolean, never a credential or a claim of server authority. */
export const syncDeviceCacheV1 = z.object({
 version: z.literal("sync-device-cache.v1"), environment: z.literal("synthetic_demo"), ...scope,
 generation: counter, schemaVersion: counter.positive(), cursor: uuid.nullable(), subscribed: z.boolean(),
 sequence: counter, pending: pendingV1.nullable(), rows: z.array(syncJobProjectionV1).max(100000),
 purged: z.array(uuid),
}).strict().refine(s => unique(s.rows.map(r => r.jobId)) && unique(s.purged)
 && s.rows.every(r => !s.purged.includes(r.jobId))
 && (s.subscribed || s.cursor === null)
 && (!s.pending || (s.pending.sequence === s.sequence
  && s.pending.kind === (s.subscribed ? "page" : "subscribe") && s.pending.afterJobId === s.cursor)),
 { message: "inconsistent cache" });
export type SyncDeviceCacheV1 = z.infer<typeof syncDeviceCacheV1>;

export class SyncDeviceCacheError extends Error {
 constructor(readonly code: "SYNC_DEVICE_CACHE_INVALID_INPUT" | "SYNC_DEVICE_CACHE_STALE_VERSION") {
  super(code); this.name = "SyncDeviceCacheError";
 }
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
 const parsed = schema.safeParse(raw);
 if (!parsed.success) throw new SyncDeviceCacheError("SYNC_DEVICE_CACHE_INVALID_INPUT");
 return parsed.data;
}

const initialV1 = z.object({ ...scope, generation: counter, schemaVersion: counter.positive() }).strict();
export function createSyncDeviceCacheV1(raw: unknown): SyncDeviceCacheV1 {
 return { ...parse(initialV1, raw), version: "sync-device-cache.v1", environment: "synthetic_demo",
  cursor: null, subscribed: false, sequence: 0, pending: null, rows: [], purged: [] };
}

/** One in-flight request per partition. Retries reuse this pending request and the server-issued cursor.
 * The caller binds its response to this sequence; it must never relabel an old response as a new exchange. */
export function beginSyncDeviceRequestV1(raw: unknown): SyncDeviceCacheV1 {
 const state = parse(syncDeviceCacheV1, raw);
 if (state.pending) return state;
 if (state.sequence === Number.MAX_SAFE_INTEGER) throw new SyncDeviceCacheError("SYNC_DEVICE_CACHE_INVALID_INPUT");
 const sequence = state.sequence + 1;
 return { ...state, sequence, pending: { sequence, kind: state.subscribed ? "page" : "subscribe", afterJobId: state.cursor } };
}

// These are the existing server result fields, including identity-only tombstones. No server format is extended.
const answerV1 = z.object({
 version: z.literal("sync-server-download-result.v1"),
 page: z.object({
  version: z.literal("sync-download-decision.v1"), environment: z.literal("synthetic_demo"),
  outcome: z.enum(["allowed", "refused"]), reason: z.enum(["invalid_request", "authority_required", "source_invalid"]).nullable(),
  rows: z.array(syncJobProjectionV1).max(1000), admittedJobIds: z.array(uuid).max(100000),
  cleanup: z.enum(["none", "required"]), nextAfterJobId: uuid.nullable(),
 }).strict(),
 cleanup: z.object({
  version: z.literal("sync-reconcile-plan.v1"), environment: z.literal("synthetic_demo"),
  outcome: z.enum(["in_sync", "cleanup_required", "hold"]),
  tombstones: z.array(z.object({ jobId: uuid }).strict()).max(100000), keep: z.array(uuid).max(100000),
 }).strict(),
 resync: z.enum(["required", "none"]),
}).strict().refine(a => {
 const { page, cleanup } = a;
 if (!unique(page.admittedJobIds) || !unique(page.rows.map(r => r.jobId)) || !unique(cleanup.keep)
  || !unique(cleanup.tombstones.map(t => t.jobId))) return false;
 if (cleanup.tombstones.some(t => cleanup.keep.includes(t.jobId))) return false;
 if (cleanup.outcome === "hold") return page.outcome === "refused" && page.reason === "invalid_request"
  && page.cleanup === "none" && page.rows.length === 0 && page.admittedJobIds.length === 0
  && page.nextAfterJobId === null && cleanup.tombstones.length === 0 && a.resync === "required";
 if (cleanup.outcome !== (cleanup.tombstones.length ? "cleanup_required" : "in_sync")) return false;
 if (cleanup.keep.some(id => !page.admittedJobIds.includes(id))
  || cleanup.tombstones.some(t => page.admittedJobIds.includes(t.jobId))) return false;
 if (page.outcome === "refused") return page.reason !== null && page.rows.length === 0
  && page.nextAfterJobId === null && a.resync === "required"
  && page.cleanup === "required" && page.reason !== "invalid_request"
  && (page.reason !== "authority_required" || page.admittedJobIds.length === 0);
 return page.reason === null && page.cleanup === "none" && a.resync === "none"
  && page.rows.every(r => page.admittedJobIds.includes(r.jobId))
  && page.rows.every((r, i) => i === 0 || page.rows[i - 1]!.jobId < r.jobId)
  && (page.nextAfterJobId === null || page.nextAfterJobId === page.rows.at(-1)?.jobId);
}, { message: "inconsistent answer" });

/** Trusted transport facts, NOT fields added to the server response. Obtain identity/generation from
 * the authenticated subscription and schemaVersion from the server configuration/checkpoint. The seven
 * row fields carry no user/tenant identity. This pure specimen authenticates none of these assertions. */
const applyV1 = z.object({
 state: syncDeviceCacheV1,
 receipt: z.object({ ...scope, sequence: counter.positive(), generation: counter, schemaVersion: counter.positive() }).strict(),
 answer: answerV1,
}).strict();

function reset(state: SyncDeviceCacheV1): SyncDeviceCacheV1 {
 return { ...state, rows: [], purged: [...new Set([...state.purged, ...state.rows.map(r => r.jobId)])].sort(),
  cursor: null, subscribed: false, pending: null };
}

/** Applies a single authenticated exchange to the logical cache only. Never proves physical erasure. */
export function applySyncDeviceAnswerV1(raw: unknown): SyncDeviceCacheV1 {
 const { state, receipt, answer } = parse(applyV1, raw);
 if (receipt.userId !== state.userId || receipt.tenantId !== state.tenantId || receipt.profile !== state.profile) return state;
 if (receipt.generation < state.generation || receipt.schemaVersion < state.schemaVersion) {
  throw new SyncDeviceCacheError("SYNC_DEVICE_CACHE_STALE_VERSION");
 }
 if (!state.pending || receipt.sequence !== state.pending.sequence) return state;
 if (receipt.schemaVersion !== state.schemaVersion) {
  return { ...reset(state), generation: receipt.generation, schemaVersion: receipt.schemaVersion };
 }
 if (receipt.generation !== state.generation && state.pending.kind !== "subscribe") {
  return { ...reset(state), generation: receipt.generation };
 }
 const base = receipt.generation === state.generation ? state : { ...reset(state), generation: receipt.generation };
 const { page, cleanup } = answer;
 const admitted = new Set(page.admittedJobIds);
 const removed = new Set(cleanup.tombstones.map(t => t.jobId));
 // Full-current-projection admittedJobIds is NOT just the current page. Fail closed for omitted cleanup too.
 for (const row of base.rows) if (cleanup.outcome !== "hold" && !admitted.has(row.jobId)) removed.add(row.jobId);
 const purged = new Set([...base.purged, ...removed]);
 const rows = new Map(base.rows.filter(r => !removed.has(r.jobId)).map(r => [r.jobId, r]));
 if (answer.resync === "required") {
  return { ...base, rows: [...rows.values()], purged: [...purged].sort(), cursor: null, subscribed: false, pending: null };
 }
 if (page.rows.some(r => removed.has(r.jobId)
  || (state.pending!.afterJobId !== null && r.jobId <= state.pending!.afterJobId))) {
  throw new SyncDeviceCacheError("SYNC_DEVICE_CACHE_INVALID_INPUT");
 }
 // Only a fresh, bound answer may remove a purge marker. Old answers/cursors never reach this point.
 for (const row of page.rows) { rows.set(row.jobId, row); purged.delete(row.jobId); }
 return { ...base, rows: [...rows.values()].sort((a, b) => a.jobId.localeCompare(b.jobId)), purged: [...purged].sort(),
  cursor: page.nextAfterJobId, subscribed: true, pending: null };
}

const partitionV1 = z.object({ state: syncDeviceCacheV1, cleanup: mobileCleanupV1, next: initialV1.nullable() }).strict();
/** Switching hides the old logical scope immediately. The existing cleanup planner alone specifies
 * old-partition obligations (including unsynced-work holds); no queue, database, file or key is deleted. */
export function partitionSyncDeviceCacheV1(raw: unknown) {
 const { state, cleanup, next } = parse(partitionV1, raw);
 if (cleanup.partition.userId !== state.userId || cleanup.partition.tenantId !== state.tenantId) {
  throw new SyncDeviceCacheError("SYNC_DEVICE_CACHE_INVALID_INPUT");
 }
 return { state: next ? { ...createSyncDeviceCacheV1(next), sequence: state.sequence } : null,
  cleanup: planMobileCleanupV1(cleanup) };
}
