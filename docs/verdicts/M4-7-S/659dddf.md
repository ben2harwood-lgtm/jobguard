# Verdict M4-7-S — candidate 659dddf — HOLD

**Reviewer:** Claude reviewer agent, fresh context; did not build this. Bound to implementation commit
`659dddf2a667539b2f7d19382307a0698133ad0e` on `codex/sandbox/m4-7-s` (base `694e9e1`; reviewed diff `git diff 694e9e1..659dddf`,
27 files, +1632/−11). Receipt commit `777862b` is docs-only and was read as a builder receipt, not a review.
**Contract:** BUILD_PLAN.md §34 M4-7-S (lines 1883–1891 at 694e9e1) plus §13.2 C1–C8 and AGENTS.md §5.13.

## Commands run (fresh detached scratch worktree at 777862b; `pnpm install --frozen-lockfile` exit 0)
| Command | Exit | Result |
|---|---|---|
| `pnpm -r build` | 0 | 7 packages incl. production Next build |
| `pnpm typecheck` | 0 | 7/7 tasks |
| `pnpm lint` (PR event env) | 0 | purity, lane, money, commercial-boundary; 7/7 package lints |
| `pnpm lint:lanes` (PR event: head.ref `codex/sandbox/m4-7-s`, base 694e9e1, head 777862b) | 0 | lane `m4-7-s`; 28 files all inside the allow-list |
| `pnpm openapi:check` | 0 | spec matches source; 55 prior paths byte-identical, 1 path added (`/jobs/{id}/practice-feed`), no schema removed |
| `pnpm test` | 1 | tools 39/39; config 2; storage 4; ai 72; core 352 (70 files, incl. 13 new); api 104 (11 files, incl. 29 new); web 36. **db fails** (finding 1) |
| `pnpm test:db` (real embedded PostgreSQL 16.10) | 1 | 35 files: 34 passed, **1 failed** (`UIWIRE-12.integration.test.ts`, 22 skipped at setup); 139 tests passed |
| `pnpm --filter @jobguard/db exec vitest run test/practice-feed.integration.test.ts` | 0 | 11/11 — upgrade 0041→0043, RLS/owner/grant catalog, runtime SQL forgery denial, rollback, races, revoked/expired membership, pilot refusal |
| `CI=true … playwright test --project=mobile-360 --project=desktop M4-7-S.spec.ts` (production `next start`, real DB) | 1 | **6 failed / 0 passed** — every test times out at the same locator (finding 2) |

Environment notes, all inside `node_modules` or reviewer-only: the embedded-postgres package's own `hydrate-symlinks.js`
postinstall (skipped by pnpm) was run, plus the three ICU `.68` symlinks. No `shmget` error occurred; the builder's DB blocker did
not reproduce. Playwright 1.55.1's `chromium_headless_shell-1193` is absent and `chromium-1193` is a damaged cache entry, so the spec
was run through an untracked shim config pointing `launchOptions.executablePath` at the complete cached `chromium_headless_shell-1234`
(Chrome for Testing 151). Nothing was downloaded; the candidate was not edited. Mutation check: breaking the monotone settlement rule
in `packages/core/src/practice-feed.ts:74` made 1/13 core tests fail; restored.

## Findings (severity, file:line)
1. **HIGH — candidate breaks an existing DB regression gate.** `packages/db/test/UIWIRE-12.integration.test.ts:54` asserts
   `MIGRATION_URLS` has length 42; adding `0043_practice_feed.sql` to `packages/db/src/migrate.ts:48` makes it 43, so the suite
   fails at setup (`expected [ …(43) ] to have a length of 42`) and 22 UIWIRE-12 tests are skipped. Every earlier migration leaf
   bumped this count (e.g. #92 for 0041). The builder updated `demo-bootstrap` and `tenancy` but not this file, which is also
   outside the lane allow-list. `pnpm test:db` and root `pnpm test` are red on the candidate; C8 requires previous regression
   checks to stay green.
2. **HIGH — the leaf's own Playwright spec cannot pass.** `apps/web/e2e/M4-7-S.spec.ts:47` (also `:198`, `:257`) uses
   `page.getByLabel("Generated receipt scenario", { exact: true })`, but `apps/web/app/ui/practice-receipts.tsx:133-137` wraps
   the `<select>` inside the `<label>`, so the label text Playwright matches includes the option captions. Verified in isolation
   with this repo's Playwright: `exact:true` → 0 matches; non-exact or `getByRole("combobox", { name })` → 1. All six tests
   (both projects) hang at the first "advance" and time out at 240 s; the trace shows the connect POST returned 200 and no
   advance POST was ever sent. Consequently none of the "Done when" browser assertions (£384.00 / Pending — cannot qualify /
   Simulated settled movement / £0.00 / duplicate / Disconnected / reload / Jobs re-entry / second context / forgery /
   race / transport fault) has been executed in a browser. The builder receipt correctly labels them NOT RUN.
3. **LOW — core test hole.** The "late pending cannot downgrade settled" claim is never exercised with a pending event as the
   final event (`packages/core/src/practice-feed.test.ts:22` dedupes to `settled, pending, statement`, so the last event is
   settled). My mutant (`rows.at(-1)` state) escaped that test and was caught only by the reconciliation test.
4. **LOW — transport status mismatch.** Nest POST returns 201 (`practice-feed.controller.ts:61`), Next POST returns 200
   (`route.ts:27`); disclosed in the receipt, harmless to the spec, but the two "same" transports differ.
5. **LOW — fixed demo principal.** `practice-feed-repository.ts:18-19,35` hard-codes `DEMO_MEMBERSHIP_ID` as the actor
   (same inherited sandbox pattern as M4-2-S finding 2); mitigated here by session binding (`session_id` on the account,
   `app.practice_feed_session` GUC checked in every trigger) and live-membership rechecks.

**Checked and clean:** migration 0043 — three tables owned by `jobguard_migration`, ENABLE + FORCE RLS, tenant policy for both
roles, runtime SELECT/INSERT only, tenant/job-qualified FKs, pence/currency/environment CHECKs, `UNIQUE(tenant_id,account_id,event_id)`,
all five routines `SECURITY INVOKER` with EXECUTE revoked from runtime (established 0028–0030 pattern), no SECURITY DEFINER anywhere;
deferred triggers require a connect command per account and a matching audit row per command; catalog test passes on real Postgres.
Lane row lists branch `codex/sandbox/m4-7-s` (not "work") and exact roots. Browser sends only `version/commandId/expectedRevision/
action/scenario`; `.strict()` schemas reject amount/state/account/tenant/environment/event fields (core, API and runtime-SQL tests);
events are generated server-side from a fixed table and hash-validated in the trigger (the receipt is right that SHA-256 is an
integrity hash, not a signature — the contract's "signed/validated" wording is met on the validated branch). Replay/page-overlap/
alternate representation collapse to one `receipt-384` identity; `unknown-384` is held as `possible_duplicate` and makes the settled
movement ineligible until `reconcile_duplicate`; disconnect appends a command, trigger refuses further ingestion, history retained.
`allocatedEligibleNetPence` is a literal 0 in both core and API schemas; DB test asserts zero `landing_allocation`/`recovery_fee_journal`
rows. Duplicate global banner paragraph removed from `workspace-shell.tsx`; `layout.tsx` still renders the single `role="note"`
banner (other specs assert `toHaveCount(1)` or `toBeVisible()`, none expect 2). No TrueLayer/OAuth/token/bank branding/"bank-verified",
no outbound network, mail, SMS or AI call, no statutory-deadline wording. OpenAPI change is purely additive.

## Dependency on M4-2-S (#85, retrospective HOLD at be81bd5)
Not functionally inherited: M4-7-S imports nothing from the eligibility/recovery-case code, writes no allocation, and its data has no
FK or write path into `recovery_case`/eligibility tables, so M4-2-S findings 1 (approve-after-supersede) and 3–4 do not apply here.
The only shared trait is the fixed demo principal (finding 5 above, M4-2-S finding 2). Process inheritance stands: M4-2-S remains on
HOLD, so M4-7-S cannot be technically accepted or merged ahead of that hold clearing, whatever the outcome of the repairs below.

## Why HOLD, and exact repairs
The server, migration and DB evidence is strong (11/11 real-Postgres leaf tests, clean catalog), but the candidate turns an
existing DB regression suite red and its own browser acceptance spec is unexecutable, so the "Done when" UI assertions are unproven.
- R1. Add `packages/db/test/UIWIRE-12.integration.test.ts` to the `m4-7-s` lane allow-list and change the `MIGRATION_URLS` length
  assertion at `:54` from 42 to 43 (the `BETWEEN '0000'…'0041'` row-count assertion on `:55` stays 42). Re-run `pnpm test:db`.
- R2. In `apps/web/e2e/M4-7-S.spec.ts` replace the three `getByLabel("Generated receipt scenario", { exact: true })` calls with
  `panel(page).getByRole("combobox", { name: "Generated receipt scenario", exact: true })` (or place the `<select>` outside the
  `<label>` with `htmlFor`). Then actually run both projects against the production build and attach counts and the two
  panel screenshots the spec already writes.
- R3 (optional, LOW). Add a core case whose final event is `pending-384` after a settlement and assert `state === "settled"`.
- R4. Re-review the new commit; this verdict binds to 659dddf only.
