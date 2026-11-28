# 2062 · V2 scope measurements

The checked V2 bootstrap applies this migration after installing the firm
visibility policy and linked editor helper. The shared runner leaves databases
without both the V2 name and the firm policy untouched.

No backfill is needed. An existing scope item starts at version zero with no
measurement. The highest revision is the current measurement. Its source,
version, command identity, verified editor and server time also form the
append-only receipt. A confirmed revision uses the same editor and time for
its confirmation. Runtime can only read and append to visible jobs. A
composite foreign key binds every revision to its firm, job and scope item.

Correct the schema with a later V2 migration if needed. To rehearse the
previous branch, keep its database in a separate checkout with separate state.
