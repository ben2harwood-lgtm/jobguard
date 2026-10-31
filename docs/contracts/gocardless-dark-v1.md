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

## MON-4B: receipt success fees (synthetic, real MON-4A reader)

Plan: MON-4 / §10.3.4, M4-15 and §12.4. RED money. Repair 1 addresses
independent review of 4a11b726: the original slice only registered a fake source
in tests. `createSuccessFeeDirectDebitExecutor` now registers
`PaymentFeeCollectionRepository` over the actual MON-4A 0359 tables and routines.
The existing stand-in remains a unit-test double only. No migration is needed;
there are no new grants, schema objects, source writers or provider routes.

The caller supplies an explicit owner pool, the stamped PracticeAccess context
and session digest unchanged, the shared reservation store, sessions and fake
rails. The repository uses `withTenant` plus `practiceMaterialPool` and refuses
outside synthetic_demo. Each source read calls `app.payment_fee_actor`, which
reauthenticates current ownership/membership and the synthetic database and takes
MON-4A's existing case/allocation/session locks. Every statement lookup has tenant,
job and statement predicates. The reader invokes `app.payment_fee_current` to
recompute settlement/qualification, prior-statement source freshness and disputes.
It reads the immutable document from `app.payment_fee_statement` and the exact
`app.action_authorization` via `app.payment_fee_command`, binding its approved
Decision resolution, current actor, recipient, hash/revision, policy, amount and
currency. The authorization row is locked against revocation until the reservation
callback finishes. No historical replay or read-view status is used as a token.

MON-4A has no platform invoice. For this synthetic statement-collection path,
`CollectionIntent.invoiceId` is the **fee statement ID**, the existing reservation
interface's balance key. It is never the customer's invoice ID. `statementHash`
and amount bind the immutable statement; feePence is consumed unchanged, without
new rounding, allocation, fee formula or VAT calculation. Credits/prior fee
receipts outside the shared reservation book do not exist on this MON-4A slice;
reversals invalidate current source authority, and book settlements/refunds retain
the existing reservation/reconciliation behavior. No customer payment is mutated.

The composition encloses each reservation-store callback in the tenant SQL read
transaction. Source locks remain held through its local reservation/dispatch
transition; both complete before provider I/O. The store remains shared across
card and DD and retains command/balance uniqueness. Production storage is still
unregistered; this work does not claim restart durability for an in-memory store
or fake provider. Real database source verification and fake provider settlement
are distinct evidence.

0359 states map to bounded `SuccessFeeCollectionError.reason` values:
`disputed` → `AUTHORITY_DISPUTED`, `approval_revoked` → `AUTHORITY_REVOKED`,
`approval_expired` → `AUTHORITY_EXPIRED`, and changed/missing/unapproved authority
→ `AUTHORITY_STALE`. A pre-dispatch pause preserves the reservation and makes no
provider call. The original scoped fake-source reasons and local mandate checks
remain. Accepted or unknown requests are reconciled rather than resubmitted.
Payout reversal blocks replacement attempts on both rails.

Standing authority is unchanged and fake-only: MON-4A still returns
standingAuthority null. The real reader emits only exact statement authority.
There is no standing grant/renewal writer, production consent, SDK, live endpoint,
worker or HTTP route. Production remains refused (`productionEnabled:false` on
the fake), subject to all separate commercial/security approvals and G4-S.
The shadow-30000 demo definitions are untouched: £41,280 received, £800 qualifying,
£80 fee and £720 before tax; VAT remains uncalculated in simulation.

Repair 1 checks (30 October 2026):
- Existing three collection Vitest files: 128 passed, maxWorkers=2.
- payment-fee-collection-repository.test.ts: 9 passed, maxWorkers=2.
- success-fee-composition.test.ts: 3 passed, maxWorkers=2; verifies real-reader
  registration overrides a test stand-in and preserves specific pause reasons.
- DB/API TypeScript, integration-test type checking, diff whitespace, money
  arithmetic and commercial-boundary checks passed. The exact slice lane check
  since issued base b1c91ec6 passed for 14 paths (13 non-lane paths), excluding
  inherited predecessor changes against main.
- PostgreSQL integration suite is authored in packages/db/test and discovered by
  the installed repository Vitest runner. It creates actual MON-4A statements and
  approvals using the real allocator, attribution and payment-fee writers, then
  drives the concrete composition and fake DD rail. Cases cover once-only
  collection/replay, disputed/revoked/expired dispatch, cross-tenant refusal,
  runtime read denial and unchanged customer payments. Only the reservation book
  and payment rail are test doubles. The expiry negative control follows MON-4A's
  existing rollback-only protected-row expiry technique; positive fixtures keep
  all integrity controls enabled.

No PostgreSQL or browser suite was executed in this sandbox. This built-ahead
base does not yet contain MON-4A migration 0359; coordinator/CI must run the suite
with its main dependencies integrated. Test discovery initially needed the
existing storage build output; it was built without downloading packages.
Full CI/lane comparison and one independent Claude RED review remain required.
The earlier main-comparison lane failure includes inherited M4-12/M4-13/M4-15
changes; this lane is not broadened to absorb those predecessor changes. All new
paths are explicitly listed in config/lanes/mon-4b.json. No acceptance or live
MON-4B completion is inferred from source inspection, local unit tests or discovery.

Catch-up verification (31 October 2026): merged current main in the worktree and
resolved only the core/DB export conflicts by retaining both sides' exports.
Shared LP inventories, tenancy/serious-b5 expectations, watchdog registry and
customer-signin tests match main; no unions were necessary. No routines, routes,
migrations or collection behaviour changed. Targeted installed Vitest runs passed
140 tests: executor, success-fee-direct-debit and success-fee-composition (94),
fake-gocardless (37), and payment-fee-collection-repository (9), each with at most
two workers and three named files. Installed TypeScript builds passed for core,
storage, config and DB; API TypeScript --noEmit passed. Money arithmetic,
commercial boundary and whitespace checks passed. PostgreSQL/browser suites remain for GitHub CI; this
sandbox cannot start PostgreSQL or bind localhost. The router must stage the two
resolved export files because the Git index is read-only here. Existing RED
review evidence predates this merged head; exact-head review and green CI remain
required before merge. No live capability or approval is inferred.
