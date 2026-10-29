# Imported baseline source boundary — CH5-B

C268, 25 October 2026. Synthetic only. **DEPENDENCY-BOUND; no successful
imported baseline projection or mapper is implemented or accepted.**

CH5-P build-ahead base c6c4ec9765877da4793187fe7e3123448db992c1 has no persisted
v3 baseline/line/activation terms tables or successful writer. Its reader throws
`METER_PLACE_SOURCE_HANDOFF_HELD`. CH5-C's preview and result schemas do not
provide an authoritative persisted baseline. An unmerged parent is not accepted.

`readImportedBaselineSources(pool, {context, sessionDigest}, jobId,
expectedBaselineRef): Promise<never>` passes the original verified context to
`withTenant`, reauthenticates the current persisted practice session and verifies
the exact session-owned job through `practiceOwnedJobsSql`. Unknown/foreign jobs
and invalid sessions return `FORBIDDEN` before capability information. Malformed
digest/job produces `INVALID_SOURCE_SCOPE`; other modes produce
`SYNTHETIC_MODE_REQUIRED`. These are internal boundary arguments, not an HTTP DTO.
No stateful session service is installed. A forged context fails `withTenant`.

For an authorized job, the reader throws
`IMPORTED_BASELINE_SOURCE_HANDOFF_HELD`. The expected baseline reference is opaque
and unused until an accepted discriminator exists. It is never cast to a quote
ID or used to query a legacy baseline. There are no reads of baseline contents,
current parties, plan, shadow output, nor any writes/provider calls. The existing
session-owned-job CTE can read its ordinary immutable ownership audit edges.

Core exposes a frozen `imported-baseline-source-availability.v1` held value.
`toImportedShadowCaptures(unknown): never` and
`toImportedActivationSource(unknown): never` always throw that same typed hold.
They do not parse, mutate or disclose the input, create captures, supply a trial
context, assert fee eligibility or supply a successful proposed DTO. Their `never`
return types intentionally prevent a consumer from claiming a usable projection.

## Required owner handoff before implementation resumes

CH5-P must be accepted/merged and supply immutable tenant/job/session-scoped
baseline, line, original party revision and activation-terms readers. CH-1/MON-1
and SV-2 must acknowledge the source DTO and reader contract. This would permit
B's source reader and pure mappers without building the downstream consumers.
Before downstream final-account/lock consumption and CH5-J, the final-account
owner must return the accepted `ImportedFinalAccountBaselineV1` discriminator,
compatible final-account/lock schema/routine/read projection and exact-head tests.
Once B's source handoff exists, its mapper must preserve every source revision/hash, description and stable
scope identity, reconcile totals using checked integer arithmetic and classify
every imported baseline line as fee-free builder capture. No baseline ID may
reach `baselineQuoteVersionId`. No fake quote, mutable party fallback, copied
plan engine or downstream compatibility implementation is authorized here.

CH5-B01/B02/B04/B05 and positive B03 remain held. B06 is bounded pure refusal;
B07 requires unchanged v1 regressions; B08 has no quote output; B09 remains an
explicit unaccepted coordinator handoff. H-IMPORT-BASELINE/H-SV5/H-SV6 and CH5-J
remain held. No full imported catch or zero-fee journey is claimed.

No migration (0230 unused), table, grant, EXECUTE, RLS policy, ledger, provider,
operational alert or existing barrel is changed. Therefore there are no new
LP-0/authority-paths, tenancy, SERIOUS-B5 or contractor-entitlement catalog rows
to add. Existing catalog freezes remain intact. Any later implementation needs
its exact additive inventories; this refusal cannot waive them.

Shared exports and consumers remain coordinator-owned. If this held boundary
is accepted as useful, proposed additive exports are the explicitly named core
hold/error/refusal functions and DB reader/scope only. No export is installed by
this leaf. No routes, OpenAPI, activation/final-account/lock or reserved branches
are inspected or edited for compatibility work. Auth tests authored for real
PostgreSQL are CI-only; scripted unit evidence is not database verification.

PR #386 integration CI repair: the combined branch exports only the existing
`ImportedBaselineSourceError` and `requireImportedBaselineSource` through
`@jobguard/core`, whose source type declarations work before a build. This
preserves the typed refusal; no successful DTO or reader is exposed by this export.

The internal provenance repository accepts the existing `ImportedBaselineReadScope`
whole in `read(scope, jobId)` and `adoptWithHistory(scope, sourceJobId, command)`.
It forwards that original scope to the held reader, preserving the original
verified context and digest without constructing a new context container.
Public import requests still use the existing `PracticeAccess.job` bridge.
