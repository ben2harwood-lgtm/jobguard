# LATER-SAFETY-4 — owner-only reminder approval (RED)

Verified against main b628980835bdefa152aa8d9ff889b5cf80f0b5e1. The latest routine is
0564_dunning_workbench_preview.sql. 0782 copies that body and adds only the current
owner predicate from mon1_lifecycle_actor after the source lock, before receipt
lookup. Read and request remain owner/admin. Wrong-role approval raises the
existing DUNNING_UNAVAILABLE with SQLSTATE 42501; the repository preserves a
403 status for the application mapper, rather than reporting a retryable 503.
The existing screen stops on non-success responses and never retries approval.

No data, tables, grants, signatures, owners or routine configuration change.
The explicit lp0/upgrade/tenancy proof sections are empty because no tracked
catalogue attributes change. The body change has populated upgrade coverage in
dunning-workbench-upgrade.integration.test.ts, preserving snapshots, Decisions,
resolutions, receipts and audit. Existing fixture actors are owners; none changed.
The plan-entitlement-lifecycle upgrade baseline predates creation of this routine
in 0563, so no older tracked routine exception is needed there.

Forward fix only: retain historical approved previews and receipts. If correction
is needed, add a successor migration preserving owner-only approval; do not
restore admin authority or edit this migration after landing. 0782 is reserved
for this branch and must be renumbered above merged migrations at landing.

PostgreSQL and browser checks cannot run in this sandbox. CI must prove fresh
migration/install, populated upgrade, admin request/refused approval, current
owner approval/concurrent same-command replay, former/revoked/expired-owner
refusal, cross-tenant not-found, and the new credit-note preview regression plus
unchanged managed-recovery suites. Existing demo browser journeys must pass.
Local unit/typecheck evidence and named landing holds are in the router's commit
message. Gates G0–G5, D05, provider sends/retries and production activation stay
closed. This finishes no plan piece.
