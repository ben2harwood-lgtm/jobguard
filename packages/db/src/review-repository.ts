import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { assertReviewConfirmable, proposalReviewV1, ReviewConflictError, type ProposalReview } from "@jobguard/core";
import type { CommandMutation, ConsequentialCommand } from "./commands.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export class ProposalReviewRepository {
  constructor(private readonly pool: Pool) {}

  async save(context: VerifiedTenantContext, raw: unknown, expectedRevision: number): Promise<ProposalReview> {
    const review=proposalReviewV1.parse(raw);
    if(review.revision!==expectedRevision) throw new ReviewConflictError("The submitted review revision is stale");
    return withTenant(this.pool,context,async db=>{
      const current=(await db.$client.query<{revision:number;state:string}>(`SELECT revision,state FROM app.proposal_review WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[context.tenantId,review.reviewId])).rows[0];
      if(current && (current.revision!==expectedRevision || current.state!=="reviewing")) throw new ReviewConflictError("The review changed; reconcile before saving");
      const proposal=(await db.$client.query<{proposal:{questions:Array<{question:{value:string}}>}}>(`SELECT proposal FROM app.job_record_proposal WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,[context.tenantId,review.jobId,review.proposalId])).rows[0];
      if(!proposal) throw new ReviewConflictError("Proposal is unavailable");
      const originalQuestions=proposal.proposal.questions.map(item=>item.question.value).sort();
      const reviewedQuestions=review.questions.map(item=>item.question).sort();
      if(JSON.stringify(originalQuestions)!==JSON.stringify(reviewedQuestions)) throw new ReviewConflictError("Every flagged question must remain in the review");
      if(!current){
        if(expectedRevision!==0) throw new ReviewConflictError("The review does not have the expected revision");
        await db.$client.query(`INSERT INTO app.proposal_review(id,tenant_id,job_id,proposal_id,revision) VALUES($1,$2,$3,$4,0)`,[review.reviewId,context.tenantId,review.jobId,review.proposalId]);
      } else {
        await db.$client.query(`DELETE FROM app.proposal_review_question WHERE tenant_id=$1 AND review_id=$2`,[context.tenantId,review.reviewId]);
        await db.$client.query(`DELETE FROM app.proposal_review_line_parent WHERE tenant_id=$1 AND review_id=$2`,[context.tenantId,review.reviewId]);
        await db.$client.query(`DELETE FROM app.proposal_review_line WHERE tenant_id=$1 AND review_id=$2`,[context.tenantId,review.reviewId]);
      }
      for(const [ordinal,line] of review.lines.entries()){
        await ensureScopeIdentity(db,context.tenantId,review.jobId,line.scopeItemId);
        await db.$client.query(`INSERT INTO app.proposal_review_line(id,tenant_id,review_id,job_id,scope_item_id,origin,description,room,category,quantity_decimal,unit,unit_price_pence,disposition,dismissal_reason,source_excerpt,ordinal) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[line.id,context.tenantId,review.reviewId,review.jobId,line.scopeItemId,line.origin,line.description,line.room,line.category,line.quantity,line.unit,line.unitPricePence,line.disposition,line.dismissalReason,line.sourceExcerpt,ordinal+1]);
        for(const parent of line.parentScopeItemIds) await db.$client.query(`INSERT INTO app.proposal_review_line_parent(tenant_id,job_id,review_id,line_id,parent_scope_item_id) VALUES($1,$2,$3,$4,$5)`,[context.tenantId,review.jobId,review.reviewId,line.id,parent]);
      }
      for(const q of review.questions) await db.$client.query(`INSERT INTO app.proposal_review_question(id,tenant_id,job_id,review_id,question,blocking,disposition,answer) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[q.id,context.tenantId,review.jobId,review.reviewId,q.question,q.blocking,q.disposition,q.answer]);
      const next=expectedRevision+1;
      await db.$client.query(`UPDATE app.proposal_review SET revision=$3,updated_at=transaction_timestamp() WHERE tenant_id=$1 AND id=$2`,[context.tenantId,review.reviewId,next]);
      return {...review,revision:next};
    });
  }
}

async function ensureScopeIdentity(db:TenantTransaction,tenantId:string,jobId:string,scopeId:string){
  await db.$client.query(`INSERT INTO app.scope_identity(id,tenant_id,job_id) VALUES($1,$2,$3) ON CONFLICT (tenant_id,id) DO NOTHING`,[scopeId,tenantId,jobId]);
  const valid=(await db.$client.query(`SELECT 1 FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,[tenantId,jobId,scopeId])).rowCount;
  if(!valid) throw new ReviewConflictError("Scope identity belongs to another job");
}

export class ConfirmProposalReview implements CommandMutation<{jobId:string;reviewId:string;jobRevision:number;status:"quoting"}> {
  constructor(private readonly review:ProposalReview, private readonly failAfterScope=false){assertReviewConfirmable(review);}
  async mutate(db:TenantTransaction,command:ConsequentialCommand){
    const tenantId=(await db.$client.query<{tenant:string}>(`SELECT current_setting('app.tenant_id') tenant`)).rows[0]!.tenant;
    const locked=(await db.$client.query<{revision:number;state:string}>(`SELECT revision,state FROM app.proposal_review WHERE tenant_id=$1 AND id=$2 AND job_id=$3 FOR UPDATE`,[tenantId,this.review.reviewId,this.review.jobId])).rows[0];
    if(!locked || locked.revision!==this.review.revision || locked.state!=="reviewing" || command.action.aggregateRevision!==this.review.revision) throw new ReviewConflictError("The review changed; reconcile before confirming");
    const job=(await db.$client.query<{revision:number;status:string}>(`SELECT revision,status FROM app.job WHERE tenant_id=$1 AND id=$2`,[tenantId,this.review.jobId])).rows[0];
    if(!job || job.status!=="draft") throw new ReviewConflictError("Job is no longer awaiting review");
    for(const line of this.review.lines.filter(x=>x.disposition==="accepted"||x.origin==="human")){
      await db.$client.query(`UPDATE app.scope_identity SET state='confirmed' WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,[tenantId,this.review.jobId,line.scopeItemId]);
      const total=line.unitPricePence;
      await db.$client.query(`INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,$9)`,[randomUUID(),tenantId,this.review.jobId,line.scopeItemId,line.description,line.quantity,line.unit,line.unitPricePence,total]);
      await db.$client.query(`INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) VALUES($1,$2,$3)`,[tenantId,this.review.jobId,line.scopeItemId]);
      for(const parent of line.parentScopeItemIds) await db.$client.query(`INSERT INTO app.scope_lineage(tenant_id,job_id,parent_scope_item_id,child_scope_item_id,kind) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[tenantId,this.review.jobId,parent,line.scopeItemId,line.parentScopeItemIds.length>1?"merge":"split"]);
    }
    for(const line of this.review.lines.filter(x=>x.disposition==="dismissed"||x.disposition==="split"||x.disposition==="merged")) await db.$client.query(`UPDATE app.scope_identity SET state='retired' WHERE tenant_id=$1 AND job_id=$2 AND id=$3`,[tenantId,this.review.jobId,line.scopeItemId]);
    if(this.failAfterScope) throw new Error("SYNTHETIC_CONFIRMATION_FAILURE");
    await db.$client.query(`UPDATE app.proposal_review SET state='confirmed',confirmed_at=transaction_timestamp(),updated_at=transaction_timestamp() WHERE tenant_id=$1 AND id=$2`,[tenantId,this.review.reviewId]);
    const transitioned=(await db.$client.query<{revision:number}>(`SELECT revision FROM app.transition_job($1,$2,$3,'quoting','start_quote')`,[tenantId,this.review.jobId,job.revision])).rows[0]!;
    return {jobId:this.review.jobId,reviewId:this.review.reviewId,jobRevision:transitioned.revision,status:"quoting" as const};
  }
}

export function reviewContentHash(review:ProposalReview){return createHash("sha256").update(JSON.stringify(review)).digest("hex");}
