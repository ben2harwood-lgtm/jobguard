import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { FeeCollectionError, pence, type Attempt } from "./contracts.js";
import type { CollectionRail, RailEvent } from "./executor.js";
const eventSchema = z.object({
  version: z.literal("fake-stripe-event.v1"), environment: z.literal("synthetic_demo"),
  account: z.literal("fake_jobguard_card"), eventId: z.string().uuid(), tenantId: z.string().uuid(),
  commandId: z.string().uuid(), objectId: z.string().regex(/^fake_[a-f0-9]{64}$/u),
  amountPence: pence.refine(v => v > 0), kind: z.enum(["collection", "refund"]),
  state: z.enum(["settled", "definite_failure"]),
}).strict();
/** Deterministic fake contract only: NOT Stripe's payload or signing protocol. No SDK, key or endpoint. */
export class FakeStripeCardRail implements CollectionRail {
  readonly name = "stripe_card";
  readonly environment = "synthetic_demo";
  private readonly accepted = new Map<string, { fingerprint: string; objectId: string }>();
  crashAfterAcceptance = false;
  definiteFailure = false;
  constructor(private readonly testSigningSecret: string) {}
  async submit(tenantId: string, attempt: Readonly<Attempt>) {
    const key = `${tenantId}:${attempt.commandId}`;
    const { state: _state, providerObjectId: _object, ...approved } = attempt;
    const hash = createHash("sha256").update(JSON.stringify([tenantId, approved])).digest("hex");
    const previous = this.accepted.get(key);
    if (previous && previous.fingerprint !== hash) throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
    if (this.definiteFailure && !previous) return { state: "definite_failure" as const };
    const objectId = `fake_${hash}`;
    this.accepted.set(key, { fingerprint: hash, objectId });
    if (this.crashAfterAcceptance) throw new Error("FAKE_CRASH_AFTER_ACCEPTANCE");
    return { state: "provider_accepted" as const, objectId };
  }
  objectId(tenantId: string, commandId: string): string {
    const value = this.accepted.get(`${tenantId}:${commandId}`);
    if (!value) throw new FeeCollectionError("COLLECTION_REFUSED");
    return value.objectId;
  }
  sign(body: string) { return createHmac("sha256", this.testSigningSecret).update(body).digest("hex"); }
  verifyWebhook(body: string, signature: string): RailEvent {
    if (body.length > 16_384 || !/^[a-f0-9]{64}$/u.test(signature)
      || !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(this.sign(body), "hex"))) throw new FeeCollectionError("INVALID_WEBHOOK");
    try {
      const event = eventSchema.parse(JSON.parse(body));
      if (this.objectId(event.tenantId, event.commandId) !== event.objectId) throw new Error();
      return event;
    } catch { throw new FeeCollectionError("INVALID_WEBHOOK"); }
  }
}
