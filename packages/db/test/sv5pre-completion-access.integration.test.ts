import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLockFixture, closeLockFixture, seedAccount, asFixtureTenant } from "./sv5pre-fixtures.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
const hidden=["final_check_manifest","final_check_manifest_source","shadow_final_check_source_attempt","shadow_final_check_run_binding","shadow_final_check_reveal_proof"];
describe("SV5PRE completion access",()=>{
 let f:Awaited<ReturnType<typeof createLockFixture>>;
 beforeAll(async()=>{f=await createLockFixture();},60000);afterAll(async()=>{if(f)await closeLockFixture(f)});
 it("PRE-Q5-11 completion introduces no runtime shadow access or callable shadow helper",async()=>{
  for(const name of hidden)await expect(f.runtime.query(`SELECT * FROM app.${name}`)).rejects.toMatchObject({code:"42501"});
  const rows=(await f.admin.query("SELECT c.relname,has_table_privilege('jobguard_runtime',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') dml,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1)",[hidden.concat("shadow_final_check_completion")])).rows;
  expect(rows).toHaveLength(6);for(const row of rows)expect(row).toMatchObject({dml:false,relrowsecurity:true,relforcerowsecurity:true});
  await expect(f.runtime.query("SELECT * FROM app.shadow_final_check_completion")).rejects.toMatchObject({code:"42501"});
  const callable=(await f.admin.query("SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE '%final_check%' AND p.prorettype<>'trigger'::regtype AND has_function_privilege('jobguard_shadow',p.oid,'EXECUTE')")).rows;expect(callable).toEqual([]);
 });
 it("PRE-Q5-10 completion proof is append only under actual logins",async()=>{
  for(const pool of [f.runtime,f.shadow])for(const table of hidden.concat("shadow_final_check_completion"))for(const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table}`])await expect(pool.query(sql)).rejects.toMatchObject({code:"42501"});
 });
 it("PRE-Q5-15 pre-lock projections ignore completion proof",async()=>{
  const a=await seedAccount(f.admin),repo=new FinalAccountLockRepository(f.runtime),before=await repo.read(a.context,a.jobId);
  await expect(f.runtime.query("SELECT * FROM app.final_check_manifest")).rejects.toMatchObject({code:'42501'});
  const after=await repo.read(a.context,a.jobId);expect(after).toEqual(before);expect(after.lock).toBeNull();expect(after.check).toBeNull();
 });

 it("PRE-Q5-10 generated source and certificate facts refuse independent owner-login writes",async()=>{
  const a=await seedAccount(f.admin);
  for(const table of ['final_check_manifest_source','shadow_final_check_completion'])await expect(asFixtureTenant(f.owner,a.tenantId,db=>db.query(`INSERT INTO app.${table}(tenant_id,job_id) VALUES($1,$2)`,[a.tenantId,a.jobId]))).rejects.toMatchObject({code:'42501'});
 });

});
