import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import { appendAuditBatch, type AuditEventInput } from "./audit.js";
import { UserCommandDispatcher, type CommandMutation, type ConsequentialCommand } from "./commands.js";
import { appendOutboundAction } from "./outbox.js";
import { canonicalJson, derivedUuid, sha256Hex } from "./work-order-repository.js";
import { withTenant, InvalidTenantContextError, type AuthenticatedMembership, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

/** ENT-5b: the approval chain. Every write goes through a checked SECURITY DEFINER routine (app.xa_*); this class never writes a business table itself. */
export const extraApprovalErrorCodes = [
  "INVALID_COMMAND", "COMMAND_CONFLICT", "NOT_FOUND", "PERMISSION_DENIED", "INVALID_TRANSITION", "STALE_REVISION", "ALREADY_DECIDED", "HASH_MISMATCH", "UNPRICED",
  "STEP_OUT_OF_ORDER", "CLIENT_STEP_REQUIRES_CLIENT", "SELF_APPROVAL", "REUSED_APPROVER", "REPEAT_HELD", "RULES_NOT_FOUND", "INVALID_RULES",
  "LINK_INVALID", "LINK_EXPIRED", "LINK_REVOKED", "LINK_REPLAYED", "EMAIL_MISMATCH", "SEND_NOT_AUTHORISED", "MODE_FORBIDDEN", "DATABASE_UNAVAILABLE",
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

const uuid = z.string().uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/u);
const reason = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/u);
const pence = z.number().int().min(1).max(1_000_000_000_000);
const common = { commandId: uuid, jobId: uuid };
export const submitExtraV1 = z.object({ version: z.literal("submit-extra.v1"), ...common, extraId: uuid }).strict();
export const priceExtraV1 = z.object({ version: z.literal("price-extra.v1"), ...common, extraId: uuid, netPence: pence }).strict();
export const reviseExtraV1 = z.object({ version: z.literal("revise-extra.v1"), ...common, extraId: uuid, netPence: pence }).strict();
const bound = { requestId: uuid, stepIndex: z.number().int().min(0).max(20), revisionHash: hash, netPence: pence };
export const approveExtraStepV1 = z.object({ version: z.literal("approve-extra-step.v1"), ...common, ...bound }).strict();
export const rejectExtraV1 = z.object({ version: z.literal("reject-extra.v1"), ...common, ...bound, reasonCode: reason }).strict();
export const withdrawExtraV1 = z.object({ version: z.literal("withdraw-extra.v1"), ...common, extraId: uuid, reasonCode: z.enum(["not_done", "raised_in_error", "resident_cancelled", "already_on_order"]) }).strict();
export const markDuplicateV1 = z.object({ version: z.literal("mark-duplicate.v1"), ...common, duplicateId: uuid, canonicalId: uuid }).strict();
/** Owner-only send: the owner approves THIS request, recipient, amount and expiry. Practice recipients end in .invalid and nothing is delivered. */
export const issueClientApprovalV1 = z.object({ version: z.literal("issue-client-approval.v1"), ...common, requestId: uuid, approverMembershipId: uuid, recipient: z.string().email().refine(s => s.toLowerCase().endsWith(".invalid")),
  linkToken: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/u), expiresAt: z.coerce.date() }).strict();
export const revokeClientApprovalV1 = z.object({ version: z.literal("revoke-client-approval.v1"), ...common, linkId: uuid }).strict();
export const clientApprovalViewV1 = z.object({ version: z.literal("client-approval-view.v1"), jobId: uuid, requestId: uuid, linkToken: z.string().min(16).max(200), email: z.string().email() }).strict();
export const decideClientApprovalV1 = z.object({ version: z.literal("decide-client-approval.v1"), ...common, requestId: uuid, linkToken: z.string().min(16).max(200), email: z.string().email(), revisionHash: hash, netPence: pence,
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
    const member = this.checkActor(context, actor), tenant = lc(context.tenantId), requestHash = sha256Hex(canonicalJson({ type, actor: member, content }));
    try {
      return await withTenant(this.pool, context, async db => {
        const inserted = await db.$client.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
          VALUES($1,$2,$3,$4,$5,'processing',$6) ON CONFLICT DO NOTHING RETURNING command_id`, [tenant, commandId, type, semantic, requestHash, member]);
        if (!inserted.rowCount) {
          const rows = (await db.$client.query<{ request_hash: string; status: string; result: Result }>("SELECT request_hash,status,result FROM app.command_receipt WHERE tenant_id=$1 AND (command_id=$2 OR (command_type=$3 AND semantic_key=$4))", [tenant, commandId, type, semantic])).rows;
          if (rows.length !== 1 || rows[0]!.request_hash !== requestHash || rows[0]!.status !== "succeeded") throw new ExtraApprovalError("COMMAND_CONFLICT");
          return rows[0]!.result;
        }
        const { result, audits } = await work(db, tenant, member);
        await appendAuditBatch(db, audits);
        await db.$client.query("UPDATE app.command_receipt SET status='succeeded',result=$3::jsonb,completed_at=clock_timestamp() WHERE tenant_id=$1 AND command_id=$2", [tenant, commandId, canonicalJson(result)]);
        return result;
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
  async priceExtra(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const i = this.parse(priceExtraV1, raw);
    return this.run(context, actor, "PriceExtra", i.commandId, `extra-price:${i.jobId}:${i.extraId}:${i.commandId}`, { jobId: i.jobId, extraId: i.extraId, netPence: i.netPence }, async (db, _t, m) => {
      const r = await this.call(db, "SELECT app.xa_price($1,$2,$3,$4,$5,false) r", [i.jobId, i.extraId, i.commandId, m, i.netPence]);
      return { result: r, audits: [audit(m, "contractor.extra.priced", i.extraId, { command: i.commandId, job: i.jobId, extra: i.extraId, binding: String(r.bindingId) }, { revision: String(r.revisionHash) })] };
    });
  }
  async reviseExtra(context: VerifiedTenantContext, actor: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const i = this.parse(reviseExtraV1, raw);
    return this.run(context, actor, "ReviseExtra", i.commandId, `extra-revise:${i.jobId}:${i.extraId}:${i.commandId}`, { jobId: i.jobId, extraId: i.extraId, netPence: i.netPence }, async (db, _t, m) => {
      const r = await this.call(db, "SELECT app.xa_price($1,$2,$3,$4,$5,true) r", [i.jobId, i.extraId, i.commandId, m, i.netPence]);
      return { result: r, audits: [audit(m, "contractor.extra.revised", i.extraId, { command: i.commandId, job: i.jobId, extra: i.extraId, request: String(r.requestId) }, { revision: String(r.revisionHash) })] };
    });
  }
  private async decide(context: VerifiedTenantContext, actor: AuthenticatedMembership, i: z.infer<typeof approveExtraStepV1> | z.infer<typeof rejectExtraV1>, rejecting: boolean): Promise<Result> {
    const type = rejecting ? "RejectExtra" : "ApproveExtraStep", reasonCode = rejecting ? (i as z.infer<typeof rejectExtraV1>).reasonCode : null;
    return this.run(context, actor, type, i.commandId, `extra-step:${i.requestId}:${i.stepIndex}:${i.commandId}`, { jobId: i.jobId, requestId: i.requestId, stepIndex: i.stepIndex, hash: i.revisionHash, net: i.netPence, reasonCode }, async (db, _t, m) => {
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

  /** Owner-only (Ben decision 18). Goes through the merged dispatcher: owner check, exact authorization, receipt, audit. Returns the link id; the token is the caller's. */
  async issueClientApproval(context: VerifiedTenantContext, owner: AuthenticatedMembership, raw: unknown): Promise<Result> {
    const i = this.parse(issueClientApprovalV1, raw), member = this.checkActor(context, owner), tenant = lc(context.tenantId);
    const linkId = derivedUuid(`extra-client-link:${tenant}:${i.commandId}`), outboxId = derivedUuid(`extra-client-outbox:${tenant}:${i.commandId}`);
    try {
      const request = await withTenant(this.pool, context, async db => (await db.$client.query<{ request_revision: number; net_pence: string | null; variation_id: string }>(
        "SELECT request_revision,net_pence::text,variation_id FROM app.extra_approval_request WHERE tenant_id=$1 AND job_id=$2 AND id=$3", [tenant, i.jobId, i.requestId])).rows[0]);
      if (!request || request.net_pence === null) throw new ExtraApprovalError("NOT_FOUND");
      const tokenHash = sha256Hex(i.linkToken), net = Number(request.net_pence);
      // The exact message the owner approves (practice only: the fake_email adapter delivers nothing; the .invalid recipient cannot receive anything).
      const content = canonicalJson({ version: "extra-client-approval-message.v1", linkId, requestId: i.requestId, revision: request.request_revision, recipient: i.recipient, netPence: net, expiresAt: i.expiresAt.toISOString(), path: `/extra-approval/${linkId}`, token: i.linkToken });
      const contentHash = sha256Hex(content);
      const command: ConsequentialCommand = { version: "command.v1", commandId: i.commandId, commandType: "IssueClientApproval", semanticKey: `extra-client-approval:${i.requestId}:${i.commandId}`, actorMembershipId: member, subjectType: "extra", subjectRef: request.variation_id,
        action: { actionType: "extra.client_approval_request.send", recipient: i.recipient, contentHash, aggregateRevision: request.request_revision, amountPence: net, currency: "GBP", policyVersion: "extra-client-approval-send.v1", expiresAt: i.expiresAt } };
      const handler: CommandMutation<Result> = {
        lock: async db => { await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text||':'||$2::uuid::text,417))", [tenant, i.jobId]); },
        mutate: async (db, c) => {
          await appendOutboundAction(db, tenant, { version: "outbound-action.v1", id: outboxId, authorizationId: c.authorizationId!, adapter: "fake_email", providerEffectKey: `extra-client-link:${linkId}`, actionType: c.action.actionType, recipient: i.recipient,
            contentHash, immutableContent: content, aggregateRevision: request.request_revision, amountPence: net, currency: "GBP", policyVersion: "extra-client-approval-send.v1", authorizationExpiresAt: i.expiresAt });
          const r = await this.call(db, "SELECT app.xa_issue_link($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) r", [i.jobId, i.requestId, i.commandId, member, linkId, i.approverMembershipId, i.recipient, tokenHash, i.expiresAt, c.authorizationId, outboxId]);
          const replaced = (r.replacedOutboxIds as string[]) ?? [];
          // "Cancel replaced requests": an earlier message that has not gone out never will.
          if (replaced.length) await db.$client.query("UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND status IN('pending','retryable')", [tenant, replaced]);
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
      await db.$client.query("UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2 AND status IN('pending','retryable')", [tenant, r.outboxActionId]);
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
          // The work-report source for this flag is held (Q05); it is shown honestly as not derived rather than guessed.
          doneWithoutRequiredPreapproval: "not_derived" };
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
  /** Deterministic scheduled-job hook: a graphile task (or a test) calls this per tenant. The server clock decides; a repeat run fires nothing twice. */
  async escalateOverdue(context: VerifiedTenantContext): Promise<Result[]> {
    try {
      return await withTenant(this.pool, context, async db => {
        const fired = (await db.$client.query<{ request_id: string; job_id: string; variation_id: string; step_index: number; eligible_roles: string[] }>("SELECT * FROM app.xa_escalate()")).rows;
        await appendAuditBatch(db, fired.map(f => ({ ...audit("00000000-0000-4000-8000-000000000000", "contractor.extra.escalated", f.variation_id, { job: f.job_id, extra: f.variation_id, request: f.request_id, step: String(f.step_index) }), actorRef: "system:extra-escalation" })));
        return fired as unknown as Result[];
      });
    } catch (error) { failure(error); }
  }
}
export const escalateOverdueExtrasTask = (pool: Pool, context: VerifiedTenantContext) => new ExtraApprovalRepository(pool).escalateOverdue(context);
