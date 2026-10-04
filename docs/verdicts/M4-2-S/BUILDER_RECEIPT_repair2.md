# M4-2-S-R repair 2 — builder receipt

Date: 2026-10-03. Builder: **Claude Sonnet 5.5** (repair 2, on top of Codex's repair 1 recorded in `BUILDER_RECEIPT_repair.md`).
**This is implementation and test evidence. It is not an independent verdict, not independently verified and not technically accepted.**
The HOLD in `docs/verdicts/M4-2-S/be81bd5.md` is not superseded by this receipt. A different-model verdict bound to the final head and a separate acceptance actor are still required (AGENTS §5.13, BUILD_PLAN C8).

Branch `codex/sandbox/m4-2-s-repair`; original reviewed head `be81bd5` (PR #85, merged as `8c2b0fe`). Branch base `694e9e1`.
Implementation head for this receipt: `a82cafa8dfa2cda0adf3598e0ec608112520a3ec` (this receipt is committed separately on top, docs only; the final SHA is the branch tip).
Not pushed, no PR, nothing merged, nothing deleted. `origin/main` has since moved to `4a8f655`; this branch was **not rebased** (the only file both sides changed is the shared lane registry, `config/agent-lane-assignments.json`, which will need a coordinator merge).

## What repair 2 did

Codex's repair 1 (R2 status check, R3 recorded membership, R4 wording) had never been run against a real database or browser. This session ran everything on a Mac that can start embedded PostgreSQL and a browser.

1. **Ran the DB regressions that were never run.** All of Codex's tests were collected. One of its own DB regressions failed for a real reason: *rejects current revisions after policy supersession until re-review*. Superseding a policy bumps the recorded policy revision to 2, but both command schemas pinned it to the literal `1`, so a case in that state could be neither re-reviewed nor approved (the command died in schema validation instead of reaching the typed `ELIGIBILITY_REVIEW_REQUIRED` path).
   Fix `b9c251c`: `policyRevision` and `expectedPolicyRevision` are positive integers (policy *version* stays pinned to `reference-d03.v1`). Test first: the new core schema test failed 1 of 11 before the change; the DB test failed with the Zod error before and passes after.
2. **Concurrency regression** (`d185c30`): two concurrent approvals of one review (different command IDs) must give exactly one approved row, one audit event and one typed refusal.
3. **C7 coverage and a focus fix** (`a82cafa`, verdict finding 4): the recovery error alert now takes focus when it appears; the e2e spec reaches Approve with the keyboard only and requires a visible focus ring, asserts the 44×44 touch targets of the primary actions, re-asserts the sandbox banner and no-overflow after the negative paths, and re-reads the saved job after leaving to the Jobs page. Test first: before the UI change the focus assertion failed (`Expected: focused, Received: inactive`).
4. **Lane registry:** own entry `m4-2-s-repair` only; added exact path `apps/web/app/ui/recovery-cases.tsx` (no wildcard). A JSON comparison against `HEAD~` shows no other lane changed.
5. **No migration.** 0044 was not needed and is unused: no new column, grant, policy, role or routine. Existing `app.recovery_eligibility_revision` columns and append-only grants suffice. Rollback is an application revert; existing rows stay readable.

## Verdict findings

| # | Finding | Status | Where | Test evidence |
|---|---|---|---|---|
| 1 / R2 | Superseded (and already-approved) review could be approved without a fresh review | **FIXED** | Approve branch of `eligibilityCommand` in `packages/db/src/recovery-case-repository.ts` checks revisions, then `old.status==="reviewed"`, else typed `ELIGIBILITY_REVIEW_REQUIRED` (repair 1, `707d0bf`); policy-supersession path made reachable by `b9c251c`; Nest and Next both map it to 409 `Review the changed evidence before approving` | `packages/db/test/recovery-cases.integration.test.ts`: `it.each(evidence, case, policy)` supersede → approve with the NEW revisions refused with no row or audit written → re-review → approve → exact replay allowed → approve-again refused; two concurrent approvals give one effect. API: `recovery-case.controller.test.ts` (409 mapping). Browser: `M4-2-S.spec.ts` bypasses the disabled button with current revisions, expects 409 `ELIGIBILITY_REVIEW_REQUIRED`, reloads and opens a second context to see "Review superseded", then re-reviews and approves |
| 2 / R3 | "Actual authorized reviewer" was the literal `practice-owner` | **FIXED, with the existing synthetic-principal limit** | `apps/api/src/recovery-case.application.ts` passes the server-selected synthetic membership and identity; the repository re-checks the same-tenant owner membership (identity, not revoked, not expired) inside the write transaction under `FOR SHARE`, even for replays, and records `membership:<id>` in the immutable review row and audit actor. Missing or malformed session, and any mode other than `synthetic_demo`, fail closed | DB test *checks recorded owner membership, identity, tenant and expiry before any eligibility effect or replay* (wrong membership, wrong identity, other tenant, viewer role, revoked, expired, revoked replay); `recovery-case.application.test.ts` (3 tests); e2e asserts `eligibility-reviewer` = `membership:d1500000-0000-4000-8000-000000000003`. This is the existing demo principal bridge, not a new authentication system and not a real-user identity |
| 3 / R4 | Reason said "Verified evidence attributes settled customer money" | **FIXED** | `packages/core/src/recovery-eligibility.ts`: `Synthetic scenario cites evidence attributing customer money to this claim; settlement is not verified`. Limit kept as the verdict accepted: the classifier still decides from a client-chosen scenario and a client-supplied evidence revision (synthetic table-driven simulation); no formula change | `recovery-eligibility.test.ts` (11 tests) and the e2e screenshot show the new wording |
| 4 | e2e coverage versus C7 | **PARTLY FIXED. One item OPEN FOR BEN** | `apps/web/e2e/M4-2-S.spec.ts`, `apps/web/app/ui/recovery-cases.tsx`. Fixed: reload and a second context after the negative paths (repair 1); sandbox banner (count 1) and no horizontal overflow asserted after the negative paths too; keyboard-only approval with a visible focus ring; primary actions at least 44×44; error alert takes focus. **OPEN: "open the job from Jobs".** Captured practice jobs are by design not listed on the Jobs home (DB test `reads a captured job directly without broadening the filtered home list`; the rendered Jobs list showed only the seeded demo jobs), so there is no card to click. The spec goes to Jobs, then opens the saved job on a fresh navigation. Closing this literally needs a product decision to list captured jobs, which contradicts that test and is outside this lane | e2e, 4 of 4 passed (both projects) |
| 5 | Process: PR body cites another branch and SHA; no receipt | **PARTLY FIXED. PR text OPEN** | Receipts now exist in `docs/verdicts/M4-2-S/` (repair 1 and this one). Correct binding for the record: the merged head is `be81bd5`, branch `codex/implement-m4-2-s-functionality-in-jobguard`; PR #85's body names `codex/build-m4-2-s-eligibility-review` @ `29d674c`. Editing or commenting on a merged GitHub PR is a GitHub write that a builder does not make | — |

R1 (run DB and both browser projects): done, see below. Two items stay open (finding 4's Jobs-card click and finding 5's PR text), so the repair correctly stays on hold.

## Commits

| SHA | What |
|---|---|
| `b9c251c` | fix(core): eligibility commands carry a superseded policy revision (with core schema test) |
| `d185c30` | test(db): two concurrent approvals of one review give one effect |
| `a82cafa` | test(web): C7 focus, touch targets, re-read after negative paths; error alert focus; lane entry path |
| this receipt | docs only |

Earlier on the branch (Codex): `1a335e6` lane and verdict, `dedca4c` tests, `ff3b63d` wording, `707d0bf` approval status and recorded membership, `812734d` repair-1 receipt.

## Commands actually run

Runtime: Node v24.17.0, pnpm 10.28.1 pinned via `PATH=/private/tmp/jobguard-m4-2-s-bin:$PATH` (corepack copy). All database and browser commands ran under `heavy-slot m42r`. Logs: local scratchpad files only, not committed. "Forced" means `--force` so turbo could not replay cached results.

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile --offline` | 0 | Lockfile up to date, "Already up to date" (not a fresh install) |
| `pnpm typecheck --force` | 0 | 7 of 7 workspace tasks, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0 | core purity (69 files), lane boundary, money-arithmetic, then 7 of 7 workspace lint tasks, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `m4-2-s-repair`, merge-base comparison, 14 changed files, all inside the allow-list |
| `pnpm build --force` | 0 | 7 of 7 tasks, 0 cached (core, db, storage, ai, config, api, production Next build) |
| `pnpm openapi:check` | 0 | generated spec matches `apps/api/openapi.json` (no OpenAPI change; command bodies are unchanged routes) |
| `pnpm test --force`, first full run | **1** | 12 of 13 tasks. Failed task `@jobguard/db#test`: `job.integration.test.ts` beforeAll "Hook timed out in 60000ms" while the machine load average was about 110 to 140; 33 of 34 DB files passed, 150 tests passed, 5 skipped only because that one suite never started. Not a repair-2 test, not changed. Not counted as a pass |
| `pnpm test --force`, rerun at load about 8 | 0 | 13 of 13 tasks, 0 cached. Tool tests 39 of 39; core 68 files / 330 tests; api 12 / 83; web 4 / 36; ai 3 / 72; config 2 / 2; storage 2 / 4; db 34 files / 155 tests |
| `pnpm test:db` | 0 | 34 files, 155 tests passed, 0 skipped, 159 s (per-file counts such as `recovery-cases` 9 of 9, `outbox` 9 of 9 and `job` 5 of 5 are in the `pnpm test` rerun log above; this log prints totals only) |
| `pnpm test:migrations` | 0 | 2 files, 11 tests passed |
| `CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-2-S.spec.ts -c <local override, see below>` on the final tree | 0 | 4 passed (2 tests in each of `mobile-360` and `desktop`), twice (12.0 s and 10.6 s); production `next start` build against the real embedded database |
| Same command for `M4-1-S.spec.ts M4-3-S.spec.ts` (they render the same component) | 0 | 4 passed |

Red runs kept as evidence (before the matching change):

| Command | Result |
|---|---|
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-cases.integration.test.ts` at repair-1 head | exit 1: 7 passed, 1 failed (`policy supersession`: `expectedPolicyRevision` rejected, "Invalid literal value, expected 1") |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-eligibility.test.ts` with the new schema test, before `b9c251c` | exit 1: 10 passed, 1 failed |
| Same DB file after `b9c251c` (and after adding the concurrency test) | exit 0: 8 of 8, then 9 of 9 |
| e2e, desktop, before the UI focus change | exit 1: `Expected: focused, Received: inactive` for the error alert (the intended red). The other failure in that run was my first draft of a "click the job card on Jobs" step, which cannot work (see finding 4) and was replaced before any green run |
| e2e before a usable browser existed (two attempts) | exit 1, 0 tests ran: `browserType.launch: Executable doesn't exist` (headless shell 1193), then the partial `chromium-1193` failed to load its framework. Environment only |


## Baseline before any repair-2 change (head `812734d`)

`pnpm test` at the unchanged head: tool tests 39/39; core 326, api 83, web 36, ai 72, config 2, storage 4 all passed; **db: 4 files failed / 30 passed, 3 tests failed / 142 passed / 9 skipped, 1 error**. Of those:
- `recovery-cases` policy supersession: real defect, fixed above.
- `outbox` (hook timeout, 9 skipped), `ledger` (5 s test timeout), `review` (5 s timeout, then a FATAL 57P01 from its own server): load-induced. The machine load average was 100 to 140 from other agents' work. The same three files passed alone (16 of 16) in a rerun. No timeout was lengthened and no test was changed.

## NOT RUN, deviations and environment

- **Browser binary deviation (environment only).** Playwright 1.55.1 wants `chromium_headless_shell-1193`, which is not installed here (`chromium-1193` is a partial install with no frameworks), and a browser download was not authorised. The runs used a local-only config *outside the repo* (not committed) that imports the real `apps/web/playwright.config.ts` unchanged and only sets `executablePath` to the already installed `chromium_headless_shell-1234` (Google Chrome for Testing 151.0.7922.34). Tests, projects, viewports, timeouts, retries and assertions are exactly the repo's. A stock run on this Mac needs `playwright install chromium-headless-shell` first.
- **Clean install is not claimed.** `pnpm install --frozen-lockfile --offline` reported "Already up to date" (exit 0); node_modules were not rebuilt from scratch.
- **Embedded PostgreSQL needed no code or test change.** Dylib aliases added by Codex on 27 Sep were still present. Environment fix this session: 23 leaked SysV shared-memory segments (creator process dead, 0 attached; the system limit is 32 and was nearly full) were removed with `ipcrm`; the 2 live ones were untouched. Fixed ports 3000 and 55432 were free for each e2e run; two e2e suites from different projects at once would collide on them.
- **Not run:** `pnpm eval` (not requested; no AI change), full `pnpm test:e2e` across all specs, `pnpm test:regression`, `pnpm test:restore`, a rendered mobile screenshot review beyond the one e2e screenshot, GitHub CI, any deploy. No Docker.
- **Not rebased** onto `origin/main` `4a8f655` (see top).
- Seen but outside this task, not changed: the case-level `reviewerRef:"practice-owner"` literal still sent by the recovery UI for open and transition commands belongs to M4-1-S (its own HOLD); evidence and policy revisions remain client-asserted in this synthetic build, and a re-review may carry any positive revision.

## Environment

macOS 26.4 (Darwin 25.4.0, arm64); Node v24.17.0; pnpm 10.28.1; TypeScript 5.8.3; vitest 4.1.11; Playwright 1.55.1; embedded-postgres 16.10.0-beta.15 (PostgreSQL 16.10, `@embedded-postgres/darwin-arm64@16.10.0-beta.15`); Chromium: Google Chrome for Testing 151.0.7922.34 (headless shell).

## Status

Prepared, implemented, tested locally and committed locally on this branch. Not independently verified, not accepted, not pushed, not merged. Open: finding 4 (Jobs-card click, needs a product decision) and finding 5 (PR #85 text). A different-model verdict on the final head and separate technical acceptance remain required.
