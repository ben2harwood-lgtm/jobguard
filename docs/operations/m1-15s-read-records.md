# M1-15S stored financial check and pilot measurement

## PILOT-10 operator procedure

Use `ShadowPilotFinancialReader.pilotReport(context, jobId)` offline with the
existing restricted connection and a verified context for the tenant. Run it for
each job in the approved cohort inventory. It reads the lock and books in a
single PostgreSQL statement, requires a stored pilot lock for a no-charge
small-builder capture job, and refuses pre-lock, foreign and practice jobs. A
refusal is an incomplete run. Keep `evidence` in the restricted workpapers with
the cohort inventory. The `report` projection contains the count, method,
denominator, missing metric names and financial check totals. It omits identifiers,
digests, timestamps, source text, actor details and contact information.

The stored lock provides one verified denominator per job and the count of
distinct entries in its frozen capture register, including withdrawn captures.
The restricted evidence identifies that immutable lock snapshot and capture
register by their stored hashes, alongside the digest of the financial read.
Repeat the read when preparing the report so intervening financial activity can
invalidate the no-charge finding. No observation of signals, attribution,
recovery, reveal, fairness, withholding harm, must-surface coverage, source
usefulness or hypothetical fees is inferred from the lock or its existence.
Those metrics remain missing on this pilot base. A customer receipt on its own
cannot establish a recovery attributable to the Final Check.

Use `report(context, jobIds, observations, access)` for isolated fictional
rehearsals of the full report. It attributes measurements to immutable fixture
sources and distinguishes a missing inventory from an observed empty one.
Denominators identify the jobs, lock snapshots, signals, assessments, settled
receipts and allocations, audited must-surface events, post-reveal ratings,
withholding observations and subscription scenarios available for the respective
metrics. Fairness requires an explicit response strictly after the recorded
reveal and is separate from usage. The hidden-versus-shown arm stays disabled.
The hypothetical fee methods require the corresponding fixture observations.
Nothing in the rehearsal counts as a collected human response or a release approval.

The no-charge check counts tenant-wide subscription agreement revisions and gross
mandate activations, including activations later revoked. It also checks plan
changes, trial sources with conversion, periods, statements and simulated work,
attempts and results, even if the selected job has empty fee books. A row in
either inventory refuses the report. Older fixture records without a subscription
inventory are marked missing. The tenant scope deliberately covers all stored
subscription history, so this procedure assumes a dedicated no-charge pilot tenant.
Use `read(context, jobIds)` for the cohort-wide check, including jobs that have
yet to lock. Confirm both financial inventories are present and empty. Keep
the digest and job inventory with the restricted evidence.

### Export and telemetry review

- The pilot report is offline. There is no builder response, download route,
  client import, cache entry or telemetry event for it. The reader does not query
  hidden signal tables. Retain the evidence and offline diagnostic errors in
  restricted workpapers and export only the report projection. Report refusal
  before lock returns a generic code and no measurement payload.
- The existing signed audit export and privacy rehearsal API are practice-gated.
  Their artifacts are not M1-15S report inputs. The operator privacy rehearsal
  has a separate scoped disclosure receipt path for subject access and export.
- The pilot health route projects heartbeat, queue availability, backlog and
  failure booleans. The monitor logs fixed alert codes, owner roles and state.
  Neither receives the report reader, a lock snapshot, identifiers or contact data.
  This was a source review with fictional boundary fixtures. It supplies no live
  telemetry or subject-access approval.

## Existing fixture report and financial reader

`ShadowPilotFinancialReader.report(context, jobIds, observations, access)` is the
DB-backed report entry point. Tenant identity comes from `VerifiedTenantContext`.
It rejects supplied `financialEffects` and `financialRecord` fields and reads the
selected jobs and their books in one PostgreSQL statement/snapshot. No HTTP route,
screen, provider action or pilot activation is added.

The offline connection must already have the existing `jobguard_migration` role's
SELECT permissions. Builder runtime access stays denied. No new grants, routine,
stored table or migration is needed. Never attach migration credentials to a web
handler. Explicit tenant predicates supplement FORCE RLS; a privileged connection
alone does not demonstrate RLS isolation. The PostgreSQL test explicitly switches
to the non-superuser, non-BYPASSRLS migration role and also tests unfiltered reads.

The financial record binds the tenant, sorted complete requested job set, source
table, job and row IDs, per-row SHA-256 and aggregate SHA-256. Counts are derived
from these source rows: legacy `recovery_fee_journal` and current
`success_fee_journal` for accruals; `platform_fee_statement` for issued SME fee
documents; `platform_fee_attempt` for collection/refund attempts. All rows count,
including compensations, credit documents, pending, failed and refunded attempts;
there is no netting away earlier activity. Any source row makes report generation
refuse with its table, job and row ID. Missing/invisible requested jobs fail closed.
Customer invoices/payments and hypothetical illustrations are not platform fees.
Contractor books are outside this SME check.

The returned snapshot is cloned and frozen. Hashes bind reproducibility at read
time, not authenticity or absence of later writes. The pure core remains a
synthetic fixture seam: it validates the record shape, binding and digest, but a
hash is not a database signature. Operational callers must use the DB-backed
entry point and re-read for each report; no cached/caller financial claim is used.
Existing observation/measurement inputs remain synthetic fixture snapshots. This
change does not claim that human observations have been collected from storage.

The real pilot, G1, approved D12/D13 scope, fairness responses from people and
report review before G4-S remain OPEN. G0–G5 remain closed for this dark slice.
No human, legal or provider result or approval is supplied by this change.

The original fixture slice was inspected on 4 November 2026 at clean merge
`a2876841b` against its merged `origin/main` base `155a3eb06`. No compatibility
code changes or migrations were needed. The lane contains exactly this slice's
eight non-lane paths; no other piece's lane is added relative to that base.

Local validation used Node 24.17.0 and installed Vitest 4.1.12, with explicit
`--maxWorkers=2` and at most three named files per invocation:

- Each of the seven workspace packages/apps passed its existing
  `node_modules/.bin/tsc -p <workspace>/tsconfig.json --noEmit` equivalent.
- Core `shadow-pilot-report.test.ts` and `shadow-pilot-measurement.test.ts`:
  47 tests passed.
- API `auth/context-boundary.test.ts` and `auth/identity.test.ts`: 152 tests
  passed; `watchdog-registry.test.ts`: 126 tests passed.
- DB `migration-proof-loader.test.ts`: 76 tests passed.
- `node tools/agent-lane-boundary-lint.mjs` and
  `git diff --check origin/main HEAD` passed.

The initial `pnpm typecheck` and filtered unit command stalled before starting
checks and were interrupted. Direct installed binaries completed the checks.
Initial guard imports lacked workspace `dist` outputs; compiling the existing
config, core, storage, DB and AI packages with their existing TypeScript configs
resolved those imports, and the affected guards then passed. No dependencies
were downloaded or test expectations changed.

CI must still prove PostgreSQL stored-row reads, gross accrual/invoice/collection
refusal and tenant isolation through `shadow-pilot-financial.integration.test.ts`,
plus the required full lint, test, build, migration and browser suites. No database
or browser was started locally. Independent RED review at the final head and
green CI remain required before landing; the real pilot and G4-S remain open.
