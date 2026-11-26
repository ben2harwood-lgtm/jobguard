# 2031 · V2 change drafts

The checked V2 bootstrap applies 2031 after the earlier V2 lines. The shared
runner leaves databases without the dedicated V2 database name, the firm
policy or main's variation tables untouched.

It adds `app.v2_change_draft` and `app.v2_change_draft_task`. A draft binds one
existing-scope variation revision, priced through main's unchanged
LogBuilderExtra or revise path, to the accepted quote line it changes: the
accepted and new total quantities and the direction. Each task row holds the
proposed extra minutes and the material needs named by that plan task. Neither
table holds money; the price stays on `app.variation_revision`.

An `AFTER INSERT` trigger refuses a draft whose revision does not describe it
exactly (`V2_CHANGE_DRAFT_MISMATCH`): quantity `|new − accepted|`, the line's
unit, the line's own scope item and job, and the stated direction.

Row security is forced. The runtime is confined to its tenant and, through the
job's practice-firm policy, its firm. It can read and insert only, and rows are
immutable. There is no SECURITY DEFINER function. A second run changes nothing.

For a forward fix, add a subsequent V2 migration and keep the draft rows. To
rehearse the preceding branch, keep the existing V2 state for reference and use
fresh state in a separate checkout.
