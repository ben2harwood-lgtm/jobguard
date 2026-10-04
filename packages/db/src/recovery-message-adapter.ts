import type { Pool } from "pg";
import { verifyRecoveryMessageContent } from "@jobguard/core";
import type { FakeDeliveryResult, OutboundAction, OutboundAdapter } from "./outbox.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export const RECOVERY_MESSAGE_ADAPTER = "fake_recovery_message" as const;
export const RECOVERY_MESSAGE_EFFECT_PREFIX = "recovery-message:" as const;
export type RecoveryMessageDeliveryMode = "success" | "response_lost" | "no_response" | "definite_failure";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/**
 * The one adapter behind a practice recovery message. It is a closed, deterministic fake: it opens no socket,
 * holds no credential and sends nothing. "Delivery" means one row in the practice provider's own record
 * (`app.recovery_message_sink`), which stands in for the provider's side of the call.
 *
 * It runs after the action was claimed and committed as `executing` (the shared outbox executor owns that), so
 * the provider record is written outside the claiming transaction, exactly like a real provider call would be.
 */
export class FakeRecoveryMessageAdapter implements OutboundAdapter {
  readonly name = RECOVERY_MESSAGE_ADAPTER;
  readonly supportsProviderDeduplication = true;
  constructor(private readonly pool: Pool, private readonly context: VerifiedTenantContext, private readonly mode: RecoveryMessageDeliveryMode) {}

  async deliver(action: Readonly<OutboundAction>): Promise<FakeDeliveryResult> {
    if (this.mode === "definite_failure") return { kind: "retryable", code: "FAKE_PROVIDER_REJECTED" };
    // The provider never recorded this one and never answered: the outcome is genuinely unknown.
    if (this.mode === "no_response") return { kind: "outcome_unknown", code: "FAKE_NO_RESPONSE" };
    try {
      const content = verifyRecoveryMessageContent(action.immutableContent, action.contentHash);
      const messageId = action.providerEffectKey.slice(RECOVERY_MESSAGE_EFFECT_PREFIX.length);
      if (!action.providerEffectKey.startsWith(RECOVERY_MESSAGE_EFFECT_PREFIX) || !UUID.test(messageId) || action.recipient !== content.recipient) throw new Error("FAKE_EFFECT_MISMATCH");
      await withTenant(this.pool, this.context, async db => {
        await db.$client.query(
          `INSERT INTO app.recovery_message_sink(id,tenant_id,job_id,case_id,message_id,outbox_action_id,recipient,body,content_hash,attachment_hash,provider_reference,environment,real_external_actions)
           VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'synthetic_demo',0) ON CONFLICT(tenant_id,message_id) DO NOTHING`,
          [this.context.tenantId, content.jobId, content.caseId, messageId, action.id, content.recipient, content.body, action.contentHash, content.attachmentHash, `fake-recovery:${action.id}`]);
      });
    } catch {
      // The practice provider's own guard refused (changed, revoked or expired authority). Nothing was recorded.
      return { kind: "retryable", code: "FAKE_SINK_REJECTED" };
    }
    // The provider recorded it. Either the answer arrives, or it is lost and JobGuard must check before doing anything else.
    return this.mode === "response_lost" ? { kind: "outcome_unknown", code: "FAKE_RESPONSE_LOST_AFTER_ACCEPTANCE" } : { kind: "succeeded", providerReference: `fake-recovery:${action.id}` };
  }

  async reconcile(providerEffectKey: string): Promise<"succeeded" | "not_found" | "unknown"> {
    const messageId = providerEffectKey.slice(RECOVERY_MESSAGE_EFFECT_PREFIX.length);
    if (!providerEffectKey.startsWith(RECOVERY_MESSAGE_EFFECT_PREFIX) || !UUID.test(messageId)) return "unknown";
    const found = await withTenant(this.pool, this.context, db =>
      db.$client.query("SELECT 1 FROM app.recovery_message_sink WHERE tenant_id=$1 AND message_id=$2", [this.context.tenantId, messageId]));
    return found.rowCount ? "succeeded" : "not_found";
  }
}
