import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { FeeCollectionError, parse, pence, type Attempt } from "./contracts.js";
import type { CollectionRail, RailEvent } from "./executor.js";
const id = z.string().uuid();
const mandateState = z.enum(["created", "pending_submission", "active", "cancelled", "failed", "expired"]);
const setupV1 = z.object({ version: z.literal("fake-dd-setup.v1"), environment: z.literal("synthetic_demo"),
  tenantId: id, commandId: id, mandateId: id, approvedDecisionId: id,
  noticeApproved: z.literal(true), providerDefaultsDisabled: z.literal(true) }).strict();
const paymentEvent = z.object({ version: z.literal("fake-dd-event.v1"), environment: z.literal("synthetic_demo"),
  account: z.literal("fake_jobguard_dd"), eventId: id, tenantId: id, commandId: id,
  objectId: z.string().regex(/^fake_dd_[a-f0-9]{64}$/u), kind: z.enum(["collection", "refund"]),
  amountPence: pence.refine(v => v > 0),
  state: z.enum(["pending_submission", "submitted", "confirmed", "paid_out", "failed", "cancelled", "charged_back", "late_failure"]),
}).strict();
const mandateEvent = z.object({ version: z.literal("fake-dd-mandate-event.v1"), environment: z.literal("synthetic_demo"),
  account: z.literal("fake_jobguard_dd"), tenantId: id, mandateId: id, eventId: id, state: mandateState }).strict();
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const invalid = (): never => { throw new FeeCollectionError("INVALID_WEBHOOK"); };
/** In-memory deterministic specimen, NOT the GoCardless API/signing protocol.
 * No endpoint, SDK, credentials, route registration or production implementation. */
export class FakeGoCardlessRail implements CollectionRail {
  readonly name = "direct_debit";
  readonly environment = "synthetic_demo";
  readonly productionEnabled = false;
  private readonly setups = new Map<string, string>();
  private readonly mandates = new Map<string, { state: z.infer<typeof mandateState>; tenantId: string }>();
  private readonly accepted = new Map<string, { hash: string; objectId: string }>();
  private readonly mandateEvents = new Map<string, string>();
  crashAfterAcceptance = false;
  constructor(private readonly testSigningSecret: string, private readonly now: () => Date = () => new Date()) {}
  setup(raw: unknown) {
    const input = parse(setupV1, raw);
    const key = `${input.tenantId}:${input.commandId}`;
    const previous = this.setups.get(key);
    if (previous && previous !== digest(input)) throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
    if (!previous) {
      if (this.mandates.has(input.mandateId) || [...this.mandates.values()].some(m => m.tenantId === input.tenantId)) throw new FeeCollectionError("COLLECTION_REFUSED");
      this.mandates.set(input.mandateId, { tenantId: input.tenantId, state: "created" });
      this.setups.set(key, digest(input));
    }
    return { mandateId: input.mandateId, hostedSetupUrl: `https://mandate.invalid/${input.mandateId}`,
      evidence: "synthetic_sandbox_only", productionEnabled: false };
  }
  mandateStatus(tenantId: string, mandateId: string) {
    const mandate = this.mandates.get(mandateId);
    if (!mandate || mandate.tenantId !== tenantId) throw new FeeCollectionError("COLLECTION_REFUSED");
    return mandate.state;
  }
  // Fake protocol only: authenticate timestamp and exact raw body together.
  sign(body: string, timestamp = Math.floor(this.now().getTime() / 1000)) {
    return `t=${timestamp},v1=${this.signature(body, String(timestamp))}`;
  }
  private signature(body: string, timestamp: string) {
    return createHmac("sha256", this.testSigningSecret).update(`${timestamp}.${body}`).digest("hex");
  }
  private verifiedBatch(body: string, signature: string): unknown[] {
    const signed = /^t=(0|[1-9][0-9]{0,11}),v1=([a-f0-9]{64})$/u.exec(signature);
    if (body.length > 65_536 || !signed) return invalid();
    const timestamp = signed[1]!, supplied = signed[2]!;
    const age = this.now().getTime() / 1000 - Number(timestamp);
    if (!Number.isFinite(age) || age > 300 || age < -60
      || !timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(this.signature(body, timestamp), "hex"))) return invalid();
    try { return z.object({ events: z.array(z.unknown()).min(1).max(100) }).strict().parse(JSON.parse(body)).events; }
    catch { return invalid(); }
  }
  ingestMandates(body: string, signature: string) {
    return this.verifiedBatch(body, signature).map(raw => {
      try {
        const e = mandateEvent.safeParse(raw); if (!e.success) return invalid();
        const event = e.data;
        const key = `${event.tenantId}:${event.eventId}`;
        const previous = this.mandateEvents.get(key);
        if (previous && previous !== digest(event)) throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
        if (previous) return { code: "processed" };
        const old = this.mandateStatus(event.tenantId, event.mandateId);
        const terminal = ["cancelled", "failed", "expired"];
        const order = ["created", "pending_submission", "active"];
        if (!terminal.includes(old) && (terminal.includes(event.state) || order.indexOf(event.state) > order.indexOf(old))) {
          this.mandates.get(event.mandateId)!.state = event.state;
        }
        this.mandateEvents.set(key, digest(event));
        return { code: "processed" };
      } catch (error) {
        return { code: error instanceof FeeCollectionError ? error.code : "INVALID_WEBHOOK" };
      }
    });
  }
  async submit(tenantId: string, attempt: Readonly<Attempt>) {
    if (attempt.rail !== this.name) throw new FeeCollectionError("COLLECTION_REFUSED");
    const { state: _state, providerObjectId: _object, paymentState: _payment, ...approved } = attempt;
    const hash = digest([tenantId, approved]);
    const key = `${tenantId}:${attempt.commandId}`;
    const previous = this.accepted.get(key);
    if (previous && previous.hash !== hash) throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
    if (!previous) {
      // A refund returns original settled funds; it never requires a new debit mandate.
      if (attempt.kind === "collection" && ![...this.mandates.values()].some(m => m.tenantId === tenantId && m.state === "active")) {
        return { state: "definite_failure" as const };
      }
      if (attempt.kind === "refund" && this.accepted.get(`${tenantId}:${attempt.settlementCommandId}`)?.objectId !== attempt.settlementObjectId) {
        throw new FeeCollectionError("COLLECTION_REFUSED");
      }
      this.accepted.set(key, { hash, objectId: `fake_dd_${hash}` });
    }
    if (this.crashAfterAcceptance) throw new Error("FAKE_CRASH_AFTER_ACCEPTANCE");
    return { state: "provider_accepted" as const, objectId: this.objectId(tenantId, attempt.commandId) };
  }
  objectId(tenantId: string, commandId: string) {
    const value = this.accepted.get(`${tenantId}:${commandId}`);
    if (!value) throw new FeeCollectionError("COLLECTION_REFUSED");
    return value.objectId;
  }
  verifyWebhookBatch(body: string, signature: string): readonly (RailEvent | FeeCollectionError)[] {
    return this.verifiedBatch(body, signature).map(raw => {
      const parsed = paymentEvent.safeParse(raw);
      if (!parsed.success) return new FeeCollectionError("INVALID_WEBHOOK");
      try {
        const e = parsed.data;
        if (this.objectId(e.tenantId, e.commandId) !== e.objectId) return invalid();
        return e;
      } catch { return new FeeCollectionError("INVALID_WEBHOOK"); }
    });
  }
  verifyWebhook(body: string, signature: string): RailEvent {
    const events = this.verifyWebhookBatch(body, signature);
    if (events.length !== 1 || events[0] instanceof FeeCollectionError || !events[0]) return invalid();
    return events[0];
  }
}
