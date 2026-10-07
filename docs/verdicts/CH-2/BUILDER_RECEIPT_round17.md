# CH-2 builder receipt — round 17, UTF8 test databases

PR #97; branch `codex/sandbox/ch-2`; working tree based on `83d78d7051bd25f1d02f14a167496a49eec7dc3a` (main `0264158ffa8fbe61f7c896be9a9c5aa210f07af0`). Responds to the independent Claude Opus verdict REPAIR at `83d78d7` (issue comment 6048208725), which confirmed the merge and round 16 and raised one blocker: CI run 37695297502, 9 PostgreSQL test files (117 tests), every failure "Unicode normalization can only be performed if server encoding is UTF8" from 0095's `compute_site_match_key`.

This is a builder run receipt, not independent review or technical acceptance. CI must prove the full suite, `pnpm build` and both browser projects, which were skipped on `83d78d7`.

## Cause and change

Round 16's `packages/db/test/watchdog-fixtures.ts` inserts a fictional `app.site_revision`. 0095's trigger applies NFKC `normalize()`, which PostgreSQL only allows in a UTF8 database. The CH-2 watchdog clusters started `initdb` with only `--lc-messages=C`; `embedded-postgres` passes no locale environment, so the cluster is SQL_ASCII. This is a test-environment fix only: `"--encoding=UTF8"` is appended to `initdbFlags` at five places (each line number was read before editing):

| File:line | Before | After |
| --- | --- | --- |
| `packages/db/test/watchdog-command-harness.ts:191` | `initdbFlags: ["--lc-messages=C"]` | `initdbFlags: ["--lc-messages=C", "--encoding=UTF8"]` |
| `packages/db/test/watchdog.integration.test.ts:35` | same | same as above |
| `packages/db/test/watchdog-migration-owner.integration.test.ts:56` | same | same as above |
| `packages/db/test/things-replay.integration.test.ts:36` | same | same as above |
| `packages/db/test/match-inbox-replay.integration.test.ts:33` | same | same as above |

The harness line is shared by `command-replay-contract`, `proof-application-records`, `proof-replay`, `watchdog-legacy-identities` and `watchdog-lock-order`. `packages/db/MIGRATIONS.md` (encoding note, around line 150) gains one sentence naming the watchdog harness and suites. No assertion, SQL, migration, timeout or other line changed. Migrations 0000–0096 are untouched (0096 still SHA-256 `4b369d40e3d952a19267601245fae6a961925242666d34411176512994b1a4c4`).

## Search for other non-UTF8 embedded clusters in CH-2-touched test files

`git diff --name-only origin/main...HEAD -- packages/db/test` lists 27 files. Of the 18 that construct an `EmbeddedPostgres`, 11 already pass `--encoding=UTF8` and 7 did not: the five above, plus these two, which need no change:

- `recovery.integration.test.ts:13` (non-UTF8). It installs `installLegacySyntheticPartyFixtures`, but its only `app.job` insert runs under `SET session_replication_role=replica`, which disables the fixture trigger, so no site revision is written. Passed in CI run 37695297502. Not edited.
- `tenancy.integration.test.ts:38` (non-UTF8). `site_revision` appears only in table-name metadata lists (lines 305, 479); it inserts no job or site revision. Passed in CI. Not edited.

Non-UTF8 clusters outside the CH-2 diff, therefore outside this round and not edited: `audit`, `capture`, `contractor`, `evidence-pack-upgrade`, `ledger`, `outbox`. They are unchanged from main and passed in CI run 37695297502.

## Executed checks

Node `v24.17.0`, pnpm `10.28.1`. Embedded PostgreSQL started normally on this Mac.

| Command | Exit | Actual result |
| --- | ---: | --- |
| `pnpm typecheck` | 0 | 7 successful, 7 total. |
| `pnpm --filter @jobguard/db exec vitest run test/watchdog.integration.test.ts` | 0 | 1 file, 38 tests passed. |
| `pnpm --filter @jobguard/db exec vitest run test/proof-replay.integration.test.ts test/watchdog-migration-owner.integration.test.ts test/things-replay.integration.test.ts test/match-inbox-replay.integration.test.ts` | 0 | 4 files, 20 tests passed (one harness suite and the three other edited files). |
| `pnpm --filter @jobguard/db exec vitest run test/command-replay-contract.integration.test.ts test/proof-application-records.integration.test.ts test/watchdog-legacy-identities.integration.test.ts test/watchdog-lock-order.integration.test.ts test/recovery.integration.test.ts test/tenancy.integration.test.ts` | 0 | 6 files, 122 tests passed (remaining four harness suites, plus recovery and tenancy). |
| `GITHUB_EVENT_NAME=pull_request GITHUB_EVENT_PATH=<event> node tools/agent-lane-boundary-lint.mjs` (head `83d78d7`, branch `codex/sandbox/ch-2`, base `0264158`, with the working-tree edits present) | 0 | "Lane boundary passed". Re-run against the new HEAD after commit; result in the final report. |

All nine files that failed in CI (the five harness suites, `watchdog`, `watchdog-migration-owner`, `things-replay`, `match-inbox-replay`) now pass locally, 11 files and 180 tests in total including `recovery` and `tenancy`. The full `@jobguard/db` suite, `pnpm build`, browser projects and `LANE_BASE_REF=origin/main pnpm lint` were not run in this round; CI must run them.

## Not done

Nothing pushed, merged, deleted or opened. No other worktree or the main checkout was touched. No independent review is claimed.
