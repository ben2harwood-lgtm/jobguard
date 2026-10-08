# M4-1-S-R — builder receipt, repair 12

Date: 2026-10-05. Builder: **Claude Sonnet 5.5** (repair 12, on top of repairs 1 to 11).
**Not independently verified. Not accepted.** This receipt is the builder's account only. A different model must record a verdict bound to the exact head, and a separate actor must record acceptance. Nothing here was merged, released or deleted, and no verdict file was edited.

Input: the GPT-6.1 Sol high check of `30731cfa00c1abb2c7c03952ec65fd325a1008ea` (`jg-runs/m4-1-s-r-solcheck-20261005T015356.md`): `VERDICT: REPAIR`, no P1, five findings.

## Scope reading (coordinator's ruling, 5 Oct ~01:00, plan rev 7 repair-loop rule; recorded verbatim)

- The acceptance target for M4-1-S-R is now fixed: the original HOLD items in `docs/verdicts/M4-1-S/54adf02.md`, the in-scope items of Sol rounds 8–10 (already fixed), and the round-11 items below. Anything else a later check raises that is not a defect in code this PR adds or changes becomes a follow-up order, not a new round.
- Round 12 (Sol at 30731cf). IN SCOPE, fix now, all in code this PR adds: P2-1 a late initial GET can erase a successful command result (recovery-cases.tsx:14,16,50 — ignore stale responses / sequence them, and keep opening disabled until the first load settles, with a test that delivers the stale GET after the POST); P3-5 malformed successful responses crash the workbench (validate response shapes for load and every mutation; show the existing error state, never throw); and the control-enablement bug inside P2-3: "Record dispute" must not be enabled in a state the server forbids (identified) — derive that control's enabled state from the case state, with a test.
- ALREADY DISPOSED, do not change (Sol itself records them as deferred): P2-2 caller authentication → SBOX-SESSION-1 (held for Ben); P2-3's missing lifecycle actions → REC-UI-1; P2-4 0018 reversal accounting → REV-ACCT-1.
- Founder decisions (Ben, 4 Oct 2026), not defects: the C7 "open the job from Jobs" step is met by reopening the saved job fresh plus a second browser context, for every JobGuard task; fictional sample-source labels are acceptable for now. Coordinator ruling (4 Oct): migration numbers follow merge order. This task keeps its allocated migration number (0043).

The three disposed items were not touched: no authentication change, no new lifecycle action (the only control derived from the transition table is "Record dispute"), and no migration or `0018` change (0043 is unchanged; no migration was added or edited).

## Binding

- Branch `codex/sandbox/m4-1-s-repair`, PR #103, previous head `30731cf`.
- Commits (all end `Co-Authored-By: Claude Sonnet 5.5`): `5743a44` tests first (core, web behaviour, browser, lane); `affba43` core question; `b2c3b13` lookup tests; `7ca5b26` workbench fix; then this receipt.
- Lane `m4-1-s-repair`: two exact paths added to this lane only (`apps/web/app/ui/recovery-cases.behaviour.test.ts`, the new test file, and `apps/api/package.json`, for one new contracts export) plus the `receipt` pointer (repair11 to repair12). No other lane was touched. The lane check passes.

## Main-merge resolution

None needed: `git fetch origin && git merge origin/main` reported "Already up to date" (origin/main = `ebfeaae7b07747997194e17eff1601557fced6e8`, already merged in repair 10). No conflict, no migration-count change, no OpenAPI regeneration (the response schema is not in the generated spec; `pnpm openapi:check` matches).

## Findings, tests first, fixes

| # | Finding | Status | Failing-first test (and its red result) | Fix |
|---|---|---|---|---|
| P2-1 | A late initial GET can erase a successful command result | **FIXED** (`7ca5b26`) | `apps/web/app/ui/recovery-cases.behaviour.test.ts:147` onward, which runs the REAL workbench through a deterministic hook runtime with every fetch answer released by hand. Red on the unfixed component: "keeps every way of opening a case disabled until the first read has settled" (`expected false to be true`: the four opening buttons were enabled); "keeps the case a command opened when the first read … is delivered afterwards with an empty register" (the stale GET delivered after the POST reverted the register: `expected '' to be '£320.00'`); "does not let a first read that fails after a command result hide that result" (the failed read raised the load-failed alert over the result); job-switch cases (a late command or read for the previous job overwrote the next job's register: `expected '£320.00' to be '£2,500.00'`, `to be ''`). Browser `apps/web/e2e/M4-1-S.spec.ts:233-237` (red: the four opening buttons were enabled while the first read was held open, both projects) | `apps/web/app/ui/recovery-cases.tsx:21` every request takes a number when it is sent (`ticket`) and an answer is shown only when it is the newest shown so far (`newest`); `:22` `apply` records the answer it showed; `:24` `load` drops a superseded answer, including a superseded failure; `:26` `send` does the same for command answers; `:26` the effect resets a new job to empty and its cleanup bumps `world`, so every answer still in flight for a job that is no longer shown (or after unmount) is dropped; `:27,58,59` `open` ignores its own error and busy reset after a job change; `:61,65` the four opening buttons are `disabled={!idle}` (busy or first read still loading) and Try again is disabled while a command is in flight. A first read that FAILED counts as settled, so opening is available then (its answer replaces the whole register). In a real browser the stale ordering cannot be reached any more because opening is disabled during the read; the unit test therefore presses the real `onClick` regardless of `disabled` (as the pre-repair page allowed) to prove the ordering defence holds on its own |
| P3-5 | Malformed successful responses crash the workbench | **FIXED** (`7ca5b26`, export in `apps/api/package.json:35`) | Same file, `:239` onward: nine malformed READ bodies (`cases` null or missing, body null or an array, wrong version, case missing its fields, nonsense state, a fractional amount, not JSON) and six malformed COMMAND answers (`cases` null, empty object, null, a non-id `affectedCaseId`, nonsense state, not JSON). Red: `TypeError: Cannot read properties of null (reading 'find')`, `… of undefined (reading 'replaceAll')`, an empty alert where the failure must be announced, and the raw `Unexpected token < in JSON` or `Cannot read properties of null (reading 'message')` shown to the user. Also `:371` onward, eight malformed answers to the recorded-source lookups made before a command (red: `Cannot read properties of undefined …`, raw JSON errors, or, for `invoices: "none"`, no alert at all and a command sent with an undefined source) | `recovery-cases.tsx:2,9` `readCases` parses with `recoveryCaseResponseV1`, the schema the server publishes, imported through the new browser-safe export `@jobguard/api/recovery-case-contracts` (`apps/api/package.json:35`, the same pattern as the sibling `*-contracts` exports); `:24` an unreadable read, non-OK read or unreadable body is the existing failed-load state (alert that takes focus, Try again, no register); `:7,26` a SUCCESSFUL command whose answer cannot be read says so plainly ("may or may not have been saved"), shows the failed state (the register is no longer vouched for, so none is shown) with Try again, and never throws; `:11,26` a refusal with no readable body is a plain sentence, not a JavaScript error (`refusal`); `:61` `current` exists only once a read has succeeded; `:42,53` the lookup answers made before opening a case are checked (a plain sentence and nothing sent). The real server's responses pass the schema: all 20 browser runs below open, amend, close, reverse and read cases through this validation |
| P2-3 control | "Record dispute" enabled in a state the server forbids (identified) | **FIXED** (`affba43`, `7ca5b26`) | core `packages/core/src/recovery-case.test.ts:253` onward (red: `TypeError: recoveryEventAllowedFrom is not a function`, 3 tests); web `recovery-cases.behaviour.test.ts:347` onward, one case per state (red: `identified` enabled, `expected false to be true`); browser `M4-1-S.spec.ts:38-41` (red: `toBeDisabled` received enabled on the identified case, both projects) | `packages/core/src/recovery-case.ts:35` `recoveryEventAllowedFrom(state, event)` is the table lookup `transitionRecoveryCase` already made (now used by it, so there is one source), and `recovery-cases.tsx:65` derives "Record dispute" from it: disabled while a command is in flight or where the table has no dispute (identified, prevented). Core tests also prove the question agrees with the transition for every state and event |

Disposed, not touched: P2-2 caller authentication (SBOX-SESSION-1, held for Ben), P2-3's missing lifecycle actions (REC-UI-1), P2-4 0018 reversal accounting (REV-ACCT-1). The follow-up orders already exist and are unchanged.

## Red runs (before the fix, on `30731cf` code plus the new tests)

| Suite | Result on the unfixed code |
|---|---|
| web `vitest run app/ui/recovery-cases.behaviour.test.ts` | 21 failed, 13 passed (the later lookup cases: 8 more failed, 34 passed of 42 before the lookup fix) |
| core `vitest run src/recovery-case.test.ts` | 3 failed, 153 passed (`recoveryEventAllowedFrom is not a function`) |
| browser `playwright test --project=mobile-360 --project=desktop e2e/M4-1-S.spec.ts -g "opens and manages\|unread case list"` | 4 failed (2 tests x 2 projects): `toBeDisabled` received enabled, once for "Record dispute" on an identified case and once for the opening buttons while the first read was held open |

The red browser run needed a production build of the unfixed code; the new core test cannot compile without the new export, so for that one build and run the core test file was temporarily put back to `HEAD` and the new version restored from a saved copy immediately afterwards (never committed in that state).

## Commands run on the final code

All on code head `7ca5b2651a4601c1a989ea818979e03ff11ac7bc` (the later commit is docs-only: this receipt and the lane's receipt pointer, which was already in `5743a44`). Every database and browser command ran inside `heavy-slot m4-1-s-repair`; the e2e wrapper waited inside the slot for ports 3000 and 55432 to be free. Logs are in the builder's scratchpad `r12/logs/`.

| Command | Exit | Result |
|---|---:|---|
| `git fetch origin && git merge origin/main` | 0 | Already up to date (origin/main `ebfeaae`) |
| `pnpm install --frozen-lockfile` | 0 | up to date |
| `TURBO_FORCE=true pnpm typecheck` | 0 | 7/7, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 (2 from turbo cache); core purity (69 files), lane `m4-1-s-repair` and money boundary pass |
| `pnpm lint:lanes` | 0 | lane `m4-1-s-repair` passed |
| `TURBO_FORCE=true heavy-slot … pnpm build` | 0 | 7/7, 0 cached (production Next build) |
| `pnpm openapi:check` | 0 | matches `apps/api/openapi.json` |
| `TURBO_FORCE=true heavy-slot … pnpm test` | 0 | 13/13 tasks, 0 cached: `node --test` 39/39; core 738 (68 files; each of its 369 tests runs from source and from the compiled copy); ai 72 (3); api 121 (16); web 117 (12; was 75: 42 new); db 228 (39); storage 4 (2); config 2 (2) |
| `heavy-slot … pnpm test:db` | 0 | 39 files, 228 tests |
| `heavy-slot … pnpm test:migrations` | 0 | 2 files, 11 tests |
| `CI=1 … playwright test --project=mobile-360 --project=desktop e2e/M4-1-S.spec.ts e2e/M4-2-S.spec.ts e2e/M4-3-S.spec.ts` (through `pnpm --filter @jobguard/web test:e2e`) | 0 | **20 passed**, 0 failed, 0 flaky: every spec that drives the workbench (`grep` finds no other), both projects |

## NOT RUN / deviations

- Locally the browser is the cached `chromium_headless_shell-1234` through an UNCOMMITTED shim config (`apps/web/playwright.local-shim.config.ts`) that sets only `executablePath` (the pinned shell is not installed and nothing was downloaded). The shim was kept out of the tree for typecheck, lint, lanes, every commit and the build; GitHub CI uses the pinned Chromium and is the authority.
- The full e2e suite was not run locally (only the three specs that drive the recovery workbench, both projects); GitHub CI runs the rest. No clean from-scratch install.
- The workbench unit tests are not browser tests: the web package has no DOM or React test renderer, so they replace React's four hooks with a small deterministic runtime and drive the component's real element tree and real `onClick` handlers. They prove ordering and validation logic; the browser specs above prove the page.
- The stale-GET-after-POST ordering cannot occur in a real browser any more (opening is disabled until the first read settles), so there is no browser test for it and none fulfils a route with invented data; the unit test presses the handler regardless of `disabled` on purpose, as described in the P2-1 row.
- Embedded PostgreSQL leaves one shared-memory segment per run on this Mac. Before the browser run the 32-segment limit was nearly full (27 in use); I removed only the 26 that were both unattached and owned by a dead process (`ipcrm -m`, every one checked first); nothing else was touched and no test was changed.
- Environment: Node v24.17.0, pnpm 10.28.1, Playwright 1.55.1, embedded PostgreSQL 16, macOS Darwin 25.4.0.

## Status

Prepared, built, locally tested and committed. Pushed and checked by GitHub CI as reported separately by the coordinator reply (head SHA and run id). Not independently verified, not accepted, not merged.
