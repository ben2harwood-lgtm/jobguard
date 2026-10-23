# MON1-T — private small-job trip source v1

Build-ahead foundation on CH-4-C `14eca75074217fa82fb719c38cac8a997eec59ad`.
Synthetic only; not accepted, wired, enabled or independently reviewed.
The issued order reserves migration `0206_meter_small_trip.sql`. The order's
branch `codex/sandbox/mon1-t` supersedes the draft's proposed branch name.

## Storage and replay

`app.job_small_trip_event` has one immutable identity per tenant/job. Its original
crossing, baseline, activation, exact net and source hash never change.
`app.job_small_trip_observation` carries append-only numbered derivations, an
explicit predecessor, crossing approval/revision, canonical contributing approval
IDs, exact net, original effective time, recorded time, policy and audit reference.
The latest observation is the current source projection; it does not replace any
issued computation or statement. An earlier delayed crossing adds a revision under
the same trip ID. Identical replay adds neither an observation nor an audit event.
A later omission never removes a historical crossing.

The private function is:

```sql
app.mon1_capture_small_trip(t uuid, j uuid, source_kind text, source_id uuid) RETURNS uuid
```

Kinds are `activation` (the immutable activation ID) and `variation_approval`
(the immutable approval ID). The activation case validates the source and allows
reconstruction; an originally small baseline cannot itself exceed the trip limit.
The function returns null without a qualifying crossing. It resolves all money,
origin, revisions and timestamps from stored sources. It accepts no price, date,
trial/small flag, capacity override, actor, or arbitrary JSON. It does not send,
charge, write a fee, create an approval or update operational work state.

The replay starts from `job_activation_terms.accepted_net_pence` and only runs for
its immutable `small_job=true`, small-builder synthetic track. It examines
builder-logged/final-review approvals in `(created_at,id)` order, replacing each
variation's value only with a higher approved revision. A newer unapproved price,
rejection or withdrawal cannot revoke approved terms. The approval and revision's
job, variation, revision number, hash and signed amount must match. Catch origins,
payments and unapproved proposal rows are not inputs; no shadow relation is read.
Only approvals at/after activation and strictly before an existing lock qualify.
The crossing is `net > 400000p`; 400000p remains small. SQL uses exact numeric
intermediates and the existing 1000000000000p magnitude limit, not float arithmetic.

Time choice: `variation_approval.approved_at` is caller-supplied in the existing
repository. This version uses the immutable row's server-default `created_at`
instead. The original six-digit UTC time is preserved through hashing and reads;
pg's JavaScript Date conversion is avoided. Future integration must preserve that
server fact provenance: the predecessor table still permits a raw privileged/source
writer to supply `created_at`. This foundation does not claim to repair that
predecessor boundary, authenticate a supplied timestamp, or accept fixture dates as
runtime command evidence. The fixture suites intentionally supply fictional source
times to exercise late-arrival replay.

## Transaction handoff — STOP pending coordinator confirmation

The function is SECURITY INVOKER, owned by `jobguard_migration`, with EXECUTE
revoked from PUBLIC/runtime/infrastructure/shadow. It checks `current_user` and
transaction-local tenant context. It is only usable inside a checked migration-owned
source composition routine; no HTTP route or direct runtime command is added.

Required order: authenticate/authorize → tenant exclusive advisory lock
`hashtextextended(tenant::text,184)` → recheck current session/membership/permission
→ ordered job/variation/source locks and source effects → this capture seam → audit
head last. The function verifies that the tenant lock is already held through
`pg_locks`, then locks the job; it never acquires a tenant lock late. Its final
observation audit uses the existing chain allocator and commits or rolls back with
the source transaction. No subsequent business lock may be acquired by the caller.
The public source's authorization/replay checks must precede this private call;
retained historic approval actors need not still be members at delayed processing.
This is not a replacement for checking the current invoking actor.

`test/lock-order-1.test.ts` describes typed deadlock/serialization mapping;
`lock-order-1.integration.test.ts` also demonstrates inspecting real advisory locks.
Neither confirms MON1's complete tenant/job/variation/receipt/audit order. Existing
approval code appends audit itself; MON1-I must supply the accepted reordered
composition and source/lock races. No trigger is attached to a source table here.
Calling after a source-owned audit lock is not authorized by this contract.

Both new tables have FORCE RLS, tenant/job-qualified keys, immutable
UPDATE/DELETE/TRUNCATE protection and runtime SELECT only. Existing activation,
quote and revision composite FKs are reused. Approval has no existing unique
`(tenant,job,id)` key; its FK is `(tenant,approval_id)` and the private routine also
checks the approval's job/variation/revision binding. No historical parent table
is altered to create a new key. Runtime cannot insert, mutate or truncate trips.

`readSmallTrip(transaction,jobId)` is a relative-import server helper for an already
job-authorized read transaction. It returns a strict versioned projection or null,
never creates a transaction or approval, and grants no job/session authority. Normal
company/practice ownership and revoked-session checks remain the calling owner's
responsibility. Tenant RLS is not proof against a caller selecting false tenant
context or reading another practice job without its application authorization.
Do not expose this helper through shared-practice or company HTTP paths without
the accepted H-PRACTICE/H-HTTP composition.

## Late changes and consumer holds

A reconstruction that would remove/postpone a latched crossing raises
`SMALL_TRIP_RECONCILIATION_REQUIRED`; it never restores smallness or edits history.
Out-of-range arithmetic raises `SMALL_TRIP_TOTAL_OUT_OF_RANGE`. These private errors
must not be rendered as a warning/count on Log an extra, pricing or approval.
Trip effects themselves never perform or refuse capacity admission.

MON1-I owns qualifying approval/final-review/activation hooks and unchanged public
responses; MON1-S owns actual-source computations and next-period correction
uniqueness. M1T-05's exactly-one correction and unchanged issued statement proof,
M1T-06/07's real source/lock race proof, M1T-08's current/revoked session proof and
M1T-09's public consumer/UI proof remain held. A private fixture pass cannot close
them. Negative corrections and a closed receiving period retain their existing
holds; this leaf invents no refund, carry-forward or correction ceiling.

All common holds survive: H-PREDECESSORS, H-NORMATIVE, H-CH4, H-METER-CLOCK,
H-TRIAL-CLOCK, H-CONVERSION, H-PRACTICE, H-HTTP, H-IDENTITY, H-B, H-ENABLE,
H-EXTERNAL, H-CH4-Q01/Q03, H-REVIEW and H-LIVE. The issue authorizes this build
on an unmerged base; it is not evidence that any dependency, reviewer appointment,
policy approval, CI run, separate acceptance or merge has occurred. Live/provider,
real-data, trial/charging enablement and parent MON-1/DEMO-S closure remain held.
