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
   for (const url of MIGRATION_URLS.filter(u => u.pathname.split("/").at(-1)! >= "0122_extra_origin_persistence.sql" && u.pathname.split("/").at(-1)! < "0135_site_extra_authority.sql")) { await up.admin.query(await readFile(url, "utf8")); await up.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]); }
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
   // Upgrade-proof rule: pre-existing rows are compared by NAMED pre-existing columns, as canonical text from the database, together with each such column's
   // name and full type, after every later migration has run. Columns added later are never listed; triggers, functions, policies and grants are not compared there.
   const kept = ["extra_origin", "variation", "role_grant", "command_receipt", "audit_event"];
   type Run = (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
   const viaAdmin: Run = (sql, values) => up.admin.query(sql, values);
   const preColumns: Record<string, string[]> = {};
   for (const t of kept) preColumns[t] = (await viaAdmin("SELECT a.attname::text AS name FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attname::text COLLATE \"C\"", [`app.${t}`])).rows.map(x => x.name as string);
   const columnTypes = async (run: Run) => { const r: Record<string, string[]> = {}; for (const t of kept) r[t] = (await run("SELECT a.attname::text||' '||format_type(a.atttypid,a.atttypmod) AS column_type FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attname::text=ANY($2::text[]) ORDER BY a.attname::text COLLATE \"C\"", [`app.${t}`, preColumns[t]])).rows.map(x => x.column_type as string); return r; };
   const namedRows = async (run: Run) => { const r: Record<string, string[]> = {}; for (const t of kept) r[t] = (await run(`SELECT row_to_json(snap)::text AS bytes FROM (SELECT ${preColumns[t]!.map(n => `"${n}"`).join(",")} FROM app.${t}) snap ORDER BY row_to_json(snap)::text COLLATE "C"`)).rows.map(x => x.bytes as string); return r; };
   const proof = async (run: Run) => ({ columnTypes: await columnTypes(run), rows: await namedRows(run) });
   const baseline = await proof(viaAdmin);
   for (const t of kept) expect(baseline.rows[t]!.length, `${t} holds at least one pre-existing row`).toBeGreaterThan(0);
   const holds = async (run: Run) => { expect(await proof(run)).toEqual(baseline); };
   const ownUrl = MIGRATION_URLS.find(u => u.pathname.endsWith("/0135_site_extra_authority.sql"))!;
   await up.admin.query(await readFile(ownUrl, "utf8"));
   await up.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", ["0135_site_extra_authority.sql"]);
   const after = await catalog();
   expect(after.slice(0, 6)).toEqual(before.slice(0, 6));
   expect(after[6]!.filter(r => !r.proname.startsWith("ent3a_"))).toEqual(before[6]);
   expect(after[6]!.filter(r => r.proname.startsWith("ent3a_"))).toHaveLength(2);
   expect(await content()).toEqual(data);
   const routines = (await up.admin.query("SELECT proname,pg_get_userbyid(proowner) owner,prosecdef,provolatile,proconfig,has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') infrastructure,EXISTS(SELECT 1 FROM aclexplode(proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname IN('ent3a_extra_authority','ent3a_require_extra_authority') ORDER BY proname")).rows;
   expect(routines).toHaveLength(2); for (const r of routines) expect(r).toMatchObject({ owner: "jobguard_migration", prosecdef: false, proconfig: ["search_path=pg_catalog"], runtime: true, infrastructure: false, public: false });
   expect(routines.map(r => r.provolatile)).toEqual(["s", "v"]);
   const names = MIGRATION_URLS.map(u => u.pathname.split("/").at(-1)!); expect(names).toEqual([...names].sort()); expect(names.indexOf("0135_site_extra_authority.sql")).toBeGreaterThan(names.indexOf("0122_extra_origin_persistence.sql"));
   // Future migrations may follow this leaf; prove this migration's delta before running them.
   await migrate(up.admin); const once = await catalog(), onceContent = await content();
   await migrate(up.admin); expect(await catalog()).toEqual(once); expect(await content()).toEqual(onceContent);
   // Every migration after 0135 has now run twice: the pre-existing rows and the name-and-type list of the pre-existing columns still read as before 0135.
   await holds(viaAdmin);
   // Controls: each runs in a rolled-back transaction and uses the very same comparison (holds) as the proof above.
   const rolledBack = async (change: (run: Run) => Promise<void>, then: (run: Run) => Promise<void>) => { const client = await up.admin.connect(); const run: Run = (sql, values) => client.query(sql, values); try { await client.query("BEGIN"); await change(run); await then(run); } finally { await client.query("ROLLBACK"); client.release(); } };
   const fails = (run: Run) => expect(holds(run)).rejects.toMatchObject({ name: "AssertionError" });
   // (a) One pre-existing value changed (a timestamp by ONE microsecond where the table has one) must fail the row comparison.
   const edits: Record<string, string> = { extra_origin: "server_recorded_at=server_recorded_at+interval '1 microsecond'", variation: "created_at=created_at+interval '1 microsecond'", command_receipt: "created_at=created_at+interval '1 microsecond'", audit_event: "occurred_at=occurred_at+interval '1 microsecond'", role_grant: "scope_id=gen_random_uuid()" };
   for (const t of kept) await rolledBack(async run => { await run("SET LOCAL session_replication_role=replica"); expect((await run(`UPDATE app.${t} SET ${edits[t]} WHERE ctid=(SELECT ctid FROM app.${t} LIMIT 1)`)).rowCount).toBe(1); }, async run => { const now = await proof(run); expect(now.columnTypes).toEqual(baseline.columnTypes); expect(now.rows[t]).not.toEqual(baseline.rows[t]); await fails(run); });
   // (b) One pre-existing column given another type modifier must fail the name-and-type comparison while every row still reads the same.
   await rolledBack(async run => { await run("ALTER TABLE app.variation ALTER COLUMN description TYPE varchar(501)"); }, async run => { const now = await proof(run); expect(now.rows).toEqual(baseline.rows); expect(now.columnTypes.variation).not.toEqual(baseline.columnTypes.variation); await fails(run); });
   // (c) A nullable column added later and an existing function replaced after 0135's step must leave the proof passing.
   const functionBody = "SELECT p.prosrc AS body FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname='contractor_member_active' ORDER BY p.oid LIMIT 1";
   await rolledBack(async run => {
    for (const t of kept) await run(`ALTER TABLE app.${t} ADD COLUMN ent3a_added_later text`);
    const original = (await run("SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname='contractor_member_active' ORDER BY p.oid LIMIT 1")).rows[0]!.definition as string;
    const bodyBefore = (await run(functionBody)).rows[0]!.body as string;
    const replaced = original.replace(/\$function\$\s*$/, () => "-- replaced after 0135 by the control\n$function$");
    expect(replaced).not.toBe(original);
    await run(replaced);
    expect((await run(functionBody)).rows[0]!.body).not.toBe(bodyBefore);
   }, holds);
   expect((await up.admin.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name=$1", ["0135_site_extra_authority.sql"])).rowCount).toBe(1);
  } finally { await up.close(); }
 });
});
