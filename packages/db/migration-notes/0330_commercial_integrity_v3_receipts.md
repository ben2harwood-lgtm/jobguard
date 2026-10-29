# 0330 — CH6-P immutable operational reviews

Expand-only, discovered by `MIGRATION_URLS` directory discovery. Seven new routines
and one INSERT/UPDATE/DELETE receipt trigger; no tables, columns, backfill, role,
old migration changes or broad privilege changes. All routines are owned by
`jobguard_migration`, with `search_path=pg_catalog`. Only the exact writer gets
runtime EXECUTE. Trigger is SECURITY INVOKER; migration ownership of its function
must not make runtime INSERT appear migration-owned. Existing v1 and other kinds
keep their inherited receipt behavior. Runtime DELETE/TRUNCATE remain denied.

The writer supports only saved ordinary invoice/payment activity without an
ordinary final-account lock. Sources are re-resolved and compared to the exact
strict snapshot. No caller hash, role GUC, detector output or JSON copy supplies
source authority. It authenticates current practice ownership and family, holds
session/membership against revocation, serializes tenant+command, returns genuine
replay before source evaluation, locks source tables conservatively in SHARE mode,
and rechecks authority/expiry after waits. Locks block inserts, including a new
lock appearing after an absence check. This synthetic-only implementation trades
concurrency for safety; these global source locks need review before any wider use.
A deadlock/serialization failure aborts the transaction and must retry the same
command; there is no external action or unknown provider outcome.

Receipt insert (including membership FK locks) precedes the final audit-head lock.
Audit uses the installed canonical chain, millisecond timestamps and only IDs and
hashes. Private explanation remains in the operational receipt. The final authority
check takes no later business lock. No Decision, outbox, financial posting, work
state, meter, eligibility or entitlement mutation occurs.

Deploy only after coordinator catalogue updates and CI own-step upgrade, grant/RLS,
direct SQL, isolation, race and original regression suites pass on the exact head.
PostgreSQL tests were written, NOT RUN in the builder sandbox. No browser suite is
applicable: this lane creates no route/page.

Forward fix: disable new review composition first, preserve every succeeded receipt
and audit event, then add a reviewed successor migration. Do not drop the guard,
rewrite results or delete audit history. Application rollback may stop calling the
new writer while leaving the migration installed; no destructive SQL rollback is
provided. Existing v1 readers/writers remain available. Source/policy holds are
not migration failures and are never replaced by permissive defaults.

Repair r1 (25 October): the ECMAScript trim set is encoded as ASCII hexadecimal
UTF-8 bytes and decoded by `convert_from(decode(...,'hex'),'UTF8')` at execution.
This removes CREATE FUNCTION's Unicode-escape conversion dependency on server
encoding. The 25 original code points and the UTF-16 length check are unchanged.
The own-step suite now explicitly creates a SQL_ASCII cluster and applies 0330
with `check_function_bodies=on`; its UTF8 check covers all 25 trim characters and
three non-trim neighbours. These PostgreSQL tests are NOT RUN in this sandbox.
