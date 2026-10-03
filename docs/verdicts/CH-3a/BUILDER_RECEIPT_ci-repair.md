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
