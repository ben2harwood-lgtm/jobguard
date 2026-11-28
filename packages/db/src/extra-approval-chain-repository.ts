import { parseSorSiteExtraInput } from "@jobguard/core";
import { SiteExtraRepository } from "./site-extra-repository.js";
import { beginRepositoryCommand, completeRepositoryCommand } from "./repository-command.js";
import { readExtraApprovalTiming } from "./extra-approval-timing.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import { appendAuditBatch, type AuditEventInput } from "./audit.js";
import { UserCommandDispatcher, type CommandMutation, type ConsequentialCommand } from "./commands.js";
import { appendOutboundAction } from "./outbox.js";
import { outboundWorkerPool } from "./worker-pool.js";
import { canonicalJson, derivedUuid, sha256Hex } from "./work-order-repository.js";
import { withTenant, InvalidTenantContextError, type AuthenticatedMembership, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

/** ENT-5b: the approval chain. Every write goes through a checked SECURITY DEFINER routine (app.xa_*); this class never writes a business table itself. */
export const extraApprovalErrorCodes = [
  "INVALID_COMMAND", "COMMAND_CONFLICT", "NOT_FOUND", "PERMISSION_DENIED", "INVALID_TRANSITION", "STALE_REVISION", "ALREADY_DECIDED", "HASH_MISMATCH", "UNPRICED",
  "STEP_OUT_OF_ORDER", "CLIENT_STEP_REQUIRES_CLIENT", "SELF_APPROVAL", "REUSED_APPROVER", "REPEAT_HELD", "RULES_NOT_FOUND", "INVALID_RULES",
  "LINK_INVALID", "LINK_EXPIRED", "LINK_REVOKED", "LINK_REPLAYED", "EMAIL_MISMATCH", "SEND_NOT_AUTHORISED", "MODE_FORBIDDEN", "DATABASE_UNAVAILABLE",
  // Pricing contract v2 (docs/contracts/extra-price-rules-v2.md).
  "BASIS_REQUIRED", "INVALID_BASIS", "REVISION_REASON_REQUIRED", "RATE_NOT_FOUND", "ALREADY_ON_ORDER", "EVIDENCE_NOT_FOUND", "INVALID_QUANTITY", "EXTRA_NOT_POSITIVE", "MONEY_OUT_OF_RANGE",
] as const;
export type ExtraApprovalErrorCode = typeof extraApprovalErrorCodes[number];
export class ExtraApprovalError extends Error {
  constructor(readonly code: ExtraApprovalErrorCode, options?: { cause?: unknown }) { super(code, options); this.name = "ExtraApprovalError"; }
}
function failure(error: unknown): never {
  if (error instanceof ExtraApprovalError || error instanceof InvalidTenantContextError) throw error;
  const e = error as { code?: string; message?: string };
  const known = extraApprovalErrorCodes.find(code => e.message === code);
  if (known) throw new ExtraApprovalError(known);
  if (e.message === "COMMAND_CONFLICT") throw new ExtraApprovalError("COMMAND_CONFLICT");
  if (e.code === "FORBIDDEN" || e.message === "FORBIDDEN") throw new ExtraApprovalError("PERMISSION_DENIED");
  if (e.message === "AUTHORIZATION_INVALID") throw new ExtraApprovalError("SEND_NOT_AUTHORISED");
  if (e.code === "23505") throw new ExtraApprovalError("ALREADY_DECIDED");
  if (e.code === "40001" || e.code === "40P01") throw new ExtraApprovalError("STALE_REVISION");
  if (e.code === "23514" || e.code === "22P02") throw new ExtraApprovalError("INVALID_COMMAND");
  if (e.code === "23503" || e.code === "P0002") throw new ExtraApprovalError("NOT_FOUND");
  if (e.code === "42501") throw new ExtraApprovalError("PERMISSION_DENIED");
  throw new ExtraApprovalError("DATABASE_UNAVAILABLE", { cause: error });
}

const uuid = z.guid({ error: "Invalid uuid" }), hash = z.string().regex(/^[a-f0-9]{64}$/u);
const reason = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/u);
const pence = z.number().int().min(1).max(1_000_000_000_000);
const common = { commandId: uuid, jobId: uuid };
export const submitExtraV1 = z.object({ version: z.literal("submit-extra.v1"), ...common, extraId: uuid }).strict();
/** v1 is not redefined: a completed v1 command replays to its stored result; a new v1 submission is refused BASIS_REQUIRED. */
export const priceExtraV1 = z.object({ version: z.literal("price-extra.v1"), ...common, extraId: uuid, netPence: pence }).strict();
export const reviseExtraV1 = z.object({ version: z.literal("revise-extra.v1"), ...common, extraId: uuid, netPence: pence }).strict();
/** Pricing contract v2: every price and revision states its basis. The client never submits an amount; only a surveyor may give a quoted net. */
export const quantityText = z.string().regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/u);
const basisNote = z.string().min(1).max(500).refine(s => s.trim().length > 0);
export const quoteMethods = ["dayworks", "quotation", "agreed_lump_sum", "materials_plus"] as const;
export const serverSorBasisV2 = z.object({ kind: z.literal("server_sor"), sorCode: z.string().min(1).max(80), claimedQuantity: quantityText }).strict();
export const surveyorQuotedBasisV2 = z.object({ kind: z.literal("surveyor_quoted"), netPence: pence, method: z.enum(quoteMethods), note: basisNote, evidenceId: uuid.optional() }).strict();
export const extraPricingBasisV2 = z.discriminatedUnion("kind", [serverSorBasisV2, surveyorQuotedBasisV2]);
export const revisionReasons = ["response_to_rejection", "quantity_corrected", "rate_corrected", "pricing_error"] as const;
export const priceExtraV2 = z.object({ version: z.literal("price-extra.v2"), ...common, extraId: uuid, basis: extraPricingBasisV2 }).strict();
export const reviseExtraV2 = z.object({ version: z.literal("revise-extra.v2"), ...common, extraId: uuid, basis: extraPricingBasisV2,
  reason: z.enum(revisionReasons), reasonNote: basisNote.optional(), answersRequestId: uuid }).strict();
export type ExtraPricingBasisV2 = z.infer<typeof extraPricingBasisV2>;
export type PriceExtraV2 = z.infer<typeof priceExtraV2>;
export type ReviseExtraV2 = z.infer<typeof reviseExtraV2>;
export const extraPricingBasisQueryV1 = z.object({ version: z.literal("extra-pricing-basis-query.v1"), jobId: uuid, extraId: uuid }).strict();
const bound = { requestId: uuid, stepIndex: z.number().int().min(0).max(20), revisionHash: hash, netPence: pence };
export const approveExtraStepV1 = z.object({ version: z.literal("approve-extra-step.v1"), ...common, ...bound }).strict();
export const rejectExtraV1 = z.object({ version: z.literal("reject-extra.v1"), ...common, ...bound, reasonCode: reason }).strict();
export const withdrawExtraV1 = z.object({ version: z.literal("withdraw-extra.v1"), ...common, extraId: uuid, reasonCode: z.enum(["not_done", "raised_in_error", "resident_cancelled", "already_on_order"]) }).strict();
export const markDuplicateV1 = z.object({ version: z.literal("mark-duplicate.v1"), ...common, duplicateId: uuid, canonicalId: uuid }).strict();
/** A granted surveyor/commercial manager approves THIS request, recipient, amount and expiry. Practice recipients end in .invalid and nothing is delivered. */
export const issueClientApprovalV1 = z.object({ version: z.literal("issue-client-approval.v1"), ...common, requestId: uuid, approverMembershipId: uuid, recipient: z.email({ error: "Invalid email" }).refine(s => s.toLowerCase().endsWith(".invalid")),
  linkToken: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/u), signinDigest: hash.optional(), expiresAt: z.coerce.date() }).strict();
export const revokeClientApprovalV1 = z.object({ version: z.literal("revoke-client-approval.v1"), ...common, linkId: uuid }).strict();
export const clientApprovalViewV1 = z.object({ version: z.literal("client-approval-view.v1"), jobId: uuid, requestId: uuid, linkToken: z.string().min(16).max(200), email: z.email({ error: "Invalid email" }) }).strict();
export const decideClientApprovalV1 = z.object({ version: z.literal("decide-client-approval.v1"), ...common, requestId: uuid, linkToken: z.string().min(16).max(200), email: z.email({ error: "Invalid email" }), revisionHash: hash, netPence: pence,
  decision: z.enum(["approve", "reject"]), reasonCode: reason.optional(),
  /** Ben decision 20: a named fictional role, with the real tester recorded beside it. Neither may be omitted. */
  fictionalRoleName: z.string().trim().min(1).max(100), actualTesterReference: z.string().trim().min(1).max(100) }).strict();

type Result = Record<string, unknown>;
const lc = (s: string) => s.toLowerCase();
const audit = (actor: string, type: string, extra: string, refs: Record<string, string>, hashes?: Record<string, string>, id: string = randomUUID()): AuditEventInput =>
  ({ id, version: "audit.v1", actorRef: `membership:${actor}`, eventType: type, subjectType: "extra", subjectRef: extra, payload: { references: { ...refs, environment: "synthetic_demo" }, ...(hashes ? { hashes } : {}), classifications: { action: "commercial" } } });

export class ExtraApprovalRepository {
  constructor(private readonly pool: Pool) {}

  private parse<T>(schema: z.ZodType<T>, raw: unknown): T {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ExtraApprovalError("INVALID_COMMAND");
    return parsed.data;
  }
  private checkActor(context: VerifiedTenantContext, actor: AuthenticatedMembership): string {
    if (lc(actor.tenantId) !== lc(context.tenantId)) throw new ExtraApprovalError("PERMISSION_DENIED");
    return lc(actor.membershipId);
  }
  /** One transaction: claim the receipt, run the checked routine, append the audit chain last, complete the receipt. A failure leaves nothing behind. */
  private async run(context: VerifiedTenantContext, actor: AuthenticatedMembership, type: string, commandId: string, semantic: string, content: unknown,
    work: (db: TenantTransaction, tenant: string, member: string) => Promise<{ result: Result; audits: AuditEventInput[] }>): Promise<Result> {
    const member = this.checkActor(context, actor), tenant = lc(context.tenantId), legacyJson = canonicalJson({ type, actor: member, content });
    try {
      return await withTenant(this.pool, context, async db => {
        if (type !== "RevokeClientApproval") await db.$client.query("SELECT app.mon8_require_feature($1,'approval_chains')", [member]);
        const claimed=await beginRepositoryCommand<Result>(db,{tenantId:tenant,actorMembershipId:member,commandId,
          commandType:type,semanticKey:semantic,jobId:(content as {jobId:string}).jobId,legacyJson});
        if(claimed.kind==="replay")return claimed.result;
        const { audits } = await work(db, tenant, member);
        await appendAuditBatch(db, audits);
        return completeRepositoryCommand<Result>(db,commandId);
      });
    } catch (error) { failure(error); }
  }
  private async call(db: TenantTransaction, sql: string, args: unknown[]): Promise<Result> {
    return (await db.$client.query<{ r: Result }>(sql, args)).rows[0]!.r;
  }

  async submitExtra(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const i = this.parse(submitExtraV1, raw);
    return this.run(context, actor, "SubmitExtra", i.commandId, `extra-submit:${i.jobId}:${i.extraId}:${i.commandId}`, { jobId: i.jobId, extraId: i.extraId }, async (db, _t, m) => {
      const r = await this.call(db, "SELECT app.xa_submit($1,$2,$3,$4) r", [i.jobId, i.extraId, i.commandId, m]);
      return { result: r, audits: [audit(m, "contractor.extra.submitted", i.extraId, { command: i.commandId, job: i.jobId, extra: i.extraId, request: String(r.requestId) }, { revision: String(r.revisionHash) })] };
    });
  }
  /** Recover only the original priced capture's first, still-current request.
   * No receipt is borrowed from the supervisor and no approval state is changed. */
  async recoverPricedSubmission(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const i = parseSorSiteExtraInput(raw);
    if (!("version" in i) || i.version !== "log-sor-site-extra.v2") throw new ExtraApprovalError("INVALID_COMMAND");
    const member = this.checkActor(context, actor);
    try {
      const saved = await withTenant(this.pool, context, async db => (await db.$client.query(`
        SELECT 1 FROM app.extra_sor_revision s JOIN app.command_receipt c ON(c.tenant_id,c.command_id)=(s.tenant_id,s.command_id)
        WHERE s.tenant_id=$1 AND s.job_id=$2 AND s.command_id=$3 AND s.raising_membership_id=$4
          AND c.command_type='LogSiteExtra' AND c.status='succeeded' AND c.actor_membership_id=$4`,
        [lc(context.tenantId), i.jobId, i.commandId, member])).rowCount);
      if (!saved) throw new ExtraApprovalError("INVALID_TRANSITION");
      // Reuse the log's authoritative actor/payload replay proof; never duplicate
      // its hash format or consume another actor's command receipt.
      const logged = await new SiteExtraRepository(this.pool).logSorSiteExtra(context, actor, i);
      return await withTenant(this.pool, context, async db => {
        await db.$client.query("SELECT app.mon8_require_feature($1,'site_origin_capture'),app.mon8_require_feature($1,'approval_chains')", [member]);
        const row = (await db.$client.query<{ requestId: string; state: string }>(`
          SELECT q.id "requestId",e.kind state
          FROM app.extra_sor_revision s
          JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(s.tenant_id,s.job_id,s.variation_id)
          JOIN app.command_receipt c ON(c.tenant_id,c.command_id)=(s.tenant_id,s.command_id)
          JOIN app.extra_approval_request q ON(q.tenant_id,q.job_id,q.variation_id)=(s.tenant_id,s.job_id,s.variation_id)
          JOIN LATERAL (SELECT kind FROM app.extra_event x
            WHERE(x.tenant_id,x.job_id,x.variation_id)=(s.tenant_id,s.job_id,s.variation_id)
            ORDER BY sequence DESC LIMIT 1) e ON true
          JOIN app.membership m ON(m.tenant_id,m.id)=(s.tenant_id,s.raising_membership_id)
          WHERE s.tenant_id=$1 AND s.job_id=$2 AND s.variation_id=$3 AND s.command_id=$4
            AND s.raising_membership_id=$5 AND o.raising_membership_id=$5
            AND o.job_track='contractor' AND o.provenance='command'
            AND c.command_type='LogSiteExtra' AND c.status='succeeded' AND c.actor_membership_id=$5
            AND app.contractor_member_active($5)
            AND ((m.role='operative' AND app.contractor_job_assigned($5,$2))
              OR app.xa_covers($5,ARRAY['supervisor','surveyor'],$2,'job.read') IS NOT NULL)
            AND q.request_revision=1 AND q.revision_hash=s.content_hash
            AND NOT EXISTS(SELECT 1 FROM app.extra_approval_request newer
              WHERE(newer.tenant_id,newer.job_id,newer.variation_id)=(q.tenant_id,q.job_id,q.variation_id) AND newer.request_revision>q.request_revision)
            AND e.kind IN('awaiting_approval','approved')`,
          [lc(context.tenantId), i.jobId, logged.variationId, i.commandId, member])).rows[0];
        if (!row) throw new ExtraApprovalError("INVALID_TRANSITION");
        return row;
      });
    } catch (error) { failure(error); }
  }
  /** v1 (netPence only) never prices again: an identical completed v1 command replays its stored result; anything else is BASIS_REQUIRED.
   * The receipt lifecycle still checks the actor's current grant and the exact v1 payload first (a changed payload is COMMAND_CONFLICT). */
  private legacyPrice(context: VerifiedTenantContext, actor: AuthenticatedMembership, type: "PriceExtra" | "ReviseExtra", i: z.infer<typeof priceExtraV1> | z.infer<typeof reviseExtraV1>): Promise<Result> {
    const prefix = type === "PriceExtra" ? "extra-price" : "extra-revise";
    return this.run(context, actor, type, i.commandId, `${prefix}:${i.jobId}:${i.extraId}:${i.commandId}`, { jobId: i.jobId, extraId: i.extraId, netPence: i.netPence }, async () => {
      throw new ExtraApprovalError("BASIS_REQUIRED");
    });
  }
  /** A v2 body with no basis is refused as BASIS_REQUIRED; any other shape problem is INVALID_COMMAND. */
  private parseV2<T>(schema: z.ZodType<T>, version: string, raw: unknown): T {
    if (raw && typeof raw === "object" && (raw as { version?: unknown }).version === version && ((raw as { basis?: unknown }).basis === undefined || (raw as { basis?: unknown }).basis === null)) {
      throw new ExtraApprovalError("BASIS_REQUIRED");
    }
    return this.parse(schema, raw);
  }
  private basisArgs(basis: ExtraPricingBasisV2) {
    return basis.kind === "server_sor"
      ? [basis.kind, basis.sorCode, basis.claimedQuantity, null, null, null, null]
      : [basis.kind, null, null, basis.netPence, basis.method, basis.note, basis.evidenceId ?? null];
  }
  private basisContent(basis: ExtraPricingBasisV2) {
    return basis.kind === "server_sor" ? { kind: basis.kind, sorCode: basis.sorCode, claimedQuantity: basis.claimedQuantity }
      : { kind: basis.kind, netPence: basis.netPence, method: basis.method, note: basis.note, evidenceId: basis.evidenceId ?? null };
  }
  async priceExtra(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const legacy = priceExtraV1.safeParse(raw);
    if (legacy.success) return this.legacyPrice(context, actor, "PriceExtra", legacy.data);
    const i = this.parseV2(priceExtraV2, "price-extra.v2", raw);
    return this.run(context, actor, "PriceExtra", i.commandId, `extra-price:${i.jobId}:${i.extraId}:${i.commandId}`, { version: i.version, jobId: i.jobId, extraId: i.extraId, basis: this.basisContent(i.basis) }, async (db, _t, m) => {
      const r = await this.call(db, "SELECT app.xa_price_v2($1,$2,$3,$4,false,$5,$6,$7,$8,$9,$10,$11,NULL,NULL,NULL) r", [i.jobId, i.extraId, i.commandId, m, ...this.basisArgs(i.basis)]);
      const basis = r.basis as { basisId: string; basisHash: string };
      return { result: r, audits: [audit(m, "contractor.extra.priced", i.extraId, { command: i.commandId, job: i.jobId, extra: i.extraId, binding: String(r.bindingId), basis: basis.basisId }, { revision: String(r.revisionHash), basis: basis.basisHash })] };
    });
  }
  async reviseExtra(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const legacy = reviseExtraV1.safeParse(raw);
    if (legacy.success) return this.legacyPrice(context, actor, "ReviseExtra", legacy.data);
    const i = this.parseV2(reviseExtraV2, "revise-extra.v2", raw);
    const content = { version: i.version, jobId: i.jobId, extraId: i.extraId, basis: this.basisContent(i.basis), reason: i.reason, reasonNote: i.reasonNote ?? null, answersRequestId: i.answersRequestId };
    return this.run(context, actor, "ReviseExtra", i.commandId, `extra-revise:${i.jobId}:${i.extraId}:${i.commandId}`, content, async (db, _t, m) => {
      const r = await this.call(db, "SELECT app.xa_price_v2($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) r",
        [i.jobId, i.extraId, i.commandId, m, ...this.basisArgs(i.basis), i.reason, i.reasonNote ?? null, i.answersRequestId]);
      const basis = r.basis as { basisId: string; basisHash: string };
      return { result: r, audits: [audit(m, "contractor.extra.revised", i.extraId, { command: i.commandId, job: i.jobId, extra: i.extraId, request: String(r.requestId), answers: i.answersRequestId, reason: i.reason, basis: basis.basisId }, { revision: String(r.revisionHash), basis: basis.basisHash })] };
    });
  }
  /** Contractor read of each priced binding's basis, oldest first. A binding with no recorded basis reads "basis_not_recorded"; nothing is inferred or back-filled.
   * Covered surveyors, supervisors and commercial managers only; the client never reaches this read. */
  async pricingBasis(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const i = this.parse(extraPricingBasisQueryV1, raw), member = this.checkActor(context, actor), tenant = lc(context.tenantId);
    try {
      return await withTenant(this.pool, context, async db => {
        const allowed = (await db.$client.query<{ allowed: boolean }>("SELECT app.xa_covers($1,ARRAY['surveyor','supervisor','commercial_manager'],$2,'job.read') IS NOT NULL AS allowed", [member, i.jobId])).rows[0];
        if (!allowed?.allowed) throw new ExtraApprovalError("PERMISSION_DENIED");
        const extra = (await db.$client.query("SELECT 1 FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2 AND variation_id=$3 AND job_track='contractor' AND provenance='command'", [tenant, i.jobId, i.extraId])).rowCount;
        if (!extra) throw new ExtraApprovalError("NOT_FOUND");
        const rows = (await db.$client.query<Record<string, unknown>>(`
          SELECT b.id "bindingId",b.logical_revision "logicalRevision",b.source_kind "sourceKind",coalesce(s.net_pence,vr.signed_delta_pence)::text "netPence",
            coalesce(v2.pricing_basis,legacy.pricing_basis) "pricingBasis",v2.id "basisId",v2.basis_hash "basisHash",legacy.id "legacyBasisId",
            coalesce(v2.sor_code,s.sor_code) "sorCode",coalesce(v2.unit,s.unit) "unit",coalesce(v2.rate_pence,s.rate_pence)::text "ratePence",
            coalesce(v2.sor_version_id,s.sor_version_id) "sorVersionId",coalesce(v2.work_order_revision_id,s.work_order_revision_id) "workOrderRevisionId",
            coalesce(v2.adjustment_numerator,s.adjustment_numerator)::text "adjustmentNumerator",coalesce(v2.adjustment_denominator,s.adjustment_denominator)::text "adjustmentDenominator",
            coalesce(v2.coverage,s.coverage) "coverage",coalesce(v2.instructed_quantity,s.instructed_quantity) "instructedQuantity",coalesce(v2.claimed_quantity,s.claimed_quantity) "claimedQuantity",
            coalesce(v2.priced_quantity,s.quantity) "pricedQuantity",v2.quote_method "method",v2.basis_note "note",v2.basis_evidence_id "evidenceId",
            v2.revision_reason "reason",v2.revision_note "reasonNote",v2.answers_request_id "answersRequestId",
            to_char(coalesce(v2.server_recorded_at,legacy.server_recorded_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') "recordedAt"
          FROM app.extra_approval_revision_binding b
          LEFT JOIN app.variation_revision vr ON(vr.tenant_id,vr.job_id,vr.id)=(b.tenant_id,b.job_id,b.variation_revision_id)
          LEFT JOIN app.extra_sor_revision s ON(s.tenant_id,s.job_id,s.id)=(b.tenant_id,b.job_id,b.sor_revision_id)
          LEFT JOIN app.extra_pricing_basis v2 ON(v2.tenant_id,v2.job_id,v2.variation_id,v2.binding_id)=(b.tenant_id,b.job_id,b.variation_id,b.id) AND v2.basis_version='extra-pricing-basis.v2'
          LEFT JOIN app.extra_pricing_basis legacy ON b.source_kind='server_sor' AND legacy.basis_version IS NULL
            AND(legacy.tenant_id,legacy.job_id,legacy.variation_id,legacy.revision,legacy.revision_content_hash)=(s.tenant_id,s.job_id,s.variation_id,s.revision,s.content_hash)
          WHERE b.tenant_id=$1 AND b.job_id=$2 AND b.variation_id=$3 ORDER BY b.logical_revision`, [tenant, i.jobId, i.extraId])).rows;
        const prices = rows.map(r => {
          const recorded = r.pricingBasis !== null;
          const common = { bindingId: r.bindingId, logicalRevision: r.logicalRevision, netPence: Number(r.netPence) };
          if (!recorded) return { ...common, basisStatus: "basis_not_recorded" as const };
          const rate = r.pricingBasis === "server_sor" ? { sorCode: r.sorCode, unit: r.unit, ratePence: Number(r.ratePence), sorVersionId: r.sorVersionId, workOrderRevisionId: r.workOrderRevisionId,
            adjustment: { numerator: r.adjustmentNumerator, denominator: r.adjustmentDenominator }, coverage: r.coverage, instructedQuantity: r.instructedQuantity, claimedQuantity: r.claimedQuantity, pricedQuantity: r.pricedQuantity }
            : { method: r.method, note: r.note, evidenceId: r.evidenceId };
          const revision = r.reason === null ? {} : { revision: { reason: r.reason, note: r.reasonNote, answersRequestId: r.answersRequestId } };
          return { ...common, basisStatus: "recorded" as const, basis: { kind: r.pricingBasis, source: r.basisId === null ? "origin_capture" : "extra-pricing-basis.v2", recordedAt: r.recordedAt, ...rate }, ...revision };
        });
        return { version: "extra-pricing-basis.v1", environment: "synthetic_demo", jobId: i.jobId, extraId: i.extraId, prices };
      });
    } catch (error) { failure(error); }
  }
  private async decide(context: VerifiedTenantContext, actor: AuthenticatedMembership, i: z.infer<typeof approveExtraStepV1> | z.infer<typeof rejectExtraV1>, rejecting: boolean): Promise<Result> {
    const type = rejecting ? "RejectExtra" : "ApproveExtraStep", reasonCode = rejecting ? (i as z.infer<typeof rejectExtraV1>).reasonCode : null;
    // Reuse the first receipt for this person/step, including receipts made before this ruling.
    // begin_command still verifies the complete payload and current grants before returning it.
    const member = this.checkActor(context, actor);
    let semantic = `extra-step:${i.requestId}:${i.stepIndex}:${member}`;
    try {
      const prior = await withTenant(this.pool, context, async db => (await db.$client.query<{ semantic_key: string }>(
        // Every receipt for this step (legacy :commandId or current :member keys) shares the
        // step prefix, so no receipt result is read to choose the key to reuse.
        `SELECT r.semantic_key FROM app.command_receipt r
         WHERE r.tenant_id=$1 AND r.actor_membership_id=$2 AND r.command_type=$3 AND starts_with(r.semantic_key,$5) AND
          (r.command_id=$4 OR r.status='succeeded')
         ORDER BY (r.command_id=$4) DESC,r.created_at,r.command_id LIMIT 1`,
        [context.tenantId, member, type, i.commandId, `extra-step:${i.requestId}:${i.stepIndex}:`])).rows[0]);
      if (prior) semantic = prior.semantic_key;
    } catch (error) { failure(error); }
    return this.run(context, actor, type, i.commandId, semantic, { jobId: i.jobId, requestId: i.requestId, stepIndex: i.stepIndex, hash: i.revisionHash, net: i.netPence, reasonCode }, async (db, _t, m) => {
      const r = await this.call(db, "SELECT app.xa_approve($1,$2,$3,$4,$5,$6,$7,$8,$9) r", [i.jobId, i.requestId, i.commandId, m, i.stepIndex, i.revisionHash, i.netPence, rejecting, reasonCode]);
      const extra = (await db.$client.query<{ variation_id: string }>("SELECT variation_id FROM app.extra_approval_request WHERE id=$1", [i.requestId])).rows[0]!.variation_id;
      return { result: r, audits: [audit(m, rejecting ? "contractor.extra.rejected" : "contractor.extra.step_approved", extra, { command: i.commandId, job: i.jobId, extra, request: i.requestId, step: String(i.stepIndex) }, { revision: i.revisionHash })] };
    });
  }
  async approveExtraStep(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown) { return this.decide(context, actor, this.parse(approveExtraStepV1, raw), false); }
  async rejectExtra(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown) { return this.decide(context, actor, this.parse(rejectExtraV1, raw), true); }

  async withdrawExtra(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const i = this.parse(withdrawExtraV1, raw);
    return this.run(context, actor, "WithdrawExtra", i.commandId, `extra-withdraw:${i.jobId}:${i.extraId}:${i.commandId}`, { jobId: i.jobId, extraId: i.extraId, reasonCode: i.reasonCode }, async (db, _t, m) => {
      const r = await this.call(db, "SELECT app.xa_withdraw($1,$2,$3,$4,$5) r", [i.jobId, i.extraId, i.commandId, m, i.reasonCode]);
      return { result: r, audits: [audit(m, "contractor.extra.withdrawn", i.extraId, { command: i.commandId, job: i.jobId, extra: i.extraId })] };
    });
  }
  async markDuplicate(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const i = this.parse(markDuplicateV1, raw), linkId = derivedUuid(`extra-duplicate-link:${lc(context.tenantId)}:${i.commandId}`);
    // The semantic key shape is the merged duplicate-link trigger's; the audit event id is the link id (its deferred audit check).
    return this.run(context, actor, "MarkDuplicate", i.commandId, `extra-duplicate:${i.jobId}:${i.duplicateId}:${i.canonicalId}:${i.commandId}`, { jobId: i.jobId, duplicateId: i.duplicateId, canonicalId: i.canonicalId }, async (db, _t, m) => {
      const r = await this.call(db, "SELECT app.xa_mark_duplicate($1,$2,$3,$4,$5,$6) r", [i.jobId, i.duplicateId, i.canonicalId, i.commandId, m, linkId]);
      return { result: r, audits: [audit(m, "contractor.extra.duplicate_linked", i.duplicateId, { command: i.commandId, job: i.jobId, duplicate: i.duplicateId, canonical: i.canonicalId, link: linkId }, undefined, linkId)] };
    });
  }

  /** Q10 ruling, 4 Nov: grant-covered surveyor/commercial-manager send with exact authorization, receipt and audit. Returns the link id; the token is the caller's. */
  async issueClientApproval(context: VerifiedTenantContext, owner: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const i = this.parse(issueClientApprovalV1, raw), member = this.checkActor(context, owner), tenant = lc(context.tenantId);
    const linkId = derivedUuid(`extra-client-link:${tenant}:${i.commandId}`), outboxId = derivedUuid(`extra-client-outbox:${tenant}:${i.commandId}`);
    try {
      const request = await withTenant(this.pool, context, async db => {
        // Refuse before disclosing target existence; dispatch and the writer recheck execution authority.
        const authority = (await db.$client.query<{ allowed: boolean }>(
          "SELECT app.xa_covers($1,ARRAY['surveyor','commercial_manager'],$2,'job.read') IS NOT NULL AS allowed",
          [member, i.jobId])).rows[0];
        if (!authority?.allowed) throw new ExtraApprovalError("PERMISSION_DENIED");
        return (await db.$client.query<{ request_revision: number; revision_hash: string; net_pence: string | null; variation_id: string }>(
          "SELECT request_revision,revision_hash,net_pence::text,variation_id FROM app.extra_approval_request WHERE tenant_id=$1 AND job_id=$2 AND id=$3", [tenant, i.jobId, i.requestId])).rows[0];
      });
      if (!request || request.net_pence === null) throw new ExtraApprovalError("NOT_FOUND");
      const tokenHash = sha256Hex(i.linkToken), net = Number(request.net_pence);
      // The exact message the owner approves (practice only: the fake_email adapter delivers nothing; the .invalid recipient cannot receive anything).
      const content = canonicalJson({ version: "extra-client-approval-message.v1", linkId, requestId: i.requestId, revision: request.request_revision, revisionHash: request.revision_hash, ...(i.signinDigest ? { signinDigest: i.signinDigest } : {}), recipient: i.recipient, netPence: net, expiresAt: i.expiresAt.toISOString(), path: i.signinDigest ? `/customer/sign-in#${tenant}/${i.jobId}/${i.approverMembershipId}/${i.linkToken}` : `/extra-approval/${i.jobId}/${i.requestId}#t=${i.linkToken}`, token: i.linkToken });
      const contentHash = sha256Hex(content);
      const command: ConsequentialCommand = { version: "command.v1", commandId: i.commandId, commandType: "IssueClientApproval", semanticKey: `extra-client-approval:${i.requestId}:${i.commandId}`, actorMembershipId: member, subjectType: "extra", subjectRef: request.variation_id,
        action: { actionType: "extra.client_approval_request.send", recipient: i.recipient, contentHash, aggregateRevision: request.request_revision, amountPence: net, currency: "GBP", policyVersion: "extra-client-approval-send.v1", expiresAt: i.expiresAt } };
      const handler: CommandMutation<Result> = {
        lock: async db => { await db.$client.query("SELECT app.mon8_require_feature($1,'approval_chains')", [member]); await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text||':'||$2::uuid::text,417))", [tenant, i.jobId]); },
        mutate: async (db, c) => {
          await appendOutboundAction(db, tenant, { version: "outbound-action.v1", id: outboxId, authorizationId: c.authorizationId!, adapter: "fake_email", providerEffectKey: `extra-client-link:${linkId}`, actionType: c.action.actionType, recipient: i.recipient,
            contentHash, immutableContent: content, aggregateRevision: request.request_revision, amountPence: net, currency: "GBP", policyVersion: "extra-client-approval-send.v1", authorizationExpiresAt: i.expiresAt });
          const r = await this.call(db, "SELECT app.xa_issue_link($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) r", [i.jobId, i.requestId, i.commandId, member, linkId, i.approverMembershipId, i.recipient, tokenHash, i.expiresAt, c.authorizationId, outboxId]);
          if (i.signinDigest) await db.$client.query("SELECT app.xc_bind_link($1,$2,$3)", [linkId, i.signinDigest, member]);
          const replaced = (r.replacedOutboxIds as string[]) ?? [];
          // "Cancel replaced requests": an earlier message that has not gone out never will.
          for (const replacedId of replaced) await db.$client.query("SELECT app.cancel_extra_outbox($1::uuid)", [replacedId]);
          return { ...r, outboxActionId: outboxId };
        },
        auditEvents: () => [audit(member, "contractor.extra.client_link_issued", request.variation_id, { command: i.commandId, job: i.jobId, extra: request.variation_id, request: i.requestId, link: linkId, outbox: outboxId }, { message: contentHash })],
      };
      return await new UserCommandDispatcher(this.pool).dispatch(context, command, handler);
    } catch (error) { failure(error); }
  }
  async revokeClientApproval(context: VerifiedTenantContext, owner: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const i = this.parse(revokeClientApprovalV1, raw);
    return this.run(context, owner, "RevokeClientApproval", i.commandId, `extra-client-revoke:${i.linkId}:${i.commandId}`, { jobId: i.jobId, linkId: i.linkId }, async (db, tenant, m) => {
      const r = await this.call(db, "SELECT app.xa_revoke_link($1,$2,$3,$4) r", [i.jobId, i.linkId, i.commandId, m]);
      await db.$client.query("SELECT app.cancel_extra_outbox($1::uuid)", [r.outboxActionId]);
      const extra = (await db.$client.query<{ variation_id: string }>("SELECT variation_id FROM app.extra_client_link WHERE id=$1", [i.linkId])).rows[0]!.variation_id;
      return { result: r, audits: [audit(m, "contractor.extra.client_link_revoked", extra, { command: i.commandId, job: i.jobId, extra, link: i.linkId })] };
    });
  }

  /** Read-only approval page data for the signed-in client approver. Same refusals as the decision; changes nothing. */
  async clientApprovalView(context: VerifiedTenantContext, client: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const i = this.parse(clientApprovalViewV1, raw), member = this.checkActor(context, client), tenant = lc(context.tenantId);
    try {
      return await withTenant(this.pool, context, async db => {
        const link = (await db.$client.query<{ id: string; approver_membership_id: string; recipient: string; expires_at: Date; job_id: string; request_id: string; closed: string | null; expired: boolean }>(
          `SELECT k.id,k.approver_membership_id,k.recipient,k.expires_at,k.job_id,k.request_id,c.kind closed,clock_timestamp()>=k.expires_at expired FROM app.extra_client_link k LEFT JOIN app.extra_client_link_closure c ON(c.tenant_id,c.link_id)=(k.tenant_id,k.id)
           WHERE k.tenant_id=$1 AND k.token_hash=$2`, [tenant, sha256Hex(i.linkToken)])).rows[0];
        if (!link || link.approver_membership_id !== member) throw new ExtraApprovalError("LINK_INVALID");
        if (link.closed === "decided") throw new ExtraApprovalError("LINK_REPLAYED");
        if (link.closed) throw new ExtraApprovalError("LINK_REVOKED");
        if (link.expired) throw new ExtraApprovalError("LINK_EXPIRED");
        if (lc(i.email) !== lc(link.recipient)) throw new ExtraApprovalError("EMAIL_MISMATCH");
        if (link.job_id !== i.jobId || link.request_id !== i.requestId) throw new ExtraApprovalError("NOT_FOUND");
        // Current authority, exactly as the decision applies it: a client whose membership or grant has since been revoked sees nothing, even with an open link.
        await db.$client.query("SELECT app.xa_client_view_authority($1,$2,$3,$4)", [i.jobId, i.requestId, member, i.email]);
        const req = (await db.$client.query<{ variation_id: string; request_revision: number; net_pence: string; revision_hash: string; description: string; steps: unknown; outcome: string | null }>(
          `SELECT q.variation_id,q.request_revision,q.net_pence::text,q.revision_hash,v.description,q.requirement->'steps' steps,o.kind outcome FROM app.extra_approval_request q JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(q.tenant_id,q.job_id,q.variation_id)
           LEFT JOIN app.extra_approval_outcome o ON(o.tenant_id,o.request_id)=(q.tenant_id,q.id) WHERE q.tenant_id=$1 AND q.job_id=$2 AND q.id=$3`, [tenant, i.jobId, i.requestId])).rows[0];
        if (!req) throw new ExtraApprovalError("NOT_FOUND");
        const approvals = (await db.$client.query<{ step_index: number; step_role: string; actor_kind: string; server_recorded_at: Date }>("SELECT step_index,step_role,actor_kind,server_recorded_at FROM app.extra_approval_step_fact WHERE tenant_id=$1 AND request_id=$2 ORDER BY step_index", [tenant, i.requestId])).rows;
        return { version: "client-approval-view.v1", environment: "synthetic_demo", requestId: i.requestId, requestRevision: req.request_revision, description: req.description, netPence: Number(req.net_pence), revisionHash: req.revision_hash, expiresAt: link.expires_at.toISOString(),
          decided: req.outcome, companyApprovals: approvals.map(a => ({ stepIndex: a.step_index, role: a.step_role, kind: a.actor_kind, serverRecordedAt: a.server_recorded_at.toISOString() })),
          ...await readExtraApprovalTiming(db, tenant, i.jobId, req.variation_id, i.requestId) };
      });
    } catch (error) { failure(error); }
  }
  async decideClientApproval(context: VerifiedTenantContext, client: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const i = this.parse(decideClientApprovalV1, raw), rejecting = i.decision === "reject";
    if (rejecting && !i.reasonCode) throw new ExtraApprovalError("INVALID_COMMAND");
    return this.run(context, client, "ClientDecideExtra", i.commandId, `extra-client-decide:${i.requestId}:${i.commandId}`, { jobId: i.jobId, requestId: i.requestId, token: sha256Hex(i.linkToken), email: lc(i.email), hash: i.revisionHash, net: i.netPence, decision: i.decision, reason: i.reasonCode ?? null, role: i.fictionalRoleName, tester: i.actualTesterReference }, async (db, _t, m) => {
      const r = await this.call(db, "SELECT app.xa_client_decide($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) r", [i.jobId, i.requestId, i.commandId, m, sha256Hex(i.linkToken), i.email, i.revisionHash, i.netPence, rejecting, i.reasonCode ?? null, i.fictionalRoleName, i.actualTesterReference]);
      const extra = (await db.$client.query<{ variation_id: string }>("SELECT variation_id FROM app.extra_approval_request WHERE id=$1", [i.requestId])).rows[0]!.variation_id;
      return { result: r, audits: [audit(m, "contractor.extra.client_decided", extra, { command: i.commandId, job: i.jobId, extra, request: i.requestId, decision: i.decision, actorKind: "client_approver" }, { revision: i.revisionHash })] };
    });
  }

  /** The mandatory lane of the Decisions inbox, filtered by the member's stored grants. It reads no advisory state. */
  async queue(context: VerifiedTenantContext, memberId: string): Promise<Result[]> {
    try { return await withTenant(this.pool, context, async db => (await db.$client.query("SELECT * FROM app.xa_queue($1)", [memberId])).rows as Result[]); } catch (error) { failure(error); }
  }
  /** Deterministic scheduled-job hook: a graphile task (or a test) calls this per tenant. The server clock decides; a repeat run fires nothing twice.
   * LP-6d (router ruling r11): the actor-less sweep runs through the worker definer; app.xa_escalate itself requires a bound request. */
  async escalateOverdue(context: VerifiedTenantContext): Promise<Result[]> {
    try {
      return await withTenant(await outboundWorkerPool(this.pool), context, async db => {
        await db.$client.query("SELECT app.lp11_open_extra_escalation($1)", [context.tenantId]);
        return (await db.$client.query<Result>("SELECT * FROM app.lp6d_escalate_overdue_worker()")).rows;
      });
    } catch (error) { failure(error); }
  }
}
export const escalateOverdueExtrasTask = (pool: Pool, context: VerifiedTenantContext) => new ExtraApprovalRepository(pool).escalateOverdue(context);
