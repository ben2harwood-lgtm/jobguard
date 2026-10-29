import { ContractorEntitlementAuthorityRepository } from "@jobguard/db";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { ContractorRepository, SiteExtraRepository, SiteVisitRepository, WatchdogError, withTenant, type AuthenticatedMembership } from "@jobguard/db";
import * as bridge from "@jobguard/db";
import { SiteVisitError, siteVisitErrorCodes, siteVisitHttpStatus } from "@jobguard/core";
import { SiteExtraApplication, siteVisitHttpFailure } from "./site-extra.application.js";
import { SiteVisitController } from "./site-visit.controller.js";
import { createWorkspaceApplication } from "../workspace/application.js";
const id = () => crypto.randomUUID();
const start = () => ({ version: "start-site-visit.v1", commandId: id() });
const finish = (closeoutAnswer: unknown = "yes") => ({ version: "complete-site-visit.v1", commandId: id(), closeoutAnswer });
const member = () => ({ tenantId: id(), membershipId: id(), identityUserId: id() }) as AuthenticatedMembership;
const authorityFields = ["commandType", "actorMembershipId", "membershipId", "grantId", "tenantId", "requested_tenant_id", "role", "raisingRole", "origin", "kind", "jobTrack", "track", "serverRecordedAt", "time", "state", "raiserAssigned", "workOrderId", "workOrderRevisionId", "originHash", "environment", "provenance", "jobId", "visitId", "siteVisitId", "startedAt", "completedAt", "questionVersion"];
const principalOf = (sessionId = id()) => ({ version: "contractor-principal.v1", sessionId });
const started = () => ({ visitId: id(), startedAt: "2026-10-13T09:00:00.123456Z" });
const completed = (visitId = id()) => ({ visitId, completedAt: "2026-10-13T09:30:00.123456Z", closeoutAnswer: "yes" as const });
beforeEach(() => { vi.spyOn(ContractorEntitlementAuthorityRepository.prototype, "requireFeature").mockResolvedValue(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const synthetic = () => vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
const visitMethods = ["log", "startVisit", "completeVisit", "assignedJobs", "orderLines"] as const;
function assertVisitContextBoundary(source: string): void {
 const parsed = ts.createSourceFile("site-extra.application.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
 const application = parsed.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === "SiteExtraApplication");
 expect(application).toBeDefined();
 for (const name of visitMethods) {
  const methods = application!.members.filter((node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node) && node.name.getText(parsed) === name);
  expect(methods, name).toHaveLength(1);
  const body = methods[0]!.body;
  expect(body, name).toBeDefined();
  let resolverCalls = 0, bridgeReferences = 0;
  const inspect = (node: ts.Node): void => {
   if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.kind === ts.SyntaxKind.ThisKeyword && node.expression.name.text === "resolveContext") resolverCalls++;
   if (ts.isIdentifier(node) && node.text === "contractorSessionContext") bridgeReferences++;
   ts.forEachChild(node, inspect);
  };
  inspect(body!);
  expect(resolverCalls, name).toBe(1);
  expect(bridgeReferences, name).toBe(0);
 }
}

describe("ENT-3b service: authority comes only from the persisted session", () => {
 it("[B17] each repository method is called with the very same member object and the context from the shared bridge, once per request", async () => {
  synthetic(); const pool = new Pool(), m = member(), sessionId = id(), jobId = id(), visitId = id();
  const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(m);
  const real = bridge.contractorSessionContext, observe = vi.spyOn(bridge, "contractorSessionContext").mockImplementation(real);
  const marker = new Error("connection attempted after stamp verification"); vi.spyOn(pool, "connect").mockRejectedValue(marker);
  const check = (name: string) => async (context: bridge.VerifiedTenantContext, actor: AuthenticatedMembership) => {
   expect(actor, name).toBe(m); expect(context.tenantId).toBe(m.tenantId); expect(Object.isFrozen(context)).toBe(true);
   await expect(withTenant(pool, context, async () => undefined)).rejects.toBe(marker);
  };
  const startSpy = vi.spyOn(SiteVisitRepository.prototype, "startVisit").mockImplementation(async (c, a) => { await check("start")(c, a); return started(); });
  const completeSpy = vi.spyOn(SiteVisitRepository.prototype, "completeVisit").mockImplementation(async (c, a) => { await check("complete")(c, a); return completed(visitId); });
  const jobsSpy = vi.spyOn(SiteVisitRepository.prototype, "assignedJobs").mockImplementation(async (c, a) => { await check("jobs")(c, a); return { jobs: [], truncated: false }; });
  const linesSpy = vi.spyOn(SiteVisitRepository.prototype, "orderLines").mockImplementation(async (c, a) => { await check("lines")(c, a); return { jobId, workOrderId: id(), revision: 1, lines: [] }; });
  const app = new SiteExtraApplication(pool), principal = principalOf(sessionId);
  await app.startVisit(principal, jobId, start()); await app.completeVisit(principal, jobId, visitId, finish()); await app.assignedJobs(principal); await app.orderLines(principal, jobId);
  expect(observe).toHaveBeenCalledTimes(4); for (const call of observe.mock.calls) expect(call).toEqual([pool, sessionId]);
  expect(lookup.mock.calls).toEqual(Array(8).fill([sessionId]));
  for (const spy of [startSpy, completeSpy, jobsSpy, linesSpy]) expect(spy).toHaveBeenCalledOnce();
  expect(startSpy.mock.calls[0]![2]).toEqual({ commandId: expect.any(String), jobId });
  expect(completeSpy.mock.calls[0]![2]).toEqual({ commandId: expect.any(String), jobId, visitId, closeoutAnswer: "yes" });
  await pool.end();
 });
 it.each(authorityFields)("[B17] refuses body authority field %s before the repository, for both commands", async field => {
  synthetic(); const pool = new Pool(); vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member());
  const startSpy = vi.spyOn(SiteVisitRepository.prototype, "startVisit"), completeSpy = vi.spyOn(SiteVisitRepository.prototype, "completeVisit"), app = new SiteExtraApplication(pool);
  await expect(app.startVisit(principalOf(), id(), { ...start(), [field]: "tampered" })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  await expect(app.completeVisit(principalOf(), id(), id(), { ...finish(), [field]: "tampered" })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  expect(startSpy).not.toHaveBeenCalled(); expect(completeSpy).not.toHaveBeenCalled(); await pool.end();
 });
 it("[B17] a different tenant, member and role in the body, the path, extra cookies and the principal never change the context or the actor", async () => {
  synthetic(); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://app.fictional.invalid");
  const pool = new Pool(), m = member(), sessionId = id(), jobId = id(), controller = new SiteVisitController(pool);
  vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(m);
  const repo = vi.spyOn(SiteVisitRepository.prototype, "startVisit").mockResolvedValue(started());
  const cookie = `jg_session=${sessionId}; tenantId=${id()}; membershipId=${id()}; role=owner`;
  await controller.start(jobId, cookie, "https://app.fictional.invalid", start());
  expect(repo.mock.calls[0]![0].tenantId).toBe(m.tenantId); expect(repo.mock.calls[0]![1]).toBe(m);
  await expect(controller.start(jobId, cookie, "https://app.fictional.invalid", { ...start(), tenantId: id(), membershipId: id(), role: "owner" })).rejects.toMatchObject({ status: 400 });
  await expect(controller.start(`tenantId=${id()}&membershipId=${id()}&role=owner`, cookie, "https://app.fictional.invalid", start())).rejects.toMatchObject({ status: 404 });
  await expect(new SiteExtraApplication(pool).startVisit({ ...principalOf(sessionId), tenantId: id(), membershipId: id(), role: "owner" }, jobId, start())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(repo).toHaveBeenCalledOnce(); await pool.end();
 });
 it.each(["unknown", "different tenant"])("[B17] a %s second session lookup is refused before any repository", async cause => {
  synthetic(); const pool = new Pool(), m = member(), sessionId = id();
  const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValueOnce(m);
  if (cause === "unknown") lookup.mockRejectedValueOnce({ code: "UNAUTHENTICATED" }); else lookup.mockResolvedValueOnce(member());
  const repo = vi.spyOn(SiteVisitRepository.prototype, "startVisit"), connect = vi.spyOn(pool, "connect");
  await expect(new SiteExtraApplication(pool).startVisit(principalOf(sessionId), id(), start())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(repo).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled(); await pool.end();
 });
 it("[B17] the visit methods obtain the context only by calling the one resolver; the bridge is named nowhere else in the application", () => {
  const source = readFileSync(resolve(process.cwd(), "src/contractor/site-extra.application.ts"), "utf8");
  expect(source.match(/contractorSessionContext/gu)).toHaveLength(2); // the import and the single call inside the resolver
  assertVisitContextBoundary(source); // exactly one call in log and in each of the four visit methods, including nested callbacks
  expect(source).not.toMatch(/AuthProvider|\.requestCode|\.verifyCode/u);
 });
 it.each(["missing", "duplicate", "redistributed", "direct bridge"] as const)("[B17] the method-body check refuses %s context calls", invalid => {
  const bodies = new Map<string, string>(visitMethods.map(name => [name, "return (() => this.resolveContext())();"]));
  if (invalid === "missing" || invalid === "redistributed") bodies.set("assignedJobs", "return null;");
  if (invalid === "duplicate" || invalid === "redistributed") bodies.set("log", "this.resolveContext(); return (() => this.resolveContext())();");
  if (invalid === "direct bridge") bodies.set("startVisit", "contractorSessionContext(); return this.resolveContext();");
  const source = `class SiteExtraApplication { ${[...bodies].map(([name, body]) => `${name}() { ${body} }`).join("\n")} }`;
  expect(() => assertVisitContextBoundary(source)).toThrow();
 });
 it("[B17] the method-body check ignores comments, string literals and unrelated methods while parsing nested bodies", () => {
  const methods = visitMethods.map(name => `${name}(input: { nested: { value: string } }) { /* this.resolveContext(); contractorSessionContext(); */ const text = "this.resolveContext(); contractorSessionContext();"; return (() => { return this.resolveContext(); })(); }`);
  assertVisitContextBoundary(`class SiteExtraApplication { ${methods.join("\n")} logSor() { this.resolveContext(); } }`);
 });
});

describe("ENT-3b the close-out answer at the service", () => {
 it.each([[undefined], [null]])("[B6] a body with no answer (%s) is CLOSEOUT_ANSWER_REQUIRED (400) and the repository is never called", async answer => {
  synthetic(); const pool = new Pool(); vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member());
  const repo = vi.spyOn(SiteVisitRepository.prototype, "completeVisit"), body = { version: "complete-site-visit.v1", commandId: id(), ...(answer === null ? { closeoutAnswer: null } : {}) };
  const error = await new SiteExtraApplication(pool).completeVisit(principalOf(), id(), id(), body).then(() => undefined, (e: unknown) => e as SiteVisitError);
  expect(error).toMatchObject({ code: "CLOSEOUT_ANSWER_REQUIRED" }); expect(siteVisitHttpFailure(error)).toEqual({ status: 400, body: { version: "site-visit-error.v1", code: "CLOSEOUT_ANSWER_REQUIRED" } });
  expect(repo).not.toHaveBeenCalled(); await pool.end();
 });
 it.each(["", "maybe", true, "Yes", " yes", 1])("[B6] an invalid answer %j is INVALID_COMMAND and the repository is never called", async answer => {
  synthetic(); const pool = new Pool(); vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member());
  const repo = vi.spyOn(SiteVisitRepository.prototype, "completeVisit");
  await expect(new SiteExtraApplication(pool).completeVisit(principalOf(), id(), id(), finish(answer))).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  expect(repo).not.toHaveBeenCalled(); await pool.end();
 });
});

describe("ENT-3b transport", () => {
 it.each(["pilot_no_charge", "production_billing", ""])("[B18] mode %j is MODE_FORBIDDEN before any session lookup or database access", async mode => {
  vi.stubEnv("JOBGUARD_ENV", mode); const pool = new Pool(), lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession"), connect = vi.spyOn(pool, "connect"), query = vi.spyOn(pool, "query"), app = new SiteExtraApplication(pool);
  for (const call of [() => app.startVisit(principalOf(), id(), start()), () => app.completeVisit(principalOf(), id(), id(), finish()), () => app.assignedJobs(principalOf()), () => app.orderLines(principalOf(), id())]) await expect(call()).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
  expect(lookup).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled(); await pool.end();
 });
 it("[B18] a missing or malformed session is UNAUTHENTICATED before any database access", async () => {
  synthetic(); const pool = new Pool(), lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession"), connect = vi.spyOn(pool, "connect"), app = new SiteExtraApplication(pool);
  for (const principal of [undefined, { version: "contractor-principal.v1" }, { version: "contractor-principal.v1", sessionId: "invalid" }]) {
   await expect(app.startVisit(principal, id(), start())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
   await expect(app.completeVisit(principal, id(), id(), finish())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
   await expect(app.assignedJobs(principal)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
   await expect(app.orderLines(principal, id())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  }
  expect(lookup).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  lookup.mockRejectedValue({ code: "UNAUTHENTICATED" }); await expect(app.startVisit(principalOf(), id(), start())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  lookup.mockResolvedValue(member()); await expect(app.startVisit(principalOf(), "invalid", start())).rejects.toMatchObject({ code: "NOT_FOUND" }); await expect(app.completeVisit(principalOf(), id(), "invalid", finish())).rejects.toMatchObject({ code: "NOT_FOUND" }); await expect(app.orderLines(principalOf(), "invalid")).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(connect).not.toHaveBeenCalled(); await pool.end();
 });
 it.each([undefined, "null", "https://foreign.invalid"])("[B18] Nest refuses Origin %s on both POSTs before the service, with no-store", async origin => {
  const pool = new Pool(), controller = new SiteVisitController(pool), startSpy = vi.spyOn(SiteExtraApplication.prototype, "startVisit"), completeSpy = vi.spyOn(SiteExtraApplication.prototype, "completeVisit");
  expect(() => controller.start(id(), undefined, origin, start())).toThrow(); expect(() => controller.complete(id(), id(), undefined, origin, finish())).toThrow();
  expect(startSpy).not.toHaveBeenCalled(); expect(completeSpy).not.toHaveBeenCalled();
  for (const name of ["start", "complete", "assignedJobs", "orderLines"] as const) expect(Reflect.getMetadata("__headers__", SiteVisitController.prototype[name]), name).toEqual(expect.arrayContaining([{ name: "Cache-Control", value: "no-store" }]));
  await pool.end();
 });
 it("[B18] a refused Origin carries version and code only", () => {
  const pool = new Pool(), controller = new SiteVisitController(pool);
  try { controller.start(id(), undefined, "https://foreign.invalid", start()); expect.unreachable(); } catch (error) { expect(error).toMatchObject({ status: 403, response: { version: "site-visit-error.v1", code: "ORIGIN_FORBIDDEN" } }); }
  void pool.end();
 });
 it("[B18] every code maps to its one status, error bodies carry version and code only, and unexpected database text is removed", () => {
  for (const code of siteVisitErrorCodes) expect(siteVisitHttpFailure(new SiteVisitError(code))).toEqual({ status: siteVisitHttpStatus(code), body: { version: "site-visit-error.v1", code } });
  expect(siteVisitHttpFailure(new Error("PostgreSQL detail with a Fictional resident"))).toEqual({ status: 503, body: { version: "site-visit-error.v1", code: "SITE_VISIT_UNAVAILABLE" } });
  expect(siteVisitHttpFailure(new WatchdogError("JOB_NOT_LIVE")).body.code).toBe("JOB_NOT_LIVE"); expect(siteVisitHttpFailure(new WatchdogError("IDEMPOTENCY_CONFLICT")).status).toBe(409);
 });
 it("[BP-f] an unauthorised caller's refusal is the identical status, body and code whatever the job (the service adds nothing of its own)", async () => {
  synthetic(); const pool = new Pool(), app = new SiteExtraApplication(pool); vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member());
  for (const code of ["VISIT_FORBIDDEN", "NOT_FOUND"] as const) {
   vi.spyOn(SiteVisitRepository.prototype, "startVisit").mockRejectedValue(new SiteVisitError(code)); vi.spyOn(SiteVisitRepository.prototype, "completeVisit").mockRejectedValue(new SiteVisitError(code));
   const results = [];
   for (const job of [id(), id(), id(), id()]) { for (const call of [() => app.startVisit(principalOf(), job, start()), () => app.completeVisit(principalOf(), job, id(), finish())]) results.push(siteVisitHttpFailure(await call().then(() => undefined, (e: unknown) => e))); }
   for (const result of results) expect(result).toEqual(results[0]);
  }
  await pool.end();
 });
 it("[B18] 201 on both POSTs, 200 on both reads, and the shared failure mapper is exported through the workspace", async () => {
  expect(Reflect.getMetadata("__httpCode__", SiteVisitController.prototype.start)).toBe(201); expect(Reflect.getMetadata("__httpCode__", SiteVisitController.prototype.complete)).toBe(201);
  const workspace = await import("../workspace/index.js"); expect(workspace.siteVisitHttpFailure).toBe(siteVisitHttpFailure);
  const app = createWorkspaceApplication({ pool: new Pool(), sessionId: id() });
  expect(Object.keys(app.siteExtras).sort()).toEqual(["assignedJobs", "completeVisit", "log", "logSor", "orderCheck", "orderLines", "sorItems", "startVisit"]);
 });
 it("[B15] a read result that carries a price or a resident key fails closed and nothing of it is returned", async () => {
  synthetic(); const pool = new Pool(); vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member());
  vi.spyOn(SiteVisitRepository.prototype, "orderLines").mockResolvedValue({ jobId: id(), workOrderId: id(), revision: 1, lines: [{ position: 0, scopeItemId: id(), clientLineReference: null, sorCode: "X", description: "Fictional", unit: "each", quantity: "1", ratePence: 100 } as never] });
  vi.spyOn(SiteVisitRepository.prototype, "assignedJobs").mockResolvedValue({ jobs: [{ jobId: id(), workOrderId: id(), reference: "WO", priority: "routine", issuedOn: "2026-10-08", dueOn: null, openVisitId: null, address: "1 Fictional Street" } as never], truncated: false });
  const app = new SiteExtraApplication(pool);
  await expect(app.orderLines(principalOf(), id())).rejects.toMatchObject({ code: "SITE_VISIT_UNAVAILABLE" }); await expect(app.assignedJobs(principalOf())).rejects.toMatchObject({ code: "SITE_VISIT_UNAVAILABLE" }); await pool.end();
 });
});

describe("ENT-3b the site-extra log accepts both body versions side by side", () => {
 const v1 = () => ({ version: "log-site-extra.v1", commandId: id(), note: "Fictional note", description: "Fictional extra" });
 it("[B17-SIDE] a version 1 body reaches the repository as exactly four fields, a version 2 body as five, and both answer the same result shape", async () => {
  synthetic(); const pool = new Pool(), m = member(), jobId = id(), visitId = id(); vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(m);
  const repo = vi.spyOn(SiteExtraRepository.prototype, "logSiteExtra").mockResolvedValue({ variationId: id() }), app = new SiteExtraApplication(pool);
  const one = v1(), two = { ...v1(), version: "log-site-extra.v2", siteVisitId: visitId };
  const first = await app.log(principalOf(), jobId, one), second = await app.log(principalOf(), jobId, two);
  expect(repo.mock.calls[0]![2]).toEqual({ commandId: one.commandId, jobId, note: one.note, description: one.description }); expect(Object.keys(repo.mock.calls[0]![2] as object).sort()).toEqual(["commandId", "description", "jobId", "note"]);
  expect(repo.mock.calls[1]![2]).toEqual({ commandId: two.commandId, jobId, note: two.note, description: two.description, siteVisitId: visitId });
  expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort()); expect(first).toMatchObject({ version: "site-extra-logged.v1", state: "logged", jobId });
  await expect(app.log(principalOf(), jobId, { ...v1(), siteVisitId: visitId })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  const { siteVisitId: _removed, ...missing } = two; await expect(app.log(principalOf(), jobId, missing)).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  await expect(app.log(principalOf(), jobId, { ...two, siteVisitId: "invalid" })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  await expect(app.log(principalOf(), jobId, { ...two, tenantId: id() })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  expect(repo).toHaveBeenCalledTimes(2); await pool.end();
 });
});

describe("ENT-3b OpenAPI", () => {
 const spec = () => JSON.parse(readFileSync(resolve(process.cwd(), "openapi.json"), "utf8"));
 it("[B18] both POSTs document 201 and the exact live-only conflict enum; the reads document 200; the site-extras body documents both versions", () => {
  for (const path of ["/contractor/jobs/{id}/site-visits/start", "/contractor/jobs/{id}/site-visits/{visitId}/complete"]) {
   const responses = spec().paths[path].post.responses;
   expect(responses["201"]).toBeDefined(); expect(responses["409"].content["application/json"].schema.properties.code.enum).toEqual(["JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT"]);
  }
  expect(spec().paths["/contractor/site/jobs"].get.responses["200"]).toBeDefined(); expect(spec().paths["/contractor/jobs/{id}/order-lines"].get.responses["200"]).toBeDefined();
  const body = spec().paths["/contractor/jobs/{id}/site-extras"].post.requestBody.content["application/json"].schema;
  expect(body.oneOf.map((variant: { properties: { version: { enum: string[] } } }) => variant.properties.version.enum[0])).toEqual(["log-site-extra.v1", "log-site-extra.v2", "log-site-extra.v3"]);
 });
});
