# M4-19 construction notices — dark v1

RED: commercial/legal sends. This implements only the approved dark interpretation of
BUILD_PLAN §11.5 M4-19, on the M4-18 interim-application base.

## Boundary

`CONSTRUCTION_NOTICES_ENABLED` is a literal false. There is no route, database,
worker, outbox, real legal text, provider integration or AI wording. The preview
is a structured fixture worksheet, visibly labelled “FIXTURE, NOT REVIEWED — NOT
A NOTICE — NOT FOR SERVICE”. `assertRealConstructionNoticeAllowed` always rejects
real generation and sending, including after a claimed human approval or review.
No deployment, real people, real contract, real notice or professional review is
represented by this change.

## Profiles, facts and dates

The immutable registry is the only calculator source. It ships two deliberately
fictional profiles; neither is a statement about UK construction law:

- `fixture-calendar` v1: fictional contract A clause 7; due date minus two calendar
  days, no weekend or holiday adjustment.
- `fixture-working` v1: fictional contract B clause 9; due date plus two working
  days, then next-working-day roll. Its named fictional calendar excludes Saturday,
  Sunday and 2 November 2026. This is not a UK bank-holiday calendar.

The profile carries source, template-placeholder, facts, date-rule, service-assumption
and fixture-suite versions. Only named calendar rules apply. Dates are validated ISO
calendar dates, calculated at UTC midnight; no local-time cutoff or deemed-service
period is inferred. Unsupported profile/version or out-of-range result requires
advice. Unknown service methods fail validation rather than guessing.

The structured checklist requires a due date, fictional contract reference and trigger
evidence reference. Missing facts block preview. All inputs are strict, versioned
Zod schemas with typed domain errors. Notice histories scope every revision to tenant,
job and notice, enforce sequential linked revisions and unique revision identity,
and return deeply frozen copies. Changing a due date creates a new revision and
recalculates from the selected profile, preserving the earlier revision. References
are synthetic lineage, not proof of real evidence or authenticated membership.

`noticeProfessionalReviewV1` models the eventual review receipt: reviewer and
qualification references, signed timestamp, exact profile/template/facts/date-rule/
service/fixture-suite versions and signoff evidence. Every shipped profile has
`professionalReview: null`. No caller-supplied review or profile is accepted into the
registry. This schema does not verify professional qualifications or grant release
authority. A future production change requires genuine professional review of all
supported rules, facts, templates, calendars, cutoffs and service assumptions, plus
review-approved fixture suites and the authenticated, audited command/execution path.

## Fixture preview approval and service evidence

A synthetic human Decision targets the exact serialized, schema-normalized preview,
including the tenant, job, notice/revision, full facts, recipient, method, calculated
date and full source profile. Exact bytes are retained instead of introducing a hash
implementation into this pure fixture model. This is not a production content hash or
an authenticated approval. Pending/rejected/dismissed/revoked/superseded resolutions,
future decisions, expired approvals and changed targets are rejected. Timers,
valuation suggestions and AI flags cannot supply the human actor/action schema.

The fixture service book retains that Decision and exact approved preview together
with append-only service events bound to its notice revision and Decision ID. Each
event records its own identity, timestamp, provider reference, evidence reference
and separate legal-assessment reference where applicable. `queued`, `provider_accepted`,
`outcome_unknown`, `read` and `legally_served` are distinct facts, never one sent flag.
Provider acceptance or read evidence cannot imply legal service: the latter requires
its own explicit evidence and assessment reference. Hand-delivery fixtures may record
an assessed service fact without inventing a provider acceptance event.

An initial queue fact is required. Unknown outcomes cannot be blindly requeued;
subsequent reconciliation evidence is appended instead. Exact retries are no-ops;
identity reuse with different content is rejected. Imported histories are revalidated,
including context, chronology, Decision binding and evidence requirements. Evidence,
provider and legal-assessment references remain fictional assertions; this module
neither validates original bytes nor determines whether anything was legally served.
Service books bind one exact revision and Decision; a revised notice needs a new
approval and book. No real execution, durable idempotency or RLS is claimed.

## Verification and handoff

The focused Vitest suite covers explicit calendar rules, leap/year boundaries, missing
facts, changed dates with preserved history, replay conflicts, stale/expired approvals,
context isolation, distinct service facts, hand service, unknown-outcome reconciliation,
and the unconditional real-notice gate. M4-18 regression tests run alongside it.
Actual commands/results are recorded in the router commit-message handoff.

No migrations, runtime grants, environment variables, alerts or public interfaces
change. PostgreSQL/browser/provider suites are inapplicable to this isolated domain
model; repository-wide CI and an independent exact-head RED review remain outstanding.
Professional template/rule review and production generation/send remain disabled.
The shared `packages/core/src/index.ts` export is the only overlap with other pieces;
merge must serialize/reconcile that export.
