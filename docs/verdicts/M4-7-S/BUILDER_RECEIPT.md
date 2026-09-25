# M4-7-S builder receipt — not an independent review

Date: 25 September 2026. Builder: Codex, GPT-6 Astra.

- Leaf: **M4-7-S — synthetic pending/settled movement facts**.
- Branch: `codex/sandbox/m4-7-s`.
- Inspected base: `694e9e1755f2a5680898eb0fa04af48afd66c86b`.
- **Candidate implementation commit: `659dddf2a667539b2f7d19382307a0698133ad0e`.** This receipt is added in a subsequent documentation-only commit; it does not change the implementation candidate.
- Builder state: implementation committed; deterministic checks passed; database/browser execution **blocked**. **Not technically accepted.**
- No push, PR, merge, deployment, live provider call or independent-review claim.

## Plain-English result

The saved job has a Practice receipts panel. Connecting establishes a session-owned practice account. The server runs fixed `recovery-18800` adapter scenarios: pending gross £384, fake settlement, replay, overlapping page, known alternate statement representation and an uncertain duplicate. Pending money cannot qualify. Settled money remains £0.00 allocated eligible net. Known representations retain one account-qualified movement identity; uncertain duplicates stay ineligible until explicit reconciliation. Disconnect stops new ingestion and retains existing facts.

The browser submits a versioned action/scenario, never a settlement amount, account, tenant or authoritative event. Persisted command/account/session bindings and an invoker trigger validate the exact generated event. SHA-256 is an integrity hash, **not a signature**. This implements the contract's validated-adapter-event option without introducing credentials or a provider integration.

No allocation, fee, customer receipt, journal or production/pilot settlement is written. There is no bank connection, SDK, OAuth, token entry, regulated-consent claim, real bank branding or external commercial action. Connection/disconnection commands are the fake feed permission lifecycle. No recipient exists in this leaf, so recipient `.invalid` constraints are inapplicable.

## Composition and contracts

- Next `GET/POST /api/jobs/:id/practice-feed` are thin adapters to `PracticeFeedApplication`; Nest `GET/POST /jobs/:id/practice-feed` calls the same service. Next returns 200 on command success; Nest's POST returns 201.
- Core contracts: `practice-feed-command.v1`, `practice-feed-query.v1`, `practice-feed-event.v1`; application response/error contracts: `practice-feed-view.v1`, `practice-feed-error.v1`.
- Strict schemas reject browser money/state/event/account/tenant/environment fields, malformed pagination and ambiguous duplicate query parameters. Membership, job mode and feed session ownership are checked by the repository. Server mode must be `synthetic_demo`.
- No new environment variable, secret, destination or provider registration is required. Existing `JOBGUARD_ENV`/`DATABASE_URL` remain server configuration. Typed forbidden/conflict/unavailable results are exposed without database messages; no new operational alert channel is added.
- Browser-safe contracts have their own package export. Server composition remains in `@jobguard/api/workspace`.
- OpenAPI regeneration is additive: **55 existing paths unchanged; one new path with two operations** and the required UUID job parameter. The package scripts now run the same generator/check through `node --import tsx`, avoiding the tsx CLI's unnecessary IPC listener. Check logic is unchanged.
- Loading, empty, saved, pending, duplicate, disconnected and error states are distinct. Error recovery reads saved facts. Scoped CSS supplies visible focus and 44px controls. The shared workspace's pre-existing duplicate banner paragraph was removed; layout supplies the single global banner.

## Database and compatibility

Migration **`0043_practice_feed.sql`** adds `practice_feed_account`, `practice_feed_command`, and `practice_feed_event`. **0042 is reserved to M4-5-S and is not added here.** Registry total on this branch is 43 migrations (0000–0041 plus 0043).

All three tables have tenant/job-qualified links, migration ownership, ENABLE/FORCE RLS, policies for both `jobguard_runtime` and `jobguard_migration`, and runtime SELECT/INSERT only. New trigger functions are SECURITY INVOKER, with no new runtime routine-execution grants. Deferred checks require a connect command for every account and the matching transactional audit for every command. Command identity and job locks precede the final audit append; membership SHARE locking serializes revocation against a mutation. Event deduplication is database-unique; command-ID reuse with different content conflicts. New tables have no write path into production/pilot allocation or accounting tables.

Expand-compatible addition: no existing row backfill or destructive schema change. The previous application ignores the new tables. Remediation is by forward migration/corrective append, preserving historical facts. Fresh migration/catalog and Neon-compatible bootstrap tests are retained; their execution is blocked here, not certified by source inspection.

The existing sandbox uses a fixed demo membership/tenant and opaque UUID session cookies. This leaf verifies that membership and binds a feed to its connecting session; a different session cannot consume that feed. It also respects existing sandbox-run ownership. It does **not** retrofit ownership/authentication for older shared demo job data. Captured jobs without an existing session-owned run acquire feed ownership at first connect. This remains synthetic-only, not a production authentication claim. RLS does not defend against a compromised runtime that can deliberately select false transaction context.

## Acceptance coverage and evidence labels

| Assertion | Authored coverage | Executed evidence |
|---|---|---|
| £384 pending → simulated settled; allocated eligible net remains £0.00 | Core, PostgreSQL, browser | Core PASS; DB/browser NOT RUN |
| Same event, page overlap, alternate representation preserve one movement; late pending cannot downgrade settlement | Core, PostgreSQL, browser | Core PASS; DB/browser NOT RUN |
| Unknown duplicate held; reconciliation preserves source events | Core, PostgreSQL, browser | Core PASS; DB/browser NOT RUN |
| Browser amount/account/tenant/event cannot create settlement | Core/API schema tests, actual runtime SQL attacks, browser | Core/API unit PASS; runtime SQL/browser NOT RUN |
| Disconnect preserves history and stops ingestion | PostgreSQL, browser | NOT RUN |
| Production/pilot refusal, revoked/expired membership, foreign session/tenant/job | API units, PostgreSQL, browser | API boundary PASS; DB/browser NOT RUN |
| Idempotency, competing clients, transaction rollback, deferred connect/audit guards, privilege/RLS catalogs, upgrade | PostgreSQL; relevant browser races | NOT RUN |
| Reload, Jobs re-entry, deep link, same-session second context, source IDs/hashes, loading/error focus, touch sizes, no overflow, single banner, no bank badge | Three Playwright cases × two projects | Six cases discovered; all NOT RUN |

API unit tests explicitly use a repository double. They demonstrate boundary behavior, **not** PostgreSQL persistence or live integration. All data/adapter fixtures are generated. Browser fault tests only abort transport; they do not intercept successful API responses. No screenshot, trace of a completed journey, physical-device result or rendered verification is claimed.

## Environment and command receipt

Node `v24.17.0`; cached pinned pnpm `10.28.1`; PostgreSQL package `16.10.0-beta.15`; production Next build `15.5.25`. Successful commands used `PATH=/tmp/m4-7-s-bin:$PATH`; that temporary executable symlink points to the already cached pinned pnpm. The writable cache `/tmp/m4-7-s-store` is a copy of the local pnpm v10 cache. No lockfile or dependency versions changed.

These are the actual validation/install commands, including unsuccessful construction-time attempts. Repeated identical checks are grouped; file-reading/navigation commands are not test evidence. Exit codes are process results, not acceptance decisions.

| Command | Exit | Counts/result |
|---|---:|---|
| `pnpm install --frozen-lockfile` (default launcher) | 1 | Default pnpm attempted version switching; registry signature fetch unavailable. No install pass. |
| `pnpm install --frozen-lockfile` (cached pinned launcher, non-CI) | 1 | `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. |
| `CI=true pnpm install --frozen-lockfile` (pinned) | 130 | Registry `ENOTFOUND`; stopped retries. |
| `CI=true pnpm install --frozen-lockfile --offline --store-dir /tmp/m4-7-s-store` | 0 | Fresh replacement install; 462 packages added from cache. |
| `CI=true npm_config_store_dir=/tmp/m4-7-s-store npm_config_offline=true pnpm install --frozen-lockfile` | 0 | Final exact frozen-install command; eight workspace projects, already current. |
| `node scripts/hydrate-symlinks.js` in installed `@embedded-postgres/darwin-arm64` package; `native/bin/initdb --version` | 0 | Normal package postinstall hydration; PostgreSQL 16.10 executable. No tracked dependency/policy change. |
| `pnpm -r build` | 1, 2, 0, 0 | Initial parallel-construction missing export; then cross-Zod inferred-type error; both fixed. Two subsequent full builds passed, including final implementation. Seven build scripts including production Next. |
| `pnpm build` | 0 | Final root build: 7/7 tasks successful. |
| `pnpm --filter @jobguard/core build`; `pnpm --filter @jobguard/db build` | 0 | Agent dependency builds passed. |
| `pnpm --filter @jobguard/db typecheck` | 0 | Agent source check passed, including final DB changes. |
| `pnpm --filter @jobguard/api typecheck` | 2, 2, 2, 0 | First missing export; next two cross-Zod type errors during construction; final passed. |
| `pnpm --filter @jobguard/web typecheck` (default launcher) | 130 | Stopped launcher before tsc ran. |
| `pnpm --filter @jobguard/web typecheck` (pinned; twice) | 0 | Both source checks passed. |
| `pnpm typecheck` (twice) | 0 | Final 7/7 tasks passed. |
| `pnpm lint` | 1, 0, 0 | First rejected an untracked `.pnpm-store/v11/index.db` generated by the default launcher; removed that generated artifact. Subsequent lint/purity/boundary checks and 7/7 package tasks passed. No lane rule weakened. |
| `pnpm lint:lanes` (initial and final) | 0 | Correct branch; 28 exact permitted file paths including this receipt; no wildcard or `work` branch. |
| `node --test tools/*.test.mjs` | 0 | 39/39 passed. Also passed within root test. |
| `pnpm --filter @jobguard/core test` | 0 | 70 files, 352 tests passed. |
| `pnpm --filter @jobguard/core test -- practice-feed.test.ts` | 0 | Agent command ran the full suite: 70 files, 352 tests; not claimed as filtered. |
| `pnpm --filter @jobguard/core exec vitest run src/practice-feed.test.ts` | 0 | Agent's exact leaf run: 1 file, 13 tests passed; final production-mode fixture also passed. |
| `pnpm --filter @jobguard/api exec vitest run src/practice-feed.application.test.ts` (agent and root) | 0 | Each: 1 file, 29 tests passed. |
| `pnpm --filter @jobguard/web test` | 0 | 4 files, 36 tests passed. |
| `pnpm --filter @jobguard/api test` | 1 | 10 files/103 tests passed; existing health test failed because socket listening is forbidden. 1 failed file/test and 1 unhandled listen error. |
| `pnpm test` | 1 | Tool tests 39 passed; config 2, storage 4, core 352, AI 72, API 103 tests passed. API health listener failed; Turbo stopped with 9/12 tasks successful. This is not an overall pass. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/recovery-cases.integration.test.ts` | 1, 1, 1 | Initial dependency dist missing; subsequent probes blocked in initdb (first before native hydration, then exit 1). Four DB tests not executed. |
| `pnpm --filter @jobguard/db exec vitest run test/practice-feed.integration.test.ts --maxWorkers=1` | 1 | Agent leaf run: setup failed, 11 tests not executed. |
| `pnpm test:db` | 1 | 35 files: 2 passed/33 failed; 15 tests passed, 1 failed at listener setup, 145 reported skipped after setup failures. PostgreSQL assertions **NOT RUN**. Includes all 11 new leaf DB tests. |
| `pnpm test:migrations` | 1 | 2 failed setup suites; 11 tests not executed. **NOT RUN** migration assertions. |
| `pnpm --filter @jobguard/web exec playwright test --list --project=mobile-360 --project=desktop M4-7-S.spec.ts` | 0 | Six tests discovered: three per project. Discovery only. |
| `CI=true pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-7-S.spec.ts` | 1 | Three prerequisite build tasks passed; webserver listen denied. All six browser tests **NOT RUN**. |
| `pnpm --filter @jobguard/api openapi:generate` (original tsx launcher) | 1 | IPC socket `listen EPERM`; no successful generation claimed. |
| `node --import tsx src/generate-openapi.ts` in `apps/api` | 0 | Same generator succeeded without CLI IPC; package scripts changed to this invocation. |
| `pnpm --filter @jobguard/api openapi:generate` (updated script, including final regeneration) | 0 | Additive generated contract. |
| `pnpm openapi:check` (including final) | 0 | Generated JSON matches source. |
| Python JSON comparison against `git show 694e9e1:apps/api/openapi.json` | 0 | All 55 prior paths identical; only the new practice-feed path; both operations declare required UUID path parameter. |
| `git diff --check` (throughout and before commits) | 0 | No whitespace errors. |

Install warnings about ignored native/esbuild/scarf build scripts were retained. Native PostgreSQL's normal symlink hydration was performed explicitly after inspecting its local postinstall script; no dependency approval configuration was changed. Build output also retains pre-existing Next workspace-root/autoprefixer warnings and sandbox-denied optional Turbo cache I/O; successful checks above exited zero.

## Exact blockers and NOT RUN

Embedded harness error:

```text
Postgres init script exited with code 1. Please check the logs for extra info. The data directory might already exist.
```

A direct diagnostic using that installed `initdb` binary and a new temporary directory exited 1 and exposed the cause:

```text
FATAL: could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(key=107999684, size=56, 03600).
child process exited with exit code 1
```

The initial embedded-library diagnostic wrapper misleadingly exited 0 while reporting initialization failure; it is **not** a PostgreSQL pass. The direct native result and failed test hooks are the evidence. No SQLite, ORM mock, altered harness or skipped-test configuration substitutes for real PostgreSQL.

Browser command:

```text
Error: listen EPERM: operation not permitted 127.0.0.1:3000
Error: Process from config.webServer was not able to start. Exit code: 1
```

Existing API health test also hit `listen EPERM ... 0.0.0.0`; restore rehearsal hit `listen EPERM ... 127.0.0.1`. Runtime DB/catalog/rollback/migration/upgrade assertions and browser/rendered checks remain **NOT RUN**. Existing browser regressions could not execute under these same listener/DB restrictions. No test was removed or marked optional. Live provider/model, native device, deployment and release suites are inapplicable to this synthetic web leaf; no AI model/prompt changed. CI dependency/secrets scans were preserved, not represented as having run locally.

Logs are retained locally under `/tmp/m4-7-s-*.log` (including `db.log`, `migrations.log`, `e2e.log`, `test.log`, `build-complete.log`, `root-build.log`, `typecheck-complete.log`, `lint-complete.log`, `openapi-check-final.log`, `initdb.log`). These are local run artifacts, not committed screenshots or independent-review evidence.

## Review and release state

Three Codex helpers owned disjoint core/DB, API and web/test files. Shared registry/export edits were assigned to one owner; root generated OpenAPI and registered the lane. A second Codex helper source-inspected the DB changes and found the orphan-account gap, which was fixed. This is internal source inspection, **not** the different-model recorded verdict required by AGENTS §5.13.

M4-2-S and SBOX-2 are merged dependencies. The issued packet states M4-2-S lacks an independent verdict on main; this receipt supplies none. Independent Claude verdict bound to the exact candidate and separate technical acceptance remain absent. Required next evidence is real PostgreSQL and both browser projects in an environment permitting their normal runtime, followed by independent review. G1/G4, D01–D12, operational/live-provider and release decisions remain unchanged. Founder retains push/merge/release authority.
