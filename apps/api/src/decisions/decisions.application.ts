import { PracticeAccess } from "../practice-access.js";
import type{Pool}from"pg";
import { DEMO_TENANT_ID, UserCommandDispatcher, evaluateDecisionChecks, listDecisionInbox, withTenant } from "@jobguard/db";
import{decisionQueryV1,decisionResolutionWebCommandV1,findingEvaluationCommandV1}from"./contracts.js";

export class DecisionsError extends Error{constructor(readonly code:"FORBIDDEN"|"NOT_FOUND"|"INVALID_COMMAND"|"CONFLICT"){super(code)}}

const view=(rows:any[])=>{const decisions=rows.map(row=>({id:row.decision_id,findingId:row.id,fingerprint:row.fingerprint,jobId:row.job_id,jobLabel:row.job_title,title:row.title,detail:row.detail,classification:row.classification,resolution:row.resolution??"open",source:{type:"Persisted job fact snapshot",subjectRef:row.subject_ref,snapshotRevision:row.snapshot_revision},rule:{id:row.rule_id,version:row.rule_version},actionHref:row.kind==="required_proof"?`/jobs/${row.job_id}#work-proof`:`/jobs/${row.job_id}#materials-review`,authorizedAction:Boolean(row.authorized_action)}));return{version:"decision-inbox.v1" as const,decisions,counts:{mandatory:decisions.filter(x=>x.classification==="mandatory"&&x.resolution==="open").length,advisory:decisions.filter(x=>x.classification==="advisory"&&x.resolution==="open").length,pending:decisions.filter(x=>x.resolution==="open").length}};};
export class DecisionsApplication{ private readonly access: PracticeAccess; constructor(private readonly pool:Pool, sessionId?: string){this.access = new PracticeAccess(pool, sessionId);}
 async list(raw:unknown){const practice = await this.access.command(raw, "list");const parsed=decisionQueryV1.safeParse(raw);if(!parsed.success)throw new DecisionsError("INVALID_COMMAND");const rows=await withTenant(this.pool,practice.context,db=>listDecisionInbox(db,parsed.data.jobId,practice.digest));return view(rows);}
 async evaluate(raw: unknown) {
  const practice = await this.access.command(raw, "evaluate");
  const parsed = findingEvaluationCommandV1.safeParse(raw);
  if (!parsed.success) throw new DecisionsError("INVALID_COMMAND");
  if (parsed.data.tenantId !== DEMO_TENANT_ID) throw new DecisionsError("NOT_FOUND");
  try {
   return await withTenant(this.pool, practice.context, db =>
    evaluateDecisionChecks(db, parsed.data, practice.digest, view));
  } catch (error) {
   if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") throw new DecisionsError("CONFLICT");
   if (error instanceof Error && error.message === "NOT_FOUND") throw new DecisionsError("NOT_FOUND");
   throw error;
  }
 }
 async dismiss(raw:unknown){const practice = await this.access.command(raw, "dismiss");const parsed=decisionResolutionWebCommandV1.safeParse(raw);if(!parsed.success)throw new DecisionsError("INVALID_COMMAND");const membershipId=practice.membershipId;if(!membershipId)throw new DecisionsError("FORBIDDEN");const {tenantId:_,...command}=parsed.data;const result=await new UserCommandDispatcher(this.pool).dismissDecision(practice.context,{...command,semanticKey:`dismiss:${parsed.data.findingFingerprint}`,actorMembershipId:membershipId});return{version:"decision-resolution-result.v1",...result,label:"Dismissed — no action authorized"};}
}
