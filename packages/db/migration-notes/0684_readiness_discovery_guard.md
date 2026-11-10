# 0684 readiness discovery guard — LATER-SAFETY-20 (RED)

Must run after 0683_readiness_plan_discovery. Replaces its discovery routine with
an explicit synthetic-database guard and a filter excluding past confirmed plans
in each plan's time zone. Keeps identifier-only output, the 100-row cap, owner,
EXECUTE grants and tenant-context restoration. No new tables or backfill.
Forward fix with a later reviewed migration; do not restore unguarded discovery.

Repair round 1 renames the SQL and proof by complete stem only; SQL bytes are
unchanged. The non-synthetic test supplies its fictional password explicitly
because pg-pool does not enumerate it in admin.options. All assertions remain.
PostgreSQL fresh/upgrade, readiness timer/store and privilege checks require CI;
this sandbox cannot start PostgreSQL or bind localhost.
