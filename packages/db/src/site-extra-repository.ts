import type { Pool } from "pg";
import { z } from "zod";
import { ExtraPersistenceError, WorkOrderError, SiteExtraError, type SiteExtraErrorCode } from "@jobguard/core";
import { ExtraRepository, type ExtraTransactionSeam, type RaisedExtra } from "./extra-repository.js";
import { appendAuditBatch } from "./audit.js";
import { assertContractorGate, derivedUuid } from "./work-order-repository.js";
import { withTenant, InvalidTenantContextError, type VerifiedTenantContext, type AuthenticatedMembership } from "./tenant-context.js";
import { requireLiveJob, WatchdogError } from "./watchdog.js";
const commandType = "LogSiteExtra";
const inputV1 = z.object({ commandId: z.string().uuid(), jobId: z.string().uuid(), note: z.string().min(1).max(5000).refine(value => /\S/u.test(value)), description: z.string().min(1).max(500).refine(value => /\S/u.test(value)), siteVisitId: z.string().uuid().optional() }).strict();
type Input = z.infer<typeof inputV1>;
type Refusal = { code: "TRACK_FORBIDDEN" | "EXTRA_FORBIDDEN" | "NOT_FOUND"; reason: "track_not_contractor" | "member_inactive" | "role_not_permitted" | "job_out_of_scope" | "visit_out_of_scope" };
type Authority = { grant: string } | Refusal;
const answerV1 = z.discriminatedUnion("decision", [
 z.object({ decision: z.literal("allowed"), reason_code: z.literal("allowed"), raising_grant: z.string().uuid() }).strict(),
 z.object({ decision: z.literal("forbidden"), reason_code: z.enum(["member_inactive", "command_type_not_permitted", "role_not_permitted"]), raising_grant: z.null() }).strict(),
 z.object({ decision: z.literal("not_found"), reason_code: z.literal("job_out_of_scope"), raising_grant: z.null() }).strict(),
]);
/** Both checks run before ENT-4b's final audit append; raiseExtra already holds its per-job lock. */
export const siteExtraAuthoritySeam: ExtraTransactionSeam = async (db, fact) => {
 await requireLiveJob(db, fact.jobId);
 await db.$client.query("SELECT app.ent3a_require_extra_authority($1,$2)", [fact.jobId, fact.variationId]);
 // ENT-3b: when the stored origin names a visit, it must still be the raising member's own open visit on this job (shares the completion routine's visit lock).
 await db.$client.query("SELECT app.ent3b_require_open_visit($1,$2)", [fact.jobId, fact.variationId]);
};
export class SiteExtraRepository {
 constructor(private readonly pool: Pool) {}
 private async precheck(context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string, siteVisitId?: string): Promise<Authority> {
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
    // A visit reference is checked only after the caller is known to be allowed: it must be the caller's own open visit on this job.
    if (siteVisitId && !(await db.$client.query("SELECT 1 FROM app.site_visit WHERE tenant_id=$1 AND id=$2 AND job_id=$3 AND membership_id=$4 AND completed_at IS NULL", [actor.tenantId, siteVisitId, jobId, actor.membershipId])).rowCount) return { code: "NOT_FOUND", reason: "visit_out_of_scope" };
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
 async logSiteExtra(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<RaisedExtra> {
  const parsed = inputV1.safeParse(raw); if (!parsed.success) throw new SiteExtraError("INVALID_COMMAND");
  const input = parsed.data;
  let refusal: Refusal | undefined;
  let liveRefusal: WatchdogError | undefined;
  try {
   if (!context || typeof context.tenantId !== "string") throw new InvalidTenantContextError();
   if (actor.tenantId.toLowerCase() !== context.tenantId.toLowerCase()) refusal = { code: "EXTRA_FORBIDDEN", reason: "member_inactive" };
   else {
    const authority = await this.precheck(context, actor, input.jobId, input.siteVisitId);
    if ("code" in authority) refusal = authority;
    else {
     try {
      return await new ExtraRepository(this.pool).raiseExtra(context, { version: "raise-extra.v1", commandId: input.commandId, commandType, jobId: input.jobId, actorMembershipId: actor.membershipId, grantId: authority.grant, note: input.note, description: input.description, ...(input.siteVisitId ? { siteVisitId: input.siteVisitId } : {}) }, async (db, fact) => {
       try { await siteExtraAuthoritySeam(db, fact); } catch (error) {
        if (error instanceof WatchdogError) {
         liveRefusal = error;
         // A known persistence error rolls back; retain the typed guard failure outside raiseExtra.
         throw new ExtraPersistenceError("DATABASE_UNAVAILABLE");
        }
        throw error;
       }
      });
     } catch (error) {
      if (liveRefusal) throw liveRefusal;
      if (error instanceof ExtraPersistenceError && (error.code === "NOT_FOUND" || error.code === "INVALID_ORIGIN")) {
       const current = await this.precheck(context, actor, input.jobId, input.siteVisitId);
       if ("grant" in current) throw new SiteExtraError("STALE_REVISION");
       refusal = current;
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
