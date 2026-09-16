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
  contractVersion: z.literal(CAPTURE_CONTRACT_VERSION), requested_tenant_id: z.string().uuid(),
  captureId: z.string().uuid(), source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), text: z.string().min(1).max(50_000) }),
    z.object({ kind: z.literal("browser_local_transcript"), text: z.string().min(1).max(50_000), acquisition: z.object({
      contractVersion: z.literal("browser_local_dictation_v1"), language: z.literal("en-GB"), processLocally: z.literal(true),
      audioUploaded: z.literal(false), audioStored: z.literal(false), rawFinalText: z.string().min(1).max(50_000), humanEdited: z.boolean(),
    }) }),
  ]),
  fixtureId: z.string().min(1).max(100),
});
export type JobRecordProposal = z.infer<typeof jobRecordProposalV1>;
