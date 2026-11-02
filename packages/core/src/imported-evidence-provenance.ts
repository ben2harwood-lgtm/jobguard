import { z } from "zod";
import { instantV1 } from "./receipt-allocation.js";
// Local JSON-only freezer keeps this leaf independent of shadow/fee modules.
function freeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const uuid = z.string().uuid().refine(v => v !== "00000000-0000-0000-0000-000000000000", "Nil is not an identity").transform(v => v.toLowerCase());

const binding = z.object({ tenantId: uuid, jobId: uuid, evidenceId: uuid, objectVersionId: z.string().min(1).max(300), sha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
const historicalTime = z.string().max(200).nullable();
const provenanceFields = {
  binding, adoptedAt: historicalTime, sourceOccurredAt: historicalTime, receivedAt: historicalTime,
  historyContradictory: z.boolean(),
};
const result = z.object({
  version: z.literal("imported-evidence-provenance-result.v1"), ...provenanceFields,
  classification: z.enum(["pre_adoption_evidence", "not_pre_adoption_by_timing", "timing_unresolved"]),
  holdReason: z.enum(["missing_time", "invalid_time", "contradictory_history", "source_after_receipt", "equal_time", "precision_overlap", "prior_metadata_changed"]).nullable(),
  permanentExclusion: z.boolean(), positiveEligibility: z.enum(["held", "not_asserted"]),
}).strict().superRefine((v, ctx) => {
  if ((v.holdReason !== null) !== (v.classification === "timing_unresolved") || v.permanentExclusion !== (v.classification === "pre_adoption_evidence") || (v.positiveEligibility === "held") !== (v.classification === "timing_unresolved"))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent provenance candidate" });
});
export const importedEvidenceProvenanceV1 = z.object({ version: z.literal("imported-evidence-provenance.v1"), ...provenanceFields, prior: result.nullable() }).strict();
export type ImportedEvidenceProvenanceResult = z.infer<typeof result>;
export class ImportProvenanceError extends Error {
  constructor(public readonly code: "INVALID_IMPORT_PROVENANCE" | "IMPORT_PROVENANCE_BINDING_MISMATCH") { super(code); this.name = "ImportProvenanceError"; }
}

/** Half-open uncertainty interval at the supplied decimal precision; no rounding. */
function timeRange(raw: string | null): { start: bigint; end: bigint } | null {
  if (raw === null || !instantV1.safeParse(raw).success) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})$/u.exec(raw);
  // RFC3339 -00:00 denotes an unknown local offset.
  if (!m || /-00:?00$/u.test(raw)) return null;
  const part = (n: number) => BigInt(m[n]!);
  const month = part(2), year = part(1) + 400n - (month <= 2n ? 1n : 0n);
  const era = year / 400n, y = year - era * 400n;
  const day = (153n * (month > 2n ? month - 3n : month + 9n) + 2n) / 5n + part(3) - 1n;
  const days = era * 146097n + y * 365n + y / 4n - y / 100n + day;
  const zone = m[8]!, digits = zone.slice(1).replace(":", "");
  const offset = zone === "Z" ? 0n : (zone.startsWith("-") ? -1n : 1n) * (BigInt(digits.slice(0, 2)) * 3600n + BigInt(digits.slice(2)) * 60n);
  const start = (days * 86400n + part(4) * 3600n + part(5) * 60n + part(6) - offset) * 1000000000n + BigInt((m[7] ?? "").padEnd(9, "0"));
  return { start, end: start + 10n ** BigInt(9 - (m[7]?.length ?? 0)) };
}

function sameTime(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  const x = timeRange(a), y = timeRange(b);
  return x !== null && y !== null && x.start === y.start && x.end === y.end;
}
/** A pure exclusion proposal. Caller must load authentic immutable history; parsing authenticates nobody. */
export function classifyImportedEvidenceProvenance(raw: unknown): Readonly<ImportedEvidenceProvenanceResult> {
  const parsed = importedEvidenceProvenanceV1.safeParse(raw);
  if (!parsed.success) throw new ImportProvenanceError("INVALID_IMPORT_PROVENANCE");
  const { prior, version: _version, ...facts } = parsed.data;
  if (prior && (Object.entries(facts.binding).some(([key, value]) => prior.binding[key as keyof z.infer<typeof binding>] !== value) || !sameTime(prior.adoptedAt, facts.adoptedAt)))
    throw new ImportProvenanceError("IMPORT_PROVENANCE_BINDING_MISMATCH");
  const source = timeRange(facts.sourceOccurredAt), adoption = timeRange(facts.adoptedAt), received = timeRange(facts.receivedAt);
  let holdReason: ImportedEvidenceProvenanceResult["holdReason"] = null;
  if (prior?.holdReason === "prior_metadata_changed" || (prior && (!sameTime(prior.sourceOccurredAt, facts.sourceOccurredAt) || !sameTime(prior.receivedAt, facts.receivedAt) || prior.historyContradictory !== facts.historyContradictory))) holdReason = "prior_metadata_changed";
  else if (facts.historyContradictory) holdReason = "contradictory_history";
  else if ([facts.sourceOccurredAt, facts.adoptedAt, facts.receivedAt].includes(null)) holdReason = "missing_time";
  else if (!source || !adoption || !received) holdReason = "invalid_time";
  else if (source.start > received.start) holdReason = "source_after_receipt";
  else if (source.start === adoption.start) holdReason = "equal_time";
  else if (source.end > adoption.start && source.start < adoption.end) holdReason = "precision_overlap";
  const classification = prior?.permanentExclusion ? "pre_adoption_evidence" : holdReason ? "timing_unresolved" : source!.end <= adoption!.start ? "pre_adoption_evidence" : "not_pre_adoption_by_timing";
  return freeze({ version: "imported-evidence-provenance-result.v1", ...facts, classification,
    holdReason: classification === "timing_unresolved" ? holdReason : null,
    permanentExclusion: classification === "pre_adoption_evidence", positiveEligibility: classification === "timing_unresolved" ? "held" : "not_asserted" });
}
