import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Pool } from "pg";
import { migrate } from "../src/index.js";
import { rolledBack } from "./upgrade-proof-utils.js";
import { cluster, company, start, end, lookup, ownerTx, savepoint, type Company } from "./practice-worker-switch-fixtures.js";
import type { Cluster } from "./contractor-practice-session-fixtures.js";
let c: Cluster;
beforeAll(async () => { process.env.JOBGUARD_ENV = "synthetic_demo"; c = await cluster(); }, 120000);
afterAll(async () => { await c?.close(); });
it.each(["SELECT * FROM", "INSERT INTO", "UPDATE", "DELETE FROM"])("[PW6] [PW17] runtime has no table authority: %s", async verb => {
 const f = await company(c);
 for (const table of ["practice_company_marker", "practice_worker_switch"]) {
  const suffix = verb === "INSERT INTO" ? " DEFAULT VALUES" : verb === "UPDATE" ? " SET environment='synthetic_demo'" : "";
  await expect(c.runtime.query(`${verb} control_plane.${table}${suffix}`)).rejects.toMatchObject({ code: "42501" });
 }
 expect(await lookup(c, f)).toEqual(f.p);
});
it("[PW14] lookup refuses every mismatched marker and switch condition", async () => {
 const f = await company(c), b = await company(c); await start(c, f);
 for (const [table, change] of [
  ["practice_company_marker", `tenant_id='${randomUUID()}'`], ["practice_company_marker", `session_ref='${randomUUID()}'`], ["practice_company_marker", `owner_membership_id='${randomUUID()}'`], ["practice_company_marker", `owner_identity_user_id='${randomUUID()}'`],
  ["practice_worker_switch", `tenant_id='${b.p.tenantId}'`], ["practice_worker_switch", `owner_membership_id='${randomUUID()}'`], ["practice_worker_switch", `session_ref='${b.sessionRef}'`],
  ["practice_worker_switch", "started_at=clock_timestamp()+interval '1 minute',expires_at=clock_timestamp()+interval '31 minutes'"],
 ] as const) await rolledBack(c.admin, async db => {
  await db.query("SET LOCAL session_replication_role=replica");
  // One database reading keeps the exact window CHECK true in the future-time control.
  if (change.startsWith("started_at=")) await db.query("WITH reading AS MATERIALIZED(SELECT clock_timestamp()+interval '1 minute' t) UPDATE control_plane.practice_worker_switch s SET started_at=reading.t,expires_at=reading.t+interval '30 minutes' FROM reading WHERE s.tenant_id=$1", [f.p.tenantId]);
  else await db.query(`UPDATE control_plane.${table} SET ${change} WHERE tenant_id=$1`, [f.p.tenantId]);
  expect((await db.query("SELECT * FROM app.contractor_session($1)", [f.session])).rows[0]!.membership_id).toBe(f.p.membershipId);
 });
});
it("[PW8] [PW17] immutable switch history, exact environment and window CHECKs", async () => {
 const f = await company(c), result = await start(c, f);
 for (const clause of ["environment='production_billing'", "worker_membership_id=owner_membership_id", "expires_at=expires_at+interval '1 minute'"]) await rolledBack(c.admin, async db => {
  await db.query("SET LOCAL session_replication_role=replica"); await expect(db.query(`UPDATE control_plane.practice_worker_switch SET ${clause} WHERE id=$1`, [result.switchId])).rejects.toMatchObject({ code: "23514" });
 });
 for (const sql of ["UPDATE control_plane.practice_worker_switch SET command_id=gen_random_uuid() WHERE tenant_id=$1", "DELETE FROM control_plane.practice_worker_switch WHERE tenant_id=$1"]) await expect(ownerTx(c, f.p.tenantId, db => db.$client.query(sql, [f.p.tenantId]))).rejects.toMatchObject({ message: "SWITCH_RECORD_IMMUTABLE" });
 await expect(ownerTx(c, f.p.tenantId, db => db.$client.query("TRUNCATE control_plane.practice_worker_switch"))).rejects.toMatchObject({ message: "SWITCH_RECORD_IMMUTABLE" });
 await end(c, f);
});
it("[PW10] end without its audit event fails at commit and keeps the current worker", async () => {
 const f = await company(c); await start(c, f);
 await expect(ownerTx(c, f.p.tenantId, db => db.$client.query("SELECT app.practice_worker_switch_off($1,$2)", [f.session, randomUUID()]))).rejects.toMatchObject({ message: "SWITCH_AUDIT_REQUIRED" });
 expect((await lookup(c, f)).membershipId).toBe(f.members.operative);
});
it("[PW18] another database refuses callable routines and direct inserts before other checks", async () => {
 await c.admin.query("CREATE DATABASE pws_other_database"); const db = new Pool({ ...c.config, database: "pws_other_database" });
 try {
  await migrate(db);
  for (const sql of ["SELECT app.practice_worker_switch_on(NULL,NULL,NULL)", "SELECT app.practice_worker_switch_off(NULL,NULL)", "SELECT app.practice_worker_switch_state(NULL)", "INSERT INTO control_plane.practice_company_marker DEFAULT VALUES", "INSERT INTO control_plane.practice_worker_switch DEFAULT VALUES"]) await expect(db.query(sql)).rejects.toMatchObject({ message: "MODE_FORBIDDEN" });
  expect((await db.query("SELECT * FROM app.contractor_session($1)", [randomUUID()])).rows).toEqual([]);
 } finally { await db.end(); }
});
it("[PW25] only the three checked routines are callable and no table grant exists", async () => {
 for (const table of ["practice_company_marker", "practice_worker_switch"]) {
  const row = (await c.admin.query("SELECT pg_get_userbyid(relowner) owner,relrowsecurity,relforcerowsecurity,has_table_privilege('jobguard_runtime',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed FROM pg_class WHERE oid=$1::regclass", [`control_plane.${table}`])).rows[0]!;
  expect(row).toMatchObject({ owner: "jobguard_migration", relrowsecurity: false, relforcerowsecurity: false, allowed: false });
 }
 const functions = (await c.admin.query("SELECT proname,prosecdef,proconfig,pg_get_userbyid(proowner) owner,has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') infrastructure,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname IN ('practice_company_made_up','practice_worker_switch_decision','practice_worker_switch_on','practice_worker_switch_off','practice_worker_switch_state','practice_company_marker_guard','practice_worker_switch_guard','practice_worker_switch_require_audit','practice_company_refuse_sign_in','practice_worker_refuse_wider_grant')")).rows;
 expect(functions).toHaveLength(10);
 for (const fn of functions) {
  expect(fn.owner).toBe("jobguard_migration"); expect(fn.proconfig).toEqual(["search_path=pg_catalog"]); expect(fn.infrastructure).toBe(false);
  expect(fn.runtime).toBe(["practice_worker_switch_on", "practice_worker_switch_off", "practice_worker_switch_state"].includes(fn.proname));
  if (fn.prosecdef) expect(fn.definition.toLowerCase()).not.toMatch(/for (?:no key )?update|for share/u);
 }
});
it("[PW32] wider grants only refused for a currently acted-as member", async () => {
 const f = await company(c); await start(c, f);
 await ownerTx(c, f.p.tenantId, async db => {
  await savepoint(db.$client, () => db.$client.query("INSERT INTO app.role_grant VALUES($1,$2,$3,'admin','tenant',$1,NULL)", [f.p.tenantId, randomUUID(), f.members.operative]), "42501");
  await db.$client.query("INSERT INTO app.role_grant VALUES($1,$2,$3,'admin','tenant',$1,NULL)", [f.p.tenantId, randomUUID(), f.members.read_only]);
 });
});
it("[PW17] foreign-key chain survives disabled user triggers", async () => {
 const f = await company(c);
 await rolledBack(c.admin, async db => {
  await db.query("ALTER TABLE control_plane.practice_worker_switch DISABLE TRIGGER USER");
  await db.query("SAVEPOINT no_marker");
  await expect(db.query("INSERT INTO control_plane.practice_worker_switch(id,session_ref,tenant_id,owner_membership_id,worker_membership_id,worker_identity_user_id,command_id,started_at,expires_at) SELECT gen_random_uuid(),$1,$2,$3,m.id,m.identity_user_id,gen_random_uuid(),r.t,r.t+interval '30 minutes' FROM app.membership m CROSS JOIN (SELECT clock_timestamp() t) r WHERE m.tenant_id=$2 AND m.id=$4", [f.sessionRef, f.p.tenantId, f.p.membershipId, f.members.operative])).rejects.toMatchObject({ code: "23503" });
  await db.query("ROLLBACK TO SAVEPOINT no_marker");
 });
});
it("[PW4] tampered session callers of every non-owner role are uniformly refused", async () => {
 for (const role of ["admin", "operative", "supervisor", "surveyor", "commercial_manager", "finance", "read_only", "client_approver"]) {
  const f = await company(c);
  const db = await c.admin.connect();
  try {
   await db.query("BEGIN"); await db.query("SET LOCAL session_replication_role=replica");
   await db.query("UPDATE control_plane.contractor_practice_session s SET membership_id=m.id,identity_user_id=m.identity_user_id FROM app.membership m WHERE s.session_id=$1 AND m.tenant_id=$2 AND m.id=$3", [f.sessionRef, f.p.tenantId, f.members[role]]);
   await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]); await db.query("SET LOCAL ROLE jobguard_runtime");
   for (const target of [f.members.operative, f.members.supervisor, randomUUID()]) await savepoint(db, () => db.query("SELECT app.practice_worker_switch_on($1,$2,$3)", [f.session, randomUUID(), target]), "42501");
  } finally { await db.query("ROLLBACK"); db.release(); }
 }
});
it("[PW20] authority settings cannot select another company or target", async () => {
 const f = await company(c), foreign = await company(c);
 for (const setting of [null, "", "invalid", foreign.p.tenantId]) await rolledBack(c.admin, async db => {
  if (setting !== null) await db.query("SELECT set_config('app.tenant_id',$1,true)", [setting]); await db.query("SET LOCAL ROLE jobguard_runtime");
  for (const target of [f.members.operative, foreign.members.operative, randomUUID()]) await savepoint(db, () => db.query("SELECT app.practice_worker_switch_on($1,$2,$3)", [f.session, randomUUID(), target]), "28000");
 });
});
it("[PW13] [PW17] direct owner writes cannot select a foreign, office or owner target", async () => {
 const f = await company(c), b = await company(c);
 for (const worker of [f.members.owner, f.members.admin, f.members.finance, b.members.operative]) {
  const identity = (await c.admin.query("SELECT identity_user_id FROM app.membership WHERE id=$1", [worker])).rows[0]!.identity_user_id;
  await expect(ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO control_plane.practice_worker_switch(id,session_ref,tenant_id,owner_membership_id,worker_membership_id,worker_identity_user_id,command_id,started_at,expires_at) SELECT gen_random_uuid(),$1,$2,$3,$4,$5,gen_random_uuid(),r.t,r.t+interval '30 minutes' FROM (SELECT clock_timestamp() t) r", [f.sessionRef, f.p.tenantId, f.p.membershipId, worker, identity]))).rejects.toMatchObject({ message: "SWITCH_FORBIDDEN" });
 }
});
it("[PW25] marker and switch have the specified constraint and index counts", async () => {
 for (const [table, fk, checks, uniques] of [["practice_company_marker", 3, 1, 3], ["practice_worker_switch", 5, 7, 3]] as const) {
  const constraints = (await c.admin.query("SELECT contype,count(*)::int n FROM pg_constraint WHERE conrelid=$1::regclass GROUP BY contype", [`control_plane.${table}`])).rows;
  const counts = Object.fromEntries(constraints.map(row => [row.contype, row.n])); expect(counts).toMatchObject({ f: fk, c: checks, u: uniques, p: 1 });
  const cols = (await c.admin.query("SELECT attname,format_type(atttypid,atttypmod) type FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped", [`control_plane.${table}`])).rows;
  expect(cols.some(col => col.attname === "session_id" || col.type === "character(64)")).toBe(false);
 }
 const triggers = (await c.admin.query("SELECT tgrelid::regclass::text relation,tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN('made_up_company_no_sign_in','made_up_worker_no_wider_grant') ORDER BY relation")).rows;
 expect(triggers).toHaveLength(5); expect(triggers.filter(t => t.tgname === "made_up_company_no_sign_in")).toHaveLength(4);
});
it("[PW17] missing decision answers fail closed with the caller refusal", async () => {
 const f = await company(c);
 await rolledBack(c.admin, async db => {
  await db.query(`CREATE OR REPLACE FUNCTION app.practice_worker_switch_decision(p_session_ref uuid,p_worker uuid) RETURNS TABLE(decision text,reason_code text,company uuid,owner_member uuid,owner_user uuid,worker_user uuid) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT NULL::text,NULL::text,NULL::uuid,NULL::uuid,NULL::uuid,NULL::uuid WHERE false $$`);
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]); await db.query("SET LOCAL ROLE jobguard_runtime");
  await expect(db.query("SELECT app.practice_worker_switch_on($1,$2,$3)", [f.session, randomUUID(), f.members.operative])).rejects.toMatchObject({ message: "SWITCH_FORBIDDEN", code: "42501" });
 });
});
it("[PW10] a direct table-owner switch insert still requires its event at commit", async () => {
 const f = await company(c), user = (await c.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.members.operative])).rows[0]!.identity_user_id;
 await expect(ownerTx(c, f.p.tenantId, async db => {
  await db.$client.query("INSERT INTO control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,marked_at) VALUES($1,$2,$3,$4,clock_timestamp())", [f.p.tenantId, f.sessionRef, f.p.membershipId, f.p.identityUserId]);
  await db.$client.query("INSERT INTO control_plane.practice_worker_switch(id,session_ref,tenant_id,owner_membership_id,worker_membership_id,worker_identity_user_id,command_id,started_at,expires_at) SELECT gen_random_uuid(),$1,$2,$3,$4,$5,gen_random_uuid(),r.t,r.t+interval '30 minutes' FROM (SELECT clock_timestamp() t) r", [f.sessionRef, f.p.tenantId, f.p.membershipId, f.members.operative, user]);
 })).rejects.toMatchObject({ message: "SWITCH_AUDIT_REQUIRED" });
 expect(await lookup(c, f)).toEqual(f.p);
});
it("[PW8] [PW17] table-owner switch and end timestamps must be true database times", async () => {
 const f = await company(c); await start(c, f); await end(c, f);
 const user = (await c.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, f.members.operative])).rows[0]!.identity_user_id;
 for (const offset of ["-1 day", "1 day"]) await expect(ownerTx(c, f.p.tenantId, db => db.$client.query("INSERT INTO control_plane.practice_worker_switch(id,session_ref,tenant_id,owner_membership_id,worker_membership_id,worker_identity_user_id,command_id,started_at,expires_at) SELECT gen_random_uuid(),$1,$2,$3,$4,$5,gen_random_uuid(),r.t,r.t+interval '30 minutes' FROM (SELECT clock_timestamp()+$6::interval t) r", [f.sessionRef, f.p.tenantId, f.p.membershipId, f.members.operative, user, offset]))).rejects.toMatchObject({ message: "SWITCH_FORBIDDEN" });
 const active = await start(c, f);
 for (const expression of ["started_at", "clock_timestamp()+interval '1 minute'"]) await expect(ownerTx(c, f.p.tenantId, db => db.$client.query(`UPDATE control_plane.practice_worker_switch SET ended_at=${expression},end_reason='switched_back',end_command_id=gen_random_uuid(),end_event_id=gen_random_uuid() WHERE id=$1`, [active.switchId]))).rejects.toMatchObject({ message: "SWITCH_RECORD_IMMUTABLE" });
});
it("[PW14] marker environment CHECK survives disabled triggers", async () => {
 const f = await company(c); await start(c, f);
 await rolledBack(c.admin, async db => { await db.query("SET LOCAL session_replication_role=replica"); await expect(db.query("UPDATE control_plane.practice_company_marker SET environment='production_billing' WHERE tenant_id=$1", [f.p.tenantId])).rejects.toMatchObject({ code: "23514" }); });
});
it("[PW4] a session whose identity does not match its owner is refused uniformly", async () => {
 const f = await company(c);
 await rolledBack(c.admin, async db => {
  await db.query("SET LOCAL session_replication_role=replica"); await db.query("UPDATE control_plane.contractor_practice_session SET identity_user_id=$2 WHERE session_id=$1", [f.sessionRef, randomUUID()]);
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [f.p.tenantId]); await db.query("SET LOCAL ROLE jobguard_runtime");
  for (const target of [f.members.operative, f.members.supervisor, randomUUID()]) { await db.query("SAVEPOINT identity_refusal"); await expect(db.query("SELECT app.practice_worker_switch_on($1,$2,$3)", [f.session, randomUUID(), target])).rejects.toMatchObject({ message: "SWITCH_FORBIDDEN" }); await db.query("ROLLBACK TO SAVEPOINT identity_refusal"); }
 });
});
