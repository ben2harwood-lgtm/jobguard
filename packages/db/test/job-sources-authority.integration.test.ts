import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {withTenant} from "../src/tenant-context.js";
import {sourcesFixture,seedSource,closeWorkFixture,type SourceFixture,workTenant} from "./job-sources-fixture.js";
describe("SV-7A source storage/read authority",()=>{
 let f:SourceFixture;beforeAll(async()=>{f=await sourcesFixture();await seedSource(f)},60000);afterAll(async()=>closeWorkFixture(f));
 it("SV7A-07 SV7A-08 read routine itself refuses session/job substitutions with an identical code",async()=>{
  const a=f.practice.auth;
  for(const [job,digest] of [[randomUUID(),a.digest],[f.practice.jobId,"a".repeat(64)]])await expect(workTenant(f.runtime,a.context.tenantId,db=>db.query("SELECT app.read_job_sources($1,$2,$3,$4)",[a.context.tenantId,job,digest,"diary"]))).rejects.toMatchObject({message:"JOB_SOURCE_FORBIDDEN",code:"42501"});
  await expect(f.repository.read({...a.context},f.practice.jobId,a.digest,"diary")).rejects.toMatchObject({code:"INVALID_TENANT_CONTEXT"});
 });
 it("SV7A-16 runtime SQL denies all writes, missing context reads nothing, ownership/RLS/grants remain narrow",async()=>{
  for(const table of ["job_diary_entry","customer_message_source","job_source_original"]){
   expect((await f.runtime.query(`SELECT * FROM app.${table}`)).rows).toEqual([]);
   for(const sql of [`INSERT INTO app.${table}(tenant_id) VALUES($1)`,`UPDATE app.${table} SET tenant_id=$1`,`DELETE FROM app.${table} WHERE tenant_id=$1`,`TRUNCATE app.${table}`])await expect(workTenant(f.runtime,f.practice.auth.context.tenantId,db=>db.query(sql,sql.startsWith("TRUNCATE")?[]:[f.practice.auth.context.tenantId]))).rejects.toMatchObject({code:"42501"});
   expect((await f.admin.query("SELECT pg_get_userbyid(relowner) owner,relrowsecurity rls,relforcerowsecurity force FROM pg_class WHERE oid=$1::regclass",[`app.${table}`])).rows).toEqual([{owner:"jobguard_migration",rls:true,force:true}]);
   for(const role of ["jobguard_shadow","jobguard_infrastructure","jobguard_shadow_emergency_access"])expect((await f.admin.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed",[role,`app.${table}`])).rows).toEqual([{allowed:false}]);
  }
 });
 it("SV7A-09 independent storage rejects not-live fixture states without originals; runtime intake stays held",async()=>{
  for(const status of ["draft","quoting","accepted","invoiced","paid","lost"]){
   const before=(await f.admin.query("SELECT count(*)::int n FROM app.job_source_original")).rows;
   await workTenant(f.admin,f.practice.auth.context.tenantId,db=>db.query("UPDATE app.job SET status=$1 WHERE id=$2",[status,f.practice.jobId]));
   await expect(seedSource(f)).rejects.toMatchObject({message:"JOB_NOT_LIVE"});
   expect((await f.admin.query("SELECT count(*)::int n FROM app.job_source_original")).rows).toEqual(before);
  }
  await workTenant(f.admin,f.practice.auth.context.tenantId,db=>db.query("UPDATE app.job SET status='live' WHERE id=$1",[f.practice.jobId]));
 });
 it("SV7A-16 cross-tenant/wrong-job/exact-tuple fixture substitutions and immutable mutations fail",async()=>{
  const source=await seedSource(f),{context}=f.practice.auth;
  const other={jobId:randomUUID()};
  // Labelled same-tenant wrong-job storage fixture; no new intake/principal policy.
  await workTenant(f.admin,context.tenantId,db=>db.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional wrong-job fixture','live')",[other.jobId,context.tenantId]));
  const names=["tenant_id","job_id","id","command_id","actor_membership_id","source_kind","entry_mode","on_site","evidence_id","object_version_id","sha256","source_received_at","notice_version","environment"];
  for(const [field,expression,code] of [["job_id",`'${other.jobId}'::uuid`,"23503"],["object_version_id","'substituted'","23503"],["tenant_id","gen_random_uuid()","42501"]]){
   const command=randomUUID();
   await expect(workTenant(f.admin,context.tenantId,async db=>{
    await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1,$2,'sv7a.invalid_fixture',$2::text,$3,'succeeded',$4,'{}',clock_timestamp())",[context.tenantId,command,source.hash,f.practice.auth.membershipId]);
    const selected=names.map(name=>name===field?expression:name==="id"?"gen_random_uuid()":name==="command_id"?`'${command}'::uuid`:name).join(",");
    await db.query(`INSERT INTO app.job_diary_entry(${names.join(",")}) SELECT ${selected} FROM app.job_diary_entry WHERE id=$1`,[source.id]);
   })).rejects.toMatchObject({code});
  }
  for(const table of ["job_diary_entry","customer_message_source","job_source_original"])for(const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table}`])await expect(workTenant(f.admin,context.tenantId,db=>db.query(sql))).rejects.toMatchObject({code:"55000"});
 });
 it("SV7A-07 revoked session cannot read existing records",async()=>{
  await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[f.practice.auth.digest]);
  await expect(withTenant(f.runtime,f.practice.auth.context,db=>db.$client.query("SELECT app.read_job_sources($1,$2,$3,'diary')",[f.practice.auth.context.tenantId,f.practice.jobId,f.practice.auth.digest]))).rejects.toMatchObject({message:"JOB_SOURCE_FORBIDDEN"});
 });
});
