import type { ActiveMembership, AuthPrincipal } from "../auth/auth-provider.js";
import { subscriptionAgreementHash } from "@jobguard/core";
import { DarkFeeCollectionExecutor } from "./executor.js";
import { FakeStripeCardRail } from "./fake-stripe.js";
import type { CollectionBook, CollectionSources, CreditSources, ReservationStore, CollectionSessionContext } from "./contracts.js";
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const hash = "a".repeat(64);
export const ctx: CollectionSessionContext = { tenantId: id(1), sessionToken: "synthetic-session", environment: "synthetic_demo" };
export function fixture() {
  const selection = { version: "subscription-agreement-selection.v1" as const, termsVersion: "synthetic_subscription_success_terms.v1" as const,
    catalogueVersion: "subscription_pricing_policy_v4" as const, tenantId: id(1), agreementId: id(2), revision: 1,
    plan: "Solo" as const, cadence: "monthly" as const, anchorDay: 1, recipientRef: id(3),
    validFrom: "2026-10-01T00:00:00Z", expiresAt: "2027-10-01T00:00:00Z" };
  const termsHash = subscriptionAgreementHash(selection);
  const statement = { statementId: id(4), revision: 1, contentHash: hash, sourceHash: hash, principalPence: 500, taxPence: 100 };
  const source: CollectionSources = { version: "fee-collection-sources.v1", tenantId: id(1), jobId: id(5), invoiceId: id(6),
    invoiceHash: hash, statementHash: hash, sourceHash: hash, principalPence: 500, taxPence: 100,
    creditsPence: 0, priorReceiptsPence: 0, immutableInvoice: true, current: true, disputed: false,
    refundPending: false, finalAccountCurrent: true,
    requiredAttributionIds: [id(7)],
    attributionReviews: [{ attributionId: id(7), sourceHash: hash, currentSourceHash: hash, resolution: "approved" }],
    collectionDecision: { decisionId: id(9), action: "payment_fee.collect", resolution: "approved",
      invoiceId: id(6), invoiceHash: hash, currency: "GBP" },
    agreement: { version: "subscription-agreement-check.v1", environment: "synthetic_demo", tenantId: id(1),
      now: "2026-10-29T00:00:00Z", currentRevision: 1, currentTermsHash: termsHash,
      currentMembershipVerified: true, providerDefaultsDisabled: true,
      record: { version: "subscription-agreement-record.v1", environment: "synthetic_demo", selection, termsHash,
        approval: { resolution: "approved", actorMembershipId: id(2), decisionId: id(3), commandId: id(8),
          approvedAt: "2026-09-30T00:00:00Z", termsHash }, state: "active" },
      action: "statement", billingMode: "paid", amountPence: 600, reservedAndCollectedPeriodPence: 0,
      currentStatement: statement, statementApproval: { ...statement, resolution: "approved", tenantId: id(1),
        recipientRef: id(3), expiresAt: "2027-01-01T00:00:00Z", decisionId: id(9) } } };
  const intent = { version: "fee-collection.v1", commandId: id(10), jobId: id(5), invoiceId: id(6),
    statementHash: hash, amountPence: 600, rail: "stripe_card" };
  const refund = { version: "fee-refund.v1", commandId: id(20), jobId: id(5), invoiceId: id(6),
    settlementCommandId: id(10), creditNoteId: id(21), creditHash: hash, amountPence: 500 };
  const credit: CreditSources = { version: "fee-credit-sources.v1", invoiceHash: hash,
    decisionId: id(40), actorMembershipId: id(2), action: "payment_fee.refund", currency: "GBP", tenantId: id(1), jobId: id(5), invoiceId: id(6), creditNoteId: id(21), creditHash: hash,
    settlementCommandId: id(10), amountPence: 500, approvedAmountPence: 500, approved: true,
    currentMembershipVerified: true, current: true, expiresAt: "2099-01-01T00:00:00Z" };
  // Test fake only. Cloned commit/rollback and one queue model the durable store contract.
  let book: CollectionBook = { attempts: [], events: {}, audit: [] };
  let queue = Promise.resolve();
  const store: ReservationStore = { async transaction<T>(tenantId: string, work: Parameters<ReservationStore["transaction"]>[1]): Promise<T> {
    let unlock!: () => void;
    const previous = queue; queue = new Promise<void>(resolve => { unlock = resolve; });
    await previous;
    try {
      if (tenantId !== ctx.tenantId) throw new Error("COLLECTION_REFUSED");
      const copy = structuredClone(book);
      const result = await work(copy, { collection: async () => structuredClone(source), credit: async () => structuredClone(credit) });
      book = copy; return result as T;
    } finally { unlock(); }
  } };
  const rail = new FakeStripeCardRail("synthetic-test-signing-secret");
  let now = new Date("2026-10-29T00:00:00Z");
  let principal: AuthPrincipal | undefined = { identityUserId: id(80), sessionId: id(81), csrfToken: "synthetic-csrf" };
  const membership: ActiveMembership = { id: id(2), identityUserId: id(80), tenantId: id(1), role: "owner", email: "synthetic@example.invalid" };
  const sessions = {
    authenticate: async (token: string) => token === ctx.sessionToken ? principal : undefined,
    findMembership: async () => membership,
  };
  const executor = new DarkFeeCollectionExecutor(store, [rail], () => now, sessions);
  const event = (commandId = id(10), kind: "collection" | "refund" = "collection", eventId = id(30), state = "settled") => {
    const body = JSON.stringify({ version: "fake-stripe-event.v1", environment: "synthetic_demo", account: "fake_jobguard_card",
      tenantId: id(1), eventId, commandId, objectId: rail.objectId(id(1), commandId), amountPence: kind === "refund" ? refund.amountPence : 600, kind, state });
    return { body, signature: rail.sign(body) };
  };
  async function settle() { await executor.reserve(ctx, intent); await executor.execute(ctx, id(10)); const e = event(); await executor.webhook(ctx, "stripe_card", e.body, e.signature); }
  return { membership, sessions, expireSession: () => { principal = undefined; }, setNow: (value: string) => { now = new Date(value); }, source, credit, intent, refund, store, rail, executor, event, settle, book: () => structuredClone(book) };
}
