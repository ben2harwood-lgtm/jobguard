# TEST-STAB-2 builder run receipt

Date: 2026-10-04. Branch: `codex/sandbox/test-stab-2`.
Inspected baseline: `b71702099e42f9af48a44b95dd4ac7382e5294cb` (HEAD and origin/main).
Delivery is an uncommitted working-tree diff; the dispatcher owns the commit and push. No repository Git writes, push, merge or PR were performed.

## Change and reason

Read AGENTS.md revision 3.0 and BUILD_PLAN.md §2.4, including C6 and C8. The first change registered the requested exact branch, spec and allowed paths in `config/agent-lane-assignments.json`.

In `apps/web/e2e/UIWIRE-1.spec.ts`, the tests “a human omitted line persists without inheriting a rate” and “split and merge retain explicit review lineage” now wait for `Review saved. Your source and choices will be here after reload.` immediately after clicking Save review and before reloading. This uses the sibling tests' existing assertion. Source inspection confirms that this notice is set only after a successful review response is parsed. Waiting prevents reload from aborting the save POST before its completion.

All original persistence and lineage assertions remain intact. No product code, timeout, retry, skip configuration, API/schema, money policy, provider, migration or dependency changed. No release gates changed. The lane registry is the sole shared-file overlap; this task owned only its new entry, with integration serialized by the dispatcher.

## Environment and executed checks

Node `v24.17.0`; installed dependencies were reused without an install. The default pnpm launcher attempted version/signature verification against an unavailable registry and exited 1. Subsequent checks used already cached pinned pnpm `10.28.1`, through a temporary launcher outside the repository. No packages were installed; its incidental untracked `.pnpm-store` artifact was removed.

For the commands below, `PATH=/private/tmp/jg-test-stab-2-bin:$PATH` selects that cached launcher. Command logs are in `/private/tmp/jg-test-stab-2-*.log`.

| Command | Exit | Evidence |
| --- | --- | --- |
| `pnpm typecheck` | 0 | Seven tasks passed; six cache hits. |
| `pnpm turbo run typecheck --force` | 0 | All seven tasks freshly executed. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed; lane check rejected self-comparison because HEAD equals origin/main. Later lint stages did not execute in this command. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same fail-closed self-comparison rejection. Policy was not weakened. |
| `pnpm turbo run lint --force` | 0 | All seven package lint tasks freshly executed. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Passed. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Passed. |
| `pnpm build --force` | 0 | All seven production build tasks freshly executed, including Next. |
| `pnpm openapi:check` | 1 | tsx CLI could not bind its IPC pipe: `EPERM`, syscall `listen`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | The same committed OpenAPI comparison passed without the CLI IPC listener. |
| `pnpm turbo run test --filter=@jobguard/core --filter=@jobguard/config --filter=@jobguard/ai --filter=@jobguard/storage --filter=@jobguard/web --force` | 0 | 573 tests passed: core 432, config 2, AI 72, storage 4, web 63. AI results are synthetic fixture evaluation only. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` (initial, before DB build finished) | 1 | Nine suites could not resolve the not-yet-built `@jobguard/db` entry; five suites/61 tests passed. |
| Same API unit command after production build completed | 0 | Fourteen files, 107 tests passed. The health HTTP test requires a prohibited localhost listener and was not executed. |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts test/verify-evidence-pack-cli.test.ts` | 0 | Two non-PostgreSQL files, seven tests passed. |
| `node --test` with all six `tools/*.test.mjs` files except `tools/agent-lane-boundary.test.mjs` | 0 | Sixteen tests passed. The lane test file creates/commits temporary Git repositories; omitted to respect the no-Git-writes instruction. |
| `pnpm --filter @jobguard/web exec playwright test --list --project=mobile-360 --project=desktop UIWIRE-1.spec.ts` | 0 | All twelve cases discovered; discovery is not browser execution. |
| Read-only Node diff/lane inspection | 0 | Verified spec equals baseline with exactly the two requested wait insertions, and changed paths match the registered lane. This is a limited deterministic check, not a full lane check or independent verdict. |
| `git diff --check` | 0 | No whitespace errors. |

Available test execution passed 703 tests in total. Environment-limited commands above are recorded as failures or unexecuted checks, not passes.

## Remaining evidence and gates

The sandbox cannot bind localhost or start PostgreSQL. Consequently root `pnpm test` (which includes database suites), `pnpm test:db`, `pnpm test:migrations`, the API health HTTP test, and browser execution were not run. No migration exists in this diff. No timeouts, retries or skips were added to accommodate the environment.

GitHub CI must run the full mandatory suites after the dispatcher commits and pushes, including:

```sh
LANE_BASE_REF=origin/main pnpm lint
pnpm lint:lanes
pnpm test
pnpm test:db
pnpm test:migrations
pnpm openapi:check
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop UIWIRE-1.spec.ts
```

No Playwright trace or screenshot was produced because browser execution was unavailable. Independent Claude review bound to the dispatcher's exact commit and separate technical acceptance remain pending under AGENTS.md §5.13 / C8. This receipt is builder evidence, not an independent verdict or acceptance.

Intended conventional commit message: `/private/tmp/jg-msg-test-stab-2.txt`.
