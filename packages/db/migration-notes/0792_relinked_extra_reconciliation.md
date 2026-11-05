# 0792 — LATER-SAFETY-16 (RED)

The approved-not-exported alert read the raw latest extra event, so an approved
extra disappeared after a duplicate link was reversed even though export billed
it. The read now uses `contractor_approved_not_exported(uuid,uuid)`, which preserves its
existing latest-request, approved-outcome and not-exported filters and calls
`xa_latest_kind`, the same effective-state projection used by `cb_candidates`.
The private helper remains private. The new read entry point checks
`cb_authority(session,job,false)` and explicitly scopes rows to the current
tenant and authorized job; it performs no writes and uses a fixed search path.
No existing routine, signature, grant, table, column or stored fact changes.

The PostgreSQL regression is authored before the implementation: approve £3.38,
mark duplicate, unlink, read repeatedly, export, then verify removal. It also
checks active duplicates, withdrawn/rejected exclusions and direct read authority.
This sandbox cannot run PostgreSQL or browser suites. CI must prove fresh and
populated upgrade/catalog/grants/RLS checks, contractor billing integration suites
and ENT-11b unchanged. Independent RED review is required at the exact final head.

0792 is provisional: renumber by filename stem at landing after the stacked
batch-37 migrations, preserving their effective-state repair. No backfill.
Recovery is a reviewed forward migration; preserve immutable event/link history.

LATER / SIMPLICITY: contractor-billing-repository.ts read: put this approval
query behind the existing effective-state function through one narrow read
routine, so duplicate reversal semantics stay maintained in one place (implemented).
