# 0348 — MON-1 committed-place admission and transactional refresh (RED)

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
CH-4 command take the job and command-identity locks before capacity, then
per-job event serialization, with audit last. Actual site capture also takes
capacity before its per-job event lock; generic live/source guards stay unchanged.

Solo additions beyond six committed places are refused with a plain message.
Same customer/site grouping and small allowances come from stored server facts.
Builder remains unblocked; first evidence and automatic trips are never refused
because of the cap. Legacy live imports without accepted activation/small-trip
terms make the snapshot unavailable, and admission explicitly refuses with
`CAPACITY_ADMISSION_UNAVAILABLE`; unrelated source writes still commit. Their amount is never
used to guess classification or omit them from a capacity decision. Missing
agreements and shared practice-company admission remain refused.

The new fresh counted-day reader retains the structurally separate meter owner.
Administrative finalization enables it and retires runtime access to the older
reader atomically, including after an already-finalized predecessor upgrade.
No role gains shadow access or financial writes. The ledger has FORCE RLS and
no runtime/meter/shadow table grants. Existing rows, grants and policies stay intact.

## Explicit remaining scope

MON1-J adds `mon1_today_source` to this same unmerged migration (0348 is not
renumbered; its admission SQL is preserved). This checked entrypoint reuses
lifecycle capture under lock 184. The application derives today's display from
the captured immutable facts with the existing pure counter. There is no new
runtime table grant, credential, supplied count, billing action or issued-period
edit. Administrative finalization assigns the same narrow owner. The prior
stored counted reader and its stale-source refusal remain tested separately.

The browser journey reads the real authenticated screen after photo source
events and authenticated work-command HTTP requests. Parent activations and the historical seven-day boundary
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

## Repair round 1

Unknown live-import capacity now returns an unavailable snapshot from refresh
rather than raising inside unrelated AFTER triggers. Admission alone rejects
that snapshot; no cached or partial count authorizes a new place. The regression
suite adopts a real fictional job without activation terms and exercises checked
subscription acceptance, Solo-to-Builder change, finish/replay, close, ongoing
photo activity and a real final-account SQL lock, while admission still refuses.
Site-activity admission is limited to actual activation-backed restarts.

MON1-J drives the new authenticated synthetic normal-company work-command HTTP
route from the browser, alongside real meter reads. Source snapshots are reused
by deterministic tenant/date/input keys rather than appended on every GET.
The public final-account SQL routine takes its job/variation locks before 184,
then its receipt and audit; direct SQL entry does not rely on a post-audit hook.
Required real-PostgreSQL and browser runs remain CI work in this sandbox.

## Last CI repair: source-scoped locking and canonical fact order

Round 4 SQL repair: remove the capacity injection from generic live/source guards.
The live guard again takes only job SHARE, so SV5PRE writers and unrelated
confirmation/evaluation can overlap. Work commands take job then command-ID
before capacity 184 and per-job 144; actual site capture takes 184 before 144.
Final-account SQL takes its job/variation locks before 184, receipt and audit.
This fixes the CH-2 job-source cross-kind cycle and legacy audit/claim inversion
without changing replay results, authority, admission limits or audit guarantees.
The compiled source check reads ../src/tenant-context.ts from both src and dist.
The changed SQL is limited to this unmerged migration; PostgreSQL race and
catalogue execution remain CI evidence, not a local pass.

The SQL commitment clock now uses the core's timestamp/UUID ordering, with
sequence only breaking the cutoff sentinel tie. The existing reversed-UUID
finish/evidence comparison stays enforced. CH-4 fixtures insert their explicit
synthetic commercial track before live so authority, source guards, shadow
foreign keys and unsupported-import detection are exercised as intended.

All other migration files remain unchanged. No timeout, concurrency assertion,
permission expectation or negative control was relaxed.
