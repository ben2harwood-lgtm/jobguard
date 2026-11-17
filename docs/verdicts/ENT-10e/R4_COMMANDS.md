# ENT-10e r4 command journal — 13 October 2026

Builder evidence only. Existing HEAD 749e693364e00f23f0026aa4c677b773e9c5400f; in-progress dispatcher merge of e4cb8437d044746300c377647f6061d06cd960cc. Git reads only. No package installation/download command issued, pin change or database/browser startup.

Every substantive pnpm invocation used `PATH=/private/tmp/jg-ent10e-bin:$PATH`. The pre-existing shim executes cached Node pnpm 10.28.1 at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. Node v24.17.0; package pins unchanged. The ordinary global `pnpm --version` diagnostic stalled; interrupted with Ctrl-C, exit 130. Logs are retained under `/private/tmp/jg-ent10e-r4-*.log`.

| Command (after the PATH prefix above where applicable) | Exit | Actual result |
| --- | --- | --- |
| `pnpm build --concurrency=2 --force` | 0 | Seven tasks successful; zero cached. Full Next production build included. Existing workspace-root/CSS warnings and sandbox cache IO warnings retained. |
| `pnpm typecheck --force` | 0 | Seven tasks successful; zero cached. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 1 | Core purity passed (156 source files); lane stage rejected 52 inherited main paths, before Turbo package lint. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same 52 paths. Read-only git-show comparison proves each is byte-identical to origin/main, staged by the unfinished merge. No policy bypass/widening. |
| `pnpm exec turbo run lint --force --concurrency=2` | 0 | Seven package lint tasks successful; zero cached. This does not turn failed root lint into a pass. |
| `pnpm exec tsc -p /private/tmp/jg-ent10e-tests-tsconfig.json` | 0 | Compiles the five ENT-10e database test files and their imports, including new E10 cases; no database executes. Pre-existing temporary config from r3, no repository config change. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Money arithmetic boundary passed. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Real boundary scanner completed. |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | tsx CLI IPC listener refused with EPERM before the generator ran. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` | 0 | Same repository generator ran without tsx CLI IPC and regenerated the snapshot. No handwritten OpenAPI edits. |
| `pnpm openapi:check` (sandboxed) | 1 | Same tsx CLI IPC EPERM. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same generator's exact serialized snapshot comparison passed. |
| `pnpm openapi:check` (require_escalated, narrow tsx IPC permission) | 0 | Automatic approval review authorized this check; the exact existing root/package scripts passed, no script/pin change. This permission did not run database or browser suites. |
| `pnpm exec turbo run test --filter=@jobguard/core --filter=@jobguard/config --filter=@jobguard/ai --filter=@jobguard/storage --concurrency=2 --force` | 1 | Config: 2 tests passed; storage: 4 passed (source and emitted duplicates). Core: 4826 passed, 4 failed: two default five-second receipt-allocation timeouts (source/emitted) and two emitted tests looking for .ts files in dist (recovery-allocation/site-extra-pricing). Turbo stopped before AI. All original failures retained; no tests/config altered. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | 0 | 80 source files, 2415 tests passed; no emitted duplicates, no timeout/expectation change. |
| `pnpm --filter @jobguard/ai exec vitest run src --maxWorkers=1` | 0 | Five files, 80 fixture tests passed; no live provider/model evaluation. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | 0 | 33 files, 784 tests passed. Browser/e2e excluded by the existing config; not browser evidence. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --exclude='src/health.test.ts' --exclude='src/shadow-isolation.application.test.ts' --exclude='src/auth/sso/action-paths.test.ts' --exclude='src/contractor/*.http.test.ts'` | 1 | 64 files passed; 1563 tests passed, 1 skipped. One existing final-account-lock.isolation.test.ts suite embeds a database fixture despite its source-unit filename: freePort failed before PostgreSQL startup. Explicit HTTP exclusions are local-run scope only; mandatory CI checks unchanged. |
| `pnpm --filter @jobguard/db exec vitest run test --maxWorkers=2 --exclude='**/*.integration.test.ts' --exclude='test/free-port.test.ts'` | 1 | 13 files passed, 2 failed; 236 tests passed, 2 failed: source and emitted C-OPS-1 reachability tests exceeded their unchanged five-second timeout. Positional test also matched src/dist .test files; no PostgreSQL ran. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --exclude='dist/**' --exclude='**/*.integration.test.ts' --exclude='test/free-port.test.ts'` | 1 | Source-only selection: 10 files passed, 1 failed; 152 passed, 1 failed. Same C-OPS-1 timeout (about 13 seconds). No expectation/time budget changed or failure concealed. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | 0 | 19 tests passed. Lane-tool fixture tests not run: they issue git writes, prohibited for this round. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/auth/sso/sso-emergency-owner.test.ts src/auth/sso/sso-required-unlinked.test.ts src/auth/sso/sso-emergency.test.ts src/auth/sso/sso-required-disclosure.test.ts src/auth/sso/sso-required.test.ts src/auth/sso/sso-required-paths.test.ts src/auth/context-boundary.test.ts` | 0 | Seven files, 216 tests passed. |
| `git diff --check` | 0 | Whitespace only, not an implementation/acceptance claim. |

The focused SSO command covers new owner/unlinked units, emergency/disclosure units and unchanged required/path/context regressions. Existing database tests, new E10 concurrency cases, RLS/catalogue/upgrade proofs and browser regression remain NOT RUN: dispatcher GitHub CI is required. Full pnpm test is not claimed.

Read-only inspections: AGENTS.md, applicable BUILD_PLAN contracts/card, current SSO contract, both exact-commit independent verdicts, membership/permission routines, migration 0143 and both conflict files, existing emergency/window tests, generator/manifests, and prior receipts. Git status/rev-parse/show/diff checked the dispatcher merge and scope. Python comparisons prove main MIGRATIONS.md retained as an exact prefix plus only the own 0143 section; runner equals main plus only the ordered 0143 entry; both protected emergency tests and 0129 are byte-identical to HEAD; all 52 lane-rejected files are byte-identical to main. Own window-test diff adds 49 lines and removes zero. No current test expectation weakened or pinned value edited.

The receipt and intended commit message are working-tree/non-repository outputs for dispatcher staging/commit. No commit/add/checkout/fetch/merge/rebase/push was run. Unmerged index entries persist intentionally until dispatcher staging. No fresh independent verdict or technical acceptance is claimed.
