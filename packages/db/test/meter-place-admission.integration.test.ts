import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { closeWorkFixture,createWorkFixture,workTenant,type WorkFixture } from "./job-work-state-fixtures.js";

describe("MON1-A private held boundary, CI PostgreSQL only",()=>{
 let f:WorkFixture;
 beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("M1A-09 runtime cannot execute or assume owner; fixed search path and no public grant",async()=>{
  const signature="app.mon1_admit_place(uuid,uuid,text,uuid)";
  const row=(await f.admin.query(`SELECT prosecdef,proconfig,pg_get_userbyid(proowner) owner,
   has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,
   has_function_privilege('jobguard_meter',oid,'EXECUTE') meter
   FROM pg_proc WHERE oid=$1::regprocedure`,[signature])).rows[0];
  expect(row).toEqual({prosecdef:false,proconfig:["search_path=pg_catalog"],owner:"jobguard_migration",runtime:false,meter:false});
  expect((await f.admin.query(`SELECT count(*)::int n FROM pg_proc p,LATERAL aclexplode(p.proacl) a
   WHERE p.oid=$1::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'`,[signature])).rows[0].n).toBe(0);
  await expect(workTenant(f.runtime,randomUUID(),db=>db.query("SELECT app.mon1_admit_place($1,$2,$3,$4)",[randomUUID(),randomUUID(),"switch_live",randomUUID()]))).rejects.toThrow("permission denied");
  await expect(f.runtime.query("SET ROLE jobguard_migration")).rejects.toThrow("permission denied");
 });
 it("M1A-07/08 invalid tenant or missing tenant-first lock refuses with no writes",async()=>{
  const t=randomUUID(),j=randomUUID(),s=randomUUID();
  await expect(workTenant(f.admin,t,async db=>{await db.query("SET LOCAL ROLE jobguard_migration");return db.query("SELECT app.mon1_admit_place($1,$2,'switch_live',$3)",[t,j,s]);})).rejects.toThrow("METER_PLACE_LOCK_ORDER_REQUIRED");
  await expect(workTenant(f.admin,t,async db=>{await db.query("SET LOCAL ROLE jobguard_migration");return db.query("SELECT app.mon1_admit_place($1,$2,'switch_live',$3)",[randomUUID(),j,s]);})).rejects.toThrow("METER_PLACE_FORBIDDEN");
 });
 it("M1A-06/07/08 checked-looking references and replay cannot enable admission while source handoff is held",async()=>{
  const t=randomUUID(),j=randomUUID(),s=randomUUID();
  for(let replay=0;replay<2;replay++)await expect(workTenant(f.admin,t,async db=>{
   await db.query("SET LOCAL ROLE jobguard_migration");
   await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))",[t]);
   return db.query("SELECT app.mon1_admit_place($1,$2,'day31',$3)",[t,j,s]);
  })).rejects.toThrow("METER_PLACE_SOURCE_HANDOFF_HELD");
 });
});
