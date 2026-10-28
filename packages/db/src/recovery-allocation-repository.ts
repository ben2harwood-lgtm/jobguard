import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  assertRecoveryAllocationSplit, exactPence, exactPenceInputV1, MAX_MONEY_PENCE, instantV1, mapRecoveryReceiptToLines, moneyFromBigInt,
  multiplyExactPence, parseExactPence, parseRecoveryAllocationCommand, RecoveryAllocationError,
  serializeExactPence, sumExactPence, type RecoveryAllocationCommand, type RecoveryAllocationErrorCode,
  type RecoveryDeemedLineAllocation, type RecoveryReceiptFacts,
} from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { practiceMaterialPool } from "./practice-session.js";
import { RecoveryCaseRepository } from "./recovery-case-repository.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export type RecoveryAllocationActor = Readonly<{ membershipId: string; identityUserId: string }>;
type Fraction = Readonly<{ numerator: string; denominator: string }>;
type Row = Record<string, any>;
export type RecoveryAllocationReview = {
  action: "allocate" | "reverse"; caseId: string; paymentId: string; allocationId: string | null;
  expectedCaseRevision: number; grossPence: number; eligibleNetPence: number; taxPence: number;
  approvalHash: string; policyVersion: string; movementHash: string; evidenceHash: string;
};
export type RecoveryAllocationView = {
  version: "recovery-allocation-view.v1"; environment: "synthetic_demo"; realExternalActions: 0; jobId: string;
  grossMovementsPence: number; eligibleNetPence: number; allocatedTaxPence: number; invoiceBalancePence: number; paused: boolean;
  reversalSources: Array<{ allocationId: string; sourceId: string; kind: "payment_reversal" | "credit_note"; availableGrossPence: number }>;
  availableEvidence: Array<{ evidenceId: string; objectVersionId: string; evidenceHash: string; label: string }>;
  receipts: Array<{ paymentId: string; invoiceId: string; grossPence: number; availablePence: number; movementId: string; movementHash: string; reversed: boolean }>;
  cases: Array<{ caseId: string; caseType: string; state: string; revision: number; claimedNetPence: number; outstandingNetPence: number }>;
  allocations: Array<{ id: string; caseId: string; paymentId: string; invoiceId: string; grossPence: number; eligibleNetPence: number; taxPence: number;
    evidenceId: string; objectVersionId: string; evidenceHash: string; policyVersion: string; reviewerRef: string; authorizationId: string;
    movementId: string; movementHash: string; held: boolean; reversedPence: number }>;
  lines: Array<{ id: string; paymentId: string; invoiceId: string; lineId: string; rule: "explicit" | "separate_invoice" | "pro_rata"; sourceRef: string; gross: Fraction; net: Fraction; reversesId: string | null }>;
  review: RecoveryAllocationReview | null;
};
const artifactId = z.guid({ error: "Invalid uuid" });
const artifactAmount = z.number().int().safe().nonnegative().max(MAX_MONEY_PENCE);
const artifactHash = z.string().regex(/^[a-f0-9]{64}$/u);
const artifactFraction = z.custom<Fraction>(value => exactPenceInputV1.safeParse(value).success);
const artifactInstant = z.custom<string>(value => instantV1.safeParse(value).success);
const recoveryAllocationArtifactV1 = z.object({
  version: z.literal("recovery-allocation-artifact.v1"), action: z.enum(["allocate", "reverse"]),
  caseId: artifactId, paymentId: artifactId, invoiceId: artifactId, allocationId: artifactId.nullable(),
  evidenceId: artifactId, objectVersionId: z.string().min(1).max(1024), evidenceHash: artifactHash,
  policyVersion: z.string().min(1).max(80), expectedCaseRevision: z.number().int().safe().positive(),
  grossPence: artifactAmount.refine(value => value > 0), eligibleNetPence: artifactAmount.refine(value => value > 0), taxPence: artifactAmount,
  movementId: artifactId, movementHash: artifactHash, eligibilityId: artifactId.nullable(), sourceId: artifactId.nullable(), sourceKind: z.enum(["payment_reversal", "credit_note"]).nullable(),
  lines: z.array(z.object({ lineId: artifactId, rule: z.enum(["explicit", "separate_invoice", "pro_rata"]), sourceRef: z.string().min(1).max(300),
    gross: artifactFraction, net: artifactFraction, reversesId: artifactId.nullable() }).strict()).max(10_000),
  bindings: z.array(z.object({ lineId: artifactId, netPence: artifactAmount, grossPence: artifactAmount.refine(value => value > 0),
    existedAt: artifactInstant, explicitEvidenceId: artifactId.nullable(), explicitGrossPence: artifactAmount.nullable() }).strict()).max(10_000),
  remittanceContent: z.string().max(100_000).nullable(), remittanceEvidenceId: artifactId.nullable(), remittanceBytes: z.string().max(140_000).nullable(),
}).strict();

type Snapshot = { receipts: Row[]; cases: Row[]; evidence: Row[]; allocations: Row[]; reversals: Row[]; lines: Row[]; invoices: Row[]; payments: Row[]; credits: Row[]; paymentReversals: Row[]; review: Row | null };
function fail(code: RecoveryAllocationErrorCode): never { throw new RecoveryAllocationError(code); }
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
};
const integral = (value: ReturnType<typeof exactPence>): number => {
  if (value.denominator !== 1n) fail("FRACTIONAL_CASE_SPLIT");
  return moneyFromBigInt(value.numerator).pence;
};
const sum = (values: readonly number[]): number => integral(sumExactPence(values.map(value => exactPence(BigInt(value)))));
const subtract = (left: number, right: number): number => sum([left, -right]);
const rowFraction = (row: Row, name: "gross" | "net") => parseExactPence({ numerator: String(row[`${name}_numerator`]), denominator: String(row[`${name}_denominator`]) });

/** Bounded synthetic PNG source envelope; the saved bytes remain the hash authority. */
function pngRemittance(bytes: Buffer): string {
  if (bytes.length > 100_000 || !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) fail("ALLOCATION_SOURCE_REQUIRED");
  let offset = 8, content: string | null = null, ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    if (end > bytes.length) fail("ALLOCATION_SOURCE_REQUIRED");
    const kind = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const payload = bytes.subarray(offset + 8, offset + 8 + length);
    // A malformed or altered chunk is rejected even when its stored source hash is correct.
    let crc = 0xffffffff;
    for (const octet of bytes.subarray(offset + 4, offset + 8 + length)) {
      crc ^= octet;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(offset + 8 + length)) fail("ALLOCATION_SOURCE_REQUIRED");
    if (kind === "tEXt") {
      const separator = payload.indexOf(0);
      if (separator >= 0 && payload.subarray(0, separator).toString("ascii") === "jobguard-remittance") {
        if (content !== null) fail("ALLOCATION_SOURCE_REQUIRED");
        content = payload.subarray(separator + 1).toString("utf8");
        if (!Buffer.from(content, "utf8").equals(payload.subarray(separator + 1))) fail("ALLOCATION_SOURCE_REQUIRED");
      }
    }
    offset = end;
    if (kind === "IEND") { ended = true; break; }
  }
  if (!ended || offset !== bytes.length || content === null) fail("ALLOCATION_SOURCE_REQUIRED");
  return content;
}

/** Synthetic adapter only. All arithmetic delegates to SH-1; every write is checked by the database routine. */
export class RecoveryAllocationRepository {
  constructor(private readonly pool: Pool, private readonly environment = process.env.JOBGUARD_ENV ?? "unconfigured") {}

  private guard(sessionDigest: string, jobId: string, actor: RecoveryAllocationActor): void {
    if (this.environment !== "synthetic_demo") fail("ALLOCATION_SYNTHETIC_ONLY");
    if (!/^[a-f0-9]{64}$/u.test(sessionDigest) || !actor || !z.guid({ error: "Invalid uuid" }).safeParse(actor.membershipId).success || !z.guid({ error: "Invalid uuid" }).safeParse(actor.identityUserId).success) fail("ALLOCATION_FORBIDDEN");
    if (!z.guid({ error: "Invalid uuid" }).safeParse(jobId).success) fail("ALLOCATION_NOT_FOUND");
  }

  private async authorize(db: TenantTransaction, context: VerifiedTenantContext, actor: RecoveryAllocationActor, sessionDigest: string, jobId: string): Promise<void> {
    const member = await db.$client.query(`SELECT m.id FROM app.membership m JOIN app.authenticate_practice_session($4) p
      ON p.tenant_id=m.tenant_id AND p.membership_id=m.id AND p.identity_user_id=m.identity_user_id
      WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3 AND m.role='owner'
      AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) FOR SHARE OF m`,
    [context.tenantId, actor.membershipId, actor.identityUserId, sessionDigest]);
    if (member.rowCount !== 1) fail("ALLOCATION_FORBIDDEN");
    if (!(await db.$client.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2 AND practice_session_digest=$3", [context.tenantId, jobId, sessionDigest])).rowCount) fail("ALLOCATION_NOT_FOUND");
  }

  private async snapshot(db: TenantTransaction, context: VerifiedTenantContext, jobId: string): Promise<Snapshot> {
    // One statement provides a consistent projection, including invalidation and reversal flags.
    const result = await db.$client.query<Snapshot>(`SELECT
      coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at,p.id) FROM (SELECT pay.*,e.id movement_id,e.source_hash movement_hash,e.created_at movement_at,
        EXISTS(SELECT 1 FROM app.customer_payment_reversal r WHERE r.tenant_id=pay.tenant_id AND r.payment_id=pay.id) reversed,
        EXISTS(SELECT 1 FROM app.practice_feed_event u WHERE u.tenant_id=e.tenant_id AND u.account_id=e.account_id AND u.movement_key=e.movement_key AND u.identity='unidentified'
          AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command k WHERE k.tenant_id=u.tenant_id AND k.account_id=u.account_id AND k.movement_key=u.movement_key AND k.action='reconcile_duplicate')) duplicate_held,
        i.net_pence invoice_net_pence,i.total_pence invoice_gross_pence,i.final_account_revision_id
        FROM app.customer_payment pay JOIN app.practice_feed_receipt_match m ON(m.tenant_id,m.job_id,m.payment_id)=(pay.tenant_id,pay.job_id,pay.id)
        JOIN app.practice_feed_event e ON(e.tenant_id,e.account_id,e.event_id)=(m.tenant_id,m.account_id,m.settled_event_id)
        JOIN app.customer_invoice i ON(i.tenant_id,i.job_id,i.id)=(pay.tenant_id,pay.job_id,pay.invoice_id)
        WHERE pay.tenant_id=$1 AND pay.job_id=$2 AND e.state='settled' AND e.identity='identified')p),'[]'::jsonb) receipts,
      coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at,c.id) FROM (SELECT c.*,er.status eligibility_status,er.eligible_net_pence evidenced_net_pence,er.policy_version,
        er.id eligibility_id FROM app.recovery_case_current c LEFT JOIN LATERAL(SELECT * FROM app.recovery_eligibility_revision er
        WHERE er.tenant_id=c.tenant_id AND er.case_id=c.id ORDER BY er.revision DESC LIMIT 1)er ON true
        WHERE c.tenant_id=$1 AND c.job_id=$2 AND c.claim_revision IS NOT NULL)c),'[]'::jsonb) cases,
      coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.server_received_at,e.id) FROM (SELECT e.*,EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=e.tenant_id AND x.evidence_id=e.id) invalidated
        FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
        WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.kind='original' AND u.state='verified' AND e.server_verified_at IS NOT NULL)e),'[]'::jsonb) evidence,
      coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.id) FROM app.recovery_case_allocation a WHERE a.tenant_id=$1 AND a.job_id=$2),'[]'::jsonb) allocations,
      coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at,r.id) FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=$1 AND r.job_id=$2),'[]'::jsonb) reversals,
      coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at,l.id) FROM app.receipt_line_allocation l WHERE l.tenant_id=$1 AND l.job_id=$2),'[]'::jsonb) lines,
      coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at,i.id) FROM app.customer_invoice i WHERE i.tenant_id=$1 AND i.job_id=$2),'[]'::jsonb) invoices,
      coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT p.*,EXISTS(SELECT 1 FROM app.customer_payment_reversal r WHERE r.tenant_id=p.tenant_id AND r.payment_id=p.id) reversed FROM app.customer_payment p WHERE p.tenant_id=$1 AND p.job_id=$2)p),'[]'::jsonb) payments,
      coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at,n.id) FROM app.customer_credit_note n WHERE n.tenant_id=$1 AND n.job_id=$2),'[]'::jsonb) credits,
      coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at,r.id) FROM app.customer_payment_reversal r WHERE r.tenant_id=$1 AND r.job_id=$2),'[]'::jsonb) "paymentReversals",
      (SELECT to_jsonb(r) FROM app.recovery_allocation_review r WHERE r.tenant_id=$1 AND r.job_id=$2
        AND r.expected_case_revision=(SELECT c.revision FROM app.recovery_case_current c WHERE c.tenant_id=r.tenant_id AND c.job_id=r.job_id AND c.id=r.case_id)
        AND NOT EXISTS(SELECT 1 FROM app.recovery_case_allocation a WHERE a.tenant_id=r.tenant_id AND a.review_id=r.id)
        AND NOT EXISTS(SELECT 1 FROM app.recovery_case_allocation_reversal rv WHERE rv.tenant_id=r.tenant_id AND rv.review_id=r.id)
        ORDER BY r.created_at DESC,r.id DESC LIMIT 1) review`, [context.tenantId, jobId]);
    return result.rows[0]!;
  }

  private project(snapshot: Snapshot, jobId: string): RecoveryAllocationView {
    const allocations = snapshot.allocations.map(row => ({
      id: row.id, caseId: row.case_id, paymentId: row.payment_id, invoiceId: row.invoice_id,
      grossPence: Number(row.gross_pence), eligibleNetPence: Number(row.eligible_net_pence), taxPence: Number(row.tax_pence),
      evidenceId: row.evidence_id, objectVersionId: row.object_version_id, evidenceHash: String(row.evidence_hash).trim(),
      policyVersion: row.policy_version, reviewerRef: row.reviewer_ref, authorizationId: row.authorization_id,
      movementId: row.movement_id, movementHash: String(row.movement_hash).trim(),
      held: !snapshot.evidence.some(evidence => evidence.id === row.evidence_id && !evidence.invalidated),
      reversedPence: sum(snapshot.reversals.filter(reversal => reversal.allocation_id === row.id).map(reversal => Number(reversal.gross_pence))),
    }));
    const activeNet = sum(allocations.map(row => row.eligibleNetPence).concat(snapshot.reversals.map(row => -Number(row.eligible_net_pence))));
    const activeTax = sum(allocations.map(row => row.taxPence).concat(snapshot.reversals.map(row => -Number(row.tax_pence))));
    const receiptTotal = sum(snapshot.payments.filter(row => !row.reversed).map(row => Number(row.amount_pence)));
    const reversalSources: RecoveryAllocationView["reversalSources"] = [];
    for (const allocation of allocations) {
      const remaining = subtract(allocation.grossPence, allocation.reversedPence);
      if (remaining <= 0) continue;
      const receiptReversal = snapshot.paymentReversals.find(row => row.payment_id === allocation.paymentId);
      if (receiptReversal) reversalSources.push({ allocationId: allocation.id, sourceId: receiptReversal.id, kind: "payment_reversal", availableGrossPence: remaining });
      for (const credit of snapshot.credits.filter(row => row.invoice_id === allocation.invoiceId)) {
        const available = subtract(Number(credit.amount_pence), sum(snapshot.reversals.filter(row => row.credit_note_id === credit.id).map(row => Number(row.gross_pence))));
        if (available > 0) reversalSources.push({ allocationId: allocation.id, sourceId: credit.id, kind: "credit_note", availableGrossPence: Math.min(remaining, available) });
      }
    }
    return {
      version: "recovery-allocation-view.v1", environment: "synthetic_demo", realExternalActions: 0, jobId,
      grossMovementsPence: sum(snapshot.receipts.map(row => Number(row.amount_pence))), eligibleNetPence: activeNet,
      allocatedTaxPence: activeTax, invoiceBalancePence: subtract(subtract(sum(snapshot.invoices.map(row => Number(row.total_pence))), sum(snapshot.credits.map(row => Number(row.amount_pence)))), receiptTotal),
      reversalSources,
      paused: snapshot.reversals.length > 0 || allocations.some(row => row.held),
      availableEvidence: snapshot.evidence.filter(row => !row.invalidated).map(row => ({ evidenceId: row.id, objectVersionId: row.object_version_id, evidenceHash: String(row.sha256).trim(), label: `${row.evidence_type} · ${row.id}` })),
      receipts: snapshot.receipts.map(row => ({ paymentId: row.id, invoiceId: row.invoice_id, grossPence: Number(row.amount_pence),
        availablePence: row.reversed || row.duplicate_held ? 0 : subtract(Number(row.amount_pence), sum(allocations.filter(allocation => allocation.paymentId === row.id).map(allocation => subtract(allocation.grossPence, allocation.reversedPence)))),
        movementId: row.movement_id, movementHash: String(row.movement_hash).trim(), reversed: row.reversed })),
      cases: snapshot.cases.map(row => ({ caseId: row.id, caseType: row.case_type, state: row.state, revision: Number(row.revision),
        claimedNetPence: Number(row.claim_pence), outstandingNetPence: subtract(Number(row.claim_pence), sum([Number(row.landed), Number(row.written_off)])) })),
      allocations,
      lines: snapshot.lines.map(row => ({ id: row.id, paymentId: row.payment_id, invoiceId: row.invoice_id, lineId: row.line_id,
        rule: row.rule, sourceRef: row.source_ref, gross: serializeExactPence(rowFraction(row, "gross")), net: serializeExactPence(rowFraction(row, "net")), reversesId: row.reverses_id ?? null })),
      review: snapshot.review ? this.reviewProjection(snapshot.review.artifact, snapshot.review.approval_hash) : null,
    };
  }

  private reviewProjection(artifact: Row, approvalHash: string): RecoveryAllocationReview {
    return { action: artifact.action, caseId: artifact.caseId, paymentId: artifact.paymentId, allocationId: artifact.allocationId ?? null,
      expectedCaseRevision: artifact.expectedCaseRevision, grossPence: artifact.grossPence, eligibleNetPence: artifact.eligibleNetPence,
      taxPence: artifact.taxPence, approvalHash: approvalHash.trim(), policyVersion: artifact.policyVersion,
      movementHash: artifact.movementHash, evidenceHash: artifact.evidenceHash };
  }

  async view(context: VerifiedTenantContext, actor: RecoveryAllocationActor, sessionDigest: string, jobId: string): Promise<RecoveryAllocationView> {
    this.guard(sessionDigest, jobId, actor);
    return withTenant(practiceMaterialPool(this.pool, sessionDigest), context, async db => {
      await this.authorize(db, context, actor, sessionDigest, jobId.toLowerCase());
      return this.project(await this.snapshot(db, context, jobId.toLowerCase()), jobId.toLowerCase());
    });
  }

  async command(context: VerifiedTenantContext, actor: RecoveryAllocationActor, sessionDigest: string, jobId: string, raw: unknown): Promise<RecoveryAllocationView> {
    this.guard(sessionDigest, jobId, actor);
    const principal = { membershipId: actor.membershipId.toLowerCase(), identityUserId: actor.identityUserId.toLowerCase() };
    const sent = parseRecoveryAllocationCommand(raw);
    const input = Object.fromEntries(Object.entries(sent).map(([key, value]) => [key, key.endsWith("Id") && typeof value === "string" ? value.toLowerCase() : value])) as RecoveryAllocationCommand;
    const job = jobId.toLowerCase();
    try {
      await withTenant(practiceMaterialPool(this.pool, sessionDigest), context, async db => {
        await db.$client.query("SELECT set_config('app.recovery_allocation_environment','synthetic_demo',true)");
        // Reversal target lookup touches only this leaf's immutable row; no job/case row has been touched yet.
        const target = "caseId" in input ? input.caseId : (await db.$client.query<{ case_id: string }>("SELECT case_id FROM app.recovery_case_allocation WHERE tenant_id=$1 AND job_id=$2 AND id=$3", [context.tenantId, job, input.allocationId])).rows[0]?.case_id;
        if (!target) fail("ALLOCATION_NOT_FOUND");
        // Coordinator ruling: canonical case key FIRST, business writes, joined command LAST, caller audit, commit.
        await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [context.tenantId.toLowerCase(), target]);
        await this.authorize(db, context, principal, sessionDigest, job);
        await db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [context.tenantId.toLowerCase(), `recovery-allocation:${input.commandId}`]);
        const replay = (await db.$client.query<{ payload: unknown; job_id: string; actor_membership_id: string }>("SELECT payload,job_id,actor_membership_id FROM app.recovery_allocation_command WHERE tenant_id=$1 AND command_id=$2", [context.tenantId, input.commandId])).rows[0];
        if (replay) {
          if (canonical(replay.payload) !== canonical(input) || replay.job_id !== job || replay.actor_membership_id !== principal.membershipId) fail("ALLOCATION_IDEMPOTENCY_CONFLICT");
          return;
        }
        const payment = "paymentId" in input ? input.paymentId :
          (await db.$client.query<{ payment_id: string }>("SELECT payment_id FROM app.recovery_case_allocation WHERE tenant_id=$1 AND job_id=$2 AND id=$3", [context.tenantId, job, input.allocationId])).rows[0]?.payment_id;
        if (!payment) fail("ALLOCATION_NOT_FOUND");
        await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text||':receipt:'||$2::uuid::text,0))", [context.tenantId, payment]);
        const snapshot = await this.snapshot(db, context, job);
        const artifact = await this.artifact(db, context, job, input, snapshot, target);
        const result = (await db.$client.query<Row>("SELECT app.write_recovery_allocation($1,$2,$3,$4::jsonb,$5::jsonb) result", [context.tenantId, job, sessionDigest, JSON.stringify(input), JSON.stringify(artifact)])).rows[0]!.result as { replayed: boolean; payloadHash: string; approvalHash: string };
        if (result.replayed) return;
        if (input.action === "allocate" || input.action === "reverse") {
          await new RecoveryCaseRepository(this.pool).commandInTransaction(db, context, job, {
            version: "recovery-case-command.v1", action: "transition", commandId: input.commandId, caseId: target,
            expectedRevision: input.expectedCaseRevision, eventType: input.action === "allocate" ? "record_landing" : "reverse_landing",
            amountPence: artifact.eligibleNetPence,
          }, principal);
        }
        // No further business read, lock or write after the joined command; only this audit batch and commit.
        await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${principal.membershipId}`,
          eventType: `recovery.allocation.${input.action}`, subjectType: "job", subjectRef: job,
          payload: { references: { commandId: input.commandId, caseId: target }, hashes: { command: result.payloadHash, approval: result.approvalHash }, classifications: { allocation: "financial" } } }]);
      });
    } catch (error) {
      const failure = error as { message?: string; code?: string };
      if (failure.message?.startsWith("ALLOCATION_") || ["INVALID_ALLOCATION_FACTS", "INVALID_CASE_SPLIT", "FRACTIONAL_CASE_SPLIT"].includes(failure.message ?? "")) throw new RecoveryAllocationError(failure.message as RecoveryAllocationErrorCode);
      if (failure.message === "RECOVERY_STALE_REVISION") fail("ALLOCATION_REVISION_CONFLICT");
      if (failure.message === "RECOVERY_REVIEWER_FORBIDDEN") fail("ALLOCATION_FORBIDDEN");
      if (failure.message === "IDEMPOTENCY_PAYLOAD_CONFLICT") fail("ALLOCATION_IDEMPOTENCY_CONFLICT");
      throw error;
    }
    return this.view(context, principal, sessionDigest, job);
  }

  private async artifact(db: TenantTransaction, context: VerifiedTenantContext, jobId: string, input: RecoveryAllocationCommand, snapshot: Snapshot, caseId: string): Promise<z.infer<typeof recoveryAllocationArtifactV1>> {
    const current = snapshot.cases.find(row => row.id === caseId);
    if (!current) fail("ALLOCATION_NOT_FOUND");
    if (Number(current.revision) !== input.expectedCaseRevision) fail("ALLOCATION_REVISION_CONFLICT");
    const reverse = input.action === "reverse" || input.action === "review_reverse";
    const original = "allocationId" in input ? snapshot.allocations.find(row => row.id === input.allocationId) : null;
    if (reverse && !original) fail("ALLOCATION_NOT_FOUND");
    const paymentId = "paymentId" in input ? input.paymentId : original!.payment_id;
    const receipt = snapshot.receipts.find(row => row.id === paymentId);
    if (!receipt || receipt.duplicate_held || (!reverse && receipt.reversed)) fail("ALLOCATION_SOURCE_REQUIRED");
    const evidenceId = "evidenceId" in input ? input.evidenceId : original!.evidence_id;
    const evidence = snapshot.evidence.find(row => row.id === evidenceId);
    if (!evidence || (!reverse && evidence.invalidated)) fail("ALLOCATION_EVIDENCE_HELD");
    if (!reverse && (current.eligibility_status !== "approved" || current.evidenced_net_pence === null)) fail("ALLOCATION_EVIDENCE_HELD");
    const invoiceNet = Number(receipt.invoice_net_pence), invoiceGross = Number(receipt.invoice_gross_pence);
    const net = integral(multiplyExactPence(exactPence(BigInt(input.grossPence)), exactPence(BigInt(reverse ? original!.eligible_net_pence : invoiceNet), BigInt(reverse ? original!.gross_pence : invoiceGross))));
    const tax = subtract(input.grossPence, net);
    if (!reverse) {
      const evidencedNet = Number(current.evidenced_net_pence);
      const evidencedGross = integral(multiplyExactPence(exactPence(BigInt(evidencedNet)), exactPence(BigInt(invoiceGross), BigInt(invoiceNet))));
      assertRecoveryAllocationSplit({ grossPence: input.grossPence, eligibleNetPence: net, taxPence: tax, evidencedNetPence: evidencedNet,
        evidencedGrossPence: evidencedGross, claimRemainingNetPence: subtract(Number(current.claim_pence), sum([Number(current.landed), Number(current.written_off)])) });
      const allocated = sum(snapshot.allocations.filter(row => row.payment_id === paymentId).map(row => subtract(Number(row.gross_pence), sum(snapshot.reversals.filter(reversal => reversal.allocation_id === row.id).map(reversal => Number(reversal.gross_pence))))));
      // Full receipt reversals remain blocked above; approved allocation reversals release only their own amount.
      if (sum([allocated, input.grossPence]) > Number(receipt.amount_pence)) fail("ALLOCATION_EXCEEDS_AVAILABLE");
    } else {
      const prior = sum(snapshot.reversals.filter(row => row.allocation_id === original!.id).map(row => Number(row.gross_pence)));
      if (sum([prior, input.grossPence]) > Number(original!.gross_pence)) fail("ALLOCATION_EXCEEDS_AVAILABLE");
      if (!receipt.reversed && !("creditNoteId" in input && input.creditNoteId)) fail("ALLOCATION_REVERSAL_SOURCE_REQUIRED");
    }
    let sourceId: string | null = null, sourceKind: "payment_reversal" | "credit_note" | null = null;
    if (reverse) {
      if ("creditNoteId" in input && input.creditNoteId) {
        const credit = (await db.$client.query<{ id: string; amount_pence: string }>("SELECT id,amount_pence FROM app.customer_credit_note WHERE tenant_id=$1 AND job_id=$2 AND invoice_id=$3 AND id=$4", [context.tenantId, jobId, receipt.invoice_id, input.creditNoteId])).rows[0];
        if (!credit || input.grossPence > Number(credit.amount_pence)) fail("ALLOCATION_REVERSAL_SOURCE_REQUIRED");
        sourceId = credit.id; sourceKind = "credit_note";
      } else {
        const reversal = (await db.$client.query<{ id: string }>("SELECT id FROM app.customer_payment_reversal WHERE tenant_id=$1 AND job_id=$2 AND payment_id=$3", [context.tenantId, jobId, paymentId])).rows[0];
        if (!reversal) fail("ALLOCATION_REVERSAL_SOURCE_REQUIRED");
        sourceId = reversal.id; sourceKind = "payment_reversal";
      }
    }
    const lineFacts = await this.lineFacts(db, context, jobId, receipt, input, snapshot, original, sourceId);
    const artifact = { version: "recovery-allocation-artifact.v1", action: reverse ? "reverse" : "allocate", caseId, paymentId, invoiceId: receipt.invoice_id, allocationId: original?.id ?? null,
      evidenceId, objectVersionId: evidence.object_version_id, evidenceHash: String(evidence.sha256).trim(),
      policyVersion: reverse ? original!.policy_version : current.policy_version, expectedCaseRevision: input.expectedCaseRevision,
      grossPence: input.grossPence, eligibleNetPence: net, taxPence: tax, movementId: receipt.movement_id,
      movementHash: String(receipt.movement_hash).trim(), eligibilityId: current.eligibility_id ?? null, sourceId, sourceKind, ...lineFacts };
    const validated = recoveryAllocationArtifactV1.safeParse(artifact);
    if (!validated.success) fail("INVALID_ALLOCATION_FACTS");
    return validated.data;
  }

  private async lineFacts(db: TenantTransaction, context: VerifiedTenantContext, jobId: string, receipt: Row, input: RecoveryAllocationCommand, snapshot: Snapshot, original: Row | null | undefined, reversalSourceId: string | null): Promise<{ lines: Array<RecoveryDeemedLineAllocation & { reversesId: string | null }>; bindings: Row[]; remittanceContent: string | null; remittanceEvidenceId: string | null; remittanceBytes: string | null }> {
    const rows = (await db.$client.query<Row>(`SELECT l.*,EXISTS(SELECT 1 FROM app.final_account_invoice_binding b
      WHERE b.tenant_id=$1 AND b.job_id=$2 AND b.invoice_id=$3 AND b.invoice_kind='supplementary') separate_invoice,
      to_char(l.existed_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') existed_at FROM app.recovery_allocation_invoice_lines($1,$2,$3) l ORDER BY l.id`,
      [context.tenantId, jobId, receipt.invoice_id])).rows;
    if (!rows.length || sum(rows.map(row => Number(row.net_pence))) !== Number(receipt.invoice_net_pence)
      || sum(rows.map(row => Number(row.gross_pence))) !== Number(receipt.invoice_gross_pence)) fail("ALLOCATION_SOURCE_REQUIRED");
    if (!original) {
      const later = await db.$client.query(`SELECT 1 FROM app.recovery_case_allocation a JOIN app.practice_feed_event e
        ON(e.tenant_id,e.id)=(a.tenant_id,a.movement_id) JOIN app.practice_feed_event candidate ON(candidate.tenant_id,candidate.id)=(e.tenant_id,$4)
        WHERE a.tenant_id=$1 AND a.job_id=$2 AND a.invoice_id=$3 AND e.created_at>candidate.created_at LIMIT 1`, [context.tenantId, jobId, receipt.invoice_id, receipt.movement_id]);
      if (later.rowCount) fail("ALLOCATION_REVISION_CONFLICT");
    }
    // PostgreSQL compares the original microsecond timestamps. Later credits are separate
    // reversals and cannot change the denominator at this receipt's effective time.
    const prior = original ? snapshot.lines.filter(row => row.invoice_id === receipt.invoice_id) :
      (await db.$client.query<Row>(`SELECT l.* FROM app.receipt_line_allocation l
        JOIN app.recovery_case_allocation a ON(a.tenant_id,a.id)=(l.tenant_id,l.allocation_id)
        JOIN app.practice_feed_event settled ON(settled.tenant_id,settled.id)=(a.tenant_id,a.movement_id)
        JOIN app.practice_feed_event candidate ON(candidate.tenant_id,candidate.id)=(a.tenant_id,$4)
        LEFT JOIN app.recovery_case_allocation_reversal r ON(r.tenant_id,r.id)=(l.tenant_id,l.reversal_id)
        LEFT JOIN app.customer_credit_note credit ON(credit.tenant_id,credit.id)=(r.tenant_id,r.credit_note_id)
        LEFT JOIN app.customer_payment_reversal refund ON(refund.tenant_id,refund.id)=(r.tenant_id,r.payment_reversal_id)
        WHERE l.tenant_id=$1 AND l.job_id=$2 AND l.invoice_id=$3 AND settled.created_at<=candidate.created_at
        AND (l.reversal_id IS NULL OR coalesce(credit.created_at,refund.created_at)<=candidate.created_at)`,
      [context.tenantId, jobId, receipt.invoice_id, receipt.movement_id])).rows;
    const facts: RecoveryReceiptFacts = {
      version: "recovery-receipt-facts.v1", environment: "synthetic_demo", compositionComplete: true, direction: original ? "reversal" : "receipt",
      receipt: { id: receipt.id, invoiceId: receipt.invoice_id, gross: serializeExactPence(exactPence(BigInt(input.grossPence))),
        effectiveAt: typeof receipt.movement_at === "string" ? receipt.movement_at : new Date(receipt.movement_at).toISOString(), sourceRef: reversalSourceId ?? receipt.movement_id },
      explicit: null, separateInvoice: rows[0]?.separate_invoice ? { invoiceId: receipt.invoice_id, sourceRef: reversalSourceId ?? receipt.invoice_id } : null,
      lines: rows.map(row => {
        const net = Number(row.net_pence), gross = Number(row.gross_pence);
        const settled = sumExactPence(prior.filter(line => line.line_id === row.id && (!original || line.allocation_id === original.id)).map(line => rowFraction(line, "gross")));
        const outstanding = original ? settled : sumExactPence([exactPence(BigInt(gross)), exactPence(-settled.numerator, settled.denominator)]);
        return { id: row.id, invoiceId: receipt.invoice_id, existedAt: row.existed_at, netPence: net, grossPence: gross, outstandingGross: serializeExactPence(outstanding) };
      }),
    };
    // Reliable explicit shares come from finalized immutable source bytes, never the command's arithmetic.
    let remittanceEvidenceId = "remittanceEvidenceId" in input ? input.remittanceEvidenceId ?? null : null;
    if (!original) {
      // A saved verified source has priority on every review, including omitted IDs.
      // Multiple recorded sources require reconciliation rather than choosing one for money.
      const recorded = (await db.$client.query<{ evidence_id: string }>(`SELECT DISTINCT artifact->>'remittanceEvidenceId' evidence_id
        FROM app.recovery_allocation_review WHERE tenant_id=$1 AND job_id=$2 AND payment_id=$3
        AND allocation_id IS NULL AND artifact->>'remittanceEvidenceId' IS NOT NULL`, [context.tenantId, jobId, receipt.id])).rows;
      if (recorded.length > 1 || recorded[0] && remittanceEvidenceId && recorded[0].evidence_id !== remittanceEvidenceId) fail("ALLOCATION_SOURCE_REQUIRED");
      remittanceEvidenceId = recorded[0]?.evidence_id ?? remittanceEvidenceId;
    }
    // Reversal without a fresh item-specific source uses the original saved line balances.
    // It does not requalify or reread the original remittance.
    let remittanceContent: string | null = null, remittanceBytes: string | null = null;
    if (remittanceEvidenceId) {
      const source = (await db.$client.query<{ bytes: Buffer; sha256: string }>(`SELECT o.bytes,e.sha256 FROM app.evidence_object e
        JOIN app.evidence_upload u ON(u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
        JOIN app.synthetic_evidence_original o ON(o.tenant_id,o.upload_id,o.object_version_id)=(e.tenant_id,e.upload_id,e.object_version_id)
        WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.id=$3 AND e.kind='original' AND u.state='verified'
        AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=e.tenant_id AND x.evidence_id=e.id)`, [context.tenantId, jobId, remittanceEvidenceId])).rows[0];
      if (!source || source.bytes.length > 100_000) fail("ALLOCATION_SOURCE_REQUIRED");
      remittanceContent = pngRemittance(source.bytes);
      remittanceBytes = source.bytes.toString("base64");
      if (createHash("sha256").update(source.bytes).digest("hex") !== source.sha256.trim()) fail("ALLOCATION_SOURCE_REQUIRED");
      let parsed: unknown;
      try { parsed = JSON.parse(remittanceContent); } catch { fail("ALLOCATION_SOURCE_REQUIRED"); }
      const contract = z.object({ version: z.literal("recovery-remittance.v1"), paymentId: z.guid({ error: "Invalid uuid" }), invoiceId: z.guid({ error: "Invalid uuid" }),
        shares: z.array(z.object({ lineId: z.guid({ error: "Invalid uuid" }), gross: z.object({ numerator: z.string().regex(/^(?:0|[1-9]\d*)$/u).max(100), denominator: z.string().regex(/^[1-9]\d*$/u).max(100) }).strict() }).strict()).max(10_000) }).strict().safeParse(parsed);
      if (!contract.success || contract.data.paymentId !== receipt.id || contract.data.invoiceId !== receipt.invoice_id) fail("ALLOCATION_SOURCE_REQUIRED");
      facts.explicit = { sourceRef: remittanceEvidenceId, shares: contract.data.shares };

    }
    const bindings = facts.lines.map(line => ({ lineId: line.id, netPence: line.netPence, grossPence: line.grossPence, existedAt: line.existedAt,
      explicitEvidenceId: remittanceEvidenceId, explicitGrossPence: null }));
    return { lines: mapRecoveryReceiptToLines(facts).map(row => ({ ...row, reversesId: original ? prior.find(line => line.line_id === row.lineId && line.allocation_id === original.id && !line.reverses_id)?.id ?? null : null })),
      bindings, remittanceContent, remittanceEvidenceId, remittanceBytes };
  }
}
