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
