import { describe, expect, it } from "vitest";
import {
 SyncDownloadContractError, deriveSyncTokenClaimsV1, evaluateSyncDownloadV1, pageSyncDownloadV1, parseSyncSubscriptionRequestV1,
 planSyncReconcileV1, syncSubscriptionRequestV1, syncTokenClaimsV1,
} from "./sync-download.js";

const uid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000001`;
const T1 = uid(1), T2 = uid(2), USER = uid(10), MEMBER = uid(11);
const job = (n: number, tenantId = T1, extra: Record<string, unknown> = {}) => ({
 tenantId, jobId: uid(1000 + n), workOrderId: uid(5000 + n), reference: `WO-${n}`, priority: "routine", issuedOn: "2026-10-01", dueOn: null, openVisitId: null, ...extra,
});
const canary = { residentName: "Canary Resident", residentPhone: "canary-phone", address: "1 Canary Road", price: "99.00", bankAccount: "canary-account", sessionToken: "canary", providerSecret: "canary", shadowSignal: "canary" };
const authority = (over: Record<string, unknown> = {}) => ({ userId: USER, tenantId: T1, membershipId: MEMBER, role: "operative", status: "active", assignedJobIds: [uid(1001), uid(1002)], ...over });
const request = (over: Record<string, unknown> = {}) => ({ version: "sync-subscription-request.v1", requestedTenantId: T1, profile: "contractor_assigned_jobs.v1", ...over });
const facts = (over: Record<string, unknown> = {}) => ({
 version: "sync-download-facts.v1", environment: "synthetic_demo", request: request(), authority: authority(),
 source: [job(1, T1, canary), job(2), job(3), job(1001, T2, canary), job(4, T2)], ...over,
});

describe("M3-3 synthetic download policy (pure slice)", () => {
 it("M33-S01 request is strict: client authority fields and unissued profiles are refused", () => {
  expect(parseSyncSubscriptionRequestV1(request())).toEqual(request());
  for (const field of ["tenantId", "actor", "userId", "role", "membershipId", "permission", "query", "where", "sql", "environment"]) {
   expect(syncSubscriptionRequestV1.safeParse(request({ [field]: "tampered" })).success).toBe(false);
  }
  for (const value of [null, {}, [], request({ version: "sync-subscription-request.v2" }), request({ requestedTenantId: "invalid" })]) {
   expect(() => parseSyncSubscriptionRequestV1(value)).toThrow(SyncDownloadContractError);
  }
  for (const profile of ["small_builder.v1", "contractor_all_jobs.v1", "", "*"]) {
   const d = evaluateSyncDownloadV1(facts({ request: request({ profile }) }));
   expect(d).toMatchObject({ outcome: "refused", reason: "invalid_request", rows: [] });
  }
 });

 it("M33-S02 only assigned rows of the verified tenant are delivered and only named fields", () => {
  const d = evaluateSyncDownloadV1(facts());
  expect(d.outcome).toBe("allowed");
  expect(d.rows.map(r => r.jobId)).toEqual([uid(1001), uid(1002)]);
  expect(Object.keys(d.rows[0]!).sort()).toEqual(["dueOn", "issuedOn", "jobId", "openVisitId", "priority", "reference", "workOrderId"]);
  const text = JSON.stringify(d);
  for (const value of Object.values(canary)) expect(text).not.toContain(String(value));
  expect(text).not.toContain(T2);
 });

 it("M33-S03 asking for another tenant or another job never widens the result", () => {
  for (const requestedTenantId of [T2, uid(99)]) {
   const d = evaluateSyncDownloadV1(facts({ request: request({ requestedTenantId }) }));
   expect(d).toMatchObject({ outcome: "refused", reason: "authority_required", rows: [] });
  }
  // The same-tenant job selector can only narrow.
  const narrowed = evaluateSyncDownloadV1(facts({ request: request({ jobIds: [uid(1001), uid(1003), uid(1001001)] }) }));
  expect(narrowed.rows.map(r => r.jobId)).toEqual([uid(1001)]);
  // Another tenant's job id that happens to be assigned in the facts is still not delivered.
  const crossed = evaluateSyncDownloadV1(facts({ authority: authority({ assignedJobIds: [uid(1001)] }), source: [job(1001, T2, canary)] }));
  expect(crossed.rows).toEqual([]);
 });

 it("M33-S04 inactive, expired or unknown authority gets one identical refusal", () => {
  const base = evaluateSyncDownloadV1(facts({ authority: authority({ status: "revoked" }) }));
  for (const status of ["revoked", "expired", "unknown", "suspended"]) {
   expect(evaluateSyncDownloadV1(facts({ authority: authority({ status }) }))).toEqual(base);
  }
  expect(evaluateSyncDownloadV1(facts({ authority: authority({ tenantId: T2 }) }))).toEqual(base);
  expect(evaluateSyncDownloadV1(facts({ authority: null }))).toEqual(base);
  expect(base).toEqual({ version: "sync-download-decision.v1", environment: "synthetic_demo", outcome: "refused", reason: "authority_required", rows: [], cleanup: "required" });
  // Roles outside the issued profile get nothing, with the same shape.
  expect(evaluateSyncDownloadV1(facts({ authority: authority({ role: "viewer" }) }))).toEqual(base);
 });

 it("M33-S05 policy is independent of the replication source: a wider source changes nothing", () => {
  const wide = evaluateSyncDownloadV1(facts());
  const narrow = evaluateSyncDownloadV1(facts({ source: [job(1), job(2)] }));
  expect(wide.rows).toEqual(narrow.rows);
  const malformed = evaluateSyncDownloadV1(facts({ source: [job(1, T1, { priority: "banana" })] }));
  expect(malformed).toMatchObject({ outcome: "refused", reason: "source_invalid", rows: [] });
  expect(JSON.stringify(malformed)).not.toContain("banana");
 });

 it("M33-S06 membership loss or tenant switch yields tombstones by identity only, and rebuild never restores them", () => {
  const delivered = [uid(1001), uid(1002), uid(1003)];
  const lost = planSyncReconcileV1({ version: "sync-reconcile.v1", delivered, decision: evaluateSyncDownloadV1(facts({ authority: authority({ status: "revoked" }) })) });
  expect(lost).toMatchObject({ outcome: "cleanup_required", tombstones: delivered.map(jobId => ({ jobId })), keep: [] });
  expect(JSON.stringify(lost)).not.toContain("WO-");
  const assignmentRemoved = planSyncReconcileV1({ version: "sync-reconcile.v1", delivered, decision: evaluateSyncDownloadV1(facts({ authority: authority({ assignedJobIds: [uid(1002)] }) })) });
  expect(assignmentRemoved.tombstones).toEqual([{ jobId: uid(1001) }, { jobId: uid(1003) }]);
  expect(assignmentRemoved.keep).toEqual([uid(1002)]);
  // Rebuild is the current decision only: a purged identity is absent unless current authority admits it.
  const rebuilt = evaluateSyncDownloadV1(facts({ authority: authority({ assignedJobIds: [uid(1002)] }) }));
  expect(rebuilt.rows.map(r => r.jobId)).toEqual([uid(1002)]);
  expect(() => planSyncReconcileV1({ version: "sync-reconcile.v1", delivered: ["x"], decision: lost })).toThrow(SyncDownloadContractError);
 });

 it("M33-S07 a large initial sync pages stably, resumes after interruption and converges", () => {
  const eligible = Array.from({ length: 401 }, (_, i) => job(i + 1));
  const ineligible = Array.from({ length: 50 }, (_, i) => job(10000 + i, T2));
  const f = facts({ authority: authority({ assignedJobIds: eligible.map(j => j.jobId) }), source: [...ineligible, ...eligible].reverse() });
  const all: string[] = [];
  let after: string | null = null;
  for (let i = 0; i < 100; i += 1) {
   const page = pageSyncDownloadV1({ facts: f, afterJobId: after, pageSize: 100 });
   expect(page.outcome).toBe("allowed");
   all.push(...page.rows.map(r => r.jobId));
   if (i === 1) { // interrupted: the client repeats the previous cursor and may receive repeats
    const repeat = pageSyncDownloadV1({ facts: f, afterJobId: after, pageSize: 100 });
    expect(repeat.rows).toEqual(page.rows);
   }
   after = page.nextAfterJobId;
   if (after === null) break;
  }
  expect(all).toHaveLength(401);
  expect(new Set(all).size).toBe(401);
  expect([...all].sort()).toEqual(all);
  expect(all.every(id => eligible.some(j => j.jobId === id))).toBe(true);
  expect(() => pageSyncDownloadV1({ facts: f, afterJobId: null, pageSize: 0 })).toThrow(SyncDownloadContractError);
  expect(() => pageSyncDownloadV1({ facts: f, afterJobId: null, pageSize: 1001 })).toThrow(SyncDownloadContractError);
  // Authority lost between pages: the next page is the identical refusal, no rows.
  const lostMidway = pageSyncDownloadV1({ facts: { ...f, authority: authority({ status: "revoked" }) }, afterJobId: all[99]!, pageSize: 100 });
  expect(lostMidway).toMatchObject({ outcome: "refused", rows: [], nextAfterJobId: null });
 });

 it("M33-S08 token claims come from validated facts, carry no secrets and never lifetimes by default", () => {
  const input = { version: "sync-token-input.v1", environment: "synthetic_demo", facts: facts(), generation: 3, issuedAtMs: 100, expiresAtMs: 200, audience: "synthetic-sync-audience" };
  const claims = deriveSyncTokenClaimsV1(input);
  expect(claims).toEqual({ version: "sync-token-claims.v1", environment: "synthetic_demo", sub: USER, tenantId: T1, membershipId: MEMBER, profile: "contractor_assigned_jobs.v1", generation: 3, aud: "synthetic-sync-audience", iat: 100, exp: 200 });
  expect(syncTokenClaimsV1.safeParse({ ...claims, role: "owner" }).success).toBe(false);
  expect(syncTokenClaimsV1.safeParse({ ...claims, exp: 100 }).success).toBe(false);
  for (const bad of [{ expiresAtMs: undefined }, { expiresAtMs: 100 }, { generation: -1 }, { audience: "" }, { facts: facts({ authority: authority({ status: "revoked" }) }) }, { facts: facts({ request: request({ requestedTenantId: T2 }) }) }]) {
   expect(() => deriveSyncTokenClaimsV1({ ...input, ...bad })).toThrow(SyncDownloadContractError);
  }
  expect(JSON.stringify(claims)).not.toMatch(/secret|password|bank|resident|refresh/iu);
 });

 it("M33-S09 bounded errors and decisions leak no raw input", () => {
  try { parseSyncSubscriptionRequestV1(request({ requestedTenantId: "leaky-canary-value" })); expect.fail("accepted"); }
  catch (error) {
   expect(error).toMatchObject({ code: "SYNC_DOWNLOAD_INVALID_INPUT", message: "SYNC_DOWNLOAD_INVALID_INPUT" });
   expect(String(error) + JSON.stringify(error)).not.toContain("leaky-canary-value");
   expect(error).not.toHaveProperty("issues"); expect(error).not.toHaveProperty("cause");
  }
  const d = evaluateSyncDownloadV1(facts({ environment: "production" }));
  expect(d).toMatchObject({ outcome: "refused", reason: "invalid_request", rows: [] });
  expect(d.environment).toBe("synthetic_demo");
 });
});
