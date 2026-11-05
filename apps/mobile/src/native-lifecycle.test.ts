import { expect, it, vi } from "vitest";
const { open, removeFile, getSecret, setSecret, deleteSecret } = vi.hoisted(() => ({ open: vi.fn(), removeFile: vi.fn(), getSecret: vi.fn(), setSecret: vi.fn(), deleteSecret: vi.fn() }));
vi.mock("expo-sqlite", () => ({ openDatabaseAsync: open, deleteDatabaseAsync: removeFile }));
vi.mock("expo-secure-store", () => ({ getItemAsync: getSecret, setItemAsync: setSecret, deleteItemAsync: deleteSecret, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 4, isAvailableAsync: async () => true }));
vi.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digestStringAsync: async (_: string, s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join(""), getRandomBytesAsync: async () => new Uint8Array(32).fill(7) }));
import { nativePartitionKey, nativePartitionResources, nativeVault, nativeUnverifiedClock } from "./native-lifecycle";
const p = { userId: "10000000-0000-4000-8000-000000000001", tenantId: "10000000-0000-4000-8000-000000000002", membershipId: "10000000-0000-4000-8000-000000000003", mobileSessionId: "10000000-0000-4000-8000-000000000004", deviceInstanceId: "fictional/device/path" };
it("hashes complete partition into opaque paths; different user/tenant/device/session never share keys", async () => {
 const key = await nativePartitionKey(p); expect(key).toMatch(/^[a-f0-9]{64}$/u);
 for (const field of ["userId", "tenantId", "membershipId", "mobileSessionId"] as const) expect(await nativePartitionKey({ ...p, [field]: "20000000-0000-4000-8000-000000000099" })).not.toBe(key);
 expect(await nativePartitionKey({ ...p, deviceInstanceId: "different" })).not.toBe(key);
});
it("missing secure key on resume refuses before SQLite and never generates a replacement", async () => {
 getSecret.mockResolvedValueOnce(null); open.mockClear(); setSecret.mockClear();
 await expect(nativePartitionResources().open(p, false)).rejects.toThrow("ENCRYPTION_KEY_MISSING"); expect(open).not.toHaveBeenCalled(); expect(setSecret).not.toHaveBeenCalled();
});
it("creates secure key before DB open, refuses stock SQLite without a plaintext fallback", async () => {
 getSecret.mockResolvedValueOnce(null); const events: string[] = [];
 setSecret.mockImplementationOnce(async () => { events.push("key"); });
 const db = { execAsync: vi.fn(async () => {}), getFirstAsync: vi.fn(async () => null), closeAsync: vi.fn(async () => {}) };
 open.mockImplementationOnce(async () => { events.push("open"); return db; });
 await expect(nativePartitionResources().open(p, true)).rejects.toThrow("SQLCIPHER_REQUIRED");
 expect(events).toEqual(["key", "open"]); expect(db.execAsync).toHaveBeenCalledTimes(1); expect(db.closeAsync).toHaveBeenCalledOnce();
 expect(setSecret).toHaveBeenCalledWith(expect.stringMatching(/^m32\.dbkey\.[a-f0-9]{64}$/u), "07".repeat(32), { keychainAccessible: 4 });
});
it("file deletion failure retains key and propagates; success removes the exact partition key", async () => {
 deleteSecret.mockClear(); removeFile.mockRejectedValueOnce(new Error("busy"));
 await expect(nativePartitionResources().destroy(p)).rejects.toThrow("busy"); expect(deleteSecret).not.toHaveBeenCalled();
 removeFile.mockResolvedValueOnce(undefined); await nativePartitionResources().destroy(p);
 const key = await nativePartitionKey(p); expect(removeFile).toHaveBeenLastCalledWith(`m32-${key}.db`); expect(deleteSecret).toHaveBeenCalledWith(`m32.dbkey.${key}`, { keychainAccessible: 4 });
 await nativeVault.set("fictional-session", "fictional-value"); expect(setSecret).toHaveBeenLastCalledWith("fictional-session", "fictional-value", { keychainAccessible: 4 });
 expect(nativeUnverifiedClock().status).toBe("unverified");
});
