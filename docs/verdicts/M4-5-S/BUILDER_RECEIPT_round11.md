# M4-5-S builder receipt — round 11

8 October 2026. PR #106, branch `codex/sandbox/m4-5-s-r2`. Starting HEAD: `1928fe3e8912f9584edbbd07bd7d4cb3deee572d`, clean working tree. Read AGENTS.md, BUILD_PLAN.md §10.4 M4-5-S, the authentication/tenant contracts, the merged-head message and `640658c` before changing code.

## Cause and repair

**Keyboard failure: source evidence, not a local browser reproduction.** M4-1-S calls `.focus()` on the first Open button immediately after finding the captured workspace, without waiting for the register read. `idle` is false during that read and the native-disabled button cannot take focus. The Tab assertion can consequently target an inactive button. Compared with main `df1f9c1`, M4-5-S's `load()` starts an additional supplier-documents GET **before** starting the register GET. That adds competing work in the initial-load window. Its contribution to the reported CI timing is an inference; the precise failed-browser event ordering could not be reproduced in this sandbox. The existing delivery answer only writes picker state; pack ticks only reload RecoveryMessages. Source inspection found no post-settlement register reload caused by either.

In `recovery-cases.tsx`, separate the optional delivery lookup from `load()` and its dependencies. An independent effect starts it only when the register is `ready`. The lookup captures the job's world, drops stale-job answers, and writes only deliveries and the selected delivery. It cannot change register status, busy, selection, errors or focus. The register's initial read no longer competes with this extra request. Native disabling, command tickets, stale-answer ordering, unknown-outcome handling and M4-1-S-R behavior remain intact.

An intermediate aria-disabled/loading-handler approach failed three existing M4-1-S-R unit assertions and was discarded. No existing assertion was edited. The final full web suite passes, including those tests. Three new unit cases exercise the actual independent lookup effect in loading, failed and ready states, and verify that successful completion writes only picker state.

**Preview race.** Kept the two waits added by `640658c`: the two-context approval journey waits for the saved-preview status before opening the second context; the isolation journey waits before reading `latest.revision`. RecoveryMessages adopts the server's saved response before rendering that status, so these waits synchronize with persistence. Both use the existing `V` helper and default expect timeout. Kept the URL assertion's auto-wait. Inspected the other message read-after-click paths: they already await saved status/fields, a response, or an enabled control whose presence depends on the saved answer. No other equivalent unguarded preview read was found.

Kept `640658c`'s held-delivery/focus regression and strengthened it to assert exactly one register GET after delivery completion and after the evidence-pack tick. Its existing mutation/focus observations and positive command control remain unchanged. `apps/web/e2e/M4-1-S.spec.ts` is untouched. No earlier assertions, timeouts, retry settings or configuration were changed.

## TENANT-STAMP-1

Converted all five specified hand-built contexts in the three recovery-message test files to `testTenantContext(tenantId)`. Every database assertion is unchanged. The repository service-double tests **do reach the real `withTenant`** before accessing their mock pools; the stamped context is required there, not merely cosmetic. Their 9 tests pass. The deliberate `{} as VerifiedTenantContext` negative test is unchanged: the stamp refuses it first, with the same existing `A verified tenant context` message, so no expected-error edit is needed. Real PostgreSQL integration/upgrade execution is deferred to CI.

## Commands and results

Node `24.17.0`, cached pnpm `10.28.1`, Vitest `4.1.11`. Dependencies were already installed; no install or dependency edit. The default global pnpm launcher attempted a version switch and failed on unavailable registry verification (exit 1; remaining initial launcher runs interrupted, exit 130). Subsequent pnpm commands used a temporary PATH wrapper around the already-cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. No package download was needed for those checks. Logs are `/private/tmp/jg-round11-*.log`.

`df -h /`: 191 GiB available before checks; 170 GiB at the final heavy-run check, above the required 40 GB threshold. Load averages during checks were approximately 54–112.

| Command | Exit | Result |
|---|---:|---|
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` | 0 | 21 files, 448 tests passed; final implementation |
| `pnpm --filter @jobguard/web exec vitest run app/ui/recovery-messages.test.tsx --maxWorkers=1 -t 'round 11'` | 0 | 3 new cases passed; focused selection only, full suite above includes every assertion |
| `pnpm --filter @jobguard/db exec vitest run test/recovery-message-repository.test.ts` | 0 | 9 tests passed; service doubles, not real PostgreSQL proof |
| `node --test tools/*.test.mjs` | 0 | 42 tests passed |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Passed before and after writing this receipt, against main `3a06a02` |
| `pnpm openapi:check` | 1 | tsx CLI cannot bind its IPC socket: `listen EPERM` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same checker through the Node import path; no OpenAPI drift |
| `CI=1 pnpm --filter @jobguard/web exec playwright test M4-1-S.spec.ts M4-5-S.spec.ts --project=mobile-360 --project=desktop --repeat-each=5 --list` | 0 | 150 cases discovered; **discovery only**, no browser execution |
| `pnpm --filter @jobguard/web test` on the discarded approach | 1 | 445 passed, 3 earlier behavior assertions failed; final fix preserves them |
| `pnpm --filter @jobguard/web test -- --maxWorkers=1` | 1 | Redundant run interrupted by the builder; worker pipe reported EPIPE. Corrected serial `exec vitest` run above passed all 448 tests |
| `pnpm --filter @jobguard/api --filter @jobguard/core --filter @jobguard/ai --filter @jobguard/storage test` | 1 | Core: 3371 passed, 13 existing test timeouts; storage 4/4 passed; recursive command stopped at core |
| `pnpm typecheck` | 0 | 7/7 tasks passed twice, including the final tree |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 tasks plus core, lane, money and commercial boundary checks passed |
| `pnpm build` | 0 | 7/7 tasks, production web compilation/type checking and 16/16 static pages passed; 23m36s wall time; existing multiple-lockfile/CSS warnings |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1` | 1 | 3373 passed, 11 existing 5-second timeouts; no timeout changed; 18m36s wall time |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` | 1 | 725 passed, 4 failed: three unchanged 5-second timeouts (watchdog registry, recovery-message Next read/list, practice quote-delivery transport); health test and an unhandled `listen EPERM` from Supertest |
| `pnpm --filter @jobguard/ai test` | 0 | 72 fixture tests passed; no live model evaluation |

## Limits and handoff

The dispatcher explicitly states this sandbox cannot bind localhost or start PostgreSQL and `.git` is read-only. Consequently neither the required production browser repeat-runs on this head nor the comparison on main `df1f9c1` was executed. No standalone database/browser/server process was started; the API health test attempted a socket bind and the sandbox refused it. Run the exact discovery command above **without `--list`**, after `pnpm build`, in CI; then run the PostgreSQL integration/upgrade and mandatory full suites. Discovery and mock tests are not browser/database verification. The unawaited initial focus path also exists on main; eliminating all possible timing races before the first read would require a separately authorized change to its test or readiness boundary. This patch removes this lane's added initial competing request and protects the requested post-settlement behavior; it does not claim a browser-proven CI repair.

`git diff --check` passed (exit 0). A direct byte comparison against `git show 1928fe3:packages/db/migrations/0099_recovery_messages.sql` passed (exit 0). Migration `0099_recovery_messages.sql` retains its number and bytes: SHA-256 `355cb30bbe6c9ec95b2dce43df678120ac19d39254303a9e90ea57c2755a4e15`, identical to starting HEAD. No schema/backfill/rollback change, external action, live data, provider call, commercial-policy change, new alert or release approval. Tenant trust and existing authorization/idempotency invariants are preserved. BUILD_PLAN.md and the lane registry are untouched this round.

No commit, push, checkout, reset, deletion, merge, independent model verdict or technical acceptance was performed. The dispatcher must commit the working tree using `/private/tmp/jg-msg-m4-5-s-fresh.txt`; its message ends with the requested Sonnet co-author trailer. **New commit SHA: pending dispatcher commit.** Exact-head independent review, separate acceptance and CI remain required.
