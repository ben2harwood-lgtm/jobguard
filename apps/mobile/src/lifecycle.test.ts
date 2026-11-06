import { expect, it, vi } from "vitest";
import { MobileClient } from "./lifecycle";
import { type MobileAuthProvider, type MobileSession, type Partition, type SecureVault, type PartitionResources } from "./lifecycle-contracts";
import type { EncryptedStore } from "./store";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const policy = { version: "mobile-auth-policy-specimen.v1", environment: "synthetic_demo", policyVersion: "fictional_mobile_auth_policy_v1", accessDurationMs: 100, refreshDurationMs: 500, sessionDurationMs: 1000, readLeaseDurationMs: 200 };
function setup() {
 let now = 1000, n = 10;
 const secure = new Map<string, string>(), data = new Map<string, string | null>(), destroyed: string[] = [];
 const vault: SecureVault = { get: async key => secure.get(key) ?? null, set: async (key, value) => { secure.set(key, value); }, remove: async key => { secure.delete(key); } };
 const partitionKey = async (p: Partition) => [p.userId, p.tenantId, p.membershipId, p.mobileSessionId, p.deviceInstanceId].join("_");
 const resources: PartitionResources = { open: vi.fn(async (p, create) => {
  const key = await partitionKey(p);
  if (!data.has(key)) { if (!create) throw new Error("key missing"); data.set(key, null); }
  const store: EncryptedStore = { encryption: "sqlcipher", read: async () => data.get(key) ?? null, write: async value => { data.set(key, value); }, close: vi.fn(async () => {}) };
  return store;
 }), destroy: vi.fn(async p => { const key = await partitionKey(p); data.delete(key); destroyed.push(key); }) };
 let session: MobileSession;
 function issue(tenantId: string, previous?: Partition): MobileSession {
  const partition = previous ?? { userId: id(1), tenantId, membershipId: id(2), mobileSessionId: id(++n), deviceInstanceId: "fictional-device" };
  session = { version: "mobile-session.v1", environment: "synthetic_demo", partition,
   access: { version: "mobile-access.v1", credential: String(++n).padStart(43, "a") }, refresh: { version: "mobile-refresh.v1", credential: String(++n).padStart(43, "b") },
   accessExpiresAtMs: now + 100, refreshExpiresAtMs: now + 500,
   lease: { version: "mobile-read-lease.v1", environment: "synthetic_demo", leaseId: id(++n), partition, policyVersion: "fictional_mobile_auth_policy_v1", issuedAtMs: now, expiresAtMs: now + 200 } };
  return structuredClone(session);
 }
 const provider: MobileAuthProvider = { exchange: vi.fn(async input => issue(input.requestedTenantId)), rotate: vi.fn(async (_, p) => issue(p.tenantId, p)),
  reconnect: vi.fn(async () => ({ ...session.lease, issuedAtMs: now, expiresAtMs: now + 200 })),
  deviceCommand: vi.fn(async input => input.action === "tenant_switch" ? issue(input.nextTenantId!) : { version: "mobile-device-revoked.v1", environment: "synthetic_demo" }) };
 const options = { enabled: true, environment: "synthetic_demo", policy, uuid: () => id(++n), deviceInstanceId: "fictional-device", clock: () => ({ status: "trusted_fixture" as const, nowMs: now }), partitionKey };
 const make = (extra = {}) => new MobileClient(provider, vault, resources, { ...options, ...extra });
 return { make, client: make(), provider, vault, resources, secure, data, destroyed, setTime: (t: number) => { now = t; } };
}
const content = { notes: [{ id: id(80), text: "Fictional private note" }], files: [{ id: id(81), base64: "RmljdGlvbmFsIGJ5dGVz" }], unsyncedWork: "none" as const };
it("persists credentials only in secure vault; isolated encrypted cache contains synthetic files and no bearer", async () => {
 const f = setup(); await f.client.exchange(id(3)); await f.client.save(content);
 expect(await f.client.read()).toEqual({ notes: content.notes, files: content.files });
 const credentials = JSON.parse([...f.secure.entries()].find(([key]) => key.startsWith("m32.session."))![1]);
 const cached = [...f.data.values()].join("");
 expect(cached).not.toContain(credentials.access.credential); expect(cached).not.toContain(credentials.refresh.credential);
 expect(JSON.stringify(f.client)).toBe("{}");
});
it("disconnected cold start cannot read/open data until reconnect; exact lease expiry and rollback deny", async () => {
 const f = setup(); await f.client.exchange(id(3)); await f.client.save(content); await f.client.close();
 const opens = vi.mocked(f.resources.open).mock.calls.length;
 const cold = f.make(); await cold.resume(); await expect(cold.read()).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 expect(vi.mocked(f.resources.open).mock.calls.length).toBe(opens);
 await cold.reconnect(); expect((await cold.read()).notes).toEqual(content.notes);
 f.setTime(1200); await expect(cold.read()).rejects.toMatchObject({ code: "MOBILE_DENIED" });
 const rollback = setup(); await rollback.client.exchange(id(3)); rollback.setTime(999);
 await expect(rollback.client.read()).rejects.toMatchObject({ code: "MOBILE_DENIED" });
});
it("unverified native clock never gains a fixture trust label", async () => {
 const f = setup(), client = f.make({ clock: () => ({ status: "unverified", nowMs: 1000 }) });
 await client.exchange(id(3)); await expect(client.read()).rejects.toMatchObject({ code: "MOBILE_DENIED" });
});
it("refresh rotates without losing partition/files; unknown refresh outcome consumes old token without retry", async () => {
 const f = setup(); await f.client.exchange(id(3)); await f.client.save(content);
 const oldSecure = [...f.secure.values()].join(); await f.client.refresh(); expect([...f.secure.values()].join()).not.toEqual(oldSecure);
 expect((await f.client.read()).files).toEqual(content.files);
 vi.mocked(f.provider.rotate).mockRejectedValueOnce(new Error("fictional-sensitive-provider-error"));
 await expect(f.client.refresh()).rejects.toMatchObject({ code: "MOBILE_RECOVERY_REQUIRED", message: "MOBILE_RECOVERY_REQUIRED" });
 expect([...f.secure.keys()].filter(key => key.startsWith("m32.session."))).toEqual([]);
 await expect(f.client.refresh()).rejects.toThrow(); expect(f.provider.rotate).toHaveBeenCalledTimes(2);
 await expect(f.make().resume()).rejects.toThrow(); await expect(f.client.read()).rejects.toThrow();
});
it("tenant switch authorizes first, erases old resource/key partition and never inherits notes/files", async () => {
 const f = setup(); await f.client.exchange(id(3)); await f.client.save(content);
 vi.mocked(f.provider.deviceCommand).mockRejectedValueOnce(new Error("target forbidden"));
 await expect(f.client.switchTenant(id(4))).rejects.toThrow(); expect(f.destroyed).toHaveLength(0);
 await f.client.reconnect(); expect((await f.client.read()).notes).toEqual(content.notes);
 await f.client.switchTenant(id(4)); expect(f.destroyed).toHaveLength(1);
 expect(await f.client.read()).toEqual({ notes: [], files: [] });
 expect([...f.data.values()].join()).not.toContain("Fictional private note");
});
it("logout revokes and removes known-empty partition; a new user cannot inherit its cache", async () => {
 const f = setup(); await f.client.exchange(id(3)); await f.client.save(content); await f.client.logout();
 expect(f.provider.deviceCommand).toHaveBeenCalled(); expect(f.secure.size).toBe(0); expect(f.data.size).toBe(0);
 await f.client.exchange(id(4)); expect(await f.client.read()).toEqual({ notes: [], files: [] });
});
it.each(["present", "unknown"] as const)("unsynced %s holds deletion and switch; logout locks, revokes and drops bearer", async unsyncedWork => {
 const f = setup(); await f.client.exchange(id(3)); await f.client.save({ ...content, unsyncedWork });
 await expect(f.client.switchTenant(id(4))).rejects.toMatchObject({ code: "MOBILE_UNSYNCED_POLICY_HOLD" }); expect(f.provider.deviceCommand).not.toHaveBeenCalled();
 await f.client.reconnect();
 await expect(f.client.logout()).rejects.toMatchObject({ code: "MOBILE_UNSYNCED_POLICY_HOLD" });
 expect(f.provider.deviceCommand).toHaveBeenCalledOnce(); expect(f.destroyed).toHaveLength(0);
 expect([...f.secure.keys()].filter(key => key.startsWith("m32.session."))).toEqual([]);
 await expect(f.make().resume()).rejects.toThrow(); await expect(f.client.read()).rejects.toThrow();
});
it("failed erasure keeps durable cleanup marker, never activates target or exposes stale data", async () => {
 const f = setup(); await f.client.exchange(id(3));
 vi.mocked(f.resources.destroy).mockRejectedValueOnce(new Error("filesystem busy"));
 await expect(f.client.switchTenant(id(4))).rejects.toMatchObject({ code: "MOBILE_RECOVERY_REQUIRED" });
 expect([...f.secure.keys()].filter(key => key.startsWith("m32.session."))).toEqual([]);
 await expect(f.make().resume()).rejects.toThrow(); await expect(f.client.exchange(id(4))).rejects.toThrow();
});
it("refuses incompatible cache/partition and malformed file or authority-bearing cache writes without reset", async () => {
 const f = setup(); await f.client.exchange(id(3));
 await expect(f.client.save({ ...content, access: "fictional token" })).rejects.toThrow();
 await f.client.reconnect();
 const [key, bytes] = [...f.data.entries()][0]!;
 const saved = JSON.parse(bytes!); saved.metadata.partition.tenantId = id(9); f.data.set(key, JSON.stringify(saved));
 await expect(f.client.read()).rejects.toThrow(); expect(f.destroyed).toHaveLength(0);
});
it("disabled/non-synthetic client refuses before auth, vault or SQLite", async () => {
 const f = setup();
 for (const extra of [{ enabled: false }, { environment: "production" }]) await expect(f.make(extra).exchange(id(3))).rejects.toMatchObject({ code: "MOBILE_DISABLED" });
 expect(f.provider.exchange).not.toHaveBeenCalled(); expect(f.resources.open).not.toHaveBeenCalled();
});
it("rechecks lease after an asynchronous read, so expiration cannot return cached content", async () => {
 const f = setup(); let expireDuringRead = false;
 const open = f.resources.open;
 f.resources.open = async (p, create) => {
  const store = await open(p, create), read = store.read;
  store.read = async () => { const bytes = await read(); if (expireDuringRead) f.setTime(1200); return bytes; };
  return store;
 };
 await f.client.exchange(id(3)); await f.client.save(content); expireDuringRead = true;
 await expect(f.client.read()).rejects.toMatchObject({ code: "MOBILE_DENIED" });
});
it("unknown server logout outcome leaves durable locked cleanup and never claims erasure/revocation", async () => {
 const f = setup(); await f.client.exchange(id(3)); await f.client.save(content);
 vi.mocked(f.provider.deviceCommand).mockRejectedValueOnce(new Error("fictional lost logout reply"));
 await expect(f.client.logout()).rejects.toMatchObject({ code: "MOBILE_RECOVERY_REQUIRED" });
 expect(f.destroyed).toHaveLength(0); expect([...f.secure.keys()].filter(key => key.startsWith("m32.session."))).toEqual([]);
 await expect(f.make().resume()).rejects.toThrow(); await expect(f.client.read()).rejects.toThrow();
});
it("future local schema and malformed attachments refuse without reset or content replacement", async () => {
 const f = setup(); await f.client.exchange(id(3));
 await expect(f.client.save({ ...content, files: [{ id: id(81), base64: "not base64!" }] })).rejects.toThrow();
 await f.client.reconnect(); const [key, bytes] = [...f.data.entries()][0]!;
 const saved = JSON.parse(bytes!); saved.metadata.localSchemaVersion = 2; f.data.set(key, JSON.stringify(saved));
 await expect(f.client.read()).rejects.toThrow(); expect(f.destroyed).toHaveLength(0);
});
it("failed workspace invalidation cannot resurrect a cleanup partition via refresh or reconnect", async () => {
 const f = setup(), client = f.make({ beforePartitionCleanup: async () => { throw new Error("fictional hook failure"); } });
 await client.exchange(id(3));
 await expect(client.logout()).rejects.toMatchObject({ code: "MOBILE_RECOVERY_REQUIRED" });
 expect([...f.secure.keys()].filter(key => key.startsWith("m32.session."))).toEqual([]);
 await expect(client.refresh()).rejects.toMatchObject({ code: "MOBILE_RECOVERY_REQUIRED" });
 await expect(client.reconnect()).rejects.toMatchObject({ code: "MOBILE_RECOVERY_REQUIRED" });
 expect(f.provider.rotate).not.toHaveBeenCalled(); expect(f.provider.reconnect).not.toHaveBeenCalled();
 await expect(f.make().resume()).rejects.toThrow(); expect(f.destroyed).toHaveLength(0);
});
