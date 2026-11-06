# 1051 readiness discovery guard — LATER-SAFETY-20 (RED)

Must run after 1050_readiness_plan_discovery. Replaces its discovery routine with
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
