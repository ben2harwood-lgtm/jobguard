# 0297 — SV-7A checked intake writer

Adds `app.sv7a_intake_job_source(uuid,uuid,text,text,jsonb)`: one SECURITY DEFINER routine,
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
