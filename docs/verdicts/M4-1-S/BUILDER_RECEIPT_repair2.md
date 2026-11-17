# M4-1-S-R — builder receipt, repair 2

Date: 2026-10-03. Builder: **Claude Sonnet 5.5** (repair 2, on top of Codex's repair 1 in `BUILDER_RECEIPT_repair.md`).
**Not independently verified. Not accepted.** This receipt is the builder's account only. A different model must record a verdict bound to the exact head, and a separate actor must record acceptance. Nothing was pushed, merged, released or deleted.

## Binding

- Worktree/branch: `.worktrees/m4-1-s-repair`, `codex/sandbox/m4-1-s-repair`, lane `m4-1-s`.
- Base: `694e9e1` (origin/main at dispatch). origin/main has since moved to `3e0764b`; this branch has NOT been rebased (a rebase changes the head and needs fresh verdicts).
- Code/test head verified below: `88f58a9c4f8c80153238403bdb55b9c84928eaad`. The only later commit is this docs-only receipt.
- My commits (all end `Co-Authored-By: Claude Sonnet 5.5`):
  1. `20ae2b9` chore(db): renumber `0046_recovery_case_current.sql` to `0043` (plan rev 3.0 section 12.2), via `git mv`; registration in `packages/db/src/migrate.ts`, `MIGRATIONS.md` heading, the upgrade-test filter, and the migration-count assertions (UIWIRE-12 and demo-bootstrap: 42 to 43; the `0000..0041` range check stays 42).
  2. `e5a19a2` fix(recovery): drop the job-row lock the runtime role cannot take; fix two test defects.
  3. `ab79dfc` fix(recovery): exact write-off accounting and server-owned case sources (findings 5 and 6, server part).
  4. `88f58a9` test(recovery): e2e gaps and real source-link targets (finding 6, UI part).
  5. this receipt.
- Lane registry `config/agent-lane-assignments.json`: I made no edit. The lane's `allow` globs (`packages/db/**` etc.) already cover the renamed file; the only registry change on the branch is Codex's addition of this branch name to lane `m4-1-s`.

## What the first real run found (Codex's repair 1 could not execute these)

- **Every workbench command failed** with `permission denied for table job`: the repository ran `SELECT ... FROM app.job ... FOR UPDATE`, which needs UPDATE privilege the runtime role correctly lacks. 7 of 10 targeted DB tests failed. Repair 1 was non-functional at runtime. Fixed in `e5a19a2` (see lock order below).
- Two test defects, fixed without weakening: one bind parameter used as both uuid and varchar ("inconsistent types deduced for parameter $1"); the view-update assertion expected SQLSTATE 42501 but a non-auto-updatable view raises 55000 (the test now asserts 55000 AND that the runtime role holds no INSERT/UPDATE/DELETE/TRUNCATE privilege on the view, which is stronger).
- Stale migration-count assertions (42) would have failed once 0043 was registered; updated to 43 before the first full run.
- Lock order, now documented in the migration, `MIGRATIONS.md` and the repository: case advisory key first (workbench holds only this), then (inside `approve_synthetic_landing`) job row, then case row. No job-row lock is taken by the runtime role. Other users of the two-integer advisory key (eligibility, evidence pack) take no job lock, so I found no cycle. This is reasoning plus passing tests; there is no dedicated concurrent landing-versus-workbench stress test.

## Verdict findings

| # | Finding | Status | Where / proof |
|---|---|---|---|
| 1 / R2 | Two sources of truth for case state | **FIXED** (Codex's `app.recovery_case_current` view + landing routine reads it; made runnable by `e5a19a2`) | `0043_recovery_case_current.sql`; `recovery-cases.integration.test.ts` "uses one live state, claim and revision projection while preserving the legacy snapshot" (also runtime read isolation, forbidden updates); `recovery.integration.test.ts` "the existing landing routine reads amended workbench claims and revisions" (stale-revision rejection, claim bound, valid landing in a savepoint); upgrade-from-preceding-schema fixture in `recovery-cases.integration.test.ts` beforeAll |
| 2 / R4 | Constant "Illustrative fee" | **FIXED** | `recovery-cases.tsx` shows "Not calculated here", `GBP 0.00` only for prevention; `M4-1-S.spec.ts` asserts `case-fee` = "Not calculated here" after a 1,000.00 landing, and 0.00 only after prevention |
| 3 / R3 | Reviewer client-asserted | **FIXED** for the case command (client value ignored and replaced before hashing, storing and audit) | `recovery-case.application.test.ts` (3 tests: verified membership used, forged client reviewer ignored, failed verification refuses); `recovery-cases.integration.test.ts` "ignores forged reviewers in claim, event and audit records". Residual, not fixed: the reviewer is the fixed synthetic demo membership id (the UI prints that id after "Reviewed by"), and the M4-2 eligibility command still passes the literal `practice-owner`; that line belongs to the M4-2-S-R branch, which edits the same file |
| 4 / R5 | Vacuous transition-table test | **FIXED** | `packages/core/src/recovery-case.test.ts`: all 9 states x 11 events each assert allowed or forbidden (99 pairs), reopen after partial/total reversal, dispute |
| 5 | Write-off not respected after reversal | **FIXED** (`ab79dfc`) | `transitionRecoveryCase` takes cumulative written-off: landing bounded by claimed - writtenOff - landed; write-off records only the not-yet-written-off remainder (event amounts stay summable) and is refused when nothing is outstanding; amended claim cannot fall below landed + written-off; the `Math.max(0, ...)` clamp is removed. Proof: 5 core tests; DB test "keeps write-off accounting exact across reversal, re-landing and claim amendment" (also checks write-off event rows 150000 then 40000 and landed + written-off + outstanding = claim). State-machine policy unchanged |
| 6a | Second claim never opened in e2e | **FIXED** | e2e opens "Open £320 withheld payment" and asserts amount, book, source type, state, customer-invoice link and no supplier links |
| 6c | No keyboard-focus assertion | **FIXED** | e2e Tab and Shift+Tab between actions with `:focus-visible` and a non-zero outline or box-shadow asserted (both projects) |
| 6d | Source links point at nothing; free-text client sources | **PARTLY FIXED** | Server now accepts only a closed catalogue of fictional practice sources and enforces the supplier-versus-customer split (book, source type, case type); invented labels are rejected with `RECOVERY_SOURCE_NOT_RECOGNISED` before any row is written (core test + DB test). Links now focus a real in-page detail that names the document kind and says "no stored document file is attached" (no hash change, because any hashchange reloads the whole job workspace). **Not done:** linking a case to a stored supplier-document or evidence record. See OPEN FOR BEN 2 |
| 6b | "Open the job from Jobs" (C7) | **OPEN FOR BEN** | The Jobs list (`readSyntheticDemo`) deliberately excludes capture-created jobs and sandbox runs, so the job this journey creates cannot be opened from Jobs. The second page still deep-links, as the M4-2-S and M4-3-S specs do. See OPEN FOR BEN 1 |
| 7 | No receipt under `docs/verdicts` | **FIXED** | `BUILDER_RECEIPT_repair.md` (Codex) and this file |
| R1 | Run DB suite and both Playwright projects | **FIXED with one deviation** | counts below; the browser executable is not the pinned build |

### OPEN FOR BEN (keeps the repair on hold, which is correct)

1. **Open from Jobs.** Should capture-created jobs appear in the Jobs list (a change to `readSyntheticDemo`, which may also affect the sandbox and shell tests), or does Ben accept a deep link for this journey as the sibling M4-2-S and M4-3-S specs do? Builder lean: accept the deep link.
2. **Case sources.** Is a fixed fictional source catalogue acceptable for this synthetic slice, with linking cases to stored supplier-document records left to the M4-3-S-R / later cards (the M4-3-S FAIL verdict already says the evidence pack maps template strings, not real sources)? Builder lean: accept for this slice.

## Commands actually run, on head `88f58a9`

All pnpm commands used the repository's own `pnpm` 10.28.1 launcher, `CI=1`, `LANE_BASE_REF=origin/main`. Every database or browser command ran inside `heavy-slot m41r`. Logs: `/private/tmp/claude-501/-Users-benharwood-Claude-Projects-Next-Gen-Learning-Platform/779eca0d-4227-4a11-b830-3a8387c288bc/scratchpad/m41r-logs/final-*.log`.

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | "Already up to date" (existing node_modules reused; not a from-scratch install) |
| `pnpm typecheck` | 0 | 7/7 tasks (4 turbo-cached) |
| `pnpm lint` | 0 | 7/7 tasks (6 cached); core purity, lane, money-arithmetic, commercial-boundary checks passed |
| `pnpm lint:lanes` | 0 | lane `m4-1-s`, all changed files inside the allow-list |
| `pnpm build` | 0 | 7/7 tasks (5 cached), includes production Next build |
| `pnpm openapi:check` | 0 | generated spec matches `apps/api/openapi.json` (no route change) |
| `heavy-slot m41r pnpm test` | 0 | `node --test tools/*.test.mjs` 39/39; core 542 (68 files); ai 72; api 78 (11 files); web 36; db 155 (34 files); storage 4 and config 2 from cache |
| `heavy-slot m41r pnpm test:db` | 0 | 34 files, 155 tests passed (real embedded PostgreSQL 16) |
| `heavy-slot m41r pnpm test:migrations` | 0 | 2 files, 11 tests passed (tenancy + demo-bootstrap, fresh install of all 43 migrations) |
| `heavy-slot m41r` + `CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-1-S.spec.ts -c playwright.m41r.config.ts` | 0 | 2 passed (mobile-360 and desktop), production Next build + real PostgreSQL |

Earlier runs worth knowing: first targeted DB run 7 of 10 failed (the `FOR UPDATE` defect); after the fix and my new tests, targeted run 12/12 passed; an earlier full DB run during my edits was mixed (stale core build) and is not counted.

## NOT RUN / deviations (stated plainly)

- **E2E browser is not the pinned one.** Playwright 1.55.1 needs `chromium_headless_shell-1193`, which is absent here (the `chromium-1193` folder is a truncated install with no Frameworks directory; a long-running 11-day-old `playwright install chromium` process from another session exists). No download was made (no authority). I used an **uncommitted** shim `apps/web/playwright.m41r.config.ts` that spreads the repo config and only sets `launchOptions.executablePath` to the cached complete `chromium_headless_shell-1234`. Same spec, projects, web server; different Chromium build. Delete or ignore that file before any commit review. A run on the pinned browser is still owed.
- **No Playwright traces/screenshots retained as evidence** (both runs passed; traces are retain-on-failure; the full-page screenshot is under ignored `apps/web/test-results/`).
- **Clean pinned install not performed** (install was a no-op over existing modules). `.nvmrc` pins 24.15.0; this Mac runs Node 24.17.0 (engine range satisfied).
- **No concurrent landing-versus-workbench stress test** exists (lock order argued, not stress-tested).
- Under machine load (load average 60 to 70) one existing test, `final-account.integration.test.ts` "keeps customer debt append-only...", timed out at 5016 ms in an interrupted earlier run; on a quiet machine the same file passed inside the full 155. I changed no timeout.
- Environment: embedded-postgres dylib symlinks were already hydrated (Codex's 27 Sep `hydrate-symlinks.js`); initdb ran directly and the DB suites started without further environment repair. At the start `ipcs -m` showed 14 stale SysV segments (no attached process, limit `kern.sysv.shmmni`=32); I removed none, and none were left by my runs.
- Other worktrees' Playwright runs use the same fixed ports 3000 and 55432; my e2e wrapper waited inside the slot until both were free.

## Merge notes for the coordinator

- origin/main is now `3e0764b`. A read-only merge-tree shows one conflict: the one-line shared `config/agent-lane-assignments.json` (add `codex/sandbox/m4-1-s-repair` to lane `m4-1-s`).
- Migration order: this branch registers 0043 straight after 0041. When M4-3-S-R lands 0042 its registration must go before 0043 and the count assertions (43) become 44.
- The `m4-2-s-repair` worktree has uncommitted edits to the same `apps/web/app/ui/recovery-cases.tsx`, `packages/db/test/recovery-cases.integration.test.ts` and the lane file; expect conflicts there.

## Environment

macOS 26.4 (Darwin 25.4.0, arm64); Node v24.17.0; pnpm 10.28.1; turbo 2.10.12; vitest 4.1.11; Playwright 1.55.1 (browser: Chromium headless shell build 1234); embedded-postgres 16.10.0-beta.15 (PostgreSQL 16); TypeScript 5.8.3.

## Status

Prepared, built, locally tested and committed on the repair branch. **Not independently verified, not accepted, not pushed, not merged.** Two decisions are OPEN FOR BEN, so the repair stays on hold.
