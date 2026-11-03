import { assertLp4SealedEvents } from "./lp4-writer-catchup-fixture.js";
import {afterAll,beforeAll,expect,it} from "vitest";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,availableFinalCheck,type FinalCheckFixture} from "./final-check-fixture.js";
import {FinalCheckRepository} from "../src/final-check-repository.js";
let f:FinalCheckFixture;beforeAll(async()=>{f=await createFinalCheckFixture()},60000);afterAll(async()=>closeFinalCheckFixture(f));
it("SV5-04 empty inventory records explicit zero-result; SV5-29 fresh connection reads the same lock/run",async()=>{
 const a=await seedFinalCheckJob(f);await a.lock();const worker=new FinalCheckRepository(f.shadow),m=await worker.begin(a.context,a.jobId);expect(m.sources).toEqual([]);
 const result=await worker.reconcile(a.context,a.jobId,m.id,[]) as {runId:string;zeroResult:boolean};expect(result.zeroResult).toBe(true);
 const view=await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest);expect(view).toMatchObject({state:'completed',runId:result.runId,lockId:m.lockId,items:[]});
 await assertLp4SealedEvents(f.admin, a.tenantId, "final_check.result_available");
 expect((await worker.manifest(a.context,a.jobId,m.id)).result?.runId).toBe(result.runId);
});
it("SV5-06 locked baseline match stays excluded; mutable later work cannot substitute",async()=>{
 const a=await seedFinalCheckJob(f);await availableFinalCheck(f,a,'already_in_original_scope');expect((await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest)).items).toEqual([]);
});
it("SV5-15 exact finalized synthetic source/date and absence comparisons are persisted",async()=>{
 const a=await seedFinalCheckJob(f),r=await availableFinalCheck(f,a);const view=await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest);
 expect(view.items).toHaveLength(1);expect(view.items[0]).toMatchObject({signalId:r.signalId,description:'Outside tap',comparisons:{baselineItemIds:[a.scopeItemId],captureIds:[],lockedLineIds:[a.lineId]}});
 expect(view.items[0]!.evidence).toEqual([expect.objectContaining({objectVersionId:expect.any(String),sha256:'a'.repeat(64),receivedAt:expect.stringMatching(/\.\d{6}Z$/u),source:'completion_photo'})]);
});
it("SV5-05 SV5-07 final-review capture at lock excludes an earlier signal even when unpriced",async()=>{
 const {randomUUID}=await import('node:crypto'),{VariationRepository}=await import('../src/variation-repository.js'),{insertFinalCheckEvidence,finalCheckProposal}=await import('./final-check-fixture.js');
 const a=await seedFinalCheckJob(f),e=await insertFinalCheckEvidence(f,a),signalId=await finalCheckProposal(f,a,e),captureId=randomUUID();
 await new VariationRepository(f.runtime).addFinalReviewExtra(a.context,{version:'final-review-extra.v1',actorMembershipId:'d1500000-0000-4000-8000-000000000003',proposal:{version:'variation-proposal.v1',id:captureId,jobId:a.jobId,scopeItemId:randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:'text',captureText:'outside tap',description:'outside tap',suggestion:null},price:null,deviceId:null,deviceCapturedAt:null});
 await a.lock();const worker=new FinalCheckRepository(f.shadow),m=await worker.begin(a.context,a.jobId),s=m.sources[0]!;
 await worker.record(a.context,a.jobId,m.id,s.id,randomUUID(),{version:'final-check.source-result.v1',inputHash:s.inputHash,status:'detected',failureCode:null,signalIds:[signalId]});
 await worker.reconcile(a.context,a.jobId,m.id,[{signalId,expectedRevision:0,outcome:'builder_captured',references:[captureId],comparisons:{baselineItemIds:[a.scopeItemId],captureIds:[captureId],lockedLineIds:[a.lineId]}}]);
 expect((await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest)).items).toEqual([]);
});
it("SV5-08 classification refuses another revision/job's locked-line substitute",async()=>{
 const {randomUUID}=await import('node:crypto'),{insertFinalCheckEvidence,finalCheckProposal}=await import('./final-check-fixture.js');const a=await seedFinalCheckJob(f),e=await insertFinalCheckEvidence(f,a),signalId=await finalCheckProposal(f,a,e);await a.lock();const worker=new FinalCheckRepository(f.shadow),m=await worker.begin(a.context,a.jobId),s=m.sources[0]!;
 await worker.record(a.context,a.jobId,m.id,s.id,randomUUID(),{version:'final-check.source-result.v1',inputHash:s.inputHash,status:'detected',failureCode:null,signalIds:[signalId]});
 await expect(worker.reconcile(a.context,a.jobId,m.id,[{signalId,expectedRevision:0,outcome:'already_on_final_account',references:[randomUUID()],comparisons:{baselineItemIds:[a.scopeItemId],captureIds:[],lockedLineIds:[a.lineId]}}])).rejects.toThrow('FINAL_CHECK_SOURCE_CHANGED');
 expect((await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest)).state).toBe('pending');
});
it("SV5-10 existing early disclosure remains an exclusion and cannot be converted to reveal",async()=>{
 const {randomUUID}=await import('node:crypto'),{insertFinalCheckEvidence,finalCheckProposal,finalCheckTenant}=await import('./final-check-fixture.js');
 const a=await seedFinalCheckJob(f),e=await insertFinalCheckEvidence(f,a),signalId=await finalCheckProposal(f,a,e);
 await finalCheckTenant(f.shadow,a.tenantId,db=>db.query('SELECT app.record_shadow_disclosure($1,$2,$3,$4,$5)',[a.tenantId,a.jobId,signalId,randomUUID(),'must_surface_override']));
 await a.lock();const worker=new FinalCheckRepository(f.shadow),m=await worker.begin(a.context,a.jobId),source=m.sources[0]!,sig=m.signals.find(s=>s.signalId===signalId)!;
 await worker.record(a.context,a.jobId,m.id,source.id,randomUUID(),{version:'final-check.source-result.v1',inputHash:source.inputHash,status:'detected',failureCode:null,signalIds:[signalId]});
 const classification={signalId,expectedRevision:sig.revision,outcome:'reveal' as const,references:[],comparisons:{baselineItemIds:[a.scopeItemId],captureIds:[],lockedLineIds:[a.lineId]}};
 await expect(worker.reconcile(a.context,a.jobId,m.id,[classification])).rejects.toThrow('FINAL_CHECK_SOURCE_CHANGED');
 await worker.reconcile(a.context,a.jobId,m.id,[{...classification,outcome:'not_enough_evidence'}]);
 expect((await f.admin.query('SELECT disclosed_before_lock,state FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND id=$2',[a.tenantId,signalId])).rows[0]).toMatchObject({disclosed_before_lock:true,state:'surfaced_early'});
});
