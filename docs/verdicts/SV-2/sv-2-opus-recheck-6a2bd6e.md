VERDICT: REPAIR 6a2bd6e7645b04b4e911a5a990c0296ac61c803b
Reviewer: fresh, independent Claude Opus 5.5 (12 Oct 2026). I did not build or order this piece. I edited, committed and pushed nothing. Scratch files are only in `.review-scratch/`.
Lane: RED (final refresh re-check). Scope: SV-2's own diff `d50f1e1..6a2bd6e` (26 files), compared file by file with the accepted diff `530681c..c4442e7`, plus the merge of #142 (d50f1e1).

## In one paragraph
The code is fine. SV-2's own changes are exactly what was accepted at c4442e7. The only differences are the number change from 0118 to 0128 and one new ledger paragraph. The SQL is byte-identical and no money figure moved. **However, GitHub CI run 38225234848 on this exact head finished RED.** `pnpm lint` failed at the lane-boundary check, so `pnpm test`, `pnpm build` and the browser suites were **skipped** and never ran on GitHub. The cause is the combined-state merge itself. Against main 459ec87, the branch now carries #142's four files (`docs/contracts/recovery-timing-pin-v1.md`, `docs/verdicts/STORED-TIMES-1/BUILDER_RECEIPT.md`, `packages/db/migrations/0127_recovery_timing_pin.sql`, `packages/db/test/recovery-timing-pin.integration.test.ts`), and lane `sv-2` may not edit them. Under the brief, red CI on the exact head is BLOCKING, so this is REPAIR, not PASS.

## The three statements

**1. The other six rows are byte-identical to origin/main.** `git diff origin/main..HEAD` on `packages/db/test/shared-money-origin.integration.test.ts` changes exactly one line in the loop's array:
```
-   ["small_builder","builder_logged","LogBuilderExtra"],["small_builder","final_review","AddFinalReviewExtra"],["small_builder","jobguard_catch","ConfirmJobGuardCatch"],
+   ["small_builder","builder_logged","LogBuilderExtra"],["small_builder","final_review","AddFinalReviewExtra"],
```
The contractor line (four rows) and the loop body are untouched. The six remaining rows are unchanged.

**2. The moved row is stricter.**
- The runtime role is now refused for `ConfirmJobGuardCatch`. The test calls `runtimeRefusal` with a real signal id, a random id and null, and asserts that all three errors are identical and match `{code:"42501", message:"shadow origin unavailable through runtime"}`.
- The mapping is proven only by a migration-role (`SET LOCAL ROLE jobguard_migration`) insert that names a real `shadow_commercial_signal` on the same job. The stored row is checked as `jobguard_catch` / that command / `command` / that `source_signal_id`.
- A wrong receipt type (`LogBuilderExtra`) and a null source are both refused with `23514`.
- **Nothing that used to be refused is now accepted anywhere in this file.** The whole file diff against main is that one removed row plus the added block. On main, the runtime role *could* write this origin; now it cannot. The one new accept goes through the privileged migration role on a new column. That matches item 1f in fe76e7f-opus.md.

**3. No money figure changed.** In every one of the 26 files, the changed lines (`+`/`-`) in `d50f1e1..HEAD` match `530681c..c4442e7` exactly, apart from these:
- the 0118→0128 number in `migrate.ts`, three test `migrationURL`s and comments, the contract doc, `MIGRATIONS.md` and the lane `allow` path
- the new `BUILD_PLAN.md` ledger paragraph
- the new refresh receipt.

`variation.application.ts`, `variation-repository.ts`, `shadow-repository.ts`, `demo-bootstrap.ts`, `index.ts` and the application, tenancy, demo-bootstrap and money tests are identical. No amount, rate, fee, total or rounding differs.

## One-line confirmations
- **SQL hash:** both are `d8f7370560595a47f1395dad198abacda1e1351ade096697656c76805e957afe` (c4442e7's 0118 and HEAD's 0128). Identical.
- **migrate.ts:** 0128 is listed last and once, right after 0127. No duplicate names. Every listed file exists on disk and every `.sql` on disk is listed. No migration number appears twice. Against main the only change is +0127 (from #142) and +0128.
- **Outside SV-2's own files:** the four non-SV-2 files in `459ec87..HEAD` are byte-identical to d50f1e1 (#142's head). In the shared files (`migrate.ts`, `MIGRATIONS.md`, `BUILD_PLAN.md`, `config/agent-lane-assignments.json`), `d50f1e1..HEAD` deletes nothing. So the merge resolution kept #142's content intact, ordered 0127 then 0128 (also in `MIGRATIONS.md` sections).
- **0127 wording:** it is accurate. `BUILD_PLAN.md` and the `MIGRATIONS.md` 0128 section both say 0127 (STORED-TIMES-1, PR #142) "precedes it in this branch's base". The reserved numbers 0123–0126 match the STORED-TIMES-1 ledger paragraph. The 11 Oct 0118 paragraph is explicitly superseded.
- **Assertions:** in SV-2's own diff, the only deleted test line is the moved row. The other deleted lines are two lines of `variation.application.ts`, identical to the accepted change. No `.skip`, `.only`, `todo` or timeout was added or lengthened. `apps/api/src/auth/context-boundary.test.ts` is untouched against main.
- **Lane:** all 26 files in SV-2's own diff match the `sv-2` allow list. The only edit to that line is the 0118→0128 path swap. Simulating CI's lane lint with base d50f1e1 passes.
- **Fingerprinted tables:** 0128 adds no column to any of the twelve. The one `ADD COLUMN` is `app.extra_origin.source_signal_id`. `evidence_object` gets a constraint only, unchanged from the accepted 0118.

## Findings
1. **BLOCKING: red CI on the exact head.** Run 38225234848 (pull_request, head 6a2bd6e) failed at `pnpm lint`: `Lane boundary FAILED: Lane sv-2 cannot edit:` followed by the four #142 files. typecheck passed; test, build and e2e were *skipped*. I reproduced this locally by running `tools/agent-lane-boundary-lint.mjs` with a simulated pull_request event (base 459ec87: same failure; base d50f1e1: passes). This is a process failure, not a code fault, but no GitHub test has run on this tree.
   **Repair:** let #142 merge first, merge the new main into `codex/sandbox/sv-2` (no own-file change) and push, so the PR's base includes 0127, then get a fully green run. Re-running this run will not help: it reuses the old event's base sha. Do not widen the `sv-2` allow list to cover #142's files. If the new head is only a merge of main, a delta check of the same kind as this one is enough.
2. **LATER:** the receipt's main sections verify 262f939, not this head. The combined-state addendum covers only two runs of three files on the merged tree. I checked `sv-2-combined-a.log` (3 files, 43/43 tests) and `-b.log` (3 files, 16/16), which match the receipt, but the logs do not record the head sha. The commits after f1290e9 change only the receipt, so this is paperwork.
3. **LATER:** the receipt honestly records two accidental full-suite runs on a stale `dist/`, plus a rebuild of gitignored `dist/` folders. No tracked file was affected. Worth a note for future refreshes: rebuild `core` and `db` before running database tests after a main merge.

## What I read, ran, and could not verify
- **Read:** both earlier verdicts (fe76e7f-opus.md, sv-2-opus-delta-c4442e7.md); per-file changed-line comparisons of both SV-2 diffs; the money-test diff against main; the deleted lines in `d50f1e1..HEAD`; `migrate.ts`; the `MIGRATIONS.md` section order; the `BUILD_PLAN.md` 12.2 ledger; the 0128 SQL `ALTER` lines; the lane config; the refresh receipt; the combined-run logs; the CI job steps and failed log.
- **Ran:** shasum; git diffs and ancestry checks; the lane-boundary lint twice with a simulated event; `gh run view`. I ran **no test files**: there is no local PostgreSQL in my sandbox (`pg_isready` is not installed), so I could not reproduce the database results myself.
- **Could not verify:** any database or browser test on this exact head (GitHub skipped them, and I could not run them locally). This verdict becomes PASS-eligible only with a fully green CI run on the final head after the repair above.
