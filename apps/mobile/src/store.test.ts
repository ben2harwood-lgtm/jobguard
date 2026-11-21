import { expect, it, vi } from "vitest";
import { openCipherStore, type CipherDatabase } from "./store";
function database(cipher: string | null = "4.7.0", version = 0): CipherDatabase {
 return { execAsync: vi.fn(async () => {}), getFirstAsync: vi.fn(async (sql: string) => sql === "PRAGMA cipher_version" ? cipher ? { cipher_version: cipher } : null : sql === "PRAGMA user_version" ? { user_version: version } : { count: 0 }) as CipherDatabase["getFirstAsync"], runAsync: vi.fn(async () => {}), closeAsync: vi.fn(async () => {}) };
}
it("refuses stock SQLite and closes before application tables or payload writes", async () => {
 const db = database(null);
 await expect(openCipherStore(db, "a".repeat(64))).rejects.toThrow("SQLCIPHER_REQUIRED");
 expect(db.closeAsync).toHaveBeenCalledOnce(); expect(db.runAsync).not.toHaveBeenCalled();
 expect(db.execAsync).toHaveBeenCalledTimes(1);
});
it("refuses malformed keys, wrong keys and unsupported local schema without reset", async () => {
 for (const key of ["", "'; DROP TABLE native_probe;--"]) {
  const db = database(); await expect(openCipherStore(db, key)).rejects.toThrow("ENCRYPTION_KEY_INVALID"); expect(db.execAsync).not.toHaveBeenCalled();
 }
 const future = database("4.7.0", 2); await expect(openCipherStore(future, "a".repeat(64))).rejects.toThrow("LOCAL_SCHEMA_UNSUPPORTED");
 const corrupt = database(); vi.mocked(corrupt.getFirstAsync).mockRejectedValueOnce(new Error("wrong key"));
 await expect(openCipherStore(corrupt, "a".repeat(64))).rejects.toThrow("wrong key"); expect(corrupt.runAsync).not.toHaveBeenCalled(); expect(corrupt.closeAsync).toHaveBeenCalledOnce();
});
it("keys before schema inspection and binds payload as a parameter (SQL double, no encryption proof)", async () => {
 const db = database(), store = await openCipherStore(db, "a".repeat(64));
 expect(vi.mocked(db.execAsync).mock.calls[0]![0]).toContain("PRAGMA key");
 await store.write("Fictional ' payload"); expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining("VALUES(1,?)"), "Fictional ' payload");
});
