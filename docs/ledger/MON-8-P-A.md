# MON-8-P-A — RED synthetic authority foundation

Issued 18 October 2026. Base c4f929f5a37bbc2639186fa3e2a4b2e7adc1ec3a,
matching origin/main at inspection; highest migration 0192. Own migration 0193.

Exact SQL interfaces: `app.mon8_contractor_agreement_context(s uuid) RETURNS jsonb`
and private trigger `app.mon8_agreement_status_guard() RETURNS trigger`.
Exact TS interface: `ContractorEntitlementAuthorityRepository(pool: Pool)` with
`withAuthority<T>(sessionId: string, consume: (db: TenantTransaction,
authority: ContractorEntitlementAuthority) => Promise<T>): Promise<T>`.
Core exports: `contractorEntitlementAuthorityV1`, `ContractorEntitlementAuthority`,
`contractorEntitlementFeatureV1`, `contractorEntitlementEnablementV1`, and
`evaluateContractorEntitlement(raw: unknown, rawFeature: unknown, rawEnablement?: unknown)`.
The complete strict result schema and lock protocol are published in
[the contract](../contracts/contractor-entitlement-authority-v1.md).

Only active status bound to the current contractor assignment yields eligibility.
Enablement defaults off; scoped command permissions remain separate. Retained reads
are represented as requiring current scope permission, not authorized by this result.
No runtime status writer, public endpoint or commercial action is installed.

Acceptance evidence: [builder receipt](../verdicts/MON-8-P-A/BUILDER_RECEIPT.md).
PostgreSQL, concurrency and catalog assertions await CI, not query-double substitutes.
Standing ruling 113 adds exact A objects to SERIOUS-B5's snapshot. Shared index,
tenancy/inventory and SERIOUS-B5 edits must serialize with other touching tasks.

STOP for B: existing command enforcement, Q-03 command/direct-write denial matrix,
legacy compatibility and historical read/export endpoints. STOP for C: subscription
composition/preservation until actual merged MON-2A-P interfaces and MON-3-P end
transition are available. Neither STOP blocks A. STOP for any agreement activation,
suspension/restoration actor policy: owner fixture setup is not that authorization.
No money/access policy beyond issued A, live provider, real data, UI, deployment,
push/merge/release or gate approval is included. MON-8 is not completed.
Different-model verdict on the dispatcher-created final commit and separate actor
acceptance are still required; this ledger is not either verdict.
