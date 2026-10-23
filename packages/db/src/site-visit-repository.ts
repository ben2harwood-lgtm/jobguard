import type { Pool } from "pg";
import { z } from "zod";
import { SiteVisitError, WorkOrderError, type CloseoutAnswer, type SiteVisitErrorCode } from "@jobguard/core";
import { appendAuditBatch, type AuditEventInput } from "./audit.js";
import { assertContractorGate, canonicalJson, derivedUuid, sha256Hex } from "./work-order-repository.js";
import { withTenant, InvalidTenantContextError, type VerifiedTenantContext, type AuthenticatedMembership, type TenantTransaction } from "./tenant-context.js";
import { requireLiveJob, WatchdogError } from "./watchdog.js";
// Each command-type string is written once, here, and reaches SQL only as a bound parameter.
const startCommandType = "StartSiteVisit";
const completeCommandType = "CompleteSiteVisit";
const uuid = z.string().uuid();
const startInput = z.object({ commandId: uuid, jobId: uuid }).strict();
const completeInput = z.object({ commandId: uuid, jobId: uuid, visitId: uuid, closeoutAnswer: z.enum(["yes", "no"]) }).strict();
type Kind = "start" | "complete";
type Input = { commandId: string; jobId: string; visitId?: string; closeoutAnswer?: CloseoutAnswer };
type Reason = "track_not_contractor" | "member_inactive" | "role_not_permitted" | "job_out_of_scope" | "visit_out_of_scope";
type Refusal = { code: "TRACK_FORBIDDEN" | "VISIT_FORBIDDEN" | "NOT_FOUND"; reason: Reason };
export type StartedVisit = { visitId: string; startedAt: string };
export type CompletedVisit = { visitId: string; completedAt: string; closeoutAnswer: CloseoutAnswer };
export type AssignedJob = { jobId: string; workOrderId: string; reference: string; priority: "routine" | "urgent" | "emergency"; issuedOn: string; dueOn: string | null; openVisitId: string | null };
export type AssignedJobs = { jobs: AssignedJob[]; truncated: boolean };
export type OrderLines = { jobId: string; workOrderId: string; revision: number; lines: Array<{ position: number; scopeItemId: string; clientLineReference: string | null; sorCode: string; description: string; unit: string; quantity: string }> };
const answerV1 = z.object({ decision: z.enum(["allowed", "forbidden", "not_found"]), reason_code: z.enum(["allowed", "member_inactive", "role_not_permitted", "job_out_of_scope"]) }).strict();
const storedStart = z.object({ visitId: uuid, startedAt: z.string().min(1) }).strict();
const storedComplete = z.object({ visitId: uuid, completedAt: z.string().min(1), closeoutAnswer: z.enum(["yes", "no"]) }).strict();
const timestampText = (column: string) => `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
/** Raised inside the command transaction when a fact the pre-check relied on has changed; the caller decides again, never from database text. */
class FactsChanged extends Error {
 constructor(readonly authorizedCode: SiteVisitErrorCode = "SITE_VISIT_UNAVAILABLE", readonly refusal?: Refusal) { super(); }
}
class CompletionReplayRace extends Error {}
const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
function routineFailure(error: unknown): SiteVisitErrorCode | FactsChanged {
 const message = (error as { message?: string } | null)?.message;
 switch (message) {
  case "NOT_FOUND": return new FactsChanged();
  case "CLOSEOUT_ANSWER_REQUIRED": case "VISIT_ALREADY_OPEN": case "VISIT_ALREADY_COMPLETED": case "INVALID_COMMAND": case "MODE_FORBIDDEN": return message;
  default: return "SITE_VISIT_UNAVAILABLE";
 }
}
/** The receipt claim, written here because the merged helpers are private to extra-repository.ts. A replay returns the stored result and writes nothing. */
async function claim(db: TenantTransaction, tenant: string, commandId: string, type: string, semantic: string, hash: string, actor: string): Promise<unknown | null> {
 const inserted = await db.$client.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
  VALUES($1,$2,$3,$4,$5,'processing',$6) ON CONFLICT DO NOTHING RETURNING command_id`, [tenant, commandId, type, semantic, hash, actor]);
 if (inserted.rowCount) return null;
 return readReceipt(db, tenant, commandId, type, semantic, hash, false);
}
async function readReceipt(db: TenantTransaction, tenant: string, commandId: string, type: string, semantic: string, hash: string, allowMissing: boolean): Promise<unknown | null> {
 const rows = (await db.$client.query<{ request_hash: string; status: string; result: unknown }>("SELECT request_hash,status,result FROM app.command_receipt WHERE tenant_id=$1 AND (command_id=$2 OR (command_type=$3 AND semantic_key=$4))", [tenant, commandId, type, semantic])).rows;
 if (allowMissing && rows.length === 0) return null;
 if (rows.length !== 1 || rows[0]!.request_hash !== hash || rows[0]!.status !== "succeeded" || rows[0]!.result === null) throw new SiteVisitError("IDEMPOTENCY_CONFLICT");
 return rows[0]!.result;
}
async function finish(db: TenantTransaction, tenant: string, commandId: string, result: StartedVisit | CompletedVisit): Promise<void> {
 await db.$client.query("UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2", [tenant, commandId, canonicalJson(result)]);
}
/**
 * ENT-3b: visit start and complete, and the site worker's two read lists. The visit rule lives once, in app.ent3b_visit_authority; this class calls it.
 * Order of every command: tenant identity, pre-check (authority first, no lock), then one transaction that locks tenant authority shared, rechecks authority/ownership, checks the job is live, claims the command,
 * calls the controlled routine and appends the one audit event last. A caller who may not visit the job never learns whether it is live.
 */
export class SiteVisitRepository {
 constructor(private readonly pool: Pool) {}
 /** Authority first. Returns the refusal, or null when the caller may act on this job (and, for completion, owns this visit). */
 private async precheck(context: VerifiedTenantContext, actor: AuthenticatedMembership, kind: Kind, input: Input): Promise<Refusal | null> {
  return withTenant(this.pool, context, db => this.visitAuthority(db, actor, kind, input));
 }
 private async visitAuthority(db: TenantTransaction, actor: AuthenticatedMembership, kind: Kind, input: Input): Promise<Refusal | null> {
  const refusal = await this.decide(db, actor, input.jobId);
  if (refusal) return refusal;
  if (kind === "complete") {
   const own = await db.$client.query("SELECT 1 FROM app.site_visit WHERE tenant_id=$1 AND id=$2 AND job_id=$3 AND membership_id=$4", [actor.tenantId, input.visitId, input.jobId, actor.membershipId]);
   if (!own.rowCount) return { code: "NOT_FOUND", reason: "visit_out_of_scope" };
  }
  return null;
 }
 private async decide(db: TenantTransaction, actor: AuthenticatedMembership, jobId: string | null): Promise<Refusal | null> {
  try { await assertContractorGate(db, actor, "member"); } catch (error) {
   if (error instanceof WorkOrderError && error.code === "TRACK_FORBIDDEN") return { code: "TRACK_FORBIDDEN", reason: "track_not_contractor" };
   if (error instanceof WorkOrderError && error.code === "NOT_FOUND") return { code: "VISIT_FORBIDDEN", reason: "member_inactive" };
   throw error;
  }
  const rows = (await db.$client.query("SELECT decision,reason_code FROM app.ent3b_visit_authority($1,$2)", [actor.membershipId, jobId])).rows;
  const answer = answerV1.safeParse(rows.length === 1 ? rows[0] : undefined);
  // A missing, NULL or unexpected answer is a refusal, never a pass.
  if (!answer.success || answer.data.decision === "not_found") return { code: "NOT_FOUND", reason: "job_out_of_scope" };
  if (answer.data.decision === "forbidden") return { code: "VISIT_FORBIDDEN", reason: answer.data.reason_code === "role_not_permitted" ? "role_not_permitted" : "member_inactive" };
  return answer.data.reason_code === "allowed" ? null : { code: "NOT_FOUND", reason: "job_out_of_scope" };
 }
 private async recordRefusal(context: VerifiedTenantContext, actor: AuthenticatedMembership, kind: Kind, input: Input, reason: Reason): Promise<void> {
  try { await withTenant(this.pool, context, async db => {
   const tenant = context.tenantId.toLowerCase(), id = derivedUuid(`visit-refusal:${tenant}:${input.commandId.toLowerCase()}:${reason}`);
   // At most one per command id and reason; a concurrent duplicate fails on the audit table's unique id and is swallowed below.
   if ((await db.$client.query("SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND id=$2", [tenant, id])).rowCount) return;
   const member = await db.$client.query("SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND identity_user_id=$3", [tenant, actor.membershipId, actor.identityUserId]);
   const job = await db.$client.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2", [tenant, input.jobId]);
   await appendAuditBatch(db, [{ id, version: "audit.v1", actorRef: member.rowCount ? `membership:${actor.membershipId}` : "security:unverified-member", eventType: "contractor.visit.refused", subjectType: "visit-command", subjectRef: input.commandId,
    payload: { references: { command: input.commandId, command_type: kind === "start" ? startCommandType : completeCommandType, reason, environment: "synthetic_demo", ...(job.rowCount ? { job: input.jobId } : {}) }, classifications: { action: "security" } } }]);
  }); } catch { /* A refusal record that cannot be written never changes the typed refusal the caller gets. */ }
 }
 private async command<T extends StartedVisit | CompletedVisit>(context: VerifiedTenantContext, actor: AuthenticatedMembership, kind: Kind, input: Input, schema: z.ZodType<T>): Promise<T> {
  try {
   return await withTenant(this.pool, context, async db => {
    const tenant = context.tenantId.toLowerCase();
    // First lock: the existing contractor administration key, shared. Membership, grant and assignment changes take it exclusively.
    // Hold it through commit, including for a replay; the checked writer is never reached on that path.
    await db.$client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1,54))", [tenant]);
    const authority = await this.visitAuthority(db, actor, kind, input);
    if (authority) throw new FactsChanged("SITE_VISIT_UNAVAILABLE", authority);
    const type = kind === "start" ? startCommandType : completeCommandType;
    const content = kind === "start" ? { commandType: type, jobId: input.jobId, membershipId: actor.membershipId } : { commandType: type, jobId: input.jobId, membershipId: actor.membershipId, visitId: input.visitId, closeoutAnswer: input.closeoutAnswer };
    const semantic = kind === "start" ? `site-visit-start:${input.jobId}:${actor.membershipId}:${input.commandId}` : `site-visit-complete:${input.jobId}:${input.visitId}:${input.commandId}`;
    const hash = sha256Hex(canonicalJson(content));
    const cached = kind === "complete" ? await readReceipt(db, tenant, input.commandId, type, semantic, hash, true) : null;
    // Completion shares the prompt/extra job serialization key before any job row lock.
    // Otherwise a confirming prompt can wait for this SHARE lock while this hook waits for its key.
    if (kind === "complete" && cached === null) await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text||':'||$2::uuid::text,417))", [tenant, input.jobId]);
    // Authority first, then the live-job row share lock, then the receipt; audit head remains last.
    try { await requireLiveJob(db, input.jobId); } catch (error) {
     if (error instanceof WatchdogError && error.code === "JOB_NOT_LIVE") throw new FactsChanged("JOB_NOT_LIVE");
     if (error instanceof WatchdogError) throw new FactsChanged();
     throw error;
    }
    const replay = cached ?? await claim(db, tenant, input.commandId, type, semantic, hash, actor.membershipId);
    // A concurrent first execution may commit while we wait for key 417. Release all
    // first-execution locks by rolling back, then read its receipt on a fresh replay path.
    if (kind === "complete" && cached === null && replay !== null) throw new CompletionReplayRace();
    if (replay !== null) {
     // Claim can wait on another command. Recheck immediately before returning its cached answer, still under the shared authority lock.
     const current = await this.visitAuthority(db, actor, kind, input);
     if (current) throw new FactsChanged("SITE_VISIT_UNAVAILABLE", current);
     const stored = schema.safeParse(replay); if (!stored.success) throw new SiteVisitError("IDEMPOTENCY_CONFLICT"); return stored.data;
    }
    let result: StartedVisit | CompletedVisit, audit: AuditEventInput;
    const references = { command: input.commandId, job: input.jobId, environment: "synthetic_demo" };
    try {
     if (kind === "start") {
      const visitId = (await db.$client.query<{ id: string }>("SELECT app.ent3b_start_visit($1,$2,$3) AS id", [actor.membershipId, input.commandId, input.jobId])).rows[0]!.id;
      const startedAt = (await db.$client.query<{ at: string }>(`SELECT ${timestampText("started_at")} AS at FROM app.site_visit WHERE tenant_id=$1 AND id=$2`, [tenant, visitId])).rows[0]!.at;
      result = { visitId, startedAt };
      audit = { id: visitId, version: "audit.v1", actorRef: `membership:${actor.membershipId}`, eventType: "contractor.visit.started", subjectType: "site-visit", subjectRef: visitId, payload: { references: { ...references, visit: visitId } } };
     } else {
      const answerId = (await db.$client.query<{ id: string }>("SELECT app.ent3b_complete_visit($1,$2,$3,$4,$5) AS id", [actor.membershipId, input.commandId, input.jobId, input.visitId, input.closeoutAnswer])).rows[0]!.id;
      const completedAt = (await db.$client.query<{ at: string }>(`SELECT ${timestampText("completed_at")} AS at FROM app.site_visit WHERE tenant_id=$1 AND id=$2`, [tenant, input.visitId])).rows[0]!.at;
      result = { visitId: input.visitId!, completedAt, closeoutAnswer: input.closeoutAnswer! };
      // Identifiers only: the answer's value is never written to the audit trail.
      audit = { id: answerId, version: "audit.v1", actorRef: `membership:${actor.membershipId}`, eventType: "contractor.visit.completed", subjectType: "site-visit", subjectRef: input.visitId!, payload: { references: { ...references, visit: input.visitId!, closeoutAnswer: answerId } } };
     }
    } catch (error) {
     if (error instanceof SiteVisitError) throw error;
     const mapped = routineFailure(error);
     throw typeof mapped === "string" ? new SiteVisitError(mapped) : mapped;
    }
    // Persist live prompt evaluations before the final audit-head lock. A visit is not job completion.
    if (kind === "complete") await db.$client.query("SELECT app.lp_visit_evaluate($1,$2,$3)", [actor.membershipId, input.jobId, input.commandId]);
    // The audit append is the last write before the receipt is completed; no lock is taken after it.
    await appendAuditBatch(db, [audit]);
    await finish(db, tenant, input.commandId, result);
    return schema.parse(result);
   });
  } catch (error) {
   if (error instanceof CompletionReplayRace) return this.command(context, actor, kind, input, schema);
   if (error instanceof SiteVisitError || error instanceof FactsChanged || error instanceof InvalidTenantContextError) throw error;
   // Anything raised by the deferred checks at commit, or by the database in general, is unavailable and carries none of its text.
   throw new SiteVisitError("SITE_VISIT_UNAVAILABLE");
  }
 }
 private async execute<T extends StartedVisit | CompletedVisit>(context: VerifiedTenantContext, actor: AuthenticatedMembership, kind: Kind, input: Input, schema: z.ZodType<T>): Promise<T> {
  let refusal: Refusal | undefined;
  try {
   if (!context || typeof context.tenantId !== "string") throw new InvalidTenantContextError();
   if (!same(actor.tenantId, context.tenantId)) refusal = { code: "VISIT_FORBIDDEN", reason: "member_inactive" };
   else {
    const authority = await this.precheck(context, actor, kind, input);
    if (authority) refusal = authority;
    else {
     try { return await this.command(context, actor, kind, input, schema); } catch (error) {
      if (!(error instanceof FactsChanged)) throw error;
      // withTenant has rolled back. Recheck authority before exposing any job state, including a live-guard refusal.
      const current = error.refusal ?? await this.precheck(context, actor, kind, input);
      if (!current) throw new SiteVisitError(error.authorizedCode);
      refusal = current;
     }
    }
   }
  } catch (error) {
   if (error instanceof InvalidTenantContextError) refusal = { code: "NOT_FOUND", reason: "job_out_of_scope" };
   else if (error instanceof SiteVisitError) throw error;
   else throw new SiteVisitError("SITE_VISIT_UNAVAILABLE");
  }
  if (!refusal) throw new SiteVisitError("SITE_VISIT_UNAVAILABLE");
  await this.recordRefusal(context, actor, kind, input, refusal.reason);
  throw new SiteVisitError(refusal.code);
 }
 async startVisit(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<StartedVisit> {
  const parsed = startInput.safeParse(raw); if (!parsed.success) throw new SiteVisitError("INVALID_COMMAND");
  return this.execute(context, actor, "start", parsed.data, storedStart);
 }
 async completeVisit(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<CompletedVisit> {
  const parsed = completeInput.safeParse(raw);
  if (!parsed.success) {
   const missing = z.object({ commandId: uuid, jobId: uuid, visitId: uuid, closeoutAnswer: z.null().optional() }).strict().safeParse(raw).success;
   throw new SiteVisitError(missing ? "CLOSEOUT_ANSWER_REQUIRED" : "INVALID_COMMAND");
  }
  return this.execute(context, actor, "complete", parsed.data, storedComplete);
 }
 /** The caller's assigned jobs: every work-order job for which the visit rule answers allowed, with the caller's own open visit. No money, no resident, no address. */
 async assignedJobs(context: VerifiedTenantContext, actor: AuthenticatedMembership): Promise<AssignedJobs> {
  return this.read(context, actor, null, async db => {
   const rows = (await db.$client.query<{ job_id: string; work_order_id: string; reference: string; priority: AssignedJob["priority"]; issued_on: string; due_on: string | null; open_visit: string | null }>(
    assignedJobsQuery, [actor.tenantId, actor.membershipId])).rows;
   return { jobs: rows.slice(0, 200).map(row => ({ jobId: row.job_id, workOrderId: row.work_order_id, reference: row.reference, priority: row.priority, issuedOn: row.issued_on, dueOn: row.due_on, openVisitId: row.open_visit })), truncated: rows.length > 200 };
  });
 }
 /** The lines of the order's CURRENT revision, by position, with the schedule-of-rates description. */
 async orderLines(context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string): Promise<OrderLines> {
  if (!uuid.safeParse(jobId).success) throw new SiteVisitError("NOT_FOUND");
  return this.read(context, actor, jobId, async db => {
   const head = (await db.$client.query<{ work_order_id: string; revision_id: string; revision: number }>(
    `SELECT w.id work_order_id,r.id revision_id,r.revision FROM app.work_order w
     JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id)
     JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(c.tenant_id,c.work_order_id,c.revision_id)
     WHERE w.tenant_id=$1 AND w.job_id=$2`, [actor.tenantId, jobId])).rows[0];
   if (!head) throw new SiteVisitError("NOT_FOUND");
   const lines = (await db.$client.query<{ position: number; scope_item_id: string; client_line_reference: string | null; sor_code: string; description: string; unit: string; quantity: string }>(
    `SELECT l.position,l.scope_item_id,l.client_line_reference,l.sor_code,i.description,l.unit,l.quantity FROM app.work_order_line l
     JOIN app.sor_item i ON(i.tenant_id,i.version_id,i.code)=(l.tenant_id,l.sor_version_id,l.sor_code)
     WHERE l.tenant_id=$1 AND l.revision_id=$2 ORDER BY l.position`, [actor.tenantId, head.revision_id])).rows;
   return { jobId, workOrderId: head.work_order_id, revision: Number(head.revision), lines: lines.map(row => ({ position: Number(row.position), scopeItemId: row.scope_item_id, clientLineReference: row.client_line_reference, sorCode: row.sor_code, description: row.description, unit: row.unit, quantity: row.quantity })) };
  });
 }
 /** A read: the same gate and rule as a command, no lock, no audit event and no refusal record. */
 private async read<T>(context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string | null, work: (db: TenantTransaction) => Promise<T>): Promise<T> {
  try {
   if (!context || typeof context.tenantId !== "string") throw new InvalidTenantContextError();
   if (!same(actor.tenantId, context.tenantId)) throw new SiteVisitError("VISIT_FORBIDDEN");
   return await withTenant(this.pool, context, async db => {
    const refusal = await this.decide(db, actor, jobId);
    // With no job named (the list), only a caller who may not visit at all is refused; an allowed role with no jobs gets an empty list.
    if (refusal && !(jobId === null && refusal.code === "NOT_FOUND")) throw new SiteVisitError(refusal.code);
    return work(db);
   });
  } catch (error) {
   if (error instanceof SiteVisitError) throw error;
   if (error instanceof InvalidTenantContextError) throw new SiteVisitError("NOT_FOUND");
   throw new SiteVisitError("SITE_VISIT_UNAVAILABLE");
  }
 }
}

// Materialize current assignments before invoking the unchanged, per-job authority rule.
// Keep the 201-row limit AFTER authority and ordering (the public list returns 200).
export const assignedJobsQuery = `WITH assigned_orders AS MATERIALIZED (
      SELECT w.tenant_id,w.job_id,w.id,w.reference,c.revision_id
      FROM app.work_order w
      JOIN app.work_order_current c ON(c.tenant_id,c.work_order_id)=(w.tenant_id,w.id)
      WHERE w.tenant_id=$1 AND EXISTS (
       SELECT 1 FROM app.job_assignment a
       WHERE (a.tenant_id,a.revision_id)=(c.tenant_id,c.revision_id) AND a.membership_id=$2
      )
     )
     SELECT w.job_id,w.id work_order_id,w.reference,r.priority,to_char(r.issued_on,'YYYY-MM-DD') issued_on,to_char(r.due_on,'YYYY-MM-DD') due_on,
      (SELECT v.id FROM app.site_visit v WHERE v.tenant_id=w.tenant_id AND v.job_id=w.job_id AND v.membership_id=$2 AND v.completed_at IS NULL ORDER BY v.started_at,v.id LIMIT 1) open_visit
     FROM assigned_orders w
     JOIN app.job j ON(j.tenant_id,j.id)=(w.tenant_id,w.job_id)
     JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(w.tenant_id,w.id,w.revision_id)
     WHERE w.tenant_id=$1 AND j.provenance='work_order' AND (SELECT a.decision FROM app.ent3b_visit_authority($2,w.job_id) a)='allowed'
     ORDER BY r.due_on NULLS LAST,w.reference,w.job_id LIMIT 201`;
