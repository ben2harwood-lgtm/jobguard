# MON-7a synthetic prevention checks v1

MON-7a scope: B1, B2, B3, B5 and B6, with their DW1–DW4 assertions.
MON-7 adds the practice-only saved stage forecast and exposure curve below. This does
not enable live checks or staged invoice issuance.

## MON-7 saved practice stage exposure

`EXPOSURE_CURVE_ENABLED(environment)` is true only for `synthetic_demo`. The
prevention panel mounts the schedule only after an authenticated practice view
whose job ID matches the selected job. The schedule's own strict response must
also match that ID. No fixture is rendered as the selected job's schedule.

M4-18 remains an in-memory draft model and disabled. It has no saved dated stage
schedule to read. Migration 0550 therefore adds a separate, minimal operational
forecast history, `app.practice_exposure_schedule`, with tenant-qualified job
keys, forced RLS and runtime SELECT/INSERT only. Existing immutable-record
triggers also refuse updates/deletes. This is not an accepted commercial schedule,
a valuation, a receipt fact or an issued document.

`GET /api/jobs/:id/exposure-schedule` reads the latest saved revision, or a null
schedule (displayed as unknown). `POST` accepts strict
`exposure-schedule-command.v1`: command ID, expected revision and dated stages
with cumulative work/receipt forecasts or null amounts. The builder explicitly
enters fictional values; no prices, dates or receipts are inferred from other
job records. There is no lookup of an individual or external provider call.
The existing `PracticeAccess` job authorization, repository owner/ownership checks
and synthetic-only environment guard apply to both reads and saves. Other
sessions receive the same 404 as missing jobs; missing sessions receive 401.

Saves append a new revision and audit event atomically. A tenant schedule lock
serializes command-ID checks and expected-revision checks; the audit head is
locked last. A replay with the same canonical input has no second effect and
returns the current saved projection; changed payload/job is a command conflict.
Unknown save outcomes require a reload before further editing. Reloading never
renews the observation date: citations bind server retrieval time and the saved
revision's original server record time. Source freshness is evaluated at read
time. Missing/unavailable schedules never fall back to a generated fixture.
The fixture helper remains isolated to domain and render tests.

Each dated stage is an independent cumulative snapshot, not an incremental sum.
Reference net exposure is `max(0, cumulative work value - cumulative receipts)`
in bounded GBP integer pence, using bigint intermediates. This is an illustrative
unpaid-work forecast, not a claim about profit, loss, settlement or savings.
Receipt reversals can increase exposure at a later stage; no monotonic assumption
is imposed on either cumulative input. Stage identities are unique and dates
strictly increase. Excess receipts floor exposure at zero and create no credit.

Every displayed figure shares its row's exact generated schedule citation,
retrieval date and observation date. Missing citation, observation or either
amount yields `unknown` with no money figure. Source ages above the reference
1440-minute limit and future observation/retrieval yield `unknown`, never
`clear`; exactly 1440 minutes remains current. Fresh zero exposure is still an
advisory snapshot, never an assurance of safety. Future *stage* dates are forecast
dates, distinct from source observation dates. Forged citations, invalid dates,
amounts, versions and production inputs fail with `INVALID_EXPOSURE_SCHEDULE`.
The chart connects adjacent known stages only; unknown stages leave gaps. The
adjacent accessible table provides exact figures, stage dates and source dates.

The curve has no Decision, posting, fee, value-receipt contribution, meter,
entitlement, outbox, worker, external action or provider. It only evaluates saved
forecasts. M4-18 stays disabled. No data backfill, new operational alert or
provider release is needed. Forward fix: disable the practice presentation or
correct the reader in a follow-up; preserve saved revisions and audit events.
The additive table is unused by older application code.

The existing MON-7 browser suite now covers saved schedules, reloads, unknown
amounts, stale presentation, cross-session refusals and fee/value/work-meter
severance. CI runs this file in both `mobile-360` and `desktop` projects.
Stale browser presentation deliberately ages a response; the normal save/read
and reload assertions use real PostgreSQL-backed routes. Full database/catalog,
upgrade and browser CI plus independent RED review remain required.

## Authority and subjects

Every Next and Nest request authenticates through `PracticeAccess`. Missing or
invalid session: 401. Another session's job and an absent job: identical 404.
The application passes the authenticated membership, tenant context and practice
digest to the repository; the repository rechecks current owner membership and
job ownership, including on replay. No client tenant, customer type, individual
flag, company number, source result or monetary amount is accepted.

The current CH-3a immutable binding is the subject. Property facts refer to its
site revision and run for homeowners as well as businesses. B2 displays only its
saved paying-party record, citing server retrieval time and the binding's separately
labelled recorded date. Missing paying-party data displays `unknown`. No named person is
searched. Company checks and watches use only the binding's customer revision.
`prevention-company-eligibility-reference.v1` permits exactly type `business`
with a company number matching CH-3a's eight digits or two capitals and six digits.
Every other type, including `person`, or a business without a valid number shows
`not run — not a registered company`. The server refuses those commands and
stores no counterparty row. This is an interim synthetic rule; D12 v3 owns
production eligibility.

"The current customer revision" means the customer's LATEST revision (round 2,
integrator decision, fail closed). CH-3a customers are shared across jobs and
revised separately, and a job binding pins one revision. A company check or watch
is eligible only while the binding's pinned revision IS the customer's latest
revision AND that latest revision is a `business` with a valid company number.
If the builder later re-records the customer (for example as a `person`, or as a
business under a new number), every company/watch command on the old binding is
refused with `NOT_REGISTERED_COMPANY` and the panel shows `not run — not a
registered company`, never `clear`. The same applies to a later revision that
would itself be eligible: the builder re-binds the job to it (a CH-3a correction),
which creates a new binding. The rule is enforced twice: by the repository and by
the 0103 `require_prevention_subject` trigger, which re-reads the latest revision
at insert time.

An existing watch needs no stored "stop": it is derived inactive. The view reads
the company card and feed results only while the customer is eligible, so a stale
or ineligible customer shows no company card, an inactive watch and no feed
results. Earlier facts stay immutable in the tables. A pinned revision can never
become the latest again (revisions only increase), so a watch derived inactive on a
binding stays inactive; a re-bound job starts with a fresh binding and no watch.

## Results and reference staleness

Strict Zod `prevention-result.v1` contains kind, exact source ID/name, retrieval
date, nullable observation/fact, scenario evaluation time, status/reason,
`synthetic_demo`, and reference policy version/maximum age. These are snapshots
at their displayed evaluation time; reading does not initiate a new evaluation.

`prevention-staleness-reference.v1` is reference-only. Its synthetic maxima are:

| Source ID | Maximum age (minutes) |
|---|---:|
| synthetic-listed-building.v1 | 1440 |
| synthetic-conservation-area.v1 | 1440 |
| synthetic-article-4.v1 | 1440 |
| synthetic-planning-history.v1 | 1440 |
| synthetic-flood.v1 | 180 |
| synthetic-companies-house-card.v1 | 1440 |
| synthetic-companies-house-feed.v1 | 180 |
| synthetic-gazette-feed.v1 | 180 |

Age equal to the maximum remains current. Greater age, missing information,
unknown source policy or a future observation/retrieval cannot yield `clear`.
They yield `unknown`. A current generated constraint or feed notice yields
`advisory`; current negative/active fixture facts yield `clear`, explicitly
limited to that fictional source, never a guarantee. PostgreSQL validates the
same reference policy, state derivation, exact citation and dates.

Fixture identity: `generated-prevention-registers.2026-10-07.v1`. Retrieval attempt
date: `2026-10-07T12:00:00.000Z`; stale observation date: `2026-09-01T00:00:00.000Z`.
Variants: `mixed` (Article 4 missing, flood stale), `fresh`, `stale`, `missing`.
All records are generated; no address or company is submitted to a register.
Only Companies House (synthetic) and The Gazette (synthetic) feed fixtures exist.
The UI evaluates at scenario time `2026-10-07T13:00:00.000Z`; the strict synthetic
command supports other explicit scenario times, following readiness's convention.

## Commands and persistence

`GET /api/jobs/:id/prevention-checks` returns strict `prevention-view.v1`.
`POST /api/jobs/:id/prevention-checks/:action` accepts `prevention-command.v1`:
`commandId`, `action`, `expectedBindingId`, `scenarioNow` (capped at millisecond
precision, so the application and PostgreSQL evaluate the same instant),
`fixture`, plus
`expectedWatchRevision` for the three watch actions. The path and body action
must agree. Actions are `property`, `company`, `start_watch`, `stop_watch` and
`evaluate_watch`. Next is a thin adapter; Nest exposes the same application.
The shared workspace composition registers `preventionChecks`.

No customer is watched by default. Start/stop are explicit builder commands.
Evaluation requires an active watch and runs on demand, never on a timer.
Start/stop append a cited synthetic builder-command control row; evaluation
appends two cited advisory feed facts. Watch revisions are scoped to the binding.
A changed binding exposes no old checks and starts with an inactive watch.
Start/stop hide prior feed results; facts themselves remain immutable.

Errors include `INVALID_PREVENTION_COMMAND` / `NOT_REGISTERED_COMPANY` (400),
`PARTIES_REQUIRED`, `REVISION_CONFLICT`, `COMMAND_CONFLICT`,
`WATCH_NOT_STARTED`, `WATCH_ALREADY_STARTED` (409), `FORBIDDEN` /
`SYNTHETIC_ONLY` (403), and `NOT_FOUND` (404).

Migration 0103 adds only `property_constraint_fact`, `counterparty_check`,
indexes, invoker validators and triggers. Both tables have tenant/job/binding
foreign keys, matching subject-revision checks, ENABLE/FORCE RLS, migration
ownership and runtime SELECT/INSERT grants. UPDATE/DELETE are also rejected by
an immutable trigger; runtime cannot TRUNCATE or alter policies. Subject checks
run with invoker permissions; no privileged helper is added. Audit FKs are
deferred so all domain/receipt writes precede the final audit-head lock.

Command lock order: current membership verification, receipt claim, transaction
advisory lock for tenant/job prevention commands, CH-3a's existing narrow
`require_current_job_parties` job share lock,
domain writes, result/receipt completion, audit-head lock and append, commit.
The same command ID and payload replay the stored result; a changed payload or
job conflicts. Concurrent commands serialize at the receipt/advisory lock. The
existing share guard prevents a binding correction during evaluation, without
granting runtime UPDATE on jobs or membership. A stale binding
or watch revision fails with no fact, receipt or audit effect. Failed audit
append rolls the complete transaction back. Financial modules never consume
these facts; no Decision, notification, outbox action, fee, value figure, meter,
plan or entitlement is created or changed.

## Release and operations

No external route is introduced, so this leaf adds no data-flow register entry.
Each live source must have its own register entry and D04 / D12 v3 approval
evidence before use. The live-adapter factory always refuses initialization;
repositories additionally reject every mode other than `synthetic_demo`.
Live M2-6, G1, source approvals and D14 remain gates. No paid checks exist.

Migration is additive, with no backfill. Previous application code can run
alongside it. Forward fix in a new reviewed migration after application: preserve
facts and audit history, disable the panel/commands if needed, correct validators
or projections without rewriting recorded results. No provider alert or worker
schedule is added. CI must execute fresh/preceding-schema upgrade, catalog,
adversarial PostgreSQL and both viewport browser suites before acceptance.
