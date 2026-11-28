# Spoken quote red-team findings

One row per finding. Codex adds rows in its attack PRs; fix PRs change the status. Claude mirrors open P0/P1
to the tracking issue and to the V2 planner.

Severity: **P0** wrong money (invented, wrong sign, qualified kept as fixed) or wrong firm or job.
**P1** lost, doubled or misplaced item or price; crash; over 1 s. **P2** confusing but safe.

## RT-10 mobile-360 attack receipt — 28 November 2026 (#1071)

`HEAD_UNDER_TEST` / branch base: `49755b620ccf0223e64575006cd4590c77595ca2`,
branch `codex/sandbox/rt-10`. Brief read from the newer `lanes-ref` README
(invariants and corpus format) and `lanes/RT-10-mobile-360.md`.
**67 attack cases: 67 pass, 0 open findings**, plus one passing markup-render check.
No new finding rows or IDs are warranted. P0 list: **none**. Existing findings,
including F-005–F-008, are not re-reported or reclassified.

Passing cases grouped by the highest-risk assertion they exercise (these are
case groupings, not severity assignments to nonexistent findings):

| Risk covered | Pass | Open |
| --- | ---: | ---: |
| P0: exact money / no invented money | 28 | 0 |
| P1: retained work, source and questions | 31 | 0 |
| P2: safe fallback, touch targets and readability | 8 | 0 |
| Total attack cases | 67 | 0 |

- 16 component-handler cases: 1/10/30/100 lines, 500-character descriptions,
  100-character room names, 20 fully labelled questions, £999,999.99, price
  editing/save/fresh mount, split/combine lineage, five microphone failure codes
  retaining completed words, and two injected unsupported-adapter states.
  Save/reopen uses mocked responses, not database persistence.
- 51 isolated Chromium layout cases: capture **and** review with 1/10/30/100
  lines at 360×740, 390×844, 1280×800 and 740×360; long descriptions/rooms;
  twenty questions; maximum money; 44px controls including the effective
  associated-label target for radio/checkbox controls; reduced-height editing;
  640 CSS px desktop zoom equivalent; doubled computed font sizes. Bounds are
  checked as well as document scroll width, so `overflow-x:hidden` cannot hide
  escaped controls. Twenty-five normal states and six added capture states have
  screenshot attachments at 360/1280 with device scale 2 (31 PNGs total).
- Browser markup is rendered from this branch's **real components and all four
  production stylesheets**. The opt-in config has no server/global setup. Every
  request on the permitted preview origin is intercepted; unrelated requests
  abort. No firm/session is created and no shared practice DB is read or changed.
  The deployed preview still runs **b25b5ee9**, not this branch; this is not a
  hosted workflow or parser acceptance claim. Safari/Firefox adapters are injected
  states, the keyboard is a reduced viewport, and zoom/text enlargement are
  explicit approximations, not physical-device evidence.

Commands actually run:

- `pnpm --filter @jobguard/web test --maxWorkers=2 app/ui/rt10-mobile.test.tsx app/ui/rt10-mobile-markup.test.tsx app/ui/review-proposal.test.tsx app/ui/walk-it-retry.test.tsx`
  — **4 files / 78 tests passed** (17 new checks, 61 existing regressions).
- `pnpm --filter @jobguard/web test --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/database.test.ts'`
  — **264 files / 3,810 tests passed**. The five DB suites are outside this
  component-only run; no DB guarantee is claimed. An earlier concurrent run had
  two timing failures in existing `walk-it-retry.test.tsx`; both passed in the
  focused run and the complete recheck without competing browser work.
- `JOBGUARD_RT10=1 pnpm --filter @jobguard/web exec playwright test --config=playwright.rt10.config.ts --workers=2 --trace off`
  — final **51 passed**, zero skipped/unexpected/flaky. Local diagnostics before
  this included a macOS launch-permission refusal, an interrupted missing-UTF-8
  harness run and removal of a speculative expected-failure marker whose
  assertion passed. These are harness results, not product findings. There were
  multiple isolated component invocations and **zero un-intercepted hosted runs**;
  the one-run shared-preview journey was not used.
- `pnpm --filter @jobguard/web typecheck`, `pnpm --filter @jobguard/web lint`,
  `NEXT_TELEMETRY_DISABLED=1 pnpm --filter @jobguard/web build` — **passed**.
  Workspace dependencies had to be built first. The initial Turbo cache resolved
  outside this worktree and was redirected to `/tmp`; the unneeded mobile build
  was stopped and the API was built directly. No tracked source changed.
- `git diff --check` and deterministic lane allow-list validation — **passed**.

The final browser JSON, screenshots and command logs are retained under
`/tmp/jobguard-rt10-49755b62` and `/tmp/jobguard-rt10-*.log`; screenshot bundle:
`/tmp/jobguard-rt10-49755b62/rt10-screens.zip`. `/mnt/project-files` is unavailable;
the bundle is ready to attach as PR evidence. No default Playwright config,
ports 3000/55432, deployment, paid provider or push was used. `.pnpm-store/`
remains untracked and is excluded from the commit.

Initial review — **LATER / SIMPLICITY**: the hook/node traversal helpers in
`apps/web/app/ui/rt10-mobile.test.tsx`, `review-proposal.test.tsx` and
`walk-it-retry.test.tsx` repeat the same harness pattern. A future test-helper
extraction could reduce divergent fixes; it is non-blocking and outside this
tests-only attack.

| ID | Lane | Head sha | Case id | Transcript | Expected | Actual | Sev | Status | Fix PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RT-00-F001 | RT-00 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-00-002 | Fit the door for a hundred and fifty pound | One line priced 15000 pence | Capture and Reader A leave the price null; singular pound is not read as exact money | P1 | open | — |
| RT-00-F002 | RT-00 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-00-003 | Paint the kitchen £400, no, make that £450 | One open line with a question (or 45000 with a question); never 40000 | Capture keeps 40000 and adds a second “make that” line priced 45000, with no correction question; Reader A safely opens one line | P0 | open | — |
| RT-00-F003 | RT-00 | b25b5ee931ff7bb62bbaa34a47099fddadf514ed | RT-00-005 | Run 15mm pipe to the rad £120 | One line priced 12000; diameter never becomes a count | Capture leaves the price null; Reader A correctly keeps 12000 with quantity null | P1 | open | — |
| RV4-01 | RV-4 | 79e7ce836 | reload-lost-response | Fictional room. Protect room £200.00. | Reload and retry recover the original capture/job | Capture ID was mount-local, so reload created a second job | P1 | fixed | RT-FIX-7 (commit only) |
| RV4-02 | RV-4 | 79e7ce836 | edit-during-confirm | Paint walls → Paint walls AND ceiling while confirm is pending | Prevent editing or require confirmation of the new edit | Confirmation hid an unsaved edit | P1 | fixed | RT-FIX-7 (commit only) |
| RV4-03 | RV-4 | 79e7ce836 | invalid-price | Replace 200.00 with 250.001 | Keep the typed price and block Save/Confirm until corrected | Invalid price was submitted as null and confirmation succeeded | P1 | fixed | RT-FIX-7 (commit only) |
| RV4-04 | RV-4 | 79e7ce836 | cancel-second-dictation | Finish Paint walls; start again with provisional and fit shelves; cancel | Keep the earlier completed words for review | Cancel cleared the transcript and Use these words | P1 | fixed | RT-FIX-7 (commit only) |
| RT-FIX-7-R1 | Codex review | f48dfc88 | new-session-same-source | Fictional room. Protect room £200.00. | A new anonymous practice session captures the same words successfully | Shared demo tenant caused reuse of the previous session's capture ID and permanent NOT_FOUND | P1 | fixed | #1088 repair round 1 (commit only) |
| RT-FIX-7-R2 | Codex review | 554bea9e | cancel-second-dictation-final | Finish Paint walls; start again with FINAL and fit shelves; cancel | Restore the earlier completed transcript and raw provenance | Cancel retained the second recording's final words in review and submission | P2 | fixed | #1088 repair round 2 (commit only) |

## RT-FIX-7 verification — 28 November 2026

Base: `codex/sandbox/rt-fix-4`, `79e7ce836`. Scope: the three screen components,
their existing handler tests, this findings register and `config/lanes/v2-rt-fix-7.json`.

- Before fixes: `pnpm --filter @jobguard/web test --maxWorkers=2 app/ui/walk-it-retry.test.tsx app/ui/review-proposal.test.tsx -t RV4` — **5 failed** (all four findings; RV4-03 tests both Save and Confirm). The reload test observed different IDs; pending-confirm controls had no disabling ancestor; invalid price sent null in one/two network calls; cancellation removed the completed words.
- After fixes: `pnpm --filter @jobguard/web test --maxWorkers=2 app/ui/walk-it-retry.test.tsx app/ui/review-proposal.test.tsx` — **55 passed**. Includes reloading after a lost response, business/source separation, storage failure before any capture request, lock through confirmation, invalid-price correction before submission and completed transcript/raw provenance surviving cancel. These are component-handler tests with mocked network and speech ports, not live browser/provider or database verification.
- `pnpm --filter @jobguard/web test --maxWorkers=2` — **262 files / 3,784 tests passed; 5 database-backed suites failed during setup, 42 tests skipped**. Embedded PostgreSQL `initdb --version` independently fails because `libicudata.68.dylib` is missing. No database/dependency repair attempted.
- Final unit-only run: `pnpm --filter @jobguard/web test --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/database.test.ts'` — **262 files / 3,787 tests passed**, including the final room-price and capture-storage cases. The five database suites above remain a failed environment gate; these exclusions do not turn them into passes.
- `pnpm --filter @jobguard/web typecheck` — passed.
- `pnpm --filter @jobguard/web lint` — passed (the web lint script runs TypeScript).
- `pnpm --filter @jobguard/web build` — passed; optimized build, TypeScript and static-page generation completed.
- `git diff --check` — passed.

Capture retry storage uses a SHA-256 digest of the full tenant-qualified request plus its UUID,
written to sessionStorage before sending. It stores no source words and fails closed if retry
identity cannot be stored. Recovery covers reloads in the same browser tab while its session
storage remains available. Existing server idempotency remains authoritative.
Review inputs and actions are disabled by a fieldset throughout save/confirm; the back action
is also disabled. Invalid line and visible room prices remain visible and block both handlers and buttons; invalid line text never replaces a saved rate with null.
Dictation changes only remove the cancel handler's completed-text/raw-text reset.
No migrations, provider, parser, model or contract changes.

Initial review — **LATER / SIMPLICITY**: `apps/web/app/ui/review-proposal.tsx`,
`renderRow` repeats `priceFromText` for the same displayed value. Parse once per row when
that renderer is next maintained; it would keep validation and error copy together and reduce
duplicate work. This is non-blocking and outside this repair.

Release hold: price handling is RED under AGENTS §5.13; an independent review bound to the
final commit and required CI remain necessary before merge. This build is not that review.

## RT-FIX-7 repair round 1 — Codex review of #1088 at f48dfc88

Practice-session creation in the legacy and designed entry screens now shares the existing
designed client's POST helper. A successful POST rotates a random, non-secret generation in
sessionStorage. Both persisted and mounted-form retry identities include that generation,
tenant and request digest. No credential or source words are stored. Ordinary reloads keep
the same generation and capture ID. Older unscoped storage entries are no longer read.

An explicit NOT_FOUND for a reused ID removes it from storage and the form's map, persists a
fresh ID before sending, and retries once. A new ID's NOT_FOUND, other refusals and unknown
outcomes never automatically rotate the ID. No server/API, parser, reader, core or contract
changes; no migrations. The lane allow-list adds only the existing designed session client.

- Before the repair, the three new session/retry regressions failed; RV4-01 passed.
- Targeted command: `pnpm --filter @jobguard/web test --maxWorkers=2 app/ui/walk-it-retry.test.tsx app/ui/review-proposal.test.tsx 'app/(designed)/real-designed-screens.test.tsx' app/ui/jobguard-linked-entry.test.tsx` — **142 passed** before adding the two final boundary cases.
- `pnpm --filter @jobguard/web typecheck` — passed.
- `pnpm --filter @jobguard/web lint` — passed (TypeScript, per the existing web script).
- Final unit run: `pnpm --filter @jobguard/web test --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/database.test.ts'` — **262 files / 3,792 tests passed**, including all five new regression/boundary cases and RV4-01. Database suites were not run in this UI-only repair; the prior embedded-PostgreSQL environment failure above is not claimed resolved.
- `pnpm --filter @jobguard/web build` — passed; optimized compilation, TypeScript and all 79 static pages completed.
- `git diff --check` — passed. Direct lane-policy validation of the five changed tracked paths — passed; the pre-existing untracked `.pnpm-store/` was excluded and is not staged.

The regression server models ownership by practice session even though both sessions share
one tenant. It verifies new-session capture in the same mounted form, reload reuse within the
new session, recovery from a stored inaccessible ID, the single-retry bound, no automatic
retry for a fresh ID, and retained identity after a refused session start. This is deterministic
component-handler verification with mocked network responses, not independent review or
live database/browser acceptance. Required exact-head independent review and CI remain
merge gates. No push, browser server, default Playwright configuration or port 3000 used.

## RT-FIX-7 repair round 2 (last) — Codex review of #1088 at 554bea9e

Each recording snapshots the visible review text and raw-segment count before listening.
Cancel restores that text and truncates the raw segments to the snapshot boundary, preserving
earlier completed recordings. Recogniser start, stop and result handling are unchanged.
The RV4-04 handler regression now covers both an interim and a FINAL segment arriving in
the cancelled second recording and verifies both arguments submitted by Use these words.

- Before the repair: `pnpm --filter @jobguard/web test --maxWorkers=2 app/ui/walk-it-retry.test.tsx -t RV4-04` — exit 1: FINAL regression failed with `Paint walls and fit shelves`; interim regression passed.
- After the repair: `pnpm --filter @jobguard/web test --maxWorkers=2 app/ui/walk-it-retry.test.tsx app/ui/review-proposal.test.tsx` — exit 0: **61 passed**, including all earlier RV4 cases.
- `pnpm --filter @jobguard/web test --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/database.test.ts'` — exit 0: **262 files / 3,793 tests passed**. Database suites were excluded from this unit-only run; the previously recorded environment failure is not claimed resolved.
- `pnpm --filter @jobguard/web typecheck` — exit 0.
- `pnpm --filter @jobguard/web lint` — exit 0 (the existing web script runs TypeScript).
- `git diff --check` and direct validation of all three changed tracked paths against the existing lane allow-list — exit 0. No lane change needed.

This is deterministic component-handler verification with a mocked speech adapter, not live
microphone/browser verification or independent review. No migrations, providers, parser, model
or contract changes. No build, database suites, Playwright configuration, browser server or
port 3000 used in this round. Existing exact-head review and CI gates remain. Commit only;
no push. The pre-existing untracked `.pnpm-store/` is excluded from the commit.
