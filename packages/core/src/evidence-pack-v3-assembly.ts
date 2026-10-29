import { z } from "zod";
import { sha256 } from "./evidence-pack.js";
import {
  buildEvidenceManifestV3, evidenceSectionKindV3, evidenceSpecimenSourceV3,
  evidencePackSpecimenInputV3, manifestDigestV3, renderStandalonePackV3,
} from "./evidence-pack-v3.js";

// Producer records are exact PostgreSQL JSON text, not reinterpreted money or a regenerated original.
const shape = evidenceSpecimenSourceV3.shape;
export const evidencePackMaterialV3 = z.object({
  tenantId: z.string().uuid(), jobId: z.string().uuid(), caseId: z.string().uuid(),
  lifecycle: evidencePackSpecimenInputV3.shape.lifecycle,
  records: z.array(z.object({ kind: shape.kind, sourceId: shape.sourceId,
    recordedAt: shape.recordedAt, content: shape.content }).strict()),
}).strict();
export type EvidencePackMaterialV3 = z.infer<typeof evidencePackMaterialV3>;

/** Material is supplied only by the worker's checked database reader. Parsing alone grants no provenance. */
export function assembleEvidencePackV3(raw: unknown) {
  const material = evidencePackMaterialV3.parse(raw);
  const { tenantId, jobId, caseId, lifecycle, records } = material;
  const owner = { tenantId, jobId, caseId };
  const sources = records.map(r => ({ ...owner, ...r, sourceVersion: sha256(r.content),
    objectVersion: `database-record:${sha256(r.content)}`, links: [] }));
  const sections = lifecycle.state === "pre_lock" ? [] : evidenceSectionKindV3.options.map(kind => {
    const sourceIds = sources.filter(s => s.kind === kind).map(s => s.sourceId);
    return sourceIds.length ? { kind, status: "present" as const, sourceIds }
      : { kind, status: "absent" as const, reason: kind === "settlement" ? "unpaid" as const : "not_yet_available" as const };
  });
  const manifest = buildEvidenceManifestV3({ ...owner, binding: "synthetic-records", lifecycle, sections, sources });
  const artifactText = renderStandalonePackV3(manifest, sources);
  return { material, sources, manifest, artifactText, manifestHash: manifestDigestV3(manifest), contentHash: sha256(artifactText) };
}
