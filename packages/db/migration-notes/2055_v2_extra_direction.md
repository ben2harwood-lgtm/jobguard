# 2055 · V2 direction of a no-charge approved extra

The checked V2 bootstrap applies this migration after 2020. The shared runner
leaves databases without both the V2 name and the firm policy untouched.

A variation stores no direction apart from the sign of its money, so a £0
approved extra ("move the socket, no charge") was held back from the plan as
`direction_unknown`. The new `app.v2_extra_direction` records the builder's
answer once per approved revision: `adds_work` or `removes_work`. Its primary
key is `(tenant_id, job_id, variation_revision_id)` and the command ID is
unique per job. An `AFTER INSERT` check (after the firm's row-level security
check) refuses a row unless the revision is approved, has
`signed_delta_pence = 0` and belongs to the named scope item. Rows are
immutable (`app.reject_immutable_authorization_record()`). RLS is enabled and
forced with the 2020-era tenant-plus-job policy, `PUBLIC` has no access, and
`jobguard_runtime` gets `SELECT, INSERT` only.

`app.v2_work_plan_edit_scope_check()` is replaced with one change: an
extra's edit is accepted for a positive revision **or** a £0 revision with an
`adds_work` answer. Nothing else in the function changes.

No commercial table, grant or policy changes, and nothing recalculates money.
No backfill is needed: before this migration every £0 extra was
`direction_unknown`.

Correct the schema with a later V2 migration if needed. To rehearse the
previous branch, keep its database in a separate checkout with separate state.
