import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "@jobguard/db";
import { FeeCollectionError, parse, pence, type Attempt, type CollectionBook, type LockedCollectionSources, type ReservationStore, type SignedProviderResult } from "./contracts.js";

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
  purpose: z.literal("receipt_success_fee").optional(),
  authorizationId: id.optional(),
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
const auditEntry = z.object({ commandId: id, state }).strict();
const bookV1 = z.object({ version: z.literal("fee-reservation-book.v1"),
  attempts: z.array(attempt), events: z.record(z.string(), hash),
  audit: z.array(auditEntry),
}).strict().superRefine((book, ctx) => {
  if (new Set(book.attempts.map(a => a.commandId)).size !== book.attempts.length)
    ctx.addIssue({ code: "custom", message: "Duplicate command" });
});

const archiveV1 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("attempt"), key: z.string().regex(/^[a-f0-9-]{36}:(0|[1-9][0-9]*)$/u), payload: attempt.refine(a => a.state === "released") }).strict(),
  z.object({ kind: z.literal("event"), key: z.string().min(1), payload: hash }).strict(),
  z.object({ kind: z.literal("audit"), key: z.string().regex(/^(0|[1-9][0-9]*)$/u), payload: auditEntry }).strict(),
]);
type ArchiveRecord = z.infer<typeof archiveV1>;
function releasedHistory(records: ArchiveRecord[]) {
  const latest = new Map<string, { revision: number; payload: Attempt }>();
  const releases = records.filter(r => r.kind === "attempt").sort((a, b) => Number(a.key.split(":")[1]) - Number(b.key.split(":")[1]));
  for (const record of releases) {
    const previous = latest.get(record.payload.commandId);
    const revision = (previous?.revision ?? -1) + 1;
    if (record.key !== `${record.payload.commandId}:${revision}`) throw new FeeCollectionError("COLLECTION_REFUSED");
    if (previous && identity(previous.payload) !== identity(record.payload)) throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
    latest.set(record.payload.commandId, { revision, payload: record.payload });
  }
  return latest;
}
function restore(active: z.infer<typeof bookV1>, records: ArchiveRecord[]) {
  const attempts = new Map([...releasedHistory(records)].map(([key, value]) => [key, value.payload]));
  const events: Record<string, string> = {};
  const audit = records.filter(r => r.kind === "audit").sort((a, b) => Number(a.key) - Number(b.key));
  if (audit.some((r, i) => r.key !== String(i))) throw new FeeCollectionError("COLLECTION_REFUSED");
  for (const record of records) {
    if (record.kind === "event") events[record.key] = record.payload;
  }
  for (const current of active.attempts) {
    const archived = attempts.get(current.commandId);
    if (archived && identity(archived) !== identity(current)) throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
    // A late provider fact can revive an archived release as reconciliation_required.
    attempts.set(current.commandId, current);
  }
  for (const [key, value] of Object.entries(active.events)) {
    if (events[key] && events[key] !== value) throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
    events[key] = value;
  }
  return parse(bookV1, { ...active, attempts: [...attempts.values()], events,
    audit: [...audit.map(r => r.payload), ...active.audit] });
}
/** Server-only, dark store: no route or live rail is registered. One row lock serializes
 * both rails and refunds for a tenant, including first-use races. The server-supplied
 * source factory MUST read and lock current sources using this transaction only.
 * The caller supplies its verified context, including outside the executor.
 */
export class PostgresReservationStore implements ReservationStore {
  readonly transaction: ReservationStore["transaction"];

  constructor(pool: Pool,
    context: VerifiedTenantContext,
    sources: (db: TenantTransaction) => LockedCollectionSources) {
    // Keep the caller's whole verified context in the transaction closure.
    this.transaction = async <T>(tenantId: string, work: (book: CollectionBook, sources: LockedCollectionSources) => Promise<T>, providerResult?: () => SignedProviderResult | undefined): Promise<T> => {
      if (context.tenantId !== tenantId) throw new FeeCollectionError("COLLECTION_REFUSED");
      return withTenant(pool, context, async db => {
        await db.$client.query(`INSERT INTO app.fee_reservation_book(tenant_id) VALUES($1) ON CONFLICT DO NOTHING`, [tenantId]);
        const row = await db.$client.query(`SELECT app.lock_fee_reservation_book($1) AS book`, [tenantId]);
        const active = parse(bookV1, row.rows[0]?.book);
        const history = await db.$client.query(`SELECT kind, key, payload FROM app.fee_reservation_archive WHERE tenant_id=$1 ORDER BY kind,key`, [tenantId]);
        const archived = parse(z.array(archiveV1), history.rows);
        const original = restore(active, archived);
        const book: CollectionBook = structuredClone(original);
        const result = await work(book, sources(db));
        const next = parse(bookV1, { ...book, version: "fee-reservation-book.v1" });
        // Existing command identities, event fingerprints and audit entries cannot disappear or be rewritten.
        if (original.attempts.some(a => !next.attempts.some(b => b.commandId === a.commandId && identity(b) === identity(a)))
          || Object.entries(original.events).some(([key, value]) => next.events[key] !== value)
          || JSON.stringify(next.audit.slice(0, original.audit.length)) !== JSON.stringify(original.audit))
          throw new FeeCollectionError("IDEMPOTENCY_CONFLICT");
        // The routine authenticates lifecycle results, archives and seals audit atomically.
        await db.$client.query(`SELECT app.replace_fee_reservation_book($1,$2::jsonb,$3::jsonb)`,
          [tenantId, JSON.stringify(next), JSON.stringify(providerResult?.() ?? null)]);
        return result;
      });
    };
  }
}
