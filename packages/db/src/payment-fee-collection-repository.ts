import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { paymentFeeBindingV1 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { practiceMaterialPool, PracticeAccessError } from "./practice-session.js";
const id = z.string().uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/u);
const documentV1 = z.object({
  version: z.literal("payment-fee-statement.v1"), statementId: id, jobId: id, paymentId: id,
  statementHash: hash, sourceHash: hash, revision: z.literal(1), feePence: z.number().int().safe().nonnegative(),
  policyVersion: z.literal("reference_fee_policy_v3"), environment: z.literal("synthetic_demo"),
  productionEnabled: z.literal(false), realExternalActions: z.literal(0),
});
export type PaymentFeeCollectionPause = "AUTHORITY_DISPUTED" | "AUTHORITY_REVOKED" | "AUTHORITY_EXPIRED" | "AUTHORITY_STALE";
export class PaymentFeeCollectionSourceError extends Error {
  constructor(readonly reason: PaymentFeeCollectionPause) { super(reason); }
}
const refuse = (reason: PaymentFeeCollectionPause = "AUTHORITY_STALE"): never => { throw new PaymentFeeCollectionSourceError(reason); };
export type PaymentFeeCollectionReader = (jobId: string, statementId: string, statementHash: string) => Promise<unknown>;
/** Owner-connected, synthetic-only reader. No new runtime grants or writes.
 * The caller's reservation transaction surrounds this SQL transaction. Keep its
 * locks until the reservation callback finishes; never cache the returned source. */
export class PaymentFeeCollectionRepository {
  constructor(private readonly ownerPool: Pool) {}
  async withReader<T>(context: VerifiedTenantContext, digest: string,
    work: (read: PaymentFeeCollectionReader) => Promise<T>): Promise<T> {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    return withTenant(practiceMaterialPool(this.ownerPool, digest), context, db =>
      work((jobId, statementId, statementHash) => this.read(db.$client, context.tenantId, digest, jobId, statementId, statementHash)));
  }
  private async read(db: PoolClient, tenantId: string, digest: string, jobId: string, statementId: string, statementHash: string) {
    id.parse(jobId); id.parse(statementId); hash.parse(statementHash);
    // 0359 reauthenticates the synthetic owner and takes case/allocation/session
    // locks in its existing order before any protected statement is read.
    const actor = (await db.query<{ actor: string }>("SELECT app.payment_fee_actor($1,$2) actor", [jobId, digest])).rows[0]!.actor;
    const saved = (await db.query<{ document: unknown; decision_id: string }>(
      "SELECT document,decision_id FROM app.payment_fee_statement WHERE tenant_id=$1 AND job_id=$2 AND id=$3",
      [tenantId, jobId, statementId])).rows[0];
    if (!saved) return refuse();
    const s = documentV1.parse(saved.document);
    if (s.jobId !== jobId || s.statementId !== statementId || s.statementHash !== statementHash) return refuse();
    const state = (await db.query<{ state: string }>("SELECT app.payment_fee_current($1,$2,$3,$4) state",
      [tenantId, jobId, statementId, actor])).rows[0]!.state;
    if (state === "disputed") return refuse("AUTHORITY_DISPUTED");
    if (state === "approval_revoked") return refuse("AUTHORITY_REVOKED");
    if (state === "approval_expired") return refuse("AUTHORITY_EXPIRED");
    if (state !== "approved") return refuse();
    // Lock the exact authorization against concurrent revocation until the local
    // reservation/dispatch transition is complete. No business lock follows audit.
    const a = (await db.query<{ id: string; actor_membership_id: string; decision_id: string; expires_at: Date; revoked_at: Date | null }>(`
      SELECT a.id,a.actor_membership_id,a.decision_id,a.expires_at,a.revoked_at
      FROM app.payment_fee_command c JOIN app.action_authorization a
        ON (a.tenant_id,a.id)=(c.tenant_id,c.authorization_id)
      JOIN app.decision_resolution r ON (r.tenant_id,r.id,r.decision_id)=(a.tenant_id,a.resolution_id,a.decision_id)
      JOIN app.decision d ON (d.tenant_id,d.id)=(a.tenant_id,a.decision_id)
      WHERE c.tenant_id=$1 AND c.job_id=$2 AND c.statement_id=$3 AND c.payload->>'action'='approve'
        AND a.decision_id=$4 AND a.actor_membership_id=$5 AND r.actor_membership_id=$5 AND r.resolution='approved'
        AND a.action_type='payment_fee.collect' AND a.recipient='platform:jobguard'
        AND a.content_hash=$6 AND a.aggregate_revision=1 AND a.policy_version='reference_fee_policy_v3'
        AND a.amount_pence=$7 AND a.currency='GBP' AND a.authorization_kind='exact'
        AND d.subject_type='payment_fee_statement' AND d.subject_ref=$3::text AND d.action_type='payment_fee.collect'
      FOR SHARE OF a`, [tenantId, jobId, statementId, saved.decision_id, actor, s.statementHash, s.feePence])).rows[0];
    if (!a) return refuse();
    if (a.revoked_at !== null) return refuse("AUTHORITY_REVOKED");
    return {
      version: "success-fee-collection-sources.v1", tenantId, jobId, invoiceId: statementId,
      invoiceHash: s.statementHash, paymentId: s.paymentId,
      binding: paymentFeeBindingV1.parse({ version: "payment-fee-binding.v1", action: "collect_payment_fee",
        statementId, statementRevision: s.revision, statementHash: s.statementHash, sourceHash: s.sourceHash,
        principal: { pence: s.feePence, currency: "GBP" }, recipientRef: "platform:jobguard", policyVersion: s.policyVersion }),
      currentSourceHash: s.sourceHash, settlementVerified: true, current: true,
      receiptDisputed: false, caseDisputed: false, attributionDisputed: false,
      verifiedFeePence: s.feePence, creditsPence: 0, priorReceiptsPence: 0,
      authorization: { kind: "statement", id: a.id, decisionId: a.decision_id, tenantId,
        actorMembershipId: a.actor_membership_id, action: "payment_fee.collect", recipientRef: "platform:jobguard",
        policyVersion: s.policyVersion, currency: "GBP", state: "approved", expiresAt: a.expires_at.toISOString(),
        statementId, statementHash: s.statementHash, amountPence: s.feePence },
    };
  }
}
