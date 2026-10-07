VERDICT: PASS — bound to head eb6f9773542284f3496f5ca5d60aafd5afab361b
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

## In one paragraph

This change fixes exactly the race the task card names. Before, the spec clicked "Record practice acceptance" and "Start this practice job" and then navigated straight away, so the save could be cut off mid-flight. Now each click waits for its own successful save response before navigating. Both waits look for the real route each button calls, and both are set up before the click happens. These were the only two unguarded click-then-navigate pairs in the file. Nothing else changed: no assertions, timeouts, retries, skips, app code or other specs. On this head, CI ran all 166 browser tests across both browser projects, with zero retries, and all passed.

## Findings

**P1:** none. **P2:** none.

**P3 (informational, no fix required):** `apps/web/e2e/SBOX-resume.spec.ts:72` and `:80` only accept a response where `response.ok()` is true. If a future regression makes either POST return 409 or 400, the test will stall on the wait until the 180 s test timeout, instead of failing at the next status assertion. Nothing gets past the test this way (it still fails), and the card itself suggested `&& r.ok()`. The only cost is a less specific failure message.

## Requirement check (card TEST-STAB-3)

- **Only `apps/web/e2e/SBOX-resume.spec.ts` changed in code.** Diff vs `origin/main` (a5ed99a): the spec (+8/−2), one appended lane, and `docs/verdicts/TEST-STAB-3/BUILDER_RECEIPT.md`. The head contains main.
- **The waits match the real routes.**
  - "Record practice acceptance" runs `recordAcceptance()`, which calls `fetch(\`/api/jobs/${jobId}/quotes/acceptance\`, {method:"POST"})` (`apps/web/app/ui/quote-editor.tsx`, the recordAcceptance body). The spec waits for pathname `/api/jobs/${jobId}/quotes/acceptance` + POST + ok (spec :72).
  - "Start this practice job" runs `switchLive()`, which calls `fetch(\`/api/jobs/${jobId}/quotes/activation\`, {method:"POST"})`. The spec waits for `/quotes/activation` + POST + ok (spec :80).
  - Both route handlers exist and export POST: `apps/web/app/api/jobs/[id]/quotes/acceptance/route.ts` and `.../activation/route.ts`. Each `await`s the application command (`quote.accept` / `quote.activate`) before returning JSON, so an ok response means the write has finished.
  - There is no `next.config` basePath. `jobId` comes from `data-job-id`, which is the same prop the editor's `fetch` uses.
  - The method check matters: the editor also sends GETs to the same two paths when it loads, and the predicate correctly ignores them.
  - The follow-up `onCommitted()` only sends a GET to `/api/jobs/:id/proposal` (`review-proposal.tsx` refreshCommittedStatus). That is read-only, so cutting it off by navigating is harmless.
- **No missed-response race.** In each `Promise.all([page.waitForResponse(...), click(...)])` the wait is the first array element, so it is set up before `click()` starts. `click()` then waits for visible and enabled before it actually clicks.
- **Every click-then-navigate pair is covered.** My own scan of the file (probe A below) found 7 navigations:
  - :75 and :83 now have guarded clicks (on main these were the only two UNGUARDED ones, at :71→:72 and :76→:77).
  - :41, :56 and :115 follow `confirmed()`. That function ends with "Save draft revision" and then waits for `quote-revision` = "1" (:31–32). The editor sets that value only after the POST `/api/jobs/:id/quotes` returns ok (`setRevision(current.revision)` in `save()`), so it already reflects saved state.
  - :50 is a fresh second browser context with no click before it.
  - The link click at :92 and "← Scope review" at :60 and :95 don't save anything and aren't followed by a goto. "← Scope review" calls `back` → `returnToScope`, which is a GET.
  - The out-of-file helper `openReview` has no navigation after its clicks.
- **Nothing weakened.** The 46 `expect(...)` calls are byte-identical between main and head (TypeScript AST compare). No count change for `setTimeout`, `timeout:`, `retries`, `test.skip`, `test.fixme`, `.only`, `route(`, `fulfill` or `waitForTimeout` (C6/C7 respected). `playwright.config.ts` is unchanged and still has `retries: 0`.
- **Lane entry is correct.** Exactly one lane, `test-stab-3`, was appended last, with branches `["codex/sandbox/test-stab-3"]` and an allow-list exactly as the card specifies. Every other lane and key is identical to main. Migration: none.
- **Builder receipt:** its line numbers and claims match what I found. I treated it as a claim, not as evidence.

## What I executed (detached worktree `/private/tmp/opus-test-stab-3-eb6f977-0710` at eb6f977)

- `pnpm install --frozen-lockfile --ignore-scripts`: exit 0.
- `pnpm typecheck`: exit 0 (7/7 tasks).
- `GITHUB_EVENT_NAME=pull_request GITHUB_EVENT_PATH=<simulated PR event: head codex/sandbox/test-stab-3@eb6f977, base a5ed99a> pnpm lint:lanes`: exit 0, "Lane boundary passed" for lane `test-stab-3` with the 3 files above.
- The same simulated metadata with `LANE_BASE_REF=origin/main pnpm lint`: exit 0 (7/7 turbo lint tasks).
- Probe A (my own TypeScript AST scan): lists every `goto`/`reload` and the nearest click before it. Main shows exactly 2 UNGUARDED pairs; head shows 0.
- Probe B: AST comparison of `expect()` calls, main 46 vs head 46, identical.
- Probe C: forbidden-token count comparison, no changes.
- Probe D: I ran both real predicates, taken from the spec source, against fake responses. Both gave the expected answer in 8 of 8 cases:
  - accepted: exact path + POST + ok, including when a query string is added;
  - rejected: GET on the same path, a POST that isn't ok, `/acceptance/disposition`, a different job id, the other command's path, and the `/proposal` GET.
- `CI=1 playwright test --list` (apps/web): "Total: 166 tests in 47 files". That is 83 `[mobile-360]` + 83 `[desktop]`, and includes all 3 SBOX-resume tests in each project (:36, :66, :106).

## What I relied on CI for

- I relied on CI run 37595748659 at head eb6f977 for the browser run. `checks` passed: "Running 166 tests using 1 worker", then "166 passed (5.3m)", with no failed, flaky or skipped tests. The config has `retries: 0`.
- The CI `playwright test` command has no project filter. That 166 matches the 83 + 83 local listing confirms both `mobile-360` and `desktop` ran, including SBOX-resume.spec.ts:66 in both.
- The same CI log shows the lane boundary passing for `test-stab-3`.
- `secrets` passed.
- `dependency-review` is red because of the known repo-wide advisories (GHSA-jqcg-44mw-7w3h proxy-addr, plus the sharp and source-map-js advisories). PR #113 fixes this. It is not this PR's defect.

## What I did not verify

- I did not run the browser suite locally. CI was enough, and it would have taken a heavy slot.
- I did not run repeated CI runs to measure flake rate. One green run can't prove the race is gone statistically; my confidence that it's fixed comes from reading the source.
- I did not run the PostgreSQL suites. Nothing in the database layer changed.

