import type { Pool } from "pg";
import { z } from "zod";
import {
  addMoney, money, candidateM1TaxPolicy, allocateGroupTax,
  createFinalAccountLockSnapshot, verifyFinalAccountLockSnapshot, assertFinalAccountInvoiceGuard,
  FINAL_ACCOUNT_DECLARATION_VERSION, FINAL_CHECK_TERMS_VERSION,
  FinalAccountLockError, type FinalAccountLockErrorCode, type FinalAccountLockHashes,
} from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export const FINAL_LOCK_UPLOAD_WAIT_MS = 5000;
const uuid = z.string().uuid();
const identity = { jobId: uuid, actorMembershipId: uuid };
const lockInput = z.object({...identity,commandId:uuid,finalAccountRevisionId:uuid,expectedRevision:z.number().int().nonnegative().safe(),declarationVersion:z.literal(FINAL_ACCOUNT_DECLARATION_VERSION)}).strict();
const dispositionInput = z.object({...identity,commandId:uuid,scopeItemId:uuid,disposition:z.enum(["done","removed","deferred"])}).strict();
const termsInput = z.object({actorMembershipId:uuid,commandId:uuid,termsVersion:z.literal(FINAL_CHECK_TERMS_VERSION)}).strict();
const invoiceInput = z.object({ ...identity, commandId: uuid, finalAccountRevisionId: uuid,
 expectedSourceHash: z.string().regex(/^[a-f0-9]{64}$/u), invoiceKind: z.enum(["final", "supplementary"]),
 recipient: z.string().email().regex(/@example\.invalid$/u), issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
}).strict();
const knownCodes = new Set<string>(["FINAL_ACCOUNT_LOCK_BUSY", "FINAL_ACCOUNT_UPLOADS_IN_PROGRESS", "FINAL_ACCOUNT_ALREADY_LOCKED", "SCOPE_DISPOSITION_MISSING", "DISCLOSURE_TERMS_NOT_ACCEPTED", "FINAL_ACCOUNT_LOCK_REQUIRED", "FINAL_CHECK_NOT_COMPLETE", "FINAL_CHECK_FAILED", "FINAL_REVIEW_CLOSED", "INVALID_FINAL_ACCOUNT_LOCK_INPUT", "FINAL_ACCOUNT_SOURCE_CHANGED", "SCOPE_ITEM_NOT_BASELINE", "FINAL_INVOICE_REVISION_MISMATCH", "FINAL_INVOICE_ALREADY_ISSUED", "SUPPLEMENTARY_INVOICE_BASE_REQUIRED", "INVOICE_AMOUNT_INVALID", "INVOICE_SOURCE_CORRECTION_REQUIRED", "FINAL_ACCOUNT_TOTAL_MISMATCH", "JOB_NOT_FOUND", "FINAL_ACCOUNT_UPLOADS_IN_PROGRESS"]);
function typed(error: unknown, uploadInFlight = false): never {
 const e = error as { message?: string; detail?: string };
 if (e.message === "IDEMPOTENCY_PAYLOAD_CONFLICT") throw new FinalAccountLockError("IDEMPOTENCY_CONFLICT");
 // 55P03: the lock waited its bounded time for an evidence upload that holds the job and gave up; nothing was written.
 // C204: only an evidence upload in flight is reported as such; any other holder of the job lock is a plain busy refusal.
 if ((error as { code?: string }).code === "55P03") throw new FinalAccountLockError(uploadInFlight ? "FINAL_ACCOUNT_UPLOADS_IN_PROGRESS" : "FINAL_ACCOUNT_LOCK_BUSY");
 if (e.message === "STALE_OR_BLOCKED_FINAL_ACCOUNT") throw new FinalAccountLockError("STALE_REVISION");
 if (e.message && knownCodes.has(e.message)) throw new FinalAccountLockError(e.message as FinalAccountLockErrorCode, e.detail && uuid.safeParse(e.detail).success ? e.detail : undefined);
 throw error;
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
 const input = schema.safeParse(raw);
 if (!input.success) throw new FinalAccountLockError("INVALID_FINAL_ACCOUNT_LOCK_INPUT");
 return input.data;
}
const lockProjection = (row: Record<string, any>) => ({
 id: String(row.id), sourceHash: String(row.locked_source_hash).trim(), tenantId: String(row.tenant_id), jobId: String(row.job_id), finalAccountRevisionId: String(row.final_account_revision_id),
 baselineQuoteVersionId: String(row.baseline_quote_version_id), captureRegisterHash: String(row.capture_register_hash).trim(),
 lineSetHash: String(row.line_set_hash).trim(), scopeDispositionHash: String(row.scope_disposition_hash).trim(),
 digest: String(row.snapshot_digest).trim(), lockedAt: String(row.locked_at_text), commandId: String(row.command_id),
 auditEventId: String(row.audit_event_id), snapshot: row.snapshot,
});
export type PersistedFinalAccountLock = ReturnType<typeof lockProjection>;
export type FinalAccountLockView = { captures: Array<{ id: string; description: string; state: string; origin: "builder_logged" | "final_review"; netPence: number | null }>; lock: PersistedFinalAccountLock | null; dispositions: Array<{ scopeItemId: string; disposition: "done" | "removed" | "deferred" }>; termsAccepted: boolean; checkStatus: "pending" | "failed" | "completed" | null; check: { lockId: string; tenantId: string; jobId: string; evidenceCutoffAt: string; status: "pending" | "failed" | "completed" } | null };

/** Request-scoped verified context only. No provider, shadow-table read or saved tenant authority. */
export class FinalAccountLockRepository {
 /** lockWaitMs bounds how long locking waits for evidence uploads already in progress (default 5s). */
 constructor(private readonly pool: Pool, private readonly lockWaitMs: number = FINAL_LOCK_UPLOAD_WAIT_MS) {}
 async read(context: VerifiedTenantContext, jobId: string): Promise<FinalAccountLockView> {
  uuid.parse(jobId);
  return withTenant(this.pool, context, async db => {
   // One statement supplies the full lock/check projection from a single MVCC snapshot.
   const row = (await db.$client.query<any>(`SELECT
    (SELECT row_to_json(x) FROM (SELECT l.*,r.source_hash locked_source_hash,to_char(l.locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') locked_at_text FROM app.final_account_lock l JOIN app.final_account_revision r ON(r.tenant_id,r.job_id,r.id)=(l.tenant_id,l.job_id,l.final_account_revision_id) WHERE l.tenant_id=$1 AND l.job_id=$2) x) "lock",
    EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=$1 AND terms_version='synthetic_final_check_terms.v1') terms_accepted,
    coalesce((SELECT jsonb_agg(jsonb_build_object('scopeItemId',scope_item_id,'disposition',disposition) ORDER BY scope_item_id) FROM (SELECT DISTINCT ON(scope_item_id) scope_item_id,disposition FROM app.final_account_scope_disposition WHERE tenant_id=$1 AND job_id=$2 ORDER BY scope_item_id,recorded_at DESC,id DESC) d),'[]') dispositions,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'description',v.description,'state',CASE WHEN w.id IS NOT NULL THEN 'withdrawn' ELSE v.state END,'origin',o.kind,'netPence',r.signed_delta_pence) ORDER BY v.id)
     FROM app.variation v JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.id)
     LEFT JOIN app.variation_revision r ON(r.tenant_id,r.job_id,r.id)=(v.tenant_id,v.job_id,v.current_revision_id)
     LEFT JOIN app.variation_withdrawal w ON(w.tenant_id,w.job_id,w.variation_id)=(v.tenant_id,v.job_id,v.id)
     WHERE v.tenant_id=$1 AND v.job_id=$2 AND o.kind IN ('builder_logged','final_review')),'[]') captures,
    (SELECT row_to_json(x) FROM (SELECT c.lock_id,c.status,to_char(c.evidence_cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cutoff FROM app.final_account_lock_check c JOIN app.final_account_lock l ON(l.tenant_id,l.job_id,l.id,l.locked_at)=(c.tenant_id,c.job_id,c.lock_id,c.evidence_cutoff_at) WHERE c.tenant_id=$1 AND c.job_id=$2 ORDER BY c.created_at DESC,c.id DESC LIMIT 1) x) "check"`, [context.tenantId, jobId])).rows[0];
   return { captures: row.captures ?? [], lock: row.lock ? lockProjection(row.lock) : null, dispositions: row.dispositions, termsAccepted: row.terms_accepted,
    checkStatus: row.check?.status ?? null, check: row.check ? { lockId: row.check.lock_id, tenantId: context.tenantId, jobId, evidenceCutoffAt: row.check.cutoff, status: row.check.status } : null };
  });
 }
 async lock(context: VerifiedTenantContext, raw: z.infer<typeof lockInput>): Promise<PersistedFinalAccountLock> {
  const input = parse(lockInput, raw);
  try { return await withTenant(this.pool, context, async db => {
   // Evidence writes hold SHARE on the job; the lock takes UPDATE, so it waits for uploads already in progress and then sees them.
   await db.$client.query("SELECT set_config('lock_timeout',$1,true)", [`${Math.trunc(this.lockWaitMs)}ms`]);
   const row = (await db.$client.query<any>(`SELECT l.*,r.source_hash locked_source_hash,to_char(l.locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') locked_at_text FROM app.lock_final_account($1,$2,$3,$4,$5,$6,$7) l JOIN app.final_account_revision r ON(r.tenant_id,r.job_id,r.id)=(l.tenant_id,l.job_id,l.final_account_revision_id)`, [context.tenantId, input.jobId, input.actorMembershipId, input.commandId, input.finalAccountRevisionId, input.expectedRevision, input.declarationVersion])).rows[0]!;
   const snapshot = createFinalAccountLockSnapshot(row.snapshot);
   if (snapshot.digest !== row.snapshot_digest.trim() || snapshot.captureRegisterHash !== row.capture_register_hash.trim() || snapshot.lineSetHash !== row.line_set_hash.trim() || snapshot.scopeDispositionHash !== row.scope_disposition_hash.trim()) throw new FinalAccountLockError("FINAL_ACCOUNT_SOURCE_CHANGED");
   return lockProjection(row);
  }); } catch (error) {
   if ((error as { code?: string }).code === "55P03") {
    // The failed transaction is gone. Inspect only the shared upload marker for this verified tenant/job.
    const inFlight = await this.pool.query<{ held: boolean }>(`SELECT EXISTS(SELECT 1 FROM pg_locks
     WHERE locktype='advisory' AND classid=(hashtext('final_check_upload:'||$1::text)::bigint & 4294967295)::oid
     AND objid=(hashtext($2::text)::bigint & 4294967295)::oid AND objsubid=2
     AND mode='ShareLock' AND granted AND pid<>pg_backend_pid()) held`, [context.tenantId, input.jobId]).then(r => r.rows[0]?.held === true, () => false);
    return typed(error, inFlight);
   }
   return typed(error);
  }
 }
 async disposition(context: VerifiedTenantContext, raw: z.infer<typeof dispositionInput>) {
  const c = parse(dispositionInput, raw);
  try { return await withTenant(this.pool, context, async db => (await db.$client.query<{ result: { dispositionId: string; scopeItemId: string; disposition: string } }>(`SELECT app.record_final_account_disposition($1,$2,$3,$4,$5,$6) result`, [context.tenantId,c.jobId,c.actorMembershipId,c.commandId,c.scopeItemId,c.disposition])).rows[0]!.result); } catch (error) { return typed(error); }
 }
 async acceptTerms(context: VerifiedTenantContext, raw: z.infer<typeof termsInput>) {
  const c = parse(termsInput, raw);
  try { return await withTenant(this.pool, context, async db => (await db.$client.query<{ result: { acceptanceId: string; termsVersion: string } }>(`SELECT app.accept_final_check_terms($1,$2,$3,$4) result`, [context.tenantId,c.actorMembershipId,c.commandId,c.termsVersion])).rows[0]!.result); } catch (error) { return typed(error); }
 }
 async verify(context: VerifiedTenantContext, jobId: string) {
  try { return await withTenant(this.pool, context, async db => {
   const row = (await db.$client.query<{ result: { snapshot: unknown; hashes: FinalAccountLockHashes } }>(`SELECT app.read_final_account_lock_verification($1,$2) result`, [context.tenantId,uuid.parse(jobId)])).rows[0]!.result;
   try { return verifyFinalAccountLockSnapshot(row.snapshot,row.hashes); }
   catch { return { verified: false, mismatches: ["digest"] as const }; }
  }); } catch (error) { return typed(error); }
 }
 async issueInvoice(context: VerifiedTenantContext, raw: z.infer<typeof invoiceInput>) {
  const c = parse(invoiceInput, raw);
  // Command-level guard and routine-level guard are separate: SQL rechecks under serialization.
  const view = await this.read(context,c.jobId);
  assertFinalAccountInvoiceGuard(c.invoiceKind,view.lock ? { id:view.lock.id,tenantId:context.tenantId,jobId:c.jobId,serverTimestamp:view.lock.lockedAt } : null,view.check);
  try { return await withTenant(this.pool, context, async db => {
   const result = (await db.$client.query<{ result: { invoiceId: string; invoiceNumber: string; netPence: number; taxPence: number; totalPence: number; pdfSha256: string; sourceHash: string; invoiceKind: string; lockId: string } }>(`SELECT app.issue_lock_bound_customer_invoice($1,$2,$3,$4,$5,$6,$7,$8::date,$9) result`,[context.tenantId,c.jobId,c.finalAccountRevisionId,c.actorMembershipId,c.commandId,c.invoiceKind,c.recipient,c.issuedOn,c.expectedSourceHash])).rows[0]!.result;
   // Reuse the merged exact money and tax primitives; disagreement rolls back every issue effect.
   const lines = (await db.$client.query<{ final_account_line_id: string; net_pence: string; tax_pence: string; gross_pence: string }>(`SELECT final_account_line_id,net_pence::text,tax_pence::text,gross_pence::text FROM app.final_account_invoiced_line WHERE tenant_id=$1 AND job_id=$2 AND invoice_id=$3 ORDER BY final_account_line_id`,[context.tenantId,c.jobId,result.invoiceId])).rows;
   const net = lines.reduce((sum,l)=>addMoney(sum,money(Number(l.net_pence))),money(0));
   const tax = candidateM1TaxPolicy.calculateGroup(net,"standard_rate_20");
   const allocation = lines.every(l=>Number(l.net_pence)===0) ? new Map(lines.map(l=>[l.final_account_line_id,money(0)])) : allocateGroupTax(tax,lines.map(l=>({id:l.final_account_line_id,net:money(Number(l.net_pence))})));
   if (net.pence!==result.netPence || tax.pence!==result.taxPence || addMoney(net,tax).pence!==result.totalPence || lines.some(l=>allocation.get(l.final_account_line_id)?.pence!==Number(l.tax_pence) || addMoney(money(Number(l.net_pence)),money(Number(l.tax_pence))).pence!==Number(l.gross_pence))) throw new Error("INVOICE_AMOUNT_INVALID");
   return result;
  }); } catch (error) { return typed(error); }
 }
}
