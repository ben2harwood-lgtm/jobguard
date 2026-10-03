# ENT-1 builder receipt — CI repair (3 October 2026)

Repair builder: Claude Sonnet 5.5. First version built by Codex GPT-6.1 Sol (see `RUN_RECEIPT.md`).
**Not independently verified, not accepted.** This is a builder receipt, not a verdict. A different model checks these commits, a Claude Opus reviewer checks the Codex code, and a separate actor decides acceptance. Nothing here is pushed to `main`, merged or released.

Branch `codex/sandbox/ent-1`, repaired on top of Codex commit `04d2dd2` (base `3e0764b`). The migration number stays `0054`.

## Why CI failed

GitHub CI run `37151978241` stopped at `pnpm test`, so `pnpm build` and the browser suite never ran. The Codex sandbox could not start PostgreSQL or a browser, so the SQL and the browser flow had never executed. Running them for the first time exposed six defects, all inside this task's own code.

| # | Root cause | Where | What it broke |
| --- | --- | --- | --- |
| 1 | Lost quote doubling inside `format()`: `nullif(current_setting(''app.tenant_id'',true),)::uuid` is a syntax error (SQLSTATE 42601). | `0054_contractor_organisation.sql`, the `tenant_isolation` policy loop | Migration 0054 failed to apply, so every suite that migrates failed: 33 of 34 DB test files in CI, including `demo-bootstrap` and `restore-rehearsal`. |
| 2 | Operator precedence: `d->'x'-ARRAY[...]` parses as `d->('x'-ARRAY[...])` because binary `-` binds tighter than `->`. The expression raised, and the `WHEN OTHERS` handler returned `false`, so every valid rule or contract document was rejected as `INVALID_RULE_DOCUMENT`. Five places. | `app.valid_approval_rules`, `app.valid_client_contract` | 5 of 13 contractor DB tests (any `contract.revise`). Hidden in CI by cause 1. |
| 3 | Migration-count assertions did not count 0054. | `UIWIRE-12.integration.test.ts` (`MIGRATION_URLS` length and total applied count 42 to 43). The `0000..0041` range assertion is unchanged (still 42). `demo-bootstrap` had already been set to 43 by Codex. | UIWIRE-12 upgrade suite. |
| 4 | Test expectation that could never hold: two loops revise the same contract once per administrator role (each revise appends an immutable version), then asserted exactly one version for the next role. | `contractor.integration.test.ts` (2 tests) | 2 contractor DB tests. |
| 5 | The Next route compared `Origin` with `new URL(request.url).origin`. Under `next start --hostname 127.0.0.1`, Next reports `request.url` as `http://localhost:PORT`, so the real browser origin `http://127.0.0.1:PORT` never matched and every browser POST returned 403. | `apps/web/app/api/contractor/route.ts` | All 4 ENT-1 browser cases failed at "Start generated contractor practice". |
| 6 | `getByRole('alert')` matched two elements (the contractor error paragraph and Next's built-in route announcer, `div role=alert`): Playwright strict-mode violation. | `apps/web/e2e/ENT-1.spec.ts` | ENT-1 browser case 1 at the malformed-rules step. |

## Commits (oldest first, all after `04d2dd2`)

| Commit | Change |
| --- | --- |
| `f5dfd73` | Fix cause 1 (quote doubling) and cause 2 (parentheses in five places) in migration 0054. |
| `40500fb` | Cause 3: UIWIRE-12 counts 42 to 43 (two assertions). Adds `packages/db/test/UIWIRE-12.integration.test.ts` to the `ent-1` lane allow-list in `config/agent-lane-assignments.json` (only the ent-1 lane edited) so lane lint accepts the edit. |
| `79b820f` | Cause 4: assert the reader sees exactly the versions persisted (counted through the migration credential) instead of a literal 1. Same exact-count strength; the NOT_FOUND assertions for out-of-scope readers are untouched. |
| `07d8689` | Cause 5: compare `Origin` with the host and protocol the client addressed (`X-Forwarded-Host`/`Host`, `X-Forwarded-Proto`). Checked on a throwaway production server: `127.0.0.1` origin accepted, `localhost`, a foreign origin, `https` and no `Origin` all return 403. |
| `6fe4985` | Cause 6: scope the two alert locators to `getByRole('main')`, as `UIWIRE-12.spec.ts` and `shell.spec.ts` already scope theirs. The expected text (`INVALID_RULE_DOCUMENT`) and the focus assertion are unchanged. This is this task's own new spec; no existing spec was changed. |

No test was weakened, skipped, retried or given a longer timeout. Causes 4 and 6 changed test code because the original expectation was wrong, and each commit message says why.

## Environment fixes (not repository changes)

* **Leaked SysV shared memory.** `kern.sysv.shmmni` is 32 and 31 segments were held by dead creators with 0 attached, so `initdb` died ("Postgres init script exited with code null"). Removed only segments whose creator PID was dead and whose attach count was 0 (`ipcrm -m`, 31 segments). Other builders' failing PostgreSQL starts keep leaking more; live segments were never touched.
* **Missing embedded-postgres dylib symlinks.** pnpm 10 skipped the `@embedded-postgres/darwin-arm64` postinstall ("Ignored build scripts"). Ran the package's own `scripts/hydrate-symlinks.js` inside `node_modules` (17 links). No repository file changed.
* **Browser.** Playwright 1.55.1 pins `chromium_headless_shell-1193`, which is not installed on this Mac. I used an UNCOMMITTED local config outside the repository (`scratchpad/pw.local.config.ts`, imports the repo config and only sets `launchOptions.executablePath` to the installed `chromium_headless_shell-1234`). GitHub CI installs the pinned browser and is the pinned-browser proof.
* All database and browser commands ran inside `heavy-slot ent-1`; the e2e runs waited inside the slot for ports 3000 and 55432.

## Commands, exit codes and counts

Code under test is the head before this receipt (`6fe4985`) unless a row says otherwise.

| Command | Exit | Result |
| --- | ---: | --- |
| `gh run view 37151978241 --log-failed` | 0 | Diagnosis only: failed at `pnpm test` (33 failed DB files, 2 failed tests). |
| `pnpm install --frozen-lockfile` (in `heavy-slot`) | 0 | Lockfile already satisfied; dependencies were installed; build-scripts warning noted above. |
| `pnpm typecheck` | 0 | 7 of 7 tasks. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 tasks; lane boundary passed for base `3e0764b`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Passed. |
| `pnpm build` | 0 | 7 of 7 tasks, production Next build. |
| `pnpm test` (in `heavy-slot`, first run at `79b820f`, before the route and spec commits) | 0 | `node --test tools/*.test.mjs`: 39 pass. turbo: 13 of 13 tasks. config 2, storage 4, ai 72, core 1,648, api 77, web 56, db 163 (35 files). Real execution (turbo cache misses). |
| `pnpm test` (in `heavy-slot`, rerun on `6fe4985`) | 0 | Same counts. Turbo replayed cached core, storage, config, ai, db and api results whose inputs were unchanged since the real run above (db hash `665f3091`); web ran for real. |
| `pnpm test:db` (in `heavy-slot`, no turbo cache) | 0 | 35 files, 163 tests. This includes all 13 contractor tests, `demo-bootstrap` (43 migrations) and `restore-rehearsal`. Earlier run at the same DB inputs: 34 files passed, 2 contractor tests failed (cause 4). |
| `pnpm test:migrations` (in `heavy-slot`) | 0 | 2 files, 11 tests (`tenancy`, `demo-bootstrap`). |
| `pnpm openapi:check` (in `heavy-slot`) | 0 | Committed `openapi.json` matches the generator. |
| `CI=1 pnpm --filter @jobguard/web test:e2e -c <local config> --project=mobile-360 --project=desktop ENT-1.spec.ts` | 0 | 4 passed (2 cases at each viewport). Earlier runs: 4 failed (cause 5), then 2 failed (cause 6). |
| Same, no spec argument (whole existing suite, as CI runs it) | 0 | 166 passed in 4.4 minutes, 1 worker. |

## Not run, and why

* The pinned Playwright browser (`chromium_headless_shell-1193`); see above. CI on the new head is the proof.
* `gitleaks` and `dependency-review` (GitHub-only jobs); they passed on the previous head and nothing in this repair touches dependencies or secrets.
* No live provider, real data, spending, deployment, decision approval or production mode was touched. No new migration number, no renumbering.

## Left open

* The integrator must re-adjust the UIWIRE-12 and `demo-bootstrap` migration counts at merge time (this branch counts only its own 0054 on top of current `main`).
* Independent Claude verdict on the Codex code, a separate acceptance, and the exact-commit rebinding of any earlier review remain outstanding. Any commit after `04d2dd2` needs a fresh or explicitly rebound review.

**Not independently verified, not accepted.**
