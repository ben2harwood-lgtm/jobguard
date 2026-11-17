# M4-23 rollback and disable plan (unexecuted)

Nothing is enabled. G0–G5 remain closed for this work; sandbox success opens
nothing. No retroactive pilot billing, regulatory approval, certification or
guaranteed recovery claim follows from this plan. Rehearsals use fictional data
and fake adapters only. This document authorizes no live operation.

## Bind and rehearse controls before a live smoke

The [inventory](release-inventory.md) declares six independent rail scopes; its
`enabled` values are offline evidence, not deployed switches. Before any future
live test, bind each rail below to its actual server-side disable control and
record a fake-adapter drill proving refusal of new actions and queued dispatch.
Also bind the application-wide outbound pause and independently authorized
unpause. `ActionExecutor` currently accepts fake adapters; the restore wrapper's
dispatch refusal is not a deployed global kill switch. Missing wiring, names or
drill evidence block live execution. Do not assume changing the inventory stops
a worker, or that a pause recalls a request already accepted by a provider.

Incident owner: ____; independent restart approver: ____;
global outbound pause control: ____; drill evidence/result: ____;
previous compatible artifact/configuration: ____; restore evidence: ____.

| Track / rail | Disable scope and reconciliation retained | Deployed switch / owner / drill result |
| --- | --- | --- |
| G4-C `contractor_fee_stripe` | Stop contractor Stripe fee issuance/collection; retain invoice, effect, clearing, refund and credit history. | ____ / ____ / ____ |
| G4-C `contractor_fee_gocardless` | Stop contractor direct-debit submissions/retries; retain mandates, pending collections, returns and settlement history. | ____ / ____ / ____ |
| G4-S `subscription_stripe` | Stop new subscription checkout/changes and billable meter execution; account for already scheduled provider renewals separately. | ____ / ____ / ____ |
| G4-S `success_fee_stripe` | Stop small-builder Stripe fee issuance/collection and retries; retain exact statements, allocations and refunds. | ____ / ____ / ____ |
| G4-S `success_fee_gocardless` | Stop small-builder direct-debit submissions/retries; retain pending collections, returns and allocations. | ____ / ____ / ____ |
| G4-S `customer_pay_now` | Stop creating/sending pay-now links; inventory previously issued links and provider-side expiry/revocation capability. Customer money stays with the builder. | ____ / ____ / ____ |

## Stop, preserve and reconcile

1. On wrong tenant, unauthorized action, disclosure, wrong amount/tax/origin,
   duplicate effect, revoked consent, unknown provider outcome or reconciliation
   mismatch, stop expansion immediately. Engage the outbound pause, then the
   affected per-rail switches; use the global pause for uncertain cross-rail scope.
   Record incident time, commit/configuration, tenants, rail and action IDs.
2. Confirm no new claims or adapter calls, including queued work, retries and
   scheduled renewals. In-flight requests and provider-owned schedules may still
   complete. An authorized operator must inspect those separately under the
   approved provider runbook; unsupported cancellation stays unresolved. Do not
   make blind cancellation, retry, refund or alternate-rail requests.
3. Preserve immutable evidence, outbox attempts, idempotency identities, approvals,
   signed inbound events and audit checkpoints. Keep authorized inbound settlement
   ingestion and read-only reconciliation available where safe. If containment
   requires stopping them too, retain events for authenticated replay/reconciliation.
   Never purge pending work or mark a payment failed merely because dispatch stopped.
4. Mark uncertain delivery `outcome_unknown` and reconcile by stable effect ID.
   Do not resend or switch rails until absence is established and current exact
   authority is rechecked. Correct posted mistakes with linked compensating
   journals and separately authorized refunds/credits, never history edits.
5. Roll back only to a demonstrated compatible artifact/configuration while
   keeping dispatch paused. No schema changes ship here. If compatibility is
   uncertain, keep disabled and forward-fix; never down-migrate financial history
   or restore a database to erase settled effects. A restore must reconcile all
   effects since its checkpoint before any dispatch is reconsidered.

Incident/evidence reference: ____; containment result: ____;
unresolved provider effects: ____; reconciliation result: ____;
artifact compatibility evidence/result: ____.

## Resume separately by track

G4-C restart requires corrected origin, contract approval, billing/payment import,
statement and collection evidence for the affected contractor rail. G4-S restart
requires corrected lock/attribution, no-proof/no-fee, settlement/reversal and
subscription/fee separation evidence for the affected small-builder rail.
Neither track's approval authorizes the other or an alternate rail.

An independent approver reviews containment, reconciled effects, corrected tests,
current consent/policy/gates and the new exact commit/configuration. Re-run the
[bounded smoke](live-smoke-test-procedure.md) for changed scope before a general
rollout record references its reconciled review. Re-enable only explicitly
approved tenants, jurisdictions and rails. All others remain disabled. Preserve
pilot no-charge entitlement and separately gated construction-billing treatments.

G4-C restart owner/approval/result: ____ / ____ / ____;
G4-S restart owner/approval/result: ____ / ____ / ____.
