# LATER-SAFETY-94-CATCHUP

READY for router commit, push and PR. RED for commercial approval and the final-account lock boundary. Exact-head independent RED review and green CI against current main remain required.

## Catch-up

Retained the merged main changes and the existing later-safety-94 implementation. Renumbered 0828_variation_post_lock_refusal to reserved 0697 by stem only, including its proof and lane paths. The SQL body and proof expectations are unchanged apart from the proof migration filename. This migration introduces one owner-only trigger routine and two triggers. It recreates no existing routines and adds no runtime privileges.

MIGFIX-7 now names the added routine in its successor presence list. Its existing proof discovery pins the full body and metadata. The plan-entitlement upgrade suite now checks the exact new routine identity and full body, with its existing successor proof replay binding metadata. Every existing list entry and predecessor assertion remains.

Forward fix only. Preserve existing immutable revisions and approvals. A genuine Final Check catch retains its post-lock path, and exact committed approval replays retain their existing behavior.

## Local evidence

- From apps/api, `./node_modules/.bin/vitest run --maxWorkers=2 src/auth/customer-variation.test.ts` passed 14 tests.
- From packages/db, `./node_modules/.bin/vitest run --maxWorkers=2 test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts` passed 108 tests, including proof discovery and composed LP-0 inventory validation.
- Installed TypeScript passed `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` and `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` from the repository root.
- `node tools/plpgsql-case-in-if-lint.mjs` passed across 340 migrations.
- Vitest list with maxWorkers=2 collected LP0-17, grant-freeze and variation-post-lock in one three-file invocation, then MIGFIX-7 and plan-entitlement upgrade in a two-file invocation. Collection does not execute PostgreSQL tests.
- Exact working-tree lane coverage and migration ordering against origin/main passed. The lane lists every changed non-lane file and excludes itself. `git diff --check` passed.

## CI handoff

PostgreSQL and browser execution are unavailable in this sandbox. CI must execute LP0-17, grant-freeze, variation-post-lock, MIGFIX-7 and plan-entitlement upgrade, fresh/upgrade migrations and all required checks. The historical delta PASS at 6e739cba does not establish an independent review of this catch-up head. The router stages the renames and changes, commits, pushes and opens the PR.

Inspected origin/main was `7ea067babed06040e1335bb0d2185ef80eacf1bd`.

## CI repair try 1 — 8 November 2026

Read CI run 42522021490 at a8b10b6821d34d2c6571da1fc1fd6bf35d7e5b45 through the GitHub connector after `gh` could not connect. Shard 1 failed two MIGFIX-5 tests; shard 3 failed the meter lock-first race. All three fixtures tried to approve an ordinary variation after final-account lock and received the intended `42501 / VARIATION_LOCKED_BY_FINAL_ACCOUNT`. `core` and `checks` failed as dependent gates; core-checks, browser shards, secrets and dependency review passed.

The race tests now require the named refusal, no approval row, and the unchanged locked line set or meter observations. The meter still separately asserts its own `INVALID_SMALL_TRIP_SOURCE` refusals for both a missing source and an existing approval dated beyond the lock cutoff. The supplementary billing regression now confirms a genuine Final Check catch through the existing fixture and repository paths, then prices and approves it through the existing variation writers. Its final-invoice refusal, exact 120,000p plus 12,000p invoices, and 132,000p aggregate assertions remain. No product code or migration changed, and no migration renumber or policy decision is needed.

Local checks: 108 migration-proof/catalogue tests and 14 customer-variation tests passed with maxWorkers=2. Database source TypeScript and a temporary TypeScript configuration covering both changed integration files and their imports passed. Vitest collected the two repaired suites plus variation-post-lock (14 tests) with maxWorkers=2. Collection is not execution; the three integration suites require PostgreSQL execution in CI after router push. Exact-head RED review and green CI remain required.
