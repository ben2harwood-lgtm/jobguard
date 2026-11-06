# ENT-3 accessibility check — builder receipt

Router ruling: 4 November 2026. RED solely for the test supply chain. Branch `codex/sandbox/ent-3-axe`, created from fetched `origin/main` at `56b74eaec205e86c9eaf7eee75d85ade2599a364`. No PR, merge, deployment or real-data release. These are builder-executed checks, not independent RED review; review before merge remains separate.

**Result:** accessibility and supply-chain checks passed. The final production browser run passed 18/18 journeys, with 62 axe scans and zero violations at any severity. Full repository test coverage is not claimed: the initial parallel root run timed out, and the subsequent broad database runs were interrupted after a setup failure. Isolated unchanged reruns passed; details follow.

## Changes and browser findings

- Exact web **dev dependency** `@axe-core/playwright@4.14.0`, published `2026-10-15T13:33:17.706Z`, more than two weeks before 4 November. The lockfile adds only the wrapper and `axe-core@4.14.0` engine, retaining integrity hashes and the existing Playwright version. Node 24 satisfies its Node >=22.12 requirement.
- The existing ENT-3 Playwright spec dynamically imports axe inside its check function. Full-page scans use the default rules with **no exclusions, disabled rules or tag filtering**. Each attaches a complete JSON report and fails on serious or critical violations. No third-party exclusion was necessary.
- All seven requested areas are covered at **360×800 and 1280×800**: operative visit, SoR results, new and within-order order checks, each work status/proceed comparison, dictation listening/review/use/unavailable, unanswered/answered/retry/completed close-out, and supervisor question entry/list/recorded states. Evidence confirmation and submission failure/success states are also scanned.
- Axe exempts disabled controls from contrast. A separate browser check measures computed foreground/background colours, alpha composition and ancestor opacity, requiring at least **4.5:1** and no opacity fade for visible disabled buttons in main. The pre-fix production run failed at both widths: disabled **Complete visit = 1.991241414619311:1**. One local CSS rule in `northside.module.css` gives disabled buttons `#4c5751` on `#e1ece6`, with opacity 1. Measured minimum after the fix: **6.217237406974463:1**. The global `.primary:disabled` rule and its opacity were not changed; shared-style overlap with #556 is limited to this one local rule.
- The scans also found a moderate `region` violation on the shared sandbox notice. A named section now contains the existing notice, preserving its `role="note"`, accessible name, text and CSS. The spec explicitly asserts the existing notice contract. No exception was added for it.
- Existing retry body equality, exact command identity, API payloads, refused targets, privacy checks, four-tap limit, 44 px touch assertions and overflow checks remain. The injected speech fixture now stays listening until Stop is clicked, adding coverage of that screen without dropping its existing privacy/retry assertions.
- No production application import references the scanner. The production bundle/trace inspection is recorded below. All browser API fixtures and database bootstrap data are fictional/synthetic. Browser fixture responses are mocked; this is a real Chromium UI/axe run, not proof of database authority or live speech-provider behaviour.
- The lane file lists every changed non-lane path exactly; it does not grant/list itself or any other lane file.

## Reproducible environment

Node `v24.19.0`; repository-pinned pnpm `10.28.1`; system Chromium `154.0.8037.57` (Debian). The preinstalled `pnpm` was 11.25.0, so it was not used to mutate the lockfile.

Commands below run from `/workspace/jobguard`. The local pinned wrapper used for checks is exactly:

```sh
mkdir -p work/bin
cat > work/bin/pnpm <<'SH'
#!/bin/sh
export COREPACK_HOME=/workspace/jobguard/work/corepack
exec corepack pnpm "$@"
SH
chmod +x work/bin/pnpm
export PATH=/workspace/jobguard/work/bin:$PATH
```

Playwright's pinned Chromium download was denied by the environment's domain policy. The uncommitted `work/playwright-local.config.ts` changes only local paths and the executable; no assertion, timeout, project width or production server setup is weakened:

```ts
import config from "../apps/web/playwright.config";
export default {
  ...config,
  testDir: "/workspace/jobguard/apps/web/e2e",
  globalSetup: "/workspace/jobguard/apps/web/e2e/global-setup.ts",
  outputDir: "/workspace/jobguard/work/browser-results",
  webServer: { ...config.webServer, cwd: "/workspace/jobguard/apps/web" },
  use: { ...config.use, launchOptions: { executablePath: "/usr/bin/chromium" } },
};
```

`CI=1` selects the existing production `next start` command and disables server reuse. The existing embedded PostgreSQL bootstrap and synthetic worker run normally. The worker's SIGTERM message at teardown is expected; browser exit status determines the result.

## Commands actually run and results

| Exact command (with the pinned wrapper PATH above for checks) | Result |
| --- | --- |
| `git fetch origin main` | Passed with network-capable execution; fetched main from `ce5d5465` to `56b74eae`. Initial sandbox attempt failed because its proxy socket was unavailable. |
| `git switch -c codex/sandbox/ent-3-axe origin/main` | Passed; new branch from fetched main. |
| `COREPACK_HOME=/workspace/jobguard/work/corepack corepack pnpm --version` | `10.28.1`. |
| `pnpm view @axe-core/playwright time --json` | Registry evidence for the 15 October stable release. This metadata-only lookup used the preinstalled pnpm before the pinned wrapper was prepared. |
| `COREPACK_HOME=/workspace/jobguard/work/corepack corepack pnpm --filter @jobguard/web add --save-dev --save-exact @axe-core/playwright@4.14.0` | Initial attempt refused the different store location; no lockfile mutation. |
| `COREPACK_HOME=/workspace/jobguard/work/corepack corepack pnpm --store-dir /workspace/.pnpm-store --filter @jobguard/web add --save-dev --save-exact @axe-core/playwright@4.14.0` | Passed. Only 20 lockfile lines added. Existing peer warnings and ignored-script warnings were retained; no build-script allowlist change. |
| `pnpm install --frozen-lockfile --offline --store-dir /workspace/.pnpm-store` | Passed. |
| `node tools/dependency-audit.mjs` | Exit 0; complete registry scan of all dependency scopes, **zero known vulnerabilities**. No audit exceptions or registry-error bypass. |
| `pnpm exec turbo run build --filter=@jobguard/api...` | Exit 0; 6/6 tasks passed, providing the compiled API prerequisites needed on this checkout. |
| `pnpm typecheck` | Exit 0; 7/7 tasks passed. Repeated on the final code: exit 0, 7/7 passed. |
| `pnpm lint` | Initial sandbox Git-subprocess access failed; next attempt correctly refused the self-comparison before the first commit. After a real commit range and removal of generated dev-only files: exit 0, all repository boundary lints and 7/7 package lints passed. Final full rerun after both fixes: exit 0, 7/7 tasks passed (8.691 seconds); lane and all boundary lints passed. |
| `pnpm test` | Tools phase **423/423 passed**. Parallel package phase failed on the unchanged `packages/core/src/pay-now-synthetic.test.ts` 5-second timeout while checking 201,000 amounts; 4,659 other core tests passed. Turbo then stopped other package tasks. No timeout, test or assertion was changed. |
| `pnpm --filter @jobguard/core exec vitest run src/pay-now-synthetic.test.ts` | Exit 0; **4/4 passed**, same 5-second budget, 1.17 seconds test time after competing work stopped. |
| `pnpm exec turbo run test --concurrency=1` | Partial run, deliberately stopped (SIGTERM) when replacing the long database portion with four CI shards. Core: 210 files / 4,660 tests passed. The database SERIOUS-B5 upgrade test also passed (105.098 seconds). This was not a complete package-suite pass. |
| `pnpm build` | Exit 0; 7/7 passed before fixes; repeated after the colour fix (7/7) and after the landmark fix (7/7). Final build took 23.333 seconds, 6 prerequisite cache hits. |
| `pnpm test:e2e --project=mobile-360 --project=desktop ENT-3.spec.ts` | Initial sandbox server could not start. A network-capable retry exposed missing compiled API prerequisites; those were built above. No browser accessibility claim from these attempts. |
| `pnpm test:e2e --project=mobile-360 --project=desktop --workers=2 ENT-3.spec.ts` | Browser launch failed because pinned browser binaries were absent; 18 launch failures, no scans. |
| `pnpm --filter @jobguard/web exec playwright install chromium` | Failed: browser CDN domains returned HTTP 403 `Domain forbidden`. Used installed Chromium instead. |
| `pnpm --filter @jobguard/web exec playwright test --config=../../work/playwright-local.config.ts --project=mobile-360 --project=desktop --workers=2 ENT-3.spec.ts` | Dev-mode attempt had blocked HMR and remained in loading state; stopped and replaced with production-mode execution. No accessibility pass claimed. |
| `CI=1 pnpm --filter @jobguard/web exec playwright test --config=../../work/playwright-local.config.ts --project=mobile-360 --project=desktop --workers=2 ENT-3.spec.ts --grep 'visit completion'` | Pre-fix production baseline: **2 failures**, one at each width, disabled Complete visit contrast 1.99:1. Axe also reported the moderate sandbox-notice `region` issue; no serious/critical violation in these two scans. |
| `CI=1 PLAYWRIGHT_JSON_OUTPUT_FILE=/workspace/jobguard/work/browser-report.json pnpm --filter @jobguard/web exec playwright test --config=../../work/playwright-local.config.ts --project=mobile-360 --project=desktop --workers=2 --reporter=list,json,html ENT-3.spec.ts` | After colour fix: exit 0, **18/18 journeys passed**, **62 axe scans**, **122 disabled-colour measurements**, minimum 6.22:1; no serious/critical violations. Moderate `region` remained and was then fixed in the layout. Final rerun after both fixes: exit 0, **18/18 passed**, 0 skipped/flaky/unexpected; **62 scans, zero violations at any severity**, 122 disabled-colour measurements, minimum 6.217237406974463:1. Final run duration 80.418 seconds. |
| `python work/check-scanner-bundle.py` | Exit 0 before the layout-only change: checked 2,051 application source, production JavaScript and Next trace files; zero `@axe-core`, `axe-core`, `AxeBuilder` or `axe.run(` references. Repeated on the final build: exit 0, again 2,051 files checked and zero scanner references. |
| `pnpm --filter @jobguard/db test --shard=1/4` | Interrupted with SIGTERM (exit 143); not a completed run or pass. |
| `pnpm --filter @jobguard/db test --shard=2/4` | Interrupted with SIGTERM (exit 143); not a completed run or pass. |
| `pnpm --filter @jobguard/db test --shard=3/4` | Reported `recovery-case-terms.integration.test.ts` with a failed setup and 47 tests not run (10.232 seconds); then interrupted (exit 143). No test was edited or marked skipped. |
| `pnpm --filter @jobguard/db test --shard=4/4` | Interrupted with SIGTERM (exit 143); not a completed run or pass. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-case-terms.integration.test.ts` | Exit 0; **47/47 passed** unchanged on isolated rerun (25.09 seconds total). This does not establish a complete database-suite pass. |
| `pnpm exec turbo run test --concurrency=1 --filter='!@jobguard/db'` | Exit 0; **12/12 tasks passed** (10 cache hits). **11,027 tests passed**: core 4,660; API 3,985; web 1,654; config 344; AI 276; storage 108. Storage retains 2 existing skipped tests. 601 files passed / 2 existing storage files skipped. This does not include the full database suite. |
| `python work/summarize-axe.py` | Exit 0; final raw JSON confirms 18 expected / 0 unexpected / 0 flaky / 0 skipped, 62 scans, no violation rules, 122 disabled measurements, minimum contrast 6.217237406974463:1. |
| `git diff --check` | Passed. |

The final receipt and raw browser summary cover the same production code that was tested. No migration, money, authorization, tenant policy, production scanner route or provider behaviour changed. Independent RED review and any outstanding full-repository CI remain separate before merge. No PR is opened by this work.

## batch-45 integration — 5 November 2026

Built ahead NOPR, RED for the test supply chain. Comparison base is the cached
`origin/main` at `b52b8d857` (also the starting HEAD); local `main` is stale at
`694e9e175`. No fetch, git write, commit, push, PR, database, browser or live-provider
operation was performed in this sandbox.

The sole conflict was the disabled-button CSS. The resolved working file preserves
main's latest rule byte-for-byte, including its border, opacity 1 and not-allowed
cursor. Its foreground `#46544c` on background `#e7ece9` has calculated contrast
6.674218195015282:1. This is a static colour calculation, not a new rendered-browser
measurement. The original receipt's 6.217 result describes the earlier branch run.
The named sandbox section, scanner assertions, retry/privacy assertions and exact
scanner dependency pins are retained. No migration, table, command, route, service,
client import or server module was added by this batch, so the migration and
command-authority compatibility repairs in the brief are inapplicable.

Removed the incoming piece lane and added `config/lanes/batch-45.json`, listing
exactly the five changed non-lane paths against cached current main and excluding
itself. The resolved CSS is identical to main and therefore is not in that list.
The index remains unmerged/read-only; the launcher must stage the working files,
including the removed piece lane, before completing the merge.

Local checks actually executed, with at most two Vitest workers and at most three
named files per run:

- The installed pnpm wrapper stalled during `pnpm --version` and was interrupted.
  No packages were installed. Used the existing local runner binaries directly.
- Executed the existing `tsc -p tsconfig.json --noEmit` typecheck script sequentially
  in packages/config, core, storage, ai, db and apps/api, web: all seven passed.
- Initial API and proof-loader runs could not collect tests because workspace
  `dist` entrypoints did not exist. Compiled the existing packages/config, core,
  storage, ai and db with their existing `tsc -p tsconfig.json` build scripts; all
  passed. No test, alias, boundary or assertion was changed to make collection work.
- From apps/api: `./node_modules/.bin/vitest run --maxWorkers=2 src/watchdog-registry.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts`:
  3 files, 278 tests passed after prerequisite compilation.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=2 test/migration-proof-loader.test.ts`:
  1 file, 76 tests passed after prerequisite compilation; no database was started.
- From apps/web: `./node_modules/.bin/vitest run --maxWorkers=2 app/site/extra/site-visit.test.tsx`:
  1 file, 3 tests passed.
- `node tools/agent-lane-boundary-lint.mjs` was executed; it refused
  `Missing branch or self-comparison range` because starting HEAD equals cached
  origin/main and the merge is not committed. This is not claimed as a lane PASS.
  A supplemental working-tree check using this tool's exported loadLanePolicy,
  selectLane and lanePathAllowed passed exact non-lane coverage, the batch branch,
  self-exclusion, absence of the piece lane, CSS equality to main and absence of
  conflict markers in the changed files. Re-run the full lint after commit.
- `git diff origin/main --check`: passed.

CI must prove the committed lane boundary, required full checks/build, and ENT-3
browser/axe journeys at phone and desktop widths against the integrated main CSS
and layout. Required database/upgrade checks run only in CI. The historical
browser and audit results above are not reruns on this batch. An independent RED
review at the exact eventual head remains required before merge. READY for the
launcher to stage/complete this NOPR branch; not a merge or release acceptance.

## batch-45 landing refresh — 5 November 2026, 21:14 order

The launcher completed the main merge before this session: HEAD
`d4b5a77b4`, cached `origin/main` `d16ef1978`; the initial working tree was
clean and no index conflicts remained. This supersedes the earlier integration
section's unmerged-index status. No git-writing command was run in this session.
No application or test behaviour needed further changes.

Inspected every non-lane diff against main. Main's latest disabled-button CSS is
byte-identical, including its border, cursor and opacity; main's recent-item
browser journeys remain intact. The sandbox notice keeps its text, role and name.
The dunning test still asserts exactly four invoice regions, now within main so
the added sandbox landmark is excluded. The dependency diff adds only the pinned
axe wrapper/engine and their lockfile records. There are no database, migration,
routine, exact-table-list or command-catalog changes to reconcile.

The lane has exactly all six non-lane changed paths, without listing itself.
`node tools/agent-lane-boundary-lint.mjs` passed against the current merged HEAD.
A separate deterministic check passed exact path equality, branch registration,
conflict-marker absence and main CSS equality. `git diff origin/main --check`
passed. These are builder checks, not an independent RED review.

Local checks used installed binaries, without downloading packages:

- In apps/web, `./node_modules/.bin/tsc -p tsconfig.json --noEmit`: passed.
- In apps/web, `./node_modules/.bin/playwright test --list ENT-3.spec.ts m4-16-workbench.spec.mts --workers=2`:
  passed; 24 tests collected across the two widths. This lists tests only; it
  does not execute browser journeys, start a server or prove accessibility.
- In apps/web, `./node_modules/.bin/vitest run --maxWorkers=2 app/site/extra/site-visit.test.tsx 'app/api/contractor/jobs/[id]/site-visits/[visitId]/complete/route.test.ts' 'app/api/contractor/jobs/[id]/site-extras/sor/route.test.ts'`:
  UI file passed all 3 tests; the two route files initially failed collection
  because the compiled `@jobguard/api/workspace` entrypoint was absent.
- In apps/api, `./node_modules/.bin/tsc -p tsconfig.json`: passed, building
  the existing API prerequisite without changing configuration or tests.
- Re-ran only the two route files from apps/web with
  `./node_modules/.bin/vitest run --maxWorkers=2 'app/api/contractor/jobs/[id]/site-visits/[visitId]/complete/route.test.ts' 'app/api/contractor/jobs/[id]/site-extras/sor/route.test.ts'`:
  both files passed, 92 tests. Combined with the UI file, 95 relevant tests passed.

READY for router commit/push and the group's PR turn. Full required CI,
PostgreSQL/browser execution and independent RED review at the eventual head
remain outstanding. No new browser pass, merge acceptance or release is claimed.

## batch-45 landing refresh — 6 November 2026, 00:59 order

The launcher already completed the main merge: starting HEAD
`c7bcf8874cbc4a2ac273225b93b6523d06900995`, cached `origin/main`
`f5415ddb4c3a40796dd812e8b5946ba5094daa2b`. The working tree was clean;
there were no unresolved index entries. No git-writing commands were run.

Inspected the complete remaining diff against cached main and plan §9.2 ENT-3.
Both sides' behaviour is retained without further source changes. Main's
`app/northside/northside.module.css` is byte-identical. Main's recent-item
journeys and existing assertions remain; the invoice-region assertion keeps its
exact count of four inside main, excluding the sandbox landmark. The sandbox
notice retains its text, role and name. No migrations, SQL routines, command
catalogs or exact database lists differ from main, so no SQL regeneration or
renumbering is necessary. The lane lists exactly all six changed non-lane paths,
and does not list itself. Only this existing receipt needed an update.

Checks actually run with installed binaries (no package downloads):

- Repository: `node tools/agent-lane-boundary-lint.mjs` — passed.
- Repository: `git diff origin/main --check` — passed.
- apps/web: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — passed.
- apps/web: `./node_modules/.bin/vitest run --maxWorkers=2 app/site/extra/site-visit.test.tsx 'app/api/contractor/jobs/[id]/site-visits/[visitId]/complete/route.test.ts' 'app/api/contractor/jobs/[id]/site-extras/sor/route.test.ts'`
  — 3 files, 95 tests passed.
- apps/web: `./node_modules/.bin/playwright test --list ENT-3.spec.ts m4-16-workbench.spec.mts --workers=2`
  — 24 cases collected across phone and desktop; collection only, no browser run.
- A deterministic Python check confirmed exact lane equality, branch registration,
  conflict-marker absence, main CSS equality and preservation of main's browser
  assertions (with the invoice-region scope adjustment described above). Its
  first invocation used an incorrect CSS path and failed before that comparison;
  after locating the existing file, the corrected invocation passed.

READY for router commit/push and the group's PR turn. Required CI, actual
PostgreSQL/browser execution and independent RED review at the eventual head
remain outstanding. No new behaviour, weakened tests, deployment or release.
