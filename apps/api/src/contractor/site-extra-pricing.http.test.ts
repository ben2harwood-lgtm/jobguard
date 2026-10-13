// ENT-3c: drives the real Nest pipeline (AppModule with the merged global guard and the framework body parser) for the three new routes and pins what really happens.
// Refusals made before the controller keep the merged framework / guard shape; refusals made by the piece carry its own envelope. In every case the service was never called.
import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import { Inject, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractorRepository, SiteExtraRepository, type AuthenticatedMembership } from "@jobguard/db";
import { SorSiteExtraError } from "@jobguard/core";
import * as bridge from "@jobguard/db";
import { AppModule } from "../app.module.js";
import { SiteExtraApplication } from "./site-extra.application.js";
import { SiteExtraPricingController } from "./site-extra-pricing.controller.js";
// The test runner does not emit decorator metadata, so the controller's Pool parameter is declared by hand (as app.module.ts does for DecisionsController).
Inject(Pool)(SiteExtraPricingController, undefined, 0);
const allowed = "https://app.fictional.invalid";
const payload = (fields: Record<string, unknown> = {}) => ({ version: "log-sor-site-extra.v1", commandId: randomUUID(), sorCode: "CLEAR-GUTTER", quantity: "2", note: "Fictional HTTP note", ...fields });
const session = () => `jg_session=${randomUUID()}`;
const member = () => ({ tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() }) as AuthenticatedMembership;
let app: INestApplication;
type Spy = ReturnType<typeof vi.spyOn>;
let context: Spy, service: Spy, readService: Spy, lookup: Spy, logged: Spy, query: Spy, connect: Spy;
async function start(mode: string | undefined) {
  vi.stubEnv("JOBGUARD_ENV", mode as never); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", allowed); vi.stubEnv("DATABASE_URL", undefined as never);
  // The real identity application the merged guard builds when the request is not a synthetic session; its storage address never receives a statement here.
  const material = randomBytes(32).toString("hex");
  const codeVariable = ["AUTH", "CODE", "SECRET"].join("_");
  vi.stubEnv("IDENTITY_DATABASE_URL", "postgresql://jobguard_identity@127.0.0.1:1/jobguard_identity"); vi.stubEnv("AUTH_ALLOWED_ORIGIN", allowed); vi.stubEnv(codeVariable, material);
  const database = new Error("a database statement was issued");
  query = vi.spyOn(Pool.prototype, "query").mockRejectedValue(database as never); connect = vi.spyOn(Pool.prototype, "connect").mockRejectedValue(database as never);
  context = vi.spyOn(bridge, "contractorSessionContext"); service = vi.spyOn(SiteExtraApplication.prototype, "logSor"); readService = vi.spyOn(SiteExtraApplication.prototype, "sorItems");
  lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession"); logged = vi.spyOn(SiteExtraRepository.prototype, "logSorSiteExtra");
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); await app.init();
}
const post = (cookie: string | undefined, origin: string | undefined, body: unknown = payload(), job = randomUUID()) => {
  let call = request(app.getHttpServer()).post(`/contractor/jobs/${job}/site-extras/sor`);
  if (cookie) call = call.set("cookie", cookie);
  if (origin !== undefined) call = call.set("origin", origin);
  return call.send(body as object);
};
const untouched = () => { for (const spy of [service, readService, lookup, context, logged, query, connect]) expect(spy).not.toHaveBeenCalled(); };
afterEach(async () => { await app?.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("ENT-3c Nest HTTP pipeline for POST /contractor/jobs/:id/site-extras/sor", () => {
  beforeEach(() => start("synthetic_demo"));
  it("[C20] (a) malformed JSON is answered by the framework's own 400 before the guard or controller; nothing runs", async () => {
    const response = await request(app.getHttpServer()).post(`/contractor/jobs/${randomUUID()}/site-extras/sor`).set("cookie", session()).set("origin", allowed).set("content-type", "application/json").send('{"note": malformed');
    expect(response.status).toBe(400); expect(response.body).toMatchObject({ statusCode: 400, error: "Bad Request" }); expect(response.body).not.toHaveProperty("version"); expect(response.body).not.toHaveProperty("code");
    expect(response.headers["cache-control"]).toBeUndefined(); untouched();
  });
  it("[C20] (b) no session cookie, and a cookie that is not a synthetic session, are answered by the global guard's own 401; nothing runs", async () => {
    for (const cookie of [undefined, "jg_session=not-a-session"]) {
      const response = await post(cookie, allowed); expect(response.status).toBe(401); expect(response.body).toEqual({ code: "UNAUTHENTICATED" }); expect(response.headers["cache-control"]).toBeUndefined();
    }
    untouched();
  });
  it.each([["foreign", "https://evil.example"], ["missing", undefined], ["null", "null"]] as const)("[C20] (d) a %s Origin with a valid session is the piece's own ORIGIN_FORBIDDEN with version, code and no-store; the service is never called", async (_name, origin) => {
    const response = await post(session(), origin);
    expect(response.status).toBe(403); expect(response.body).toEqual({ version: "sor-site-extra-error.v1", code: "ORIGIN_FORBIDDEN" }); expect(response.headers["cache-control"]).toBe("no-store"); untouched();
  });
  it("[C20] (e) a well-formed request refused by the piece for an unknown job answers the piece's own NOT_FOUND envelope with no-store, through the shared bridge", async () => {
    const m = member(), job = randomUUID(), body = payload(), cookie = session(), sessionId = cookie.slice("jg_session=".length);
    lookup.mockResolvedValue(m); logged.mockRejectedValue(new SorSiteExtraError("NOT_FOUND"));
    const response = await post(cookie, allowed, body, job);
    expect(response.status).toBe(404); expect(response.body).toEqual({ version: "sor-site-extra-error.v1", code: "NOT_FOUND" }); expect(response.headers["cache-control"]).toBe("no-store");
    expect(service).toHaveBeenCalledExactlyOnceWith({ version: "contractor-principal.v1", sessionId }, job, body);
    expect(lookup.mock.calls).toEqual([[sessionId], [sessionId]]); expect(context).toHaveBeenCalledExactlyOnceWith(expect.any(Pool), sessionId); expect(logged.mock.calls[0]![1]).toBe(m); expect(logged.mock.calls[0]![0]).toBe(await context.mock.results[0]!.value);
    expect(query).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  });
  it("[C20] (e) a body that breaks the strict schema answers INVALID_COMMAND, a bad quantity answers INVALID_QUANTITY; both 400 with no-store and no repository write", async () => {
    lookup.mockResolvedValue(member());
    const strict = await post(session(), allowed, payload({ grantId: "tampered" })); expect(strict.status).toBe(400); expect(strict.body).toEqual({ version: "sor-site-extra-error.v1", code: "INVALID_COMMAND" }); expect(strict.headers["cache-control"]).toBe("no-store");
    const quantity = await post(session(), allowed, payload({ quantity: "0" })); expect(quantity.status).toBe(400); expect(quantity.body).toEqual({ version: "sor-site-extra-error.v1", code: "INVALID_QUANTITY" });
    expect(logged).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  });
  it("[C20] (e) a session the database does not know answers the piece's own UNAUTHENTICATED envelope, a different body from the guard's 401", async () => {
    lookup.mockRejectedValue(Object.assign(new Error("unknown session"), { code: "UNAUTHENTICATED" }));
    const response = await post(session(), allowed);
    expect(response.status).toBe(401); expect(response.body).toEqual({ version: "sor-site-extra-error.v1", code: "UNAUTHENTICATED" }); expect(response.headers["cache-control"]).toBe("no-store");
    expect(logged).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  });
  it("[C20] the not-live and conflict refusals are 409 with the documented codes, and success and replay are 201 with the same stored result", async () => {
    lookup.mockResolvedValue(member());
    for (const code of ["JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT"] as const) { logged.mockRejectedValueOnce(new SorSiteExtraError(code)); const response = await post(session(), allowed); expect(response.status).toBe(409); expect(response.body).toEqual({ version: "sor-site-extra-error.v1", code }); expect(response.headers["cache-control"]).toBe("no-store"); }
    const job = randomUUID(), stored = { variationId: randomUUID(), jobId: job, coverage: "new", sorCode: "CLEAR-GUTTER", unit: "metre", claimedQuantity: "2", instructedQuantity: null, extraQuantity: "2", orderLineScopeItemId: null, priceSource: "server_sor", requestHash: "a".repeat(64), raisingMembershipId: randomUUID() };
    logged.mockResolvedValue(stored); const body = payload(), cookie = session(), first = await post(cookie, allowed, body, job), replay = await post(cookie, allowed, body, job);
    expect(first.status).toBe(201); expect(replay.status).toBe(201); expect(replay.body).toEqual(first.body); expect(first.body).toMatchObject({ version: "sor-site-extra-logged.v1", extraId: stored.variationId, state: "logged", priceSource: "server_sor" });
    expect(first.headers["cache-control"]).toBe("no-store"); expect(replay.headers["cache-control"]).toBe("no-store");
  });
  it("[C20] an unexpected error carrying PostgreSQL text answers SITE_PRICING_UNAVAILABLE with none of that text", async () => {
    lookup.mockResolvedValue(member()); logged.mockRejectedValue(new Error("duplicate key value violates unique constraint Fictional HTTP note"));
    const response = await post(session(), allowed);
    expect(response.status).toBe(503); expect(response.body).toEqual({ version: "sor-site-extra-error.v1", code: "SITE_PRICING_UNAVAILABLE" }); expect(JSON.stringify(response.body)).not.toContain("duplicate key");
  });
});

describe("ENT-3c Nest HTTP pipeline for the two reads", () => {
  beforeEach(() => start("synthetic_demo"));
  it("[C20] the reads need the guard's session, answer no-store, and a missing parameter is a 400 with the piece's own envelope", async () => {
    const job = randomUUID();
    const none = await request(app.getHttpServer()).get(`/contractor/jobs/${job}/sor-items?q=gutter`); expect(none.status).toBe(401); expect(none.body).toEqual({ code: "UNAUTHENTICATED" }); untouched();
    lookup.mockResolvedValue(member());
    const missing = await request(app.getHttpServer()).get(`/contractor/jobs/${job}/sor-items`).set("cookie", session());
    expect(missing.status).toBe(400); expect(missing.body).toEqual({ version: "sor-site-extra-error.v1", code: "INVALID_COMMAND" }); expect(missing.headers["cache-control"]).toBe("no-store");
    const noCode = await request(app.getHttpServer()).get(`/contractor/jobs/${job}/order-check?quantity=2`).set("cookie", session()); expect(noCode.status).toBe(400); expect(noCode.body.code).toBe("INVALID_COMMAND");
    const noQuantity = await request(app.getHttpServer()).get(`/contractor/jobs/${job}/order-check?sorCode=A`).set("cookie", session()); expect(noQuantity.status).toBe(400); expect(noQuantity.body.code).toBe("INVALID_QUANTITY");
    expect(query).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  });
  it("[C20] the reads answer 200 with the stored facts and no money key", async () => {
    lookup.mockResolvedValue(member()); const job = randomUUID(), version = randomUUID();
    vi.spyOn(SiteExtraRepository.prototype, "sorItems").mockResolvedValue({ sorVersionId: version, items: [{ code: "CLEAR-GUTTER", description: "Clear gutters", unit: "metre" }], truncated: false });
    vi.spyOn(SiteExtraRepository.prototype, "orderCheck").mockResolvedValue({ outcome: "new", sorCode: "CLEAR-GUTTER", unit: "metre", claimedQuantity: "2", instructedQuantity: null, extraQuantity: "2", orderLineScopeItemId: null });
    const items = await request(app.getHttpServer()).get(`/contractor/jobs/${job}/sor-items?q=gutter&tenantId=${randomUUID()}`).set("cookie", session());
    expect(items.status).toBe(200); expect(items.body).toMatchObject({ version: "site-sor-items.v1", jobId: job, sorVersionId: version, truncated: false }); expect(items.headers["cache-control"]).toBe("no-store");
    const check = await request(app.getHttpServer()).get(`/contractor/jobs/${job}/order-check?sorCode=CLEAR-GUTTER&quantity=2`).set("cookie", session());
    expect(check.status).toBe(200); expect(check.body).toMatchObject({ version: "site-order-check.v1", jobId: job, orderCheck: { outcome: "new", extraQuantity: "2" } }); expect(check.headers["cache-control"]).toBe("no-store");
    for (const body of [items.body, check.body]) expect(JSON.stringify(body)).not.toMatch(/pence|rate|net|price|amount|resident|contact|address/iu);
  });
});

describe("ENT-3c Nest HTTP pipeline in every other mode", () => {
  it.each([["pilot_no_charge", "pilot_no_charge"], ["production_billing", "production_billing"], ["an empty mode", ""], ["an unset mode", undefined]] as const)("[C20] (c) %s is refused by the global guard's own 401 UNAUTHENTICATED for a valid session, Origin and body; nothing runs", async (_name, mode) => {
    await start(mode);
    const response = await post(session(), allowed); expect(response.status).toBe(401); expect(response.body).toEqual({ code: "UNAUTHENTICATED" }); expect(response.headers["cache-control"]).toBeUndefined();
    const read = await request(app.getHttpServer()).get(`/contractor/jobs/${randomUUID()}/sor-items?q=a`).set("cookie", session()); expect(read.status).toBe(401);
    untouched();
  });
});
