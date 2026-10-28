# 0305 — MON-1 committed-place admission and transactional refresh (RED)

Capacity admission uses committed places, which include live jobs that have not
started counting today. Daily counted places remain the separate billing/screen
projection introduced in 0300. They are never used as a capacity counter.

The private `meter_work_ledger` is an append-only, tenant-scoped projection of
accepted activation terms, frozen parties, immutable work events, locks and trips.
Its fingerprint includes the London date, current accepted agreement and source
facts. Before every admission, SQL serializes on the tenant, reconstructs the
snapshot, verifies any existing identical fingerprint and reads the stored jobs.
No client count, amount, clock, plan or hidden input is accepted. Identical source
replays reuse a snapshot; source changes append rather than edit history.

Work-event, lock, trip and accepted-plan triggers refresh synchronously. Activation
terms reserve capacity in their transaction. A failed refresh rolls back the
business event and receipt. The existing tenant transaction boundary and checked
CH-4 command take capacity serialization before business/audit locks. This is a
conservative serialization choice covering implicit source writers too.

Solo additions beyond six committed places are refused with a plain message.
Same customer/site grouping and small allowances come from stored server facts.
Builder remains unblocked; first evidence and automatic trips are never refused
because of the cap. Legacy live imports without accepted activation/small-trip
terms remain explicitly `CAPACITY_ADMISSION_UNAVAILABLE`; their amount is never
used to guess classification or omit them from a capacity decision. Missing
agreements and shared practice-company admission remain refused.

The new fresh counted-day reader retains the structurally separate meter owner.
Administrative finalization enables it and retires runtime access to the older
reader atomically, including after an already-finalized predecessor upgrade.
No role gains shadow access or financial writes. The ledger has FORCE RLS and
no runtime/meter/shadow table grants. Existing rows, grants and policies stay intact.

## Explicit remaining scope

MON1-J adds `mon1_today_source` to this same unmerged migration (0305 is not
renumbered; its admission SQL is preserved). This checked entrypoint reuses
lifecycle capture under lock 184. The application derives today's display from
the captured immutable facts with the existing pure counter. There is no new
runtime table grant, credential, supplied count, billing action or issued-period
edit. Administrative finalization assigns the same narrow owner. The prior
stored counted reader and its stale-source refusal remain tested separately.

The browser journey reads the real authenticated screen after real repository
photo/work commands. Parent activations and the historical seven-day boundary
are explicit synthetic fixtures; there is no backdating API or fake meter route.
It proves start, finish tail, stop, restart, replay, real grace admission, seventh
place refusal and cross-company command denial. Disabled shared-practice
resume/reopen controls remain disabled. A normal-company work-command UI is
not introduced here. Automatic stored-day persistence is still the meter-role
period writer's responsibility, rather than a side effect of reading the screen.
Grace/upgrade and Builder track-review Decision delivery also remain separate
MON-1 follow-up; this change authorizes no charge and edits no issued bill.

## Validation and recovery

Targeted local pure/source/API/UI tests and TypeScript checks are recorded in the
router commit message. PostgreSQL fresh/upgrade, concurrency, rollback, corruption,
RLS and held-screen tests are authored for CI; no DB/browser suite ran locally.
An independent RED review and required green CI remain merge gates.

Forward fix only. Preserve immutable ledger/history. If admission must be disabled,
restore the private refusal and disable new work commands with a new migration.
Keep stale counted reads refused. Never turn a cached counter into bill authority.
