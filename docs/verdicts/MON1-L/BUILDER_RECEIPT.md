# MON1-L builder receipt — partial foundation, HOLD

23 October 2026. Builder: Codex. Issued BUILD only under decision 74, DEMO-S.
No commit, staging, push, PR, merge, enablement, provider action, real data or
spending. Ben merges. This is test-executed foundation evidence, not an
independent verdict, separate acceptance or completed MON1-L/DEMO-S.

The sections before r1 record the original pre-commit build session. Coverage
claims below have been corrected against reviewer A; r1 records the repair runs.

## Inspected base and scope

- `HEAD` and `origin/main`: `dc5721230fd8aedbf2d9d0457789074b66b48765`.
- Branch: `codex/sandbox/mon1-l`; initial `git status --short` empty.
- Read repository AGENTS.md; BUILD_PLAN.md §§10.1.4–6, CH-1/CH-4 and MON-1;
  the corrected planning pack §§1–2.5, common holds and complete MON1-L card;
  current `docs/contracts/job-work-state-v1.md` and relevant source.
- Verified actual definitions with `rg`: `orderWorkFacts`,
  `jobWorkStateEventV1`, `meterDay31Candidate`, `londonMeterDate`,
  `groupSuppliedMeterPlaces`, `computeSmallPlaceAllowance`,
  `classifyMeterActivation`; existing `subscription-allocation.ts` and all
  nine named test files exist. No named-symbol absence STOP.
- Node `v24.17.0`; package manifests pin pnpm `10.28.1`, TypeScript `5.8.3`,
  Vitest `4.1.11`. Dependencies already present; clean install NOT RUN.
- Only seven authorized new files: four core source/tests, contract, own lane
  and this receipt. Shared barrels, existing tests, routes, catalogues,
  migrations and policy tooling untouched. `/private/tmp/jg-msg-mon1-l.txt`
  contains the intended conventional commit message for the dispatcher.

## Choices and bounded result

Implemented strict versioned internal envelope, immutable references/revisions,
canonical fact replay and predecessor validation; exact day31/first-evidence
start candidates; lock/close stop candidates; post-lock refusal hold;
canonical per-date candidate grouping and allowances; immutable trip-date
classification; transitive purity/ambient-clock test.

**Complete intervals and actual counted membership are STOPPED.** The accepted
source contract expressly holds Q-04/Q-05 and there is no approved replacement
in the issued material. Every timeline is `held`, with empty intervals. Every
day has `places:null`, `countedPlaces:null`, and H-METER-CLOCK. Neither means
zero usage. Candidate classifications/grouping cover all supplied jobs and are
not counting, billing or admission results. Consumers must reject held output.
This is deliberately conservative partial work, not full acceptance of the
card. The instruction to build ahead does not approve missing money policy.

Chosen simplest proposed forms:

- Closed internal `meter-lifecycle-policy.v1` / `specified-foundation.v1` /
  `clockStatus:'held'`; no caller-declared approval accepted.
- Only typed trial seam `{status:'unavailable'}`. No accepted-trial shape
  invented while authoritative upstream contract is absent.
- Explicit supplied `asOf` cutoff; an event participates only if fact and
  recorded time are both at/before it. Preserve all source identities/times,
  including later-known facts. Canonical six-digit times never roundtrip
  through Date; Date is used only for calendar labels.
- One tenant, common date bounds/cutoff, unique jobs for day projection.
  Candidate place grouping and allowances reuse unchanged helpers.
- Co-earliest boundary source IDs retained; lexical cause label is display
  ordering, not money attribution. Earliest close remains a candidate in the
  presence of reopen; the overall result is held, never an admission answer.
- The immutable terms small flag is consumed, not recertified. Its upstream
  strict £2,000 helper is tested; MON1-T owns qualifying £4,000 trip creation.
- No shared core export. All new tests import this module relatively.

## Acceptance map and every STOP

| ID | Evidence executed | Limit / STOP |
| --- | --- | --- |
| M1L-01 | London day31 candidate, first-photo day5 earlier source | Actual intervals/day membership held |
| M1L-02 | Spring/fall/leap/year date enumeration and day31 | STOP finish+7 / quiet30 exact deadlines, DST, inclusion endpoints Q-04 |
| M1L-03 | Cancellation sources validated; unresolved cases held | STOP prospective cancellation after ended interval Q-05, explicit/implicit restart/admission |
| M1L-04 | Canonical replay, identical duplicate, conflicting duplicate refusal, microseconds, input unchanged; delayed-recording cutoff was NOT covered in the original suite (added in r1) | No durable historical correction or issued statement proof |
| M1L-05 | Same customer/site, different customers, mixed small group, candidate allowances 4/7, strict threshold helper | Candidate grouping only; counted membership still null |
| M1L-06 | Close-before-lock candidate only, post-lock activity hold, unknown payment event refusal; unchanged CH-4 regressions. Lock-only stop, stop-gated starts and stopped commitment were NOT covered originally (added in r1) | STOP stop-day inclusion, reopening authority and full no-restart lifecycle proof |
| M1L-07 | Original trip day makes later diagnostic classification non-small; no omission/untrip input | Authoritative trip/approval source integration remains MON1-T |
| M1L-08 | Unknown fields/kinds, wrong job, preactivation event/trip (NOT lock in the original suite; added in r1), absent/zero revision, policy overrides and fake accepted trial rejected | Pure inputs cannot certify real source authority/completeness |
| M1L-09 | Transitive pure-core allowlist, no ambient clock/network/timers/dynamic imports | Actual SQL grants and hidden/no-hidden runtime consumer proof remain external |

Additional item STOPs: accepted trial source variant unavailable; first-ever
evidence after day31/quiet-stop overlap unresolved; whole trial/import/diary
execution and capacity/correction consumer paths absent from this leaf. No
absent predecessor, accepted split or model verdict is inferred from source
presence. Final-account reserved work was not inspected or changed.

## Commands actually run

The default `/Users/benharwood/Library/pnpm/bin/pnpm` launcher stalled before
running checks (emitting pnpm-11 configuration warnings). No install command
was issued. Interrupted exit 130: initial `pnpm --filter @jobguard/core exec
vitest run --maxWorkers=2 src/meter-lifecycle.test.ts` and the subsequent
combined typecheck/test attempt; version probes using
`PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS=false`,
`npm_config_manage_package_manager_versions=false`, and
`--manage-package-manager-versions=false` also stalled and were interrupted.
No preimplementation red test result is claimed. Tests were written first.

Resolved launcher locally without changing repository config: temporary
`/private/tmp/jg-mon1-l-bin/pnpm` executes Node against already cached
`/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.
Its `pnpm --version` returned `10.28.1`. Every pnpm command below used
`PATH=/private/tmp/jg-mon1-l-bin:$PATH`; child commands inherit it.

| Command | Actual result |
| --- | --- |
| `packages/core/node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit` | PASS, exit 0 |
| `packages/core/node_modules/.bin/vitest run --maxWorkers=2 packages/core/src/meter-lifecycle.test.ts` | PASS, 9 tests |
| `pnpm --filter @jobguard/core typecheck` | PASS, exit 0 |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/meter-lifecycle.test.ts src/meter-lifecycle-calendar.test.ts src/meter-lifecycle-architecture.test.ts` | PASS, 3 files / 21 tests |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-work-state.test.ts src/jobs-on-the-go.test.ts src/jobs-on-the-go-pricing.test.ts` | PASS, 3 files / 63 tests |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/subscription-allocation.test.ts src/subscription-period.test.ts src/subscription-architecture.test.ts` | PASS, 3 files / 28 tests |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | FAIL exit 1: purity PASS (232 TS files), then lane checker refuses missing branch/self-comparison range; Turbo lint stage not reached |
| `pnpm lint:lanes` | FAIL exit 1: Missing branch or self-comparison range; refusing a misleading pass |
| `pnpm build --concurrency=2` | PASS exit 0, 7/7 tasks, 2 cache hits / 5 executed; 1m11.651s |
| `pnpm --filter @jobguard/core build` | PASS (also executed separately from apps/api working directory) |
| `pnpm openapi:check` | FAIL exit 1: tsx IPC `listen EPERM` before generator |
| `node dist/generate-openapi.js --check` from `apps/api` after build | FAIL exit 1: `openapi.json is stale`; shared artifact left unchanged |
| `git diff --check` | PASS for tracked changes (new files also checked separately at final inspection) |

Build emitted shared-cache IO permission warnings, Next workspace-root warning,
existing CSS `end` autoprefixer warnings, and Nest/file-type export warnings;
it nevertheless completed successfully. No warning was suppressed. The
OpenAPI generator is unrelated to this unexported pure module; source imports,
routes and artifact remain unchanged. Dispatcher owns shared regeneration and
CI recheck. No fabricated OpenAPI pass.

PostgreSQL, migrations, browser, native and live-model suites: **NOT RUN**.
No schema/provider/prompt changes here; DB/browser remain mandatory where
applicable in downstream GitHub CI after predecessor merges. Root full tests
and root full typecheck: NOT RUN; issued narrow suites/typecheck run above.
No more than two Vitest workers; root build/lint concurrency limited to two.

Lane refusal is expected with HEAD equal to base in this uncommitted sandbox.
No fake range, temporary git commit, tool relaxation or legacy-register edit.
Dispatcher must rerun both lane/lint gates after committing the exact candidate.

## Holds retained (planning-pack §3)

| Hold | State at handoff |
| --- | --- |
| H-ISSUE | BUILD-only order received; exact future candidate SHA/review/accepting actors and integration evidence not bound here |
| H-PREDECESSORS | Accepted merged CH-1/CH-2/CH-3a/CH-4/SV-4 and governing split receipts not independently established; hold acceptance/integration |
| H-NORMATIVE | No policy amendment supplied or approved; conflicts remain holds |
| H-CH4 | Existing facts consumed unchanged; exact accepted final command handoff not established |
| H-B | Preserved; no MON-3-P-B work or guard removal |
| H-METER-CLOCK | OPEN, affected interval implementation STOP as detailed above |
| H-TRIAL-CLOCK | OPEN, no trial clock implemented |
| H-CONVERSION | OPEN, no conversion or new correction policy |
| H-PRACTICE | OPEN, no shared-practice authority/storage/access |
| H-HTTP | OPEN, no normal-company route/auth widening |
| H-IDENTITY | OPEN, no identity/claim authority inferred |
| H-ENABLE | OPEN, no trial or admission enablement |
| H-EXTERNAL | OPEN, import/diary/Final Check/complete journey consumers external |
| H-CH4-Q01/Q03 | OPEN, no reopening/check or snagging policy approval |
| H-REVIEW | OPEN, two exact-head Claude verdicts, required CI and separate acceptance absent; Ben merges |
| H-LIVE | OPEN, production, fees, providers, real data and releases disabled/unmodified |

No migrations/backfill, backwards incompatible existing API changes or new
operational alerts. No business network/database action. New exports are only
file-local module exports pending coordinator integration. The receipt and
contract are reviewable partial build artifacts; the task remains HOLD.

## r1 (reviewer A repair)

23 October 2026. Working-tree repair on `e2532dda4f99a14a6000447b2016a8eeac9d80ab`,
base `origin/main` = `dc5721230fd8aedbf2d9d0457789074b66b48765`.
Read reviewer A's full verdict at
`/Users/benharwood/.local/share/full-steam/jg-runs/v5-mon1-l-claude-A-e2532dda-20261023.md`
first. Reviewer B's file was not read. This is builder evidence, not a new
independent verdict or acceptance. No commit, staging, push or PR performed.

Corrected the original acceptance map's unsupported coverage claims: the
original suite did not isolate lock stops, stop-gated starts, stopped commitment,
delayed recorded-time visibility or preactivation locks. r1 adds that coverage
without removing or weakening earlier assertions. The replay test was renamed
to remove its unsupported delayed-source claim.

Changes and focused assertions:

- M1L-06: lock-only stop; close before lock and lock before close; first evidence
  exactly at and after stop; day31 exactly at and after stop; exact stopped
  commitment status and source identity.
- M1L-04/08: fact earlier than cutoff but recorded later is excluded, then included
  exactly at recorded time; preactivation lock rejected.
- Recommended cases: future trip ignored even on later supplied dates;
  recordedAt before factAt, ID alias, trip equal to/after lock, and empty/reversed
  date range refused; cancellation output explicitly includes H-CH4.
- UUIDs normalized to lowercase within this module's envelope before alias and
  replay checks, including event reference UUIDs. Case-only replay deduplicates;
  case-variant identity with conflicting content refuses; case-variant alias
  refuses. Shared CH-4 source was not changed.
- `candidateAllowance.countedPlaces` now has type `null`, with runtime assertions
  for every day including dates before activation and after lock. Contract updated.
  Other allowance fields remain supplied-job diagnostics. No actual day-counting,
  billing, admission, trial or held policy was enabled.

Mutation evidence (test-executed locally, individually, then source restored):
`python3 /private/tmp/jg-mon1-l-mutations.py` invoked the local Vitest binary with
`--maxWorkers=2` and all three lifecycle test files for each mutation. Each run
exited 1 with assertion failures, not an import/compile failure. Baseline and
restored suites passed. These are deterministic mutation checks, not model review.

| Mutation | Failed assertions / 39 |
| --- | --- |
| M1 remove recordedAt cutoff | 1 |
| M2 never append lock stop | 6 |
| M3 remove alias refusal | 2 |
| M4 remove trip >= lock refusal | 2 |
| M7 remove trip asOf cutoff | 1 |
| M8 remove recordedAt < factAt refusal | 1 |
| M9 remove evidence stop gate | 2 |
| M10 remove range refusal | 2 |
| M11 remove preactivation lock refusal (keep trip refusal) | 1 |
| M12 remove H-CH4 hold | 1 |
| M13 remove day31 stop gate | 4 |
| M14 always return candidate commitment | 3 |
| Remove event ID lowercase normalization | 1 |
| Restore numeric candidate allowance count | 3 |

All pnpm commands use the already cached pinned pnpm 10.28.1 through
`PATH=/private/tmp/jg-mon1-l-bin:$PATH`; Node v24.17.0. No install/download.

| r1 command actually run | Result |
| --- | --- |
| `pnpm --filter @jobguard/core typecheck` | PASS |
| `pnpm --filter @jobguard/core lint` | PASS |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/meter-lifecycle.test.ts src/meter-lifecycle-calendar.test.ts src/meter-lifecycle-architecture.test.ts` | PASS, 3 files / 39 tests |
| Same focused command plus the six original predecessor/regression files listed above | PASS, 9 files / 130 tests |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | PASS, 7/7 tasks, 2 cached; purity/lane/money/commercial checks passed |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, real branch/range; no simulated event |
| `pnpm openapi:check` | FAIL, tsx IPC listen EPERM before generation |
| `node dist/generate-openapi.js --check` from apps/api | FAIL, existing openapi.json stale; artifact unchanged/outside permitted scope |
| `pnpm --filter @jobguard/core test --maxWorkers=2` | FAIL, 6 assertions in 5 compiled dist test files: source readers seek nonexistent dist/*.ts; 245 files / 5954 tests pass. No test weakened or build output removed to hide this. |

The unrestricted package test command discovers compiled test copies in `dist`
after build as well as `src`. A separate complete source-only run is recorded
below. Root lint/build warnings include shared-cache permission IO, workspace-root,
CSS autoprefixer, Nest/file-type and computed-import warnings; none suppressed.
PostgreSQL/migrations/browser suites not run: sandbox cannot bind/start PostgreSQL;
dispatcher-owned GitHub CI remains required. No schema, migration, provider, prompt,
public API, alert or shared barrel change. All previous holds remain open,
including independent exact-candidate review and separate acceptance.

Final r1 results:

| Command | Result |
| --- | --- |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src` | PASS, all 125 source test files / 2980 tests; log `/private/tmp/jg-mon1-l-core-source-tests.log` |
| `pnpm build --concurrency=2` | PASS, 7/7 tasks, 2 cached / 5 executed; 1m9.16s |
| `git diff --check` | PASS |

Final tracked changes are exactly five permitted files: lifecycle implementation,
lifecycle tests, calendar tests, contract and this receipt. The lane and
architecture test are unchanged. Intended commit subject/body written to
`/private/tmp/jg-msg-mon1-l.txt`. No independently reviewed repair SHA exists yet;
dispatcher must commit, rerun required CI and obtain the required verdict/acceptance.
