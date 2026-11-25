# 2020 · V2 plan scope for approved extras

The checked V2 bootstrap applies this migration after 2004. The shared runner
leaves databases without both the V2 name and the firm policy untouched.

An extra the customer approved now joins the accepted work plan as a scope
item of its own, so the builder can give it a trade, duration, date and
assignee. A plan edit on an extra records the exact approved variation
revision it was made against in the new nullable
`app.v2_work_plan_edit.variation_revision_id`. A quote-line edit leaves it
empty. No backfill is needed: every existing edit is a quote-line edit.

The edit's old foreign key to `app.quote_line` cannot hold an extra's scope
item, so it is replaced by a foreign key to `app.scope_identity` and a
`AFTER INSERT` trigger (after the firm's row-level security check). The trigger keeps the old guarantee for quote-line
edits (the scope item is on the edit's quote revision) and requires an
extra's edit to name an approved addition revision (positive money) of that same
scope item. An approved omission is removed work and is never planned. A second
foreign key binds the revision to its firm and job. No commercial table,
grant or policy changes, and nothing recalculates money.

Correct the schema with a later V2 migration if needed. To rehearse the
previous branch, keep its database in a separate checkout with separate state.
