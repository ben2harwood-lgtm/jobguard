# 0166 — Quote source lineage (SERIOUS-B3 S09)

Adds one item-qualified unique source key and two validated foreign keys. Quote lines and rate observations can no longer name a revision belonging to another scope item, including through direct runtime INSERT. Repository checks provide a typed rejection before draft/audit writes; only database constraints enforce every persistence path. No column, row, grant, RLS policy, routine, existing migration or shared migration list changes.

0166 is above 0165, the highest migration on origin/main at build time. MERGE-CHURN-1 directory discovery registers it without editing `migrate.ts` or `MIGRATIONS.md`; integration must renumber if main advances.

Existing correct history remains byte-identical. There is no backfill: inconsistent immutable history makes validation fail and rolls the entire migration back. Do not repair history automatically or disable validation. The coordinator must assess affected synthetic/history rows before retrying. No real data or production rollout is authorised here.

Fresh-install/runtime SQL tests: `packages/db/test/serious-b3-quotes.integration.test.ts`. Populated predecessor upgrade, byte preservation, catalog validation and replay: `packages/db/test/serious-b3-lineage-upgrade.integration.test.ts`. Both are NOT RUN in this sandbox and require PostgreSQL CI. Existing tenancy/migration suites remain mandatory.

Rollback on installation failure is transactional. After successful installation prefer a forward fix retaining source ownership; application rollback remains compatible because correctly paired inserts are unchanged. No new operational service or alert is introduced; migration validation failures and `QUOTE_SCOPE_REVISION_MISMATCH` require investigation.
