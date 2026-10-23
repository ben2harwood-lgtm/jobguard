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

Adds only the issued source/repository/unit file, four PostgreSQL files, contract, 0207 SQL/note, own lane and this receipt. Existing supplied-input classes, 0184 history, grants on existing tables, catalogue tests, source consumers, subscription integration and shared exports remain untouched.

0207 adds normal-company scope, immutable source/source-reference/computation rows, held day cache, reserved place/correction storage, deduplicated alerts, isolated NOLOGIN/NOINHERIT/NOBYPASSRLS meter role, three checked entrypoints and private identity-only bridge. Every new business table is migration-owned, tenant-qualified and FORCE RLS. Runtime receives no table privileges. Authority runs before lock 184, after it, and before replay/lookup. Capture/rebuild require current owner; owner/admin can read. Shared practice is refused structurally. Caller provides no counts, sources, price, policy, actor, tenant or trial selector.

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
- `meter-lifecycle-upgrade.integration.test.ts`: populated predecessor bytes/types/ACL/policies, own 0207 after 0206, successors twice and comparator control. Fresh migration is exercised by the other suites' fixture setup.

CI must run these four files, existing meter persistence/rebuild/upgrade tests and subscription persistence/statements/replay regressions with the packet's single-worker PostgreSQL commands. Actual migration execution is unverified here.

## Coordinator catalogue rows and grants to add later

No shared catalogue file was edited. Add exact real PostgreSQL records for:

1. Business tables `app.meter_lifecycle_scope`, `app.meter_lifecycle_source`, `app.meter_lifecycle_source_ref`, `app.meter_lifecycle_computation`, `app.meter_lifecycle_day_ledger`, `app.meter_lifecycle_place_binding`, `app.meter_lifecycle_correction`, `app.meter_lifecycle_alert`: migration ownership, FORCE RLS, policies, composite PK/FKs, immutable triggers, no runtime table privileges. Scope kind only `normal_company`; shared-practice tenant CHECK.
2. Role `jobguard_meter`: NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEROLE, NOCREATEDB, NOREPLICATION, NOBYPASSRLS; no memberships in either direction; app USAGE only; no role assumption; SELECT/INSERT on scope/source/ref/computation/day/alert and SELECT-only reserved place/correction tables; no UPDATE/DELETE/TRUNCATE.
3. `app.mon1_lifecycle_capture(uuid,text,uuid,date,integer)`, `app.mon1_lifecycle_rebuild(uuid,text,uuid)`, `app.mon1_lifecycle_read(uuid,text,uuid)`: meter ownership, SECURITY DEFINER, fixed `pg_catalog` search path, runtime EXECUTE only, PUBLIC denied.
4. `app.mon1_lifecycle_actor(uuid,text,boolean)`: migration ownership, fixed search path, SECURITY DEFINER, meter EXECUTE only; runtime/PUBLIC denied. Traverse existing `mon1_company_actor` → session/SSO identity authority as an explicit reviewed identity exception. It returns only current actor; no source/calculator bridge runs as migration owner.
5. Future narrow SELECT grants/policies on `subscription_agreement_revision`, `job`, `job_activation`, `job_activation_terms`, `job_party_binding`, `job_work_state_event`, `final_account_lock`, `job_small_trip_event`, `job_small_trip_observation`, `job_link`. They are **not installed by 0207**. Install only after effective/transitive privilege review and source-writer lock reconciliation. No UPDATE, shadow, fee, finding, infrastructure or provider grant is required. Test-only grants in the source suite are not product grants.
6. Verify the complete actual privilege/call graph, hidden/no-hidden output/hash/query equivalence, malformed context and pooled reuse, current-session/membership races after waits/on replay, own N/fresh/successor proofs, and unchanged 0184/subscription catalogues. Do not invent fingerprints in advance.

## STOPs / holds / acceptance mapping

- **STOP source-grants:** capture is intentionally unavailable with 0207 alone because shared source grants are outside this issue. Coordinator integration is required. No fixture fallback exists. M1S-01 positive source-kernel evidence is written with test-only prerequisites; execution and full actual-command journey held.
- **STOP public-export:** required L symbols exist but shared public exports do not; compiled monorepo seam works after core build. Public export integration held.
- **STOP check environment:** pnpm pinned launcher blocked; root lane check against main fails on the issued inherited stack. No scanner/lane weakening or allowance expansion to inherited paths.
- **H-PRACTICE:** not cleared; zero session-scoped schema/authority. Normal rejection tests written; A/B practice/adoption/session expiry claims held (M1S-07).
- **H-TRIAL/MON-3C:** authoritative trial projection absent. No trial or annual enablement (M1S-09).
- **H-METER-CLOCK/H-CH4/H-CORRECTIONS:** current L emits held counts. Exact priced corrections, previous-correction chain, negative/closed-receiver rules and closed-day regrouping acceptance remain held (M1S-05/06), no invented financial policy.
- **H-INTEGRATION:** source writers/plan changes must all take tenant lock 184 before business locks. Existing consumer wiring, subscription adapter, audit/receipt composition, full source journey and closed issued-statement evidence belong to coordinator. This leaf does not assert all existing writers serialize correctly.
- **H-CI:** M1S-01/03/04/08/10 PostgreSQL, race and migration claims are source-inspected/typechecked, not test-executed. Local unit tests cover strict inputs, held projections, source bindings, typed refusals/rollback, microseconds, trip seam and preserved fixture model; they are not isolation proof.
- **H-REVIEW:** no exact-commit Claude A/B verdict, separate acceptance, required CI or merge exists. Builder does not accept this work. Dependencies remain unreviewed/unmerged as issued.

No new provider route, prompt/model, external action, secret or production operational alert path. The durable internal `METER_CACHE_MISMATCH` alert needs coordinator monitoring wiring. No data rewrite/backfill; rollback/forward-fix guidance is in the 0207 note. Adjacent work is recorded here because BUILD_PLAN/shared files are outside the private allowlist.
