import { PracticeAccess } from "../practice-access.js";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { CAPTURE_PROMPT_VERSION, CAPTURE_SCHEMA_VERSION, captureRequestV1 } from "@jobguard/core";
import { extractCaptureFixture,PINNED_CAPTURE_MODEL,readSpokenJob,understoodLabels } from "@jobguard/ai";
import { CaptureRepository,CommandError,ConfirmProposalReview,DiscardDraftJob,DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,ProposalReviewRepository,UserCommandDispatcher,reviewContentHash} from "@jobguard/db";
import { captureJobStatusV1,discardDraftCommandV1,reviewConfirmCommandV1,reviewSaveCommandV1,type CaptureWorkspaceResponse } from "./contracts.js";

/* V2-SQ-C plan-check condition 4: plan templates attach tasks by category, and splashback-decorating.v1 holds
 * Tiling and Decorating tasks. Until SQ-F, a spoken Tiling or Decorating line reaches the review as "Other", so
 * a spoken floor-tiling or bedroom-painting line gets no splashback or hall task. A category the builder types is unchanged. */
export const planSafeCategory=(category:string)=>category==="Tiling"||category==="Decorating"?"Other":category;
/** V2-SQ-D: the room and whole-job prices Reader A kept under the money rule, as typed data with their cited words. */
export function saidPrices(sourceId:string,text:string):{roomPrices:{room:string;pence:number;words:string}[];wholeJobPrice:{pence:number;words:string}|null}{
 try{const job=readSpokenJob(sourceId,text);const names=new Map(job.areas.map(area=>[area.key,area.name.value]));
  const words=(provenance:{kind:string;span?:{start:number;end:number}})=>provenance.kind==="extracted"&&provenance.span?text.slice(provenance.span.start,provenance.span.end):"";
  return{roomPrices:job.areaPrices.map(price=>({room:names.get(price.areaKey)??"Whole job",pence:price.pence,words:words(price.provenance)})),
   wholeJobPrice:job.wholeJobPrice?{pence:job.wholeJobPrice.pence,words:words(job.wholeJobPrice.provenance)}:null}}
 catch{return{roomPrices:[],wholeJobPrice:null}}
}
export class CaptureApplicationError extends Error{constructor(readonly code:"INVALID_CAPTURE"|"TENANT_FORBIDDEN"|"NOT_FOUND"|"REVIEW_REVISION_CONFLICT"|"REVIEW_INCOMPLETE"|"COMMAND_CONFLICT"|"DISCARD_DRAFT_REFUSED"){super(code)}}
export class CaptureApplication{ private readonly access: PracticeAccess; 
 private captureRepo;private reviewRepo;private dispatcher;
 constructor(pool:Pool, sessionId?: string){this.access = new PracticeAccess(pool, sessionId);this.captureRepo=new CaptureRepository(pool);this.reviewRepo=new ProposalReviewRepository(pool);this.dispatcher=new UserCommandDispatcher(pool)}
 async capture(raw:unknown){const practice = await this.access.session();const parsed=captureRequestV1.safeParse(raw);if(!parsed.success)throw new CaptureApplicationError("INVALID_CAPTURE");if(parsed.data.requested_tenant_id!==DEMO_TENANT_ID)throw new CaptureApplicationError("TENANT_FORBIDDEN");const proposal=await extractCaptureFixture(parsed.data.captureId,parsed.data.source.text,parsed.data.fixtureId);const saved=await this.captureRepo.persist(practice.context,{practiceSessionDigest:practice.digest,captureId:parsed.data.captureId,text:parsed.data.source.text,sourceKind:parsed.data.source.kind,acquisition:parsed.data.source.kind==="browser_local_transcript"?parsed.data.source.acquisition:null,proposal,promptVersion:CAPTURE_PROMPT_VERSION,schemaVersion:CAPTURE_SCHEMA_VERSION,model:PINNED_CAPTURE_MODEL});return this.view(saved.job_id)}
 async view(jobId:string):Promise<CaptureWorkspaceResponse>{const practice = await this.access.job(jobId);const captured=await this.captureRepo.readByJob(practice.context,jobId);if(!captured)throw new CaptureApplicationError("NOT_FOUND");const review=await this.reviewRepo.read(practice.context,jobId);const p=captured.proposal;return{version:1,environment:"synthetic_demo",captureId:captured.capture_id,jobId,proposalId:captured.id,reviewId:review?.reviewId??randomUUID(),source:{text:captured.content_text,version:1,kind:captured.source_kind??"text",acquisition:captured.acquisition_metadata??null,audioByteLength:captured.audio_byte_length??0},proposal:{title:p.title.value,lines:(()=>{const spans=captured.lines.map((x:any)=>x.proposed_data.description.provenance.kind==="extracted"?x.proposed_data.description.provenance.span:null);/* V2-SQ-C: the room and trade Reader A understood from the same words, by where each line starts. */const labels=(()=>{try{return understoodLabels(captured.capture_id,captured.content_text,captured.lines.map((x:any,i:number)=>({start:spans[i]?.start??null,description:x.proposed_data.description.value})))}catch{/* Labels are an aid: a source Reader A cannot read still opens, as one area. */return captured.lines.map(()=>({room:"Whole job",category:"Other",roomInferred:true}))}})();return captured.lines.map((x:any,i:number)=>{const d=x.proposed_data;const span=spans[i];return{id:x.id,scopeItemId:x.scope_item_id,description:d.description,quantity:d.quantity,unit:d.unit,unitPricePence:d.unitPricePence,room:labels[i]!.room,category:planSafeCategory(labels[i]!.category),roomInferred:labels[i]!.roomInferred,sourceExcerpt:span?captured.content_text.slice(span.start,span.end):captured.content_text}})})(),questions:p.questions,...saidPrices(captured.capture_id,captured.content_text)},review,status:captureJobStatusV1.parse(captured.status)}}
 async save(jobId:string,raw:unknown){const practice = await this.access.job(jobId);const command=reviewSaveCommandV1.safeParse(raw);if(!command.success||command.data.review.jobId!==jobId)throw new CaptureApplicationError("INVALID_CAPTURE");try{await this.reviewRepo.save(practice.context,command.data.review,command.data.expectedRevision);return this.view(jobId)}catch(e){throw this.map(e)}}
 async confirm(jobId:string,raw:unknown){const practice = await this.access.job(jobId);const command=reviewConfirmCommandV1.safeParse(raw);if(!command.success)throw new CaptureApplicationError("INVALID_CAPTURE");const review=await this.reviewRepo.read(practice.context,jobId);if(!review||review.revision!==command.data.expectedRevision)throw new CaptureApplicationError("REVIEW_REVISION_CONFLICT");const cmd={version:"command.v1" as const,commandId:command.data.commandId,commandType:"confirm_proposal_review",semanticKey:`job:${jobId}:confirm:${review.proposalId}`,actorMembershipId:DEMO_MEMBERSHIP_ID,subjectType:"job",subjectRef:jobId,action:{actionType:"confirm_scope",recipient:null,contentHash:reviewContentHash(review),aggregateRevision:review.revision,amountPence:null,currency:null,policyVersion:"synthetic-uiwire-1",expiresAt:new Date(Date.now()+300000)}};try{await this.dispatcher.dispatch(practice.context,cmd,new ConfirmProposalReview(review));return{...(await this.view(jobId)),status:"quoting" as const}}catch(e){throw this.map(e)}}
 async discard(jobId: string, raw: unknown) {
  const practice = await this.access.job(jobId);
  const command = discardDraftCommandV1.safeParse(raw);
  if (!command.success) throw new CaptureApplicationError("INVALID_CAPTURE");

  const { commandId, expectedRevision } = command.data;
  const subjectRef = jobId.toLowerCase();
  const semanticKey = `job:${subjectRef}:discard`;
  try {
   return await this.dispatcher.dispatch(practice.context, {
    version: "command.v1", commandId, commandType: "job.discard_draft", semanticKey,
    actorMembershipId: practice.membershipId, subjectType: "job", subjectRef,
    action: {
     actionType: "discard_draft", recipient: null,
     contentHash: createHash("sha256").update(`${semanticKey}:${expectedRevision}`).digest("hex"),
     aggregateRevision: expectedRevision, amountPence: null, currency: null,
     policyVersion: "synthetic-uiwire-1", expiresAt: new Date(Date.now() + 300000),
    },
   }, {
    // Use Confirm's job lock before begin_command, preserving replay and lock order.
    async lock(db) {
     await db.$client.query("SELECT pg_advisory_xact_lock(hashtext(current_setting('app.tenant_id')),hashtext($1))", [subjectRef]);
    },
    async mutate(db, authorized) {
     // Check the stored job revision in the command transaction before the routine
     // refuses a non-draft job (including one another tab has just confirmed).
     const current = (await db.$client.query<{ revision: number }>(
      "SELECT revision FROM app.job WHERE tenant_id=$1 AND id=$2", [practice.context.tenantId, subjectRef],
     )).rows[0];
     if (current && current.revision !== expectedRevision) {
      throw new CaptureApplicationError("REVIEW_REVISION_CONFLICT");
     }
     return new DiscardDraftJob(practice.context.tenantId).mutate(db, authorized);
    },
   });
  } catch (error) {
   const failure = error as { code?: string; message?: string };
   // Revision checks in the dispatcher may fail before the discard routine's own check.
   if (failure.code === "40001") {
    throw new CaptureApplicationError("REVIEW_REVISION_CONFLICT");
   }
   if ((failure.code === "22023" && failure.message === "DISCARD_DRAFT_REFUSED") ||
    (error instanceof CommandError && error.code !== "COMMAND_CONFLICT")) {
    throw new CaptureApplicationError("DISCARD_DRAFT_REFUSED");
   }
   throw this.map(error);
  }
 }
 private map(e:unknown){const code=(e as {code?:string}).code;if(code==="REVIEW_REVISION_CONFLICT"||code==="REVIEW_INCOMPLETE"||code==="COMMAND_CONFLICT")return new CaptureApplicationError(code);throw e}
}
