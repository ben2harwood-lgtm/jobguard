# M4-1-S retrospective repair — builder receipt

Date: 2026-09-27. Builder: Codex. **Implementation recorded; technical acceptance HOLD.** This is not an independent review or acceptance. No push, PR, merge or release performed.

## Binding and scope

- Branch: `codex/sandbox/m4-1-s-repair`; registered in lane `m4-1-s`, never `work`.
- Base: `694e9e1755f2a5680898eb0fa04af48afd66c86b`.
- Code/test head: `cc467d7f5fb463d9caad27255b1f2fbaec54694b`.
- Tests-first commit recovered from interrupted run: `32018944000e52efcbf032cbcad7741185803e53`.
- Additional landing/upgrade tests: `07ef444`.
- Review input read in full: `docs/verdicts/M4-1-S/54adf02.md`. Its verdict binds only the old head, not these repairs.
- Scope is its exact R1–R5 repair list, under BUILD_PLAN §29 and §13.2 C1–C8. Findings 5 and 6 were not included in that numbered repair list: write-off/reversal accounting and the broader source-link/Jobs/keyboard journey gaps remain unresolved. No assertion that all original acceptance criteria now pass.

## Repairs

**R1 — execute DB and both browser projects:** attempted; NOT RUN in substance because infrastructure cannot start (exact evidence below). No counts of successful DB integration or browser journeys are claimed.

**R2 — one current-state read contract:** migration `0046_recovery_case_current.sql` documents the old state/claim/revision columns as legacy snapshots and adds `app.recovery_case_current`, an invoker-security view over immutable claims/events. Only cases without any workbench history use the legacy fallback; incomplete workbench history is excluded. Workbench, eligibility, recovery-demo and evidence-pack readers now use that view. The existing 0018 `approve_synthetic_landing` SECURITY DEFINER body reads it after job/case locking, so current prevention, amended claim limits and current revision govern landing. Existing function owner/search path/EXECUTE grants are retained; no new definer or runtime mutation grants. Workbench writes share job-then-case lock order before audit append.

Upgrade tests install the preceding schema with stale base columns and persisted history, run 0046 twice, and assert live state/claim/revision. Runtime tests cover RLS and denied view updates. Landing tests cover current claim limits, stale revision rejection and a valid landing rolled back to a savepoint. These DB assertions are source-inspected, not test-executed here. Existing fresh-install and legacy landing suites include 0046. Deployment must apply migration before new readers; no data rewrite/backfill. Forward-fix strategy is documented in `packages/db/MIGRATIONS.md`.

**R3 — server reviewer:** the application verifies active synthetic membership/job access through `readSyntheticDemoJob`, then supplies the verified demo membership ID separately to the repository. Optional legacy client `reviewerRef` is ignored and replaced before hashing, storing claim/event reviewer and appending audit actor. Browser commands omit the literal reviewer. The inherited fixed synthetic membership model remains; this does not establish distinct human identities for anonymous practice sessions or change M4-2 eligibility actor handling. API tests reject failed verification and prove the server actor wins over a forged client actor; DB tests inspect immutable claim/event/audit actors.

**R4 — honest fee display:** ordinary cases show `Not calculated here`; terminal prevention shows `£0.00`. The e2e now expects the non-calculated label after a £1,000 landing, so the prevention assertion no longer hides a universal zero. No fee policy or fee arithmetic added. No global banner changes.

**R5 — transition tests:** explicit expected results for all 9 states × 11 events (99 pairs), including disputes; additional partial/total reversal assertions from `partially_landed` and `closed_no_recovery`. Targeted suite: 103 passing tests. No state-machine policy change.

No routes changed. OpenAPI source check confirms the existing additive route registry still matches `apps/api/openapi.json`; no spec rewrite required. No provider, external commercial action, prompt/model change, new alert, dependency or production capability introduced.

## Environment and reproducible commands

Worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/m4-1-s-repair`.
Node `v24.17.0` (engine-compatible; `.nvmrc` pins `24.15.0`, exact runtime-pin verification not achieved). Existing install metadata records pnpm `10.28.1`; reused the interrupted run's installed dependencies, not a new clean install. Default pnpm launcher failed fetching/verifying its version from the restricted network. Used the already-cached pinned CLI without disabling signature checks:

```sh
# /private/tmp/m4-1-s-bin/pnpm
#!/bin/sh
exec /usr/local/bin/node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs "$@"
```

All pnpm commands below used `PATH=/private/tmp/m4-1-s-bin:$PATH`. Lint/lane checks and root test/typecheck used `LANE_BASE_REF=694e9e1`. Root test, typecheck, OpenAPI and browser runs used `CI=true`; Playwright therefore attempted the production Next server. Local logs: `/private/tmp/m4-1-s-resume-logs/`. Earlier red evidence retained at `/private/tmp/m4-1-s-repair-logs/`: `api-before.log` reports 3 failed tests; `db-before.log` reports failed setup/6 skipped tests, not a red DB assertion.

| Actual command | Exit/result | Evidence |
|---|---|---|
| `pnpm -r build` | 0, PASS, including production Next build | `build.log` |
| `pnpm lint` | 0, PASS; 7 tasks, 2 cached | `lint.log` |
| `pnpm lint:lanes` | 0, PASS; exact repair branch and base | `lanes.log` |
| `pnpm typecheck` | 0, PASS; 7 tasks, 2 cached | `typecheck.log` |
| `pnpm test` | 1, NOT GREEN; API health socket denial, Turbo aborts remaining work | `test.log` |
| `pnpm test:db` | 1; final hydrated run: 32 failed files, 2 passed; 1 failed test, 15 passed, 137 skipped. DB integration NOT RUN in substance | `db-hydrated.log` |
| `pnpm test:migrations` | 1; 2 failed setup files, 11 skipped. NOT RUN in substance | `migrations-hydrated.log` |
| `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-1-S.spec.ts` | 1; both projects NOT RUN, web server cannot bind | `e2e.log` |
| `pnpm openapi:check` | 1; NOT RUN through wrapper, tsx IPC denied | `openapi.log` |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | 0, PASS, same source check without tsx CLI IPC server | `openapi-loader.log` |
| `node apps/api/dist/generate-openapi.js --check` | 1, no diagnostic output; not claimed as a successful check | `openapi-built.log` |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-case.test.ts` | 0, 103/103 PASS | `core-targeted.log` |
| `pnpm --filter @jobguard/web test` | 0, 36/36 PASS | `web-unit.log` |
| `git diff --check` | 0, PASS | command output |

Root tests: core 526 passed; AI 72 passed; API 77 passed/1 failed with an uncaught listen error, including all 3 recovery reviewer tests passing. Config/storage results were cached (2/4 tests respectively). Root DB/web completion was not inferred from Turbo's interrupted run; the separate commands above supply their results.

### Exact environment failures

The first DB run reported `Postgres init script exited with code 1`; a direct diagnostic found `Library not loaded: @loader_path/../lib/libzstd.1.dylib` despite the existing ICU symlink. Ran the shipped `node scripts/hydrate-symlinks.js` from the local embedded-postgres package directory (exit 0). This changed only ignored dependency symlinks. Re-ran `pnpm test:db` and `pnpm test:migrations` after hydration.

Direct hydrated initdb, using a new `mktemp -d /private/tmp/m4-1-s-initdb.XXXXXX` directory and the package's `native/bin/initdb -D "$TASK_PG_DIR" --lc-messages=C`, exited 1:

```text
FATAL:  could not create shared memory segment: No space left on device
DETAIL:  Failed system call was shmget(key=110620065, size=56, 03600).
HINT:  This error does *not* mean that you have run out of disk space.
```

Full diagnostic: `initdb-hydrated.log`. No system shared-memory limits or other processes were altered. The DB restore test separately failed with `Error: listen EPERM: operation not permitted 127.0.0.1`.

Playwright startup: `Error: listen EPERM: operation not permitted 127.0.0.1:3000`; `Process from config.webServer was not able to start. Exit code: 1`. No browser executed; no screenshots or traces were produced. No intercepted or fabricated successful API response.

Root API health test: `TypeError: Cannot read properties of null (reading 'port')` from Supertest, with uncaught `Error: listen EPERM: operation not permitted 0.0.0.0`.

OpenAPI wrapper: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/51858.pipe`. The Node source-loader check passes without creating that auxiliary IPC listener.

## Remaining gates

R1 remains unfulfilled: execute real PostgreSQL fresh/upgrade/privilege/recovery suites and both production-build browser projects on a permitted host. Repeat the complete root suite and pinned clean-install checks there. Independent Claude must inspect and test the exact repaired diff, then record a new verdict; a separate actor must accept. No independent reviewer was invoked and no acceptance was self-issued. All production/privacy/commercial/release gates remain unchanged.
