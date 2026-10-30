import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { evidenceSignerKeyV1, signedEvidenceExportV1, verifySignedEvidenceExport } from "./signed-evidence-export.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.string().uuid().transform(value => value.toLowerCase());
const requestV1 = z.object({ version: z.literal("signed-evidence-export-store.v1"),
  authorizationId: uuid, actorMembershipId: uuid,
  recipient: z.email().regex(/^[^@]+@example\.invalid$/u), bundle: signedEvidenceExportV1,
}).strict();
export class SignedEvidenceStoreError extends Error {
  constructor(readonly code: "SIGNED_EXPORT_FORBIDDEN" | "SIGNED_EXPORT_CONFLICT" | "SIGNED_EXPORT_INVALID" | "SIGNED_EXPORT_MODE_HELD") { super(code); }
}
/** Exact bytes approved by the human; scope, revisions and signer are included in the signed bundle. */
export function signedEvidenceBundleHash(raw: unknown): string {
  return createHash("sha256").update(JSON.stringify(signedEvidenceExportV1.parse(raw))).digest("hex");
}

/** No delivery/provider action. Public verification material comes from an independently provisioned registry. */
export class SignedEvidenceExportStore {
  constructor(private readonly pool: Pool) {}
  async persist(context: VerifiedTenantContext, raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new SignedEvidenceStoreError("SIGNED_EXPORT_MODE_HELD");
    const input = requestV1.parse(raw), p = input.bundle.payload;
    if (context.tenantId !== p.tenantId) throw new SignedEvidenceStoreError("SIGNED_EXPORT_FORBIDDEN");
    const bundleText = JSON.stringify(input.bundle), bundleHash = signedEvidenceBundleHash(input.bundle);
    return withTenant(this.pool, context, async db => {
      // Same tenant membership fence as AuditExportRepository. All business locks precede audit.
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [context.tenantId]);
      const member = await db.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2
        AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())
        AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation v WHERE v.tenant_id=$1 AND v.membership_id=$2)`, [context.tenantId, input.actorMembershipId]);
      if (!member.rowCount) throw new SignedEvidenceStoreError("SIGNED_EXPORT_FORBIDDEN");
      const prior = (await db.$client.query<{ bundle_text: string; recipient: string; authorization_id: string; actor_membership_id: string }>(
        "SELECT bundle_text,recipient,authorization_id,actor_membership_id FROM app.signed_evidence_export WHERE tenant_id=$1 AND id=$2",
        [context.tenantId, p.exportId])).rows[0];
      if (prior) {
        if (prior.bundle_text !== bundleText || prior.recipient !== input.recipient || prior.authorization_id !== input.authorizationId || prior.actor_membership_id !== input.actorMembershipId)
          throw new SignedEvidenceStoreError("SIGNED_EXPORT_CONFLICT");
        return { exportId: p.exportId, bundleHash, reused: true };
      }
      const key = (await db.$client.query<{ record: unknown }>(`SELECT record FROM app.evidence_export_signer_key
        WHERE tenant_id=$1 AND signer_id=$2 AND key_version=$3`, [context.tenantId, p.signerId, p.keyVersion])).rows[0];
      const clock = (await db.$client.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0]!.now.toISOString();
      const report = verifySignedEvidenceExport(input.bundle, { version: "evidence-verification-context.v1",
        tenantId: context.tenantId, jobId: p.jobId, caseId: p.caseId, exportId: p.exportId,
        checkedAt: clock, trustedKeys: key ? [evidenceSignerKeyV1.parse(key.record)] : [] });
      if (!report.signerTrusted) throw new SignedEvidenceStoreError("SIGNED_EXPORT_INVALID");
      // FK checks and authorization must happen before the audit head lock, so insert first
      // with a deferred event reference, then append the matching event in this transaction.
      const auditId = randomUUID();
      await db.$client.query("SET CONSTRAINTS signed_evidence_export_audit_event_fk DEFERRED");
      await db.$client.query(`INSERT INTO app.signed_evidence_export(tenant_id,id,job_id,case_id,actor_membership_id,
        authorization_id,recipient,signer_id,key_version,signer_fingerprint,bundle_text,bundle_hash,audit_event_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [context.tenantId, p.exportId, p.jobId, p.caseId, input.actorMembershipId, input.authorizationId,
        input.recipient, p.signerId, p.keyVersion, p.signerFingerprint, bundleText, bundleHash, auditId]);
      await appendAuditBatch(db, [{ id: auditId, version: "audit.v1", actorRef: `membership:${input.actorMembershipId}`,
        eventType: "evidence_export.stored", subjectType: "audit-export", subjectRef: p.exportId,
        payload: { references: { jobId: p.jobId, caseId: p.caseId, authorizationId: input.authorizationId, signerId: p.signerId, keyVersion: p.keyVersion },
          hashes: { bundle: bundleHash, recipient: createHash("sha256").update(input.recipient).digest("hex") }, classifications: { action: "security" } } }]);
      return { exportId: p.exportId, bundleHash, reused: false };
    });
  }
}

/** Restricted assurance connection only; the runtime role cannot provision keys or replace a version. */
export async function retainEvidenceExportKey(assurancePool: Pool, context: VerifiedTenantContext, raw: unknown): Promise<void> {
  const key = evidenceSignerKeyV1.parse(raw);
  if (context.tenantId !== key.tenantId) throw new SignedEvidenceStoreError("SIGNED_EXPORT_FORBIDDEN");
  await withTenant(assurancePool, context, async db => {
    await db.$client.query(`INSERT INTO app.evidence_export_signer_key(tenant_id,signer_id,key_version,fingerprint,record)
      VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING`, [key.tenantId, key.signerId, key.keyVersion, key.fingerprint, JSON.stringify(key)]);
    const existing = (await db.$client.query<{ record: unknown }>(`SELECT record FROM app.evidence_export_signer_key
      WHERE tenant_id=$1 AND signer_id=$2 AND key_version=$3`, [key.tenantId, key.signerId, key.keyVersion])).rows[0];
    if (!existing || JSON.stringify(evidenceSignerKeyV1.parse(existing.record)) !== JSON.stringify(key))
      throw new SignedEvidenceStoreError("SIGNED_EXPORT_CONFLICT");
  });
}
