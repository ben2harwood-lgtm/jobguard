// ENT-3b (B18): drives the real Nest pipeline (AppModule with the merged global guard and the framework body parser) for the four visit routes and pins what really happens.
// Refusals made before the controller keep the merged framework / guard shape; refusals made by the piece carry its own envelope (version and code only, no-store).
import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import { Inject, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractorRepository, SiteVisitRepository, type AuthenticatedMembership } from "@jobguard/db";
import { SiteVisitError } from "@jobguard/core";
import * as bridge from "@jobguard/db";
import { AppModule } from "../app.module.js";
import { SiteExtraApplication } from "./site-extra.application.js";
import { SiteVisitController } from "./site-visit.controller.js";
// The test runner does not emit decorator metadata, so the controller's Pool parameter is declared by hand (as the site-extras HTTP test does).
Inject(Pool)(SiteVisitController, undefined, 0);
const allowed = "https://app.fictional.invalid";
const session = () => `jg_session=${randomUUID()}`;
const member = () => ({ tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() }) as AuthenticatedMembership;
type Route = { name: string; method: "post" | "get"; path: (job: string, visit: string) => string; body?: () => object; method_: "startVisit" | "completeVisit" | "assignedJobs" | "orderLines" };
const routes: Route[] = [
 { name: "start", method: "post", path: job => `/contractor/jobs/${job}/site-visits/start`, body: () => ({ version: "start-site-visit.v1", commandId: randomUUID() }), method_: "startVisit" },
 { name: "complete", method: "post", path: (job, visit) => `/contractor/jobs/${job}/site-visits/${visit}/complete`, body: () => ({ version: "complete-site-visit.v1", commandId: randomUUID(), closeoutAnswer: "yes" }), method_: "completeVisit" },
 { name: "assigned jobs", method: "get", path: () => "/contractor/site/jobs", method_: "assignedJobs" },
 { name: "order lines", method: "get", path: job => `/contractor/jobs/${job}/order-lines`, method_: "orderLines" },
];
let app: INestApplication;
let context: ReturnType<typeof vi.spyOn>, lookup: ReturnType<typeof vi.spyOn>, query: ReturnType<typeof vi.spyOn>, connect: ReturnType<typeof vi.spyOn>;
let services: Record<Route["method_"], ReturnType<typeof vi.spyOn>>, repositories: Record<Route["method_"], ReturnType<typeof vi.spyOn>>;
async function start(mode: string | undefined) {
 vi.stubEnv("JOBGUARD_ENV", mode as never); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", allowed); vi.stubEnv("DATABASE_URL", undefined as never);
 // The real identity application the merged guard builds when the request is not a synthetic session; its storage address never receives a statement here.
 const material = randomBytes(32).toString("hex"), codeVariable = ["AUTH", "CODE", "SECRET"].join("_");
 vi.stubEnv("IDENTITY_DATABASE_URL", "postgresql://jobguard_identity@127.0.0.1:1/jobguard_identity"); vi.stubEnv("AUTH_ALLOWED_ORIGIN", allowed); vi.stubEnv(codeVariable, material);
 const database = new Error("a database statement was issued");
 query = vi.spyOn(Pool.prototype, "query").mockRejectedValue(database as never); connect = vi.spyOn(Pool.prototype, "connect").mockRejectedValue(database as never);
 context = vi.spyOn(bridge, "contractorSessionContext"); lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession");
 services = { startVisit: vi.spyOn(SiteExtraApplication.prototype, "startVisit"), completeVisit: vi.spyOn(SiteExtraApplication.prototype, "completeVisit"), assignedJobs: vi.spyOn(SiteExtraApplication.prototype, "assignedJobs"), orderLines: vi.spyOn(SiteExtraApplication.prototype, "orderLines") };
 repositories = { startVisit: vi.spyOn(SiteVisitRepository.prototype, "startVisit"), completeVisit: vi.spyOn(SiteVisitRepository.prototype, "completeVisit"), assignedJobs: vi.spyOn(SiteVisitRepository.prototype, "assignedJobs"), orderLines: vi.spyOn(SiteVisitRepository.prototype, "orderLines") };
 const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); await app.init();
}
const call = (route: Route, cookie: string | undefined, origin: string | undefined, body: unknown = route.body?.(), job = randomUUID(), visit = randomUUID()) => {
 let req = route.method === "post" ? request(app.getHttpServer()).post(route.path(job, visit)) : request(app.getHttpServer()).get(route.path(job, visit));
 if (cookie) req = req.set("cookie", cookie);
 if (origin !== undefined) req = req.set("origin", origin);
 return route.method === "post" ? req.send(body as object) : req;
};
const untouched = () => { for (const spy of [...Object.values(services), ...Object.values(repositories), lookup, context, query, connect]) expect(spy).not.toHaveBeenCalled(); };
afterEach(async () => { await app?.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("ENT-3b Nest HTTP pipeline for the four visit routes", () => {
 beforeEach(() => start("synthetic_demo"));
 for (const route of routes.filter(r => r.method === "post")) {
  it(`[B18] ${route.name}: malformed JSON is answered by the framework's own 400 before the guard or controller; the service was never called`, async () => {
   const response = await request(app.getHttpServer()).post(route.path(randomUUID(), randomUUID())).set("cookie", session()).set("origin", allowed).set("content-type", "application/json").send('{"commandId": malformed');
   expect(response.status).toBe(400); expect(response.body).toMatchObject({ statusCode: 400, error: "Bad Request" }); expect(response.body).not.toHaveProperty("version"); expect(response.body).not.toHaveProperty("code");
   expect(response.headers["cache-control"]).toBeUndefined(); untouched();
  });
  it.each([["foreign", "https://evil.example"], ["missing", undefined], ["null", "null"]] as const)(`[B18] ${route.name}: a %s Origin with a valid session is the piece's own ORIGIN_FORBIDDEN with version, code and no-store; the service was never called`, async (_name, origin) => {
   const response = await call(route, session(), origin);
   expect(response.status).toBe(403); expect(response.body).toEqual({ version: "site-visit-error.v1", code: "ORIGIN_FORBIDDEN" }); expect(response.headers["cache-control"]).toBe("no-store"); untouched();
  });
 }
 for (const route of routes) {
  it(`[B18] ${route.name}: no session cookie is answered by the global guard's own 401; the service was never called`, async () => {
   const response = await call(route, undefined, allowed);
   expect(response.status).toBe(401); expect(response.body).toEqual({ code: "UNAUTHENTICATED" }); expect(response.headers["cache-control"]).toBeUndefined(); untouched();
  });
  it(`[B18] ${route.name}: a cookie that is not a synthetic session is also the guard's 401; the service was never called`, async () => {
   const response = await call(route, "jg_session=not-a-session", allowed);
   expect(response.status).toBe(401); expect(response.body).toEqual({ code: "UNAUTHENTICATED" }); untouched();
  });
  it(`[B18] ${route.name}: a session the database does not know answers the piece's own UNAUTHENTICATED envelope`, async () => {
   lookup.mockRejectedValue(Object.assign(new Error("unknown session"), { code: "UNAUTHENTICATED" }));
   const response = await call(route, session(), allowed);
   expect(response.status).toBe(401); expect(response.body).toEqual({ version: "site-visit-error.v1", code: "UNAUTHENTICATED" }); expect(response.headers["cache-control"]).toBe("no-store");
   expect(repositories[route.method_]).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  });
  it(`[B18] ${route.name}: a refusal by the repository keeps the piece's envelope and the service was reached with the session and the path ids only`, async () => {
   const m = member(), job = randomUUID(), visit = randomUUID(), cookie = session(), sessionId = cookie.slice("jg_session=".length), body = route.body?.();
   lookup.mockResolvedValue(m); repositories[route.method_].mockRejectedValue(new SiteVisitError("NOT_FOUND"));
   const response = await call(route, cookie, allowed, body, job, visit);
   expect(response.status).toBe(404); expect(response.body).toEqual({ version: "site-visit-error.v1", code: "NOT_FOUND" }); expect(response.headers["cache-control"]).toBe("no-store");
   const principal = { version: "contractor-principal.v1", sessionId };
   const expected = { startVisit: [principal, job, body], completeVisit: [principal, job, visit, body], assignedJobs: [principal], orderLines: [principal, job] }[route.method_];
   expect(services[route.method_]).toHaveBeenCalledExactlyOnceWith(...(expected as [unknown]));
   expect(lookup).toHaveBeenCalledTimes(2); expect(context).toHaveBeenCalledExactlyOnceWith(expect.any(Pool), sessionId);
   expect(repositories[route.method_].mock.calls[0]![1]).toBe(m); expect(repositories[route.method_].mock.calls[0]![0]).toBe(await context.mock.results[0]!.value);
   expect(query).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  });
 }
 for (const route of routes.filter(r => r.method === "post")) {
  it(`[B18] ${route.name}: a body that breaks the strict schema answers the piece's own INVALID_COMMAND envelope and reaches no repository`, async () => {
   lookup.mockResolvedValue(member());
   const response = await call(route, session(), allowed, { ...route.body!(), tenantId: randomUUID() });
   expect(response.status).toBe(400); expect(response.body).toEqual({ version: "site-visit-error.v1", code: "INVALID_COMMAND" }); expect(response.headers["cache-control"]).toBe("no-store");
   expect(repositories[route.method_]).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  });
  it(`[B18] ${route.name}: a not-live job answers 409 JOB_NOT_LIVE and a reused command id answers 409 IDEMPOTENCY_CONFLICT, both with version, code and no-store`, async () => {
   lookup.mockResolvedValue(member());
   repositories[route.method_].mockRejectedValueOnce(new SiteVisitError("JOB_NOT_LIVE")); repositories[route.method_].mockRejectedValueOnce(new SiteVisitError("IDEMPOTENCY_CONFLICT"));
   const live = await call(route, session(), allowed), conflict = await call(route, session(), allowed);
   expect(live.status).toBe(409); expect(live.body).toEqual({ version: "site-visit-error.v1", code: "JOB_NOT_LIVE" }); expect(conflict.status).toBe(409); expect(conflict.body).toEqual({ version: "site-visit-error.v1", code: "IDEMPOTENCY_CONFLICT" });
   expect(live.headers["cache-control"]).toBe("no-store"); expect(conflict.headers["cache-control"]).toBe("no-store");
  });
 }
 it("[B6] complete: a body with no close-out answer answers 400 CLOSEOUT_ANSWER_REQUIRED and reaches no repository", async () => {
  lookup.mockResolvedValue(member());
  const route = routes[1]!, { closeoutAnswer: _removed, ...without } = route.body!() as Record<string, unknown>;
  for (const body of [without, { ...without, closeoutAnswer: null }]) {
   const response = await call(route, session(), allowed, body);
   expect(response.status).toBe(400); expect(response.body).toEqual({ version: "site-visit-error.v1", code: "CLOSEOUT_ANSWER_REQUIRED" }); expect(response.headers["cache-control"]).toBe("no-store");
  }
  expect(repositories.completeVisit).not.toHaveBeenCalled();
 });
 it("[B2] success and an identical replay answer the same stored result: 201 for the commands and 200 for the reads, all no-store", async () => {
  lookup.mockResolvedValue(member());
  const visitId = randomUUID(), startedAt = "2026-10-13T09:00:00.123456Z";
  repositories.startVisit.mockResolvedValue({ visitId, startedAt }); repositories.completeVisit.mockResolvedValue({ visitId, completedAt: startedAt, closeoutAnswer: "no" });
  repositories.assignedJobs.mockResolvedValue({ jobs: [], truncated: false }); repositories.orderLines.mockResolvedValue({ jobId: randomUUID(), workOrderId: randomUUID(), revision: 1, lines: [] });
  for (const route of routes) {
   const cookie = session(), body = route.body?.(), job = randomUUID(), visit = randomUUID();
   const first = await call(route, cookie, allowed, body, job, visit), replay = await call(route, cookie, allowed, body, job, visit);
   expect(first.status).toBe(route.method === "post" ? 201 : 200); expect(replay.status).toBe(first.status); expect(replay.body).toEqual(first.body);
   expect(first.headers["cache-control"]).toBe("no-store"); expect(first.body.environment).toBe("synthetic_demo"); expect(first.body.realExternalActions).toBe(0);
  }
 });
});
describe("ENT-3b Nest HTTP pipeline in every other mode", () => {
 it.each([["pilot_no_charge", "pilot_no_charge"], ["production_billing", "production_billing"], ["an empty mode", ""], ["an unset mode", undefined]] as const)("[B18] %s is refused by the global guard's own 401 UNAUTHENTICATED for every route, for a valid session and a valid Origin; nothing runs", async (_name, mode) => {
  await start(mode);
  for (const route of routes) {
   const response = await call(route, session(), allowed);
   expect(response.status).toBe(401); expect(response.body).toEqual({ code: "UNAUTHENTICATED" }); expect(response.headers["cache-control"]).toBeUndefined();
  }
  untouched();
 });
});
