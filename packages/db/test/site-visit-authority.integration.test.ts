// Written before the routines. Real PostgreSQL (embedded) through merged cluster().
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture } from "./extra-fixtures.js";
import { cluster, visitFixture, authority, command, smallJob, cancelOrder, forbiddenRoles, expectedRefusal, invite, type Cluster, type VisitFixture } from "./site-visit-fixtures.js";
let c: Cluster, f: VisitFixture;
beforeAll(async () => { c = await cluster(); f = await visitFixture(c); }, 120_000);
afterAll(async () => { await c?.close(); });
const allowed = [{ decision: "allowed", reason_code: "allowed" }];
describe("ENT-3b visit authority: the rule, cell by cell", () => {
 it("[B1] the named operative is allowed", async () => { expect(await authority(c, f, f.members.operative.member.membershipId)).toEqual(allowed); });
 it("[B1] the named supervisor is allowed", async () => { expect(await authority(c, f, f.named.member.membershipId)).toEqual(allowed); });
 for (const role of forbiddenRoles) it(`[B1] ${role} may not visit (forbidden / role_not_permitted)`, async () => {
  expect(await authority(c, f, f.members[role].member.membershipId)).toEqual([{ decision: "forbidden", reason_code: "role_not_permitted" }]);
 });
 it("[B1] the operative on the team who is not named is refused as a job refusal", async () => { expect(await authority(c, f, f.unassigned.member.membershipId)).toEqual([expectedRefusal]); });
 it("[B1] the supervisor whose grant covers the team but who is not named is refused as a job refusal", async () => { expect(await authority(c, f, f.members.supervisor.member.membershipId)).toEqual([expectedRefusal]); });
 it("[B1] the supervisor of another branch is refused as a job refusal", async () => { expect(await authority(c, f, f.otherSupervisor.member.membershipId)).toEqual([expectedRefusal]); });
 it("[B1] it runs in a READ ONLY transaction and always returns exactly one row (NULLs, absent, empty and non-uuid tenant setting, another tenant's member)", async () => {
  const foreign = await fixture(c);
  const client = await c.runtime.connect();
  try {
   await client.query("BEGIN READ ONLY");
   expect((await client.query("SELECT * FROM app.ent3b_visit_authority(NULL,NULL)")).rows).toEqual([{ decision: "forbidden", reason_code: "member_inactive" }]);
   for (const setting of [null, "", "not-a-uuid"]) {
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [setting]);
    expect((await client.query("SELECT * FROM app.ent3b_visit_authority($1,$2)", [f.members.operative.member.membershipId, f.jobId])).rows).toEqual([{ decision: "forbidden", reason_code: "member_inactive" }]);
   }
   await client.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]);
   for (const args of [[null, null], [null, f.jobId], [foreign.p.membershipId, f.jobId], [f.members.operative.member.membershipId, null], [f.members.operative.member.membershipId, randomUUID()]]) {
    const rows = (await client.query("SELECT * FROM app.ent3b_visit_authority($1,$2)", args)).rows;
    expect(rows).toHaveLength(1);
    const inactive = args[0] === null || args[0] === foreign.p.membershipId;
    expect(rows[0]).toEqual(inactive ? { decision: "forbidden", reason_code: "member_inactive" } : expectedRefusal);
   }
   await client.query("ROLLBACK");
  } finally { client.release(); }
 });
 it("[B4] every job refusal is one decision: random id, another tenant's job, a small-builder job, a named operative taken off the team, a revoked grant, a cancelled order", async () => {
  const own = await visitFixture(c), foreign = await fixture(c);
  const small = await smallJob(c, own);
  const supervisor = own.named.member.membershipId;
  for (const job of [randomUUID(), foreign.jobId, small]) { expect(await authority(c, own, own.members.operative.member.membershipId, job)).toEqual([expectedRefusal]); expect(await authority(c, own, supervisor, job)).toEqual([expectedRefusal]); }
  await command(c, own, { kind: "grant.revoke", grantId: own.named.grant });
  expect(await authority(c, own, supervisor)).toEqual([expectedRefusal]);
  await command(c, own, { kind: "team.move", membershipId: own.members.operative.member.membershipId, fromTeamId: own.demo.teamId, toTeamId: own.otherDemo.teamId });
  expect(await authority(c, own, own.members.operative.member.membershipId)).toEqual([expectedRefusal]);
  const cancelled = await visitFixture(c);
  expect(await authority(c, cancelled, cancelled.named.member.membershipId)).toEqual(allowed);
  await cancelOrder(c, cancelled);
  expect(await authority(c, cancelled, cancelled.named.member.membershipId)).toEqual([expectedRefusal]);
  expect(await authority(c, cancelled, cancelled.members.operative.member.membershipId)).toEqual([expectedRefusal]);
 });
 it("[B4] a revoked membership is forbidden for the caller whatever the job", async () => {
  const own = await visitFixture(c);
  const extra = await invite(c, own, "supervisor", { kind: "team", id: own.demo.teamId });
  await command(c, own, { kind: "membership.revoke", membershipId: extra.member.membershipId });
  for (const job of [own.jobId, randomUUID()]) expect(await authority(c, own, extra.member.membershipId, job)).toEqual([{ decision: "forbidden", reason_code: "member_inactive" }]);
 });
});

describe("ENT-3b catalogue", () => {
 const functions = [
  ["ent3b_visit_authority", "uuid,uuid", false, true], ["ent3b_start_visit", "uuid,uuid,uuid", true, true], ["ent3b_complete_visit", "uuid,uuid,uuid,uuid,text", true, true], ["ent3b_require_open_visit", "uuid,uuid", false, true],
  ["ent3b_closeout_guard", "", false, false], ["ent3b_require_closeout_audit", "", false, false],
 ] as const;
 it("[B19] every function: owner, definer flag, pinned search_path, explicit execute grants, nothing for PUBLIC or the infrastructure role", async () => {
  for (const [name, args, definer, callable] of functions) {
   const row = (await c.admin.query(`SELECT p.prosecdef definer, pg_get_userbyid(p.proowner) owner, p.proconfig config, p.proacl::text acl,
    has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime, has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure
    FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname=$1 AND p.oid=('app.'||$1||'('||$2||')')::regprocedure`, [name, args])).rows;
   expect(row, name).toHaveLength(1);
   expect(row[0], name).toMatchObject({ definer, owner: "jobguard_migration", runtime: callable, infrastructure: false });
   expect(row[0]!.config, name).toEqual(["search_path=pg_catalog"]);
   expect(row[0]!.acl, name).not.toMatch(/(?:\{|,)=X/u);
  }
  const names = (await c.admin.query("SELECT proname FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname LIKE 'ent3b%' ORDER BY proname")).rows.map(r => r.proname);
  expect(names).toEqual(functions.map(([name]) => name).sort());
 });
 it("[B19] closeout_answer: owner, forced row security, the merged policy form, SELECT only for the runtime role", async () => {
  const table = (await c.admin.query("SELECT pg_get_userbyid(relowner) owner, relrowsecurity rls, relforcerowsecurity forced FROM pg_class WHERE oid='app.closeout_answer'::regclass")).rows[0];
  expect(table).toEqual({ owner: "jobguard_migration", rls: true, forced: true });
  const policy = async (name: string) => (await c.admin.query("SELECT policyname,roles::text,cmd,qual,with_check FROM pg_policies WHERE schemaname='app' AND tablename=$1", [name])).rows;
  expect(await policy("closeout_answer")).toEqual(await policy("site_visit"));
  const privileges = async (relation: string, role: string) => (await c.admin.query(`SELECT p.privilege, has_table_privilege($2,$1::regclass,p.privilege) AS held, CASE WHEN p.privilege IN('SELECT','INSERT','UPDATE','REFERENCES') THEN has_any_column_privilege($2,$1::regclass,p.privilege) ELSE false END AS any_column FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(privilege)`, [relation, role])).rows;
  for (const relation of ["app.closeout_answer", "app.site_visit"]) {
   const held = (await privileges(relation, "jobguard_runtime")).filter(r => r.held || (r.any_column && r.privilege !== "SELECT")).map(r => r.privilege);
   expect(held, relation).toEqual(["SELECT"]);
   expect((await privileges(relation, "jobguard_infrastructure")).filter(r => r.held || r.any_column), relation).toEqual([]);
  }
  expect((await c.admin.query("SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='app' AND table_name='closeout_answer' AND grantee='PUBLIC'")).rowCount).toBe(0);
 });
 it("[B19] the triggers: immutable on the answer table, guard before insert, deferred audit check, and exactly one new trigger on the visit table", async () => {
  const triggers = async (table: string) => (await c.admin.query("SELECT tgname,tgenabled,tgdeferrable,tginitdeferred,pg_get_triggerdef(oid) def FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal ORDER BY tgname", [table])).rows;
  const answer = await triggers("app.closeout_answer");
  expect(answer.map(t => t.tgname)).toEqual(["closeout_answer_audit", "closeout_answer_guard", "closeout_answer_immutable"]);
  expect(answer[0]).toMatchObject({ tgdeferrable: true, tginitdeferred: true }); expect(answer[0]!.def).toMatch(/AFTER INSERT .* DEFERRABLE INITIALLY DEFERRED .* FUNCTION app\.ent3b_require_closeout_audit\(\)/u);
  expect(answer[1]!.def).toMatch(/BEFORE INSERT .* FUNCTION app\.ent3b_closeout_guard\(\)/u);
  expect(answer[2]!.def).toMatch(/BEFORE DELETE OR UPDATE .* FUNCTION app\.reject_immutable_commercial_mutation\(\)/u);
  const visit = await triggers("app.site_visit");
  expect(visit.map(t => t.tgname)).toEqual(["no_delete", "site_visit_closeout_answer"]);
  expect(visit[1]).toMatchObject({ tgdeferrable: true, tginitdeferred: true }); expect(visit[1]!.def).toMatch(/AFTER UPDATE .* DEFERRABLE INITIALLY DEFERRED .* FUNCTION app\.ent3b_require_closeout_audit\(\)/u);
 });
 it("[B19] the closed shape of the new table: columns, keys and the question version rule", async () => {
  const columns = (await c.admin.query("SELECT attname||' '||format_type(atttypid,atttypmod)||CASE WHEN attnotnull THEN ' not null' ELSE '' END col FROM pg_attribute WHERE attrelid='app.closeout_answer'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum")).rows.map(r => r.col);
  expect(columns).toEqual(["tenant_id uuid not null", "id uuid not null", "job_id uuid not null", "work_order_id uuid not null", "site_visit_id uuid not null", "membership_id uuid not null", "question_version text not null", "answer text not null", "command_id uuid not null", "server_recorded_at timestamp with time zone not null"]);
  const constraints = (await c.admin.query("SELECT contype,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='app.closeout_answer'::regclass ORDER BY contype,def")).rows.map(r => `${r.contype} ${r.def}`);
  expect(constraints).toEqual(expect.arrayContaining([
   "p PRIMARY KEY (tenant_id, id)", "u UNIQUE (tenant_id, site_visit_id)", "u UNIQUE (tenant_id, command_id)",
   expect.stringMatching(/^c CHECK \(\(?question_version = 'closeout-question\.v1'/u), expect.stringMatching(/^c CHECK \(\(?answer = ANY \(ARRAY\['yes'::text, 'no'::text\]\)\)\)/u),
   expect.stringMatching(/^f FOREIGN KEY \(tenant_id, site_visit_id\) REFERENCES app\.site_visit\(tenant_id, id\)/u), expect.stringMatching(/^f FOREIGN KEY \(tenant_id, work_order_id, job_id\) REFERENCES app\.work_order\(tenant_id, id, job_id\)/u),
   expect.stringMatching(/^f FOREIGN KEY \(tenant_id, membership_id\) REFERENCES app\.contractor_member\(tenant_id, membership_id\)/u), expect.stringMatching(/^f FOREIGN KEY \(tenant_id, command_id\) REFERENCES app\.command_receipt\(tenant_id, command_id\)/u),
  ]));
 });
 it("[F] build standard F: the migration adds exactly one table grant (SELECT to the runtime role) and function grants from an explicit list, and no write grant", async () => {
  const sql = await readFile(new URL("../migrations/0139_site_visit_closeout.sql", import.meta.url), "utf8");
  const grants = [...sql.matchAll(/^GRANT\b[^;]*;/gmu)].map(match => match[0].replace(/\s+/gu, " "));
  expect(grants).toEqual([
   "GRANT SELECT ON app.closeout_answer TO jobguard_runtime;",
   "GRANT EXECUTE ON FUNCTION app.ent3b_visit_authority(uuid,uuid), app.ent3b_start_visit(uuid,uuid,uuid), app.ent3b_complete_visit(uuid,uuid,uuid,uuid,text), app.ent3b_require_open_visit(uuid,uuid) TO jobguard_runtime;",
  ]);
  expect(sql).not.toMatch(/\bGRANT\s+(?:ALL|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b/iu);
  expect(sql).not.toMatch(/\b(?:CREATE\s+OR\s+REPLACE|DROP)\b/iu);
  expect(sql).not.toMatch(/\bALTER\s+TABLE\s+app\.(?!closeout_answer\b)/iu);
 });
 it("[A-AUDIT] every owner-run routine and the trigger name the company in each audit read or write", async () => {
  const defs = async (name: string) => (await c.admin.query("SELECT pg_get_functiondef(p.oid) def FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname=$1", [name])).rows[0]!.def as string;
  // The two writer routines append and read no audit row at all: the one audit event of a command is the repository's single append.
  for (const name of ["ent3b_start_visit", "ent3b_complete_visit"]) expect(await defs(name), name).not.toMatch(/audit_event|audit_head/u);
  const trigger = await defs("ent3b_require_closeout_audit");
  const reads = trigger.match(/app\.audit_event[^;]*;/gu) ?? [];
  expect(reads.length).toBeGreaterThan(0);
  for (const read of reads) expect(read, read).toMatch(/\.tenant_id\s*=\s*NEW\.tenant_id/u);
 });
});

