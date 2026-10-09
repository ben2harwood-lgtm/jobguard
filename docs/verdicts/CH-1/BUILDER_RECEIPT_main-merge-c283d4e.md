# CH-1 builder receipt — main merge at c283d4e, 9 Oct 2026

Builder: Claude Sonnet 5.5 (local worktree `.worktrees/ch-1`, branch `codex/sandbox/ch-1`).
Start head `01b24f9` (= origin, PR #123). Merge commit `3d9edc1` (parents `01b24f9`, `c283d4e`); this receipt is the commit after it. Merge base of the branch with origin/main is now `c283d4e` (origin/main tip: M4-5-S #106, migration 0107; CI-TIME-1 #124).

Builder receipt only — not independently verified, not accepted.

## 1. Merge and resolutions

`git fetch origin` then `git merge origin/main`. Two textual conflicts, both resolved as a keep-both union; git merged everything else itself.

| File | Conflict | Resolution |
|---|---|---|
| `BUILD_PLAN.md` (section 12.2 ledger tail) | main's "Ledger amendment — M4-5-S, 8 October 2026" vs this branch's "Ledger amendment — CH-1, 9 October 2026" | Both kept, ordered by date (M4-5-S first, CH-1 after), blank line between, wording of each unchanged. |
| `packages/db/src/migrate.ts` (`MIGRATION_URLS`) | main's `0107_recovery_messages.sql` vs this branch's `0109_job_activation_terms.sql` at the same slot | Both kept in numeric order: `…0103_prevention_checks`, `0106_practice_feed`, `0107_recovery_messages`, `0109_job_activation_terms`. 54 registered = 54 files in `packages/db/migrations`. |
| `config/agent-lane-assignments.json` | none — git merged it cleanly | `lane-union.py` was therefore not needed. The `ch-1` lane is kept; main's `ci-time-1` and `m4-5-s` lanes are present (100 lanes). |
| `packages/db/MIGRATIONS.md`, `packages/db/test/tenancy.integration.test.ts`, `packages/core/src/index.ts` | none — auto-merged | Not touched by hand. |

CH-1's own migration-order assertion (`packages/db/test/job-activation-terms.integration.test.ts:118`) was already name-based and order-robust (0109 after 0106; names strictly increasing; applied rows equal the registered names), so the merge made nothing stale and no test, check or timeout was changed.

## 2. Commands (all run in the worktree at merge head `3d9edc1`)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | 0 | Lockfile up to date, done in 0.3 s |
| 2 | `pnpm typecheck` | 0 | 7 of 7 tasks successful |
| 3 | `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 tasks successful (tools/lint.mjs plus per-package tsc) |
| 4 | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | "Lane boundary passed", lane `ch-1`, comparison `merge-base` at `c283d4e`, head `3d9edc1` |
| 5 | `pnpm --filter @jobguard/core test` | 0 | 117 files, 3390 tests passed |
| 6 | `pnpm turbo run build --filter='./packages/*'` | 0 | 5 of 5 tasks (see note below) |
| 7 | `pnpm --filter @jobguard/api exec vitest run src` | 0 | 31 files, 729 tests passed (first run before step 6: see note) |
| 8 | `pnpm --filter @jobguard/web test` | 0 | 21 files, 448 tests passed |
| 9 | `pnpm openapi:check` | 0 | passed (`tsx src/generate-openapi.ts --check`) |
| 10 | `heavy-slot ch-1 … vitest run --maxWorkers=1 test/job-activation-terms.integration.test.ts` | 0 | 1 file, 11 tests passed |
| 11 | same, `test/recovery-messages.integration.test.ts` | 0 | 1 file, 98 tests passed |
| 12 | same, `test/tenancy.integration.test.ts` | 0 | 1 file, 9 tests passed |
| 13 | same, `test/UIWIRE-12.integration.test.ts` | 0 | 1 file, 22 tests passed |
| 14 | same, `test/demo-bootstrap.integration.test.ts` | 0 | 1 file, 4 tests passed |

The five database suites ran one at a time, each inside `~/.local/bin/heavy-slot ch-1`, on embedded PostgreSQL. No shared-memory clean-up or dylib repair was needed (`ipcs -m` was empty at the start).

Note on step 7. The first API run, made before step 6, failed 6 tests in 2 files: `recovery-message.application.test.ts` (3: `RecoveryMessageError` and the recovery-message schemas undefined on the `@jobguard/db` / `@jobguard/core` import) and `watchdog-registry.test.ts` (3: the new `/api/recovery-cases/[id]/messages…` routes unclassified, and the registered-migration list one short). Cause: the API resolves `@jobguard/core` and `@jobguard/db` through their git-ignored `dist/` folders, which still held the pre-merge build (no `recovery-message` output in `packages/core/dist`). It was an environment fault, not a merge fault. Rebuilding the git-ignored package outputs (step 6) cleared all 6 with no source or test change; step 7 above is the re-run. The CI path always builds first.

## 3. Staging and environment

- Nothing under `.pnpm-store`, build output, `test-results` or `apps/web/playwright.local.config.ts` is staged or committed; `git status` was clean after the merge commit and after every run.
- Node v24.17.0, pnpm 10.28.1. Disk free 128 GB (floor 45 GB).
- No browser suites were run (not requested for this merge).
- Nothing pushed, rebased, reset or deleted.

## 4. Not done

Independent review, acceptance, push and the PR merge are not done by this receipt.
