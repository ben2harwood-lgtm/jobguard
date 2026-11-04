# 0762 — M5-6 dark rate suggestion acceptance (RED)

Adds one private FORCE-RLS append-only acceptance table, one runtime-executable, session-authenticated routine and the exact `rate.suggestion_accept` command-registry entry. No existing row shapes or routines change. Existing immutable observation/source rows supply all training data; acceptance rows are never read by the baseline.

Upgrade starts empty; the exact LP-0, upgrade and tenancy additions are in the migration proof. The empty acceptance table is included in `later-empty-tables.ts`; the proof also chains the exact command-registry rows without edits to legacy guards. No backfill. Forward fix only: add a reviewed corrective migration; preserve acceptance and audit history, revoke the routine's EXECUTE to disable writes if required. Migration number is reserved and must be renumbered at landing.

The SQL median/outlier check deliberately independently enforces the unchanged pure policy so direct SQL cannot forge the accepted amount. It is the only additional calculation path and requires parity coverage in PostgreSQL CI. The repository's core proposal uses only retained sources; its read result also preserves database-specific exclusions.

This work does not finish M5-6. No live composition, merchant adapter or release activation. Required CI: fresh/upgrade migrations, LP-0 inventory and exact proofs, tenancy/privileges, real PostgreSQL rate-suggestion adversarial tests, full required checks and independent RED review at the exact head. Local validation and remaining limitations are recorded in the router commit-message handoff.
