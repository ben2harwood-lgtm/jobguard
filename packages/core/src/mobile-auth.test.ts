import { describe, expect, it } from "vitest";
import { MobileAuthContractError, mobileAccessV1, mobileExchangeV1, mobilePartitionV1, mobileReadLeaseV1, mobileRefreshV1, parseMobileAccessV1, parseMobileAuthPolicySpecimenV1, parseMobileExchangeV1 } from "./mobile-auth.js";

const id = "10000000-0000-4000-8000-000000000001";
const partition = () => ({ userId: id, tenantId: id, membershipId: id, mobileSessionId: id, deviceInstanceId: "fictional-device" });
const policy = () => ({ version: "mobile-auth-policy-specimen.v1", environment: "synthetic_demo", policyVersion: "fictional_mobile_auth_policy_v1", accessDurationMs: 10, refreshDurationMs: 20, sessionDurationMs: 30, readLeaseDurationMs: 15 });

describe("M3-2 synthetic contract", () => {
 it("M32-S01 strict schemas reject client authority and unsupported versions", () => {
  const raw = { version: "mobile-exchange.v1", requestedTenantId: id };
  expect(parseMobileExchangeV1(raw)).toEqual(raw);
  expect(parseMobileExchangeV1({ ...raw, requestedTenantId: "20000000-0000-4000-8000-000000000002" }).requestedTenantId).not.toBe(id);
  for (const field of ["actor", "userId", "role", "permission", "settlementState", "tenantId", "sourceSessionId", "environment"]) {
   expect(mobileExchangeV1.safeParse({ ...raw, [field]: "tampered" }).success).toBe(false);
  }
  for (const value of [null, {}, [], { ...raw, version: "mobile-exchange.v2" }, { ...raw, requestedTenantId: "invalid" }]) {
   expect(() => parseMobileExchangeV1(value)).toThrow(MobileAuthContractError);
  }
  const access = { version: "mobile-access.v1", credential: "a".repeat(43) };
  const refresh = { version: "mobile-refresh.v1", credential: "b".repeat(43) };
  expect(parseMobileAccessV1(access)).toEqual(access);
  expect(mobileRefreshV1.parse(refresh)).toEqual(refresh);
  expect(mobileAccessV1.safeParse(refresh).success).toBe(false);
  expect(mobileRefreshV1.safeParse(access).success).toBe(false);
  for (const schema of [mobileAccessV1, mobileRefreshV1]) for (const value of ["", "a".repeat(42), "a".repeat(44), " ".repeat(43), "+".repeat(43), 123]) {
   const version = schema === mobileAccessV1 ? access.version : refresh.version;
   expect(schema.safeParse({ version, credential: value }).success).toBe(false);
  }
  expect(mobileAccessV1.safeParse({ ...access, actor: id }).success).toBe(false);
  expect(mobileRefreshV1.safeParse({ ...refresh, role: "owner" }).success).toBe(false);
 });

 it("M32-S02 policy is explicit and has no production fallback", () => {
  expect(parseMobileAuthPolicySpecimenV1(policy())).toEqual(policy());
  for (const value of [undefined, null, {}, { ...policy(), environment: "production" }, { ...policy(), environment: "pilot_no_charge" }, { ...policy(), policyVersion: "offline_security_policy_v1" }, { ...policy(), graceMs: 1 }, { ...policy(), version: "mobile-auth-policy-specimen.v2" }]) {
   expect(() => parseMobileAuthPolicySpecimenV1(value)).toThrow("MOBILE_AUTH_POLICY_REQUIRED");
  }
  for (const field of ["accessDurationMs", "refreshDurationMs", "sessionDurationMs", "readLeaseDurationMs"] as const) {
   const missing: Record<string, unknown> = { ...policy() }; delete missing[field];
   expect(() => parseMobileAuthPolicySpecimenV1(missing)).toThrow("MOBILE_AUTH_POLICY_REQUIRED");
   for (const value of [0, -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "10"]) {
    expect(() => parseMobileAuthPolicySpecimenV1({ ...policy(), [field]: value })).toThrow("MOBILE_AUTH_POLICY_REQUIRED");
   }
  }
  for (const field of ["accessDurationMs", "refreshDurationMs", "readLeaseDurationMs"]) expect(() => parseMobileAuthPolicySpecimenV1({ ...policy(), [field]: 31 })).toThrow("MOBILE_AUTH_POLICY_REQUIRED");
 });

 it("M32-S11 descriptor validation alone grants no server authority (partial)", () => {
  const lease = { version: "mobile-read-lease.v1", environment: "synthetic_demo", leaseId: id, partition: partition(), policyVersion: "fictional_mobile_auth_policy_v1", issuedAtMs: 100, expiresAtMs: 110 };
  expect(mobileReadLeaseV1.parse(lease)).toEqual(lease);
  for (const expiresAtMs of [100, 99, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(mobileReadLeaseV1.safeParse({ ...lease, expiresAtMs }).success).toBe(false);
  expect(mobileReadLeaseV1.safeParse({ ...lease, uploadPermission: true }).success).toBe(false);
  expect(mobileReadLeaseV1.safeParse({ ...lease, partition: { ...partition(), role: "owner" } }).success).toBe(false);
  for (const deviceInstanceId of ["", " ", "d".repeat(101)]) expect(mobilePartitionV1.safeParse({ ...partition(), deviceInstanceId }).success).toBe(false);
 });

 it("M32-S15 invalid credential errors contain only bounded classification (partial)", () => {
  const raw = { version: "mobile-access.v1", credential: "a".repeat(44) };
  try { parseMobileAccessV1(raw); expect.fail("invalid input accepted"); }
  catch (error) {
   expect(error).toBeInstanceOf(MobileAuthContractError);
   expect(error).toMatchObject({ code: "MOBILE_AUTH_INVALID_INPUT", message: "MOBILE_AUTH_INVALID_INPUT" });
   expect(JSON.stringify(error)).not.toContain(raw.credential);
   expect(String(error)).not.toContain(raw.credential);
   expect(error).not.toHaveProperty("issues"); expect(error).not.toHaveProperty("cause");
  }
 });
});
