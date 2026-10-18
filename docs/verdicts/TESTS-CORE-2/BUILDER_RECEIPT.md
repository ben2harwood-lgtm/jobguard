Built by Claude Sonnet (Codex stand-in), dispatcher 14

# TESTS-CORE-2 builder receipt

## Changed (all new files; no existing file edited)
- config/lanes/tests-core-2.json (exactly as the order gives it)
- packages/core/src/customer-billing.history-boundaries.test.ts (CM1, 7 tests)
- packages/core/src/allocation.refusals.test.ts (CM2, 7 tests)
- packages/core/src/money.negative-limits.test.ts (CM3, 6 tests; asserts MoneyError code "overflow", and "magnitude_exceeded" for direct money())
- docs/ledger/TESTS-CORE-2.md, this receipt

## Commands run
- `vitest run --maxWorkers=2` on the three files: 3 files, 20 tests passed on unchanged source.
- Scratch mutations (each reverted from backup; `git status` shows no source change):
  - removed `||reversed.pence>received.pence` in customer-billing.ts: 2 intended failures (reversal exceeding received; reversal with nothing received).
  - removed duplicate-ID check in allocation.ts: 2 intended failures (duplicate IDs).
  - removed `pence < -limit ||` in money.ts: 3 intended failures (bigint conversion, subtract, add overflow).
- `turbo run typecheck --force --concurrency=2`: 7/7 successful.
- `LANE_BASE_REF=origin/main turbo run lint --force --concurrency=2`: 7/7 successful.
- `pnpm build --force --concurrency=2`: 7/7 successful.
- `git diff --check`: clean.

## NOT RUN
Full test suite, DB/migration/browser suites, commit-dependent lane check (CI). `/private/tmp/jg-test-tests-core-2/` and `/private/tmp/jg-msg-tests-core-2.txt` were not produced.
Two-model RED check (Opus, Sol-high) not done by the builder.

## Codex verification follow-up — 18 October 2026

This section records a new run; the earlier builder's account above is preserved as historical evidence, not attributed to this session.

### Baseline and scope

- Started clean on `codex/sandbox/tests-core-2`, HEAD `6c9aa2ebf9c441df7fc91b3093250fc062517344` (the existing TESTS-CORE-2 implementation), parent `1bcd8db8`. The checkout was not a fresh main-only baseline. Local `origin/main` resolves to `b881f90be0a6d368838ca4392338147ef819bd3a`.
- Read AGENTS.md, BUILD_PLAN.md §§5.4–5.5, the three domain helpers and their original and boundary tests, and audit proposals 4/5/7 at the issued local audit path. The named `checks/J6-jobguard-next-orders-night4-check.md` was absent; no new pre-build verdict is claimed.
- The existing lane JSON matches the issued JSON. The three boundary files already contain 7 CM1, 7 CM2 and 6 CM3 tests. No tests or expectations were edited. Only this receipt and the ledger are changed in the worktree.
- Disk gate: `df -g /System/Volumes/Data` reported 62 GB available before and during checks (floor 33 GB).
- Existing installed dependencies reused; no install or download. Installed Node `v24.17.0`; `.nvmrc` pins `24.15.0`. Therefore this is not evidence of a clean install on the exact pinned Node release.
- The default standalone `pnpm --version` hung (a bounded repeat timed out after 15 seconds; the original process was interrupted). Cached Corepack pnpm reports `10.28.1`. Checks use `PATH=/usr/local/lib/node_modules/corepack/shims:$PATH`, `COREPACK_ENABLE_NETWORK=0`, and `LANE_BASE_REF=origin/main`. No runner checks are disabled.
- Affected invariants: exact bounded integer money and typed overflow (AGENTS §5.5; BUILD_PLAN §5.4), penny conservation, and retained reversal history (§5.5). No tax/fee policy, recovery allocator, S26/S27, permissions, schema, pins, migration, grant, standard F, compatibility behavior, or operational alerts change.

### Mutation evidence — executed in separate scratch copies first

Command: `python3 /private/tmp/jg-test-tests-core-2/verify-mutations.py`. The retained script copies only the three helpers and three test files into distinct temporary directories, links installed dependencies, and runs pinned Vitest with `--maxWorkers=2`, JSON reports and an explicit scratch root. It does not mutate or restore repository source.

| Scratch case | Single mutation | Observed result |
| --- | --- | --- |
| reversal-history | Remove `||reversed.pence>received.pence` | Exit 1; 18 pass, 2 fail: over-reversal by one penny; reversal without receipts |
| duplicate-id | Remove the duplicate-ID condition only | Exit 1; 18 pass, 2 fail: duplicate IDs with positive money and with zero money |
| bigint-lower-bound | Remove `pence < -limit ||` | Exit 1; 17 pass, 3 fail: bigint conversion, subtraction, addition expect `overflow` but receive `magnitude_exceeded` |
| control | None | Exit 0; all 20 pass |

These are intended assertion failures, not discovery, import or infrastructure failures. The script asserts the expected failure counts, total count and process exit codes. Raw case reports, source copies and logs are retained in `/private/tmp/jg-test-tests-core-2/`; `mutation-results.json` lists the exact failed test names. `environment.json` and `source-sha256.json` record source hashes. The lane file and all three boundary tests were byte-compared to HEAD; protected helpers and their original tests have no diff from the issued base.

### Independent model response

Reviewer: delegated `gpt-6-sol`, high reasoning, task `/root/sol_high_review`. Exact implementation commit reviewed: `6c9aa2ebf9c441df7fc91b3093250fc062517344`. The following is the recorded response, also retained in `/private/tmp/jg-test-tests-core-2/sol-high-verdict.md`:

> **Sol-high RED source verdict for `6c9aa2ebf9c441df7fc91b3093250fc062517344`: no blocking findings in the requested test-only scope.**
>
> The three new test files cover CM1 penny conservation and excessive credit or reversal refusal, CM2 invalid allocation inputs and the valid zero-without-targets case, and CM3 the negative limit with typed overflow on conversion and subtraction. The commit changes no product code or existing test expectations.
>
> This is a source-inspected verdict, not technical acceptance. I did not execute tests. I inspected scratch results reporting 20/20 targeted tests passing and isolated mutations causing the intended failures. The full required checks and the separate Opus verdict remain outstanding.

This response predates the remaining check results below and does not review the new receipt/ledger append. Opus is not an available model in this session; no substitute is represented as an Opus verdict. The dispatcher must obtain required RED verdicts bound to the final commit and separate acceptance. Decision 74: PARK.

### Current run results

Execution harness retained at `/private/tmp/jg-test-tests-core-2/run-checks.py`; exact commands and exit statuses are in `checks.json`, with one log per command. Unless stated otherwise, commands use the environment described above and were executed in this worktree.

| Command | Result |
| --- | --- |
| `git rev-parse HEAD`; `git status --short`; `df -g /System/Volumes/Data` | Baseline recorded above; initially clean; disk floor met |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/customer-billing.history-boundaries.test.ts src/allocation.refusals.test.ts src/money.negative-limits.test.ts` | PASS: 3 files, 20 tests |
| `pnpm exec turbo run typecheck --force --concurrency=2` | PASS: 7/7 tasks |
| `pnpm exec turbo run lint --force --concurrency=2` | PASS: 7/7 tasks |
| `node tools/lint.mjs` | PASS: root purity, lane, money and commercial boundary checks |
| `pnpm lint:lanes` | PASS: local mode, `LANE_BASE_REF=origin/main`; all six original task paths in lane |
| `pnpm build --force --concurrency=2` | PASS: 7/7 tasks |
| `pnpm openapi:check` | BLOCKED (exit 1): tsx IPC listener denied by sandbox, `listen EPERM .../tsx-501/23904.pipe`; validation never ran |
| `git diff --check` | PASS |

Turbo emitted `IO error: Operation not permitted` warnings while completing all required tasks successfully. Next emitted dynamic-dependency warnings through `load-esm`/NestJS; compilation and build succeeded. No warning was suppressed. The OpenAPI runner was not bypassed or modified, and the sandbox was not escalated.

Full tests, database/migration suites, browser/e2e suites, and CI commit-dependent lane checks: NOT RUN locally, as instructed. No clean dependency reinstall; no database images, browser downloads or localhost services started. Local lane checking above is distinct from the deferred CI check. OpenAPI must run successfully in a permitted CI environment. All earlier CI checks remain enforced.

### Handoff

- Scratch output: `/private/tmp/jg-test-tests-core-2/` (scripts, copied mutation/control sources, JSON results, logs and source/environment manifests; retained without cleanup).
- Intended subject and body: `/private/tmp/jg-msg-tests-core-2.txt`, subject `test(money): cover history allocation and negative boundaries`.
- This session made no Git writes, commits, pushes, merges, deletions, product/policy changes, posting or deployment. Only the receipt and ledger append remain uncommitted for the dispatcher.
- Final disk check: 62 GB available. No additional migration, rollback or forward-fix action is applicable to this test-only task.
- Status: PARK / RED incomplete. Sol-high source verdict is recorded against the existing implementation commit; Opus and verdicts bound to the dispatcher's final commit remain required, followed by separate acceptance. No merge, enablement or deployment without Ben's button.
