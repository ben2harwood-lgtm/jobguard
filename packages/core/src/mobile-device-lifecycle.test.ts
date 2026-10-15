import { describe, expect, it } from "vitest";
import { evaluateMobileReadV1, planMobileCleanupV1 } from "./mobile-device-lifecycle.js";

const id = "10000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const partition = () => ({ userId: id, tenantId: id, membershipId: id, mobileSessionId: id, deviceInstanceId: "fictional-device" });
const input = () => ({
 version: "mobile-read-evaluation.v1", partition: partition(),
 policy: { version: "mobile-auth-policy-specimen.v1", environment: "synthetic_demo", policyVersion: "fictional_mobile_auth_policy_v1", accessDurationMs: 10, refreshDurationMs: 20, sessionDurationMs: 30, readLeaseDurationMs: 15 },
 localMetadata: { version: "mobile-local-metadata.v1", partition: partition(), localSchemaVersion: 1 },
 lease: { version: "mobile-read-lease.v1", environment: "synthetic_demo", leaseId: id, partition: partition(), policyVersion: "fictional_mobile_auth_policy_v1", issuedAtMs: 100, expiresAtMs: 110 },
 authority: "valid", reconnectRequired: false, clock: { status: "trusted_fixture", nowMs: 105 },
});
function decision(raw: unknown, outcome: string) {
 expect(evaluateMobileReadV1(raw)).toEqual({ version: "mobile-read-decision.v1", environment: "synthetic_demo", outcome, canRead: outcome === "valid" });
}

describe("M3-2 pure lifecycle specimens", () => {
 it("M32-S12 lease expiry and clock anomalies fail according to explicit policy", () => {
  const raw = input(); decision(raw, "valid");
  for (const nowMs of [110, 111, Number.MAX_SAFE_INTEGER]) decision({ ...raw, clock: { ...raw.clock, nowMs } }, "expired");
  decision({ ...raw, clock: { ...raw.clock, nowMs: 100 } }, "valid");
  decision({ ...raw, clock: { ...raw.clock, nowMs: 99 } }, "reconnect_required");
  for (const status of ["unverified", "anomaly"]) decision({ ...raw, clock: { ...raw.clock, status } }, "reconnect_required");
  for (const nowMs of [-1, NaN, Infinity, 0.5]) decision({ ...raw, clock: { ...raw.clock, nowMs } }, "recovery_required");
  decision({ ...raw, reconnectRequired: true }, "reconnect_required");
  decision({ ...raw, lease: null }, "reconnect_required");
  decision({ ...raw, lease: { ...raw.lease, expiresAtMs: 116 } }, "reconnect_required");
  decision({ ...raw, policy: { ...raw.policy, policyVersion: "offline_security_policy_v1" } }, "recovery_required");
 });

 it("M32-S13 lifecycle decisions cannot inherit another user or tenant partition", () => {
  const raw = input(); decision(structuredClone(raw), "valid");
  for (const field of ["userId", "tenantId", "membershipId", "mobileSessionId", "deviceInstanceId"] as const) {
   decision({ ...raw, localMetadata: { ...raw.localMetadata, partition: { ...raw.partition, [field]: other } } }, "wrong_partition");
   decision({ ...raw, lease: { ...raw.lease, partition: { ...raw.partition, [field]: other } } }, "wrong_partition");
  }
  decision({ ...raw, localMetadata: null }, "cleanup_required");
  decision({ ...raw, localMetadata: { ...raw.localMetadata, localSchemaVersion: 2 } }, "recovery_required");
  decision({ ...raw, localMetadata: { ...raw.localMetadata, version: "mobile-local-metadata.v2" } }, "recovery_required");
  for (const localMetadata of ["invalid", {}, { ...raw.localMetadata, migrated: true }]) decision({ ...raw, localMetadata }, "recovery_required");
  for (const value of [undefined, null, {}, { ...raw, authorityFields: {} }, { ...raw, clock: { ...raw.clock, graceMs: 100 } }]) decision(value, "recovery_required");
 });

 it("M32-S09 observed expiry and revocation deny local reading without claiming durable revocation (partial)", () => {
  const raw = input(); decision({ ...raw, authority: "expired" }, "expired"); decision({ ...raw, authority: "revoked" }, "revoked");
 });

 it("M32-S14 unsynced work is never silently discarded by cleanup planning", () => {
  for (const reason of ["logout", "tenant_switch"]) for (const unsyncedWork of ["none", "present", "unknown"]) {
   const raw = { version: "mobile-cleanup.v1", reason, partition: partition(), unsyncedWork };
   const snapshot = structuredClone(raw);
   const plan = planMobileCleanupV1(raw);
   expect(plan).toEqual({ version: "mobile-cleanup-plan.v1", environment: "synthetic_demo", reason, partition: partition(), outcome: unsyncedWork === "none" ? "cleanup_required" : "policy_hold", unsyncedWork, serverRevocation: "policy_required", requiredResources: ["secure_keys", "database_cache", "media_cache", "sensitive_pending_content"] });
   expect(raw).toEqual(snapshot);
  }
  for (const value of [undefined, {}, { version: "mobile-cleanup.v1", reason: "logout", partition: partition(), unsyncedWork: "discard" }, { version: "mobile-cleanup.v1", reason: "logout", partition: partition(), unsyncedWork: "present", discard: true }]) expect(() => planMobileCleanupV1(value)).toThrow("MOBILE_AUTH_INVALID_INPUT");
 });

 it("M32-S15 lifecycle outputs never contain credential input (partial)", () => {
  const raw = { ...input(), credential: "c".repeat(43) };
  decision(raw, "recovery_required");
  expect(JSON.stringify(evaluateMobileReadV1(raw))).not.toContain(raw.credential);
 });
});
