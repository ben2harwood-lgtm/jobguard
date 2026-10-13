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
 const a=await seedFinalCheckJob(f);await a.lock();const e=await insertFinalCheckEvidence(f,a);const m=await new FinalCheckRepository(f.shadow).begin(a.context,a.jobId);
 expect(m.sources.map(s=>s.evidenceId)).not.toContain(e);
});
it("SV5-14 post-lock signal is available at once with permanent evidence_after_lock regardless of device date",async()=>{
 const a=await seedFinalCheckJob(f);await a.lock();const e=await insertFinalCheckEvidence(f,a);
 const {finalCheckProposal}=await import('./final-check-fixture.js');const signalId=await finalCheckProposal(f,a,e);
 const view=await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest);expect(view.postLockItems).toEqual([expect.objectContaining({signalId,evidenceAfterLock:true})]);
 expect((await f.admin.query("SELECT reason FROM app.shadow_signal_ineligibility WHERE tenant_id=$1 AND job_id=$2 AND signal_id=$3",[a.tenantId,a.jobId,signalId])).rows).toContainEqual({reason:'evidence_after_lock'});
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
it("SV5-14 B3 post-lock-only evidence must NOT become a reveal and is classified as an exclusion",async()=>{
 const {finalCheckProposal}=await import('./final-check-fixture.js'),{reconcileFinalCheck}=await import('@jobguard/core');
 const a=await seedFinalCheckJob(f);await a.lock();const evidence=await insertFinalCheckEvidence(f,a),signalId=await finalCheckProposal(f,a,evidence);
 const repo=new FinalCheckRepository(f.shadow),m=await repo.begin(a.context,a.jobId),signal=m.signals.find(s=>s.signalId===signalId)!;
 const classification={signalId,expectedRevision:signal.revision,outcome:'reveal' as const,references:[],comparisons:{baselineItemIds:[a.scopeItemId],captureIds:[],lockedLineIds:[a.lineId]}};
 // Direct routine enforcement must refuse even a caller proposing reveal from a post-lock link.
 await expect(repo.reconcile(a.context,a.jobId,m.id,[classification])).rejects.toThrow('FINAL_CHECK_SOURCE_CHANGED');
 expect(signal.evidenceIds).toEqual([]);expect(m.sources).toEqual([]);
 const reconciled=reconcileFinalCheck({...signal,tenantId:a.tenantId,jobId:a.jobId,scopeArea:'job',hasEvidence:signal.evidenceIds.length>0},m.comparisons);
 expect(reconciled.outcome).toBe('not_enough_evidence');
 await repo.reconcile(a.context,a.jobId,m.id,[{signalId,expectedRevision:signal.revision,...reconciled}]);
 const view=await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest);
 expect(view).toMatchObject({state:'completed',items:[]});expect(view.postLockItems).toEqual([expect.objectContaining({signalId,evidenceAfterLock:true})]);
 expect((await f.admin.query('SELECT state,outcome FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 AND id=$3',[a.tenantId,a.jobId,signalId])).rows[0]).toEqual({state:'reconciled',outcome:'not_enough_evidence'});
 expect((await f.admin.query('SELECT outcome FROM app.shadow_signal_classification WHERE tenant_id=$1 AND job_id=$2 AND signal_id=$3',[a.tenantId,a.jobId,signalId])).rows).toEqual([{outcome:'not_enough_evidence'}]);
});
it("SV5-14 SV5-25 B3 valid pre-lock evidence permits reveal while manifest evidenceIds exclude later links",async()=>{
 const {finalCheckProposal,finalCheckTenant}=await import('./final-check-fixture.js'),{reconcileFinalCheck}=await import('@jobguard/core');
 const a=await seedFinalCheckJob(f),preLock=await insertFinalCheckEvidence(f,a),signalId=await finalCheckProposal(f,a,preLock);await a.lock();
 const postLock=await insertFinalCheckEvidence(f,a);
 await finalCheckTenant(f.shadow,a.tenantId,db=>db.query('INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) SELECT tenant_id,job_id,$1,id,object_version_id,sha256,server_received_at FROM app.evidence_object WHERE tenant_id=$2 AND job_id=$3 AND id=$4',[signalId,a.tenantId,a.jobId,postLock]));
 const repo=new FinalCheckRepository(f.shadow),m=await repo.begin(a.context,a.jobId),signal=m.signals.find(s=>s.signalId===signalId)!,source=m.sources[0]!;
 expect(signal.evidenceIds).toEqual([preLock]);expect(m.sources.map(s=>s.evidenceId)).toEqual([preLock]);
 await repo.record(a.context,a.jobId,m.id,source.id,randomUUID(),{version:'final-check.source-result.v1',inputHash:source.inputHash,status:'detected',failureCode:null,signalIds:[signalId]});
 const reconciled=reconcileFinalCheck({...signal,tenantId:a.tenantId,jobId:a.jobId,scopeArea:'job',hasEvidence:signal.evidenceIds.length>0},m.comparisons);
 expect(reconciled.outcome).toBe('reveal');
 await repo.reconcile(a.context,a.jobId,m.id,[{signalId,expectedRevision:signal.revision,...reconciled}]);
 const view=await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest);
 expect(view.items).toEqual([expect.objectContaining({signalId})]);expect(view.postLockItems).toEqual([expect.objectContaining({signalId,evidenceAfterLock:true})]);
});
