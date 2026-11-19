# 0767 LP-8b outbox and evidence

Port of the checked LP-8b change at `4f3f1589c36147a3bd9523feddad85786ad7629b`, based on LP-8a and LP-11 at `f9ce1568948bbad150b1fbfacc3955c66e4e9ee5`.

Checked outbox inserts start pending and validate the bound approval, exact payload and one-action-per-approval constraint. The existing 0764 invoice routines can record synthetic delivery as completed in the issue transaction. The trigger requires the migration-owner writer, exact synthetic invoice, approval, PDF bytes, hash, effect key and transaction timestamps for that case. Both 0764 routine definitions and their upgrade pins are retained.

External upload verification uses LP-11's bound tenant and actor. The adapter reads and validates the exact storage object version. PostgreSQL checks the supplied bytes against the upload and locks its measured length and verified metadata. Checked owner routes for generated evidence retain their existing source contracts. The evidence, extra-event, prevention and allocation checks add no write grant to the closed allocation tables.

Historical prevention actors come from matching command receipts. Historical verified lengths come from matching finalized originals. The migration takes the relevant table locks, runs the backfill as the schema owner and restores FORCE RLS in the same transaction. Conflicting existing outbox approvals cause the unique index build to fail atomically. Forward-fix a conflicting deployment in a later reviewed migration. Preserve issued documents, outbox history and evidence versions.

The proof records catalogue deltas observed on PostgreSQL 16 across 0767, including the outbox ACL and index, the new routine definitions and grants, and the triggers. LP-11's follow-up web-journey repair needs a later merge and verification against the resulting head.
