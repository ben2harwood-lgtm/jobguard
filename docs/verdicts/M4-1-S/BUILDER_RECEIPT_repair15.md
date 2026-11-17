# M4-1-S-R — builder receipt, repair 15

Date: 7 October 2026. Builder: Codex. Branch: `codex/sandbox/m4-1-s-repair`, this worktree, PR #103. Starting and still-current Git HEAD: **f57744acbeb68ac4ae08c7e460d0ea873e7a426b**. This receipt describes the uncommitted working-tree repair; the dispatcher must bind the subsequent independent verdict and separate technical acceptance to the commit it creates. **Not independently verified, not accepted.** No repository commit, staging, checkout, push, merge, PR creation, deployment or release was performed. Existing work and historical receipts are retained.

Read: repository AGENTS.md rev 3.0, BUILD_PLAN.md §2/C1–C8, recovery contracts and M4-1 card, §12.2–12.3, the original HOLD and repair trail in `docs/verdicts/M4-1-S/`, and the supplied GPT-6.1 Sol REPAIR on f57744a. Synthetic data only; existing dependencies reused. Node **24.17.0**, cached pinned pnpm **10.28.1**, Vitest **4.1.11**, Next **15.5.25**. Logs: `/private/tmp/jg-repair15-logs/`. All pnpm commands below use `PATH=/private/tmp/jg-repair15-bin:$PATH`, a temporary launcher for the already cached pinned pnpm CLI. The default version probe stalled and was interrupted (130); no dependency installation was performed.

## Finding → fix → test

**P1, inherited dependency review failure — acceptance blocker, not repaired in this lane.** The supplied verdict reports critical `proxy-addr@2.0.7`, high `sharp@0.35.4`, and high `source-map-js@1.2.1`, with patches ≥2.0.8, ≥0.35.5, and ≥1.2.2. Remediation/integration needs the appropriate security lane: exact paths **`package.json` and `pnpm-lock.yaml`**, outside this task's allowed paths. No lane widening, package downloads, scanner waiver or CI changes were made. Mandatory dependency CI on the resulting candidate remains required; the earlier run is not evidence for this working tree.

**P2, refused retry discards an earlier unknown outcome — repaired.** `recovery-case-requests.ts` now classifies answers with knowledge of whether an earlier outcome is unknown. A retry refusal that does not establish that original result remains unknown, announces the refusal plus the earlier uncertainty, and retains the original body/path/selection rule/command ID. `recovery-cases.tsx` supplies that attempt context; new commands remain blocked, and later authorized reconciliation replays the original ID. Server membership/permission checks, their position before replay, and their lock/transaction/replay behavior are unchanged. The existing definitive `409 IDEMPOTENCY_PAYLOAD_CONFLICT` test remains unchanged: this specific response follows the command lookup and establishes that the exact submitted body was not the recorded command; other retry 4xx responses conservatively retain uncertainty.

Tests written and executed before production edits: three real-component/hook-runtime cases for lost committed opening → 401/403/404 refusal → restored authorization/saved replay. All failed on f57744a because the refusal erased uncertainty. They require blocked new openings, no forced-click POST, identical retry bodies/IDs, no replacing reconciliation with a GET, and the original affected case on recovery. Supplementary PostgreSQL test in `recovery-cases.workbench.integration.test.ts` really commits an opening, injects an answer-read failure, revokes an isolated synthetic membership, proves the refused replay writes nothing, restores access, and replays the same ID to the same persisted case with unchanged event/claim/audit counts. PostgreSQL execution awaits CI.

**P2, manual receipt state contradicts effective received principal — repaired.** The core transition accepts the overlapping approved principal for manual receipt/reversal events. It bounds their amounts against the manual ledger and written-off amount as before, but derives their resulting state from **max(post-event manual, approved)** plus cumulative write-off. The repository supplies the approved projection under its existing command lock. Event amounts remain manual; no principal is summed twice, approved allocation alone still does not change workflow stage, and no historical row is rewritten. An overlapping £1,000 manual record with £2,500 approved now records `landed`; reversing that manual £1,000 from a recovered closure also records `landed`, retaining the normal closure control while approved £2,500 remains received.

Four core regressions were written first: both reported combinations, effective principal plus write-off exhausting the claim, and unchanged manual receipt/reversal bounds. Three failed on f57744a (the bounds control passed). All 160 recovery-case core tests now pass. PostgreSQL `recovery.integration.test.ts` uses its existing controlled synthetic landing fixture/routine, covers both combinations, records/replays both exact commands, inspects persisted manual/approved/effective totals and event states, rejects manual over-reversal, and closes recovered again. The browser addition in `M4-1-S.spec.ts` uses real PostgreSQL synthetic fixture setup and the controlled landing routine, then real web commands; it asserts both combinations, unchanged principal/outstanding, enabled closure, reload, and the independently signed-in second-context persisted response. No successful API response is mocked or fulfilled. Database and browser additions were not run here, red or green.

**P3, response money accepts invalid principal — repaired.** Every pence field in `recovery-case.contracts.ts` delegates safe integer/magnitude validation to shared core `money()`, preserving the existing **1,000,000,000,000-pence** bound. Claimed, received, approved, outstanding, written-off and eligibility principal are nonnegative; eligibility may remain null. Obligation/compensation projections are nonnegative posted magnitudes; net job ledger liability is signed and bounded, preserving the deferred reversal-accounting behavior. Invalid successful command answers remain unknown and retain their original attempts; invalid lists fail loading.

Nine API schema tests cover every field, −1, 1,000,000,000,001, 2^53, fractions, zero, the exact bound, signed ledger extremes and null eligibility. They were written first and failed on f57744a. Three separately parameterized request-reader boundary tests also failed before the fix, showing each invalid command answer was incorrectly saved. Three component tests failed loading validation before the fix and now also prove invalid command answers remain held and retry unchanged. All affected API and full web tests pass after rebuilding stale workspace artifacts.

## Ben's decisions retained

Ben's **7 October Command Center “keep design”** decisions are recorded, not invented or issued by the builder:

1. Keep `greatest(manual_landed, approved_landed)` treating the two streams as the same money. The migration SQL and effective projection are unchanged; only post-manual-event workflow state is corrected.
2. Keep accepting M4-3-S-R's case sources, **document IDs as well as version IDs**. Source resolution/picking behavior is unchanged.
3. Keep the **reverse-landing control gated as designed**. Its UI gating conditions are unchanged; this repair does not implement REC-UI-1.

Earlier accepted fictional labels and the C7 fresh-reopen/second-context substitute remain. **REC-UI-1 and REV-ACCT-1 stay separate follow-up orders**, not built or waived here; `0018_recovery_outcomes.sql` is untouched. The earlier SBOX-SESSION-1 and allocated-gross/eligible-net follow-ups also remain deferred.

## Migration, ledger and lane

Under Ben's 5 October card `jobguard-merge-ahead-of-103-2026-10-05`, the unmerged migration moves from `0043_recovery_case_current.sql` to **`0097_recovery_case_current.sql`**, last in `MIGRATION_URLS`, after merged 0053. **SQL is byte-identical**, SHA-256 `84aef359c62455818e4eb66d26ca9d21c13c49ddd06af202fd107be3950d9375`. Registration still has **45** unique files; count assertions stay 45, the range endpoint moves to 0097, and the bootstrap test title is corrected. The upgrade test installs exactly the registered prefix before 0097, seeds preceding immutable history, then applies/replays the migration. Migration documentation follows the new order and retains the forward-fix-only strategy. No data backfill or new grants arise from renumbering. Deployment still needs this migration before current-view readers; an already-applied 0043 deployment is not claimed.

`BUILD_PLAN.md` changes by **only the requested single §12.2 ledger-amendment paragraph**. Allocation context: 0054–0093 reserved; 0094 SBOX-SESSION-1; 0095 CH-3a; 0096 CH-2; 0097 this repair; 0098 M0-6L; 0099 M4-5-S. Merge after any lower-numbered PR that merges first, or renumber again.

Only lane `m4-1-s-repair` changes: receipt points here; old migration path is replaced with 0097; `BUILD_PLAN.md` and `docs/verdicts/M4-1-S-R/**` are allowed as explicitly ordered. All other lanes are structurally unchanged. No independent verdict or acceptance was fabricated in the newly permitted folder. Shared recovery UI/repository/contracts and migration registration remain this repair's editing scope; integration with any other concurrent owners must serialize.

## Commands actually run

| Command | Exit | Result |
|---|---:|---|
| Core `vitest run src/recovery-case.test.ts` before fixes | 1 | 3 failed, 157 passed; expected state mismatches |
| API `vitest run src/recovery-case.command.application.test.ts` before fixes | 1 | 9 failed, 13 passed; invalid pence accepted |
| Web `vitest run app/ui/recovery-cases.behaviour.test.ts` before fixes | 1 | 6 failed, 98 passed; unknown retry and invalid-list failures |
| Web `vitest run app/lib/recovery-case-requests.test.ts` before fixes | 1 | 3 failed, 28 passed; each invalid answer classified saved |
| `TURBO_FORCE=true pnpm typecheck` | 0 | 7/7 tasks, uncached |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed; lane checker rejected deleted old 0043 path |
| `pnpm lint:lanes` | 1 | Same deleted-path rejection, not a self-comparison refusal |
| `pnpm exec turbo run lint` | 0 | All 7 package lint tasks; 2 unchanged tasks cached |
| Core-purity, money-arithmetic and commercial-boundary lint scripts | 0 | All passed independently; not a replacement for failed mandatory lane lint |
| `node --test tools/*.test.mjs` | 0 | 42/42; existing lane tests use temporary Git fixtures, repository Git state untouched |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` (three runs, including after build) | 1 / 1 / 1 | Each: 467 passed, 3 unchanged stress tests timed out at their existing 5,000 ms |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-case.test.ts` | 0 | 160/160, including all new state regressions |
| Full API `pnpm --filter @jobguard/api exec vitest run src` after rebuild | 1 | 144 passed, unchanged health test failed on `listen EPERM`; associated unhandled error |
| API `vitest run src/recovery-case.application.test.ts src/recovery-case.command.application.test.ts src/recovery-case.controller.test.ts` | 0 | All 45 affected tests passed |
| `pnpm --filter @jobguard/web test` after rebuild | 0 | 218/218, 14 files |
| DB `vitest run test/recovery-case-outcome.test.ts test/verify-evidence-pack-cli.test.ts` | 0 | 8/8; unit/CLI tests, not PostgreSQL guarantees |
| `TURBO_FORCE=true pnpm build` | 0 | 7/7 tasks uncached, production Next build completed |
| `node --import tsx src/generate-openapi.ts --check` (apps/api; repeated after rebuild) | 0 / 0 | Same generated OpenAPI contract check, no CLI IPC listener |
| Read-only Node migration registration/ordering/file inspection | 0 | 45 unique existing migrations in ascending order; 0097 last |
| Transpilation of the new PostgreSQL/browser test sources | 0 | Syntax/transpilation only; no DB or browser execution |
| Read-only SQL/ledger/other-lane equality inspection | 0 | Identical SQL, exact single requested plan paragraph, no other lane change |
| `git diff --check` | 0 | Clean |

The mandatory lane checker collects the union of committed-head changes **and** uncommitted deletions. HEAD still contains 0043; the ordered replacement lane permits 0097. Thus it correctly refuses the transient old path. No old-path allowance was reintroduced and the checker was not weakened. A separate read-only final-tree scope inspection found **zero violations**; it is not a mandatory-lint pass. The dispatcher must rerun both mandatory lint commands on the committed candidate; the old file is absent from origin/main and the resulting candidate tree, so it will no longer be in that PR diff. No scratch metadata was used to conceal working-tree changes.

Initial pre-build full API/web attempts also exited 1: stale compiled DB/API packages caused six API missing-method errors and two web missing-error-helper errors; web additionally still read the old response contract. Rebuilding resolved those stale-artifact failures. The initial root-level request-test invocation exited 127 (no root Vitest executable; no tests ran); its corrected apps/web invocation supplies the red evidence above. A source-inspection probe using root `--import tsx` exited 1 because tsx is only installed in apps/api; native Node TypeScript stripping then ran the migration inspection successfully. These are launch failures, not failing assertions hidden as passes.

The three core stress timeouts are unchanged: `extra-origin.test.ts`'s exhaustive offset acceptance test, and `receipt-allocation.test.ts`'s 2,000-line aggregate and distinct-denominator working-size tests. Host load exceeded 100 during verification. No assertion, timeout, retry or skip setting was changed. Their successful execution remains owed on a suitable runner. Turbo emitted existing sandbox cache IO warnings; Next emitted its existing multiple-lockfile root warning.

## Not run and remaining gates

**PostgreSQL integration suites, `pnpm test:db`, `pnpm test:migrations`, and both browser projects were not run here**, including the new tests. This sandbox cannot bind localhost or start PostgreSQL. **These suites run in GitHub CI after the dispatcher pushes.** No database/browser passes, screenshots or traces are claimed for this repair. Core/component tests and mocked transaction-boundary tests do not prove PostgreSQL or browser behavior.

No clean reinstall (downloads prohibited; existing dependencies available), full root `pnpm test` (includes unavailable PostgreSQL/health/OpenAPI CLI infrastructure), dependency scanner rerun (security-lane/CI follow-up), live providers, real data, sends, spending, production mode, deployment or professional/decision approval. No AI model/prompt/extraction/matching/gateway change; AI evaluation is inapplicable to these recovery response/state fixes.

Affected invariants: AGENTS §§5.3–5.5 and C4/C5/C7—honest unknown outcomes, exact replay IDs and authorization, safe bounded pence, effective principal/workflow consistency. Financial write routines, RLS/grants, tenant boundaries, audit structure, provider behavior and production gates remain as before. No new operational alert infrastructure. Valid response compatibility is preserved; previously invalid money answers now fail closed. Historical SQL/events/claims are not rewritten.

Handoff: `/private/tmp/jg-msg-m4-1-s-repair.txt` contains the intended conventional commit subject and body. Dispatcher commit only; no builder acceptance. Remaining gates: dependency remediation/integration; committed-candidate lint; green mandatory CI (including PostgreSQL/migrations/both browser projects and core stress tests); a fresh independent exact-commit verdict in `docs/verdicts/M4-1-S-R/`; separate technical acceptance; authorized merge in migration order. **Not independently verified, not accepted.**
