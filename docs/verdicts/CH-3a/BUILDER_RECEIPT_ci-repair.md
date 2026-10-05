# CH-3a CI repair — builder receipt

- **Task / PR:** CH-3a (structured customer, paying party and site), PR #98, branch `codex/sandbox/ch-3a`.
- **Repair builder:** Claude Sonnet 5.5 (Claude Code), 3 October 2026. Codex gpt-6.1-sol built the first version at `38886a7`; its sandbox could not run PostgreSQL or a browser.
- **Failing run repaired:** GitHub CI run 37151969913 on `38886a7` (`pnpm test` failed: 27 DB test files, 9 failing tests; `pnpm build` and the browser suite never ran).
- **Code head tested locally:** `e9cbc92` (all rows in the commands table). `54caa7b` then merges `origin/main` at `b039abf` (PR #96, decision-record ids) into the branch, because PR #98 had become CONFLICTING on the one-line `config/agent-lane-assignments.json` and GitHub does not run `pull_request` CI on a conflicting PR. The merge keeps main's registry and re-applies this branch's `ch-3a` lane entry unchanged; no history was rewritten or force-pushed. At the merged head I re-ran `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `lint:lanes`, `openapi:check`, `pnpm build` and `pnpm test --force` (all exit 0, same counts). I did **not** re-run `test:db`, `test:migrations` or the browser suite after the merge: main's delta is two config/test lines in `packages/config` and `tools`, decision-record docs, and the lane registry, none of which those suites read. GitHub CI covers them. The receipt itself is a docs-only commit.
- **Status:** **not independently verified, not accepted.** This is a builder receipt. It is not a checker verdict, not technical acceptance, and not a merge recommendation. GitHub CI on the pushed head is the pinned-browser proof.

## Root causes (all in this task's code or its test harness)

| # | Symptom in CI | Root cause | Where |
|---|---|---|---|
| 1 | 27 DB test files fail: "Unicode normalization can only be performed if server encoding is UTF8" on every `site_revision` insert (also seen as `job not found` / `scope progress not found` cascades in `job.integration`) | Migration 0051 computes the site match key with NFKC `normalize()`, which PostgreSQL allows only in a UTF8 database. `embedded-postgres` starts `initdb` with only `LC_MESSAGES` in the environment, so every test cluster was created SQL_ASCII. Production (Neon, standard images) is UTF8. | test harness (`initdbFlags`), 26 DB test files, `synthetic-restore.mjs`, `apps/web/e2e/global-setup.ts` |
| 2 | Every CH-3a command fails: "inconsistent types deduced for parameter $1" | `JobPartiesRepository.command` used `$1` as the uuid `command_id` and as `$1::text` for the varchar `semantic_key` in one INSERT. | `packages/db/src/job-parties-repository.ts` (real product bug) |
| 3 | UIWIRE-12: expected 42 migrations, got 43 | Migration-count assertions did not count 0051. | `UIWIRE-12.integration.test.ts` (`demo-bootstrap` was already 43) |
| 4 | CH-3a fresh-install test: "empty password returned by client" | The test copied `admin.options` into a new `Pool`; `pg` hides the password from that object, so the second pool had none. | `job-parties.integration.test.ts` |
| 5 | CH-3a post-live correction test: `JOB_PARTIES_REQUIRED` although the job was bound | The test did a raw superuser `UPDATE app.job SET status='live'` with no tenant context. The live guard is a `SECURITY DEFINER` function owned by `jobguard_migration` and reads `job_party_current` through FORCE RLS, so with no `app.tenant_id` it sees no binding. Every application write has that context. | `job-parties.integration.test.ts` |
| 6 | (Found only by running the browser suite, which CI never reached.) Saving customer and site after quoting fails with `REVISION_CONFLICT` ("This job changed") | The Customer and site panel loaded the job revision once at mount and sent it as `expectedJobRevision`. Confirming scope advances the job revision without telling the panel, so the bind used a stale revision. | `apps/web/app/ui/job-parties.tsx` (real product bug) |
| 7 | (Browser suite) CH-3a spec: focused "Save customer and site" button read `outline-style: none` | The spec moved focus with a script call after mouse use. Chromium then reports `:focus` true and `:focus-visible` false (probed in the app), so the assertion read the no-keyboard state. The product rule `button:focus-visible { outline: 3px solid }` is unchanged and applies under keyboard focus. | `apps/web/e2e/CH-3a.spec.ts` (test technique) |

## Commits (on top of `38886a7`)

| SHA | Subject |
|---|---|
| `3807306` | test(db): start embedded Postgres clusters as UTF8 so site match keys can run (root cause 1; also registers `sandbox.integration.test.ts` and `apps/web/e2e/global-setup.ts` in the ch-3a lane and documents the UTF8 requirement in `packages/db/MIGRATIONS.md`) |
| `2bf685a` | fix(db): give the job-parties command receipt claim consistent parameter types (2) |
| `44da45a` | test(db): correct CH-3a migration counts and two test-harness defects (3, 4, 5) |
| `8da897d` | fix(web): bind customer and site against the job's current revision (6) |
| `e9cbc92` | test(web): reach the CH-3a save button by keyboard before asserting its focus ring (7) |

## Commands run (worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ch-3a`, Node 24.17.0, pnpm 10.28.1)

Every database or browser command ran inside `heavy-slot ch-3a`. Counts are from the final code head `e9cbc92` unless stated.

| Command | Exit | Result |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile up to date |
| `pnpm typecheck` | 0 | 7 of 7 projects |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | "Lane boundary passed", lane `ch-3a`, merge-base `3e0764b` |
| `pnpm build` | 0 | 7 of 7 (Nest, Next production build) |
| `pnpm test --force` (turbo cache bypassed) | 0 | tools 39/39; core 388 (70 files); storage 4; config 2; ai 72; api 76 (11 files); web 56 (7 files); db 162 (35 files); no unhandled errors |
| `pnpm test:db` | 0 | 35 files, 162 tests |
| `pnpm test:migrations` | 0 | 2 files, 11 tests (tenancy, demo-bootstrap) |
| `pnpm openapi:check` | 0 | generated contract matches `apps/api/openapi.json` |
| `CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop CH-3a.spec.ts switch-live.spec.ts m1-15-complete-journey.spec.ts review-confirm.spec.ts capture.spec.ts` (local browser, see below) | 0 | 18 passed (CH-3a's two tests in both projects, plus the four existing specs that use the changed `openReview` helper) |
| `CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop` (the whole suite, as CI runs it) | 0 | 166 passed in 4.0 minutes, 1 worker |

Earlier, failing local runs that led to the fixes: `pnpm test:db` after root cause 1 alone showed 9 failing tests (root causes 2 and 4) plus two cluster start-up timeouts under load; the next run, after fixing 2 and 4, showed root cause 5; the first browser run showed 10 failures (root causes 6 and 7, and the stale build described below). The first browser run used a Next build made before the repository fix, so its `DATABASE_UNAVAILABLE` alerts were that stale build, not a product defect; it was rebuilt and re-run.

## Environment notes

- **Browser:** Playwright 1.55.1 needs `chromium_headless_shell-1193`, which is not installed on this Mac (`chromium-1193` is a partial install) and a download was not authorised. The browser runs used an **uncommitted** local config (outside the repository) that imports `apps/web/playwright.config.ts` unchanged and only sets `launchOptions.executablePath` to the installed `chromium_headless_shell-1234` (Chrome for Testing 151). No test, timeout, retry or project setting differs. This is not the pinned browser; GitHub CI is.
- **embedded-postgres on macOS:** pnpm skipped the `@embedded-postgres/darwin-arm64` postinstall, so the dylib symlinks were missing and `initdb` was killed ("Postgres init script exited with code null"). Fixed by running the package's own `scripts/hydrate-symlinks.js` inside `node_modules`. Environment only; nothing in the repository changed for this.
- **Load flake, not a code failure:** one `pnpm test` run at machine load average of about 50 reported three `57P01 terminating connection due to administrator command` unhandled errors from `variation.integration.test.ts` teardown, and an earlier `test:db`/`test:migrations` run timed out the `outbox` and `tenancy` cluster start-up hooks. Neither file's code is touched by this branch; re-runs at lower load passed with identical counts. No timeout, retry or wait was changed. CI runners are not loaded this way.
- **Shared scratch files:** my first read of the CI log was written to a scratch file named `ci-failed.log` that may have replaced another session's file of the same name in the shared scratchpad; it held the same CI log content.

## What was not run, and why

- The pinned Playwright browser (see above): CI is the proof.
- No dependency or secret scanners, `pnpm eval` (no AI change), `pnpm test:restore` as a separate command (its test, `restore-rehearsal.integration.test.ts`, ran inside `test:db` and passed), and no deploy or Vercel build.
- The checker verdict and technical acceptance are separate steps and have not happened.

## Changes to existing tests, and why (none weakened)

- **Existing specs:** none edited by me. Four existing e2e specs (`switch-live`, `m1-15-complete-journey`, `review-confirm`, `capture`) exercise Codex's change to the shared `openReview` helper; all pass.
- **Harness change across existing DB tests:** one added initdb flag, `--encoding=UTF8`, in 26 test files plus the restore tool and the e2e global setup (root cause 1). No assertion, skip, timeout or retry changed.
- **`UIWIRE-12`:** counts 42 to 43 and the range check now ends at `0051_job_parties.sql` (this branch's migration on top of main). The integrator re-adjusts migration counts at merge time.
- **CH-3a's own tests:** password passed explicitly (4); raw live write now runs in a tenant-context transaction (5), which also makes the no-binding refusal prove the missing binding rather than an RLS-blind read; the spec reaches the button by keyboard before the unchanged outline assertion (7).

## Things for the checker and integrator to look at

1. `job-parties.tsx` now re-reads the workspace right before saving and uses that revision. The database still compares `expectedJobRevision`, so two writers racing on one revision still get one success and one typed conflict (covered by the CH-3a API-level tests). A tab that was open on older parties will now overwrite rather than conflict if the job revision is already current; history is append-only and post-live corrections still need a reason.
2. After this merges, any new embedded-Postgres test cluster that creates jobs or sites must also pass `--encoding=UTF8`, because migration 0051 needs a UTF8 database. `packages/db/MIGRATIONS.md` says so.
3. Migration-count assertions (`UIWIRE-12`, `demo-bootstrap`) and any "applies 0000..00NN" text count this branch only.
4. Raw SQL writes that move a job to `live` as a superuser need `app.tenant_id` set in the same transaction; application code already does.

---

# Round 2 — repairs after the Opus and Sol checks on `b0f88fb`

- **Repair builder:** Claude Sonnet 5.5, 4 October 2026. Same status: **not independently verified, not accepted.** This section is a builder receipt, not a verdict.
- **Inputs:** Claude Opus (cloud) `VERDICT: REPAIR` in the PR #98 comment, and GPT-6.1 Sol high `REPAIR` at `/Users/benharwood/.local/share/full-steam/jg-runs/ch-3a-solcheck-20261003T235018.md`, both bound to `b0f88fb`.
- **Code head tested:** `b43a999`. `origin/main` had not moved since `b039abf` (PR #98 mergeable: CLEAN), so no merge was needed this round.

## Finding status

| # | Source and priority | Finding | Status | Where |
|---|---|---|---|---|
| 1 | Opus blocking (medium) and Sol P1 | The pre-save re-read turned a real concurrent edit into a silent overwrite (binding or customer revision) | **Fixed** | `0e28644`; tests in `b43a999` |
| 2 | Opus low | A job that went live after load was saved as a post-live correction without the reason field; the user saw a raw code | **Fixed** | `0e28644`; test in `b43a999` |
| 3 | Sol P2 | The adoption overload (`SECURITY DEFINER`, granted to `jobguard_runtime`) checked no owner membership, command receipt or approved authorization and wrote no audit event | **Fixed** | `f0e7c75` |
| 4 | Sol P2 | The immutable quote preview displayed the mutable current customer name beside the frozen document's hash; a new binding did not force a new preview | **Fixed** | `ceb1edb`; test in `b43a999` |
| 5 | Opus merge-order note | #97 (0050), #98 (0051) and #100 (0054) each set the UIWIRE-12 count to 43 | **Noted for the integrator**, nothing to change on this branch | see "For the integrator" |

**OPEN FOR BEN:** none. Every finding was a technical repair inside the existing contract. No live provider, production mode, real data, spending, decision approval or deployment is touched.

## What changed

1. **Stale edits (findings 1 and 2).** `job-parties.tsx` keeps what the draft was edited against. On save it re-reads the workspace and refreshes only the expected job revision when nothing the draft depends on has changed (unrelated scope or quote progress). It refuses, writing nothing, when the current binding differs, the job's live or not-live phase differs, or a customer, payer or site revision the draft uses differs. The refusal shows the typed conflict message, reloads the draft from the saved details (so a retry cannot write stale text over someone else's) and lets the user choose again. A server `REVISION_CONFLICT` from two writers on one revision takes the same reload path. A job that went live is explained in words, and `CORRECTION_REASON_REQUIRED` is a sentence. To reload a draft the workspace response gained an additive `currentIds` (binding, customer, payer, site ids). The database's expected-revision check is unchanged.
2. **Adoption routine (finding 3).** Migration 0051's overload is now 18 arguments (adds command id and authorization id) and, inside the routine, requires: a current owner membership for the actor (not revoked, not expired); a `processing` `job.adopt_in_flight` command receipt for that actor; and an unexpired, unrevoked, approved authorization bound to the same job, actor, content hash, amount, currency, policy version and zero aggregate revision. Failures are SQLSTATE 42501 (`FORBIDDEN` or `AUTHORIZATION_INVALID`). The command dispatcher (`packages/db/src/commands.ts`, added to the ch-3a lane for this one line) now hands the effective decision, resolution and authorization ids to the mutation, so command, authorization, result and audit events still commit or roll back together. Migration 0051 is unmerged, so it was edited in place.
3. **Quote preview (finding 4).** The preview keeps the returned document's frozen customer and binding, shows them, and marks itself out of date when the job's binding changes; send and download then ask for a new preview and approval. The server also refuses to send a document whose frozen binding is no longer current (`QUOTE_CHANGED`, 409). Earlier artifacts keep their bytes and hashes (the spec compares the old artifact's SHA-256 before and after).

## Tests first

Written before any fix and run against the `b0f88fb` code and build (red), then green after the fixes:

| Suite | Red at `b0f88fb` | Green at `b43a999` |
|---|---|---|
| `job-parties.integration.test.ts` (14 tests) | 3 failed: direct runtime SQL with no authority, each-missing-authority cases, and the authorized direct call (the 18-argument routine did not exist). The dispatcher-success and rollback tests passed, as they should. | 14 of 14 |
| `CH-3a.spec.ts`, five new tests × `mobile-360` and `desktop` | all 10 new tests failed for the intended reasons (no conflict shown, no `currentIds`, name changed under a frozen hash); the 4 earlier CH-3a/regression tests passed | 14 of 14 |

New DB tests: adoption through the dispatcher with its audit events; atomic rollback of command, authorization and job when adoption fails inside the boundary; runtime SQL denial for absent authorization, revoked actor, expired actor, revoked authorization, expired authorization, spent receipt, authorization for another job, different amount, different policy, different content, and a command paired with another authorization; and the authorized direct call succeeding.

New browser tests (both projects):
- a save from a panel another writer has already superseded, started after that writer committed, is refused and writes nothing (customers, sites, binding and job revision unchanged; the panel reloads to the winner's details and a second save then succeeds);
- a save against a customer another writer revised (binding unchanged) is refused, with no third revision written;
- **two writers clicking save on one revision give one success, one visible conflict, exactly one new binding (job revision plus one) and only `REVISION_CONFLICT` 409s through the UI.** Repeated six times in each project (12 of 12) to check it is not timing-dependent;
- a panel opened before the job went live is told so in words, nothing is written, the reason field appears, and a save with a reason then succeeds;
- a quote preview keeps its frozen customer, a corrected binding marks it out of date, send is refused in the browser and by the server (409 `QUOTE_CHANGED`), the old artifact bytes and hash are unchanged, a new preview has a new document and hash, and sending it succeeds.

The original case (save after scope confirmation or a quote save) stays green: the two CH-3a tests from round 1 and the four existing specs that use `openReview` all pass.

## Commits

| SHA | Subject |
|---|---|
| `f0e7c75` | fix(db): make the adoption routine a controlled write |
| `0e28644` | fix(web): refuse a stale party edit instead of overwriting another writer |
| `ceb1edb` | fix(web): show the quote preview's frozen customer and require a new preview after a binding change |
| `b43a999` | test(web): CH-3a round-2 browser tests for stale panels, races and frozen previews |

## Commands run at `b43a999` (Node 24.17.0, pnpm 10.28.1; database and browser commands inside `heavy-slot ch-3a`)

| Command | Exit | Result |
|---|---:|---|
| `pnpm typecheck --force` | 0 | 7 of 7 |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | passed (includes `packages/db/src/commands.ts`) |
| `pnpm openapi:check` | 0 | matches `apps/api/openapi.json` (the response schema is not described there, so `currentIds` changes nothing) |
| `pnpm build` | 0 | 7 of 7 |
| `pnpm test --force` | 0 | tools 39; core 388; storage 4; config 2; ai 72; api 76; web 56; db 167 (35 files) |
| `pnpm test:db` | 0 | 35 files, 167 tests; run three times in all, see the note below |
| `pnpm test:migrations` | 0 | 2 files, 11 tests |
| `CI=1 … test:e2e` `CH-3a.spec.ts -g "two writers on one revision" --repeat-each=6`, both projects | 0 | 12 passed |
| `CI=1 … test:e2e`, whole suite, both projects, local browser | 0 | 176 passed, twice |

**Flakes, stated plainly (no assertion, wait, retry or timeout was changed):**
- `pnpm test:db` exited 1 once in the final script because `practice-finding-scope.integration.test.ts` reported "Connection terminated unexpectedly" on its first `migrate` query, as the embedded server died at start-up on this busy shared Mac. Two re-runs of `pnpm test:db` passed 35 of 35 files and 167 of 167 tests.
- `UIWIRE-1.spec.ts` (unchanged, not in this lane) failed one test in each of two earlier full runs on this branch, and in 2 of 8 isolated repeats, always after its helper's hard navigation to the job page: the page was reloaded under the test, so the clicks were lost. A different test failed each time (desktop "omitted line", mobile-360 "split and merge"). The same spec passed 96 of 96 repeats on `b0f88fb` and 96 of 96 on `b43a999` in a quieter period, and passed in both of two later full runs at `b43a999`. I could not reproduce it on demand and have not shown that the round-2 changes affect its odds; the failing traces were overwritten by later runs. If it recurs in CI, treat it as a hydration race in that spec's navigation and report it separately.

## Environment

- **Shared memory exhausted.** The first red run could not start: `initdb` failed with "could not create shared memory segment: No space left on device". macOS allows 32 SysV segment ids (`kern.sysv.shmmni`) and leaked Postgres segments from killed test clusters (0 attached) had used them all. I removed leaked segments with `ipcrm -m`. My first clean-up checked the wrong `ipcs` column, so it removed segments with no attached process without confirming their creators were dead; no embedded Postgres process was running at that moment, so no live segment was lost. Later clean-ups checked that the creator pid was dead. Other sessions on this Mac leak segments again within minutes, so this can recur.
- **Browser:** same uncommitted local config as round 1 (`chromium_headless_shell-1234`, nothing else changed); GitHub CI uses the pinned browser.
- I checked out `b0f88fb` (detached) in this worktree to compare flake rates, then returned to the branch; nothing was reset or deleted.

## Notes for the checker

1. The conflict rule is stricter than the minimum: any change since load to a customer the draft selects or pays with, or to a reused site, refuses a plain bind as well as an edit, so a binding never silently points at an older revision than the user saw.
2. `commands.ts` now passes `decisionId`, `resolutionId` and `authorizationId` into every mutation. Handlers that already read `command.authorizationId` get the same value as before; all 167 DB tests and 388 core tests pass.
3. Documents previewed before CH-3a have no frozen binding, so they cannot be sent until previewed again. Sent documents are unaffected.
4. Raw `INVALID_PARTIES` is still shown as the code; the existing test asserts it.

## For the integrator

#97 (0050), #98 (0051) and #100 (0054) each set the UIWIRE-12 migration count to 43 and #98's range check ends at `0051_job_parties.sql`. After the first of them merges the others need the count bumped (and the range updated) when they merge main. Any new embedded-Postgres cluster that creates jobs or sites must pass `--encoding=UTF8` (see `packages/db/MIGRATIONS.md`).

---

# Round 3 — repairs after the Sol check on `3576f9f`

- **Repair builder:** Claude Sonnet 5.5, 4 October 2026. Same status: **not independently verified, not accepted.** A builder receipt, not a verdict.
- **Input:** GPT-6.1 Sol high `REPAIR` at `/Users/benharwood/.local/share/full-steam/jg-runs/ch-3a-solcheck-20261004T042250.md`.
- **Code head tested:** `f239ae7` (the receipt commit is docs-only on top). `origin/main` moved to `29826ee` (M4-3-S-R, migration 0042) during the round, so PR #98 became CONFLICTING; I merged it in (non-force) and resolved six conflicts (below).

## Finding status

| # | Priority | Finding | Status | Commit |
|---|---|---|---|---|
| 1 | P1 | The lifecycle-event refresh advanced the view the save-time check compared against while the draft kept old text, so a stale customer overwrite got through | **Fixed** | `c3e213d` |
| 2 | P2 | The stale-binding refusal for quote send ran in a transaction that ended before dispatch; the send mutation did not recheck the binding | **Fixed** | `26422f9` |
| 3 | P2 | Adoption: any processing receipt for tenant and actor satisfied the checks (receipt not bound to the job or authorization), and a direct call committed without completing the receipt or appending audit | **Fixed** | `2a4e7b9` |

OPEN FOR BEN: none. All three are technical repairs inside the existing contract.

## What changed

1. **Baseline (P1).** `job-parties.tsx` now keeps a `baseline`: what the draft was edited against. It is set at first load, after a save, after a stale draft is reloaded, and when the user picks a customer, payer or site (those copy the values being shown, so the baseline records exactly those revisions). Background refreshes update only what is displayed, never the baseline. A refresh that finds the binding or a referenced customer, payer or site revision changed reloads the draft at once with the conflict message; a save is checked against the same baseline before anything is written. A phase change (job went live) alone is not advanced by a refresh either, so the first save is refused and explained.
2. **Quote send (P2).** `IssueQuoteMutation` takes the job lock first (`require_current_job_parties`, `FOR SHARE`, which `bind_job_parties`' `FOR UPDATE` waits on) and compares the binding the document froze with the current one before creating any send effect. A mismatch raises `QUOTE_CHANGED`; the dispatcher transaction rolls back the receipt, decision and authorization with it. The earlier pre-check stays as a fast refusal.
3. **Adoption (P2).** The receipt must be the adoption's own (`semantic_key = import:<job>`). A deferred constraint trigger on `app.imported_job_baseline` makes the record mandatory at commit: a succeeded adoption receipt for that job and actor; a `command.succeeded` audit event naming that receipt and an authorization bound to the same job, actor, baseline hash, amount and terms; and the adoption's own `job.imported_baseline_attested` event. Otherwise the whole transaction fails with `ADOPTION_RECORD_REQUIRED` (SQLSTATE 23514). The dispatcher path already did all of this before commit and is unchanged. I did not reimplement the audit hash chain in SQL; a direct caller must use the same audit append the dispatcher uses.

## Tests first (red at `3576f9f`, green after)

| Test | Red at `3576f9f` |
|---|---|
| Browser (both projects): another writer revises the customer, the app's own `job-lifecycle-changed` event fires, the stale draft must be refused and reloaded and no new customer revision written | failed in both projects: no conflict shown, the stale draft stayed |
| PostgreSQL race (`quote.integration.test.ts`): one session holds `bind_job_parties`' job lock, the send starts in another and is waited on until it is blocked on a lock, then the binding change commits: the send must fail with `QUOTE_CHANGED` and leave no quote-send, outbox, receipt or decision row; a plain later send of that document is refused the same way | the send resolved |
| Runtime SQL (`job-parties.integration.test.ts`): a receipt for job A with job B's valid authorization in a call targeting B (and the reverse); direct executions with no audit and no receipt completion, audit without completion, completion without audit, audit naming a different authorization (all must fail at commit and leave no job); a direct execution that completes everything commits, with the receipt succeeded and both audit events present | the pairing resolved and the no-record executions committed |

The two-writers-on-one-revision test and the new refresh test were repeated 6 times in each project: 24 of 24 passed.

## Merge with main

`29826ee` added migration 0042 and two new evidence-pack suites. Conflicts resolved: `config/agent-lane-assignments.json` (main's registry plus this branch's `ch-3a` lane), `packages/db/src/migrate.ts` (0042 then 0051), `apps/api/src/workspace/application.ts` (main's evidence-pack methods plus this branch's `parties`), `packages/db/MIGRATIONS.md` (both sections), and the migration counts in `UIWIRE-12` and `demo-bootstrap`, now **44** (this branch on top of current main; the range check ends at `0051_job_parties.sql`). Main's two new evidence-pack suites needed what every earlier suite got: `installLegacySyntheticPartyFixtures` after `migrate` and `--encoding=UTF8`; both files are registered in the lane. No assertion, skip, timeout or retry was changed.

## Commands at `f239ae7` (database and browser commands inside `heavy-slot ch-3a`)

| Command | Exit | Result |
|---|---:|---|
| `pnpm typecheck --force` | 0 | 7 of 7 |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | passed |
| `pnpm openapi:check` | 0 | matches |
| `pnpm build` | 0 | 7 of 7 |
| `pnpm test --force` | 0 | tools 39; core 436; storage 4; config 2; ai 72; api 101; web 56; db 194 (39 files) |
| `pnpm test:db` | 0 | 39 files, 194 tests |
| `pnpm test:migrations` | 0 | 11 tests |
| Whole e2e suite, both projects, local browser, `CI=1` | 0 | 180 passed |

**Flake, stated plainly.** Twice earlier this round `pnpm test:db` exited 1 with `practice-finding-scope.integration.test.ts` reporting "Connection terminated unexpectedly" on its first `migrate` query, both times in a script where `test:db` started straight after `pnpm test --force` had finished the same suite on this busy shared Mac. Reruns passed. The final runs above ran `test:db` first in a fresh slot. No timeout, wait or retry was added. The UIWIRE-1 flake noted in round 2 did not recur in the four full browser runs this round (176, 178, 180, 180 passed).

## Environment

Leaked SysV shared-memory segments again exhausted macOS's 32 segment ids between runs; before each heavy run I removed only segments with nothing attached and a dead creator pid (checked against the creator column this time). Browser runs again used the uncommitted local `chromium_headless_shell-1234` config; GitHub CI uses the pinned browser.

## Notes for the checker

1. The adoption check at commit is a deferred constraint trigger: it can be tightened to immediate by a caller, never skipped.
2. After a refresh-triggered reload the draft shows the other writer's details and the conflict message; a plain save then binds to those revisions without writing a customer revision.
3. Migration count assertions are now 44 for this branch on top of `29826ee`; the integrator re-adjusts if other numbered migrations merge first.

## Round 3 addendum: second merge of main

After the first round-3 push (CI green on `b99d9f9`), `origin/main` moved again to `b717020` (M4-2-S-R, #102) and PR #98 became CONFLICTING, so I merged it in (`165b36b`, non-force). Two conflicts: the lane registry (main's plus this branch's `ch-3a` lane) and `recovery-cases.integration.test.ts`, which main reformatted and extended; I took main's version and re-applied only this branch's three earlier changes to it (`installLegacySyntheticPartyFixtures` after `migrate`, its import, and `--encoding=UTF8`). No assertion, skip, timeout or retry changed.

Re-run at `165b36b` (database and browser commands inside `heavy-slot ch-3a`): `pnpm typecheck --force` 0 (7 of 7); `LANE_BASE_REF=origin/main pnpm lint` 0; `lint:lanes` 0; `pnpm openapi:check` 0; `pnpm build` 0; `pnpm test:db` 0 (39 files, 202 tests); `pnpm test:migrations` 0 (11 tests); `pnpm test --force` 0 (tools 39; core 440; storage 4; config 2; ai 72; api 109; web 63; db 202); whole e2e suite, both projects, local browser, 0 (182 passed). The counts in the table above are for `f239ae7`, before this merge.

---

# Round 4 — repair after the Sol check on `3b0aedd`

- **Repair builder:** Claude Sonnet 5.5, 4 October 2026. Same status: **not independently verified, not accepted.** A builder receipt, not a verdict.
- **Input:** GPT-6.1 Sol high `REPAIR` at `/Users/benharwood/.local/share/full-steam/jg-runs/ch-3a-solcheck-20261004T085533.md`: one P2, no P1 or P3. Ben's C7 substitute applies as before (nothing to change in code).
- **Code head tested:** `b959ce9`. `origin/main` had not moved (still `b717020`), so no merge this round.

## Finding status

| # | Priority | Finding | Status | Commit |
|---|---|---|---|---|
| 1 | P2 | A binding correction could commit without its audit event or a completed command receipt: `bind_job_parties` accepted a processing receipt, changed the binding and job revision and returned, and the round-3 quote race fixture did exactly that | **Fixed** | `c0cb581` |

OPEN FOR BEN: none.

## What changed

- `app.job_party_binding` gains `command_id`, the exact `job.parties` receipt that authorized the change, with `UNIQUE(tenant_id, command_id)`: one receipt, one binding effect. `bind_job_parties` stores it.
- A deferred constraint trigger on `app.job_party_binding` (for bindings that carry a command) requires, at commit: a succeeded `job.parties` receipt that is that command and names this binding as its result, and an audit event for this job naming that command and this binding (`job.parties.bind`, or `job.parties.correct` when a correction reason was given). Otherwise the whole transaction fails (`BINDING_RECORD_REQUIRED`, SQLSTATE 23514).
- The repository path already claims the receipt, calls the routine, completes the receipt (result `id` = binding id) and appends the audit event before commit, so it is unchanged. Generated backfill and adoption bindings carry no command and stay under their own rules. Runtime has no INSERT on the binding or current-pointer tables, so only these routines write them.
- The quote race fixture now completes its receipt and appends its audit event in the same transaction, as the repository does.

## Tests first (red at `3b0aedd`, green after)

Runtime-role PostgreSQL tests in `job-parties.integration.test.ts`: eight direct-call cases that must not commit and must leave no binding and the job revision unchanged (no completion and no audit; audit but receipt left processing; completion but no audit; audit naming a different binding; a different command; a different job; receipt result naming a different binding; a wrong event type); the full protocol committing with the binding linked to that exact command and made current; one receipt used for two binding effects in one transaction (unique violation, nothing committed); and a used receipt claimed again for another binding (refused, one binding remains). Red: the direct calls resolved and committed, and the linked-command assertion had no column to read. Green after: 3 of 3 new tests, and the 14 earlier CH-3a DB tests, the quote race test and the adoption tests still pass.

## Commands at `b959ce9` (database and browser commands inside `heavy-slot ch-3a`)

| Command | Exit | Result |
|---|---:|---|
| `pnpm typecheck --force` | 0 | 7 of 7 |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | passed |
| `pnpm openapi:check` | 0 | matches |
| `pnpm build` | 0 | 7 of 7 |
| `pnpm test:db` | 0 | 39 files, 205 tests |
| `pnpm test:migrations` | 0 | 11 tests |
| `pnpm test --force` | 0 | tools 39; core 440; storage 4; config 2; ai 72; api 109; web 63; db 205 |
| Whole e2e suite, both projects, local browser, `CI=1` | 0 on the second run | first run 181 of 182 passed, second run 182 of 182 |

**Flake, stated plainly.** In the first full browser run `UIWIRE-1.spec.ts` "split and merge retain explicit review lineage" failed in `mobile-360` (the same family as round 2); the second full run passed all 182. This round changed only a migration, tests and docs and no web code, so the failure cannot come from this round's change. The failing trace (kept in the scratch directory) shows the cause: the spec clicks "Check and edit my draft", which hard-navigates to the job page, and its next actions (Split, two checks, Merge, Save review) run within about 150 ms of the navigation starting, i.e. as soon as the server-rendered page appears and before React has hydrated. The Save review request is aborted ("-1") and a second document load of the same URL follows, so the page state is lost. This race is in the spec's timing, not in assertions I touched; it is more likely the heavier the job page is to hydrate, and CH-3a adds a form-heavy panel to that page. I did not edit the spec (another task's file); if it recurs in CI the smallest repair is for that spec's `capture` helper to wait for a hydrated control before acting, as the helpers CH-3a uses already do.

## Environment

Leaked SysV shared-memory segments were cleared before each heavy run (nothing attached, creator pid dead). Browser runs used the same uncommitted local `chromium_headless_shell-1234` config; GitHub CI uses the pinned browser.

## Round 4 addendum: the CI failure on `6287510`, and its fix

GitHub CI on the first round-4 push failed in `pnpm test` (run 37193008121, 2m51s): `practice-finding-scope.integration.test.ts` reported `connect ECONNREFUSED 127.0.0.1:59484` on its first `migrate` query; the other 37 DB files and every other package passed. This is the same file that failed twice locally earlier with "Connection terminated unexpectedly", and the only file that did.

**Cause.** The suite drew its cluster port blindly from 59300-59499. On this Mac a Lima VM listens on 127.0.0.1:59315 and 59316 with an ssh tunnel beside it, inside that range (the other suite with a range over them is UIWIRE-12). A cluster that cannot bind 127.0.0.1 still logs "ready to accept connections", so the test connected to whatever owned the port. The file alone failed 1 run in 25 locally before the change. I could not identify the owner of the CI port, so I cannot claim the CI failure was this exact collision; it is the same symptom in the same file, and a verified-free port removes that class of failure.

**Fix** (`ae039c2`). `freePort(base, span)` in `pool-test-utils.ts` picks a port in the same range that nothing is listening on, on IPv4 and IPv6 loopback (a host without IPv6 is not a conflict); `practice-finding-scope` and `UIWIRE-12` use it. A unit test (`free-port.test.ts`, written first, red with "freePort is not a function") occupies a port and requires it to be skipped, and requires a clear error when the whole range is taken. The same file passed 25 of 25 isolated runs afterwards. No assertion, skip, timeout or retry changed; the new test file is registered in the ch-3a lane.

Re-run at `ae039c2` (database and browser commands inside `heavy-slot ch-3a`): `pnpm typecheck --force` 0; `LANE_BASE_REF=origin/main pnpm lint` 0; `lint:lanes` 0; `pnpm openapi:check` 0; `pnpm build` 0; `pnpm test:db` 0 (40 files, 207 tests); `pnpm test:migrations` 0 (11 tests); `pnpm test --force` 0 (tools 39; core 440; storage 4; config 2; ai 72; api 109; web 63; db 207); whole e2e suite, both projects, local browser, 0 (182 passed). The counts in the round-4 table above are for `b959ce9`, before this fix.


## Main merge (SH-1)

5 October 2026. Working-tree conflict resolution for PR #98 over CH-3a head
`978ceec`, retaining SH-1 from `origin/main`. Builder receipt only; no new
independent verdict or acceptance is claimed. The dispatcher commits and pushes.

- `packages/core/src/index.ts`: retained `job-parties` and all three SH-1
  exports (`cumulative-fee`, `receipt-allocation`, `extra-origin`).
- `packages/db/MIGRATIONS.md`: retained both complete migration sections,
  0051 before 0053.
- `packages/db/src/migrate.ts`: retained both migration entries in numeric
  order. Counted 45 SQL files (0000–0042, 0051, 0053), and verified the runner
  registers every file exactly once in that order.
- `packages/db/test/UIWIRE-12.integration.test.ts`: retained the party fixture
  installation after migration; kept main's upper bound of 0053 and set all
  three migration-count assertions to 45.
- `packages/db/test/demo-bootstrap.integration.test.ts`: named both 0051 and
  0053 in the test description and set all three migration-count assertions
  to 45. No other assertion, skip, timeout or retry changed.

Validation used installed dependencies, Node 24.17.0 and locally cached pinned
pnpm 10.28.1, selected through a temporary PATH shim. The default pnpm launcher
failed its attempted version switch; its empty local store was removed.

| Command | Exit | Result |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 tasks successful (2 cached) |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed; lane check rejects staged SH-1 paths in the pending merge |
| `pnpm lint:lanes` | 1 | Same staged SH-1 paths outside the CH-3a lane |
| `pnpm exec turbo run lint` | 0 | 7 tasks successful (2 cached) |
| `node tools/money-arithmetic-lint.mjs` | 0 | Passed |
| `node tools/commercial-boundary-lint.mjs` | 0 | Passed |
| `pnpm build` | 0 | 7 tasks successful (2 cached) |
| `pnpm --filter @jobguard/core test` | 0 | 73 files, 547 tests passed |
| `pnpm openapi:check` | 1 | Sandbox blocks tsx CLI IPC socket (`listen EPERM`) |
| `node --import tsx src/generate-openapi.ts --check` (in `apps/api`) | 0 | Same source OpenAPI comparison passed without CLI IPC |

Repository conflict-marker scan returned no matches. Lane policy and the
already-resolved registry were not changed; rerun lane checks after the dispatcher
commits the merge. PostgreSQL/database, migration and browser suites were not run:
this sandbox cannot bind localhost or start PostgreSQL. They run in GitHub CI
after the dispatcher pushes. No Git command was invoked directly; the required
lane scripts use read-only Git inspection internally.
