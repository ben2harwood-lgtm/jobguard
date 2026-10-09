# M4-7-S builder receipt, round 8: renumber the practice-feed migration 0101 to 0106

Branch `codex/sandbox/m4-7-s-r3`, worktree `.worktrees/m4-7-s-r3`, PR #108. Starting head `9ee82b1`; the renumber commit is the local commit that carries this receipt (see the delivery message for its SHA). Role: builder only. This is not a review and not an acceptance.

## Why

CH-3b merged migration 0102 ahead (main `b552bdc`, merged into this branch at `8f57307`). Under Ben's 5 October merge-ahead ruling a PR whose migration number is below the merged maximum renumbers to the next free number. 0103 (MON-7a), 0104 (CH-1) and 0105 (ENT-2) are allocated, so M4-7-S takes 0106. The coordinator had already swapped the lane's migration path in `config/agent-lane-assignments.json` (commit `9ee82b1`); I did not touch that file or `BUILD_PLAN.md`.

## Changes

| # | File | Change |
| --- | --- | --- |
| 1 | `packages/db/migrations/0101_practice_feed.sql` to `packages/db/migrations/0106_practice_feed.sql` | `git mv` only. The SQL does not mention its own number, so there was no comment to leave. Content byte-identical. |
| 2 | `packages/db/src/migrate.ts` | `0101_practice_feed.sql` was registered last, after `0102_contractor_parties.sql`. It is now `0106_practice_feed.sql`, still the last entry, so registry order equals number order (0097, 0102, 0106). One line changed. |
| 3 | `packages/db/test/practice-feed.integration.test.ts` | Seven occurrences of `0101` replaced by `0106` (the `findIndex` filename, the missing-from-registry error message, the comment, the test title twice, the exactly-once filename filter, the ordering assertion). No assertion changed meaning, none added, removed or skipped, no timeout touched. |
| 4 | `packages/db/MIGRATIONS.md` | Heading is now `## 0106_practice_feed.sql (M4-7-S)`. The history is stated plainly: reserved 0046, renumbered to 0101 under the 5 October ruling, renumbered to 0106 on 8 October because CH-3b's 0102 merged first (0103 MON-7a, 0104 CH-1, 0105 ENT-2 allocated), SQL byte-identical. The sentence "upgrade from the schema just before 0101 (currently through 0097)" became "just before 0106 (currently through 0102)", because the schema registered before the feed now ends at 0102. No other text changed. |

Historical receipts in `docs/verdicts/M4-7-S/` (rounds 4 to 7 and earlier) were left unchanged and still say 0101.

## sha256

| File | Before | After |
| --- | --- | --- |
| `0101_practice_feed.sql` / `0106_practice_feed.sql` | `47c469b941a0f8f2f342222ae967e42b8f363cd34f5a99383273c145bf9d44b7` | `47c469b941a0f8f2f342222ae967e42b8f363cd34f5a99383273c145bf9d44b7` (identical) |
| `packages/db/src/migrate.ts` | `62fe4dc76114ad8c4e3801ef14e1255b6267ee7fa37d06498c1e71e6c2dba4c4` | `20292adde12013708c35490812b4f4f7e4b95be97604e97c3e7effd172e265db` |
| `packages/db/test/practice-feed.integration.test.ts` | `70d01f662d63efc24428f83b2848f75ae0e03489563ae8576109082d7701afc9` | `3c1b7d7f79379f8c527f3db4511209f8073df1698a4b4d04277bb61bb6ea7884` |
| `packages/db/MIGRATIONS.md` | `bcb155f6ed9bc8c9ee1b2a839e09d40a31b455c899351a51028abdd5b84d7ec7` | `e5c82182f7a6e1283fb8a73902687fc23768f2d1a1b936bb73fcd4684dfb453e` |

## Commands actually run (worktree; `df -h /` showed 125 to 126 GiB free throughout, far above the 40 GiB stop line; vitest with `--maxWorkers=1`)

| Command | Exit | Result |
| --- | --- | --- |
| `shasum -a 256` on the four files above, before and after | 0 | table above |
| (from `packages/db`) `npx vitest run --maxWorkers=1 test/practice-feed.integration.test.ts test/demo-bootstrap.integration.test.ts test/UIWIRE-12.integration.test.ts test/tenancy.integration.test.ts` | 0 | 4 files, 62 tests passed (27 + 4 + 22 + 9), embedded PostgreSQL, 72 s |
| `pnpm typecheck` (repo root) | 0 | 7/7 tasks successful |
| `LANE_BASE_REF=origin/main pnpm lint` (repo root), on the working tree before the commit | 1 | Core purity passed. Lane boundary FAILED on the old path `packages/db/migrations/0101_practice_feed.sql`: the lint diffs with `--no-renames`, so the staged rename shows a deleted `0101` path, which the lane no longer lists. Expected artefact of an uncommitted rename, not a real violation. |
| `LANE_BASE_REF=origin/main pnpm lint` (repo root), on the committed head | 0 | Core purity (113 files), lane boundary (`m4-7-s`, base `b552bdc`), money boundary and 7/7 turbo tasks all passed |

Embedded PostgreSQL started normally; `hydrate-symlinks.js` was not needed. No process was killed and no shared-memory segment was removed. No files, branches or worktrees were deleted (one `git mv` rename). Synthetic data only.

## Things to know

- The comment at `practice-feed.integration.test.ts` line 87 still reads "so later migrations (0102, 0103, ...) never change what this suite upgrades from". The order said to change nothing but the number, so I left the wording. 0102 now sits before 0106 and is part of the "previous schema" the suite builds, so "(0102, 0103, ...)" is now slightly stale: it should read "(0107, ...)". A later round can fix the comment; no assertion depends on it.
- The upgrade test installs every migration registered before the feed as the "previous schema". That set now includes 0102 (contractor parties) and the suite still passes 27/27 with it.
- The final `ORDER BY migration_name` equals `MIGRATION_URLS` order assertion holds because 0106 is registered last.
- Not run here: GitHub CI, a fresh independent review, the whole `packages/db` suite, the browser spec, and any push. Nothing was pushed or merged. The integrator still adds the BUILD_PLAN section 12.2 ledger line.

## TL;DR

The practice-feed migration is now numbered 0106 instead of 0101, because another lane's 0102 merged first. The SQL itself is byte-for-byte unchanged; only its file name, its entry in the migration list, the test's references to the name and the migration notes changed. The four database suites (62 tests), typecheck and lint all pass. Nothing was pushed; CI and a fresh independent review are still needed.
