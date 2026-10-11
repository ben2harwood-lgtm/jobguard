// Written before the routines. NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExtraRepository, SiteExtraRepository, MIGRATION_URLS, migrate, withTenant, sha256Hex } from "../src/index.js";
import { cluster, siteFixture, roles, decision, invite, command, direct, cancel, smallJob, type SiteFixture } from "./site-extra-fixtures.js";
import { fixture, type Cluster } from "./extra-fixtures.js";
let c: Cluster, f: SiteFixture;
beforeAll(async () => { c = await cluster(); f = await siteFixture(c); }, 60_000);
afterAll(async () => { await c?.close(); });
const commands = ["LogSiteExtra", "RecordOfficeExtra", "RecordClientInstruction", "ConfirmPrompt"];
// Expected authority matrix, independent of implementation.
const allowed = new Set(["operative:LogSiteExtra", "supervisor:LogSiteExtra", "surveyor:LogSiteExtra", "owner:RecordOfficeExtra", "admin:RecordOfficeExtra", "finance:RecordOfficeExtra", "owner:RecordClientInstruction", "admin:RecordClientInstruction", "commercial_manager:RecordClientInstruction"]);
describe("ENT-3a authority", () => {
 for (const role of roles) for (const type of commands) it(`[A1] ${role} / ${type}`, async () => {
  const rows = await decision(c, f, f.members[role].member, type);
  const yes = allowed.has(`${role}:${type}`);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toEqual({ decision: yes ? "allowed" : "forbidden", reason_code: yes ? "allowed" : type === "ConfirmPrompt" ? "command_type_not_permitted" : "role_not_permitted", raising_grant: yes ? f.members[role].grant : null });
  if (yes) {
   const g = (await c.admin.query("SELECT g.*,NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE(r.tenant_id,r.grant_id)=(g.tenant_id,g.id)) unrevoked FROM app.role_grant g WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, rows[0]!.raising_grant])).rows[0]!;
   expect(g).toMatchObject({ membership_id: f.members[role].member.membershipId, role, unrevoked: true });
   // ENT-4b's actual insert trigger is the independent scope judge.
   await new ExtraRepository(c.runtime).raiseExtra(f.ctx, direct(f, f.members[role], { commandType: type }));
  }
 });
 it.each(["unknown-command", null])("[A1] rejects unknown command type %s", async type => { expect(await decision(c, f, f.members.supervisor.member, type)).toEqual([{ decision: "forbidden", reason_code: "command_type_not_permitted", raising_grant: null }]); });
 it("[A4] all job failures have the same decision", async () => {
  const own = await siteFixture(c), foreign = await fixture(c);
  const differentRole = await invite(c, own, "surveyor", { kind: "branch", id: own.otherDemo.branchId });
  await command(c, own, { kind: "grant.create", membershipId: differentRole.member.membershipId, role: "supervisor", scope: { kind: "team", id: own.demo.teamId }, contractId: null });
  const targets = [[own.members.supervisor.member, randomUUID()], [own.members.supervisor.member, foreign.jobId], [own.members.supervisor.member, await smallJob(c, own)], [own.otherSupervisor.member, own.jobId], [own.otherSurveyor.member, own.jobId], [own.unassigned.member, own.jobId], [differentRole.member, own.jobId]] as const;
  for (const [member, job] of targets) expect(await decision(c, own, member, "LogSiteExtra", job)).toEqual([{ decision: "not_found", reason_code: "job_out_of_scope", raising_grant: null }]);
  await command(c, own, { kind: "team.move", membershipId: own.members.operative.member.membershipId, fromTeamId: own.demo.teamId, toTeamId: own.otherDemo.teamId });
  expect(await decision(c, own, own.members.operative.member, "LogSiteExtra")).toEqual([{ decision: "not_found", reason_code: "job_out_of_scope", raising_grant: null }]);
  await cancel(c, own);
  expect(await decision(c, own, own.members.supervisor.member, "LogSiteExtra")).toEqual([{ decision: "not_found", reason_code: "job_out_of_scope", raising_grant: null }]);
 });
 it("[A14] is total and read-only for NULLs, absent, empty, malformed and foreign tenant membership", async () => {
  const foreign = await fixture(c);
  const client = await c.runtime.connect();
  try {
   await client.query("BEGIN READ ONLY");
   expect((await client.query("SELECT * FROM app.ent3a_extra_authority(NULL,NULL,NULL)")).rows).toEqual([{ decision: "forbidden", reason_code: "member_inactive", raising_grant: null }]);
   for (const setting of [null, "", "not-a-uuid", f.p.tenantId.toUpperCase()]) {
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [setting]);
    const rows = (await client.query("SELECT * FROM app.ent3a_extra_authority($1,$2,$3)", [f.members.supervisor.member.membershipId, "LogSiteExtra", f.jobId])).rows;
    expect(rows).toHaveLength(1); expect(rows[0]!.decision).toBe(setting === f.p.tenantId.toUpperCase() ? "allowed" : "forbidden");
    if (setting !== f.p.tenantId.toUpperCase()) expect(rows[0]).toEqual({ decision: "forbidden", reason_code: "member_inactive", raising_grant: null });
   }
   for (const args of [[null, null, null], [foreign.p.membershipId, "LogSiteExtra", f.jobId], [f.members.supervisor.member.membershipId, null, null], [f.members.supervisor.member.membershipId, "LogSiteExtra", null]]) {
    const rows = (await client.query("SELECT * FROM app.ent3a_extra_authority($1,$2,$3)", args)).rows;
    const inactive = args[0] === null || args[0] === foreign.p.membershipId;
    expect(rows).toEqual([{ decision: inactive || args[1] === null ? "forbidden" : "not_found", reason_code: inactive ? "member_inactive" : args[1] === null ? "command_type_not_permitted" : "job_out_of_scope", raising_grant: null }]);
   }
   await client.query("ROLLBACK");
  } finally { client.release(); }
 });
 it("[A14] guard fails closed for absent, empty, malformed tenant settings and missing stored origins", async () => {
  const client = await c.runtime.connect();
  try {
   for (const setting of [null, "", "not-a-uuid", f.p.tenantId]) {
    await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [setting]);
    await expect(client.query("SELECT app.ent3a_require_extra_authority($1,$2)", [f.jobId, randomUUID()])).rejects.toMatchObject({ code: "P0002", message: "NOT_FOUND" });
    await client.query("ROLLBACK");
   }
  } finally { client.release(); }
 });
 for (const scope of ["tenant", "team", "branch", "region"] as const) it(`[A16] ${scope} covering lookup agrees with the merged trigger`, async () => {
  const own = await siteFixture(c);
  const region = (await c.admin.query("SELECT parent_id FROM app.org_unit WHERE tenant_id=$1 AND id=$2", [own.p.tenantId, own.demo.branchId])).rows[0]!.parent_id as string;
  const id = scope === "tenant" ? own.p.tenantId : scope === "team" ? own.demo.teamId : scope === "branch" ? own.demo.branchId : region;
  const a = await invite(c, own, "supervisor", { kind: scope, id });
  expect(await decision(c, own, a.member, "LogSiteExtra")).toEqual([{ decision: "allowed", reason_code: "allowed", raising_grant: a.grant }]);
  await new SiteExtraRepository(c.runtime).logSiteExtra(own.ctx, a.member, { commandId: randomUUID(), jobId: own.jobId, note: "Fictional scope agreement", description: "Fictional extra" });
 });
 for (const scope of ["tenant", "team", "branch", "region"] as const) it(`[A16] ${scope} non-covering lookup and merged trigger both refuse`, async () => {
  const own = await siteFixture(c);
  let id = scope === "team" ? own.otherDemo.teamId : own.otherDemo.branchId;
  if (scope === "region") id = (await command(c, own, { kind: "unit.create", unitKind: "region", parentId: own.p.tenantId, name: "Fictional other region" })).id;
  const foreign = scope === "tenant" ? await siteFixture(c) : undefined;
  const a = foreign ? await invite(c, foreign, "supervisor", { kind: "tenant", id: foreign.p.tenantId }) : await invite(c, own, "supervisor", { kind: scope, id });
  if (foreign) {
   // A grant from another tenant must reach the insert trigger, rather than stop at the missing-job read.
   await command(c, own, { kind: "grant.revoke", grantId: own.members.supervisor.grant });
   expect((await decision(c, own, own.members.supervisor.member, "LogSiteExtra"))[0]).toEqual({ decision: "not_found", reason_code: "job_out_of_scope", raising_grant: null });
   await expect(new ExtraRepository(c.runtime).raiseExtra(own.ctx, direct(own, own.members.supervisor, { grantId: a.grant }))).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
  } else {
   expect((await decision(c, own, a.member, "LogSiteExtra"))[0]).toEqual({ decision: "not_found", reason_code: "job_out_of_scope", raising_grant: null });
   await expect(new ExtraRepository(c.runtime).raiseExtra(own.ctx, direct(own, a))).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
  }
 });
 it("[A13] populated upgrade changes only two routines; ownership, specific grants and idempotent registration", async () => {
  const up = await cluster(true);
  try {
   for (const url of MIGRATION_URLS.filter(u => u.pathname.split("/").at(-1)! >= "0122_extra_origin_persistence.sql" && u.pathname.split("/").at(-1)! < "0126_site_extra_authority.sql")) { await up.admin.query(await readFile(url, "utf8")); await up.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]); }
   const beforeFixture = await fixture(up);
   await new ExtraRepository(up.runtime).raiseExtra(beforeFixture.ctx, direct(beforeFixture, { member: beforeFixture.p, grant: beforeFixture.grantId }));
   const catalog = async () => {
    const sql = [
     "SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2",
     "SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN('app','identity','control_plane','audit_control') ORDER BY 1,2,ordinal_position",
     "SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace ORDER BY 1,2,3",
     "SELECT tgrelid::regclass::text relation,tgname,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1,2",
     "SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname",
     "SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_roles ORDER BY rolname",
     "SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proacl::text,pg_get_userbyid(p.proowner) owner,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2,3",
    ];
    const result = []; for (const s of sql) result.push((await up.admin.query(s)).rows); return result;
   };
   const content = async () => { const r: Record<string, { count: number; hash: string }> = {}; for (const t of ["extra_origin", "variation", "role_grant", "command_receipt", "audit_event"]) { const rows = (await up.admin.query(`SELECT to_jsonb(t)::text body FROM app.${t} t ORDER BY to_jsonb(t)::text`)).rows; r[t] = { count: rows.length, hash: sha256Hex(JSON.stringify(rows)) }; } return r; };
   const before = await catalog(), data = await content();
   const ownUrl = MIGRATION_URLS.find(u => u.pathname.endsWith("/0126_site_extra_authority.sql"))!;
   await up.admin.query(await readFile(ownUrl, "utf8"));
   await up.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", ["0126_site_extra_authority.sql"]);
   const after = await catalog();
   expect(after.slice(0, 6)).toEqual(before.slice(0, 6));
   expect(after[6]!.filter(r => !r.proname.startsWith("ent3a_"))).toEqual(before[6]);
   expect(after[6]!.filter(r => r.proname.startsWith("ent3a_"))).toHaveLength(2);
   expect(await content()).toEqual(data);
   const routines = (await up.admin.query("SELECT proname,pg_get_userbyid(proowner) owner,prosecdef,provolatile,proconfig,has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') infrastructure,EXISTS(SELECT 1 FROM aclexplode(proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname IN('ent3a_extra_authority','ent3a_require_extra_authority') ORDER BY proname")).rows;
   expect(routines).toHaveLength(2); for (const r of routines) expect(r).toMatchObject({ owner: "jobguard_migration", prosecdef: false, proconfig: ["search_path=pg_catalog"], runtime: true, infrastructure: false, public: false });
   expect(routines.map(r => r.provolatile)).toEqual(["s", "v"]);
   const names = MIGRATION_URLS.map(u => u.pathname.split("/").at(-1)!); expect(names).toEqual([...names].sort()); expect(names.indexOf("0126_site_extra_authority.sql")).toBeGreaterThan(names.indexOf("0122_extra_origin_persistence.sql"));
   // Future migrations may follow this leaf; prove this migration's delta before running them.
   await migrate(up.admin); const once = await catalog(), onceContent = await content();
   await migrate(up.admin); expect(await catalog()).toEqual(once); expect(await content()).toEqual(onceContent);
   expect((await up.admin.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name=$1", ["0126_site_extra_authority.sql"])).rowCount).toBe(1);
  } finally { await up.close(); }
 });
});
