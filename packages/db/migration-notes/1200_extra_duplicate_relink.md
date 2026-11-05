# 1200 — ENT-3-RELINK-FIX (RED)

Forward repair of the post-unlink billing dead end. Replaces the private
`xa_latest_kind(uuid,uuid,uuid)` projection to skip only duplicate events whose
own command's link has been explicitly reversed. Reissues `xa_mark_duplicate`
from its latest 0522 body, retaining all authorization, graph locking and LP5
completion behavior. No table, column, grant, function configuration or stored
row changes. The shared projection also restores previously approved standalone
extras to revision/export eligibility; unresolved candidates still block export.

1200 is the issued provisional reservation and is above batch-15's migrations.
The proof pins the exact private helper definition; the populated upgrade test
checks unchanged rows and routine security metadata, only the two named body
changes, replay of the migration and recovery of the affected journey.

Recovery: use a reviewed forward migration. Reverting the state projection to
0158 reproduces the dead end for existing reversed links; never delete history
or edit approvals to recover. No backfill is needed. All fixtures are fictional.
Real PostgreSQL fresh/upgrade, race, tenancy, authorization and export tests must
pass in CI, plus an independent RED review of the exact final head before merge.
