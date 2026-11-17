import { z } from "zod";
import { sha256 } from "./evidence-pack.js";

export const RECOVERY_MESSAGE_POLICY = "practice-factual-message.v1" as const;
export const RECOVERY_MESSAGE_CHANGED = "Review the changed message before approving";
const id = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.number().int().positive();
const amount = z.number().int().safe().positive().max(1_000_000_000_000);
export const recoveryMessageRecipientV1 = z.string().email().max(254).endsWith(".invalid");
export const recoveryMessageSourceV1 = z.object({
  caseId: id, jobId: id,
  caseType: z.enum(["withheld_customer_payment", "merchant_overcharge"]),
  caseRevision: revision, amountPence: amount,
  sourceRefs: z.array(z.string().min(1).max(500)).min(1).max(100),
  packId: id, packRevision: revision, manifestHash: hash, attachmentHash: hash,
}).strict();
export type RecoveryMessageSource = z.infer<typeof recoveryMessageSourceV1>;

/** Fixed fictional copy. Source text is never an instruction or template fragment. */
export function buildCanonicalRecoveryMessage(raw: RecoveryMessageSource) {
  const source = recoveryMessageSourceV1.parse(raw);
  const pence = BigInt(source.amountPence);
  const pounds = `${pence / 100n}.${String(pence % 100n).padStart(2, "0")}`;
  const supplier = source.caseType === "merchant_overcharge";
  const message = {
    ...source,
    sender: "practice-builder@example.invalid",
    recipient: supplier ? "practice-supplier@example.invalid" : "practice-customer@example.invalid",
    body: supplier
      ? `Practice message — not sent. Our practice supplier records show £${pounds} net is questioned in this supplier correction case. Please review the attached example supplier records.`
      : `Practice message — not sent. Our practice records show £${pounds} net remains in this case. Please review the attached example records.`,
    currency: "GBP" as const, policyVersion: RECOVERY_MESSAGE_POLICY,
  };
  return { ...message, contentHash: sha256(JSON.stringify(message)) };
}
export type CanonicalRecoveryMessage = ReturnType<typeof buildCanonicalRecoveryMessage>;
export const recoveryMessagePreviewV1 = z.object({
  version: z.literal("recovery-message-preview.v1"), commandId: id,
  expectedCaseRevision: revision, packId: id,
}).strict();
const base = {
  version: z.literal("recovery-message-command.v1"), commandId: id,
  messageId: id, expectedRevision: revision,
};
export const recoveryMessageCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("approve"), recipient: recoveryMessageRecipientV1,
    body: z.string().min(1).max(2000), amountPence: amount, packId: id, contentHash: hash }).strict(),
  z.object({ ...base, action: z.literal("cancel") }).strict(),
  z.object({ ...base, action: z.literal("retry") }).strict(),
  z.object({ ...base, action: z.literal("reconcile") }).strict(),
  z.object({ ...base, action: z.literal("advance"), outcome: z.enum(["success", "retryable", "outcome_unknown"]) }).strict(),
]);
export type RecoveryMessagePreviewCommand = z.infer<typeof recoveryMessagePreviewV1>;
export type RecoveryMessageCommand = z.infer<typeof recoveryMessageCommandV1>;

export function matchesRecoveryMessageApproval(message: CanonicalRecoveryMessage, command: Extract<RecoveryMessageCommand, {action:"approve"}>) {
  return command.recipient === message.recipient && command.body === message.body &&
    command.amountPence === message.amountPence && command.packId === message.packId &&
    command.contentHash === message.contentHash;
}
