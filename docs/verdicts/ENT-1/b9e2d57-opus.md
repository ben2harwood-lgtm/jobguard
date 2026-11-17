VERDICT: PASS — bound to head b9e2d5766f2a30251f2769e200d7751b75d9f31c
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

**In short:** the P2 from my previous REPAIR (at `3d6e6c7`) is fixed the way it was asked for. After a loading error the page now offers only "Reload", which reads the saved organisation with the browser's existing session. "Start" appears only once the server has actually said "no session". Start tries the existing session first, and it never blindly retries when the outcome is unknown. My own probe and the new browser fault tests both show the same organisation surviving recovery, with zero new sessions where one already existed. The two small fixes folded in (P3s) are correct, no earlier test assertion was removed or weakened, and the session route is untouched. The main-merge commit changes nothing but the lane file, and that file is exactly main's lanes plus `ent-1` in the new sorted format. Migration 0054 is unchanged. CI is fully green on this exact head, including all 20 ENT-1 browser tests across both screen sizes. I found one new minor issue (P3-1 below). It does not block the merge.

## P1
None.

## P2
None. **The previous P2-1 is fixed.** Each part of the required fix, checked against the code (`apps/web/app/admin/contractor/contractor-admin.tsx`):
- **No organisation on screen after a read failure other than `UNAUTHENTICATED`** (`:22`): the status reads "The persisted organisation could not be loaded." The alert says to reload, and `loadErrorVersion` is bumped so it gets focus.
- **Start only after a real `UNAUTHENTICATED`** (`:22`, `:41`): `canStart` is set only when there is no view and the read failed with a `ContractorResponseError` (an HTTP error response with a readable body) whose code is `UNAUTHENTICATED`. A network error, an unreadable 401 body or a 503 never shows Start. While the first read is still pending, only Reload is shown.
- **`start()` uses the existing cookie first** (`:23–28`): it calls `POST /api/contractor?action=start` first. It calls `POST /api/session` only after an explicit `UNAUTHENTICATED` response, and then retries the start once.
- **A per-page-load guard (`sessionAttempted`, `:27`) stops a second session bootstrap.** Any other failure, including a lost or unreadable response, shows "Practice start was not confirmed…". Start is hidden until a fresh read returns.
- **Server side:** the server fact this depends on holds. With a well-formed cookie but no practice organisation, `resolveSession` throws `UNAUTHENTICATED` (`packages/db/src/contractor-repository.ts:34`), so Start reuses that cookie. That also means the page no longer overwrites a Jobs-demo session cookie, which it used to.
- **`apps/web/app/api/session/route.ts`:** no diff against main.
- **Red before, green after (my own run).** I ran the round-5 test files against the `3d6e6c7` implementation (untracked copies): **12 failed / 13 passed**. That is 10 new component cases plus the 2 malformed-JSON route cases. At `b9e2d57` the same files pass. The receipt's "11 failed" predates its added bootstrap-guard case, so the numbers agree.
- **Browser fault tests** (`apps/web/e2e/ENT-1.spec.ts:176`, `:197`, labelled "FAULT TEST — … transport abort", run in both `mobile-360` and `desktop`):
  - (a) Asserts Start is absent and Reload is offered, with focus and 44 px targets. Reload then shows the same tenant id at revision 1, `view()` returns the same organisation, and no session POST happens after the abort.
  - (b) The real start commits through `route.fetch()`, then its response is aborted. The test asserts "not confirmed", that Reload shows the committed tenant, that a full reload shows the same organisation, exactly 1 session POST, and that the 2 start POSTs never become 3.

## P3
1. **New, non-blocking: after a definite failure to create a session, the page cannot start again until the browser is refreshed.**
   - *Where:* `contractor-admin.tsx:27`. `sessionAttempted.current=true` is set before `POST /api/session`, whatever the result.
   - *Why it is reachable:* with no cookie, `GET /api/contractor` and the start POST both return 401 before touching the database (`contractor.application.ts:12–14`; the pool is created lazily in `synthetic-server.ts:13`). `/api/session` returns 503 *before* it sets a cookie (`session/route.ts:12`).
   - *What happens:* a first-time visitor during a database cold start clicks Start and gets `DATABASE_UNAVAILABLE`. Once the database is back, Reload offers Start again. Start then fails with a bare "UNAUTHENTICATED" and the same "Reload … before trying again" text, every time, until the user refreshes the browser. My probe F recorded this. The next page load works.
   - *Impact:* no data is lost and no session is orphaned, and the stated acceptance rule (at most one session POST per journey) is met. But the recovery advice loops.
   - *Suggested fix (a later round or ENT follow-up is fine):* when the bootstrap fails with a `ContractorResponseError` (a readable HTTP rejection, so no cookie was set), reset `sessionAttempted.current=false`. Keep the guard only for unknown outcomes (network error or unreadable body). Add one harness regression for it.
2. **Carried over: `owner` accepted on `grant.create`** (`packages/core/src/contractor.ts:67`, `0054_contractor_organisation.sql:243`). This is not an escalation. Left for ENT-10, as the order says.

**Earlier P3s, now fixed:**
- **Malformed JSON:** `apps/web/app/api/contractor/route.ts:18` now returns `422 {version:"contractor-error.v1",code:"INVALID_COMMAND",recoverable:false}`. It does this after the Origin gate and before the application is built or the principal is read. New route tests cover both `""` and `?action=start` and assert no service call.
- **Focus on a repeated error:** the invalid-rules catch (`contractor-admin.tsx:49`) and `start()`'s catch (`:30`) now bump `loadErrorVersion`. Each has a two-rejection regression test asserting focus is called once per rejection.

## Nothing else changed or weakened
- **Files changed in round 5:** `937145e` touches exactly 6 files: the component, its test, the contractor route, the route test, `ENT-1.spec.ts` and the receipt. No SQL, API contract, OpenAPI or lane change.
- **Assertion check (my own script):** I extracted every `expect(...)` call with its matcher from the three test files at `3d6e6c7` and `b9e2d57` and compared them as multisets.
  - Removed assertions: **0**. Counts went 137→175 (spec), 29→60 (component) and 11→15 (route).
  - The only setup changes are that loaded-view unit tests now mount and read instead of clicking Start before any read, and that the delayed-401 browser test now asserts Start is absent while that read is held, then starts. Both follow directly from the new gate, and every earlier assertion is still there.
- **Timeouts and skips:** none added or lengthened. There is no `.skip`, `.only`, `fixme` or timer in the diff, and Playwright `retries: 0` is unchanged.

## Merge commit `b9e2d57` (parents `937145e`, `2f986a7`)
- **Changed-file set:** identical before and after (35 files). `git diff f9de3ad 937145e` and `git diff 2f986a7 b9e2d57`, both excluding the lane file, are byte-identical: SHA-256 `532985d1b55bfd43b07ee1fba96379c193663a995e5a2e028bcb2e138351b7b4`, 276,888 bytes.
- **Blobs:** every PR file has the same blob at `937145e` and `b9e2d57`. Every file main changed since `f9de3ad` (the LANE-FORMAT-1 verdict docs) is main's blob.
- **Lane file:** parsed, 87 lanes = main's 86 plus `ent-1`. No main lane was removed or changed, `version` is still 2, the keys are sorted, and the `ent-1` entry is byte-equal to the builder's. Rebuilding the file text from main's lanes plus `ent-1` in the LANE-FORMAT-1 format (which reproduces main byte for byte) gives exactly the head file.
- **Lane lint:** passed locally with a simulated `pull_request` event (base `2f986a7`, head `b9e2d57`, ref `codex/sandbox/ent-1`), and in CI.

## Migration
- `0054_contractor_organisation.sql` has the same blob (`7b9ce36…`) as at `3d6e6c7`. It is still the PR's only migration and the next number above main's `0053`; main has added no migration. `migrate.ts:50` lists it last. No renumber is needed.
- ENT-1 must merge before SBOX-SESSION-1 (0094), as planned. Later migration PRs must still bump the hard-coded count of 45 in `UIWIRE-12.integration.test.ts` and `demo-bootstrap.integration.test.ts`. Those checks fail loudly if missed, so the renumber stays safe.

## What I executed
Worktree `/private/tmp/opus-ent-1-b9e2d57-0710`, detached at `b9e2d57`. Node 24.17.0, pnpm 10.28.1, 50 GB free.

| Command | Exit | Result |
|---|---:|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | 0 | Installed |
| `pnpm typecheck --force` | 0 | 7/7 tasks, 0 cached |
| `pnpm lint --force` (simulated PR event) | 0 | "Lane boundary passed … lane ent-1 … base 2f986a7 … head b9e2d57"; 7/7 tasks |
| `node --test tools/*.test.mjs` | 0 | 42/42, 0 skipped |
| `pnpm --filter @jobguard/web test` (first try) | 1 | Environment only: `@jobguard/core` had no built `dist` yet, so 5 files could not import it |
| `pnpm build --force`, then the web tests again | 0 / 0 | Build 7/7; web 11 files / 100 tests |
| `pnpm openapi:check` | 0 | Committed spec matches |
| `playwright test --list` (both projects) | 0 | 186 total; ENT-1 has 20 (10 per project, including both FAULT TESTs) |
| Red-before: round-5 tests against the `3d6e6c7` implementation | 1 | 12 failed / 13 passed, as expected |
| Assertion multiset script | 0 | 0 earlier assertions missing |
| **My probe** `apps/web/opus-probe-b9e2d57/session-recovery-b9e2d57.probe.test.tsx` (untracked) | 0 | 6/6; details below |

**The probe** drives the real component handlers against a server model built from `session/route.ts:11–15`, `contractor/route.ts:7–22` and `contractor.application.ts:11–36`. The model has a cookie jar, a practice organisation per session, idempotent start and 401-before-database. Results:
- (A) The old repro, made harsher: the first GET is aborted, then one Reload also gets a 503. Only Reload is offered throughout, and the next Reload shows the same tenant with the cookie unchanged. 0 session POSTs, 1 tenant.
- (B) An existing cookie with no practice (for example a Jobs-demo session): Start reuses it, with 0 session POSTs and the cookie unchanged.
- (C) The session POST commits but its response is lost: Reload, then Start reuses the new cookie. 1 session POST, 1 tenant.
- (D) The second start commits but its response is lost: Reload shows that tenant, and a remount reads the same one. 1 session POST, 2 start POSTs, 1 tenant.
- (E) An existing cookie and a definite 503 on start: no session POST, and Reload then Start succeeds with the same cookie.
- (F) The P3-1 observation above.

**Relied on CI:** run 37666392510 (`pull_request`, headSha `b9e2d5766f2a30251f2769e200d7751b75d9f31c`, conclusion success). `checks` passed in 10m58s:
- lint, including the lane boundary against base `2f986a7`; typecheck; build
- tools 42/42; core 52 files / 1,421 tests, including `extra-origin.test.ts` 6/6 with no timeout; api 17 / 114; web 11 / 100, including `contractor-admin.test.tsx` 18 and `route.test.ts` 7
- db 40 files / 215 tests on real PostgreSQL, including `contractor.integration.test.ts` 17/17
- production-build Playwright: **186 passed, 0 failed, retries 0**. That matches my local two-project list of 186, which includes all 20 ENT-1 cases. The CI dot reporter does not print test names, so I matched by count.

`dependency-review` and `secrets` passed too.

**Not verified by me:** I ran no PostgreSQL or browser suites locally; I relied on CI for both. The P3-1 loop is shown only in my modelled-server probe, not in a real browser. The parts of the PR outside round 5 are byte-identical to what the `3d6e6c7` review checked, so I did not re-review them line by line here. I made no edits, commits, pushes or merges. The probe file is left untracked in my worktree, and the red-before copies are in my scratchpad, not the repository.

