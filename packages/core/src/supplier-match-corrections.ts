import { z } from "zod";
import { matchSupplierLines, supplierLineMatchInputV1, type SupplierLineMatchInput } from "./supplier-line-matching.js";

const uuid = z.guid().transform(value => value.toLowerCase());
export const supplierLineCorrectionV1 = z.object({
  version: z.literal("supplier-line-correction.v1"), commandId: uuid, snapshotId: uuid,
  expectedRevision: z.number().int().nonnegative().max(2_147_483_646),
  sourceVersionId: uuid, orderVersionId: uuid.nullable(),
}).strict();
export type SupplierLineCorrection = z.infer<typeof supplierLineCorrectionV1>;
export class SupplierMatchCorrectionError extends Error {
  constructor(readonly code: "INVALID_CORRECTION" | "MATCH_REVISION_CONFLICT" | "MATCH_NOT_FOUND"
    | "MATCH_SOURCE_VERSION_CONFLICT" | "MATCH_FORBIDDEN" | "MATCH_SCOPE_CONFLICT" | "MATCH_IDEMPOTENCY_CONFLICT") {
    super(code); this.name = "SupplierMatchCorrectionError";
  }
}

/** Replace only one mapping. Null withdraws it, restoring deterministic unresolved matching.
 * Authorization and immutable approval references come from the stored command, never source text. */
export function correctSupplierLineMapping(rawFacts: unknown, raw: unknown, approvalRef: string): SupplierLineMatchInput {
  const facts = supplierLineMatchInputV1.parse(rawFacts), parsed = supplierLineCorrectionV1.safeParse(raw);
  if (!parsed.success) throw new SupplierMatchCorrectionError("INVALID_CORRECTION");
  const correction = parsed.data;
  if (![...facts.receipts, ...facts.bills].some(row => row.versionId === correction.sourceVersionId)
    || (correction.orderVersionId !== null && !facts.orders.some(row => row.versionId === correction.orderVersionId)))
    throw new SupplierMatchCorrectionError("MATCH_SOURCE_VERSION_CONFLICT");
  facts.mappings = facts.mappings.filter(mapping => mapping.sourceVersionId !== correction.sourceVersionId);
  if (correction.orderVersionId !== null) facts.mappings.push({ sourceVersionId: correction.sourceVersionId,
    orderVersionId: correction.orderVersionId, approvalRef });
  // Reuse all source/pack/duplicate constraints; a mapping is never a duplicate override.
  matchSupplierLines(facts);
  return facts;
}
