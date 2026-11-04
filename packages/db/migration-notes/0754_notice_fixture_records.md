# 0754 — synthetic notice fixture records (M4-19 remains open)

Adds app.notice_fixture_record and the single app.notice_fixture_records routine.
Existing rows/routines are unchanged; new table starts empty. No data backfill,
external action, money/fee posting, outbox or production feature activation.

The table is migration-owned, FORCE RLS, private to the routine, immutable on
UPDATE/DELETE/TRUNCATE. The routine uses a fixed search path, derives its tenant
from verified transaction context, authenticates synthetic sessions on writes,
locks command then notice, enforces sequence/replay and exact revision/decision
bindings. It saves and restores the caller's app.tenant_id via set_config on both
success and error; it has no SET app.* clause. No new role is added.

Forward fix only: do not delete fixture history. If a defect is found, keep the
unregistered repository dark and add a corrective migration after review.
No rollback mutates an earlier record or re-enables real notices. 0754 is claimed
for this branch; renumber the migration/proof/note together at landing.

CI must run real PostgreSQL fresh/upgrade/catalogue/tenancy suites and
notice-fixture-records.integration.test.ts. Local checks and their outcomes are
recorded in the router commit-message handoff. The proof is hand-authored from the
DDL and reviewed existing catalogue formats, never generated from a database.
