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
