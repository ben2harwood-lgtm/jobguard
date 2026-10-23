# 0211 receipt-line source bridge — held build-ahead storage

Issued migration number: 0211. Base: 84b1e1fe1d3d89aa935fb4e7b0ed0afa08e20d04.
The base ends at 0198 and lacks the required 0210 predecessor. The upgrade test
refuses to certify the requested 0210 upgrade without it. PostgreSQL NOT RUN.

This migration creates five empty append-only tenant/job-qualified tables. FORCE
RLS applies; runtime is neither their owner nor a direct reader/writer. The only
runtime grants are two checked routines. Both authenticate current tenant,
session, owner membership and job, then raise
`RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED`. Neither returns current facts nor stores
an artifact, command, review, approval, money or audit effect. There are no new
financial, external-action, case-landing or qualification effects to audit.

These tables are a quarantined foundation, not a released cross-row financial
integrity contract. Known identity FKs exist; complete invoice/movement/line
ancestry, exact ratios, deduplication, expiry/revocation, reversal availability
and source serialization still require the missing handoff and positive tests.
Runtime cannot use these tables before that happens. A migration owner or
superuser is outside the runtime trust boundary.

Use existing additive migration discovery after 0210 is supplied. Do not register
0211 in migrate.ts. Fresh and upgrade CI must inspect actual roles/grants/RLS/FKs
and run existing regressions. Catalogue additions are coordinator-owned.

Forward fix requires a reviewed additive migration with the accepted source
projection, locks, cross-row validation, controlled inserts, session SELECT
policy, review consumption and same-transaction audit constraint. Removing the
hold alone cannot enable a safe writer. No backfill is authorized. Application
rollback leaves storage intact. Confirm all five tables are empty before any
SQL rollback; removal requires a migration-owner migration. Never rewrite old
commercial rows or drop historical money.
