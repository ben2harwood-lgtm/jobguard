# MON-8-P-A — synthetic contractor agreement authority v1

Issued 18 October 2026, RED. Implements Ben's 17 October answer 2 for **A only**.
This is a synthetic foundation, not MON-8 completion, signing evidence, an activated
command guard, or a new subscription authority. Existing v1 plan facts and the API
port remain unchanged. B owns enforcement and retained readers; C owns composition.

## Persisted facts

`app.contractor_agreement_status_revision` has `(tenant_id,id)` primary key and
unique `(tenant_id,assignment_id,revision)`. Its tenant-qualified FK targets
`app.commercial_track_assignment(tenant_id,id)`. Columns: UUID tenant/id/assignment,
positive integer revision, status `active|inactive|suspended`, schema_version
`contractor-agreement-status.v1`, environment `synthetic_demo`, server-pinned
`created_at timestamptz`, fictional_source `fictional-fixture:<uuid>`.

The migration creates no rows. Migration-owner fixtures explicitly insert fictional
status revisions. No runtime actor may activate, suspend or restore an agreement.
No reference string, failed payment, trial date or elapsed grace period supplies
active status. The highest revision on the **current highest-revision assignment**
is selected; an old assignment's active status never carries forward implicitly.
Missing assignment/status produces a negative eligibility result, not a default.

The table is migration-owned, FORCE RLS, and has a tenant policy for the migration
role only. Runtime, PUBLIC and infrastructure have no table access. Row mutation
and truncation are refused by `app.mon8_agreement_status_guard() RETURNS trigger`;
inserts pin server time and refuse a non-synthetic database. Privileged database
owners can alter protections; this is not a claim of protection from that owner.

## Exact interfaces and lock contract

- SQL: `app.mon8_contractor_agreement_context(s uuid) RETURNS jsonb`.
  SECURITY DEFINER, VOLATILE, migration-owned, `search_path=pg_catalog`;
  EXECUTE only for runtime and owner. No actor, tenant, status or reference parameter.
- Repository: `new ContractorEntitlementAuthorityRepository(pool: Pool)`;
  `withAuthority<T>(sessionId: string, consume: (db: TenantTransaction,
  authority: ContractorEntitlementAuthority) => Promise<T>): Promise<T>`.
- Core exports: `contractorEntitlementAuthorityV1`, `ContractorEntitlementAuthority`,
  `contractorEntitlementFeatureV1`, `contractorEntitlementEnablementV1`,
  `evaluateContractorEntitlement(raw: unknown, rawFeature: unknown,
  rawEnablement?: unknown)`.

The repository uses the unchanged persisted `contractorSessionContext` bridge,
then `withTenant`. SQL requires `jobguard_synthetic_demo`, READ COMMITTED and a
valid transaction tenant. It compares the session tenant before the shared lock,
acquires `pg_advisory_xact_lock_shared(hashtextextended(tenant::text,54))`, and
re-reads the effective session/member and latest assignment/status after waiting.
It separately checks role, contractor-member/client consistency, current expiry,
membership revocation and contractor revocation. It does not substitute the owner
for the effective acting member or change `contractor_member_active`.

The shared lock is held through the consumer callback and transaction completion.
Any future status writer **must take the matching exclusive tenant lock (seed 54)
before reading/writing status**, re-read authority after waiting, and retain it
through commit. Follow tenant-lock-before-business-lock-before-audit ordering.
Owner fixture writers in these tests follow this convention. No runtime writer is
installed. Direct privileged fixture writes are not an operations authorization.
Consumers must perform their resource/role/grant/export checks within this same
transaction; this result is never a reusable authorization token. Session expiry
and revocation must still be checked at any future execution boundary.

Strict JSON result:

```ts
{
 version: 'contractor-entitlement-authority.v1', environment: 'synthetic_demo',
 tenantId: UUID, membershipId: UUID, identityUserId: UUID,
 assignment: null | { id: UUID, revision: positiveInt, track: 'contractor'|'small_builder',
                     agreementReference: `synthetic-agreement:${UUID}` },
 status: null | { id: UUID, revision: positiveInt, status: 'active'|'inactive'|'suspended' }
}
```

A status requires an assignment. Extra fields, invalid references/versions/modes
and unknown features fail with `PlanEntitlementError(INVALID_ENTITLEMENT_INPUT)`.
The repository preserves bridge `UNAUTHENTICATED`/`MODE_FORBIDDEN`; SQL refusals
map to `ContractorError(FORBIDDEN|MODE_FORBIDDEN)`. Unexpected DB errors propagate.
No error introduces a public endpoint or changes existing callers' error shapes.

The evaluator returns frozen `{version:'contractor-entitlement-decision.v1',
environment:'synthetic_demo', feature, newWorkEligible, executable,
retainedRead:'requires_current_scope_permission'}`. Only `operative_roles`,
`site_origin_capture`, `approval_chains`, `work_orders`, `sso` are accepted.
Eligibility requires current contractor assignment plus active bound status.
Execution also requires a server-supplied strict enablement object with version
`contractor-entitlement-enablement.v1`, synthetic environment and a unique list
`enabled`; it defaults to an empty list. Neither eligibility nor enablement grants
resource permission. Expanded billing and subscription tier fields are rejected.

Loss/suspension refuses new work in this evaluator. Records remain intact, but
retained-read handling confers **no disclosure permission**. B must preserve each
reader's current actor, scope, revocation and export checks. No historical endpoint,
commercial effect, receipt, audit event, outbox delivery, fee or track move occurs
in this reader/evaluator. Schema-valid internal objects are not proof of database
authority: only the session-bound reader supplies them to server consumers.

## Evidence and remaining work

Tests use made-up owner fixtures and real PostgreSQL suites intended for CI.
Local PostgreSQL/browser execution is NOT RUN; see the builder receipt for actual
unit/check results. No query double is offered as database evidence. B's Q-03
runtime-command denial matrix, legacy compatibility and retained-read integration
remain outstanding; C waits for merged MON-2A-P and actual MON-3-P transitions.
No independent acceptance or release gate is claimed by this document.

## MON-8-P-B operative grants (slice 1)

Operative member invitations and grants, and both site-extra capture routes, now
require `operative_roles` / `site_origin_capture` through the existing server
agreement evaluator. These two synthetic features are explicitly enabled by the
server adapter. No client enablement or plan is accepted. The route precheck is
not a credential: migration 0402 rechecks the latest bound active agreement at
membership, grant, invitation and site-origin insertion, holding the tenant lock
through persistence. Identity invitations/provisioning are guarded in SQL too.

New fictional practice organisations explicitly generate their initial active
fixture status. This is a narrow synthetic generator writer, not a live agreement
activation API; existing organisations and previous assignments are not backfilled.
Historical records and their existing read/export permissions are preserved.
Suspension/inactivity or a superseding assignment without active status refuses
new writes. Existing command replay may return its historical result without
creating another record; routes still check current entitlement before a write
request. Revocation/expiry of an existing operative remains allowed after loss.
Approval chains, work-order and SSO entitlement wiring, and plan-transition work,
remain outside this slice. No money, allocation, locked-bill or shadow-data read
surface is added; their existing guards remain authoritative.
