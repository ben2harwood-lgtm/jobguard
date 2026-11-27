import type { PilotJobAccess } from "../workspace/pilot-job-access.js";
import { PracticeAccess } from "../practice-access.js";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { CAPTURE_PROMPT_VERSION, CAPTURE_SCHEMA_VERSION, captureRequestV1 } from "@jobguard/core";
import { extractCaptureFixture,PINNED_CAPTURE_MODEL } from "@jobguard/ai";
import { CaptureRepository,CommandError,ConfirmProposalReview,DiscardDraftJob,DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,ProposalReviewRepository,UserCommandDispatcher,reviewContentHash} from "@jobguard/db";
import { captureJobStatusV1,discardDraftCommandV1,reviewConfirmCommandV1,reviewSaveCommandV1,type CaptureWorkspaceResponse } from "./contracts.js";

export class CaptureApplicationError extends Error{constructor(readonly code:"INVALID_CAPTURE"|"TENANT_FORBIDDEN"|"NOT_FOUND"|"REVIEW_REVISION_CONFLICT"|"REVIEW_INCOMPLETE"|"COMMAND_CONFLICT"|"DISCARD_DRAFT_REFUSED"){super(code)}}
export class CaptureApplication{ private readonly access: PracticeAccess; 
 private captureRepo;private reviewRepo;private dispatcher;
 constructor(pool:Pool, sessionId?: string, private readonly pilot?: PilotJobAccess){this.access = new PracticeAccess(pool, sessionId);this.captureRepo=new CaptureRepository(pool);this.reviewRepo=new ProposalReviewRepository(pool);this.dispatcher=new UserCommandDispatcher(pool)}
 private async principal(jobId?: string, write = false) {
  if (this.pilot) {
   const actor = await this.pilot(jobId, write);
   return { context: actor.getContext(), membershipId: actor.membershipId, digest: undefined };
  }
  return jobId === undefined ? this.access.session() : this.access.job(jobId);
 }
 async capture(raw: unknown) {
  const actor = await this.principal(undefined, true);
  const parsed = captureRequestV1.safeParse(raw);
  if (!parsed.success) throw new CaptureApplicationError("INVALID_CAPTURE");
  const input = parsed.data;
  if (input.requested_tenant_id !== (this.pilot ? actor.context.tenantId : DEMO_TENANT_ID)) throw new CaptureApplicationError("TENANT_FORBIDDEN");
  const proposal = await extractCaptureFixture(input.captureId, input.source.text, input.fixtureId);
  const saved = await this.captureRepo.persist(actor.context, {
   ...(actor.digest === undefined ? {} : { practiceSessionDigest: actor.digest }),
   captureId: input.captureId, text: input.source.text, sourceKind: input.source.kind,
   acquisition: input.source.kind === "browser_local_transcript" ? input.source.acquisition : null,
   proposal, promptVersion: CAPTURE_PROMPT_VERSION, schemaVersion: CAPTURE_SCHEMA_VERSION,
   model: this.pilot ? "pilot-fixture-capture-v1" : PINNED_CAPTURE_MODEL,
  });
  return this.view(saved.job_id);
 }
 async view(jobId:string):Promise<CaptureWorkspaceResponse>{const actor = await this.principal(jobId);const captured=await this.captureRepo.readByJob(actor.context,jobId);if(!captured)throw new CaptureApplicationError("NOT_FOUND");const review=await this.reviewRepo.read(actor.context,jobId);const p=captured.proposal;return{version:1,environment:this.pilot?"pilot_no_charge":"synthetic_demo",captureId:captured.capture_id,jobId,proposalId:captured.id,reviewId:review?.reviewId??randomUUID(),source:{text:captured.content_text,version:1,kind:captured.source_kind??"text",acquisition:captured.acquisition_metadata??null,audioByteLength:captured.audio_byte_length??0},proposal:{title:p.title.value,lines:captured.lines.map((x:any)=>{const d=x.proposed_data;const span=d.description.provenance.kind==="extracted"?d.description.provenance.span:null;return{id:x.id,scopeItemId:x.scope_item_id,description:d.description,quantity:d.quantity,unit:d.unit,unitPricePence:d.unitPricePence,room:this.pilot?"Job":"Practice job",category:"Work",sourceExcerpt:span?captured.content_text.slice(span.start,span.end):captured.content_text}}),questions:p.questions},review,status:captureJobStatusV1.parse(captured.status)}}
 async save(jobId:string,raw:unknown){const actor = await this.principal(jobId, true);const command=reviewSaveCommandV1.safeParse(raw);if(!command.success||command.data.review.jobId!==jobId)throw new CaptureApplicationError("INVALID_CAPTURE");try{await this.reviewRepo.save(actor.context,command.data.review,command.data.expectedRevision,Boolean(this.pilot));return this.view(jobId)}catch(e){throw this.map(e)}}
 async confirm(jobId:string,raw:unknown){const actor = await this.principal(jobId, true);const command=reviewConfirmCommandV1.safeParse(raw);if(!command.success)throw new CaptureApplicationError("INVALID_CAPTURE");const review=await this.reviewRepo.read(actor.context,jobId);if(!review||review.revision!==command.data.expectedRevision)throw new CaptureApplicationError("REVIEW_REVISION_CONFLICT");const cmd={version:"command.v1" as const,commandId:command.data.commandId,commandType:"confirm_proposal_review",semanticKey:`job:${jobId}:confirm:${review.proposalId}`,actorMembershipId:this.pilot?actor.membershipId:DEMO_MEMBERSHIP_ID,subjectType:"job",subjectRef:jobId,action:{actionType:"confirm_scope",recipient:null,contentHash:reviewContentHash(review),aggregateRevision:review.revision,amountPence:null,currency:null,policyVersion:"synthetic-uiwire-1",expiresAt:new Date(Date.now()+300000)}};try{await this.dispatcher.dispatch(actor.context,cmd,new ConfirmProposalReview(review));return{...(await this.view(jobId)),status:"quoting" as const}}catch(e){throw this.map(e)}}
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
