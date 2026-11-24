# 2007 · V2 unpriced crew briefs

The checked V2 bootstrap applies this migration after installing the firm
visibility policy and linked editor helper. The shared runner leaves databases
without both the V2 name and the firm policy untouched.

No backfill is needed. A trade starts with no brief. Each generation appends a
revision holding the composed brief, the builder's access window and the
ordered photos picked for that trade; the highest revision is the current brief.
Its command identity, verified editor and server time form the append-only
receipt. The brief is built only from plan tasks, scope wording and the picked
photos. It stores no price or value, and no commercial-integrity source is read.
Composite foreign keys bind each brief to its job's plan revision and each photo
to an original image of the same job. Runtime can only read and append to
visible jobs.

Correct the schema with a later V2 migration if needed. To rehearse the
previous branch, keep its database in a separate checkout with separate state.
