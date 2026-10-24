import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant, type FinalCheckFixture, type FinalCheckJob } from "./final-check-fixture.js";

let f: FinalCheckFixture;
beforeAll(async () => { f = await createFinalCheckFixture(); }, 60000);
afterAll(async () => { await closeFinalCheckFixture(f); });
async function upload(a: FinalCheckJob, expired = true) {
 const id = randomUUID();
 await finalCheckTenant(f.runtime, a.tenantId, db => db.query(`INSERT INTO app.evidence_upload
  (id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)
  VALUES($1,$2,$3,$4,$5,repeat('a',64),'application/pdf',100,'standard_evidence',clock_timestamp()+interval '1 day')`,
 [id,a.tenantId,a.jobId,a.scopeItemId,`sv5-guard/${id}`]));
 if (expired) await finalCheckTenant(f.admin, a.tenantId, db => db.query("UPDATE app.evidence_upload SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [a.tenantId,id]));
 return id;
}
async function transition(a: FinalCheckJob, id: string, state: string) {
 return finalCheckTenant(f.runtime, a.tenantId, db => db.query(`UPDATE app.evidence_upload SET state=$3::varchar,
  server_verified_at=CASE WHEN $3::varchar='verified' THEN clock_timestamp() ELSE NULL END,
  object_version_id=CASE WHEN $3::varchar='verified' THEN 'post-lock.v1' ELSE NULL END,
  rejection_code=CASE WHEN $3::varchar='rejected' THEN 'SYNTHETIC_EXPIRED' ELSE NULL END WHERE tenant_id=$1 AND id=$2`, [a.tenantId,id,state]));
}
it.each(['quarantined','verified'])("C248 runtime refuses expired pre-lock pending -> %s in the lock-to-freeze window", async state => {
 const a=await seedFinalCheckJob(f),id=await upload(a);
 await a.lock();
 expect((await f.admin.query('SELECT count(*)::int n FROM app.final_check_manifest WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows[0].n).toBe(0);
 await expect(transition(a,id,state)).rejects.toMatchObject({code:'55000',message:'FINAL_CHECK_UPLOAD_TRANSITION_LOCKED'});
 expect((await f.admin.query('SELECT state FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2',[a.tenantId,id])).rows).toEqual([{state:'pending'}]);
});
it.each([false,true])("C248 SV-5 completes with an excluded expired source (reject=%s), with an immutable exclusion audit", async reject => {
 const a=await seedFinalCheckJob(f),id=await upload(a);await a.lock();
 await expect(transition(a,id,'quarantined')).rejects.toMatchObject({code:'55000',message:'FINAL_CHECK_UPLOAD_TRANSITION_LOCKED'});
 await expect(transition(a,id,'verified')).rejects.toMatchObject({code:'55000',message:'FINAL_CHECK_UPLOAD_TRANSITION_LOCKED'});
 if(reject) expect((await transition(a,id,'rejected')).rowCount).toBe(1);
 const worker=new FinalCheckRepository(f.shadow),m=await worker.begin(a.context,a.jobId);
 expect(m.sources).toEqual([]);
 expect(m.excludedUploads).toEqual([{uploadId:id,state:reject?'rejected':'expired',reason:reject?'SYNTHETIC_EXPIRED':'expired_unswept'}]);
 const result=await worker.reconcile(a.context,a.jobId,m.id,[]) as {runId:string;zeroResult:boolean};
 expect(result.zeroResult).toBe(true);
 expect(await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest)).toMatchObject({state:'completed',runId:result.runId});
 const audit=(await f.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='final_check.sources_excluded'",[a.tenantId,a.jobId])).rows;
 expect(audit).toHaveLength(1);
 expect(JSON.stringify(audit[0].payload.references.exclusions)).toContain(id);
 expect(JSON.stringify(audit[0].payload.references.exclusions)).toContain(reject?'SYNTHETIC_EXPIRED':'expired_unswept');
 // Replays retain the first frozen manifest and do not duplicate the exclusion audit.
 expect((await worker.begin(a.context,a.jobId)).id).toBe(m.id);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='final_check.sources_excluded'",[a.tenantId,a.jobId])).rows[0].n).toBe(1);
});
it("C248 rejection cannot be reactivated; other jobs and post-lock uploads retain their existing lifecycle",async()=>{
 const a=await seedFinalCheckJob(f),b=await seedFinalCheckJob(f),id=await upload(a),other=await upload(b);
 await a.lock();await transition(a,id,'rejected');
 for(const state of ['pending','quarantined','verified']) await expect(transition(a,id,state)).rejects.toMatchObject({message:'FINAL_CHECK_UPLOAD_TRANSITION_LOCKED'});
 expect((await transition(b,other,'quarantined')).rowCount).toBe(1);
 const later=await upload(a,false);
 expect((await transition(a,later,'quarantined')).rowCount).toBe(1);
 expect((await transition(a,later,'verified')).rowCount).toBe(1);
 // A different tenant cannot discover or mutate the locked upload through runtime RLS.
 expect((await finalCheckTenant(f.runtime,randomUUID(),db=>db.query("UPDATE app.evidence_upload SET state='quarantined' WHERE id=$1",[id]))).rowCount).toBe(0);
});
it("C248 negative control: removing only 0212's trigger restores the reviewer's expired-upload race",async()=>{
 const a=await seedFinalCheckJob(f),id=await upload(a);await a.lock();
 const db=await f.admin.connect();
 try {
  await db.query('BEGIN');
  await db.query('DROP TRIGGER b_final_check_upload_transition ON app.evidence_upload');
  await db.query(`SET LOCAL ROLE ${f.runtime.options.user}`);
  await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);
  for(const state of ['quarantined','verified']) {
   const result=await db.query("UPDATE app.evidence_upload SET state=$3::varchar,server_verified_at=CASE WHEN $3::varchar='verified' THEN clock_timestamp() ELSE NULL END,object_version_id='post-lock.v1' WHERE tenant_id=$1 AND id=$2",[a.tenantId,id,state]);
   expect(result.rowCount).toBe(1);
  }
 } finally {await db.query('ROLLBACK');db.release();}
 await expect(transition(a,id,'quarantined')).rejects.toMatchObject({message:'FINAL_CHECK_UPLOAD_TRANSITION_LOCKED'});
});

// Pin the caller snapshot before the independent lock transaction commits.
it.each([
 ['REPEATABLE READ','pending','quarantined','FINAL_CHECK_UPLOAD_TRANSITION_LOCKED'],
 ['SERIALIZABLE','pending','quarantined','FINAL_CHECK_UPLOAD_TRANSITION_LOCKED'],
 ['REPEATABLE READ','verified','rejected','FINAL_CHECK_VERIFIED_SOURCE_LOCKED'],
 ['SERIALIZABLE','verified','rejected','FINAL_CHECK_VERIFIED_SOURCE_LOCKED'],
])("C249 %s refuses pre-lock %s -> %s after lock commits",async(isolation,initial,target,message)=>{
 const a=await seedFinalCheckJob(f),id=await upload(a);
 if(initial==='verified') await transition(a,id,initial);
 const db=await f.runtime.connect();
 try {
  await db.query(`BEGIN ISOLATION LEVEL ${isolation}`);
  await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);
  expect((await db.query('SELECT state FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2',[a.tenantId,id])).rows).toEqual([{state:initial}]);
  expect((await db.query('SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows[0].n).toBe(0);
  await a.lock();
  await expect(db.query("UPDATE app.evidence_upload SET state=$3::varchar,rejection_code=CASE WHEN $3::varchar='rejected' THEN 'SYNTHETIC_EXPIRED' ELSE NULL END WHERE tenant_id=$1 AND id=$2",[a.tenantId,id,target])).rejects.toMatchObject({code:'55000',message});
 } finally {await db.query('ROLLBACK');db.release();}
 expect((await f.admin.query('SELECT state FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2',[a.tenantId,id])).rows).toEqual([{state:initial}]);
});
