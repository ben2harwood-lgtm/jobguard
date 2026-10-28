# 0297 — SV-7A checked intake writer

Adds `app.sv7a_intake_job_source(uuid,uuid,text,text,jsonb)`: a SECURITY DEFINER routine,
migration-owned, runtime EXECUTE only, that records an off-site job-diary note or an owner-entered
message from a named fictional customer on a live, unlocked synthetic small-builder job.

It authenticates the persisted practice session and job ownership through the CH-4 seam
(`ch4_require_command_owner`) before any read and again after each wait, takes the job SHARE lock and
the shared `watchdog-command-id` lock, binds every input field to durable idempotency (exact replay
returns the stored receipt; a changed payload is IDEMPOTENCY_CONFLICT), then writes the verified upload,
original evidence object, immutable original bytes and the diary/message row in one transaction with
an audit event that carries identifiers and the SHA-256 only. The existing 0164 insert guards and
deferred binding trigger still apply.

Safest synthetic choices (Ben, 23 Oct): an on-site note is first site evidence and waits for MON-1
place admission, so it is refused with CAPACITY_ADMISSION_UNAVAILABLE before any effect; any new
source after the final-account lock gets POST_LOCK_WORK_REQUIRES_LINKED_JOB. The reviewed decoder
reference is set by the server only for the exact fictional texts. No shadow table is read or
written and no detection is scheduled.

Rollback/forward-fix: revoke runtime EXECUTE in a later migration; recorded sources stay immutable.

Repair round 1: `app.sv7a_require_watchdog_live_lock(uuid,uuid,text)` checks the same
CH-4 owner authority before and after taking the job SHARE lock in a separate statement.
The writer repeats authority checks and defers lifecycle validation until after durable
replay. The source-insert trigger retains SHARE instead of upgrading to UPDATE, avoiding
a cycle with another replay waiting for the command-ID advisory lock. Final-lock and
close/reopen writers still serialize with SHARE through their UPDATE lock. The shared
legacy-ID lookup includes immutable diary and customer-message rows, so other command
kinds cannot claim their IDs when modern bookkeeping is absent. No privilege is broadened
on job tables; both entry points remain migration-owned with runtime EXECUTE only.

Repair round 2: the shared legacy-ID lookup checks source-table presence through
`to_regclass` before including either source in its SQL. Pre-0164 upgrade fixtures
keep working, and current schemas still refuse IDs owned by either source kind.
Presence is checked per claim in the same transaction, with no cross-upgrade cache.
