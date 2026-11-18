import type { Pool } from "pg";
import { verifyRecoveryMessageContent } from "@jobguard/core";
import type { FakeDeliveryResult, OutboundAction } from "./outbox.js";
import { outboundWorkerPool } from "./worker-pool.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export const RECOVERY_MESSAGE_ADAPTER = "fake_recovery_message" as const;
export const RECOVERY_MESSAGE_EFFECT_PREFIX = "recovery-message:" as const;
export type RecoveryMessageDeliveryMode = "success" | "response_lost" | "no_response" | "definite_failure" | "process_stopped";
/** The error code recorded against an attempt that the delivery boundary refused because the message, case, evidence or approval had changed. */
export const RECOVERY_MESSAGE_BLOCKED_CODE = "FAKE_BLOCKED_CHANGED" as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** The practice process stopped after the action was claimed and before anything was recorded: the claim stays, unfinished. */
export class PracticeProcessStopped extends Error {
  constructor() { super("PRACTICE_PROCESS_STOPPED"); this.name = "PracticeProcessStopped"; }
}

/**
 * The one adapter behind a practice recovery message. It is a closed, deterministic fake: it opens no socket,
 * holds no credential and sends nothing. "Delivery" means one row in the practice provider's own record
 * (`app.recovery_message_sink`), which stands in for the provider's side of the call.
 *
 * It runs after the shared outbox executor claimed the action and committed it as `executing`, so the provider record
 * is written outside the claiming transaction, exactly like a real provider call would be. This is also the effect
 * boundary: whoever drives the executor (the repository, or a worker calling it directly) reaches the sink only through
 * here, so the boundary itself re-checks the case, the evidence pack and the approver under the case lock, in the same
 * transaction as the sink insert. The sink's own database guard checks the same facts again at insert time.
 *
 * Delivery uses the worker login and derives scope from the authorized action. Reconciliation reads
 * the recorded effect using the caller's verified tenant context.
 */
export class FakeRecoveryMessageAdapter {
  readonly name = RECOVERY_MESSAGE_ADAPTER;
  readonly supportsProviderDeduplication = true;
  constructor(private readonly pool: Pool, private readonly mode: RecoveryMessageDeliveryMode) {}

  async deliver(_context: VerifiedTenantContext, action: Readonly<OutboundAction>): Promise<FakeDeliveryResult> {
    if (this.mode === "definite_failure") return { kind: "retryable", code: "FAKE_PROVIDER_REJECTED" };
    // The provider never recorded this one and never answered: the outcome is genuinely unknown.
    if (this.mode === "no_response") return { kind: "outcome_unknown", code: "FAKE_NO_RESPONSE" };
    // The practice process dies mid-call: no result is ever reported, so the claim stays `executing` until it is checked.
    if (this.mode === "process_stopped") throw new PracticeProcessStopped();
    try {
      const content = verifyRecoveryMessageContent(action.immutableContent, action.contentHash);
      const messageId = action.providerEffectKey.slice(RECOVERY_MESSAGE_EFFECT_PREFIX.length);
      if (!action.providerEffectKey.startsWith(RECOVERY_MESSAGE_EFFECT_PREFIX) || !UUID.test(messageId) || action.recipient !== content.recipient) throw new Error("FAKE_EFFECT_MISMATCH");
      const worker = await outboundWorkerPool(this.pool);
      await worker.query("SELECT app.record_worker_recovery_message($1)", [action.id]);
    } catch (error) {
      // A source refusal records no effect. A lost connection leaves the claim
      // unfinished for reconciliation instead of authorizing a blind retry.
      if ((error as { code?: string }).code === "23514" || (error instanceof Error && error.message === "RECOVERY_MESSAGE_CONTENT_INVALID")) return { kind: "retryable", code: RECOVERY_MESSAGE_BLOCKED_CODE };
      throw error;
    }
    // The provider recorded it. Either the answer arrives, or it is lost and JobGuard must check before doing anything else.
    return this.mode === "response_lost" ? { kind: "outcome_unknown", code: "FAKE_RESPONSE_LOST_AFTER_ACCEPTANCE" } : { kind: "succeeded", providerReference: `fake-recovery:${action.id}` };
  }

  async reconcile(context: VerifiedTenantContext, providerEffectKey: string): Promise<"succeeded" | "not_found" | "unknown"> {
    const messageId = providerEffectKey.slice(RECOVERY_MESSAGE_EFFECT_PREFIX.length);
    if (!providerEffectKey.startsWith(RECOVERY_MESSAGE_EFFECT_PREFIX) || !UUID.test(messageId)) return "unknown";
    const found = await withTenant(this.pool, context, db =>
      db.$client.query("SELECT 1 FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2", [context.tenantId, messageId]));
    return found.rowCount ? "succeeded" : "not_found";
  }
}
