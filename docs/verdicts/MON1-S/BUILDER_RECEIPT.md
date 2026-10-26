# MON1-S builder receipt — 23 October 2026

Status: **built normal-company source foundation; HOLD for integration, PostgreSQL CI and independent review. Not accepted.** No commit, push, merge or external action. Builder Codex; one delegated source/repository/unit-test worker, at most two concurrent check processes. Ben owns merge.

## Issued scope and base evidence

Read repository AGENTS.md, BUILD_PLAN.md §§10.1.4–10.1.6 and MON-1/SB-17–19, the issued Astra draft MON1-S section in full and common contract §§2–2.5. Explicit 23 October build-ahead issuance/decision 74 supersedes the draft's unissued/merged-base restriction for this build; it grants no acceptance or release.

- Worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/mon1-s`, branch `codex/sandbox/mon1-s`.
- HEAD `a899409dd0811ed6f45444ef4cf70ba82c476284`; observed `origin/main` `dc5721230fd8aedbf2d9d0457789074b66b48765`.
- Initial `git status --short`: empty. Read-only ancestry checks for MON1-T `4026c3b5` and MON1-L `e2532dda`: exit 0. Dependencies consumed as issued, not claimed reviewed/merged.
- `git grep` verified `projectMeterJobTimeline` and `projectMeterDays` in `packages/core/src/meter-lifecycle.ts`, plus `readSmallTrip` in `packages/db/src/meter-small-trip.ts`. **STOP-public-export:** neither L function is in core's shared index. Private compiled import consumes the existing implementation without modifying shared exports. Coordinator public export remains outstanding.
- Installed Node observed `v24.17.0`. Dependencies were already present. No install/update command was run.

## Changes and exact limits

Adds only the issued source/repository/unit file, four PostgreSQL files, contract, 0209 SQL/note, own lane and this receipt. Existing supplied-input classes, 0184 history, grants on existing tables, catalogue tests, source consumers, subscription integration and shared exports remain untouched.

0209 adds normal-company scope, immutable source/source-reference/computation rows, held day cache, reserved place/correction storage, deduplicated alerts, isolated NOLOGIN/NOINHERIT/NOBYPASSRLS meter role, three checked entrypoints and private identity-only bridge. Every new business table is migration-owned, tenant-qualified and FORCE RLS. Runtime receives no table privileges. Authority runs before lock 184, after it, and before replay/lookup. Capture/rebuild require current owner; owner/admin can read. Shared practice is refused structurally. Caller provides no counts, sources, price, policy, actor, tenant or trial selector.

Source SQL snapshots accepted monthly agreement, activation/terms, activation-frozen CH-3a binding, work events and lock, links between included jobs, and latest MON1-T trip observation including source/observation identity, hashes and six-digit times. Source provenance is `actual_normal_company.v1`, never the 0184 supplied fixture envelope. Missing source/terms and mid-period plan changes return typed unavailability/hold. Computation binds the immutable source and recipe; TypeScript invokes both actual MON1-L functions on every read. Cached held-day mismatch cannot change output and records one alert.

**MON1-L itself is held:** counted places are null, intervals unavailable, no price/money result. This build preserves that state. It does not duplicate arithmetic, derive a bill, grant trial entitlement, create monetary corrections or pretend reserved place rows are closed charged places. Source hash uses PostgreSQL `jsonb::text`; result hash uses deterministic pure-result JSON bytes. They are deliberately distinct hash contracts.

## Commands actually executed

Commands below use repository root unless a cwd is stated. No PostgreSQL/browser suite was executed.

| Command | Actual result |
| --- | --- |
| `pnpm --filter @jobguard/core build` (worker) | Launcher failed trying to resolve/switch to pinned 10.28.1: network/signature-verification failure. No package installation succeeded. |
| `env npm_config_manage_package_manager_versions=false pnpm --version` and `pnpm --manage-package-manager-versions=false --version` | Launcher still attempted version resolution; both stopped with Ctrl-C. No further network-based workaround attempted. |
| `node /Users/benharwood/Library/pnpm/.tools/pnpm/9.0.0_tmp_7291_0/node_modules/pnpm/bin/pnpm.cjs --version` | Reported 9.0.0; not used to substitute the pinned package manager or install anything. |
| `node_modules/.bin/tsc -p packages/core/tsconfig.json` | PASS, built prerequisite compiled private seam. |
| `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` | PASS. This is the installed body of both DB `typecheck` and package `lint`; repeated following changes. |
| `node_modules/.bin/vitest run --maxWorkers=2 src/meter-lifecycle-repository.test.ts src/meter-repository.test.ts src/meter-persistence.test.ts` (cwd `packages/db`) | PASS: 3 files, 19 tests. Worker first ran earlier 18-test versions, then final 19; root also verified 19 after final source/input edits. No existing assertion weakened. |
| `node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext packages/db/test/meter-lifecycle-source.integration.test.ts packages/db/test/meter-lifecycle-isolation.integration.test.ts packages/db/test/meter-lifecycle-upgrade.integration.test.ts packages/db/test/meter-lifecycle-corrections.integration.test.ts` | PASS static typecheck only, not PostgreSQL execution. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | FAIL: core purity passed (235 TS files), lane check rejected inherited CH-4-C/MON1-L/MON1-T stack paths against main. The new lane does not authorize those inherited files. Later root lint stages run separately below. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | FAIL for the same inherited paths. Required check not waived. |
| `LANE_BASE_REF=HEAD node tools/agent-lane-boundary-lint.mjs` | Refused self-comparison; no supplemental lane PASS claimed. |
| `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs` | PASS. |
| `for package in config core storage ai db; do node_modules/.bin/tsc -p "packages/$package/tsconfig.json" \|\| exit $?; done` | PASS all five package builds using installed tools. Final DB emit repeated after source changes. |
| `node_modules/.bin/nest build` (cwd `apps/api`) | PASS. |
| `node_modules/.bin/next build` (first mistakenly cwd root) | FAIL: no app/pages directory at root; corrected invocation next row. |
| `node_modules/.bin/next build` (cwd `apps/web`) | PASS including type validation and 41 static pages. Warnings: existing CSS `end`, Nest/file-type export resolution, dynamic load-esm dependency and multiple-lockfile tracing-root inference. No website launched. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | PASS. Uses installed tsx via Node import, no CLI IPC listener. |
| `git diff --check` | PASS for tracked diff. |
| Inline Node check using `lanePathAllowed` and `git ls-files --others --exclude-standard -z` | PASS: all 12 new files match the issued private allowlist and have no trailing whitespace. This is not a lane-check PASS against main. |

The pinned pnpm launcher could not run the requested script entrypoints reliably offline. Installed script bodies above are real executions, not claims that `pnpm lint`/`pnpm build`/full CI passed. No clean install was attempted or claimed.

## PostgreSQL suites written, NOT RUN locally

- `meter-lifecycle-source.integration.test.ts`: default capture fails closed/zero partial rows; test-only coordinator prerequisites; labelled activation storage fixture plus real CH-4 finish; fresh-connection replay, revision conflict, unique computation, cache tamper with one alert. It does **not** claim a real switch-live journey.
- `meter-lifecycle-isolation.integration.test.ts`: shared-practice/malformed/revoked authority, admin mutation denial, role memberships, local table/function grants, owner/FORCE RLS and shadow access checks. Full transitive shared catalogue proof remains coordinator-owned.
- `meter-lifecycle-corrections.integration.test.ts`: correction hold and append-only reservations. Does **not** prove priced late corrections, negative handling or closed receiving-period arithmetic.
- `meter-lifecycle-upgrade.integration.test.ts`: populated predecessor bytes/types/ACL/policies, own 0209 after 0208, successors twice and comparator control. Fresh migration is exercised by the other suites' fixture setup.

CI must run these four files, existing meter persistence/rebuild/upgrade tests and subscription persistence/statements/replay regressions with the packet's single-worker PostgreSQL commands. Actual migration execution is unverified here.

## Coordinator catalogue rows and grants to add later

No shared catalogue file was edited. Add exact real PostgreSQL records for:

1. Business tables `app.meter_lifecycle_scope`, `app.meter_lifecycle_source`, `app.meter_lifecycle_source_ref`, `app.meter_lifecycle_computation`, `app.meter_lifecycle_day_ledger`, `app.meter_lifecycle_place_binding`, `app.meter_lifecycle_correction`, `app.meter_lifecycle_alert`: migration ownership, FORCE RLS, policies, composite PK/FKs, immutable triggers, no runtime table privileges. Scope kind only `normal_company`; shared-practice tenant CHECK.
2. Role `jobguard_meter`: NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEROLE, NOCREATEDB, NOREPLICATION, NOBYPASSRLS; no memberships in either direction; app USAGE only; no role assumption; SELECT/INSERT on scope/source/ref/computation/day/alert and SELECT-only reserved place/correction tables; no UPDATE/DELETE/TRUNCATE.
3. `app.mon1_lifecycle_capture(uuid,text,uuid,date,integer)`, `app.mon1_lifecycle_rebuild(uuid,text,uuid)`, `app.mon1_lifecycle_read(uuid,text,uuid)`: meter ownership, SECURITY DEFINER, fixed `pg_catalog` search path, runtime EXECUTE only, PUBLIC denied.
4. `app.mon1_lifecycle_actor(uuid,text,boolean)`: migration ownership, fixed search path, SECURITY DEFINER, meter EXECUTE only; runtime/PUBLIC denied. Traverse existing `mon1_company_actor` → session/SSO identity authority as an explicit reviewed identity exception. It returns only current actor; no source/calculator bridge runs as migration owner.
5. Future narrow SELECT grants/policies on `subscription_agreement_revision`, `job`, `job_activation`, `job_activation_terms`, `job_party_binding`, `job_work_state_event`, `final_account_lock`, `job_small_trip_event`, `job_small_trip_observation`, `job_link`. They are **not installed by 0209**. Install only after effective/transitive privilege review and source-writer lock reconciliation. No UPDATE, shadow, fee, finding, infrastructure or provider grant is required. Test-only grants in the source suite are not product grants.
6. Verify the complete actual privilege/call graph, hidden/no-hidden output/hash/query equivalence, malformed context and pooled reuse, current-session/membership races after waits/on replay, own N/fresh/successor proofs, and unchanged 0184/subscription catalogues. Do not invent fingerprints in advance.

## STOPs / holds / acceptance mapping

- **STOP source-grants:** capture is intentionally unavailable with 0209 alone because shared source grants are outside this issue. Coordinator integration is required. No fixture fallback exists. M1S-01 positive source-kernel evidence is written with test-only prerequisites; execution and full actual-command journey held.
- **STOP public-export:** required L symbols exist but shared public exports do not; compiled monorepo seam works after core build. Public export integration held.
- **STOP check environment:** pnpm pinned launcher blocked; root lane check against main fails on the issued inherited stack. No scanner/lane weakening or allowance expansion to inherited paths.
- **H-PRACTICE:** not cleared; zero session-scoped schema/authority. Normal rejection tests written; A/B practice/adoption/session expiry claims held (M1S-07).
- **H-TRIAL/MON-3C:** authoritative trial projection absent. No trial or annual enablement (M1S-09).
- **H-METER-CLOCK/H-CH4/H-CORRECTIONS:** current L emits held counts. Exact priced corrections, previous-correction chain, negative/closed-receiver rules and closed-day regrouping acceptance remain held (M1S-05/06), no invented financial policy.
- **H-INTEGRATION:** source writers/plan changes must all take tenant lock 184 before business locks. Existing consumer wiring, subscription adapter, audit/receipt composition, full source journey and closed issued-statement evidence belong to coordinator. This leaf does not assert all existing writers serialize correctly.
- **H-CI:** M1S-01/03/04/08/10 PostgreSQL, race and migration claims are source-inspected/typechecked, not test-executed. Local unit tests cover strict inputs, held projections, source bindings, typed refusals/rollback, microseconds, trip seam and preserved fixture model; they are not isolation proof.
- **H-REVIEW:** no exact-commit Claude A/B verdict, separate acceptance, required CI or merge exists. Builder does not accept this work. Dependencies remain unreviewed/unmerged as issued.

No new provider route, prompt/model, external action, secret or production operational alert path. The durable internal `METER_CACHE_MISMATCH` alert needs coordinator monitoring wiring. No data rewrite/backfill; rollback/forward-fix guidance is in the 0209 note. Adjacent work is recorded here because BUILD_PLAN/shared files are outside the private allowlist.


## r1 (catch-up)

23 October 2026. Issued RED money/meter catch-up on side branch
`codex/sandbox/mon1-s`, starting HEAD `3d515205`. No PR, staging, commit,
push or merge performed. Dispatcher owns committing and pushing. Intended
commit subject/body: `/private/tmp/jg-msg-mon1-s.txt`.

Read AGENTS.md, BUILD_PLAN.md §§10.1.4–6 and MON-1, both lifecycle contracts,
MON1-L's r1 receipt and the separate acceptance record
`/Users/benharwood/.local/share/full-steam/jg-runs/v5-mon1-l-acceptance-70e1778a-20261023.md`.
That record accepts only the partial foundation at `70e1778a`; it is not an
acceptance of this new working tree. MON1-L r1 and repaired MON1-T `6e5d5093`
are merged dependencies per this order, superseding the original receipt's
unmerged-dependency statement. No builder self-acceptance or new model verdict.

Changes and evidence:

- Renamed migration/note to `0209_meter_lifecycle_source`; SQL bytes are
  unchanged. Updated lane, upgrade assertions, contract and earlier receipt
  references. Fresh-discovery unit assertion requires 0208 immediately before
  0209 and refuses the old lifecycle filename. The PostgreSQL upgrade test
  now seeds through 0208 and applies 0209; execution remains CI-only.
- Adapted stored-source consumer coverage to null held counts and canonical
  event identity replay/conflict. Job sorting uses the same explicit lexical
  comparator as MON1-L. No mutable source refresh or new billing path.
- All three candidate allowance numbers (`rawPlaces`, `freeSmallPlaces`,
  `countedPlaces`) are typed/runtime null for every date, including before
  activation and after lock. The allowance version remains unchanged;
  candidate grouping/classification remains explicitly diagnostic. Numeric
  allowance assertions were replaced by stronger held-count assertions as
  expressly ordered; no unrelated test was weakened.
- Contract explicitly records H-METER-CLOCK: evidence/day31 exactly at the
  earliest stop yields no start; the rule does not approve complete intervals
  or stop-day inclusion. Existing exact-tie tests remain in force.
- Added jobId and predecessorId case-normalization assertions for replay and
  predecessor validation. The architecture traversal resolves ../src from
  either source or compiled tests, independent of a dist source copy. Inspected
  merged `job-work-timing.ts` (only zod and job-work-state imports), added it
  to the explicit traversal allowlist, and kept every purity assertion.
- Fixture audit: MON1-S's four PostgreSQL suites and their reused
  `meter-persistence-fixtures.ts` contain no `final_review`/`extra_origin`
  insertion. The copied activation uses `job_commercial_track` provenance
  `backfilled_synthetic_fixture`, allowed by 0053's track CHECK. MON1-T's
  repaired `final_review` fixture uses `command` plus receipt/member identity;
  no invalid final-review fixture was copied here and no fixture fix is needed.

Mutation evidence: restoring numeric raw allowance or numeric free-small
allowance caused three assertion failures each; removing jobId lowercase
caused one test failure, and removing predecessorId lowercase caused one.
Original source restored in finally blocks. The ad hoc mutation driver's
extra diagnostic assertion itself rejected the typed-error output in the UUID
runs; Vitest independently exited 1 with one failed test in each, with no
compile/import failure. Logs: `/private/tmp/jg-mon1-s-mutation-*.log`.
These are deterministic tests, not independent model review.

Node v24.17.0; pinned cached pnpm 10.28.1 through
`PATH=/private/tmp/jg-mon1-l-bin:$PATH`; existing dependencies only, no install.
Final check results follow below. Earlier failed intermediate runs are not
passes: architecture initially rejected the merged timing dependency; restoring
allowance version required a literal type annotation; a pre-rebuild compiled
architecture copy failed until rebuilt. No assertion was removed to resolve them.


| r1 command actually run (pinned pnpm PATH above) | Result |
| --- | --- |
| `pnpm --filter @jobguard/core typecheck` | PASS |
| `pnpm --filter @jobguard/db typecheck` | PASS |
| `pnpm --filter @jobguard/core lint` | PASS |
| `pnpm --filter @jobguard/db lint` | PASS |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/meter-lifecycle-repository.test.ts` | PASS, 1 file / 9 tests |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/meter-lifecycle.test.ts src/meter-lifecycle-calendar.test.ts src/meter-lifecycle-architecture.test.ts dist/meter-lifecycle-architecture.test.js` | PASS, 4 files / 42 tests |
| Same three core source files plus `src/job-work-state.test.ts src/job-work-timing.test.ts src/jobs-on-the-go.test.ts src/jobs-on-the-go-pricing.test.ts src/subscription-allocation.test.ts src/subscription-period.test.ts src/subscription-architecture.test.ts` (`--maxWorkers=2`) | Initial run: 140 pass / 1 timeout in existing generated subscription-period test while compilation competed. Unchanged retry: PASS, 10 files / 141 tests, 4.04s. Default timeout retained. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | FAIL: purity check passes; lane stage rejects inherited CH-4-C/MON1-L/MON1-T paths and old-name working-tree deletions outside current lane. Turbo package lint stage not reached; core/db package lint run separately above. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL, same inherited-range/deletion boundary; no simulated range or policy-tool weakening |
| `pnpm openapi:check` | FAIL before generator: tsx CLI IPC listen EPERM |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | PASS, exit 0; same source generator, no IPC server; no artifact changed |
| `git diff --check` | PASS |
| Compare renamed SQL bytes against `git show HEAD:packages/db/migrations/0207_meter_lifecycle_source.sql` | PASS; byte-preserving rename |

The unchanged former architecture path was also tested against the compiled
architecture test: failed with ENOENT seeking dist/meter-lifecycle.ts as expected.
Compiled test artifact restored; source/dist architecture rerun recorded below.
No source copy was placed in dist. No independent model review is claimed.

PostgreSQL tests, `pnpm test:db`, `pnpm test:migrations` and browser suites:
**NOT RUN locally**, per order/sandbox constraints. Dispatcher must run real
PostgreSQL migration/upgrade/privilege/RLS/race suites and browser checks in
GitHub CI after push. Fresh-discovery unit evidence is not proof that SQL
applied. Root full test/typecheck, native and model evaluations: NOT RUN;
no native/provider/prompt change. No new migration logic, data backfill,
external action, operational alert, fee or production enablement.

All source-grant/integration, H-METER-CLOCK, H-CH4, H-PRACTICE, H-TRIAL,
H-CORRECTIONS, H-CI and new exact-candidate review/acceptance holds remain.
The raw/free-small null type change is intentional and requires consumers to
preserve held semantics. MON1-S remains a partial source foundation awaiting
independent verdicts, separate acceptance and dispatcher CI; not task closure.
Logs for this round are `/private/tmp/jg-mon1-s-*.log`.


Final results:

| Command | Result |
| --- | --- |
| `pnpm build --concurrency=2` | PASS, 7/7 tasks, 2 cached; 3m51.942s |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/meter-lifecycle-architecture.test.ts dist/meter-lifecycle-architecture.test.js` after reverting path mutation | PASS, 2 files / 2 tests |

Build warnings retained: Turbo cache IO permission warnings, existing pnpm
configuration warning in replayed cache output, Next workspace-root warning,
CSS autoprefixer warning and Nest/file-type/computed dependency warnings.
No warning was suppressed. All writes are limited to issued lane paths,
renaming its migration/note, the explicitly authorized MON1-L paths, and the
requested temporary commit message/logs. HEAD remains `3d515205` on
`codex/sandbox/mon1-s`; no git write command was run.


## review repair 1

23 October 2026. Issued RED money/meter repair of reviewed `e7589b38`.
Working-tree starting HEAD is `ef9cd520` (dispatcher’s subsequent lane addition
for `demo-bootstrap.ts`). No git write, commit, push or package installation.
Read AGENTS.md, BUILD_PLAN.md §10.1.5 and MON-1, both lifecycle contracts,
and both complete reviews at
`/Users/benharwood/.local/share/full-steam/jg-runs/v5-mon1-s-claude-{A,B}-e7589b38-20261023.md`.
Those reviews say REPAIR for the former head; no verdict or acceptance of this
repair is claimed.

Changes:

- 0209 guards cluster-wide meter-role creation and rejects privileged posture
  or inherited roles. Bootstrap ensureRoles pre-creates meter alongside the
  shadow roles, checks posture (including replication), and applies the same
  PostgreSQL 16 ADMIN-only creator-holder exception. No role-assumption grant
  to migration/runtime or broad schema CREATE grant is added.
- All lifecycle functions retain jobguard_migration ownership, SECURITY DEFINER
  and pg_catalog search_path. Renamed the capture local to v_revision at every
  variable use, retaining revision column/JSON field names.
- Ownership assertions now additionally require SECURITY DEFINER and the exact
  search_path. Added a real second-database/same-cluster migrate-twice regression
  to the own upgrade suite; this remains unexecuted locally.
- Removed test-only source grants from the positive source suite: migration-owned
  definers already use existing migration-owner source policies. M1S-02 now
  demands the specific missing-agreement refusal, preserving zero partial scope
  assertions instead of accepting a generic error for any broken routine.
  This is a consequence of the ordered ownership change, not a grant bypass.
- Corrected contract and migration note: missing meter grants no longer disable
  these checked routines. Migration-owner privileges remain a trust boundary;
  isolation from shadow tables is not claimed for that owner. Transitive review,
  writer locking, audit/receipt integration and all clock/trial/practice/correction
  and production holds remain. Rollback must not drop the cluster-wide role.
- Rechecked MON1-S source/integration fixtures: no final_review/extra_origin branch
  exists. The activation track’s backfilled_synthetic_fixture is valid and stays.

Checks use cached pnpm 10.28.1 via PATH=/private/tmp/jg-mon1-l-bin:$PATH,
Node v24.17.0 and installed dependencies. No database/browser server was started.

| Command actually run | Result |
| --- | --- |
| pnpm --filter @jobguard/db typecheck | PASS |
| pnpm --filter @jobguard/db lint | PASS |
| pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/meter-lifecycle-repository.test.ts src/meter-repository.test.ts src/meter-persistence.test.ts | PASS, 3 files / 21 tests |
| tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext on all four meter-lifecycle integration test files | PASS static checking only |
| LANE_BASE_REF=3d515205 pnpm lint:lanes | PASS before final receipt; final rerun below |
| LANE_BASE_REF=origin/main pnpm lint --concurrency=2 | FAIL at lane check for inherited out-of-lane stack paths; purity passed. Package db lint ran separately. |
| pnpm openapi:check | FAIL: tsx IPC listen EPERM in sandbox |
| node --import tsx src/generate-openapi.ts --check (apps/api) | PASS |
| pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/demo-bootstrap.integration.test.ts -t 'bootstrap SQL trace' | FAIL: existing mock supplies posture only for shadow roles, not new meter role. PostgreSQL tests skipped by name filter. |
| git diff --check | PASS before final receipt; final rerun below |

The existing SQL-trace fixture is outside the issued lane. Requested explicit
permission to update packages/db/test/demo-bootstrap.integration.test.ts and
prepared the concrete narrow patch at /private/tmp/jg-mon1-s-bootstrap-test.patch.
It adds meter to the mock, supplies replication posture and asserts meter
provisioning/posture occurs before SET ROLE. It does not relax a check.
Pending that authorization the test file and lane register remain untouched.
This known failing mock must be repaired before technical acceptance.

NOT RUN: PostgreSQL, test:db, test:migrations, real demo-bootstrap “creates roles”
case, M1S-01/03/04 capture/cache/replay, second-database migration, browser suites.
Reviewer A/dispatcher CI must run these after commit/push; static/type/unit
checks do not establish successful SQL application or runtime tenant isolation.
No new migration file, backfill, commercial fee, provider route, prompt/model,
external action or production capability is enabled.
Logs: /private/tmp/jg-mon1-s-review-repair1-*.log.
Intended commit message: /private/tmp/jg-msg-mon1-s.txt.

Final available-check results:

| Command | Result |
| --- | --- |
| pnpm build --concurrency=2 | PASS, 7/7 tasks, 3 cached, 2m55.435s |
| pnpm typecheck --concurrency=2 | PASS, 7/7 tasks, 2 cached, 1m21.316s |
| LANE_BASE_REF=3d515205 pnpm lint:lanes (final receipt included) | PASS |
| LANE_BASE_REF=origin/main pnpm lint:lanes | FAIL, same inherited out-of-lane paths |
| node tools/money-arithmetic-lint.mjs | PASS |
| node tools/commercial-boundary-lint.mjs | PASS |
| git diff --check | PASS |

Build warnings: Turbo cache IO permissions; existing Next tracing-root, CSS
and Nest/file-type/computed-dependency warnings. None suppressed. The SQL-trace
mock failure remains an explicit hold pending the requested test-file lane
permission; no successful real-bootstrap or PostgreSQL result is claimed.


## review repair 2

23 October 2026; final default repair round, issued by the Track A+B dispatcher.
Starting HEAD `24aa4f91`, branch `codex/sandbox/mon1-s`; initial working tree clean.
No commit, push, stage, checkout, dependency installation or PostgreSQL/browser
server startup. Node v24.17.0; installed pnpm 10.28.1 via
`PATH=/private/tmp/jg-mon1-l-bin:$PATH`. These checks use the existing install,
not a newly verified clean install.

Only code change: explicitly copy `password: f.admin.options.password` when
constructing the second-database pool in
`packages/db/test/meter-lifecycle-upgrade.integration.test.ts`. pg-pool makes
that option non-enumerable, so object spread alone loses it. Migration SQL,
assertions and all product behavior are unchanged. Repository-wide test searches
for pool-options spreads found no other occurrence missing an explicit password;
all other pool copies already supply the original or a deliberate test password.
An in-memory Node assertion confirmed that spread drops the password and the
explicit copy preserves it, without opening a database connection or logging it.

The supplied `jg-runs/v5-mon1-s-claude-A-24aa4f91-20261023.md` is absent from
this worktree and the checked project/nearby run directories; no report contents
were available to read. This repair follows the dispatcher's quoted finding.
Reviewer B's PASS and reviewer A's confirmation of the earlier fixes are
reported by the dispatcher for `24aa4f91`, not claimed as independent verdicts
on this uncommitted repair. Reviewer A must rerun the second-database test.

**H-MON1S-SHADOW-PRIV remains HOLD and must be resolved before merge. It is
outside this repair round's scope.** No shadow privilege, role, routine ownership,
grant, migration or integration hold is changed or cleared. Existing release
and separate-acceptance gates remain closed; this builder does not accept its
own work.

| Command actually run | Result |
| --- | --- |
| `pnpm --filter @jobguard/db typecheck` | PASS |
| `pnpm --filter @jobguard/db lint` | PASS |
| `pnpm typecheck --concurrency=2` | PASS, 7/7 tasks, 2 cached |
| `pnpm build --concurrency=2` | PASS, 7/7 tasks, 3 cached; 41 static web pages |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL at lane boundary on inherited out-of-lane stack paths; core purity passed |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL, same inherited stack paths; no allowlist changed |
| `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs` | PASS |
| `tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext packages/db/test/meter-lifecycle-upgrade.integration.test.ts` via installed `node_modules/.bin/tsc` | PASS, static only |
| `pnpm openapi:check` | FAIL, sandbox EPERM on tsx IPC listen |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | PASS |
| `node --test tools/*.test.mjs` (glob expanded by Python) | PASS, 122 tests |
| `pnpm --filter @jobguard/config exec vitest run --maxWorkers=2` | PASS, 8 files / 82 tests |
| `pnpm --filter @jobguard/storage exec vitest run --maxWorkers=2` | PASS, 2 files / 4 tests |
| `pnpm --filter @jobguard/ai exec vitest run --maxWorkers=2` | PASS, 15 files / 147 tests; fixture evaluation only |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2` | FAIL, 4 generated dist files / 5 assertions try to inspect missing dist/*.ts sources; 250 files / 5989 tests passed |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | PASS, 127 source files / 2997 tests |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src` | FAIL: substring filter also selected four dbsrc integration files, which failed at port discovery before PostgreSQL startup; one audit source-inspection test timed out under concurrent checks |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 <explicit src/**/*.test.ts paths>` (paths expanded by Python) | PASS, 26 source files / 225 tests, including the audit source-inspection test |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 <explicit src/**/*.test.ts paths>` (paths expanded by Python) | FAIL, 9 files; 120 files / 2089 tests passed, 129 tests failed, 23 skipped. Two source suites require PostgreSQL and failed port discovery before startup; HTTP tests hit forbidden listeners (EPERM and Supertest null-port errors) |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 <explicit app/**/*.test.ts(x) paths>` (paths expanded by Python) | PASS, 41 files / 875 tests |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/demo-bootstrap.integration.test.ts -t 'bootstrap SQL trace'` | PASS, 1 mock test, 3 database tests skipped; not a PostgreSQL bootstrap result |
| In-memory Node assertions on pg-pool option copying | PASS, no database connection opened |
| `git diff --check` | PASS |

The initial sequential unit-check driver was interrupted during its first API
attempt after the DB substring-filter mistake; completed results are recorded
above. Its replacement uses explicit source test paths. No test timeout,
assertion, configuration or product source was changed to obtain a pass.

PostgreSQL **NOT RUN**: no PostgreSQL instance started and no database assertions
executed. Broad source-test discovery included DB-dependent API suites as well
as the accidental dbsrc matches noted above; all failed at sandbox port discovery
before database startup. In particular M1S-10 second-database migration, `test:db` and
`test:migrations` remain for reviewer A / dispatcher GitHub CI after push.
Browser suites NOT RUN under the supplied sandbox restriction. No clean-install,
live provider, live model, database migration or tenant-isolation proof is claimed.

Build retains existing Turbo cache IO-permission, Next tracing-root, CSS and
Nest/file-type/computed-dependency warnings. Logs:
`/private/tmp/jg-mon1-s-review-repair2-*.log`.
Intended conventional commit message: `/private/tmp/jg-msg-mon1-s.txt`.

## catch-up onto 28416d1e

25 October 2026; C261 / MON1-S-CATCHUP. Accepted head `cd1bfdec`,
main `28416d1e`, caught-up parents MON1-L `1ed9eecb` and MON1-T `bad654e7`,
combined by dispatcher in `8d95874d`. Resolved the dispatcher-started merge in
place. No git write command, staging, commit, checkout, push, installation,
PostgreSQL or browser startup. Dispatcher owns the merge index and final commit;
the two resolved paths still appear unmerged in that read-only index.
Node v24.17.0; existing pinned pnpm 10.28.1 through
`PATH=/private/tmp/jg-mon1-l-bin:$PATH`. This is existing-install evidence.

Read AGENTS.md, BUILD_PLAN.md §10.1.5–10.1.6 and MON-1, and the lifecycle and
lifecycle-persistence v1 contracts. No product behavior, schema strictness,
commercial policy, privilege or production gate changes.

- Architecture conflict: preserve the complete seven-file dependency set from
  both sides and MON1-S's source/compiled traversal path. The resolved file is
  byte-identical to accepted MON1-S, retaining all purity assertions.
- SERIOUS-B5 conflict: retain both complete additive helpers, closing each
  function separately. Apply retained-workspace 0200, work-state 0201, trip 0208
  and lifecycle 0209 additions. No predecessor snapshot exclusion or comparison
  was removed. Both main's `mon8_retained_contractor_workspace(s uuid, q jsonb)`
  row and all lifecycle rows remain.
- Own repository generic now explicitly uses `z.ZodType<T, unknown>` like main.
  The merged lifecycle core already has the Zod 4 form. Repository-wide search
  found no remaining ZodTypeDef or three-argument ZodType annotation. All strict
  schemas and parser behavior remain unchanged.
- 0209 SQL is byte-identical to `cd1bfdec`. Actual compiled migration discovery
  ends 0199, 0200, 0201 (main's highest), 0208, 0209, without duplicate numbers.
  No renumber, new migration, backfill or rollback change was needed. This is
  discovery evidence, not proof of fresh PostgreSQL application.
- Added contractor upgrade expectations below, preserving full prior-row
  equality and the existing 0208 rows. Added that shared path to MON1-S's own
  lane allowlist and registered this exact catch-up branch there. Existing
  SERIOUS-B5, tenancy and LP-0 paths were already in the own allowlist.

Exact newly added rows, in schema/name/identity-argument order, in
`packages/db/test/contractor-entitlement-upgrade.integration.test.ts`:

```text
app.meter_lifecycle_alert: []
app.meter_lifecycle_computation: []
app.meter_lifecycle_correction: []
app.meter_lifecycle_day_ledger: []
app.meter_lifecycle_place_binding: []
app.meter_lifecycle_scope: []
app.meter_lifecycle_source: []
app.meter_lifecycle_source_ref: []
{nspname:"app",proname:"mon1_lifecycle_actor",args:"t uuid, digest text, mutation boolean"}
{nspname:"app",proname:"mon1_lifecycle_capture",args:"t uuid, digest text, command uuid, start_day date, expected integer"}
{nspname:"app",proname:"mon1_lifecycle_read",args:"t uuid, digest text, computation uuid"}
{nspname:"app",proname:"mon1_lifecycle_rebuild",args:"t uuid, digest text, p_source uuid"}
```

Standing-line inventory accounting: all eight table additions and four routine
signatures above already exist in the retained SERIOUS-B5 helper, including its
12 indexes, eight policies and exact owner/ACL/RLS checks. Tenancy already has
all eight sorted table posture rows (`relrowsecurity:true`,
`relforcerowsecurity:true`, `guarded:true`) and eight migration-owner rows.
No duplicate rows were added to either list. LP-0 `recorded.routines` already
contains exactly one of each of these four entries, preserved unchanged:

```text
function:app.mon1_lifecycle_actor(uuid,text,boolean)
function:app.mon1_lifecycle_capture(uuid,text,uuid,date,integer)
function:app.mon1_lifecycle_read(uuid,text,uuid)
function:app.mon1_lifecycle_rebuild(uuid,text,uuid)
```

All four remain migration-owned SECURITY DEFINER with pinned pg_catalog search
path, no PUBLIC EXECUTE; actor executes only through meter, the other three
through runtime. Existing static write/call inventories are retained; no live
definition digest or transitive privilege proof is claimed.

| Command actually run | Result |
| --- | --- |
| `pnpm build --concurrency=2` | PASS; 7 packages, 2 cached, 52.391s |
| `pnpm typecheck --concurrency=2` after build | PASS; 7 packages, 2 cached |
| `pnpm turbo run lint --concurrency=2` | PASS; all 7 packages |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/meter-lifecycle.test.ts src/meter-lifecycle-calendar.test.ts src/meter-lifecycle-architecture.test.ts` | PASS; 3 files / 41 tests |
| Same three files plus `src/job-work-state.test.ts src/job-work-timing.test.ts src/jobs-on-the-go.test.ts src/jobs-on-the-go-pricing.test.ts src/subscription-allocation.test.ts src/subscription-period.test.ts src/subscription-architecture.test.ts`, `--maxWorkers=2` | PASS; 10 files / 141 tests |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/meter-lifecycle-repository.test.ts test/lp-0-catalog.test.ts test/lock-order-1.test.ts src/meter-persistence.test.ts src/meter-repository.test.ts` | PASS; 5 files / 51 tests (MON1-S 9 plus MON1-T's four-file companion suite 42) |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | FAIL at lane stage on inherited merge paths outside MON1-S; core purity passes, package stage not reached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL on same inherited main/MON1-L/MON1-T paths; own newly assigned shared path is allowlisted |
| `pnpm openapi:check` | FAIL; tsx CLI IPC listen EPERM in sandbox |
| `node --import tsx src/generate-openapi.ts --check` from apps/api | PASS; same generator/check without CLI socket, exit 0 |
| Installed tsc `--noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext` on the four own lifecycle integration files and the contractor-entitlement-upgrade, serious-b5-upgrade and tenancy integration files | PASS; static checking only |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | PASS |
| Read-only SQL-byte, migration-discovery, inventory-presence and test-source comparisons | PASS as detailed below |
| `git diff --check`; conflict-marker scan | PASS; resolved working-tree content, index remains dispatcher-owned |

Initial typecheck and repository-test attempts preceded core compilation and
failed on absent core dist imports. After build, unchanged reruns pass. The
initial DB command also named a nonexistent meter-small-trip unit file; MON1-T
has no separate own non-PostgreSQL unit file, so the final command above uses
its documented four-file companion suite. No passing database result is implied.
An initial ad hoc comparison incorrectly required inherited MON1-S repairs to
match the earlier MON1-L parent, then compared MON1-T's caught-up tests against
pre-catch-up MON1-S. These probes failed; corrected comparisons establish:
all three lifecycle core tests, the repository unit file and four lifecycle
integration files are byte-identical to accepted MON1-S `cd1bfdec`; all three
MON1-T integration files are byte-identical to caught-up `bad654e7`. Earlier
MON1-S held-allowance/UUID assertions and compiled traversal fixes are retained.
Test counts/assertions were not changed by this catch-up.

PostgreSQL **NOT RUN**: reviewer/CI must run lp-0-authority-paths,
serious-b5-upgrade, contractor-entitlement-upgrade, tenancy, all own lifecycle
and trip suites, fresh/upgrade migrations, test:db and test:migrations. Browser
suites NOT RUN under the supplied sandbox restriction. Full root tests, live
model/provider runs and clean install NOT RUN; no model/prompt/native change.
Build retains nonfatal Turbo cache IO permission and existing Next tracing-root,
CSS and Nest/computed-dependency warnings; none suppressed. Root lane failure
is recorded without widening scope to inherited files or weakening the guard.

Existing source integration, clock, correction, trial, practice, commercial,
security/release and separate acceptance holds remain. This is builder evidence,
not an independent verdict or acceptance. Dispatcher must conclude the merge
and obtain the single exact-commit delta check under C261. Logs:
`/private/tmp/jg-mon1-s-catchup-*.log`. Intended commit subject/body:
`/private/tmp/jg-msg-mon1-s-catchup.txt`.

## catch-up run 2 (package imports)

25 October 2026, C261 run 2 of 2. Base HEAD
`948581f6966c59403e077a8e2287ed090c9b901c`; observed `origin/main`
`28416d1ea7e154f2353d56e28f30db34e06e36ab`. Read the run-1 delta verdict
`jg-runs/v5-mon1-s-claude-*-948581f6-*.md` and
`jg-runs/HOLD-core-dist-imports-20261025.md` under
`/Users/benharwood/.local/share/full-steam/`. Run-1 resolutions remain correct;
its inherited static dist import was a CI-order defect, not an environment-only
failure. The earlier after-build typecheck did not establish CI readiness.

Append MON1-L's lifecycle export after the existing core barrel rows and replace
MON1-S's sole relative core/dist import with `@jobguard/core`. Both assigned
barrels are added to the MON1-S lane. Source inspection found no app importing
MON1-S's DB modules, so `packages/db/src/index.ts` needs no export row and is
unchanged. The persistence contract now documents the public import and ordering.
No runtime algorithm, schema, migration, permission, fixture or test assertion
changed. No commit, push, acceptance or release is performed.

Tooling: installed Node `v24.17.0`, installed pnpm `10.28.1` invoked through
`node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.
A temporary PATH shim makes nested pnpm calls use those same installed bytes.
The initial bare `pnpm --version` wrapper failed trying to verify its version
against the unreachable registry; no dependency installation was requested or
completed. All checks below use the installed pinned executable.

### No-dist proof (test-executed)

`/private/tmp/jg-mon1-s-run2-nodist.py` moved **every** existing package dist
(`ai`, `config`, `core`, `db`, `storage`) into a unique temporary directory.
While all five were absent, it ran these commands and recorded their actual
exit codes, then asserted no package dist had been created and restored every
original directory in a `finally` block. Repeated after the final barrel-row
ordering adjustment; both runs passed. No build ran during this proof, and the
root run explicitly bypassed Turbo task caches.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @jobguard/core typecheck` | 0 | Source types resolve without dist |
| `pnpm --filter @jobguard/db typecheck` | 0 | No TS2307 or cascading TS7006 errors |
| `pnpm --filter @jobguard/api typecheck` | 0 | Source types resolve without dist |
| `pnpm typecheck --concurrency=2 --force` | 0 | All 7 packages, 0 cached |

Logs: `/private/tmp/jg-mon1-s-run2-nodist-{core,db,api,root}.log`.

### Other checks (test-executed; limitations explicit)

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm build --concurrency=2` after restoring dist | 0 | All 7 packages |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | 0 | 129 files / 3,009 tests, including MON1-L |
| `pnpm --filter @jobguard/db exec vitest run src/meter-lifecycle-repository.test.ts --maxWorkers=2` | 0 | MON1-S: 1 file / 9 tests |
| Final post-proof `pnpm build --concurrency=2` | 0 | All 7 packages; original dist restored before build |
| Final `pnpm --filter @jobguard/core exec vitest run src/meter-lifecycle.test.ts src/meter-lifecycle-calendar.test.ts src/meter-lifecycle-architecture.test.ts --maxWorkers=2` | 0 | MON1-L: 3 files / 41 tests |
| Final `pnpm --filter @jobguard/db exec vitest run src/meter-lifecycle-repository.test.ts --maxWorkers=2` | 0 | MON1-S: 1 file / 9 tests |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | 1 | Core purity passed; lane stage fails on inherited MON1-L/MON1-T paths below; package stage not reached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same inherited path failures |
| `pnpm turbo run lint --concurrency=2` | 0 | All 7 packages |
| `pnpm openapi:check` | 1 | tsx CLI IPC listen EPERM in sandbox |
| `node --import tsx src/generate-openapi.ts --check` from apps/api | 0 | Same OpenAPI generator/check without CLI socket |
| `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs` | 0 | Both passed |
| `git diff --check` | 0 | No whitespace errors |

The broad exploratory `pnpm --filter @jobguard/db exec vitest run src
--maxWorkers=2` exited 1: Vitest also matched four `test/*dbsrc*` PostgreSQL
integration files. Those four failed in port discovery (`no free port`), with
30 other files / 249 tests passing and 18 skipped. No successful PostgreSQL
execution is claimed. The exact MON1-S unit file above passes independently.
A supplementary `LANE_BASE_REF=HEAD pnpm lint:lanes` exited 1 because the guard
correctly refuses a self-comparison; it is not recorded as a pass.

The origin/main lane failures name only inherited paths: `config/lanes/mon1-l.json`,
`config/lanes/mon1-t.json`, `docs/contracts/meter-small-trip-v1.md`, MON1-L/MON1-T
receipts, the 0208 migration/note, `packages/db/src/meter-small-trip.ts` and the
three meter-trip integration files. No lane guard or inherited path was changed
to hide them. Existing nonfatal Turbo cache IO, Next tracing-root/CSS and
Nest dependency warnings remain unsuppressed.

PostgreSQL lifecycle/trip/regression suites, migration and browser proofs remain
for GitHub CI after the dispatcher pushes. All earlier clock, source integration,
correction, practice, trial, security, commercial and release holds remain.
This is builder evidence only; the single exact-commit independent delta verdict
and separate acceptance remain pending. Logs:
`/private/tmp/jg-mon1-s-run2-*.log`. Intended commit message:
`/private/tmp/jg-msg-mon1-s-catchup.txt`.

## extra round: structural shadow isolation

25 October 2026. Ben explicitly authorized this extra repair before merge of PR
#325, starting at `220a9959474c430dc9b031fd69c0c8a82b42416f` on
`codex/sandbox/mon1-s`. Scope: H-MON1S-SHADOW-PRIV / AGENTS §5.14 / M1S-08.
This is builder evidence, not independent verification or acceptance. No commit,
push, merge, deployment or release was performed.

### Change and permission reasoning

- Chose the dedicated-owner option: invokers called by the existing runtime
  would need broader runtime source grants. Existing `jobguard_meter` and
  runtime privileges are preserved. New `jobguard_meter_owner` has the existing
  restricted-role posture and holder checks, eleven source SELECT grants with
  tenant-only SELECT policies, six lifecycle SELECT/INSERT grants and EXECUTE
  on the pre-existing company-identity bridge. No shadow grant is introduced.
- 0209 leaves all four lifecycle routines migration-owned SECURITY INVOKER;
  runtime cannot use them until the administrative bootstrap atomically assigns
  the dedicated owner and enables SECURITY DEFINER after migrations. Numbered
  SQL does not attempt the previously failing ownership transfer. There is no
  change to the four routines' business logic, snapshots, hashes or held results.
- Reasoned through the actual `creates roles…` path: ensureRoles pre-creates and
  checks the owner; migrations run as jobguard_migration; RESET ROLE restores
  the CREATEROLE admin; finalization uses a pinned connection and a transaction.
  The admin temporarily inherits migration ownership, can SET the target role,
  and grants the target schema CREATE. It transfers each routine, removes schema
  CREATE, restores its own original migration-membership options, and revokes
  its explicit target-role grant. PostgreSQL 16's separately superuser-granted
  ADMIN-only creator membership is preserved, rather than leaving an additional
  self-granted holder behind. Rollback undoes every temporary change on failure.
  Rerun handles already-owned routines. These requirements were checked against
  [PostgreSQL 16 ALTER FUNCTION](https://www.postgresql.org/docs/16/sql-alterfunction.html)
  and [GRANT](https://www.postgresql.org/docs/16/sql-grant.html); this is not an
  executed PostgreSQL result.
- Catalogue regression discovers every mon1_lifecycle routine and checks its
  executing principal against all shadow relations, columns, owned sequences
  and dedicated shadow schemas. The shared app schema necessarily has USAGE;
  that conveys no shadow relation privilege. A rolled-back negative control
  restores the old migration-owner principal and requires the same assertion
  to reject all four routines. Additional rolled-back probes test schema,
  sequence and column grants. **Old-head FAIL / repaired-head PASS on PostgreSQL
  has NOT RUN here**; these controls are ready for the reviewer's embedded run.
- LP-0 now records the owner, exact ACL additions, dedicated authority group,
  role and policy expectations. Its setup invokes the same admin finalizer on
  a pinned connection before taking the catalogue. The lane adds precisely
  `packages/db/test/lp-0-catalog.ts` for that setup change. Existing catalogue
  assertions are retained. Upgrade comparisons preserve every prior ACL entry
  and policy, excluding only the explicitly added owner SELECT entries/policies;
  a separate exact-grant/policy test verifies the entire addition independently.
- Fresh installation, 0208 upgrade and second-database migration tests use the
  admin finalizer; the real non-superuser bootstrap test exercises repeat runs,
  exact ADMIN-only owner holders, removed transfer privileges and refusal of
  an unexpected owner-role holder. All remain PostgreSQL CI proofs, not local
  successes. Forward-fix/rollback guidance and the persistence contract were
  updated. No new operational alert or commercial authority is introduced.

### Commands actually run

All substantive pnpm runs used the already cached pinned 10.28.1 CLI through
`PATH=/private/tmp/jg-mon1-l-bin:$PATH`; Node is 24.17.0. No install was run.
Logs: `/private/tmp/jg-mon1-s-extra-*.log`.

| Check | Result |
| --- | --- |
| DB typecheck with all five package dist directories absent; restore in finally | PASS; exit 0, all five remained absent during the check |
| `pnpm typecheck --concurrency=2 --force` | PASS; 7/7 packages, forced with no cached tasks |
| `pnpm build --concurrency=2` | PASS twice, 7/7 packages; final run includes final administrative cleanup code |
| `pnpm turbo run lint --concurrency=2` | PASS, 7/7 packages |
| `LANE_BASE_REF=8d95874d pnpm lint:lanes` | PASS |
| `LANE_BASE_REF=8d95874d node tools/lint.mjs` | PASS; purity, lane, money and commercial boundary checks |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | FAIL; inherited config/lanes/mon1-l.json and MON1-L receipt are outside this lane; package checks pass separately |
| Core source unit suite, `--maxWorkers=2` | PASS; 129 files / 3,009 tests |
| All 26 DB src unit files plus LP-0 catalogue unit file, `--maxWorkers=2` | FAIL on both runs; 250 pass, unchanged audit-checkpoint-handoff C-OPS-1 source scan exceeds its existing 5-second timeout |
| Audit unit file alone, `--maxWorkers=2` | Same timeout; 70 pass, 1 fail. No assertion or timeout was changed |
| MON1-S repository + LP-0 catalogue units, `--maxWorkers=2` | PASS; 2 files / 35 tests |
| Bootstrap SQL trace, `--maxWorkers=2 -t 'bootstrap SQL trace'` | PASS; 4 mocked tests, 3 real DB tests skipped; not a PostgreSQL bootstrap proof |
| Four lifecycle integration files, `--maxWorkers=2 -t '^$'` | Import/parse check only; 11 tests skipped, no DB proof |
| `pnpm openapi:check` | Blocked: tsx launcher IPC listen EPERM |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS; same OpenAPI comparison without tsx's IPC launcher |
| `git diff --check` | PASS |

Initial default pnpm launchers were interrupted before typecheck/trace execution;
all results above use the cached pinned CLI. The first trace import encountered
stale generated core output; rebuilding dependencies resolved it and the final
four trace tests pass. An initial lane check overlapped the temporary no-dist
renames and saw those temporary paths; after restoring them, the assigned-base
lane and boundary checks pass. No temporary dist directory remains. Existing
nonfatal Turbo cache IO and Next tracing/CSS warnings are not suppressed.

H-MON1S-SHADOW-PRIV is implemented but remains a verification hold until real
PostgreSQL proves the old-principal negative control and repaired catalogue,
fresh/0208-upgrade/second-database paths, real non-superuser bootstrap reruns,
and LP-0 comparison. DB/migration/browser suites were not started in this
no-localhost sandbox. The unchanged audit scan timeout, origin/main inherited
lane differences, exact-commit RED verdict and separate acceptance remain
explicit outstanding evidence. Earlier product, security, commercial and
release holds remain. The builder does not accept its own work.

Size: +411/−73 lines across 13 files; largest touched logic file: 690 lines (packages/db/test/lp-0-catalog.ts); new abstractions: one administrative finalizer, needed to transfer routine ownership outside numbered migrations and roll back temporary permissions.

## 26 October 2026 — B1–B3 in-lane bookkeeping repair (partial)

Continues the existing MON1-S session at `820ef530554b9a80f5ace7559d98070debdd9a4f`,
under the issued C264/C266/C280 scope. Read assigned AGENTS, BUILD_PLAN MON-1,
the persistence contract, current SIMPLICITY_RULE rev 2 and the complete checker
`/Users/benharwood/.local/share/full-steam/jg-runs/v5-mon1-s-claude-A-820ef530-20261025.md`,
including its final repair note. This is a delta repair, not an initial review;
no new LATER / SIMPLICITY finding is issued.

Preflight: registered branch `codex/sandbox/mon1-s`, clean working tree, HEAD and
cached origin branch both `820ef530554b9a80f5ace7559d98070debdd9a4f`; cached
origin/main `319120a35f06a6db9223edc751b941d70f79a18d`. Read-only `git ls-remote`
for both live heads failed because github.com could not resolve. These are cached
identities, not verified current remote heads. Actual Node is 24.17.0; .nvmrc/CI
pin 24.15.0. Used the existing cached pnpm 10.28.1 CLI directly; no install,
runtime change, shared Git metadata write or dispatch of another worker occurred.

Changed facts only:

- B1: added exactly `owner|rel:table|app.subscription_agreement_revision|jobguard_migration`
  in `a-mon1s-lifecycle`. Every other JSON fact is unchanged.
- B2: both upgrade ACL projections use `coalesce(relacl, acldefault('r', relowner))`.
  The exact existing meter-owner exclusion and every other assertion remain.
- B3: SERIOUS-B5 retains migrate-only setup and explicitly expects all four
  lifecycle routines to be migration-owned invokers, with the existing exact
  grantors, executors and pinned search path. It records the six lifecycle-table
  owner INSERT/SELECT ACLs and eight existing tenant policies' third role.
  The eleven source SELECT ACLs/policies and the company-actor EXECUTE addition
  are now part of the exact expected snapshot. Original ACLs are retained plus
  the single owner SELECT entry; subscription/trip tables created after the
  predecessor snapshot use explicit baseline ACLs. Their three source policies
  are captured by the existing subscription/trip collectors and validated with
  the other eight, avoiding duplicate expected rows. Source-policy roles,
  permissiveness, SELECT command, tenant predicate and null WITH CHECK are exact.
  Existing row/hash, FORCE RLS, policy, rejection and full-snapshot comparisons
  remain. Reused the existing ACL conversion and ordered additive helpers;
  no production SQL, bootstrap, role, permission or generic filter was changed.

Actual focused checks (no local PostgreSQL/browser execution):

- TypeScript `transpileModule` syntax diagnostics: PASS for both changed tests.
- JSON parse, unique keys and exact B1 entry/group: PASS. The existing
  `loadReviewedInventory` parser also passes via the installed tsx loader.
- Static baseline comparison: PASS; JSON differs only by B1, B2 differs only by
  the two symmetric default-ACL expressions, and SERIOUS-B5's eleven explicit
  source identities match unchanged 0209 SQL. Retained RLS/snapshot assertions
  and the exact four permitted paths were checked.
- Actual repository runner discovery:
  `pnpm --filter @jobguard/db exec vitest list test/meter-lifecycle-upgrade.integration.test.ts test/serious-b5-upgrade.integration.test.ts --maxWorkers=2`
  passes and discovers all three upgrade cases. Collection/import only; their
  PostgreSQL assertions were NOT RUN. No heavy test, broad Turbo run, timeout
  increase or repeat of an unchanged passing suite was performed.
- `git diff --check`: PASS.

B4 (`job-work-state-upgrade.integration.test.ts`) and B5
(`audit-export.integration.test.ts`) remain HELD for their proper reserved
two-path allowance and are untouched. This four-file phase is deliberately
PARTIAL / MUST NOT INTEGRATE; it does not complete or accept the five-item
candidate. After the authorised B4/B5 continuation, current-main required CI
(including real PostgreSQL upgrades/catalogues and applicable browser proofs)
and independent RED delta review remain required. All product, permission,
real-data, release and independent-acceptance holds remain. No commit, push,
PR, merge or product-acceptance request was made.

Size: +114/−10 lines across 4 files; largest touched logic file: 398 lines (packages/db/test/serious-b5-upgrade.integration.test.ts); new abstractions: none.

## 26 October 2026 — authorised B4/B5 continuation, same MON1-S leaf

Continues saved session `01a173ec-c191-74f0-99bb-c4e49c79a9db`. Verified branch
`codex/sandbox/mon1-s` at issued HEAD `291991ac4b94c3c26c5ee328c46e605be66ad523`.
That commit changes only the lane config, adding exactly the two test paths;
no lane edit was made here. Authority: Ben's 13:08:08.402Z approval,
`msg_01a17853-5052-7d21-a239-17e69beaae05`, and this bounded continuation.
Reread the current simplicity rule, applicable AGENTS §§5.1/5.13/5.14, BUILD_PLAN
MON-1, lane allowance, receipt and the checker's B4/B5 notes. Simplicity rev 2
SHA-256: `6951013f7f7c750002f3096a4e9d1c7a467fabe0a4a6b26972169f2493ffeee6`. C280 RED delta review remains required; this continuation
is not an initial review and adds no LATER / SIMPLICITY observation.

The three B1–B3 source files retain their previously recorded bytes; their
SHA-256 values were checked, without rerunning their passing checks:

- `docs/contracts/lp-0-effective-privileges-v1.json`:
  `8b54d115f26f35d431829581e456aa3351f3c7aef050a5a50ecb82beb5afbd68`
- `packages/db/test/meter-lifecycle-upgrade.integration.test.ts`:
  `b602201a41bd1d511236b0beed2d771b7eb87f300eb02b0afee400dbeee0e9ea`
- `packages/db/test/serious-b5-upgrade.integration.test.ts`:
  `9e5f8b1c9191c2bf4bf22a8240612be7aba570ee1daa77a37c5325cb1a87ddaa`

Changed only these two test files and this appended receipt:

- B4 / CH4-A24 records six complete `meter_lifecycle_source_read` policy rows
  on `final_account_lock`, `job`, `job_activation`, `job_activation_terms`,
  `job_party_binding`, `membership`. Each is PERMISSIVE, SELECT, only
  jobguard_meter_owner, exact tenant predicate, null WITH CHECK. The existing
  comparator accepts these rows only in its post-successor call. Its default
  remains the original policies for the own-migration and widening controls;
  both sides sort by name to avoid host/database collation differences. The
  full old-table filter and every isolation/refusal/data/type assertion remain.
  SHA-256: `38e515d349fceccdaa40d1858d386d343e6e225748c0b39f0bf70599e34dcf90`.
- B5 / MO5-e records exactly ten reviewed difference strings: five SELECT grants
  to jobguard_meter_owner and five named policies on `app.job`,
  `app.job_activation`, `app.job_activation_terms`, `app.job_party_binding`,
  `app.membership`. The existing privilege-fact reader/comparator and its
  negative controls remain unchanged. No prefix filter or generic exemption.
  SHA-256: `06b4445f323e5e3af9c8504247a41950a9823bc309db4a83cdd96ba7a3675aee`.

Actual focused checks, using existing Node 24.17.0 and cached pnpm 10.28.1
(.nvmrc/CI still pin Node 24.15.0; no runtime/dependency change):

- TypeScript transpileModule syntax diagnostics: PASS for both affected files.
- Static synthetic execution of the changed B4 helper: exact six rows pass;
  missing row, extra policy, changed predicate, and the original unapproved
  stage-policy widening control reject. These are synthetic comparator checks,
  not PostgreSQL permission evidence.
- Existing B5 comparator with synthetic facts: exact five SELECT grants and
  five policies produce precisely the ten expected differences; missing source
  and extra UPDATE privilege reject. Comparator source unchanged.
- `pnpm --filter @jobguard/db exec vitest list test/job-work-state-upgrade.integration.test.ts test/audit-export.integration.test.ts --maxWorkers=2`:
  PASS; actual runner imports/collects 12 cases (CH4-A24 plus 11 audit-export
  cases). Discovery only; no PostgreSQL/browser assertions executed.
- B1–B3 source hashes preserved; previous receipt prefix preserved byte-for-byte.
  `git diff --check`: PASS. No broad Turbo, heavy suite, local DB, timeout
  increase, repeated passing B1–B3 suite, or shared Git metadata write.

The earlier B4/B5 path hold is superseded by this exact allowance and source
repair. All five repair items now have source corrections ready for the
dispatcher's scoped checkpoint; this is NOT technical/product acceptance or
integration permission. Exact-current-main required GitHub CI, including real
PostgreSQL/browser assertions, and independent RED delta review of the complete
five-item candidate remain outstanding. Preserve every real-data, privacy,
finance, permission and release gate. No commit, push, PR, main merge or
acceptance was performed by the builder.

Size: +86/−3 lines across 3 files in this continuation; largest touched logic file: 409 lines; new abstractions: none (extended the existing policy comparison helper).

## 26 October 2026 — current-main integration catch-up preflight

Bounded order `MON1-S-CATCHUP-CURRENT-MAIN-20261026`, C264/C266/C280;
this is a delta catch-up, with no new simplicity observation. Source inspection
and deterministic comparisons only; **HOLD for local execution setup, current-main
GitHub CI and independent RED delta verdict**. No compatibility defect has been
demonstrated, so the builder changed only this receipt.

```yaml
session_record_version: 1
task_id: MON1-S-CATCHUP-CURRENT-MAIN-20261026
project: JobGuard
role: builder
thread_id: 01a1788c-21e1-7012-9d6b-a031d6aaa817
surface: codex-cli
host: Ben's Mac
authorised_route_ref: C266; /Users/benharwood/.codex-ben2
repository: ben2harwood-lgtm/jobguard
integration_target: main into codex/sandbox/mon1-s
integration_target_revision: 319120a35f06a6db9223edc751b941d70f79a18d
worktree: /Users/benharwood/Claude/Projects/my-new-project/.worktrees/mon1-s
branch: codex/sandbox/mon1-s
starting_base_revision: d922674470e6a9136823518fd863f5778983dc4f
source_pin: d922674470e6a9136823518fd863f5778983dc4f
candidate_revision: uncommitted merge; input tree d6d61eb1f26082c4df879b4d5864da15e5518a90
last_validated_revision: input tree d6d61eb1f26082c4df879b4d5864da15e5518a90; static only
allowed_files_ref: config/lanes/mon1-s.json; issued compatibility-only restriction
governing_contract_ref: AGENTS.md; BUILD_PLAN.md MON-1; both meter-lifecycle contracts
model_requested: gpt-6.1-sol
effort_requested: medium
model_runtime_confirmed: gpt-6.1-sol
effort_runtime_confirmed: medium
runtime_confirmation_ref: own rollout session_meta and turn_context, 2026-10-26T14:10:12.090Z
last_completed_turn: unknown; first catch-up turn in progress at receipt preparation
last_receipt_ref: this file, authorised B4/B5 continuation
state: prepared merge source-inspected; execution setup held
resumed_from_thread_id: none; distinct materially changed integration phase
successor_reason: new bounded catch-up; source history retained, not reused or replaced
preflight_ref: this section; /private/tmp/mon1-current-main-driver-20261026.sh
result_id: unknown
acknowledgement_ref: unknown
ci_evidence_ref: unknown; current candidate CI required
reviewer: unknown
review_evidence_ref: unknown; independent RED comparison of both parents required
accepting_actor: unknown
acceptance_evidence_ref: unknown
outstanding_holds: execution setup; remote refresh; current-main CI; RED delta review; existing product/release holds
builder_finished_at: unknown at receipt preparation
coordinator_acknowledged_at: unknown
integrated_at: none
merged_revision: none
```

Provenance: original source session `01a173ec-c191-74f0-99bb-c4e49c79a9db`,
completed `2026-10-26T13:29:46.550Z` per issued order; its B1–B5 checkpoint is
`d922674470e6a9136823518fd863f5778983dc4f`. Earlier source/catch-up history stays
in this receipt and Git history. The legacy `mon1-s-catchup` checkout was not
accessed. Original receipt prefix: 63,274 bytes, SHA-256
`f353918f92ad0ec34b6791bdea23b8731f01d626c368548b527872d2518d0eba`.

Read applicable AGENTS, BUILD_PLAN §2/C1–C8, §10.1.4–6/MON-1, both lifecycle
contracts, current build rules, both 25 October handovers, session policy and
simplicity rev 2. Current build-rules SHA-256:
`72fadbf76cf18785182b3e68791216b925159995dba1fee6f295fd54d28a3c28`;
simplicity SHA-256:
`6951013f7f7c750002f3096a4e9d1c7a467fabe0a4a6b26972169f2493ffeee6`.
C280 supersedes old JobGuard caps; no cap/allowance helper was run.

### Prepared input and actual checks

- HEAD is the exact source pin; MERGE_HEAD is exact main above. The existing
  dispatcher driver requires clean source/index and live remote source/main
  equality before its no-ff/no-commit merge. Builder observed the prepared
  merge, not that earlier remote execution. Builder `git ls-remote` failed:
  `Could not resolve host: github.com`; no current remote success is claimed.
- `git diff --cached --quiet d6d61eb1f26082c4df879b4d5864da15e5518a90`:
  exit 0. `git ls-files -u`: empty. Initial unstaged diff: empty. No Git metadata
  writes, staging, commit, push or merge command was executed by this builder.
- Python/Git blob comparisons: PASS. Every existing allowlisted source path
  equals the source parent and pinned merge tree. All 72 incoming staged paths
  equal the main parent byte-for-byte. Both shared barrels, package manifests,
  lockfile and runtime pin equal the source parent. The two historical 0207
  allowlist paths do not exist at the source pin; no file was invented for them.
- All B1–B5 hashes match the preceding receipt exactly (in order):
  `8b54d115f26f35d431829581e456aa3351f3c7aef050a5a50ecb82beb5afbd68`,
  `b602201a41bd1d511236b0beed2d771b7eb87f300eb02b0afee400dbeee0e9ea`,
  `9e5f8b1c9191c2bf4bf22a8240612be7aba570ee1daa77a37c5325cb1a87ddaa`,
  `38e515d349fceccdaa40d1858d386d343e6e225748c0b39f0bf70599e34dcf90`,
  `06b4445f323e5e3af9c8504247a41950a9823bc309db4a83cdd96ba7a3675aee`.
- Inspected lifecycle source/repository, their callers and tests, architecture
  guard, ownership finalizer references and incoming executable delta. Main's
  diary schema retains its UTF-16 length bound; CH-2 retains its authoritative
  completion wait/assertion. New main core modules remain as merged. No changed
  input to lifecycle code, its shared exports, SQL, grants or bootstrap needs a
  manual resolution. Byte preservation is not behavioral execution evidence.
- `git diff --cached --check`: FAIL (exit 2), inherited whitespace in the
  main-parent MON-3C-CAL build/lint/typecheck/unit logs. Those bytes were confirmed
  identical to main and left untouched outside this lane. Initial unstaged
  `git diff --check`: PASS. Do not describe the full prepared diff as whitespace-clean.

### Exact execution needs and dispatcher handoff

Installed package metadata confirms TypeScript 5.8.3, Zod 4.6.6, Vitest 4.1.12
and cached pnpm 10.28.1. `.nvmrc` pins Node 24.15.0; available
`/usr/local/bin/node --version` reports 24.17.0. No alternative/global runtime,
install, version change or package-manager fallback was attempted. TypeScript
syntax/typecheck/build/test commands were NOT RUN on this new candidate: the
order requires the pinned runtime. `ps` is denied (`operation not permitted`),
so current process/load/memory/heavy-slot clearance cannot be verified here.
The existing heavy-slot helper requires successful process observation; it was
read, not launched into its waiting loop. No local PostgreSQL/browser assertion
or broad/repeated B1–B5 suite was run.

Admission files observed: this order's
`claim-91343-9b8905931ba64ca5885fe6286a4b9bbc` and disjoint
`WORKFLOW-RULES-ENFORCEMENT-20261026` claim
`claim-90776-e99d0f6ebb774393a2d059e5db1938a3`. No claim was edited and no worker
was launched. Actual owner reconciliation/capacity clearance remains the sole
coordinator's responsibility; these files alone are not a fresh clearance.

Normal dispatcher must refresh live heads, provide the configured runtime and
fresh resource observations, then arrange the focused changed-input checks
once under the existing gate. Preserve both parents and this input tree when
recording the receipt-only merge candidate; its final tree will differ by this
append. Dispatcher owns scoped merge commit and feature push. Current-main
GitHub CI must prove PostgreSQL/browser guarantees, and one independent RED
delta verdict must compare both parents on the exact committed candidate.
Earlier CI/verdict/acceptance is not carried forward as PASS. All existing
source/security/commercial/real-data/release holds remain. No new migrations,
alerts, product changes or complexity were introduced; no acceptance is claimed.

### Dispatcher execution setup resolved — 2026-10-26T14:22:18.175726+00:00

Existing pinned runtime `/private/tmp/jg-ci-enterprise-node-v24.15.0-darwin-arm64/bin/node` verified Node24.15.0; pnpm10.28.1. No installation, dependency or version change. The existing heavy-slot helper successfully observed processes/resources and admitted the single targeted check job. Core and DB package `typecheck` and `build` each PASS (four actual commands), with no local PostgreSQL/browser assertion and no unchanged B1–B5 suite repeated. Execution log SHA256 `bfbe4106bc1a0524975bc5ba0f7d8dc3109282bcef35b3722e14158206a9fc29`, private evidence `/private/tmp/mon1-current-main-focused-checks-20261026.log`. Prepared index still exactly d6d61eb1f26082c4df879b4d5864da15e5518a90 before staging this receipt. Inherited main-parent log whitespace is preserved as recorded above. Normal feature merge checkpoint/push follows; required current-main CI and actual independent RED delta review remain open. This dispatcher is not an accepting actor.
## 26 October 2026 — PR189 current-main union continuation

Same saved Gmail builder session `01a1788c-21e1-7012-9d6b-a031d6aaa817`,
bounded leaf `MON1-S-CATCHUP-CURRENT-MAIN-20261026`. Authority: checker ACK
`mon1-s-8b6961dd-needs-catchup`, ACKS.tsv, `2026-10-26T14:53:22Z`, and issued
two-path continuation. C280 remains in force; no round-cap request or new
simplicity observation. Retained applicable readings; refreshed current rules,
simplicity, applicable AGENTS/MON-1 sections, both parent versions of the test,
its snapshot/catalogue fixture and relevant ownership-finalizer context.
AGENTS and BUILD_PLAN identities remain the previously recorded hashes.

Dispatcher-prepared parents: source/HEAD
`8b6961dd77ee341e3d41f16ab5301ab72a1211da`, incoming/MERGE_HEAD
`a6778b4ae923ec15ba39377ee0c4ca2006f31040`. Merge base is
`319120a35f06a6db9223edc751b941d70f79a18d`. Exactly one unmerged index path:
`packages/db/test/contractor-entitlement-upgrade.integration.test.ts`; stages
1/2/3 are `40948f8db2eeefd2bbe24a245412c052ce7e50bf`,
`aedec136457aa4056727a63ce6b28a846464ebe2`,
`453282837c98760c1823882fb82233930e13fc65`. Builder did not stage or alter this
index; the dispatcher must mark the worktree resolution resolved. No final
merge tree/commit exists yet, and live remote equality was not reverified here.

Resolved only that file: retain main's six named Final Check tables and exact
snapshot assertions after each of the two migration calls; add all eight
feature lifecycle tables. Retain feature's five exact routine identity rows,
including the small-trip routine, in schema/name/identity-arguments order.
Both parents' full predecessor snapshot, least-privilege assertions and
row/grant/shape negative controls survive unchanged. No exclusions, expected
error codes, fingerprints, SQL, grants, roles, bootstrap or migrations changed.

Actual checks (synthetic source/import checks, not PostgreSQL evidence):

- PASS: exact full-file reconstruction from main plus source's eight table
  rows and ordered routine query/rows equals the resolved file byte-for-byte.
  No conflict markers remain in that file. All bytes outside the additive
  union and explanatory successor comment equal the corresponding parent.
- PASS: all nonblank feature-added lines versus merge base survive in each
  B1–B5 file; the initially missing-base-file diagnostic was handled as an
  absent predecessor file, then all five comparisons completed successfully.
  Those files were not edited by the builder. B1 and B3 also retain main's
  automatically merged additions, so their full hashes have legitimately changed.
- PASS: TypeScript 5.8.3 `transpileModule` syntax diagnostics for this one test,
  using installed pinned Node `v24.15.0` from
  `/private/tmp/jg-ci-enterprise-node-v24.15.0-darwin-arm64/bin`.
- PASS: same pinned Node with cached pnpm 10.28.1,
  `--filter @jobguard/db exec vitest list test/contractor-entitlement-upgrade.integration.test.ts --maxWorkers=2`:
  six cases discovered, exit 0. Discovery/import only; no hooks or PostgreSQL
  assertions executed. `git diff --check -- <resolved test>` passes.
- Process observation `/bin/ps -axo pid=` remains denied. Heavy execution
  clearance is unavailable; no heavy helper loop or test run was launched.
  No core/DB build/typecheck or unchanged B1–B5 suite was repeated; no install.

SHA-256 of the conflicted test's parent bytes and resolved candidate:

- Source: `025dd895b89502a50e14a18d76b1ed048636ebab14c070e5e9355dd070dd3c00`.
- Main: `f35c317122b47ae06808b55a2f12198b34bbaed3192d8fcab23a9b58f5d912d2`.
- Resolved: `863bc3b3c16ce21e7af3943fba282a907aba55d89f29cef1b792b9344c58afa4`.

Current B1–B5 hashes, respectively:
`6557582af03e724f8063ee57cd5febe989c9691a492c0809b8e0c8b1063f33e1`,
`b602201a41bd1d511236b0beed2d771b7eb87f300eb02b0afee400dbeee0e9ea`,
`a833705aba377f0fe05bd383a86dc39760561eabf7bdbb6ec20acbd4cf16bbbf`,
`38e515d349fceccdaa40d1858d386d343e6e225748c0b39f0bf70599e34dcf90`,
`06b4445f323e5e3af9c8504247a41950a9823bc309db4a83cdd96ba7a3675aee`.

Current managed coding claim is `claim-24322-57122a9c7b4a43b4bfbaed8925c01a0f`;
its child boundary records this exact leaf/cwd/saved session, prompt hash
`ff7d5f7c065aae7f8c6067cd894001e1797827eae27acab8ae30982b559fc39f`,
and current rules/simplicity hashes `72fadbf76cf18785182b3e68791216b925159995dba1fee6f295fd54d28a3c28` /
`6951013f7f7c750002f3096a4e9d1c7a467fabe0a4a6b26972169f2493ffeee6`.
No worker, reviewer or driver was launched here. Coordinator retains global
capacity/owner reconciliation. Only the authorised test and this receipt were
edited. Original receipt bytes are preserved; prior length 71,982 and SHA-256
`a6dc637f652740d46f420d12290c05d0fa73f9acdbd7d965d4dc653bb048a55e`.

Return resolved source for dispatcher staging, scoped two-parent commit and
feature push, current-main GitHub CI and independent conflict-delta recheck.
Required PostgreSQL/browser assertions remain CI-only. This is not acceptance
or integration permission; all existing product/security/real-data/release
holds remain. No Git metadata write, commit, push, main merge or release.
