# Synthetic subscription persistence v1

MON-2A-P adds a synthetic server/database contract to the unchanged MON-2A previews. No live charge, VAT, journal, success-fee offset, track transition or release approval is provided. D01/D02/D03/D08/D09/D16 and D05/G4-S remain held.

MON-1, MON-1B and the earlier MON-2A reference slice are merged at the dispatch base `b881f90b`. Migration 0184 supplies immutable input/computation/correction identities and checked owner/admin company authority. There is no dedicated meter role. The old absent-authority and catalogue-inventory holds are superseded by this dispatch's bounded authorization. The transitive shadow import was repaired upstream through `small-job-v3.ts`; existing architecture tests remain unchanged.

The first platform statement implementation is migration `0190_subscription_persistence.sql`. Its `platform_statement` and `platform_statement_line` namespace currently admits subscription synthetic documents only. Future fee documents require their own source contracts and migration; they must never reuse subscription lines or allocation identities.

## Persisted entry points for B and C

Exports from `@jobguard/db`:

- `SubscriptionRepository(pool).command(context, digest, commandId, raw)` validates `subscriptionCommandV1`, calls checked SQL and verifies issue's base principal through the existing core meter projection in the same transaction.
- `SubscriptionRepository(pool).read(context, digest)` returns `subscription-persisted-read.v1`, `environment: synthetic_demo`, `hypothetical: true`, and arrays `agreements`, `changes`, `changeOutcomes`, `periods`, `periodLines`, `places`, `placeBindings`, `statements`, `statementLines`, `reviews`, `operationsCards`, `work`, `attempts`, `results`, `corrections`, `alerts`, `onboarding`. Row fields retain PostgreSQL snake_case; bigint row values are JSON numbers within the declared bounds.
- `SubscriptionMeterSource(pool).read(context,digest,sourceId)` returns `{input,result,ledger}` freshly derived from immutable MON-1B input under accepted effective terms. It does not infer lifecycle or trial entitlement.
- `PlatformSubscriptionStatementRepository(repository).read(context,digest,statementId)` performs current authorized company read before lookup.
- `SubscriptionExecutor(repository,adapter)` claims only exact approved durable work and records results. It cannot accept terms. The adapter executes outside the database transaction.
- `subscriptionTermsContentHash(tenantId,selection)` computes the canonical hash for reviewed terms, with the fields below except `contentHash`. A hash is not approval.

The internal API `SubscriptionApplication` resolves the request's current authenticated authority every call and refuses any environment except `synthetic_demo`. Its concrete repository uses PostgreSQL. No HTTP route or display endpoint is installed. SQL independently authenticates the persisted synthetic session and SSO-aware company membership on every operation; a TypeScript context or client field cannot replace that check.

SQL runtime EXECUTEs are only `app.mon2_command(uuid,text,uuid,jsonb)`, `app.mon2_read(uuid,text)` and `app.mon2_source(uuid,text,uuid)`. All business tables deny direct runtime writes/reads. Catalogue SELECT is a bounded public-reference control-plane exception. Shared-practice company summaries remain refused.

Every command is strict `{version:'subscription-command.v1',kind,...}`. Tenant and digest are authenticated call arguments, never payload fields. Actor/time are server-derived. Commands are:

| Kind | Additional fields |
|---|---|
| `accept`, `change` | `plan`, `cadence:'monthly'`, `anchorDay`, `termsVersion:'subscription_terms_v1'`, `catalogueVersion:'subscription_pricing_policy_v4'`, `maximumPence`, `contentHash`, `expectedRevision` |
| `issue` | `periodStart`, `expectedRevision` |
| `apply_change` | `changeId`, `sourceId`, `expectedRevision` |
| `review` | `sourceId`, `expectedRevision` |
| `approve_simulation` | `statementId`, `contentHash`, `amountPence`, `expectedRevision` |
| `execute_simulation` | `workId`, `expectedRevision` |
| `record_simulation`, `reconcile_simulation` | `workId`, `resultId`, `outcome`, `expectedRevision` |
| `onboarding` | `usualPlaces`, `siteStaffLogExtras` |

Only current owners accept terms/change terms/approve simulation. Exact authorization binds tenant, catalogue, terms, plan, cadence, original anchor, maximum and expected revision. Accept, immediate upgrade and simulation approval expiry is bounded by the accepting session's persisted expiry. A pending downgrade's single-use exact approval expires at London midnight ending its first Solo period, so it can execute at the next billing boundary after the accepting login session expires or is revoked. Durable execution still rechecks active owner membership, contractor revocation and revision; revoked owner membership refuses the downgrade. Expired approval cannot authorize execution. No standing consent is created.

`agreements` contains applied accepted revisions only; pending downgrade intentions live in `changes`. Consumers must select the greatest effective date then accepted revision for the requested London date, never the latest pending change. B must add its own approved trial/conversion facts; fixture trial flags here are intentionally ignored. C must retain existing read authorization and not treat plan data as a substitute for actor grants.

## Calendar, source and pennies

Monthly boundaries retain the original 1–31 anchor and independently clamp to each month's end. Half-open London-date periods include 28–31 actual dates. Same-day accepted revisions resolve by revision. First-period stubs, re-anchoring and unspecified conversion rules remain stopped; no missing dates are fabricated. Annual acceptance and execution are unavailable even if a client supplies an enablement flag.

Stable place keys are canonical lowercase `tenant:customer:site`. Source job UUIDs remain fixture references, not fabricated `app.job` rows. `canonical-place-and-job.v1` chooses the smallest canonical job identity as representative, allocates small-place allowances first by place key, then included/paid-extra/grace places by place key. Bindings retain source ID/revision, representative and rule version immutably. Largest-remainder equal fractions break ties by canonical line key. Hashes exclude random period/statement IDs and input array ordering.

Issue consumes latest immutable input under the MON-1B tenant lock and replaces supplied plan/trial/annual flags with accepted terms. Scalar pricing reuses existing core functions and SQL MON-1 projection. Qualified late correction identities are recalculated from their immutable source/predecessor with accepted terms. Positive corrections share the receiving maximum; full/applied/excess remain reconciled and excess alerts persist. Negative facts are retained with zero applied amount and an explicit policy-hold alert. No refund, future credit or excess roll-forward exists. A trigger refuses correction insertion into an already subscription-issued receiving period.

Review is explicit against a current supplied source before issue; issue also evaluates review. Thirteen Builder places are grace, fourteen trigger immediately. Sustained use requires three consecutive periods with at least ten busy days in two. A deduplicated mandatory Decision and internal operations card do not change track. Onboarding stores a recommendation only. This supplied-fact integration is not CH-4 lifecycle wiring.

## Simulation and integrity

Statements are immutable hypothetical GBP principal-only documents. Period and statement lines sum exactly. Deferred constraints bind lines, sources and exact approved simulated amounts. Redirect is not settlement; the single durable attempt is unique per work/statement. Unknown outcomes require reconciliation. Every adapter/result remains synthetic and posts no ledger fact.

The command receipt namespace is shared with existing commands. Payload/actor/family mismatch conflicts; exact retries return committed results. Tenant lock 184 precedes all business and receipt work; audit-head allocation is last. No business lock follows it. Migration installation is transactional; installed history is preserved by additive forward fixes.

Actual PostgreSQL installation, upgrade and adversarial execution remain CI obligations. Two independent Claude verdicts bound to the dispatcher's final commit and separate acceptance are required. This contract is not evidence those checks passed.

A durable claimed attempt with no result (process interruption or lost result persistence) is also reconciled without another execution. A completed redirect alone is not a settlement or an unknown-outcome retry permission.
