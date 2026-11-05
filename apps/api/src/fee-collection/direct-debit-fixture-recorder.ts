import { DirectDebitFixtureError, type DirectDebitFixtureRepository, type VerifiedTenantContext } from "@jobguard/db";
import { FeeCollectionError } from "./contracts.js";
import type { FakeDirectDebitEvent, FakeDirectDebitRecorder } from "./fake-gocardless.js";

type MandateBinding = Readonly<{ version: "direct-debit-binding.v1"; environment: "synthetic_demo";
  account: "fake_jobguard_dd"; mandateId: string }>;
type PaymentBinding = MandateBinding & Readonly<{ commandId: string; objectId: string; amountPence: number }>;

/** Construct only with caller-verified context and trusted synthetic request facts.
 * No context resolution, execution, refunds, or application registration here. */
export class DirectDebitFixtureRecorder implements FakeDirectDebitRecorder {
  readonly record: FakeDirectDebitRecorder["record"];
  constructor(repository: DirectDebitFixtureRepository, context: VerifiedTenantContext,
    mandateBinding: MandateBinding, paymentBindings: readonly PaymentBinding[] = []) {
    const mandate = { ...mandateBinding };
    const payments = paymentBindings.map(binding => ({ ...binding }));
    this.record = event => recordEvent(repository, context, mandate, payments, event);
  }
}
async function recordEvent(repository: DirectDebitFixtureRepository, context: VerifiedTenantContext,
  mandate: MandateBinding, payments: readonly PaymentBinding[], event: FakeDirectDebitEvent) {
  if (event.tenantId !== context.tenantId || event.environment !== mandate.environment
    || event.account !== mandate.account) throw new FeeCollectionError("INVALID_WEBHOOK");
  const binding = event.version === "fake-dd-mandate-event.v1" ? mandate
    : payments.find(p => p.commandId === event.commandId && p.objectId === event.objectId
      && p.amountPence === event.amountPence && p.mandateId === mandate.mandateId
      && p.environment === mandate.environment && p.account === mandate.account);
  if (!binding || (event.version === "fake-dd-mandate-event.v1" && event.mandateId !== mandate.mandateId)
    || (event.version === "fake-dd-event.v1" && event.kind !== "collection")) throw new FeeCollectionError("INVALID_WEBHOOK");
  try {
    let head: string | null = null;
    try { head = (await repository.read(context, mandate)).head; }
    catch (error) {
      if (!(error instanceof DirectDebitFixtureError) || error.code !== "DD_NOT_FOUND") throw error;
    }
    // The store serializes compare-and-append and exact replays. A concurrent
    // different event may conflict; callers reconcile rather than blindly retry.
    const history = event.version === "fake-dd-mandate-event.v1"
      ? await repository.recordMandate(context, binding, event, head)
      : await repository.recordPaymentEvent(context, binding, event, head);
    return { code: "processed" as const, eventIds: history.map(row => row.event.eventId) };
  } catch (error) {
    if (error instanceof DirectDebitFixtureError && error.code === "DD_CONFLICT") {
      throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
    }
    throw error;
  }
}
