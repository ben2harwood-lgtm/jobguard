# 0592 — synthetic billability review read

Adds only `app.read_recovery_billability(uuid,uuid,text)`, owned by the migration role,
with EXECUTE for runtime. No table grants, writes, backfill or existing routine changes.
It requires the synthetic database, current owner session, same tenant/job/case and
final-account lock before reading bound work/lines or immutable review results.
Practice sessions also require exact job ownership. Identity sessions must resolve
one current owner membership. Reviews can be read by that tenant's second owner.

Repair: keep `pg_has_role` first and check the database name in the ownership/lock
IF. Both isolation replay databases now refuse at the same RAISE, before any
source or review read; SV-3 Test Q still compares every log byte without a new limit.
The proof's authority-path and downstream descriptions record this ordering;
the routine owner, ACL, search path and static calls are unchanged.

Fresh/upgrade/catalog/RLS and hostile session cases must pass PostgreSQL CI.
The proof is handwritten from the SQL, never derived from a database.
Forward fix by a new migration; keep the web surface dark while repairing. Do not
remove historical commands or enable live fee paths. Number is reserved and must be
reconciled at landing.
