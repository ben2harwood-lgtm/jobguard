import { FinalCheckError,finalCheckTaskV1,checkSourceCompletion,isBuilderCaptureNotScanned } from "@jobguard/core";
import type { VerifiedTenantContext,FinalCheckManifest,FinalCheckSourceResult } from "@jobguard/db";
export interface FinalCheckWorkerPorts{
 read(context:VerifiedTenantContext,request:{version:"final-check.task.v1";jobId:string;manifestId:string}):Promise<FinalCheckManifest>;
 process(context:VerifiedTenantContext,manifest:FinalCheckManifest,source:FinalCheckManifest['sources'][number]):Promise<FinalCheckSourceResult>;
 record(context:VerifiedTenantContext,manifest:FinalCheckManifest,source:FinalCheckManifest['sources'][number],result:FinalCheckSourceResult):Promise<unknown>;
 reconcile(context:VerifiedTenantContext,manifest:FinalCheckManifest):Promise<unknown>;
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
   if(source.status==="zero_result"||source.status==="detected"||isBuilderCaptureNotScanned(source))continue;
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
