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
