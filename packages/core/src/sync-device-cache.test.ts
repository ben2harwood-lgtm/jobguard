import { describe, expect, it } from "vitest";
import {
 applySyncDeviceAnswerV1, beginSyncDeviceRequestV1, createSyncDeviceCacheV1,
 partitionSyncDeviceCacheV1, syncDeviceCacheV1, type SyncDeviceCacheV1,
} from "./sync-device-cache.js";
import { evaluateSyncDownloadV1, pageSyncDownloadV1, planSyncReconcileV1 } from "./sync-download.js";

const uid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000001`;
const scope = { userId: uid(1), tenantId: uid(2), profile: "contractor_assigned_jobs.v1" as const };
const initial = () => createSyncDeviceCacheV1({ ...scope, generation: 1, schemaVersion: 1 });
const job = (n: number) => ({ jobId: uid(1000 + n), workOrderId: uid(5000 + n), reference: `SYNTH-${n}`,
 priority: "routine", issuedOn: "2026-11-01", dueOn: null, openVisitId: null });
function answer(state: SyncDeviceCacheV1, ids = [1, 2], options: { status?: string; role?: string; pageSize?: number } = {}) {
 const facts = { version: "sync-download-facts.v1", environment: "synthetic_demo",
  request: { version: "sync-subscription-request.v1", requestedTenantId: scope.tenantId, profile: scope.profile },
  authority: { userId: scope.userId, tenantId: scope.tenantId, membershipId: uid(3), role: options.role ?? "operative", status: options.status ?? "active",
   assignedJobIds: ids.map(n => job(n).jobId) }, source: ids.map(n => ({ tenantId: scope.tenantId, ...job(n) })) };
 const decision = evaluateSyncDownloadV1(facts);
 return { version: "sync-server-download-result.v1", page: pageSyncDownloadV1({ facts,
  afterJobId: state.pending!.afterJobId, pageSize: options.pageSize ?? 100 }),
 cleanup: planSyncReconcileV1({ version: "sync-reconcile.v1", delivered: state.rows.map(r => r.jobId), decision }),
 resync: decision.outcome === "refused" ? "required" : "none" };
}
function exchange(state: SyncDeviceCacheV1, ids = [1, 2], options: Parameters<typeof answer>[2] = {}) {
 const pending = beginSyncDeviceRequestV1(state);
 const input = { state: pending, receipt: { ...scope, sequence: pending.sequence, generation: pending.generation,
  schemaVersion: pending.schemaVersion }, answer: answer(pending, ids, options) };
 return { input, state: applySyncDeviceAnswerV1(input) };
}
const cleanup = (unsyncedWork: "none" | "present" | "unknown", reason = "tenant_switch") => ({
 version: "mobile-cleanup.v1", reason, unsyncedWork,
 partition: { userId: scope.userId, tenantId: scope.tenantId, membershipId: uid(3), mobileSessionId: uid(4), deviceInstanceId: "fictional-device" },
});

describe("M3-3 synthetic device cache rules", () => {
 it("accepts only the strict versioned seven-field projection and local metadata", () => {
  const state = exchange(initial()).state;
  expect(syncDeviceCacheV1.safeParse(state).success).toBe(true);
  expect(Object.keys(state.rows[0]!)).toEqual(Object.keys(job(1)));
  for (const field of ["token", "credential", "resident", "address", "price", "bank", "shadow", "selector"]) {
   expect(syncDeviceCacheV1.safeParse({ ...state, [field]: "canary" }).success).toBe(false);
   expect(syncDeviceCacheV1.safeParse({ ...state, rows: [{ ...state.rows[0], [field]: "canary" }] }).success).toBe(false);
  }
  expect(syncDeviceCacheV1.safeParse({ ...state, environment: "production" }).success).toBe(false);
  expect(syncDeviceCacheV1.safeParse({ ...state, version: "sync-device-cache.v2" }).success).toBe(false);
  expect(syncDeviceCacheV1.safeParse({ ...state, rows: [...state.rows, state.rows[0]] }).success).toBe(false);
 });

 it("upserts fresh rows, repeats pages safely and never mutates input", () => {
  const first = exchange(initial());
  const snapshot = JSON.stringify(first.input);
  expect(applySyncDeviceAnswerV1(first.input)).toEqual(first.state);
  expect(JSON.stringify(first.input)).toBe(snapshot);
  expect(applySyncDeviceAnswerV1({ ...first.input, state: first.state })).toEqual(first.state);
  const pending = beginSyncDeviceRequestV1(first.state);
  const update = answer(pending); update.page.rows[0]!.reference = "SYNTH-UPDATED";
  const next = applySyncDeviceAnswerV1({ ...first.input, state: pending, receipt: { ...first.input.receipt, sequence: pending.sequence }, answer: update });
  expect(next.rows).toHaveLength(2);
  expect(next.rows[0]!.reference).toBe("SYNTH-UPDATED");
 });

 it("refuses a whole mismatched scope or a wide/malformed row without applying cleanup", () => {
  const first = exchange(initial()).state;
  const revoked = exchange(first, [], { status: "revoked" });
  for (const change of [{ tenantId: uid(9) }, { userId: uid(9) }]) {
   expect(applySyncDeviceAnswerV1({ ...revoked.input, receipt: { ...revoked.input.receipt, ...change } })).toEqual(revoked.input.state);
  }
  const wide = exchange(first).input;
  expect(() => applySyncDeviceAnswerV1({ ...wide, answer: { ...wide.answer,
   page: { ...wide.answer.page, rows: [{ ...job(1), tenantId: uid(9) }] } } })).toThrow("SYNC_DEVICE_CACHE_INVALID_INPUT");
 });

 it("membership and role loss purge identities, cursor and subscription; old pages cannot restore them", () => {
  for (const options of [{ status: "revoked" }, { status: "expired" }, { role: "office" }]) {
   const first = exchange(initial());
   const revoked = exchange(first.state, [], options);
   expect(revoked.state).toMatchObject({ rows: [], cursor: null, subscribed: false, purged: [uid(1001), uid(1002)] });
   expect(applySyncDeviceAnswerV1({ ...first.input, state: revoked.state })).toEqual(revoked.state);
   const waiting = beginSyncDeviceRequestV1(revoked.state);
   expect(waiting.pending!.kind).toBe("subscribe");
   expect(applySyncDeviceAnswerV1({ ...first.input, state: waiting })).toEqual(waiting);
   // Fresh current authority may deliver it again, including within the same generation.
   expect(exchange(revoked.state, [1]).state).toMatchObject({ rows: [job(1)], purged: [uid(1002)], subscribed: true });
  }
 });

 it("identity-only tombstones are repeatable and an old page or cursor cannot resurrect a purge", () => {
  const first = exchange(initial());
  const removed = exchange(first.state, [2]);
  expect(removed.state.rows.map(r => r.jobId)).toEqual([uid(1002)]);
  expect(removed.state.purged).toEqual([uid(1001)]);
  expect(removed.input.answer.cleanup.tombstones).toEqual([{ jobId: uid(1001) }]);
  expect(applySyncDeviceAnswerV1({ ...removed.input, state: removed.state })).toEqual(removed.state);
  expect(applySyncDeviceAnswerV1({ ...first.input, state: beginSyncDeviceRequestV1(removed.state) })).toEqual(beginSyncDeviceRequestV1(removed.state));
  expect(removed.state).not.toHaveProperty("erased");
  expect(removed.state).not.toHaveProperty("deviceCleanupComplete");
 });

 it("schema upgrade clears then resubscribes, and lower schema/generation fail closed", () => {
  const first = exchange(initial());
  const pending = beginSyncDeviceRequestV1(first.state);
  const changed = { ...first.input, state: pending, receipt: { ...first.input.receipt, sequence: pending.sequence, generation: 2, schemaVersion: 2 }, answer: answer(pending) };
  const migrated = applySyncDeviceAnswerV1(changed);
  expect(migrated).toMatchObject({ rows: [], cursor: null, subscribed: false, schemaVersion: 2, generation: 2, purged: [uid(1001), uid(1002)] });
  for (const change of [{ generation: 1 }, { schemaVersion: 1 }]) {
   expect(() => applySyncDeviceAnswerV1({ ...changed, state: beginSyncDeviceRequestV1(migrated), receipt: { ...changed.receipt, ...change } })).toThrow("SYNC_DEVICE_CACHE_STALE_VERSION");
  }
  const subscribed = exchange(migrated, [2]).state;
  expect(subscribed.rows).toEqual([job(2)]);
  expect(subscribed.purged).toEqual([uid(1001)]);
  const newer = applySyncDeviceAnswerV1({ ...changed, receipt: { ...changed.receipt, schemaVersion: 1 } });
  expect(newer).toMatchObject({ rows: [], subscribed: false, generation: 2 });
 });

 it("partitions tenant switches, user changes and logout using the existing unsynced-work obligations", () => {
  const old = exchange(initial()).state;
  for (const unsyncedWork of ["none", "present", "unknown"] as const) {
   for (const nextScope of [{ ...scope, tenantId: uid(9) }, { ...scope, userId: uid(9) }]) {
    const next = partitionSyncDeviceCacheV1({ state: old, cleanup: cleanup(unsyncedWork), next: { ...nextScope, generation: 1, schemaVersion: 1 } });
    expect(next.state).toMatchObject({ rows: [], purged: [], subscribed: false, cursor: null, ...nextScope });
    expect(next.cleanup.outcome).toBe(unsyncedWork === "none" ? "cleanup_required" : "policy_hold");
    expect(next.cleanup.requiredResources).toEqual(["secure_keys", "database_cache", "media_cache", "sensitive_pending_content"]);
   }
   expect(partitionSyncDeviceCacheV1({ state: old, cleanup: cleanup(unsyncedWork, "logout"), next: null }).state).toBeNull();
  }
  expect(old.rows).toHaveLength(2);
  const returned = partitionSyncDeviceCacheV1({ state: old, cleanup: cleanup("present"), next: { ...scope, generation: 2, schemaVersion: 1 } }).state!;
  expect(applySyncDeviceAnswerV1({ ...exchange(initial()).input, state: beginSyncDeviceRequestV1(returned), receipt: { ...scope, sequence: 1, generation: 2, schemaVersion: 1 } })).toEqual(beginSyncDeviceRequestV1(returned));
 });

 it("401+ rows converge at every interruption boundary using only the issued cursor", () => {
  const ids = Array.from({ length: 417 }, (_, n) => n + 1);
  const uninterrupted: SyncDeviceCacheV1[] = [];
  let state = initial();
  do { state = exchange(state, ids).state; uninterrupted.push(state); } while (state.cursor !== null);
  for (let interrupt = 0; interrupt < uninterrupted.length; interrupt++) {
   state = initial();
   for (let page = 0; page < uninterrupted.length; page++) {
    let pending = beginSyncDeviceRequestV1(state);
    if (page === interrupt) {
     pending = syncDeviceCacheV1.parse(JSON.parse(JSON.stringify(pending)));
     expect(beginSyncDeviceRequestV1(pending)).toEqual(pending);
    }
    const input = { state: pending, receipt: { ...scope, sequence: pending.sequence, generation: 1, schemaVersion: 1 }, answer: answer(pending, ids) };
    state = applySyncDeviceAnswerV1(input);
    expect(applySyncDeviceAnswerV1({ ...input, state })).toEqual(state);
   }
   expect(state).toEqual(uninterrupted.at(-1));
   expect(state.rows).toHaveLength(417);
  }
 });

 it("property: arbitrary subsets, page sizes, deletion and stale replay preserve the permitted set", () => {
  for (let seed = 1; seed <= 40; seed++) {
   const ids = Array.from({ length: 30 }, (_, n) => n + 1).filter(n => (n * seed + 7) % 5 !== 0);
   let state = initial();
   do { state = exchange(state, ids, { pageSize: 1 + seed % 13 }).state; } while (state.cursor !== null);
   expect(state.rows.map(r => r.jobId)).toEqual(ids.map(n => job(n).jobId));
   const before = exchange(state, ids);
   const allowed = ids.filter(n => (n + seed) % 3 === 0);
   state = exchange(before.state, allowed).state;
   expect(state.rows.map(r => r.jobId)).toEqual(allowed.map(n => job(n).jobId));
   expect(applySyncDeviceAnswerV1({ ...before.input, state })).toEqual(state);
   expect(syncDeviceCacheV1.safeParse(state).success).toBe(true);
  }
 });

 it("source-quality refusal keeps only still-admitted identities and requires resubscription", () => {
  const first = exchange(initial()).state;
  const pending = beginSyncDeviceRequestV1(first);
  const result = answer(pending, [2]);
  result.page = { ...result.page, outcome: "refused", reason: "source_invalid", rows: [], cleanup: "required", nextAfterJobId: null };
  result.resync = "required";
  const next = applySyncDeviceAnswerV1({ state: pending, receipt: { ...scope, sequence: pending.sequence, generation: 1, schemaVersion: 1 }, answer: result });
  expect(next).toMatchObject({ rows: [job(2)], purged: [uid(1001)], subscribed: false, cursor: null });
 });

 it("invalid-request hold drops the subscription without pretending it received cleanup", () => {
  const first = exchange(initial()).state;
  const pending = beginSyncDeviceRequestV1(first);
  const next = applySyncDeviceAnswerV1({ state: pending, receipt: { ...scope, sequence: pending.sequence, generation: 1, schemaVersion: 1 },
   answer: { version: "sync-server-download-result.v1", resync: "required",
    page: { version: "sync-download-decision.v1", environment: "synthetic_demo", outcome: "refused", reason: "invalid_request",
     rows: [], admittedJobIds: [], cleanup: "none", nextAfterJobId: null },
    cleanup: { version: "sync-reconcile-plan.v1", environment: "synthetic_demo", outcome: "hold", tombstones: [], keep: first.rows.map(r => r.jobId) } } });
  expect(next).toMatchObject({ rows: first.rows, subscribed: false, cursor: null, purged: [] });
 });

 it("client selectors/cursors and receipt extras confer no authority", () => {
  const { input } = exchange(initial());
  for (const field of ["selector", "afterJobId", "role", "token"]) {
   expect(() => applySyncDeviceAnswerV1({ ...input, [field]: "tampered" })).toThrow("SYNC_DEVICE_CACHE_INVALID_INPUT");
   expect(() => applySyncDeviceAnswerV1({ ...input, receipt: { ...input.receipt, [field]: "tampered" } })).toThrow("SYNC_DEVICE_CACHE_INVALID_INPUT");
  }
  const changed = { ...input.state, cursor: uid(9999) };
  expect(() => beginSyncDeviceRequestV1(changed)).toThrow("SYNC_DEVICE_CACHE_INVALID_INPUT");
  expect(() => applySyncDeviceAnswerV1({ ...input, answer: { ...input.answer, page: { ...input.answer.page, rows: [{ ...job(1), price: 10 }] } } })).toThrow("SYNC_DEVICE_CACHE_INVALID_INPUT");
 });
});
