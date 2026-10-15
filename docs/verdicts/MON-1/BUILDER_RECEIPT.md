Built by Codex; dispatched 13 Oct 2026; continuation and main catch-up 15 Oct 2026.

## Current continuation — authoritative over the historical receipt below

This remains the **pure-foundation sub-part**, including precisely settled policy
portions. It is not complete server-slice acceptance or complete MON-1. Check
lane RED; MON1-A02–A36 remain uncompleted as full criteria. No independent verdict
or separate acceptance is claimed. The requested Sonnet/unavailable first-line
template would misidentify the builder; this receipt records the actual builder.

### Current baseline and merge resolution

- Observed `origin/main`: `6671538c8d69936c162368c760dd6ce0f7f10493`, matching the header.
- Starting HEAD: `281a49281bd72512014c9758929b0cf7fa42906d`, the older MON-1 commit.
- Merged CH-4: `c203bb27893342ca2569272ff4dc908b614267d6`, PR #185. Read-only
  ancestry inspection confirms it is in current main. The earlier build-ahead
  authorization and receipt below are historical evidence, not current readiness.
- The only incoming conflict was `config/agent-lane-assignments.json`. Resolved
  its working-tree text using the editing tool (`apply_patch`), retaining main's
  lines exactly, followed by this piece's addition within the conflict region.
  JSON parses with unique keys. Removing only the MON-1 line reproduces main's
  registry **byte for byte**. No other lane changed.
- Git still records the path as unmerged: clearing the index conflict requires
  staging. The user expressly forbids Git writes, so the dispatcher must stage
  the resolved file and complete the merge. No `git add`, commit or push ran.
- The six-file foundation lane is retained, with its stale note corrected to
  current main and **0163 allocated but held**. No migration exists or is
  registered. The old receipt's 0148 reservation is superseded by this order.
- Main's migration runner now ends at **0158**, including CH-4 at 0144, rather
  than the draft's 0138. The runner and SQL bytes match main; registrations
  remain in numeric order. No ENT branch interfaces were introduced.
- Main's AGENTS and BUILD_PLAN match the working tree exactly. Inspected current
  §10.1.2–10.1.9, the entire MON-1 card, §10.5 and §12 dependency/graph rows;
  the quoted card/formula/source rules remain unchanged. Current main wins over
  historical migration endpoints and the old receipt's baseline assumptions.
- Node available here is **24.17.0**; `.nvmrc` and CI pin **24.15.0**. Installed
  pnpm **10.28.1**, TypeScript **5.8.3**, Vitest **4.1.11**, Turbo **2.10.12** were
  used without installing/downloading anything. A clean pinned install is NOT RUN.

### Re-inspected CH-4 interfaces and extension limits (MON1-A01)

`packages/core/src/job-work-state.ts` supplies the consumed `workFactTimeV1`,
`siteSourceV1` and `classifySiteSource`. Canonical original `factAt` is separate
from `recordedAt`. The schema has seven fact kinds and source classification
excludes orders, supplier invoices, quotes, messages, readiness and commercial
review actions. No event projection or deadline behavior is consumed here.

`packages/db/src/job-work-state-repository.ts` calls the existing checked
`app.ch4_read_work_facts(uuid,uuid,text)` using the existing verified context.
The SQL routine rechecks the persisted session/owned-job boundary. The 0144
source triggers record photo, delivery, receipt, builder-extra and stage facts;
source receipt identities and original server times are persisted independently
of processing. Deferred `ch4_append_fact_audit` runs after business locks.
`job-work-state-sources.ts` preserves the existing source commands' receipt/replay
paths, translates typed refusals, and offers an ordinary linked job for new
post-lock work. These database/server paths were source-inspected only.

Actual candidate caller paths remain `activation-repository.ts` (v3
`SwitchJobLiveV3Mutation.lock` and `app.switch_job_live_v3`), `evidence.ts`,
`proof-repository.ts`, `variation-repository.ts`, `purchase-order-repository.ts`
and `supplier-document-repository.ts`. Their existing authority/replay/audit
seams remain untouched. CH-4's contract still holds finish/cancel/close/reopen/
resume/link command permissions and execution; no such new writer or route is
invented. The existing source triggers take job locks, so adding a late capacity
trigger would violate MON-1's required tenant-capacity-first order. Future caller
integration needs its own explicit lane and lifted holds. Current pure work
requires no caller expansion.

### Continuation changes and tests-first evidence

The older commit already contains the authorized supplied-input grouping,
allowance, history preservation, prospective identity correction, qualifying
approval-date handling and exact aggregate period/correction formula. These were
retained. No duplicate meter, full event replay, admission stub, DDL or route was
added.

Added own-file cases for day 31 landing on each DST-change date, exact London
offsets, and year-zero refusal. A first fixture incorrectly used 1850 for the
historical seconds offset; local Intl output showed that year already uses GMT.
The fixture was corrected to 1840 **before implementation** and rerun red. This
was a fixture correction in MON-1's own unmerged test, not a weakened main test.

- First new-test run: **exit 1**, 2 failed / 45 passed; one incorrect 1850 fixture
  and genuine year-zero refusal failure.
- Corrected pre-implementation run: **exit 1**, 2 failed / 45 passed. The 1840
  midnight candidate was almost a day early, and year zero was relabelled.
- Implementation now reads Intl's full signed London offset (minutes/seconds
  included) and refuses year zero consistently with the existing 0001–9999 date
  contract. It continues using supplied timestamps and no current clock.
- Final own-file run: **exit 0**, **2 files / 47 tests passed**. Every new case
  carries its partial acceptance ID; full criteria remain held.

The precisely mapped adopted answers are unchanged, and were re-read from
`~/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261013.md`:

> Use London dates; preserve past stops and charges.

> Avoid double charging; identity corrections affect future bills only.

> Use the original qualifying approval date; exclude proposed prices.

Source: `BEN-ANSWERS-20261013.md`, card
`jobguard-twenty-product-decisions-2026-10-13`, mapped portions Q6/Q7/Q9 only.
Supplied synthetic identities, snapshots, qualifying facts and complete daily
plan/trial schedules remain fixture inputs, never authoritative tenant facts.

### Current holds and coordinator-owned lines

- **Q2 / STOP on migration construction:** the preserved complete catalogue
  assertions remain at `packages/db/test/tenancy.integration.test.ts:190`
  (`expect(result.rows).toEqual([`) and **:444**
  (`expect(ownership.rows).toEqual([`). Before = those unchanged lines and
  main's complete lists; after in this piece = **identical**. A future separately
  issued prerequisite must approve adding rows for `job_small_trip_event`,
  `meter_computation`, `meter_correction`, `meter_day_ledger`. No assertion,
  catalogue row, fingerprint or merged test was changed here.
- **Q5:** tenant-summary access and the entire new server read remain held.
- **Q6 remainder:** exact stop/quiet/trial endpoints, quiet origin, equal-time
  ordering, cancellation restarts and conversion-day charging remain held.
- **Q7 remainder:** named allowance/paid-extra/grace attribution and job/penny
  weights remain held. Static grouping chooses no beneficiaries.
- **Q9 remainder:** qualifying persisted transitions, source bindings and all
  trip-latch hooks remain held; numeric comparisons do not latch a trip.
- **Q10:** D09 remains proposed (`docs/decisions/d09-plan-tiers-metering.md:3`);
  D02/D05/G4-S remain gates. No production execution, subscription obligation,
  collection, provider request, success-fee offset or retrospective pilot charge.
- **Q4/Q12:** actual v3 import routes belong to CH-5; original UI/drill-down and
  exact `V(...)` assertions remain parked. No browser run or UI change.
- **Q1/Q3/Q8/Q11:** current merged CH-4 is inspected; supporting hypothetical
  persistence ownership does not release Q2; local test runs are own-file,
  sequential, at most three files and `--maxWorkers=2`; no ENT branch dependency.
- Real customer information remains **OFF**, no spending is authorized, and
  ENT-10e remains held. MON1-A37 records handoff only; independent exact-commit
  verdict and separate acceptance are outstanding.

No new GRANT statements: **none**. Standard F remains satisfied: no new direct
runtime INSERT/UPDATE/DELETE grant, table, checked routine, role, receipt or audit
writer. PostgreSQL ownership/RLS/effective-role/audit-order/persistence proofs and
rule-9 upgrade/forward-fix evidence remain **HELD**, not mocked passes. The
verbatim upgrade rule remains in the historical receipt below for future work.

### Current verification results

The current run details, preservation hashes and final head are appended at the
end of this file under “Continuation verification and final handoff”. Earlier
green results below describe the older execution only and do not override a
current failure. Forced checks use `--force`; no cache hit is claimed as a run.

## Historical receipt — retained unchanged from the older implementation

Built by Codex; dispatched 13 Oct 2026.

This is the MON-1 pure-foundation sub-part, including only the precisely settled
policy portions. It is not complete server-slice acceptance or complete MON-1.
Check lane RED. Independent verdict, separate acceptance, CH-4 merge and the
dispatcher catch-up remain required. No commit, staging, push or PR was performed.

The addendum requests the first line “Built by Claude Sonnet 5.5, Codex unavailable;
dispatched 13 Oct 2026”. That template does not describe this execution. The actual
builder is Codex, so this receipt records the actual builder above.

## Baseline and authority

- Issued and observed `origin/main`: `e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4`.
- Starting and final HEAD: `f93716da170f1ba10a98abe1e17f57dd169f8cc2`.
- Branch: `codex/sandbox/mon-1`; starting working tree was clean.
- The header explicitly permits build-ahead from this CH-4 head (PR #185), replacing
  the draft's wait-for-merge construction rule. CH-4 is not claimed merged. The
  supplied Opus PASS is dispatcher evidence, not a review performed by this builder.
- `AGENTS.md` and `BUILD_PLAN.md` are identical between observed main and HEAD.
  Inspected applicable §10.1.2–10.1.9, §10 MON-1 card, §10.5 source ownership and
  §12 dependency/ledger rows against that main. No product-policy text was edited.
- Main wins over the draft's old runner endpoint: main registers 0138, 0139, 0140
  and 0141 (`packages/db/src/migrate.ts:79`–82). HEAD additionally registers CH-4
  0144 at line 84. MON-1's issued 0148 is reserved only; no SQL was created or
  registered. Historical graph reservation 0070 was not used.
- D09 remains proposed, with no dated approval evidence; D02/D05 and G4-S remain
  gates. These are synthetic principal calculations, with no VAT or entitlement
  decision. Real customer information stays OFF; no spending is authorized here.
- No dependency on unmerged ENT-3b/3c/3d interfaces was introduced. Their main
  registrations are retained as supplied, without rebuilding their features.

## Adopted answers available to reviewers

Source: `BEN-ANSWERS-20261013.md`, decision card
`jobguard-twenty-product-decisions-2026-10-13`, recorded 13 October 2026 at 20:07,
Ben's answer “Accept all leans”. Inspected the actual local record at
`~/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261013.md`.

- Q6: “Use London dates; preserve past stops and charges.” Calendar basis and
  preservation only. Quiet-clock origin, exact endpoints, simultaneous ordering,
  trial expiry/conversion and cancellation-driven restart remain held.
- Q7: “Avoid double charging; identity corrections affect future bills only.”
  Fixed grouping and prospective corrections only. Allowance/grace beneficiaries,
  paid-extra attribution and job/penny weights remain held.
- Q9: “Use the original qualifying approval date; exclude proposed prices.”
  Applies to explicitly supplied qualifying facts only. Persisted qualifying
  transitions, source binding and trip hooks remain held.

No adopted answer approves D09, privacy, retention, safety, tax, provider routes,
production execution or release. ENT-10e remains held.

## CH-4 interfaces source-inspected

| Interface / path | Observed fact and MON-1 use |
| --- | --- |
| `packages/core/src/job-work-state.ts` | Event version `job-work-state-event.v1`; id/job/sequence/kind, original `factAt`, later `recordedAt`, receipt/command/predecessor, close reason/note. Seven fact kinds, canonical UTC microsecond timestamps. MON-1 consumes `workFactTimeV1`, `siteSourceV1`, `classifySiteSource` only. |
| `packages/db/src/job-work-state-repository.ts` | Read-only `JobWorkStateRepository.read`, existing verified context, `app.ch4_read_work_facts(tenant,job,digest)`, typed read result. No MON-1 call or modification. |
| `packages/db/migrations/0144_job_work_state.sql` | `job_site_source_receipt`, `job_work_state_event`, `job_photo_purpose`, `job_link`; source triggers, original received timestamps, deferred audit, closed-job lock/check admission. No MON-1 call or modification. |
| `packages/db/src/job-work-state-sources.ts` | Existing-source post-lock guard/refusal translation; actor recheck, linked-job offer and replay-preserving seams. No MON-1 call or modification. |
| Existing `evidence.ts`, `proof-repository.ts`, `variation-repository.ts`, `purchase-order-repository.ts`, `supplier-document-repository.ts` | Existing source paths retain their own commands, actor checks, stored replay branches and audit appends. CH-4 source classification excludes proposals/repricing/approval/catches. No MON-1 hooks added. |
| `docs/contracts/job-work-state-v1.md` | CH-4 lifecycle permissions and command execution, deadline/interval rules and cancellation restart effects remain held. There are no new resume/reopen/finish routines to integrate here. |

Future capacity hooks require tenant serialization before the existing job/source
locks and audit last. The source-trigger path currently takes job locks; adding a
late capacity trigger would not meet MON-1's required order. No such hook was built.
There is no guessed caller filename or new contractor write route.

## Implemented scope and explicit inputs

- Strict synthetic schemas, typed validation failure and validated GBP bounds.
- London dates and the explicit day-31 midnight candidate, using supplied UTC
  server timestamps only. Leap February, month/year rollover and both DST changes
  are covered; counting interval endpoints are not reconstructed.
- Reuse of CH-4's pure first-evidence classification, including excluded, pending,
  invalidated and snagging sources. A supplied on-site diary classification is
  additionally supported; this does not create a persisted diary adapter.
- Fixed tenant/customer/site grouping with canonical UUID spelling, distinct
  customers/flats, all-small versus mixed places and no duplicate job binding.
- Aggregate small allowance only, without picking a beneficiary.
- Existing CH-1 small comparison reused for explicitly supplied frozen nets;
  strict £4,000 threshold comparison only, without a persisted trip.
- Supplied qualifying approval uses its original approval timestamp's London
  date; proposed prices return no charge-effective fact.
- Historical supplied stops/principal are copied and frozen. Later cancellation
  inputs cannot edit them or infer a restart. Future supplied identity bindings
  regroup only future dates and produce zero retrospective correction.
- Exact scalar period formula over a complete supplied daily schedule, with
  fixed proposed policy, trial/annual flags and counted-place totals. Output
  includes those schedules, policy, bounds, daily numerators, summed numerator,
  denominator, maximum and hypothetical labels. No cached or event-derived count
  is accepted as authority. Periods contain 28–31 supplied consecutive London
  dates; dates order independently. No subscription-anchor authority is created.
- Signed difference between supplied original/recomputed principal amounts.
  This creates no durable correction, refund, payment or success-fee offset.
- Half-even and largest-remainder tests use the existing arithmetic primitives
  with explicit fixture weights; those weights are not job-allocation policy.

The six required aggregate examples are £49 Solo/five, £49 Solo/grace, £89
Builder/eight, £79 Builder/eight for 15/30 days, £169 Builder/twelve, and £69.65
Builder/eight for one of 31 days. Annual examples remove only base principal;
supplied trial flags remove both base and extras. All arithmetic is hypothetical.

The full `rebuildJobsOnTheGo`, `evaluateCommittedPlaces` and `computeMeterPeriod`
interfaces were not exported as incomplete implementations. Public foundation
names explicitly refer to supplied/fixed inputs or independent comparisons.

## Acceptance accounting and held scope

MON1-A01 records build-ahead readiness under the issued override, not an assertion
that CH-4 merged. MON1-A37 is handoff evidence only; no independent verdict or
separate acceptance is recorded by the builder. MON1-A02–A36 remain uncompleted
as full criteria. Own test titles identify their IDs and say `partial`.

Partial evidence covers A02/A03 London dates, day 31 and source classification;
A04 supplied history preservation; A07/A08 fixed grouping, identity correction
and aggregate allowances; A09/A10 numeric boundaries; A11 supplied approval date;
A14 supplied trial flags; A21/A22 scalar arithmetic, caps and explicit allocation
primitive examples; A26 signed arithmetic; A27 source dependency boundary;
A33 input schemas and A35 synthetic-only period modes. None substitutes for real
PostgreSQL, persisted event replay, access/grant proofs, command concurrency,
issued period preservation, durable alerts/corrections, transport or browser tests.

- Q2: database/migration and their test construction remain held pending the
  coordinator-owned catalogue prerequisite. The complete table assertions at
  `packages/db/test/tenancy.integration.test.ts:190` and `:435` are untouched.
  No before/after edit is proposed in this foundation slice. The coordinator must
  resolve its own exact table rows before issuing persistence; no assertion is
  filtered or relaxed here.
- Q3: hypothetical computation ownership is permitted narrowly, but not built
  before Q2 and the other applicable holds lift.
- Q4: normalized import/capacity seam and actual CH-5 v3 import route evidence
  remain outstanding; existing v1 import code is unchanged.
- Q5: shared-practice tenant-summary access and the whole read server slice held.
- Q6/Q7/Q9 remainders: event intervals/admission, allocation and persisted trip
  transitions/hooks held. No default was selected.
- Q8: only the two own test files were run, sequentially, `--maxWorkers=2`.
  Shared wrappers/full regression/CI remain the dispatcher's responsibility.
- Q10: production metering and charging remain disabled/unapproved.
- Q11: supplied CH-4 build-ahead head only; no ENT branch construction.
- Q12: UI parked; original job-list/drill-down and `V(...)` criteria outstanding.

## Database, grants and release evidence

No migration, table, SQL routine, RLS policy, trigger, grant or repository hook
was added. New GRANT inventory: **none**. Standard F is preserved: no new direct
INSERT/UPDATE/DELETE privilege to `jobguard_runtime` on any protected family.
No external action, authorization, receipt, audit or money record is created by
the pure foundation. No routine-owner/effective-membership proof is claimed.

Fresh/upgrade/rollback/forward-fix proof: HELD, migration not constructed. When
released, the governing rule remains:

> An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

Canonical named-column text, name-and-full-type checks, identity matching and
rolled-back controls remain required for that later proof. No ORM/mock result
is described as PostgreSQL evidence.

## Tests-first and verification commands

Dependencies were already installed; no install/download was attempted. Node
observed `v24.17.0`. The default pnpm launcher warned about ignored overrides and
stalled on `pnpm --version`; no completed version result is claimed for it.
Subsequent runs used the already present pinned wrapper
`/private/tmp/ch4-pnpm-bin/pnpm` (observed `10.28.1`), without modifying that file.
Every pnpm check had these prefixes:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
```

Before each heavy command, `memory_pressure | tail -1` and
`df -g /System/Volumes/Data` were run (exit 0): observed free memory remained at
least 42% and available disk 47–48 GB, exceeding the issued 35%/45 GB thresholds.
No build ran concurrently with a test. No database/browser process was started.

| Command | Exit / actual result |
| --- | --- |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/jobs-on-the-go.test.ts src/jobs-on-the-go-pricing.test.ts` before source creation | 1; two failed suites, zero collected tests, missing `./jobs-on-the-go.js` |
| Same command after first implementation | 0; 2 files, 42 tests |
| Same command after adding UUID-spelling case, before its implementation | 1; 1 failed/1 passed file, 1 failed/42 passed tests; equivalent customer UUID spelling created two places |
| Same command after UUID normalization | 0; 2 files, 43 tests |
| `pnpm exec turbo run typecheck --force` first attempt | 2; core test's static `node:fs` import lacked Node typings; 2 successful/3 executed tasks, zero cached |
| Same own test command after test-only typed dynamic import repair | 0; 2 files, 43 tests |

Final forced checks, lane results, OpenAPI and preservation evidence are appended
below after their actual completion. The first typecheck failure prompted only
the test import change, following the existing core test pattern; no dependency,
shared test, package script or compiler configuration was changed.

## Permission refusal

The read-only process diagnostic

```sh
ps -A -o pid,ppid,command | rg 'pnpm --version|pnpm/exe/pnpm'
```

was refused with `zsh:1: operation not permitted: ps` (pipeline exit 1).
That diagnostic was stopped, with no alternate process-inspection route attempted.
No application/database behavior depends on it. The default version probe is
reported as stalled rather than successful.

## Self-review (builder source inspection, not an independent verdict)

- The two tracked product/registry edits are additive; new tests never pin another
  piece's bytes/hashes. The architecture assertion reads only MON-1's own source.
- Input contracts are strict. Unsafe/missing/unknown policy, schedule, date,
  duplicate binding, extra authority fields and production mode are refused.
- Daily money products use bigint, one final half-even division, bounded Money;
  grace/overflow cannot add a second charge beyond the extras cap.
- Group identity includes tenant/customer/site; UUID spelling is normalized;
  duplicate jobs cannot hide contradictory fixed bindings.
- History and future supplied computations are separated by explicit supplied
  dates; no historical identity-based debit/credit or timer endpoint is derived.
- Core consumes only domain modules, Zod and explicit fixture facts. There is no
  environment variable, current clock, database/network/provider client or
  shadow/finding input. CH-1's pure small comparison references its existing
  policy schema module but consumes only the two supplied frozen nets.
- The dormant maximum-excess error is a pure typed error, not a persisted alert.
  Fixed policy caps mathematically bound successful supplied computations.
- The foundation is not wired into any runtime server or commercial path; its
  labels and environment validation do not constitute approval of D09 execution.
- Shared exports and lane registry are owned by this builder only for the narrow
  additive edits. Their inherited CH-4 content is preserved; the dispatcher owns
  main catch-up and build-plan/acceptance records.

LATER: the parked job-list/drill-down UI and its exact browser assertions require
a separately issued piece.

## Final completed checks and STOP evidence

| Command (with pinned PATH prefixes above) | Exit / actual result |
| --- | --- |
| `pnpm exec turbo run typecheck --force` final attempt | 0; 7 successful tasks, 0 cached, 3m5.718s |
| `pnpm exec turbo run lint --force` | 0; 7 successful tasks, 0 cached, 1m19.841s. This is package compilation/lint, not a pass for the root boundary checks. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; 43 inherited CH-4 paths outside the MON-1 foundation allowlist |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passed for 163 TypeScript files; stopped at the same inherited CH-4 lane failure. It did not reach its Turbo lint or later boundary commands. |
| `pnpm openapi:check` | 1; NOT RUN to completion: `tsx` cannot create its IPC socket in this sandbox |

The exact OpenAPI refusal was:

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/21337.pipe
```

The item was stopped. No alternate loader/invocation was used to evade the
refusal, and generated OpenAPI remains unchanged. Turbo printed filesystem
`WARNING IO error: Operation not permitted (os error 1)` messages, but its
completed typecheck/lint tasks above executed with cache bypass and exited 0.

The forced lint start overlapped the final web task of the forced typecheck.
This was a scheduling error against the requested sequential checks; memory was
63% free at lint start. No test overlapped another test or a build. Subsequent
build starts only after both completed. These receipts do not claim the two
compilation invocations were fully sequential.

Lane STOP: `config/agent-lane-assignments.json:2` has exactly the six MON-1
foundation paths, added to the previously absent MON-1 entry. It remains that
same six-path entry after the failure. A passing comparison to `origin/main`
requires the coordinator's CH-4 merge and catch-up, not a widened allowlist or
checker change. All 43 rejected paths are inherited from starting HEAD; the
actual working-tree changes are the six authorized foundation paths only.

Catalogue STOP remains at `packages/db/test/tenancy.integration.test.ts:190`:
before and after are both `expect(result.rows).toEqual([`, and at `:435`:
before and after are both `expect(ownership.rows).toEqual([`. No desired replacement
is fabricated while the table/routine slice is held. A separately issued
coordinator prerequisite must authorize any new catalogue rows; this builder
does not change those assertions or any existing row.

## Files and wrappers NOT RUN

The following held targets were **not constructed and NOT RUN**. They need
released persistence/access/interval/attribution/trip scope; PostgreSQL and
browser sockets additionally cannot start here:

```text
packages/db/test/jobs-on-the-go.integration.test.ts
packages/db/test/jobs-on-the-go-capacity.integration.test.ts
packages/db/test/jobs-on-the-go-trip.integration.test.ts
packages/db/test/jobs-on-the-go-corrections.integration.test.ts
packages/db/test/jobs-on-the-go-catalog.integration.test.ts
packages/db/test/jobs-on-the-go-isolation.integration.test.ts
packages/db/test/jobs-on-the-go-upgrade.integration.test.ts
packages/db/test/jobs-on-the-go-lock-order.integration.test.ts
apps/api/src/jobs-on-the-go.application.test.ts
apps/api/src/jobs-on-the-go.controller.test.ts
apps/api/src/jobs-on-the-go.http.test.ts
apps/api/src/jobs-on-the-go.isolation.test.ts
```

The order's preserved regression targets were **NOT RUN** locally: the winning
addendum limits local tests to this piece's own files. All database targets also
have `NOT RUN (cannot start PostgreSQL here)`, with no attempted startup or mock
substitute. Dispatcher/GitHub CI must execute the real checks:

```text
packages/core/src/activation-v3.test.ts
packages/core/src/money.test.ts
packages/core/src/allocation.test.ts
packages/db/test/job-activation-terms.integration.test.ts
packages/db/test/job-parties.integration.test.ts
packages/db/test/activation.integration.test.ts
packages/db/test/final-account-lock.integration.test.ts
packages/db/test/final-account-lock-invoice.integration.test.ts
packages/db/test/variation.integration.test.ts
packages/db/test/final-account.integration.test.ts
packages/db/test/command-replay-contract.integration.test.ts
packages/db/test/watchdog-lock-order.integration.test.ts
packages/db/test/fingerprinted-row-shape.integration.test.ts
packages/db/test/tenancy.integration.test.ts
packages/db/test/demo-bootstrap.integration.test.ts
packages/db/test/shadow-catalog.integration.test.ts
packages/db/test/shadow-persistence.integration.test.ts
packages/db/test/site-extra.integration.test.ts
apps/api/src/auth/context-boundary.test.ts
apps/api/src/watchdog-registry.test.ts
```

Actual CH-4 regression files remain the dispatcher's checks, **NOT RUN** locally:

```text
packages/core/src/job-work-state.test.ts
packages/db/test/job-work-state.integration.test.ts
packages/db/test/job-work-state-sources.integration.test.ts
packages/db/test/job-work-state-post-lock.integration.test.ts
packages/db/test/job-work-state-races.integration.test.ts
packages/db/test/job-work-state-catalog.integration.test.ts
packages/db/test/job-work-state-upgrade.integration.test.ts
packages/db/test/job-work-state-syntax.test.ts
apps/api/src/job-work-state.application.test.ts
apps/api/src/job-work-state.controller.test.ts
apps/api/src/job-work-state.http.test.ts
apps/api/src/job-work-state.isolation.test.ts
```

Whole-repository/package wrappers `pnpm test`, `pnpm test:db`,
`pnpm test:migrations`, `pnpm eval`, `pnpm test:e2e` and `node --test tools/*.test.mjs`
are **NOT RUN**, as the dispatcher owns full CI and the addendum restricts local
tests to own files. Browser checks additionally cannot start here. No AI
behavior changed; no live-model evaluation is claimed. No database test was
launched, so no shared heavy-slot acquisition was needed. No new UI spec exists.

## Preservation hashes and diff evidence

One-time Python inspection (exit 0, not a permanent test) counted 338 tracked
test files and found none in `git diff --name-only HEAD`. SHA-256 of the sorted
`path + space + file-sha256 + newline` records for those tests is
`92be351c0da6734a7e4ec51c048814371fad45b7d6bf6c443c3018596971dc94`.
This records preservation relative to the supplied CH-4 HEAD, not a fabricated
claim that CH-4's own inherited changes are absent relative to main.

```text
4182f89ee68165c5ac749c42729e134804605995ad09c809f577f109a8cb0dcf packages/core/src/jobs-on-the-go.ts
e424c113ad646d574b7d066c873976402f05c10ee7ffc796de768fc18f4ad0af packages/core/src/jobs-on-the-go.test.ts
bcaca66d7e466df0bd647be0004ec4c559eaee6b0a18bbfdae52f48fcd3e1d23 packages/core/src/jobs-on-the-go-pricing.test.ts
93c909651be924918c6e8a82ab35d19d518ce241cc27a51e95b110d30de51ae1 packages/core/src/index.ts
333832e81d2e0452db9a1b0d813c001a0617acc644691f4daf8afc7155d948a3 config/agent-lane-assignments.json
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 apps/api/src/auth/context-boundary.test.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f packages/db/test/command-replay-contract.integration.test.ts
3ce02135b6a36425844678799fc84598ab92869d022add83abfca609b8b6ed02 packages/db/test/tenancy.integration.test.ts
be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8 packages/db/test/fingerprinted-row-shape.integration.test.ts
51f8cce888ae8e9da2ed0e6bc938d1795313ec5df1d30bf9848877ede190bf19 packages/db/migrations/0144_job_work_state.sql
007755c951d13f2af99927b831fde29db059152187e6fc4e13e4bdf74542b92d packages/db/src/migrate.ts
23b6338d1de18155090cbcce3385fb83ffdc64b0b58b0140b9751701c8ccb085 apps/api/openapi.json
```

The lane JSON was parsed and compared to HEAD after removing only the new
`mon-1` entry: every other lane entry and root field is unchanged (true).
`git diff --stat HEAD` (exit 0) reports tracked edits:

```text
 config/agent-lane-assignments.json | 1 +
 packages/core/src/index.ts         | 1 +
 2 files changed, 2 insertions(+)
```

Git does not include untracked files in that stat. Additional new files are
this receipt and the three MON-1 core files (238 implementation lines, 127
foundation-test lines, 106 pricing-test lines). `git status --short` enumerates
those files and no other working-tree change. `git diff --check` exited 0.
Receipt bytes are intentionally not hashed within themselves.

Intended conventional commit message was created using exclusive creation
(Python exit 0) at `/private/tmp/jg-msg-mon-1.txt`; no previous file was overwritten.
The dispatcher must bind its implementation commit and independent verdict
after committing this diff. Until then the exact implementation evidence is
the uncommitted file hashes above and starting/final HEAD.


## Read-only command inventory

The inspection commands below ran in this worktree. These are source-inspection
results, not test counts; ordinary reads/searches completed with exit 0 except
as specifically recorded. No Git-writing command was invoked.

- `pwd`, `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main`,
  `cat AGENTS.md` established the clean supplied baseline (exit 0).
- `rg -n '10\.1\.[2-9]|MON-1|CH-4|job_work_state|job_link' BUILD_PLAN.md`,
  reads of `money.ts`, `allocation.ts`, `activation-v3.ts`, core/root package
  manifests and the lane registry (combined exit 0).
- `rg --files packages/core/src packages/db/src docs/contracts docs/verdicts/CH-4`
  with the work/activation/index/money/allocation filter; `rg -n` of CH-4/work
  source references; `node --version`; memory/disk reads (exit 0). The default
  `pnpm --version` in that combined command stalled, so the command has no
  completed exit code and is not claimed successful.
- `sed -n '1286,1402p' BUILD_PLAN.md`, `sed -n '2095,2133p' BUILD_PLAN.md`,
  `git diff origin/main HEAD -- BUILD_PLAN.md AGENTS.md`, reads of the CH-4
  contract/core/repository and core index tail (combined exit 0). The attempted
  `cat packages/core/src/rounding.ts` reported no such file; subsequent inspection
  found the actual existing arithmetic in `rational.ts`. No file was created
  to replace it.
- `rg -n` of role/source/replay/authority/routine/audit seams in CH-4 SQL and
  repositories, D09 header read, CH-4 receipt reference search, and `rg --files`
  to locate the Ben answers and standing handoff (exit 0).
- Reads of `job-work-state.ts`, `job-work-state-repository.ts`, the first 65
  lines of `job-work-state-sources.ts`, the actual Ben answers and standing
  handoff (combined exit 0; nonexistent `rounding.ts` again reported).
- `git diff --name-only origin/main HEAD`, reads of `tools/lint.mjs`,
  `tools/agent-lane-boundary-lint.mjs`, wrapper path `ls -l`, `command -v pnpm`,
  core tsconfig and tenancy table-reference search (exit 0).
- Reads of both pnpm wrappers, `rg -n divideRounded` in `rational.ts`, Ben-answer
  lines 75–130, CH-4 SQL lines 300–350, lane-lint lines 175–230, core purity
  checker and core index header (exit 0).
- `git status --short`, `git diff --check`, rational/money-lint and lane-lint
  source reads, tenancy line reads, followed by the refused `ps` diagnostic
  documented above (combined exit 1 due to the refusal).
- `git diff --stat`, `git diff --check`, tenancy numbered-line reads, lane
  registry header, main migration runner tail and `git log -1 --format='%H %s'`
  (exit 0).
- Main migration registration search, tenancy assertion-line reads,
  `git branch --show-current`, `git merge-base HEAD origin/main`, D09 header
  and existing repository source-seam searches (exit 0).
- Core-test searches for filesystem/raw/dynamic import patterns, root tsconfig,
  Vitest manifest and a declaration/ImportMeta search (combined exit 1 because
  the final declaration search had no matches; the preceding reads succeeded).
- One-time Python preservation/sha256/lane-JSON comparison, `git diff --stat HEAD`,
  `git diff --check`, `git status --short`, memory and disk reads (exit 0).
- Tenancy assertion-line read, `git diff HEAD -- packages/core/src/index.ts`,
  `wc -l` of the three new core files and receipt (exit 0), followed by the
  OpenAPI check whose exit/refusal is documented above.
- Attempted `cat tools/openapi-check.mjs` reported no such file; API package
  manifest search located the actual `tsx src/generate-openapi.ts --check`
  script; status/diff check succeeded (combined exit 0). No alternate OpenAPI
  execution was attempted after the socket refusal.
- Exclusive Python creation of `/private/tmp/jg-msg-mon-1.txt`, memory/disk reads
  (exit 0); final repeated memory/disk, `git diff --check`, `git rev-parse HEAD`
  and `git status --short` reads (exit 0).

All source/test/registry/receipt mutations used successful `apply_patch` calls
on the six authorized paths, or Python append to this newly created receipt.
All polling used the original command session; a poll is not a new test run.
No install, dependency download, socket escalation, test weakening, shared
harness/pin change, destructive shell operation, commit or push was performed.


## Build completion and handoff

`pnpm build --concurrency=2 --force` exited **0**: seven successful tasks,
zero cached tasks, 5m52.355s. Core/config/storage/AI/database/API compilation and
Next production build completed, including all 31 static pages. Warnings included
workspace-root inference, existing CSS `end` values and the CH-4 Nest import path's
`file-type` export/dynamic-dependency warnings. No UI or dependency repair was
attempted outside this lane. Build success is not browser journey evidence.

The final read-only status/preservation inspection (Python plus Git, exit 0)
confirmed all three final own source/test hashes still match the values above,
only the two permitted tracked files differ, and the only four untracked files
are the three new core files and this receipt. Commit-message presence was
confirmed. Disk remained 47 GB free and memory at least 58% through final build
polling. No further product/test/registry edits followed the successful checks.

Final HEAD remains `f93716da170f1ba10a98abe1e17f57dd169f8cc2`.
This HEAD is the supplied baseline, not an implementation commit or acceptance.
The dispatcher has the intended commit text at `/private/tmp/jg-msg-mon-1.txt`.
CH-4 merge/catch-up, actual full CI, independent recorded verdict and separate
acceptance remain outstanding. MON-1 aggregate status remains HOLD.


Independent remaining root-boundary checks were also executed, without changing
the failed root-lint status or bypassing the lane checker:

| Command | Exit / result |
| --- | --- |
| `node tools/money-arithmetic-lint.mjs` | 0; money arithmetic boundary passed |
| `node tools/commercial-boundary-lint.mjs` | 0; completed with no violations/output |
| Final `git diff --check`, `git diff --stat HEAD`, `git status --short`, `git rev-parse HEAD`, memory/disk reads | 0; exactly the six authorized files; HEAD unchanged; 65% memory and 47 GB disk free |

Receipt append commands used Python on this builder-created file (exit 0).
No source/test changes followed final verification. No independent verdict or
acceptance is claimed.

## Continuation verification and final handoff

The results in this section describe the **15 October continuation**, overriding
the historical result tables above. Dependencies were already installed. Every
pnpm command used these existing wrappers, unchanged:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
```

The latter wrapper invokes the already-installed Corepack pnpm 10.28.1 through
Node. No install, download, Git write, dependency/configuration edit, external
action or provider spend occurred. Memory/disk reads preceded every heavy run:
so far free memory was 53–58% and available disk 61–63 GB, above 35% and 45 GB.
Build and tests never ran together. No database/browser run was launched and no
shared heavy slot was acquired.

| Current command | Exit and evidence |
| --- | --- |
| `pnpm --version` | 0; 10.28.1 |
| Own two-file Vitest command, first new cases | 1; 2 failed / 45 passed; includes the fixture mistake described above |
| Own two-file Vitest command, corrected fixture, before implementation | 1; 2 failed / 45 passed; year-zero and exact-offset failures |
| Own two-file Vitest command, after implementation | 0; 2 files / 47 tests passed, no skipped tests |
| `pnpm exec turbo run typecheck --force` | 0; 7 successful tasks, 0 cached; 27.59s |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passed for 170 TypeScript files; lane boundary refused incoming main paths; no root-lint pass claimed |
| `pnpm exec turbo run lint --force` | 0; 7 successful tasks, 0 cached; 38.199s; package lint only, does not override root failure |
| Working-tree preservation/JSON/ancestry inspections | 0; valid unique-key JSON, main bytes retained, six authorized changed paths, CH-4 merge present |

The exact own Vitest invocation was:

```sh
pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/jobs-on-the-go.test.ts src/jobs-on-the-go-pricing.test.ts
```

Turbo emitted `WARNING IO error: Operation not permitted (os error 1)` on
background cache I/O while its original forced checks continued. No retry,
permission change or alternate cache route was attempted. Actual successful
compiler task exits and zero cached tasks are distinguished from these warnings.

### Root lane STOP — unchanged checker, unresolved Git index

`tools/agent-lane-boundary-lint.mjs:228` includes `git diff --cached HEAD` when
checking locally. Because the user supplied a merge in progress, this includes
incoming main changes even though their working-tree bytes match main.
Line 233 refuses them with `Lane boundary FAILED: Lane mon-1 cannot edit:`,
starting with `.gitleaksignore`, `BUILD_PLAN.md`, `apps/api/openapi.json` and
main's SSO tests. The checkout-to-main comparison has just six authorized files.

Before and after in this piece, checker line 228 is identical:

```js
    for (const args of [["diff", "--no-renames", "--name-only", "-z", "--cached", "HEAD", "--"], ["diff", "--no-renames", "--name-only", "-z", "--"], ["ls-files", "--others", "--exclude-standard", "-z"]]) {
```

No widening/filtering, replacement comparison base, shared-harness change or
checker edit was made. The resolved registry text is at
`config/agent-lane-assignments.json:5`; the dispatcher must stage it and complete
the merge before binding CI/review to a final implementation SHA. Git still
records `UU` until that authorized dispatcher action occurs.

### Current NOT RUN inventory

The following **new files are not constructed**, and hence NOT RUN. Database
work is held by Q2 and relevant remaining Q5/Q6/Q7/Q9 rulings; server work is
held as a whole. The sandbox also cannot start PostgreSQL or a browser:

```text
packages/db/test/jobs-on-the-go.integration.test.ts
packages/db/test/jobs-on-the-go-capacity.integration.test.ts
packages/db/test/jobs-on-the-go-trip.integration.test.ts
packages/db/test/jobs-on-the-go-corrections.integration.test.ts
packages/db/test/jobs-on-the-go-catalog.integration.test.ts
packages/db/test/jobs-on-the-go-isolation.integration.test.ts
packages/db/test/jobs-on-the-go-upgrade.integration.test.ts
packages/db/test/jobs-on-the-go-lock-order.integration.test.ts
apps/api/src/jobs-on-the-go.application.test.ts
apps/api/src/jobs-on-the-go.controller.test.ts
apps/api/src/jobs-on-the-go.http.test.ts
apps/api/src/jobs-on-the-go.isolation.test.ts
```

The following preserved regression files are also **NOT RUN in this
continuation**. The addendum restricts local runs to this piece's own files;
all PostgreSQL files additionally require dispatcher/CI infrastructure:

```text
packages/core/src/activation-v3.test.ts
packages/core/src/money.test.ts
packages/core/src/allocation.test.ts
packages/db/test/job-activation-terms.integration.test.ts
packages/db/test/job-parties.integration.test.ts
packages/db/test/activation.integration.test.ts
packages/db/test/final-account-lock.integration.test.ts
packages/db/test/final-account-lock-invoice.integration.test.ts
packages/db/test/variation.integration.test.ts
packages/db/test/final-account.integration.test.ts
packages/db/test/command-replay-contract.integration.test.ts
packages/db/test/watchdog-lock-order.integration.test.ts
packages/db/test/fingerprinted-row-shape.integration.test.ts
packages/db/test/tenancy.integration.test.ts
packages/db/test/demo-bootstrap.integration.test.ts
packages/db/test/shadow-catalog.integration.test.ts
packages/db/test/shadow-persistence.integration.test.ts
packages/db/test/site-extra.integration.test.ts
packages/db/test/job-work-state.integration.test.ts
packages/db/test/job-work-state-sources.integration.test.ts
packages/db/test/job-work-state-post-lock.integration.test.ts
packages/db/test/job-work-state-races.integration.test.ts
packages/db/test/job-work-state-catalog.integration.test.ts
packages/db/test/job-work-state-upgrade.integration.test.ts
packages/db/test/job-work-state-syntax.test.ts
apps/api/src/auth/context-boundary.test.ts
apps/api/src/watchdog-registry.test.ts
apps/api/src/job-work-state.application.test.ts
apps/api/src/job-work-state.controller.test.ts
apps/api/src/job-work-state.http.test.ts
apps/api/src/job-work-state.isolation.test.ts
```

Whole-suite wrappers `pnpm test`, `pnpm test:db`, `pnpm test:migrations`,
`pnpm eval`, `pnpm test:e2e`, the remaining actual repository tests and
`node --test tools/*.test.mjs` are **NOT RUN** under the dispatcher's local
limits; full mandatory CI remains outstanding. No browser/Playwright command
was launched. No AI prompt, model or gateway changed, and no live evaluation
is claimed. No clean frozen install or pinned-Node-24.15.0 run is claimed.

### Continuation self-review — builder inspection only

The only product change since the older commit is a pure date-conversion fix.
Inputs stay strict and versioned, money stays exact/bounded and hypothetical,
historical supplied stops/charges remain immutable, proposed prices remain
excluded, and identity corrections remain future-only. No allowance beneficiary,
job-line weight, interval endpoint, trial eligibility, authority boundary or
trip transition was selected. The new tests were written before that fix and
were red before implementation. No main test, protected source, SQL, provider
adapter or command path changed. This inspection is not an independent verdict.

Current build/OpenAPI/lane results, preservation hashes and command inventory
follow below. All original commands have completed. MON-1 remains HOLD.

### Completed continuation checks and refusal evidence

| Current command | Exit / actual result |
| --- | --- |
| `pnpm build --concurrency=2 --force` | **0**; 7 successful tasks, 0 cached, **2m26.326s**, 32 static pages generated |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **1**; **229 incoming main paths** refused while merge index remains unfinished; no allow-list/checker workaround |
| `pnpm openapi:check` | **1**; generator did not run: tsx IPC socket refused with `listen EPERM`; no alternate invocation attempted |
| `pnpm exec tsc --version` | **0**; TypeScript 5.8.3 |
| `node tools/money-arithmetic-lint.mjs` | **0**; boundary check passed |
| `node tools/commercial-boundary-lint.mjs` | **0**; no violations/output |
| Final Git/permission/resource inspections and intended-message presence | **0**; head unchanged, no conflict markers, Git index still unmerged, available disk 60 GB and memory 55% |

The exact refused command was `pnpm openapi:check`, with the PATH prefixes above.
Refusal text:

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/61267.pipe
```

This item stopped there. No escalation, IPC bypass, alternate loader or
OpenAPI rewrite was attempted. `apps/api/openapi.json` matches main exactly.
The build completed despite existing workspace-root/CSS/Nest `file-type` export
and dynamic-dependency warnings; build success is not browser journey evidence.

### Current preservation evidence

A one-time read-only comparison checked **461 merged test files** against their
actual main Git blob identities, using `blob <length> NUL <bytes>`. All matched.
SHA-256 of sorted `path + space + file-sha256 + newline` records:

```text
ed7da91571df462cda44f1fd3b38d8fe75edcda05ac8834ee735d5d691fc6162
```

Current own/protected file SHA-256 values (receipt excluded to avoid a recursive
hash; no source/test/registry changes followed these checks):

```text
1b25fbd4353a9251fddbfe580f584123c6b7faf01ee2e4c6f2b5470b724faf8a packages/core/src/jobs-on-the-go.ts
a7cd290076b1012cf75eb79d0aca387e0099ef78bd42c76b18b3a3a607cddda5 packages/core/src/jobs-on-the-go.test.ts
bcaca66d7e466df0bd647be0004ec4c559eaee6b0a18bbfdae52f48fcd3e1d23 packages/core/src/jobs-on-the-go-pricing.test.ts
474b4b8905939e2ac0072a9401551d9dba34bf77a2f21f06d40326182a2aa1e8 packages/core/src/index.ts
24e81a51ef0c9fe8e12e2472310f806dba437ecabb68d0cfbb3acda366de2d52 config/agent-lane-assignments.json
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 apps/api/src/auth/context-boundary.test.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f packages/db/test/command-replay-contract.integration.test.ts
8d392724e3796dcb6ba656928d54836ff934f1017860cae6f7de623ebb2e7448 packages/db/test/tenancy.integration.test.ts
be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8 packages/db/test/fingerprinted-row-shape.integration.test.ts
4911b23648506a4bb585e4a4d1b50cd92c96345209ee2ae8097ef51c6cf3e94b packages/db/migrations/0144_job_work_state.sql
6880dd1191e0372e99f43e14c7b029f56ad97a25bf0ec47ffdb51e7125a50401 packages/db/src/migrate.ts
216343758d5f089ad8d73f100632428e67a0cd547e23ef3218db53e11880de40 apps/api/openapi.json
```

Actual `git diff origin/main --stat`, before appending this evidence/inventory
(subsequent growth is confined to this already-listed receipt):

```text
 config/agent-lane-assignments.json               |   1 +
 docs/verdicts/MON-1/BUILDER_RECEIPT.md           | 786 +++++++++++++++++++++++
 packages/core/src/index.ts                       |   1 +
 packages/core/src/jobs-on-the-go-pricing.test.ts | 106 +++
 packages/core/src/jobs-on-the-go.test.ts         | 139 ++++
 packages/core/src/jobs-on-the-go.ts              | 243 +++++++
 6 files changed, 1276 insertions(+)
```

The much larger `git diff HEAD --stat` (234 files) records incoming main changes
from the supplied merge, not MON-1 edits. `git diff origin/main --name-only`
and the unique-key registry comparison establish the actual six-file lane.
`git diff --check` exited 0. Main AGENTS SHA-256 is
`ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1`;
main BUILD_PLAN SHA-256 is
`d8793fa7c3112ca2d07d8976d5823546fcbf681c1f152cd2cc2a04e128aae2d5`;
working copies match. No permanent test pins these merged bytes.

### Current command inventory

These are all current continuation shell command groups, in execution order,
with actual exit codes. Read groups have no test count. Each Python inspection
was a one-time receipt/preservation check, not a new permanent regression test.
One tool-orchestration syntax error launched no shell command; it was corrected
before the affected read group ran. All editing-tool calls succeeded. Polls
resumed their original sessions and never relaunched a command.

1. Exit **0**:

```sh
pwd; git status --short; git rev-parse HEAD origin/main; rg --files -g 'AGENTS.md' -g '*jobs-on-the-go*' -g '*work-state*' -g '*ch-4*' -g 'package.json' -g '*MON-1*' -g '*BEN-ANSWERS*'; cat AGENTS.md
```

2. Exit **0**:

```sh
git diff -- config/agent-lane-assignments.json; git log -6 --oneline; git log origin/main --oneline --all --grep='CH-4' -8; cat packages/core/src/jobs-on-the-go.ts; cat docs/verdicts/MON-1/BUILDER_RECEIPT.md
```

3. Exit **0**:

```sh
rg -n 'MON-1|10\\.1\\.[2-9]|CH-4|job_work_state' BUILD_PLAN.md; cat package.json; cat packages/core/package.json; cat .nvmrc; memory_pressure | tail -1; df -g /System/Volumes/Data; git diff --name-only --diff-filter=U
```

4. Exit **0**:

```sh
sed -n '1,18p' config/agent-lane-assignments.json; cat packages/core/src/jobs-on-the-go.ts; cat packages/core/src/jobs-on-the-go.test.ts; cat packages/core/src/jobs-on-the-go-pricing.test.ts
```

5. Exit **0**:

```sh
git log -4 --oneline; git log origin/main --format='%H %s' --grep='CH-4' -6; sed -n '1,125p' docs/verdicts/MON-1/BUILDER_RECEIPT.md; sed -n '130,260p' packages/core/src/jobs-on-the-go.ts; cat docs/contracts/job-work-state-v1.md
```

6. Exit **0**:

```sh
git diff origin/main --stat; git diff origin/main -- packages/core/src/index.ts; git show origin/main:config/agent-lane-assignments.json | head -5; rg -n 'ch4_|CREATE.*FUNCTION|FOR UPDATE|append_audit|fact_at|receipt|guard' packages/db/migrations/0144_job_work_state.sql; cat packages/core/src/job-work-state.ts
```

7. Exit **0**:

```sh
sed -n '1286,1402p' BUILD_PLAN.md; sed -n '2095,2133p' BUILD_PLAN.md; sed -n '1,50p' docs/decisions/d09-plan-tiers-metering.md; sed -n '1,210p' packages/db/src/job-work-state-sources.ts; cat packages/db/src/job-work-state-repository.ts
```

8. Exit **0**:

```sh
cat packages/core/src/job-work-state.ts; cat packages/core/src/money.ts; cat packages/core/src/activation-v3.ts; sed -n '2095,2135p' BUILD_PLAN.md; sed -n '1,150p' tools/lint.mjs; sed -n '165,245p' tools/agent-lane-boundary-lint.mjs
```

9. Exit **0**:

```sh
git log origin/main --format='%H %s' --merges --grep='CH-4' -3; rg -n 'checkPostLock|refuseLocked|appendAudit|class .*Mutation|async lock|replay|receipt' packages/db/src/evidence.ts packages/db/src/proof-repository.ts packages/db/src/variation-repository.ts packages/db/src/purchase-order-repository.ts packages/db/src/supplier-document-repository.ts packages/db/src/activation-repository.ts; tail -32 packages/db/src/migrate.ts; ls -l /private/tmp/jg-msg-mon-1.txt; command -v pnpm; node --version; sed -n '1,110p' "$HOME/Library/pnpm/bin/pnpm"
```

10. Exit **0**:

```sh
sed -n '125,240p' docs/verdicts/MON-1/BUILDER_RECEIPT.md; rg -n '24\.15|24\.17|pnpm|pinned' docs/repo-baseline.md .github/workflows/ci.yml; cat /private/tmp/jg-msg-mon-1.txt; cat tools/core-purity-lint.mjs; nl -ba packages/db/test/tenancy.integration.test.ts | sed -n '15,50p'; sed -n '72,132p' "$HOME/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261013.md"; cat "$HOME/.local/share/full-steam/handoffs/jobguard-task.md"
```

11. Exit **0**:

```sh
ls -l /private/tmp/ch4-pnpm-bin; cat /private/tmp/ch4-pnpm-bin/pnpm; git show origin/main:BUILD_PLAN.md | shasum -a 256; shasum -a 256 BUILD_PLAN.md AGENTS.md; git show origin/main:AGENTS.md | shasum -a 256; rg -n 'expect\(.*(tables|map|rows)|toEqual\(' packages/db/test/tenancy.integration.test.ts | tail -12; rg -n 'Use London|Avoid double|Use the original' "$HOME/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261013.md"; git diff --check
```

12. Exit **1**; original session 54107, polled to completion without relaunch:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
memory_pressure | tail -1
df -g /System/Volumes/Data
pnpm --version
pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/jobs-on-the-go.test.ts src/jobs-on-the-go-pricing.test.ts
```

13. Exit **0**:

```sh
node -e 'const f = new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}); for (const y of [1840,1850]) console.log(y, f.format(new Date(`${y}-01-31T00:00:00Z`)))'
```

14. Exit **1**:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
memory_pressure | tail -1
df -g /System/Volumes/Data
pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/jobs-on-the-go.test.ts src/jobs-on-the-go-pricing.test.ts
```

15. Exit **0**:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
memory_pressure | tail -1
df -g /System/Volumes/Data
pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/jobs-on-the-go.test.ts src/jobs-on-the-go-pricing.test.ts
```

16. Exit **0**; original session 61350, polled to completion without relaunch:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
memory_pressure | tail -1
df -g /System/Volumes/Data
pnpm exec turbo run typecheck --force
```

17. Exit **0**:

```sh
python3 - <<'PY'
import json, subprocess
from pathlib import Path
p=Path('config/agent-lane-assignments.json')
def unique(pairs):
    result={}
    for key,value in pairs:
        assert key not in result,key
        result[key]=value
    return result
current=json.loads(p.read_text(),object_pairs_hook=unique)
main=subprocess.check_output(['git','show','origin/main:config/agent-lane-assignments.json'],text=True)
without_mon=''.join(line for line in p.read_text().splitlines(keepends=True) if not line.startswith('"mon-1":'))
assert without_mon == main
print('Valid unique-key JSON; removing only mon-1 gives byte-identical main registry')
files=subprocess.check_output(['git','diff','--name-only','origin/main','--'],text=True).splitlines()
allow=current['lanes']['mon-1']['allow']
assert all(f in allow for f in files)
print('Changed relative to main:',len(files),'files; all in MON-1 lane')
print('\n'.join(files))
assert subprocess.run(['git','merge-base','--is-ancestor','c203bb27893342ca2569272ff4dc908b614267d6','origin/main']).returncode==0
print('CH-4 merge c203bb27893342ca2569272ff4dc908b614267d6 is an ancestor of origin/main')
PY
nl -ba packages/db/test/tenancy.integration.test.ts | sed -n '183,200p'
nl -ba packages/db/test/tenancy.integration.test.ts | sed -n '436,452p'
nl -ba tools/agent-lane-boundary-lint.mjs | sed -n '225,238p'
```

18. Exit **1**:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
memory_pressure | tail -1
df -g /System/Volumes/Data
LANE_BASE_REF=origin/main pnpm lint
```

19. Exit **0**; original session 78048, polled to completion without relaunch:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
memory_pressure | tail -1
df -g /System/Volumes/Data
pnpm exec turbo run lint --force
```

20. Exit **0**; original session 84325, polled to completion without relaunch:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
memory_pressure | tail -1
df -g /System/Volumes/Data
pnpm build --concurrency=2 --force
```

21. Exit **0**:

```sh
python3 - <<'PY'
from pathlib import Path
import hashlib, json, subprocess
entries=subprocess.check_output(['git','ls-tree','-r','origin/main'],text=True).splitlines()
records=[]
for entry in entries:
    metadata,name=entry.split('\t',1)
    if not name.endswith(('.test.ts','.spec.ts','.test.mjs')): continue
    data=Path(name).read_bytes()
    original=metadata.split()[2]
    actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
    assert actual == original, name
    records.append(name+' '+hashlib.sha256(data).hexdigest()+'\n')
print('Merged test preservation:',len(records),'files; aggregate SHA-256',hashlib.sha256(''.join(sorted(records)).encode()).hexdigest())
for name in ['packages/core/src/jobs-on-the-go.ts','packages/core/src/jobs-on-the-go.test.ts','packages/core/src/jobs-on-the-go-pricing.test.ts','packages/core/src/index.ts','config/agent-lane-assignments.json','apps/api/src/auth/context-boundary.test.ts','packages/db/test/watchdog-command-harness.ts','packages/db/test/command-replay-contract.integration.test.ts','packages/db/test/tenancy.integration.test.ts','packages/db/test/fingerprinted-row-shape.integration.test.ts','packages/db/migrations/0144_job_work_state.sql','packages/db/src/migrate.ts','apps/api/openapi.json']:
    print(hashlib.sha256(Path(name).read_bytes()).hexdigest(),name)
PY
git diff origin/main --stat
git diff HEAD --stat
git diff --check
git rev-parse HEAD origin/main
git status --short | tail -8
```

22. Exit **0**:

```sh
git diff HEAD -- packages/core/src/jobs-on-the-go.ts packages/core/src/jobs-on-the-go.test.ts; nl -ba config/agent-lane-assignments.json | head -7; git diff --numstat origin/main -- . ':!docs/verdicts/MON-1/BUILDER_RECEIPT.md'; memory_pressure | tail -1; df -g /System/Volumes/Data
```

23. Exit **1**:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
LANE_BASE_REF=origin/main pnpm lint:lanes
```

24. Exit **1**; original session 63715, polled to completion without relaunch:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
memory_pressure | tail -1
df -g /System/Volumes/Data
pnpm openapi:check
```

25. Exit **0**:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
pnpm exec tsc --version
node tools/money-arithmetic-lint.mjs
node tools/commercial-boundary-lint.mjs
```

26. Exit **0**:

```sh
git diff origin/main --stat; git diff --check; git rev-parse HEAD origin/main; git diff --name-only --diff-filter=U; memory_pressure | tail -1; df -g /System/Volumes/Data; wc -l docs/verdicts/MON-1/BUILDER_RECEIPT.md; test -s /private/tmp/jg-msg-mon-1.txt
```


### Dispatcher handoff

Final HEAD: **`281a49281bd72512014c9758929b0cf7fa42906d`**. It is the older
implementation commit; this continuation remains uncommitted as instructed.
Current main is **`6671538c8d69936c162368c760dd6ce0f7f10493`**. No new final
implementation SHA or independent verdict can be claimed before the dispatcher
finishes the Git merge and commits the working tree.

The intended conventional commit message is updated at
**`/private/tmp/jg-msg-mon-1.txt`**. The dispatcher must finish the Git index/merge,
run full pinned CI including OpenAPI/PostgreSQL/browser regressions, and obtain
the RED independent exact-commit verdict and separate acceptance. Existing Q2,
Q5/Q6/Q7/Q9 remainders, Q10, CH-5 route ownership and parked UI remain as recorded
above. No action here releases real customer data, spending, production billing
or ENT-10e. Aggregate MON-1 status remains **HOLD**.

### Final read-only confirmation

Command group 27, exit **0**, after the inventory above:

```sh
python3 - <<'PY'
from pathlib import Path
import hashlib,json,subprocess
root=Path.cwd()
registry=Path('config/agent-lane-assignments.json').read_text()
assert not any(marker in registry for marker in ('<<<<<<<','=======','>>>>>>>'))
parsed=json.loads(registry)
assert ''.join(line for line in registry.splitlines(keepends=True) if not line.startswith('"mon-1":')) == subprocess.check_output(['git','show','origin/main:config/agent-lane-assignments.json'],text=True)
changed=subprocess.check_output(['git','diff','--name-only','origin/main','--'],text=True).splitlines()
assert len(changed)==6 and all(path in parsed['lanes']['mon-1']['allow'] for path in changed)
for name,expected in [('packages/core/src/jobs-on-the-go.ts','1b25fbd4353a9251fddbfe580f584123c6b7faf01ee2e4c6f2b5470b724faf8a'),('packages/core/src/jobs-on-the-go.test.ts','a7cd290076b1012cf75eb79d0aca387e0099ef78bd42c76b18b3a3a607cddda5'),('packages/core/src/jobs-on-the-go-pricing.test.ts','bcaca66d7e466df0bd647be0004ec4c559eaee6b0a18bbfdae52f48fcd3e1d23')]:
    assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==expected,name
message=Path('/private/tmp/jg-msg-mon-1.txt').read_text()
assert message.startswith('feat(meter):') and '0163' in message and '0148' not in message
print('Final inspection: six authorized files; source/test hashes unchanged; conflict markers absent; main registry bytes retained; intended commit message current.')
PY
git diff --check
git diff origin/main --stat
git rev-parse HEAD
nl -ba docs/verdicts/MON-1/BUILDER_RECEIPT.md | sed -n '97,125p'
memory_pressure | tail -1
df -g /System/Volumes/Data
```

Result: six authorized changed files; all three own source/test hashes still
match the recorded values; main registry bytes retained; no conflict markers;
`git diff --check` passed. Final stat before this confirmation append was
6 files changed, 1618 insertions, with 1128 receipt lines. Only this receipt grew
after that read. Available disk was 59 GB, free memory 56%, and HEAD remained
`281a49281bd72512014c9758929b0cf7fa42906d`. No source, test, registry or operational
change followed the completed checks. The Git index remains for the dispatcher
to resolve by staging; no commit or acceptance was performed.

