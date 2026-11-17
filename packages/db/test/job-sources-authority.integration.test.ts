import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {withTenant} from "../src/tenant-context.js";
import {issuePracticeSession,authenticatePracticeSession} from "../src/practice-session.js";
import {rolledBack} from "./upgrade-proof-utils.js";
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
 it("SV7A-16 read routine has the exact documented authority; helpers and held writers are not callable",async()=>{
  const routines=(await f.admin.query(`SELECT p.proname,p.prosecdef,pg_get_userbyid(p.proowner) owner,p.proconfig,
   has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') executable,
   EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute
   FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname IN('read_job_sources','job_source_insert_guard','job_source_original_binding') ORDER BY p.proname`)).rows;
  expect(routines).toEqual([
   {proname:'job_source_insert_guard',prosecdef:true,owner:'jobguard_migration',proconfig:['search_path=pg_catalog'],executable:false,public_execute:false},
   {proname:'job_source_original_binding',prosecdef:true,owner:'jobguard_migration',proconfig:['search_path=pg_catalog'],executable:false,public_execute:false},
   {proname:'read_job_sources',prosecdef:true,owner:'jobguard_migration',proconfig:['search_path=pg_catalog'],executable:true,public_execute:false}
  ]);
  expect((await f.admin.query("SELECT pg_get_function_identity_arguments('app.read_job_sources(uuid,uuid,text,text)'::regprocedure) args")).rows[0].args).toBe('t uuid, j uuid, digest text, source text');
  expect((await f.admin.query("SELECT proname FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname IN('record_job_diary_entry','record_customer_message_source')")).rows).toEqual([]);
 });
 it("SV7A-16 cross-tenant/wrong-job/exact-tuple fixture substitutions and immutable mutations fail",async()=>{
  const source=await seedSource(f),{context}=f.practice.auth;
  const other={jobId:randomUUID()};
  // Labelled same-tenant wrong-job storage fixture; the live-job trigger binds its track once.
  await workTenant(f.admin,context.tenantId,db=>db.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional wrong-job fixture','live')",[other.jobId,context.tenantId]));
  const names=["tenant_id","job_id","id","command_id","actor_membership_id","source_kind","entry_mode","on_site","evidence_id","object_version_id","sha256","source_received_at","notice_version","environment"];
  for(const [field,expression,code] of [["job_id",`'${other.jobId}'::uuid`,"23503"],["object_version_id","'substituted'","23503"],["tenant_id","gen_random_uuid()","42501"]]){
   const command=randomUUID();
   await expect(workTenant(f.admin,context.tenantId,async db=>{
    // Cast every parameter use so receipt setup reaches the intended substitution constraint.
    await db.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1::uuid,$2::uuid,'sv7a.invalid_fixture',$2::text,$3::text,'succeeded',$4::uuid,'{}',clock_timestamp())",[context.tenantId,command,source.hash,f.practice.auth.membershipId]);
    const selected=names.map(name=>name===field?expression:name==="id"?"gen_random_uuid()":name==="command_id"?`'${command}'::uuid`:name).join(",");
    await db.query(`INSERT INTO app.job_diary_entry(${names.join(",")}) SELECT ${selected} FROM app.job_diary_entry WHERE id=$1`,[source.id]);
   })).rejects.toMatchObject({code});
  }
  for(const table of ["job_diary_entry","customer_message_source","job_source_original"]){
   // Include both referencing tables so PostgreSQL reaches the original's BEFORE TRUNCATE guard (0164).
   const truncate=table==="job_source_original"?"TRUNCATE app.job_source_original, app.job_diary_entry, app.customer_message_source":`TRUNCATE app.${table}`;
   for(const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`,`DELETE FROM app.${table}`,truncate])await expect(rolledBack(f.admin,async db=>{
    await db.query("SELECT set_config('app.tenant_id',$1,true)",[context.tenantId]);
    await db.query("SET LOCAL ROLE jobguard_migration");
    await db.query(sql);
   })).rejects.toMatchObject({code:"55000"});
  }
 });
 it("SV7A-07 revoked session cannot read existing records",async()=>{
  await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[f.practice.auth.digest]);
  await expect(withTenant(f.runtime,f.practice.auth.context,db=>db.$client.query("SELECT app.read_job_sources($1,$2,$3,'diary')",[f.practice.auth.context.tenantId,f.practice.jobId,f.practice.auth.digest]))).rejects.toMatchObject({message:"JOB_SOURCE_FORBIDDEN"});
 });
 it("SV7A-07 persisted expired sessions and inactive actors fail the SQL read boundary",async()=>{
  const {auth,jobId}=f.practice;
  const sessionId=await issuePracticeSession(f.runtime),other=await authenticatePracticeSession(f.runtime,sessionId);
  await expect(f.repository.read(other.context,jobId,other.digest,"diary")).rejects.toMatchObject({code:"JOB_SOURCE_FORBIDDEN"});
  const targetJobId=(await f.admin.query("SELECT id FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND status='live' AND practice_scenario='home'",[other.context.tenantId,other.digest])).rows[0].id as string;
  expect(await f.repository.read(other.context,targetJobId,other.digest,"diary")).toMatchObject({entries:[]});
  for(const mutation of [
   "UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1",
   "UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",
   "UPDATE app.membership SET revoked_at=clock_timestamp() WHERE id=$1",
   "UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1"
  ])await rolledBack(f.admin,async db=>{
   await db.query("SELECT set_config('app.tenant_id',$1,true)",[auth.context.tenantId]);
   await db.query(mutation,[mutation.includes('control_plane')?other.digest:auth.membershipId]);
   await db.query("SET LOCAL ROLE jobguard_runtime");
   await expect(db.query("SELECT app.read_job_sources($1,$2,$3,'diary')",[auth.context.tenantId,targetJobId,other.digest])).rejects.toMatchObject({message:"JOB_SOURCE_FORBIDDEN",code:"42501"});
  });
 });
});
