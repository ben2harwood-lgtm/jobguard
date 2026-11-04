# 0755 — synthetic VAT fixture records (M4-21, RED)

Adds only private `app.vat_fixture_record`, its five unique indexes, tenant-qualified
job/member/previous-document foreign keys, FORCE RLS, immutable row/table triggers,
and `app.vat_fixture_records(uuid,uuid,uuid,text,jsonb)`. No existing relation or
routine is changed. Runtime receives only EXECUTE on the single entry point; no
role or direct table grant is added. The fixed search path is `pg_catalog`. No
`app.*` GUC is changed by the routine; the caller's tenant context is preserved.

No backfill: the new table starts empty. Upgrade and LP-0/tenancy allowances are
explicit reviewed expectations in the matching proof JSON, never database-derived.
The table also appears in `later-empty-tables.ts`. Migration 0755 is reserved and
must be renumbered with its proof/note when the router lands the branch.

Forward fix by a subsequent migration; never edit applied SQL or erase fixture
history. This dark repository has no registered caller, so hold integration if a
problem is found. No existing data format, M1 tax calculation, invoice or accounting
record changes. No live enablement, tax-policy decision or adviser approval follows.

CI must execute the new integration suite and the fresh/upgrade, catalog, tenancy
and migration suites. This sandbox has no PostgreSQL; the implementation has not
been database-executed locally. Exact-head independent RED review remains required.
