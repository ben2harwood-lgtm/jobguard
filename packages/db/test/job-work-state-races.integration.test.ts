import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { createWorkFixture,closeWorkFixture,seedWorkJob,insertPhoto,workEvents,fixtureLifecycle,type WorkFixture } from "./job-work-state-fixtures.js";
describe("CH-4 immutable source concurrency",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A03 concurrent first evidence has one deterministic projected winner",async()=>{
  const a=await seedWorkJob(f);await Promise.all([insertPhoto(f,a,"2026-10-13T10:00:00.000002Z"),insertPhoto(f,a,"2026-10-13T10:00:00.000001Z")]);
  const events=await workEvents(f,a);expect(events).toHaveLength(2);expect(new Set(events.map(e=>e.sequence)).size).toBe(2);
  const first=[...events].sort((x,y)=>x.fact_at.localeCompare(y.fact_at)||x.id.localeCompare(y.id))[0];expect(first.fact_at).toBe("2026-10-13T10:00:00.000001Z");
 });
 it("CH4-A06 source activity cancels an outstanding marker without editing it",async()=>{
  const a=await seedWorkJob(f),marker=await fixtureLifecycle(f,a,"finished_on_site"),before=(await workEvents(f,a))[0];const photoAt=new Date(Date.parse(before.fact_at)+60000).toISOString();await insertPhoto(f,a,photoAt);
  const rows=await workEvents(f,a);expect(rows[0]).toEqual(before);expect(rows.map(r=>r.kind)).toEqual(["finished_on_site","finished_cancelled","first_site_evidence"]);
  expect((await f.admin.query("SELECT predecessor_id FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2 AND kind='finished_cancelled'",[a.tenantId,a.jobId])).rows[0].predecessor_id).toBe(marker);
 });
});

async function awaitBlocked(f:WorkFixture,tenantId:string){
 const deadline=Date.now()+10000;while(Date.now()<deadline){
  if((await f.admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%command_receipt%' AND query LIKE '%'||$1||'%'",[tenantId])).rows.length)return;
  // pg uses bind parameters in the activity text; the source insert identifies this test's wait.
  if((await f.admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%INSERT INTO app.command_receipt%'" )).rows.length)return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }throw new Error("source did not wait on the job lock");
}
describe("CH-4 source wait controls",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A16 revocation while waiting refuses the command and rolls back every new effect",async()=>{
  const {VariationRepository}=await import("../src/variation-repository.js"),{randomUUID}=await import("node:crypto"),a=await seedWorkJob(f),locker=await f.admin.connect();
  await locker.query("BEGIN");await locker.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);await locker.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[a.tenantId,a.jobId]);
  const commandId=randomUUID(),pending=new VariationRepository(f.runtime).logBuilderExtra(a.context,{version:"log-builder-extra.v1",actorMembershipId:a.actorId,deviceId:null,deviceCapturedAt:null,price:null,proposal:{version:"variation-proposal.v1",id:commandId,jobId:a.jobId,scopeItemId:randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text",captureText:"Fictional waiting extra",description:"Fictional waiting extra",suggestion:null}});
  const result=pending.then(()=>null,error=>error);
  try{await awaitBlocked(f,a.tenantId);await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.actorId]);await locker.query("COMMIT");expect((await result).message).toBe("WORK_STATE_FORBIDDEN");}
  finally{await locker.query("ROLLBACK");locker.release()}
  expect(await workEvents(f,a)).toEqual([]);expect((await f.admin.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[a.tenantId,commandId])).rows).toEqual([]);
 });
});

describe("CH-4 actual final-account lock routine race",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A16 lock serializes with source admission on two connections",async()=>{
  const {prepareWorkAccount,workTenant}=await import("./job-work-state-fixtures.js"),{FinalAccountLockRepository}=await import("../src/final-account-lock-repository.js"),{SupplierDocumentRepository}=await import("../src/supplier-document-repository.js"),{randomUUID}=await import("node:crypto"),a=await seedWorkJob(f),account=await prepareWorkAccount(f,a),repo=new FinalAccountLockRepository(f.runtime);
  await repo.acceptTerms(a.context,{actorMembershipId:a.actorId,commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"});
  await repo.disposition(a.context,{jobId:a.jobId,actorMembershipId:a.actorId,commandId:randomUUID(),scopeItemId:a.scopeId,disposition:"done"});
  const [source,lock]=await Promise.allSettled([
   new SupplierDocumentRepository(f.runtime).intake(a.context,a.jobId,{version:"supplier-document-intake.v1",fixtureId:"materials-B-invoice",channel:"picker",expectedRevision:0}),
   repo.lock(a.context,{jobId:a.jobId,actorMembershipId:a.actorId,commandId:randomUUID(),finalAccountRevisionId:account.revisionId,expectedRevision:1,declarationVersion:"final_account_declaration.v1"}),
  ]);
  expect(lock.status).toBe("fulfilled");
  const docs=await workTenant(f.runtime,a.tenantId,async db=>(await db.query("SELECT id FROM app.supplier_document WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows);
  if(source.status==="fulfilled")expect(docs).toHaveLength(1);else {expect(source.reason.message).toBe("POST_LOCK_WORK_REQUIRES_LINKED_JOB");expect(docs).toHaveLength(0)}
  await expect(new SupplierDocumentRepository(f.runtime).intake(a.context,a.jobId,{version:"supplier-document-intake.v1",commandId:randomUUID(),fixtureId:"materials-B-revised-invoice",channel:"picker",expectedRevision:docs.length})).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
 });
});
