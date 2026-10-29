# M4-13 terms and mandate record — dark contract slice

Status: synthetic, proposed; no live authority. G4-S, D05, D09 v4, D01 v3,
D02, D03 v3 and D13 approvals remain separate release evidence. No migration.

`subscription-agreement.ts` reuses the MON-2A catalogue rather than copying prices.
Its canonical text binds both exact plans, the selected plan, monthly anchor,
company, recipient, agreement identity/revision and validity interval. Annual
reference prices are disclosed but annual execution remains disabled. The text
covers the seven-job line, contractor agreement handover, retained job terms,
qualifying 10% fees, cancellation, trial/pilot treatment, notice/re-authorisation,
provider defaults and separate subscription/fee credits. Unknown notice duration
is deliberately unresolved: the specimen authorises no automatic terms changes.

The strict record schema binds a human-approved Decision to the exact terms hash,
actor membership, command and timestamp. Parsing this record is structural
validation, **not** authentication, persistence or proof of approval. Never accept
it from a client as authority. MON-2B and M4-12 must reconstruct it from their
server-controlled durable records under current verified tenant membership.
Existing synthetic subscription acceptance is unchanged and does not acquire a
standing collection mandate from this module.

`checkSyntheticSubscriptionAgreement` is a pure preflight for deterministic
fakes only. It checks current terms revision/hash, tenant, validity, active state,
provider defaults, monthly aggregate subscription limit and exact per-statement
approval including source hash, principal and tax. Trial exempts subscription,
not separately approved success-fee statements; pilot exempts both. Pause,
failed renewal, cancellation, revocation and supersession refuse future
initiation. No automatic retry, refund or plan-change action exists. Live
execution is unconditionally refused by `refuseLiveSubscriptionAgreement`.
There are no provider endpoints, credentials, clocks, network calls or new tables.

Consumer obligations still to build in MON-2B/M4-12 and later execution pieces:

- Persist immutable approvals and lifecycle events with audit and tenant-safe
  keys/RLS; resolve actual membership/permissions and approved notice policy.
- In one locked transaction, reread current record/state and current immutable
  statement/derivation, recompute outstanding balance after reversals/credits,
  validate final-account lock/attribution where required, reserve value and write
  durable work. Supplied current statements and aggregate amounts here are
  trusted server snapshots, not client assertions. Preflight does not prove
  settlement, allocation eligibility, lock references or outstanding balance.
- Uniquely bind tenant/command/payload and business effect to prevent concurrent
  duplicate collection; same-key changed payload must fail. Repeated preflight
  is intentionally deterministic and creates no reservation or payment.
- Revocation/cancellation must atomically block new work, enqueue provider-side
  cancellation and reconcile already attempted/unknown outcomes. Do not label
  in-flight work cancelled, refunded or settled without reconciliation.
- Disable provider collection/retry/email defaults outside the approved scope;
  verify actual settings before execution. Refunds need exact separate authority
  and original-settlement limits. Allocate subscription discounts/credits only to
  subscription; fee credits only to original fee statements, never cross-offset.

Adversarial coverage is in `subscription-agreement.test.ts`: stale/replayed
requests after revocation, missing/dismissed approval, altered terms, cross-tenant
and recipient reuse, aggregate limit overflow, changed/reversed statement source,
trial/pilot boundaries, forbidden actions and hidden/locked-bill overrides.
No hidden source data is consumed or returned. These are domain tests, not
PostgreSQL isolation tests or independent RED review. The slice needs no migration;
no existing migrations are edited. Durable consumer wiring, live execution,
provider cancellation, concurrency guarantees and approved legal terms remain
outside this slice.
