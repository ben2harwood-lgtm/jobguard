# FEE-BOTH-1 builder receipt

12 October 2026 · branch `codex/sandbox/fee-both-1` · check lane **RED**.

Base: `d58560e39bd726dc3eba08e763ef465d98b23cb0`, the merge of #154.
Builder starting HEAD: `e11e9db4a25dc5e865e7b0a41ad0fbe24ee0ad03`.
The fee rule and nine expected values were committed by the coordinator in
`58066db355428fb45332020685e1ed7fac393590` (**58066db**), before this builder began.
The dispatcher committed the six-path lane entry in `e11e9db`. Both commits and
all their working-tree files are untouched by this builder. The builder adds only
`fee-both.test.ts` and this receipt folder. No builder commit exists; the dispatcher
owns the next commit. No git write, fetch, push, merge or pull request was performed.

Base proof: `git merge-base --is-ancestor d58560e HEAD` exited 0; `git log -3`
shows e11e9db, 58066db, d58560e. `transitions.ts` contains `raisingRoles` and
`transitions.test.ts` contains all six `[AL-6] merged fee rule / …` rows.
The lane has the exact six allow paths and AFTER content. Its placement is the
dispatcher's existing placement (before ent-4b); the issued header forbids editing it.
ENT-4c is absent from this base; its `senior`, `unlinkRoles` and row 89 are untouched.
The two pieces overlap in origin.ts and whichever merges second needs the ordered catch-up.

Read: AGENTS.md; BUILD_PLAN §2.4 C1/C6/C8, §9.1.4–5, §9.1.9, §9.1.11,
§9.1.13; D16; whole origin/fee implementations, contracts/transition boundaries,
merged fixtures/tests, shared allocation/rational/cumulative kernels, the
ENT-4a-ALIGN receipt and standing handoff rules. No skill applies to this pure-core leaf.

## Founder authority and locked-test procedure

Card: `jobguard-fee-on-surveyor-extras-2026-10-12`.

Question, verbatim: **"Should JobGuard's fee apply to a site extra logged by a surveyor, or by a supervisor who is not named on that job?"**

Answer, verbatim: **"charge on both"** (selected option "Charge on both").
The issued header also records Ben's typed **"yes, charge on both"**.
The coordinator accepted the card answer as the product decision and committed
the locked rule/test change under option B.

Coordinator scope, verbatim: **"the fee rule and its test rows change to apply to both; the change is to the fee rule only, the recording lists are untouched; state every changed expected value before and after; proposed terms and synthetic data only, real charging stays locked."**

"Charge" here means qualifying principal in a pure, non-posting derivation only.
D16 stays `proposed`; no obligation, invoice, journal, fee collection or activation
is created. There is no start date in this predicate. Grants still cover this job
and tenant, including a supervisor named on another job or on none.

## The two checkers' questions — answered first

1. **"does any amount change for any case other than the two Ben named?"**
   No qualifying principal changes outside surveyors (named or not) and supervisors
   not named on this job. Five of twenty cells count after the change; only three
   changed. A section's exact fee changes only by the newly counted principal
   times the rate, then the section total is rounded once. The difference between
   rounded totals need not equal rounding the added principal separately.
   A statement holding a newly counted extra changes by design. The unedited
   largest-remainder allocator can also move a penny on another extra's line:
   FB-6 has X's unchanged principal 15p, X's fee line 2p → 1p, Y's 0p → 1p,
   total 2p → 2p. This is accepted Q8, not a different principal rule.
2. **"is every changed expected value in the order's table, with the right before and after?"**
   Yes: all nine existing changes are listed below, cell by cell. No tenth value
   was found and no other existing expected value changed. The coordinator owns
   those changes; the builder changed no existing assertion. All 96 existing
   transition tests retain their names and pass. The 71 new tests use literal
   expectations from the order, rather than changing any merged expectation.

Both independent checkers still must answer these questions themselves and
reproduce statement M **by hand**, including 2,500p before, 4,541p after and
lines 1,500 / 1,000 / 1,235 / 806 / 0 / 0 / 0 / 0. This builder receipt is not their verdict.

## Table 1 — whole role/naming rule and test mapping

Each cell is proved by its own `[FB-1] site_user / ROLE named=BOOLEAN` test.
For example, surveyor/not named maps to `[FB-1] site_user / surveyor named=false`.
All cells additionally pass the site, exact principal, production eligibility and
real-kernel reference statement assertions. Capitals mark all three changed cells.

| Role | Named on this job: before → after | Not named: before → after |
|---|---|---|
| operative | counts → counts | no → no |
| supervisor | counts → counts | NO → COUNTS |
| surveyor | NO → COUNTS | NO → COUNTS |
| commercial_manager | no → no | no → no |
| finance | no → no | no → no |
| admin | no → no | no → no |
| owner | no → no | no → no |
| read_only | no → no | no → no |
| client_approver | no → no | no → no |
| connector | no → no | no → no |

Five count, fifteen do not; `[FB-1] twenty cells cover each role twice, exactly five count`
checks both coverage and cardinality. Other conditions still have to hold.

## Nine existing expected values

Lines are the base's line numbers; the test name is unchanged in every row.
Principal values below are exact pence with denominator 1.

| # | Line / AL-6 case | Field | Before | After | Result |
|---|---|---|---|---|---|
| 1 | 280 / surveyor named=true | site | false | true | CHANGED AS ORDERED |
| 2 | 280 / surveyor named=true | principal | `{numerator:0n,denominator:1n}` | `{numerator:15000n,denominator:1n}` | CHANGED AS ORDERED |
| 3 | 280 / surveyor named=true | fee | false | true | CHANGED AS ORDERED |
| 4 | 281 / surveyor named=false | site | false | true | CHANGED AS ORDERED |
| 5 | 281 / surveyor named=false | principal | `{numerator:0n,denominator:1n}` | `{numerator:15000n,denominator:1n}` | CHANGED AS ORDERED |
| 6 | 281 / surveyor named=false | fee | false | true | CHANGED AS ORDERED |
| 7 | 282 / supervisor named=false | site | false | true | CHANGED AS ORDERED |
| 8 | 282 / supervisor named=false | principal | `{numerator:0n,denominator:1n}` | `{numerator:15000n,denominator:1n}` | CHANGED AS ORDERED |
| 9 | 282 / supervisor named=false | fee | false | true | CHANGED AS ORDERED |

**no other existing expected value changed**. The other three AL-6 rows retain
their values. origin.test.ts and fee.test.ts have zero expected-value changes.
The exact before/after statement and four test lines appear in the FB-10 outputs below.

## Acceptance criteria

| ID | Result | Evidence |
|---|---|---|
| FB-0 | MET under issued option B | Coordinator owns prior red/green evidence; builder's Run A passes 167. No old-rule edit or old-rule builder run. See limits below. |
| FB-1 | MET | Twenty distinct `[FB-1] site_user / …` rows and shape test (21). |
| FB-2 | MET | `[FB-2] exact kernel / …` rows (3); literals 1234, 1000, 806. |
| FB-3 | MET | Seven unchanged-kind rows, 24 exclusion rows with qualifying controls, incomplete-composition refusal (32). |
| FB-4 | MET | Three earliest-origin rows plus two-canonical refusal (4). |
| FB-5 | MET | M's literal eight lines; reversed and rotated groups (2). |
| FB-6 | MET | Another extra's penny moves without changing its principal or total (1). |
| FB-7 | MET | Surveyor credit/cutoff, supervisor reversal, missing compensation link, older snapshot (4). |
| FB-8 | MET | Equal replay, unchanged input, frozen result/sections/lines (1). |
| FB-9 | MET | Three cells × all six mode/gate combinations, literal labels, postingAuthorized false (3). |
| FB-10 | MET for task diff | One source removal/three additions, four test removals/four additions, three tracked task paths. Current-main two-dot output also records later main changes; base-relative task diff is exact. |
| FB-11 | MET locally | Unedited boundary tests in Run B; source-inspected no new import/export, platform/network identifier or arithmetic. Independent reviewers still must inspect. |
| FB-12 | MET locally | Run B 244, Run C 91; 17 working blobs equal d58560e. Current main has a later security-test blob, recorded below. |
| FB-13 | MET for builder records | This receipt and intended commit message; independent verdicts, acceptance and CI are outstanding. |

New test total: 21 + 3 + 32 + 4 + 2 + 1 + 4 + 1 + 3 = **71**.
All 167 Run A tests passed, including all 96 existing transition tests.
The shape checks and identity offsets are fixture bookkeeping, not fee arithmetic.

## FB-0: supplied evidence versus commands executed here

The issued option B supersedes the draft sequence requiring this builder to apply
test rows, run the old rule and then edit origin.ts. The rule and test rows were
already committed together before the builder's first command; the header forbids
touching them. The builder did not amend, revert, reword or restore them, even temporarily.

Coordinator evidence, recorded in commit 58066db and the issued header, **not
executed or independently verified by this builder**:

- Old rule with the three new AL-6 expectations: exit 1, 3 failed / 93 passed.
  Names: `[AL-6] merged fee rule / surveyor named=true`,
  `[AL-6] merged fee rule / surveyor named=false`,
  `[AL-6] merged fee rule / supervisor named=false`.
- Both committed: transitions 96 + origin 175 + fee 64 = 335 passed;
  boundaries 5 passed; typecheck 7 tasks successful.

The coordinator's red log path and SHA-256 were not supplied. The draft's expected
43 failures / 124 passes for **all 167 tests** is not an observed builder result:
the new 71-test file did not exist at the coordinator's red run. No 167-test red
log or SHA-256 exists from this builder. No mutation run was performed. Reviewers
may perform the old-rule check in their separately authorized throwaway copy.
There is no failed builder test name: Run A is 167 passed, exit 0. The count matches
the draft's final green count; tests-first evidence is limited to the supplied
coordinator evidence, as the issued locked-test procedure requires.

## Exact commands and local results

Runtime: Node `v24.17.0`, pnpm `10.28.1`, installed Vitest `4.1.11`.
Dependencies were already installed; no clean install or package download was performed.
Launcher prefix on every successful pnpm command:
`PATH=/private/tmp/jg-train-pnpm-bin:$PATH`.
That existing launcher invokes Corepack with `COREPACK_ENABLE_NETWORK=0`.
The initial default `pnpm --version` stalled after a pnpm-settings warning and was
interrupted (exit 130); no installation was attempted. A text question about the
launcher was raised, then the installed offline launcher was found locally.

| Check | Exact command after launcher prefix | Exit / observed result |
|---|---|---|
| Run A | `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/enterprise-domain/transitions.test.ts src/enterprise-domain/fee-both.test.ts` | 0; 2 files, 167 passed |
| Run B | `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/enterprise-domain/origin.test.ts src/enterprise-domain/fee.test.ts src/enterprise-domain/boundaries.test.ts` | 0; 3 files, 244 passed (175 + 64 + 5); no timeout/retry |
| Run C | `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/cumulative-fee.test.ts src/allocation.test.ts src/money.test.ts` | 0; 3 files, 91 passed |
| Typecheck | `pnpm typecheck` | 0; 7 successful tasks |
| Lint | `LANE_BASE_REF=origin/main pnpm lint` | 0; root checks and 7 successful tasks |
| Lane | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; fee-both-1 lane passed |

Only one test run was active at a time, never more than three files or two workers.
Run A was additionally wrapped with `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot fee-both-1-A`.
That wrapper's host-monitor probes reported:

```text
sysctl: sysctl fmt -1 1024 1: Operation not permitted
sysmon request failed with error: sysmond service not found
pgrep: Cannot get process list
```

The test command itself exited 0. The probes and helper were stopped for later
commands; no alternate host-monitor probe or escalation was attempted. Runs B/C
are the independent pure-test commands expressly permitted in the issued order.
The pre-run `memory_pressure | tail -1` had reported 68% free and disk 117 GiB free.
Turborepo also emitted `WARNING IO error: Operation not permitted (os error 1)`
cache warnings. No cache workaround/retry was attempted; actual task exits are recorded.
No automated approval review or sandbox escalation was requested.

## Worked statement M — hand arithmetic and observed assertions

All figures are fictional exact pence at the proposed rate 10/100. Each row's
observed Q, contribution and line fee matched the order in `[FB-5]`.
"Weight" scales the exact contribution by 62; the whole-pence allocation is
4,541 × weight divided by total weight 281,539.

| Extra | Kind / role / named | Approved=invoiced | Paid | Q before | Q after: order = observed | Exact share after: order = observed | Weight | Whole pence | Remainder | Fee before | Fee after: order = observed |
|---|---|---:|---|---:|---|---|---:|---:|---:|---:|---:|
| A id(501) | site_user / operative / yes | 15000 | 15000 | 15000 | 15000/1 | 1500/1 | 93000 | 1500 | 4500 | 1500 | 1500 |
| B id(502) | site_user / supervisor / yes | 9995 | 9995 | 9995 | 9995/1 | 1999/2 | 61969 | 999 | 143768 | 1000 | 1000 |
| C id(503) | site_user / surveyor / yes | 12345 | 12345 | 0 | 12345/1 | 2469/2 | 76539 | 1234 | 144473 | 0 | 1235 |
| D id(504) | site_user / supervisor / no | 24000 | 250000/31 | 0 | 250000/31 | 25000/31 | 50000 | 806 | 129566 | 0 | 806 |
| E id(505) | site_user / surveyor / no | 5 | 5 | 0 | 5/1 | 1/2 | 31 | 0 | 140771 | 0 | 0 |
| F id(506) | site_user / operative / no | 20000 | 20000 | 0 | 0/1 | 0/1 | 0 | 0 | 0 | 0 | 0 |
| G id(507) | office_entry / finance / yes | 50000 | 50000 | 0 | 0/1 | 0/1 | 0 | 0 | 0 | 0 | 0 |
| H id(508) | client_instruction / commercial_manager / yes | 80000 | 80000 | 0 | 0/1 | 0/1 | 0 | 0 | 0 | 0 | 0 |

Before, by hand from the old predicate: Q = 15000 + 9995 = **24995p**;
exact fee **2499.5p**, half-even **2500p**. Shares 1500 and 999.5 have denominator
2, weights 3000 and 1999, total 4999. Floors 1500 and 999, remainders 1500 and
3499; the one leftover penny goes to B. Lines **1500 / 1000 / 0 / 0 / 0 / 0 / 0 / 0**.
These before-rule figures are hand/source-inspected, not a builder old-rule execution.

After, by hand: integer Q is 37345p; 37345 × 31 + 250000 = **1407695**, so
Q = **1407695/31p**. Exact fee **1407695/310p** rounds once to **4541p**.
The shares' denominator is 62, total weight **281539**. Floors sum to **4539**;
the two largest remainders are C **144473**, then B **143768**, ahead of E **140771**.
Thus lines **1500 / 1000 / 1235 / 806 / 0 / 0 / 0 / 0**, sum **4541p**.
E's **5p** counts in Q and has a **0p** fee line. Both group permutations passed.
The tests assert the supplied literal Q/contributions/lines and sum using bigint;
they do not generate expectations from the implementation. Floors/remainders
here are hand arithmetic from the order, not additional runtime projections.

## FB-2, FB-6 and FB-7 worked figures

Every after-result below matched its literal test assertions. Before figures are
the order's hand/source-inspected values, never an old-rule builder run.

| FB-2 case | Q before → observed after | Exact share | Cumulative fee before → observed after | Posting delta / line fee observed |
|---|---|---|---|---|
| surveyor named | 0 → 12345/1 | 2469/2 = 1234.5 | 0 → 1234 (even tie stays) | 1234 / 1234 |
| surveyor not named | 0 → 9995/1 | 1999/2 = 999.5 | 0 → 1000 (odd tie rises) | 1000 / 1000 |
| supervisor not named, part_paid | 0 → 250000/31 | 25000/31 | 0 → 806 | 806 / 806 |

FB-2 lines have prior principal **0/1**, current principal as above, `kind: proposal`.

FB-6, X alone (executed): Q **15/1**, contribution **3/2**, total and line **2p**.
X+Y before (hand): Q **15p**, total **2p**, lines **2 / 0**.
After (executed): Q **25/1**, exact fee **2.5p**, half-even **2p**. Contributions
**3/2** and **1/1** give weights 3 and 2 of 5; floors 1 and 0, remainders 1 and 4.
One penny goes to Y, yielding **1 / 1**. X's principal stays **15/1**. No kernel edit.

| FB-7 | Order's after figures = observed | Before-rule difference |
|---|---|---|
| (a) surveyor full credit | October 1234p proposal; late-recorded credit leaves October deeply equal; November Q 0/1, fee 0, delta −1234, line −1234, linked_compensation, id(101), postingAuthorized false | Surveyor Q was zero under the old predicate |
| (b) supervisor reversal | October 2400p; November Q 19000/1, fee 1900, delta −500, line −500, linked_compensation, id(101), postingAuthorized false | Unnamed supervisor Q was zero |
| (c) missing prior link | Refused with EnterpriseDomainError code COMPENSATION_LINK_REQUIRED | Same refusal before and after |
| (d) old snapshot | Q 27345/1; exact fee 2734.5 rounds to even 2734; prior 1500; delta 1234, proposal, lines X 0 / C 1234, postingAuthorized false | Before Q 15000, delta 0, zero_result |

November fixtures use period `2026-11`, cutoff `2026-12-01T00:00:00Z`,
inputFactsHash `hash("b")` and prior derivation `id(101)` (except the refusal).

## The seventeen unchanged distinctions — self-review test map

| # | Distinction preserved | Test evidence (new or merged) |
|---|---|---|
| 1 | office_entry excluded for all relevant raisers | FB-3 kind rows; M G; ENT-F8 |
| 2 | client_instruction/order excluded | FB-3 kind rows; M H; ENT-F8 and origin provenance tests |
| 3 | confirmed-prompt branch/senior unchanged, ignores naming | FB-3 two prompt rows; merged prompt/evidence/requirements exclusions and exhaustive matrix |
| 4 | named operative/supervisor still count | FB-1 four relevant naming rows; unchanged AL-6 rows 1–2 |
| 5 | unnamed operative remains zero | FB-1; M F; FB-4(b); unchanged AL-6 row 6 |
| 6 | seven other roles cannot count as site_user | All fourteen FB-1 cells; shape test |
| 7 | small_builder/invalid track-kind refusal | origin.test.ts generated exhaustive property matrix |
| 8 | fully_instructed excluded | FB-3 three rows; merged matrix |
| 9 | no note/verified photo or resident confirmation | FB-3 six rows; merged evidence matrix and exclusions |
| 10 | earliest origin, canonical counted once, invalid group refused | FB-4(a–d); merged exact-instant/ID origin test; ENT-F7 |
| 11 | lifecycle/export/payment/candidate/stale approval exclusions | FB-3 fifteen rows; merged lifecycle tests; approval/export/match dimensions |
| 12 | exact min of approved/billed/paid; typed consistency refusals | FB-2 fraction; FB-7 credit/reversal; ENT-F1/F3/F4/F5/F6 and merged strict fact/allocation refusal tests |
| 13 | mode and gate unchanged | FB-9 eighteen combinations, both paths; merged mode matrix |
| 14 | cutoff/agreement version/prior/compensation link | FB-7; ENT-F9/F12; merged agreement validation tests |
| 15 | receipt composition/reversal links | FB-3 composition control/refusal; ENT-F2/F4 and merged receipt refusal tests |
| 16 | cumulative half-even and largest-remainder arithmetic | FB-2/5/6/7; ENT-F10/F11; 91 unedited kernel tests in C |
| 17 | recording lists/capture guard/other transitions | All 96 unedited-except-coordinator transition tests; AL-5; unchanged transitions.ts hash |

The table is coverage mapping, not a claim of independent mutation verification.

## NOT RUN, held capabilities and residuals

NOT RUN: all other repository tests, including the rest of core and
receipt-allocation.test.ts, DB/migration/fresh/upgrade suites, API/web unit tests,
all browser/e2e tests, root `pnpm test`, native/device, live-model evaluation,
live providers, clean pinned installation or deployment. GitHub's mandatory run
on the final pushed head remains required evidence. No browser, PostgreSQL or
socket service was started. This leaf has no AI/parser/schema change requiring eval.
C1 expressly pure-core: no persistence, web workflow or e2e spec. C6 local proof is
A/B/C only. C8 still needs CI, fresh Opus plus separate Sol verdicts bound to the
exact committed head, and separate acceptance. The builder accepts nothing.

No migration, backfill, contract/schema/public signature, tax, rate, rounding,
operational alert, external action, application caller or provider change.
Compatibility impact is limited to the three fee-eligibility cells and their
non-posting statement consequences. No professional/commercial sign-off is inferred.

- **R1:** the pure rule book still refuses a supervisor or surveyor not named on
  the job from LOGGING a site extra (`transitions.ts:30`). The order describes this
  as stricter than ENT-3a's database rule. The not-named cases count here only on
  server-composed facts; recording authority and the guard are untouched.
- **R2:** an operative not named on the job stays uncharged; Ben was not asked.
  One item for the coordinator's founder card list, not a new builder policy.
- **R3:** another extra's statement penny can move, as FB-6 shows and Q8 accepts.
- **R4:** the predicate applies to every extra held in a statement, whenever logged;
  no real statement exists, nothing posts. A dated switch is ENT-7 agreement-version work.
- **R5:** a person with two covering grants can be recorded under either role;
  #154's Opus LATER-5, assigned to ENT-5. Untouched.
- **R6:** BUILD_PLAN.md and D16 are not edited by this builder. The integrator's
  ledger amendment and policy wording follow-up remain with the coordinator.

HELD, not built: all real charging, statement authorization, posting, invoicing
and collection (D16 proposed, D02/G4-C, ENT-7); fee database/routine/migration;
all UI/pages/components/browser tests (Ben parked UI on 11 Oct); recording guard
(R1, before ENT-5 wiring); two-grant gap (ENT-5); unnamed-operative fee (not asked);
dated switch-over (ENT-7); BUILD_PLAN Who cells and D16 wording (founder/coordinator).

## Self-review

- Read the complete task diff against origin/main and inspected the new untracked
  file separately. Two-dot comparison includes newer main work; merge-base/d58560e
  comparison isolates exactly this task. No catch-up, newer-main file removal or
  security-test change was made. No source/test/registry file differs from starting HEAD.
- All 20 cells map to their distinct FB-1 names in Table 1. Only the three capital
  cells differ from base. All nine AL-6 fields are exactly ordered, no tenth; only
  one source statement and four test lines were removed by the coordinator.
  All 96 transition names still exist and passed; no assertion was relaxed,
  removed, skipped, reworded, retry-wrapped or given a longer timeout by this builder.
- Fee.ts, the kernel, transitions.ts, origin.test.ts and fee.test.ts are byte-identical
  to d58560e. The new site statement still reads `e`, the effective earliest origin,
  not the canonical. No new production import/export or arithmetic. senior and
  the prompt branch are unchanged. No existing shared fixtures were edited.
- Every new monetary expectation is a literal from the order, never imported or
  calculated from production output. No floating-point literal, number multiplication
  or division, Math.round or approximate comparison. The sole number addition is
  the order's permitted `n + 200` **identifier** offset; the fee-sum assertion adds
  bigint pence. Coverage length uses duplicated role enumeration, without money maths.
- M and FB-2/6/7 assertions match the order to the penny. FB-9 always asserts
  postingAuthorized false on both derivation and section. No mode/gate/caller added.
- No permanent hash test or test freezing an unowned file; fingerprints below
  are one-off receipt records. No new dependency, manifest, lockfile, DB/API/web,
  decision/contract, BUILD_PLAN or AGENTS edit. Only the assigned leaf is built.
- New names/prose follow the issued wording, with no credential-shaped string.
  The diff inspection is builder self-review, not independent verification.

Builder receipt only — not independently verified, not accepted.

## Final command logs, FB-10 outputs and FB-12 hashes

The following records are appended from commands actually executed. They are
one-off evidence, never standing tests.

Build: `pnpm build`, exit **0**, seven successful tasks (two cached).

OpenAPI: `pnpm openapi:check`, exit **1**, stopped with no alternate invocation.

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/50538.pipe
```

The refused item is the `tsx src/generate-openapi.ts --check` IPC bind. OpenAPI is **NOT MET locally**, to run in CI. This was a sandbox refusal, not an automatic approval-review rejection.

Log files remain at the exact paths below. SHA-256 was calculated from their saved bytes.

| Check | Log path | SHA-256 |
|---|---|---|
| A | `/private/tmp/jg-fee-both-1-A.log` | `63cd69150477be0ec5236edaf8688fd34abe81f17afaefed76f226d9dd9b9431` |
| B | `/private/tmp/jg-fee-both-1-B.log` | `c28e5799228503f0bd35dc0291cf1f412c8c1445c6ce9d93f13191533877083c` |
| C | `/private/tmp/jg-fee-both-1-C.log` | `a9c7219df744550ed2e18da69a63768740fbd3e4247dd3a75eb8e5ba54fd805d` |
| typecheck | `/private/tmp/jg-fee-both-1-typecheck.log` | `9903e8b5965b8908ec9726f32069b2b0e2b4cd9059a562e263c5723958b6d659` |
| lint | `/private/tmp/jg-fee-both-1-lint.log` | `44edc99762ef0c279d2c99a28d6c983dbc8f59da05d15978660c7413e7a5e91f` |
| lanes | `/private/tmp/jg-fee-both-1-lanes.log` | `bd43f1dd4812f3f20d25db734d8c47665f491fb8b77590ede861d1ae458a9fcb` |
| build | `/private/tmp/jg-fee-both-1-build.log` | `cb2eaeb54fd7283ba564e1c408e3ffd363e8375044b78b221582af52112481f5` |
| openapi | `/private/tmp/jg-fee-both-1-openapi.log` | `95045f8ab7e1f8aa1b69fa4d5428d95dcb4b2540b7a4999889136c5decff3c4d` |

Run output excerpts (A/B/C, observed):

```text
sysctl: sysctl fmt -1 1024 1: Operation not permitted
sysmon request failed with error: sysmond service not found
pgrep: Cannot get process list

 RUN  v4.1.11 /Users/benharwood/Claude/Projects/my-new-project/.worktrees/fee-both-1/packages/core


 Test Files  2 passed (2)
      Tests  167 passed (167)
   Start at  20:35:23
   Duration  3.26s (transform 508ms, setup 0ms, import 618ms, tests 3.09s, environment 0ms)
```

```text
RUN  v4.1.11 /Users/benharwood/Claude/Projects/my-new-project/.worktrees/fee-both-1/packages/core


 Test Files  3 passed (3)
      Tests  244 passed (244)
   Start at  20:35:47
   Duration  6.85s (transform 1.71s, setup 0ms, import 1.37s, tests 8.12s, environment 0ms)
```

```text
RUN  v4.1.11 /Users/benharwood/Claude/Projects/my-new-project/.worktrees/fee-both-1/packages/core


 Test Files  3 passed (3)
      Tests  91 passed (91)
   Start at  20:36:02
   Duration  648ms (transform 178ms, setup 0ms, import 253ms, tests 290ms, environment 0ms)
```

`git diff --check` — exit **0**.

```text
(no output)
```

`git diff origin/main -U0 -- packages/core/src/enterprise-domain/origin.ts | grep '^-' | grep -v '^---'` — exit **0**.

```text
-  if (kind === "site_user") return ["operative", "supervisor"].includes(e.raisingCommand.role) && e.raisingCommand.assigned;

```

`git diff origin/main -U0 -- packages/core/src/enterprise-domain/origin.ts | grep '^+' | grep -v '^+++'` — exit **0**.

```text
+// Fee rule for a site extra, by who logged it. Founder, 12 Oct 2026 (card jobguard-fee-on-surveyor-extras-2026-10-12, 'charge on both'): a supervisor's or a surveyor's counts whether or not that person is named on the job; an operative's counts only when the operative is named on the job; no other role's counts.
+const siteFeeRolesWithoutNaming = ["supervisor", "surveyor"] as const satisfies readonly EnterpriseExtra["raisingCommand"]["role"][];
+  if (kind === "site_user") return e.raisingCommand.role === "operative" ? e.raisingCommand.assigned : siteFeeRolesWithoutNaming.includes(e.raisingCommand.role as typeof siteFeeRolesWithoutNaming[number]);

```

`git diff origin/main -U0 -- packages/core/src/enterprise-domain/transitions.test.ts | grep '^-' | grep -v '^---'` — exit **0**.

```text
- // Merged fee rule, unchanged by ENT-4a-ALIGN. Whether a site extra logged by a surveyor, or by a supervisor not named on the job, should carry a fee is an open founder question (F1). These rows record today's rule; they decide nothing.
-  {role:"surveyor",assigned:true,site:false,principal:{numerator:0n,denominator:1n},fee:false},
-  {role:"surveyor",assigned:false,site:false,principal:{numerator:0n,denominator:1n},fee:false},
-  {role:"supervisor",assigned:false,site:false,principal:{numerator:0n,denominator:1n},fee:false},

```

`git diff origin/main -U0 -- packages/core/src/enterprise-domain/transitions.test.ts | grep '^+' | grep -v '^+++'` — exit **0**.

```text
+ // Fee rule for a site extra, by who logged it. Rows 3 to 5 follow the founder's answer of 12 Oct 2026 ('charge on both', card jobguard-fee-on-surveyor-extras-2026-10-12), built by FEE-BOTH-1: a surveyor's, and a supervisor's not named on the job, now count. Rows 1, 2 and 6 are as ENT-4a-ALIGN wrote them. Hand-written literals, never read from the implementation.
+  {role:"surveyor",assigned:true,site:true,principal:{numerator:15000n,denominator:1n},fee:true},
+  {role:"surveyor",assigned:false,site:true,principal:{numerator:15000n,denominator:1n},fee:true},
+  {role:"supervisor",assigned:false,site:true,principal:{numerator:15000n,denominator:1n},fee:true},

```

`git diff origin/main --name-only` — exit **0**.

```text
BUILD_PLAN.md
apps/api/openapi.json
apps/api/src/app.module.ts
apps/api/src/audit-export/audit-export.application.ts
apps/api/src/audit-export/audit-export.context.test.ts
apps/api/src/auth/context-boundary.test.ts
apps/api/src/auth/identity.application.ts
apps/api/src/auth/index.ts
apps/api/src/auth/persisted-auth-provider.ts
apps/api/src/auth/sso/sso-emergency.test.ts
apps/api/src/auth/sso/sso-required-disclosure.test.ts
apps/api/src/auth/sso/sso-required-paths.test.ts
apps/api/src/auth/sso/sso-required.application.ts
apps/api/src/auth/sso/sso-required.contracts.ts
apps/api/src/auth/sso/sso-required.controller.ts
apps/api/src/auth/sso/sso-required.test.ts
apps/api/src/workspace/application.ts
apps/api/src/workspace/index.ts
apps/web/app/admin/contractor/identity/page.tsx
apps/web/app/api/auth/sso-required/emergency/route.ts
apps/web/app/api/auth/sso-required/route.ts
apps/web/e2e/ENT-10d.spec.ts
config/agent-lane-assignments.json
docs/contracts/audit-export-v1.md
docs/contracts/sso-required-v1.md
docs/operations/sso-data-flow.md
docs/verdicts/CTX-BRIDGE-1/BUILDER_RECEIPT.md
docs/verdicts/ENT-10d/BUILDER_RECEIPT.md
docs/verdicts/MIG-ORDER-5/BUILDER_RECEIPT.md
packages/core/src/enterprise-domain/origin.ts
packages/core/src/enterprise-domain/transitions.test.ts
packages/db/MIGRATIONS.md
packages/db/migrations/0129_sso_required.sql
packages/db/src/contractor-session-context.ts
packages/db/src/identity-repository.ts
packages/db/src/index.ts
packages/db/src/migrate.ts
packages/db/src/sso-required-repository.ts
packages/db/test/audit-export.integration.test.ts
packages/db/test/contractor-session-context.integration.test.ts
packages/db/test/contractor-session-context.test.ts
packages/db/test/extra-origin.integration.test.ts
packages/db/test/sso-emergency-concurrency.integration.test.ts
packages/db/test/sso-emergency.integration.test.ts
packages/db/test/sso-required.integration.test.ts

```

`git status --porcelain` — exit **0**.

```text
?? docs/verdicts/FEE-BOTH-1/
?? packages/core/src/enterprise-domain/fee-both.test.ts

```

`git diff d58560e --stat` — exit **0**.

```text
 config/agent-lane-assignments.json                      | 1 +
 packages/core/src/enterprise-domain/origin.ts           | 4 +++-
 packages/core/src/enterprise-domain/transitions.test.ts | 8 ++++----
 3 files changed, 8 insertions(+), 5 deletions(-)

```

`git diff d58560e --name-only` — exit **0**.

```text
config/agent-lane-assignments.json
packages/core/src/enterprise-domain/origin.ts
packages/core/src/enterprise-domain/transitions.test.ts

```

`git diff HEAD --name-only` — exit **0**.

```text
(no output)
```

The origin/transitions diffs above contain the exact before/after text of the one statement and four lines, as requested. The source constant/comment additions are the coordinator's permitted two lines.

Current origin/main moved after dispatch; audit snapshot: `b223394c011d7042f341554868962b87b133c37c`. Two-dot `git diff origin/main` therefore lists later main changes as well. They are absent from the base rather than edited by this builder. The task base is not later: it remains d58560e. `git diff d58560e --name-only` isolates exactly the three committed paths; the untracked new test and receipt appear in status. Merge-base comparison used by lint:lanes isolates the task correctly. All protected working files equal d58560e.

FB-12: `git hash-object PATH` without -w and `git rev-parse d58560e:PATH` / `git rev-parse origin/main:PATH` executed for every row. Sixteen rows agree in all three columns; the later-main auth test is the explicit exception, with the working copy equal to the order's pinned base blob.

| File | Working blob | d58560e blob | origin/main snapshot blob |
|---|---|---|---|
| `packages/core/src/enterprise-domain/fee.ts` | `eec73e564acf36851025db88afa49f92ee9ed542` | `eec73e564acf36851025db88afa49f92ee9ed542` | `eec73e564acf36851025db88afa49f92ee9ed542` |
| `packages/core/src/enterprise-domain/contracts.ts` | `fdc3cc51aa6283ea7fcbf0ed5d55a92b416b4f71` | `fdc3cc51aa6283ea7fcbf0ed5d55a92b416b4f71` | `fdc3cc51aa6283ea7fcbf0ed5d55a92b416b4f71` |
| `packages/core/src/enterprise-domain/index.ts` | `c0a9dae7bb168bacc6a392b808c4edb81696a8f5` | `c0a9dae7bb168bacc6a392b808c4edb81696a8f5` | `c0a9dae7bb168bacc6a392b808c4edb81696a8f5` |
| `packages/core/src/enterprise-domain/transitions.ts` | `ae571eef932074775dc1515394a4f898b7b53636` | `ae571eef932074775dc1515394a4f898b7b53636` | `ae571eef932074775dc1515394a4f898b7b53636` |
| `packages/core/src/enterprise-domain/origin.test.ts` | `999876d6722b9fcac925f5d6fb183b4c433833bb` | `999876d6722b9fcac925f5d6fb183b4c433833bb` | `999876d6722b9fcac925f5d6fb183b4c433833bb` |
| `packages/core/src/enterprise-domain/fee.test.ts` | `0e9d69d8c128a4ead4146fed8a796b3dabfd6dc0` | `0e9d69d8c128a4ead4146fed8a796b3dabfd6dc0` | `0e9d69d8c128a4ead4146fed8a796b3dabfd6dc0` |
| `packages/core/src/enterprise-domain/boundaries.test.ts` | `edd8e85278a0ca0e32ea5dd6f84d60e972eeb3a7` | `edd8e85278a0ca0e32ea5dd6f84d60e972eeb3a7` | `edd8e85278a0ca0e32ea5dd6f84d60e972eeb3a7` |
| `packages/core/src/cumulative-fee.ts` | `28816e06673a49d90b7fdd6ce30e0956d8f0e6f5` | `28816e06673a49d90b7fdd6ce30e0956d8f0e6f5` | `28816e06673a49d90b7fdd6ce30e0956d8f0e6f5` |
| `packages/core/src/allocation.ts` | `961841015fbf3513e1c2512a8c5989e46d6bb62c` | `961841015fbf3513e1c2512a8c5989e46d6bb62c` | `961841015fbf3513e1c2512a8c5989e46d6bb62c` |
| `packages/core/src/money.ts` | `b5b67d212f0b76852678c1760306181aafae4976` | `b5b67d212f0b76852678c1760306181aafae4976` | `b5b67d212f0b76852678c1760306181aafae4976` |
| `packages/core/src/rational.ts` | `61f6ae3e59a9cc271b3e80c6944f71565becf6a1` | `61f6ae3e59a9cc271b3e80c6944f71565becf6a1` | `61f6ae3e59a9cc271b3e80c6944f71565becf6a1` |
| `packages/core/src/receipt-allocation.ts` | `a331620160d190462fdba45a053ddf69ba78921f` | `a331620160d190462fdba45a053ddf69ba78921f` | `a331620160d190462fdba45a053ddf69ba78921f` |
| `packages/core/src/cumulative-fee.test.ts` | `7d91e62141ff02e88f5300b7b37a28dc2603ee6f` | `7d91e62141ff02e88f5300b7b37a28dc2603ee6f` | `7d91e62141ff02e88f5300b7b37a28dc2603ee6f` |
| `packages/core/src/allocation.test.ts` | `5c6d9accaa0a9d856ebe05c42842ef718a2fb601` | `5c6d9accaa0a9d856ebe05c42842ef718a2fb601` | `5c6d9accaa0a9d856ebe05c42842ef718a2fb601` |
| `packages/core/src/money.test.ts` | `d9202e59e0e836187fca565e8d006cc1873bb9ac` | `d9202e59e0e836187fca565e8d006cc1873bb9ac` | `d9202e59e0e836187fca565e8d006cc1873bb9ac` |
| `packages/core/src/receipt-allocation.test.ts` | `833793f8972642fd6cd94737d1c937038895da1f` | `833793f8972642fd6cd94737d1c937038895da1f` | `833793f8972642fd6cd94737d1c937038895da1f` |
| `apps/api/src/auth/context-boundary.test.ts` | `bc63da29c0415bb55efefad54525822c2a437862` | `bc63da29c0415bb55efefad54525822c2a437862` | `2293415d4bc7701751b14a462eeb5e77c204aa16` |

Temporary audit `/private/tmp/jg-fee-both-1-audit.json`, SHA-256 `89484ceeb8b87855eb511c80df8015bca04384d7cbb25c697050e95863e37f55`; exit **0**. It confirms four changed transition lines only, locked source/test/lane equal HEAD, all 17 files equal base, merge-base d58560e and six allow paths.

`lint:lanes` was run once before the receipt was created; it covered the committed three paths and new test. The receipt's literal path is already allowed by `docs/verdicts/FEE-BOTH-1/**`; final status has only that folder and the new test. No check was silently made optional. The builder did not rerun the once-only final suites for documentation-only additions.

Artifacts removed after checks (rebuildable outputs only):

```text
.pnpm-store
packages/core/dist
packages/core/.turbo
packages/config/dist
packages/config/.turbo
packages/storage/dist
packages/storage/.turbo
packages/ai/dist
packages/ai/.turbo
packages/db/dist
packages/db/.turbo
apps/api/dist
apps/api/.turbo
apps/web/.turbo
apps/web/.next
apps/web/tsconfig.tsbuildinfo
```

No .pnpm-store, dist, .next, .turbo, tsbuildinfo or test-results output from these runs remains; installed node_modules were preserved.


Final one-off AST source inspection: exit **0**, no decimal literal or numeric multiplication/division, no skipped test or approximate money comparison; only the permitted identifier offset and bigint money-sum additions. Final working-tree/wording/artifact audit: exit **0**, exactly two new files, all locked files equal HEAD, no generated outputs. No sub-agent or independent reviewer was spawned by this builder.

## Mac verification (12 Oct)

Run by the Mac-side helper (Claude Sonnet 5.5) on Monday 12 October 2026, 21:17 to 21:45 BST, in
`.worktrees/fee-both-1` on the real Mac (macOS 26.4, Node v24.17.0, pnpm 10.28.1, Vitest 4.1.11, git 2.50.1).
This is a build-side verification record. It is not a review, not a verdict and not an acceptance:
**Not independently verified or accepted.** No product code was changed by the helper; the only file
edit outside this receipt is the one BUILD_PLAN.md ledger paragraph, its own commit `163e4fd`.

Every heavy command ran inside `~/.local/bin/heavy-slot <label> <script>`, one heavy step at a time, with
`VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2` and `--maxWorkers=2`; never more than one file per vitest run, apart from the
one whole-`@jobguard/core` run the helper's brief allowed. Free disk 119 GiB at the start, 112 GiB at the end.

### Heads tested and merges

| Step | Commit | What it is |
|---|---|---|
| Builder head | `eb847b6` | cut from main d58560e: coordinator's 58066db, dispatcher's lane line e11e9db, builder's test file and receipt |
| Merge 1 | `07882b7` | `origin/main` 96c0cb8 merged in; no conflicts |
| Ledger commit | `163e4fd` | `docs(fee-both-1): section 12.2 ledger sentence` (BUILD_PLAN.md only, +2 lines) |
| Merge 2 | `f03ccbb` | `origin/main` moved to ad1bad2 (pull request #139, PRACTICE-FACTS-1) while the tests ran; merged in; no conflicts; `config/agent-lane-assignments.json` still parses |

All results below were produced twice: on `07882b7` (before the ledger commit and before main moved) and again
on **`f03ccbb`**, the head the checks are bound to. The pushed head is `f03ccbb` plus this receipt commit (documentation only).
The helper did not touch 58066db, `origin.ts` or the three AL-6 rows of `transitions.test.ts` (lines 276, 280-282).

### Step 1: what differs from main

`git diff origin/main --stat` (at f03ccbb) shows exactly the six expected paths and nothing else:
`BUILD_PLAN.md` (+2, the ledger paragraph only), `config/agent-lane-assignments.json` (+1, the lane line),
`docs/verdicts/FEE-BOTH-1/BUILDER_RECEIPT.md`, `packages/core/src/enterprise-domain/fee-both.test.ts`,
`packages/core/src/enterprise-domain/origin.ts` (4 lines changed), `packages/core/src/enterprise-domain/transitions.test.ts` (8 lines changed).
(Before the ledger commit the list was the same five paths without BUILD_PLAN.md.)

### Step 2: tests and lints, with exit codes and counts

| Check | Command (inside `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 ...` unless stated) | Exit | At 07882b7 | At f03ccbb |
|---|---|---|---|---|
| transitions | `src/enterprise-domain/transitions.test.ts` | 0 | 96 passed | 96 passed |
| origin | `src/enterprise-domain/origin.test.ts` | 0 | 175 passed | 175 passed |
| fee | `src/enterprise-domain/fee.test.ts` | 0 | 64 passed | 64 passed |
| fee-both | `src/enterprise-domain/fee-both.test.ts` | 0 | 71 passed | 71 passed |
| boundaries | `src/enterprise-domain/boundaries.test.ts` | 0 | 5 passed | 5 passed |
| whole `@jobguard/core` suite | no file argument | 0 | 130 files, 3,864 passed | 131 files, 3,886 passed |
| typecheck | `pnpm typecheck` | 0 | 7 of 7 tasks successful (2 cached) | 7 of 7 successful (2 cached) |
| lint | `LANE_BASE_REF=origin/main pnpm lint` | 0 | see below | see below |

The five enterprise-domain files are every file in that folder that holds tests (the others are `contracts.ts`, `fee.ts`, `index.ts`,
`origin.ts`, `transitions.ts`). Outside the folder only `index.ts` and `extra-persistence.ts` import it, and the whole-package run covers them.
The difference between the two whole-package counts (one file, 22 tests) is the new `practice-facts.test.ts` that arrived with main.

`pnpm lint` at f03ccbb printed: "Core purity passed (132 TypeScript files)"; "Lane boundary passed" for lane `fee-both-1`
(base ad1bad2, six changed paths, all inside the six-path allow list); "Money arithmetic boundary check passed"; then 7 of 7
package lint tasks successful. The commercial-boundary step also ran without error. At 07882b7 the same lint passed with base 96c0cb8 and five paths.
`LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` was also run directly right after the ledger commit and passed with the six paths.
The 244 (175 + 64 + 5) and 167 (96 + 71) counts the builder recorded are reproduced exactly.

### Step 3: the eight-extra mixed statement, reproduced

Through the real kernel, the committed `fee-both.test.ts` `[FB-5]` tests assert exactly the order's figures (they passed in the 71): cumulative
fee 4,541p after, principal 1,407,695/31, lines 1,500 / 1,000 / 1,235 / 806 / 0 / 0 / 0 / 0, summing to 4,541 (`fee-both.test.ts` lines 69-86).

To check the BEFORE side without editing any tracked file, the helper made two uncommitted scratch copies of `packages/core` under the session
scratch folder (outside the repository), with `node_modules` linked read-only. In the "old rule" copy only `origin.ts` was replaced by
`git show d58560e:packages/core/src/enterprise-domain/origin.ts` (blob `290c563153e62413d5b7720e9a7fb031a4933c2d`, equal to `git rev-parse d58560e:...`).
A throwaway printing test built statement M with the new test file's own fixtures and wrote the derivation's numbers to a file:

| Statement M (reference derivation, 10/100) | Qualifying principal | Cumulative fee | Posting delta | Line fees |
|---|---|---|---|---|
| Old rule (d58560e `origin.ts`) | 24995/1 | **2,500p** | 2,500p | 1,500 / 1,000 / 0 / 0 / 0 / 0 / 0 / 0 |
| New rule (this branch) | 1407695/31 | **4,541p** | 4,541p | 1,500 / 1,000 / 1,235 / 806 / 0 / 0 / 0 / 0 |

Both match the order's statement to the penny (2,500p before, 4,541p after, the same eight lines).

The same old-rule copy also gave the order's tests-first picture (FB-0), which the builder could not record because of the locked-commit procedure:

| Old-rule scratch run | Result |
|---|---|
| `transitions.test.ts` | 3 failed, 93 passed: the three `[AL-6] merged fee rule` rows (surveyor named=true, surveyor named=false, supervisor named=false) |
| `fee-both.test.ts` | 40 failed, 31 passed: FB-1 three cells, FB-2 three, FB-3 twenty-four, FB-4 one, FB-5 two, FB-6 one, FB-7 three (a, b, d), FB-9 three |
| Together | 43 not passing and 124 passing of 167, exactly the draft order's expected count and its expected list |

With the real new rule the same 167 pass (above). The scratch copies were not committed and nothing tracked changed
(`git status --porcelain` was empty after every run).

### Step 4: ledger sentence

`BUILD_PLAN.md` section 12.2 gained one paragraph, "Ledger amendment — FEE-BOTH-1, October 2026 (fee rule, no migration).", copied from
the order's "Ledger sentence" (Q10(a)) in the form of the ENT-4a-ALIGN paragraph above it (blank line before, one paragraph, before the 12.3 heading).
Its own commit `163e4fd`, +2 lines, nothing else in the file.

### NOT run

`pnpm build` and `pnpm openapi:check` (the builder recorded the latter as refused in its sandbox; this helper did not retry it), all of `packages/db`
(PostgreSQL) and `apps/api`, `apps/web` unit tests, every browser/e2e test, root `pnpm test`, a fresh pinned install, and GitHub's run on the pushed head.
Reviews: the two RED checks (fresh Claude Opus and Codex Sol) are outstanding; neither has been given anything by this helper.

### Observations for the checkers

- The lane line sits at line 28 of `config/agent-lane-assignments.json`, before `"ent-4b"` (line 29), not after it as the order's lane paragraph describes. This is the dispatcher's e11e9db placement; the registry is read by name, so nothing depends on the order. Left untouched.
- Main moved twice during the run (96c0cb8 then ad1bad2). Both catch-up merges were clean. ENT-4c (the other piece that edits `origin.ts`) is still not on main.

Mac verification only. Not independently verified or accepted.
