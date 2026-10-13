import type { Pool } from "pg";
import { z } from "zod";
import { ExtraPersistenceError, WorkOrderError, SiteExtraError, siteExtraContentSha256V1, type SiteExtraErrorCode } from "@jobguard/core";
import { ExtraRepository, type ExtraTransactionSeam, type RaisedExtra } from "./extra-repository.js";
import { appendAuditBatch } from "./audit.js";
import { assertContractorGate, derivedUuid } from "./work-order-repository.js";
import { withTenant, InvalidTenantContextError, type VerifiedTenantContext, type AuthenticatedMembership, type TenantTransaction } from "./tenant-context.js";
import { requireLiveJob, WatchdogError } from "./watchdog.js";
import { SorSiteExtraError, canonicalSorQuantity, orderCheckV1, parseOrderCheckQuery, parseSorItemsQuery, parseSorSiteExtraInput, type SiteOrderCheck, type SorSiteExtraErrorCode } from "@jobguard/core";
import { canonicalJson, sha256Hex } from "./work-order-repository.js";
import { readOrderFacts, readReplay, readStoredPriced, searchItems, type StoredPriced } from "./site-extra-pricing-queries.js";
/** ENT-3c: what a priced log answers. The price itself is never part of an answer (Q7). */
export type StoredSorExtra = Pick<StoredPriced, "variationId" | "jobId" | "coverage" | "sorCode" | "unit" | "claimedQuantity" | "instructedQuantity" | "extraQuantity" | "orderLineScopeItemId" | "priceSource">;
const commandType = "LogSiteExtra";
const inputV1 = z.object({ commandId: z.string().uuid(), jobId: z.string().uuid(), note: z.string().min(1).max(5000).refine(value => /\S/u.test(value)), description: z.string().min(1).max(500).refine(value => /\S/u.test(value)) }).strict();
type Input = z.infer<typeof inputV1>;
const inputV3 = inputV1.extend({ photoEvidenceId: z.string().uuid().optional(), shownContentSha256: z.string().regex(/^[0-9a-f]{64}$/u).optional() }).strict();
type InputV3 = z.infer<typeof inputV3>;
type EvidenceRefusal = { code: "PHOTO_NOT_ACCEPTED" | "CONFIRMATION_MISMATCH"; reason: "photo_not_accepted" | "confirmation_mismatch" };
export type EvidenceFacts = { photoEvidenceId: string | null; residentConfirmationEvidenceId: string | null; contentSha256: string };
export type LoggedSiteExtra = RaisedExtra & { evidence?: EvidenceFacts };
type Refusal = { code: "TRACK_FORBIDDEN" | "EXTRA_FORBIDDEN" | "NOT_FOUND"; reason: "track_not_contractor" | "member_inactive" | "role_not_permitted" | "job_out_of_scope" };
type SiteExtraRefusal = Refusal | EvidenceRefusal;
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
 private async recordRefusal(context: VerifiedTenantContext, actor: AuthenticatedMembership, input: Input, reason: SiteExtraRefusal["reason"]): Promise<void> {
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
 private async evidenceGate(context: VerifiedTenantContext, actor: AuthenticatedMembership, input: InputV3): Promise<Gate | SiteExtraRefusal> {
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
  let refusal: SiteExtraRefusal | undefined;
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

 // ---- ENT-3c additions (append-only): the order check, the server-priced log and the two site reads. Authority first, through the private pre-check; nothing below restates the access rule. ----
 private async sorAuthority(context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string): Promise<{ grant: string; live: boolean } | Refusal> {
  try {
   if (!context || typeof context.tenantId !== "string") throw new InvalidTenantContextError();
   if (actor.tenantId.toLowerCase() !== context.tenantId.toLowerCase()) return { code: "EXTRA_FORBIDDEN", reason: "member_inactive" };
   const authority = await this.precheck(context, actor, jobId);
   return "code" in authority ? authority : { grant: authority.grant, live: true };
  } catch (error) {
   if (error instanceof InvalidTenantContextError) return { code: "NOT_FOUND", reason: "job_out_of_scope" };
   if (error instanceof WatchdogError && error.code === "JOB_NOT_FOUND") return { code: "NOT_FOUND", reason: "job_out_of_scope" };
   // The pre-check raises JOB_NOT_LIVE only after the authority answered allowed, so this caller may know the job exists but is not live.
   if (error instanceof WatchdogError && error.code === "JOB_NOT_LIVE") return { grant: "", live: false };
   throw error;
  }
 }
 private async storedSor(context: VerifiedTenantContext, variationId: string): Promise<StoredPriced> {
  const found = await withTenant(this.pool, context, db => readStoredPriced(db, context.tenantId.toLowerCase(), variationId));
  if (!found) throw new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
  return found;
 }
 /** Logs a schedule-item extra: the server compares the amount with the order, prices the extra quantity alone, and keeps the price in the raising transaction. */
 async logSorSiteExtra(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<StoredSorExtra> {
  const input = parseSorSiteExtraInput(raw);
  const requestHash = sha256Hex(canonicalJson({ version: "log-sor-site-extra.v1", jobId: input.jobId.toLowerCase(), sorCode: input.sorCode, quantity: input.quantity, orderLineScopeItemId: input.orderLineScopeItemId?.toLowerCase() ?? null, note: input.note }));
  // recordRefusal reads only the command id and the job; the other fields are the typed shape it was written against.
  const refusalInput: Input = { commandId: input.commandId, jobId: input.jobId, note: input.note, description: input.sorCode };
  const refuse = async (refusal: Refusal): Promise<never> => { await this.recordRefusal(context, actor, refusalInput, refusal.reason); throw new SorSiteExtraError(refusal.code); };
  const authority = await this.sorAuthority(context, actor, input.jobId);
  if ("code" in authority) return refuse(authority);
  const tenant = context.tenantId.toLowerCase();
  // Replay comes before the order check, so a replay still returns the first answer after the order, the price list or the member's grants have moved on.
  const replay = await withTenant(this.pool, context, db => readReplay(db, tenant, input.commandId));
  if (replay.revision) {
   const same = replay.revision.jobId.toLowerCase() === input.jobId.toLowerCase() && replay.revision.raisingMembershipId.toLowerCase() === actor.membershipId.toLowerCase() && replay.revision.requestHash === requestHash;
   if (!same) throw new SorSiteExtraError("IDEMPOTENCY_CONFLICT");
   return this.storedSor(context, replay.revision.variationId);
  }
  if (replay.receiptExists) throw new SorSiteExtraError("IDEMPOTENCY_CONFLICT");
  if (!authority.live) throw new SorSiteExtraError("JOB_NOT_LIVE");
  let planned;
  try {
   planned = await withTenant(this.pool, context, async db => {
    await requireLiveJob(db, input.jobId);
    const facts = await readOrderFacts(db, tenant, input.jobId, input.sorCode);
    if (!facts || !facts.sorVersionId) throw new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
    if (!facts.item) throw new SorSiteExtraError("SOR_ITEM_NOT_FOUND");
    const check = orderCheckV1({ sorCode: input.sorCode, quantity: input.quantity, ...(input.orderLineScopeItemId ? { orderLineScopeItemId: input.orderLineScopeItemId } : {}), lines: facts.lines });
    if (check.outcome === "already_on_order") throw new SorSiteExtraError("ALREADY_ON_ORDER");
    return { versionId: facts.sorVersionId, description: facts.item.description, check };
   });
  } catch (error) {
   if (error instanceof WatchdogError && error.code === "JOB_NOT_FOUND") return refuse({ code: "NOT_FOUND", reason: "job_out_of_scope" });
   if (error instanceof WatchdogError && error.code === "JOB_NOT_LIVE") throw new SorSiteExtraError("JOB_NOT_LIVE");
   throw error;
  }
  // merged raiseExtra rewrites every error it does not know, so each seam step remembers its own exact refusal in this one call's local variable.
  let seamFailure: string | undefined;
  const remember = (error: unknown): never => { seamFailure = error instanceof Error ? error.message : undefined; throw error; };
  let raised: { variationId: string };
  try {
   raised = await new ExtraRepository(this.pool).raiseExtra(context, { version: "raise-extra.v1", commandId: input.commandId, commandType, jobId: input.jobId, actorMembershipId: actor.membershipId, grantId: authority.grant, note: input.note, description: planned.description,
    sorItem: { versionId: planned.versionId, code: input.sorCode }, ...(planned.check.outcome === "more_than_ordered" ? { excessOfScopeItemId: planned.check.orderLineScopeItemId } : {}) }, async (db, fact) => {
    try { await requireLiveJob(db, fact.jobId); } catch (error) { remember(error); }
    try { await siteExtraAuthoritySeam(db, fact); } catch (error) { remember(error); }
    try { await db.$client.query("SELECT app.ent3c_record_sor_revision($1,$2,$3,$4)", [fact.jobId, fact.variationId, input.quantity, requestHash]); } catch (error) { remember(error); }
   });
  } catch (error) {
   const recorded: Record<string, SorSiteExtraErrorCode> = { JOB_NOT_LIVE: "JOB_NOT_LIVE", ALREADY_ON_ORDER: "ALREADY_ON_ORDER", EXTRA_NOT_POSITIVE: "EXTRA_NOT_POSITIVE", MONEY_OUT_OF_RANGE: "MONEY_OUT_OF_RANGE", INVALID_QUANTITY: "INVALID_QUANTITY", ORDER_CHECK_STALE: "SITE_PRICING_UNAVAILABLE" };
   if (seamFailure && recorded[seamFailure]) throw new SorSiteExtraError(recorded[seamFailure]!);
   const persistence = error instanceof ExtraPersistenceError ? error.code : undefined;
   if (persistence === "COMMAND_CONFLICT") throw new SorSiteExtraError("IDEMPOTENCY_CONFLICT");
   if (persistence === "INVALID_COMMAND") throw new SorSiteExtraError("INVALID_COMMAND");
   if (persistence === "NOT_FOUND" || persistence === "INVALID_ORIGIN" || seamFailure === "JOB_NOT_FOUND") {
    // The facts changed after the pre-check: ask the access rule again and answer what it now says.
    const current = await this.sorAuthority(context, actor, input.jobId);
    if ("code" in current) return refuse(current);
    if (!current.live) throw new SorSiteExtraError("JOB_NOT_LIVE");
   }
   throw new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
  }
  const stored = await this.storedSor(context, raised.variationId);
  if (stored.requestHash !== requestHash) throw new SorSiteExtraError("IDEMPOTENCY_CONFLICT");
  return stored;
 }
 /** Search of THIS job's price list. The text is required. Writes nothing and records no refusal. */
 async sorItems(context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string, rawQuery: unknown): Promise<{ sorVersionId: string; items: Array<{ code: string; description: string; unit: string }>; truncated: boolean }> {
  const query = parseSorItemsQuery(rawQuery);
  if (!z.string().uuid().safeParse(jobId).success) throw new SorSiteExtraError("NOT_FOUND");
  const authority = await this.sorAuthority(context, actor, jobId);
  if ("code" in authority) throw new SorSiteExtraError(authority.code);
  const tenant = context.tenantId.toLowerCase();
  return withTenant(this.pool, context, async db => {
   const facts = await readOrderFacts(db, tenant, jobId, null);
   if (!facts || !facts.sorVersionId) throw new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
   return { sorVersionId: facts.sorVersionId, ...(await searchItems(db, tenant, facts.sorVersionId, query.q)) };
  });
 }
 /** The order check as a read: the same outcome the command then acts on, already-on-the-order included as a result. Writes nothing and records no refusal. */
 async orderCheck(context: VerifiedTenantContext, actor: AuthenticatedMembership, jobId: string, rawQuery: unknown): Promise<SiteOrderCheck["orderCheck"]> {
  const query = parseOrderCheckQuery(rawQuery);
  if (!z.string().uuid().safeParse(jobId).success) throw new SorSiteExtraError("NOT_FOUND");
  const authority = await this.sorAuthority(context, actor, jobId);
  if ("code" in authority) throw new SorSiteExtraError(authority.code);
  const tenant = context.tenantId.toLowerCase();
  return withTenant(this.pool, context, async db => {
   const facts = await readOrderFacts(db, tenant, jobId, query.sorCode);
   if (!facts) throw new SorSiteExtraError("SITE_PRICING_UNAVAILABLE");
   if (!facts.item) throw new SorSiteExtraError("SOR_ITEM_NOT_FOUND");
   const check = orderCheckV1({ sorCode: query.sorCode, quantity: query.quantity, ...(query.orderLine ? { orderLineScopeItemId: query.orderLine } : {}), lines: facts.lines });
   const claimedQuantity = canonicalSorQuantity(query.quantity);
   if (check.outcome === "new") return { outcome: "new" as const, sorCode: query.sorCode, unit: facts.item.unit, claimedQuantity, instructedQuantity: null, extraQuantity: check.extraQuantity, orderLineScopeItemId: null };
   if (check.outcome === "more_than_ordered") return { outcome: "more_than_ordered" as const, sorCode: query.sorCode, unit: facts.item.unit, claimedQuantity, instructedQuantity: check.instructedQuantity, extraQuantity: check.extraQuantity, orderLineScopeItemId: check.orderLineScopeItemId };
   return { outcome: "already_on_order" as const, sorCode: query.sorCode, unit: facts.item.unit, claimedQuantity, instructedQuantity: check.instructedQuantity, orderLineScopeItemId: check.orderLineScopeItemId };
  });
 }
}
