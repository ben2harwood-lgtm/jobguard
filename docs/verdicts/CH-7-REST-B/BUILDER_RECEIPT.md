# CH-7-REST-B — builder receipt, issuance STOP

18 October 2026. RED qualifying-money lane. **DW3 NOT IMPLEMENTED; no technical acceptance claimed.**

Inspected/tested inherited HEAD: `302e6f01aac7fc2bb4a05ea5f50c6b7b5944263c` (A #292 build-ahead base). B changes are uncommitted documentation and lane configuration only. The dispatcher must bind any eventual implementation and independent different-model verdict to its exact commit; the builder does not self-accept.

## Work and STOPs

Read repository AGENTS, BUILD_PLAN §§10.3.3/CH-7, recovery eligibility and terms contracts, Ben's 17 October answers, the referenced 18 October remainder draft, A's ledger/receipt, core evaluator and repository, and latest routine locations. No external provider/research needed.

The issuance requests “sub-order A”, but its pasted B draft has no such section. The referenced draft's A is F21, already present. Asked for scope clarification asynchronously; no reply received at receipt preparation.

STOP-2 blocks the actual atomic DW3 change: missing/pre-terms result wording, saved exclusion versus refusal, and header/line precedence are expressly undecided. No allowed existing reason describes a post-opening/pre-terms receipt. No null/held encoding, refusal contract or new wording was invented. STOP-1 also remains for equality and reversed transaction-start/commit ordering. These are explicit order restrictions, not newly imposed approval requirements. No permissive application-only slice or incomplete SQL guard was installed.

Completed unaffected work: exact B lane (never lists itself), refreshed dependency/routine anchors, itemized STOP ledger, baseline verification, intended commit message. A's F21 changes are untouched. Local maximum migration is 0195, so lane substitutes 0196 in both future paths; **no migration installed**. No backfill, new objects, grants, RLS changes or inventory exceptions. Ruling 113 was not exercised. No new alerts, providers, financial effects or compatibility changes.

## Execution evidence

Preinstalled dependencies used; no install/download requested. Node 24.17.0 differs from pinned .nvmrc 24.15.0, so this is not exact pinned clean-install evidence. Initial ambient `pnpm --version` stalled and was interrupted (130); subsequent commands used cached pnpm 10.28.1 through `PATH=/private/tmp/jg-ch7-cont-bin:$PATH`, as A's receipt documents. No git write commands run.

| Command | Actual result | Local log |
| --- | --- | --- |
| `pnpm typecheck` | PASS, 7 tasks, 2 cached | `/private/tmp/jg-ch7-b-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL at lane boundary: inherited A paths outside B | `/private/tmp/jg-ch7-b-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL for the same eight inherited A paths | `/private/tmp/jg-ch7-b-lanes.log` |
| `LANE_BASE_REF=302e6f01aac7fc2bb4a05ea5f50c6b7b5944263c pnpm lint:lanes` | Refuses self-comparison (base equals current HEAD), not a pass | `/private/tmp/jg-ch7-b-own-lanes.log` |
| `pnpm exec turbo run lint` | PASS, 7 package tasks, 2 cached; does not replace root lane check | `/private/tmp/jg-ch7-b-package-lint.log` |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-eligibility-v3.test.ts --maxWorkers=2` | PASS, 45/45 inherited tests | `/private/tmp/jg-ch7-b-core.log` |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-eligibility-v3.application.test.ts --maxWorkers=2` | Initial import failure before db build output existed; repeated after output became available: PASS, 15/15 mocked tests | `/private/tmp/jg-ch7-b-api.log`, `/private/tmp/jg-ch7-b-api-after-build.log` |
| `pnpm openapi:check` | BLOCKED by tsx IPC listen EPERM | `/private/tmp/jg-ch7-b-openapi.log` |
| `node --import tsx src/generate-openapi.ts --check` (apps/api cwd) | PASS, exit 0; same checker without tsx IPC wrapper | `/private/tmp/jg-ch7-b-openapi-direct.log` |
| `git diff --check` | PASS | terminal |

The eight inherited lane failures are A's web assertion, lane file, ledger, receipt, 0195 SQL/note and two F21 test files. No B-owned edit to these files. STOP for widening B to cover A; dispatcher must resolve the dependency comparison after A merges. Local origin/main was `42990862881cd048c7167869246551d5360beb17` (no fetch).

## Not run / still owed

All six new DW3 tests are NOT IMPLEMENTED / NOT RUN because their load-bearing result contract and issued sub-order remain unresolved. No failing-first failures claimed. PostgreSQL, test:db, test:migrations and browser/e2e are NOT RUN by instruction. Full `pnpm test` is NOT RUN because it invokes database suites; selected tests above are not full-suite evidence. AI evaluation is inapplicable to this documentation-only change. No real integration, independent verification, security/commercial approval or task closure claimed.

DW3 and C's non-v3 pursuit remain open, as do CI, independent RED verdict, separate acceptance and all release gates. No commit, push, merge or release. Commit-message handoff: `/private/tmp/jg-msg-ch-7-rest-b.txt`.

`pnpm build`: PASS, 7/7 tasks, 2 cached, exit 0 (`/private/tmp/jg-ch7-b-build.log`). Existing workspace-root/CSS/dependency warnings remain; no browser runtime proof inferred. Only B lane, ledger and receipt were added in this working tree.

## continuation (decision 123)

19 October 2026. This section supersedes the earlier statement that no DW3 implementation exists. Starting HEAD `00d4f3453863616f4e844be1a17eeaa43719c5a5`; parent A `302e6f01aac7fc2bb4a05ea5f50c6b7b5944263c`. Uncommitted working-tree patch, no exact final commit exists. No self-acceptance, independent verdict, merge or release claimed.

Built the decided withheld-payment terms-timing slice in core, repository and provisional 0196 forward migration. Preserved A's two guard bodies with additive timing/audit predicates, existing grants/RLS and F21 text. No historical writes, new tables, provider calls, fees or authority. Core facts require explicit server-derived timing for withheld fixtures; strict command schema rejects client authority claims. Terms are matched under the shared case lock; original principal and interest timestamps are compared in PostgreSQL at full precision, with the approval ID recorded in audit. Original command replay returns its saved result before new evaluation.

Decision 123 note is copied exactly, including ASCII apostrophes. Existing applicable explanations and component exclusions retain their reasons. Supplier-credit terms, missing-approval presentation, equality/reversed transaction ordering and fixture-policy compatibility remain item-specific STOPs detailed in `docs/ledger/CH-7-REST-B.md`. No permissive SQL bypass was left for a positive withheld-payment review. Missing/equal cases use an internal typed capability hold, not an approved outward refusal contract. **B remains incomplete / not merge-ready.**

Failing-first evidence: wrote and ran the five-test core DW3 suite before changing implementation. Actual exit 1: 3 failed / 2 passed (`/private/tmp/jg-ch7-b-123-red.log`); failures were ReceiptBeforeTermsNeverRescued, SeparateInterestUsesOwnSettlementTime and reason preservation. A second pre-change run also failed because `python` was unavailable; changed the edit invocation to installed `python3`. After implementation, targeted new and inherited core suites passed 50/50 (`/private/tmp/jg-ch7-b-123-core.log`). The missing-approval test's undefined case was corrected to avoid its own helper default. Later strict-boundary assertion was strengthened to reject actual extra authority fields without an unrelated extra key.

PostgreSQL suites were written after the initial unit failing-first run and are NOT RUN by instruction. No DB failing-first or runtime result is claimed. They cover the named tests subject to explicit TODO STOP cases; source is not execution evidence. New test fixtures declare v3 from creation and use the existing authorized terms command; they do not fabricate approvals. Only the microsecond comparator test changes timestamps as an explicit test-only superuser control after real approval. Historical upgrade source uses a local A-schema writer for historical outcome facts, never a production fallback.

Dependencies preinstalled; no download/install. Node remains 24.17.0 versus pinned 24.15.0; cached pnpm 10.28.1 used via `/private/tmp/jg-ch7-cont-bin`. This is not clean pinned-install evidence. No PostgreSQL server, localhost listener or browser was started. Full `pnpm test`, `test:db`, `test:migrations`, `test:e2e`: NOT RUN because those invoke prohibited local subsystems. No AI/model/parser change; eval inapplicable.

Final check results are appended below. Full task acceptance additionally requires fixture-scope amendments, CI PostgreSQL/browser results and independent RED review on the dispatcher-created commit. Commit message handoff remains `/private/tmp/jg-msg-ch-7-rest-b.txt`.

Additional source coverage: real foreign-tenant authorized approval rejected on audit binding; forged flags/timestamps; owner/session/revision/duplicate holds; all-table effect-count assertion. Historical insurer pre-0142 seed now explicitly uses its existing PreviousRecoveryEligibilityV3Repository rather than the changed current repository. This is test-only historical setup, preserving historical money/reason assertions; current null-policy fixtures remain stopped.

### Continuation execution results

All log paths below use `/private/tmp/jg-ch7-b-123-` as prefix. These are actual local results, not CI/independent acceptance.

| Command | Result | Log suffix |
| --- | --- | --- |
| `pnpm typecheck` | PASS, exit 0, 7 tasks (2 cached) | `typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL, exit 1: eight inherited A files outside B lane | `lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL, same inherited A files | `lanes.log` |
| `LANE_BASE_REF=302e6f01aac7fc2bb4a05ea5f50c6b7b5944263c pnpm lint:lanes` | PASS, exit 0; exact B paths including uncommitted files | `own-lanes.log` |
| `pnpm exec turbo run lint` | PASS, exit 0, all 7 package tasks (2 cached); separate from root lane check | `package-lint.log` |
| `pnpm build` | PASS, exit 0, all 7 tasks (2 cached) | `build.log` |
| New DW3 + inherited eligibility core targeted run | PASS 50/50 after initial failing-first run | `core.log` |
| `pnpm --filter @jobguard/core test` | Interrupted (130) after starting default unrestricted worker run; no completion claimed | `core-all.log` |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2` | Interrupted (130) after observing generated `dist` test failures and allocation timeouts; not a pass | `core-all-limited.log` |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | FAIL, exit 1: 2,895 passed / 1 timed out, 114 files passed / 1 failed. Failure is unchanged receipt-allocation denominator-limit test, default 5-second timeout | `core-src.log` |
| `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts --maxWorkers=1` | PASS 34/34, unchanged timeout/assertions; isolated retry does not erase broad-run failure | `allocation-retry.log` |
| API eligibility + supplier-credit application suites, `--maxWorkers=2` | PASS 20/20 mocked application tests; not provider/DB proof | `api.log` |
| `node --test tools/*.test.mjs` | PASS 100/100 | `tools.log` |
| `pnpm openapi:check` | BLOCKED, exit 1: tsx IPC listen EPERM | `openapi.log` |
| `node --import tsx src/generate-openapi.ts --check` in apps/api | PASS, exit 0; same checker without IPC wrapper | `openapi-direct.log` |
| TypeScript transpile diagnostics on both new DB suites | No syntax diagnostics; does not typecheck or execute PostgreSQL | terminal |
| `git diff --check` | PASS | terminal |

Build/typecheck/lint emitted sandbox cache-write `Operation not permitted` warnings but exited successfully. Build also retains the inherited Next workspace-root warning. No cache warning is reported as a test failure or concealed as pinned-install evidence. Final application source was covered by passing typecheck/build/package-lint; later edits were test-source and documentation refinements.

No PostgreSQL/browser runs, no approved live routes, no security/commercial sign-off and no independent recorded verdict. Named DB test sources and their TODO decision cases await dispatcher CI and review. Commit message is written to `/private/tmp/jg-msg-ch-7-rest-b.txt`; no git writes were performed.

## REPAIR (terms-approval fixture, decision 123)

19 October 2026. Test-only repair of a regression found by the independent money review. Builder: Claude (Sonnet 5.5). Starting HEAD `9075d387`. No production/source, migration, contract or assertion change; no self-acceptance, independent verdict, merge or release claimed.

**Defect.** DW3 made `RecoveryEligibilityV3Repository.review()` throw `ELIGIBILITY_TERMS_DECISION_REQUIRED` for a `withheld_customer_payment` case with no persisted terms approval (0198 also requires a `termsApprovalId` audit reference for F18/F19/F20). The merged suite `packages/db/test/recovery-eligibility-v3.integration.test.ts` never approved terms, so its withheld reviews (F18/F19/F20 and the cases built on them) would throw instead of returning the asserted result.

**Change (one file: `packages/db/test/recovery-eligibility-v3.integration.test.ts`; +18/-5).**
- Imports: `RecoveryCaseTermsRepository` and `recoveryCaseTermsHash`.
- New `termsCommand(caseId)` (same shape as `recovery-terms-timing.integration.test.ts`).
- Shared `fixture()`: only for `type==="withheld_customer_payment"` it inserts the job with the imported-v3 columns (`provenance 'imported'`, `accepted_net_value_pence 100000`, `fee_policy_version 'reference_fee_policy_v3'`, `recovery_cap_pence 1500`, the same row `recovery-terms-timing.integration.test.ts` uses) and, immediately after the case opens, approves the synthetic terms through the real authorized `RecoveryCaseTermsRepository.approve` command (no fabricated approval row). `merchant_overcharge`, `duplicate_supplier_payment` and prevention fixtures are untouched: the repository reads a terms row only for `withheld_customer_payment` (`terms` and `termsTiming` return undefined otherwise), and the unchanged v1 control reviews were checked against the migrations (no `fee_policy_version`/terms dependency outside 0134's message guards).
- `stampTimes()` (the superuser timestamp control used by the microsecond tests): one added `UPDATE app.recovery_case_terms_approval SET approved_at=LEAST(caseAt,eventAt)-1 microsecond` in the same `session_replication_role=replica` transaction, full microsecond precision, no row for non-withheld cases.
- `rawInterestCandidate()` (raw runtime writer used by the F18 raw-writer and 0166 tests): looks up the case's approval and adds `termsApprovalId` to the audit references, exactly as the repository does, so 0198's effect check reaches the originally asserted `ELIGIBILITY_FIXTURE_MISMATCH` / `ELIGIBILITY_LINES_REQUIRED` refusals instead of `ELIGIBILITY_AUDIT_REQUIRED`.

**termsTiming reasoning** (repository: `before_settlement` iff `approved_at < settlement.created_at`; core: the evaluator reports "Paid before you opened this case" ahead of the terms wording, and an unsettled/absent source is `before_settlement`). `approved_at` is `transaction_timestamp()` of the approval transaction and settlement `created_at` is the advancing transaction's `transaction_timestamp()` (0127), so a sequentially awaited approval strictly precedes any later settlement.
- F18/F19 (DW1 and every unstamped withheld test): approval happens in `fixture()` before `advance("receipt-3000")` and before the interest/compensation facts, so principal and interest are `before_settlement`; F18 stays 262000 and F19 250000 with their unchanged reasons. Confirmed by running the real core evaluator: F18 262000, F19 250000, same reason strings.
- F20 (`fixture(...,true)` settles receipt-384 before the case exists): the approval necessarily follows that settlement (`after_settlement`), but F20 forces `paymentTiming before_opening`, so the evaluator returns 0 and "Paid before you opened this case" for either timing (confirmed by running core for both). The 0198 guard also gives "Paid before" precedence over its pre-terms branch, and equality cannot occur naturally.
- Stamped timing tests (F20 before/at, F18 principal after opening, F18 interest before/at/after): the real approval (now) would be after the 11 October stamped instants, which would turn the "after opening" results into the pre-terms exclusion. The pin above puts the approval 1 microsecond before the earlier stamped instant, restoring the pre-DW3 assumption (terms approved first) without changing any expected value; it never equals a stamped time, so the 0198 equality refusal cannot trigger.

**Assertions.** `git diff -U0` of the test file shows 8 hunks: 2 import lines, the `termsCommand` helper, the fixture job insert, the fixture approval call, the stamp pin, and the raw-writer approval lookup and audit reference. No `expect`/`rejects`/`toBe`/`toEqual` line changed (F18 262000, F19 250000, F20 0 with "Paid before you opened this case", claim-line 7000/250000/12000, idempotency/stale/mismatch/injected-field/cross-job/revoked-authority rejections, FORCE-RLS/ownership/append-only catalog test and the DW4 byte-for-byte upgrade test are byte-identical).

| Command | Result |
| --- | --- |
| `pnpm --filter @jobguard/db --filter @jobguard/api --filter @jobguard/core typecheck` | PASS, exit 0 |
| `tsc --noEmit` (strict, scratch config, deleted) over `packages/db/src` plus the edited test file (db's own typecheck excludes `test/`) | PASS, exit 0; the file was confirmed in the compile set |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS, exit 0 (7 package tasks; unverifiable-dynamic-import notes are pre-existing, not failures) |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, exit 0 |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-eligibility-v3.test.ts src/recovery-terms-timing.test.ts --maxWorkers=2` | PASS 50/50 |
| PostgreSQL integration suites (`test:db`) and browser/e2e | NOT RUN (no PostgreSQL/browser locally). This repair is therefore source-reasoned plus typecheck, not execution proof; CI must run it. |

**STOP (not fixed; outside this lane/allow-list).** `packages/db/test/recovery-eligibility-v3-interest.test.ts` (mocked repository unit test, plain vitest, no database, in lane `serious-b9-s26`, not in B's allow-list) fails 5/5 at its `repo.review` calls (lines 32 and 45) with `ELIGIBILITY_TERMS_DECISION_REQUIRED` (`pnpm --filter @jobguard/db exec vitest run test/recovery-eligibility-v3-interest.test.ts --maxWorkers=1`, exit 1). Its `query` double returns `{rows:[]}` for the new `recovery_case_terms_approval` lookup, so `terms` is undefined. Test-only fix would extend that double to return a terms row and a `before_settlement` timing row; it needs the file added to B's lane (or a coordinator decision) first. Also not touched and not verified: other merged suites that call the current repository for withheld F18/F19 with no approval (`ch7-f21-reason-upgrade.integration.test.ts:90`, `practice-facts.integration.test.ts:402`, `recovery-timing-pin.integration.test.ts` `assertReview`, `recovery-insurer-money.integration.test.ts` current-repository reviews around lines 286-387). Their fixtures are separate copies, so they need the same treatment under a lane that allows them.

## ruling 130 / option B (refined by ruling 131)

19 October 2026. Builder: Claude (Sonnet 5.5). Starting HEAD `d59b5704`. Applies Ben's decision 123 as coordinator ruling 130 option B, with ruling 131's added test and FIX-LATER item. Builder only: no push, merge, self-acceptance, independent verdict or release claimed. Only files in lane `ch-7-rest-b` were edited; `packages/db/test/recovery-eligibility-v3-interest.test.ts` and CH-7-REST-A's pursuit guard were not touched.

**Rule implemented.** An eligibility review never throws `ELIGIBILITY_TERMS_DECISION_REQUIRED` (the code is removed from `RecoveryEligibilityV3Error`). Decision 123's exclusion (outcome `excluded`, qualifyingPrincipal 0, exact note "This came in before your fee terms were agreed, so it isn't counted as recovered money and there's no fee on it.") applies ONLY when a `recovery_case_terms_approval` exists for the case AND `approved_at` is strictly AFTER the qualifying settlement event's `created_at`. Approval before the settlement: the case qualifies normally. No approval at all: terms do not gate the review and it evaluates exactly as before DW3 (the receipt qualifies if the money is real; F18 262000, F19 250000). The terms requirement remains at pursuit only (part A).

**Production changes.**
- `packages/core/src/recovery-eligibility-v3.ts`: removed the `superRefine` that made `termsTiming` mandatory for F18/F19/F20 (the field stays an optional, server-derived, strict fact; the command schema still rejects it from clients); removed `ELIGIBILITY_TERMS_DECISION_REQUIRED` from the error union; `feeTermsApprovedBeforePursuit` is now `termsTiming!=="after_settlement"` (it was `==="before_settlement"`, which made absent mean excluded) so only `after_settlement` excludes. The `beforeFeeTerms` wording, its place in the reason precedence (after before-opening, insurer, component, pending/unverified) and all money/reason logic are unchanged.
- `packages/db/src/recovery-eligibility-v3-repository.ts`: removed both throws. The terms row is read only when `to_regclass('app.recovery_case_terms_approval')` exists (same schema-boundary pattern as the payer mark, so earlier upgrade proofs that run this repository before 0134 still work) and the case is a withheld payment. No approval gives `termsTiming` undefined. With an approval, `termsTiming` is `after_settlement` iff the settled source has `approved_at > created_at` (full timestamptz precision, SQL side); earlier, equal, unsettled or absent source is `before_settlement`. F18 interest keeps its own settlement timing. The `termsApprovalId` audit reference is added whenever an approval exists. Lock order, idempotency/replay, stale/mismatch checks, payer logic and all arithmetic are unchanged.
- `packages/db/migrations/0198_recovery_eligibility_terms_timing.sql` (CREATE OR REPLACE of the two existing routines only; no new catalogued objects, so the serious-b5 inventory is untouched; no grants/ownership/search_path change): `guard_recovery_eligibility_v3()` lost both `ELIGIBILITY_TERMS_DECISION_REQUIRED` raises (missing approval and approved_at = settlement); `pre_terms` is `terms.id IS NOT NULL AND coalesce(e.state='settled' AND e.created_at<terms.approved_at,false)`; the F18 interest pre-terms branch also requires `terms.id IS NOT NULL`. With no approval the guard expects exactly the 0197 (pre-DW3) result. With a late approval it still forces Q 0 and the exact note, and every forged positive result, amount, flag or timestamp is still rejected (`ELIGIBILITY_FIXTURE_MISMATCH` / `ELIGIBILITY_LINES_REQUIRED`), so it stays fail-closed on money. `require_recovery_eligibility_v3_effect()` now demands the matching `termsApprovalId` audit reference only when the saved result contains the terms-exclusion wording (`position(note in NEW.result::text)>0`), not for every F18/F19/F20 result; a review produced without terms needs none, and a foreign/mismatched approval on a terms-exclusion result is still `ELIGIBILITY_AUDIT_REQUIRED`. `diff 0197_ch7_f21_reason.sql 0198_...sql` now shows only the terms-gating hunks.

**Tests.**
- Reverted (byte-identical to `origin/main`, verified with `git diff origin/main --quiet`): `packages/db/test/recovery-eligibility-v3.integration.test.ts` (undid the repair 9075d387..d59b5704 fixture/`stampTimes`/`rawInterestCandidate` terms additions AND the feature build's four `termsTiming:"before_settlement"` fact arguments, which were only needed while the field was mandatory; the feature build added no test cases to this file, so nothing legitimate was dropped). Every original assertion (F18 262000, F19 250000, F20 0 "Paid before you opened this case", claim lines 7000/250000/12000, idempotency/stale/mismatch/injected-field/cross-job/revoked-authority, FORCE-RLS/ownership/append-only, DW4 upgrade) is unchanged and, by source reasoning, holds with no terms set up. Same reason, same result for three other lane tests that the feature build had only given `termsTiming`/previous-repository workarounds: `packages/core/src/recovery-eligibility-v3.test.ts`, `apps/api/src/recovery-eligibility-v3.application.test.ts`, `packages/db/test/recovery-insurer-money.integration.test.ts` are now identical to `origin/main`.
- Updated for option B: `packages/core/src/recovery-terms-timing.test.ts` (undefined `termsTiming` no longer throws: asserts 262000/250000/0 normal results and that absent, key-absent and `before_settlement` agree; null/"missing"/"equal"/true still throw) and `packages/db/test/recovery-terms-timing.integration.test.ts` (the missing-approval test now asserts a normal provisional review with no `termsApprovalId` citation; the rollback concurrency case now expects 250000 and 1 audit event instead of the old throw/0 audit events; the two STOP todos reworded).
- ADDED (ruling 131): `Decision 123 (ruling 131): money settled first, fee terms approved strictly later => excluded and not counted, never a throw or the qualifying value` in `recovery-terms-timing.integration.test.ts`. The receipt settles, then the real authorized approval is taken, then the deterministic superuser pin (`SET LOCAL session_replication_role=replica; UPDATE recovery_case_terms_approval SET approved_at=settlement.created_at + 1 microsecond`) makes the ordering exact; it asserts `approved_at>created_at`, `review()` resolves (no throw) to `excluded`, Q 0 on every line, the exact note, and the `termsApprovalId` audit reference. The complementary case (approval before settlement qualifies) is covered by the existing `SeparateInterestUsesOwnSettlementTime` (250000, then 262000). NOT RUN locally.

**Interpretation to confirm.** Ruling 130 says the exclusion applies "ONLY when approved_at is strictly AFTER" the settlement. An exactly equal timestamp therefore is not excluded and qualifies (previously a STOP). It cannot arise naturally (each side is its own transaction's `transaction_timestamp()`), and there is no test constructing it. Reversed transaction-start/commit ordering remains undecided and unimplemented.

**Stale build artifact (not a code defect).** `packages/db` tests resolve `@jobguard/core` through the gitignored `packages/core/dist`, which still held the pre-option-B build (its `superRefine` produced `INVALID_COMMAND` for the unedited mocked suite). Rebuilt locally with `pnpm --filter @jobguard/core build`; CI builds from source.

**FIX-LATER (ruling 131).** Show the no-terms review figure as provisional (pursuit is gated on terms in part A). Until then a withheld-payment review with no approval displays a normal qualifying figure although no pursuit or fee can follow without terms. Not implemented here (UI/copy is outside this lane).

| Command | Result |
| --- | --- |
| CRITICAL: `pnpm --filter @jobguard/db exec vitest run test/recovery-eligibility-v3-interest.test.ts --maxWorkers=1` (mocked pool, file UNEDITED vs `origin/main`) | PASS 5/5 (principal-only 250000; interest cases 250000/250000/250000/262000 with unchanged reasons). Failed 5/5 only against the stale core `dist` before the rebuild; passes against current source. |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-eligibility-v3.test.ts src/recovery-terms-timing.test.ts --maxWorkers=2` | PASS 50/50 |
| `pnpm --filter @jobguard/db --filter @jobguard/api --filter @jobguard/core typecheck` | PASS, exit 0 |
| `tsc --noEmit` (scratch config, deleted) over `packages/db/src` plus the edited/reverted DB test files (db's own typecheck excludes `test/`) | PASS, exit 0 |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS, exit 0 (7 package tasks successful) |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, exit 0 (re-run after the commit, see the final report) |
| PostgreSQL integration suites (`test:db`, including 0198 SQL execution and the new ruling-131 test) and browser/e2e | NOT RUN (no PostgreSQL/browser locally by instruction). The 0198 SQL edit is source-reasoned only; CI must run it. |
