import { z } from "zod";
import { instantV1 } from "./receipt-allocation.js";
import { freezeShadow } from "./shadow-domain/types.js";

const binding = z.object({ tenantId: z.string().uuid(), jobId: z.string().uuid(), evidenceId: z.string().uuid(), objectVersionId: z.string().min(1).max(300), sha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
const historicalTime = z.string().max(200).nullable();
const provenanceFields = {
  binding, adoptedAt: historicalTime, sourceOccurredAt: historicalTime, receivedAt: historicalTime,
  historyContradictory: z.boolean(),
};
const result = z.object({
  version: z.literal("imported-evidence-provenance-result.v1"), ...provenanceFields,
  classification: z.enum(["pre_adoption_evidence", "not_pre_adoption_by_timing", "timing_unresolved"]),
  permanentExclusion: z.boolean(), positiveEligibility: z.enum(["held", "not_asserted"]),
}).strict().superRefine((v, ctx) => {
  if (v.permanentExclusion !== (v.classification === "pre_adoption_evidence") || (v.positiveEligibility === "held") !== (v.classification === "timing_unresolved"))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent provenance candidate" });
});
export const importedEvidenceProvenanceV1 = z.object({ version: z.literal("imported-evidence-provenance.v1"), ...provenanceFields, prior: result.nullable() }).strict();
export type ImportedEvidenceProvenanceResult = z.infer<typeof result>;
export class ImportProvenanceError extends Error {
  constructor(public readonly code: "INVALID_IMPORT_PROVENANCE" | "IMPORT_PROVENANCE_BINDING_MISMATCH") { super(code); this.name = "ImportProvenanceError"; }
}

/** Exact microsecond-or-better instants only. Reduced precision is a hold, never rounded up. */
function exactInstant(raw: string | null): bigint | null {
  if (raw === null || !instantV1.safeParse(raw).success) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6,9})(Z|[+-]\d{2}:?\d{2})$/u.exec(raw);
  // RFC3339 -00:00 denotes an unknown local offset.
  if (!m || /-00:?00$/u.test(raw)) return null;
  const part = (n: number) => BigInt(m[n]!);
  const month = part(2), year = part(1) + 400n - (month <= 2n ? 1n : 0n);
  const era = year / 400n, y = year - era * 400n;
  const day = (153n * (month > 2n ? month - 3n : month + 9n) + 2n) / 5n + part(3) - 1n;
  const days = era * 146097n + y * 365n + y / 4n - y / 100n + day;
  const zone = m[8]!, digits = zone.slice(1).replace(":", "");
  const offset = zone === "Z" ? 0n : (zone.startsWith("-") ? -1n : 1n) * (BigInt(digits.slice(0, 2)) * 3600n + BigInt(digits.slice(2)) * 60n);
  return (days * 86400n + part(4) * 3600n + part(5) * 60n + part(6) - offset) * 1000000000n + BigInt(m[7]!.padEnd(9, "0"));
}

/** A pure exclusion proposal. Caller must load authentic immutable history; parsing authenticates nobody. */
export function classifyImportedEvidenceProvenance(raw: unknown): Readonly<ImportedEvidenceProvenanceResult> {
  const parsed = importedEvidenceProvenanceV1.safeParse(raw);
  if (!parsed.success) throw new ImportProvenanceError("INVALID_IMPORT_PROVENANCE");
  const { prior, version: _version, ...facts } = parsed.data;
  if (prior && (Object.entries(facts.binding).some(([key, value]) => prior.binding[key as keyof typeof binding._type] !== value) ||
    (prior.adoptedAt !== facts.adoptedAt && (exactInstant(prior.adoptedAt) === null || exactInstant(prior.adoptedAt) !== exactInstant(facts.adoptedAt)))))
    throw new ImportProvenanceError("IMPORT_PROVENANCE_BINDING_MISMATCH");
  const source = exactInstant(facts.sourceOccurredAt), adoption = exactInstant(facts.adoptedAt), received = exactInstant(facts.receivedAt);
  const resolved = source !== null && adoption !== null && received !== null && !facts.historyContradictory && source <= received;
  const classification = prior?.permanentExclusion ? "pre_adoption_evidence" : !resolved || source === adoption ? "timing_unresolved" : source! < adoption! ? "pre_adoption_evidence" : "not_pre_adoption_by_timing";
  return freezeShadow({ version: "imported-evidence-provenance-result.v1", ...facts, classification,
    permanentExclusion: classification === "pre_adoption_evidence", positiveEligibility: classification === "timing_unresolved" ? "held" : "not_asserted" });
}
