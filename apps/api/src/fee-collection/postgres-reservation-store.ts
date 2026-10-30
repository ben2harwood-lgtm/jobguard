import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch, withTenant, type TenantTransaction, type VerifiedTenantContext } from "@jobguard/db";
import { FeeCollectionError, parse, pence, type Attempt, type CollectionBook, type LockedCollectionSources, type ReservationStore } from "./contracts.js";

const id = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const state = z.enum(["reserved", "outcome_unknown", "provider_accepted", "settled", "released", "reconciliation_required"]);
const attempt = z.object({
  version: z.literal("fee-collection.v1").optional(),
  kind: z.enum(["collection", "refund"]), commandId: id, fingerprint: hash, actorMembershipId: id,
  principalPence: pence, jobId: id, invoiceId: id, invoiceHash: hash, sourceHash: hash,
  statementHash: hash, statementId: id, amountPence: pence.refine(n => n > 0),
  rail: z.enum(["stripe_card", "direct_debit"]), decisionId: id, settlementCommandId: id.nullable(),
  settlementObjectId: z.string().nullable(), creditNoteId: id.nullable(), state,
  paymentState: z.enum(["pending_submission", "submitted", "confirmed", "paid_out", "failed", "cancelled", "charged_back", "late_failure"]).optional(),
  providerObjectId: z.string().nullable(),
}).strict().transform(({ version, paymentState, ...rest }) => {
  const lifecycle = paymentState === undefined ? rest : { ...rest, paymentState };
  return version === undefined ? lifecycle : { ...lifecycle, version };
});
// Only lifecycle fields may change after reservation; money and authorization stay bound.
const identity = (value: Attempt) => {
  const { state: _state, paymentState: _payment, providerObjectId: _object, ...immutable } = value;
  return JSON.stringify(immutable);
};
const bookV1 = z.object({ version: z.literal("fee-reservation-book.v1"),
  attempts: z.array(attempt), events: z.record(z.string(), hash),
  audit: z.array(z.object({ commandId: id, state }).strict()),
}).strict().superRefine((book, ctx) => {
  if (new Set(book.attempts.map(a => a.commandId)).size !== book.attempts.length)
    ctx.addIssue({ code: "custom", message: "Duplicate command" });
});

/** Server-only, dark store: no route or live rail is registered. One row lock serializes
 * both rails and refunds for a tenant, including first-use races. The server-supplied
 * source factory MUST read and lock current sources using this transaction only.
 * Resolving a verified context is required even when called outside the executor.
 */
export class PostgresReservationStore implements ReservationStore {
  constructor(private readonly pool: Pool,
    private readonly context: (tenantId: string) => Promise<VerifiedTenantContext>,
    private readonly sources: (db: TenantTransaction, context: VerifiedTenantContext) => LockedCollectionSources) {}

  async transaction<T>(tenantId: string, work: (book: CollectionBook, sources: LockedCollectionSources) => Promise<T>): Promise<T> {
    const context = await this.context(tenantId);
    if (context.tenantId !== tenantId) throw new FeeCollectionError("COLLECTION_REFUSED");
    return withTenant(this.pool, context, async db => {
      await db.$client.query(`INSERT INTO app.fee_reservation_book(tenant_id) VALUES($1) ON CONFLICT DO NOTHING`, [tenantId]);
      const row = await db.$client.query(`SELECT book FROM app.fee_reservation_book WHERE tenant_id=$1 FOR UPDATE`, [tenantId]);
      const original = parse(bookV1, row.rows[0]?.book);
      const book: CollectionBook = structuredClone(original);
      const result = await work(book, this.sources(db, context));
      const next = parse(bookV1, { ...book, version: "fee-reservation-book.v1" });
      // Existing command identities, event fingerprints and audit entries cannot disappear or be rewritten.
      if (original.attempts.some(a => !next.attempts.some(b => b.commandId === a.commandId && identity(b) === identity(a)))
        || Object.entries(original.events).some(([key, value]) => next.events[key] !== value)
        || JSON.stringify(next.audit.slice(0, original.audit.length)) !== JSON.stringify(original.audit))
        throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
      await db.$client.query(`UPDATE app.fee_reservation_book SET book=$2::jsonb WHERE tenant_id=$1`, [tenantId, JSON.stringify(next)]);
      // The audit head is the final lock: source readers and book persistence finish first.
      await appendAuditBatch(db, next.audit.slice(original.audit.length).map(entry => {
        const current = next.attempts.find(a => a.commandId === entry.commandId);
        if (!current) throw new FeeCollectionError("COLLECTION_REFUSED");
        return { id: randomUUID(), version: "audit.v1" as const, actorRef: current.actorMembershipId,
          eventType: `fee.collection.${entry.state}`, subjectType: "fee_collection_attempt", subjectRef: entry.commandId,
          payload: { references: { invoice: current.invoiceId, rail: current.rail }, hashes: { fingerprint: current.fingerprint },
            classifications: { action: "financial" as const } } };
      }));
      return result;
    });
  }
}
