import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
import { ContractorRepository, ExtraRepository, SiteExtraRepository, verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership } from "@jobguard/db";
import { ExtraPersistenceError, SorSiteExtraError, sorSiteExtraErrorCodes, sorSiteExtraHttpStatus, sorSiteExtraLoggedV1, siteOrderCheckV1, siteSorItemsV1 } from "@jobguard/core";
import * as bridge from "@jobguard/db";
import { SiteExtraApplication, sorSiteExtraHttpFailure } from "./site-extra.application.js";
import { SiteExtraPricingController } from "./site-extra-pricing.controller.js";
import { createWorkspaceApplication } from "../workspace/application.js";

const uuid = () => crypto.randomUUID();
const body = (fields: Record<string, unknown> = {}): Record<string, any> => ({ version: "log-sor-site-extra.v1", commandId: uuid(), sorCode: "CLEAR-GUTTER", quantity: "2", note: "Fictional note", ...fields });
const member = () => ({ tenantId: uuid(), membershipId: uuid(), identityUserId: uuid() }) as AuthenticatedMembership;
const authorityFields = ["commandType", "actorMembershipId", "membershipId", "grantId", "tenantId", "requested_tenant_id", "role", "raisingRole", "origin", "kind", "jobTrack", "track", "serverRecordedAt", "time", "state", "raiserAssigned", "workOrderId", "workOrderRevisionId", "originHash", "environment", "provenance",
  "jobId", "sorItem", "sorVersionId", "excessOfScopeItemId", "unit", "rate", "ratePence", "unitRatePence", "adjustment", "net", "netPence", "price", "pricePence", "amount", "extraQuantity", "instructedQuantity", "outcome", "orderCheck", "coverage", "priceSource", "pricingBasis", "description", "revision", "revisionId", "contentHash", "requestHash", "siteVisitId"];
const stored = (jobId: string) => ({ variationId: uuid(), jobId, coverage: "excess" as const, sorCode: "CLEAR-GUTTER", unit: "metre", claimedQuantity: "6", instructedQuantity: "4", extraQuantity: "2", orderLineScopeItemId: uuid(), priceSource: "server_sor", requestHash: "a".repeat(64), raisingMembershipId: uuid() });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("ENT-3c service and Nest boundary", () => {
  it("[C2] passes the identical session membership object and exactly the parsed fields, and answers the stored facts without any money key", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(), m = member(), sessionId = uuid(), jobId = uuid(), raw = body({ orderLineScopeItemId: uuid() });
    const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(m);
    const result = stored(jobId), repo = vi.spyOn(SiteExtraRepository.prototype, "logSorSiteExtra").mockResolvedValue(result);
    const answer = await createWorkspaceApplication({ pool, sessionId }).siteExtras.logSor(jobId, raw);
    expect(lookup.mock.calls).toEqual([[sessionId], [sessionId]]); expect(repo.mock.calls[0]![1]).toBe(m);
    expect(repo.mock.calls[0]![2]).toEqual({ commandId: raw.commandId, jobId, sorCode: raw.sorCode, quantity: raw.quantity, orderLineScopeItemId: raw.orderLineScopeItemId, note: raw.note });
    expect(sorSiteExtraLoggedV1.parse(answer)).toEqual(answer);
    expect(answer).toMatchObject({ version: "sor-site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, extraId: result.variationId, state: "logged", priceSource: "server_sor", orderCheck: { outcome: "more_than_ordered", extraQuantity: "2", instructedQuantity: "4" } });
    for (const key of JSON.stringify(answer).match(/"[A-Za-z]+":/gu)!) if (key !== '"priceSource":') expect(key).not.toMatch(/pence|rate|net|price|amount/iu);
    const items = vi.spyOn(SiteExtraRepository.prototype, "sorItems").mockResolvedValue({ sorVersionId: uuid(), items: [{ code: "A", description: "a", unit: "each" }], truncated: false });
    const check = vi.spyOn(SiteExtraRepository.prototype, "orderCheck").mockResolvedValue({ outcome: "already_on_order", sorCode: "A", unit: "each", claimedQuantity: "1", instructedQuantity: "3", orderLineScopeItemId: uuid() });
    const app = createWorkspaceApplication({ pool, sessionId }).siteExtras;
    expect(siteSorItemsV1.parse(await app.sorItems(jobId, { q: "a" }))).toMatchObject({ jobId, truncated: false }); expect(items.mock.calls[0]![1]).toBe(m); expect(items.mock.calls[0]![2]).toBe(jobId); expect(items.mock.calls[0]![3]).toEqual({ q: "a" });
    expect(siteOrderCheckV1.parse(await app.orderCheck(jobId, { sorCode: "A", quantity: "1" }))).toMatchObject({ orderCheck: { outcome: "already_on_order" } }); expect(check.mock.calls[0]![1]).toBe(m); expect(check.mock.calls[0]![3]).toEqual({ sorCode: "A", quantity: "1" });
    await pool.end();
  });

  it.each(authorityFields)("[C2] refuses body authority or derived field %s before the repository", async field => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(); vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member());
    const repo = vi.spyOn(SiteExtraRepository.prototype, "logSorSiteExtra");
    await expect(new SiteExtraApplication(pool).logSor({ version: "contractor-principal.v1", sessionId: uuid() }, uuid(), { ...body(), [field]: "tampered" })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    expect(repo).not.toHaveBeenCalled(); await pool.end();
  });

  it("[C2] only the persisted member reaches the real bridge, once per request, and its context passes the actual stamp check", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(), m = member(), sessionId = uuid();
    const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(m);
    const real = bridge.contractorSessionContext, observe = vi.spyOn(bridge, "contractorSessionContext").mockImplementation(real);
    const marker = new Error("connection attempted after stamp verification"); vi.spyOn(pool, "connect").mockRejectedValue(marker);
    const repo = vi.spyOn(SiteExtraRepository.prototype, "logSorSiteExtra").mockImplementation(async (context, actor) => {
      expect(actor).toBe(m); expect(context.tenantId).toBe(m.tenantId); expect(Object.isFrozen(context)).toBe(true);
      await expect(withTenant(pool, context, async () => undefined)).rejects.toBe(marker);
      return stored(uuid());
    });
    await new SiteExtraApplication(pool).logSor({ version: "contractor-principal.v1", sessionId }, uuid(), body());
    expect(observe).toHaveBeenCalledExactlyOnceWith(pool, sessionId); expect(lookup.mock.calls).toEqual([[sessionId], [sessionId]]); expect(repo.mock.calls[0]![0]).toBe(await observe.mock.results[0]!.value);
    // tenant ids, member ids or an authority object in the principal never select a membership
    await expect(new SiteExtraApplication(pool).logSor({ version: "contractor-principal.v1", sessionId, tenantId: uuid(), membershipId: uuid(), role: "owner" }, uuid(), body())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(repo).toHaveBeenCalledOnce();
    await pool.end();
  });

  it("[C2] a different tenant, member and role in the body, path, query or extra cookies never change the context or the actor", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://app.fictional.invalid");
    const pool = new Pool(), m = member(), sessionId = uuid(), jobId = uuid(), controller = new SiteExtraPricingController(pool);
    vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(m);
    const repo = vi.spyOn(SiteExtraRepository.prototype, "logSorSiteExtra").mockResolvedValue(stored(jobId));
    const items = vi.spyOn(SiteExtraRepository.prototype, "sorItems").mockResolvedValue({ sorVersionId: uuid(), items: [], truncated: false });
    const cookie = `jg_session=${sessionId}; tenantId=${uuid()}; membershipId=${uuid()}; role=owner`;
    await controller.logSor(jobId, cookie, "https://app.fictional.invalid", body()); expect(repo.mock.calls[0]![0].tenantId).toBe(m.tenantId); expect(repo.mock.calls[0]![1]).toBe(m);
    await expect(controller.logSor(jobId, cookie, "https://app.fictional.invalid", { ...body(), tenantId: uuid(), membershipId: uuid(), role: "owner" })).rejects.toMatchObject({ status: 400 });
    await expect(controller.logSor(`tenantId=${uuid()}&membershipId=${uuid()}&role=owner`, cookie, "https://app.fictional.invalid", body())).rejects.toMatchObject({ status: 404 });
    await controller.sorItems(jobId, cookie, "gutter"); expect(items.mock.calls[0]![1]).toBe(m); expect(items.mock.calls[0]![3]).toEqual({ q: "gutter" });
    await expect(controller.sorItems(jobId, cookie, undefined)).rejects.toMatchObject({ status: 400 });
    expect(repo).toHaveBeenCalledOnce(); await pool.end();
  });

  it.each(["pilot_no_charge", "production_billing", ""])("[C20] %s mode refuses all three before any database access", async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode); const pool = new Pool(), connect = vi.spyOn(pool, "connect"), lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession"), app = new SiteExtraApplication(pool);
    for (const run of [() => app.logSor(undefined, uuid(), body()), () => app.sorItems(undefined, uuid(), { q: "a" }), () => app.orderCheck(undefined, uuid(), { sorCode: "A", quantity: "1" })]) await expect(run()).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
    expect(connect).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled(); await pool.end();
  });

  it("[C20] missing, malformed and unrecognised sessions and invalid paths have typed failures, with no database access before a valid session", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool(), app = new SiteExtraApplication(pool), lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockRejectedValue({ code: "UNAUTHENTICATED" });
    const connect = vi.spyOn(pool, "connect"), query = vi.spyOn(pool, "query");
    for (const principal of [undefined, { version: "contractor-principal.v1" }, { version: "contractor-principal.v1", sessionId: "invalid" }]) await expect(app.logSor(principal, uuid(), body())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(lookup).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
    await expect(app.sorItems({ version: "contractor-principal.v1", sessionId: uuid() }, uuid(), { q: "a" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    lookup.mockResolvedValue(member());
    await expect(app.logSor({ version: "contractor-principal.v1", sessionId: uuid() }, "invalid", body())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(app.orderCheck({ version: "contractor-principal.v1", sessionId: uuid() }, "invalid", { sorCode: "A", quantity: "1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(app.orderCheck({ version: "contractor-principal.v1", sessionId: uuid() }, uuid(), { quantity: "1" })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(app.orderCheck({ version: "contractor-principal.v1", sessionId: uuid() }, uuid(), { sorCode: "A" })).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
    await expect(app.logSor({ version: "contractor-principal.v1", sessionId: uuid() }, uuid(), { ...body(), quantity: "0" })).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
    expect(connect).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled(); await pool.end();
  });

  it.each([undefined, "null", "https://foreign.invalid"])("[C20] Nest refuses Origin %s before the service with no-store", async origin => {
    const pool = new Pool(), controller = new SiteExtraPricingController(pool), logSor = vi.spyOn(SiteExtraApplication.prototype, "logSor");
    expect(() => controller.logSor(uuid(), undefined, origin, body())).toThrow(); expect(logSor).not.toHaveBeenCalled();
    for (const handler of [SiteExtraPricingController.prototype.logSor, SiteExtraPricingController.prototype.sorItems, SiteExtraPricingController.prototype.orderCheck]) expect(Reflect.getMetadata("__headers__", handler)).toEqual(expect.arrayContaining([{ name: "Cache-Control", value: "no-store" }]));
    await pool.end();
  });

  it("[C20] every closed code maps to one status, error bodies carry version and code only, and unexpected database text is removed", () => {
    for (const code of sorSiteExtraErrorCodes) expect(sorSiteExtraHttpFailure(new SorSiteExtraError(code))).toEqual({ status: sorSiteExtraHttpStatus(code), body: { version: "sor-site-extra-error.v1", code } });
    expect(sorSiteExtraHttpFailure(new Error("PostgreSQL detail with Fictional note"))).toEqual({ status: 503, body: { version: "sor-site-extra-error.v1", code: "SITE_PRICING_UNAVAILABLE" } });
    expect(sorSiteExtraHttpFailure({ code: "23514", message: "detail" })).toEqual({ status: 503, body: { version: "sor-site-extra-error.v1", code: "SITE_PRICING_UNAVAILABLE" } });
  });

  it("[C20] success on the POST is 201, and the controller documents 201 and the two-code 409", () => {
    expect(Reflect.getMetadata("__httpCode__", SiteExtraPricingController.prototype.logSor)).toBe(201);
    const spec = JSON.parse(readFileSync(resolve(process.cwd(), "openapi.json"), "utf8"));
    const post = spec.paths["/contractor/jobs/{id}/site-extras/sor"].post.responses;
    expect(post["201"]).toBeDefined(); expect(post["409"].content["application/json"].schema.properties.code.enum).toEqual(["JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT"]);
    expect(spec.paths["/contractor/jobs/{id}/sor-items"].get.responses["200"]).toBeDefined(); expect(spec.paths["/contractor/jobs/{id}/order-check"].get.responses["200"]).toBeDefined();
  });
});

// [C19] The seam and the single path, with the repository's collaborators stubbed (no PostgreSQL): a fake connection answers the reads and records every statement.
describe("ENT-3c single path and seam", () => {
  function harness(options: { lines?: Array<{ scope_item_id: string; sor_code: string; quantity: string; position: number }>; failSeam?: { fragment: string; message: string } } = {}) {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const m = member(), pool = new Pool(), context = verifiedTenantContextFromMembership(m), jobId = uuid(), variationId = uuid(), statements: string[] = [];
    let raising = false;
    const client = { release: vi.fn(), query: vi.fn(async (sql: string) => {
      const text = String(sql).replace(/\s+/gu, " ").trim(); statements.push(text);
      if (raising && options.failSeam && text.includes(options.failSeam.fragment)) throw new Error(options.failSeam.message);
      if (text.includes("FROM app.work_order w")) return { rows: [{ revision_id: uuid(), sor_version_id: uuid() }], rowCount: 1 };
      if (text.includes("FROM app.sor_item WHERE tenant_id=$1 AND version_id=$2 AND code=$3")) return { rows: [{ code: "CLEAR-GUTTER", description: "Clear gutters", unit: "metre" }], rowCount: 1 };
      if (text.includes("FROM app.work_order_line")) return { rows: options.lines ?? [], rowCount: (options.lines ?? []).length };
      return { rows: [], rowCount: 0 };
    }) };
    vi.spyOn(pool, "connect").mockImplementation(async () => client as unknown as PoolClient);
    const precheck = vi.spyOn(SiteExtraRepository.prototype as unknown as { precheck: () => Promise<unknown> }, "precheck").mockResolvedValue({ grant: uuid() });
    const raise = vi.spyOn(ExtraRepository.prototype, "raiseExtra").mockImplementation(async (_context, input, seam) => {
      raising = true; statements.push("--- raiseExtra");
      try { await seam!({ $client: client } as never, { kind: "raise", commandId: (input as { commandId: string }).commandId, jobId, variationId }); } catch { throw new ExtraPersistenceError("INVALID_ORIGIN"); }
      return { variationId };
    });
    return { m, pool, context, jobId, variationId, statements, client, precheck, raise, repo: new SiteExtraRepository(pool) };
  }
  const input = (jobId: string, fields: Record<string, unknown> = {}) => ({ commandId: uuid(), jobId, sorCode: "CLEAR-GUTTER", quantity: "2", note: "Fictional note", ...fields });

  it("[C19] raiseExtra is called exactly once with a seam whose first awaited call is requireLiveJob, then the ENT-3a authority seam, then the pricing routine", async () => {
    const h = harness(); await h.repo.logSorSiteExtra(h.context, h.m, input(h.jobId)).catch(() => undefined);
    expect(h.raise).toHaveBeenCalledOnce();
    const seam = h.statements.slice(h.statements.indexOf("--- raiseExtra") + 1).filter(text => /require_watchdog_live|ent3a_require_extra_authority|ent3c_record_sor_revision/u.test(text)).map(text => text.match(/app\.(\w+)/u)![1]);
    expect(seam).toEqual(["require_watchdog_live", "require_watchdog_live", "ent3a_require_extra_authority", "ent3c_record_sor_revision"]);
    expect(h.raise.mock.calls[0]![1]).toMatchObject({ version: "raise-extra.v1", description: "Clear gutters", sorItem: { code: "CLEAR-GUTTER" } });
    expect(h.raise.mock.calls[0]![1]).not.toHaveProperty("excessOfScopeItemId");
    await h.pool.end();
  });

  it.each([
    ["ALREADY_ON_ORDER", "ent3c_record_sor_revision", "ALREADY_ON_ORDER"], ["EXTRA_NOT_POSITIVE", "ent3c_record_sor_revision", "EXTRA_NOT_POSITIVE"], ["MONEY_OUT_OF_RANGE", "ent3c_record_sor_revision", "MONEY_OUT_OF_RANGE"],
    ["INVALID_QUANTITY", "ent3c_record_sor_revision", "INVALID_QUANTITY"], ["ORDER_CHECK_STALE", "ent3c_record_sor_revision", "SITE_PRICING_UNAVAILABLE"], ["JOB_NOT_LIVE", "require_watchdog_live", "JOB_NOT_LIVE"],
    ["something unexpected with Fictional note", "ent3c_record_sor_revision", "SITE_PRICING_UNAVAILABLE"],
  ])("[C19] a refusal raised inside a seam step (%s) comes back as its own typed code although raiseExtra rejects with one of its own", async (message, fragment, code) => {
    const h = harness({ failSeam: { fragment, message } });
    const error = await h.repo.logSorSiteExtra(h.context, h.m, input(h.jobId)).then(() => undefined, e => e as SorSiteExtraError);
    expect(error).toBeInstanceOf(SorSiteExtraError); expect(error!.code).toBe(code); expect(JSON.stringify(error)).not.toContain("Fictional note");
    expect(h.raise).toHaveBeenCalledOnce(); await h.pool.end();
  });

  it("[C19] the access answer is asked again when a seam step says the facts changed, and a refusal it now gives wins", async () => {
    const h = harness({ failSeam: { fragment: "ent3a_require_extra_authority", message: "NOT_FOUND" } });
    h.precheck.mockResolvedValueOnce({ grant: uuid() }).mockResolvedValueOnce({ code: "NOT_FOUND", reason: "job_out_of_scope" });
    await expect(h.repo.logSorSiteExtra(h.context, h.m, input(h.jobId))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.precheck).toHaveBeenCalledTimes(2);
    const same = harness({ failSeam: { fragment: "ent3a_require_extra_authority", message: "NOT_FOUND" } });
    await expect(same.repo.logSorSiteExtra(same.context, same.m, input(same.jobId))).rejects.toMatchObject({ code: "SITE_PRICING_UNAVAILABLE" });
    await h.pool.end(); await same.pool.end();
  });

  it("[C19] ALREADY_ON_ORDER decided before the command means raiseExtra is never called", async () => {
    const lines = [{ scope_item_id: uuid(), sor_code: "CLEAR-GUTTER", quantity: "4", position: 0 }], h = harness({ lines });
    await expect(h.repo.logSorSiteExtra(h.context, h.m, input(h.jobId, { quantity: "4" }))).rejects.toMatchObject({ code: "ALREADY_ON_ORDER" });
    expect(h.raise).not.toHaveBeenCalled(); await h.pool.end();
    const named = harness({ lines }); await named.repo.logSorSiteExtra(named.context, named.m, input(named.jobId, { quantity: "6", orderLineScopeItemId: lines[0]!.scope_item_id })).catch(() => undefined);
    expect(named.raise.mock.calls[0]![1]).toMatchObject({ excessOfScopeItemId: lines[0]!.scope_item_id }); await named.pool.end();
  });

  it("[C19] this piece\'s own queries file holds no write statement and no command type", () => {
    const queries = readFileSync(resolve(process.cwd(), "../../packages/db/src/site-extra-pricing-queries.ts"), "utf8");
    expect(queries).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/iu); expect(queries).not.toMatch(/LogSiteExtra|commandType/u);
  });
});
