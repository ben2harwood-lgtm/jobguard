# LATER-SAFETY-3: company import identity

RED: import authorization, tenant isolation and money-adjacent lineage.

The latest routine body on origin/main at 108373dc9 is in 0534. The replacement changes only its duplicate predicate: company imports are unique by tenant/source, independent of sign-in and fixture; the shared practice tenant retains its session rule. The existing tenant advisory lock precedes the duplicate read, so competing sessions serialize. A partial unique index also enforces company source uniqueness. Command replay is still owned by the existing dispatcher and returns its first result.

No columns, policies, signatures, authority checks or commercial behavior change. The exact routine-body exception is in plan-entitlement-lifecycle-upgrade.integration.test.ts. Proof expectations are source-authored; no catalogue was used to derive them.

Forward-only deployment. Pre-existing company duplicates cause index creation to fail and roll back; do not delete or merge history automatically. Any such history needs a separate approved forward fix. A regression is corrected by another forward migration, preserving immutable rows.

Validation: source-only guard failed before the migration existed. Added sequential/two-session race and winning-command replay cases to job-import-v3-admission.integration.test.ts; existing cases cover wrong tenants, revoked sessions and changed payload. CI must execute real PostgreSQL fresh/upgrade/tenancy, import suites and exact-body checks. No PostgreSQL was run in this sandbox. All providers, real data and release gates remain closed.
