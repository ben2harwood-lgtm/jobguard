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


## 28 October — MON-8 persisted enforcement (0352/0353, RED)

The historical port holds above are superseded for persisted subscription terms
and contractor command enforcement by `app.mon8_feature_decision(uuid,text,text)`.
`packages/db/src/plan-entitlement-service.ts` is its transaction-only server port;
`companyPlanEntitlements` binds the existing normal-company identity bridge to
`app.mon8_company_feature(text,text,uuid)`. The latter re-authenticates the stored
session after lock contention and checks an optional job within that company.
There is no new public feature-flag endpoint and no new normal-company commercial
route enablement. Existing pure facts/evaluators remain compatibility/domain APIs,
not grants accepted by the controlled writers.

The service accepts only the existing eleven features. For new contractor work,
only the latest company assignment and its latest **bound active status** qualify.
Neither Solo nor Builder, a trial, payment result or client flag grants those
capabilities. Missing/suspended/inactive status refuses, including before replay
returns. Operative grants and email invitation issue/acceptance, work-order/batch/rate/party writes, site-origin and
visit writes, approval-chain decisions and SSO administration/provisioning call
the service in their existing guarded paths. Existing resource permissions, actor
checks, lineage, exact commercial approval and tenant-qualified references remain
mandatory. Queued client-approval messages recheck at execution claim: loss of
entitlement cancels pending work without an adapter call or a delivery attempt.
Unknown/executing outcomes retain their existing reconciliation rules.

For small builders, effective subscription revisions are selected by the current
server London date; a pending change is not an effective plan. Solo and Builder
have identical feature decisions. No invoice, simulation result or payment failure
is interpreted as changing the plan. Missing persisted free-first-job authority
and missing effective terms refuse new work. Pay-now and **new** accounting exports
remain disabled pending their owning readiness paths. The existing application
authentication guard still refuses normal-company commercial routes outside its
explicit subscription allowlist; this change does not bypass that gate.

Retained reads/exports use `retained_read`: membership, expiry, revocation and the
reader's existing role/resource/export permissions apply, while commercial status
and track no longer filter historical records. `contractor_member_active` now
expresses membership only. Existing SSO-linked identities can sign in after loss
without adding grants; only existing scopes matching current IdP claims survive,
and removed claims still revoke grants/sessions. New JIT/linking and mapping/config
changes require active agreement. Grant/member/link revocation and disabling SSO
required mode remain available under their original security permissions.

Lock order is organisation/status (54), then subscription/lifecycle (184) when
reading small-builder new-work terms, then existing business locks, then audit.
Contractor and retained checks do not acquire a subscription lock. Status inserts
now mechanically take the same exclusive tenant lock. READ COMMITTED and fresh
post-wait reads are required. Results are never cached permits, and the usual
verified-tenant context trust boundary still applies: this is not protection from
a compromised privileged database owner. No runtime status writer, status backfill,
provider, fee derivation or historical-data mutation is introduced.

The existing builder receipt records actual local checks and the new real-PG
CI suites. PostgreSQL, browser execution and independent Claude review remain
separate evidence; source inspection and unit query doubles do not supply them.

## 29 October — combined MON-8 catch-up (0365/0366, RED)

The branch migrations are reserved as `0365_server_plan_entitlements.sql` and
`0366_contractor_feature_guards.sql`. The practice-worker decision retains the
complete 0332 Northside finance-worker predicate, with the current contractor
track/agreement check before worker selection. Missing status and an active
status on an older assignment never grant current work.

0366 also contains the operative branch's structural insert guards for membership,
role grants, invitations and contractor site-origin evidence, including forged
job-track values. Existing operative membership expiry/revocation updates bypass
new-work eligibility. One agreement-status trigger body in 0365 retains insert-only
immutability, the synthetic database boundary, an exclusive tenant lock (seed 54)
and server timestamping; operative inserts take the matching shared lock before
reading the latest assignment and status. Function owners and existing ACLs are
preserved; the new private trigger/helper grants no callable runtime bypass.

This supersedes `codex/sandbox/mon8-operative` / 0402; do not deliver its competing
replacement independently. Its automatic active-agreement practice bootstrap is
not imported: the existing owner-only fictional fixture supplies positive test
facts, and legacy/current companies without explicit agreement status stay held.
No historical rows are backfilled. On failure, revert the unshipped candidate;
after installation use a reviewed forward migration preserving immutable facts.
PostgreSQL upgrade, concurrency, retained-read and revocation assertions execute
in CI, followed by one independent RED review of the resulting head.
