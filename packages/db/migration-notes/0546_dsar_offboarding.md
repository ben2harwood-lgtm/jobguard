# 0546 — M5-11 expanded DSAR and offboarding (RED)

Extends the four existing isolated synthetic privacy tables; adds no tables, table
privileges, provider calls or business/identity writers. Existing forced tenant RLS
and composite FKs remain. Replaces the two checked routines and adds an owner-only
trigger to fence fictional intake after exit/deletion. LP-0 records that trigger
and unchanged runtime entry points. The 0539 dependency proof owns the four tables and forced-RLS/owner expectations;
0546 adds only the private fence routine and its two trigger records. The existing
fence assertions now live in dsar-offboarding.integration.test.ts. Shared LP-0,
upgrade and tenancy baselines match main; no assertion is weakened.
No backfill of payloads: old requests receive expanded=false and null review/receipt;
v1 original nine-class commands remain compatible. v1 cannot bypass v2/held data.

Forward-fix only once v2 receipts exist: do not drop audit/command history, re-enable
work or remove holds to roll back. Leave the feature flag off; correct the routine
in a new numbered migration and re-run tenant/upgrade suites. Never edit 0539.

Local PostgreSQL/browser execution is unavailable in this sandbox. CI must run
fresh migration, prior-schema upgrade, repeated migrate, whole PostgreSQL suite,
LP-0 grant/catalog and tenancy tests. Migration 0546 is reserved build-ahead and
must satisfy migration ordering at merge; its bytes and number are unchanged here. D07/D12 and real-data gates
remain proposed; no live cleanup or financial charging is enabled.

Proof expectations are source-inspected, never read from a database. The 0539
primary-key indexes declare RLS off because PostgreSQL RLS applies to their parent
tables, all four of which declare enabled and forced RLS. 0546 replaces
privacy_command/read without changing their catalog metadata, so those routine
expectations stay in 0539 rather than claiming duplicate proof identities.
The unmerged M0-13c dependency (0539) needs its included proof. Main’s missing
0510_read_value_job_combined_final.sql proof remains owned by #502; the full
loader may refuse the registry until it lands. No loader check is weakened.
