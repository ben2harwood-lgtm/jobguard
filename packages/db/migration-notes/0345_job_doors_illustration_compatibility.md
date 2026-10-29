# LP-2 illustration compatibility

0344 preserves the original LP-2 contract SQL bytes. This additive forward fix reinstates the merged 0192 fixed demo principal, current owner, small-builder track, command/job locking, replay and conflict checks, plus LP-2's trusted database restriction. No new grant, table, backfill or financial write. Forward repair only; do not restore unchecked privileges.

CI: `lp-practice-doors.integration.test.ts` and `fee-illustration-later.integration.test.ts` cover wrong databases/companies, forbidden tracks, replays and conflicts. PostgreSQL execution is unavailable in the builder sandbox.
