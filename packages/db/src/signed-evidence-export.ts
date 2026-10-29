import { createHash, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { manifestDigestV3, standaloneEvidencePackV3, utcDatetimeV1, verifyStandalonePackV3 } from "@jobguard/core";
import { z } from "zod";
import { auditExportFileV1, auditExportFingerprint, verifySignedAuditExport } from "./audit-export-repository.js";

const id = z.string().uuid(), digest = z.string().regex(/^[a-f0-9]{64}$/u);
const label = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/u);
// A single canonical precision makes validity-window comparisons unambiguous.
const timestamp = utcDatetimeV1.refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
export const evidenceSignerKeyV1 = z.object({
  version: z.literal("evidence-signer-key.v1"), tenantId: id, signerId: label, keyVersion: label,
  algorithm: z.literal("Ed25519"), publicKeyPem: z.string().min(1).max(1000), fingerprint: digest,
  notBefore: timestamp, expiresAt: timestamp, revoked: z.boolean(),
}).strict().refine(k => k.notBefore < k.expiresAt && auditExportFingerprint(k.publicKeyPem) === k.fingerprint);
export type EvidenceSignerKey = z.infer<typeof evidenceSignerKeyV1>;
const payloadV1 = z.object({
  version: z.literal("signed-evidence-manifest.v1"), environment: z.literal("synthetic_demo"),
  tenantId: id, jobId: id, caseId: id, exportId: id, createdAt: timestamp,
  signerId: label, keyVersion: label, signerFingerprint: digest,
  evidenceManifestHash: digest, evidenceArtifactHash: digest, auditArtifactHash: digest,
}).strict();
export const signedEvidenceExportV1 = z.object({
  version: z.literal("signed-evidence-export.v1"), payload: payloadV1,
  signer: evidenceSignerKeyV1, signatureBase64: z.string().regex(/^[A-Za-z0-9+/]{86}==$/u),
  evidenceText: z.string(), audit: auditExportFileV1,
}).strict();
export class SignedEvidenceExportError extends Error {
  readonly code = "SIGNED_EVIDENCE_EXPORT_INVALID";
  constructor() { super("Invalid synthetic signed evidence export"); }
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const bytes = (payload: z.infer<typeof payloadV1>) => Buffer.from(JSON.stringify(payloadV1.parse(payload)));
function checked<T>(operation: () => T): T {
  try { return operation(); } catch { throw new SignedEvidenceExportError(); }
}
function material(evidenceText: string, audit: unknown) {
  const pack = standaloneEvidencePackV3.parse(JSON.parse(evidenceText));
  const report = verifyStandalonePackV3(evidenceText);
  if (!report.contentMatches) throw new SignedEvidenceExportError();
  const verifiedAudit = verifySignedAuditExport(audit);
  if (verifiedAudit.payload.tenantId !== pack.manifest.tenantId) throw new SignedEvidenceExportError();
  return { pack, report, verifiedAudit };
}

/** In-memory synthetic keys only. Rotation keeps public material, never old private keys. */
export class SyntheticEvidenceSigner {
  private current?: { record: EvidenceSignerKey; privateKey: KeyObject };
  private readonly retained: EvidenceSignerKey[] = [];
  constructor(private readonly tenantId: string, private readonly signerId: string) {}
  rotate(keyVersion: string, notBefore: string, expiresAt: string): void {
    checked(() => {
      if (this.retained.some(k => k.keyVersion === keyVersion)) throw new SignedEvidenceExportError();
      const keys = generateKeyPairSync("ed25519");
      const publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
      const record = evidenceSignerKeyV1.parse({ version: "evidence-signer-key.v1", tenantId: this.tenantId,
        signerId: this.signerId, keyVersion, algorithm: "Ed25519", publicKeyPem,
        fingerprint: auditExportFingerprint(publicKeyPem), notBefore, expiresAt, revoked: false });
      this.retained.push(record);
      this.current = { record, privateKey: keys.privateKey };
    });
  }
  verificationKeys(): EvidenceSignerKey[] { return structuredClone(this.retained); }
  sign(evidenceText: string, audit: unknown, createdAt: string) {
    return checked(() => {
      const current = this.current;
      if (!current) throw new SignedEvidenceExportError();
      const { pack, report, verifiedAudit } = material(evidenceText, audit);
      const key = current.record;
      if (pack.manifest.tenantId !== this.tenantId || createdAt < key.notBefore || createdAt >= key.expiresAt) throw new SignedEvidenceExportError();
      const payload = payloadV1.parse({ version: "signed-evidence-manifest.v1", environment: "synthetic_demo",
        tenantId: this.tenantId, jobId: pack.manifest.jobId, caseId: pack.manifest.caseId,
        exportId: verifiedAudit.payload.exportId, createdAt, signerId: key.signerId, keyVersion: key.keyVersion,
        signerFingerprint: key.fingerprint, evidenceManifestHash: manifestDigestV3(pack.manifest),
        evidenceArtifactHash: report.artifactHash, auditArtifactHash: hash(JSON.stringify(auditExportFileV1.parse(audit))) });
      return signedEvidenceExportV1.parse({ version: "signed-evidence-export.v1", payload, signer: key,
        signatureBase64: sign(null, bytes(payload), current.privateKey).toString("base64"), evidenceText, audit });
    });
  }
}

export const evidenceVerificationContextV1 = z.object({
  version: z.literal("evidence-verification-context.v1"), tenantId: id, jobId: id, caseId: id, exportId: id,
  checkedAt: timestamp, trustedKeys: z.array(evidenceSignerKeyV1),
}).strict();
/** Trust and expected scope must come independently, never from the supplied bundle. No I/O or authority granted. */
export function verifySignedEvidenceExport(raw: unknown, rawContext: unknown) {
  return checked(() => {
    const file = signedEvidenceExportV1.parse(raw), context = evidenceVerificationContextV1.parse(rawContext);
    const p = file.payload, k = file.signer;
    const { pack, report, verifiedAudit } = material(file.evidenceText, file.audit);
    if (!verify(null, bytes(p), k.publicKeyPem, Buffer.from(file.signatureBase64, "base64")) ||
      p.signerId !== k.signerId || p.keyVersion !== k.keyVersion || p.signerFingerprint !== k.fingerprint || p.tenantId !== k.tenantId ||
      p.createdAt < k.notBefore || p.createdAt >= k.expiresAt ||
      p.evidenceManifestHash !== report.manifestHash || p.evidenceArtifactHash !== report.artifactHash ||
      p.auditArtifactHash !== hash(JSON.stringify(file.audit)) || p.exportId !== verifiedAudit.payload.exportId ||
      (["tenantId", "jobId", "caseId"] as const).some(field => p[field] !== pack.manifest[field]) ||
      (["tenantId", "jobId", "caseId", "exportId"] as const).some(field => p[field] !== context[field])) throw new SignedEvidenceExportError();
    const identities = context.trustedKeys.map(key => JSON.stringify([key.tenantId, key.signerId, key.keyVersion]));
    if (new Set(identities).size !== identities.length) throw new SignedEvidenceExportError();
    const trusted = context.trustedKeys.find(key => key.tenantId === p.tenantId && key.signerId === p.signerId && key.keyVersion === p.keyVersion);
    const signerTrusted = !!trusted && trusted.fingerprint === k.fingerprint && !trusted.revoked &&
      p.createdAt >= trusted.notBefore && p.createdAt < trusted.expiresAt && p.createdAt <= context.checkedAt;
    const keyExpired = !!trusted && context.checkedAt >= trusted.expiresAt;
    const gaps = ["No external timestamp; signing time is asserted, not independently proven (M4-4).",
      "Revocation and key identity depend on the independently supplied registry snapshot.",
      "Audit checkpoint origin is signer-attested; no independent timestamp is verified.",
      ...pack.manifest.trustLimitations];
    for (const section of pack.manifest.sections) {
      if (section.status === "absent") gaps.push(`Evidence section ${section.kind} absent: ${section.reason}.`);
    }
    if (!signerTrusted) gaps.push("Signer is untrusted, revoked, outside its validity window, or future-dated.");
    if (keyExpired) gaps.push("Key is expired at verification time; historical signature remains cryptographically valid, but signing time is unproven.");
    return { version: "signed-evidence-verification.v1", integrityValid: signerTrusted, signerTrusted,
      complete: false, syntheticIntegrityComplete: signerTrusted && report.contentMatches,
      tenantId: p.tenantId, exportId: p.exportId, signerId: p.signerId, keyVersion: p.keyVersion,
      signerFingerprint: p.signerFingerprint, algorithm: k.algorithm, keyExpired,
      notBefore: trusted?.notBefore ?? k.notBefore, expiresAt: trusted?.expiresAt ?? k.expiresAt,
      checkedAt: context.checkedAt, revoked: trusted?.revoked ?? null,
      timestampTrust: "unverified", gaps,
      notice: "The signature proves export integrity only; it does not prove the underlying commercial claim is true." };
  });
}
