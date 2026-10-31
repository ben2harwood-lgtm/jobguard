// Reviewer/CI: actual PostgreSQL runtime roles, not executed in the no-socket sandbox.
import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,expect,it } from "vitest";
import { DEMO_MEMBERSHIP_ID,SuccessFeeRepository } from "../src/index.js";
import { createLockFixture,closeLockFixture,feeBoundaryFixture,protectedSnapshot } from "./success-fee-fixtures.js";
let f:Awaited<ReturnType<typeof createLockFixture>>,a:Awaited<ReturnType<typeof feeBoundaryFixture>>;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";f=await createLockFixture();a=await feeBoundaryFixture(f);},120000);
afterAll(async()=>{if(f)await closeLockFixture(f);});
async function raw(job=a.p.jobId,digest=a.auth.digest,tenant:string|null=a.p.tenantId,write=false){
 const db=await f.runtime.connect();
 try{await db.query("BEGIN");if(tenant!==null)await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
  return (await db.query(write?"SELECT app.write_success_fee_v3($1,$2,$3::jsonb,$4::jsonb) result":"SELECT app.read_success_fee_v3($1,$2) result",write?[job,digest,a.command,{approved:true,qualifies:true}]:[job,digest])).rows[0].result;
 }finally{await db.query("ROLLBACK");db.release();}
}
it("SF-14/15 boundary status persists across repositories; repeated commands never acquire economic identity",async()=>{
 const before=await protectedSnapshot(f),repo=new SuccessFeeRepository(f.runtime);
 const status=await repo.view(a.auth.context,a.p.jobId,a.auth.digest);
 expect(status).toEqual({version:"success-fee-availability.v1",jobId:a.p.jobId,environment:"synthetic_demo",state:"dependency_bound",dependency:"accepted_attribution_source_adapter",productionEnabled:false,realExternalActions:0});
 expect(await new SuccessFeeRepository(f.runtime).view(a.auth.context,a.p.jobId,a.auth.digest)).toEqual(status);
 for(let n=0;n<2;n++)await expect(repo.command(a.auth.context,a.p.jobId,a.auth.digest,a.command)).rejects.toThrow("SUCCESS_FEE_DEPENDENCY_BOUND");
 expect(await protectedSnapshot(f)).toEqual(before);
});
it("SF-15 direct public calls reject missing/malformed/foreign tenant and unknown/unowned job or session",async()=>{
 const before=await protectedSnapshot(f);
 for(const tenant of [null,"", "malformed",randomUUID()])for(const write of [false,true])await expect(raw(a.p.jobId,a.auth.digest,tenant,write)).rejects.toMatchObject({code:"42501"});
 for(const write of [false,true]){
  await expect(raw(randomUUID(),a.auth.digest,a.p.tenantId,write)).rejects.toMatchObject({code:"42501"});
  await expect(raw(a.p.jobId,"0".repeat(64),a.p.tenantId,write)).rejects.toMatchObject({code:"42501"});
 }
 expect(await protectedSnapshot(f)).toEqual(before);
});
it("SF-15 ended session and revoked/expired owner cannot read or replay via SQL",async()=>{
 const before=await protectedSnapshot(f);
 for(const sql of ["UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1","UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1","UPDATE app.membership SET revoked_at=clock_timestamp() WHERE id=$1","UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1"]){
  const db=await f.admin.connect();
  try{await db.query("BEGIN");await db.query(sql,[sql.includes('membership')?DEMO_MEMBERSHIP_ID:a.auth.digest]);
   // SET LOCAL ROLE corroborates the actual role, within the rolled-back mutation.
   await db.query("SET LOCAL ROLE jobguard_runtime");await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.p.tenantId]);
   for(const write of [false,true]){
    await db.query("SAVEPOINT refusal");
    await expect(db.query(write?"SELECT app.write_success_fee_v3($1,$2,$3,NULL)":"SELECT app.read_success_fee_v3($1,$2)",write?[a.p.jobId,a.auth.digest,a.command]:[a.p.jobId,a.auth.digest])).rejects.toMatchObject({code:"42501"});
    await db.query("ROLLBACK TO SAVEPOINT refusal");
   }
  }finally{await db.query("ROLLBACK");db.release();}
 }
 expect(await protectedSnapshot(f)).toEqual(before);
});
it("SF-17 catalogue retains exactly two narrow public EXECUTE grants and six private tables",async()=>{
 const rows=(await f.admin.query(`SELECT p.proname,pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
 has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
 has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,
 has_function_privilege('jobguard_shadow',p.oid,'EXECUTE') shadow,
 EXISTS(SELECT 1 FROM aclexplode(p.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') public
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='app' AND p.proname IN('read_success_fee_v3','write_success_fee_v3') ORDER BY 1`)).rows;
 expect(rows).toEqual(['read_success_fee_v3','write_success_fee_v3'].map(proname=>({proname,owner:'jobguard_migration',prosecdef:true,proconfig:['search_path=pg_catalog'],runtime:true,infrastructure:false,shadow:false,public:false})));
 expect((await f.admin.query("SELECT tablename FROM pg_tables WHERE schemaname='app' AND tablename LIKE 'success_fee_%' ORDER BY tablename")).rows).toEqual([{"tablename": "success_fee_command"}, {"tablename": "success_fee_derivation"}, {"tablename": "success_fee_journal"}, {"tablename": "success_fee_journal_line"}, {"tablename": "success_fee_review"}, {"tablename": "success_fee_source"}]);
 await expect(f.runtime.query("SET ROLE jobguard_migration")).rejects.toMatchObject({code:"42501"});
});
it("SF-21 availability reads no hidden source, and pre-lock write refuses before source reads",async()=>{
 const defs=(await f.admin.query("SELECT pg_get_functiondef('app.read_success_fee_v3(uuid,text)'::regprocedure) definition")).rows[0].definition as string;
 expect(defs).not.toMatch(/\bapp\.(?:shadow_|recovery_attribution|receipt_line_allocation|evidence_object|audit_event)/u);
 const before=await protectedSnapshot(f);await expect(raw(a.p.jobId,a.auth.digest,a.p.tenantId,true)).rejects.toThrow("SUCCESS_FEE_DEPENDENCY_BOUND");expect(await protectedSnapshot(f)).toEqual(before);
});
it("SF-14/15 wrong track, mode and policy are refused (rolled-back administrative defects)",async()=>{
 const before=await protectedSnapshot(f);
 const defects=[
  "ALTER TABLE app.job DISABLE TRIGGER job_fixed_baseline; UPDATE app.job SET fee_policy_version='reference_fee_policy_v1',recovery_cap_pence=1 WHERE id=$1",
  "ALTER TABLE app.job_commercial_track DISABLE TRIGGER job_commercial_track_immutable; UPDATE app.job_commercial_track SET job_track='contractor' WHERE job_id=$1",
  "ALTER TABLE app.job_commercial_track DISABLE TRIGGER job_commercial_track_immutable; UPDATE app.job_commercial_track SET environment='pilot_no_charge' WHERE job_id=$1",
 ];
 for(const defect of defects){
  const db=await f.admin.connect();
  try{await db.query("BEGIN");
   // Execute each statement separately; node-postgres extended protocol rejects batches with parameters.
   for(const statement of defect.split(';').map(s=>s.trim()))await db.query(statement,statement.includes('$1')?[a.p.jobId]:[]);
   await db.query("SET LOCAL ROLE jobguard_runtime");await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.p.tenantId]);
   await expect(db.query("SELECT app.read_success_fee_v3($1,$2)",[a.p.jobId,a.auth.digest])).rejects.toMatchObject({code:'42501'});
  }finally{await db.query("ROLLBACK");db.release();}
 }
 expect(await protectedSnapshot(f)).toEqual(before);
});
it("SQL guard mutations are detected by the boundary oracle (reviewer-executed)",async()=>{
 const sig='app.read_success_fee_v3(uuid,text)';
 const original=(await f.admin.query("SELECT pg_get_functiondef($1::regprocedure) definition",[sig])).rows[0].definition as string;
 // Negating each positive-path guard must break the successful status assertion.
 // Writer authority is separately killed by omitting its checked-reader call below.
 const mutants=[
  ["current_database()<>'jobguard_synthetic_demo'","current_database()='jobguard_synthetic_demo'"],
  ["pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') IS NOT TRUE","pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') IS TRUE"],
  ["actor.membership_id IS NULL","actor.membership_id IS NOT NULL"],
  ["m.role='owner'","m.role='viewer'"],
  ["m.revoked_at IS NULL","m.revoked_at IS NOT NULL"],
  ["m.expires_at IS NULL OR m.expires_at>clock_timestamp()","m.expires_at IS NOT NULL AND m.expires_at<=clock_timestamp()"],
  ["j.practice_session_digest=p_session","j.practice_session_digest<>p_session"],
  ["j.fee_policy_version='reference_fee_policy_v3'","j.fee_policy_version<>'reference_fee_policy_v3'"],
  ["c.job_track='small_builder'","c.job_track='contractor'"],
  ["c.environment='synthetic_demo'","c.environment='pilot_no_charge'"],
 ];
 expect(await raw()).toMatchObject({state:'dependency_bound'});
 for(const [from,to] of mutants){
  expect(original).toContain(from);const db=await f.admin.connect();
  try{await db.query('BEGIN');await db.query(original.replace(from!,to!));await db.query('SET LOCAL ROLE jobguard_runtime');await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.p.tenantId]);
   await expect(db.query('SELECT app.read_success_fee_v3($1,$2)',[a.p.jobId,a.auth.digest]),from).rejects.toMatchObject({code:'42501'});
  }finally{await db.query('ROLLBACK');db.release();}
 }
 const writer=(await f.admin.query("SELECT pg_get_functiondef('app.write_success_fee_v3(uuid,text,jsonb,jsonb)'::regprocedure) definition")).rows[0].definition as string;
 expect(writer).toContain('PERFORM app.read_success_fee_v3(p_job,p_session);');
 const db=await f.admin.connect();
 try{await db.query('BEGIN');await db.query(writer.replace('PERFORM app.read_success_fee_v3(p_job,p_session);',''));await db.query('SET LOCAL ROLE jobguard_runtime');
  // Mutant improperly reveals dependency status before missing access; the baseline oracle above expects 42501.
  await expect(db.query('SELECT app.write_success_fee_v3($1,$2,$3,NULL)',[randomUUID(),'bad',a.command])).rejects.toMatchObject({code:'0A000',message:'SUCCESS_FEE_DEPENDENCY_BOUND'});
 }finally{await db.query('ROLLBACK');db.release();}
 expect(await raw()).toMatchObject({state:'dependency_bound'});
});
it("post-live billing availability also permits invoiced and paid jobs with the same v3 baseline",async()=>{
 for(const status of ['invoiced','paid']){
  const db=await f.admin.connect();
  try{await db.query('BEGIN');await db.query('UPDATE app.job SET status=$1 WHERE tenant_id=$2 AND id=$3',[status,a.p.tenantId,a.p.jobId]);await db.query('SET LOCAL ROLE jobguard_runtime');await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.p.tenantId]);
   expect((await db.query('SELECT app.read_success_fee_v3($1,$2) result',[a.p.jobId,a.auth.digest])).rows[0].result).toMatchObject({state:'dependency_bound'});
  }finally{await db.query('ROLLBACK');db.release();}
 }
});

it("the source fence is migration-owned and cannot be called by runtime or worker roles",async()=>{
 const sig="app.lock_success_fee_sources()";
 const row=(await f.admin.query(`SELECT pg_get_userbyid(p.proowner) owner,p.prosecdef,p.proconfig,
  ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
   FROM aclexplode(p.proacl) a WHERE a.privilege_type='EXECUTE' ORDER BY 1)::text[] grantees
  FROM pg_proc p WHERE p.oid=$1::regprocedure`,[sig])).rows[0];
 expect(row).toEqual({owner:"jobguard_migration",prosecdef:true,proconfig:["search_path=pg_catalog, app"],grantees:["jobguard_migration"]});
 for(const role of ["jobguard_runtime","jobguard_infrastructure","jobguard_shadow","jobguard_shadow_emergency_access"]){
  expect((await f.admin.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,sig])).rows[0].allowed).toBe(false);
 }
 await expect(f.runtime.query("SELECT app.lock_success_fee_sources()")).rejects.toMatchObject({code:"42501"});
});
