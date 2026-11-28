# Spoken quote red-team findings

One row per finding. Codex adds rows in its attack PRs; fix PRs change the status. Claude mirrors open P0/P1
to the tracking issue and to the V2 planner.

Severity: **P0** wrong money (invented, wrong sign, qualified kept as fixed) or wrong firm or job.
**P1** lost, doubled or misplaced item or price; crash; over 1 s. **P2** confusing but safe.

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
| RT-09-F001 | RT-09 | 49755b620ccf0223e64575006cd4590c77595ca2 | RT-09-B11; RT-09-B13 | Fictional kitchen. Fit shelves £200.00. Human review adds “and brackets” to Fit shelves, then Back/reopen or reload before Save. | Keep the unsaved work clause recoverable, or guard navigation so it is not lost silently. One recording still has one job. | Returning to the same review URL or reloading restores “Fit shelves”; “and brackets” and the unsaved Accept choice disappear, with no recovery or navigation warning. The original source survives. | P1 | fixed | RT-FIX-13 (commit only; DB execution held by environment) |
| RT-09-F002 | RT-09 | 49755b620ccf0223e64575006cd4590c77595ca2 | RT-09-B16-error; RT-09-B16-end | Completed speech: “Fit shelves”; visible provisional speech: “and fit brackets”; recognizer reports permission loss or end. | Retain the partial clause visibly as provisional text or a question so the builder can review it; never silently lose the work. | Both error and end clear the provisional clause. Only “Fit shelves” remains available in Words to review; “and fit brackets” disappears from the dictation region. Permission loss even says the words so far are kept. | P1 | fixed | RT-FIX-13 (commit only; DB execution held by environment) |
| RT-09-F003 | RT-09 | 49755b620ccf0223e64575006cd4590c77595ca2 | RT-09-A10 | Fictional kitchen. Fit shelves £200.00. Confirm the accepted review, then deliver the old draft screen’s Discard command with expectedRevision 0. | Preserve the one confirmed scope and return a clear typed REVIEW_REVISION_CONFLICT for the stale Discard. | Scope/source remain intact, but CaptureApplication.discard rejects with raw PostgreSQL code 40001 rather than a typed application conflict. Source inspection shows the discard HTTP handler maps such an untyped error to 503 DATABASE_UNAVAILABLE. | P2 | fixed | RT-FIX-13 (commit only; DB execution held by environment) |

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

## RT-09 attack evidence — 28 November 2026

HEAD_UNDER_TEST / branch base: `49755b620ccf0223e64575006cd4590c77595ca2`;
branch `codex/sandbox/rt-09`. Read the newer `lanes-ref` README invariants/corpus contract
and RT-09 lane. Only new tests, this register and `config/lanes/v2-rt-09.json` change.
No product-source, parser, model, policy, schema or migration changes. No deployment or push.

40 new attack cases: 10 offline-planner cases, 12 real API/PostgreSQL cases and 18 Chromium
cases at 360 px. Expectations come from the synthetic words and user actions. The four browser
open cases use Playwright `test.fail(true, findingId)` immediately before their product
assertion; A10 uses Vitest `it.fails` with RT-09-F003 in its title. An unexpected
pass fails the suite. Browser setup/navigation failures are not expected.

| Risk severity | Passing cases | Open cases | New open findings |
| --- | ---: | ---: | ---: |
| P0 | 1 | 0 | 0 |
| P1 | 34 | 4 | 2 |
| P2 | 0 | 1 | 1 |
| Total | 35 | 5 | 3 |

Passing-case severity identifies the risk guarded: A03 prevents a changed £250 input from
overwriting the original £200 capture (P0). A10 guards safe conflict reporting (P2); the other cases guard lost/doubled work
or clear conflicts (P1). **P0 list: none.** Known F-005 supply-and-fit splits, F-006 per-metre rate left open, F-007 trailing
comma and F-008 mic hang are excluded, as are the existing register entries.
Their descriptions were recovered from the sibling RT-12 order; none overlaps these rows. RV4-01..04 retain their existing fixed status.

Executed checks (two workers maximum per runner):

- `pnpm --filter @jobguard/core test --maxWorkers=2 src/RT-09-offline-exactly-once.test.ts src/offline-capture.test.ts` — 233 files / 4,905 tests passed. The package script includes all `src`, so this exercised the full core suite, including the 10 new cases.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/RT-09-exactly-once.integration.test.ts test/capture.integration.test.ts test/review.integration.test.ts test/later-capture-review.integration.test.ts test/discard-draft-job.integration.test.ts` — 5 files / 36 tests passed, including the initial 12 API cases; the stricter final A10 result is recorded below. Actual practice authorization, persistence, locking and command dispatch on fresh PostgreSQL 16; deterministic synthetic extraction, no provider calls.
- Final API run: `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/RT-09-exactly-once.integration.test.ts` — exit 0: 11 ordinary passes and 1 expected failure. Strengthening the earlier race test exposed raw 40001; A10 now pins confirmation before the stale Discard to make that failure deterministic.
- `pnpm --filter @jobguard/web test --maxWorkers=2 app/ui/walk-it-retry.test.tsx app/ui/review-proposal.test.tsx -t RV4` — all 6 RV4 regressions passed. The complete two-file run passed 61 tests. An earlier complete run hit two existing asynchronous harness failures; the unchanged repeat passed all 61.
- `pnpm --filter @jobguard/web test --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/database.test.ts'` — 262 files / 3,793 tests passed. This is the web unit suite, not the excluded PostgreSQL suites.
- `pnpm --filter @jobguard/web test --maxWorkers=2` — full package: 267 files / 3,835 tests passed, including all five PostgreSQL suites. The earlier unit-only exclusions are not needed for this final full run.
- `PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/rt09-browser-report.json pnpm --filter @jobguard/web exec playwright test -c e2e/RT-09.playwright.config.ts --max-failures=1 --reporter=list,json` — exit 0; all 18 cases enforced: 14 ordinary passes and 4 expected failures, zero unexpected results. JSON inspection verified both finding IDs on exactly their two cases each.
- `pnpm --filter @jobguard/web typecheck`, `pnpm --filter @jobguard/web lint`, `pnpm --filter @jobguard/core typecheck`, `pnpm --filter @jobguard/db typecheck` — passed.
- `pnpm --filter @jobguard/web build --webpack` — passed: optimized compilation, TypeScript and all 79 static pages.
- Dependency build: `pnpm exec turbo run build --filter='@jobguard/web^...' --concurrency=2 --cache-dir=/tmp/jobguard-rt09-turbo` — all 7 dependency packages passed. No feature build or release is inferred.

Browser tests load the actual capture/review screens and use intercepted API responses for
latency, response loss and competing edits. The two-tab case uses two real pages sharing
one recording identity. The API suite separately proves the database behavior; mocked
browser responses do not. The 10-second capture case holds the reply while the synchronous
submit guard is exercised. Offline tests cover the pure planner/receipt reducer, not a
claim that web dictation has a durable offline audio queue. Speech uses the existing
injected local adapter; no real microphone, audio upload or live speech provider was used.

Local test setup: restored the installed embedded-PostgreSQL package's missing ICU data
file and symlinks from its exact pinned npm tarball, in ignored dependencies only.
PostgreSQL and Chromium needed execution outside the filesystem sandbox for macOS shared
memory/Mach ports. Disposable database fixtures used their existing safe port ranges;
the isolated browser config uses port 3199 and clears DATABASE_URL. Default Playwright,
ports 3000/55432, paid APIs and deployments were not used. Next's generated agent file
and route-type import changes are excluded, as is `.pnpm-store/`.

Lane policy shape and all six actual changed paths validated against the exact allow-list.
Repository-wide lint initially compared the inherited feature branch against main and
refused unrelated inherited files; final lane checks use the recorded task base and exclude
only the local untracked dependency cache. The final `node tools/lint.mjs` run passed
with `LANE_BASE_REF` set to the recorded base and a temporary excludes file containing
only `.pnpm-store/`; lane output listed exactly the six authorized files.
`git diff --check` passed.

Initial review — **LATER / SIMPLICITY**: `apps/web/app/ui/jobguard-app.tsx`, `WalkIt`
retains an inline `reviewing` branch although Check and edit navigates to the saved job
and no handler sets that flag true. A later cleanup can remove that obsolete branch
after checking callers, leaving one review entry path and reducing stale state ownership.
Non-blocking; no simplification or product-source change is part of this attack.

## RT-09 A10 review repair — PR #1100, 28 November 2026

Base: `2e59ff733d53b0cd0c00e7f414d73340e2a12401`. A10 now uses a shared
`beforeAll` for capture/save/confirm/stale-discard setup, an ordinary test for quoting
status, preserved source and one scope revision, and an `it.fails` containing only the
RT-09-F003 typed-conflict assertion. Setup and preservation failures fail the suite;
RT-09-F003 remains open. The original 40 attack scenarios now have 41 test checks.

- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/RT-09-exactly-once.integration.test.ts` — **12 passed, 1 expected failure** on real PostgreSQL.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/RT-09-offline-exactly-once.test.ts` — **10 passed**.
- `pnpm --filter @jobguard/web exec playwright test -c e2e/RT-09.playwright.config.ts` — exit 0; **14 ordinary passes, 4 existing expected failures**.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/ui/walk-it-retry.test.tsx app/ui/review-proposal.test.tsx -t RV4` — **6 passed, 55 outside the filter skipped**.
- `git diff --check` — passed.

Initial sandbox runs could not initialize PostgreSQL or launch Chromium (Mach-port
permission denied); both passed when rerun outside the sandbox. No dependency repair,
product-source change, deployment or push. Next's generated files and `.pnpm-store/`
are excluded from the commit.

## RT-FIX-13 verification — 28 November 2026

Base: `bc9f53a54`, branch `codex/sandbox/rt-fix-13` (RT-09 specs and A10 split).
Practice data only; no migrations, paid providers, parser/model changes, deployment or push.

- F001: tab-local session storage holds only editable review fields and price text, keyed by job/proposal/revision. Reopen/reload restores incomplete edits exactly, including invalid prices; unrelated jobs/revisions do not inherit them. Save clears the old draft. No session credential or full workspace response is stored. Tab-local storage preserves each tab's losing edits independently.
- F002: recognition error/end moves interim text into a labelled editable provisional draft and explains what happened. It remains separate from raw final recognition provenance; Use these words includes the reviewed draft. Cancel still drops only the cancelled recording, including final/interim words and late callbacks, preserving earlier words and provenance.
- F003: Discard maps PostgreSQL serialization/revision conflicts from the dispatcher as well as its own routine to `REVIEW_REVISION_CONFLICT`. Authorization, command revision and database preservation checks remain unchanged. A10's preservation half is unchanged; only `it.fails` on the typed-conflict half becomes `it`.
- RT-09 browser changes remove only the F001/F002 expected-failure markers. Every existing assertion is unchanged.

Initial review — **LATER / SIMPLICITY**: `apps/web/app/ui/review-proposal.tsx` still combines room tools, save/confirm and quote navigation in dense statements. A separate later change could extract room editing into a component, making state ownership easier to inspect without changing the command boundary. This does not block RT-FIX-13.

Validation results follow below. A fixed finding records the repair; it does not establish a live database pass, independent acceptance, merge or release.

- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/RT-09-offline-exactly-once.test.ts` — **10 passed**. No core source changed.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/ui/walk-it-retry.test.tsx app/ui/review-proposal.test.tsx` — **64 passed**, including the added recovery/interruption regressions and RT-FIX-7 Cancel tests.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/capture/capture-state.test.ts` — **11 passed**, including typed Discard conflict mapping for expectedRevision 0 and an old revision. Dispatcher failure is mocked; this is not PostgreSQL preservation proof.
- `pnpm --filter @jobguard/web exec playwright test -c e2e/RT-09.playwright.config.ts` — **18 passed** in Chromium on the isolated synthetic server at port **3199**. The sandbox's first attempt failed before assertions with Chromium MachPortRendezvous permission denial; the same command passed with test-process permission. No default Playwright configuration or port 3000 was used.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/RT-09-exactly-once.integration.test.ts` — **environment hold**: PostgreSQL initialisation exits with code null in both sandbox and permitted-process retry. All 13 bodies remain unexecuted because beforeAll failed. A10 is now an ordinary required assertion, not an expected failure; its real database result remains unverified here.
- `pnpm --filter @jobguard/web test --maxWorkers=2` — **262 unit files / 3,796 tests passed**; the full run also attempted 5 database-backed files, all failing PostgreSQL initialisation with the same code-null error. The runner reports 42 tests skipped by failed setup, not by test exclusions. No test was disabled, excluded, weakened or given a new skip marker.
- `pnpm typecheck --concurrency=2 --cache-dir=/tmp/jobguard-rt-fix13-turbo` — **8 tasks passed** after correcting a TypeScript type in the new test assertion.
- `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.excludesFile GIT_CONFIG_VALUE_0=/tmp/rt-fix13-git-excludes AGENT_LANE=v2-rt-fix-13 LANE_BASE_REF=bc9f53a5^ pnpm lint --concurrency=2 --cache-dir=/tmp/jobguard-rt-fix13-turbo` — **boundary checks and 8 lint tasks passed**. The temporary Git excludes file contains only the pre-existing `.pnpm-store/`; no repository ignore rule changed. The comparison predecessor includes only the inherited A10 test split in addition to this repair. Final commit scope is checked against base `bc9f53a5`.
- `pnpm build --concurrency=2 --cache-dir=/tmp/jobguard-rt-fix13-turbo` — **8 tasks passed**, including the optimized Next build. The initial default Turbo cache target was outside this writable worktree; checks use the temporary cache above. Dependency builds used the same cache path. Next-generated agent guidance was read and removed from the untracked build output; generated next-env changes are absent from the final diff.
- `git diff --check` — passed. The lane permits exactly the ten changed product/test/register paths; its own lane file is implicitly permitted, with no grant of `config/lanes/`. The pre-existing untracked `.pnpm-store/` stays out of the commit.

No live microphone, approved-region AI evaluation, independent review, merge or release is claimed. Browser speech uses the existing deterministic adapter; browser network cases use the supplied route fixtures. Remaining delivery gate: run the unchanged RT-09 DB preservation and typed-conflict assertions where embedded PostgreSQL starts, then apply the existing exact-head review/CI gates.
