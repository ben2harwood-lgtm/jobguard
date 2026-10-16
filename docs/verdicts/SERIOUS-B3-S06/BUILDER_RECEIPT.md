# SERIOUS-B3-S06 — builder receipt

Issued by dispatcher 14 on 16 October 2026; coordinator ruling 67 under 51. Branch `codex/sandbox/serious-b3-s06`, starting HEAD `49e7e2c6832020c40b44e2040d9bf5ceebea4e7d`, stacked on `origin/codex/sandbox/serious-b3` (PR #231, S07–S11; not yet merged). This receipt covers only the S06 follow-on diff. Builder evidence, not independent review or acceptance. No commit or push performed.

## Change and authorised expectation boundary

Read repository AGENTS.md, BUILD_PLAN §5.2–5.4 and the existing SERIOUS-B3 ledger/receipt. The evaluator now passes the original parsed quantity, validated integer rate and exact discount ratio to the existing `calculateNetLine` helper. That helper multiplies bigint rational factors before one half-even rounding and validates the public Money result. Display subtotal retains its existing half-even line rounding; displayed discount is subtotal minus rounded net through checked `subtractMoney`. VAT retains the existing separate candidate tax policy.

For `2.5 × 12333p × 95/100`, exact net is `29290.875p`, rounded net `29291p`, displayed subtotal `30832p`, displayed discount `1541p`, VAT `5858p`, total `35149p`.

Only existing test lines authorised by ruling 67 changed:

| File and original line | Exact substitutions |
| --- | --- |
| `packages/core/src/quote.test.ts:4` | discount `1542→1541`, net `29290→29291`, total `35148→35149` |
| `packages/db/test/quote.integration.test.ts:6` | line/document net `29290→29291`, discount `1542→1541`, document/acceptance/approval total `35148→35149`, stored `accepted_total_pence` expectation `"35148"→"35149"` |
| `packages/db/test/quote.integration.test.ts:22` | line/document net `29290→29291`, discount `1542→1541`, total `35148→35149` |

Read-only comparison with HEAD verified that each changed line equals exactly those literal replacements, with all other lines preserved. No other existing test expectation was edited. `docs/fixtures/quote-pricing-v1.json` remains untouched under the explicitly limited ruling; it retains historical values and is not consumed by these executed quote tests.

Copied the dispatcher's reproduction from `../lp0-fix-1/docs/verdicts/SERIOUS-B3/S06.repro.test.ts` into the normal core suite at `packages/core/src/quote-rounding.test.ts`, changing only its import path and archival comment. Its original test body is preserved. Before the product change it failed with actual `29290`, expected `29291`; after the change it passed. Added seven cases for half-even ties in both directions, six-place quantities, fractional discounts, no discount and full discount.

## Data and compatibility

No migration or data backfill is needed: this changes the calculation for newly evaluated/saved revisions, without a schema change or rewriting stored immutable quote revisions, issued documents, acceptances or audit history. Existing accepted snapshots are not rewritten by this patch. A persisted draft retains its stored totals until a new revision is saved; the existing document consistency checks remain in force. No provider, grant, authorization, tenant/RLS, worker, prompt/model or operational alert is added. Shared quote evaluator/test changes serialize with the parent SERIOUS-B3 work through the dispatcher. This patch is not production activation or approval of the candidate VAT policy.

## Execution evidence

Supplied dependencies only; no install/download. Node `v24.17.0`, cached pnpm `10.28.1`, Vitest `4.1.11`. pnpm commands use:

```sh
PATH="/private/tmp/jg-migfix-2-bin:$PATH" COREPACK_ENABLE_NETWORK=0 npm_config_manage_package_manager_versions=false
```

The existing shim selects the already cached pnpm. No Git write command was run against this worktree. Tooling tests use their own disposable Git fixture repositories. Initial bare `pnpm --version` stalled and was interrupted; no dependency installation command was issued.

Logs are `/private/tmp/jg-serious-b3-s06-*.log`.

| Command | Actual result |
| --- | --- |
| `pnpm --filter @jobguard/core exec vitest run src/quote-rounding.test.ts --maxWorkers=1` before fix | Vitest exit 1; expected `29291`, received `29290`. See `red.log`. |
| `pnpm --filter @jobguard/core exec vitest run src/quote.test.ts src/quote-rounding.test.ts src/quantity.test.ts --maxWorkers=1` | Exit 0 initially (7 tests) and after added boundaries (14 tests/3 files, `quote-final.log`). |
| `pnpm typecheck` | Exit 0; all 7 tasks successful, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1; core purity passes, lane registration failure blocks subsequent lint stages. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1; branch has zero matching registered lanes. |
| `node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs && pnpm exec turbo run lint` | Exit 0; remaining boundary checks and all 7 package lint tasks pass, 2 cached. Does not turn full lint into a pass. |
| `node --test tools/*.test.mjs` | Exit 0; 100/100 tooling tests. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 1; core 98 files pass, one file fails: 2,681 tests pass, one times out at 5,000ms (`receipt-allocation.test.ts:212`). Later package commands did not run in this invocation. No assertion changed. |
| `pnpm --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; config 1/1, storage 1/2, AI 6 files/85 tests. Synthetic fixture evidence only. |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'test/**' --maxWorkers=1` | Exit 1; 14 files/123 tests pass; `src/audit-checkpoint-handoff.test.ts:279` times out at 5,000ms. No PostgreSQL. No assertion changed. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 40 files/867 tests. No browser. |
| `pnpm openapi:check` | Exit 1; sandbox EPERM on tsx CLI IPC listener. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | First exit 1 before DB build artifacts existed; rerun after dependency build exit 0, same source generator/snapshot check without CLI IPC listener. |
| Inline TypeScript `createProgram` for `packages/db/test/quote.integration.test.ts`, repository compiler options with `noEmit:true` and repository-root `rootDir` | Exit 0; zero diagnostics. Does not execute PostgreSQL. |
| Read-only Python comparison of existing tests against HEAD and copied reproduction body | Exit 0; only authorised line/literal replacements, reproduction test body preserved with local import path. |
| `git diff --check` | Exit 0. |
| `pnpm build` | Exit 0; all 7 tasks successful, 2 cached; full production Next build completed. Existing workspace-root, webpack/CSS and unavailable shared-cache warnings appeared. |
| API source subset below | Exit 0; 82 files/1,657 tests. Listener/database tests excluded only on this command line; repository tests/configuration unchanged. |
| `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts --maxWorkers=1` after build finished | Exit 0; all 34 tests, unchanged default timeout and assertions. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` final rerun | Exit 0; 99 files/2,682 tests. No test or timeout changes between the initial timeout and rerun. |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'test/**' --maxWorkers=1` final rerun | Exit 0; 15 files/124 tests. No test or timeout changes; no PostgreSQL. |

API source subset uses the same nine sandbox exclusions documented in the parent receipt:

```sh
pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 \
  --exclude src/auth/sso/action-paths.test.ts \
  --exclude src/contractor/contractor-practice-session.http.test.ts \
  --exclude src/contractor/site-extra-pricing.http.test.ts \
  --exclude src/contractor/site-extra.http.test.ts \
  --exclude src/contractor/site-visit.http.test.ts \
  --exclude src/contractor/practice-worker-switch.http.test.ts \
  --exclude src/health.test.ts \
  --exclude src/shadow-isolation.application.test.ts \
  --exclude src/final-account-lock.isolation.test.ts
```

The initial core/source-DB failures were timeout errors during concurrent checks, not changed business expectations. Both full source-suite reruns passed after the build/other checks finished, without changing their timeouts or assertions. No additional expectation change was needed under the ruling.

## Remaining gates

Full `pnpm test`, PostgreSQL `pnpm test:db`/`pnpm test:migrations`, HTTP listener tests and browser `pnpm test:e2e` are NOT RUN here: dispatcher explicitly states this sandbox cannot bind localhost or start PostgreSQL. They remain required in GitHub CI after dispatcher-owned commit/push. No clean-install, PostgreSQL, browser, live-provider, independent-model or technical-acceptance pass is claimed. No AI change requires a live-model evaluation.

The branch is not registered in the supplied lane configuration. Both requested full lint and lane lint currently fail on that fact. Lane configuration is left untouched; this is a recorded dispatcher integration hold, not a waived check. Parent PR merge/dependency order, CI, exact-commit independent verdict, separate acceptance and founder-owned merge/release remain outstanding.

Intended conventional commit message: `/private/tmp/jg-msg-serious-b3-s06.txt`.
