# 0193 — MON-8-P-A contractor agreement authority

Next free number above observed main 0192; dispatcher renumbers at merge.
Expand-only: one table `app.contractor_agreement_status_revision`, two indexes
(primary key and per-assignment revision unique), tenant FK, tenant_isolation RLS
policy, routines `app.mon8_agreement_status_guard()` and
`app.mon8_contractor_agreement_context(uuid)`, and two triggers on the new table.
No existing routine, table shape, grants or row changes. No backfill/default-active
facts. No runtime writer or new credential. Owner fixtures are fictional evidence.

All objects are owned by jobguard_migration. FORCE RLS; migration-role-only tenant
policy. No runtime/PUBLIC/infrastructure table access; only context routine EXECUTE
is granted to runtime. Both routines have fixed pg_catalog search paths and revoked
PUBLIC/infrastructure execution. Mutation/truncate refused; insert time pinned.

Reader holds tenant shared advisory lock seed 54 through callback/commit, with
post-wait current session/member/status reads under READ COMMITTED. Future writers
must acquire the corresponding exclusive lock first and keep it through commit;
then business locks, then audit. Existing authentication bridges and command guards
are untouched. No command is activated by this migration.

Install is transactional and rolls back on failure. After installation, forward-fix
additively: retain status history, revoke reader EXECUTE if necessary, deploy a
reviewed replacement reader. Do not remove prior revisions or rewrite predecessors.
Tests cover populated predecessors, repeat runner invocation and later discovered
successors, catalogue/RLS/privileges, negative controls and unchanged legacy origins.
Standing ruling 113 extends SERIOUS-B5 only with these exact new objects.
PostgreSQL and migration tests NOT RUN locally; CI evidence is required before acceptance.
