# 0201 — CH-4-C owner work-state commands

Sub-order A only, synthetic practice. PostgreSQL execution: NOT RUN in builder
sandbox. RED requires two independent Claude verdicts at the dispatcher commit.

Reuses 0144 events, links, audit and command receipts. Adds private
`ch4_legacy_command_owned(uuid,uuid)` (SQL STABLE SECURITY INVOKER),
`ch4_command_work_facts(uuid,uuid,text)`, `ch4_require_command_owner(uuid,uuid,text)`, `ch4_require_open(uuid,uuid)`,
`ch4_admit_place(uuid,uuid,text)` and `ch4_work_state_command(uuid,uuid,text,jsonb)`.
Only `ch4_record_work_state(uuid,uuid,text,jsonb)` and
`ch4_link_post_lock_job(uuid,uuid,text,jsonb)` gain runtime EXECUTE. All eight are
migration-owned, fixed-search-path, PUBLIC/infrastructure/shadow denied. There
are no table grants, columns, row backfills or identity-bridge changes.

Expands only the existing watchdog identity kind CHECK to the five `WorkState.*`
identities, sharing its existing command advisory lock and tenant-wide key.
Existing legacy watchdog source IDs are checked before a claim. Canonical JSON
hash binds job, action, authenticated actor, session and strict versioned input.
Expected revision is max work-event sequence plus outgoing link count. A stored
result is immutable replay; current authority is checked before returning it.

Locks: finish/cancel retain the live guard's job SHARE lock (no upgrade); other
commands lock jobs UPDATE in UUID order. The command-id advisory lock and existing
event/graph serializers precede revision reads and receipt/effect writes; deferred
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

## v5-r2 — CI run 39465455025

Retains 0201. Replaces `guard_watchdog_input()` with its original tenant check,
recovery-PDF exception, live enforcement, invoker security, search path, owner
and ACL intact. The sole added exception is for migration-owned inserts into
`app.watchdog_command_identity` of `WorkState.close/reopen/link`, bound to the
checked command's matching processing receipt, active owner and synthetic
small-builder job. The command authenticates the session/owner and both link
endpoints before and after waits. Direct runtime inserts cannot take this path,
even with a forged receipt or GUC. No grant, role membership, RLS or job policy
changes. Finish/cancel and all earlier commands retain live enforcement.

The complete prior legacy ownership SELECT is extracted into the private
read-only helper, called at its original position under the same identity lock;
event/link history adds tenant-scoped reservations. It acquires no new locks.
This keeps immutable legacy reads outside the routine that locks jobs UPDATE,
without changing the conservative lock observer or supplier/discrepancy code.
After that check the processing receipt is inserted before the identity, providing
the guard binding; all writes still roll back together and precede audit.

Own upgrade proof now fills every compared predecessor table, applies only 0201,
compares all original rows/types/keys/ACLs, then applies later migrations twice
and compares the named original-column projection. Microsecond and retyping
negative controls and nullable-column/replaced-function/insert positive controls
remain. CI execution is required; no local PostgreSQL claim.

Shared catalogue integration is a HOLD until the coordinator serially applies
`/private/tmp/SHARED-CH-4-C.patch` (one exact helper row in SERIOUS-B5 and LP0,
CH4 call metadata and the replaced guard's pending digest). No shared inventory
was edited in place. PostgreSQL must capture changed definitions; no fabricated
hash or bulk baseline refresh is supplied. Forward-fix/rollout policy above is
unchanged. Two exact-head independent Claude checks and green CI remain due.

## v5-r3 — practice isolation repair

Both actual independent verdicts at head 73a0e755 require S1 repair; the earlier
c1 description of practice authority is superseded. The UUID membership path
remains a trusted server owner boundary. Practice digests additionally require
the merged reader's recursive owned-job closure, including imported lineage,
at every existing authority recheck for target and both link endpoints. Command
link projections use the merged GET direct-digest endpoint filter for practice;
normal owner projections remain tenant-authorized.

Storage receives a transient transaction-local exact command envelope. Its hash,
actor, endpoint/binding IDs and command ID must match the processing receipt and
identity claimed in this DB transaction before it rechecks both endpoints with
the bound authority. The setting is restored after the insert. A setting without
that binding grants nothing. Direct fixture storage without an envelope retains
the predecessor digest-equality rule; runtime INSERT remains denied. No schema,
ACL or migration-number changes; 0201 and all r2 structural repairs are retained.

Actual PostgreSQL execution remains CI-only. Fresh install/0201-only upgrade,
all old suites and new isolation/lineage/replay/lock-wait cases are required.
No data backfill occurs. Forward-fix/rollback guidance above remains in force.
Proposed own trigger-call catalogue metadata is in
`/private/tmp/SHARED-CH-4-C-v5-r3.patch`; root applies it serially. Actual current
catalogue hashes remain a CI capture hold, never inferred from SQL source.
