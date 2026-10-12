import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLockFixture, closeLockFixture, seedAccount, prepareLock, asFixtureTenant, type LockFixture } from "./final-account-lock.integration.test.js";

describe("SV-4 DW6 / SB-26: SV-2 deferred locked-job reveal half",()=>{
 let f:LockFixture;
 beforeAll(async()=>{f=await createLockFixture()},60000);afterAll(async()=>closeLockFixture(f));
 it("a genuinely locked job reveals only revealed rows for that tenant and job; unlocked and cross-tenant jobs yield none",async()=>{
  const a=await seedAccount(f.admin),b=await seedAccount(f.admin,a.tenantId),unlocked=await seedAccount(f.admin,a.tenantId),other=await seedAccount(f.admin);
  for(const job of [a,b,other]){const repo=await prepareLock(f,job);await repo.lock(job.context,job.input);}
  const ids=new Map<string,string[]>();
  for(const account of [a,b,unlocked,other])for(const state of ['revealed','held_for_final_check','candidate','reconciled']){
   const id=randomUUID();await asFixtureTenant(f.shadow,account.tenantId,db=>db.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
    VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic-sv4.v1',clock_timestamp(),'Fictional reveal proof','low',$5)`,[account.tenantId,account.jobId,id,randomUUID(),state]));
   if(state==='revealed')ids.set(account.jobId,[id]);
  }
  const reveal=(tenantId:string,jobId:string)=>asFixtureTenant(f.runtime,tenantId,db=>db.query("SELECT id,state,tenant_id,job_id FROM app.reveal_shadow_signals($1,$2) ORDER BY id",[tenantId,jobId]));
  expect((await reveal(a.tenantId,a.jobId)).rows).toEqual([{id:ids.get(a.jobId)![0],state:'revealed',tenant_id:a.tenantId,job_id:a.jobId}]);
  expect((await reveal(a.tenantId,b.jobId)).rows).toEqual([{id:ids.get(b.jobId)![0],state:'revealed',tenant_id:b.tenantId,job_id:b.jobId}]);
  expect((await reveal(a.tenantId,unlocked.jobId)).rows).toEqual([]);
  expect((await reveal(a.tenantId,other.jobId)).rows).toEqual([]);
  await expect(asFixtureTenant(f.runtime,a.tenantId,db=>db.query("SELECT * FROM app.reveal_shadow_signals($1,$2)",[other.tenantId,other.jobId]))).rejects.toThrow('tenant context mismatch');
 });
 it("the reveal function's EXECUTE grantees stay migration owner and runtime only",async()=>{
  const grants=(await f.admin.query(`SELECT CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,a.privilege_type
   FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid='app.reveal_shadow_signals(uuid,uuid)'::regprocedure ORDER BY grantee,a.privilege_type`)).rows;
  expect(grants).toEqual([{grantee:'jobguard_migration',privilege_type:'EXECUTE'},{grantee:'jobguard_runtime',privilege_type:'EXECUTE'}]);
 });
});
