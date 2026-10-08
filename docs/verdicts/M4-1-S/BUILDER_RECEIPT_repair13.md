# M4-1-S-R — builder receipt, repair 13

Date: 2026-10-05. Builder: **Claude Sonnet 5.5** (repair 13, on top of repairs 1 to 12).
**Not independently verified. Not accepted.** This receipt is the builder's account only. A different model must record a verdict bound to the exact head, and a separate actor must record acceptance. Nothing here was merged, released or deleted, and no verdict file was edited.

Input: the GPT-6.1 Sol high check of `aac7740c45eb2d4ac3f9e78ea5aa47b3d9956bfa` (`jg-runs/m4-1-s-r-solcheck-20261005T025453.md`): `VERDICT: REPAIR`, no P1, four findings in code rounds 11 and 12 added.

## Scope reading (coordinator's ruling, 5 Oct ~01:00, plan rev 7 repair-loop rule; recorded verbatim)

- The acceptance target for M4-1-S-R is now fixed: the original HOLD items in `docs/verdicts/M4-1-S/54adf02.md`, the in-scope items of Sol rounds 8–10 (already fixed), and the round-11 items below. Anything else a later check raises that is not a defect in code this PR adds or changes becomes a follow-up order, not a new round.
- Round 13 (Sol at aac7740 — all four are in the workbench code rounds 11–12 added; fix them together and design so the class cannot recur). IN SCOPE, fix now:
  - P2-1 a delayed source lookup can overwrite the next job's register: take the request ticket BEFORE the lookups start and check it after every await (lookup and POST); a job change cancels the whole open flow.
  - P2-2 an unknown save outcome must not permit a duplicate opening: keep the SAME command id for an attempt until a definitive outcome (success, or an explicit refusal); a lost or unreadable response shows "may or may not have been saved" and the only retry re-sends that same command id (the server's replay contract then returns the first result); a new opening is disabled until the unknown outcome is resolved. Test: lost POST → retry uses the identical id and creates exactly one case.
  - P3-3 validate every row of each source lookup (not just that it is an array); malformed rows show the error state and nothing is sent.
  - P3-4 make `affectedCaseId` REQUIRED in the response contract for open/command results that create or change a case, and treat a missing or unknown id as an unreadable response (no silent selection).
- ALREADY DISPOSED, do not change (Sol itself records them as deferred): P2-2 caller authentication → SBOX-SESSION-1 (held for Ben); P2-3's missing lifecycle actions → REC-UI-1; P2-4 0018 reversal accounting → REV-ACCT-1.
- Founder decisions (Ben, 4 Oct 2026), not defects: the C7 "open the job from Jobs" step is met by reopening the saved job fresh plus a second browser context, for every JobGuard task; fictional sample-source labels are acceptable for now. Coordinator ruling (4 Oct): migration numbers follow merge order. This task keeps its allocated migration number (0043).

The three disposed items were not touched: no authentication change, no new lifecycle action, no migration or `0018` change (0043 is unchanged; no migration was added or edited). Sol's separate deferred note that eligible net principal is not bounded by allocated gross cash (`0043`/`0018`) is a follow-up recorded by Sol, not part of this round, and was not touched.

## Binding

- Branch `codex/sandbox/m4-1-s-repair`, PR #103, previous head `aac7740`.
- Commits (all end `Co-Authored-By: Claude Sonnet 5.5`): `808d4a1` failing tests first (API contract, web behaviour, browser); `2bd817e` API contract split; `76b56c2` web fix, the new request module with its tests, and the lane entry; then this receipt.
- Lane `m4-1-s-repair`: two exact paths added to this lane only (`apps/web/app/lib/recovery-case-requests.ts` and `.test.ts`, both new files) plus the `receipt` pointer (repair12 to repair13). No other lane was touched. The lane check passes.

## Main-merge resolution

None needed: `git fetch origin && git merge origin/main` reported "Already up to date" (origin/main = `ebfeaae7b07747997194e17eff1601557fced6e8`, already merged in repair 10, and unchanged since). No conflict, no migration-count change, no OpenAPI regeneration (the response schema is not in the generated spec; `pnpm openapi:check` matches).

## Design: one rule per class, so the class cannot recur

- **Tickets.** `ticket()` is taken when an operation STARTS (`recovery-cases.tsx:23`). `open()` takes it before its first lookup and passes the same ticket to `send()`/`submit()` (`:48-58`). Every await of a multi-step operation goes through `alive(ticket, promise)` (`:26`), which stops the operation (throws `Superseded`, swallowed by every operation) the moment the job changed or the workbench was removed. No step can run "after a wait" without the check, because the check is part of the wait.
- **Attempts.** A command is one `Attempt` (`:15`): body (so command id), path, selection rule. `commandOutcome` (`lib/recovery-case-requests.ts:44`) classifies every answer once: **saved** (2xx matching the command contract), **refused** (a 4xx: the server examined the request and declined it), or **unknown** (no answer, a 5xx, a 2xx that is not the contract, including a missing or unlisted `affectedCaseId`). Only saved or refused ends an attempt. Unknown keeps the attempt exactly as sent (`hold`, `:33`) and the only retry (`retry`, `:45`) re-sends it byte for byte. `send()` and `open()` refuse to start while an attempt is held (`:43,49`), and every opening button is `disabled={!idle}` where `idle` includes `!unsure` (`:60`), so there is no way to start a second opening, with a new command id, from an unknown outcome. A job change drops the held attempt (`:35`).
- **Lookups.** Every lookup answer is parsed with a schema before a row is used (`lib/recovery-case-requests.ts:64-82`), so no row field is read unvalidated.
- **Contract.** `affectedCaseId` is required and must be listed in the answer to every command (`apps/api/src/recovery-case.contracts.ts:16`); a plain read has its own list contract with no affected id (`:8`). The client validates every command answer against it, so a selection is never derived from list order.

## Findings, tests first, fixes

| # | Finding | Status | Failing-first test (and its red result) | Fix |
|---|---|---|---|---|
| P2-1 | A delayed source lookup can overwrite the next job's register (the ticket was taken after the lookups) | **FIXED** (`76b56c2`) | `apps/web/app/ui/recovery-cases.behaviour.test.ts:417` onward: for each practice button (£320 customer, £2,500 customer, prevention, materials) the job changes, and separately the workbench is removed, while the lookup is held open; the lookup is then released. Red on `aac7740`: `expected [ { …(6) } ] to have a length of +0 but got 1` (a command for the old job was POSTed after the job had changed) in all 8 cases. Also a lookup refused for the previous job is not announced on the next job, and a job change during the POST still drops the answer (both already passed: regression guards) | `recovery-cases.tsx:48-58` `open()` takes the ticket first and hands it to `send()` (`:43`); `:47` `lookup` and `:37` `submit` run every await through `alive` (`:26`); the `finally` and error handling only touch state while the ticket is current |
| P2-2 | An unknown save outcome permits a duplicate opening (lost POST, new command id, opening re-enabled) | **FIXED** (`76b56c2`) | `recovery-cases.behaviour.test.ts:498` onward, driven by a miniature of the server's replay contract: eight kinds of unknown (connection lost, 200 not JSON, 502 page, 500 without body, 500 framework body, 200 that is not the contract, 200 without affected id, 200 with an unlisted affected id) each assert: "may or may not have been saved" announced, all four opening buttons disabled, a forced click sends no lookup and no command, "Try again" re-sends a body `toEqual` the first (identical command id), the server ends with exactly one case, controls re-enabled. Also: lost, lost again, then success: three requests, one command id, one case; a command on an existing case is held the same way (same id and revision); explicit refusals (409, 400, 403, a 404 page) end the attempt and a new opening gets a NEW id; a refusal of the re-sent request releases the hold and "Try again" then re-reads; a job change drops the held attempt; a late answer for an abandoned attempt neither holds nor shows anything. Red on `aac7740`: `expected 'Failed to fetch' to contain 'may or may not have been saved'`; `expected false to be true` (opening still enabled); `no button "Try again" on screen`. Browser `apps/web/e2e/M4-1-S.spec.ts:259`: the server commits the first POST and the connection is then reset; red on the `aac7740` build: `Expected "may or may not have been saved"`, `Received "Failed to fetch"`, both projects | `recovery-cases.tsx:15,33,35,37-46,60,64` (attempt, hold, submit, send, retry, `idle`, and the single "Try again" button choosing retry or re-read); `lib/recovery-case-requests.ts:44-54` classification. Messages: lost = "The connection was lost before the server's answer arrived. Your last action may or may not have been saved. Choose Try again to send the same request again; …" |
| P3-3 | Source-lookup validation checks arrays, not rows | **FIXED** (`76b56c2`) | `recovery-cases.behaviour.test.ts:751` onward: 18 malformed rows (materials: null, number, no quantity, numeric quantity, non-id rate, text price, one good plus one null; supplier facts: null, empty, no version id, numeric version id, one good plus one null; customer invoices: null, empty, empty id, numeric id, non-id string, one good plus one null), each expecting the plain lookup sentence, no command sent, controls re-enabled; and a pass-through test that well-formed rows still choose the newest invoice or the matching rate and invoice version. Red on `aac7740`: `Cannot read properties of null (reading 'quantity')`, `… 'document_number')`, and, for the customer rows, an empty alert (no failure announced at all) | `lib/recovery-case-requests.ts:63-82` row schemas (`materialRow`, `supplierFactRow`, `customerInvoiceRow`), `parseSupplierSources`, `parseCustomerInvoices`; `:95,102` the pickers, unchanged in behaviour; `recovery-cases.tsx:48-55`. A lookup that cannot be fetched or read is now also the plain sentence (it used to show the raw "Failed to fetch") |
| P3-4 | An incomplete opening answer silently selects another case | **FIXED** (`2bd817e`, `76b56c2`) | API `apps/api/src/recovery-case.command.application.test.ts:72,83,89` (red: the two contracts did not exist, `Cannot read properties of undefined (reading 'safeParse')`); web `recovery-cases.behaviour.test.ts:697` onward, including Sol's own case: a £2,500 register, a £320 opening answered with only the £2,500 case and no id (red: `expected '£2,500.00' to be ''`, the other case was shown), an unlisted but well-formed id, and a non-opening command with no id | `apps/api/src/recovery-case.contracts.ts:8,16` `recoveryCaseListResponseV1` (reads) and `recoveryCaseCommandResponseV1` (`affectedCaseId` required and refined to be one of the listed cases); `lib/recovery-case-requests.ts:44` treats a failing command answer as UNKNOWN; `recovery-cases.tsx:37` selects only by `affectedCaseId` for an opening. `selectedCaseAfterResponse` is unchanged: its fallbacks apply to plain reads and updates, and the contract makes its unlisted-id branch unreachable for a command answer |

Disposed, not touched: P2-2 caller authentication (SBOX-SESSION-1, held for Ben), P2-3's missing lifecycle actions (REC-UI-1), P2-4 0018 reversal accounting (REV-ACCT-1). The follow-up orders already exist and are unchanged.

### Two earlier tests whose premise round 13 changed

Both are in `recovery-cases.behaviour.test.ts`; each keeps every other assertion. Neither was weakened, skipped or retried.

- `:297` "a command whose successful answer is malformed … can be re-sent unchanged" (was "can be re-read"). Repair 12 asserted that after an unreadable SUCCESSFUL answer "Try again" re-reads the register. Round 13 P2-2 says an unreadable answer is an unknown outcome whose only retry re-sends the same command id, so the test now asserts exactly that (no re-read, a second POST with an identical body, then the first result is shown).
- `:320` "a refusal with no readable body …" used status 500 and 502. A 5xx is no longer an explicit refusal (the command can have committed), so the same two assertions now use a 400 with a null body and a 404 with a non-JSON body; 5xx with no body is covered by the P2-2 cases above.

## Red runs (before the fix: `aac7740` implementation plus the new tests, commit `808d4a1`)

| Suite | Result on the unfixed code |
|---|---|
| web `vitest run app/ui/recovery-cases.behaviour.test.ts` | 48 failed, 45 passed (93) |
| api `vitest run src/recovery-case.command.application.test.ts` | 3 failed, 9 passed (12) |
| browser `playwright test --project=mobile-360 --project=desktop e2e/M4-1-S.spec.ts -g "lost save answer"` (production build of the unfixed code) | 2 failed (1 test x 2 projects): `Received string: "Failed to fetch"` |

To run the red browser test the implementation files were put back to `aac7740` and the two new untracked files moved to the scratchpad, then restored byte for byte (`cmp`) before the fix commits; nothing was committed in the red state except the tests themselves.

## Commands run on the final code

All on code head `76b56c27d9e5c1a445c145006706bb02673dd486` (the later commit is docs-only: this receipt). Every database and browser command ran inside `heavy-slot m4-1-s-repair`; ports 3000 and 55432 were free. Logs are in the builder's scratchpad `r13/logs/`.

| Command | Exit | Result |
|---|---:|---|
| `git fetch origin && git merge origin/main` | 0 | Already up to date (origin/main `ebfeaae`) |
| `pnpm install --frozen-lockfile` | 0 | up to date |
| `TURBO_FORCE=true pnpm typecheck` | 0 | 7/7, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7; core purity (69 files), lane `m4-1-s-repair` and money boundary pass |
| `pnpm lint:lanes` | 0 | lane `m4-1-s-repair` passed |
| `TURBO_FORCE=true heavy-slot … pnpm build` | 0 | 7/7, 0 cached (production Next build) |
| `pnpm openapi:check` | 0 | matches `apps/api/openapi.json` |
| `TURBO_FORCE=true heavy-slot … pnpm test` | 0 | 13/13 tasks, 0 cached: core 738 (68 files); ai 72 (3); api 124 (16; was 121); web 196 (13; was 117); db 228 (39); storage 4 (2); config 2 (2) |
| `heavy-slot … pnpm test:db` | 0 | 39 files, 228 tests |
| `heavy-slot … pnpm test:migrations` | 0 | 2 files, 11 tests |
| `CI=1 … playwright test --project=mobile-360 --project=desktop e2e/M4-1-S.spec.ts e2e/M4-2-S.spec.ts e2e/M4-3-S.spec.ts` | 0 | **22 passed** (was 20; the new lost-answer journey in both projects), 0 failed, 0 flaky: every spec that drives the workbench |

## NOT RUN / deviations

- Locally the browser is the cached `chromium_headless_shell-1234` through an UNCOMMITTED shim config (`apps/web/playwright.local-shim.config.ts`) that sets only `executablePath` (the pinned shell is not installed and nothing was downloaded). The shim was kept out of the tree for typecheck, lint, lanes, every commit and the build; GitHub CI uses the pinned Chromium and is the authority.
- The full e2e suite was not run locally (only the three specs that drive the recovery workbench, both projects); GitHub CI runs the rest. No clean from-scratch install.
- The workbench unit tests are not browser tests: the web package has no DOM or React test renderer, so they replace React's four hooks with a small deterministic runtime and drive the component's real element tree and real `onClick` handlers. They prove ordering, classification and validation logic; the browser spec above proves one real lost-answer journey end to end (the server really commits, the browser never hears).
- Embedded PostgreSQL leaves one shared-memory segment per run; 19 leaked segments (all unattached, all with dead creator processes) were present. I tried `ipcrm -m` on them as the brief allows; the tool's permission check refused it as interfering with other workloads, so none were removed and nothing was worked around. The runs above still succeeded.
- Not covered by this round (follow-up observation, not a new defect in the four items): the Next route `apps/web/app/api/jobs/[id]/recovery-cases/route.ts` answers any error thrown while handling a POST with a 400/403/409, including a failure while the answer is being built AFTER the command has committed (for example a database read error in the refreshed list). The client classifies a 4xx as an explicit refusal, so in that narrow case a new opening would not be blocked. Suggested follow-up: give that situation its own error and a 5xx status in the route and application (`RecoveryCaseApplication.command` and `eligibility`), with a test that a failing list after a committed command is not a 4xx.
- Environment: Node v24.17.0, pnpm 10.28.1, Playwright 1.55.1, embedded PostgreSQL 16, macOS Darwin 25.4.0.

## Status

Prepared, built, locally tested and committed. Pushed and checked by GitHub CI as reported separately by the coordinator reply (head SHA and run id). Not independently verified, not accepted, not merged.
