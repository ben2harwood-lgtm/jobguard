import { createHash } from "node:crypto";
import { outboundActionV1Schema, type OutboundAction } from "@jobguard/db";
import { z } from "zod";

const emailOutcomeV1 = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("delivered"), receipt: z.string().min(1).max(300) }),
  z.strictObject({ kind: z.literal("rejected") }),
  z.strictObject({ kind: z.literal("retryable") }),
  z.strictObject({ kind: z.literal("outcome_unknown") }),
]);
export type EmailDeliveryOutcome = z.infer<typeof emailOutcomeV1>;
export type CommercialEmail = Readonly<Pick<OutboundAction, "id" | "providerEffectKey" | "recipient" | "immutableContent">>;

export interface CommercialEmailDelivery {
  deliver(email: CommercialEmail): Promise<EmailDeliveryOutcome>;
}

export interface CommercialEmailOutbox {
  /**
   * Atomically claim due email work by ID after checking the outbound stop and exact, current approval.
   * The claim must commit before delivery. Terminal and unknown work is unclaimable.
   */
  claimApprovedEmail(actionId: string): Promise<{ action: OutboundAction; attemptId: string } | undefined>;
  /** Persist the outcome against the claim token. Unknown work needs reconciliation before retry. */
  completeEmailAttempt(actionId: string, attemptId: string, outcome: EmailDeliveryOutcome): Promise<void>;
}

export class CommercialEmailBlocked extends Error {
  constructor(readonly code: "EMAIL_ADAPTER_UNAVAILABLE" | "EMAIL_APPROVAL_UNAVAILABLE" | "EMAIL_ACTION_MISMATCH") {
    super(code);
  }
}

/** Receives only a queue identifier. Routing and the artifact come from the server and outbox. */
export async function dispatchCommercialEmail(
  mode: string | undefined,
  rawActionId: unknown,
  outbox: CommercialEmailOutbox,
  adapter?: CommercialEmailDelivery,
): Promise<EmailDeliveryOutcome> {
  if (mode !== "synthetic_demo" || process.env.JOBGUARD_ENV === "pilot_no_charge" || !adapter) {
    throw new CommercialEmailBlocked("EMAIL_ADAPTER_UNAVAILABLE");
  }
  const actionId = z.guid().parse(rawActionId);
  const claim = await outbox.claimApprovedEmail(actionId);
  if (!claim) throw new CommercialEmailBlocked("EMAIL_APPROVAL_UNAVAILABLE");
  const parsed = outboundActionV1Schema.safeParse(claim.action);
  if (!parsed.success) throw new CommercialEmailBlocked("EMAIL_ACTION_MISMATCH");
  const { id, adapter: route, providerEffectKey, recipient, immutableContent, contentHash, authorizationExpiresAt } = parsed.data;
  if (id !== actionId || route !== "fake_email" || !recipient || authorizationExpiresAt.getTime() <= Date.now()
      || createHash("sha256").update(immutableContent).digest("hex") !== contentHash) {
    throw new CommercialEmailBlocked("EMAIL_ACTION_MISMATCH");
  }

  let outcome: EmailDeliveryOutcome;
  try {
    outcome = emailOutcomeV1.parse(await adapter.deliver(Object.freeze({ id, providerEffectKey, recipient, immutableContent })));
  } catch {
    outcome = { kind: "outcome_unknown" };
  }
  await outbox.completeEmailAttempt(actionId, claim.attemptId, outcome);
  return outcome;
}
