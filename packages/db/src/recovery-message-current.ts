import {
  buildEvidenceManifest, buildRecoveryMessage, canonicalManifest, manifestDigest, renderStandalonePack, sha256, verifyStandalonePack,
  type RecoveryMessage, type RecoveryMessageCaseType,
} from "@jobguard/core";
import { loadEvidencePackSources } from "./evidence-pack-sources.js";
import type { TenantTransaction } from "./tenant-context.js";

export class RecoveryMessageNotFound extends Error {
  constructor() { super("RECOVERY_MESSAGE_NOT_FOUND"); this.name = "RecoveryMessageNotFound"; }
}

export type RecoveryMessageReadinessReason = "CASE_NOT_ELIGIBLE" | "PACK_REQUIRED" | "ATTACHMENT_APPROVAL_REQUIRED";
export type CaseNow = { jobId: string; caseType: string; synthetic: boolean; environment: string; sourceRefs: string[]; caseRevision: number; outstandingPence: number };
export type Current =
  | { ok: true; now: CaseNow; pack: { id: string; revision: number; manifestHash: string; contentHash: string; approvalId: string }; message: RecoveryMessage }
  | { ok: false; reason: RecoveryMessageReadinessReason; now: CaseNow; pack: { id: string; revision: number } | null };

/** The lock key every case command shares: case commands, pack commands, message commands and the delivery boundary all take it. */
export function lockRecoveryCase(db: TenantTransaction, tenantId: string, caseId: string) {
  return db.$client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))", [tenantId, caseId]);
}

/**
 * The case as it stands now, and the exact message it would produce. Never trusts a stored flag: the evidence pack is
 * rebuilt from its sources and must still hash to what was approved. Used by the repository for previews and approvals and,
 * under the case lock and in the same transaction as the sink insert, by the delivery boundary.
 */
export async function inspectRecoveryMessageCase(db: TenantTransaction, tenantId: string, caseId: string): Promise<Current> {
  const job = (await db.$client.query<{ job_id: string }>("SELECT job_id FROM app.recovery_case WHERE tenant_id=$1 AND id=$2", [tenantId, caseId])).rows[0];
  if (!job) throw new RecoveryMessageNotFound();
  const snapshot = (await db.$client.query<{ case_type: string; synthetic: boolean; environment: string; source_refs: string[]; case_revision: number; outstanding_pence: string }>(
    "SELECT * FROM app.recovery_message_case_snapshot($1,$2,$3)", [tenantId, job.job_id, caseId])).rows[0];
  if (!snapshot) throw new RecoveryMessageNotFound();
  const now: CaseNow = { jobId: job.job_id, caseType: snapshot.case_type, synthetic: snapshot.synthetic, environment: snapshot.environment, sourceRefs: snapshot.source_refs, caseRevision: Number(snapshot.case_revision), outstandingPence: Number(snapshot.outstanding_pence) };
  const pack = (await db.$client.query<{ pack_id: string; revision: number; manifest_hash: string; content_hash: string; canonical_manifest: string; artifact_text: string | null }>(
    "SELECT pack_id,revision,manifest_hash,content_hash,canonical_manifest,artifact_text FROM app.evidence_pack_revision WHERE tenant_id=$1 AND case_id=$2 ORDER BY revision DESC LIMIT 1", [tenantId, caseId])).rows[0];
  const eligible = now.synthetic && now.environment === "synthetic_demo" && (now.caseType === "withheld_customer_payment" || now.caseType === "merchant_overcharge") && now.outstandingPence > 0;
  if (!eligible) return { ok: false, reason: "CASE_NOT_ELIGIBLE", now, pack: pack ? { id: pack.pack_id, revision: Number(pack.revision) } : null };
  if (!pack) return { ok: false, reason: "PACK_REQUIRED", now, pack: null };
  const summary = { id: pack.pack_id, revision: Number(pack.revision) };
  const approval = (await db.$client.query<{ id: string }>(
    "SELECT id FROM app.evidence_pack_attachment_approval WHERE tenant_id=$1 AND case_id=$2 AND pack_id=$3 AND manifest_hash=$4 AND content_hash=$5 ORDER BY created_at,id LIMIT 1",
    [tenantId, caseId, pack.pack_id, pack.manifest_hash, pack.content_hash])).rows[0];
  if (!approval || !pack.artifact_text) return { ok: false, reason: "ATTACHMENT_APPROVAL_REQUIRED", now, pack: summary };
  // The approval counts only while the pack is intact and every source still hashes to what was approved.
  let valid = false;
  try {
    const sources = await loadEvidencePackSources(db, tenantId, caseId);
    const manifest = buildEvidenceManifest(caseId, now.jobId, sources.sources, sources.omissions), artifact = renderStandalonePack(manifest, sources.sources);
    valid = sources.omissions.length === 0 && artifact === pack.artifact_text && sha256(pack.artifact_text) === pack.content_hash && manifestDigest(manifest) === pack.manifest_hash &&
      canonicalManifest(manifest) === pack.canonical_manifest && verifyStandalonePack(pack.artifact_text).contentMatches;
  } catch (error) { if (!(error instanceof Error) || !error.message.startsWith("EVIDENCE_PACK_")) throw error; }
  if (!valid) return { ok: false, reason: "ATTACHMENT_APPROVAL_REQUIRED", now, pack: summary };
  const message = buildRecoveryMessage({
    caseId, jobId: now.jobId, caseType: now.caseType as RecoveryMessageCaseType, caseRevision: now.caseRevision, amountPence: now.outstandingPence, sourceRefs: now.sourceRefs,
    packId: pack.pack_id, packRevision: Number(pack.revision), manifestHash: pack.manifest_hash, attachmentHash: pack.content_hash,
  });
  return { ok: true, now, pack: { ...summary, manifestHash: pack.manifest_hash, contentHash: pack.content_hash, approvalId: approval.id }, message };
}
