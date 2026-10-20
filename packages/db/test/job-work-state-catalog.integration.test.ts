import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { createWorkFixture,closeWorkFixture,seedWorkJob,workTenant,type WorkFixture } from "./job-work-state-fixtures.js";
const tables=["job_link","job_photo_purpose","job_site_source_receipt","job_work_state_event"];
describe("CH-4 actual catalog and privilege boundary",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A21 exact owners FORCE RLS and SELECT-only runtime rights",async()=>{
  const rows=(await f.admin.query(`SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1) ORDER BY c.relname`,[tables])).rows;
  expect(rows).toEqual(tables.map(relname=>({relname,owner:"jobguard_migration",relrowsecurity:true,relforcerowsecurity:true})));
  for(const table of tables){
   const rights=(await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT') read,has_table_privilege('jobguard_runtime',$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') write",[`app.${table}`])).rows[0];expect(rights).toEqual({read:true,write:false});
   for(const role of ["jobguard_infrastructure","jobguard_shadow","jobguard_shadow_emergency_access"])expect((await f.admin.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role,`app.${table}`])).rows[0].allowed).toBe(false);
  }
  const publicAcl=(await f.admin.query("SELECT p.proname,p.prosecdef,pg_get_userbyid(p.proowner) owner,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE 'ch4_%'")).rows;
  expect(publicAcl.length).toBeGreaterThan(0);for(const row of publicAcl){expect(row.owner).toBe("jobguard_migration");expect(row.proconfig).toContain("search_path=pg_catalog");}
  const held=(await f.admin.query("SELECT proname FROM pg_proc WHERE proname IN('ch4_admit_snagging_photo')")).rows;expect(held).toEqual([]);
  for(const name of ["ch4_record_work_state","ch4_link_post_lock_job"]){
   const signatures=(await f.admin.query("SELECT p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname=$1",[name])).rows;
   expect(signatures).toEqual([{signature:`app.${name}(uuid,uuid,text,jsonb)`}]);
   expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') allowed",[signatures[0].signature])).rows[0].allowed).toBe(true);
   for(const role of ["jobguard_infrastructure","jobguard_shadow","jobguard_shadow_emergency_access"])expect((await f.admin.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,signatures[0].signature])).rows[0].allowed).toBe(false);
  }
 });
 it("private legacy ownership helper is read-only with no execute grants; live guard retains invoker security",async()=>{
  const helper=(await f.admin.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,provolatile,proconfig FROM pg_proc WHERE oid='app.ch4_legacy_command_owned(uuid,uuid)'::regprocedure")).rows[0];
  expect(helper).toEqual({owner:"jobguard_migration",prosecdef:false,provolatile:"s",proconfig:["search_path=pg_catalog"]});
  for(const role of ["jobguard_runtime","jobguard_infrastructure","jobguard_shadow","jobguard_shadow_emergency_access"])expect((await f.admin.query("SELECT has_function_privilege($1,'app.ch4_legacy_command_owned(uuid,uuid)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
  const guard=(await f.admin.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig FROM pg_proc WHERE oid='app.guard_watchdog_input()'::regprocedure")).rows[0];
  expect(guard).toEqual({owner:"jobguard_migration",prosecdef:false,proconfig:["search_path=pg_catalog, app"]});
 });
 it("CH4-A20 missing malformed context and cross-tenant reads fail closed; private helpers are not callable",async()=>{
  const a=await seedWorkJob(f);
  expect((await f.runtime.query("SELECT * FROM app.job_work_state_event")).rows).toEqual([]);
  await expect(workTenant(f.runtime,"invalid",db=>db.query("SELECT * FROM app.job_work_state_event"))).rejects.toThrow();
  for(const table of tables)await expect(workTenant(f.runtime,a.tenantId,db=>db.query(`TRUNCATE app.${table}`))).rejects.toThrow();
  const functions=(await f.admin.query("SELECT p.oid::regprocedure::text signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE 'ch4_%' AND p.proname NOT IN('ch4_read_work_facts','ch4_record_work_state','ch4_link_post_lock_job')")).rows;
  for(const fn of functions)expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') allowed",[fn.signature])).rows[0].allowed).toBe(false);
 });
});
