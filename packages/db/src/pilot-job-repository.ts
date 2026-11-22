import { randomUUID } from "node:crypto";
import { money, quoteDocumentV1, recoveryCap } from "@jobguard/core";
import type { Pool } from "pg";
import { UserCommandDispatcher, type ConsequentialCommand } from "./commands.js";
import { appendAuditBatch } from "./audit.js";
import { lp3MutationHash } from "./lp3-operation.js";
import { checkPostLockSourceLifecycle, refuseLockedNewSource } from "./job-work-state-sources.js";
import { lockJobProofAuthority } from "./job-proof-statement.js";
import { requirePilotCommandOwner } from "./pilot-command-owner.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { requireLiveJob } from "./watchdog.js";

type ExactQuote = { documentId: string; documentVersion: number; documentHash: string; expectedJobRevision: number };
type DocumentRow = { id: string; content_hash: string; snapshot: unknown };

const selectedDocument = `
 SELECT d.id,d.content_hash,d.snapshot FROM app.quote_document_version d
 JOIN app.quote_send s ON (s.tenant_id,s.job_id,s.document_id,s.content_hash)=(d.tenant_id,d.job_id,d.id,d.content_hash)
 JOIN app.action_outbox o ON (o.tenant_id,o.id)=(s.tenant_id,s.outbox_action_id)
 WHERE (d.tenant_id,d.job_id)=($1,$2) AND o.adapter='fake_quote_delivery'`;

function exactDocument(row: DocumentRow) {
  const document = quoteDocumentV1.parse(row.snapshot);
  return { documentId: row.id, documentVersion: document.documentVersion, documentHash: row.content_hash,
    reference: document.reference, totalPence: document.totalPence };
}

function checkExactDocument<T extends DocumentRow>(row: T | undefined, input: ExactQuote) {
  if (!row || row.id !== input.documentId || row.content_hash !== input.documentHash) throw new Error("STALE_ACCEPTANCE");
  const document = quoteDocumentV1.parse(row.snapshot);
  if (document.documentVersion !== input.documentVersion) throw new Error("STALE_ACCEPTANCE");
  return { ...row, document };
}

export class PilotJobRepository {
  constructor(private readonly pool: Pool) {}

  async quote(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async db => {
      const keys = [context.tenantId, jobId];
      const job = (await db.$client.query<{ status: string; revision: number; title: string; baseline_quote_version_id: string | null }>(
        "SELECT status,revision,title,baseline_quote_version_id FROM app.job WHERE (tenant_id,id)=($1,$2)", keys)).rows[0];
      if (!job) throw new Error("NOT_FOUND");
      const offered = (await db.$client.query<DocumentRow>(
        selectedDocument + " ORDER BY d.document_version DESC LIMIT 1", keys)).rows[0];
      const accepted = (await db.$client.query<DocumentRow & { accepted_at: Date; acceptance_kind: string }>(`
        SELECT d.id,d.content_hash,d.snapshot,a.accepted_at,a.acceptance_kind FROM app.job j
        JOIN app.quote_acceptance a ON (a.tenant_id,a.job_id,a.document_id)=(j.tenant_id,j.id,j.accepted_quote_version_id)
        JOIN app.quote_document_version d ON (d.tenant_id,d.job_id,d.id)=(a.tenant_id,a.job_id,a.document_id)
        WHERE (j.tenant_id,j.id)=($1,$2) ORDER BY a.recorded_at DESC,a.id DESC LIMIT 1`, keys)).rows[0];
      return { version: 1 as const, environment: "pilot_no_charge" as const, jobId, title: job.title,
        status: job.status, jobRevision: job.revision, offered: offered ? exactDocument(offered) : null,
        acceptance: accepted ? { ...exactDocument(accepted), acceptedAt: accepted.accepted_at.toISOString(),
          method: accepted.acceptance_kind === "customer_authenticated" ? "customer_authenticated" as const : "fixture" as const } : null,
        baselineDocumentId: job.baseline_quote_version_id };
    });
  }

  async acceptFixture(context: VerifiedTenantContext, jobId: string, actor: string, input: ExactQuote & { commandId: string; acceptedAt: string }, checkGate: () => void) {
    const keys = [context.tenantId, jobId, input.documentId];
    const row = await withTenant(this.pool, context, async db => (await db.$client.query<DocumentRow>(
      selectedDocument + " AND d.id=$3", keys)).rows[0]);
    const { document } = checkExactDocument(row, input);
    const acceptanceId = randomUUID(), eventId = randomUUID();
    const raw = { version: "quote-acceptance.v1", acceptanceId, jobId, documentId: input.documentId,
      documentVersion: input.documentVersion, documentHash: input.documentHash, expectedJobRevision: input.expectedJobRevision,
      acceptedTotalPence: document.totalPence, statedCustomerName: document.customer.name, statedMethod: "message",
      acceptedAt: input.acceptedAt, evidenceId: null };
    await this.dispatch(context, actor, {
      commandId: input.commandId, commandType: "quote.acceptance.attest", semanticKey: `pilot-accept:${input.documentId}`,
      subjectType: "quote_document", subjectRef: input.documentId,
      action: { actionType: "quote.acceptance.attest", contentHash: input.documentHash, aggregateRevision: input.documentVersion,
        recipient: document.customer.name, amountPence: document.totalPence, currency: "GBP", policyVersion: "builder-attestation.v1" },
    }, raw, checkGate, async (db, command) => {
      await db.$client.query("SELECT app.pilot_record_quote_acceptance($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
        [context.tenantId, acceptanceId, eventId, jobId, input.documentId, input.documentVersion, input.documentHash,
          document.totalPence, input.expectedJobRevision, actor, document.customer.name, input.acceptedAt, input.commandId, command.authorizationId]);
      return { eventId };
    });
    return this.quote(context, jobId);
  }

  async activate(context: VerifiedTenantContext, jobId: string, actor: string, input: ExactQuote & { commandId: string }, checkGate: () => void) {
    const accepted = await withTenant(this.pool, context, async db => (await db.$client.query<DocumentRow & { accepted_at: Date }>(`
      SELECT d.id,d.content_hash,d.snapshot,a.accepted_at FROM app.job j
      JOIN app.quote_acceptance a ON (a.tenant_id,a.job_id,a.document_id)=(j.tenant_id,j.id,j.accepted_quote_version_id)
      JOIN app.quote_document_version d ON (d.tenant_id,d.job_id,d.id)=(a.tenant_id,a.job_id,a.document_id)
      WHERE (j.tenant_id,j.id)=($1,$2) ORDER BY a.recorded_at DESC,a.id DESC LIMIT 1`, [context.tenantId, jobId])).rows[0]);
    const { document, accepted_at: acceptedAt } = checkExactDocument(accepted, input);
    const activationId = randomUUID(), capSnapshotId = randomUUID(), cap = recoveryCap(money(document.netPence)).pence;
    const raw = { version: "switch-live.v1", activationId, capSnapshotId, syntheticObligationId: null, jobId,
      acceptedDocumentId: input.documentId, acceptedDocumentVersion: input.documentVersion, acceptedDocumentHash: input.documentHash,
      expectedJobRevision: input.expectedJobRevision, acceptedNetValuePence: document.netPence, recoveryCapPence: cap,
      mode: "pilot_no_charge", activationTermsVersion: "pilot_no_charge.v1", feePolicyVersion: "reference_fee_policy_v1",
      activatedAt: acceptedAt };
    await this.dispatch(context, actor, {
      commandId: input.commandId, commandType: "job.switch_live", semanticKey: `pilot-start:${jobId}`,
      subjectType: "job", subjectRef: jobId,
      action: { actionType: "job.switch_live", contentHash: input.documentHash, aggregateRevision: input.documentVersion,
        recipient: null, amountPence: null, currency: null, policyVersion: raw.activationTermsVersion },
    }, raw, checkGate, async (db, command) => {
      await db.$client.query("SELECT app.pilot_switch_job_live($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
        [context.tenantId, activationId, capSnapshotId, jobId, input.documentId, input.documentVersion, input.documentHash,
          input.expectedJobRevision, document.netPence, cap, actor, acceptedAt, input.commandId, command.authorizationId]);
      return { activationId };
    });
    return this.quote(context, jobId);
  }

  private async dispatch(context: VerifiedTenantContext, actor: string, envelope: Omit<ConsequentialCommand, "version" | "actorMembershipId" | "action"> & {
    action: Omit<ConsequentialCommand["action"], "expiresAt">;
  }, raw: Record<string, unknown>, checkGate: () => void,
  write: (db: TenantTransaction, command: ConsequentialCommand) => Promise<Record<string, unknown>>) {
    await new UserCommandDispatcher(this.pool).dispatch(context, {
      ...envelope, version: "command.v1", actorMembershipId: actor,
      action: { ...envelope.action, expiresAt: new Date(Date.now() + 3600_000) },
    }, {
      lock: async db => {
        await requirePilotCommandOwner(db);
        checkGate();
      },
      inputHash: () => lp3MutationHash(context.tenantId, actor, raw),
      mutate: async (db, command) => {
        checkGate();
        return write(db, command);
      },
    });
  }

  async progress(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async db => {
      const rows = (await db.$client.query<{ scopeItemId: string; description: string; stage: string; revision: number }>(`
        SELECT p.scope_item_id AS "scopeItemId",line.value->>'description' AS description,p.stage,p.revision
        FROM app.job j JOIN app.quote_document_version d ON (d.tenant_id,d.job_id,d.id)=(j.tenant_id,j.id,j.baseline_quote_version_id)
        CROSS JOIN LATERAL jsonb_array_elements(d.snapshot->'lines') WITH ORDINALITY line(value,position)
        JOIN app.scope_progress p ON (p.tenant_id,p.job_id,p.scope_item_id)=(j.tenant_id,j.id,(line.value->>'scopeItemId')::uuid)
        WHERE (j.tenant_id,j.id)=($1,$2) ORDER BY line.position`, [context.tenantId, jobId])).rows;
      return { version: 1 as const, jobId, scope: rows };
    });
  }

  async startProgress(context: VerifiedTenantContext, jobId: string, actor: string, input: { scopeItemId: string; expectedRevision: number }) {
    await withTenant(this.pool, context, async db => {
      await requirePilotCommandOwner(db);
      await checkPostLockSourceLifecycle(db, jobId, actor);
      await requireLiveJob(db, jobId);
      await lockJobProofAuthority(db, jobId);
      await refuseLockedNewSource(db, jobId);
      await requirePilotBaselineScope(db, context.tenantId, jobId, input.scopeItemId);
      await db.$client.query("SELECT app.transition_scope_progress($1,$2,$3,$4,'in_progress','start')",
        [context.tenantId, jobId, input.scopeItemId, input.expectedRevision]);
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
        eventType: "scope.progress", subjectType: "scope_item", subjectRef: input.scopeItemId,
        payload: { references: { jobId, transition: "start" },
          classifications: { action: "operational" } } }]);
    });
    return this.progress(context, jobId);
  }
}

export async function requirePilotBaselineScope(db: TenantTransaction, tenantId: string, jobId: string, scopeItemId: string) {
  const scope = await db.$client.query(`
    SELECT 1 FROM app.job j JOIN app.quote_document_version d ON (d.tenant_id,d.job_id,d.id)=(j.tenant_id,j.id,j.baseline_quote_version_id)
    WHERE (j.tenant_id,j.id)=($1,$2) AND d.snapshot->'lines' @> jsonb_build_array(jsonb_build_object('scopeItemId',$3::text))`,
    [tenantId, jobId, scopeItemId]);
  if (!scope.rowCount) throw new Error("NOT_FOUND");
}
