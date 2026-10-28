# 0248 — final-account lock signals the Final Check worker

SV-5 post-lock run (Q6, held for Ben). A new lock inserts one row into
`infrastructure.final_check_signal` through a SECURITY DEFINER trigger, mirroring
`infrastructure.outbox_signal`. Only `jobguard_infrastructure` (the worker's queue login) may read
and mark it; the trigger function has no PUBLIC execute. The row carries identifiers only.
Locks created before this migration get no signal (no backfill).

Rollback/forward-fix: drop the trigger in a later migration; signal rows are disposable queue state.
