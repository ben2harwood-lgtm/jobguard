import { z } from "zod";
import { sha256 } from "./evidence-pack.js";

/**
 * M4-5-S: a factual, source-bound practice message about a recovery case.
 *
 * Pure domain code. The text is fixed fictional copy chosen by case type; source records, labels and
 * user text are never interpolated into it, so nothing recorded or typed can become an instruction,
 * a deadline, a threat or a recipient. The message is practice-only: recipients end `.invalid` and the
 * only adapter anywhere is a deterministic fake.
 */
export const RECOVERY_MESSAGE_POLICY = "practice-factual-message.v1" as const;
export const RECOVERY_MESSAGE_ACTION = "recovery.message.simulate" as const;
export const RECOVERY_MESSAGE_CHANGED = "Review the changed message before approving";
export const RECOVERY_MESSAGE_SENDER = "practice-builder@example.invalid" as const;
export const RECOVERY_MESSAGE_RECIPIENTS = {
  withheld_customer_payment: "practice-customer@example.invalid",
  merchant_overcharge: "practice-supplier@example.invalid",
} as const;

const id = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.number().int().safe().positive();
const amount = z.number().int().safe().positive().max(1_000_000_000_000);
export const recoveryMessageCaseTypeV1 = z.enum(["withheld_customer_payment", "merchant_overcharge"]);
export type RecoveryMessageCaseType = z.infer<typeof recoveryMessageCaseTypeV1>;
/** A practice recipient is always a fictional `.invalid` mailbox; a real address can never validate. */
export const recoveryMessageRecipientV1 = z.string().max(254).regex(/^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.invalid$/u);

export const recoveryMessageSourceV1 = z.object({
  caseId: id, jobId: id, caseType: recoveryMessageCaseTypeV1, caseRevision: revision, amountPence: amount,
  sourceRefs: z.array(z.string().min(1).max(500)).min(1).max(100),
  packId: id, packRevision: revision, manifestHash: digest, attachmentHash: digest,
}).strict();
export type RecoveryMessageSource = z.infer<typeof recoveryMessageSourceV1>;

/** Exact pounds to two decimals, with thousands grouping, from integer pence. No floating point. */
export function formatRecoveryMessagePounds(pence: number): string {
  const checked = z.number().int().safe().nonnegative().parse(pence);
  const whole = BigInt(checked) / 100n, minor = BigInt(checked) % 100n;
  return `${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ",")}.${minor.toString().padStart(2, "0")}`;
}

export function recoveryMessageBody(caseType: RecoveryMessageCaseType, amountPence: number): string {
  const pounds = formatRecoveryMessagePounds(amountPence);
  return caseType === "merchant_overcharge"
    ? `Practice message — not sent. Our practice supplier records show £${pounds} net is questioned in this supplier correction case. Please review the attached example supplier records.`
    : `Practice message — not sent. Our practice records show £${pounds} net remains in this case. Please review the attached example records.`;
}

const contentV1 = z.object({
  version: z.literal("recovery-message.v1"),
  caseId: id, jobId: id, caseType: recoveryMessageCaseTypeV1, caseRevision: revision, amountPence: amount, currency: z.literal("GBP"),
  sourceRefs: z.array(z.string().min(1).max(500)).min(1).max(100),
  packId: id, packRevision: revision, manifestHash: digest, attachmentHash: digest,
  sender: z.literal(RECOVERY_MESSAGE_SENDER), recipient: recoveryMessageRecipientV1, body: z.string().min(1).max(2000),
  policyVersion: z.literal(RECOVERY_MESSAGE_POLICY),
}).strict();
export type RecoveryMessageContent = z.infer<typeof contentV1>;
export type RecoveryMessage = RecoveryMessageContent & { immutableContent: string; contentHash: string };

/** Builds the canonical message. `immutableContent` is the exact text delivered and hashed. */
export function buildRecoveryMessage(raw: RecoveryMessageSource): RecoveryMessage {
  const source = recoveryMessageSourceV1.parse(raw);
  // Key order is fixed here, so the serialized text and its hash are deterministic.
  const content: RecoveryMessageContent = {
    version: "recovery-message.v1", caseId: source.caseId, jobId: source.jobId, caseType: source.caseType, caseRevision: source.caseRevision,
    amountPence: source.amountPence, currency: "GBP", sourceRefs: [...source.sourceRefs], packId: source.packId, packRevision: source.packRevision,
    manifestHash: source.manifestHash, attachmentHash: source.attachmentHash, sender: RECOVERY_MESSAGE_SENDER,
    recipient: RECOVERY_MESSAGE_RECIPIENTS[source.caseType], body: recoveryMessageBody(source.caseType, source.amountPence),
    policyVersion: RECOVERY_MESSAGE_POLICY,
  };
  const immutableContent = JSON.stringify(content);
  return { ...content, immutableContent, contentHash: sha256(immutableContent) };
}

export function recoveryMessageSourceOf(message: RecoveryMessageContent): RecoveryMessageSource {
  return {
    caseId: message.caseId, jobId: message.jobId, caseType: message.caseType, caseRevision: message.caseRevision, amountPence: message.amountPence,
    sourceRefs: [...message.sourceRefs], packId: message.packId, packRevision: message.packRevision, manifestHash: message.manifestHash, attachmentHash: message.attachmentHash,
  };
}

/** Structural parse only; use `verifyRecoveryMessageContent` before trusting stored text. */
export function parseRecoveryMessageContent(text: string): RecoveryMessageContent {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("RECOVERY_MESSAGE_CONTENT_INVALID"); }
  const parsed = contentV1.safeParse(value);
  if (!parsed.success) throw new Error("RECOVERY_MESSAGE_CONTENT_INVALID");
  return parsed.data;
}

/** Content must be exactly what the canonical builder produces for its own source fields, and hash to `contentHash`. */
export function verifyRecoveryMessageContent(immutableContent: string, contentHash: string): RecoveryMessage {
  const parsed = parseRecoveryMessageContent(immutableContent);
  const rebuilt = buildRecoveryMessage(recoveryMessageSourceOf(parsed));
  if (rebuilt.immutableContent !== immutableContent || rebuilt.contentHash !== contentHash) throw new Error("RECOVERY_MESSAGE_CONTENT_INVALID");
  return rebuilt;
}

export const recoveryMessagePreviewCommandV1 = z.object({
  version: z.literal("recovery-message-preview.v1"), commandId: id, expectedCaseRevision: revision, packId: id,
}).strict();
export type RecoveryMessagePreviewCommand = z.infer<typeof recoveryMessagePreviewCommandV1>;

export const recoveryMessageOutcomesV1 = ["success", "response_lost", "no_response", "definite_failure"] as const;
const base = { version: z.literal("recovery-message-command.v1"), commandId: id, messageId: id, expectedRevision: revision };
export const recoveryMessageCommandV1 = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("approve"), recipient: recoveryMessageRecipientV1, body: z.string().min(1).max(2000), amountPence: amount, packId: id, contentHash: digest }).strict(),
  z.object({ ...base, action: z.literal("revoke") }).strict(),
  z.object({ ...base, action: z.literal("advance"), outcome: z.enum(recoveryMessageOutcomesV1) }).strict(),
  z.object({ ...base, action: z.literal("reconcile") }).strict(),
]);
export type RecoveryMessageCommand = z.infer<typeof recoveryMessageCommandV1>;

export function matchesRecoveryMessageApproval(
  message: Pick<RecoveryMessage, "recipient" | "body" | "amountPence" | "packId" | "contentHash">,
  command: Extract<RecoveryMessageCommand, { action: "approve" }>,
): boolean {
  return command.recipient === message.recipient && command.body === message.body && command.amountPence === message.amountPence &&
    command.packId === message.packId && command.contentHash === message.contentHash;
}

export const RECOVERY_MESSAGE_EVENT_KINDS = [
  "previewed", "approved", "revoked", "started", "succeeded", "retryable", "failed", "outcome_unknown", "reconcile_started", "reconciled", "blocked",
] as const;
export type RecoveryMessageEventKind = (typeof RECOVERY_MESSAGE_EVENT_KINDS)[number];

export const RECOVERY_MESSAGE_EVENT_LABELS: Readonly<Record<RecoveryMessageEventKind, string>> = {
  previewed: "Previewed — nothing authorized",
  approved: "Approved this exact message",
  revoked: "Approval revoked",
  started: "Practice delivery started",
  succeeded: "Recorded by the practice provider — nothing sent",
  retryable: "Not delivered — safe to try again",
  failed: "Not delivered — retries used up",
  outcome_unknown: "Outcome unknown — check needed",
  reconcile_started: "Check requested",
  reconciled: "Check found the single practice record",
  blocked: "Blocked — the message or its evidence changed",
};

export const RECOVERY_MESSAGE_STATUSES = [
  "previewed", "queued", "executing", "simulated_delivery", "outcome_unknown", "retryable", "failed", "revoked", "blocked",
] as const;
export type RecoveryMessageStatus = (typeof RECOVERY_MESSAGE_STATUSES)[number];
export const RECOVERY_MESSAGE_STATUS_LABELS: Readonly<Record<RecoveryMessageStatus, string>> = {
  previewed: "Preview only — awaiting your approval",
  queued: "Approved — queued, nothing sent",
  executing: "Delivery in progress — check again shortly",
  simulated_delivery: "Simulated delivery — nothing sent",
  outcome_unknown: "Outcome unknown — check needed",
  retryable: "Delivery failed — nothing sent, safe to try again",
  failed: "Delivery failed repeatedly — nothing sent",
  revoked: "Approval revoked — nothing sent",
  blocked: "Blocked — the message or its evidence changed; nothing sent",
};

/** The outbox row is the authority on delivery; events are history. An unapproved message is only a preview. */
export function deriveRecoveryMessageStatus(input: { approved: boolean; outboxStatus: string | null; revoked: boolean }): RecoveryMessageStatus {
  if (!input.approved || input.outboxStatus === null) return "previewed";
  switch (input.outboxStatus) {
    case "pending": return "queued";
    case "executing": return "executing";
    case "succeeded": return "simulated_delivery";
    case "outcome_unknown": return "outcome_unknown";
    case "retryable": return "retryable";
    case "dead_letter": return "failed";
    case "cancelled": return input.revoked ? "revoked" : "blocked";
    default: return "blocked";
  }
}
