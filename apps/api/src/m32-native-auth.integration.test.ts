import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { MemoryAuthProvider } from "./auth/auth-provider.js";
import { SyntheticMobileAuthApplication } from "./auth/mobile-auth.application.js";
const { MobileClient } = await import(new URL("../../mobile/src/lifecycle.ts", import.meta.url).href);
const policy = { version: "mobile-auth-policy-specimen.v1", environment: "synthetic_demo", policyVersion: "fictional_mobile_auth_policy_v1", accessDurationMs: 100, refreshDurationMs: 1000, sessionDurationMs: 2000, readLeaseDurationMs: 200 };
it("M3-2 native client seam uses AuthProvider source checks for exchange/refresh/reconnect/switch/logout", async () => {
 let time = 1000;
 const source = new MemoryAuthProvider("fictional-m32-auth-key-for-test-only", () => {}, () => time, () => "12345678");
 const email = "fictional-m32@example.invalid", origin = "https://jobguard.example.test";
 await source.requestCode({ email, purpose: "signup", ip: "192.0.2.1" });
 const sourceSession = await source.verifyCode(email, "signup", "12345678"), member = source.fixtureMemberships()[0]!;
 const secondTenant = randomUUID(); source.invite(email, secondTenant, "foreman");
 await source.requestCode({ email, purpose: "invitation", ip: "192.0.2.1" }); await source.verifyCode(email, "invitation", "12345678");
 const server = new SyntheticMobileAuthApplication(source, policy, { enabled: true, environment: "synthetic_demo", allowedOrigin: origin, now: () => time });
 const credentials = (tenantId: string) => ({ ...sourceSession, requestedTenantId: tenantId, origin });
 // No public route or native bearer-to-business-principal shortcut is registered.
 const provider = {
  exchange: (input: { requestedTenantId: string }) => server.exchange(input, credentials(input.requestedTenantId)),
  rotate: (input: unknown, p: { tenantId: string }) => server.rotate(input, credentials(p.tenantId)),
  reconnect: (input: unknown, p: { tenantId: string }) => server.reconnect(input, credentials(p.tenantId)),
  deviceCommand: (input: unknown, p: { tenantId: string }) => server.deviceCommand(input, credentials(p.tenantId)),
 };
 const secure = new Map<string, string>(), sql = new Map<string, string | null>();
 const partitionKey = async (p: unknown) => createHash("sha256").update(JSON.stringify(p)).digest("hex");
 const vault = { get: async (key: string) => secure.get(key) ?? null, set: async (key: string, value: string) => { secure.set(key, value); }, remove: async (key: string) => { secure.delete(key); } };
 const resources = { open: async (p: unknown, create: boolean) => {
  const key = await partitionKey(p); if (!sql.has(key)) { if (!create) throw new Error("missing"); sql.set(key, null); }
  // Explicit SQLCipher double: these tests prove lifecycle/authority, never native encryption.
  return { encryption: "sqlcipher", read: async () => sql.get(key) ?? null, write: async (value: string) => { sql.set(key, value); }, close: async () => {} };
 }, destroy: async (p: unknown) => { sql.delete(await partitionKey(p)); } };
 const make = () => new MobileClient(provider, vault, resources, { enabled: true, environment: "synthetic_demo", policy, uuid: randomUUID, deviceInstanceId: "fictional-m32-device", clock: () => ({ status: "trusted_fixture", nowMs: time }), partitionKey });
 let client = make(); await client.exchange(member.tenantId);
 await client.save({ notes: [{ id: randomUUID(), text: "Fictional tenant A note" }], files: [{ id: randomUUID(), base64: "RmljdGlvbmFs" }], unsyncedWork: "none" });
 time += 100; await client.refresh(); expect((await client.read()).notes).toHaveLength(1);
 await client.close(); client = make(); await client.resume(); await expect(client.read()).rejects.toThrow();
 await client.reconnect(); expect((await client.read()).files).toHaveLength(1);
 await client.switchTenant(secondTenant); expect(await client.read()).toEqual({ notes: [], files: [] });
 expect([...sql.values()].join()).not.toContain("Fictional tenant A note");
 expect([...sql.values()].join()).not.toContain(sourceSession.sessionToken);
 source.revoke(source.fixtureMemberships().find(m => m.tenantId === secondTenant)!.id);
 await expect(client.reconnect()).rejects.toMatchObject({ code: "MOBILE_RECOVERY_REQUIRED" });
 await expect(client.read()).rejects.toThrow();
 // A separate authorized user/device exercises successful server tombstone + local erasure.
 const otherSource = new MemoryAuthProvider("fictional-other-auth-key-for-test-only", () => {}, () => time, () => "87654321");
 await otherSource.requestCode({ email: "fictional-other@example.invalid", purpose: "signup", ip: "192.0.2.2" });
 const otherSession = await otherSource.verifyCode("fictional-other@example.invalid", "signup", "87654321"), other = otherSource.fixtureMemberships()[0]!;
 const otherServer = new SyntheticMobileAuthApplication(otherSource, policy, { enabled: true, environment: "synthetic_demo", allowedOrigin: origin, now: () => time });
 const otherCredentials = { ...otherSession, requestedTenantId: other.tenantId, origin };
 const otherProvider = { ...provider, exchange: (input: unknown) => otherServer.exchange(input, otherCredentials), deviceCommand: (input: unknown) => otherServer.deviceCommand(input, otherCredentials) };
 const isolatedVaultData = new Map<string, string>();
 const isolatedVault = { get: async (key: string) => isolatedVaultData.get(key) ?? null, set: async (key: string, value: string) => { isolatedVaultData.set(key, value); }, remove: async (key: string) => { isolatedVaultData.delete(key); } };
 const second = new MobileClient(otherProvider, isolatedVault, resources, { enabled: true, environment: "synthetic_demo", policy, uuid: randomUUID, deviceInstanceId: "fictional-other-device", clock: () => ({ status: "trusted_fixture", nowMs: time }), partitionKey });
 await second.exchange(other.tenantId); expect(await second.read()).toEqual({ notes: [], files: [] }); await second.logout();
 expect(isolatedVaultData.size).toBe(0);
 expect((await otherServer.fixtureRecords()).families.every(f => f.reason === "logout")).toBe(true);
});
