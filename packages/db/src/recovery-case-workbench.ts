import type { RecoverySourceView } from "./recovery-case-sources.js";

export type RecoveryHistoryEntry = {
 id: string; kind: string; revision: number | null; amountPence: number | null;
 fromState: string | null; toState: string | null; reviewerRef: string | null;
 recordedAt: string; hash: string | null; previousHash: string | null;
};
export type RecoveryWorkbenchDetails = {
 canCommand: boolean; claimRevision: number;
 lastDisputedNetPence: number | null; manualReversedNetPence: number; approvedReversedNetPence: number;
 evidenceStatus: "sources_unresolved" | "not_assembled" | "assembled";
 ambiguity: string[]; history: RecoveryHistoryEntry[];
};

/** Correlated with the outer recovery_case_current row: amounts and all history share one SQL snapshot.
 * Only public case facts; no held signals, including for counts/completeness hints. */
export const recoveryWorkbenchHistorySql = `SELECT coalesce(jsonb_agg(h ORDER BY created_at,kind,revision NULLS LAST,id),'[]'::jsonb) FROM (
  SELECT id,event_type::text kind,sequence revision,amount_pence,from_state::text,to_state::text,reviewer_ref::text,created_at,payload_hash::text subject_hash,previous_hash::text
   FROM app.recovery_case_event WHERE tenant_id=c.tenant_id AND job_id=c.job_id AND case_id=c.id
  UNION ALL SELECT id,'claim_revision',revision,claimed_net_pence,NULL,NULL,reviewer_ref,created_at,subject_hash,previous_hash
   FROM app.recovery_claim_revision WHERE tenant_id=c.tenant_id AND job_id=c.job_id AND case_id=c.id
  UNION ALL SELECT id,'eligibility_'||status,revision,eligible_net_pence,NULL,NULL,reviewer_ref,created_at,subject_hash,previous_hash
   FROM app.recovery_eligibility_revision WHERE tenant_id=c.tenant_id AND job_id=c.job_id AND case_id=c.id
  UNION ALL SELECT id,'eligibility_v3_review',revision,NULL,NULL,NULL,'membership:'||actor_membership_id::text,created_at,payload_hash,NULL
   FROM app.recovery_eligibility_v3_review WHERE tenant_id=c.tenant_id AND job_id=c.job_id AND case_id=c.id
  UNION ALL SELECT id,'approved_landing',NULL,eligible_net_pence,NULL,NULL,NULL,created_at,NULL,NULL
   FROM app.landing_allocation WHERE tenant_id=c.tenant_id AND job_id=c.job_id AND case_id=c.id
  UNION ALL SELECT r.id,'approved_reversal',NULL,r.eligible_net_pence,NULL,NULL,NULL,r.created_at,NULL,NULL
   FROM app.landing_reversal r JOIN app.landing_allocation a ON(a.tenant_id,a.job_id,a.id)=(r.tenant_id,r.job_id,r.allocation_id)
   WHERE r.tenant_id=c.tenant_id AND r.job_id=c.job_id AND a.case_id=c.id
 ) h`;
export type RecoveryHistoryRow = {
 id:string; kind:string; revision:number|null; amount_pence:string|number|null;
 from_state:string|null; to_state:string|null; reviewer_ref:string|null;
 created_at:Date|string; subject_hash:string|null; previous_hash:string|null;
};
export function projectRecoveryWorkbench(
 rows: readonly RecoveryHistoryRow[], sources: readonly RecoverySourceView[], canCommand: boolean,
): RecoveryWorkbenchDetails {
 const history = rows.map(row => ({id:row.id,kind:row.kind,revision:row.revision,
  amountPence:row.amount_pence===null?null:Number(row.amount_pence),fromState:row.from_state,toState:row.to_state,
  reviewerRef:row.reviewer_ref,recordedAt:new Date(row.created_at).toISOString(),hash:row.subject_hash,previousHash:row.previous_hash}));
 const events = history.filter(row=>row.toState!==null).sort((a,b)=>(a.revision??0)-(b.revision??0));
 const dispute = events.filter(row=>row.kind==="dispute").at(-1);
 const unresolved = sources.length===0 || sources.some(source=>!source.recorded);
 const assembled = events.some(row=>row.kind==="assemble_evidence");
 const ambiguity:string[]=[];
 if(unresolved)ambiguity.push("Some source references have no verified stored source. Check the evidence pack for missing originals and versions.");
 if(!assembled)ambiguity.push("Evidence has not been recorded as assembled.");
 if(dispute?.amountPence===null)ambiguity.push("The latest dispute has no recorded amount. Its amount is unknown; it is not zero.");
 return {canCommand,claimRevision:history.filter(row=>row.kind==="claim_revision").reduce((revision,row)=>Math.max(revision,row.revision??0),0),
  lastDisputedNetPence:dispute?.amountPence??null,
  manualReversedNetPence:history.filter(row=>row.kind==="reverse_landing").reduce((sum,row)=>sum+(row.amountPence??0),0),
  approvedReversedNetPence:history.filter(row=>row.kind==="approved_reversal").reduce((sum,row)=>sum+(row.amountPence??0),0),
  evidenceStatus:unresolved?"sources_unresolved":assembled?"assembled":"not_assembled",ambiguity,history};
}
