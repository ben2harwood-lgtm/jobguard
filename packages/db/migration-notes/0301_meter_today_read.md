# MON-1 remainder part 3 — company meter read (RED)

0301 adds only `app.mon1_counted_meter_today(uuid,text)`. Runtime receives EXECUTE,
with no direct ledger SELECT or writes. As with 0239, it is initially an invoker
owned by migration and fails closed; the administrative bootstrap finalizer
assigns `jobguard_meter_owner` and enables SECURITY DEFINER. Its fixed search path,
existing session/membership check, tenant lock and forced RLS are preserved.
No role, table, policy or table grant changes. The narrow owner has no shadow grants.

The routine selects today's Europe/London date on the server, then the latest
source revision covering that day and its counted London recipe. It returns only
the stored day count, small allowance and source plan. Missing source, counted
computation or day is unavailable, never an invented zero or an older revision.
Source and ledger hash bindings must match. This display cannot authorize work,
admit a place, mutate a ledger or charge a subscription.

LP-0 records its exact owner/EXECUTE/call capability; SERIOUS-B5 records the new
routine without dropping predecessor expectations. No backfill. Roll forward
for fixes; disable the caller or revoke its EXECUTE to withdraw this read.
Database migration, bootstrap, RLS and upgrade execution run in CI. Local checks
use synthetic fixtures only. RED review remains required before merge.
