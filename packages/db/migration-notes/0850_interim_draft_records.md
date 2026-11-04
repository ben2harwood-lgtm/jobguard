# 0850_interim_draft_records — M4-18 synthetic interim draft records

Adds one empty append-only tenant/job table and one runtime-callable synthetic-only
routine. No existing row shape, routine, registry, commercial table or policy changes.
No backfill. The explicit proof records expected new objects; it is authored from
DDL, not generated from a database. Runtime receives only EXECUTE on the routine.
The migration owner has a tenant-scoped FORCE RLS policy for routine writes.

Forward fix: keep stored draft history immutable; repair validation with a later
reviewed migration/repository change. If storage must be withdrawn, revoke the
routine's runtime EXECUTE in a new migration and retain the table for investigation.
Do not delete records or roll back earlier commercial history.

Migration `0850_interim_draft_records` is numbered for this batch and must be checked at landing.
Real database and migration catalogue evidence comes from CI; this sandbox cannot
start PostgreSQL. No issue/templates/tax/release gate is satisfied by this change.
