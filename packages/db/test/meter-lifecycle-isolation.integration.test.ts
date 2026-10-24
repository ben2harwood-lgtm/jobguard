import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { closeWorkFixture,createWorkFixture,workTenant,type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
describe('MON1-S local privilege boundary, CI PostgreSQL only',()=>{
 let f:WorkFixture;
 beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
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
  for(const signature of signatures)expect((await f.admin.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,has_function_privilege('jobguard_runtime',oid,'EXECUTE') executable FROM pg_proc WHERE oid=$1::regprocedure",[signature])).rows[0]).toEqual({owner:'jobguard_migration',prosecdef:true,proconfig:['search_path=pg_catalog'],executable:true});
  expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime','app.mon1_lifecycle_actor(uuid,text,boolean)','EXECUTE') yes")).rows[0].yes).toBe(false);
 });
 it('direct cross-tenant source insert is unavailable to runtime, even under a valid context',async()=>{
  const a=await meterCompany(f);
  await expect(workTenant(f.runtime,a.tenantId,db=>db.query("INSERT INTO app.meter_lifecycle_scope(tenant_id,id,kind) VALUES($1,$2,'normal_company')",[randomUUID(),randomUUID()]))).rejects.toThrow('permission denied');
 });
});
