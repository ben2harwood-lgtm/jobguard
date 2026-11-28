# 2070 V2-K5A payment schedule

Working planning data only; this table has no invoice, approval, payment or send
consumer. M4-18 and a separately approved K5B remain responsible for invoicing.
Amounts are net GBP, like the accepted snapshot's netPence and approved builder
variation deltas. UI amounts are exact decimal strings. No tax policy is added.

One immutable schedule per accepted quote revision; the set command records
person (the existing linked V2 editor helper), server time, job, expected version
and replay identity. The helper resolves the real owner's membership, as for C2;
it is deliberately not a membership in the shared synthetic tenant. No new identity authority or SECURITY DEFINER routine is introduced.

New runtime grants: SELECT/INSERT on the schedule and its task confirmations; both are non-authoritative working plans.
RLS is enabled and forced; the existing bound tenant helper and parent job's
firm visibility are both required. UPDATE/DELETE/TRUNCATE are never granted.
Both the set command and the task-done command append one tenant-chain event in their transaction; replay appends nothing. Source approvals, stages and acceptance remain unchanged.

The projection replays server-recorded approved builder extras and the first task
completion/date trigger in time order. Due stages keep their amounts even if an
extra was approved before the first read. Task triggers bind the exact stored plan task. The builder explicitly confirms task completion for the schedule using an immutable task confirmation. This is needed because c3 has no per-task completion command; it does not alter the work-plan repository or claim to complete its separate proof gates.
Acceptance triggers become due immediately. Dates use Europe/London midnight.
Planned amounts share each extra proportionally, using existing half-even
rounding; the last takes the remainder. Extras outside the remaining stages are
shown separately, including omissions too large to reduce only planned stages.
Hidden JobGuard catches are excluded at the source query by origin.

The shared migration runner discovers 2070, but changes nothing outside the
checked V2 database and firm-policy fence. Bootstrap applies it after 2001–2004.
No backfill. Shared catalogue proofs are empty because those databases have no
V2 table; the appended full V2 seed tests exercise the actual grants and RLS.
The purchase-order upgrade fixture defers this V2-only migration with the other
V2 entries. Reapplying is idempotent. Forward-fix in a later allocated migration;
for local rollback retain the existing rehearsal database and provision fresh
state from the preceding checkout. Do not drop schedules or audit history.

Renumbered 2012 -> 2070 above v2/main (2061 F8) and the claimed V2 numbers (2067 is E7 in the register). Both tables carry the
standard restrictive `v2_practice_firm` lock (a mandatory app.job join on tenant_id and job_id), so the
FL guard covers them with no pending file.
