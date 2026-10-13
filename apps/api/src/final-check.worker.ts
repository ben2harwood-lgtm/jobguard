import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { FinalCheckError,finalCheckTaskV1,checkSourceCompletion,observationV1,detectShadowObservations,reconcileFinalCheck,shadowCaptureV1,observationMustSurface } from "@jobguard/core";
import { FinalCheckRepository,ShadowDetectionRepository,type VerifiedTenantContext,type FinalCheckManifest,type FinalCheckSourceResult } from "@jobguard/db";
export interface FinalCheckWorkerPorts{
 read(context:VerifiedTenantContext,request:{version:"final-check.task.v1";jobId:string;manifestId:string}):Promise<FinalCheckManifest>;
 process(context:VerifiedTenantContext,manifest:FinalCheckManifest,source:FinalCheckManifest['sources'][number]):Promise<FinalCheckSourceResult>;
 record(context:VerifiedTenantContext,manifest:FinalCheckManifest,source:FinalCheckManifest['sources'][number],result:FinalCheckSourceResult):Promise<unknown>;
 reconcile(context:VerifiedTenantContext,manifest:FinalCheckManifest):Promise<unknown>;
}

/** Concrete synthetic processing ports; executable task registration is still STOP Q6. */
export function createFinalCheckWorker(shadowPool:Pool,fixtures:readonly unknown[],environment:string):FinalCheckWorker{
 const repo=new FinalCheckRepository(shadowPool),sink=new ShadowDetectionRepository(shadowPool),observations=fixtures.map(o=>observationV1.parse(o));
 return new FinalCheckWorker({
  read:(context,task)=>repo.manifest(context,task.jobId,task.manifestId),
  async process(context,manifest,source){
   const observation=observations.find(o=>o.tenantId===context.tenantId&&o.jobId===manifest.comparisons.jobId&&o.evidence.id===source.evidenceId&&o.evidence.objectVersionId===source.objectVersionId&&o.evidence.sha256===source.sha256&&o.evidence.serverReceivedAt===source.receivedAt);
   if(!source.processable||!observation)return {version:"final-check.source-result.v1",inputHash:source.inputHash,status:"unsupported",failureCode:!source.processable?"SOURCE_INVALID":"UNSUPPORTED_SOURCE",signalIds:[]};
   // New post-lock mandatory-surface processing must use its own issued orchestration;
   // the merged pre-lock early-disclosure routine cannot be called as a post-lock fallback.
   if(observationMustSurface(observation).firedRules.length) return {version:"final-check.source-result.v1",inputHash:source.inputHash,status:"unsupported",failureCode:"UNSUPPORTED_SOURCE",signalIds:[]};
   const captures=manifest.comparisons.captures.map(c=>shadowCaptureV1.parse(c));
   const proposals=detectShadowObservations([observation],captures,new Date().toISOString());
   await sink.persist(context,{version:"shadow-detection-batch.v1",jobId:manifest.comparisons.jobId,observations:[observation],captures,proposals});
   const fresh=await repo.manifest(context,manifest.comparisons.jobId,manifest.id),signalIds=fresh.signals.filter(s=>s.evidenceIds.includes(source.evidenceId!)).map(s=>s.signalId);
   return {version:"final-check.source-result.v1",inputHash:source.inputHash,status:signalIds.length?"detected":"zero_result",failureCode:null,signalIds};
  },
  record:(context,m,s,result)=>repo.record(context,m.comparisons.jobId,m.id,s.id,randomUUID(),result),
  async reconcile(context,m){
   if(m.result)return {runId:m.result.runId,lockId:m.result.lockId,zeroResult:m.result.zeroResult};
   const baselineCaptures=m.comparisons.baseline.map(line=>shadowCaptureV1.parse({version:"shadow-capture.v1",tenantId:context.tenantId,jobId:m.comparisons.jobId,id:line.scope_item_id,scopeItemId:line.scope_item_id,revisionId:line.commercial_revision_id,serverRecordedAt:m.comparisons.baselineRecordedAt,valuePence:null,kind:"baseline",state:null,scopeArea:"job",description:line.description,recordedPhase:"pre_lock",aiStructured:false,sourceRef:String(line.id)}));
   const locked={...m.comparisons,captures:[...m.comparisons.captures,...baselineCaptures]};
   const classifications=m.signals.map(s=>{
    const result=reconcileFinalCheck({tenantId:context.tenantId,jobId:m.comparisons.jobId,signalId:s.signalId,description:s.description,scopeArea:"job",scopeItemId:s.scopeItemId,coalescedIntoSignalId:s.coalescedIntoSignalId,hasEvidence:s.evidenceIds.length>0,permanentExclusion:s.permanentExclusion},locked);
    // Baseline comparisons are recorded separately; capture-register IDs remain exactly frozen.
    return {signalId:s.signalId,expectedRevision:s.revision,...result,comparisons:{...result.comparisons,captureIds:m.comparisons.captures.map(c=>shadowCaptureV1.parse(c).id)}};
   });
   return repo.reconcile(context,m.comparisons.jobId,m.id,classifications);
  },
 },environment);
}
/** Handler seam only. Q6 registration/scheduling and Q5 invoice publication remain coordinator prerequisites. */
export class FinalCheckWorker{
 constructor(private readonly ports:FinalCheckWorkerPorts,private readonly environment:string){}
 async execute(context:VerifiedTenantContext,raw:unknown){
  if(this.environment!=="synthetic_demo")throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
  const p=finalCheckTaskV1.safeParse(raw);if(!p.success)throw new FinalCheckError("INVALID_FINAL_CHECK_INPUT");
  const manifest=await this.ports.read(context,p.data);
  if(manifest.comparisons.tenantId!==context.tenantId||manifest.comparisons.jobId!==p.data.jobId||manifest.id!==p.data.manifestId)throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
  for(const source of manifest.sources){
   if(source.status==="zero_result"||source.status==="detected")continue;
   let result:FinalCheckSourceResult;
   try{result=await this.ports.process(context,manifest,source);}catch{result={version:"final-check.source-result.v1",inputHash:source.inputHash,status:"failed",failureCode:"PROCESSING_FAILED",signalIds:[]};}
   // Separate port transaction preserves failed attempts before throwing or retrying.
   await this.ports.record(context,manifest,source,result);
  }
  const fresh=await this.ports.read(context,p.data);
  if(fresh.id!==manifest.id||fresh.hash!==manifest.hash||fresh.lockId!==manifest.lockId||fresh.cutoff!==manifest.cutoff||!checkSourceCompletion(manifest.sources,fresh.sources))throw new FinalCheckError("FINAL_CHECK_PENDING");
  return this.ports.reconcile(context,fresh);
 }
}
