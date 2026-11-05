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

## M4-13 owner web surface (practice only)

`/plans/mandate` and GET/POST `/api/subscription-mandate` now use the existing
mandate repository. No navigation link, migration, grant, collection or executor
is added. A current company identity session with one owner membership supplies
the tenant; practice cookies and caller tenant headers cannot select authority.
POST additionally requires a configured trusted origin and session CSRF token.
The strict browser command permits only approve, revoked and cancelled.

GET supplies canonical `subscriptionAgreementText`, its server hash and a
session-bound HMAC preview. Approval submits that exact selection without a
tenant field; changes invalidate the preview. The practice specimen starts one
hour after preview and expires after 24 hours, with anchor day 1 and the signed-in
identity as recipient reference. These are fictional specimen bounds, not a
production notice, billing-date or validity policy. Existing terms remain immutable;
replacement approvals still return `MANDATE_NOTICE_REAUTHORISATION_REQUIRED`.
Revoked/cancelled reads show authority not current even if the original approval
survives. Provider cancellation is pending, never represented as completed.

The client retains identical command bytes/ID in memory across uncertain retries,
blocks changing choices until the outcome is known, confirms revoke/cancel, and
renders server state and refusals. Routes use `no-store`; the page is not found
outside synthetic mode. Wording and prices, D05/D09/Q9, MON-2B/M4-12 execution,
provider settings, real rails and G0–G5 remain held for their existing approvals.

New unit tests cover signed-preview tampering, strict inputs, session/owner/tenant
boundaries and typed refusals. The new route PostgreSQL tests and headless browser
spec must run in CI: immutable exact text/hash, one-record replay, stale sequence,
held reapproval, ended-authority preflight refusal, actual email-code browser
journey, confirmation, identical uncertain retries, 44px controls, keyboard naming
and Chromium contrast audit at mobile-360 and desktop. Browser contrast/name/focus
checks are targeted checks, not a full independent accessibility audit. No real
provider or customer data is used. Independent RED review is still required.
