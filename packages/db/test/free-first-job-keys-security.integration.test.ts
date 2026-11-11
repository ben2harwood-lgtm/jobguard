import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, keyParent, snapshot, store, type WorkFixture } from "./free-first-job-keys-fixtures.js";
// Deliberate raw SQL context attacks bypass the verified JavaScript constructor.
async function rawTenant<T>(pool:Pool,tenantId:string,work:(db:PoolClient)=>Promise<T>) {
 const db=await pool.connect();
 try {await db.query("BEGIN");await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);const result=await work(db);await db.query("COMMIT");return result;}
 catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
}
const tables=["trial_identity_snapshot","trial_identity_key_claim"];
describe("MON3P private catalog and immutability",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture();},60000);afterAll(async()=>closeWorkFixture(f));
 it("actual owners, FORCE RLS, no PUBLIC or non-owner effective privileges, private invoker helper",async()=>{
  for(const table of tables){
   expect((await f.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass",[`app.${table}`])).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true,owner:"jobguard_migration"}]);
   expect((await f.admin.query("SELECT grantee FROM pg_class, LATERAL aclexplode(relacl) WHERE oid=$1::regclass AND grantee<>relowner",[`app.${table}`])).rows).toEqual([]);
   const roles=(await f.admin.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'jobguard_%' AND rolname<>'jobguard_migration'")).rows;
   for(const {rolname} of roles) for(const privilege of ["SELECT","INSERT","UPDATE","DELETE","TRUNCATE","REFERENCES","TRIGGER"])
    expect((await f.admin.query("SELECT has_table_privilege($1,$2,$3) allowed",[rolname,`app.${table}`,privilege])).rows[0].allowed).toBe(false);
  }
  for(const signature of ["app.claim_trial_identity_keys(uuid,uuid)","app.trial_identity_claim_on_insert()"]){
   expect((await f.admin.query("SELECT prosecdef,pg_get_userbyid(proowner) owner FROM pg_proc WHERE oid=$1::regprocedure",[signature])).rows).toEqual([{prosecdef:false,owner:"jobguard_migration"}]);
   expect((await f.admin.query("SELECT grantee FROM pg_proc, LATERAL aclexplode(proacl) WHERE oid=$1::regprocedure AND grantee<>proowner",[signature])).rows).toEqual([]);
   expect((await f.admin.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'jobguard_%' AND rolname<>'jobguard_migration' AND has_function_privilege(oid,$1::regprocedure,'EXECUTE')",[signature])).rows).toEqual([]);
  }
 });
 it("runtime denied with absent, malformed or forged context; migration RLS fails closed",async()=>{
  const s=snapshot(await keyParent(f));await store(f,s);
  for(const context of ["","malformed",s.tenantId]) for(const table of tables)
   await expect(rawTenant(f.runtime,context,db=>db.query(`SELECT * FROM app.${table}`))).rejects.toMatchObject({code:"42501"});
  for(const table of tables) for(const sql of [`INSERT INTO app.${table} DEFAULT VALUES`,`UPDATE app.${table} SET tenant_id=tenant_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table}`])
   await expect(rawTenant(f.runtime,s.tenantId,db=>db.query(sql))).rejects.toMatchObject({code:"42501"});
  await expect(rawTenant(f.runtime,s.tenantId,db=>db.query("SELECT app.claim_trial_identity_keys($1,$2)",[s.tenantId,s.id]))).rejects.toMatchObject({code:"42501"});
  for(const context of ["","malformed"]) await expect(rawTenant(f.admin,context,async db=>{await db.query("SET LOCAL ROLE jobguard_migration");await db.query("SELECT app.claim_trial_identity_keys($1,$2)",[s.tenantId,s.id]);})).rejects.toMatchObject({code:"42501"});
  expect(await rawTenant(f.admin,"",async db=>{await db.query("SET LOCAL ROLE jobguard_migration");return (await db.query("SELECT * FROM app.trial_identity_snapshot")).rows;})).toEqual([]);
  const foreign=await keyParent(f);
  for(const table of tables) expect(await rawTenant(f.admin,foreign.tenantId,async db=>{await db.query("SET LOCAL ROLE jobguard_migration");return (await db.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`,[s.tenantId])).rows;})).toEqual([]);
 });
 it("owner cannot update/delete/truncate either table; conflicts surface no key values",async()=>{
  const s=snapshot(await keyParent(f));await store(f,s);
  for(const table of tables) for(const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table} CASCADE`])
   await expect(f.admin.query(sql)).rejects.toMatchObject({code:"55000"});
  try{await store(f,{...snapshot(await keyParent(f)),phone:s.phone,fingerprint:s.fingerprint});throw new Error("expected collision");}
  catch(error){const e=error as {message:string;detail?:string};expect(e.message).toBe("TRIAL_IDENTITY_CONFLICT");expect(e.detail??"").toBe("");}
 });
});
