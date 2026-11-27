# 2063 · V2 materials enquiry draft

The checked V2 bootstrap applies this migration after 2005. The shared runner
leaves databases without both the V2 name and the firm policy untouched.

No backfill is needed. A job starts with no material lines and no enquiry.
`app.v2_material_line` holds the builder's append-only revisions of each line
on a scope item: product, pack size, wastage allowance, usable packs set
aside, supplier, needed-by date, who supplies it, notes and an optional pack
count of the builder's own. Each revision stores only the fields it changed,
with its expected version, command identity, verified editor and server time.
A pack count the builder types is stored with the calculated count it
replaced, so a later change to the sum flags it as a clash instead of
silently keeping it.

`app.v2_material_enquiry` holds generated enquiry versions. Each one keeps
the exact inputs it was built from and their digest. Whether it is current is
worked out on read by comparing that digest with the live inputs, so no row is
ever updated. Customer-supplied lines are listed apart and never enter an
enquiry group. Generating writes only these rows: no order, outbox row or
message.

`app.v2_material_enquiry_command` records every accepted generate command
with its expected version and the enquiry it returned, including a command
that returned an enquiry that was already current. An exact retry replays
that result even after the inputs change; the same id with a different
expected version is refused. A generate whose expected version is not the
latest is refused, so a race between two different commands leaves one
winner.

Runtime can only read and append to visible jobs. Composite foreign keys bind
every line to its firm, job and scope item, and every enquiry to its firm and
job.

Correct the schema with a later V2 migration if needed. To rehearse the
previous branch, keep its database in a separate checkout with separate state.

## Firm lock

V2's linked practice firms share one backing tenant, so the tenant rule alone does not separate them. Each of the three
tables also carries 2001's restrictive `v2_practice_firm` rule through `app.job` on `(tenant_id, job_id)`, the same rule
2047 and 2059 add for the other V2 tables. `tools/v2/firm-lock/FL-D3.checks.mjs` proves firm B and firm B's real company
read none of firm A's rows.
