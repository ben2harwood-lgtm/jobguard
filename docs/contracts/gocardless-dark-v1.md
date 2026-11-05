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
explicit server composition dependency, with no default registration. Its caller
supplies the whole verified tenant context; the executor separately checks
the current session/membership. Its source factory captures that caller context
and must read and lock current invoice/statement/terms/credit revisions through
the supplied transaction. A fake
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
`0604_fee_reservation_archive.sql` follows the shared reservation book migration
`0603_fee_reservation_book.sql`; both numbers are claimed for this catch-up. No earlier migration is
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


M4-12 reserve cleanup landing preparation, 4 November 2026 (NOPR, RED):
resolved the contractor-entitlement upgrade merge as the union of both lists;
registered the two reservation tables in later-empty-tables. The dark store now
captures the caller-supplied verified context and transaction source factory,
rather than retaining context-bearing callbacks as class properties. All local
callers are synthetic fixtures; no application route composes this store. Tenant
matching, withTenant verification, source locking, reservation and replay behavior
remain covered without weakening the context guard. No migration was changed or
added in this preparation; 0607/0608 and their proof fragments remain intact.

Local deterministic evidence: installed Vitest 4.1.12 with --maxWorkers=2 passed
context-boundary, postgres-reservation-store and executor (221 tests),
watchdog-registry and identity (133 tests), and migration-proof-loader (76 tests).
Initial runs used stale dependency output and failed; rebuilding the five library
packages with installed tsc resolved the import/schema failures. The context
boundary failure was repaired in the store, without guard exemptions. PL/pgSQL
CASE lint passed all 233 migrations, and git diff --check passed.

The pnpm typecheck and pnpm test wrappers stalled after their package-settings
warning; installed binaries were used instead. Direct tsc compilation/typechecking
passed for core, config, storage, db, ai, api and web. The normal lane tool was run and
refused incoming main files still staged against the pre-merge HEAD. A separate
read-only comparison against origin/main verifies the lane allow equals exactly
all eleven changed non-lane files and only this piece's lane differs. The router
must stage the resolved file, finish the merge and rerun the normal lane check.
No Git writes, fetch, database, browser, live provider or paid call were made.
CI must prove PostgreSQL concurrency, RLS/grants, atomic rollback, populated
upgrades and preservation proofs, plus the full required suites. Independent RED
review at the final head remains required before landing.
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

Catch-up verification (2 November 2026): MON-4B, no migration. Resolved the two
core/DB barrel conflicts as the exact union of both sides, retaining each export
once. Updated the existing MON-4B lane. No collection behavior, routines, tests,
expectations, migration SQL, LP inventories or protected journey files changed.
The LP catalogs, tenancy/serious-b5 expectation files, privilege snapshot and
legacy migration inventory match origin/main byte-for-byte. All migration SQL
matches origin/main; there are no branch-added migrations or proofs to renumber.

Installed Vitest 4.1.12 checks, each with --maxWorkers=2 and at most three named files:
- API executor.test.ts, success-fee-direct-debit.test.ts and
  success-fee-composition.test.ts: 94 passed.
- API fake-gocardless.test.ts: 37 passed.
- DB src/payment-fee-collection-repository.test.ts: 9 passed.
Installed TypeScript --noEmit with each package's tsconfig.json passed for API,
DB and core. Both staged and working-tree whitespace checks passed. The pnpm
wrapper stalled before executing checks and was stopped; installed binaries were
used without downloading packages. An initial root-tsconfig invocation was
incorrect: it includes unrelated package sources without their package settings
and reported decorator/JSX/test typing errors. The corrected package invocations
above passed; that root invocation is not evidence of a repository check failure.

READY for router staging/commit on the same branch, NOPR=1. The read-only Git index
still lists the two resolved export files as unmerged; the router must stage them.
PostgreSQL, browser and full required CI checks were not run here and remain due
when the freeze permits CI. One independent RED review of the exact final head
remains required before merge. Shared fee-collection paths with M4-12 and M4-15
must serialize integration. All production gates remain closed.

Catch-up verification (3 November 2026): MON-4B, NOPR, no migration. Resolved
only the DB barrel conflict by preserving the collection repository export and
main's offline-upload export. The remaining diff against the merged main contains
only MON-4B's existing slice and its lane; removed the stale core barrel entry
from that lane. No tests, expectations, SQL routines or collection behavior changed.
All migration SQL and predecessor lane files match the merged main.

Installed Vitest 4.1.12, --maxWorkers=2, at most three named files per invocation:
- executor, success-fee-direct-debit, success-fee-composition: 94 passed.
- fake-gocardless and m4-23-sb-rails: 40 passed.
- payment-fee-collection-repository: 9 passed.
Installed package TypeScript --noEmit passed for API, DB and core. Money arithmetic,
commercial boundary and diff whitespace checks passed. The pnpm wrapper stalled
before invoking checks and was interrupted; installed binaries were used without
package downloads. PostgreSQL, browser and full CI suites remain unproved here.
Exact-head independent RED review and green CI remain required before merge.
READY for router staging and commit; the read-only index still records the DB
barrel as unmerged even though its working-tree conflict markers are resolved.

Catch-up verification (3 November 2026): MON-4B, RED, NOPR. Incoming main is
111865cf65f5e68a28ce1891bd52aad0ac7a0f10 (MERGE_HEAD/origin/main; the local main
ref is older). Core exports now match incoming main exactly; DB exports retain
main's offline-intent review and MON-4B's collection repository. Removed the
inherited MON-4B lane in favour of the exact mon-4b-collect-recheck lane.

Renamed only the branch migration/proof stem from
0601_payment_fee_collect_recheck to 0678_payment_fee_collect_recheck, and updated
the upgrade test to main's 0527_payment_fee_collect_review predecessor. No main
migration was edited; no new table or second migration is needed. Source comparison
verified that the recreated writer equals main's latest 0527 body except for
replacing its inline review loop with the shared current-review helper. Existing
payment_fee_actor authentication/locking, command identity, fee calculation and
append_final_check_audit are preserved. The latter's latest 0520 implementation
calls app.lp4_seal_audit with checked_operation; this branch does not replace or
bypass it. No entitlement, command-authority or audit helper is recreated.
Main's standing-authority support remains intact; MON-4B's existing reader still
requires an exact statement authorization and enables no production collection.

Installed Vitest 4.1.12 runs, each with --maxWorkers=2 and no more than three
named files: DB src/payment-fee-collection-repository.test.ts plus
test/migration-proof-loader.test.ts passed 89 tests; API executor.test.ts,
success-fee-direct-debit.test.ts and success-fee-composition.test.ts passed 94;
API fake-gocardless.test.ts passed 37. Total: 220 tests. Core, DB and API package
TypeScript checks passed using installed tsc; core, DB and config build output
was generated locally for package imports. The first API test attempt found
missing config build output and ran no tests; after the config build all passed.
The pnpm version probe stalled and was stopped; no packages were downloaded.
Money arithmetic and commercial-boundary checks passed. No expectations were
weakened; integration-test edits only update migration references and its label.

READY for router staging and commit, NOPR. Conflict markers are resolved in the
working files; the read-only index still requires router staging. PostgreSQL and
browser suites, full CI and independent RED review of the exact resulting head
remain required before merge. No live services, real data or production approvals
were used. Shared collection files still serialize integration with other pieces.
Working-tree lane validation against incoming main passed for all 15 non-lane
paths, with only this piece's lane added, no conflict markers, valid migration
ordering and clean diff whitespace. This is a deterministic working-tree check;
the standard committed-head lane gate remains for CI after router staging.


Batch-13 union verification (3 November 2026), MON-4B collect recheck, RED, NOPR:
The two preceding catch-up receipts are historical. This batch uses the available
origin/main bc8993090 (local main is stale); no fetch was run. Kept both sides'
contract notes and all HEAD DB exports, including resumable evidence, offline
review and the collection repository. No new collection behavior was introduced.
The branch-only migration and proof are now 0678_payment_fee_collect_recheck;
all main migration bytes are unchanged. The writer matches main's latest 0527
body after substituting the shared review helper for its inline loop. Existing
entitlements, command authority and LP4-sealed audit remain in place. No new
tables need later-empty-tables registration. Removed the incoming piece lane;
batch-13's lane covers exactly all 49 non-lane paths differing from origin/main,
including pre-existing batch work retained by this union.

Local verification used installed Vitest 4.1.12, --maxWorkers=2, sequential runs
of at most three named files: DB payment-fee-collection-repository and
migration-proof-loader (89 passed); API executor, success-fee-direct-debit and
success-fee-composition (94 passed); API fake-gocardless and m4-23-sb-rails
(40 passed). Total: 223 tests. Money arithmetic, commercial-boundary and
working-tree lane/proof/main-SQL checks passed. No test was weakened.
The initial API typecheck read an incomplete DB barrel during conflict
resolution; the complete barrel was restored before the final typechecks.

Final installed package checks: packages/core, packages/db and apps/api each
passed `./node_modules/.bin/tsc -p tsconfig.json --noEmit` in its own directory.
DB was checked again after restoring the complete barrel; the final API run
passed. `node tools/money-arithmetic-lint.mjs`,
`node tools/commercial-boundary-lint.mjs` and `git diff --check` passed.

READY for router staging and merge completion, RED, NOPR. The read-only index
still records unmerged entries; resolved working files are the handoff. CI must
prove real PostgreSQL fresh/upgrade/proof/catalog/privilege behavior, including
success-fee-direct-debit.integration.test.ts's stale/revoked/expired and row-lock
wait cases, plus mandatory full checks and applicable browser journeys. An
independent RED review must pass at the exact resulting head before merge.
No database/browser suite was run locally, and no live service or real data was
used. Forward fix or revert the new migration only before deployment; do not
edit previously applied main migrations.


Batch-13 PR landing union (4 November 2026), MON-4B collect recheck, RED:
This receipt supersedes the historical NOPR/numbering handoffs above. Incoming
main is 84c57224bb39f51f7ec6f93405d8b0798ad9426d (top migration 0586).
Resolved the DB barrel and plan-entitlement-lifecycle upgrade conflicts by
retaining both sides' exports and exact named routine exceptions. The existing
hardened collection work is preserved. The sole branch migration and proof are
renamed by stem from 0678 to 0587_payment_fee_collect_recheck. Main has no copy
of this helper/recheck; no migration was dropped or split. Main's migration
bytes are unchanged. Compared with the latest 0527 writer, 0587 only replaces
the inline review loop with the existing hardened shared helper and removes
its unused local variables. No new product behavior was added in this union.

Static recheck: no new tables, table-column shape changes, command kinds or
routes; no new CI images or web files relative to incoming main. No SET app.*
function clause or command_lifecycle_claim access in 0587. The existing actor,
command-authority and LP4-sealed audit paths are retained. Branch tests contain
no raw practice-session revocation or direct outbound-pause clearing. Incoming
restore-reconciliation-upgrade retains laterEmptyTables. Existing web routes
were source-checked for direct apps/api source imports; none were found. No
Cloudflare build was attempted in this constrained environment.

Local checks used the installed package binaries, sequential Vitest invocations
with --maxWorkers=2 and at most three named files per invocation:
- API auth/context-boundary + auth/identity: 152 passed.
- DB migration-proof-loader + payment-fee-collection-repository: 89 passed.
- API watchdog-registry + success-fee-direct-debit + success-fee-composition:
  156 passed.
- API fee-collection/executor + fake-gocardless + ai-capture-authority: 111 passed.
- DB subscription-stripe-sandbox-adapter + subscription-webhook-verifier:
  40 passed.
- AI gateway + later-gateway + claude-provider: 79 passed.
- Core shadow-pilot-report: 16 passed.
Total: 643 Vitest tests; node --test tools/ai-provider-boundary.test.mjs also
passed all 5 tests. Money-arithmetic, commercial-boundary and AI-provider
boundary linters passed. Installed tsc passed for core, config, DB, API and AI
(core/config/DB emitted package build output for imports; API/AI used --noEmit).
Root pnpm typecheck and pnpm test invocations stalled before useful output and
were interrupted. The initial watchdog run failed on stale core dist output;
it passed after rebuilding core/config/DB. No expectations were weakened.

The standard lane command was run and refuses the unfinished read-only index,
which still contains incoming-main changes and the old migration stem. A
working-tree comparison against MERGE_HEAD, including untracked renamed files,
passes the existing lane matcher: exactly 50 non-lane paths, no self-listed
lane file, unchanged main migration bytes, valid consecutive 0587 ordering and
no conflict markers. git diff --check passed. These are deterministic local
checks, not independent review or PostgreSQL/browser evidence.

READY for router staging, merge completion, commit, push and PR opening. CI
must prove the full mandatory checks, fresh/upgrade/replay PostgreSQL migrations,
proof/catalog/privilege/RLS guarantees, plan-entitlement-lifecycle and restore
upgrade snapshots, and success-fee-direct-debit integration tests (including
stale/revoked/expired review and real authorization row-lock waits), plus
applicable browser journeys. No local DB/browser suite ran. Independent RED
review must PASS at the exact resulting head and required CI must be green
before merge. Synthetic data and fake payment rails only; production gates
and required external approvals remain unchanged.


Batch-20 landing attempt (5 November 2026), M4-15 debit store / ENT-8a prompt sources, RED:
Incoming main: 108373dc9e9ff496931419193cf983cb27f2d873 (top migration 0594;
0595 reserved for #560). Resolved working-file conflicts in both barrels, both
contracts and laterEmptyTables by retaining both sides. Kept the batch-20
hardened observation route pending the incompatibility below. Removed its
duplicate watchdog registry key. Renamed only the full migration filename stem
from 0855_direct_debit_fixture_facts to 0596_direct_debit_fixture_facts across
SQL/proof/note paths and references. No main migration has the same store, and
all main SQL bytes are unchanged. Added only the requested 240-second beforeAll
timeout in recovery-eligibility-v3.integration.test.ts. Materials form buttons
now use explicit AA-contrast foreground/background colours, including busy state.

NOT READY / do not commit: exact-union route conflict. Main routes observations
through possibleExtrasResponse / EnterpriseLivePromptApplication, returning 403
EXTRA_FORBIDDEN and passing the repository answer through. This batch routes
through promptSourcesResponse, projecting only observationId plus validated
evaluation and hiding EXTRA_FORBIDDEN as 404 NOT_FOUND. The incoming route test
expects 403 and mocks only {observationId}; the retained hardened route requires
evaluation, so that successful-response assertion receives 503. These contracts
cannot both hold for the same route without choosing behaviour or changing a
test expectation. Keep the hardened route and obtain a scoped reconciliation
order; do not weaken either test or silently remove the hardening.

Local checks (installed binaries, Vitest --maxWorkers=2, <=3 named files/run):
- Core direct-debit-lifecycle: 2 passed.
- DB direct-debit-fixture-repository + migration-proof-loader: 84 passed.
- API direct-debit-fixture-recorder + fake-gocardless-recorder + fake-gocardless:
  48 passed.
- API auth/context-boundary + auth/identity + watchdog-registry: 278 passed.
- Web prompt-sources-server + materials-issues + possible-extras/route: final
  run 29 passed, 1 failed (route conflict above). Initial run lacked API dist;
  built the installed API package and reran. No package downloads.
- Installed tsc passed core, config, DB and API emitting build output; API and
  web --noEmit checks passed. Core initially found the duplicate registry key;
  it passed after deduplication.
- Money arithmetic, commercial boundary, commercial integrity boundary and
  current-source guards passed; both integrity guards had 0 diagnostics with
  their existing 9 unresolved baselines. No fingerprint was changed.
- Standard lane lint ran and failed because the read-only unfinished index still
  contains incoming-main paths and the old 0855 stem. A working-file comparison
  with MERGE_HEAD using the existing lane matcher/order functions passed: 30
  non-lane paths, no self-listing, sole new SQL 0596, main SQL unchanged.
- git diff --check passed. No provider-register data-flow source changed, no
  new CI image, and no new runtime writes to protected command tables. New
  private tables are in laterEmptyTables; restore-reconciliation-upgrade uses it.
  No command_lifecycle_claim access, SET app.* function clause, direct session
  revocation or outbound-pause clearing was added. New server transport is
  server-only; changed web routes do not directly import API source. Cloudflare
  build was not run in this restricted environment; source inspection was used.

LATER / SIMPLICITY: apps/web/app/lib/prompt-sources-server.ts duplicates the
existing live-prompt application transport. After explicitly reconciling denial
status and response projection contracts, one shared transport would reduce
authorization/error handling drift. This observation does not block by itself.

No PostgreSQL or browser suites were run here. CI still must prove migration
fresh/upgrade/catalogue/privilege/RLS and immutable replay guarantees; the two
Direct Debit integrations, source route integration, recovery eligibility hook,
restore snapshots and phone/desktop ENT-8a browser journey; full mandatory
checks and exact-head independent RED review remain required before merge.
No git write, push, PR, real data, live provider or release action was performed.

### Batch-20 reconciliation follow-up — 5 November 2026

READY for router commit/push/PR; supersedes the NOT READY observation-route
conflict above. Applied the router's ruling: observations retain main's public
403 EXTRA_FORBIDDEN while keeping the strict validated evaluation projection.
Materials/evaluate refusal behavior is unchanged. The shared transport test now
checks the observation-specific 403; no existing expectation in
possible-extras/route.test.ts changed. Its success mock has the full projection,
and a new regression proves an incomplete projection yields 503
PROMPT_UNAVAILABLE with Cache-Control: no-store (no response cache storage).
This output validation does not establish database rollback after a repository
call. The recovery eligibility hook already has the requested 240_000 timeout;
its diff from incoming main contains only that timeout.

Current local verification, using installed binaries (no downloads):
- From apps/web: ./node_modules/.bin/vitest run --maxWorkers=2
  'app/api/contractor/jobs/[id]/possible-extras/route.test.ts'
  app/lib/prompt-sources-server.test.ts
  'app/contractor/jobs/[id]/materials-issues/materials-issues.test.tsx'
  passed: 3 files, 31 tests.
- From apps/web: ./node_modules/.bin/tsc -p tsconfig.json --noEmit passed.
- git diff --check passed.
- node tools/agent-lane-boundary-lint.mjs --lane=batch-20 failed on the
  unfinished read-only index (incoming-main paths and old 0855 entries).
  Working-file verification against MERGE_HEAD using lanePathAllowed and
  migrationOrderViolations passed: exact 31 non-lane paths, no lane self-entry,
  unchanged incoming-main SQL, sole new SQL 0596. Router must stage the resolved
  working files/renames and rerun standard lane lint after completing the merge.
- pnpm wrappers made no progress and were interrupted; checks above ran through
  the installed Vitest/TypeScript executables instead.

No DB/browser suites were attempted: this sandbox cannot start PostgreSQL or
bind localhost. CI must prove the full mandatory checks, fresh/upgrade migration
and catalog/grant/RLS guarantees, Direct Debit repository/recorder integrations,
source-route integration, recovery eligibility, restore reconciliation, and
phone/desktop ENT-8a journeys. Exact-head independent RED review remains a
merge gate. This handoff is readiness for a PR, not evidence of those gates.
No git write, commit, push, PR creation, live provider or release was performed.


### Batch-20 PR #562 independent-check repair — 5 November 2026 (RED)

Applied on clean head `40dca9548` (the merge from main following `b0b50fe6`).
This repair changes test expectations and documentation only: the foreign
observation expects 403 / EXTRA_FORBIDDEN per the router ruling; return/correction
facts expect PostgreSQL's six-decimal quantity text; the route integration test
loads @jobguard/db from source using the managed-recovery test's mock pattern.
The 0596 note heading and proof description now identify the actual synthetic
append-only facts routine. Product code and migration 0596 SQL are unchanged.

Local checks using installed binaries, with at most two Vitest workers:
- From apps/web: `./node_modules/.bin/vitest run --maxWorkers=2
  'app/api/contractor/jobs/[id]/possible-extras/route.test.ts'
  app/lib/prompt-sources-server.test.ts
  'app/contractor/jobs/[id]/materials-issues/materials-issues.test.tsx'`
  passed: 3 files, 31 tests.
- From apps/web: `./node_modules/.bin/vitest list --maxWorkers=2
  'app/api/contractor/jobs/[id]/possible-extras/materials/route.integration.test.ts'`
  collected all 8 cases successfully. Collection is not database execution.
- From apps/web: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` passed.
- `node tools/agent-lane-boundary-lint.mjs --lane=batch-20` and
  `git diff --check` passed. Working-file comparison with origin/main also
  confirms exactly 31 non-lane paths in the lane allow list, with no self-entry.

READY for router commit/push and CI; not a merge or release approval.
No database or browser suite ran here: the sandbox cannot start PostgreSQL or
bind localhost. CI must execute the repaired source-route integration assertions,
fresh/upgrade migration and catalogue/grant/FORCE RLS checks, Direct Debit
repository and recorder integrations, recovery eligibility, restore checks and
phone/desktop ENT-8a journeys, plus all mandatory typecheck/lint/test/build gates.
The independent RED check must pass against the resulting exact head before
merge. No live provider, real customer data, git write or release was used.

## Batch-25 landing preparation, 5 November 2026 (RED)

Resolved the workspace exports, this contract and later-empty-table registry as
an exact union with incoming main. The four batch migrations have reserved
landing numbers 0602–0605; SQL bodies are unchanged. Main has no duplicate of
these migrations. Earlier migration numbers in historical receipts above are
historical, including reservation 0607/0608. The batch-25 lane covers exactly the
35 changed files versus origin/main, excluding its own lane entry.

Main's executor now carries optional receipt-success-fee purpose and authorization
bindings. The reservation parser retains both existing contract fields; its strict
shape and immutable-identity check remain enforced. Regression coverage verifies
round-trip persistence and refusal of changed or removed authority bindings.
This compatibility union adds no rail, provider wiring or production capability.
AIS practice and the always-refusing production stub remain outside LP-5 lifecycle
dispatch; their lifecycle/production activation is held for separate work.

Local deterministic evidence: installed Vitest 4.1.12 with at most two workers
and at most three named files per run passed 454 tests: reservation store,
executor and practice-bank application (82); watchdog registry, context boundary
and identity (278); migration proof loader, AIS and enterprise-fee repositories
(89); practice-bank route and screen (5). The first reservation run exposed the
new optional authority fields and failed; the regression run passed after retaining
them. Installed tsc built core, config, storage, db and ai and passed API/web
no-emit typechecks. Commercial integrity boundary and current-source guards passed
with zero diagnostics and the existing nine baselined sites. PL/pgSQL CASE lint
passed 266 migrations. Provider register check and git diff --check passed.

The normal lane lint was run and refused the still-unfinished merge index's
incoming main files and former migration paths. A read-only comparison of the
actual working files against origin/main passed exact lane coverage and migration
order using the lane tool's own functions. The router must stage the resolutions,
complete the merge and rerun the normal lane lint. No Git writes were made here.
The pnpm wrapper could not verify/obtain its pinned package version in this
restricted environment; installed tools supplied the local checks. Web route and
server-module imports were source-inspected: they use the API workspace export,
not apps/api source. Database and browser suites were not run.

CI must prove fresh and populated migrations, preservation fingerprints, LP/RLS
catalogues and grants, reservation concurrency/rollback/restart/replay and late
settlement handling, AIS ownership/session/consent isolation and financial
non-effects, fee derivation/attribution/reversal integrity, phone/desktop browser
journeys and the Cloudflare build. Green required CI against current main and an
independent RED review of the final exact head remain required before merge.
Made-up data only; live providers, real money and release remain disabled.

The aggregate lint entrypoint also ran: core purity passed, then it stopped at
that same pending-index lane refusal. The Cloudflare pnpm wrapper stalled without
starting a build and was stopped; no Cloudflare build pass is claimed. The named
batch-25-harden brief was absent; the available batch-25 original brief contains
its hardening rules and was read alongside batch-9-harden and this landing brief.
