import { PracticeAccess } from "../practice-access.js";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { CAPTURE_PROMPT_VERSION, CAPTURE_SCHEMA_VERSION, captureRequestV1, jobUnderstandingV1, toJobRecordProposal, type JobUnderstanding } from "@jobguard/core";
import { extractCaptureFixture,PINNED_CAPTURE_MODEL,readSpokenJob,understoodLabels } from "@jobguard/ai";
import { CaptureRepository,CommandError,ConfirmProposalReview,DiscardDraftJob,DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,ProposalReviewRepository,UserCommandDispatcher,V2AiCallLedger,reviewContentHash,type VerifiedTenantContext} from "@jobguard/db";
import { modelReaderOn, readWithModel, withModelReader, type ModelReaderPorts, type ModelReading } from "./model-reader.js";
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
 private modelPorts:ModelReaderPorts;
 constructor(pool:Pool, sessionId?: string, modelPorts?: ModelReaderPorts){this.access = new PracticeAccess(pool, sessionId);this.captureRepo=new CaptureRepository(pool);this.reviewRepo=new ProposalReviewRepository(pool);this.dispatcher=new UserCommandDispatcher(pool);this.modelPorts=modelPorts??{ledger:new V2AiCallLedger(pool),env:process.env}}
/** `modelReaderNoticeShown`: the screen showed the notice that the words go to the model reader (V2-SQ-G). Without it, no model call. */
 async capture(raw:unknown,options:{modelReaderNoticeShown?:boolean}={}){const practice = await this.access.session();const parsed=captureRequestV1.safeParse(raw);if(!parsed.success)throw new CaptureApplicationError("INVALID_CAPTURE");if(parsed.data.requested_tenant_id!==DEMO_TENANT_ID)throw new CaptureApplicationError("TENANT_FORBIDDEN");
  const {captureId,source,fixtureId}=parsed.data;
  // V2-SQ-G (a): a capture id already stored for this owner returns its view, before any reading or model call.
  const prior=await this.captureRepo.findForOwner(practice.context,{practiceSessionDigest:practice.digest,captureId,text:source.text,sourceKind:source.kind,acquisition:source.kind==="browser_local_transcript"?source.acquisition:null});
  if(prior)return this.view(prior.job_id);
  let proposal=await extractCaptureFixture(captureId,source.text,fixtureId);let model:string=PINNED_CAPTURE_MODEL;
  // (b) Reader B only when every switch is on; any failure leaves today's proposal exactly as it was.
  const reading=options.modelReaderNoticeShown===true?await this.modelReading(practice.context,captureId,source.text):{used:false as const};
  if(reading.used){proposal=toJobRecordProposal(reading.understanding);model=withModelReader(PINNED_CAPTURE_MODEL)}
  // (c)/(d) one transaction; a retry of the same source returns what is stored, whichever reader made it.
  const saved=await this.captureRepo.persist(practice.context,{practiceSessionDigest:practice.digest,captureId,text:source.text,sourceKind:source.kind,acquisition:source.kind==="browser_local_transcript"?source.acquisition:null,proposal,promptVersion:CAPTURE_PROMPT_VERSION,schemaVersion:CAPTURE_SCHEMA_VERSION,model,sameSourceIsSame:true,...(reading.used?{understanding:reading.stored}:{})});return this.view(saved.job_id)}
 private async modelReading(context:VerifiedTenantContext,captureId:string,text:string):Promise<ModelReading>{
  if(!modelReaderOn(this.modelPorts.env))return{used:false};
  let readerA:JobUnderstanding;try{const{timeline:_,...a}=readSpokenJob(captureId,text);readerA=a}catch{return{used:false}}
  try{return await readWithModel(this.modelPorts,context,{captureId,text,readerA})}catch{return{used:false}}
 }
 async view(jobId:string):Promise<CaptureWorkspaceResponse>{const practice = await this.access.job(jobId);const captured=await this.captureRepo.readByJob(practice.context,jobId);if(!captured)throw new CaptureApplicationError("NOT_FOUND");const review=await this.reviewRepo.read(practice.context,jobId);const p=captured.proposal;const stored=await this.storedLabels(practice.context,jobId,captured.lines.length);return{version:1,environment:"synthetic_demo",captureId:captured.capture_id,jobId,proposalId:captured.id,reviewId:review?.reviewId??randomUUID(),source:{text:captured.content_text,version:1,kind:captured.source_kind??"text",acquisition:captured.acquisition_metadata??null,audioByteLength:captured.audio_byte_length??0},proposal:{title:p.title.value,lines:(()=>{const spans=captured.lines.map((x:any)=>x.proposed_data.description.provenance.kind==="extracted"?x.proposed_data.description.provenance.span:null);/* V2-SQ-C: the room and trade Reader A understood from the same words, by where each line starts. */const labels=stored??(()=>{try{return understoodLabels(captured.capture_id,captured.content_text,captured.lines.map((x:any,i:number)=>({start:spans[i]?.start??null,description:x.proposed_data.description.value})))}catch{/* Labels are an aid: a source Reader A cannot read still opens, as one area. */return captured.lines.map(()=>({room:"Whole job",category:"Other",roomInferred:true}))}})();return captured.lines.map((x:any,i:number)=>{const d=x.proposed_data;const span=spans[i];return{id:x.id,scopeItemId:x.scope_item_id,description:d.description,quantity:d.quantity,unit:d.unit,unitPricePence:d.unitPricePence,room:labels[i]!.room,category:planSafeCategory(labels[i]!.category),roomInferred:labels[i]!.roomInferred,sourceExcerpt:span?captured.content_text.slice(span.start,span.end):captured.content_text}})})(),questions:p.questions,...saidPrices(captured.capture_id,captured.content_text)},review,status:captureJobStatusV1.parse(captured.status)}}
 /** V2-SQ-G: rooms and trades from the stored understanding, by ordinal. Null (Reader A at view time, as in SQ-C) when there is none. */
 private async storedLabels(context:VerifiedTenantContext,jobId:string,count:number):Promise<{room:string;category:string;roomInferred:boolean}[]|null>{
  const row=await this.captureRepo.readUnderstanding(context,jobId);if(!row)return null;
  const combined=jobUnderstandingV1.safeParse(row.understanding),readerA=jobUnderstandingV1.safeParse(row.reader_a);
  if(!combined.success||!readerA.success||combined.data.lines.length!==count)return null;
  const names=new Map(combined.data.areas.map(area=>[area.key,area]));
  return combined.data.lines.map((line,i)=>{const area=names.get(line.areaKey);const a=readerA.data.lines[i];
   // A room is "said" only when Reader A put this line there itself and the builder spoke the room's name.
   return{room:area?.name.value??"Whole job",category:line.trade.value,roomInferred:!a||a.areaKey!==line.areaKey||area?.name.provenance.kind!=="extracted"}});
 }
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
   }, new DiscardDraftJob(practice.context.tenantId));
  } catch (error) {
   const failure = error as { code?: string; message?: string };
   if (failure.code === "40001" && failure.message === "DISCARD_DRAFT_REVISION_CONFLICT") {
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
