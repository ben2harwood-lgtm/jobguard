# ENT-1 builder receipt — CI repair (3 October 2026)

Repair builder: Claude Sonnet 5.5. First version built by Codex GPT-6.1 Sol (see `RUN_RECEIPT.md`).
**Not independently verified, not accepted.** This is a builder receipt, not a verdict. A different model checks these commits, a Claude Opus reviewer checks the Codex code, and a separate actor decides acceptance. Nothing here is pushed to `main`, merged or released.

Branch `codex/sandbox/ent-1`, repaired on top of Codex commit `04d2dd2` (base `3e0764b`). The migration number stays `0054`.

## Why CI failed

GitHub CI run `37151978241` stopped at `pnpm test`, so `pnpm build` and the browser suite never ran. The Codex sandbox could not start PostgreSQL or a browser, so the SQL and the browser flow had never executed. Running them for the first time exposed six defects, all inside this task's own code. After they were fixed and a merge conflict with `main` was resolved, the first CI run that could start exposed a seventh (a CI-runner timing failure, below).

| # | Root cause | Where | What it broke |
| --- | --- | --- | --- |
| 1 | Lost quote doubling inside `format()`: `nullif(current_setting(''app.tenant_id'',true),)::uuid` is a syntax error (SQLSTATE 42601). | `0054_contractor_organisation.sql`, the `tenant_isolation` policy loop | Migration 0054 failed to apply, so every suite that migrates failed: 33 of 34 DB test files in CI, including `demo-bootstrap` and `restore-rehearsal`. |
| 2 | Operator precedence: `d->'x'-ARRAY[...]` parses as `d->('x'-ARRAY[...])` because binary `-` binds tighter than `->`. The expression raised, and the `WHEN OTHERS` handler returned `false`, so every valid rule or contract document was rejected as `INVALID_RULE_DOCUMENT`. Five places. | `app.valid_approval_rules`, `app.valid_client_contract` | 5 of 13 contractor DB tests (any `contract.revise`). Hidden in CI by cause 1. |
| 3 | Migration-count assertions did not count 0054. | `UIWIRE-12.integration.test.ts` (`MIGRATION_URLS` length and total applied count 42 to 43). The `0000..0041` range assertion is unchanged (still 42). `demo-bootstrap` had already been set to 43 by Codex. | UIWIRE-12 upgrade suite. |
| 4 | Test expectation that could never hold: two loops revise the same contract once per administrator role (each revise appends an immutable version), then asserted exactly one version for the next role. | `contractor.integration.test.ts` (2 tests) | 2 contractor DB tests. |
| 5 | The Next route compared `Origin` with `new URL(request.url).origin`. Under `next start --hostname 127.0.0.1`, Next reports `request.url` as `http://localhost:PORT`, so the real browser origin `http://127.0.0.1:PORT` never matched and every browser POST returned 403. | `apps/web/app/api/contractor/route.ts` | All 4 ENT-1 browser cases failed at "Start generated contractor practice". |
| 6 | `getByRole('alert')` matched two elements (the contractor error paragraph and Next's built-in route announcer, `div role=alert`): Playwright strict-mode violation. | `apps/web/e2e/ENT-1.spec.ts` | ENT-1 browser case 1 at the malformed-rules step. |
| 7 | Cost of the workspace view grew with the number of members: `app.contractor_allowed` ran once per member x grant, per grant and per team membership (about 6 ms at 7 members, 16 ms at 37). On the slower GitHub runner the test "covers every administration command and query for all roles" hit vitest's default 5,000 ms limit (5,015 ms; 1,927 ms locally) and the conformance-matrix test used 41 s of its 60 s allowance (12.5 s locally). | `packages/db/src/contractor-repository.ts` (`query`) | 1 contractor DB test timed out in CI run `37158325339`, the only failing test. No timeout was changed. |

## Commits (oldest first, all after `04d2dd2`; the receipt itself is updated in the final commit)

| Commit | Change |
| --- | --- |
| `f5dfd73` | Fix cause 1 (quote doubling) and cause 2 (parentheses in five places) in migration 0054. |
| `40500fb` | Cause 3: UIWIRE-12 counts 42 to 43 (two assertions). Adds `packages/db/test/UIWIRE-12.integration.test.ts` to the `ent-1` lane allow-list in `config/agent-lane-assignments.json` (only the ent-1 lane edited) so lane lint accepts the edit. |
| `79b820f` | Cause 4: assert the reader sees exactly the versions persisted (counted through the migration credential) instead of a literal 1. Same exact-count strength; the NOT_FOUND assertions for out-of-scope readers are untouched. |
| `07d8689` | Cause 5: compare `Origin` with the host and protocol the client addressed (`X-Forwarded-Host`/`Host`, `X-Forwarded-Proto`). Checked on a throwaway production server: `127.0.0.1` origin accepted, `localhost`, a foreign origin, `https` and no `Origin` all return 403. |
| `6fe4985` | Cause 6: scope the two alert locators to `getByRole('main')`, as `UIWIRE-12.spec.ts` and `shell.spec.ts` already scope theirs. The expected text (`INVALID_RULE_DOCUMENT`) and the focus assertion are unchanged. This is this task's own new spec; no existing spec was changed. |
| `c1d30ad` | This receipt (first version). |
| `dded89e` | Merge of `origin/main` (`b039abf`, D13-16-IDS). Main advanced after the PR opened, the PR became CONFLICTING, and GitHub does not start the `pull_request` workflow on a conflicted PR (no CI ran on `c1d30ad`). The only conflict was the one-line lane registry `config/agent-lane-assignments.json`; resolved as the union (main's registry with its `d13-16-ids` lane untouched, plus the `ent-1` lane). Non-destructive merge commit; no rebase, no force. |
| `b228e87` | Cause 7: evaluate `organisation.read` once for every org unit, team, client and the tenant, then filter units, teams, members, grants and team memberships by that set. The function receives the same arguments as before for every ID that can appear (a grant scope is always one of those IDs; any other ID was already false), so the projection is unchanged. Local timings 1,927 ms to 871 ms and 12,526 ms to 5,492 ms. |
| `bdad5fe` | In the two hot conformance loops, read the expected organisation revision as the persisted receipt count instead of building a full projection before every command. Every assertion is unchanged; the owner view is still exercised by the other tests (including the explicit revision assertion in the racing-command test). Local timings 871 ms to 450 ms and 5,492 ms to 2,197 ms. |

No test was weakened, skipped, retried or given a longer timeout. Causes 4 and 6 changed test code because the original expectation was wrong, and the last test commit changes only how the expected revision is read (a speed-up, not an assertion change); each commit message says why. A reviewer who prefers the test untouched can revert `bdad5fe` alone: the view optimisation in `b228e87` already brings the administration test to 871 ms locally.

## Environment fixes (not repository changes)

* **Leaked SysV shared memory.** `kern.sysv.shmmni` is 32 and 31 segments were held by dead creators with 0 attached, so `initdb` died ("Postgres init script exited with code null"). Removed only segments whose creator PID was dead and whose attach count was 0 (`ipcrm -m`, 31 segments). Other builders' failing PostgreSQL starts keep leaking more; live segments were never touched.
* **Missing embedded-postgres dylib symlinks.** pnpm 10 skipped the `@embedded-postgres/darwin-arm64` postinstall ("Ignored build scripts"). Ran the package's own `scripts/hydrate-symlinks.js` inside `node_modules` (17 links). No repository file changed.
* **Browser.** Playwright 1.55.1 pins `chromium_headless_shell-1193`, which is not installed on this Mac. I used an UNCOMMITTED local config outside the repository (`scratchpad/pw.local.config.ts`, imports the repo config and only sets `launchOptions.executablePath` to the installed `chromium_headless_shell-1234`). GitHub CI installs the pinned browser and is the pinned-browser proof.
* All database and browser commands ran inside `heavy-slot ent-1`; the e2e runs waited inside the slot for ports 3000 and 55432.

## Commands, exit codes and counts

Code under test is `bdad5fe` (every row that says "final") unless a row says otherwise. DB and browser commands ran inside `heavy-slot ent-1`.

| Command | Exit | Result |
| --- | ---: | --- |
| `gh run view 37151978241 --log-failed` | 0 | Diagnosis only: failed at `pnpm test` (33 failed DB files, 2 failed tests). |
| `pnpm install --frozen-lockfile` | 0 | Lockfile already satisfied; build-scripts warning noted above. |
| `pnpm typecheck` (final) | 0 | 7 of 7 tasks. |
| `LANE_BASE_REF=origin/main pnpm lint` (final) | 0 | 7 of 7 tasks; lane boundary passed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (on `c1d30ad`, before the merge) | 0 | Passed; `pnpm lint` above also runs the lane lint on the final head. |
| `pnpm build` (final) | 0 | 7 of 7 tasks, production Next build. |
| `pnpm test` (final) | 0 | `node --test tools/*.test.mjs`: 39 pass. turbo 13 of 13 tasks: config 2, storage 4, ai 72, core 1,648, api 77, web 56, db 163 (35 files). db, api and web executed for real (cache miss); core, config, storage and ai replayed turbo cache entries whose inputs are unchanged since their real runs earlier in this repair. |
| `pnpm test:db` (earlier head `79b820f`, no turbo cache) | 0 | 35 files, 163 tests. Before the cause-4 fix: 34 files passed, 2 contractor tests failed. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --reporter=verbose test/contractor.integration.test.ts` (final) | 0 | 13 of 13 pass; administration test 450 ms, matrix test 2,197 ms, whole file about 5 s. |
| `pnpm test:migrations` (final) | 0 | 2 files, 11 tests (`tenancy`, `demo-bootstrap`). |
| `pnpm openapi:check` (final) | 0 | Committed `openapi.json` matches the generator. |
| `CI=1 pnpm --filter @jobguard/web test:e2e -c <local config> --project=mobile-360 --project=desktop ENT-1.spec.ts` (final) | 0 | 4 passed (2 cases at each viewport). Earlier runs: 4 failed (cause 5), then 2 failed (cause 6), then 4 passed. |
| Same, no spec argument: whole existing suite as CI runs it (at `6fe4985`) | 0 | 166 passed in 4.4 minutes, 1 worker. Not rerun after `b228e87`/`bdad5fe`, which touch only `packages/db/src/contractor-repository.ts` and a DB test; the ENT-1 spec, which reads that view in a browser, was rerun. |
| GitHub CI run `37158325339` on `dded89e` | 1 | typecheck, lint passed; `pnpm test` failed on exactly one test (cause 7: 5,015 ms against the 5,000 ms default); everything else in the DB suite passed on the CI runner. `secrets` and `dependency-review` passed. Build and browser steps did not run. |

## Not run, and why

* The pinned Playwright browser (`chromium_headless_shell-1193`); see above. CI on the new head is the proof.
* `gitleaks` and `dependency-review` (GitHub-only jobs); they passed on the previous head and nothing in this repair touches dependencies or secrets.
* No live provider, real data, spending, deployment, decision approval or production mode was touched. No new migration number, no renumbering.

## Left open

* The integrator must re-adjust the UIWIRE-12 and `demo-bootstrap` migration counts at merge time (this branch counts only its own 0054 on top of current `main`).
* Independent Claude verdict on the Codex code, a separate acceptance, and the exact-commit rebinding of any earlier review remain outstanding. Any commit after `04d2dd2` needs a fresh or explicitly rebound review.

**Not independently verified, not accepted.**

---

# Round 2 (4 October 2026): repairs for the GPT-6.1 Sol check

Input: Sol check `ent-1-solcheck-20261003T234604.md`, **REPAIR** on `9a5b6ba` (two P2, no P1). Opus had given PASS on the same head (PR comment). Tests were written first and run red before each fix. **Not independently verified, not accepted.**

## Finding status

| Finding | Status | Fix and evidence |
| --- | --- | --- |
| P2: forwarded headers could bypass the Origin check | Fixed | The gate no longer reads `X-Forwarded-Host`, `X-Forwarded-Proto` or `Host`. Trusted origins now come only from server configuration: `JOBGUARD_ALLOWED_ORIGINS` (comma-separated, for custom domains or self-hosting), the Vercel system variables `VERCEL_URL`, `VERCEL_BRANCH_URL` and `VERCEL_PROJECT_PRODUCTION_URL`, and, only when `VERCEL` is unset, the loopback hosts (`127.0.0.1`, `localhost`, `[::1]`) on the port the server itself listens on (Next builds `request.url` from the server's own host and port configuration). Origins with credentials, `null`, missing, non-http(s) and lookalike hosts are rejected. Commit `d5d7ef4`. |
| P2: failed refresh left stale state shown as success | Fixed | `load()` now reports whether the persisted organisation was read. After an acknowledged mutation whose refresh fails, the page keeps a visible focused error, says the organisation is out of date, keeps the old revision visibly distinct from success, and disables every revision-dependent control (unit, team, member, grant, revoke, move, client, contract) until a successful reload clears the state. Commit `035d626`. |

## Tests first (commit `62d1efe`, red on purpose)

* `apps/web/app/api/contractor/route.test.ts` calls the real POST handler with the downstream application replaced. Both Sol bypasses returned 200 instead of 403 on `9a5b6ba` (foreign Origin plus a matching supplied `X-Forwarded-Host`; http Origin on an https request plus `X-Forwarded-Proto: http`), as did the same forged headers on `?action=start`. Four of five cases failed. A fifth case asserts the configured deployment origin is accepted whatever forwarded headers say.
* `apps/web/app/api/contractor/origin.test.ts` (added with the fix, 12 cases): configuration parsing, loopback only off Vercel and only on the server's port, and rejection of the two bypasses, lookalike hosts, credentials, `null` and missing Origin.
* `apps/web/e2e/ENT-1.spec.ts`, new case "an acknowledged change whose refresh fails is shown as stale, never as saved, and blocks revision-dependent edits". **This is a fault test: it aborts only the follow-up refresh `GET` at the transport (`route.abort`); the real `POST` is allowed through and really commits (asserted through the API: revision 1), and no JobGuard success response is fabricated or fulfilled.** It then asserts the focused alert, the "out-of-date" status, the unchanged displayed revision, disabled edit buttons, an enabled Reload button, recovery after a successful reload, a further successful change, persistence after a page reload, the sandbox banner and no horizontal overflow. Failed at both viewports on `9a5b6ba` (page claimed "Saved to the organisation"); passes now.

## Commands, exit codes and counts (round 2, head before this section)

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm exec vitest run app/api/contractor` on `9a5b6ba` plus the new tests (red) | 1 | 4 of 5 route cases failed (200 instead of 403); `origin.test.ts` could not import the missing module. |
| Same, after `d5d7ef4` | 0 | 2 files, 17 tests. |
| `CI=1 … test:e2e -c <local config> --project=mobile-360 --project=desktop ENT-1.spec.ts` before the UI fix (red) | 1 | 4 passed, the new case failed at both viewports. |
| Same, after `035d626` | 0 | 6 passed (3 cases at each viewport). |
| `pnpm typecheck` | 0 | 7 of 7 tasks. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 tasks; lane boundary passed (all new files are under the existing `apps/web/app/api/contractor/**` and `apps/web/e2e/ENT-1.spec.ts` entries). |
| `pnpm build` | 0 | 7 of 7 tasks. |
| `pnpm test` (in `heavy-slot`) | 0 | tools 39 pass; web 9 files, 73 tests (was 56; ran for real); core 1,648, ai 72, config 2, storage 4, api 77 and db 163 (35 files) are turbo cache replays of runs whose inputs are unchanged (db hash `7384a7d2`, the real run at `bdad5fe`). |
| `pnpm test:migrations` (in `heavy-slot`) | 0 | 2 files, 11 tests. |
| `pnpm openapi:check` (in `heavy-slot`) | 0 | passed. |
| `CI=1 … test:e2e … ENT-1.spec.ts` (in `heavy-slot`, final) | 0 | 6 passed. |

## Not run, and why

* The whole existing e2e suite was not rerun locally after the two web changes; it passed locally at `6fe4985` and in CI at `9a5b6ba`, and GitHub CI on the new head runs it again with the pinned browser. The same local browser override as before was used (uncommitted config outside the repository).
* Vercel ingress behaviour. Sol's reproductions were handler-level and so are these tests. The fix removes dependence on any request header, so it does not rely on how Vercel's proxy treats them.
* Opus LOW notes (assert `contract_id` of every returned version; proxy-appended `X-Forwarded-Host`) were not actioned: the second no longer applies because forwarded headers are not read; the first is a test-strengthening suggestion outside the Sol REPAIR list.

## OPEN FOR BEN

* **Custom domain or self-hosting.** If the demo is served from a hostname other than the Vercel deployment, branch or production URLs, set `JOBGUARD_ALLOWED_ORIGINS` (for example `https://demo.example.org`) in that environment. Without it, browser writes from that hostname are refused with 403. Lean: set it only when a custom domain is actually attached; no value is needed for the current Vercel URLs or for local development.
