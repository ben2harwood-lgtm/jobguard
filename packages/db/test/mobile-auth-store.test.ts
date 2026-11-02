import { expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { emptyMobileAuthStateV1 } from "@jobguard/core";
import { PostgresSyntheticMobileAuthStore } from "../src/mobile-auth-store.js";
function fixture(state: unknown = emptyMobileAuthStateV1()) {
 const query = vi.fn(async (sql: string, _args?: unknown[]) => ({ rows: sql.startsWith("SELECT state") ? [{ state }] : [] }));
 const release = vi.fn();
 const pool = { connect: async () => ({ query, release }) } as unknown as Pool;
 return { store: new PostgresSyntheticMobileAuthStore(pool), query, release };
}
it("locks, validates and commits before returning a result, and never serializes a bearer result", async () => {
 const f = fixture();
 await expect(f.store.transaction(async state => ({ state, result: "fixture-bearer-result" }))).resolves.toBe("fixture-bearer-result");
 expect(f.query.mock.calls.map(c => c[0].split(" ")[0])).toEqual(["BEGIN", "INSERT", "SELECT", "UPDATE", "COMMIT"]);
 expect(f.query.mock.calls[2]?.[0]).toContain("FOR UPDATE");
 expect(JSON.stringify(f.query.mock.calls)).not.toContain("fixture-bearer-result");
 expect(f.release).toHaveBeenCalledOnce();
});
it("rolls back incompatible stored state without invoking work or overwriting the tombstones", async () => {
 const f = fixture({ ...emptyMobileAuthStateV1(), version: "unknown-version" }), work = vi.fn();
 await expect(f.store.transaction(work)).rejects.toThrow("MOBILE_STORE_INVALID_STATE");
 expect(work).not.toHaveBeenCalled();
 expect(f.query.mock.calls.map(c => c[0].split(" ")[0])).toEqual(["BEGIN", "INSERT", "SELECT", "ROLLBACK"]);
 expect(f.release).toHaveBeenCalledOnce();
});
it("rolls back invalid replacement state and withholds results on a failed commit", async () => {
 const f = fixture();
 await expect(f.store.transaction(async state => ({ state: { ...state, version: "unknown" } as unknown as typeof state, result: "secret" }))).rejects.toThrow("MOBILE_STORE_INVALID_STATE");
 expect(f.query.mock.calls.map(c => c[0].split(" ")[0])).not.toContain("UPDATE");
 const broken = fixture(), query = broken.query.getMockImplementation()!;
 broken.query.mockImplementation(async (sql, args) => { if (sql === "COMMIT") throw new Error("fixture-commit-failure"); return query(sql, args); });
 await expect(broken.store.transaction(async state => ({ state, result: "secret" }))).rejects.toThrow("fixture-commit-failure");
 expect(broken.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
 expect(broken.release).toHaveBeenCalledOnce();
});
