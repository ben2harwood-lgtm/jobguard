import { describe, expect, it, vi } from "vitest";
import { mobileReadLeaseV1 } from "@jobguard/core";
import { MemoryAuthProvider } from "./auth-provider.js";
import { SyntheticMobileAuthApplication } from "./mobile-auth.application.js";

const origin = "https://jobguard.example.test";
const otherTenant = "20000000-0000-4000-8000-000000000002";
const policy = { version: "mobile-auth-policy-specimen.v1", environment: "synthetic_demo", policyVersion: "fictional_mobile_auth_policy_v1", accessDurationMs: 100, refreshDurationMs: 500, sessionDurationMs: 1000, readLeaseDurationMs: 200 };
async function fixture(options: { environment?: string; enabled?: boolean } = { environment: "synthetic_demo", enabled: true }) {
 let clock = 1000, sequence = 0, tokens = 0, tokenFailure = false;
 const uuid = () => `10000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
 const source = new MemoryAuthProvider("fictional-key-for-synthetic-tests-only", () => {}, () => clock, () => "12345678");
 const email = "fictional@example.test";
 await source.requestCode({ email, purpose: "signup", ip: "192.0.2.1" });
 const session = await source.verifyCode(email, "signup", "12345678");
 const membership = source.fixtureMemberships()[0]!;
 const credentials = { ...session, origin, requestedTenantId: membership.tenantId };
 const app = new SyntheticMobileAuthApplication(source, policy, { ...options, allowedOrigin: origin, now: () => clock, uuid, token: () => { if (tokenFailure) throw new Error("fixture-secret-provider-failure"); return String(++tokens).padStart(43, "a"); } });
 const exchange = (commandId = uuid(), deviceInstanceId = "fictional-device") => ({ version: "mobile-exchange.v1", requestedTenantId: membership.tenantId, commandId, deviceInstanceId });
 const rotate = (refresh: unknown, commandId = uuid()) => ({ version: "mobile-rotation.v1", commandId, deviceInstanceId: "fictional-device", refresh });
 const reconnect = (access: unknown, deviceInstanceId = "fictional-device") => ({ version: "mobile-reconnect.v1", deviceInstanceId, access });
 const lifecycle = (action: string, extra = {}) => ({ version: "mobile-device-command.v1", commandId: uuid(), deviceInstanceId: "fictional-device", requestedTenantId: membership.tenantId, action, ...extra });
 const secondTenant = async () => {
  source.invite(email, otherTenant, "foreman");
  await source.requestCode({ email, purpose: "invitation", ip: "192.0.2.1" });
  await source.verifyCode(email, "invitation", "12345678");
 };
 return { failTokens: (fail: boolean) => { tokenFailure = fail; }, app, source, credentials, membership, uuid, exchange, rotate, reconnect, lifecycle, secondTenant, advance: (ms: number) => { clock += ms; } };
}

describe("M3-2 DARK server fake", () => {
 it("defaults off and refuses every non-synthetic environment before consulting authentication", async () => {
  for (const options of [{}, { enabled: true }, { environment: "synthetic_demo" }, { environment: "production", enabled: true }, { environment: "pilot_no_charge", enabled: true }]) {
   const f = await fixture(options), authenticate = vi.spyOn(f.source, "authenticate");
   for (const call of [() => f.app.exchange({}, {}), () => f.app.rotate({}, {}), () => f.app.reconnect({}, {}), () => f.app.deviceCommand({}, {})]) await expect(call()).rejects.toMatchObject({ code: "MOBILE_DISABLED" });
   expect(() => f.app.fixtureRecords()).toThrow("MOBILE_DISABLED"); expect(authenticate).not.toHaveBeenCalled();
  }
 });
 it("exchanges source authentication for separate credentials and a bounded, partitioned lease", async () => {
  const f = await fixture(), issued = await f.app.exchange(f.exchange(), f.credentials);
  expect(issued.access.credential).not.toEqual(issued.refresh.credential);
  expect(issued.partition).toMatchObject({ userId: f.membership.identityUserId, tenantId: f.membership.tenantId, membershipId: f.membership.id, deviceInstanceId: "fictional-device" });
  expect(mobileReadLeaseV1.safeParse(issued.lease).success).toBe(true);
  expect(issued.lease).toMatchObject({ issuedAtMs: 1000, expiresAtMs: 1200 });
  expect(f.app.fixtureRecords().devices).toHaveLength(1);
  // Neither kind of mobile credential is accepted by the authoritative web AuthProvider.
  await expect(f.source.authenticate(issued.refresh.credential)).resolves.toBeUndefined();
  await expect(f.source.authenticate(issued.access.credential)).resolves.toBeUndefined();
 });
 it("rejects source forgery, CSRF, origins, conflicting selectors and unknown tenants", async () => {
  const f = await fixture();
  for (const credentials of [{}, { ...f.credentials, sessionToken: "forged".repeat(8) }, { ...f.credentials, csrfToken: "x".repeat(32) }, { ...f.credentials, origin: "https://wrong.example.test" }, { ...f.credentials, tenantHeader: otherTenant }]) await expect(f.app.exchange(f.exchange(), credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app.exchange({ ...f.exchange(), requestedTenantId: otherTenant }, f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  expect(f.app.fixtureRecords()).toEqual({ devices: [], families: [] });
 });
 it("strict versioned boundaries redact arbitrary secrets and reject unrelated authority", async () => {
  const f = await fixture(), secret = "hidden-pre-lock-signal-and-secret";
  for (const field of ["actor", "role", "jobId", "amount", "lockedFinalAccountId", "shadowSignal", "environment"]) {
   await expect(f.app.exchange({ ...f.exchange(), [field]: secret }, f.credentials)).rejects.toMatchObject({ message: "MOBILE_INVALID_INPUT" });
  }
  try { await f.app.rotate({ ...f.rotate({ version: "mobile-refresh.v1", credential: secret }) }, f.credentials); expect.fail(); }
  catch (error) { expect(String(error)).toBe("MobileServerError: MOBILE_INVALID_INPUT"); expect(JSON.stringify(error)).not.toContain(secret); expect(error).not.toHaveProperty("issues"); }
  expect(f.app.fixtureRecords().families).toHaveLength(0);
 });
 it("rejects repeated commands and conflicting reuse without caching token responses", async () => {
  const f = await fixture(), command = f.exchange();
  await f.app.exchange(command, f.credentials);
  await expect(f.app.exchange(command, f.credentials)).rejects.toMatchObject({ code: "MOBILE_REPLAY" });
  await expect(f.app.exchange({ ...command, deviceInstanceId: "another-device" }, f.credentials)).rejects.toMatchObject({ code: "MOBILE_COMMAND_CONFLICT" });
  expect(f.app.fixtureRecords().families).toHaveLength(1);
 });
 it("rotates once, invalidates old access, and refresh reuse revokes replacements and leases", async () => {
  const f = await fixture(), first = await f.app.exchange(f.exchange(), f.credentials), rotation = f.rotate(first.refresh);
  const next = await f.app.rotate(rotation, f.credentials);
  expect(next.access).not.toEqual(first.access); expect(next.refresh).not.toEqual(first.refresh);
  await expect(f.app.reconnect(f.reconnect(first.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app.reconnect(f.reconnect(next.access), f.credentials)).resolves.toMatchObject({ expiresAtMs: 1200 });
  await expect(f.app.rotate(rotation, f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app.rotate(f.rotate(next.refresh), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app.reconnect(f.reconnect(next.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  expect(f.app.fixtureRecords().families[0]).toMatchObject({ reason: "reuse", revokedAtMs: 1000, lease: { expiresAtMs: 1000 } });
 });
 it("concurrent refresh replays serialize and leave no usable winner", async () => {
  const f = await fixture(), first = await f.app.exchange(f.exchange(), f.credentials);
  const outcomes = await Promise.allSettled([f.app.rotate(f.rotate(first.refresh), f.credentials), f.app.rotate(f.rotate(first.refresh), f.credentials)]);
  expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const winner = outcomes.find(r => r.status === "fulfilled");
  if (winner?.status !== "fulfilled") throw new Error("missing fixture result");
  await expect(f.app.reconnect(f.reconnect(winner.value.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 });
 it("enforces exact expiry, non-sliding family duration and safe time arithmetic", async () => {
  const f = await fixture(), first = await f.app.exchange(f.exchange(), f.credentials);
  f.advance(100);
  await expect(f.app.reconnect(f.reconnect(first.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  let current = await f.app.rotate(f.rotate(first.refresh), f.credentials);
  f.advance(400); current = await f.app.rotate(f.rotate(current.refresh), f.credentials);
  f.advance(400); current = await f.app.rotate(f.rotate(current.refresh), f.credentials);
  expect(current).toMatchObject({ accessExpiresAtMs: 2000, refreshExpiresAtMs: 2000, lease: { expiresAtMs: 2000 } });
  f.advance(100);
  await expect(f.app.rotate(f.rotate(current.refresh), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  const expired = await fixture(), token = await expired.app.exchange(expired.exchange(), expired.credentials);
  expired.advance(500);
  await expect(expired.app.rotate(expired.rotate(token.refresh), expired.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  for (const jump of [-1001, Number.MAX_SAFE_INTEGER - 1000, NaN]) {
   const bad = await fixture(); bad.advance(jump);
   await expect(bad.app.exchange(bad.exchange(), bad.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  }
 });
 it("rechecks revoked membership and expired source session before renewal", async () => {
  for (const reason of ["membership", "session"]) {
   const f = await fixture(), issued = await f.app.exchange(f.exchange(), f.credentials);
   if (reason === "membership") f.source.revoke(f.membership.id); else f.advance(86_400_000);
   await expect(f.app.reconnect(f.reconnect(issued.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
   await expect(f.app.rotate(f.rotate(issued.refresh), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  }
 });
 it("rejects cross-user, cross-tenant, wrong-device and wrong-source-session use without revoking the victim", async () => {
  const f = await fixture(), issued = await f.app.exchange(f.exchange(), f.credentials), attacker = await fixture();
  await expect(f.app.rotate(f.rotate(issued.refresh), attacker.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await f.secondTenant();
  await expect(f.app.rotate(f.rotate(issued.refresh), { ...f.credentials, requestedTenantId: otherTenant })).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app.reconnect(f.reconnect(issued.access, "wrong-device"), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  const email = "fictional@example.test";
  await f.source.requestCode({ email, purpose: "signin", ip: "192.0.2.1" });
  const otherSession = await f.source.verifyCode(email, "signin", "12345678");
  await expect(f.app.rotate(f.rotate(issued.refresh), { ...f.credentials, ...otherSession })).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app.reconnect(f.reconnect(issued.access), f.credentials)).resolves.toMatchObject({ partition: issued.partition });
 });
 it.each(["logout", "revoke"])("%s invalidates every family and lease for the scoped device, preserving other devices", async action => {
  const f = await fixture(), first = await f.app.exchange(f.exchange(), f.credentials);
  const second = await f.app.exchange(f.exchange(), f.credentials), other = await f.app.exchange(f.exchange(f.uuid(), "another-device"), f.credentials);
  const cmd = f.lifecycle(action); await f.app.deviceCommand(cmd, f.credentials);
  await expect(f.app.deviceCommand(cmd, f.credentials)).rejects.toMatchObject({ code: "MOBILE_REPLAY" });
  for (const issued of [first, second]) {
   await expect(f.app.rotate(f.rotate(issued.refresh), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
   await expect(f.app.reconnect(f.reconnect(issued.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  }
  await expect(f.app.reconnect(f.reconnect(other.access, "another-device"), f.credentials)).resolves.toMatchObject({ partition: other.partition });
  await expect(f.app.exchange(f.exchange(), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 });
 it("revocation before registration is a tombstone and concurrent logout cannot resurrect tokens", async () => {
  const before = await fixture(); await before.app.deviceCommand(before.lifecycle("revoke"), before.credentials);
  await expect(before.app.exchange(before.exchange(), before.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  const f = await fixture();
  const [issued] = await Promise.all([f.app.exchange(f.exchange(), f.credentials), f.app.deviceCommand(f.lifecycle("logout"), f.credentials)]);
  await expect(f.app.reconnect(f.reconnect(issued.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 });
 it("tenant switch verifies the target first, then revokes old tokens and leases", async () => {
  const f = await fixture(), old = await f.app.exchange(f.exchange(), f.credentials);
  await expect(f.app.deviceCommand(f.lifecycle("tenant_switch", { nextTenantId: otherTenant }), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app.reconnect(f.reconnect(old.access), f.credentials)).resolves.toMatchObject({ partition: old.partition });
  await f.secondTenant();
  const next = await f.app.deviceCommand(f.lifecycle("tenant_switch", { nextTenantId: otherTenant }), f.credentials);
  if (!("access" in next)) throw new Error("missing fixture tokens");
  expect(next.partition.tenantId).toBe(otherTenant);
  await expect(f.app.reconnect(f.reconnect(old.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app.rotate(f.rotate(old.refresh), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app.reconnect(f.reconnect(next.access), { ...f.credentials, requestedTenantId: otherTenant })).resolves.toMatchObject({ partition: next.partition });
 });
 it("failed rotation leaves the previous family usable and permits retry of the uncommitted command", async () => {
  const f = await fixture(), issued = await f.app.exchange(f.exchange(), f.credentials), cmd = f.rotate(issued.refresh);
  const before = f.app.fixtureRecords();
  f.failTokens(true);
  await expect(f.app.rotate(cmd, f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  expect(f.app.fixtureRecords()).toEqual(before);
  f.failTokens(false);
  await expect(f.app.rotate(cmd, f.credentials)).resolves.toMatchObject({ partition: issued.partition });
 });
 it("a different authenticated user cannot consume or revoke a victim's refresh", async () => {
  const f = await fixture(), issued = await f.app.exchange(f.exchange(), f.credentials);
  const email = "another-fictional@example.test";
  await f.source.requestCode({ email, purpose: "signup", ip: "192.0.2.2" });
  const session = await f.source.verifyCode(email, "signup", "12345678");
  const attacker = f.source.fixtureMemberships().find(m => m.email === email)!;
  const credentials = { ...session, origin, requestedTenantId: attacker.tenantId };
  await expect(f.app.rotate(f.rotate(issued.refresh), credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app.deviceCommand(f.lifecycle("revoke"), credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app.rotate(f.rotate(issued.refresh), f.credentials)).resolves.toMatchObject({ partition: issued.partition });
 });
 it("rejects same-tenant switching, revoked source authority and token-type confusion", async () => {
  const f = await fixture(), issued = await f.app.exchange(f.exchange(), f.credentials);
  await expect(f.app.deviceCommand(f.lifecycle("tenant_switch", { nextTenantId: f.membership.tenantId }), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(f.app.rotate(f.rotate(issued.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_INVALID_INPUT" });
  await expect(f.app.reconnect(f.reconnect(issued.refresh), f.credentials)).rejects.toMatchObject({ code: "MOBILE_INVALID_INPUT" });
  vi.spyOn(f.source, "authenticate").mockResolvedValue(undefined);
  await expect(f.app.reconnect(f.reconnect(issued.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 });
 it("bounds unexpected provider errors and cannot reveal private state through serialization", async () => {
  const f = await fixture();
  await f.app.exchange(f.exchange(), f.credentials);
  expect(JSON.stringify(f.app)).toBe("{}");
  vi.spyOn(f.source, "authenticate").mockRejectedValue(new Error("fixture-secret-provider-failure"));
  try { await f.app.exchange(f.exchange(), f.credentials); expect.fail(); }
  catch (error) {
   expect(String(error)).toBe("MobileServerError: MOBILE_DENIED");
   expect(JSON.stringify(error)).not.toContain("fixture-secret-provider-failure");
   expect(error).not.toHaveProperty("cause");
  }
 });
 it("a fresh fake instance refuses old tokens and returned partition mutations cannot alter authority", async () => {
  const f = await fixture(), issued = await f.app.exchange(f.exchange(), f.credentials);
  const fresh = new SyntheticMobileAuthApplication(f.source, policy, { enabled: true, environment: "synthetic_demo", allowedOrigin: origin, now: () => 1000 });
  await expect(fresh.rotate(f.rotate(issued.refresh), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  await expect(fresh.reconnect(f.reconnect(issued.access), f.credentials)).rejects.toMatchObject({ code: "MOBILE_DENIED" });
  issued.partition.tenantId = otherTenant;
  issued.lease.partition.tenantId = otherTenant;
  await expect(f.app.reconnect(f.reconnect(issued.access), f.credentials)).resolves.toMatchObject({ partition: { tenantId: f.membership.tenantId } });
 });
 it("stores and exposes no raw credentials, personal fields or unsupported policy", async () => {
  const f = await fixture(), issued = await f.app.exchange(f.exchange(), f.credentials);
  const records = JSON.stringify(f.app.fixtureRecords());
  for (const secret of [issued.access.credential, issued.refresh.credential, f.credentials.sessionToken, f.credentials.csrfToken, "fictional@example.test"]) expect(records).not.toContain(secret);
  for (const field of ["accessDurationMs", "refreshDurationMs", "sessionDurationMs", "readLeaseDurationMs"]) for (const value of [0, -1, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
   expect(() => new SyntheticMobileAuthApplication(f.source, { ...policy, [field]: value }, { allowedOrigin: origin, now: () => 1000 })).toThrow("MOBILE_INVALID_INPUT");
  }
 });
});
