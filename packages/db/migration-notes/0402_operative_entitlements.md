# MON-8-P-B slice 1: operative grants

Synthetic only. Migration 0402 adds insert guards on operative memberships,
operative role grants, operative identity invitations and site-origin records
(`site_user` and `jobguard_surfaced_confirmed`). Membership changes into the
operative role are also guarded. The latest tenant assignment must be contractor
and its latest bound agreement status must be active. Plans and client flags
provide no authority. Row-level tenant context, scoped permissions, immutable
origin validation, command idempotency and audit checks remain required.

The write holds the existing tenant agreement advisory lock until commit; status
inserts take the exclusive lock. READ COMMITTED is required so a waiting write
observes the latest committed status. Route checks use the existing server-side
agreement evaluator; SQL rechecks close the gap between the route and persistence.

Only newly generated fictional practice organisations receive a synthetic active
status fact, bound to their generated assignment. Existing rows are untouched;
old organisations missing status refuse new operative/site writes. No read,
export, revocation, expiry, existing role or origin is removed or rewritten.

Forward fix with another reviewed migration if needed; do not drop guards or
rewrite historical data to roll back. CI must execute the new integration/upgrade
suites, existing database/migration suites and browser journeys. Local test
collection is not PostgreSQL execution. No live agreement activation is added.
