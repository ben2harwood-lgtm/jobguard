# CH-5 job import v3 — independent core contract v1

This change implements only the released pure-core portion of CH-5. It adds no
usable import, persistent record, date classification or production capability.
The issued build-ahead instruction supersedes Q1's merge prerequisite for this
construction only: parent `origin/codex/sandbox/mon-1` is
`2514049c8dfb7630598fdf81f5c0d6d23444abb4`, based on main
`6671538c8d69936c162368c760dd6ce0f7f10493`. No PR precedes the parent merge.
The main plan's CH-5 card, §10.1.4–10.1.6, §10.2.1–10.2.2 and CH-3a live-entry
rule remain binding. No founder decision is supplied here.

## Public intent

`jobImportV3Request` is a strict, frozen Zod object:

| Field | Contract |
| --- | --- |
| `version` | Exactly `adopt-job.v3` |
| `commandId` | UUID, normalized to lowercase |
| `expectedSourcePartyBindingId` | UUID, normalized to lowercase |
| `lifecyclePoint` | `live` or `invoiced` |
| `fictionalBaselineKey` | 1–80 lowercase ASCII letters/digits, separated by single hyphens |

The key's syntax is a reversible implementation detail. It is an opaque fixture
selector, never arbitrary source content or proof of synthetic mode. The held
server adapter must resolve it against its server-selected fictional registry
after authority checks. This leaf defines no fixture values or admission defaults.
The future route supplies the source job from its path, separately from this body.

All other fields are refused, including tenant, actor, role, track, policy, cap,
price, small-job flag, plan count and mode. There are no defaults or coercions for
missing fields. `parseJobImportV3Request` returns a detached frozen object or
`JobImportV3Error` with code `INVALID_JOB_IMPORT_V3_INPUT`. Direct schema consumers
may use Zod's `safeParse`; application code should use the typed parser.

`jobImportV3RequestIdentity(raw, sourceJobId, actorMembershipId)` returns canonical
JSON text over a fixed tuple of version, normalized source job and actor UUIDs,
then command ID, expected binding, lifecycle point and fixture key. Object property
order and UUID letter case do not change identity; a different material field,
source or actor does. This is pure text normalization. It authenticates nobody,
does not create a tenant context, and implements no hashing, authorization,
durable idempotency, conflict response or stored-result replay. Its actor argument
must eventually come from authenticated server context, never public input.

## Known numeric inputs and lineage

`classifyKnownJobImportV3Values` accepts only a strict
`job-import-known-values.v1` object with `acceptedNetPence` and
`highestSentNetPence`. Both must already be known nonnegative integer pence within
the existing `MAX_MONEY_PENCE = 1_000_000_000_000` bound. It returns detached frozen
inputs and `smallJob`, delegated to merged `isSmallJobV3` from CH-1. It does not
derive external-quote provenance, classify an unknown value, allocate an allowance
or freeze import terms. Missing and null inputs fail; zero is never substituted.
This helper is a numeric reference boundary, not the held import terms schema.

`JOB_IMPORT_V3_LINEAGE_LABEL` aliases the existing `IMPORT_LINEAGE_LABEL` exactly:

> Imported — builder-attested baseline; weaker than a JobGuard-generated and customer-accepted quote.

No quote, customer acceptance or stronger provenance is created. The old
`adopt-job.v1`, `importedLineage`, v1 terms and cap calculations are unchanged.
The v3 fee-policy identity remains the merged `activationFeePolicyV3`; no new
policy formula is introduced.

## Pure shadow reference evidence

The new test supplies an already-classified `before_adoption` evidence fact to
merged `createShadowSignal`, then exercises coalescing with newer evidence,
confirmation, `createAttributionFacts`, `evaluateRecoveryEligibility` and
`deriveShadowSuccessFee`. Its exclusion remains `pre_adoption_evidence` despite
otherwise affirmative confirmation, billing and settled allocation facts.
Qualifying exact principal is zero, fee and posting delta are GBP zero, and the
reference journal proposal is `none`. An otherwise identical positive control
without the exclusion yields an £80 fee on £800 qualifying net principal.

The reason is retained on the signal and attribution facts. The existing fee
function does not return a reason field; this leaf invents no fee display API.
All facts are fictional in-memory reference inputs, including invoice/allocation
objects. Nothing is persisted or treated as an actual imported-job journey.
These tests do not compare source dates, decide equality/unknown/conflict rules,
or prove persisted exclusion, real settlement, Final Check or CH5-H01.

## Parent interfaces and continuation holds

Source inspection at the supplied parent finds `meterDay31Candidate`,
`groupSuppliedMeterPlaces`, `computeSmallPlaceAllowance`,
`classifyMeterActivation`, `computeSuppliedMeterPeriod` and
`suppliedMeterCorrection`. These are pure supplied-input functions. There is no
exported capacity-lock identity, authoritative interval representation or
admission writer. CH-5 calls none of them for admission and creates no substitute.
Only the merged CH-1 numeric classifier is consumed by the new helper.

The complete admission schema remains held together. Migration `0167` is
allocated but **not created or registered**. No grants, database locks, audit
events, repository, application, routes, watchdog registration, OpenAPI operations
or external actions are added. Standard F is preserved: no new runtime direct
INSERT/UPDATE/DELETE grants on protected tables, and no EXECUTE grants.

Unbuilt database objects are `imported_job_baseline_v3`,
`imported_job_activation_terms_v3`, `job_import_v3_command`, `job_import_link`,
`imported_evidence_timing`, `adopt_in_flight_job_v3`,
`record_imported_evidence_timing` and their private immutable/deferred-proof,
audit and exclusion trigger helpers. Existing `imported_job_baseline` requires v1
cap/terms; existing `job_activation_terms` requires genuine quote and activation
identities. Neither is reused to fabricate a v3 imported baseline. No conversion,
backfill, disconnected table or incomplete writer is built.

| Hold | Required continuation |
| --- | --- |
| Q2 | Founder ruling on imported start anchor and historical counting; whole atomic admission/counting path |
| Q3 | Founder ruling on admission overlap; links and prospective capacity |
| Q4 | Founder ruling on external highest-sent provenance and unknown values; frozen terms and whole admission schema |
| Q5 | Founder ruling on source date, equality and unknown/conflicting dates; whole timing writer and exclusion persistence |
| Q9 | Approved D01/D03/D09/D12/D13 and release-gate evidence before any production processing/counting/fee use |
| MON-1 | Actual capacity serialization, interval and admission contracts, then dependency integration |
| CH5-H01 | Named SV-5/SV-6 imported-baseline Final Check/attribution continuation and exact allowed paths |
| CH5-H02 | UI parked; no screens or new browser journeys |

The eventual transport remains the separately versioned Nest
`/jobs/:id/parties/import-v3` and Next `/api/jobs/:id/parties/import-v3` paths,
but neither GET nor POST is implemented here. Invoiced admission is held together
with live admission; its binding never-counts rule is not weakened by that hold.

No complete CH5-S01–S22 assertion is claimed. New tests prove only the explicitly
named core/reference portions of S01, S02/S08/S09 numeric delegation, S04, S11
and S17. Existing v1 regression execution is recorded separately in the receipt;
all admission, persistence, access, catalog, audit, upgrade and server-journey
layers remain held. A different-model verdict and separate acceptance are still
required against the dispatcher's eventual exact commit.

For the held migration, fresh installation and rule-9 own-step upgrade proofs
remain mandatory, with canonical named-column text, full column types, identities
and comparator controls. Forward repair must preserve old history and receipts;
no migration rollback or repair is applicable to this pure-core change.
