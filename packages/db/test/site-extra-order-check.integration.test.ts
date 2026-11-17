// ENT-3c: the order check and the two site reads, against real PostgreSQL. Written before the repository methods it proves.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SorSiteExtraError, orderCheckV1 } from "@jobguard/core";
import { SiteExtraRepository, withTenant } from "../src/index.js";
import { fixture } from "./extra-fixtures.js";
import { cluster, siteFixture, command, sorInput, written, chainHead, newOrder, lineIds, newContract, newPriceList, leaveLive, type Cluster, type SiteFixture } from "./site-extra-pricing-fixtures.js";
import { invite, smallJob, cancel } from "./site-extra-fixtures.js";

let c: Cluster, repo: SiteExtraRepository;
beforeAll(async () => { c = await cluster(); repo = new SiteExtraRepository(c.runtime); }, 90_000);
afterAll(async () => { await c?.close(); });
afterEach(() => vi.restoreAllMocks());

type Member = SiteFixture["p"];
const items = (f: SiteFixture, member: Member, jobId: string, q: unknown) => repo.sorItems(f.ctx, member, jobId, { q });
const check = (f: SiteFixture, member: Member, jobId: string, fields: Record<string, unknown>) => repo.orderCheck(f.ctx, member, jobId, fields);
const auditTotal = async (f: SiteFixture) => (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.p.tenantId])).rows[0]!.n as number;
const keysOf = (value: unknown): string[] => value && typeof value === "object" ? Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]) : [];
const noMoney = (value: unknown) => { for (const key of keysOf(JSON.parse(JSON.stringify(value)))) expect(key, key).not.toMatch(/pence|rate|net|price|amount|resident|contact|address/iu); };

describe("ENT-3c order check read", () => {
  it("[C18] orderCheck gives the outcome the command then acts on, for every case of [C1] built as real orders", async () => {
    const f = await siteFixture(c), who = f.members.supervisor;
    const order = await newOrder(c, f, [["A", "REPAIR-DOOR", "3"], ["B", "PAINT-ROOM", "2.5"], ["C1", "FIT-LOCK", "1"], ["C2", "FIT-LOCK", "4"]]), facts = await lineIds(c, f.p.tenantId, order.revisionId);
    const model = Object.values(facts).map((line, position) => ({ scopeItemId: line.scopeItemId, sorCode: line.code, quantity: line.quantity, position }));
    const cases: Array<[string, string, string?]> = [["CLEAR-GUTTER", "2"], ["REPAIR-DOOR", "3"], ["REPAIR-DOOR", "3.0"], ["REPAIR-DOOR", "2.999999"], ["REPAIR-DOOR", "3.000001"], ["REPAIR-DOOR", "5"], ["PAINT-ROOM", "4.125"], ["FIT-LOCK", "5", "C2"], ["FIT-LOCK", "5", "C1"]];
    for (const [sorCode, quantity, line] of cases) {
      const orderLine = line ? facts[line]!.scopeItemId : undefined, expected = orderCheckV1({ sorCode, quantity, ...(orderLine ? { orderLineScopeItemId: orderLine } : {}), lines: model });
      const before = await written(c, f.p.tenantId), head = await chainHead(c, f.p.tenantId), audits = await auditTotal(f);
      const result = await check(f, who.member, order.jobId, { sorCode, quantity, ...(orderLine ? { orderLine } : {}) });
      expect(result, `${sorCode} ${quantity} ${line ?? ""}`).toMatchObject({ outcome: expected.outcome, sorCode, claimedQuantity: quantity.includes(".") ? quantity.replace(/\.?0+$/u, "") || "0" : quantity });
      if (expected.outcome !== "new") expect(result.orderLineScopeItemId).toBe(expected.orderLineScopeItemId);
      if ("extraQuantity" in expected) expect(result.extraQuantity).toBe(expected.extraQuantity); else expect(result.extraQuantity).toBeUndefined();
      expect(await written(c, f.p.tenantId)).toEqual(before); expect(await chainHead(c, f.p.tenantId)).toBe(head); expect(await auditTotal(f)).toBe(audits);
      noMoney(result);
      // The command acts on exactly this outcome. (An excess of 0.000001 of a 10000p item prices to 0p, which the command refuses on its own rule, EXTRA_NOT_POSITIVE; the read does not price.)
      if (expected.outcome === "already_on_order") await expect(repo.logSorSiteExtra(f.ctx, who.member, sorInput(order.jobId, { sorCode, quantity, ...(orderLine ? { orderLineScopeItemId: orderLine } : {}) }))).rejects.toMatchObject({ code: "ALREADY_ON_ORDER" });
      else if (quantity === "3.000001") await expect(repo.logSorSiteExtra(f.ctx, who.member, sorInput(order.jobId, { sorCode, quantity }))).rejects.toMatchObject({ code: "EXTRA_NOT_POSITIVE" });
      else {
        const logged = await repo.logSorSiteExtra(f.ctx, who.member, sorInput(order.jobId, { sorCode, quantity, ...(orderLine ? { orderLineScopeItemId: orderLine } : {}) }));
        expect(logged).toMatchObject({ coverage: expected.outcome === "new" ? "new" : "excess", extraQuantity: expected.extraQuantity });
      }
    }
    // The same code on two lines needs the caller to name the line; a named line that carries another code, or is unknown, is not found.
    await expect(check(f, who.member, order.jobId, { sorCode: "FIT-LOCK", quantity: "5" })).rejects.toMatchObject({ code: "ORDER_LINE_AMBIGUOUS" });
    await expect(check(f, who.member, order.jobId, { sorCode: "FIT-LOCK", quantity: "5", orderLine: facts.A!.scopeItemId })).rejects.toMatchObject({ code: "ORDER_LINE_NOT_FOUND" });
    await expect(check(f, who.member, order.jobId, { sorCode: "FIT-LOCK", quantity: "5", orderLine: randomUUID() })).rejects.toMatchObject({ code: "ORDER_LINE_NOT_FOUND" });
    await expect(check(f, who.member, order.jobId, { sorCode: "NOT-IN-LIST", quantity: "1" })).rejects.toMatchObject({ code: "SOR_ITEM_NOT_FOUND" });
    for (const quantity of ["0", "0.0", "-1", "1.0000001", "01", "1.", ".5", "1e3", " 1", "", "1234567890123"]) await expect(check(f, who.member, order.jobId, { sorCode: "REPAIR-DOOR", quantity }), quantity).rejects.toMatchObject({ code: "INVALID_QUANTITY" });
    await expect(check(f, who.member, order.jobId, { quantity: "1" })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(check(f, who.member, order.jobId, { sorCode: "REPAIR-DOOR", quantity: "1", tenantId: f.p.tenantId })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  }, 90_000);

  it("[C7] within the order (equal or below) is ALREADY_ON_ORDER as a result of the read, and nothing is written by it", async () => {
    const f = await siteFixture(c), who = f.members.surveyor;
    for (const quantity of ["1", "0.5"]) expect(await check(f, who.member, f.jobId, { sorCode: "REPAIR-DOOR", quantity })).toMatchObject({ outcome: "already_on_order", sorCode: "REPAIR-DOOR", unit: "each", instructedQuantity: "1" });
    expect(await written(c, f.p.tenantId)).toMatchObject({ extra_sor_revision: 0, extra_pricing_basis: 0, raised: 0, variation: 0, extra_origin: 0 });
  });
});

describe("ENT-3c search of the job's price list", () => {
  it("[C18] sorItems returns only items of THIS job's price list, by code, matching text literally and case-insensitively", async () => {
    const f = await siteFixture(c), who = f.members.operative, b = await siteFixture(c);
    const version = await newPriceList(c, f, [["PCT-100%", "each", 11], ["UND_ERSCORE", "each", 12], ["BACK\\SLASH", "each", 13], ["PLAIN", "metre", 14], ["PLAIN-TWO", "each", 15]], "2026-02-01", f.demo.scheduleId);
    const special = await newOrder(c, f, [["L1", "PLAIN", "1"]], { contractId: await newContract(c, f, [version], "0", "1") });
    const other = await newPriceList(c, f, [["ZZZ-ONLY-OTHER-VERSION", "each", 1]], "2026-03-01", f.demo.scheduleId);
    await newPriceList(c, b, [["ONLY-B-ITEM", "each", 9]], "2026-04-01", b.demo.scheduleId);
    expect(other).toBeTruthy();
    const codes = async (jobId: string, q: string) => (await items(f, who.member, jobId, q)).items.map(item => item.code);
    expect(await codes(special.jobId, "%")).toEqual(["PCT-100%"]); expect(await codes(special.jobId, "_")).toEqual(["UND_ERSCORE"]); expect(await codes(special.jobId, "\\")).toEqual(["BACK\\SLASH"]);
    expect(await codes(special.jobId, "plain")).toEqual(["PLAIN", "PLAIN-TWO"]); expect(await codes(special.jobId, "und_er")).toEqual(["UND_ERSCORE"]);
    expect(await codes(special.jobId, "100%")).toEqual(["PCT-100%"]); expect(await codes(special.jobId, "no such text")).toEqual([]);
    // The job's own price list only: not another version of the schedule, and never another tenant's items.
    expect(await codes(f.jobId, "ZZZ")).toEqual([]); expect(await codes(f.jobId, "ONLY-B")).toEqual([]); expect(await codes(f.jobId, "gutter")).toEqual(["CLEAR-GUTTER"]);
    expect(await codes(f.jobId, "Clear")).toEqual(["CLEAR-GUTTER", "CLEAR-VOID"]);
    const result = await items(f, who.member, f.jobId, " clear "); expect(result.sorVersionId).toBe(f.demo.sorVersionId); expect(result.truncated).toBe(false);
    expect(result.items[0]).toEqual({ code: "CLEAR-GUTTER", description: "Clear gutters", unit: "metre" }); noMoney(result);
    for (const q of [undefined, null, "", "   ", "x".repeat(81), 5]) { const connect = vi.spyOn(c.runtime, "connect"); await expect(items(f, who.member, f.jobId, q), String(q)).rejects.toMatchObject({ code: "INVALID_COMMAND" }); expect(connect).not.toHaveBeenCalled(); connect.mockRestore(); }
  }, 90_000);

  it("[C18] at most 50 items are returned, in code order, with truncated set", async () => {
    const f = await siteFixture(c), version = await newPriceList(c, f, Array.from({ length: 60 }, (_, i): [string, string, number] => [`BULK-${String(i).padStart(2, "0")}`, "each", 1 + i]), "2026-05-01", f.demo.scheduleId);
    const order = await newOrder(c, f, [["L1", "BULK-00", "1"]], { contractId: await newContract(c, f, [version], "0", "1") });
    const result = await items(f, f.members.supervisor.member, order.jobId, "bulk");
    expect(result.items).toHaveLength(50); expect(result.truncated).toBe(true); expect(result.items.map(i => i.code)).toEqual(Array.from({ length: 50 }, (_, i) => `BULK-${String(i).padStart(2, "0")}`));
    expect((await items(f, f.members.supervisor.member, order.jobId, "BULK-5")).items).toHaveLength(10);
    expect((await items(f, f.members.supervisor.member, order.jobId, "BULK-5")).truncated).toBe(false);
  }, 90_000);

  it("[C17] both reads work on a job that is no longer live", async () => {
    const f = await siteFixture(c), order = await newOrder(c, f, [["L1", "FIT-LOCK", "2"]]); await leaveLive(c, f, order.jobId);
    expect((await items(f, f.members.supervisor.member, order.jobId, "lock")).items.map(i => i.code)).toEqual(["FIT-LOCK"]);
    expect(await check(f, f.members.supervisor.member, order.jobId, { sorCode: "FIT-LOCK", quantity: "5" })).toMatchObject({ outcome: "more_than_ordered", extraQuantity: "3" });
    await expect(repo.logSorSiteExtra(f.ctx, f.members.supervisor.member, sorInput(order.jobId, { sorCode: "CLEAR-GUTTER" }))).rejects.toMatchObject({ code: "JOB_NOT_LIVE" });
  });
});

describe("ENT-3c the reads obey the same access rule as the command", () => {
  const readers = {
    sorItems: (f: SiteFixture, member: Member, jobId: string) => repo.sorItems(f.ctx, member, jobId, { q: "no-such-text-at-all" }),
    orderCheck: (f: SiteFixture, member: Member, jobId: string) => repo.orderCheck(f.ctx, member, jobId, { sorCode: "NO-SUCH-CODE", quantity: "999", orderLine: randomUUID() }),
  } as const;
  async function refusedRead(f: SiteFixture, read: (f: SiteFixture, member: Member, jobId: string) => Promise<unknown>, member: Member, jobId: string, code: string) {
    const before = await written(c, f.p.tenantId), head = await chainHead(c, f.p.tenantId), audits = await auditTotal(f);
    const error = await read(f, member, jobId).then(() => { throw new Error("unexpected success"); }, e => e as SorSiteExtraError);
    expect(error).toBeInstanceOf(SorSiteExtraError); expect(error.code).toBe(code);
    // Reads write nothing and record no refusal.
    expect(await written(c, f.p.tenantId)).toEqual(before); expect(await chainHead(c, f.p.tenantId)).toBe(head); expect(await auditTotal(f)).toBe(audits); return error;
  }
  for (const [name, read] of Object.entries(readers)) {
    it(`[C9] ${name}: every role that may not log gets the identical EXTRA_FORBIDDEN for an in-scope job, another branch's job, another tenant's job and a random job`, async () => {
      const f = await siteFixture(c), foreign = await fixture(c), targets = [f.jobId, f.otherJob, foreign.jobId, randomUUID()];
      for (const role of ["owner", "admin", "commercial_manager", "finance", "read_only", "client_approver"] as const) {
        const errors: unknown[] = []; for (const jobId of targets) errors.push(await refusedRead(f, read, f.members[role].member, jobId, "EXTRA_FORBIDDEN"));
        for (const error of errors) expect(error, role).toEqual(errors[0]);
      }
    }, 60_000);
    it(`[C10] ${name}: every job refusal is one NOT_FOUND, and no refused caller meets SOR_ITEM_NOT_FOUND, ORDER_LINE_NOT_FOUND, ORDER_LINE_AMBIGUOUS, ALREADY_ON_ORDER or JOB_NOT_LIVE`, async () => {
      const f = await siteFixture(c), foreign = await fixture(c), different = await invite(c, f, "surveyor", { kind: "branch", id: f.otherDemo.branchId });
      await command(c, f, { kind: "grant.create", membershipId: different.member.membershipId, role: "supervisor", scope: { kind: "team", id: f.demo.teamId }, contractId: null });
      const errors: unknown[] = [], notLive = await newOrder(c, f, [["L1", "FIT-LOCK", "1"]]); await leaveLive(c, f, notLive.jobId);
      for (const [member, jobId] of [[f.members.supervisor.member, randomUUID()], [f.members.supervisor.member, foreign.jobId], [f.members.supervisor.member, await smallJob(c, f)], [f.otherSupervisor.member, f.jobId], [f.otherSurveyor.member, f.jobId], [f.unassigned.member, f.jobId], [different.member, f.jobId]] as const) errors.push(await refusedRead(f, read, member, jobId, "NOT_FOUND"));
      await command(c, f, { kind: "team.move", membershipId: f.members.operative.member.membershipId, fromTeamId: f.demo.teamId, toTeamId: f.otherDemo.teamId });
      errors.push(await refusedRead(f, read, f.members.operative.member, f.jobId, "NOT_FOUND"));
      const revoked = await invite(c, f, "supervisor", { kind: "team", id: f.demo.teamId }); await command(c, f, { kind: "grant.revoke", grantId: revoked.grant });
      errors.push(await refusedRead(f, read, revoked.member, f.jobId, "NOT_FOUND"));
      errors.push(await refusedRead(f, read, f.unassigned.member, notLive.jobId, "NOT_FOUND"));
      await cancel(c, f); errors.push(await refusedRead(f, read, f.members.supervisor.member, f.jobId, "NOT_FOUND"));
      for (const error of errors) expect(error).toEqual(errors[0]);
      await command(c, f, { kind: "membership.revoke", membershipId: f.members.surveyor.member.membershipId });
      await refusedRead(f, read, f.members.surveyor.member, f.otherJob, "EXTRA_FORBIDDEN");
    }, 90_000);
  }
  it("[C11] another tenant's context, an unstamped context and a small-builder tenant's latest assignment", async () => {
    const f = await siteFixture(c), b = await siteFixture(c);
    await refusedRead(f, readers.sorItems, b.members.supervisor.member, f.jobId, "EXTRA_FORBIDDEN");
    await refusedRead(f, readers.orderCheck, f.members.supervisor.member, b.jobId, "NOT_FOUND");
    const connect = vi.spyOn(c.runtime, "connect");
    for (const bad of [undefined, { tenantId: f.p.tenantId }]) { connect.mockClear(); await expect(repo.sorItems(bad as never, f.members.supervisor.member, f.jobId, { q: "lock" })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(connect).not.toHaveBeenCalled(); }
  });
});

describe("ENT-3c catalogue (the new tables and routines)", () => {
  it("[C21] both new tables: owner, row security enabled and forced, runtime SELECT only, PUBLIC and infrastructure nothing; the writer and the four trigger functions are as specified", async () => {
    for (const table of ["extra_sor_revision", "extra_pricing_basis"]) {
      const rel = (await c.admin.query("SELECT pg_get_userbyid(c.relowner) owner,c.relrowsecurity rls,c.relforcerowsecurity forced FROM pg_class c WHERE c.oid=$1::regclass", [`app.${table}`])).rows[0]!;
      expect(rel, table).toEqual({ owner: "jobguard_migration", rls: true, forced: true });
      const grants = (await c.admin.query("SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,a.privilege_type FROM pg_class c,aclexplode(c.relacl) a WHERE c.oid=$1::regclass ORDER BY 1,2", [`app.${table}`])).rows;
      expect(grants.filter(g => g.grantee !== "jobguard_migration"), table).toEqual([{ grantee: "jobguard_runtime", privilege_type: "SELECT" }]);
      for (const role of ["jobguard_runtime"]) for (const privilege of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) expect((await c.admin.query("SELECT has_table_privilege($1,$2,$3) ok", [role, `app.${table}`, privilege])).rows[0]!.ok, `${table} ${privilege}`).toBe(false);
      const policies = (await c.admin.query("SELECT policyname,cmd,roles::text,qual,with_check FROM pg_policies WHERE schemaname='app' AND tablename=$1", [table])).rows;
      expect(policies).toHaveLength(1); expect(policies[0]).toMatchObject({ policyname: "tenant_isolation", cmd: "ALL" }); expect(policies[0]!.roles).toContain("jobguard_runtime"); expect(policies[0]!.roles).toContain("jobguard_migration");
      const triggers = (await c.admin.query("SELECT tgname,tgtype,tgisinternal,tgconstraint<>0 AS is_constraint FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal ORDER BY tgname", [`app.${table}`])).rows;
      expect(triggers.map(t => t.tgname), table).toEqual(table === "extra_sor_revision" ? ["a_sor_revision_guard", "immutable", "sor_revision_audit", "sor_revision_basis"] : ["a_pricing_basis_guard", "immutable"]);
    }
    const routines = (await c.admin.query(`SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,p.oid::regprocedure::text signature,
      has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infra,
      (SELECT count(*) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0) AS public_grants
      FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname LIKE 'ent3c\\_%' ORDER BY p.proname`)).rows;
    expect(routines.map(r => r.proname)).toEqual(["ent3c_pricing_basis_guard", "ent3c_record_sor_revision", "ent3c_require_pricing_basis", "ent3c_require_sor_revision_audit", "ent3c_sor_revision_guard"]);
    for (const r of routines) {
      expect(r.owner, r.proname).toBe("jobguard_migration"); expect(r.infra, r.proname).toBe(false); expect(Number(r.public_grants), r.proname).toBe(0);
      if (r.proname === "ent3c_record_sor_revision") {
        expect(r.signature).toBe("app.ent3c_record_sor_revision(uuid,uuid,text,text)"); expect(r.prosecdef).toBe(true); expect(r.proconfig).toEqual(["search_path=pg_catalog"]); expect(r.runtime).toBe(true);
      } else { expect(r.prosecdef, r.proname).toBe(false); expect(r.runtime, r.proname).toBe(false); expect(r.proconfig, r.proname).toEqual(["search_path=pg_catalog"]); }
    }
  });

  it("[C21] the application login cannot reach a write on either table and the routine refuses it a path round the checks", async () => {
    const f = await siteFixture(c);
    await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("INSERT INTO app.extra_pricing_basis(tenant_id) VALUES($1)", [f.p.tenantId]))).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("INSERT INTO app.extra_sor_revision(tenant_id) VALUES($1)", [f.p.tenantId]))).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(c.runtime, f.ctx, db => db.$client.query("SELECT app.ent3c_sor_revision_guard()"))).rejects.toMatchObject({ code: "42501" });
    expect(await written(c, f.p.tenantId)).toMatchObject({ extra_sor_revision: 0, extra_pricing_basis: 0 });
  });
});
