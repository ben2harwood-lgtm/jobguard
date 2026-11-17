import { z } from "zod";
import { BillingDataError, MAX_MONEY_PENCE, verifyBillingExportArtifact } from "@jobguard/core";
import type { FakeDeliveryResult, OutboundAction, OutboundAdapter } from "@jobguard/db";

const settingsV1 = z.object({ version: z.literal("billing-fake-adapter.v1"), mode: z.literal("synthetic_demo"),
  channel: z.enum(["fake_download", "fake_sftp", "fake_api"]),
  scenario: z.enum(["success", "retryable", "interruption", "unknown_accepted", "unknown_not_accepted", "unknown_unresolved"]),
}).strict();
const fakeActionV1 = z.object({ version: z.literal("outbound-action.v1"), id: z.guid({ error: "Invalid uuid" }),
  authorizationId: z.guid({ error: "Invalid uuid" }), adapter: z.enum(["fake_download", "fake_sftp", "fake_api"]),
  providerEffectKey: z.string().min(1).max(300), actionType: z.literal("billing_export"),
  recipient: z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.invalid$/u),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u), immutableContent: z.string().max(5_000_000),
  aggregateRevision: z.number().int().nonnegative(), amountPence: z.number().int().nonnegative().max(MAX_MONEY_PENCE),
  currency: z.literal("GBP"), policyVersion: z.string().min(1).max(80), authorizationExpiresAt: z.date(),
}).strict();
type Observation = { binding: string; result: FakeDeliveryResult; accepted: boolean };

/** Process-local fictional provider. No credentials, networking, execution claim or authorization decision.
 * This is deliberately not registered in ActionExecutor or the worker. Its state is not durable evidence.
 */
export function createSyntheticBillingAdapter(raw: unknown): OutboundAdapter & { readonly simulatedEffects: number } {
  const parsed = settingsV1.safeParse(raw);
  if (!parsed.success) throw new BillingDataError("BILLING_INVALID");
  const settings = parsed.data;
  const observations = new Map<string, Observation>();
  let effects = 0;
  return {
    name: settings.channel, supportsProviderDeduplication: true,
    get simulatedEffects() { return effects; },
    async deliver(rawAction: Readonly<OutboundAction>): Promise<FakeDeliveryResult> {
      const validated = fakeActionV1.safeParse(rawAction);
      if (!validated.success || validated.data.adapter !== settings.channel) throw new BillingDataError("BILLING_INVALID");
      const action = validated.data;
      const artifact = verifyBillingExportArtifact(action.immutableContent, action.contentHash);
      if (action.amountPence !== artifact.totalNet.pence) throw new BillingDataError("BILLING_INVALID");
      // Fixed tuple, independent of object property insertion order.
      const binding = JSON.stringify([action.adapter, action.actionType, action.recipient, action.contentHash,
        action.aggregateRevision, action.amountPence, action.currency, action.policyVersion]);
      const previous = observations.get(action.providerEffectKey);
      if (previous) {
        if (previous.binding !== binding) throw new BillingDataError("BILLING_CONFLICT");
        return Object.freeze({ ...previous.result });
      }
      const accepted = settings.scenario === "success" || settings.scenario === "unknown_accepted";
      if (accepted) effects++;
      const result: FakeDeliveryResult = settings.scenario === "success"
        ? { kind: "succeeded", providerReference: `fictional:${action.providerEffectKey}` }
        : settings.scenario === "retryable" ? { kind: "retryable", code: "FICTIONAL_RETRYABLE" }
          : { kind: "outcome_unknown", code: "FICTIONAL_UNKNOWN" };
      observations.set(action.providerEffectKey, { binding, result: Object.freeze(result), accepted });
      return Object.freeze({ ...result });
    },
    async reconcile(providerEffectKey: string): Promise<"succeeded" | "not_found" | "unknown"> {
      const observation = observations.get(providerEffectKey);
      if (!observation) return "not_found";
      if (observation.accepted) {
        observation.result = Object.freeze({ kind: "succeeded", providerReference: `fictional:${providerEffectKey}` });
        return "succeeded";
      }
      if (settings.scenario === "unknown_not_accepted" || settings.scenario === "retryable") {
        return "not_found";
      }
      return "unknown";
    },
  };
}
