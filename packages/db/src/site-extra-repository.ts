import type { Pool } from "pg";
import { z } from "zod";
import { ExtraPersistenceError, WorkOrderError, SiteExtraError, siteExtraContentSha256V1, type SiteExtraErrorCode } from "@jobguard/core";
import { ExtraRepository, type ExtraTransactionSeam, type RaisedExtra } from "./extra-repository.js";
import { appendAuditBatch } from "./audit.js";
import { assertContractorGate, derivedUuid } from "./work-order-repository.js";
import { withTenant, InvalidTenantContextError, type VerifiedTenantContext, type AuthenticatedMembership, type TenantTransaction } from "./tenant-context.js";
import { requireLiveJob, WatchdogError } from "./watchdog.js";
const commandType = "LogSiteExtra";
const inputV1 = z.object({ commandId: z.string().uuid(), jobId: z.string().uuid(), note: z.string().min(1).max(5000).refine(value => /\S/u.test(value)), description: z.string().min(1).max(500).refine(value => /\S/u.test(value)) }).strict();
type Input = z.infer<typeof inputV1>;
const inputV3 = inputV1.extend({ photoEvidenceId: z.string().uuid().optional(), shownContentSha256: z.string().regex(/^[0-9a-f]{64}$/u).optional() }).strict();
type InputV3 = z.infer<typeof inputV3>;
type EvidenceRefusal = { code: "PHOTO_NOT_ACCEPTED" | "CONFIRMATION_MISMATCH"; reason: "photo_not_accepted" | "confirmation_mismatch" };
export type EvidenceFacts = { photoEvidenceId: string | null; residentConfirmationEvidenceId: string | null; contentSha256: string };
export type LoggedSiteExtra = RaisedExtra & { evidence?: EvidenceFacts };
type Refusal = { code: "TRACK_FORBIDDEN" | "EXTRA_FORBIDDEN" | "NOT_FOUND"; reason: "track_not_contractor" | "member_inactive" | "role_not_permitted" | "job_out_of_scope" } | EvidenceRefusal;
type Authority = { grant: string } | Refusal;
const answerV1 = z.discriminatedUnion("decision", [
 z.object({ decision: z.literal("allowed"), reason_code: z.literal("allowed"), raising_grant: z.string().uuid() }).strict(),
 z.object({ decision: z.literal("forbidden"), reason_code: z.enum(["member_inactive", "command_type_not_permitted", "role_not_permitted"]), raising_grant: z.null() }).strict(),
 z.object({ decision: z.literal("not_found"), reason_code: z.literal("job_out_of_scope"), raising_grant: z.null() }).strict(),
]);
/** The checks run before ENT-4b's final audit append; raiseExtra already holds its per-job lock. ENT-3d's evidence guard follows ENT-3a's two statements. */
export const siteExtraAuthoritySeam: ExtraTransactionSeam = async (db, fact) => {
 await requireLiveJob(db, fact.jobId);
 await db.$client.query("SELECT app.ent3a_require_extra_authority($1,$2)", [fact.jobId, fact.variationId]);
 await db.$client.query("SELECT app.ent3d_require_site_extra_evidence($1,$2)", [fact.jobId, fact.variationId]);
};
const answerEvidence = z.object({ decision: z.enum(["accepted", "photo_refused", "confirmation_refused"]), reason_code: z.string(), photo_sha256: z.string().regex(/^[0-9a-f]{64}$/u).nullable(), content_sha256: z.string().regex(/^[0-9a-f]{64}$/u).nullable() }).strict();
const answerRecord = z.object({ outcome: z.enum(["recorded", "existing", "refused", "conflict"]), reason_code: z.string(), content_sha256: z.string().regex(/^[0-9a-f]{64}$/u).nullable(), document_sha256: z.string().regex(/^[0-9a-f]{64}$/u).nullable() }).strict();
const photoRefusal: EvidenceRefusal = { code: "PHOTO_NOT_ACCEPTED", reason: "photo_not_accepted" }, mismatchRefusal: EvidenceRefusal = { code: "CONFIRMATION_MISMATCH", reason: "confirmation_mismatch" };
type Gate = { raise: { evidenceId?: string; residentConfirmationEvidenceId?: string }; evidence?: EvidenceFacts };
export class SiteExtraRepository {
 constructor(private readonly pool: Pool) {}
 private async precheck(context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string): Promise<Authority> {
  return withTenant(this.pool, context, async db => {
   try { await assertContractorGate(db, actor, "member"); } catch (error) {
    if (error instanceof WorkOrderError && error.code === "TRACK_FORBIDDEN") return { code: "TRACK_FORBIDDEN", reason: "track_not_contractor" };
    if (error instanceof WorkOrderError && error.code === "NOT_FOUND") return { code: "EXTRA_FORBIDDEN", reason: "member_inactive" };
    throw error;
   }
   const rows = (await db.$client.query("SELECT decision,reason_code,raising_grant FROM app.ent3a_extra_authority($1,$2,$3)", [actor.membershipId, commandType, jobId])).rows;
   const answer = answerV1.safeParse(rows.length === 1 ? rows[0] : undefined);
   if (!answer.success) return { code: "NOT_FOUND", reason: "job_out_of_scope" };
   if (answer.data.decision === "allowed") {
    await requireLiveJob(db, jobId);
    return { grant: answer.data.raising_grant };
   }
   if (answer.data.decision === "not_found") return { code: "NOT_FOUND", reason: "job_out_of_scope" };
   return { code: "EXTRA_FORBIDDEN", reason: answer.data.reason_code === "role_not_permitted" ? "role_not_permitted" : "member_inactive" };
  });
 }
 private async recordRefusal(context: VerifiedTenantContext, actor: AuthenticatedMembership, input: Input, reason: Refusal["reason"]): Promise<void> {
  try { await withTenant(this.pool, context, async db => {
   const tenant = context.tenantId.toLowerCase(), id = derivedUuid(`extra-refusal:${tenant}:${input.commandId.toLowerCase()}:${reason}`);
   // Serialize the existence check before the final audit-head lock, including concurrent retries.
   await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,126))", [id]);
   if ((await db.$client.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND id=$2", [tenant, id])).rowCount) return;
   const member = await db.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3", [tenant, actor.membershipId, actor.identityUserId]);
   const job = await db.$client.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2", [tenant, input.jobId]);
   await appendAuditBatch(db, [{ id, version: "audit.v1", actorRef: member.rowCount ? `membership:${actor.membershipId}` : "security:unverified-member", eventType: "contractor.extra.refused", subjectType: "extra-command", subjectRef: input.commandId,
    payload: { references: { command: input.commandId, command_type: commandType, reason, environment: "synthetic_demo", ...(job.rowCount ? { job: input.jobId } : {}) }, classifications: { action: "security" } } }]);
  }); } catch { /* The issued Q14 keeps the original typed refusal if recording is unavailable. */ }
 }
 private async tx<T>(context: VerifiedTenantContext, work: (db: TenantTransaction) => Promise<T>): Promise<T> {
  try { return await withTenant(this.pool, context, work); } catch (error) {
   if (error instanceof Error && error.message === "JOB_NOT_LIVE") throw new WatchdogError("JOB_NOT_LIVE");
   throw error;
  }
 }
 /** ENT-3d step (i): the read-only decision on the photo. Anything but a clean "accepted" answer is a refusal, never a pass. */
 private async evidenceDecision(context: VerifiedTenantContext, input: InputV3, photo: string | null): Promise<{ ok: true; content: string } | { ok: false; refusal: EvidenceRefusal }> {
  const rows = await this.tx(context, async db => (await db.$client.query("SELECT decision,reason_code,photo_sha256,content_sha256 FROM app.ent3d_site_extra_evidence($1,$2,$3,$4,NULL,NULL)", [input.jobId, input.description, input.note, photo])).rows);
  const answer = answerEvidence.safeParse(rows.length === 1 ? rows[0] : undefined);
  if (!answer.success || answer.data.decision !== "accepted" || answer.data.content_sha256 === null) return { ok: false, refusal: photoRefusal };
  return { ok: true, content: answer.data.content_sha256 };
 }
 /** ENT-3d: the evidence refusal, if there now is one, after the extra's own transaction found its stored facts invalid. */
 private async evidenceRefusal(context: VerifiedTenantContext, input: InputV3): Promise<EvidenceRefusal | undefined> {
  const photo = input.photoEvidenceId?.toLowerCase() ?? null, shown = input.shownContentSha256 ?? null;
  if (photo === null && shown === null) return undefined;
  const check = await this.evidenceDecision(context, input, photo);
  if (!check.ok) return check.refusal;
  return shown !== null && shown !== check.content ? mismatchRefusal : undefined;
 }
 /** ENT-3d steps (i) and (ii). With no photo and no hash shown there are none: every step and result is then ENT-3a's. */
 private async evidenceGate(context: VerifiedTenantContext, actor: AuthenticatedMembership, input: InputV3): Promise<Gate | Refusal> {
  const photo = input.photoEvidenceId?.toLowerCase() ?? null, shown = input.shownContentSha256 ?? null;
  if (photo === null && shown === null) return { raise: {} };
  const tenant = context.tenantId.toLowerCase(), job = input.jobId.toLowerCase(), command = input.commandId.toLowerCase();
  const confirmation = shown === null ? null : derivedUuid(`resident-confirmation:${tenant}:${job}:${command}`);
  const raise = { ...(photo === null ? {} : { evidenceId: photo }), ...(confirmation === null ? {} : { residentConfirmationEvidenceId: confirmation }) };
  // A command that already succeeded is answered from its own stored facts, never judged against the job's current state.
  const stored = await this.tx(context, async db => (await db.$client.query<{ evidence_id: string | null; evidence_hash: string | null; confirmation_id: string | null; description: string; capture_text: string }>(
   `SELECT o.evidence_id::text AS evidence_id,o.evidence_hash::text AS evidence_hash,o.resident_confirmation_evidence_id::text AS confirmation_id,v.description,v.capture_text
    FROM app.command_receipt c JOIN app.extra_origin o ON (o.tenant_id,o.command_id)=(c.tenant_id,c.command_id)
    JOIN app.variation v ON (v.tenant_id,v.job_id,v.id)=(o.tenant_id,o.job_id,o.variation_id)
    WHERE c.tenant_id=$1 AND c.command_id=$2 AND c.command_type=$3 AND c.status='succeeded' AND o.job_id=$4`, [tenant, command, commandType, job])).rows[0]);
  if (stored) {
   if (stored.evidence_id !== photo || stored.confirmation_id !== confirmation) throw new SiteExtraError("COMMAND_CONFLICT");
   const content = siteExtraContentSha256V1({ jobId: job, description: stored.description, note: stored.capture_text, photoSha256: stored.evidence_hash });
   if (shown !== null && shown !== content) throw new SiteExtraError("COMMAND_CONFLICT");
   return { raise, evidence: { photoEvidenceId: photo, residentConfirmationEvidenceId: confirmation, contentSha256: content } };
  }
  const check = await this.evidenceDecision(context, input, photo);
  if (!check.ok) return check.refusal;
  if (shown !== null && confirmation !== null) {
   if (shown !== check.content) return mismatchRefusal;
   const outcome = await this.tx(context, async db => {
    const rows = (await db.$client.query("SELECT outcome,reason_code,content_sha256,document_sha256 FROM app.ent3d_record_resident_confirmation($1,$2,$3,$4,$5,$6,$7,$8)", [actor.membershipId, input.jobId, input.commandId, confirmation, input.description, input.note, photo, shown])).rows;
    const answer = answerRecord.safeParse(rows.length === 1 ? rows[0] : undefined);
    if (!answer.success) return undefined;
    if (answer.data.outcome === "recorded") {
     if (answer.data.content_sha256 === null || answer.data.document_sha256 === null) return undefined;
     // The last statement of the transaction: no lock and no statement after it.
     await appendAuditBatch(db, [{ id: derivedUuid(`resident-confirmation-recorded:${tenant}:${confirmation}`), version: "audit.v1", actorRef: `membership:${actor.membershipId}`, eventType: "contractor.extra.resident_confirmation_recorded", subjectType: "evidence", subjectRef: confirmation,
      payload: { references: { command, job, confirmation, environment: "synthetic_demo" }, hashes: { content: answer.data.content_sha256, document: answer.data.document_sha256 } } }]);
    }
    return answer.data;
   });
   if (!outcome) throw new SiteExtraError("SITE_EXTRA_UNAVAILABLE");
   if (outcome.outcome === "conflict") throw new SiteExtraError("COMMAND_CONFLICT");
   if (outcome.outcome === "refused") {
    if (outcome.reason_code === "photo_not_accepted") return photoRefusal;
    if (outcome.reason_code === "confirmation_mismatch") return mismatchRefusal;
    const current = await this.precheck(context, actor, input.jobId);
    if ("grant" in current) throw new SiteExtraError("STALE_REVISION");
    return current;
   }
  }
  return { raise, evidence: { photoEvidenceId: photo, residentConfirmationEvidenceId: confirmation, contentSha256: check.content } };
 }
 async logSiteExtra(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<LoggedSiteExtra> {
  const parsed = inputV3.safeParse(raw); if (!parsed.success) throw new SiteExtraError("INVALID_COMMAND");
  const input = parsed.data;
  let refusal: Refusal | undefined;
  let liveRefusal: WatchdogError | undefined;
  try {
   if (!context || typeof context.tenantId !== "string") throw new InvalidTenantContextError();
   if (actor.tenantId.toLowerCase() !== context.tenantId.toLowerCase()) refusal = { code: "EXTRA_FORBIDDEN", reason: "member_inactive" };
   else {
    const authority = await this.precheck(context, actor, input.jobId);
    if ("code" in authority) refusal = authority;
    else {
     const gate = await this.evidenceGate(context, actor, input);
     if ("code" in gate) refusal = gate; else
     try {
      return await new ExtraRepository(this.pool).raiseExtra(context, { version: "raise-extra.v1", commandId: input.commandId, commandType, jobId: input.jobId, actorMembershipId: actor.membershipId, grantId: authority.grant, note: input.note, description: input.description, ...gate.raise }, async (db, fact) => {
       try { await siteExtraAuthoritySeam(db, fact); } catch (error) {
        if (error instanceof WatchdogError) {
         liveRefusal = error;
         // A known persistence error rolls back; retain the typed guard failure outside raiseExtra.
         throw new ExtraPersistenceError("DATABASE_UNAVAILABLE");
        }
        throw error;
       }
      }).then(raised => gate.evidence ? { ...raised, evidence: gate.evidence } : raised);
     } catch (error) {
      if (liveRefusal) throw liveRefusal;
      if (error instanceof ExtraPersistenceError && (error.code === "NOT_FOUND" || error.code === "INVALID_ORIGIN")) {
       const current = await this.precheck(context, actor, input.jobId);
       if ("grant" in current) { refusal = await this.evidenceRefusal(context, input); if (!refusal) throw new SiteExtraError("STALE_REVISION"); }
       else refusal = current;
      } else throw error;
     }
    }
   }
  } catch (error) {
   if (error instanceof InvalidTenantContextError) refusal = { code: "NOT_FOUND", reason: "job_out_of_scope" };
   else if (error instanceof WatchdogError) {
    if (error.code === "JOB_NOT_FOUND") refusal = { code: "NOT_FOUND", reason: "job_out_of_scope" };
    else throw error;
   }
   else if (error instanceof SiteExtraError) throw error;
   else {
    const code: SiteExtraErrorCode = error instanceof ExtraPersistenceError && (error.code === "INVALID_COMMAND" || error.code === "COMMAND_CONFLICT" || error.code === "STALE_REVISION") ? error.code : "SITE_EXTRA_UNAVAILABLE";
    throw new SiteExtraError(code);
   }
  }
  if (!refusal) throw new SiteExtraError("SITE_EXTRA_UNAVAILABLE");
  await this.recordRefusal(context, actor, input, refusal.reason);
  throw new SiteExtraError(refusal.code);
 }
}
