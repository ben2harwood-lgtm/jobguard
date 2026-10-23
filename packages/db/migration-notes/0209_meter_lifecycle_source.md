# 0209 — normal-company lifecycle sources

Additive migration after 0208. Adds eight `app.meter_lifecycle_*` tables, isolated `jobguard_meter`, three checked lifecycle entrypoints and one private authentication bridge. No existing table/routine/row, grant or RLS policy is replaced. No practice schema, annual/trial entitlement, billable count or commercial side effect is enabled.

All new tables are owned by `jobguard_migration`, tenant-qualified and FORCE RLS. Runtime receives only three EXECUTE grants. The meter role has only narrow new-table access and the identity bridge. Existing source-table SELECT grants/policies remain coordinator-owned and absent; capture is deliberately unavailable until integration. See the contract and builder receipt for exact grants/catalogue rows and holds.

Fresh discovery uses the existing migration-directory runner. Own-N upgrade test manually installs predecessors through 0208, seeds populated predecessor data, applies only 0209, compares bytes/types/ACL/policies, then runs all successors twice. NOT RUN locally; PostgreSQL CI required. No backfill or rewrite occurs. Existing v1 meter fixture history remains separate.

Forward-fix preferred. Before enabling any consumers, a rollback may remove the new entrypoints, private bridge and new tables in reverse FK order, then revoke app USAGE and drop the role. Never cascade into existing sources or remove issued snapshots. Once used, preserve source/computation history and repair with a later migration; no destructive rollback after issued statements depend on the source. Coordinator must retain the migration marker consistency and review dependency privileges before any rollback.
