# 2022 · V2 customer choices and allowances

The checked V2 bootstrap applies this migration after 2009 (E1 open facts).
The shared runner leaves databases without both the V2 name and the firm
policy untouched. No backfill is needed: a job starts with no allowances.

`app.v2_choice_allowance` holds one version of the allowance for an E1
customer-choice fact: basis (per unit or total), allowance amount in integer
pence, quantity and unit (per unit only), decide-by date and, once made, the
chosen item and its price. Each row is never updated. It is also E9's
intent: before any variation command runs, it fixes the ids of the earlier
draft to withdraw (and its rejection id, with the true reason
`superseded_by_choice_change`) and of the new draft to propose and price.

`app.v2_choice_allowance_step` holds the append-only steps of a version:
`current` once any withdrawal is done (its outcome says whether the old draft
was withdrawn or kept because the builder had already approved it), then
`proposed` and `priced` for a new draft. A read or retry finishes any
version whose steps are missing, with the same ids, so nothing is orphaned
or duplicated.

Runtime can only read and append to visible jobs; nothing is updated or
deleted. Amounts are never committed here: the draft is a variation the
builder reviews and approves through the existing variation command.

Correct the schema with a later V2 migration if needed.
