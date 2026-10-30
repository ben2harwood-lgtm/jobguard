# M4-15 dark Direct Debit specimen

RED: money. Built on the unmerged M4-12/M4-13 seams. This is deterministic,
in-memory, made-up sandbox evidence only. The fake payload/signature protocol is
not a claim about GoCardless's API or compatibility. No provider SDK is installed;
none is needed for this seam. The hosted URL uses the reserved `.invalid` domain.
No real endpoint, credentials, personal data, HTTP route, worker registration or
production adapter exists. Production is refused by the shared executor; its
adapter list defaults empty, and the fake advertises `productionEnabled: false`.

The fake setup consumes server-supplied approved Decision/notice assertions;
it does not authenticate a human or create authority. Provider defaults must be
disabled. One mandate per tenant is modelled; replacement and retry policy await
D04/D05. Created, pending submission, active, cancelled, failed and expired remain
separate; terminal events cannot be undone by delayed activation or setup replay.
Every user action resolves an unrevoked same-tenant finance:approve membership
from a session token; replays and execution remain bound to the original actor.
Standing terms are rechecked by M4-12 immediately before initiation. Mandate
revocation blocks new debit submission; accepted/unknown requests are reconciled.
Refunds return original settled funds without starting another debit mandate.

The shared tenant-serialized reservation store owns all card and debit balances.
Creating a debit request reserves value; pending submission, submitted and
confirmed are not payout. Only a signed `paid_out` fake event settles it. Every
webhook authenticates the bounded raw body with timing-safe signature comparison
before parsing. The fake signature binds the timestamp and permits at most 300
seconds of age or 60 seconds ahead. `directDebitWebhook` is a separate system
entry point: it uses verified signature plus environment/account/tenant bindings,
requires no user session, and can only record provider events. Its routing context
cannot authorize reservation, collection execution or refund actions. Batch events have
separate transactions/results, content-bound IDs, strict environment/account
routing and exact tenant/command/object/amount bindings. Duplicate objects do not
repeat allocation. Errors and audit contain only codes/identifiers/states.

Definite pre-confirmation failure/cancellation releases the reservation. Late
failure, chargeback, failure after confirmation/payout, or progress after release
retains the shared `reconciliation_required` hold, never automatically opens the balance for another
rail. Stale progress never regresses payout. A refund reserved before a later
collection reversal is refused at execution. A hold blocks new reservations,
refunds and already reserved replacements on either rail. Refunds are capped at
immutable settled principal, excluding tax. The existing immutable invoice,
current final-account revision, attribution, credit and exact-money checks apply
to both rails. No shadow queries or new money calculations were added.

No migration is needed: this slice adds no persistence or tables. M4-12's durable
ReservationStore implementation is still unregistered; in-memory tests prove the
seam, not PostgreSQL guarantees or restart durability of the fake provider.
Forward fix: keep the adapter unregistered if a fake lifecycle assumption changes.

NOT built: real provider protocol/settings, production endpoints/keys, durable
mandate/provider storage, manual reconciliation command/UI, notice sending,
replacement mandates, automated retries/dunning, live settlement or refund,
ledger postings, deployment. Production requires D04/D05 settings and notification
approval, D02/D01/D03/D13 as applicable, G4-S/G4-C, green CI on current main and one
independent Claude RED review. Sandbox success cannot satisfy those approvals.
Operational follow-up: a durable adapter must surface reconciliation holds and
per-event failures to the existing reconciliation workbench, without logging raw
payloads or signatures. No live alert or external action is introduced here.

Catch-up verification (29 October 2026): reconciled the M4-12 session/actor changes
with the M4-15 lifecycle using one reconciliation state and the existing event
processor. No new persistence or provider machinery was introduced. The installed
Vitest runner passed both `executor.test.ts` and `fake-gocardless.test.ts` (101 tests,
`--maxWorkers=2`). The installed TypeScript runner passed API `--noEmit`, and
`git diff --check` passed. The first test invocation could not resolve the unbuilt
config package; building its existing TypeScript output fixed local resolution.
The pnpm wrapper stalled before executing checks and was stopped; installed
binaries were used without downloading packages. Database/browser/full CI and the
independent RED review remain for the router/CI. Conflict markers are resolved in
files; the read-only git index still needs the router to stage the resolution.


M4-12 reservation persistence (0478): `PostgresReservationStore` implements the
shared seam with one tenant row lock, including concurrent first use. It is an
explicit server composition dependency, with no default registration. Its context
resolver must verify the caller's tenant authority; the executor separately checks
the current session/membership. Its source factory must read and lock current
invoice/statement/terms/credit revisions through the supplied transaction. A fake
source factory in the PostgreSQL tests is not a production source implementation.
Both rails must receive the same database-backed store. Provider calls remain
outside its transaction. Book state, event fingerprints and appended chain audit
commit together. Existing command bindings/events/audit cannot be rewritten by
this adapter; unknown outcomes remain reserved across restarts. The book is
internal reservation state, not a journal, invoice, receipt or settlement posting.
Only the reservation book is durable here: the fake provider and mandate still
use memory. Forward fix: stop new executor initiation and preserve the table and
audit while repairing; never roll back by dropping or clearing unknown attempts.
Database CI and the independent RED review must verify migration, row locking,
RLS and durability before merge. No live capability is enabled by this addition.


M4-12 reserve cleanup (RED, built ahead on reserve-pg): additive migration
`0499_fee_reservation_archive.sql` uses the finish list's spare build-ahead range;
the router must reconcile its number before integration. No earlier migration is
edited. Compaction is lazy on the next successful store transaction, under the
same tenant book lock. Released attempts, all event fingerprints and all book
audit entries move to INSERT-only tenant-qualified archive records before the
active book is rewritten. Released lifecycle snapshots are versioned append-only, including later failure
status changes. The history remains readable to the adapter; it is not deleted. Unknown, pending, settled and reconciliation attempts stay active.
Replays cannot create another release, reservation or chained audit entry.
A late settlement of an archived release restores an active reconciliation hold,
blocking an already reserved replacement. Refund replacements retain the original
settled-principal cap. No new replacement command or provider behavior is needed:
the executor already releases definite failures exactly once.

This keeps released-retry/event/audit history out of the repeatedly rewritten JSON
row. The existing whole-book callback interface still hydrates archived history
inside the transaction for replay, balance and late-event checks; memory and read
cost remain proportional to tenant history. Selective history reads would require
a separate interface change. The archive is internal state, with runtime SELECT
and INSERT only, FORCE RLS and no runtime UPDATE, DELETE or TRUNCATE. Existing
LP-0, tenancy, entitlement and SERIOUS-B5 expectations include exactly the added
table, primary key, grants and policy. No routine is recreated.

Forward fix: stop executor initiation, preserve both tables and chain audit, and
repair forward. Do not run the predecessor adapter on compacted books: it cannot
read archived command/event identities. Rolling back requires a reviewed forward
rehydration retaining active overrides, not dropping or clearing archive rows.
PostgreSQL concurrency, populated upgrade, rollback, RLS and catalogue tests are
added for CI; this sandbox cannot execute them. Independent RED review and green
CI against current main remain required. Fake sources/adapters only; no live rail,
real money, production source reader or release is enabled.
