import { z } from "zod";
import { FinalCheckError,observationV1,type Observation } from "@jobguard/core";
import type { VerifiedTenantContext } from "./tenant-context.js";
import { FinalCheckRepository,type FinalCheckManifest } from "./final-check-repository.js";
export type FinalCheckDecodedSource={source:FinalCheckManifest['sources'][number];observation:Observation|null;failureCode:"UNSUPPORTED_SOURCE"|"SOURCE_INVALID"|null};
/** Explicit finalized synthetic observations only. Missing adapters stay accounted for and incomplete. */
export class FinalCheckSourceReader{
 private readonly fixtures:readonly Observation[];
 constructor(private readonly repo:FinalCheckRepository,fixtures:readonly unknown[]){this.fixtures=fixtures.map(o=>observationV1.parse(o));}
 async read(context:VerifiedTenantContext,raw:unknown){const p=z.object({version:z.literal("final-check.task.v1"),jobId:z.string().uuid(),manifestId:z.string().uuid()}).strict().safeParse(raw);if(!p.success)throw new FinalCheckError("INVALID_FINAL_CHECK_INPUT");const manifest=await this.repo.manifest(context,p.data.jobId,p.data.manifestId);
  const sources:FinalCheckDecodedSource[]=manifest.sources.map(source=>{
   const observation=this.fixtures.find(o=>o.tenantId===context.tenantId&&o.jobId===p.data.jobId&&o.evidence.id===source.evidenceId&&o.evidence.objectVersionId===source.objectVersionId&&o.evidence.sha256===source.sha256&&o.evidence.serverReceivedAt===source.receivedAt)??null;
   return {source,observation:source.processable?observation:null,failureCode:!source.processable?"SOURCE_INVALID":observation?null:"UNSUPPORTED_SOURCE"};
  });return {manifest,sources};
 }
}
