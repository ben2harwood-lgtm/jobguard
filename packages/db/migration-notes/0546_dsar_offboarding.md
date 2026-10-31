# 0546 — M5-11 expanded DSAR and offboarding (RED)

Extends the four existing isolated synthetic privacy tables; adds no tables, table
privileges, provider calls or business/identity writers. Existing forced tenant RLS
and composite FKs remain. Replaces the two checked routines and adds an owner-only
trigger to fence fictional intake after exit/deletion. LP-0 records that trigger
and unchanged runtime entry points. Tenancy retains the four privacy tables, moves their inherited owner expectations out of the RLS result into the owner list, and adds an exact routine/trigger assertion for the private fence; no assertion is weakened.
No backfill of payloads: old requests receive expanded=false and null review/receipt;
v1 original nine-class commands remain compatible. v1 cannot bypass v2/held data.

Forward-fix only once v2 receipts exist: do not drop audit/command history, re-enable
work or remove holds to roll back. Leave the feature flag off; correct the routine
in a new numbered migration and re-run tenant/upgrade suites. Never edit 0539.

Local PostgreSQL/browser execution is unavailable in this sandbox. CI must run
fresh migration, prior-schema upgrade, repeated migrate, whole PostgreSQL suite,
LP-0 grant/catalog and tenancy tests. Migration 0546 is reserved build-ahead and
must be contiguous/renumbered by the router at merge. D07/D12 and real-data gates
remain proposed; no live cleanup or financial charging is enabled.
