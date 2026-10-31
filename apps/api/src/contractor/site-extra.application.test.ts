import { ContractorEntitlementAuthorityRepository } from "@jobguard/db";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
import { ContractorRepository, ExtraRepository, SiteExtraRepository, WatchdogError, withTenant, type AuthenticatedMembership } from "@jobguard/db";
import { SiteExtraError, siteExtraHttpStatus } from "@jobguard/core";
import * as bridge from "@jobguard/db";
import { SiteExtraApplication, siteExtraHttpFailure } from "./site-extra.application.js";
import { SiteExtraController } from "./site-extra.controller.js";
import { createWorkspaceApplication } from "../workspace/application.js";
const body = () => ({ version: "log-site-extra.v1", commandId: crypto.randomUUID(), note: "Fictional note", description: "Fictional extra" });
const authorityFields = ["commandType", "actorMembershipId", "membershipId", "grantId", "tenantId", "requested_tenant_id", "role", "raisingRole", "origin", "kind", "jobTrack", "track", "serverRecordedAt", "time", "state", "raiserAssigned", "workOrderId", "workOrderRevisionId", "originHash", "environment", "provenance"];
const member = () => ({ tenantId: crypto.randomUUID(), membershipId: crypto.randomUUID(), identityUserId: crypto.randomUUID() }) as AuthenticatedMembership;
beforeEach(() => { vi.spyOn(ContractorEntitlementAuthorityRepository.prototype, "requireFeature").mockResolvedValue(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("ENT-3a service and Nest boundary", () => {
 it("[A8] passes the identical session membership object and exactly four input fields", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(), m = member(), sessionId = crypto.randomUUID(), jobId = crypto.randomUUID(), raw = body();
  const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(m);
  const repo = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockResolvedValue({ variationId: crypto.randomUUID() });
  const result = await createWorkspaceApplication({ pool, sessionId }).siteExtras.log(jobId, raw);
  expect(lookup).toHaveBeenCalledTimes(2); expect(lookup.mock.calls).toEqual([[sessionId], [sessionId]]); expect(repo.mock.calls[0]![1]).toBe(m);
  expect(repo.mock.calls[0]![2]).toEqual({ commandId: raw.commandId, jobId, note: raw.note, description: raw.description });
  expect(result).toMatchObject({ version: "site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, state: "logged" }); await pool.end();
 });
 it.each(authorityFields)("[A8] refuses body authority field %s before repository", async field => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(), sessionId = crypto.randomUUID(); vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member());
  const repo = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra");
  await expect(new SiteExtraApplication(pool).log({ version: "contractor-principal.v1", sessionId }, crypto.randomUUID(), { ...body(), [field]: "tampered" })).rejects.toMatchObject({ code: "INVALID_COMMAND" }); expect(repo).not.toHaveBeenCalled(); await pool.end();
 });
 it("[A17] only the persisted member reaches the real bridge and its context passes the actual stamp check", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(), m = member(), sessionId = crypto.randomUUID();
  const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockImplementation(async value => {
   if (value !== sessionId) throw Object.assign(new Error("unknown session"), { code: "UNAUTHENTICATED" });
   return m;
  });
  const real = bridge.contractorSessionContext, observe = vi.spyOn(bridge, "contractorSessionContext").mockImplementation(real);
  const marker = new Error("connection attempted after stamp verification"); const connect = vi.spyOn(pool, "connect").mockRejectedValue(marker);
  const repo = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockImplementation(async (context, actor) => {
   expect(actor).toBe(m); expect(context.tenantId).toBe(m.tenantId); expect(Object.isFrozen(context)).toBe(true);
   await expect(withTenant(pool, context, async () => undefined)).rejects.toBe(marker);
   return { variationId: crypto.randomUUID() };
  });
  await new SiteExtraApplication(pool).log({ version: "contractor-principal.v1", sessionId }, crypto.randomUUID(), body());
  expect(observe).toHaveBeenCalledExactlyOnceWith(pool, sessionId);
  expect(lookup.mock.calls).toEqual([[sessionId], [sessionId]]);
  await expect(lookup.mock.results[1]!.value).resolves.toBe(m);
  expect(repo.mock.calls[0]![0]).toBe(await observe.mock.results[0]!.value);
  // The shared bridge accepts only a session: tenant/member IDs or an authority object cannot select membership.
  for (const value of [crypto.randomUUID(), m.tenantId, m.membershipId]) await expect(real(pool, value)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await expect(real(pool, { sessionId, tenantId: m.tenantId, membershipId: m.membershipId, identityUserId: crypto.randomUUID(), role: "owner" } as never)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(lookup).toHaveBeenCalledTimes(5);
  const calls = lookup.mock.calls.length;
  for (const value of [undefined, "invalid"]) await expect(real(pool, value as never)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  vi.stubEnv("JOBGUARD_ENV", "production_billing"); await expect(real(pool, sessionId)).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
  expect(lookup).toHaveBeenCalledTimes(calls);
  const applicationSource = readFileSync(resolve(process.cwd(), "src/contractor/site-extra.application.ts"), "utf8");
  expect(applicationSource).not.toMatch(/AuthProvider|\.requestCode|\.verifyCode/u);
  expect(connect).toHaveBeenCalledOnce(); expect(repo).toHaveBeenCalledOnce(); await pool.end();
 });
 it("[A17] different client tenant, member and role in body/path/principal are refused; extra cookies never change context", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://app.fictional.invalid");
  const pool = new Pool(), m = member(), sessionId = crypto.randomUUID(), jobId = crypto.randomUUID(), controller = new SiteExtraController(pool);
  vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(m);
  const repo = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockResolvedValue({ variationId: crypto.randomUUID() });
  const cookie = `jg_session=${sessionId}; tenantId=${crypto.randomUUID()}; membershipId=${crypto.randomUUID()}; role=owner`;
  await controller.log(jobId, cookie, "https://app.fictional.invalid", body()); expect(repo.mock.calls[0]![0].tenantId).toBe(m.tenantId); expect(repo.mock.calls[0]![1]).toBe(m);
  for (const raw of [{ ...body(), tenantId: crypto.randomUUID(), membershipId: crypto.randomUUID(), role: "owner" }]) await expect(controller.log(jobId, cookie, "https://app.fictional.invalid", raw)).rejects.toMatchObject({ status: 400 });
  await expect(controller.log(`tenantId=${crypto.randomUUID()}&membershipId=${crypto.randomUUID()}&role=owner`, cookie, "https://app.fictional.invalid", body())).rejects.toMatchObject({ status: 404 });
  await expect(new SiteExtraApplication(pool).log({ version: "contractor-principal.v1", sessionId, tenantId: crypto.randomUUID(), membershipId: crypto.randomUUID(), role: "owner" }, jobId, body())).rejects.toMatchObject({ code: "UNAUTHENTICATED" }); expect(repo).toHaveBeenCalledOnce(); await pool.end();
 });
 it.each(["unknown", "different tenant"])("[A17] %s second session lookup refuses before the command repository", async cause => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(), m = member(), sessionId = crypto.randomUUID();
  const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValueOnce(m);
  if (cause === "unknown") lookup.mockRejectedValueOnce({ code: "UNAUTHENTICATED" }); else lookup.mockResolvedValueOnce(member());
  const repo = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra"), connect = vi.spyOn(pool, "connect");
  await expect(new SiteExtraApplication(pool).log({ version: "contractor-principal.v1", sessionId }, crypto.randomUUID(), body())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(lookup.mock.calls).toEqual([[sessionId], [sessionId]]); expect(repo).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled(); await pool.end();
 });
 it.each(["revoked", "expired"])("[A17] a persisted session with %s membership reaches the shared bridge but is refused with 403", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(), m = member(), sessionId = crypto.randomUUID();
  const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(m);
  const observe = vi.spyOn(bridge, "contractorSessionContext");
  const raise = vi.spyOn(ExtraRepository.prototype, "raiseExtra");
  // Model the gate's absent active-membership row for either revocation or expiry.
  // An existing refusal audit models a retry; real PostgreSQL revocation coverage remains mandatory in CI.
  const query = vi.fn(async (sql: string) => ({
   // Eligibility is positive so this test still reaches the independent active-member gate.
   rows: sql.includes("app.mon8_feature_decision") ? [{ decision: { version: "plan-entitlement-decision.v1", environment: "synthetic_demo", feature: "site_origin_capture", entitlement: "included", executable: true, reason: "available" } }] : [],
   rowCount: sql.startsWith("SELECT 1 FROM app.audit_event") ? 1 : 0,
  }));
  const release = vi.fn(), connect = vi.spyOn(pool, "connect").mockImplementation(async () => ({ query, release }) as unknown as PoolClient);
  const failure = await new SiteExtraApplication(pool).log({ version: "contractor-principal.v1", sessionId }, crypto.randomUUID(), body()).then(() => undefined, siteExtraHttpFailure);
  expect(failure).toEqual({ status: 403, body: { version: "site-extra-error.v1", code: "EXTRA_FORBIDDEN" } });
  expect(observe).toHaveBeenCalledExactlyOnceWith(pool, sessionId); expect(lookup.mock.calls).toEqual([[sessionId], [sessionId]]);
  expect(connect).toHaveBeenCalledTimes(2); expect(release).toHaveBeenCalledTimes(2); expect(raise).not.toHaveBeenCalled();
  expect(query.mock.calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(2); await pool.end();
 });
 it.each(["pilot_no_charge", "production_billing", ""])("[A15] %s mode refuses before any database access", async mode => {
  vi.stubEnv("JOBGUARD_ENV", mode); const pool = new Pool(), connect = vi.spyOn(pool, "connect"), lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession");
  await expect(new SiteExtraApplication(pool).log(undefined, crypto.randomUUID(), body())).rejects.toMatchObject({ code: "MODE_FORBIDDEN" }); expect(connect).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled(); await pool.end();
 });
 it("[A15] missing/malformed/unrecognised sessions and invalid paths have typed failures", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(), app = new SiteExtraApplication(pool), lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockRejectedValue({ code: "UNAUTHENTICATED" });
  const connect = vi.spyOn(pool, "connect"), query = vi.spyOn(pool, "query");
  for (const principal of [undefined, { version: "contractor-principal.v1" }, { version: "contractor-principal.v1", sessionId: "invalid" }]) await expect(app.log(principal, crypto.randomUUID(), body())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(lookup).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
  await expect(app.log({ version: "contractor-principal.v1", sessionId: crypto.randomUUID() }, crypto.randomUUID(), body())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  lookup.mockResolvedValue(member()); await expect(app.log({ version: "contractor-principal.v1", sessionId: crypto.randomUUID() }, "invalid", body())).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(connect).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled(); await pool.end();
 });
 it.each([undefined, "null", "https://foreign.invalid"])("[A15] Nest refuses Origin %s before service with no-store", async origin => {
  const pool = new Pool(), controller = new SiteExtraController(pool), log = vi.spyOn(SiteExtraApplication.prototype, "log");
  expect(() => controller.log(crypto.randomUUID(), undefined, origin, body())).toThrow(); expect(log).not.toHaveBeenCalled();
  expect(Reflect.getMetadata("__headers__", SiteExtraController.prototype.log)).toEqual(expect.arrayContaining([{ name: "Cache-Control", value: "no-store" }])); await pool.end();
 });
 it("[A15] closed errors map to one status and unexpected database text is removed", () => {
  for (const code of ["UNAUTHENTICATED", "MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "TRACK_FORBIDDEN", "EXTRA_FORBIDDEN", "INVALID_COMMAND", "NOT_FOUND", "COMMAND_CONFLICT", "STALE_REVISION", "SITE_EXTRA_UNAVAILABLE"] as const) expect(siteExtraHttpFailure(new SiteExtraError(code))).toEqual({ status: siteExtraHttpStatus(code), body: code === "COMMAND_CONFLICT" ? { code: "IDEMPOTENCY_CONFLICT" } : { version: "site-extra-error.v1", code } });
  expect(siteExtraHttpFailure(new Error("PostgreSQL detail with Fictional note"))).toEqual({ status: 503, body: { version: "site-extra-error.v1", code: "SITE_EXTRA_UNAVAILABLE" } });
 });
 it("[A18] sole application caller uses the guard; repository has no direct writes or replaceable command type", () => {
  const root = resolve(process.cwd(), "../..");
  function sources(dir: string): string[] { return readdirSync(dir).flatMap(name => { const path = resolve(dir, name); return statSync(path).isDirectory() ? sources(path) : /\.(?:ts|tsx|mjs)$/u.test(name) && !/\.(?:test|spec)\./u.test(name) ? [path] : []; }); }
  const files = [...sources(resolve(root, "apps/api/src")), ...sources(resolve(root, "apps/web/app")), ...readdirSync(resolve(root, "packages")).flatMap(name => sources(resolve(root, "packages", name, "src")))];
  const callers = files.filter(file => /\.raiseExtra\s*\(/u.test(readFileSync(file, "utf8"))).map(file => relative(root, file)); expect(callers).toEqual(["packages/db/src/site-extra-repository.ts"]);
  const source = readFileSync(resolve(root, callers[0]!), "utf8"); expect(source.match(/LogSiteExtra/gu)).toHaveLength(1); expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/u); expect(source).toMatch(/await siteExtraAuthoritySeam\(db, fact\)/u);
  expect(source).not.toMatch(/(?:logSiteExtra|siteExtraAuthoritySeam)\([^)]*commandType/u);
 });
});

// Repair round 2: direct controller tests need no socket or PostgreSQL.
it.each([{ id: "R2", error: new WatchdogError("JOB_NOT_LIVE") }, { id: "R3", error: new SiteExtraError("COMMAND_CONFLICT") }])("[$id] controller preserves the exact public live/conflict refusal", async ({ error }) => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://app.fictional.invalid");
 const pool = new Pool(); vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member());
 vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockRejectedValue(error);
 const code = error.code === "COMMAND_CONFLICT" ? "IDEMPOTENCY_CONFLICT" : "JOB_NOT_LIVE";
 await expect(new SiteExtraController(pool).log(crypto.randomUUID(), `jg_session=${crypto.randomUUID()}`, "https://app.fictional.invalid", body())).rejects.toMatchObject({ status: 409, response: { code } });
 expect(siteExtraHttpFailure(error)).toEqual({ status: 409, body: { code } }); await pool.end();
});
it("[R4] Nest success and replay use 201 and the same repository result", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://app.fictional.invalid");
 const pool = new Pool(), controller = new SiteExtraController(pool), jobId = crypto.randomUUID(), request = body(), cookie = `jg_session=${crypto.randomUUID()}`;
 vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member());
 const stored = { variationId: crypto.randomUUID() }; vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockResolvedValue(stored);
 const first = await controller.log(jobId, cookie, "https://app.fictional.invalid", request);
 expect(await controller.log(jobId, cookie, "https://app.fictional.invalid", request)).toEqual(first);
 expect(first.extraId).toBe(stored.variationId); expect(Reflect.getMetadata("__httpCode__", controller.log)).toBe(201); await pool.end();
});
it("[R5] site-extra OpenAPI documents 201 and the exact live-only conflict enum", () => {
 const spec = JSON.parse(readFileSync(resolve(process.cwd(), "openapi.json"), "utf8"));
 const responses = spec.paths["/contractor/jobs/{id}/site-extras"].post.responses;
 expect(responses["201"]).toBeDefined(); expect(responses["200"]).toBeDefined();
 expect(responses["409"].content["application/json"].schema.properties.code.enum).toEqual(["JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT"]);
});
