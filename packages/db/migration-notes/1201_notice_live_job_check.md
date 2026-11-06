# 1201 — live-job check for practice notice records

LATER-SAFETY-7, RED: authority. Replaces only app.notice_fixture_records from
0597, adding the neighbouring 0166 billing status rule: live, invoiced or paid.
A fresh prepare or append refuses with the existing P0002 / NOT_FOUND for every
other status, just as for a missing or foreign job. Both operations check, so a
caller cannot bypass prepare and append directly. The guard follows stored-command
lookup: exact replay (prepare and append) and historical reads remain accessible
at any job status. Changed replays still conflict; session, actor, tenant and
notice/job binding checks remain in force. No stored record becomes unreachable.

The browser fixture in apps/web/e2e/M4-19-notice-fixtures.spec.ts now seeds scope
identity/revision and an accepted quote baseline, then transitions its fictional
job through quoting, accepted and live using the owner-only transaction from
origin/codex/sandbox/m4-18-interim-rules:apps/web/e2e/interim-drafts.spec.ts.
Its short-lived admin pool closes before the page opens. Every browser assertion
is unchanged. This is test setup only, never a route or new product capability.
The two notice integration suites already use meterCompany -> seedWorkJob, which
seeds live jobs; that setup is retained. Added regressions cover draft prepare and
append refusal, route refusal, historical read/replay, wrong role and other tenant.
These tests were written before the guard; PostgreSQL execution is deferred to CI
because this sandbox cannot start a database. No local red/green DB claim is made.

No columns, rows, grants, owners, policies, tracked calls/writes or function
configuration change. The hand-authored proof therefore has explicit empty lp0,
upgrade and tenancy sections; it is not derived from a database. No legacy list,
LP-0 inventory, serious-b5 or tenancy guard is changed. The replaced routine was
introduced after the 0556 upgrade baseline, so its prior-body preservation loop
does not require an exception for this routine. CI must confirm these catalogues.
No new command/route, command registry entry, table or app.* SET clause is added.

Forward fix only: preserve all fixture history and correct defects with another
reviewed migration. Do not roll back by removing the status guard. No backfill or
schema rollback is needed. 1201 is reserved and is renumbered at landing.

CI must prove the real PostgreSQL notice-record and route suites, fresh/upgrade,
LP-0/serious-b5/tenancy guards, and the unchanged browser assertions at mobile-360
and desktop headlessly with at most two workers. Local unit/typecheck results
are recorded in the router commit-message handoff. Green current-head CI and one
independent exact-head RED review remain outstanding. This finishes no plan piece.
Real notices/sending, LP-5 command-boundary migration, approval-revocation policy,
providers, D-decisions and gates G0-G5 remain closed; realSendEnabled stays false.
