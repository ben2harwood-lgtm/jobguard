import { finalizeMeterLifecycleOwnership } from "../src/demo-bootstrap.js";
import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { closeWorkFixture,createWorkFixture,workTenant,type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
describe('MON1-S local privilege boundary, CI PostgreSQL only',()=>{
 let f:WorkFixture;
 beforeAll(async()=>{f=await createWorkFixture();const admin=await f.admin.connect();try{await finalizeMeterLifecycleOwnership(admin)}finally{admin.release()}},60000);afterAll(async()=>closeWorkFixture(f));
 it('M1S-07 normal API rejects shared practice, malformed/expired/revoked sessions and admin mutations before lookup',async()=>{
  const a=await meterCompany(f);
  const read=(tenant=a.tenantId,digest=a.digest)=>workTenant(f.runtime,tenant,db=>db.query('SELECT app.mon1_lifecycle_read($1,$2,$3)',[tenant,digest,randomUUID()]));
  await expect(read('11111111-1111-4111-8111-111111111111')).rejects.toThrow('METER_FORBIDDEN');
  await expect(read(a.tenantId,'invalid')).rejects.toThrow('METER_FORBIDDEN');
  await f.admin.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1',[a.sessionId]);
  await expect(read()).rejects.toThrow('METER_FORBIDDEN');
  const b=await meterCompany(f);await f.admin.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2",[b.tenantId,b.actorId]);
  await expect(workTenant(f.runtime,b.tenantId,db=>db.query('SELECT app.mon1_lifecycle_capture($1,$2,$3,$4::date,0)',[b.tenantId,b.digest,randomUUID(),'2026-09-01']))).rejects.toThrow('METER_FORBIDDEN');
 });
 it('M1S-08 role cannot assume roles/read shadow or write business rows; new tables FORCE RLS',async()=>{
  const role=(await f.admin.query("SELECT rolcanlogin,rolinherit,rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname='jobguard_meter'")).rows[0];
  expect(role).toEqual({rolcanlogin:false,rolinherit:false,rolsuper:false,rolbypassrls:false,rolcreaterole:false});
  expect((await f.admin.query("SELECT * FROM pg_auth_members WHERE member='jobguard_meter'::regrole OR roleid='jobguard_meter'::regrole")).rows).toEqual([]);
  const tables=(await f.admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,has_table_privilege('jobguard_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') runtime FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r' AND c.relname LIKE 'meter_lifecycle_%'")).rows;
  expect(tables).toHaveLength(8);
  for(const t of tables)expect(t).toMatchObject({relrowsecurity:true,relforcerowsecurity:true,owner:'jobguard_migration',runtime:false});
  const hidden=(await f.admin.query("SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r' AND c.relname LIKE 'shadow%'")).rows;
  expect(hidden.length).toBeGreaterThan(0);
  for(const table of hidden)expect((await f.admin.query("SELECT has_table_privilege('jobguard_meter',$1::oid,'SELECT') yes",[table.oid])).rows[0].yes).toBe(false);
  const signatures=['app.mon1_lifecycle_capture(uuid,text,uuid,date,integer)','app.mon1_lifecycle_rebuild(uuid,text,uuid)','app.mon1_lifecycle_read(uuid,text,uuid)'];
  for(const signature of signatures)expect((await f.admin.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,has_function_privilege('jobguard_runtime',oid,'EXECUTE') executable FROM pg_proc WHERE oid=$1::regprocedure",[signature])).rows[0]).toEqual({owner:'jobguard_meter_owner',prosecdef:true,proconfig:['search_path=pg_catalog'],executable:true});
  expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime','app.mon1_lifecycle_actor(uuid,text,boolean)','EXECUTE') yes")).rows[0].yes).toBe(false);
 });
 it('dedicated owner has exactly the required table grants and tenant SELECT policies',async()=>{
  const source=['membership','subscription_agreement_revision','job_activation','job_activation_terms','job','job_party_binding','job_work_state_event','final_account_lock','job_small_trip_event','job_small_trip_observation','job_link'];
  const write=['meter_lifecycle_scope','meter_lifecycle_source','meter_lifecycle_source_ref','meter_lifecycle_computation','meter_lifecycle_day_ledger','meter_lifecycle_alert'];
  const grants=(await f.admin.query(`SELECT n.nspname||'.'||c.relname AS object,a.privilege_type AS privilege
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a
   WHERE a.grantee='jobguard_meter_owner'::regrole ORDER BY 1,2`)).rows;
  const expected=[...source.map(t=>({object:'app.'+t,privilege:'SELECT'})),...write.flatMap(t=>['INSERT','SELECT'].map(privilege=>({object:'app.'+t,privilege})))];
  expected.sort((a,b)=>a.object.localeCompare(b.object)||a.privilege.localeCompare(b.privilege));
  expect(grants).toEqual(expected);
  const policies=(await f.admin.query("SELECT tablename,roles::text[],cmd,qual,with_check FROM pg_policies WHERE policyname='meter_lifecycle_source_read' ORDER BY tablename")).rows;
  expect(policies).toEqual(source.sort().map(tablename=>({tablename,roles:['jobguard_meter_owner'],cmd:'SELECT',qual:"(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)",with_check:null})));
 });
 it('M1S-08 every executing lifecycle principal has no privilege on any shadow relation, sequence or dedicated schema',async()=>{
  const db=await f.admin.connect();
  // Discover ALL lifecycle routines, not a list of the three public entrypoints.
  const violations=async()=> (await db.query(`
   WITH principals AS (
    SELECT p.oid,p.proname,CASE WHEN p.prosecdef THEN p.proowner ELSE 'jobguard_runtime'::regrole::oid END AS principal
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app' AND p.proname LIKE 'mon1_lifecycle_%'
   ), hidden AS (
    SELECT c.oid,c.relkind,n.nspname||'.'||c.relname AS object
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (c.relname LIKE 'shadow%' OR n.nspname LIKE '%shadow%' OR EXISTS(SELECT 1 FROM pg_depend d JOIN pg_class parent ON parent.oid=d.refobjid WHERE d.objid=c.oid AND d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i') AND parent.relname LIKE 'shadow%')) AND c.relkind IN ('r','p','v','m','f','S')
   )
   SELECT p.proname,pg_get_userbyid(p.principal) AS principal,h.object
   FROM principals p CROSS JOIN hidden h
   WHERE CASE WHEN h.relkind='S' THEN has_sequence_privilege(p.principal,h.oid,'USAGE,SELECT,UPDATE')
    ELSE has_table_privilege(p.principal,h.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_any_column_privilege(p.principal,h.oid,'SELECT,INSERT,UPDATE,REFERENCES') END
   UNION ALL
   SELECT p.proname,pg_get_userbyid(p.principal),n.nspname FROM principals p CROSS JOIN pg_namespace n
   WHERE n.nspname LIKE '%shadow%' AND has_schema_privilege(p.principal,n.oid,'USAGE,CREATE')
   ORDER BY 1,3`)).rows;
  try {
   const routines=(await db.query("SELECT oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname LIKE 'mon1_lifecycle_%' ORDER BY proname")).rows;
   expect(routines).toHaveLength(4);
   expect((await db.query("SELECT count(*)::int n FROM pg_class WHERE relname LIKE 'shadow%' AND relkind IN ('r','p')")).rows[0].n).toBeGreaterThan(0);
   expect(await violations()).toEqual([]);
   // Negative control reproduces 220a9959's exact executing principal. The same
   // catalogue assertion must reject it, then recover after transaction rollback.
   await db.query('BEGIN');
   try {
    for(const r of routines) await db.query(`ALTER FUNCTION ${r.signature} OWNER TO jobguard_migration`);
    const old=await violations();
    expect(new Set(old.map(row=>row.proname)).size).toBe(4);
    expect(old.every(row=>row.principal==='jobguard_migration')).toBe(true);
    expect(()=>expect(old).toEqual([])).toThrow();
   } finally { await db.query('ROLLBACK'); }
   expect(await violations()).toEqual([]);
   await db.query('BEGIN');
   try {
    await db.query('CREATE SCHEMA mon1s_shadow_probe; CREATE SEQUENCE mon1s_shadow_probe.probe; CREATE TABLE mon1s_shadow_probe.probe_rows(id integer)');
    expect(await violations()).toEqual([]);
    for(const [grant,revoke] of [
     ['GRANT USAGE ON SCHEMA mon1s_shadow_probe TO jobguard_meter_owner','REVOKE USAGE ON SCHEMA mon1s_shadow_probe FROM jobguard_meter_owner'],
     ['GRANT USAGE ON SEQUENCE mon1s_shadow_probe.probe TO jobguard_meter_owner','REVOKE USAGE ON SEQUENCE mon1s_shadow_probe.probe FROM jobguard_meter_owner'],
     ['GRANT SELECT(id) ON mon1s_shadow_probe.probe_rows TO jobguard_meter_owner','REVOKE SELECT(id) ON mon1s_shadow_probe.probe_rows FROM jobguard_meter_owner'],
    ]) {
     await db.query(grant!);
     expect(new Set((await violations()).map(row=>row.proname)).size).toBe(4);
     await db.query(revoke!);
     expect(await violations()).toEqual([]);
    }
   } finally { await db.query('ROLLBACK'); }
   expect((await db.query("SELECT has_schema_privilege('jobguard_meter_owner','app','CREATE') AS create, EXISTS(SELECT FROM pg_auth_members WHERE member='jobguard_meter_owner'::regrole) AS member")).rows).toEqual([{create:false,member:false}]);
  } finally { db.release(); }
 });
 it('direct cross-tenant source insert is unavailable to runtime, even under a valid context',async()=>{
  const a=await meterCompany(f);
  await expect(workTenant(f.runtime,a.tenantId,db=>db.query("INSERT INTO app.meter_lifecycle_scope(tenant_id,id,kind) VALUES($1,$2,'normal_company')",[randomUUID(),randomUUID()]))).rejects.toThrow('permission denied');
 });
});
