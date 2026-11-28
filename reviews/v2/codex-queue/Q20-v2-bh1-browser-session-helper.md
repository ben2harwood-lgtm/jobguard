# Q20 V2-BH1: one shared sign-in helper for V2 browser tests

**Tier:** T1 (test helper only, no product code, no migration). **Base:** `v2/main`. **Branch:** `codex/sandbox/v2-bh1` (or `claude/...` if a Claude thread builds it). **Planner:** Fable thread, 25 Nov 00:40 UK.

## Rules this piece must meet
Read `01-RULES.md` (rules 1 to 22) and `02-BUILD-RULES-CHECKLIST.md` first. Rule 22 is the reason for this piece.

## Why
Five pieces tonight (F6, K4, K6A, K8, K9) failed in their own browser sign-in or setup, because each one wrote sign-in afresh. K5A's and D5B-M's tests pass on the HTTPS phone origin. One helper stops the copying.

## What to build
One file, `tools/v2/test/browser-session.mjs`, lifted from the `before()` block of `tools/v2/payment-schedule.browser.test.mjs` on `codex/sandbox/v2-k5` (K5A #929 at 7560b597). Do not invent a new flow.

```js
export function v2Origin()            // reads V2_TEST_ORIGIN, asserts https:, returns it
export async function launchV2Browser() // chromium.launch({ executablePath: process.env.V2_TEST_CHROMIUM })
export async function signInOnce(browser, { jobTitle } = {})
  // -> { origin, storageState, csrfToken, jobId }
  // Signs in once through /sign-in with builder@jobguard-v2.invalid,
  // enters practice (POST /api/auth/practice, linked-practice-company.v1, enter),
  // finds jobId through GET /api/jobs?tenantId=DEMO_TENANT_ID by title
  // (default "Occupied-home kitchen splashback and hall decorating"),
  // After Verify, WAITS for the navigation to finish (waitForURL off /sign-in, then the
  // "You're signed in." heading, then waitForLoadState("networkidle")) before any page.evaluate.
  // Prefer page.request.post/get (with the x-csrf-token header) for the practice and jobs calls,
  // so nothing runs inside a page that is navigating. K5A's original block raced here
  // ("Execution context was destroyed"); do not copy that race.
  // Closes its own context, and throws a clear named error at the step that failed.
export async function v2Context(browser, storageState, width) // viewport {width, height: 900}, ignoreHTTPSErrors
```

## Tests
- **Three passes in a row, each on a fresh stack** (fresh bootstrap and seed, new browser). Paste all three outputs in the PR. One pass followed by a failure is a fail.
- A regression check for the race: run `signInOnce` 10 times in a loop on one stack with no failures.
- `tools/v2/test/browser-session.browser.test.mjs`. On the HTTPS phone origin: `signInOnce` returns a job id, and a context built from its `storageState` opens `/jobs/<id>/money` signed in at 360 and 1280 px, with one sign-in request in total.
- A unit check that `v2Origin()` refuses an unset or `http:` origin.

## Out of scope
- Do not change existing browser tests in other open PRs. Their owners switch to the helper after this merges.
- No sign-in, cookie, rate-limit or app changes.

## Done when
Lane lint passes against `origin/v2/main`. The new browser test passes on the Mac's HTTPS phone origin, with output pasted in the PR. The PR body has a "Rules met" list (rule 15).
