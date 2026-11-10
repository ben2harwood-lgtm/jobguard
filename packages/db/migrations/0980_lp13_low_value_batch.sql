-- LP-13 RED: downstream regression marker, no schema/routine/ACL/policy delta.
-- Build-ahead base is LP-6c c2ec9e98. LP-6d and LP-8a safeguards are NOT
-- installed by this marker; the strict integration tests require those siblings.
-- Land only after LP-6d through LP-12, then run the downstream trace suites.
-- No copied routines, new tables, backfill or rollback action.
BEGIN;
COMMIT;
