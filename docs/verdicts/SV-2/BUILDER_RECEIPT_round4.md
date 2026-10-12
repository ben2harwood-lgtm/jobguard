# SV-2 builder receipt — round 4 (integration with main) — 8 October 2026

Integration repair of PR #119 after the integrator merged main `df1f9c1` into the branch (`377c884`, the starting HEAD). **Not technically
accepted.** This builder does not review or accept its own work; CI on the new head and a fresh independent review of this delta (round 3
at `37f0e9d` is still unreviewed) are required. Source inspection, local execution and CI are kept apart below.

## Identity and scope

- Branch/worktree: `codex/sandbox/sv-2`, the issued `sv-2` worktree. Started at `377c884221a1150cb18b9195fcada07ef99a05d9` with an empty
  `git status --porcelain`. One local commit; nothing pushed, merged or opened as a PR.
- Only **tests** changed (five files, all already in the `sv-2` lane allow-list) plus this receipt. **No production source changed.**
  `0100_shadow_persistence.sql` is byte-identical to the start (not touched). No merged migration (0000–0097) touched.
  `BUILD_PLAN.md` and `config/agent-lane-assignments.json` untouched. `packages/core/src/watchdog.ts` untouched (no new route; see the registry note below).
- Ben's "split the test" ruling for DW3, the source-signal existence-probe barrier, and every round 1–3 behaviour are kept; no assertion
  was weakened, skipped or deleted, and no timeout was added or lengthened.
- Synthetic data only. No live providers, spending, real sends, production mode or decision approvals.

## Environment

macOS (Darwin 25.4.0), Node v24.17.0, pnpm 10.28.1, embedded PostgreSQL 16.10, Vitest 4.1.11. `/` had 50–55 GiB free throughout.
`pnpm install` was not run. The Mac was at load average 70–140 from other agents; the shared `heavy-slot` throttle was used for the
related and whole-package database runs (they waited for a free slot). **A trap for reviewers:** `packages/db/dist` and `packages/core/dist`
in this worktree were stale (built before the merge). With the stale `dist`, the API unit test below *passes locally* and only fails
after `pnpm turbo run build --filter=@jobguard/api...` (which is what CI does first). All "red" results below were observed on a fresh
build of `377c884`.

## What changed and why

Main's three merged leaves changed the rules SV-2's tests were written against: CH-3a (0095) requires current job parties before a job can
be live or carry a quote/invoice, and makes practice ownership a recursive query; CH-2 (0096) adds live-job guards that read the tenant
from the session; party text normalisation needs a UTF-8 database cluster. SV-2's production code needed none of
this: **the failures were all in SV-2's test fixtures and one SQL-text pin.**

| # | File | Change | Why |
| --- | --- | --- | --- |
| 1 | `apps/api/src/variation/variation.application.test.ts` | The ownership assertion no longer pins the old single-line SQL. The fixture recognises the ownership query by `practiceOwnedJobsSql()` (imported from `@jobguard/db`, the exact function main's `authorizePracticeJob` builds its query from), so no SQL literal is copied. The test now asserts the behaviour: exactly two ownership checks, each called with `[tenant, job, sha256(session)]` (the raw session id is still never sent); the first ran **before** `logBuilderExtra`, the second **after** it (it belongs to the response read). All five LogBuilderExtra provenance assertions (version, proposal, `actorMembershipId`, null device fields, priced/unpriced `rateProvenance`) and the refusal-before-capture tests are unchanged. | CI run 37718325013 failed here: the old literal `SELECT id FROM app.job WHERE … practice_session_digest=$3` no longer exists after CH-3a. |
| 2 | `shadow-persistence`, `shadow-catalog`, `small-builder-origin` (`packages/db/test/`) | After `migrate(admin)` they now call main's `installLegacySyntheticPartyFixtures(admin)` (the CH-3a pattern used by `shared-money-origin`, `UIWIRE-12`, …); the clusters use `--encoding=UTF8` like main's 25 other suites. | Inserting a `live` job without parties is refused with `JOB_PARTIES_REQUIRED`; party text normalisation needs a UTF8 server ("Unicode normalization can only be performed if server encoding is UTF8"). |
| 3 | `shadow-persistence` (evidence-binding test) | The two fixture inserts into `app.evidence_upload` / `app.evidence_object` now run in a transaction with `app.tenant_id` set (small `asTenant` helper). The test's assertions are unchanged. | CH-2's live-job input guard looks the job up under the tenant policy; without the session tenant it reports `JOB_NOT_FOUND`. |
| 4 | `small-builder-origin` (two No-charge practice tests) | The job insert, `pilot_no_charge` track bind and draft→live update run in the same `asTenant` transaction. All assertions unchanged. | The draft→live update fires CH-3a's `job_parties_live_guard`, which cannot see the job's party row without the session tenant, and reported `JOB_PARTIES_REQUIRED`. |
| 5 | `demo-bootstrap` | (a) The "SQL trace" test (new on main) answers SV-2's two shadow-role posture queries with an all-false least-privilege row; the holder query returns none. (b) The hard-coded `{ migrations: 47 }` in SV-2's added fail-closed block is now `MIGRATION_URLS.length`, as main's own assertions in the same test are. | (a) SV-2's `ensureRoles` extension ran against a mock that did not know about it and failed closed. (b) The registered list is now 50. |

No SV-2 database route or controller exists, so nothing new is classified in the CH-2 registry. The existing
`/api/jobs/[id]/variations` and `nest:/jobs/:id/variations` entries (`post_live_billing`) already cover the propose path SV-2 changed;
`watchdog-registry.test.ts` passes. `packages/core/src/watchdog.ts` was therefore not needed and not edited.

SBOX ownership: SV-2's repository does not check ownership itself (the application does, before capture); the real-database application
test "the existing application propose action works on a No charge practice job" passes against main's recursive ownership query.

## Evidence

Red on `377c884` (freshly built), each observed:

| Check | Result on `377c884` |
| --- | --- |
| `apps/api` `variation.application.test.ts` | 2 failed, 3 passed: "owned propose preserves LogBuilderExtra provenance (priced: true / false)" — the pinned SQL differs from main's recursive `WITH RECURSIVE practice_owned_job` query |
| `shadow-persistence`, `shadow-catalog`, `small-builder-origin` | 3 files fail in setup with `JOB_PARTIES_REQUIRED`, 22 tests skipped. After the party fixture: setup fails with "Unicode normalization … UTF8". After that: `JOB_NOT_FOUND` (evidence insert) and `JOB_PARTIES_REQUIRED` (No-charge update) |
| `demo-bootstrap` | 2 failed: trace test `jobguard_shadow does not have the required least-privilege posture`; real-database test expected `migrations: 47`, received `50` |
| `tenancy`, `UIWIRE-12`, `variation`, `practice-session`, `shared-money-origin` | already green on `377c884`, unchanged files; still green |

Green after (each command run in the worktree, exit code observed; `pnpm turbo` ones with exit codes from the shell):

| Command | Exit | Result |
| --- | --- | --- |
| `npx vitest run src/variation/variation.application.test.ts` (api) | 0 | 5 of 5 |
| `npx vitest run src` (apps/api) | 0 | 23 files, 587 tests |
| `npx vitest run` (apps/web) | 0 | 19 files, 350 tests |
| `npx vitest run` (packages/core) | 0 | 108 files, 3188 tests (an earlier run under load 140 hit the 5 s default in `receipt-allocation` "working size is bounded"; that file passes alone in 2.7 s, it is untouched by SV-2, and I did not change the timeout; the clean rerun is the one recorded) |
| `node --test tools/*.test.mjs` | 0 | 42 tests |
| `vitest run --maxWorkers=1` `shadow-persistence` `shadow-catalog` `small-builder-origin` | 0 | 3 files, 24 tests on real PostgreSQL 16 |
| same, `shared-money-origin` `tenancy` `UIWIRE-12` `demo-bootstrap` `variation` `practice-session` | 0 (after fix 5) | 6 files, 60 tests |
| same, `final-account` `sandbox` `job-parties` `practice-scope` `practice-finding-scope` `watchdog-migration-owner` `commercial-integrity` `evidence-packs` (via `heavy-slot`) | 0 | 8 files, 117 tests |
| whole `packages/db` suite, `vitest run --maxWorkers=1` (via `heavy-slot`) | 0 | **59 files, 584 tests** |
| `pnpm typecheck` | 0 | 7 of 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Core purity, **lane boundary passed** (merge-base `df1f9c1`; HEAD is a merge so it did not refuse a self-comparison), money-arithmetic check, 7 of 7 tsc tasks |
| `pnpm build` | 0 | 7 of 7 tasks (includes the Next build) |
| `pnpm openapi:check` | 0 | up to date |

## Not run, and why

- `pnpm test:e2e` and the Playwright browser suites (`variations.spec.ts`, `m1-15-complete-journey.spec.ts`, …): not run locally; CI runs
  them after the dispatcher pushes. They remain mandatory and are **unverified on the merged head**. The behaviours they depend on from
  SV-2 (runtime capture without a job lock, `pilot_no_charge` practice jobs) are covered against real PostgreSQL above.
- Nothing later in the earlier CI run executed after the API unit failure, so the PostgreSQL and browser jobs there remain unproven by
  CI; locally the whole database package is now green.

## For the integrator and reviewers

- Review the five test diffs; the production tree (`apps/api/src/variation/variation.application.ts`, `packages/db/src/*`, `0100`) is
  identical to `377c884`.
- The unit test proves *when* ownership is checked (before capture) and with which parameters. That main's recursive query actually admits
  an owner's job is proved by the real-PostgreSQL application test (the owner's No-charge practice job is accepted); the stranger
  refusals are in the unit test and in main's `practice-session` suite.
- Plan PR #118 ("split the test") should still be merged by Ben before or with SV-2; unchanged by this round.

## TL;DR

Main's newer rules (jobs need parties, the ownership check is now a recursive query, live-job guards read the tenant from the session)
broke only SV-2's *tests*, not its code. I updated the fixtures the way main's own tests do, replaced the one pinned SQL string with a check
that ownership runs before the extra is saved, and kept every SV-2 assertion. The whole database package (59 files, 584 tests), all unit
suites, typecheck, lint, build and openapi pass locally.

Status: prepared, tested locally (database suites observed passing), committed locally. Not reviewed, not accepted, not pushed, not
deployed. Browser suites unverified locally.

Next action: dispatcher pushes `codex/sandbox/sv-2`; CI runs; fresh Opus reviews rounds 3–4 together.
