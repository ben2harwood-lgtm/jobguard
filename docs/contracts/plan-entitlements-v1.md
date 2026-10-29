# MON-8 synthetic entitlement contract v1

This build adds a pure feature map, strict versioned schemas, a refusal helper and
an internal API service with an unimplemented authority port. It does not install
a route or guard on an existing command. Persisted authority and its enforcement
proofs remain held because MON-2A on this base supplies pure modules only.

Source authority: BUILD_PLAN.md lines 2279–2293 (MON-8), 1301–1312 (catalogue),
1384–1391 (preservation and immutable job terms), 545–550 (track authority).
The 16 October build-ahead order overrides the older draft's wait-for-merge rule.
All prices remain proposed; this document is not commercial approval.

| Feature | Solo | Builder | Contractor in this piece |
| --- | --- | --- | --- |
| watchdog | included | included | excluded |
| final_check | included | included | excluded |
| invoices | included | included | excluded |
| recovery_cases | included | included | excluded |
| pay_now | included, separately gated | included, separately gated | excluded |
| accounting_export | included, separately gated | included, separately gated | excluded |
| operative_roles | excluded | excluded | held |
| site_origin_capture | excluded | excluded | held |
| approval_chains | excluded | excluded | held |
| work_orders | excluded | excluded | held |
| sso | excluded | excluded | held |

Contractor mapping outside the five explicitly named contractor features is
unspecified for this new service and therefore excluded here. This does not
change existing contractor applications or authorize suspension of their tools.
Unknown features, including expanded billing, fail schema validation.

`planEntitlementCapacity` selects MON-2A's existing `getSubscriptionCatalogue`
row, returning its policy version, proposed status, plan, included places, extras
cap and maximum pence. It adds no calculation, plan terms, user limit or fee rule.
No monthly/annual price is duplicated. Parent modules are reused unchanged.

`plan-entitlement-facts.v1` is an internal projection. Small-builder facts carry
Solo/Builder and the parent's catalogue version. Contractor facts can only carry
`agreementAuthority: held`; there is no approved agreement representation.
`plan-entitlement-enablement.v1` is server configuration with a synthetic-only
environment and an explicit unique feature list. Entitlement and execution
availability are separate. The service defaults to no enabled features; a plan
alone cannot enable execution. Future composition must supply only implemented,
accepted synthetic capabilities. Live or pilot enablement fails validation.

`plan-entitlement-check.v1` carries a feature and optional job ID. It accepts no
tenant, plan, role, agreement, lifecycle, payment, source, hidden signal or
configuration fields. All object schemas are strict. Failures use a closed
`plan-entitlement-error.v1` version/code body and 400 (invalid), 403 (excluded or
held), or 503 (unavailable). Unexpected errors expose no internal text. Existing
callers' refusal codes and shapes are unchanged; a future integration must map
this helper to that caller's established refusal contract.

`PlanEntitlementsApplication` requires a request-scoped
`PlanEntitlementAuthorityPort`. Its adapter must authenticate the persisted
session, current membership, grant and requested subject before calling the
facts callback. Job checks select immutable job terms, not simply the company's
current track. Company capability checks use the effective company assignment.
Pending plan selections are not effective plans. The adapter must retain its
transaction/locks through the callback and recheck execution authority in the
command's controlled write routine. No result here is a durable execution token,
commercial approval or substitute for release gates. The port's caller is server
composition, never a client-selected port or supplied facts object.

There is no adapter, default company, default plan, session reconstruction,
subscription lifecycle implementation or database read in this piece. Unit test
ports exercise the service contract only; they do not prove session validity,
RLS, PostgreSQL locking, effective-plan selection or historical data access.
Existing read/export entrypoints retain their existing authorization. The helper
must not be inserted as a filter on retained records/exports or used to recalculate
fees, obligations, settled money or immutable job terms. Trial/payment state is
absent; no suspension policy is introduced. Actual preservation proofs need the
owning persisted lifecycle and permitted track-transition contracts.

No SQL migration (0186 was provisional), grants, catalogue list rows, backfill,
audit event, command receipt, outbox, fee, payment or external action is created.
The parent's known transitive fee-schema import remains unchanged; this build
does not claim transitive module separation. New exports in core and the API
workspace index are additive; dispatcher reconciliation serializes those shared
index lines with MON-3 and parent repairs. No PR before parent merge.

## 18 October addendum — MON-8-P-A foundation

The preceding text describes the merged #243 slice, including its historical holds.
A now adds the separate [contractor authority v1](contractor-entitlement-authority-v1.md)
projection, synthetic append-only status source, transaction-bound session reader
and evaluator. Ben's answer 2 permits active-agreement-only eligibility; a reference
alone remains insufficient. The existing `agreementAuthority: held` v1 schema and
API port are deliberately unchanged. A is not their full adapter or enforcement.
Migration 0193 adds only A's objects, no backfill or commercial effects. B owns
command integration and permission-preserving historical readers; C owns merged
subscription lifecycle composition and preservation evidence. MON-8 stays open.

## 29 October — MON-8-P-B contractor capability slice 2

Migration 0403 installs the transaction-bound SQL capability service at the existing
controlled writers, including work-order replay lookup, approval receipt replay,
approval-rule configuration and export execution claims. It reuses A's current
assignment/status source through one shared private projection. New contractor
work requires active status on that assignment. No client facts or plan selection
can grant it. See [migration contract](../../packages/db/migration-notes/0403_contractor_capabilities.md)
for the entrypoint inventory, cleanup exceptions, privileges and forward fix.
Retained reads and local export downloads keep their existing permissions, with no
agreement-status filter. The original in-memory API port remains an unused
foundation; it is not added as an independent guard. Solo/Builder feature mapping
is unchanged. Operative/site-origin enforcement (slice 1), lifecycle composition
and full track-transition preservation (slice 3), independent RED review, CI and
release approval are separate work; this slice does not complete all of MON-8.
