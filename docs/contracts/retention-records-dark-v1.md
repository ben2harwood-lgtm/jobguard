# Synthetic retention records v1 — M4-20 remains open

`RetentionRecordRepository.command(context, actor, raw)` accepts a strict
`retention-record-command.v1` envelope with `commandId`, `jobId`, and `record`.
The record uses the existing core v1 format with `id`, `tenantId`, and `jobId`
omitted. Its ID is the command ID. Human sources omit `actorId`; the repository
adds the membership returned by the current synthetic company session. `actor`
is the trusted caller's `{ sessionDigest }`, separate from raw input. No caller
input can enable retention, supply tenant authority, or forge a human actor.

`read(context, jobId)` returns `{ book, reconciliation }` from stored rows only.
The verified context is the read authorization boundary; the write routine also
rechecks the persisted session and owner/admin membership on prepare and append.
Foreign and nonexistent job IDs both return `RETENTION_NOT_FOUND`. Reads and
commands reject malformed stored histories through the existing core schemas.

One append-only tenant/job table stores kind, record, hash, command ID, session
membership, server time and book ordinal. The routine takes a transaction-scoped
job lock before loading history. Core `appendRetentionRecord` validates under
that same lock and transaction; append rechecks the book hash and session. Exact
replays append neither a second record nor a second audit event. Conflicting
replays fail. Reviews remain reviews until a human resolution exists. Reversals
are additional records and never reopen a consumed release approval. Date changes
are profile revisions; earlier rows remain immutable.

Like the existing dark billability adapter, core validation is a trusted server
repository responsibility. The SQL append entry point protects storage, session,
actor, job, hash and concurrency boundaries; it does not duplicate core financial
arithmetic. A compromised runtime connection invoking that entry point directly
is outside the core-validation guarantee. RLS protects storage within the verified
tenant context; it cannot authenticate a tenant context chosen by compromised
application code. This adapter is not approved for live composition.

Migration 0753 grants runtime EXECUTE on the one bounded routine only. Tables
remain private, migration-owned and FORCE RLS protected. The routine restores the
caller's tenant setting, including on failure. Audit contains references/hashes,
never descriptions. This is a synthetic draft archive, not a commercial command,
Decision approval, invoice issue or qualifying settlement. It adds no HTTP route,
registered application command, worker, reminder owner, scheduler or composition.

`RETENTION_BALANCES_ENABLED` stays false and `assertRetentionIssueAllowed` still
refuses. Existing issue blockers remain unchanged. G0–G5, demand after pilot,
RETENTION_REVIEW_OWNER wiring, D06 v2 templates, D02 tax and independent RED review
remain held. No retention release is automatically fee eligible. M4-21 is untouched.

## Synthetic timer review slice (0760; M4-20 remains open)

The earlier no-worker statement describes 0753. `retention-release-review-v1` now
has one Graphile discovery owner, registered only in `synthetic_demo`; elsewhere
registration returns an empty crontab and installs no tasks. Discovery emits only
tenant IDs; queue payloads contain version/tenant only, keyed by tenant and database
minute. Execution uses the existing worker context constructor and an
infrastructure-only repository port, with no human impersonation.

`infrastructure.discover_retention_reviews()` observes current profile conditions
that are due and have no review for that profile/condition. The bounded
`infrastructure.retention_timer` prepares and appends under the existing job lock.
Core validates the stored book and each proposed append using the database date.
Retries, duplicate workers and crashes cannot append a second review for that
condition/revision. A changed date requires a new profile and a new review; old
approvals cannot release against it. Timer rows have no membership actor and audit
uses the named system owner. Human records retain their original actor contract.

Only EXECUTE on these routines is granted to the existing infrastructure role.
There is no direct table access, no new role and no resolution, satisfaction,
release, notice, invoice or money capability. FORCE RLS stays active and routines
restore the caller tenant value even on failure. D02/D06 and production gates stay
closed; the retention flag remains false. Real PostgreSQL CI and independent RED
review are required before landing; this does not finish M4-20.
