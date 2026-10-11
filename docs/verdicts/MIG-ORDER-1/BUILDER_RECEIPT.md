# MIG-ORDER-1 builder receipt

Builder: Claude Sonnet 5.5. Branch `codex/sandbox/mig-order-1`, cut from `origin/main` fd81315. Routine work under BUILD_PLAN section 2.1
("repair a failed check without weakening it"), recorded as section 14.3 "Discovered later". No migration.
Builder receipt only — not independently verified, not accepted.

## Why

`packages/db/test/work-order-import.integration.test.ts` (ENT-2, merged in #125) asserted that `0110_work_orders.sql` is the LAST migration. Under
Ben's 5 October merge-ahead ruling a later number always lands after it, so that assertion is false by construction once the next migration merges.
M0-6L (#104, `0111_persisted_identity.sql`) fails exactly there in CI run 37970591216 ("expected '0111_persisted_identity.sql' to be
'0110_work_orders.sql'"). The same stale "last" pattern was repaired in M0-6L round 9 and accepted by Opus as a stale fixture, not a weakening.

## Before and after (test at `ENT-2 migration and catalog`)

Title, before:

    registers 0110_work_orders.sql last, after 0106 (and any later merged number), with strictly increasing names, and every migration is applied once

Title, after:

    registers 0110_work_orders.sql after 0106 and 0109, with strictly increasing names, and every migration is applied once

Assertion line, before (line 55):

    expect(names.at(-1)).toBe("0110_work_orders.sql"); expect(names.indexOf("0106_practice_feed.sql")).toBeGreaterThan(-1); expect(names.indexOf("0106_practice_feed.sql")).toBeLessThan(names.indexOf("0110_work_orders.sql")); expect(names.indexOf("0110_work_orders.sql")).toBe(names.length - 1);

Assertion line, after (line 55):

    expect(names.indexOf("0110_work_orders.sql")).toBeGreaterThan(-1); expect(names.indexOf("0106_practice_feed.sql")).toBeGreaterThan(-1); expect(names.indexOf("0109_job_activation_terms.sql")).toBeGreaterThan(-1); expect(names.indexOf("0106_practice_feed.sql")).toBeLessThan(names.indexOf("0110_work_orders.sql")); expect(names.indexOf("0109_job_activation_terms.sql")).toBeLessThan(names.indexOf("0110_work_orders.sql"));

Unchanged on the next lines: `expect([...names].sort()).toEqual(names)` (strictly increasing names) and the `jobguard_schema_migration` applied-once check. No other line in the file changed.

## Why it is equal strength

The removed assertions pinned one thing: 0110's position relative to the end of the list. The two checks that truly guard ENT-2's registration still stand and
are now explicit: 0110 is registered (index > -1) and sits after the two migrations it depends on (0106, and now also 0109, the latest number before it).
The sorted-names assertion still rejects any out-of-order or duplicated registration, so no later number can sit before 0110 and 0110 cannot be moved. The
applied-once check still compares the recorded migrations to the full registered list. What the old line also asserted, that nothing comes after 0110, is
the one claim that is false by design under the merge-ahead ruling; it is the stale part, not a guard.

## Test runs (DB test `packages/db/test/work-order-import.integration.test.ts`, one at a time inside `heavy-slot mig-order-1`)

| Run | Code | Exit | Result |
|---|---|---|---|
| Baseline, test unchanged | main fd81315 | 0 | 1 file passed, 49 of 49 tests passed |
| After the change | `codex/sandbox/mig-order-1` 1353de5 (main + test diff) | 0 | 1 file passed, 49 of 49 tests passed; the retitled test passed |
| Before the change, with a later migration | temp detached worktree at `20488b8` (M0-6L, 0111 present), test unchanged | 1 | 1 failed, 48 passed: "expected '0111_persisted_identity.sql' to be '0110_work_orders.sql'" (reproduces the CI failure) |
| After the change, with a later migration | same temp worktree, test diff applied uncommitted | 0 | 1 file passed, 49 of 49 tests passed; `migrate.ts` lists `0111_persisted_identity.sql` directly after `0110_work_orders.sql` |

Temp worktree (left in place): `/private/tmp/mig-order-1-proof-20488b8`, HEAD `20488b8db07ce5126dbb1162d4077339aa3f11cc`, one uncommitted modification (the test file only).
Branch `codex/sandbox/m0-6l` and `.worktrees/m0-6l` were not touched.

## Commands and exits

| Command | Where | Exit |
|---|---|---|
| `pnpm install --frozen-lockfile` | mig-order-1 | 0 |
| `pnpm turbo run build --filter='./packages/*'` | mig-order-1 | 0 |
| `node scripts/hydrate-symlinks.js` (embedded-postgres darwin-arm64; first DB run failed with "Postgres init script exited with code null" until the dylib symlinks were hydrated; environment fix only, no test change) | mig-order-1 | 0 |
| `heavy-slot mig-order-1 pnpm exec vitest run --maxWorkers=1 test/work-order-import.integration.test.ts` (baseline) | mig-order-1 at fd81315, `packages/db` | 0 |
| `pnpm typecheck` | mig-order-1 at 1353de5 | 0 |
| `LANE_BASE_REF=origin/main pnpm lint` | mig-order-1 at 1353de5 | 0 |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | mig-order-1 at 1353de5 | 0 (lane `mig-order-1`, 2 files) |
| `heavy-slot mig-order-1 pnpm exec vitest run --maxWorkers=1 test/work-order-import.integration.test.ts --reporter=verbose` (after) | mig-order-1 at 1353de5, `packages/db` | 0 (49 of 49) |
| `git worktree add --detach /private/tmp/mig-order-1-proof-20488b8 20488b8`, then `pnpm install --frozen-lockfile` and `pnpm turbo run build --filter='./packages/*'` | temp worktree | 0, 0, 0 |
| `node scripts/hydrate-symlinks.js` | temp worktree | 0 |
| `heavy-slot ... vitest run ... test/work-order-import.integration.test.ts` (before-fix at 20488b8) | temp worktree, `packages/db` | 1 (1 failed, 48 passed) |
| `git apply` of the test diff (`git diff fd81315 1353de5 -- packages/db/test/work-order-import.integration.test.ts`), uncommitted | temp worktree | 0 |
| `heavy-slot ... vitest run ... test/work-order-import.integration.test.ts --reporter=verbose` (after-fix at 20488b8 + diff) | temp worktree, `packages/db` | 0 (49 of 49) |

Commits: 2c28339 (lane line), 1353de5 (test change), plus this receipt. Local only; nothing pushed, merged, rebased or deleted. BUILD_PLAN.md untouched.

Builder receipt only — not independently verified, not accepted.
