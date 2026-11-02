// Reviewer/CI only: real PostgreSQL and actual runtime role. No source-backed run is claimed.
import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,expect,it } from "vitest";
import { DEMO_MEMBERSHIP_ID, MoneyTrailRepository } from "../src/index.js";
import { createLockFixture,closeLockFixture,feeBoundaryFixture,protectedSnapshot } from "./success-fee-fixtures.js";
import { brief,compareLive,loadReviewedInventory,startLp0Database } from "./lp-0-catalog.js";
let f:Awaited<ReturnType<typeof createLockFixture>>,a:Awaited<ReturnType<typeof feeBoundaryFixture>>;
const previous=process.env.JOBGUARD_ENV;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";f=await createLockFixture();a=await feeBoundaryFixture(f);},120000);
afterAll(async()=>{if(previous===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previous;if(f)await closeLockFixture(f);});
async function read(job=a.p.jobId,digest=a.auth.digest,tenant:string|null=a.p.tenantId){
 const db=await f.runtime.connect();
 try{await db.query("BEGIN");if(tenant!==null)await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
  return (await db.query("SELECT app.read_money_trail_availability($1,$2) result",[job,digest])).rows[0].result;
 }finally{await db.query("ROLLBACK");db.release();}
}
it("[MT-09/13] availability is read-only across independent repositories, never a zero-valued report",async()=>{
 const before=await protectedSnapshot(f),repo=new MoneyTrailRepository(f.runtime);
 const status=await repo.availability(a.auth.context,a.p.jobId,a.auth.digest);
 expect(status).toEqual({version:"money-trail-availability.v1",jobId:a.p.jobId,environment:"synthetic_demo",state:"dependency_bound",dependency:"accepted_money_trail_source_and_run_authority",productionEnabled:false,realExternalActions:0});
 expect(await new MoneyTrailRepository(f.runtime).availability(a.auth.context,a.p.jobId,a.auth.digest)).toEqual(status);
 expect(await read()).toEqual(status);expect(await protectedSnapshot(f)).toEqual(before);
});
it("[MT-13] missing/malformed/foreign context, foreign/unknown job and another practice session refuse without effects",async()=>{
 const other=await feeBoundaryFixture(f),before=await protectedSnapshot(f);
 for(const tenant of [null,"","malformed",randomUUID()])await expect(read(a.p.jobId,a.auth.digest,tenant)).rejects.toMatchObject({code:"42501"});
 for(const [job,digest] of [[randomUUID(),a.auth.digest],[other.p.jobId,a.auth.digest],[a.p.jobId,other.auth.digest],[a.p.jobId,'0'.repeat(64)]])await expect(read(job,digest)).rejects.toMatchObject({code:'42501'});
 expect(await protectedSnapshot(f)).toEqual(before);
});
it("[MT-13] revoked/expired persisted session and membership cannot read availability",async()=>{
 const before=await protectedSnapshot(f);
 for(const sql of ["UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1","UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1","UPDATE app.membership SET revoked_at=clock_timestamp() WHERE id=$1","UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1"]){
  const db=await f.admin.connect();try{await db.query('BEGIN');await db.query(sql,[sql.includes('membership')?DEMO_MEMBERSHIP_ID:a.auth.digest]);await db.query('SET LOCAL ROLE jobguard_runtime');await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.p.tenantId]);await expect(db.query('SELECT app.read_money_trail_availability($1,$2)',[a.p.jobId,a.auth.digest])).rejects.toMatchObject({code:'42501'});}finally{await db.query('ROLLBACK');db.release();}
 }
 expect(await protectedSnapshot(f)).toEqual(before);
});
it("[MT-12] exactly one new narrow read-only EXECUTE; no new tables, run/review routines or permission",async()=>{
 const row=(await f.admin.query(`SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig,
 has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') infrastructure,
 has_function_privilege('jobguard_shadow',oid,'EXECUTE') shadow,EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') public
 FROM pg_proc WHERE oid='app.read_money_trail_availability(uuid,text)'::regprocedure`)).rows;
 expect(row).toEqual([{owner:'jobguard_migration',prosecdef:true,proconfig:['search_path=pg_catalog'],runtime:true,infrastructure:false,shadow:false,public:false}]);
 expect((await f.admin.query("SELECT tablename FROM pg_tables WHERE schemaname='app' AND tablename LIKE 'money_trail_%'")).rows).toEqual([]);
 expect((await f.admin.query("SELECT proname FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname LIKE '%money_trail%' ORDER BY 1")).rows).toEqual([{proname:'read_money_trail_availability'}]);
 await expect(f.runtime.query('SET ROLE jobguard_migration')).rejects.toMatchObject({code:'42501'});
});
it("[MT-14] reads no hidden shadow source (connection-scoped execution and routine dependency evidence)",async()=>{
 const statements:string[]=[];const db=await f.runtime.connect();
 try{const query=async(sql:string,values:unknown[]=[])=>{statements.push(sql);return db.query(sql,values);};
  await query('BEGIN');await query("SELECT set_config('app.tenant_id',$1,true)",[a.p.tenantId]);await query('SELECT app.read_money_trail_availability($1,$2)',[a.p.jobId,a.auth.digest]);
 }finally{await db.query('ROLLBACK');db.release();}
 expect(statements).toEqual(['BEGIN',"SELECT set_config('app.tenant_id',$1,true)",'SELECT app.read_money_trail_availability($1,$2)']);
 const definitions=(await f.admin.query("SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE oid=ANY(ARRAY['app.read_money_trail_availability(uuid,text)'::regprocedure,'app.read_success_fee_v3(uuid,text)'::regprocedure])")).rows.map(r=>r.definition).join('\n');
 expect(definitions).not.toMatch(/\bapp\.(?:shadow_|receipt_line_allocation|recovery_attribution|evidence_object|audit_event)/u);
 expect(definitions).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/u);
 // No source adapter exists: noninterference of actual completed reports remains dependency-bound.
});
it("[MT-12/13] mutation of the delegated access guard is detected by the missing-context oracle",async()=>{
 const signature='app.read_money_trail_availability(uuid,text)';
 const original=(await f.admin.query('SELECT pg_get_functiondef($1::regprocedure) definition',[signature])).rows[0].definition as string;
 const guard='PERFORM app.read_success_fee_v3(p_job,p_session);';expect(original).toContain(guard);
 await expect(read(randomUUID(),'bad',null)).rejects.toMatchObject({code:'42501'});
 const db=await f.admin.connect();try{await db.query('BEGIN');await db.query(original.replace(guard,''));await db.query('SET LOCAL ROLE jobguard_runtime');
  // Deliberate unsafe mutation: status leaks without access; baseline oracle would fail.
  expect((await db.query('SELECT app.read_money_trail_availability($1,$2) result',[randomUUID(),'bad'])).rows[0].result.state).toBe('dependency_bound');
 }finally{await db.query('ROLLBACK');db.release();}
 await expect(read(randomUUID(),'bad',null)).rejects.toMatchObject({code:'42501'});
});
it("[MT-12] exact LP-0 and authority-path additions pass; PUBLIC EXECUTE and owner mutations are detected",async()=>{
 // Separate pristine cluster: business fixtures add disposable login roles that
 // must never be added to the reviewed global inventory or filtered out of it.
 const db=await startLp0Database(59100);
 try{
  const {inventory}=await loadReviewedInventory();expect(brief(await compareLive(inventory,db.admin))).toEqual([]);
  for(const sql of ['GRANT EXECUTE ON FUNCTION app.read_money_trail_availability(uuid,text) TO PUBLIC','ALTER FUNCTION app.read_money_trail_availability(uuid,text) OWNER TO postgres']){
   const client=await db.admin.connect();try{await client.query('BEGIN');expect(brief(await compareLive(inventory,client))).toEqual([]);await client.query(sql);expect((await compareLive(inventory,client)).ok).toBe(false);}finally{await client.query('ROLLBACK');client.release();}
  }
  expect(brief(await compareLive(inventory,db.admin))).toEqual([]);
 }finally{await db.stop();}
},300000);
it("[MT-04/07/14] existing customer/allocator sources use one runtime snapshot, remain explicitly incomplete and write nothing",async()=>{
 const before=await protectedSnapshot(f),statements:string[]=[];
 const observed=new Proxy(f.runtime,{get(target,key){
  if(key==='connect')return async()=>{const client=await target.connect();return new Proxy(client,{get(connection,property){
   if(property==='query')return async(sql:string,values?:unknown[])=>{statements.push(sql);return connection.query(sql,values);};
   const value=Reflect.get(connection,property);return typeof value==='function'?value.bind(connection):value;
  }});};
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const result=await new MoneyTrailRepository(observed).availableSources(a.auth.context,a.p.jobId,a.auth.digest);
 expect(result).toEqual({version:'money-trail-available-sources.v1',environment:'synthetic_demo',jobId:a.p.jobId,incomplete:true,realExternalActions:0,unavailableFamilies:['eligibility','fee_postings','fee_statements','fee_events','subscription'],sources:[]});
 expect(statements).toHaveLength(6);expect(statements[4]).toContain('available_money_trail_sources');expect(statements[4]!.match(/s.tenant_id=\$1 AND s.job_id=\$2/gu)).toHaveLength(10);
 expect(statements.join('\n')).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b|shadow_|recovery_attribution|recovery_eligibility|practice_feed/u);
 expect(await protectedSnapshot(f)).toEqual(before);
});
