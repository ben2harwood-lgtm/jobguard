import { z } from "zod";
const uuid = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const evidencePackCommandV1 = z.object({
  version: z.literal("evidence-pack-command.v1"),
  commandId: uuid,
  format: z.literal("TEXT").default("TEXT"),
}).strict();
export const evidencePackApprovalCommandV1 = z.object({
  version: z.literal("evidence-pack-attachment-approval.v1"),
  commandId: uuid,
  expectedManifestHash: digest,
  expectedContentHash: digest,
}).strict();
export const evidencePackInspectionQueryV1 = z.object({
  scenario: z.enum(["intact", "missing", "tampered", "wrong-version", "checkpoint"]).default("intact"),
}).strict();
export const evidencePackIdV1 = uuid;
