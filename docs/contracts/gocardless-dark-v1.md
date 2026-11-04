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

## M4-15 durable synthetic facts seam (0758)

`DirectDebitFixtureRepository` is separate from the in-memory fake rail, which
remains unwired and behaves as before. It records only already verified fake
mandate and collection-payment events. Callers must supply a genuine withTenant
context and independent server bindings (synthetic environment, fake account,
mandate, and accepted payment command/object/amount). Payload tenant or account
claims never select context. No signature or raw webhook is accepted as proof by
this repository; signature verification remains the rail's responsibility.

Initial mandate state must be `created`. Each later write compares the supplied
previous history head under a database lock. Exact event replays are idempotent
across process/pool restarts, changed content conflicts, and swapped known
references return the same not-found as foreign tenants. Calls use separate
transactions so one invalid batch member leaves no fact and does not stop others.
Reads return the full stored history and derive mandate/payment states with the
shared core lifecycle rules. Terminal mandates block new submission permanently;
this is a read answer, not execution authority. Payment payout appears only after
a stored `paid_out` event; failures, chargebacks and late failures stay distinct.
Facts and hashes are append-only under FORCE RLS; runtime has no direct table
access. No collection, reservation, settlement, release or financial posting occurs.

The initial review simplification (LATER / SIMPLICITY):
`apps/api/src/fee-collection/executor.ts:195` duplicates the payment progress
ordering now exported by `packages/core/src/direct-debit-lifecycle.ts`. A future
executor change can import that ordering to reduce maintenance drift; executor
and reservation behaviour are outside this slice.

This adds persistence only and does not complete M4-15. Real rail, application
wiring, notices, mandate replacement and retries await their own approvals and
D04/D05. PostgreSQL migration/upgrade/tenancy, restart/concurrency and immutable
fact tests require CI; green local unit checks are not database evidence or an
independent RED review.

## Optional signed-event recorder (M4-15 remains open)

The fake rail now accepts an optional `FakeDirectDebitRecorder` constructor port.
Its explicit async `recordWebhookBatch` method authenticates the bounded exact
body/timestamp before parsing, validates each member separately, then records
schema-valid mandate/collection events independently. Invalid members leave no
fact and do not prevent later valid members from being processed. A missing port
refuses recording. Existing synchronous verification, mandate setup/ingestion and
executor consumers retain their original behaviour; none are wired to this seam.

`DirectDebitFixtureRecorder` closes over caller-verified context and copies trusted
mandate/request bindings at construction. It never resolves a tenant or request
binding from payload fields. Tenant, account, mandate, command, object and amount
must match those bindings; refunds are refused. Each call reads the durable head
and uses the repository's existing compare-and-append transaction. Exact replays
return event IDs from stored history, including after a fresh rail/pool. Changed
content or competing new events preserve the store conflict; no automatic retry
is introduced. Stored lifecycle projections remain the repository's authority:
submission/confirmation is not payout, delayed progress cannot revive terminal
states, and only a stored `paid_out` event can project payout.

This adds no migration, role, grant, route, application registration or financial
write. The new real-PostgreSQL test sends signed bodies through fresh rails and
pools, checks concurrent duplicate delivery, forgery/routing/batch rejection and
lifecycle ordering, and snapshots all tenant-owned app rows outside the fixture
facts to check that financial rows do not change. It is written for CI, not run
in this database-free sandbox. Local unit checks cannot establish those database
guarantees. Real rail, wiring, cross-rail reservations, refunds, notice/settings,
mandate replacement/retries and production gates remain held. M4-15 is not finished.
