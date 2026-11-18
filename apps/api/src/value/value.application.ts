import { PracticeAccess } from "../practice-access.js";
import type{Pool}from"pg";import { DEMO_TENANT_ID, withTenant } from "@jobguard/db";import{jobValueResponseV1,type JobValueResponse}from"./contracts.js";

type VariationValueRow = { id: string; description: string; revision_id: string; revision: number; signed_delta_pence: string; approved: boolean; rejected: boolean; current: boolean; invoiced: boolean };

// A proposed revision moves the working pointer without superseding an approval.
// Only a newer approval replaces the previous approved commercial amount.
function latestApprovedRevisions(rows: VariationValueRow[]): VariationValueRow[] {
 const latest = new Map<string, VariationValueRow>();
 for (const row of rows) {
  if (!row.approved) continue;
  const previous = latest.get(row.id);
  if (!previous || row.revision > previous.revision) latest.set(row.id, row);
 }
 return [...latest.values()];
}

/** A read-only projection. Amounts and source identities come only from authoritative fact tables. */
export class ValueApplication{ private readonly access: PracticeAccess; constructor(private readonly pool:Pool, sessionId?: string){this.access = new PracticeAccess(pool, sessionId);}async read(jobId:string):Promise<JobValueResponse>{const practice = await this.access.job(jobId);const value=await withTenant(this.pool,practice.context,async db=>{const job=(await db.$client.query<{baseline_quote_version_id:string|null}>("SELECT baseline_quote_version_id FROM app.job WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,jobId])).rows[0];if(!job)throw new Error("JOB_NOT_FOUND");const variations=(await db.$client.query<VariationValueRow>(`SELECT v.id,v.description,r.id revision_id,r.revision,r.signed_delta_pence,(a.id IS NOT NULL) approved,EXISTS(SELECT 1 FROM app.variation_rejection x WHERE (x.tenant_id,x.revision_id)=(r.tenant_id,r.id)) rejected,(r.id=v.current_revision_id) current, EXISTS(
 SELECT 1 FROM app.customer_invoice i
 WHERE i.tenant_id=v.tenant_id AND i.job_id=v.job_id AND (
  EXISTS(SELECT 1 FROM app.final_account_invoice_binding b
   JOIN app.final_account_invoiced_line l ON(l.tenant_id,l.job_id,l.invoice_id,l.revision_id)=(b.tenant_id,b.job_id,b.invoice_id,b.revision_id)
   WHERE (b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id)
    AND l.line_kind='variation' AND l.source_id=r.id AND l.commercial_revision_id=r.id AND l.scope_item_id=r.scope_item_id)
  OR (NOT EXISTS(SELECT 1 FROM app.final_account_invoice_binding b WHERE(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id))
   AND EXISTS(SELECT 1 FROM app.final_account_line l WHERE(l.tenant_id,l.job_id,l.final_account_revision_id)=(i.tenant_id,i.job_id,i.final_account_revision_id)
    AND l.line_kind='variation' AND l.source_id=r.id AND l.commercial_revision_id=r.id AND l.scope_item_id=r.scope_item_id))
 )) invoiced FROM app.variation v JOIN app.variation_revision r ON(r.tenant_id,r.variation_id)=(v.tenant_id,v.id) LEFT JOIN app.variation_approval a ON(a.tenant_id,a.revision_id)=(r.tenant_id,r.id) WHERE v.tenant_id=$1 AND v.job_id=$2 ORDER BY r.created_at,r.id`,[DEMO_TENANT_ID,jobId])).rows;const found=(await db.$client.query<{id:string;description:string;source_signal_id:string;revision_id:string|null;revision:number|null;signed_delta_pence:string|null;approved:boolean}>(`SELECT v.id,v.description,o.source_signal_id,r.id revision_id,r.revision,r.signed_delta_pence,(a.id IS NOT NULL) approved
 FROM app.variation v
 JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.id)
 LEFT JOIN app.variation_revision r ON(r.tenant_id,r.variation_id,r.id)=(v.tenant_id,v.id,v.current_revision_id)
 LEFT JOIN app.variation_approval a ON(a.tenant_id,a.revision_id)=(r.tenant_id,r.id)
 WHERE v.tenant_id=$1 AND v.job_id=$2 AND v.origin='jobguard_catch' AND o.kind='jobguard_catch' AND o.source_signal_id IS NOT NULL
 ORDER BY v.id`,[DEMO_TENANT_ID,jobId])).rows;const invoices=(await db.$client.query<any>(`SELECT i.id,i.invoice_number,i.total_pence,COALESCE((SELECT sum(c.amount_pence) FROM app.customer_credit_note c WHERE(c.tenant_id,c.invoice_id)=(i.tenant_id,i.id)),0) credited_pence,COALESCE((SELECT sum(p.amount_pence) FROM app.customer_payment p WHERE(p.tenant_id,p.invoice_id)=(i.tenant_id,i.id) AND NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal x WHERE(x.tenant_id,x.payment_id)=(p.tenant_id,p.id))),0) recorded_pence FROM app.customer_invoice i WHERE i.tenant_id=$1 AND i.job_id=$2 ORDER BY i.created_at,i.id`,[DEMO_TENANT_ID,jobId])).rows;const quote=job.baseline_quote_version_id?(await db.$client.query<any>(`SELECT d.id,r.revision FROM app.quote_document_version d JOIN app.quote_revision r ON(r.tenant_id,r.id)=(d.tenant_id,d.quote_revision_id) WHERE d.tenant_id=$1 AND d.job_id=$2 AND d.id=$3`,[DEMO_TENANT_ID,jobId,job.baseline_quote_version_id])).rows[0]:null;const blockers=(await db.$client.query<any>(`SELECT id,title,subject_ref FROM app.job_finding WHERE tenant_id=$1 AND job_id=$2 AND classification='mandatory' ORDER BY created_at,id`,[DEMO_TENANT_ID,jobId])).rows;const source=(r:VariationValueRow)=>({id:r.revision_id,revision:Number(r.revision),label:`Variation revision ${r.revision}: ${r.description}`,href:`/jobs/${jobId}#variation-${r.id}`}),approved=latestApprovedRevisions(variations),additions=approved.filter(r=>Number(r.signed_delta_pence)>0),reductions=approved.filter(r=>Number(r.signed_delta_pence)<0),invoiceSources=invoices.map(r=>({id:r.id,revision:1,label:`Invoice ${r.invoice_number}`,href:`/jobs/${jobId}#invoice-${r.id}`})),invoiced=invoices.reduce((s,r)=>s+Number(r.total_pence),0),recorded=invoices.reduce((s,r)=>s+Number(r.recorded_pence),0),outstanding=invoices.reduce((s,r)=>s+Math.max(0,Number(r.total_pence)-Number(r.credited_pence)-Number(r.recorded_pence)),0);const catchAttention: JobValueResponse["catchAttention"] = [];
 for (const catchRow of found) {
  const href = `/jobs/${jobId}/work#variation-${catchRow.id}`;
  const base = { id: catchRow.id, description: catchRow.description, href };
  const rows = variations.filter(row => row.id === catchRow.id);
  const current = rows.find(row => row.current);
  const approval = approved.find(row => row.id === catchRow.id);
  if (approval && Number(approval.signed_delta_pence) > 0 && !approval.invoiced) {
   catchAttention.push({ ...base, revisionId: approval.revision_id, revision: Number(approval.revision), pence: Number(approval.signed_delta_pence), status: "ready_to_invoice" });
  }
  if (current && !current.approved && !current.rejected) {
   catchAttention.push({ ...base, revisionId: current.revision_id, revision: Number(current.revision), pence: Number(current.signed_delta_pence), status: "needs_approval" });
  } else if (!catchRow.revision_id) {
   catchAttention.push({ ...base, revisionId: null, revision: null, pence: null, status: "needs_price" });
  }
 }
 return{version:"job-value.v1"as const,environment:"synthetic_demo"as const,jobId,approvedExtras:{pence:additions.length?additions.reduce((s,r)=>s+Number(r.signed_delta_pence),0):null,basis:"net"as const,sources:additions.map(source)},approvedReductions:{pence:reductions.length?reductions.reduce((s,r)=>s+Math.abs(Number(r.signed_delta_pence)),0):null,basis:"net"as const,sources:reductions.map(source)},invoicedGross:{pence:invoices.length?invoiced:null,basis:"gross"as const,sources:invoiceSources},recordedGross:{pence:invoices.length?recorded:null,basis:"gross"as const,sources:invoiceSources},outstandingGross:{pence:invoices.length?outstanding:null,basis:"gross"as const,sources:invoiceSources},pendingExtras:variations.filter(r=>r.current&&!r.approved&&!r.rejected&&Number(r.signed_delta_pence)>0).map(r=>({id:r.revision_id,revision:Number(r.revision),description:r.description,pence:Number(r.signed_delta_pence),status:"awaiting_approval"as const,href:`/jobs/${jobId}#variation-${r.id}`})),catchAttention,foundAfterLock:found.map(r=>({id:r.id,description:r.description,sourceSignalId:r.source_signal_id,revisionId:r.revision_id,revision:r.revision===null?null:Number(r.revision),pence:r.signed_delta_pence===null?null:Number(r.signed_delta_pence),approved:r.approved,href:`/jobs/${jobId}#variation-${r.id}`})),quoteCoverage:quote?[{id:quote.id,revision:Number(quote.revision),label:`Accepted quote revision ${quote.revision}`,href:`/jobs/${jobId}#quote`}]:[],blockedActions:blockers.map(r=>({id:r.id,title:r.title,explanation:"This check stopped work from being treated as complete until the required proof was recorded. It does not have a recorded pound value.",sourceRef:r.subject_ref,href:`/jobs/${jobId}#work-proof`}))}});return jobValueResponseV1.parse(value)}}
