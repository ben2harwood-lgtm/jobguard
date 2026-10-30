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

## MON-4B: receipt success fees (synthetic executor seam)

Plan: MON-4 / §10.3.4, M4-15 and §12.4. RED money. The optional
`receipt_success_fee` purpose on the existing collection intent selects
`LockedCollectionSources.successFee(jobId, invoiceId, statementHash)` inside the
same tenant-serialized reservation transaction at reservation and dispatch.
Absent readers refuse with `SUCCESS_FEE_DEPENDENCY_BOUND`; there is no fallback
to subscription authority. The original subscription collection path is preserved.
No migration, SDK, route, worker or production implementation is added.

Source-inspected MON-4A on origin/main (`mon4a-fees`, PR #407) has immutable
`payment-fee-statement.v1` documents and per-statement `app.action_authorization`
records. It does **not** implement standing-authority creation (its view returns
null). This slice reuses `paymentFeeBindingV1`, already present on the build base,
and consumes a normalized, locked source envelope. The source owner maps
statementId/revision/statementHash/sourceHash and feePence to that binding,
policy `reference_fee_policy_v3`, recipient `platform:jobguard`, and the statement's
own separate platform invoice identity. It must reconstruct current verified
settlement, receipt/case/attribution disputes, current prior-statement sources,
credits and receipts, and current exact authorization (including actor, expiry
and revocation). Historical command results and read-view state alone are not
execution tokens. Statement fees are consumed unchanged; there is no new rounding,
allocation, fee formula, VAT calculation or customer-payment mutation.

Per-statement authorization binds statement ID/hash and exact fee amount. The
fake standing-authority specimen requires explicit opt-in, the same tenant/actor,
job, action, policy, recipient, currency, expiry and current approved state. Its
per-receipt cap may not exceed that receipt's verified fee, and it must cover the
exact collection. No standing-authority grant, renewal, dispute resolution or
production terms are inferred or written. A persisted MON-4A reader and a standing
writer remain unregistered; these are integration limitations, not evidence of a
source-backed database collection journey. In particular this build does not
claim to complete the live-gated MON-4B milestone.

`SuccessFeeCollectionError.reason` gives bounded pause reasons for unverified
settlement, each dispute scope, stale/revoked/disputed/expired authority, fee cap,
and inactive/revoked mandate. A pause before dispatch leaves the attempt reserved
and performs no provider submission. The mandate check is local fake state; the
rail also checks again during submit. A cancellation racing after initiation is
handled by the existing signed lifecycle/reconciliation rules. Accepted/unknown
requests are not resubmitted when authority changes.

Both rails share the existing statement/invoice reservation balance; changing
purpose, rail or payload is not a second entitlement. Duplicate commands and
concurrent clicks reserve/submit once; pending/confirmed are not payout. Payout
reversal holds the balance for reconciliation, including replacement card attempts.
Refunds retain the original statement/purpose and use the existing exact approved
credit path; neither reversals nor refunds silently reopen fee debt. Customer
receipts remain outside the collection write interface. The shadow-30000 fixture
amounts remain £41,280 received, £800 qualifying, £80 fee, £720 before tax; VAT is
uncalculated in this simulation. No demo/UI fixtures were changed.

Local verification (30 October 2026): installed Vitest, three named files,
`--maxWorkers=2`, passed 128 tests (`success-fee-direct-debit.test.ts`,
`executor.test.ts`, `fake-gocardless.test.ts`). API TypeScript `--noEmit` passed.
The first test invocation could not resolve the unbuilt core package; building
existing core/config outputs restored resolution without package downloads.
Initial type checking exposed optional-property and branded-money fixture typing;
both were fixed. PostgreSQL, browser, full CI and independent Claude RED review
remain for the router/CI. This in-memory seam does not prove durability or RLS.

Additional local checks: `git diff --check`, core-purity, money-arithmetic and
commercial-boundary checks passed. `node tools/lint.mjs` stopped at lane-boundary:
the main comparison includes inherited M4-12/M4-13/M4-15 files outside MON-4B's
allowed paths. No allow list was broadened to absorb those predecessor changes.
A working-tree-only path check using the existing `lanePathAllowed` function
passed for all eight changed/new files, and the lane lists exactly this slice's
seven non-lane paths. This limited check does not replace CI's full lane gate;
the router must respect predecessor merge order when opening the PR.
