import { createHash } from "node:crypto";
import { checkSyntheticSubscriptionAgreement } from "@jobguard/core";
import { collectionIntentV1, collectionSourcesV1, creditSourcesV1, FeeCollectionError, parse, refundIntentV1,
  type Attempt, type CollectionBook, type CollectionIntent, type CollectionSources, type ReservationStore,
  type VerifiedCollectionContext } from "./contracts.js";
export interface CollectionRail {
  readonly name: "stripe_card" | "direct_debit";
  readonly environment: "synthetic_demo";
  verifyWebhook(body: string, signature: string): RailEvent;
  submit(tenantId: string, attempt: Readonly<Attempt>): Promise<{ state: "provider_accepted"; objectId: string } | { state: "definite_failure" }>;
}
export type RailEvent = Readonly<{ eventId: string; tenantId: string; commandId: string;
  objectId: string; amountPence: number; kind: "collection" | "refund"; state: "settled" | "definite_failure" }>;
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const refuse = (): never => { throw new FeeCollectionError("COLLECTION_REFUSED"); };
function transition(book: CollectionBook, attempt: Attempt, state: Attempt["state"]) {
  attempt.state = state;
  book.audit.push({ commandId: attempt.commandId, state });
}
function context(ctx: VerifiedCollectionContext) {
  if (ctx.environment !== "synthetic_demo" || ctx.membershipVerified !== true) throw new FeeCollectionError("COLLECTION_DARK");
}
function match(book: CollectionBook, commandId: string, hash: string) {
  const prior = book.attempts.find(a => a.commandId === commandId);
  if (prior && prior.fingerprint !== hash) throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
  return prior;
}
function validate(raw: unknown, ctx: VerifiedCollectionContext, intent: CollectionIntent, now: string): CollectionSources {
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
function outstanding(book: CollectionBook, source: CollectionSources, excluding?: string) {
  const used = book.attempts.filter(a => a.kind === "collection" && (a.invoiceId === source.invoiceId || a.statementId === source.agreement.currentStatement!.statementId)
    && a.state !== "released" && a.commandId !== excluding).reduce((sum, a) => sum + BigInt(a.amountPence), 0n);
  // priorReceipts excludes settlements in this reservation book. Refunds never silently reopen debt.
  return BigInt(source.principalPence) + BigInt(source.taxPence) - BigInt(source.creditsPence)
    - BigInt(source.priorReceiptsPence) - used;
}
/** Server-only orchestration. No route, live adapter or default-on flag is registered. */
export class DarkFeeCollectionExecutor {
  constructor(private readonly store: ReservationStore, private readonly rails: readonly CollectionRail[] = [],
    private readonly now: () => Date = () => new Date()) {}
  async reserve(ctx: VerifiedCollectionContext, raw: unknown): Promise<Readonly<Attempt>> {
    context(ctx);
    const intent = parse(collectionIntentV1, raw);
    return this.store.transaction(ctx.tenantId, async (book, sources) => {
      const prior = match(book, intent.commandId, fingerprint(intent));
      if (prior) return structuredClone(prior);
      const source = validate(await sources.collection(intent.jobId, intent.invoiceId), ctx, intent, this.now().toISOString());
      if (BigInt(intent.amountPence) > outstanding(book, source)) return refuse();
      // Each decision approves the exact full statement, not a caller-selected partial debit.
      if (intent.amountPence !== source.agreement.amountPence) return refuse();
      const attempt: Attempt = { ...intent, kind: "collection", fingerprint: fingerprint(intent),
        statementId: source.agreement.currentStatement!.statementId,
        invoiceHash: source.invoiceHash, sourceHash: source.sourceHash, decisionId: source.collectionDecision.decisionId,
        settlementCommandId: null, settlementObjectId: null,
        creditNoteId: null, state: "reserved", providerObjectId: null };
      book.attempts.push(attempt); transition(book, attempt, "reserved");
      return structuredClone(attempt);
    });
  }
  async reserveRefund(ctx: VerifiedCollectionContext, raw: unknown): Promise<Readonly<Attempt>> {
    context(ctx);
    const intent = parse(refundIntentV1, raw);
    return this.store.transaction(ctx.tenantId, async (book, sources) => {
      const prior = match(book, intent.commandId, fingerprint(intent));
      if (prior) return structuredClone(prior);
      const credit = parse(creditSourcesV1, await sources.credit(intent));
      const original = book.attempts.find(a => a.commandId === intent.settlementCommandId && a.kind === "collection"
        && a.state === "settled" && a.invoiceId === intent.invoiceId && a.jobId === intent.jobId);
      const used = book.attempts.filter(a => a.kind === "refund" && a.settlementCommandId === intent.settlementCommandId
        && a.state !== "released").reduce((sum, a) => sum + BigInt(a.amountPence), 0n);
      if (!original || !original.providerObjectId || credit.tenantId !== ctx.tenantId || credit.jobId !== intent.jobId || credit.invoiceId !== intent.invoiceId
        || credit.invoiceHash !== original.invoiceHash || credit.creditNoteId !== intent.creditNoteId || credit.creditHash !== intent.creditHash
        || credit.settlementCommandId !== original.commandId || credit.approvedAmountPence !== intent.amountPence
        || credit.amountPence !== intent.amountPence || Date.parse(credit.expiresAt) <= this.now().getTime()
        || BigInt(intent.amountPence) + used > BigInt(original.amountPence)
        || book.attempts.some(a => a.kind === "refund" && a.creditNoteId === intent.creditNoteId && a.state !== "released")) return refuse();
      const attempt: Attempt = { kind: "refund", commandId: intent.commandId, fingerprint: fingerprint(intent),
        jobId: intent.jobId, invoiceId: intent.invoiceId, invoiceHash: original.invoiceHash,
        sourceHash: intent.creditHash, statementHash: original.statementHash, statementId: original.statementId, amountPence: intent.amountPence,
        rail: original.rail, decisionId: credit.decisionId, settlementCommandId: original.commandId,
        settlementObjectId: original.providerObjectId, creditNoteId: intent.creditNoteId,
        state: "reserved", providerObjectId: null };
      book.attempts.push(attempt); transition(book, attempt, "reserved");
      return structuredClone(attempt);
    });
  }
  async webhook(ctx: VerifiedCollectionContext, railName: CollectionRail["name"], body: string, signature: string) {
    context(ctx);
    const rail = this.rails.find(r => r.name === railName && r.environment === "synthetic_demo");
    if (!rail) throw new FeeCollectionError("COLLECTION_DARK");
    const event = rail.verifyWebhook(body, signature);
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
      if (attempt.state === "released" && event.state === "definite_failure" && attempt.providerObjectId === event.objectId) {
        book.events[eventKey] = hash; return;
      }
      if (attempt.state === "reserved" || attempt.state === "released") throw new FeeCollectionError("RECONCILIATION_REQUIRED");
      if (event.state === "definite_failure" && attempt.state === "settled") throw new FeeCollectionError("RECONCILIATION_REQUIRED");
      attempt.providerObjectId = event.objectId;
      if (attempt.state !== "settled") transition(book, attempt, event.state === "settled" ? "settled" : "released");
      book.events[eventKey] = hash;
    });
  }
  async execute(ctx: VerifiedCollectionContext, commandId: string): Promise<void> {
    context(ctx);
    const attempt = await this.store.transaction(ctx.tenantId, async (book, sources) => {
      const current = book.attempts.find(a => a.commandId === commandId);
      if (!current) return refuse();
      if (current.state !== "reserved") throw new FeeCollectionError("RECONCILIATION_REQUIRED");
      if (!this.rails.some(r => r.name === current.rail && r.environment === "synthetic_demo")) throw new FeeCollectionError("COLLECTION_DARK");
      if (current.kind === "collection") {
        const source = validate(await sources.collection(current.jobId, current.invoiceId), ctx,
          { version: "fee-collection.v1", ...current }, this.now().toISOString());
        if (source.collectionDecision.decisionId !== current.decisionId
          || source.agreement.currentStatement!.statementId !== current.statementId || source.invoiceHash !== current.invoiceHash || source.sourceHash !== current.sourceHash
          || current.amountPence !== source.agreement.amountPence || BigInt(current.amountPence) > outstanding(book, source, current.commandId)) return refuse();
      } else {
        const credit = parse(creditSourcesV1, await sources.credit({ version: "fee-refund.v1", ...current,
          settlementCommandId: current.settlementCommandId!, creditNoteId: current.creditNoteId!, creditHash: current.sourceHash }));
        if (credit.decisionId !== current.decisionId || credit.tenantId !== ctx.tenantId || credit.jobId !== current.jobId || credit.invoiceId !== current.invoiceId
          || credit.invoiceHash !== current.invoiceHash || credit.creditNoteId !== current.creditNoteId || credit.creditHash !== current.sourceHash
          || credit.settlementCommandId !== current.settlementCommandId || credit.approvedAmountPence !== current.amountPence
          || credit.amountPence !== current.amountPence || Date.parse(credit.expiresAt) <= this.now().getTime()) return refuse();
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
      else { current.providerObjectId = result.objectId; transition(book, current, "provider_accepted"); }
    });
  }
}
