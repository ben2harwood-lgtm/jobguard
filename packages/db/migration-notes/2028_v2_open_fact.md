# 2028 · V2 open facts

The checked V2 bootstrap applies this migration after the base's V2 migrations (2027 at this restack) and after the D3,
D4 and B1A migrations once those pieces merge; it is renumbered above them. The shared runner leaves databases without
both the V2 name and the firm policy untouched.

No backfill is needed. A job starts with no open facts.

`app.v2_open_fact` holds one fact a job is still waiting to hear, logged by
hand by the builder: its kind (customer choice, merchant delivery date, crew
availability or access), an optional scope item or plan task, the owner
(customer, merchant, named crew member or builder), the needed-by date and
its source. Each kind keeps its own detail column, and check constraints
refuse a row that fills another kind's column. A customer choice records
whether it may change price; that only flags it for chunk F and never
touches the accepted price. Composite foreign keys bind the scope item and
the plan task to the same firm and job, so a reference from another job in
the same firm is refused.

`app.v2_open_fact_change` holds the append-only changes. Version 0 logs the
fact; later versions answer, cancel or mark it out of date, each with its
expected version, command identity, request digest, verified editor and
server time. The highest version is the current status, and earlier
versions stay as history. An exact retry replays the stored receipt; the same
command id with changed content is refused. Answering writes only this row:
no plan, stock, scope, cost, order, outbox or variation row.

Runtime can only read and append to visible jobs. Nothing is ever updated or
deleted.

Correct the schema with a later V2 migration if needed. To rehearse the
previous branch, keep its database in a separate checkout with separate state.
