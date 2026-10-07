VERDICT: PASS — bound to head 77769fc71f37322139b7def8fd77318526e21c11
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

**Delta re-review of my REPAIR verdict at 05117f3** (comment 6037278797). It covers the single repair commit 77769fc.

## In plain English

All four blocking problems from my last review are fixed, and my probes now fail where they should.
- A catch can no longer be fed into the fee without going through the receipt-to-line allocation.
- The same line can no longer be counted on two invoices.
- Receipts must now be listed in time order.
- Merging duplicate signals now respects their state and revision.

Every P3 item is either fixed or given a written disposition in the receipt. I found no regressions. Every fee fixture still comes out to the exact penny.

One condition before merge. GitHub has not run CI on this head, because the PR conflicts with main on the one-line lane registry. Whoever merges must first add the usual "lane registry union only" merge commit. That commit needs green `checks` and a quick check that it touched only the registry.

## Earlier findings: re-probed at 77769fc

My 15 original probes plus 4 new regression probes were re-run from a scratch file outside the PR. Exit 0; the only failure is P-F, whose input is now correctly refused, as noted below.

| Finding | Result at 77769fc |
|---|---|
| **P1-1** catch principal bypass and double count | **Fixed.** `success-fee.ts:8` refuses `missed_variation_final_account` in `principalEntries`. Lines 47–50 refuse one (category, case, work, line) identity entering through both routes. Probe P-A2: the principal route is now refused, and allocation still gives exactly 2,000,000/43p and 4,651p. P-A1, the aliased proof double count, is now refused. F9 now runs through allocation on one line: 5→0, 15→2, 25→2, and two 5p receipts give Q = 10 and F = 1. |
| **P2-1** same line on two invoices | **Fixed.** The balance check is keyed on line ID, and a changed invoice ID is refused (lines 77–79). Total net allocated per line is held between 0 and the line's net (lines 101–105). P-A3 is now refused. |
| **P2-2** receipt order | **Fixed without copying SH-1.** `assertReceiptOrder` (lines 13–32) asks SH-1's own allocator a zero-value "did this line exist by then?" question. That gives SH-1's exact comparison, including offsets and sub-millisecond fractions. It adds no money and no source to the result. Reversals must follow their original and do not reset the latest receipt time. P-D2: the reordered listing that inflated Q from 500p to 667p is now refused, and the correct order still gives 500p. P-D (deposit listed after a later receipt) is refused. Same-instant receipts across invoices, written with different offsets, are still accepted. |
| **P2-3** duplicate merge | **Fixed.** Both expected revisions are now required, and only candidate, held or surfaced-early signals can merge (`signal.ts:126–134`). P-E: a duplicate at `recovery_case_created` is refused with `INVALID_TRANSITION`. There is a 9×9 state-pair table test. Reconciled captured, scope and final-account results can no longer be overwritten. |
| **P3** Codex bot: explicit reversal | Dispositioned in the receipt as item-specific first under §10.3.2, and tested. Agreed. |
| **P3** Codex bot: partial principal reversal | Supported by full reversal plus a sourced replacement entry. Tested at 32,000→24,000p (delta −800p), and for a credit cut to 20,000p falling below the 25,000p minimum (Q 0, delta −3,000p). Repeated over-reversal is refused. Adequate. |
| **P3** dismissed dispute review | **Fixed.** A review now needs an `attribution_disputed` exclusion, and a dismissed review never qualifies. P-F's orphan review is refused at the schema. All 1,024 truth assignments still pass. |
| **P3** D13 safety without the significance fact | **Fixed.** The significance fact is required only when rule 2's other two conditions hold. P-G: a safety-only input now fires. A new matrix shows the signal surfaces early whatever its confidence (low, medium, high) or value (unknown, zero, positive). |
| **P3** payment after refund | Documented for M4-8-S, and a test now asserts the refusal. Agreed. |
| **P3** circular evaluation sources | **Fixed.** The default `fixture://evidence/6` is gone. Every row now carries references from its actual fixture output, checked against a declared inventory. |
| **P3** F8 | Now modelled as an invoiced 80,000p catch with zero settled cash and pending proof. Zero fee and no allocations. |

## Regression checks

- **Scope:** 10 files changed since 05117f3, all inside the `sv-1` lane: 4 production files, 5 test files and the round-2 receipt. The lane registry and `core/src/index.ts` are unchanged since 05117f3. `fee.ts`, `activation.ts`, all SH-1 kernels and tests, `evidence-pack.ts`, `tools/` and both `package.json` files are byte-identical to the PR base. Migration: none.
- **No timeout raised, nothing skipped or weakened.** The 100-case split property test is split into 10 batches. I checked that the seed skip-ahead (20 draws per batch) covers exactly the original 100 cases. No timeout, skip, only or retry appears in the code delta.
- **Adjusted older assertions are equal or stronger.**
  - The old "alias" and "negative reversal" tests used catch facts that are now refused at the schema; they were moved to `merchant_overcharge` with the same intent.
  - The out-of-range test now runs through allocation and asserts `INVALID_SHARED_MONEY`.
  - The permanent-exclusion attribution test adds the dispute history the new rule requires.
- **Probe P-B:** reversal signs still match SH-1 across explicit, pro-rata and combined reversals, and over-reversal is still refused.
- **Probe P-C:** every Q from 1 to 400p, single and split (798 split checks), still gives exact Q, half-even F and deltas that add up to the final fee.
- **Probes P-C2, P-C3, P-H:** F4 and F5 recomputed from first principles still match. Q above 10¹² is still refused with a typed error. The lock digest still behaves.
- **The 2-way merge conflict** with main is only `config/agent-lane-assignments.json` (checked with `git merge-tree`).

## Non-blocking residuals (P3, for the CH-7 / M4-8-S plan entry)

1. **Cross-route identity includes category and case ID, exactly as my previous verdict asked.** Changing those still lets the same line count through both routes.
   - Probe R1: the same withheld-payment line with only the case ID changed gives Q 500,000p instead of 250,000p.
   - Probe R1b: a catch paid through allocation, plus the same line ID relabelled as a withheld-payment principal with another case, gives Q 160,000p.
   - Both need the caller to assert a second, false case or category. That is inside the caller-trust boundary for non-allocated categories, and CH-7 owns category and proof admission.
   - One-line hardening when convenient: refuse a line ID that appears in both routes, whatever its category or case. CH-7/D03 should also decide whether a catch recovered inside a withheld-payment case counts once.
2. **Pre-lock merging marks the duplicate as `reconciled/duplicate_signal` with no lock** (probe R4). This behaviour already existed at 05117f3. §10.2.2 places `reconciled` after lock, so SV-2/SV-3 should confirm the intended marker.
3. **The receipt-order check uses SH-1's allocator as a comparator** because SH-1 keeps its comparator private. If SH-1 ever exports it, switching over is a coordinator-serialised tidy-up.

## Evidence

### Executed locally at 77769fc
- `pnpm install --frozen-lockfile --ignore-scripts`: exit 0.
- **The 10 SV-1 test files** (exact work-order command): exit 0, 105/105.
- `pnpm --filter @jobguard/core exec vitest run src`: exit 0, 47 files / 418 tests, including the SH-1 stress tests.
- `pnpm typecheck`: exit 0, 7/7.
- **`pnpm lint`** with simulated PR metadata (base a5ed99a, head 77769fc): exit 0. Lane boundary, core purity and money arithmetic passed, 7/7.
- `pnpm build`: exit 0, 7/7.
- **`heavy-slot pnpm test`:** exit 1.
  - Passed: tooling 42/42, core 94 files / 836, AI 72, API 108 plus `openapi:check`, web 63, storage, config.
  - Failed: `@jobguard/db`, because embedded PostgreSQL would not start here ("Postgres init script exited with code null"). That is a local environment problem, made worse by installing with `--ignore-scripts`. I did not retry, as instructed.
- **Probes:** 19 adversarial probes, as above.

### CI
- No GitHub run exists for 77769fc. `gh run list` shows runs only for 4b166b2 and 05117f3, because the conflicting PR has no merge ref.
- The DB and browser suites last ran green on 05117f3 (run 37584093343: DB 191, e2e 166). The delta touches no file outside `packages/core/src/shadow-domain/` and `docs/`. Nothing outside the domain imports these functions; I grepped `apps`, `packages` and `tools`. So those results carry over for unchanged code, but they are not exact-head evidence.
- **Merge precondition:** green `checks` on the lane-registry union commit.
- `dependency-review` was the known repo-wide red; main now has the #113 fix.

### Not verified
- DB integration and e2e on this exact head: local PostgreSQL was unavailable and there is no CI run.
- `pnpm eval` was not run separately; the AI 72 tests ran inside `pnpm test`.

