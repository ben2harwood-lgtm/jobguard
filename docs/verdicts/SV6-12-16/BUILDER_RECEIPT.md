# SV6-12-16 builder receipt — 24 October 2026

Built ahead on ACCEPTED SV6-05 `68c87b84ec5ede05434d16034079e507aa9f1635`, including ACCEPTED SV6-01 `7596d818`. This receipt records pure test execution, not independent acceptance. No commit, git write, push, PR, merge, production enablement or external action was performed. The dispatcher owns the commit and exact-commit review.

## Authority and preflight

Initial worktree clean; branch `codex/sandbox/sv6-12-16`, repository `ben2harwood-lgtm/jobguard`. Local `origin/main` resolved to `6993a0cb59b9c26c25ae316b02c747cacc15e7e7`; no fetch performed. Read repository AGENTS.md, BUILD_PLAN SV-6, §10.2.8 and §§10.3.1–10.3.3, the supplied SV-6 spec and acceptance table including ready-rule hold at line 887, parent implementation/tests/contracts and SV6-05 receipt. The 24 October bounded order authorizes this pure build ahead; it does not waive dependency merges or held product decisions.

> Separate billed and paid; label estimates; create no bill.

Source: BEN-ANSWERS-20261013.md, card jobguard-twenty-product-decisions-2026-10-13, as quoted/mapped by the issued spec. Q4/Q5's adopted protections do not settle their remaining policy questions. The parent already implements the explicitly synthetic reference bundle and exact/integer-only illustration; this lane selects no new policy.

Only three final paths change: the existing `packages/core/src/recovery-fee-illustration.test.ts`, this receipt, and its own version-2 lane registration. The lane file grants the exact two content paths; its own registration path is implicitly permitted by the lane tool and cannot appear in `allow`. `config/agent-lane-assignments.json` is untouched.

The ordered `recovery-attribution.integration.test.ts` and `recovery-attribution-figures.integration.test.ts` are absent on this head. No fake integration file, guessed repository API, placeholder or skipped test was created. Four exact acceptance-table titles live beside the parent's pure tests and use its synthetic source fixture pattern. The existing pure attribution/illustration implementation already supports these protections; no implementation change is needed. This file overlaps SV6-05 and other follow-on illustration-test lanes, so dispatcher integration must serialize these additions.

## Acceptance evidence and limits

| Acceptance/test title | Executed pure assertion | Aggregate status |
|---|---|---|
| `SV6-12 F5 deposit` | Existing owner kernel excludes the catch at the pre-existence £12,000 deposit. Later £14,640 against £29,280 outstanding produces exact catch net 40000/1 pence, fee 4000p. Source inputs and returned allocations are unchanged. | PURE PASS; persisted commands/saved allocator facts DEPENDENCY-BOUND; Q3 saved prerequisite NOT BUILT — HELD if it needs an undecided rule. |
| `SV6-12 F6 explicit non catch` | The sourced £24,000 remittance goes only to the named main line, exact catch Q/F zero. Removing remittance from the same synthetic input gives existing pro-rata Q 2000000/43 pence, proving the zero is caused by explicit attribution. | PURE PASS; persisted remittance/assessment journey DEPENDENCY-BOUND. |
| `SV6-12 F7 separate invoice` | £960 catch invoice settles exact £800 net/£80 fee independently of the unpaid £40,320 main invoice; changing the unrelated outstanding balance has no effect. | PURE PASS; saved invoice/allocator integration DEPENDENCY-BOUND; Q3 saved prerequisite NOT BUILT — HELD if it needs an undecided rule. |
| `SV6-16 shadow 30000 separates captures from paid catches` | Two independent synthetic reviewed sources £500 + £300 give recovered £800, fee £80 and yours £720. Separate £3,200 capture + £400 final-review addition gives £3,600 captured, fee £0. Exact and integer-pence display projections checked. Captures alone produce fee zero; false or missing settlement proof and tenant/job/lock-mismatched captures refuse. | PURE PASS only; real server value receipt DEPENDENCY-BOUND and overall SV6-16 INCOMPLETE — HELD. |

The allocation calls occur in test fixtures only, through the unchanged existing owner `mapRecoveryReceiptToLines`/shared kernel. There is no second allocation implementation, no reconstruction of saved rows, and no allocation call added to the illustration. It consumes the resulting exact rationals unchanged. Synthetic fixture-qualified source records are assumed pure inputs, not evidence that a database command approved them. Empty qualification inventory is explicitly constructed in the pure zero cases only; no runtime missing-proof fallback is added. Model outputs never supply arithmetic or entitlement.

The SV6-16 test does not claim a persisted `shadow-30000` seed, a server transport, navigable source records, proof of actual settlement, or the complete “found”/fractional display contract. No new unpaid billed-value projection was built; the new false/missing settlement assertions prove only refusal of unsupported qualification. SV6-BEN-Q4/Q5 have no separately claimed new acceptance in this bounded lane.

## Mutation evidence

Thirteen temporary mutations were executed serially. Each named selected test failed (exit 1, one failing test); the source was restored in `finally`. All logs were inspected for actual test failures rather than import/transformation failures. The other 29 tests were unselected by `-t`, not shipped skip statements.

| Mutation | Selected named test / observed failure |
|---|---|
| Remove shared receipt existence cutoff | F5 deposit: catch incorrectly appears in deposit allocations. |
| Bypass explicit branch | F6 explicit non catch: output no longer contains only the remitted main line. |
| Remove invoice identity filter | F7 separate invoice: main invoice participates in catch receipt. |
| Sum first catch only | SV6-16: recovered principal is no longer £800. |
| Replace captured projection with zero | SV6-16: captured total no longer £3,600. |
| Populate captured fee with catch fee | SV6-16: existing zero-only output schema refuses the formerly valid result. |
| Remove fee subtraction from yours | SV6-16: exact yours no longer £720. |
| Replace fixed rate numerator 10 with 0 | SV6-16: shared rate validation refuses the formerly valid result. |
| Remove parent conjunct qualification check | SV6-16: false settlement fact is accepted. |
| Default missing payment fact to a true synthetic bound source | SV6-16: missing settlement proof is accepted. This deliberately models the forbidden missing-proof default. |
| Remove capture tenant check only | SV6-16: foreign capture is accepted. |
| Remove capture job check only | SV6-16: wrong-job capture is accepted. |
| Remove capture lock check only | SV6-16: wrong-lock capture is accepted. |

Mutation runners: `/private/tmp/jg-sv6-12-16-mutations.py` and `...-missing-mutation.py`; logs `/private/tmp/jg-sv6-12-16-mutant-*.log`. These are deterministic local checks, not independent model review. Temporary parent/allocator source mutations are absent from the final diff.

The initial unmutated focused run had 29 passes and one test failure: the test expected this leaf's typed error from a helper that parsed first and therefore threw ZodError. Corrected the two new refusal assertions to call the public leaf directly, retaining typed-error checks. The next restored focused run passed all 30 tests. No existing assertion was weakened.

## Checks

Dependencies were already installed; no install or download attempted. Node v24.17.0, pinned pnpm 10.28.1, Vitest 4.1.11. `pnpm` below uses a temporary PATH shim to the already-installed `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`, including child processes. All heavy checks run one at a time, every Vitest invocation uses `--maxWorkers=2`, root Turbo uses `--concurrency=1`. Load checked before checks; runner waits in 15-second intervals if the one-minute load exceeds 20. No PostgreSQL, browser, listener or localhost service started. No fresh-install claim.

| Command | Actual result |
|---|---|
| `pnpm --dir packages/core exec vitest run --maxWorkers=2 src/recovery-fee-illustration.test.ts` | PASS exit 0, 30 tests; includes four new exact-title cases. After correcting the initial typed-error assertion, before temporary mutations; final full source run below confirms restoration. |
| `pnpm typecheck --concurrency=1` | PASS exit 0, 7 tasks, 2 cache hits, 43.662s. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | HOLD exit 1: core purity runs, then lane guard refuses 11 inherited parent paths; package Turbo lint does not run. No allowlist widening. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | HOLD exit 1: same 11 inherited parent paths. |
| `pnpm --dir packages/core lint` | PASS exit 0. |
| `pnpm --dir packages/core exec vitest run --maxWorkers=2 src` | PASS exit 0: 126 source files, 3,013 tests (all parent source regressions retained), 16.01s. |
| `CIRCLE_NODE_TOTAL=2 pnpm build --concurrency=1` | PASS exit 0, 7 tasks, 2 cache hits, 1m20.335s. Existing web CSS warnings and Turbo sandbox cache I/O warnings only. |
| `pnpm openapi:check` | Exit 1: installed tsx CLI cannot create its IPC pipe (`listen EPERM`) in sandbox, before generator execution. |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | PASS exit 0: same generator/snapshot check using installed loader, without CLI IPC. No snapshot changes. |
| `node tools/money-arithmetic-lint.mjs` | PASS exit 0; run separately because root lint stopped before this check. |
| `node tools/commercial-boundary-lint.mjs` | PASS exit 0; run separately for the same reason. |
| `git diff --check` and exact working-tree scope/whitespace inspection | PASS exit 0; final three paths listed in lane plus its implicitly allowed registration. |

The 11 main-range rejections are inherited SV6-01/SV6-05 registration files, both parent contracts/receipts, the three attribution-persistence files, and the illustration implementation/type-test. The parent's runtime test file is deliberately owned by this lane for the issued additions. This comparison includes accepted but unmerged parent commits; it is an integration hold, not a local source-test failure. The lane was not widened to own their history. Dispatcher must resolve the comparison against the accepted stack. No claim of green root lint is made.

The two cache hits in typecheck/build are reported as Turbo reuse, not freshly executed package evidence. Current core tests/lint and changed core typecheck/build were executed. No scheduler wait above load 20 was observed during these checks.

Logs: `/private/tmp/jg-sv6-12-16-{focused,typecheck,lint,lanes,core-lint,unit,build,openapi,openapi-loader}.log`; serial results `/private/tmp/jg-sv6-12-16-results.json`. Turbo cache reuse and sandbox I/O warnings are recorded with the results. Source-only unit discovery intentionally avoids the parent's known generated-dist source-inspection failures; it is not represented as unfiltered `pnpm test` success.

## Handoff and holds

- SV6-12 aggregate acceptance is DEPENDENCY-BOUND. SV6-16 is **INCOMPLETE — HELD**; numeric pure assertions do not complete its server value receipt. SV6-10 and SV6-29 remain **INCOMPLETE — HELD**, outside this lane's acceptance scope.
- SV-5, complete CH-7 and the M4-8 allocator prerequisites must land and their real interfaces be inspected. CH-7's line-887 ready rule remains active; no founder split is inferred. No allocator-owned line-gross, mixed-tax or fractional case-split rule was invented. Q3/Q4/Q5/Q9 and downstream persisted journey holds remain as applicable.
- Literal card browser assertions: **NOT BUILT / NOT RUN — UI parked**. Existing mandatory browser regressions, DB/migration suites and complete GitHub CI remain dispatcher/reviewer obligations after push. The sandbox cannot bind localhost or start PostgreSQL. No mocked test is called a database test.
- Invariants exercised: tenant/job/lock isolation (§5.1); exact principal/fee arithmetic (§5.5); qualifying settlement (§5.6); model non-authority (§5.9); synthetic no-charge identity (§5.10); capture fee freedom (§5.14). No schema/migration/backfill, provider, permission, prompt/model/matching policy, production behavior or operational alert changes. Rollback is removing these additive tests and lane/receipt; no data changes exist.
- No independent verdict or separate acceptance exists for this uncommitted candidate. The dispatcher must bind the eventual commit to real independent model verdicts and a separate accepting actor. No professional sign-off, live model evaluation, provider integration, production fee policy approval or aggregate SV-6 completion is claimed.
- Intended conventional commit subject/body: `/private/tmp/jg-msg-sv6-12-16.txt`. Dispatcher commits after exit.

## Session record

Policy read: `/Users/benharwood/Claude/Projects/my-new-project/docs/workflow/CODEX_SESSION_POLICY.md` (adopted 21 October 2026). Runtime identity below comes from the dispatcher CLI header in `sv6-12-16-20261024T041654.log`; no credentials recorded. Unavailable provenance remains unknown.

```yaml
session_record_version: 1
task_id: SV6-12-16
project: JobGuard
role: builder
thread_id: 01a16be9-695f-7281-8104-911e95316e11
surface: codex-cli
host: local macOS dispatcher sandbox
authorised_route_ref: /Users/benharwood/.local/share/full-steam/jg-runs/sv6-12-16-20261024T041654.log
repository: ben2harwood-lgtm/jobguard
integration_target: main
integration_target_revision: 6993a0cb59b9c26c25ae316b02c747cacc15e7e7
worktree: /Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv6-12-16
branch: codex/sandbox/sv6-12-16
starting_base_revision: 68c87b84ec5ede05434d16034079e507aa9f1635
source_pin: 68c87b84ec5ede05434d16034079e507aa9f1635
candidate_revision: unknown # uncommitted; dispatcher commits after exit
last_validated_revision: unknown # validated working tree; content hashes below
allowed_files_ref: config/lanes/sv6-12-16.json
governing_contract_ref: /Users/benharwood/.local/share/full-steam/jg-runs/draft-finish2-sv-6-20261013T203059.md
model_requested: unknown
effort_requested: unknown
model_runtime_confirmed: gpt-6.1-sol
effort_runtime_confirmed: medium
runtime_confirmation_ref: /Users/benharwood/.local/share/full-steam/jg-runs/sv6-12-16-20261024T041654.log
last_completed_turn: initial bounded build; final handoff follows receipt
last_receipt_ref: docs/verdicts/SV6-12-16/BUILDER_RECEIPT.md
state: built-pure-awaiting-dispatcher-commit-and-review
resumed_from_thread_id: unknown
successor_reason: unknown
preflight_ref: docs/verdicts/SV6-12-16/BUILDER_RECEIPT.md#authority-and-preflight
result_id: unknown
acknowledgement_ref: unknown
ci_evidence_ref: unknown
reviewer: unknown
review_evidence_ref: unknown
accepting_actor: unknown
acceptance_evidence_ref: unknown
outstanding_holds: dependency merges; persisted figures; full CI; main-based lane range; exact-commit review; separate acceptance; held value receipt; UI parked
builder_finished_at: 2026-10-24T03:22:35Z
coordinator_acknowledged_at: unknown
integrated_at: unknown
merged_revision: unknown
```

## Changed-content binding

Uncommitted candidate; receipt not self-hashed.

- `config/lanes/sv6-12-16.json` — SHA-256 `f76641c5d858f434c6840c920d209e65517dbed69d15a611ba630f0102fd2e90`
- `packages/core/src/recovery-fee-illustration.test.ts` — SHA-256 `bdfe8831c33133c4c689d57b32d77ade8334d0cdb1dde2c3092ffda03e219302`
