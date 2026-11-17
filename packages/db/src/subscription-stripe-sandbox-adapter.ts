import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  subscriptionSimulatedWorkV1, SyntheticSubscriptionPaymentAdapter,
  type SubscriptionPaymentAdapter, type SubscriptionSimulatedResult,
} from "./subscription-simulated-payment-adapter.js";

const bindingV1 = z.object({
  version: z.literal("subscription-stripe-sandbox-binding.v1"),
  tenantId: z.guid(), work: subscriptionSimulatedWorkV1,
  collectionBoundPence: z.number().int().min(0).max(16900),
}).strict();
const eventV1 = z.object({
  version: z.literal("subscription-stripe-sandbox-event.v1"),
  id: z.guid(), livemode: z.literal(false), tenantId: z.guid(),
  type: z.enum(["checkout.session.completed", "payment_intent.succeeded", "payment_intent.payment_failed", "charge.refunded"]),
  data: subscriptionSimulatedWorkV1,
}).strict();

export class SubscriptionSandboxError extends Error {
  constructor(readonly code: "INVALID_SANDBOX_INPUT" | "SANDBOX_BINDING_MISMATCH" |
    "SANDBOX_SIGNATURE_INVALID" | "SANDBOX_EVENT_CONFLICT" | "SANDBOX_REVERSAL_REQUIRES_REVIEW") {
    super(code); this.name = "SubscriptionSandboxError";
  }
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new SubscriptionSandboxError("INVALID_SANDBOX_INPUT");
  return result.data;
}
// Public fixture signing material, never a provider credential. This protocol is deliberately
// sandbox-specific and must not be presented as verification of Stripe's real webhook protocol.
function signature(payload: string) {
  return createHmac("sha256", "MON-2B-public-synthetic-fixture-only").update(payload).digest("hex");
}
export function signSubscriptionSandboxEvent(raw: unknown) {
  const payload = JSON.stringify(parse(eventV1, raw));
  return { payload, signature: signature(payload) };
}

/** One exact, server-approved MON-2A work item per fake provider session. No network or live switch.
 * Feed only SubscriptionExecutor's durable claim here. SQL remains the authority for effects.
 * The in-memory provider/event history is sandbox evidence, not production durable ingestion.
 */
export class SubscriptionStripeSandboxAdapter implements SubscriptionPaymentAdapter {
  readonly settings = Object.freeze({ proration: false, retries: false, emails: false, livemode: false });
  private readonly binding;
  private readonly events = new Map<string, string>();
  private submitted = false;
  private state: "pending" | "settled" | "failed" | "reversed" = "pending";
  private readonly observed = new Set<string>();

  constructor(raw: unknown) {
    this.binding = parse(bindingV1, raw);
    if (this.binding.work.amountPence > this.binding.collectionBoundPence) {
      throw new SubscriptionSandboxError("SANDBOX_BINDING_MISMATCH");
    }
  }
  private checkWork(raw: unknown) {
    const work = parse(subscriptionSimulatedWorkV1, raw);
    if (JSON.stringify(work) !== JSON.stringify(this.binding.work)) {
      throw new SubscriptionSandboxError("SANDBOX_BINDING_MISMATCH");
    }
    return work;
  }
  async execute(raw: unknown): Promise<SubscriptionSimulatedResult> {
    this.checkWork(raw);
    this.submitted = true; // Replays reuse one fake payment intent; never initiate again.
    return this.result();
  }
  async reconcile(raw: unknown): Promise<SubscriptionSimulatedResult> {
    this.checkWork(raw);
    if (!this.submitted) throw new SubscriptionSandboxError("SANDBOX_BINDING_MISMATCH");
    return this.result(); // Observation only, never another collection.
  }
  ingest(raw: unknown): void {
    const envelope = parse(z.object({ payload: z.string().max(8192), signature: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(), raw);
    if (!timingSafeEqual(Buffer.from(envelope.signature, "hex"), Buffer.from(signature(envelope.payload), "hex"))) {
      throw new SubscriptionSandboxError("SANDBOX_SIGNATURE_INVALID");
    }
    let decoded: unknown;
    try { decoded = JSON.parse(envelope.payload); }
    catch { throw new SubscriptionSandboxError("INVALID_SANDBOX_INPUT"); }
    const event = parse(eventV1, decoded);
    this.checkWork(event.data);
    if (event.tenantId !== this.binding.tenantId || !this.submitted) {
      throw new SubscriptionSandboxError("SANDBOX_BINDING_MISMATCH");
    }
    const previous = this.events.get(event.id);
    if (previous !== undefined && previous !== envelope.payload) throw new SubscriptionSandboxError("SANDBOX_EVENT_CONFLICT");
    this.events.set(event.id, envelope.payload);
    this.observed.add(event.type);
    // A reversal or contradictory terminal facts require human reconciliation. Arrival order
    // cannot resurrect settlement; a checkout redirect is never evidence of payment.
    if (this.observed.has("charge.refunded")) this.state = "reversed";
    else if (this.observed.has("payment_intent.succeeded") && this.observed.has("payment_intent.payment_failed")) this.state = "reversed";
    else if (this.observed.has("payment_intent.succeeded")) this.state = "settled";
    else if (this.observed.has("payment_intent.payment_failed")) this.state = "failed";
  }
  private async result(): Promise<SubscriptionSimulatedResult> {
    if (this.state === "reversed") throw new SubscriptionSandboxError("SANDBOX_REVERSAL_REQUIRES_REVIEW");
    const outcome = this.state === "pending" ? "outcome_unknown" : this.state;
    return new SyntheticSubscriptionPaymentAdapter(outcome).execute(this.binding.work);
  }
}
