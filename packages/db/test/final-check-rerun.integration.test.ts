import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {FinalCheckRepository} from '../src/final-check-repository.js';
import {detectShadowObservations,parseObservation} from '@jobguard/core';
import {ShadowDetectionRepository,FinalCheckCompletionRepository} from '../src/shadow-detection-repository.js';
import {FinalAccountLockRepository} from '../src/final-account-lock-repository.js';
import {practiceMaterialPool} from '../src/practice-session.js';
import {FinalCheckWorker} from '../../../apps/api/src/final-check.worker.js';
import {executeFinalCheckTask} from '../../../apps/api/src/final-check-task-executor.js';
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,insertFinalCheckEvidence,finalCheckProposal,finalCheckTenant,FINAL_CHECK_ACTOR,type FinalCheckFixture,type FinalCheckJob} from './final-check-fixture.js';
let f:FinalCheckFixture;
beforeAll(async()=>{vi.stubEnv('JOBGUARD_ENV','synthetic_demo');f=await createFinalCheckFixture();},60000);
afterAll(async()=>{await closeFinalCheckFixture(f);vi.unstubAllEnvs();});
const tx=<T>(a:FinalCheckJob,work:Parameters<typeof finalCheckTenant<T>>[2])=>finalCheckTenant(f.admin,a.tenantId,work);
function runner(redetect?:()=>Promise<unknown>){
 const repo=new FinalCheckRepository(f.shadow),completion=new FinalCheckCompletionRepository(f.shadow);
 const worker=new FinalCheckWorker({
  read:(c,t)=>repo.manifest(c,t.jobId,t.manifestId),
  async process(_c,m,s){await redetect?.();const ids=m.signals.filter(x=>x.evidenceIds.includes(s.evidenceId!)).map(x=>x.signalId);return {version:'final-check.source-result.v1',inputHash:s.inputHash,status:ids.length?'detected':'zero_result',failureCode:null,signalIds:ids};},
  record:(c,m,s,r)=>repo.record(c,m.comparisons.jobId,m.id,s.id,randomUUID(),r),
  reconcile:(c,m)=>repo.reconcile(c,m.comparisons.jobId,m.id,m.signals.map(s=>({signalId:s.signalId,expectedRevision:s.revision,outcome:s.permanentExclusion?'not_enough_evidence':'reveal',references:[],comparisons:{baselineItemIds:[...m.comparisons.baselineItemIds],captureIds:[],lockedLineIds:m.comparisons.lines.map(x=>x.id)}}))),
 },'synthetic_demo');
 return {repo,run:async(a:FinalCheckJob,id?:string)=>{const m=await repo.begin(a.workerContext,a.jobId,'shadow-detection.v1',id);await executeFinalCheckTask(a.workerContext,{version:'final-check-task.v1',tenantId:a.tenantId,jobId:a.jobId,manifestId:m.id,lockId:m.lockId,executionId:m.id},{read:repo.manifest.bind(repo),execute:worker.execute.bind(worker),publish:completion.publish.bind(completion)},'synthetic_demo');return repo.manifest(a.workerContext,a.jobId,m.id);}};
}
const request=(a:FinalCheckJob)=>new FinalCheckRepository(f.runtime).requestRun(a.context,a.jobId,a.digest) as Promise<{manifestId:string;attempt:number}>;
const gate=(a:FinalCheckJob)=>tx(a,db=>db.query('SELECT * FROM app.require_authoritative_final_check($1,$2)',[a.tenantId,a.jobId]));
const invoice=(a:FinalCheckJob,revision=a.revisionId,kind:'final'|'supplementary'='final',hash='a'.repeat(64))=>new FinalAccountLockRepository(practiceMaterialPool(f.runtime,a.digest)).issueInvoice(a.context,{jobId:a.jobId,actorMembershipId:FINAL_CHECK_ACTOR,commandId:randomUUID(),finalAccountRevisionId:revision,expectedSourceHash:hash,invoiceKind:kind,recipient:'fictional@example.invalid',issuedOn:'2026-11-08'});
const withdraw=(a:FinalCheckJob,evidence:string)=>finalCheckTenant(f.runtime,a.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),a.tenantId,evidence,FINAL_CHECK_ACTOR]));
async function history(a:FinalCheckJob,id:string){
 const result:Record<string,unknown>={};
 for(const table of ['final_check_manifest','final_check_manifest_source','final_check_processing_source','final_check_source_attempt','final_check_run_binding','shadow_final_check_source_attempt','shadow_final_check_run_binding','shadow_final_check_completion']){
  const key=table==='final_check_manifest'?'id':'manifest_id';
  result[table]=(await f.admin.query(`SELECT to_jsonb(x)::text row FROM app.${table} x WHERE tenant_id=$1 AND job_id=$2 AND ${key}=$3 ORDER BY to_jsonb(x)::text`,[a.tenantId,a.jobId,id])).rows;
 }
 for(const table of ['shadow_reconciliation_run','shadow_signal_classification','final_check_reveal_proof','shadow_final_check_reveal_proof']){
  const key=table==='shadow_reconciliation_run'?'id':'run_id';
  result[table]=(await f.admin.query(`SELECT to_jsonb(x)::text row FROM app.${table} x JOIN app.final_check_run_binding b ON(b.tenant_id,b.job_id,b.run_id)=(x.tenant_id,x.job_id,x.${key}) WHERE b.tenant_id=$1 AND b.job_id=$2 AND b.manifest_id=$3 ORDER BY to_jsonb(x)::text`,[a.tenantId,a.jobId,id])).rows;
 }
 result.checks=(await f.admin.query('SELECT to_jsonb(c)::text row FROM app.final_account_lock_check c JOIN app.shadow_final_check_completion x ON(x.tenant_id,x.job_id,x.check_id)=(c.tenant_id,c.job_id,c.id) WHERE x.tenant_id=$1 AND x.job_id=$2 AND x.manifest_id=$3 ORDER BY c.id',[a.tenantId,a.jobId,id])).rows;
 return result;
}
async function money(a:FinalCheckJob){const tables=(await f.admin.query("SELECT table_name FROM information_schema.columns WHERE table_schema='app' AND column_name='tenant_id' AND table_name ~ '(fee|entitlement|attribution|catch|settlement|allocation|ledger|journal|invoice|extra_origin|variation)' ORDER BY table_name")).rows;const result:Record<string,unknown>={};for(const {table_name:t} of tables)result[t]=(await f.admin.query(`SELECT to_jsonb(x)::text row FROM app.${t} x WHERE tenant_id=$1 ORDER BY to_jsonb(x)::text`,[a.tenantId])).rows;return result;}
async function ready(){const a=await seedFinalCheckJob(f),e=await insertFinalCheckEvidence(f,a);await a.lock();const r=runner(),m=await r.run(a);await invoice(a);return {a,e,r,m};}

it('post-final withdrawal -> refusal -> new current-evidence attempt -> supplementary; immutable history and no money effects',async()=>{
 const {a,e,r,m}=await ready();const old=await history(a,m.id);await withdraw(a,e);await expect(gate(a)).rejects.toThrow('FINAL_CHECK_NOT_COMPLETE');const beforeMoney=await money(a);
 const q=await request(a);expect(q.attempt).toBe(2);expect(await request(a)).toEqual(q);
 const newer=await r.run(a,q.manifestId);expect(newer.id).not.toBe(m.id);expect(newer.lockId).toBe(m.lockId);expect(newer.cutoff).toBe(m.cutoff);expect(newer.sources).toEqual([]);
 await r.run(a,q.manifestId);await gate(a);expect((await r.repo.begin(a.workerContext,a.jobId,"shadow-detection.v1",undefined,1)).id).toBe(m.id);expect(await history(a,m.id)).toEqual(old);expect(await money(a)).toEqual(beforeMoney);
 const rows=(await f.admin.query('SELECT attempt,predecessor_manifest_id,withdrawn_predecessor_source_ids FROM app.final_check_manifest WHERE id=$1',[newer.id])).rows;
 const source=(await f.admin.query('SELECT id FROM app.final_check_manifest_source WHERE manifest_id=$1',[m.id])).rows[0].id;
 expect(rows).toEqual([{attempt:2,predecessor_manifest_id:m.id,withdrawn_predecessor_source_ids:[source]}]);
 for(const table of ['final_check_manifest','final_check_run_binding','final_account_lock_check','shadow_final_check_completion'])expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId])).rows[0].n).toBe(2);
 await expect(tx(a,db=>db.query('SELECT app.verify_final_check_run($1,$2,$3,$4,$5)',[a.tenantId,a.jobId,m.result!.runId,m.lockId,m.cutoff]))).rejects.toThrow('FINAL_CHECK_INPUT_UNAVAILABLE');
 const revision=randomUUID(),scope=randomUUID(),line=randomUUID(),hash='b'.repeat(64);
 await tx(a,async db=>{
  await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[scope,a.tenantId,a.jobId]);
  await db.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) SELECT $1,tenant_id,job_id,final_account_draft_id,2,id,$2,baseline_quote_version_id,currency,tax_policy_version,101000,20200,121200,false,findings FROM app.final_account_revision WHERE tenant_id=$3 AND id=$4",[revision,hash,a.tenantId,a.revisionId]);
  await db.query('INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) SELECT gen_random_uuid(),tenant_id,job_id,$1,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal FROM app.final_account_line WHERE tenant_id=$2 AND final_account_revision_id=$3',[revision,a.tenantId,a.revisionId]);
  await db.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) VALUES($1,$2,$3,$4,'variation',$5,$6,$7,$8,'Synthetic new work',1000,2)",[line,a.tenantId,a.jobId,revision,randomUUID(),scope,randomUUID(),randomUUID()]);
  await db.query('UPDATE app.final_account_draft SET current_revision_id=$1,revision=2 WHERE tenant_id=$2 AND current_revision_id=$3',[revision,a.tenantId,a.revisionId]);
 });
 expect(await invoice(a,revision,'supplementary',hash)).toMatchObject({invoiceKind:'supplementary',netPence:1000,totalPence:1200});
});

it('refuses still-verifying and in-progress attempts without writes',async()=>{
 const {a,e,r,m}=await ready();const before=await history(a,m.id),requests=(await f.admin.query('SELECT * FROM infrastructure.final_check_request WHERE job_id=$1',[a.jobId])).rows;
 await expect(request(a)).rejects.toThrow('FINAL_CHECK_SOURCE_CHANGED');expect(await history(a,m.id)).toEqual(before);expect((await f.admin.query('SELECT * FROM infrastructure.final_check_request WHERE job_id=$1',[a.jobId])).rows).toEqual(requests);
 await withdraw(a,e);const q=await request(a);const next=await r.repo.begin(a.workerContext,a.jobId,'shadow-detection.v1',q.manifestId);const frozen=await history(a,next.id),qBefore=(await f.admin.query('SELECT * FROM infrastructure.final_check_request WHERE job_id=$1',[a.jobId])).rows;
 await expect(request(a)).rejects.toThrow('FINAL_CHECK_PENDING');expect(await history(a,next.id)).toEqual(frozen);expect((await f.admin.query('SELECT * FROM infrastructure.final_check_request WHERE job_id=$1',[a.jobId])).rows).toEqual(qBefore);
});

it('re-detected prior catch retains stable signal and cannot create a second catch or money fact',async()=>{
 const a=await seedFinalCheckJob(f),e=await insertFinalCheckEvidence(f,a),other=await insertFinalCheckEvidence(f,a);
 const receipt=(await f.admin.query(`SELECT object_version_id,sha256,to_char(server_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') received FROM app.evidence_object WHERE id=$1`,[e])).rows[0];
 const observation=parseObservation({version:'observation.v1',tenantId:a.tenantId,jobId:a.jobId,kind:'completion_photo',evidence:{id:e,objectVersionId:receipt.object_version_id,sha256:receipt.sha256,serverReceivedAt:receipt.received},text:'Fitted outside tap.',citations:[{start:0,end:19,quote:'Fitted outside tap.'}],facts:{workReference:randomUUID(),scopeArea:'job',description:'outside tap',status:'completed',estimatedValuePence:null,safetyImplication:false,customerClearlyRequested:false,needsPriorWrittenAgreement:false,significantWork:null,activeDispute:false,silenceMateriallyWorsensDispute:false,disclosureDuty:false}});
 const sink=new ShadowDetectionRepository(f.shadow),batch={version:'shadow-detection-batch.v1' as const,jobId:a.jobId,observations:[observation],captures:[],proposals:detectShadowObservations([observation],[],new Date().toISOString())};
 const redetect=()=>sink.persist(a.workerContext,batch);await redetect();const signal=(await f.admin.query('SELECT id FROM app.shadow_commercial_signal WHERE job_id=$1 AND coalesced_into_signal_id IS NULL',[a.jobId])).rows[0].id;
 await a.lock();const r=runner(redetect),m=await r.run(a);
 const builder=new FinalCheckRepository(f.runtime),body={version:'final-check.catch.v1',commandId:randomUUID(),lockId:m.lockId,runId:m.result!.runId,signalId:signal,expectedSignalRevision:m.signals.find(s=>s.signalId===signal)!.revision};
 await builder.confirmCatch(a.context,a.jobId,a.digest,body);await invoice(a);await withdraw(a,other);const before=await money(a),q=await request(a),next=await r.run(a,q.manifestId);
 expect(next.signals.map(s=>s.signalId)).toEqual([signal]);expect(next.result!.classifications).toHaveLength(1);expect(await money(a)).toEqual(before);
 await expect(builder.confirmCatch(a.context,a.jobId,a.digest,{...body,commandId:randomUUID(),runId:next.result!.runId,expectedSignalRevision:next.signals[0]!.revision})).rejects.toThrow();expect(await money(a)).toEqual(before);
 expect((await f.admin.query('SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2 AND source_signal_id=$3',[a.tenantId,a.jobId,signal])).rows[0].n).toBe(1);
});

it('stranger, other practice, closed job, wrong lock and wrong cutoff refuse without writes',async()=>{
 const {a,e,r,m}=await ready();await withdraw(a,e);const other=await seedFinalCheckJob(f);await other.lock();
 const counts=async()=>({requests:(await f.admin.query('SELECT to_jsonb(q)::text row FROM infrastructure.final_check_request q ORDER BY manifest_id')).rows,history:await history(a,m.id),money:await money(a)});
 let before=await counts();
 await expect(new FinalCheckRepository(f.runtime).requestRun(a.context,a.jobId,'f'.repeat(64))).rejects.toThrow('FINAL_CHECK_FORBIDDEN');expect(await counts()).toEqual(before);
 await expect(new FinalCheckRepository(f.runtime).requestRun(a.context,a.jobId,other.digest)).rejects.toThrow('FINAL_CHECK_FORBIDDEN');expect(await counts()).toEqual(before);
 const q=await request(a);before=await counts();
 const another=(await f.admin.query('SELECT id FROM app.final_account_lock WHERE job_id=$1',[other.jobId])).rows[0].id;
 await expect(r.repo.begin(a.workerContext,a.jobId,'shadow-detection.v1',q.manifestId,2,another)).rejects.toThrow('FINAL_CHECK_PENDING');expect(await counts()).toEqual(before);
 for(const [lock,cutoff] of [[another,m.cutoff],[m.lockId,'2000-01-01T00:00:00Z']]){
  await expect(finalCheckTenant(f.shadow,a.tenantId,db=>db.query("INSERT INTO app.final_check_manifest(tenant_id,job_id,id,lock_id,evidence_cutoff_at,attempt,predecessor_manifest_id,detector_version,reconciliation_version) VALUES($1,$2,$3,$4,$5,2,$6,'shadow-detection.v1','final-check.reconciliation.v1')",[a.tenantId,a.jobId,q.manifestId,lock,cutoff,m.id]))).rejects.toThrow('FINAL_CHECK_LOCK_BINDING_INVALID');
  expect(await counts()).toEqual(before);
 }
 await expect(r.repo.begin(a.workerContext,other.jobId,'shadow-detection.v1',q.manifestId)).rejects.toThrow('FINAL_CHECK_SOURCE_CHANGED');expect(await counts()).toEqual(before);
 await tx(a,async db=>{
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query("INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,actor_membership_id,command_id,close_reason,close_note,request_hash,audit_event_id) SELECT $1,$2,$3,coalesce(max(sequence),0)+1,'closed',clock_timestamp(),$4,$5,'other','Synthetic closed-job refusal',repeat('a',64),$6 FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId,randomUUID(),FINAL_CHECK_ACTOR,randomUUID(),randomUUID()]);
 });
 before=await counts();await expect(request(a)).rejects.toThrow('JOB_WORK_CLOSED');expect(await counts()).toEqual(before);
 await expect(r.repo.begin(a.workerContext,a.jobId,'shadow-detection.v1',q.manifestId)).rejects.toThrow('JOB_WORK_CLOSED');expect(await counts()).toEqual(before);
});

it('rolled-back mutations prove the no-longer-verifies predicate and predecessor snapshot are load-bearing',async()=>{
 const {a,e,m}=await ready();
 const db=await f.admin.connect();
 try{
  await db.query('BEGIN');await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenantId]);
  // LP-6d: the scratch mutation runs inside the practice owner's own bound request.
  await db.query("SELECT app.bind_request('practice',$1,$2)",[a.digest,a.tenantId]);
  const original=(await db.query("SELECT pg_get_functiondef('app.require_final_check_rerun(uuid,uuid,uuid)'::regprocedure) body")).rows[0].body as string;
  const anchor="IF failure IS DISTINCT FROM 'FINAL_CHECK_INPUT_UNAVAILABLE' THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;";
  expect(original.split(anchor)).toHaveLength(2);await db.query(original.replace(anchor,''));
  // The ordinary refusal assertion would now be red: a valid latest check incorrectly admits a request.
  expect((await db.query('SELECT app.request_final_check_run($1,$2,$3) result',[a.tenantId,a.jobId,a.digest])).rows[0].result.attempt).toBe(2);
 }finally{await db.query('ROLLBACK');db.release();}
 await expect(request(a)).rejects.toThrow('FINAL_CHECK_SOURCE_CHANGED');
 await withdraw(a,e);const q=await request(a),before=await history(a,m.id),client=await f.admin.connect();
 try{
  await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.final_check_attempt_id',$2,true)",[a.tenantId,q.manifestId]);
  const original=(await client.query("SELECT pg_get_functiondef('app.guard_final_check_manifest()'::regprocedure) body")).rows[0].body as string;
  const anchor='NEW.withdrawn_predecessor_source_ids:=removed;';expect(original.split(anchor)).toHaveLength(2);await client.query(original.replace(anchor,''));
  await client.query('SET LOCAL SESSION AUTHORIZATION '+f.shadow.options.user);
  await expect(client.query("SELECT app.begin_final_check($1,$2,'shadow-detection.v1','final-check.reconciliation.v1')",[a.tenantId,a.jobId])).rejects.toThrow('final_check_attempt_chain');
 }finally{await client.query('ROLLBACK');client.release();}
 expect(await history(a,m.id)).toEqual(before);const next=await runner().run(a,q.manifestId);await gate(a);expect(next.sources).toEqual([]);
});

it('a withdrawn bound proof of an unconfirmed signal is absent from the new attempt and cannot strand reconciliation',async()=>{
 const a=await seedFinalCheckJob(f),e=await insertFinalCheckEvidence(f,a),signal=await finalCheckProposal(f,a,e);await a.lock();const r=runner(),m=await r.run(a),old=await history(a,m.id);await invoice(a);await withdraw(a,e);const before=await money(a),q=await request(a),next=await r.run(a,q.manifestId);
 expect(next.sources).toEqual([]);expect(next.signals).toMatchObject([{signalId:signal,evidenceIds:[],permanentExclusion:true}]);expect(next.result!.classifications).toMatchObject([{signalId:signal,outcome:'not_enough_evidence'}]);await gate(a);expect(await history(a,m.id)).toEqual(old);expect(await money(a)).toEqual(before);
});

it('refuses a queue identity from another tenant/job without returning its manifest or writing another request',async()=>{
 const {a,e,m}=await ready();await withdraw(a,e);const foreignManifest=randomUUID();
 await f.admin.query('INSERT INTO infrastructure.final_check_request(lock_id,tenant_id,job_id,attempt,manifest_id) VALUES($1,$2,$3,2,$4)',[m.lockId,randomUUID(),randomUUID(),foreignManifest]);
 const before=(await f.admin.query('SELECT to_jsonb(q)::text row FROM infrastructure.final_check_request q ORDER BY manifest_id')).rows;
 await expect(request(a)).rejects.toThrow('FINAL_CHECK_FORBIDDEN');
 expect((await f.admin.query('SELECT to_jsonb(q)::text row FROM infrastructure.final_check_request q ORDER BY manifest_id')).rows).toEqual(before);
});
