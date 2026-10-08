# M4-7-S builder receipt, round 7: feed suite safe for later migrations; stale docs fixed

Branch `codex/sandbox/m4-7-s-r3`, PR #108, starting head `e8892c1`. Builder: Claude Sonnet 5.5 (not a reviewer; this receipt is not a verdict). Order: `M4-7-S-r7-renumber-safe`.

## Why

The fresh Opus delta at `e8892c1` (PR #108 comment 6051620060) passed and carried one hazard: `packages/db/test/practice-feed.integration.test.ts` assumed 0101 was the highest migration. CH-3b (0102) and MON-7a (0103) merge after this PR and their lanes cannot edit this file, so the suite must not depend on 0101 being last.

## What changed (three files; nothing else)

Migration `0101_practice_feed.sql` is untouched: sha256 `47c469b941a0f8f2f342222ae967e42b8f363cd34f5a99383273c145bf9d44b7`, identical before and after. `packages/db/src/migrate.ts`, `config/agent-lane-assignments.json` and `BUILD_PLAN.md` are untouched. No timeout was added or changed.

### 1. `packages/db/test/practice-feed.integration.test.ts`

Previous schema (`beforeAll`, was line 87):

```diff
-  for (const url of MIGRATION_URLS.slice(0, -1)) {
+  // The previous schema is every migration registered before 0101, so later migrations (0102, 0103, ...) never change what this suite upgrades from.
+  const feedIndex = MIGRATION_URLS.findIndex((url) => fileURLToPath(url).split("/").at(-1) === "0101_practice_feed.sql");
+  if (feedIndex < 0) throw new Error("0101_practice_feed.sql is missing from MIGRATION_URLS");
+  for (const url of MIGRATION_URLS.slice(0, feedIndex)) {
```

If 0101 is ever missing from the registry, `beforeAll` throws and every test in the file fails, so the failure is loud. Then `migrate()` runs twice as before and applies 0101 and anything registered after it.

Test title (was line 105):

```diff
-  it("upgrades from 0094, preserves prior rows and applies 0101 exactly once without taking reserved migrations", async () => {
+  it("upgrades from the schema just before 0101, preserves prior rows and applies 0101 exactly once without taking reserved migrations", async () => {
```

The single assertion replaced (was line 109; the `toEqual` before it on the same line is unchanged):

```diff
-    expect(names).toEqual(MIGRATION_URLS.map(url => fileURLToPath(url).split("/").at(-1))); expect(names.at(-1)).toBe("0101_practice_feed.sql");
+    expect(names).toEqual(MIGRATION_URLS.map(url => fileURLToPath(url).split("/").at(-1))); expect(names.filter((name) => name === "0101_practice_feed.sql")).toHaveLength(1);
```

Kept exactly as they were: `expect(names).toHaveLength(MIGRATION_URLS.length)` (every registered migration recorded exactly once), the `toEqual` against the registry in registry order, the prior-job-row survival check, `toContain` 0094, `indexOf(0094) < indexOf(0101)`, the no-0043-0045 check and the `practice_feed_account` count check.

**Why the replacement is not weaker for this PR's purpose.** "0101 is last" was a stand-in for "0101 was applied, once, in the right place". The new line states the first two directly (0101 is in the recorded list exactly once). Position is still pinned: `toEqual` makes the recorded list identical to the registry order, and `indexOf(0094) < indexOf(0101)` still holds, so 0101 cannot silently move or drop out. The only thing the old line also asserted was that nothing is registered after 0101, which was never a property of this feature. That property is the hazard itself: it fails the moment 0102 merges, for a reason unrelated to the feed. Any real regression (0101 missing, duplicated or reordered) is still caught by the retained checks. The scratch run below shows the suite passing with a later migration present.

### 2. `packages/db/MIGRATIONS.md` (0101 section)

- "The registry is in filename order (49 migrations in this tree)." became "The registry is in filename order and grows as later migrations merge; nothing in this section or in the feed suite depends on 0101 being the last entry."
- "upgrade from 0094" became "upgrade from the schema just before 0101 (currently through 0097)".
- Added one paragraph: the feed is deliberately unavailable for CH-3a-adopted (imported) jobs and for SBOX-2 generated jobs without a capture record, because they have no customer payments and no receipts screen; extending it would be a separately reviewed change (Opus P2-1/P2-2, rated P3 at `e8892c1`).

### 3. This receipt.

## Scratch-migration proof (uncommitted, removed)

To prove the suite no longer depends on 0101 being last, I temporarily (a) created `packages/db/migrations/9999_scratch.sql` containing only `SELECT 1;` and (b) appended `new URL("../migrations/9999_scratch.sql", import.meta.url)` after the 0101 entry in `MIGRATION_URLS` in `packages/db/src/migrate.ts`. The feed suite then ran with 0101 no longer the last entry:

```
 Test Files  1 passed (1)
      Tests  27 passed (27)
```

Exit 0. I then reverted the `migrate.ts` edit and removed the scratch file (both were my own uncommitted scratch files). `git status --short` afterwards showed only the two intended modified files, and `git diff --stat -- packages/db/src/migrate.ts` is empty. Neither the scratch file nor the registry line was ever committed.

## Commands actually run (worktree; `df -h /` 42-44 GiB free throughout, above the 40 GiB stop line; all vitest runs with `--maxWorkers=1`)

| Command (from `packages/db` unless stated) | Exit | Result |
| --- | --- | --- |
| `npx vitest run --maxWorkers=1 test/practice-feed.integration.test.ts` (after the edits, no scratch) | 0 | 27/27 passed, embedded PostgreSQL |
| same, with the scratch `9999_scratch.sql` appended to the registry | 0 | 27/27 passed |
| `npx vitest run --maxWorkers=1 test/practice-feed.integration.test.ts test/demo-bootstrap.integration.test.ts test/UIWIRE-12.integration.test.ts test/tenancy.integration.test.ts` (scratch removed) | 0 | 4 files, 62 tests (27 + 4 + 22 + 9) passed |
| `pnpm typecheck` (repo root) | 0 | 7/7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` (repo root) | 0 | core purity, lane boundary (`m4-7-s`, event `local`, base `df1f9c1`), money boundary and 7/7 turbo tasks passed |
| `shasum -a 256 packages/db/migrations/0101_practice_feed.sql` | 0 | `47c469b9...9d44b7`, unchanged |

Embedded PostgreSQL started normally; `hydrate-symlinks.js` was not needed. No process was killed and no shared-memory segment was removed.

Lint note, post-commit lane check (needs a coordinator action): `LANE_BASE_REF=origin/main node tools/lint.mjs` run on the committed head exits non-zero with `Lane m4-7-s cannot edit: "docs/verdicts/M4-7-S/BUILDER_RECEIPT_round7.md"`. Core purity and the other two changed files pass; the only violation is this receipt, because the `m4-7-s` entry in `config/agent-lane-assignments.json` lists each receipt path explicitly (rounds 4, 5 and 6 each added theirs). The order forbids me from editing that config, so I wrote the receipt at the ordered path and did not touch it. To clear the lane check, the coordinator must add `docs/verdicts/M4-7-S/BUILDER_RECEIPT_round7.md` to that entry's `allow` list (and its `note`), as earlier rounds did. The pre-commit run in the table above passed only because the receipt did not exist yet.

Not run here: GitHub CI, a fresh independent review, the whole `packages/db` suite, the browser spec, and any push.

## TL;DR

The practice-feed test no longer assumes its migration is the newest one: it now builds the "old database" from everything registered before 0101, so CH-3b (0102) and MON-7a (0103) can merge later without anyone having to edit this file. I proved that by temporarily adding a fake later migration (suite still 27/27), then removed it. The migration docs now say "the schema just before 0101" instead of a stale count, and record that imported and generated-without-capture jobs deliberately have no feed. Migration 0101 and all feed code are unchanged; CI and a fresh independent review are still needed, and nothing was pushed.
