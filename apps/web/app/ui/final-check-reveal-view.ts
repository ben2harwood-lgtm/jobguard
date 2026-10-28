import { z } from "zod";
import { FINAL_CHECK_EMPTY_TEXT, FINAL_CHECK_RUNNING_TEXT } from "@jobguard/core";

const uuid = z.string().uuid();
const evidence = z.object({ id: uuid, receivedAt: z.string(), source: z.string().nullable().optional(), evidenceAfterLock: z.boolean().optional() }).passthrough();
const item = z.object({
 signalId: uuid, signalRevision: z.number().int().nonnegative(), description: z.string(), evidence: z.array(evidence).nullable(),
 comparisons: z.object({ lockedLineIds: z.array(uuid), baselineItemIds: z.array(uuid) }).passthrough(),
 disposition: z.string().nullable(), answer: z.string().nullable(),
}).passthrough();
const postLockItem = z.object({ signalId: uuid, description: z.string(), evidence: z.array(evidence).nullable() }).passthrough();
const lockedLine = z.object({ id: uuid, kind: z.enum(["baseline", "variation"]), scopeItemId: uuid, description: z.string() }).strict();
export const finalCheckReadV1 = z.object({
 state: z.enum(["unlocked", "pending", "failed", "completed"]), lockId: uuid.optional(), runId: uuid.optional(),
 items: z.array(item), postLockItems: z.array(postLockItem).optional(), lockedLines: z.array(lockedLine).optional(), message: z.string().nullable().optional(),
}).passthrough();
export type FinalCheckRead = z.infer<typeof finalCheckReadV1>;
export type RevealItem = z.infer<typeof item>;
export type LockedLine = z.infer<typeof lockedLine>;
export type RevealAnswer = "already_included" | "in_original_scope" | "not_completed" | "not_chargeable" | "wrong_job_or_evidence";

export const answerLabels: Readonly<Record<RevealAnswer, string>> = {
 already_included: "Already included", in_original_scope: "In the original quote", not_completed: "Not done",
 not_chargeable: "Not chargeable", wrong_job_or_evidence: "Wrong job or evidence",
};
export const dispositionLabels: Readonly<Record<string, string>> = {
 already_included: "Already included in a locked line", in_original_scope: "Part of the original quote",
 not_completed: "Not done", not_chargeable: "Not chargeable", wrong_job_or_evidence: "Wrong job or evidence",
 attribution_disputed: "Disputed: paused with no fee until an independent review exists",
 confirmed_extra: "Yes, extra work: added to your extras as a draft. Price and approve it there; nothing is charged until your customer approves",
};

/** Screen state only; every answer is checked again by the server. */
export function revealStatus(read: FinalCheckRead): string {
 if (read.state === "unlocked") return "JobGuard's final check runs after you complete the final account.";
 if (read.state === "pending") return FINAL_CHECK_RUNNING_TEXT;
 if (read.state === "failed") return "The final check could not finish. Nothing is shown until it does.";
 return read.items.length === 0 ? FINAL_CHECK_EMPTY_TEXT : `JobGuard's final check found ${read.items.length === 1 ? "1 thing" : `${read.items.length} things`} that may be missing from your bill.`;
}

/** "Already included" may point at any locked line; "in the original quote" names a baseline scope item. */
export function referenceChoices(answer: RevealAnswer, lines: readonly LockedLine[]): { value: string; label: string }[] {
 if (answer === "already_included") return lines.map(line => ({ value: line.id, label: line.description }));
 if (answer === "in_original_scope") return lines.filter(line => line.kind === "baseline").map(line => ({ value: line.scopeItemId, label: line.description }));
 return [];
}

export function dispositionCommand(read: FinalCheckRead, revealed: RevealItem, answer: RevealAnswer, referenceId: string | null, commandId: string) {
 return { version: "final-check.disposition.v1" as const, commandId, lockId: read.lockId!, runId: read.runId!, signalId: revealed.signalId,
  expectedSignalRevision: revealed.signalRevision, answer, referenceId: answer === "already_included" || answer === "in_original_scope" ? referenceId : null };
}

export function catchCommand(read: FinalCheckRead, revealed: RevealItem, commandId: string) {
 return { version: "final-check.catch.v1" as const, commandId, lockId: read.lockId!, runId: read.runId!, signalId: revealed.signalId, expectedSignalRevision: revealed.signalRevision };
}
