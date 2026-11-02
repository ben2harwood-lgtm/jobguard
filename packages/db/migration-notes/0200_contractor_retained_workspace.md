# 0200 — retained contractor workspace

Exact addition: `app.mon8_retained_contractor_workspace(s uuid, q jsonb) RETURNS jsonb`. No existing object is replaced. Owner `jobguard_migration`; SECURITY DEFINER, VOLATILE, fixed `search_path=pg_catalog`; EXECUTE only owner/runtime, PUBLIC and infrastructure revoked. No table privileges change.

The parent session-bound SQL authority validates synthetic database, READ COMMITTED, tenant context, session and effective membership before/after shared tenant advisory lock seed 54. The reader keeps that transaction lock, never upgrades it, and repeats scoped read permissions internally without commercial track eligibility. Membership expiry, revocation, grant revocation, client consistency and contract scopes stay effective. No mutable authority is exported to writers.

No data backfill or read effects. Populated predecessor row and catalogue comparisons, fresh/repeat migration and negative-control tests are authored in contractor-retained-read-upgrade.integration.test.ts. PostgreSQL evidence is NOT RUN locally (dispatcher environment restriction); CI is required before acceptance. Standing ruling 113 snapshot extension accounts for this exact signature only. LP-0 adds exactly its owner/runtime ACL and function inventory row.

Installation is transactional: failure rolls back. Installed defects require a later forward-fix migration; do not rewrite deployed migrations. Reverting the application routes to the legacy reader would restore the old track-dependent visibility limitation. The dispatcher renumbers this next-free stem if needed at merge.
