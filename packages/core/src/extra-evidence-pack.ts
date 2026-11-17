import { z } from "zod";
import { buildEvidenceManifest, inspectEvidenceManifest, manifestDigest, renderStandalonePack, standaloneEvidencePackV1, evidenceSourceV1, verifyStandalonePack, type EvidenceSource } from "./evidence-pack.js";
import { readExtraConstraint, ExtraApprovalConstraintError } from "./extra-approval.js";

const reference = z.string().min(1).max(300);
const heldSources = "Approval requirement, steps and extra work timing HELD";
export const extraSourcePackV1 = z.object({ version: z.literal("extra-source-pack.v1"), subject: z.object({ kind: z.literal("extra"), jobId: reference, extraId: reference }).strict(),
  completeApprovalPack: z.literal(false), integrity: standaloneEvidencePackV1 }).strict().superRefine((v, ctx) => {
    if (v.integrity.manifest.jobId !== v.subject.jobId || v.integrity.manifest.caseId !== extraIntegrityKey(v.subject.extraId) || !v.integrity.manifest.omissions?.includes(heldSources)) ctx.addIssue({ code: "custom", message: "Invalid extra integrity subject or missing held-source label" });
  });
/** Only an internal identity key in the legacy verifier's schema; no database recovery subject is created. */
const extraIntegrityKey = (id: string) => `extra:${id}`;
export function buildExtraSourcePack(jobId: string, extraId: string, rawSources: unknown, rawOmissions: unknown) {
  const sources = readExtraConstraint(z.array(evidenceSourceV1).min(1), rawSources), omissions = readExtraConstraint(z.array(reference), rawOmissions);
  if (sources.some(s => s.jobId !== jobId)) throw new ExtraApprovalConstraintError();
  const manifest = buildEvidenceManifest(extraIntegrityKey(extraId), jobId, sources, [...new Set([...omissions, heldSources])]);
  return readExtraConstraint(extraSourcePackV1, { version: "extra-source-pack.v1", subject: { kind: "extra", jobId, extraId }, completeApprovalPack: false, integrity: JSON.parse(renderStandalonePack(manifest, sources)) });
}
export function inspectExtraSourcePack(raw: unknown, actual: EvidenceSource[], trustedManifestDigest?: string) {
  const pack = readExtraConstraint(extraSourcePackV1, raw);
  return { ...inspectEvidenceManifest(pack.integrity.manifest, actual, trustedManifestDigest !== undefined && trustedManifestDigest === manifestDigest(pack.integrity.manifest)), completeApprovalPack: false as const };
}
export function verifyExtraSourcePack(text: string, options: { trustedManifestDigest?: string } = {}) {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new ExtraApprovalConstraintError(); }
  const pack = readExtraConstraint(extraSourcePackV1, raw);
  return { ...verifyStandalonePack(JSON.stringify(pack.integrity), options), completeApprovalPack: false as const };
}
