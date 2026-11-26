import { createHash } from "node:crypto";
import { commercialEmailEnabled } from "@jobguard/config";
import { outboundActionV1Schema, type OutboundAdapter, type OutboundAction } from "@jobguard/db";
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
  deliver(email: CommercialEmail, signinLink?: string): Promise<EmailDeliveryOutcome>;
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
  if (!commercialEmailEnabled(mode, process.env) || !adapter) {
    throw new CommercialEmailBlocked("EMAIL_ADAPTER_UNAVAILABLE");
  }
  const actionId = z.guid().parse(rawActionId);
  const claim = await outbox.claimApprovedEmail(actionId);
  if (!claim) throw new CommercialEmailBlocked("EMAIL_APPROVAL_UNAVAILABLE");
  const parsed = outboundActionV1Schema.safeParse(claim.action);
  if (!parsed.success) throw new CommercialEmailBlocked("EMAIL_ACTION_MISMATCH");
  const { id, adapter: route, providerEffectKey, recipient, immutableContent, contentHash, authorizationExpiresAt } = parsed.data;
  if (id !== actionId || route !== "fake_email" || !recipient || !fixtureEmailRecipient(parsed.data) || authorizationExpiresAt.getTime() <= Date.now()
      || createHash("sha256").update(immutableContent).digest("hex") !== contentHash) {
    throw new CommercialEmailBlocked("EMAIL_ACTION_MISMATCH");
  }

  const outcome = await deliverEmail(adapter, { id, providerEffectKey, recipient, immutableContent });
  await outbox.completeEmailAttempt(actionId, claim.attemptId, outcome);
  return outcome;
}

async function deliverEmail(adapter: CommercialEmailDelivery, email: CommercialEmail, signinLink?: string): Promise<EmailDeliveryOutcome> {
  try {
    const request = Object.freeze(email);
    return emailOutcomeV1.parse(await (signinLink === undefined ? adapter.deliver(request) : adapter.deliver(request, signinLink)));
  } catch {
    return { kind: "outcome_unknown" };
  }
}

const fixtureAddress = z.email().refine(email => email.toLowerCase().endsWith(".invalid"));

export function fixtureEmailRecipient(action: Readonly<OutboundAction>): boolean {
  return action.recipient !== null && isFictionalEmailRecipient(action.recipient, action.actionType === "quote.send");
}

export function isFictionalEmailRecipient(recipient: string, multiple = recipient.startsWith("[")): boolean {
  if (!multiple) return fixtureAddress.safeParse(recipient).success;
  try {
    return z.array(fixtureAddress).min(1).safeParse(JSON.parse(recipient)).success;
  } catch {
    return false;
  }
}

/** Bridges the committed worker claim to the same fake email port. */
export function commercialEmailAdapter(
  name: OutboundAdapter["name"], mode: string, adapter: CommercialEmailDelivery,
): OutboundAdapter {
  return {
    name,
    supportsProviderDeduplication: false,
    async deliver(action, signinLink) {
      if (!commercialEmailEnabled(mode, process.env) || action.adapter !== name || action.authorizationExpiresAt.getTime() <= Date.now() ||
          !fixtureEmailRecipient(action)) {
        return { kind: "retryable", code: "EMAIL_DELIVERY_UNAVAILABLE" };
      }
      const { id, providerEffectKey, recipient, immutableContent } = action;
      const outcome = await deliverEmail(adapter, { id, providerEffectKey, recipient, immutableContent }, signinLink);
      if (outcome.kind === "delivered") return { kind: "succeeded", providerReference: outcome.receipt };
      if (outcome.kind === "retryable") return { kind: "retryable", code: "EMAIL_RETRYABLE" };
      // The worker has no terminal rejection result. Hold it for reconciliation.
      return { kind: "outcome_unknown", code: outcome.kind === "rejected" ? "EMAIL_REJECTED" : "EMAIL_OUTCOME_UNKNOWN" };
    },
    async reconcile() { return "unknown"; },
  };
}
