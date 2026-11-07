# 0696 readiness discovery guard — LATER-SAFETY-20 (RED)

Must run after 0695_readiness_plan_discovery. Replaces its discovery routine with
an explicit synthetic-database guard and a filter excluding past confirmed plans
in each plan's time zone. Keeps identifier-only output, the 100-row cap, owner,
EXECUTE grants and tenant-context restoration. No new tables or backfill.
Forward fix with a later reviewed migration; do not restore unguarded discovery.

Repair round 1 renames the SQL and proof by complete stem only; SQL bytes are
unchanged. The non-synthetic test supplies its fictional password explicitly
because pg-pool does not enumerate it in admin.options. All assertions remain.
PostgreSQL fresh/upgrade, readiness timer/store and privilege checks require CI;
this sandbox cannot start PostgreSQL or bind localhost.

Main merge alignment (6 November 2026): retained main's session-actor checks and
all existing assertions, alongside the readiness risk and timer coverage. Timer
fixtures now supply existing synthetic membership/identity pairs to the current
confirmation contract. Neither discovery migration is present on merged main;
no main routine body is superseded by this group. Lane paths match origin/main.

Local checks: installed Vitest, at most two workers: API readiness-store,
readiness-task and readiness-scheduler (34 passed); core readiness (9 passed);
database migration-proof-loader (77 passed). API TypeScript --noEmit passed;
both edited database integration files passed TypeScript syntax diagnostics.
The pnpm launcher could not verify its pinned version because registry fetches
failed; checks used the existing installed binaries without downloads or config
changes. Real PostgreSQL and browser suites remain for GitHub CI, followed by
independent RED review. Git index resolution and commit remain with the router.

Landing preparation — LATER-SAFETY-20-CATCHUP (7 November 2026): READY for
router commit/push and CI; not a database-suite pass or independent RED approval.
Preserved the merged union with origin/main. Renumbered complete stems 1050/1051
to reserved 0695/0696, including proofs, notes, lane references and the timer test
pin; verified both SQL files byte-for-byte against HEAD before renumbering.
The 0695 proof retains all three LP-0 changes and an empty upgrade section,
as the checker required. Main's migfix-7 and plan-entitlement-lifecycle upgrade
suites are byte-for-byte unchanged. Main has no discovery routine to supersede;
0696 retains 0695's body plus the synthetic-only and past-plan guards.

Local checks used installed binaries without downloads, maximum two workers per
Vitest invocation, maximum three named files per invocation:
- packages/db: test/migration-proof-loader.test.ts, test/lp-0-catalog.test.ts,
  test/m2-1-migration-proof.test.ts: 112 passed.
- apps/api: src/readiness-store.test.ts, src/readiness-task.test.ts,
  src/readiness-scheduler.test.ts: 34 passed.
- packages/core: src/readiness.test.ts, src/readiness-scheduling.test.ts: 25 passed.
- apps/api: src/shadow-detection.worker.test.ts,
  src/sv5pre-worker-registration.test.ts, src/readiness.later.test.ts: 24 passed.
- root node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit: passed.
- git diff --check, exact lane comparison (20 paths outside config/lanes/),
  SQL-byte preservation and main-upgrade-suite comparisons: passed.

Required after router push: GitHub CI must run LP0-17 in
lp-0-authority-paths.integration.test.ts, lp-0-grant-freeze.integration.test.ts,
migfix-7-upgrade.integration.test.ts, plan-entitlement-lifecycle-upgrade.integration.test.ts,
serious-b5-upgrade.integration.test.ts, contractor-entitlement-upgrade.integration.test.ts,
the remaining mandatory upgrade suites, and readiness timer/store integration.
PostgreSQL and browser suites were not attempted: this sandbox cannot start a
database or bind localhost. Green exact-head CI and independent RED review
remain required before merge. No git write, commit, push or PR action performed.
