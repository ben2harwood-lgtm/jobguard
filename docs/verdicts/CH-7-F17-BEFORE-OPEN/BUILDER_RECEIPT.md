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
- `packages/db/migrations/0125_recovery_eligibility_v3_f17_timing.sql`: restates only 0119's CH-7 insert guard.
- `packages/db/src/migrate.ts`: 0125 registered in numeric order, preserving reserved 0120–0124.
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

The rest of the signature/body is byte-identical, including `paid_before:=e.state='settled' AND e.created_at<=c.created_at;`, the 45,000p after-opening branch, and the parenthesized CASE expressions in IF conditions. The existing `require_recovery_eligibility_v3_effect` routine already enforces the zero claim line and verbatim reason; it needs no replacement. 0119 is unchanged. 0125 contains only BEGIN, comments, this one CREATE OR REPLACE and COMMIT: no table, column, policy, grant, trigger or row mutation, and no routine from another migration.

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
| DB: `0125 upgrade from 0119 preserves an existing saved F17 candidate byte-for-byte without backfill` | Separate database installs/records through 0119, saves a qualifying F17 before-opening candidate through runtime SQL, applies migration runner twice, compares complete textual review/claim/audit rows byte-for-byte, then appends a 0p review and checks the old row again. Positions checked by name/increasing order only. NOT RUN. |
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

Checked the repository's source selection still prefers the original identified settled movement, source/tenant/job/case binding remains intact, raw-write tests include the claim and exact audit hash, and the positive twin uses the same raw route. The isolated upgrade database genuinely stops at 0119, stores the old before-opening candidate, then applies 0125 without rewriting history and appends a corrected review. Saved Q is preserved, not reinterpreted on read.

All pre-existing core/browser test contents are exact prefixes of the final files. The DB file is also an exact prefix after removing only the new import; every existing expect, expected value and test body stays byte-identical. SV-1, SH-1, M4-7-S and its tests, all held CH-7 areas, pinned auth files and BUILD_PLAN.md are untouched. The lane registry minus the single new line exactly equals base. Every changed/untracked path is inside this leaf's allowlist. No implementation defect found during this pass; lint's self-comparison refusal is recorded as a failure, not worked around or claimed passed.

Builder receipt only — not independently verified, not accepted.
