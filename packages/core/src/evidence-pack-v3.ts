import { z } from "zod";
import { EVIDENCE_PACK_SANDBOX_BANNER, sha256 } from "./evidence-pack.js";

// Unbound specimens and synthetic worker record exports share the same integrity envelope.
// Reject lone UTF-16 surrogates instead of allowing UTF-8 encoding to replace them silently.
const wellFormedText = (value: string) => value === new TextDecoder("utf-8", { ignoreBOM: true }).decode(new TextEncoder().encode(value));
const id = z.string().min(1).max(256).refine(wellFormedText, "Expected well-formed Unicode");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/).refine((value) => {
  // Date is used only to validate the calendar, never to round/truncate the stored source time.
  const milliseconds = value.slice(0, 23) + "Z";
  const parsed = new Date(milliseconds);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === milliseconds;
}, "Expected a real UTC timestamp with exactly six fractional digits");
export const evidenceSectionKindV3 = z.enum([
  "lock", "capture_snapshot", "source_observations", "reconciliation",
  "reveal", "disposition", "attribution_revision", "settlement",
]);
const identity = { tenantId: id, jobId: id, caseId: id };
const referenceShape = {
  ...identity, sourceId: id, sourceVersion: id, objectVersion: id, contentHash: digest,
};
export const evidenceSpecimenLinkV3 = z.object(referenceShape).strict();
const descriptorShape = {
  ...referenceShape, kind: z.enum(["ordinary", ...evidenceSectionKindV3.options]),
  recordedAt: timestamp, links: z.array(evidenceSpecimenLinkV3),
};
const descriptor = z.object(descriptorShape).strict();
export const evidenceSpecimenSourceV3 = z.object({
  ...identity, sourceId: id, sourceVersion: id, objectVersion: id,
  kind: descriptorShape.kind, recordedAt: timestamp,
  links: z.array(evidenceSpecimenLinkV3), content: z.string().refine(wellFormedText, "Expected well-formed Unicode"),
}).strict();
export type EvidenceSpecimenSourceV3 = z.infer<typeof evidenceSpecimenSourceV3>;

// These union members describe declared specimen links, not a producer's business schema.
export const evidenceSectionV3 = z.discriminatedUnion("status", [
  z.object({ kind: evidenceSectionKindV3, status: z.literal("present"), sourceIds: z.array(id).min(1) }).strict(),
  z.object({
    kind: evidenceSectionKindV3, status: z.literal("absent"),
    reason: z.enum(["not_yet_available", "unpaid", "disputed", "early_disclosed", "late_evidence"]),
  }).strict(),
]);
const lifecycle = z.discriminatedUnion("state", [
  z.object({ state: z.literal("pre_lock") }).strict(),
  z.object({ state: z.literal("post_lock"), lockedAt: timestamp, evidenceCutoff: timestamp }).strict(),
]);
const limitations = [
  "Unbound specimens only; producer provenance and source-section mappings remain held.",
  "Content mapping does not establish the truth of a claim.",
  "Checkpoint trust must be assessed independently.",
  "Evidence integrity does not establish that work occurred or that a debt is valid.",
] as const;
const baseShape = {
  ...identity, binding: z.enum(["unbound-specimen", "synthetic-records"]), lifecycle,
  sections: z.array(evidenceSectionV3),
};
const rawManifest = z.object({
  version: z.literal("evidence-pack-manifest.v3"), ...baseShape,
  entries: z.array(descriptor),
  trustLimitations: z.tuple([z.enum([limitations[0], "Synthetic database records only; no production entitlement or external verification is asserted."]), z.literal(limitations[1]), z.literal(limitations[2]), z.literal(limitations[3])]),
}).strict();
type ManifestShape = z.infer<typeof rawManifest>;
type Link = z.infer<typeof evidenceSpecimenLinkV3>;
const sourceKey = (source: { sourceId: string; sourceVersion: string }) => JSON.stringify([source.sourceId, source.sourceVersion]);
const sameOwner = (a: z.infer<typeof zIdentity>, b: z.infer<typeof zIdentity>) =>
  a.tenantId === b.tenantId && a.jobId === b.jobId && a.caseId === b.caseId;
const zIdentity = z.object(identity);
const reference = (entry: Link): Link => ({
  tenantId: entry.tenantId, jobId: entry.jobId, caseId: entry.caseId,
  sourceId: entry.sourceId, sourceVersion: entry.sourceVersion,
  objectVersion: entry.objectVersion, contentHash: entry.contentHash,
});
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

// Locale-independent UTF-16 code-unit key ordering; preserve strings and source timestamps verbatim.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => compare(a, b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const sortedLinks = (links: Link[]) => [...links].sort((a, b) => compare(canonical(a), canonical(b)));
function sortedManifest(manifest: ManifestShape): ManifestShape {
  return {
    ...manifest,
    entries: manifest.entries.map((entry) => ({ ...entry, links: sortedLinks(entry.links) }))
      .sort((a, b) => compare(sourceKey(a), sourceKey(b))),
    sections: manifest.sections.map((section) => section.status === "present"
      ? { ...section, sourceIds: [...section.sourceIds].sort(compare) } : section)
      .sort((a, b) => compare(a.kind, b.kind)),
  };
}
function declaredIssues(manifest: ManifestShape): string[] {
  const issues: string[] = [];
  const entries = new Map(manifest.entries.map((entry) => [sourceKey(entry), entry]));
  if (entries.size !== manifest.entries.length) issues.push("Duplicate source identity/version");
  // A section's specimen ID is deliberately unambiguous; producer revision identity mapping stays held.
  if (new Set(manifest.entries.map((e) => e.sourceId)).size !== manifest.entries.length) issues.push("Ambiguous specimen source ID");
  if (new Set(manifest.sections.map((s) => s.kind)).size !== manifest.sections.length) issues.push("Duplicate section");
  if (manifest.lifecycle.state === "pre_lock") {
    if (manifest.sections.length || manifest.entries.some((entry) => entry.kind !== "ordinary")) issues.push("Pre-lock section forbidden");
  } else {
    const { evidenceCutoff, lockedAt } = manifest.lifecycle;
    if (evidenceCutoff > lockedAt) issues.push("Contradictory lock/cutoff");
    if (manifest.sections.length !== evidenceSectionKindV3.options.length) issues.push("Missing section lifecycle declaration");
    if (manifest.entries.some((entry) => entry.kind === "source_observations" && entry.recordedAt > evidenceCutoff)) issues.push("Observation after cutoff");
  }
  for (const entry of manifest.entries) {
    if (!sameOwner(manifest, entry)) issues.push("Wrong tenant/job/case");
    if (new Set(entry.links.map(canonical)).size !== entry.links.length) issues.push("Duplicate link");
    for (const link of entry.links) {
      const target = entries.get(sourceKey(link));
      if (!sameOwner(manifest, link) || !target || canonical(reference(target)) !== canonical(link) || sourceKey(entry) === sourceKey(link)) {
        issues.push("Missing or conflicting declared link");
      }
    }
    if (entry.kind !== "ordinary" && !manifest.sections.some((s) => s.kind === entry.kind && s.status === "present" && s.sourceIds.includes(entry.sourceId))) {
      issues.push("Unsectioned source");
    }
  }
  for (const section of manifest.sections) {
    if (section.status !== "present") continue;
    if (new Set(section.sourceIds).size !== section.sourceIds.length) issues.push("Duplicate section link");
    for (const sourceId of section.sourceIds) {
      if (!manifest.entries.some((entry) => entry.sourceId === sourceId && entry.kind === section.kind)) issues.push("Missing or conflicting section source");
    }
  }
  return [...new Set(issues)];
}
export const evidenceManifestV3 = rawManifest.superRefine((manifest, context) => {
  for (const message of declaredIssues(manifest)) context.addIssue({ code: z.ZodIssueCode.custom, message });
});
export type EvidenceManifestV3 = z.infer<typeof evidenceManifestV3>;
export const evidencePackSpecimenInputV3 = z.object({ ...baseShape, sources: z.array(evidenceSpecimenSourceV3) }).strict();
export type EvidencePackSpecimenInput = z.infer<typeof evidencePackSpecimenInputV3>;
export const standaloneEvidencePackV3 = z.object({
  version: z.literal("evidence-pack-export.v3"), mediaType: z.literal("text/plain"),
  banner: z.literal(EVIDENCE_PACK_SANDBOX_BANNER), manifest: evidenceManifestV3,
  sources: z.array(evidenceSpecimenSourceV3),
}).strict();
export class EvidencePackV3Error extends Error {
  readonly code = "EVIDENCE_PACK_V3_INVALID_SPECIMEN";
  constructor() { super("Invalid unbound evidence-pack v3 specimen"); this.name = "EvidencePackV3Error"; }
}
function checked<T>(operation: () => T): T {
  try { return operation(); } catch { throw new EvidencePackV3Error(); }
}
const describeSource = ({ content, ...source }: EvidenceSpecimenSourceV3) => ({ ...source, contentHash: sha256(content) });

export function buildEvidenceManifestV3(input: unknown): EvidenceManifestV3 {
  return checked(() => {
    const { sources, ...base } = evidencePackSpecimenInputV3.parse(input);
    return sortedManifest(evidenceManifestV3.parse({
      ...base, version: "evidence-pack-manifest.v3", entries: sources.map(describeSource), trustLimitations: [base.binding === "synthetic-records" ? "Synthetic database records only; no production entitlement or external verification is asserted." : limitations[0], ...limitations.slice(1)],
    }));
  });
}
export const canonicalManifestV3 = (manifest: EvidenceManifestV3): string =>
  checked(() => canonical(sortedManifest(evidenceManifestV3.parse(manifest))));
export const manifestDigestV3 = (manifest: EvidenceManifestV3): string => sha256(canonicalManifestV3(manifest));

/** Invalid supplied content can be exported for offline negative specimens; verification never filters it. */
export function renderStandalonePackV3(manifest: EvidenceManifestV3, sources: EvidenceSpecimenSourceV3[]): string {
  return checked(() => {
    const pack = standaloneEvidencePackV3.parse({
      version: "evidence-pack-export.v3", mediaType: "text/plain", banner: EVIDENCE_PACK_SANDBOX_BANNER, manifest, sources,
    });
    return canonical({ ...pack, manifest: sortedManifest(pack.manifest), sources: pack.sources
      .map((source) => ({ ...source, links: sortedLinks(source.links) }))
      .sort((a, b) => compare(sourceKey(a), sourceKey(b)) || compare(canonical(a), canonical(b))) });
  });
}

/** The optional digest must arrive through an independently trusted channel. No producer trust is inferred. */
export function verifyStandalonePackV3(text: string, options: { trustedManifestDigest?: string } = {}) {
  const pack = checked(() => standaloneEvidencePackV3.parse(JSON.parse(text)));
  // Exact rendering rejects duplicate JSON keys and alternate readings of the supplied bytes.
  if (text !== renderStandalonePackV3(pack.manifest, pack.sources)) throw new EvidencePackV3Error();
  const findings: string[] = [];
  const supplied = new Map<string, EvidenceSpecimenSourceV3>();
  for (const source of pack.sources) {
    const key = sourceKey(source);
    if (supplied.has(key)) findings.push("Duplicate source identity/version");
    supplied.set(key, source);
  }
  for (const entry of pack.manifest.entries) {
    const actual = supplied.get(sourceKey(entry));
    if (!actual) { findings.push("Missing original source"); continue; }
    if (canonical({ ...describeSource(actual), links: sortedLinks(actual.links) }) !== canonical({ ...entry, links: sortedLinks(entry.links) })) {
      findings.push("Content or source identity mismatch");
    }
  }
  if (pack.sources.some((source) => !pack.manifest.entries.some((entry) => sourceKey(entry) === sourceKey(source)))) findings.push("Unmanifested content");
  const contentMatches = findings.length === 0;
  const manifestHash = manifestDigestV3(pack.manifest);
  const checkpointTrusted = options.trustedManifestDigest !== undefined && digest.safeParse(options.trustedManifestDigest).success && options.trustedManifestDigest === manifestHash;
  if (!checkpointTrusted) findings.push("Checkpoint not independently trusted");
  return {
    findings: [...new Set(findings)], contentMatches, checkpointTrusted,
    specimenIntegrityComplete: contentMatches && checkpointTrusted,
    complete: pack.manifest.binding === "synthetic-records" && contentMatches && checkpointTrusted,
    producerBindings: pack.manifest.binding === "synthetic-records" ? "synthetic-records" as const : "held" as const,
    manifestHash, artifactHash: sha256(text),
  };
}
