import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { APP_GUARD } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { Pool } from "pg";
import request from "supertest";
import { ContractorPracticeSessionError } from "@jobguard/core";
import { ApplicationAuthGuard } from "../auth/application-auth.guard.js";
import { IDENTITY_APPLICATION } from "../auth/identity-http.js";
import { ContractorPracticeSessionApplication } from "./contractor-practice-session.application.js";
import { ContractorPracticeSessionController } from "./contractor-practice-session.controller.js";
let app: INestApplication;
const pool = { query: vi.fn(), connect: vi.fn() };
const body = { version: "contractor-practice-session-revoke.v1" }, origin = "https://practice.example.invalid";
beforeEach(async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", origin); pool.query.mockReset(); pool.connect.mockReset();
 const module = await Test.createTestingModule({ controllers: [ContractorPracticeSessionController], providers: [{ provide: Pool, useValue: pool }, { provide: IDENTITY_APPLICATION, useValue: () => ({ context: async () => { throw new Error("UNAUTHENTICATED"); } }) }, { provide: APP_GUARD, useClass: ApplicationAuthGuard }] }).compile();
 app = module.createNestApplication(); await app.init();
});
afterEach(async () => { await app?.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const post = () => request(app.getHttpServer()).post("/contractor/practice/session/revoke").set("Origin", origin).set("Cookie", `jg_session=${randomUUID()}`);
it("[PH17] real pipeline refuses malformed JSON before the controller", async () => {
 const service = vi.spyOn(ContractorPracticeSessionApplication.prototype, "revoke");
 expect((await post().set("Content-Type", "application/json").send("{invalid")).status).toBe(400); expect(service).not.toHaveBeenCalled();
});
it("[PH17] real guard refuses no session before the controller", async () => {
 const service = vi.spyOn(ContractorPracticeSessionApplication.prototype, "revoke");
 expect((await request(app.getHttpServer()).post("/contractor/practice/session/revoke").set("Origin", origin).send(body)).status).toBe(401); expect(service).not.toHaveBeenCalled();
});
it.each(["https://foreign.example.invalid", "null", ""])("[PH17] real controller refuses Origin %s without service call", async value => {
 const service = vi.spyOn(ContractorPracticeSessionApplication.prototype, "revoke"); const response = await post().set("Origin", value).send(body);
 expect(response.status).toBe(403); expect(response.body).toEqual({ version: "contractor-practice-session-error.v1", code: "ORIGIN_FORBIDDEN" }); expect(service).not.toHaveBeenCalled(); expect(response.headers["set-cookie"]).toBeUndefined(); expect(response.headers["cache-control"]).toBe("no-store");
});
it("[PH17] real controller returns strict no-store success with no cookie", async () => {
 const result = { version: "contractor-practice-session-revoked.v1", environment: "synthetic_demo", realExternalActions: 0, revokedAt: "2026-10-12T12:00:00.123456Z" } as const;
 vi.spyOn(ContractorPracticeSessionApplication.prototype, "revoke").mockResolvedValue(result);
 const response = await post().send(body); expect(response.status).toBe(200); expect(response.body).toEqual(result); expect(response.headers["cache-control"]).toBe("no-store"); expect(response.headers["set-cookie"]).toBeUndefined();
});
it.each(["pilot_no_charge", "production_billing", "", undefined, "SYNTHETIC_DEMO", " synthetic_demo "])("[PH17] real guard refuses mode %s with no database access", async mode => {
 vi.stubEnv("JOBGUARD_ENV", mode); const service = vi.spyOn(ContractorPracticeSessionApplication.prototype, "revoke");
 expect((await post().send(body)).status).toBe(401); expect(service).not.toHaveBeenCalled(); expect(pool.query).not.toHaveBeenCalled(); expect(pool.connect).not.toHaveBeenCalled();
 // The unchanged global guard returns 401 before the controller in these modes.
});
it.each(["UNAUTHENTICATED", "MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "INVALID_COMMAND", "PRACTICE_SESSION_UNAVAILABLE"] as const)("[PH17] real controller maps %s", async code => {
 vi.spyOn(ContractorPracticeSessionApplication.prototype, "revoke").mockRejectedValue(new ContractorPracticeSessionError(code));
 const response = await post().send(body); expect(response.status).toBe({ UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, INVALID_COMMAND: 400, PRACTICE_SESSION_UNAVAILABLE: 503 }[code]); expect(response.body).toEqual({ version: "contractor-practice-session-error.v1", code }); expect(response.headers["cache-control"]).toBe("no-store"); expect(response.headers["set-cookie"]).toBeUndefined();
});
it.each(["tenantId", "tenant_id", "requested_tenant_id", "membershipId", "identityUserId", "sessionId", "session", "sessionRef", "digest", "sessionDigest", "role", "environment", "createdAt", "expiresAt", "revokedAt", "days", "window", "reason", "commandId", "other"])("[PH17] real application refuses authority field %s through HTTP", async field => {
 pool.query.mockResolvedValue({ rows: [{ tenant_id: randomUUID(), membership_id: randomUUID(), identity_user_id: randomUUID() }] });
 const response = await post().send({ ...body, [field]: randomUUID() }); expect(response.status).toBe(400); expect(response.body).toEqual({ version: "contractor-practice-session-error.v1", code: "INVALID_COMMAND" }); expect(pool.connect).not.toHaveBeenCalled(); expect(response.headers["cache-control"]).toBe("no-store"); expect(response.headers["set-cookie"]).toBeUndefined();
});
it("[PH17] real application gives one answer for an ended caller whatever the well-formed body", async () => {
 pool.query.mockResolvedValue({ rows: [] }); const answers = [];
 for (const raw of [body, {}, { ...body, session: randomUUID() }]) { const response = await post().send(raw); expect(response.status).toBe(401); expect(response.headers["cache-control"]).toBe("no-store"); expect(response.headers["set-cookie"]).toBeUndefined(); answers.push(response.body); }
 expect(answers).toEqual(Array(3).fill({ version: "contractor-practice-session-error.v1", code: "UNAUTHENTICATED" })); expect(pool.connect).not.toHaveBeenCalled();
});
it("[PH17] real controller strips unexpected errors and ignores header/query authority", async () => {
 const service = vi.spyOn(ContractorPracticeSessionApplication.prototype, "revoke").mockRejectedValue(Object.assign(new Error("private PostgreSQL text"), { detail: "private detail" }));
 const value = randomUUID(); const response = await request(app.getHttpServer()).post("/contractor/practice/session/revoke?tenantId=invalid&session=invalid").set("Origin", origin).set("Cookie", `other=invalid; jg_session=${value}`).set("X-Tenant-Id", randomUUID()).send(body);
 expect(service).toHaveBeenCalledExactlyOnceWith({ version: "contractor-principal.v1", sessionId: value }, body); expect(response.status).toBe(503); expect(response.body).toEqual({ version: "contractor-practice-session-error.v1", code: "PRACTICE_SESSION_UNAVAILABLE" }); expect(JSON.stringify(response.body)).not.toContain(value); expect(response.headers["cache-control"]).toBe("no-store"); expect(response.headers["set-cookie"]).toBeUndefined();
});
