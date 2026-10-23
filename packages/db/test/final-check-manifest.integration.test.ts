import {afterAll,beforeAll,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,insertFinalCheckEvidence,type FinalCheckFixture} from "./final-check-fixture.js";
import {FinalCheckRepository} from "../src/final-check-repository.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture()},60000);afterAll(async()=>closeFinalCheckFixture(f));
it("SV5-01 SV5-02 delayed pre-lock detection stays in canonical manifest; replay preserves cutoff and changed versions conflict",async()=>{
 const a=await seedFinalCheckJob(f),e=await insertFinalCheckEvidence(f,a);
 await a.lock();const repo=new FinalCheckRepository(f.shadow),m=await repo.begin(a.context,a.jobId);
 expect(m.sources.map(s=>s.evidenceId)).toContain(e);expect(await repo.begin(a.context,a.jobId)).toEqual(m);
 await expect(repo.begin(a.context,a.jobId,"changed.v1")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
});
it("SV5-03 SV5-25 unsupported, failed, unverified and changed inputs never become silent zero-results",async()=>{
 const a=await seedFinalCheckJob(f);await insertFinalCheckEvidence(f,a);await a.lock();const repo=new FinalCheckRepository(f.shadow),m=await repo.begin(a.context,a.jobId),s=m.sources[0]!;
 await expect(repo.reconcile(a.context,a.jobId,m.id,[])).rejects.toThrow("FINAL_CHECK_PENDING");
 await repo.record(a.context,a.jobId,m.id,s.id,randomUUID(),{version:"final-check.source-result.v1",inputHash:s.inputHash,status:"unsupported",failureCode:"UNSUPPORTED_SOURCE",signalIds:[]});
 await expect(repo.reconcile(a.context,a.jobId,m.id,[])).rejects.toThrow("FINAL_CHECK_PENDING");
 await expect(repo.record(a.context,a.jobId,m.id,s.id,randomUUID(),{version:"final-check.source-result.v1",inputHash:"b".repeat(64),status:"zero_result",failureCode:null,signalIds:[]})).rejects.toThrow("FINAL_CHECK_SOURCE_CHANGED");
 await repo.record(a.context,a.jobId,m.id,s.id,randomUUID(),{version:"final-check.source-result.v1",inputHash:s.inputHash,status:"zero_result",failureCode:null,signalIds:[]});
 expect((await repo.manifest(a.context,a.jobId,m.id)).sources[0]!.status).toBe("zero_result");
});
it("SV5-14 post-lock server receive time excludes old device-dated evidence from inventory",async()=>{
 const a=await seedFinalCheckJob(f);await a.lock();const e=await insertFinalCheckEvidence(f,a,'diary','application/pdf');const m=await new FinalCheckRepository(f.shadow).begin(a.context,a.jobId);
 expect(m.sources.map(s=>s.evidenceId)).not.toContain(e);
});
it("SV5-14 post-lock signal is available at once with permanent evidence_after_lock regardless of device date",async()=>{
 const a=await seedFinalCheckJob(f);await a.lock();const e=await insertFinalCheckEvidence(f,a,'diary','application/pdf');
 const {finalCheckProposal}=await import('./final-check-fixture.js');const signalId=await finalCheckProposal(f,a,e);
 const view=await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest);expect(view.postLockItems).toEqual([expect.objectContaining({signalId,evidenceAfterLock:true})]);
 expect((await f.admin.query("SELECT reason FROM app.shadow_signal_ineligibility WHERE tenant_id=$1 AND job_id=$2 AND signal_id=$3",[a.tenantId,a.jobId,signalId])).rows).toContainEqual({reason:'evidence_after_lock'});
});
it("SV5-B3 a signal supported only by post-lock evidence is not offered that evidence and cannot be revealed as a main finding (per C135 repair)",async()=>{
 const {finalCheckProposal}=await import('./final-check-fixture.js'),{randomUUID}=await import('node:crypto');
 const a=await seedFinalCheckJob(f);await a.lock();const late=await insertFinalCheckEvidence(f,a,'diary','application/pdf');const signalId=await finalCheckProposal(f,a,late);
 const repo=new FinalCheckRepository(f.shadow),m=await repo.begin(a.context,a.jobId);
 const fresh=await repo.manifest(a.context,a.jobId,m.id);expect(fresh.signals.find(x=>x.signalId===signalId)!.evidenceIds).toEqual([]);
 const comparisons={baselineItemIds:[a.scopeItemId],captureIds:[],lockedLineIds:[a.lineId]};
 await expect(repo.reconcile(a.context,a.jobId,m.id,[{signalId,expectedRevision:0,outcome:'reveal',references:[],comparisons}])).rejects.toMatchObject({code:'FINAL_CHECK_SOURCE_CHANGED'});
 const done=await repo.reconcile(a.context,a.jobId,m.id,[{signalId,expectedRevision:0,outcome:'not_enough_evidence',references:[],comparisons}]) as {runId:string};
 expect(done.runId).toBeTruthy();
 expect((await f.admin.query("SELECT state FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[a.tenantId,a.jobId,signalId])).rows[0].state).not.toBe('revealed');void randomUUID;
});
it("SV5-25 invalidated evidence cannot remain available as successfully checked proof",async()=>{
 const {availableFinalCheck,finalCheckTenant,FINAL_CHECK_ACTOR}=await import('./final-check-fixture.js');const a=await seedFinalCheckJob(f),r=await availableFinalCheck(f,a),e=r.manifest.sources[0]!.evidenceId;
 await finalCheckTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),a.tenantId,e,FINAL_CHECK_ACTOR]));
 expect((await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest)).state).toBe('failed');
});
it("SV5-01 SV5-03 unlinked supplier versions are inventoried as unsupported rather than silently skipped",async()=>{
 const {finalCheckTenant}=await import('./final-check-fixture.js'),a=await seedFinalCheckJob(f),documentId=randomUUID(),versionId=randomUUID();
 await finalCheckTenant(f.admin,a.tenantId,async db=>{await db.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,content_hash,status) VALUES($1,$2,$3,'Synthetic supplier','invoice',$4,'held')",[documentId,a.tenantId,a.jobId,'a'.repeat(64)]);await db.query("INSERT INTO app.supplier_document_version(id,tenant_id,job_id,document_id,version,media_type,byte_length,content_hash,page_count) VALUES($1,$2,$3,$4,1,'application/pdf',1,$5,1)",[versionId,a.tenantId,a.jobId,documentId,'a'.repeat(64)]);});
 await a.lock();const repo=new FinalCheckRepository(f.shadow),m=await repo.begin(a.context,a.jobId);expect(m.sources).toEqual([expect.objectContaining({sourceKind:'unlinked_supplier_version',sourceRef:versionId,processable:false,status:'pending'})]);await expect(repo.reconcile(a.context,a.jobId,m.id,[])).rejects.toThrow('FINAL_CHECK_PENDING');
});
it.each(['rejected','expired'] as const)("C204 %s pre-lock upload is audited, excluded, and does not freeze completion",async terminal=>{
 const {finalCheckTenant}=await import('./final-check-fixture.js');
 const {FinalCheckCompletionRepository}=await import('../src/shadow-detection-repository.js');
 const a=await seedFinalCheckJob(f),upload=randomUUID();
 await finalCheckTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,rejection_code) VALUES($1,$2,$3,$4,$5,$6,'image/png',100,'standard_evidence',clock_timestamp()-interval '1 hour',$7,$8)",[upload,a.tenantId,a.jobId,a.scopeItemId,`synthetic/terminal/${upload}`,'a'.repeat(64),terminal==='expired'?'pending':'rejected',terminal==='rejected'?'verification_invalid':null]));
 await a.lock();const worker=new FinalCheckRepository(f.shadow),builder=new FinalCheckRepository(f.runtime),m=await worker.begin(a.context,a.jobId);
 expect(m.sources).toEqual([]);expect(m.excludedUploads).toEqual([{uploadId:upload,state:terminal,reason:terminal==='rejected'?'verification_invalid':'expired_unswept'}]);
 expect(await worker.begin(a.context,a.jobId)).toEqual(m);
 const result=await worker.reconcile(a.context,a.jobId,m.id,[]) as {runId:string};
 expect(await worker.reconcile(a.context,a.jobId,m.id,[])).toEqual(result);
 await new FinalCheckCompletionRepository(f.shadow).publish(a.context,{version:'final-check-publication.v1',jobId:a.jobId,runId:result.runId,checkId:randomUUID()});
 expect((await builder.read(a.context,a.jobId,a.digest)).state).toBe('completed');
 expect((await finalCheckTenant(f.admin,a.tenantId,db=>db.query('SELECT * FROM app.require_authoritative_final_check($1,$2)',[a.tenantId,a.jobId]))).rows[0].complete).toBe(true);
 const events=(await f.admin.query("SELECT payload->'references'->'exclusions' exclusions FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='final_check.sources_excluded'",[a.tenantId,a.jobId])).rows;
 expect(events).toEqual([{exclusions:[{uploadId:upload,state:terminal,reason:terminal==='rejected'?'verification_invalid':'expired_unswept'}]}]);
});

it("C239 exact processed evidence and classifications satisfy the unchanged prerequisite publication gate",async()=>{
 const {availableFinalCheck}=await import('./final-check-fixture.js');const {FinalCheckCompletionRepository}=await import('../src/shadow-detection-repository.js');
 const a=await seedFinalCheckJob(f),result=await availableFinalCheck(f,a);
 await new FinalCheckCompletionRepository(f.shadow).publish(a.context,{version:'final-check-publication.v1',jobId:a.jobId,runId:result.runId,checkId:randomUUID()});
 expect((await f.admin.query('SELECT count(*)::int n FROM app.shadow_final_check_completion WHERE tenant_id=$1 AND job_id=$2 AND run_id=$3',[a.tenantId,a.jobId,result.runId])).rows[0].n).toBe(1);
});

it.each(['quarantined_after_lock','expiry_between_freezes'] as const)('C241b %s uses exactly the prerequisite exclusions and completes',async scenario=>{
 const {finalCheckTenant}=await import('./final-check-fixture.js');
 const {FinalCheckCompletionRepository}=await import('../src/shadow-detection-repository.js');
 const a=await seedFinalCheckJob(f),upload=randomUUID();
 // A non-photo pending upload is permitted by C135; photos/quarantine still block the lock.
 await finalCheckTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state) VALUES($1,$2,$3,$4,$5,$6,'application/pdf',100,'standard_evidence',clock_timestamp()+interval '1 day','pending')",[upload,a.tenantId,a.jobId,a.scopeItemId,`synthetic/c241/${upload}`,'a'.repeat(64)]));
 await a.lock();
 if(scenario==='quarantined_after_lock')await finalCheckTenant(f.admin,a.tenantId,db=>db.query("UPDATE app.evidence_upload SET state='quarantined' WHERE tenant_id=$1 AND id=$2",[a.tenantId,upload]));
 else {
  // Deterministically cross expiry between the old 0205 clock read and 0204's read.
  // No sleeps: run immediately before 0204's inventory trigger, after old begin's SELECT.
  await f.admin.query(`CREATE FUNCTION app.c241_test_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
   IF NEW.job_id='${a.jobId}'::uuid THEN UPDATE app.evidence_upload SET expires_at=clock_timestamp()-interval '1 hour' WHERE tenant_id=NEW.tenant_id AND id='${upload}'::uuid; END IF;
   RETURN NEW; END $$;
   CREATE TRIGGER a_c241_test_expiry BEFORE INSERT ON app.final_check_manifest FOR EACH ROW EXECUTE FUNCTION app.c241_test_expiry()`);
 }
 try {
  const worker=new FinalCheckRepository(f.shadow),m=await worker.begin(a.context,a.jobId);
  const frozen=(await f.admin.query('SELECT upload_id,excluded_state,excluded_reason FROM app.final_check_manifest_source WHERE tenant_id=$1 AND job_id=$2 AND manifest_id=$3',[a.tenantId,a.jobId,m.id])).rows;
  expect(frozen).toEqual([{upload_id:upload,excluded_state:scenario==='quarantined_after_lock'?'quarantined':'expired',excluded_reason:scenario==='quarantined_after_lock'?'quarantined':'expired_unswept'}]);
  expect(m.sources).toEqual([]);
  expect(m.excludedUploads).toEqual(frozen.map(s=>({uploadId:s.upload_id,state:s.excluded_state,reason:s.excluded_reason})));
  const result=await worker.reconcile(a.context,a.jobId,m.id,[]) as {runId:string};
  await new FinalCheckCompletionRepository(f.shadow).publish(a.context,{version:'final-check-publication.v1',jobId:a.jobId,runId:result.runId,checkId:randomUUID()});
  expect((await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest)).state).toBe('completed');
 } finally {
  if(scenario==='expiry_between_freezes')await f.admin.query('DROP TRIGGER a_c241_test_expiry ON app.final_check_manifest; DROP FUNCTION app.c241_test_expiry()');
 }
});
