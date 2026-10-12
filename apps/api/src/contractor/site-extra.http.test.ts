// ENT-3a round 1 (A15): drives the real Nest pipeline (AppModule with the merged global guard and the framework body parser) for the site-extras route and
// pins what really happens. Refusals made before the controller keep the merged framework / guard shape; refusals made by the piece carry its own envelope.
import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import { Inject, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractorRepository, SiteExtraRepository, WatchdogError, type AuthenticatedMembership } from "@jobguard/db";
import { SiteExtraError } from "@jobguard/core";
import { AppModule } from "../app.module.js";
import { SiteExtraApplication } from "./site-extra.application.js";
import { SiteExtraController } from "./site-extra.controller.js";
// The test runner does not emit decorator metadata, so the controller's Pool parameter is declared by hand (as app.module.ts does for DecisionsController).
Inject(Pool)(SiteExtraController, undefined, 0);
const allowed = "https://app.fictional.invalid";
const payload = () => ({ version: "log-site-extra.v1", commandId: randomUUID(), note: "Fictional HTTP note", description: "Fictional HTTP extra" });
const session = () => `jg_session=${randomUUID()}`;
const member = () => ({ tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() }) as AuthenticatedMembership;
let app: INestApplication;
let service: ReturnType<typeof vi.spyOn>, lookup: ReturnType<typeof vi.spyOn>, logged: ReturnType<typeof vi.spyOn>, query: ReturnType<typeof vi.spyOn>, connect: ReturnType<typeof vi.spyOn>;
async function start(mode: string | undefined) {
 vi.stubEnv("JOBGUARD_ENV", mode as never); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", allowed); vi.stubEnv("DATABASE_URL", undefined as never);
 // The real identity application the merged guard builds when the request is not a synthetic session; its storage address never receives a statement here.
 const material = randomBytes(32).toString("hex"), codeVariable = ["AUTH", "CODE", "SECRET"].join("_");
 vi.stubEnv("IDENTITY_DATABASE_URL", "postgresql://jobguard_identity@127.0.0.1:1/jobguard_identity"); vi.stubEnv("AUTH_ALLOWED_ORIGIN", allowed); vi.stubEnv(codeVariable, material);
 const database = new Error("a database statement was issued");
 query = vi.spyOn(Pool.prototype, "query").mockRejectedValue(database as never); connect = vi.spyOn(Pool.prototype, "connect").mockRejectedValue(database as never);
 service = vi.spyOn(SiteExtraApplication.prototype, "log"); lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession"); logged = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra");
 const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); await app.init();
}
const post = (cookie: string | undefined, origin: string | undefined, body: unknown = payload(), job = randomUUID()) => {
 let call = request(app.getHttpServer()).post(`/contractor/jobs/${job}/site-extras`);
 if (cookie) call = call.set("cookie", cookie);
 if (origin !== undefined) call = call.set("origin", origin);
 return call.send(body as object);
};
const untouched = () => { for (const spy of [service, lookup, logged, query, connect]) expect(spy).not.toHaveBeenCalled(); };
afterEach(async () => { await app?.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("ENT-3a Nest HTTP pipeline for POST /contractor/jobs/:id/site-extras", () => {
 beforeEach(() => start("synthetic_demo"));
 it("[A15] (a) malformed JSON is answered by the framework's own 400 before the guard or controller; nothing runs", async () => {
  const response = await request(app.getHttpServer()).post(`/contractor/jobs/${randomUUID()}/site-extras`).set("cookie", session()).set("origin", allowed).set("content-type", "application/json").send('{"note": malformed');
  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({ statusCode: 400, error: "Bad Request" }); expect(typeof response.body.message).toBe("string");
  expect(response.body).not.toHaveProperty("version"); expect(response.body).not.toHaveProperty("code");
  expect(response.headers["cache-control"]).toBeUndefined(); untouched();
 });
 it("[A15] (b) no session cookie is answered by the global guard's own 401; nothing runs", async () => {
  const response = await post(undefined, allowed);
  expect(response.status).toBe(401); expect(response.body).toEqual({ code: "UNAUTHENTICATED" });
  expect(response.headers["cache-control"]).toBeUndefined(); untouched();
 });
 it("[A15] (b) a cookie that is not a synthetic session (not a version 4 identifier) is also the guard's 401; nothing runs", async () => {
  const response = await post("jg_session=not-a-session", allowed);
  expect(response.status).toBe(401); expect(response.body).toEqual({ code: "UNAUTHENTICATED" }); untouched();
 });
 it.each([["foreign", "https://evil.example"], ["missing", undefined], ["null", "null"]] as const)("[A15] (d) a %s Origin with a valid session is the piece's own ORIGIN_FORBIDDEN with version, code and no-store; the service is never called", async (_name, origin) => {
  const response = await post(session(), origin);
  expect(response.status).toBe(403); expect(response.body).toEqual({ version: "site-extra-error.v1", code: "ORIGIN_FORBIDDEN" });
  expect(response.headers["cache-control"]).toBe("no-store"); untouched();
 });
 it("[A15] (e) a well-formed request refused by the piece for an unknown job answers the piece's own NOT_FOUND envelope with no-store", async () => {
  const m = member(), job = randomUUID(), body = payload(), cookie = session(), sessionId = cookie.slice("jg_session=".length);
  lookup.mockResolvedValue(m); logged.mockRejectedValue(new SiteExtraError("NOT_FOUND"));
  const response = await post(cookie, allowed, body, job);
  expect(response.status).toBe(404); expect(response.body).toEqual({ version: "site-extra-error.v1", code: "NOT_FOUND" }); expect(response.headers["cache-control"]).toBe("no-store");
  expect(service).toHaveBeenCalledExactlyOnceWith({ version: "contractor-principal.v1", sessionId }, job, body);
  expect(lookup).toHaveBeenCalledExactlyOnceWith(sessionId); expect(logged).toHaveBeenCalledOnce(); expect(logged.mock.calls[0]![1]).toBe(m);
  expect(query).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
 });
 it("[A15] (e) a well-formed request whose body breaks the strict schema answers the piece's own INVALID_COMMAND envelope with no-store and reaches no repository write", async () => {
  lookup.mockResolvedValue(member());
  const response = await post(session(), allowed, { ...payload(), grantId: "tampered" });
  expect(response.status).toBe(400); expect(response.body).toEqual({ version: "site-extra-error.v1", code: "INVALID_COMMAND" }); expect(response.headers["cache-control"]).toBe("no-store");
  expect(service).toHaveBeenCalledOnce(); expect(logged).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
 });
 it("[A15] (e) a session the database does not know answers the piece's own UNAUTHENTICATED envelope, a different body from the guard's 401", async () => {
  lookup.mockRejectedValue(Object.assign(new Error("unknown session"), { code: "UNAUTHENTICATED" }));
  const response = await post(session(), allowed);
  expect(response.status).toBe(401); expect(response.body).toEqual({ version: "site-extra-error.v1", code: "UNAUTHENTICATED" }); expect(response.headers["cache-control"]).toBe("no-store");
  expect(logged).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
 });
 it("[R2] Nest HTTP answers a typed not-live refusal with 409 JOB_NOT_LIVE", async () => {
  lookup.mockResolvedValue(member()); logged.mockRejectedValue(new WatchdogError("JOB_NOT_LIVE"));
  const response = await post(session(), allowed);
  expect(response.status).toBe(409); expect(response.body).toEqual({ code: "JOB_NOT_LIVE" }); expect(response.headers["cache-control"]).toBe("no-store");
 });
 it("[R3] Nest HTTP maps internal command conflict to 409 IDEMPOTENCY_CONFLICT", async () => {
  lookup.mockResolvedValue(member()); logged.mockRejectedValue(new SiteExtraError("COMMAND_CONFLICT"));
  const response = await post(session(), allowed);
  expect(response.status).toBe(409); expect(response.body).toEqual({ code: "IDEMPOTENCY_CONFLICT" }); expect(response.headers["cache-control"]).toBe("no-store");
 });
 it("[R4] Nest HTTP success and replay answer 201 with the same stored result", async () => {
  lookup.mockResolvedValue(member()); const stored = { variationId: randomUUID() }; logged.mockResolvedValue(stored);
  const job = randomUUID(), body = payload(), cookie = session(), first = await post(cookie, allowed, body, job), replay = await post(cookie, allowed, body, job);
  expect(first.status).toBe(201); expect(replay.status).toBe(201); expect(replay.body).toEqual(first.body); expect(first.body.extraId).toBe(stored.variationId);
  expect(first.headers["cache-control"]).toBe("no-store"); expect(replay.headers["cache-control"]).toBe("no-store");
 });

});
describe("ENT-3a Nest HTTP pipeline in every other mode", () => {
 it.each([["pilot_no_charge", "pilot_no_charge"], ["production_billing", "production_billing"], ["an empty mode", ""], ["an unset mode", undefined]] as const)("[A15] (c) %s is refused by the global guard's own 401 UNAUTHENTICATED (not 403), for a valid session, a valid Origin and a valid body; nothing runs", async (_name, mode) => {
  await start(mode);
  const response = await post(session(), allowed);
  expect(response.status).toBe(401); expect(response.body).toEqual({ code: "UNAUTHENTICATED" });
  expect(response.headers["cache-control"]).toBeUndefined(); untouched();
 });
});
