import { z } from "zod";

export const CAPTURE_CONTRACT_VERSION = "job_capture_v1" as const;
export const CAPTURE_PROMPT_VERSION = "job-record-proposal-v1" as const;
export const CAPTURE_SCHEMA_VERSION = "job-record-proposal-v1" as const;

export const sourceSpanV1 = z.object({
  sourceId: z.string().min(1), sourceVersion: z.literal(1), start: z.number().int().nonnegative(), end: z.number().int().positive(),
});
export const provenanceV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("extracted"), span: sourceSpanV1 }),
  z.object({ kind: z.enum(["inferred", "defaulted", "human_supplied"]), note: z.string().min(1).max(300) }),
]);
const field = <T extends z.ZodTypeAny>(value: T) => z.object({ value, provenance: provenanceV1 });
export const proposedScopeLineV1 = z.object({
  description: field(z.string().min(1).max(500)),
  quantity: field(z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/u).nullable()),
  unit: field(z.string().min(1).max(40).nullable()),
  unitPricePence: field(z.number().int().nonnegative().nullable()),
});
export const jobRecordProposalV1 = z.object({
  title: field(z.string().min(1).max(200)),
  lines: z.array(proposedScopeLineV1).min(1),
  materials: z.array(z.object({ description: field(z.string().min(1).max(300)) })),
  questions: z.array(z.object({ question: field(z.string().min(1).max(500)) })),
});
export const captureRequestV1 = z.object({
  contractVersion: z.literal(CAPTURE_CONTRACT_VERSION), requested_tenant_id: z.guid({ error: "Invalid uuid" }),
  captureId: z.guid({ error: "Invalid uuid" }), source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), text: z.string().min(1).max(50_000) }),
    z.object({ kind: z.literal("browser_local_transcript"), text: z.string().min(1).max(50_000), acquisition: z.object({
      contractVersion: z.literal("browser_local_dictation_v1"), language: z.literal("en-GB"), processLocally: z.literal(true),
      audioUploaded: z.literal(false), audioStored: z.literal(false), rawFinalText: z.string().min(1).max(50_000), humanEdited: z.boolean(),
    }) }),
  ]),
  fixtureId: z.string().min(1).max(100),
});
export type JobRecordProposal = z.infer<typeof jobRecordProposalV1>;

/** Text suggestions only: no identity, permission or registry lookup. Offsets are
 * UTF-16 indices into the original source. Ambiguous clauses fail closed. */
export function suggestCapturePartyClause(text: string): {
  start: number; end: number;
  customer: { text: string; start: number; end: number };
  site: { text: string; start: number; end: number };
} | null {
  const clauses = [...text.matchAll(/\bfor\s+([^,;!?\r\n]+?)\s+at\s+/giu)];
  if (clauses.length !== 1) return null;
  const clause = clauses[0]!;
  const name = clause[1]!;
  // A deliberately narrow name and numbered street, never an email or a price.
  if (!/^(?:(?:Mr|Mrs|Ms|Dr)\.?\s+)?\p{Lu}[\p{L}'’-]*(?:\s+\p{Lu}[\p{L}'’-]*){0,3}$/u.test(name)) return null;
  const siteStart = clause.index + clause[0].length;
  const tail = text.slice(siteStart).split(/[,.;!?\r\n]|\s+(?:and\s+)?(?:two coats|\w+\s+coats|woodwork|in gloss|should|about|around|roughly|approximately|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:pounds|quid|days?|weeks?)|£|rip|remove|fit|tile|paint|install|new)\b/iu)[0]!.trimEnd();
  if (!/^\d+[A-Za-z]?\s+\p{Lu}[\p{L}\p{N}'’ -]{1,100}$/u.test(tail)
    || /\b(?:for|at|and|or)\b/iu.test(tail)) return null;
  const customerStart = clause.index + clause[0].indexOf(name);
  return { start: clause.index, end: siteStart + tail.length,
    customer: { text: name, start: customerStart, end: customerStart + name.length },
    site: { text: tail, start: siteStart, end: siteStart + tail.length } };
}
