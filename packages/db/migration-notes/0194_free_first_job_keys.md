# 0192 — MON-3-P-A private business key claims

Dispatcher allocation 0192; renumber at merge under MERGE-CHURN-1. No earlier migration, runner or legacy register changes. No backfill.

Both tables belong to jobguard_migration, have non-null tenant identities, ENABLE/FORCE RLS and migration-only tenant policies. Default non-owner grants are removed. PUBLIC, runtime, infrastructure and shadow roles receive no table privileges or helper execution. No feature pool uses owner credentials. RLS is an additional check within correctly chosen tenant context, not protection from the migration owner or superuser changing schema.

Snapshots bind the existing (tenant, job, activation) identity, schema version, fictional verification provenance UUID/time and normalized fictional identifiers. This is private fixture storage, not a verification service or retrospective admission. One immutable snapshot per activation/job; changed snapshots conflict. Updates/deletes/truncates are refused on both tables. There is no expiry/release operation.

The invoker helper derives every available key from the stored row and locks that snapshot. Keys retain compact v1 tuple bytes, with global C-collation primary-key uniqueness independent of tenant, job and snapshot schema version. The helper inserts in canonical byte order. Same snapshot replay adds nothing. The AFTER INSERT trigger makes snapshot insertion and every claim one atomic statement: a collision rolls back the entire insertion, including an earlier successful key. No autonomous transaction. Global unique-index races fail with a generic error without key-bearing DETAIL. All business locking precedes any future audit lock.

A adds no activation/exemption/deadline/card/statement/payment and has no runtime API. B must supply checked eligibility, persisted verification/card facts, current actor authorization, exact approval, receipt and audit in the same transaction. A's activation parents in tests are explicitly isolated legacy FK scaffolding, not command-authority evidence.

Expand-only compatibility: old rows/functions unchanged; legacy single-key helper remains source-compatible but deprecated for decisions. Installation failure rolls back the transaction. After installation preserve snapshots and consumed claims; repair forward. Do not drop tables, remove keys or reset entitlement. No deletion/retention policy is introduced.

PostgreSQL integration/upgrade/security/races are authored but NOT RUN in the restricted builder sandbox. CI must establish actual server version and catalog behavior before acceptance.
