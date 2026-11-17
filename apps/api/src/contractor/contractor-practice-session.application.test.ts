import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as db from "@jobguard/db";
import { ContractorPracticeSessionError } from "@jobguard/core";
import { ContractorPracticeSessionApplication, contractorPracticeSessionHttpFailure } from "./contractor-practice-session.application.js";
const body = { version: "contractor-practice-session-revoke.v1" };
const fields = ["tenantId", "tenant_id", "requested_tenant_id", "membershipId", "identityUserId", "sessionId", "session", "sessionRef", "digest", "sessionDigest", "role", "environment", "createdAt", "expiresAt", "revokedAt", "days", "window", "reason", "commandId", "other"];
function fixture() {
 const session = randomUUID(), tenant = randomUUID(), member = randomUUID(), user = randomUUID(), row = randomUUID();
 const client = { query: vi.fn(async (sql: string): Promise<{ rows: Record<string, unknown>[] }> => {
  if (sql.includes("revoke_contractor")) return { rows: [{ result: { session: row, member, revokedAt: "2026-10-12T12:00:00.123456Z" } }] };
  if (sql.includes("current_setting")) return { rows: [{ tenant_id: tenant }] };
  if (sql.includes("lock_audit_head")) return { rows: [] };
  if (sql.includes("clock_timestamp")) return { rows: [{ occurred_at: new Date("2026-10-12T12:00:00Z") }] };
  return { rows: [] };
 }), release: vi.fn() };
 const pool = { query: vi.fn(async () => ({ rows: [{ tenant_id: tenant, membership_id: member, identity_user_id: user }] })), connect: vi.fn(async () => client) };
 return { session, tenant, member, row, pool, client, app: new ContractorPracticeSessionApplication(pool as unknown as Pool), principal: { version: "contractor-principal.v1", sessionId: session } };
}
beforeEach(() => vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(["pilot_no_charge", "production_billing", "", undefined, "SYNTHETIC_DEMO", " synthetic_demo "])("[PH17] refuses mode %s before database access", async mode => {
 const f = fixture(); vi.stubEnv("JOBGUARD_ENV", mode);
 await expect(f.app.revoke(f.principal, body)).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
 expect(f.pool.query).not.toHaveBeenCalled(); expect(f.pool.connect).not.toHaveBeenCalled();
});
it.each([undefined, null, {}, { version: "contractor-principal.v1", sessionId: "invalid" }])("[PH17] refuses missing or malformed principal", async principal => {
 const f = fixture(); await expect(f.app.revoke(principal, body)).rejects.toMatchObject({ code: "UNAUTHENTICATED" }); expect(f.pool.query).not.toHaveBeenCalled();
});
it("[PH17] authenticates before validating well-formed bodies", async () => {
 const f = fixture(); f.pool.query.mockResolvedValue({ rows: [] });
 const errors = [];
 for (const raw of [body, {}, { ...body, session: randomUUID() }]) errors.push(contractorPracticeSessionHttpFailure(await f.app.revoke(f.principal, raw).catch(error => error)));
 expect(errors).toEqual(Array(3).fill({ status: 401, body: { version: "contractor-practice-session-error.v1", code: "UNAUTHENTICATED" } }));
 expect(f.pool.connect).not.toHaveBeenCalled();
});
it.each(fields)("[PH17] refuses body authority field %s after one bridge call", async field => {
 const f = fixture(), bridge = vi.spyOn(db, "contractorSessionContext");
 await expect(f.app.revoke(f.principal, { ...body, [field]: randomUUID() })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 expect(bridge).toHaveBeenCalledExactlyOnceWith(f.pool, f.session); expect(f.pool.connect).not.toHaveBeenCalled();
});
it("[PH17] passes the real stamped context whole through withTenant and returns no authority fields", async () => {
 const f = fixture(), bridge = vi.spyOn(db, "contractorSessionContext"), revoke = vi.spyOn(db.ContractorPracticeSessionRepository.prototype, "revoke");
 const result = await f.app.revoke(f.principal, body);
 expect(bridge).toHaveBeenCalledExactlyOnceWith(f.pool, f.session);
 expect(revoke.mock.calls[0]![0]).toBe(await bridge.mock.results[0]!.value);
 expect(revoke.mock.calls[0]![1]).toBe(f.session);
 expect(f.client.query).toHaveBeenCalledWith("SELECT set_config('app.tenant_id', $1, true)", [f.tenant]);
 expect(result).toEqual({ version: "contractor-practice-session-revoked.v1", environment: "synthetic_demo", realExternalActions: 0, revokedAt: "2026-10-12T12:00:00.123456Z" });
 expect(JSON.stringify(result)).not.toContain(f.session);
 expect(f.client.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
});
it.each([null, {}, { unexpected: true }])("[PH17] refuses an invalid database answer and rolls back", async result => {
 const f = fixture(); f.client.query.mockImplementation(async sql => sql.includes("revoke_contractor") ? { rows: [{ result }] } : { rows: [] });
 await expect(f.app.revoke(f.principal, body)).rejects.toMatchObject({ code: "PRACTICE_SESSION_UNAVAILABLE" });
 expect(f.client.query.mock.calls.some(call => (call[0].includes("INSERT INTO app.audit_event") || call[0].includes("FROM app.append_audit(")))).toBe(false);
 expect(f.client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});
it("[PH17] strips all unexpected PostgreSQL text from thrown errors and public failures", async () => {
 const f = fixture(); f.pool.query.mockRejectedValue(Object.assign(new Error("private PostgreSQL diagnostic"), { detail: f.session }));
 const error = await f.app.revoke(f.principal, body).catch(error => error);
 expect(error).toBeInstanceOf(ContractorPracticeSessionError); expect(error).not.toHaveProperty("cause");
 expect(error.stack).not.toContain(f.session); expect(error.message).not.toContain("PostgreSQL");
 expect(contractorPracticeSessionHttpFailure(error)).toEqual({ status: 503, body: { version: "contractor-practice-session-error.v1", code: "PRACTICE_SESSION_UNAVAILABLE" } });
 for (const [code, status] of Object.entries({ UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, INVALID_COMMAND: 400, PRACTICE_SESSION_UNAVAILABLE: 503 })) expect(contractorPracticeSessionHttpFailure(new ContractorPracticeSessionError(code as ConstructorParameters<typeof ContractorPracticeSessionError>[0])).status).toBe(status);
 expect(contractorPracticeSessionHttpFailure({ code: "MODE_FORBIDDEN", detail: "private" }).status).toBe(503);
});
it.each(["MODE_FORBIDDEN", "UNAUTHENTICATED", "PRACTICE_SESSION_IMMUTABLE", "PRACTICE_SESSION_AUDIT_REQUIRED", "private PostgreSQL diagnostic"])("[PH17] repository translates only exact routine message %s", async message => {
 const f = fixture(); f.client.query.mockImplementation(async sql => { if (sql.includes("revoke_contractor")) throw Object.assign(new Error(message), { detail: f.session }); return { rows: [] }; });
 const error = await f.app.revoke(f.principal, body).catch(error => error);
 expect(error).toMatchObject({ code: message === "MODE_FORBIDDEN" || message === "UNAUTHENTICATED" ? message : "PRACTICE_SESSION_UNAVAILABLE" });
 expect(error).not.toHaveProperty("detail"); expect(error).not.toHaveProperty("cause"); expect(error.message + error.stack).not.toContain(f.session);
 expect(f.client.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});
it("[PH17] Nest injects the real pool without relying on emitted constructor metadata", async () => {
 const { Test } = await import("@nestjs/testing"); const { ContractorPracticeSessionController } = await import("./contractor-practice-session.controller.js");
 const f = fixture(); const module = await Test.createTestingModule({ controllers: [ContractorPracticeSessionController], providers: [{ provide: (await import("pg")).Pool, useValue: f.pool }] }).compile();
 try {
  vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://practice.example.invalid"); const headers = vi.fn();
  const result = await module.get(ContractorPracticeSessionController).revoke(`jg_session=${f.session}`, "https://practice.example.invalid", body, { setHeader: headers });
  expect(result).toMatchObject({ version: "contractor-practice-session-revoked.v1", environment: "synthetic_demo" }); expect(headers).toHaveBeenCalledWith("Cache-Control", "no-store"); expect(f.pool.query).toHaveBeenCalledTimes(1);
 } finally { await module.close(); }
});
