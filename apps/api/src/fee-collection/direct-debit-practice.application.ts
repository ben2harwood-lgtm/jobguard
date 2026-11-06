import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { DirectDebitFixtureError, type DirectDebitFixtureRepository, type VerifiedTenantContext } from "@jobguard/db";
import { FakeGoCardlessRail, type FakeDirectDebitEvent } from "./fake-gocardless.js";
import { debitPracticeActionV1, debitPracticeViewV1 } from "./direct-debit-practice.contracts.js";
export type DebitPracticeActor = Readonly<{ membershipId: string; identityUserId: string }>;
type Authorize = (actor: DebitPracticeActor, jobId: string) => Promise<void>;
const labels = { environment: "synthetic_demo" as const, account: "fake_jobguard_dd" as const };
const mandateLabels = { created: "Mandate created", pending_submission: "Mandate awaiting submission", active: "Mandate active",
  cancelled: "Mandate cancelled or revoked", failed: "Mandate failed", expired: "Mandate expired" };
const paymentLabels = { pending_submission: "Payment requested — not paid", submitted: "Payment submitted — not paid",
  confirmed: "Collection confirmed — awaiting payout", paid_out: "Payment paid out", failed: "Payment failed",
  cancelled: "Payment cancelled", charged_back: "Payment charged back", late_failure: "Payment failed after confirmation" };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const uuid = (value: string) => { const h = hash(value); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; };
/** Synthetic facts only. Caller supplies a verified context and an authorization
 * callback which rechecks job access before ANY fixture read, including replays. */
export class DirectDebitPracticeApplication {
  constructor(private readonly repository: DirectDebitFixtureRepository, private readonly authorize: Authorize,
    private readonly environment: string | undefined) {}
  async execute(context: VerifiedTenantContext, actor: DebitPracticeActor, jobId: string, raw?: unknown) {
    if (this.environment !== "synthetic_demo") throw new DirectDebitFixtureError("DD_DARK");
    if (!z.uuid().safeParse(jobId).success) throw new DirectDebitFixtureError("DD_NOT_FOUND");
    await this.authorize(actor, jobId);
    const action = raw === undefined ? undefined : debitPracticeActionV1.safeParse(raw);
    if (action && !action.success) throw new DirectDebitFixtureError("DD_INVALID_INPUT");
    const key = `dd-practice.v1:${context.tenantId}:${jobId}`;
    const mandate = { version: "direct-debit-binding.v1" as const, ...labels, mandateId: uuid(key) };
    const payments = [0,1,2,3].map(n => ({ ...mandate, commandId: uuid(`${key}:command:${n}`),
      objectId: `fake_dd_${hash(`${key}:object:${n}`)}`, amountPence: 100 }));
    const events: FakeDirectDebitEvent[] = [];
    const m = (state: keyof typeof mandateLabels) => events.push({ version: "fake-dd-mandate-event.v1", ...labels,
      tenantId: context.tenantId, mandateId: mandate.mandateId, eventId: uuid(`${key}:event:${events.length}`), state });
    const p = (n: number, state: keyof typeof paymentLabels) => events.push({ version: "fake-dd-event.v1", ...labels,
      tenantId: context.tenantId, commandId: payments[n]!.commandId, objectId: payments[n]!.objectId,
      amountPence: 100, kind: "collection", eventId: uuid(`${key}:event:${events.length}`), state });
    m("created"); m("pending_submission"); m("active");
    p(0,"pending_submission"); p(0,"submitted"); p(0,"failed");
    // A second fictional request illustrates retry history, never an execution.
    p(1,"pending_submission"); p(1,"submitted"); p(1,"confirmed"); p(1,"paid_out"); p(1,"charged_back");
    p(2,"pending_submission"); p(2,"cancelled");
    p(3,"pending_submission"); p(3,"confirmed"); p(3,"late_failure"); m("cancelled");
    const read = async () => {
      try { return await this.repository.read(context, mandate); }
      catch (error) { if (error instanceof DirectDebitFixtureError && error.code === "DD_NOT_FOUND") return null; throw error; }
    };
    let stored = await read();
    if (action?.success) {
      const step = action.data.step;
      if (step > (stored?.history.length ?? 0) || !events[step]) throw new DirectDebitFixtureError("DD_CONFLICT");
      const rail = new FakeGoCardlessRail(randomBytes(32).toString("hex"), undefined, {
        record: async event => {
          // The recorder port accepts only this server-selected fictional event.
          // The repository independently checks the trusted binding and replay.
          if (event.eventId !== events[step]?.eventId) throw new DirectDebitFixtureError("DD_CONFLICT");
          const head = (await read())?.head ?? null;
          const binding = payments.find(payment => event.version === "fake-dd-event.v1" && payment.commandId === event.commandId);
          const history = event.version === "fake-dd-mandate-event.v1"
            ? await this.repository.recordMandate(context, mandate, event, head)
            : await this.repository.recordPaymentEvent(context, binding, event, head);
          return { code: "processed", eventIds: history.map(row => row.event.eventId) };
        },
      });
      const body = JSON.stringify({ events: [events[step]] });
      const result = await rail.recordWebhookBatch(body, rail.sign(body));
      if (result[0]?.code !== "processed") throw new DirectDebitFixtureError("DD_CONFLICT");
      stored = await read();
    }
    const count = stored?.history.length ?? 0;
    return debitPracticeViewV1.parse({ version: "debit-practice-view.v1",
      mandate: stored ? mandateLabels[stored.mandateState] : "No practice mandate created",
      blocksNewCollection: stored?.blocksNewSubmission ?? true,
      history: (stored?.history ?? []).map(row => ({ sequence: row.sequence,
        label: row.event.version === "fake-dd-mandate-event.v1" ? mandateLabels[row.event.state] : paymentLabels[row.event.state],
        current: row.sequence === count })),
      payments: (stored?.payments ?? []).map((payment, i) => ({ label: `Practice payment ${i + 1}${i === 1 ? " (retry example)" : ""}`, state: paymentLabels[payment.state] })),
      nextAction: count < events.length ? { version: "debit-practice-action.v1", step: count } : null });
  }
}
export function debitPracticeFailure(error: unknown) {
  const code = error instanceof DirectDebitFixtureError ? error.code
    : error instanceof Error && ["UNAUTHENTICATED", "NOT_FOUND", "SYNTHETIC_MODE_REQUIRED", "ORIGIN_FORBIDDEN"].includes(error.message) ? error.message : "DD_UNAVAILABLE";
  return { status: code === "UNAUTHENTICATED" ? 401 : ["DD_NOT_FOUND","NOT_FOUND"].includes(code) ? 404
    : code === "DD_INVALID_INPUT" ? 400 : code === "DD_CONFLICT" ? 409 : ["DD_DARK","SYNTHETIC_MODE_REQUIRED","ORIGIN_FORBIDDEN"].includes(code) ? 403 : 503,
    body: { code } };
}
