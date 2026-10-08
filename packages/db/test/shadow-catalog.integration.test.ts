import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { withTenant, verifiedTenantContextFromMembership } from "../src/tenant-context.js";
import { closeTestPools, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
const T=randomUUID(), O=randomUUID(), J=randomUUID(), K=randomUUID(), L=randomUUID(), M=randomUUID(), U=randomUUID(), H="a".repeat(64);
const context=(tenantId:string=T)=>verifiedTenantContextFromMembership({tenantId,membershipId:M,identityUserId:U} as Parameters<typeof verifiedTenantContextFromMembership>[0]);
let postgres:EmbeddedPostgres, admin:Pool, runtime:Pool, shadow:Pool, emergency:Pool, directory:string, port:number;
const migrationURL=new URL("../migrations/0100_shadow_persistence.sql",import.meta.url);
async function signal(jobId:string=J,tenantId:string=T,state="candidate") {
 const id=randomUUID();await admin.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
 VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic-v1',clock_timestamp(),'Fictional outside tap','low',$5)`,[tenantId,jobId,id,randomUUID(),state]);return id;
}
async function setup() {
 directory=await mkdtemp(join(tmpdir(),"sv2-pg16-"));port=59000+Math.floor(Math.random()*500);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});await migrate(admin);await installLegacySyntheticPartyFixtures(admin);
 for(const [tenant,job] of [[T,J],[T,K],[O,L]]) {
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[tenant]);
  await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional SV-2 job','live')",[job,tenant]);
 }
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[U]);const a=randomUUID();
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic SV-2')",[a,T]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[M,T,a,U]);
 for(const [login,role] of [["sv2_runtime","jobguard_runtime"],["sv2_shadow","jobguard_shadow"],["sv2_emergency","jobguard_shadow_emergency_access"]]) {
  await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT ${role} TO ${login}`);
 }
 // Name the database: with none, pg connects to a database called after the login, which does not exist.
 const pool=(user:string)=>new Pool({host:"127.0.0.1",port,database:"postgres",user,password:"synthetic",max:4});
 runtime=pool("sv2_runtime");shadow=pool("sv2_shadow");emergency=pool("sv2_emergency");
}
async function cleanup(){await closeTestPools(runtime,shadow,emergency,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true});}
const tables=["shadow_commercial_signal","shadow_signal_evidence","shadow_signal_ineligibility","shadow_reconciliation_run","shadow_signal_classification","shadow_signal_disposition","shadow_disclosure_event","shadow_break_glass_access"];
it("registers the issued expand migration",()=>{expect(MIGRATION_URLS.map(u=>u.pathname)).toContain(migrationURL.pathname)});
describe("SV-2 catalog and actual role isolation (DW1, DW2, DW3, DW4)",()=>{
 beforeAll(setup,60000);afterAll(cleanup);
 it("owns and FORCE-protects every shadow table, with no runtime table, column, sequence or view privileges",async()=>{
  const rows=(await admin.query(`SELECT c.relname,r.rolname,c.relrowsecurity,c.relforcerowsecurity,
   has_table_privilege('jobguard_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS runtime,
   has_any_column_privilege('jobguard_runtime',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS columns
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname=ANY($1)`,[tables])).rows;
  expect(rows).toHaveLength(tables.length);for(const r of rows)expect(r).toMatchObject({rolname:"jobguard_migration",relrowsecurity:true,relforcerowsecurity:true,runtime:false,columns:false});
  // Walk dependent views recursively, including views of views, in every schema.
  const views=(await admin.query(`WITH RECURSIVE reached(oid) AS (
   SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1)
   UNION SELECT rw.ev_class FROM reached x JOIN pg_depend d ON d.refobjid=x.oid AND d.refclassid='pg_class'::regclass JOIN pg_rewrite rw ON rw.oid=d.objid AND d.classid='pg_rewrite'::regclass)
   SELECT c.relname,has_table_privilege('jobguard_runtime',c.oid,'SELECT') OR has_any_column_privilege('jobguard_runtime',c.oid,'SELECT') AS allowed FROM reached JOIN pg_class c ON c.oid=reached.oid WHERE c.relkind IN ('v','m')`,[tables])).rows;
  expect(views.filter(r=>r.allowed)).toEqual([]);
  // CASE guards the call: the planner may otherwise run has_sequence_privilege on a non-sequence (e.g. a TOAST table).
  const sequences=(await admin.query(`SELECT c.relname FROM pg_class c WHERE c.relkind='S' AND CASE WHEN c.relkind='S' THEN has_sequence_privilege('jobguard_runtime',c.oid,'USAGE,SELECT,UPDATE') ELSE false END AND EXISTS(SELECT 1 FROM pg_depend d JOIN pg_class t ON t.oid=d.refobjid WHERE d.objid=c.oid AND t.relname=ANY($1))`,[tables])).rows;
  expect(sequences).toEqual([]);
  for(const table of tables)await expect(runtime.query(`SELECT * FROM app.${table}`)).rejects.toMatchObject({code:"42501"});
 });
 it("has exact routine grantees, pinned paths, and no executable shadow helper",async()=>{
  const expected:Record<string,string[]>={reveal_shadow_signals:["jobguard_runtime"],record_shadow_disclosure:["jobguard_shadow","jobguard_shadow_emergency_access"],read_shadow_emergency:["jobguard_shadow_emergency_access"]};
  const rows=(await admin.query(`SELECT p.proname,r.rolname,p.proconfig,ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>p.proowner ORDER BY 1)::text[] AS grantees FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='app' AND p.proname=ANY($1)`,[Object.keys(expected)])).rows;
  expect(rows).toHaveLength(3);for(const row of rows){expect(row.rolname).toBe("jobguard_migration");expect(row.proconfig).toContain("search_path=pg_catalog, app");expect(row.grantees).toEqual(expected[row.proname]);}
  // Catalog scan catches a newly added callable helper reaching any shadow table.
  const helpers=(await admin.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') AND p.proname<>'reveal_shadow_signals' AND (p.prosrc ~ 'shadow_(commercial_signal|signal_|reconciliation_run|disclosure_event|break_glass_access)' OR EXISTS(SELECT 1 FROM pg_depend d JOIN pg_class c ON c.oid=d.refobjid WHERE d.objid=p.oid AND d.classid='pg_proc'::regclass AND c.relname=ANY($1)))`,[tables])).rows;
  expect(helpers).toEqual([]);
 });
 it("closes inherited PUBLIC EXECUTE: neither new role can run an app routine beyond SV-2's explicit grants",async()=>{
  // 0100 gives both roles USAGE on schema app for the first time. Four older SECURITY DEFINER routines there had
  // PUBLIC EXECUTE; 0100 revokes it. Runtime keeps its own explicit grant on each, exactly as before.
  const older=["advance_final_account_draft","invalidate_stale_final_account_authorizations","issue_practice_customer_invoice","reserve_customer_invoice_number"];
  expect((await admin.query(`SELECT p.proname,p.prosecdef,r.rolname AS owner,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') AS runtime,
   ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END FROM aclexplode(p.proacl) a WHERE a.privilege_type='EXECUTE' ORDER BY 1)::text[] AS grantees
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='app' AND p.proname=ANY($1) ORDER BY p.proname`,[older])).rows)
   .toEqual(older.map(proname=>({proname,prosecdef:true,owner:"jobguard_migration",runtime:true,grantees:["jobguard_migration","jobguard_runtime"]})));
  // Every non-trigger routine in app that each new role can execute, by catalog. Trigger functions are not callable
  // directly (checked below). Two pure arithmetic INVOKER helpers keep their default PUBLIC EXECUTE by design.
  const explicit:Record<string,string[]>={jobguard_shadow:["record_shadow_disclosure"],jobguard_shadow_emergency_access:["read_shadow_emergency","record_shadow_disclosure"]};
  const pureHelpers=["half_even_ratio","reference_recovery_cap"];
  const callable=(await admin.query(`SELECT r.rolname AS role,p.proname,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   CROSS JOIN (VALUES ('jobguard_shadow'),('jobguard_shadow_emergency_access')) r(rolname)
   WHERE n.nspname='app' AND p.prorettype<>'trigger'::regtype AND has_function_privilege(r.rolname,p.oid,'EXECUTE') ORDER BY 1,2`)).rows;
  for(const [role,expected] of Object.entries(explicit)){
   const mine=callable.filter(row=>row.role===role);
   expect(mine.filter(row=>!pureHelpers.includes(row.proname)).map(row=>row.proname)).toEqual(expected);
   expect(mine.filter(row=>pureHelpers.includes(row.proname)).every(row=>!row.prosecdef)).toBe(true);
  }
  // Actual logins: each older routine is refused with a permission error for both new roles.
  const calls=["SELECT app.advance_final_account_draft($1::uuid,$1::uuid,$1::uuid,1)","SELECT app.invalidate_stale_final_account_authorizations($1::uuid,$1::uuid,repeat('a',64)::char(64))","SELECT app.reserve_customer_invoice_number($1::uuid)","SELECT * FROM app.issue_practice_customer_invoice($1::uuid,$1::uuid,$1::uuid,$1::uuid,$1::uuid,'Synthetic recipient','2026-10-01'::date)"];
  for(const pool of [shadow,emergency])for(const sql of calls)await expect(pool.query(sql,[T])).rejects.toMatchObject({code:"42501"});
  // Trigger functions executable by default are inert when called directly.
  const triggers=(await admin.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.prorettype='trigger'::regtype AND has_function_privilege('jobguard_shadow',p.oid,'EXECUTE') AND has_function_privilege('jobguard_shadow_emergency_access',p.oid,'EXECUTE') ORDER BY 1`)).rows.map(row=>row.proname as string);
  expect(triggers.length).toBeGreaterThan(0);
  for(const pool of [shadow,emergency])for(const name of triggers)await expect(pool.query(`SELECT app.${name}()`)).rejects.toMatchObject({code:expect.stringMatching(/^(0A000|42501)$/)});
 });
 it("cannot read identity/credentials, assume other roles, change policies or bypass RLS",async()=>{
  const roles=(await admin.query("SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname IN ('jobguard_shadow','jobguard_shadow_emergency_access')")).rows;
  expect(roles).toHaveLength(2);for(const r of roles)expect(r).toMatchObject({rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolbypassrls:false,rolcanlogin:false});
  expect((await admin.query("SELECT * FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('jobguard_shadow','jobguard_shadow_emergency_access'))")).rows).toEqual([]);
  const protectedTables=(await admin.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('identity','control_plane','audit_control','infrastructure')")).rows;
  for(const r of protectedTables)await expect(shadow.query(`SELECT * FROM ${r.schemaname}.${r.tablename}`)).rejects.toMatchObject({code:"42501"});
  for(const sql of ["ALTER POLICY tenant_isolation ON app.shadow_commercial_signal USING (true)","DROP POLICY tenant_isolation ON app.shadow_commercial_signal","ALTER TABLE app.shadow_commercial_signal DISABLE ROW LEVEL SECURITY","SET ROLE jobguard_runtime","SET ROLE jobguard_migration","SET ROLE jobguard_infrastructure","SET ROLE postgres","SET ROLE jobguard_shadow_emergency_access"])await expect(shadow.query(sql)).rejects.toMatchObject({code:"42501"});
  const id=await signal();expect((await shadow.query("SELECT * FROM app.shadow_commercial_signal")).rows).toEqual([]);
  expect((await withTenant(shadow,context(O),db=>db.$client.query("SELECT * FROM app.shadow_commercial_signal WHERE id=$1",[id]))).rows).toEqual([]);
  await expect(withTenant(shadow,context(),async db=>{await db.$client.query("SET LOCAL row_security=off");await db.$client.query("SELECT * FROM app.shadow_commercial_signal")})).rejects.toMatchObject({code:"42501"});
 });
 it("denies mutation to all business runtime roles; shadow facts remain append-only",async()=>{
  for(const role of [runtime,shadow,emergency])for(const table of [...tables,"extra_origin","variation_withdrawal"])for(const verb of ["UPDATE","DELETE","TRUNCATE"]){
   const sql=verb==="UPDATE"?`UPDATE app.${table} SET tenant_id=tenant_id`:verb==="DELETE"?`DELETE FROM app.${table}`:`TRUNCATE app.${table}`;
   await expect(withTenant(role,context(),db=>db.$client.query(sql))).rejects.toMatchObject({code:"42501"});
  }
  for(const table of tables)expect((await admin.query("SELECT has_table_privilege('jobguard_infrastructure',$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[`app.${table}`])).rows[0].allowed).toBe(false);
  // Signal state/revision alone are the shadow role's mutable projection columns.
  for(const table of tables.filter(t=>t!=="shadow_commercial_signal"))await expect(admin.query(`DELETE FROM app.${table}`)).rejects.toMatchObject({code:"55000"});
 });
});
