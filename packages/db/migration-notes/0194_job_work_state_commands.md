# 0191 — CH-4-C owner work-state commands

Sub-order A only, synthetic practice. PostgreSQL execution: NOT RUN in builder
sandbox. RED requires two independent Claude verdicts at the dispatcher commit.

Reuses 0144 events, links, audit and command receipts. Adds private
`ch4_require_command_owner(uuid,uuid,text)`, `ch4_require_open(uuid,uuid)`,
`ch4_admit_place(uuid,uuid,text)` and `ch4_work_state_command(uuid,uuid,text,jsonb)`.
Only `ch4_record_work_state(uuid,uuid,text,jsonb)` and
`ch4_link_post_lock_job(uuid,uuid,text,jsonb)` gain runtime EXECUTE. All six are
migration-owned, fixed-search-path, PUBLIC/infrastructure/shadow denied. There
are no table grants, columns, row backfills or identity-bridge changes.

Expands only the existing watchdog identity kind CHECK to the six `WorkState.*`
identities, sharing its existing command advisory lock and tenant-wide key.
Existing legacy watchdog source IDs are checked before a claim. Canonical JSON
hash binds job, action, authenticated actor, session and strict versioned input.
Expected revision is max work-event sequence plus outgoing link count. A stored
result is immutable replay; current authority is checked before returning it.

Locks: both jobs in UUID order for links, otherwise one job; shared command-id
advisory lock; existing event/graph serializers; receipt/effect writes; deferred
audit drain last. A second CH-4 command in the same transaction is refused before
business locks using the database xid8 claim, not a caller-set flag. Post-wait and
post-audit authority checks reuse persisted authentication. If the existing
approval fence is enabled, its session/member locks were acquired before job
locks and subsequent checks revisit those already-held locks.

Replaces exactly these installed definitions:

- `ch4_guard_final_check_admission()`: all new statuses, including completion.
- `job_source_insert_guard()`: serialize diary/message/original insert, recheck
  actor after waits, refuse post-lock and closed intake.
- `ch4_guard_new_site_work()`: additionally refuse closed new site sources after
  genuine existing replay exits; existing image guard ignores client purposes.
- `reveal_shadow_signals(uuid,uuid)`: open check under existing job serialization,
  before audit/reveal. Emergency and must-surface disclosure remain unchanged.
- `issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)`:
  exact 0187 implementation plus open-state check after successful replay.
  All PDF, line, tax and authorization behaviour remains intact. Legacy invoice
  routine remains the separately recorded SV-5 debt.

B must implement tenant-capacity-first admission; until then unlocked reopen and
resume refuse without receipts/effects. Locked reopening only reopens work
administration; it changes no job status, lock, baseline, trial or check. Timing
STOP T-01 prevents derived operational intervals and any implicit counting restart
from being credited as implemented. Existing source facts remain immutable inputs;
B must connect source restart admission before using them to add a place.

Recovery: forward fix only. Do not delete receipts, events, links, audit, locks or
issued invoices. Disable mutation transport during any failed rollout; older reads
remain compatible. Privilege inventory additions are source-derived exact
signatures; changed/new definition hashes require PostgreSQL catalogue capture
in CI (recorded as null, not fabricated). Fresh/upgrade/races/runtime-role suites
must run before acceptance; no production capability or billing is enabled here.

## c1 (rulings 124/126)

Edited unmerged migration 0194 in place. Adds private
`ch4_command_work_facts(uuid,uuid,text)` (migration owner, no runtime grant),
so normal owner commands do not depend on the practice-only public read routine.
The command authority argument is either the server-authenticated membership UUID
or a persisted practice digest; membership IDs are trusted server inputs like the
existing final-lock owner commands, not bearer credentials or user body fields.
`final_lock_require_owner` enforces current owner role, tenant, revocation and
expiry. RLS does not protect against a compromised trusted server selecting an
arbitrary actor/tenant. Replaces `ch4_storage_integrity()` preserving ACLs: link
endpoints need not share a practice digest; command events do not require the
creator's practice session to remain active. Source and photo gates stay intact.
No data/backfill/schema changes. Before merge, edit/reapply in a fresh synthetic
database; after deployment use a separately reviewed forward-fix migration.
PostgreSQL upgrade/catalog/privilege tests are updated but NOT RUN here.
