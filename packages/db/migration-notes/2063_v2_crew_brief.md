# 2063 · V2 unpriced crew briefs

The checked V2 bootstrap applies this migration after installing the firm
visibility policy and linked editor helper. The shared runner leaves databases
without both the V2 name and the firm policy untouched.

No backfill is needed. A trade starts with no brief. Each generation appends a
revision holding the composed brief, the builder's access window and the
ordered photos picked for that trade; the highest revision is the current brief.
Every generate command also appends a receipt with its inputs, verified
editor, server time and the brief revision it returned. A command that finds
the current brief unchanged gets a receipt but no new revision, so a replay
returns the same result and a changed replay is refused. Each recorded command
also appends one tenant audit event in the same transaction (identifiers,
counts and hashes only); a replay appends nothing. The brief is built only from plan tasks, scope wording and the picked
photos. It stores no price or value, and no commercial-integrity source is read.
Composite foreign keys bind each brief to its job's plan revision and each photo
to an original image of the same job. Runtime can only read and append to
visible jobs.

Correct the schema with a later V2 migration if needed. To rehearse the
previous branch, keep its database in a separate checkout with separate state.
