# MON1-L meter lifecycle foundation v1

Build-ahead only, issued 23 October 2026 under decision 74. Base:
`dc5721230fd8aedbf2d9d0457789074b66b48765`. No acceptance, merge,
runtime admission, subscription charge or DEMO-S closure is claimed.

This is a partial implementation of the MON1-L planning card. The issued order
permits building ahead; it does not approve endpoint policy or establish the
missing predecessor/review evidence. Existing CH-4 facts and supplied meter
calculators remain unchanged. Coordinator owns barrel registration.

## Envelope and trust

`meterLifecycleInputV1` is a strict internal Zod schema, not an HTTP command.
It binds one tenant/job to an activation source, immutable terms ID/revision,
party-binding ID, customer/site, small-builder track and immutable small flag.
It also binds the source revision, six-digit original activation time, CH-4
events, optional lock/trip identities and times, supplied as-of cutoff and
London date range `[startDate,endDateExclusive)`. Missing or unknown fields,
versions, revisions, source kinds and caller count/time/policy overrides fail
with `INVALID_METER_LIFECYCLE_INPUT`; duplicate event ID with different content
retains CH-4's `WORK_FACT_IDENTITY_CONFLICT`. UUID fields are normalized to lowercase in this envelope before identity, alias
and replay comparisons; case-only duplicates replay once and conflicting
content is refused. Shared CH-4 helpers are unchanged. No input values appear in errors.

The caller must supply **all known facts**, verified from immutable server
sources. This pure module cannot authenticate the caller, verify tenant
ownership, certify source completeness, validate a persisted terms flag or
establish authority. Tenant qualification is an envelope binding; CH-4 event
rows themselves carry job ID but no tenant ID. No supplied Boolean grants a
trial: only `{status:'unavailable'}` is currently supported. An accepted trial
variant is STOP until its accepted source contract is supplied.

`policy` has exactly version `meter-lifecycle-policy.v1`, revision
`specified-foundation.v1`, clockStatus `held`. This revision identifies this
foundation, **not an approved pricing or clock policy**. Clients cannot create
approval by changing the revision or supplying an arbitrary policy object.

## Specified projection and explicit unknowns

`projectMeterJobTimeline(raw)` canonicalizes CH-4 events with `orderWorkFacts`
and validates predecessor structure with `projectWorkFacts`. Source identities,
original microseconds, recorded times, activation/terms/binding references and
source revision remain in the output. Events participate at the cutoff only
when both fact and recorded time are at or before it. Later-delivered earlier
facts can therefore change a new projection without rewriting any supplied fact.

`meterDay31Candidate` supplies the explicit London day-31 boundary. First
site-evidence candidates compete by exact original time; ordinary activity
alone is not fabricated into first evidence. Close and lock produce exact
terminal candidates. Co-earliest IDs are retained in canonical order; the
lexical cause label is diagnostic ordering, not economic attribution.
Post-lock activity produces an explicit linked-job hold and no restart.
Under **H-METER-CLOCK**, a first-evidence or day-31 candidate exactly at
the earliest close/lock stop produces no start. Only a strictly earlier
candidate can start. This conservative candidate tie rule does not approve
stop-day inclusion or a complete counting interval.

Every timeline currently returns status `held`, `H-METER-CLOCK` and **empty
intervals**. Start/stop fields are candidates, not the earliest complete
counting interval. `commitment.status` is likewise explicitly a candidate,
never a cap/admission verdict: a live job may commit capacity before day 31,
but finish/quiet/current authority must still be resolved by its consumer.
Reopen/resume/cancellation also retain `H-CH4`.

No endpoint convention has been guessed. An empty held interval list does
**not** mean zero usage. A consumer must refuse billing/admission on held output.
There is no implemented prospective restart/cancellation policy in this version.

`projectMeterDays(raw)` takes a nonempty, single-tenant set of distinct jobs
with identical cutoff and date bounds, and an explicit Solo/Builder plan. It
returns every calendar label in the supplied range. `places` and
`countedPlaces` are **null**, with held status, on every date. Separately named
`classifications`, `candidatePlaces` and `candidateAllowance` are diagnostics
over **all supplied jobs**, irrespective of interval membership, activation date
or stop. `candidateAllowance.rawPlaces`, `freeSmallPlaces` and `countedPlaces` are
all typed **null** until real day membership exists. Numeric raw/free fields
would reconstruct a count over supplied jobs and must remain held.
They must never be billed or displayed as actual counting places.
Grouping uses `groupSuppliedMeterPlaces`; no allowance is computed. Same
customer/site forms one candidate place, mixed groups are non-small, and a
different customer remains separate. An immutable trip makes its job non-small
from the original London date forward; there is no omission/untrip field.
This consumes a trip reference, not an approval/threshold entitlement engine.

## Endpoint truth table and STOPs

| Input/case | Foundation behavior | Remaining boundary |
| --- | --- | --- |
| Activation / day31 | Exact existing London day31 candidate | Actual quiet-stop intervals held |
| First photo day5 | Earlier exact site-evidence candidate | No proof of source command authority |
| Finish +7, quiet30 | No deadline or interval guessed | STOP H-METER-CLOCK / Q-04 |
| Cancellation after ended interval | Preserved source, no recomputation | STOP H-METER-CLOCK / Q-05 |
| Explicit/implicit resume, reopen | Preserved event, typed hold | STOP accepted CH-4 commands/admission and endpoint policy |
| First-ever evidence after day31/quiet stop | Source retained, no admission ruling | STOP non-refusable-source versus restart overlap |
| Lock/close | Exact candidate stop, no post-lock restart | Stop-day inclusion awaits endpoints |
| Invoice/payment/catch/credit/retention/snagging | Not accepted CH-4 event kinds | Existing source classifier owns exclusions |
| Trip | Immutable reference, latched date classification | MON1-T owns authoritative derivation |
| Trial/import/diary | No runtime or eligibility claim | Accepted external source seams/consumers required |

M1L-01, -04, -05, -07, -08 and -09 have bounded foundation coverage. M1L-02,
-03 and -06 have explicit refusal/hold coverage, not full lifecycle acceptance.
All nine IDs remain subject to complete interval/consumer proof where applicable.
Tests use relative imports; no shared export, migration, route, catalogue,
provider, network, hidden input or current-clock dependency was added.
