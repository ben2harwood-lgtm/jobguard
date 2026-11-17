# 0385 — MON-1 grace and immediate track-review Decisions (RED)

Stacked on mon1-admit / PR #388. The admission function is copied from its latest
base definition in 0380; only unresolved Decision creation is added. The existing
committed-place calculation, tenant serializer, synthetic-only source guards,
locked-job refusal, Solo limit and unblocked Builder admission are retained.

An addition above Solo's five or Builder's twelve paid places raises
`subscription.upgrade`, once per accepted agreement. Beyond Builder's grace place
(14 committed places), it immediately raises `subscription.track_review`, once
per company. IDs bind tenant and purpose (plus agreement for grace). Closing,
reopening, command replay and later additions cannot duplicate these effects.
The latest mon2_issue (0374) and mon2_review (0195) bodies reuse an existing track Decision;
their existing review and operations-card records are still produced by billing
review. This piece adds Decisions only, not a new operations workflow.

No approval or authorization is created. No plan, track, locked bill, fee,
allocation, obligation or price is changed. Builder remains capped at £169 by the
existing computation. No new tables, routines, policies, roles or grants; LP-0's
static write inventory adds app.decision for ch4_admit_place only. SERIOUS-B5 and
entitlement signature/privilege expectations need no additions.

No historical backfill: the next place-adding command supplies authoritative
current facts. Fresh and upgrade PostgreSQL tests are included for CI. Roll
forward on failure with a new migration using these definitions; do not remove
already-created Decisions or change a historical bill. Source checks verify the
three copied routines differ only in the intended Decision additions/reuse.

Repair 1 preserves MON-3 source pinning and zero trial plan/extra numerators from
0373. The trial regression combines immediate admission review with zero-price
issue/replay and immutable source pinning. The lane file remains implicitly
self-editable: the existing lane validator rejects listing config/lanes/ in allow.

Catch-up only after MON-1 / PR #388 merged: 0385 now starts from the latest
0374 mon2_issue body, preserving its first-period acceptance guard alongside
MON-3 source pinning and zero trial numerators. The source-equivalence test
compares against 0374 with the same assertion; integration expectations are
unchanged. Admission remains based on 0380 and LP-0 retains the union with main.

Catch-up local verification (30 October 2026): installed db Vitest,
`run --maxWorkers=2 src/meter-track-review.test.ts src/meter-work-admission.test.ts
src/meter-day-ledger.test.ts`, passed 3 files / 12 tests after building core with
its installed TypeScript compiler. Installed db `tsc -p tsconfig.json --noEmit`,
`node tools/lint.mjs` and `git diff --check` passed. A deterministic comparison
confirmed exact lane paths, no edits to main migrations, and LP-0 differs from
main only by the admission Decision write. The pnpm launcher stalled and was
stopped; direct installed binaries were used without downloads. The initial
Vitest attempt had 10 passing tests and a missing core dist import; building the
existing dependency resolved it. PostgreSQL and browser suites remain for CI
after the router pushes; no local database/browser verification is claimed.

PR #426 CI repair try 1 (30 October 2026), job 124188484524:
core-db shard 4 passed 1200 tests and failed only the repeated reopen fixture
at meter-track-review.integration.test.ts:92. Work-state responses contain the
complete ordered history, so secondClose.events[0] references the first close,
already reopened. Referencing secondClose.events.at(-1) supplies the current
close required by the unchanged transition contract. Only this fixture input
changes; assertions, production code and migrations are untouched.

Local checks with installed binaries: db source suites meter-track-review and
meter-work-admission passed 10 tests; core job-work-state-commands passed 6
tests (including current-close binding); db TypeScript --noEmit, source lint
and lane validation, and git diff --check passed. PostgreSQL cannot start in
this sandbox, so the repaired integration case awaits the router's CI rerun.
