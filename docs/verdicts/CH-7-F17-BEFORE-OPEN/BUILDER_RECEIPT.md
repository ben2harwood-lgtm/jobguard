# CH-7-F17-BEFORE-OPEN builder receipt — 11 October 2026

Builder: Codex (issued builder lane: GPT-6.1 Sol, high reasoning). Check lane: **RED** (qualifying money changes). Authority: the issued leaf and Ben's 11 October ruling, "Don't count it", applying the before-case rule to supplier refunds.

Base, HEAD and inspected `origin/main`: `4a70824d1fa9cab84699436ea4217a1da0ad487e` (CH-7 merged as #132). Branch: `codex/sandbox/ch-7-f17-before-open`. Changes are in the working tree only; `.git` is read-only. The dispatcher supplies the exact commit and pushes; no commit, staging, checkout, merge, release or acceptance was performed. Intended commit message: `/private/tmp/jg-msg-ch-7-f17-before-open.txt`.

Builder receipt only — not independently verified, not accepted.

## Rule before and after

Previously F17's bound M4-7-S supplier cash refund yielded 45,000p even if it settled before the case opened. Customer-payment examples already consumed the PostgreSQL `<=` timing decision.

Now F17 uses that same existing decision. Original settlement timestamp at or before case opening: `excluded`, qualifying principal exactly `{pence: 0, currency: 'GBP'}`, reason exactly `Paid before you opened this case`, also on the principal claim line. After opening, the settled example remains `eligible_for_review`, 45,000p and a null reason. The repository's existing SQL boolean is passed to the CH-7 v3 core layer; there is no JavaScript date comparison or second refund-specific SQL comparison. Timing exclusion keeps the existing priority over a duplicate-held proof state. Pending cash with no settled-before-opening fact keeps the existing pending exclusion.

Only new reviews use the corrected guard. Existing F17 review rows, claim lines and audit history are not backfilled or rewritten. A newly requested review can append the corrected candidate while preserving the original review and command replay.

Synthetic only. No fee derivation, posting, statement, pursuit, fee-terms approval, insurer path or production enablement. F14–F16 and F18–F22 logic, figures and wording remain unchanged; the original CH-7 holds remain held. No new external action, input field, provider, secret, grant or operational alert.

## Changed files

- `config/agent-lane-assignments.json`: first edit; exactly one compact, name-ordered lane line with the issued branch, receipt, note and exact allowlist. No other lane line changes.
- `packages/core/src/recovery-eligibility-v3.ts`: CH-7-only F17 timing override using the existing typed timing input; imports SV-1 and SH-1 unchanged.
- `packages/core/src/recovery-eligibility-v3.test.ts`: two appended failing-first core cases.
- `packages/db/src/recovery-eligibility-v3-repository.ts`: comment documents the shared F17 decision; executable SQL and boolean mapping are unchanged and the core fix supplies the application behavior.
- `packages/db/migrations/0123_recovery_eligibility_v3_f17_timing.sql`: restates only 0119's CH-7 insert guard.
- `packages/db/src/migrate.ts`: 0123 registered in numeric order, registered after the merged 0120 (0121 and 0122 taken by open pull requests, 0124 reserved by PRACTICE-FACTS-1).
- `packages/db/test/recovery-eligibility-v3.integration.test.ts`: import plus seven appended PostgreSQL cases and raw-write helper; no existing test body changes.
- `apps/web/e2e/CH-7.spec.ts`: one appended test with one screen assertion through existing `Open duplicate supplier payment` / `Review v3 F17` controls; refund settles before opening.
- `packages/db/MIGRATIONS.md` and `docs/contracts/recovery-eligibility-v3.md`: timing, history preservation and forward-fix documentation.
- This receipt and check logs under `docs/verdicts/CH-7-F17-BEFORE-OPEN/`.

## Routine diff against 0119

The entire routine is copied from the merged `0119_recovery_eligibility_v3.sql`, with a comment above it identifying the only behavior change. The two textual differences are:

```diff
-CREATE FUNCTION app.guard_recovery_eligibility_v3()
+CREATE OR REPLACE FUNCTION app.guard_recovery_eligibility_v3()
- ELSIF coalesce(paid_before,false) AND c.case_type='withheld_customer_payment' THEN expected_reason:='Paid before you opened this case';
+ ELSIF coalesce(paid_before,false) AND c.case_type IN('withheld_customer_payment','duplicate_supplier_payment') THEN expected_reason:='Paid before you opened this case';
```

The rest of the signature/body is byte-identical, including `paid_before:=e.state='settled' AND e.created_at<=c.created_at;`, the 45,000p after-opening branch, and the parenthesized CASE expressions in IF conditions. The existing `require_recovery_eligibility_v3_effect` routine already enforces the zero claim line and verbatim reason; it needs no replacement. 0119 is unchanged. 0123 contains only BEGIN, comments, this one CREATE OR REPLACE and COMMIT: no table, column, policy, grant, trigger or row mutation, and no routine from another migration.

Forward fix: retain immutable history and issue a reviewed later migration if another correction is needed. Application rollback must preserve the rule or fail closed against the corrected guard. Never revert to 0119's permissive guard or rewrite saved qualifying money.

## Tests by name and acceptance evidence

Tests were written before the rule and new migration. Database and browser tests were not executed, so no observed RED or GREEN database/browser result is claimed. The unchanged after-opening scenarios are preservation controls; they are expected to pass the old implementation. The upgrade test checks the named new migration and a corrected appended review as well as history preservation.

| Test | Criterion and observed result |
| --- | --- |
| Core: `F17 excludes a refund originally settled at or before opening, including settled proof` | Before fix: failed (45,000p/null/eligible). After fix: passed (0p/exact reason/excluded, including line). |
| Core: `F17 excludes a refund originally settled at or before opening, including pending proof` | Before fix: failed (pending reason rather than timing reason). After fix: passed; matches SQL precedence when settled movement proof is held by an unreconciled duplicate. |
| DB: `F17 refund settled 800 microseconds BEFORE opening: repository, saved result and core/SQL parity` | Same millisecond, explicit PostgreSQL microseconds; 0p/excluded/exact reason, full core result parity, persisted source/result, list and replay. NOT RUN. |
| DB: `F17 refund settled exactly AT opening: repository, saved result and core/SQL parity` | Equal original timestamps; same zero exclusion as F20's `<=` semantics. NOT RUN. |
| DB: `F17 refund settled 800 microseconds AFTER opening: repository, saved result and core/SQL parity` | Same millisecond; unchanged 45,000p/null/eligible, persisted and parity checked. NOT RUN. |
| DB: `F17 runtime-role raw qualifying insert for a before-opening refund cannot commit` | Complete otherwise-valid candidate/claim/audit transaction; exact SQLSTATE 23514 and `ELIGIBILITY_FIXTURE_MISMATCH`; zero committed review/claim/audit effects. NOT RUN. |
| DB: `F17 runtime-role raw qualifying insert for a equal-opening refund cannot commit` | Same complete refusal proof at equality. NOT RUN. |
| DB: `F17 runtime-role raw qualifying insert after opening still commits with complete components and audit` | Passing twin proves the raw route is valid and the refusal is timing-specific. NOT RUN. |
| DB: `0123 upgrade from 0119 preserves an existing saved F17 candidate byte-for-byte without backfill` | Separate database installs/records through 0119, saves a qualifying F17 before-opening candidate through runtime SQL, applies migration runner twice, compares complete textual review/claim/audit rows byte-for-byte, then appends a 0p review and checks the old row again. Positions checked by name/increasing order only. NOT RUN. |
| Browser: `F17 refund settled before opening shows the existing timing exclusion through Review v3 F17` | One appended assertion for verbatim reason on the existing screen/control. NOT RUN. |

All 22 earlier core tests pass unchanged, including the 45,000p F17 expectation and every other F14–F22 fixture. The DB file has seven added case instances (30 total definitions); browser has one added definition. Those counts are source counts, not executed results.

## Commands actually run

Dependencies were already installed; no install or package download was attempted. Node `v24.17.0`; pinned pnpm `10.28.1` from the existing Corepack cache. Each pnpm command used `PATH=/private/tmp/jg-f17-bin:$PATH`, pointing `pnpm` at that cached binary (the default launcher attempted manager resolution). One test run at a time, one lane file per run and `--maxWorkers=2`. No repository/package-wide test suite was run. Root typecheck, lint and build were each invoked once at the end.

| Command | Exit and count/result |
| --- | --- |
| `pnpm turbo run build --filter=@jobguard/core...` | 0; 1 successful package, before unit tests. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/recovery-eligibility-v3.test.ts` (RED) | 1; 1 file, 2 failed / 22 passed, before implementation. |
| Same targeted core command (GREEN) | 0; 1 file, 24 passed / 0 failed. |
| `pnpm typecheck` | 0; 7 successful packages (2 cached). |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passed (127 files), then the unchanged lane checker refused `Missing branch or self-comparison range; refusing a misleading pass.` Later lint stages/package lint did not run. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same self-comparison refusal because uncommitted HEAD equals origin/main. No alternate base, checker modification or git write. |
| `pnpm build` | 0; 7 successful packages (2 cached). |
| `pnpm openapi:check` | 1; tsx CLI could not bind its IPC pipe (`listen EPERM`) under the sandbox; source check did not execute via this launcher. |
| `node apps/api/dist/generate-openapi.js --check` (fallback attempt) | 1; compiled generator reported stale OpenAPI. No OpenAPI file was edited. |
| `node --import tsx src/generate-openapi.ts --check` (from `apps/api`, socket-free source-loader fallback) | 0; the same source generator used by the pnpm script matched committed OpenAPI. |
| `node tools/money-arithmetic-lint.mjs` | 0; money arithmetic boundary passed (supplemental stage skipped by root lint failure). |
| `node tools/commercial-boundary-lint.mjs` | 0; supplemental stage exited successfully. |
| `git diff --check` | 0; no whitespace errors. |
| Supplemental read-only Python diff/routine/lane inspection | 0; exact routine equality after the two stated substitutions, unchanged 0119, existing test bodies byte-identical, exactly one lane line added, all changed/untracked files matched the issued allowlist. Source inspection only; does not replace the failed lane command or PostgreSQL execution. |

Check logs are retained beside this receipt. Turbo reported existing shared-cache `Operation not permitted` warnings; Next reported existing workspace-root and CSS/cache warnings. These did not fail the successful build/typecheck. The compiled OpenAPI fallback differs from source execution; only the socket-free source-loader check passed, and the exact requested pnpm launcher failure remains recorded. No clean install is claimed.

## NOT RUN list and release gates

- `packages/db/test/recovery-eligibility-v3.integration.test.ts`, including every existing PostgreSQL test and all seven new cases: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
- Database fresh-install, migration upgrade/catalog/privilege/RLS execution and `pnpm test:db` / `pnpm test:migrations`: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Package/repository-wide suites are also forbidden by this leaf's memory limit.
- `apps/web/e2e/CH-7.spec.ts`, including the appended F17 assertion, and Playwright browser execution: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
- Whole-package/repository `pnpm test`: NOT RUN (issued memory limit; only the lane's core file was run).
- AI eval/native checks: inapplicable; no AI/prompt/model/parser/native change.

After the dispatcher commits/pushes, CI must execute the PostgreSQL/migration/browser checks and the real lint/lane checks and the standard OpenAPI launcher. A fresh Claude Opus review and a separate Sol check must explicitly assess every issued criterion, bound to that exact commit, followed by acceptance by a separate actor. None has been requested, performed or inferred here. The integrator does not build, review or accept this leaf. Technical acceptance and production release remain gated; this receipt is no verdict or approval.

## Self-review

Re-read the whole working-tree diff against `origin/main`, including the untracked migration, against the issued order. A read-only mechanical comparison confirms that the restated routine equals 0119 plus only the stated category extension and CREATE OR REPLACE; comments identify the change. All CASE expressions in IF conditions retain their existing parentheses. The original settlement comparison is unchanged in both database locations; F17 consumes the existing boolean rather than adding a timing query or JavaScript comparison.

Checked the repository's source selection still prefers the original identified settled movement, source/tenant/job/case binding remains intact, raw-write tests include the claim and exact audit hash, and the positive twin uses the same raw route. The isolated upgrade database genuinely stops at 0119, stores the old before-opening candidate, then applies 0123 without rewriting history and appends a corrected review. Saved Q is preserved, not reinterpreted on read.

All pre-existing core/browser test contents are exact prefixes of the final files. The DB file is also an exact prefix after removing only the new import; every existing expect, expected value and test body stays byte-identical. SV-1, SH-1, M4-7-S and its tests, all held CH-7 areas, pinned auth files and BUILD_PLAN.md are untouched. The lane registry minus the single new line exactly equals base. Every changed/untracked path is inside this leaf's allowlist. No implementation defect found during this pass; lint's self-comparison refusal is recorded as a failure, not worked around or claimed passed.

Builder receipt only — not independently verified, not accepted.

## CI repair 1 — 11 October 2026 (Claude Sonnet, run on the Mac)

Repair builder only. Not a review and not an acceptance. Run on the Mac where PostgreSQL starts; every number below is from a real run.

**Catch-up.** `origin/main` bbca5ca merged into the branch (merge commit 9ac01ef). Conflicts: `packages/db/src/migrate.ts` and `packages/db/MIGRATIONS.md` (both sides kept; 0120 listed first, then this piece). Lane registry merged automatically.

**Renumber.** `0125_recovery_eligibility_v3_f17_timing.sql` became `0123_recovery_eligibility_v3_f17_timing.sql` (`git mv`; SQL byte-identical). 0120 merged first; 0121 (ENT-10b) and 0122 (ENT-4b) are taken by open pull requests; 0124 is reserved by PRACTICE-FACTS-1. Registered in `migrate.ts` after 0120. Updated: own lane line (path, and `BUILD_PLAN.md` added to its allow list), `packages/db/MIGRATIONS.md` (one sentence on the renumber), `docs/contracts/recovery-eligibility-v3.md`, this receipt's earlier text, the repository comment, and the test name and expected migration name in `packages/db/test/recovery-eligibility-v3.integration.test.ts` (lines 266, 267, 287, 299; the expected string changes only because the file was renamed). `BUILD_PLAN.md` §12.2 gained one "Ledger amendment — CH-7-F17-BEFORE-OPEN" paragraph before §12.3 (the earlier statement above that `BUILD_PLAN.md` is untouched is superseded by this).

**Routine diff against 0119 as merged on origin/main.** The restated `app.guard_recovery_eligibility_v3` was compared with 0119 lines 55 to 127 (same `CREATE FUNCTION` header and body, with `OR REPLACE` ignored). Exactly one line differs: the `paid_before` exclusion now reads `c.case_type IN('withheld_customer_payment','duplicate_supplier_payment')` instead of `c.case_type='withheld_customer_payment'`. That is the whole of the order's change. No other difference, so CH-7's round-1 changes are preserved.

**Faults.**
1. PostgreSQL would not start: `Postgres init script exited with code null` (dylib symlinks not created because pnpm skips the package's install script). Fix: ran the package's own `scripts/hydrate-symlinks.js` inside `node_modules` (no repository file changed). Kind: environment.
2. `packages/db/test/recovery-eligibility-v3.integration.test.ts:271` (test at line 266, failing line 273): `error: empty password returned by client`. Cause: `new Pool({...admin.options, database})` drops the pool's non-enumerable password. Before: `new Pool({...admin.options,database}),upgradeRuntime=new Pool({...runtime.options,database})`. After: the same with `password:"synthetic"` added to each. Same method other tests in this package use. Kind (i), test set-up only; no `expect` or expected value touched.
3. Browser: `chromium_headless_shell-1193` is not installed (`playwright install` is forbidden). Ran the spec with a throw-away config kept outside the repository (`$HOME/.local/share/full-steam/jg-runs/pw-local-channel.config.ts`) that only sets `channel: "chromium"` to use the installed full chromium-1193. Kind: environment. In that run the first test (F15, mobile-360) hit the 30 s test timeout on the cold `next dev` compile; the same test passed on desktop in the same run and passed on re-run (35.5 s). Kind: environment (cold dev server), not a code fault; no timeout was changed.

**Commands and results.**
- `pnpm install --frozen-lockfile` exit 0; `pnpm turbo run build --filter=@jobguard/db...` exit 0 (3 of 3 tasks).
- `packages/core`: `src/recovery-eligibility-v3.test.ts` 24 passed (1 file), exit 0.
- `packages/db`: `test/recovery-eligibility-v3.integration.test.ts` 30 passed after fault 2 (before: 29 passed, 1 failed), exit 0.
- `test/tenancy.integration.test.ts` + `test/demo-bootstrap.integration.test.ts` 13 passed (2 files), exit 0.
- `test/recovery-message-upgrade.integration.test.ts` 3 passed, exit 0. (`test/recovery-eligibility.integration.test.ts` does not exist. `recovery-follow-up-upgrade.integration.test.ts` was not run, as instructed.)
- `apps/web`: `e2e/CH-7.spec.ts`, `--workers=1`, both projects: 19 passed, 1 timeout (fault 3); the failed test re-run alone passed. The new test "F17 refund settled before opening shows the existing timing exclusion through Review v3 F17" passed on mobile-360 and desktop.
- Every vitest run used `--maxWorkers=2` inside `heavy-slot`, one run at a time, memory free 73 to 80 percent.

**Second catch-up.** After the push, `origin/main` moved to dc16fd6 (FIXLATER-2, #135, which appended cases to the same integration test file). Merged cleanly with no conflicts (merge commit 67a9035). Re-run after that merge: `test/recovery-eligibility-v3.integration.test.ts` 31 passed and `test/recovery-message-upgrade.integration.test.ts` 3 passed (2 files, 34 tests), exit 0.

**Stopped on:** nothing. No assertion, expected value, timeout, grant or policy was changed or loosened.

Builder repair record only — not independently verified, not accepted.

## Rule 9 reshape (12 Oct)

Test-only reshape of this piece's own upgrade proof, by a Claude Sonnet helper on the integrator's Mac. Not a review, not an acceptance. No product file, no migration SQL, no other test in the file and no scanner file changed; 0123 was not renumbered. The code of this piece was accepted by both checkers; only the proof's shape was wrong (audit `upgrade-proof-audit-20261011.md`, section 1).

**Rule quoted.** "An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'."

**Catch-up with main.** `origin/main` 168ec04 merged first (merge commit 764477e). Conflicts: `packages/db/src/migrate.ts`, `packages/db/MIGRATIONS.md`, `BUILD_PLAN.md` ledger. All append-only; both sides kept in numeric order (0120, 0121, 0122, 0123, 0127). Lane registry merged automatically. Main then moved to a0963f4 (SV-2, 0128); merged again with no conflict (merge commit 76e7330). 0128 is therefore part of "everything after 0123" in every run below.

**What changed (only `packages/db/test/recovery-eligibility-v3.integration.test.ts`, test "0123 upgrade from 0119 preserves an existing saved F17 candidate byte-for-byte without backfill"; title unchanged).**
1. Install everything before 0123: `MIGRATION_URLS.slice(0,oldIndex+1)` (through 0119) became `MIGRATION_URLS.slice(0,newIndex)`, where `newIndex` is found by name (`0123_recovery_eligibility_v3_f17_timing.sql`). The registry check changed from `names.slice(0,oldIndex+1)` to `names.slice(0,newIndex)`.
2. Snapshot: the three whole-row text snapshots (reviews, claim lines, audit events) are kept exactly. New: for the same three tables, the primary key of every row, the named columns, and each column's `format_type(atttypid,atttypmod)`, read as canonical text from the database.
3. 0123 applied ALONE (its SQL, then its registry row, as the runner does). Straight after it, `expect(await snapshot()).toEqual(before)` (whole rows, byte for byte, full strength). That assertion moved from after `migrate()` to here; its text is unchanged.
4. Then `migrate()` twice (must not throw), the registry must equal the full list of registered names, and 0123 must be registered once (unchanged assertion).
5. After all migrations: pre-existing rows are found again by primary key and compared as `row_to_json(s)::text` over a sub-select of exactly the pre-existing named columns; the name-and-type list of those columns must be the same. A column, row, trigger or function added or replaced later is not looked at.
6. Removed: the last assertion, a whole-row `row_to_json(r)::text` comparison of the saved review after everything. Its job is done, with a named-column identity match, by step 5 (the saved review is one of the compared rows). The check that the corrected review reads "Paid before you opened this case" at 0p is kept. A final step-5 comparison after that corrected review is saved shows a real later row (review, audit events) is ignored.
7. Added the `PoolClient` type import, helpers `proofColumns`, `proofRows`, `proofBefore`, `proofDifferences`, `rolledBack`, and a 120 s timeout on this test.

**Guards.** Each compared table has a primary key and at least one pre-existing row: reviews 1, claim lines 1, audit events 5.

**Controls (rolled-back transactions, the SAME `proofDifferences`):**
| Control | Expected | Red when the comparison is broken | Green |
|---|---|---|---|
| (a) one-microsecond change to a stored time (`created_at`, `occurred_at`), superuser UPDATE with triggers off, each of the three tables | every pre-existing row reported changed | scratch no-op comparator: failed on all 3 tables | passes |
| (b) retype of a pre-existing column: `recovery_claim_line.net_pence` bigint to numeric(20,0) (values unchanged), and `audit_event.event_type` varchar(100) to varchar(120) (length only) | type list reports the move, rows unchanged | no-op comparator and old whole-row comparator: failed on both | passes |
| (c) nullable column added to each of the three tables | passes | old whole-row comparator: failed on all 3 | passes |
| (d) `app.guard_recovery_eligibility_v3()` replaced (definition checked to differ) | passes | not applicable: no row comparator looks at functions | passes |
| (e) every pre-existing claim line deleted | each reported missing | no-op comparator: failed | passes |
| (f) a later claim line inserted (rolled back), and the real corrected review (review, audit events) | passes | old whole-row comparator: failed on both | passes |

Scratch red runs used temporary copies of the final test (a no-op comparator; the old whole-row comparator) with `expect.soft` on the controls, so every control reported. The final file was restored from a saved copy (sha256 of the committed test file below) before the green runs; nothing scratch is committed.

**Commands, exactly as run** (worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ch-7-f17-before-open`; "pkg" = `.../packages/db`). Memory free was 80 to 81 percent before every run. Every test run used `~/.local/bin/heavy-slot <label> env VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 pnpm exec vitest run --maxWorkers=2 <files>`, one at a time.
| # | Directory | Files | Exit | Counts |
|---|---|---|---|---|
| 1 | pkg | recovery-eligibility-v3 (scratch no-op comparator) | 1 | 1 failed, 30 passed (31); 6 control assertions red: (a) x3, (b) x2, (e) x1 |
| 2 | pkg | recovery-eligibility-v3 (scratch old whole-row comparator) | 1 | 1 failed, 30 passed (31); 7 red: (c) x3, (b) x2, (f) x1, real later rows x1 |
| 3 | pkg | recovery-eligibility-v3 (final file; also once with `--reporter=verbose`) | 0 | 31 passed (1 file), both times; upgrade test 488 ms |
| 4 | pkg | recovery-timing-pin + extra-origin-upgrade + recovery-follow-up-upgrade | 1 | 1 failed, 30 passed (31): `[S8]` in extra-origin-upgrade, `TypeError: Right-hand side of 'instanceof' is not an object` (stale built dist) |
| 5 | worktree root | `~/.local/bin/heavy-slot f17-reshape-build-core pnpm --filter @jobguard/core build`, then (alone) `... pnpm --filter @jobguard/db build` | 0, 0 | tsc, no output errors |
| 6 | pkg | same three files, re-run once | 0 | 3 files, 31 passed |
| 7 | pkg | practice-feed + recovery-cases + fingerprinted-row-shape | 0 | 3 files, 52 passed |
| 8 | worktree root | `pnpm typecheck` | 0 | 7 of 7 tasks |
| 9 | worktree root | `LANE_BASE_REF=origin/main pnpm lint` | 0 | core purity, lane boundary, money arithmetic passed; 7 of 7 tasks |
| 10 | worktree root | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane boundary passed |
After the second merge (head 76e7330, with 0128), runs 3, 6, 7, 8, 9 and 10 were repeated unchanged: 31 passed; 31 passed (3 files); 52 passed (3 files); typecheck 0; lint 0; lint:lanes 0. No second build was needed.

**NOT RUN.** Browser and Playwright specs (no screen changed); `pnpm build` of all packages; the whole `packages/db` suite and the core, api and web suites; `gitleaks` (not installed on this Mac; the scan of the added lines by pattern found nothing credential-shaped, and the existing `secrets` job on this PR is red from an old finding in its history, known and not touched); the Opus and Sol re-checks; GitHub Actions on the new head.

**Left as is.** `packages/db/MIGRATIONS.md` section 0123 still says the upgrade test is "installed through 0119" and compares rows byte-for-byte after the runner; that sentence describes the old proof and should be refreshed with the next edit to that file. 0123 stays unrenumbered for the dispatcher.

Builder record only, not independently verified, not accepted.

### Round 2 repair (12 Oct)

Test-only repair of the same upgrade proof after a fresh independent Sol check at head db4ac43 (verdict REPAIR: three blocking points in the reshaped test, one wording point), by a Claude Sonnet helper on the integrator's Mac. Not a review and not an acceptance. Changed: `packages/db/test/recovery-eligibility-v3.integration.test.ts` (that one test, plus two helpers and one import) and `packages/db/MIGRATIONS.md` (section 0123 wording). No product file, no migration SQL, no other assertion, no other test. The sibling worktree `.worktrees/ch-7-f17-before-open-r2` was not touched.

**What changed, per fix (before / after).**
1. Review revision (blocking). Before: the corrected review was appended against a pinned `expectedReviewRevision` of 1 and the test then required exactly two reviews, so a review appended legitimately by a later migration would have made the proof fail (`ELIGIBILITY_STALE_REVISION` or the count). After: the revision is read from the database, right before the append, by the repository's own newest-review reader (`readRecoveryEligibilityV3`, the reader behind the check at `recovery-eligibility-v3-repository.ts:34`) through a new helper `currentReviewRevision`; the corrected review is appended against that number; the count restriction is gone; the corrected-result assertion (excluded, 0p, "Paid before you opened this case"), `corrected.revision` equal to the read revision plus one, and the final identity-matched comparison of the original rows are kept. New rolled-back control (g): a copy of the saved review one revision higher is inserted (superuser, triggers off, rolled back); the same `proofDifferences` returns no difference, the review table shows one extra row that is ignored, and the revision read back is the saved one plus one (so a pinned 1 would now be stale).
2. Function control (blocking). Before: the control required the literal `AS $function$` in `pg_get_functiondef` text and replaced exactly that, so a legitimate replacement whose body contains `$function$` (PostgreSQL then prints another delimiter) made the test fail. After: new helpers `routineSource` and `replaceRoutine` read the routine's own printed header and its body (`pg_proc.prosrc`) as data, cut the header at its dollar-quote opening with a pattern that accepts any delimiter, and run `CREATE OR REPLACE` with a delimiter chosen by the test that occurs in neither the body nor the note. Control (d) still asserts the stored definition changed and that the same `proofDifferences` returns no difference. New control (d2), delimiter collision: a replacement whose body contains `$function$` (asserted to make PostgreSQL print a different delimiter), then a second replacement made from that definition; both leave the comparison passing.
3. Deadline (blocking). Before: `},120_000);` on the test. After: removed; the test runs at the inherited 5 000 ms Vitest deadline. Nothing was moved and no budget was added or changed anywhere: the upgrade test measured 610 to 639 ms in four green runs (the whole file about 3 s), far inside 5 000 ms. Note for the coordinator: the file's `beforeAll` has no explicit budget of its own (it also runs at Vitest's default hook timeout), so there was no "existing explicit budget" to move set-up into, and none was needed.
4. Wording (later). `packages/db/MIGRATIONS.md` section 0123 now says: installation through every migration registered before 0123; 0123 applied alone and whole rows compared straight away; the runner then applies everything later twice; pre-existing rows found again by primary key and compared as canonical text over their pre-existing names and full types; the controls; and that the corrected review is appended against the revision read from the database.

**Controls, red and green.** Every red run used a temporary copy of the final test kept in `packages/db/test/` under a `zz-scratch-r2-` name (so imports resolve), run with `expect.soft`, then moved (not deleted) to the session scratch folder; the real test file was never edited for a red run and its sha256 was checked before and after. Nothing scratch is committed.
| Variant (scratch) | Expected | Result |
|---|---|---|
| A: comparator also fails on a changed row count and on a changed guard function, and the revision reader pinned to 1 | (d), (d2), (f), (g) and the final comparison red | red at all of them (8 soft failures; (e) also red as a side effect of the row-count rule); 1 failed, 30 skipped |
| C: final test plus a REAL later review committed before the corrected one | green | green; 3 reviews, corrected review saved at revision 3 |
| D: C but with the old pinned revision 1 and a count of two | red | red: `ELIGIBILITY_STALE_REVISION` |
| E: final test but the old literal `AS $function$` replacement | red at (d2) | red: `syntax error at or near "DECLARE"` (the note's `$function$` closes the quote early) |
| Final file | green | green |

**Commands, exactly as run** (directory `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ch-7-f17-before-open/packages/db` unless noted; memory free 73 to 75 percent before every run; one run at a time; no build was needed, the built `dist` folders were current and PostgreSQL started). Test form: `~/.local/bin/heavy-slot <label> env VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 pnpm exec vitest run --maxWorkers=2 [--reporter=verbose] [-t "0123 upgrade"] <files>`.
| # | Run | Exit | Counts |
|---|---|---|---|
| 1 | `recovery-eligibility-v3.integration.test.ts`, verbose, before any change | 0 | 31 passed; upgrade test 639 ms |
| 2 | same file, verbose, after fixes 1 to 3 (first version) | 0 | 31 passed; upgrade test 616 ms |
| 3 | scratch A (`-t "0123 upgrade"`) | 1 | 1 failed (8 soft failures), 30 skipped (a first attempt flagged everything because my scratch captured the function fingerprint too early; corrected and re-run) |
| 4 | scratch C | 0 | 1 passed, 30 skipped; 620 ms (a first attempt failed with `ELIGIBILITY_STALE_REVISION` because that scratch used a revision read before it added the later review; the real test was changed to read the revision right before the append, then C re-run) |
| 5 | scratch D | 1 | `ELIGIBILITY_STALE_REVISION`, 1 failed, 30 skipped |
| 6 | scratch E | 1 | syntax error, 1 failed, 30 skipped |
| 7 | final `recovery-eligibility-v3.integration.test.ts` | 0 | 1 file, 31 passed; 3.74 s |
| 8 | same file, `--reporter=verbose` | 0 | 31 passed; upgrade test 610 ms |
| 9 | `recovery-timing-pin` + `extra-origin-upgrade` + `recovery-follow-up-upgrade` (`.integration.test.ts`) | 0 | 3 files, 31 passed |
| 10 | `practice-feed` + `recovery-cases` + `fingerprinted-row-shape` (`.integration.test.ts`) | 0 | 3 files, 52 passed |
| 11 | worktree root: `~/.local/bin/heavy-slot f17-r2-typecheck pnpm typecheck` | 0 | 7 of 7 tasks |
| 12 | worktree root: `~/.local/bin/heavy-slot f17-r2-lint env LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 tasks |
| 13 | worktree root: `~/.local/bin/heavy-slot f17-r2-lanes env LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane boundary passed (MIGRATIONS.md and the receipt are within the lane) |
| 14 | `pnpm exec tsc -p <scratch tsconfig>` over only the edited test file (the package typecheck covers `src` only) | 0 | no errors |
Sha256 of the final test file: `4d0b71e459d7019a8616a87d57e35f6e79d445e80cc1c400c6c5dddc57f77780`.

**NOT RUN.** Browser and Playwright specs (no screen changed); `pnpm build` of all packages and any build this round; the whole `packages/db` suite and the core, api and web suites; `gitleaks` (not installed on this Mac; the `secrets` job on this PR is red from an old finding in its history, known and not touched); the Opus and Sol re-checks; GitHub Actions on the new head. Sol point 4 (finished exact-head CI result) is a fact about GitHub, not a repair, and is not addressed here. One thing deliberately left alone: the corrected-review step still passes the case revision (`c.revision`) captured when the case was opened; the repair order covered the review revision only.

Builder record only, not independently verified, not accepted.
