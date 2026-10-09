VERDICT: PASS — bound to head 1e271bf2023ad0d6568fe05a16810d493acd3db3
Reviewer: fresh Claude Opus review agent spawned by the JobGuard integrator (Claude week, 9 Oct 2026); did not build, repair or order any commit in this PR.

**In short:** The changes since the last PASS (df7eb1f) are sound. The merge with main kept everything from both sides. The browser-race fixes wait on real screen state and add no sleeps, retries, skips or longer timeouts. The stamped tenant-context conversion changed no assertion and kept the negative test. The migration renumber to 0107 is byte-identical SQL, and nothing in 0102, 0103 or 0106 shares an object with it. There are four small P3 tidy-ups and nothing blocking. **CI caveat: this PASS covers the code only. CI is not green, so technical acceptance and merge stay on HOLD.** Both CI attempts on this head stopped at the workflow's 20-minute job limit, with 240 of 282 browser tests passed and none failed. Main already uses 18m49s of that limit, so getting a complete green run needs an integration-lane change to the CI time budget, not a code repair here.

## Scope

Delta `df7eb1f..1e271bf` (first parent): 2b4abdb (docs), 640658c (round-11 spec edits), 1928fe3 (merge of origin/main 3a06a02), 0356f7a (round-11b fix, stamp conversion, receipt), d73c085 (lane path swap), 5ce1c46 (renumber 0099→0107), 1e271bf (§12.2 ledger line). Requirements: orders `M4-5-S-r11-ci-races.txt` and `M4-5-S-r11b-ci-races-and-stamp.txt`, plus TENANT-STAMP-1. I reviewed the actual diffs, `git show --remerge-diff 1928fe3`, the four migrations' SQL, and the CI logs of run 37841298306. Read-only review worktree at 1e271bf.

Local checks I ran: `pnpm install --frozen-lockfile --offline` (exit 0). Built web's workspace dependencies, then ran `vitest run app/ui/recovery-messages.test.tsx app/ui/recovery-cases*` (3 files, 211/211 passed, exit 0). Ran `playwright test --list` with CI=1 (282 tests, 54 files; order used below). Local `pnpm lint:lanes` cannot run on a detached HEAD, so I checked all 50 PR files against the m4-5-s allow list by script (0 outside) and relied on CI's "Lane boundary passed" at head 1e271bf. I ran no database or browser suites locally and relied on CI for them.

## Findings

**P1 (blocking):** none.

**P2:** none.

**P3 (non-blocking):**
- **P3-1. Stale 0099 wording in MIGRATIONS.md.** `packages/db/MIGRATIONS.md:573` still says "0099 is registered after 0097". `:577` says "Migration 0099 adds BEFORE write triggers". `:583` describes the upgrade proof as "through 0097 … 0099 applied", but the test now upgrades from through 0106 and applies 0107 (`packages/db/test/recovery-message-upgrade.integration.test.ts:36-39,63,70`). These are documentation only. Fix them at the next touch.
- **P3-2. Stale lane note.** The note at `config/agent-lane-assignments.json:62` still says "Migration 0099 per the 7 October merge-ahead ledger amendment". The path swap was deliberately limited to the allow entry, so this stays non-blocking. Update the note at the next lane edit.
- **P3-3. The intermediate commit d73c085 does not build.** It carries the `git mv` to `0107_recovery_messages.sql`, but `packages/db/src/migrate.ts` still points at `0099_…` until 5ce1c46 (`git show d73c085:packages/db/src/migrate.ts`). The commit messages also describe the split loosely: d73c085 says "lane swap only" but contains the rename. This is a bisect hazard only, and the head is correct.
- **P3-4. The delivery lookup can still overlap a register read when the job changes without a remount.** The new effect `useEffect(()=>{if(status==="ready")void refreshDeliveries(world.current)},[status,refreshDeliveries])` (`apps/web/app/ui/recovery-cases.tsx:66`) re-runs when `jobId` changes, because `refreshDeliveries` changes identity. At that moment the render still holds the previous job's `"ready"` status. If the job changes without a remount (`<RecoveryCases jobId={jobId}/>` is not keyed, `apps/web/app/ui/workspace-shell.tsx:71`), the lookup therefore starts alongside the new job's first register read, and runs again once that read settles. The lookup is correct for the new job, is guarded by `world`, and writes only the picker (`setDeliveries`/`setDeliveryId`), so it cannot disable buttons, change status or busy, or move focus. It contradicts the code comment only in this edge case, which the initial-mount journeys in CI do not exercise. Optional fix: key the component by job, or gate on a "settled for this world" flag.

**Caveat (not a finding against this PR):** The builder could not reproduce the original `[desktop] M4-1-S.spec.ts:11` focus failure and says so (`docs/verdicts/M4-5-S/BUILDER_RECEIPT_round11.md` "Cause and repair"). The repair removes this lane's real contribution: an extra supplier-documents GET that started before, and competed with, the first register read (old `load()` at `recovery-cases.tsx:57` in 1928fe3). The underlying race remains in main's own spec, which calls `.focus()` on an Open button without first waiting for it to be enabled (`apps/web/e2e/M4-1-S.spec.ts:18`), and that file is outside this lane. I recommend that main's owner add `await expect(button(...)).toBeEnabled()` before that `.focus()`.

## Answers

**1. Merge 1928fe3: was anything lost? Is the migration order sane?** Nothing was lost. `git show --remerge-diff 1928fe3` shows ten conflicted files, each resolved as a union:
- `app.module.ts`: a scripted set comparison found the merged controllers and providers equal to ours ∪ theirs, with none missing and none extra.
- `workspace/application.ts`: the merged `return Object.freeze({…})` line is exactly the base line plus both sides' prefix inserts (`recoveryMessages`, then `practiceFeed` and `preventionChecks`). I checked this by string identity.
- `workspace/index.ts`, `core/src/index.ts`, `db/src/index.ts`, `migrate.ts`, `MIGRATIONS.md`, `BUILD_PLAN.md`: 0 lines added by either side are missing from the merge.
- `openapi.json`: the merged paths and schemas equal ours ∪ theirs, and CI's `openapi:check` (inside `@jobguard/api test`) passed.
- Lane registry: both entries are present.

`MIGRATION_URLS` (`packages/db/src/migrate.ts:54-58`) now runs …0097, 0102, 0103, 0106, 0107, in numeric order. The runner is name-based (`migrate.ts:66-74`, checked against `jobguard_schema_migration.migration_name`) and tolerates gaps.

**2. Do the race fixes fix real causes? Any sleep, retry, skip, only, todo or timeout? Any weakened assertion?** They wait on real state.
- In `M4-5-S.spec.ts:311,369`, both reads that come straight after a preview now wait for the server-saved status line `V(page,"pursuit-delivery","Preview only — awaiting your approval")`. `V` is `toHaveText` with the default 10 s expect timeout (`:17`; `playwright.config.ts:7` unchanged).
- At `:99`, `expect(page.url()).toContain("#pack-source-")` became `await expect(page).toHaveURL(/#pack-source-/u)`. That is the same condition, now auto-waiting.
- I scanned every other `state(page, …)` read (`:100,117,134,139,148,239,246,254,270,294,323,342,360,370`). Each one comes after a `V(...)`, an alert or enabled-control wait, or a response.
- Component (`recovery-cases.tsx:55-66`): the lookup moved out of `load()` into its own effect that runs only at `status==="ready"`. Its stale guard `lookupWorld!==world.current` is equivalent to the old `here(t)` (`:48`). It still writes only the picker. The pack tick still feeds only `RecoveryMessages evidenceTick` and never reloads the register.
- New guards: the unit test `recovery-messages.test.tsx:299-320` asserts no fetch while loading or failed, and in ready exactly one fetch with writes only to slots 1–2. It would fail on the old code, which had two effects, not three. The e2e test `M4-5-S.spec.ts:407-460` holds the lookup until after focus, records disabled-attribute mutations and focus moves (expecting none), asserts `registerReads` has length 1, and includes a positive control showing that the watcher does see a real command.
- Scan of lines added in the delta: no `waitForTimeout`, sleep, retries, `.skip`, `.only`, `.todo` or `fixme`, and no new or longer timeout. The three timeout hits in `df7eb1f..1e271bf` (`test.setTimeout(360_000)`, `{timeout:30_000}`, `test.setTimeout(240_000)`) all come from main's own specs (M4-3-S, M4-7-S, MON-7, UIWIRE-15, VALUE-1) through the merge.
- `twoFrames()` waits for two animation frames so React can commit, not a fixed time. Removed `expect` lines per branch commit: 640658c has 1 (the URL line above, replaced by an equal-strength check), and 0356f7a, d73c085, 5ce1c46 and 1e271bf have 0.

**3. Stamp conversion.** The diff 0356f7a is exactly five context constructions changed to `testTenantContext(…)`:
- `recovery-message-repository.test.ts:10`
- `recovery-message-upgrade.integration.test.ts:50`
- `recovery-messages.integration.test.ts:91,148,149`

Line numbers are at head. Each gains the helper import, and no assertion line changed. The negative test `repo.read({} as VerifiedTenantContext, caseId)` → `rejects.toThrow('A verified tenant context')` is unchanged at `recovery-messages.integration.test.ts:230`. It still matches the stamp's own refusal text (`packages/db/src/tenant-context.ts:62`). No other unstamped context remains in this PR's test files.

**4. Renumber.** The SQL is byte-identical:
- `git diff -M 1928fe3 1e271bf -- packages/db/migrations/` reports `similarity index 100%`.
- The blob `8df2fbb7…` is the same at df7eb1f, 1928fe3 and 1e271bf, and SHA-256 `355cb30b…4e15` matches the receipt.

The lane edit (d73c085) removes `…/0099_recovery_messages.sql` from `allow` and adds `…/0107_recovery_messages.sql`, with nothing else changed (scripted comparison of the entry).

The ledger line `BUILD_PLAN.md:3340` is accurate: 0102, 0103 and 0106 merged first, 0104 belongs to CH-1 and 0105 to ENT-2, and 0098 (M0-6L) and 0100 (SV-2) take the next free number at their own merges, which makes M0-6L 0108 next.

Remaining "0099" mentions: only the stale prose in P3-1 and P3-2, plus unrelated UUID or test literals. No test assumes the migration is last or that there is a fixed count:
- demo-bootstrap uses `MIGRATION_URLS.length`.
- practice-feed and contractor slice by their own index.
- prevention-checks filters by name.
- The upgrade test breaks at `0107_`.

**5. Whole-PR sanity.** All 50 files in `git diff origin/main...1e271bf` are inside the m4-5-s allow list, and CI reported "Lane boundary passed" at head 1e271bf, base 3a06a02. `.github/**`, `playwright.config.ts`, the package manifests, the lockfile and turbo are untouched. The delta touches no founder-reserved area: no live provider, production mode, real data, spending, decision approval, deployment, release or CI weakening. Data stays synthetic and the provider is practice-only.

**6. CI, run 37841298306 on 1e271bf.**
- Attempt 1: `secrets` ✓ and `dependency-review` ✓. In `checks`, typecheck ✓, lint ✓ (lane boundary passed) and test ✓:
  - core 1692/1692
  - api 729/729 (including openapi check)
  - web 448/448
  - db 61 files, 741/741, with `recovery-messages.integration` 98, `recovery-message-upgrade.integration` 3, `practice-feed` 27, `prevention-checks` 11, `contractor-parties` 19, `tenancy` 9 and `demo-bootstrap` 4, on the new order
  - build ✓
- In the browser step, 240 of 282 tests ran and all passed, with no failure or flaky marks in the dot reporter. The job was then cancelled at the workflow's 20-minute limit (`ci.yml:15`). By `--list` order, M4-1-S [desktop] (#195) and all 14 M4-5-S tests (#67–73, #208–214) fall inside those 240. That is an inference, because the dot reporter does not name tests.
- Context: main's own `checks` job at 3a06a02 (run 37819226847) took 18m49s, with 268 browser tests in 12.5 minutes. This PR adds 14 browser tests, so the 20-minute limit leaves almost no headroom. Raising it is a CI configuration decision for main, outside this lane.
- Attempt 2 (the integrator's re-run, job 113816575807, 12:21:58–12:42:15Z), as I found it, was **cancelled at the 20-minute limit again**:
  - `secrets` ✓, `dependency-review` ✓.
  - typecheck ✓, lint ✓ (lane boundary passed, log line 347), and test ✓ with the same totals as attempt 1 (core 1692, api 729, web 448, db 741/741).
  - build ✓.
  - Browser step started 12:28:38 and was cancelled 12:42:12, with 240 '·' (passed) marks and **0 failed, flaky or retried marks**.

  **No browser test failed in either attempt.** The 42 tests with no reported result are all in the `[desktop]` project, by `--list` order: UIWIRE-1…15, VALUE-1, VOICE-1, shell, switch-live and variations. Every one of those files passed in the `[mobile-360]` project within the same run (also by list order).

  **CI status: HOLD, not green.** At this head the suite needs about 21–22 minutes against a 20-minute cap: about 6.7 minutes before the browser step, plus about 15 minutes for 282 tests at roughly 3.2 s per test. This is not a defect in this PR's code, and the lane cannot fix it, because `.github/**` is integration-lane. The options are to raise `timeout-minutes` at `.github/workflows/ci.yml:15` or to move the browser step into its own job. Either keeps every check and weakens none, but it is a main/CI change for the integrator, with Ben's yes if the integrator treats CI configuration as reserved. Until a complete browser run is green on this exact head, technical acceptance and merge should wait.

**7. (Added by the integrator) Does the new fresh-install order share objects with 0102, 0103 or 0106?** No shared objects:
- I extracted every CREATE / CREATE OR REPLACE / ALTER / DROP target and all GRANT and REVOKE statements from the four files. 0107 creates or alters only its own four tables and its own `app.*recovery_message*` functions (ownership, RLS and grants at `0107_recovery_messages.sql:361-387`), plus 19 triggers named `recovery_message_source_write` on older tables (`:253-259`).
- 0102, 0103 and 0106 create or alter only their own tables and functions; 0102 also alters `app.client_contract_version`, which 0107 does not touch.
- The only name they share is the policy name `tenant_isolation`, which is per table and applied to different tables.
- None of 0102, 0103 or 0106 alters, adds triggers to, or writes at migration time to any of 0107's 19 guarded tables. 0102's `UPDATE app.job` (`0102_contractor_parties.sql:159`) sits inside the body of the runtime function `app.bind_contractor_parties`, so 0107's trigger guards it in either order.
- None of the four uses catalog-wide statements (`ALL TABLES`, default privileges or catalog loops).

So neither definition overrides the other, and no behaviour is lost. The database suites passed in CI on 1e271bf with the new order (see 6).

---
_Generated by [Claude Code](https://claude.ai/code)_

