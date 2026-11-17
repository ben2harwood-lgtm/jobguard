import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContractorPracticeSessionError } from "@jobguard/core";
const state = vi.hoisted(() => ({ revoke: vi.fn(), pool: vi.fn(() => ({})), session: "" as string | undefined, real: false }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.session ? { value: state.session } : undefined }) }));
vi.mock("../../../../../lib/synthetic-server", () => ({ syntheticPool: state.pool }));
vi.mock("@jobguard/api/workspace", async importOriginal => {
 const original = await importOriginal<typeof import("@jobguard/api/workspace")>();
 return { ...original, createContractorPracticeSessionApplication: (options: Parameters<typeof original.createContractorPracticeSessionApplication>[0]) => state.real ? original.createContractorPracticeSessionApplication(options) : { revoke: state.revoke } };
});
import { POST } from "./route";
const body = { version: "contractor-practice-session-revoke.v1" };
const result = { version: "contractor-practice-session-revoked.v1", environment: "synthetic_demo", realExternalActions: 0, revokedAt: "2026-10-12T12:00:00.123456Z" };
const post = (raw = JSON.stringify(body), origin: string | undefined = "https://practice.example.invalid", extra: Record<string, string> = {}) => POST(new Request("https://practice.example.invalid/api/contractor/practice/session/revoke?tenantId=invalid&session=invalid", { method: "POST", body: raw, headers: { "content-type": "application/json", ...(origin === undefined ? {} : { origin }), ...extra } }));
async function check(response: Response, status: number, code?: string) {
 expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store"); expect(response.headers.has("set-cookie")).toBe(false);
 const data = await response.json(); expect(data).toEqual(code ? { version: "contractor-practice-session-error.v1", code } : result);
 expect(JSON.stringify(data)).not.toContain(state.session ?? "unused");
}
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://practice.example.invalid"); state.session = randomUUID(); state.revoke.mockReset().mockResolvedValue(result); state.pool.mockClear().mockReturnValue({}); state.real = false; });
afterEach(() => vi.unstubAllEnvs());
it.each(["https://foreign.example.invalid", "null", undefined])("[PH17] refuses Origin %s before service access", async origin => {
 // Pass undefined explicitly; the helper default is intentionally bypassed here.
 const response = origin === undefined ? await POST(new Request("https://practice.example.invalid/api/contractor/practice/session/revoke", { method: "POST", body: "{}" })) : await post("{}", origin);
 await check(response, 403, "ORIGIN_FORBIDDEN"); expect(state.revoke).not.toHaveBeenCalled(); expect(state.pool).not.toHaveBeenCalled();
});
it.each(["pilot_no_charge", "production_billing", "", undefined, "SYNTHETIC_DEMO", " synthetic_demo "])("[PH17] refuses mode %s before pool access", async mode => {
 vi.stubEnv("JOBGUARD_ENV", mode); await check(await post(), 403, "MODE_FORBIDDEN"); expect(state.pool).not.toHaveBeenCalled(); expect(state.revoke).not.toHaveBeenCalled();
});
it("[PH17] refuses invalid JSON without service access", async () => { await check(await post("{invalid"), 400, "INVALID_COMMAND"); expect(state.revoke).not.toHaveBeenCalled(); });
it("[PH17] reads only its own cookie and ignores query and header authority", async () => {
 await check(await post(JSON.stringify(body), "https://practice.example.invalid", { "x-tenant-id": randomUUID(), "x-session": randomUUID(), cookie: "other=invalid" }), 200);
 expect(state.revoke).toHaveBeenCalledExactlyOnceWith({ version: "contractor-principal.v1", sessionId: state.session }, body);
});
it.each(["UNAUTHENTICATED", "MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "INVALID_COMMAND", "PRACTICE_SESSION_UNAVAILABLE"] as const)("[PH17] maps %s without cookie or authority leakage", async code => {
 state.revoke.mockRejectedValue(new ContractorPracticeSessionError(code));
 await check(await post(), { UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, INVALID_COMMAND: 400, PRACTICE_SESSION_UNAVAILABLE: 503 }[code], code);
});
it("[PH17] strips unknown errors", async () => { state.revoke.mockRejectedValue(Object.assign(new Error("private PostgreSQL text"), { detail: state.session })); await check(await post(), 503, "PRACTICE_SESSION_UNAVAILABLE"); });
it.each([undefined, "invalid"])("[PH17] passes missing or malformed cookie for service refusal", async session => {
 state.session = session; state.revoke.mockRejectedValue(new ContractorPracticeSessionError("UNAUTHENTICATED")); await check(await post(), 401, "UNAUTHENTICATED");
 expect(state.revoke).toHaveBeenCalledWith({ version: "contractor-principal.v1", sessionId: session }, body);
});
it.each(["tenantId", "tenant_id", "requested_tenant_id", "membershipId", "identityUserId", "sessionId", "session", "sessionRef", "digest", "sessionDigest", "role", "environment", "createdAt", "expiresAt", "revokedAt", "days", "window", "reason", "commandId", "other"])("[PH17] real service refuses authority field %s through Next", async field => {
 state.real = true; const pool = { query: vi.fn(async () => ({ rows: [{ tenant_id: randomUUID(), membership_id: randomUUID(), identity_user_id: randomUUID() }] })), connect: vi.fn() }; state.pool.mockReturnValue(pool);
 await check(await post(JSON.stringify({ ...body, [field]: randomUUID() })), 400, "INVALID_COMMAND"); expect(pool.query).toHaveBeenCalledTimes(1); expect(pool.connect).not.toHaveBeenCalled();
});
it("[PH17] real service returns one answer for an ended caller through Next", async () => {
 state.real = true; const pool = { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn() }; state.pool.mockReturnValue(pool);
 for (const raw of [body, {}, { ...body, session: randomUUID() }]) await check(await post(JSON.stringify(raw)), 401, "UNAUTHENTICATED"); expect(pool.connect).not.toHaveBeenCalled();
});
it.each([undefined, "invalid"])("[PH17] real service refuses malformed or missing cookie without database access", async value => {
 state.real = true; state.session = value; const pool = { query: vi.fn(), connect: vi.fn() }; state.pool.mockReturnValue(pool);
 await check(await post(), 401, "UNAUTHENTICATED"); expect(pool.query).not.toHaveBeenCalled(); expect(pool.connect).not.toHaveBeenCalled();
});
