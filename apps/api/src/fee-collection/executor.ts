import { createHash } from "node:crypto";
import { checkSyntheticSubscriptionAgreement } from "@jobguard/core";
import { rolePermits, type AuthProvider } from "../auth/auth-provider.js";
import { collectionIntentV1, collectionSourcesV1, creditSourcesV1, FeeCollectionError, parse, refundIntentV1,
  type Attempt, type CollectionBook, type CollectionIntent, type CollectionSources, type ReservationStore,
  type LockedCollectionSources, type CollectionSessionContext, type DirectDebitWebhookContext, type DirectDebitPaymentState } from "./contracts.js";
import { pauseSuccessFee, validateSuccessFee } from "./success-fee-direct-debit.js";
export interface CollectionRail {
  readonly name: "stripe_card" | "direct_debit";
  readonly environment: "synthetic_demo";
  collectionPauseReason?(tenantId: string): "MANDATE_REVOKED" | "MANDATE_NOT_ACTIVE" | undefined;
  verifyWebhook(body: string, signature: string): RailEvent;
  verifyWebhookBatch?(body: string, signature: string): readonly (RailEvent | FeeCollectionError)[];
  submit(tenantId: string, attempt: Readonly<Attempt>): Promise<{ state: "provider_accepted"; objectId: string } | { state: "definite_failure" }>;
}
export type RailEvent = Readonly<{ eventId: string; tenantId: string; commandId: string;
  objectId: string; amountPence: number; kind: "collection" | "refund"; state: "settled" | "definite_failure" | DirectDebitPaymentState }>;
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const refuse = (): never => { throw new FeeCollectionError("COLLECTION_REFUSED"); };
function transition(book: CollectionBook, attempt: Attempt, state: Attempt["state"]) {
  attempt.state = state;
  book.audit.push({ commandId: attempt.commandId, state });
}
function match(book: CollectionBook, commandId: string, hash: string) {
  const prior = book.attempts.find(a => a.commandId === commandId);
  if (prior && prior.fingerprint !== hash) throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
  return prior;
}
function validate(raw: unknown, ctx: CollectionSessionContext, intent: CollectionIntent, now: string): CollectionSources {
  const source = parse(collectionSourcesV1, raw);
  const agreement = source.agreement;
  const statement = agreement.currentStatement;
  if (source.tenantId !== ctx.tenantId || source.jobId !== intent.jobId || source.invoiceId !== intent.invoiceId
    || source.statementHash !== intent.statementHash || agreement.tenantId !== ctx.tenantId
    || source.collectionDecision.invoiceId !== source.invoiceId || source.collectionDecision.invoiceHash !== source.invoiceHash
    || source.collectionDecision.decisionId !== agreement.statementApproval?.decisionId
    || agreement.action !== "statement" || !statement || statement.contentHash !== source.statementHash
    || statement.sourceHash !== source.sourceHash || statement.principalPence !== source.principalPence
    || statement.taxPence !== source.taxPence
    || new Set(source.requiredAttributionIds).size !== source.requiredAttributionIds.length
    || new Set(source.attributionReviews.map(r => r.attributionId)).size !== source.attributionReviews.length
    || source.requiredAttributionIds.length !== source.attributionReviews.length
    || source.requiredAttributionIds.some(id => !source.attributionReviews.some(r => r.attributionId === id))
    || source.attributionReviews.some(r => r.sourceHash !== r.currentSourceHash)) return refuse();
  checkSyntheticSubscriptionAgreement({ ...agreement, now });
  return source;
}
async function readCollection(sources: LockedCollectionSources, ctx: CollectionSessionContext,
  intent: CollectionIntent, actorMembershipId: string, now: string) {
  if (intent.purpose === "receipt_success_fee") {
    if (!sources.successFee) return pauseSuccessFee("SUCCESS_FEE_DEPENDENCY_BOUND");
    return validateSuccessFee(await sources.successFee(intent.jobId, intent.invoiceId, intent.statementHash), ctx, intent, actorMembershipId, now);
  }
  const s = validate(await sources.collection(intent.jobId, intent.invoiceId), ctx, intent, now);
  return { ...s, statementId: s.agreement.currentStatement!.statementId,
    amountPence: s.agreement.amountPence, decisionId: s.collectionDecision.decisionId, authorizationId: undefined };
}
type ValidatedCollection = Awaited<ReturnType<typeof readCollection>>;
function requireReconciled(book: CollectionBook, invoiceId: string, statementId?: string) {
  if (book.attempts.some(a => a.state === "reconciliation_required"
    && (a.invoiceId === invoiceId || a.statementId === statementId))) throw new FeeCollectionError("RECONCILIATION_REQUIRED");
}
function outstanding(book: CollectionBook, source: ValidatedCollection, excluding?: string) {
  const used = book.attempts.filter(a => a.kind === "collection" && (a.invoiceId === source.invoiceId || a.statementId === source.statementId)
    && a.state !== "released" && a.commandId !== excluding).reduce((sum, a) => sum + BigInt(a.amountPence), 0n);
  // priorReceipts excludes settlements in this reservation book. Refunds never silently reopen debt.
  return BigInt(source.principalPence) + BigInt(source.taxPence) - BigInt(source.creditsPence)
    - BigInt(source.priorReceiptsPence) - used;
}
/** Server-only orchestration. No route, live adapter or default-on flag is registered. */
export class DarkFeeCollectionExecutor {
  constructor(private readonly store: ReservationStore, private readonly rails: readonly CollectionRail[] = [],
    private readonly now: () => Date = () => new Date(),
    private readonly sessions?: Pick<AuthProvider, "authenticate" | "findMembership">) {}
  private async actor(ctx: CollectionSessionContext): Promise<string> {
    if (ctx.environment !== "synthetic_demo" || !this.sessions) throw new FeeCollectionError("COLLECTION_DARK");
    if (typeof ctx.sessionToken !== "string" || !ctx.sessionToken) return refuse();
    const principal = await this.sessions.authenticate(ctx.sessionToken);
    if (!principal) return refuse();
    const membership = await this.sessions.findMembership(principal, ctx.tenantId);
    if (!membership || membership.revokedAt !== undefined || membership.tenantId !== ctx.tenantId
      || membership.identityUserId !== principal.identityUserId || !rolePermits(membership.role, "finance:approve")) return refuse();
    return membership.id;
  }
  async reserve(ctx: CollectionSessionContext, raw: unknown): Promise<Readonly<Attempt>> {
    const actorMembershipId = await this.actor(ctx);
    const intent = parse(collectionIntentV1, raw);
    return this.store.transaction(ctx.tenantId, async (book, sources) => {
      const prior = match(book, intent.commandId, fingerprint(intent));
      if (prior) {
        if (prior.actorMembershipId !== actorMembershipId) return refuse();
        return structuredClone(prior);
      }
      const source = await readCollection(sources, ctx, intent, actorMembershipId, this.now().toISOString());
      requireReconciled(book, intent.invoiceId, source.statementId);
      if (BigInt(intent.amountPence) > outstanding(book, source)) return refuse();
      // Each decision approves the exact full statement, not a caller-selected partial debit.
      if (intent.amountPence !== source.amountPence) return refuse();
      const attempt: Attempt = { ...intent, kind: "collection", fingerprint: fingerprint(intent),
        actorMembershipId, principalPence: source.principalPence,
        statementId: source.statementId,
        invoiceHash: source.invoiceHash, sourceHash: source.sourceHash, decisionId: source.decisionId, authorizationId: source.authorizationId,
        settlementCommandId: null, settlementObjectId: null,
        creditNoteId: null, state: "reserved", providerObjectId: null };
      book.attempts.push(attempt); transition(book, attempt, "reserved");
      return structuredClone(attempt);
    });
  }
  async reserveRefund(ctx: CollectionSessionContext, raw: unknown): Promise<Readonly<Attempt>> {
    const actorMembershipId = await this.actor(ctx);
    const intent = parse(refundIntentV1, raw);
    return this.store.transaction(ctx.tenantId, async (book, sources) => {
      const prior = match(book, intent.commandId, fingerprint(intent));
      if (prior) {
        if (prior.actorMembershipId !== actorMembershipId) return refuse();
        return structuredClone(prior);
      }
      requireReconciled(book, intent.invoiceId);
      const credit = parse(creditSourcesV1, await sources.credit(intent));
      const original = book.attempts.find(a => a.commandId === intent.settlementCommandId && a.kind === "collection"
        && a.state === "settled" && a.invoiceId === intent.invoiceId && a.jobId === intent.jobId);
      const used = book.attempts.filter(a => a.kind === "refund" && a.settlementCommandId === intent.settlementCommandId
        && a.state !== "released").reduce((sum, a) => sum + BigInt(a.amountPence), 0n);
      if (!original || !original.providerObjectId || credit.tenantId !== ctx.tenantId || credit.jobId !== intent.jobId || credit.invoiceId !== intent.invoiceId
        || credit.actorMembershipId !== actorMembershipId || credit.invoiceHash !== original.invoiceHash || credit.creditNoteId !== intent.creditNoteId || credit.creditHash !== intent.creditHash
        || credit.settlementCommandId !== original.commandId || credit.approvedAmountPence !== intent.amountPence
        || credit.amountPence !== intent.amountPence || Date.parse(credit.expiresAt) <= this.now().getTime()
        || BigInt(intent.amountPence) + used > BigInt(original.principalPence)
        || book.attempts.some(a => a.kind === "refund" && a.creditNoteId === intent.creditNoteId && a.state !== "released")) return refuse();
      const attempt: Attempt = { kind: "refund", commandId: intent.commandId, fingerprint: fingerprint(intent),
        actorMembershipId, principalPence: intent.amountPence,
        jobId: intent.jobId, invoiceId: intent.invoiceId, invoiceHash: original.invoiceHash,
        sourceHash: intent.creditHash, statementHash: original.statementHash, statementId: original.statementId, amountPence: intent.amountPence,
        rail: original.rail, purpose: original.purpose, decisionId: credit.decisionId, settlementCommandId: original.commandId,
        settlementObjectId: original.providerObjectId, creditNoteId: intent.creditNoteId,
        state: "reserved", providerObjectId: null };
      book.attempts.push(attempt); transition(book, attempt, "reserved");
      return structuredClone(attempt);
    });
  }
  async webhook(ctx: CollectionSessionContext, railName: CollectionRail["name"], body: string, signature: string) {
    await this.actor(ctx);
    return this.processWebhook(ctx, railName, body, signature);
  }
  async directDebitWebhook(ctx: DirectDebitWebhookContext, body: string, signature: string) {
    if (ctx.environment !== "synthetic_demo") throw new FeeCollectionError("COLLECTION_DARK");
    return this.processWebhook(ctx, "direct_debit", body, signature);
  }
  private async processWebhook(ctx: DirectDebitWebhookContext, railName: CollectionRail["name"], body: string, signature: string) {
    const rail = this.rails.find(r => r.name === railName && r.environment === "synthetic_demo");
    if (!rail) throw new FeeCollectionError("COLLECTION_DARK");
    if (!rail.verifyWebhookBatch) return this.applyEvent(ctx, railName, rail.verifyWebhook(body, signature));
    // Authenticate the entire raw body first, then commit each event independently.
    const events = rail.verifyWebhookBatch(body, signature);
    const results: { code: string }[] = [];
    for (const event of events) {
      try {
        if (event instanceof FeeCollectionError) throw event;
        await this.applyEvent(ctx, railName, event);
        results.push({ code: "processed" });
      } catch (error) {
        if (!(error instanceof FeeCollectionError)) throw error;
        results.push({ code: error.code });
      }
    }
    return results;
  }
  private async applyEvent(ctx: DirectDebitWebhookContext, railName: CollectionRail["name"], event: RailEvent) {
    if (event.tenantId !== ctx.tenantId) return refuse();
    await this.store.transaction(ctx.tenantId, async book => {
      const hash = fingerprint(event);
      const eventKey = `${railName}:${event.eventId}`;
      const previous = book.events[eventKey];
      if (previous) {
        if (previous !== hash) throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
        return;
      }
      const attempt = book.attempts.find(a => a.commandId === event.commandId);
      if (!attempt || attempt.rail !== railName || attempt.kind !== event.kind || attempt.amountPence !== event.amountPence
        || (attempt.providerObjectId !== null && attempt.providerObjectId !== event.objectId)) return refuse();
      if (railName === "direct_debit") {
        this.directDebitEvent(book, attempt, event);
        book.events[eventKey] = hash;
        return;
      }
      if (attempt.state === "released" && event.state === "definite_failure" && attempt.providerObjectId === event.objectId) {
        book.events[eventKey] = hash; return;
      }
      if ((attempt.state === "released" && event.state === "settled") || attempt.state === "reconciliation_required") {
        // Persist the contradictory fact and reserve its balance until explicit reconciliation.
        attempt.providerObjectId = event.objectId;
        if (attempt.state !== "reconciliation_required") transition(book, attempt, "reconciliation_required");
        book.events[eventKey] = hash;
        return;
      }
      if (attempt.state === "reserved" || attempt.state === "released") throw new FeeCollectionError("RECONCILIATION_REQUIRED");
      if (event.state === "definite_failure" && attempt.state === "settled") throw new FeeCollectionError("RECONCILIATION_REQUIRED");
      attempt.providerObjectId = event.objectId;
      if (attempt.state !== "settled") transition(book, attempt, event.state === "settled" ? "settled" : "released");
      book.events[eventKey] = hash;
    });
  }
  private directDebitEvent(book: CollectionBook, attempt: Attempt, event: RailEvent) {
    if (event.state === "settled" || event.state === "definite_failure" || attempt.state === "reserved") {
      throw new FeeCollectionError("RECONCILIATION_REQUIRED");
    }
    attempt.providerObjectId = event.objectId;
    const order = ["pending_submission", "submitted", "confirmed", "paid_out"];
    const old = attempt.paymentState;
    const reversal = event.state === "charged_back" || event.state === "late_failure";
    const failure = event.state === "failed" || event.state === "cancelled";
    if (attempt.state === "reconciliation_required") return;
    if (reversal || (failure && (old === "confirmed" || old === "paid_out"))
      || (attempt.state === "released" && !failure)) {
      attempt.paymentState = event.state;
      transition(book, attempt, "reconciliation_required");
    } else if (failure) {
      attempt.paymentState = event.state;
      if (attempt.state !== "released") transition(book, attempt, "released");
    } else if (!old || order.indexOf(event.state) > order.indexOf(old)) {
      attempt.paymentState = event.state;
      if (event.state === "paid_out" && attempt.state !== "settled") transition(book, attempt, "settled");
    }
  }
  async execute(ctx: CollectionSessionContext, commandId: string): Promise<void> {
    const actorMembershipId = await this.actor(ctx);
    const attempt = await this.store.transaction(ctx.tenantId, async (book, sources) => {
      const current = book.attempts.find(a => a.commandId === commandId);
      if (!current || current.actorMembershipId !== actorMembershipId) return refuse();
      requireReconciled(book, current.invoiceId, current.statementId);
      if (current.state !== "reserved") throw new FeeCollectionError("RECONCILIATION_REQUIRED");
      if (!this.rails.some(r => r.name === current.rail && r.environment === "synthetic_demo")) throw new FeeCollectionError("COLLECTION_DARK");
      if (current.kind === "collection") {
        const source = await readCollection(sources, ctx,
          { version: "fee-collection.v1", ...current }, actorMembershipId, this.now().toISOString());
        if (source.principalPence !== current.principalPence || source.decisionId !== current.decisionId
          || source.authorizationId !== current.authorizationId
          || source.statementId !== current.statementId || source.invoiceHash !== current.invoiceHash || source.sourceHash !== current.sourceHash
          || current.amountPence !== source.amountPence || BigInt(current.amountPence) > outstanding(book, source, current.commandId)) {
          if (current.purpose === "receipt_success_fee") return pauseSuccessFee("AUTHORITY_STALE");
          return refuse();
        }
      } else {
        const credit = parse(creditSourcesV1, await sources.credit({ version: "fee-refund.v1", ...current,
          settlementCommandId: current.settlementCommandId!, creditNoteId: current.creditNoteId!, creditHash: current.sourceHash }));
        const original = book.attempts.find(a => a.commandId === current.settlementCommandId);
        if (!original || original.state !== "settled") throw new FeeCollectionError("RECONCILIATION_REQUIRED");
        if (credit.actorMembershipId !== actorMembershipId || credit.decisionId !== current.decisionId || credit.tenantId !== ctx.tenantId || credit.jobId !== current.jobId || credit.invoiceId !== current.invoiceId
          || credit.invoiceHash !== current.invoiceHash || credit.creditNoteId !== current.creditNoteId || credit.creditHash !== current.sourceHash
          || credit.settlementCommandId !== current.settlementCommandId || credit.approvedAmountPence !== current.amountPence
          || credit.amountPence !== current.amountPence || Date.parse(credit.expiresAt) <= this.now().getTime()) return refuse();
      }
      if (current.kind === "collection" && current.purpose === "receipt_success_fee") {
        const reason = this.rails.find(r => r.name === current.rail)!.collectionPauseReason?.(ctx.tenantId);
        if (reason) return pauseSuccessFee(reason);
      }
      // Commit before network I/O. A crash from here keeps the balance reserved and requires reconciliation.
      transition(book, current, "outcome_unknown");
      return structuredClone(current);
    });
    const rail = this.rails.find(r => r.name === attempt.rail)!;
    const result = await rail.submit(ctx.tenantId, attempt);
    await this.store.transaction(ctx.tenantId, async book => {
      const current = book.attempts.find(a => a.commandId === commandId)!;
      // A signed settlement may arrive before the submit response.
      if (current.state !== "outcome_unknown") return;
      if (result.state === "definite_failure") transition(book, current, "released");
      else {
        current.providerObjectId = result.objectId;
        if (current.rail === "direct_debit") current.paymentState ??= "pending_submission";
        transition(book, current, "provider_accepted");
      }
    });
  }
}
