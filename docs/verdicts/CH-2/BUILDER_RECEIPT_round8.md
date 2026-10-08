# CH-2 round 8 — builder receipt, 7 October 2026

Task: BUILD_PLAN.md §8 CH-2, C1–C8; same PR #97 and branch `codex/sandbox/ch-2`.
Starting head: `5610a6fed119892d421b14fbc5d4e6900208b66a`.
This receipt describes that head plus the uncommitted round-8 working-tree repair. The dispatcher must bind the next independent verdict to the commit it creates; this is a builder receipt, not acceptance or independent review. No git add/commit/checkout/push, merge or PR creation was performed here.

## Decisions and scope

**Ben's decision, Command Center, 7 October 2026: “keep triggers”.** Database enforcement of previous-schema writers stays. The reservation trigger now tries the command-id advisory transaction lock with `pg_try_advisory_xact_lock`; contention raises `IDEMPOTENCY_CONFLICT`, SQLSTATE `23505`, without waiting after the previous writer's audit append. Current claims still block safely before audit. No trigger, grant, RLS, owner-role, identity-stamping, kind, event-subject, event-uniqueness or payload-hash check was removed.

Ben's merge-ahead ruling (5 October, `jobguard-merge-ahead-of-103-2026-10-05`) and the integrator's assignment move CH-2 from reserved 0050 to **0096**. 0053 is merged; 0054–0093 remain reserved; 0094 belongs to SBOX-SESSION-1, 0095 to CH-3a, 0097 to M4-1-S-R, 0098 to M0-6L and 0099 to M4-5-S. Exactly the requested paragraph was added to BUILD_PLAN.md §12.2; no other plan text was changed. The lane replaces the old SQL path with the new one and adds BUILD_PLAN.md; `docs/verdicts/CH-2/**` was already allowed. No other lane is widened.

Synthetic data only. No live provider, external send, spend, production mode, decision approval, entitlement or fee change. Money remains integer pence; no new money arithmetic, environment variable, provider route, operational alert or prompt/model change. No tests were deleted or skipped, and no timeout was added or increased.

## Findings addressed in this round

| Finding | Change and coverage | Evidence boundary |
|---|---|---|
| Opus P2-1 / Sol mixed-version deadlock | `0096_watchdog_live.sql`: non-blocking trigger id lock, same 23505 error. Added two schedules in `watchdog-legacy-identities.integration.test.ts`: the previous `ReadinessRepository.record` order (count, replay lookup, real audit append, planned-work insert) runs as the runtime role against the real current readiness repository. PostgreSQL `pg_blocking_pids` proves which statement waits. Claim-first requires previous writer 23505 and current commit; legacy-first requires previous commit and current typed identity conflict. Both require one planned-work effect, the expected claim count and no 40P01. | Written before the fix; PostgreSQL execution, including a red run on the starting SQL, is pending CI. Local source regression demonstrates blocking SQL at the starting head and passes after the repair; it does not prove PostgreSQL locking. |
| Opus P3-1 | MIGRATIONS.md explicitly limits this ownership guarantee to READ COMMITTED (`withTenant` uses plain BEGIN). It explains the stale-snapshot gap for handwritten REPEATABLE READ/SERIALIZABLE transactions. | Documentation choice permitted by the task; no isolation-policy change was invented. |
| Opus P3-2 / Sol proof replay | MIGRATIONS.md documents the known pre-upgrade completion limit: preceding application `decisionId` hashing differs from current `deriveDecision:true`; application replay returns 409, without a second effect. Original-request repository replay remains supported. | No new authenticated compatibility path. This is the explicitly permitted documentation resolution, not a claim that cross-upgrade application replay now succeeds. |
| Opus P3-3 / Sol conflict 500 | Both ordinary identity-conflict throws in `watchdog.ts` now use `WatchdogError("IDEMPOTENCY_CONFLICT")`. Nest maps that type to 409 and preserves JOB_NOT_FOUND 404. Next's existing message-based conflict mapping already returns the same 409/code. Controller and generated OpenAPI schemas retain JOB_NOT_LIVE and add IDEMPOTENCY_CONFLICT. | Real claim function plus real Nest exception dispatch, using a query double and no socket, tests changed payload/kind/job and legacy ownership. Browser coverage adds changed kind/job to the existing changed-payload case for Next; pending CI. Query doubles are not PostgreSQL proof. |
| Opus P3-4 | Renamed SQL to 0096, registered it last after 0053, updated active references/regex markers, owner target, upgrade cutoff, bootstrap description and UIWIRE-12 upper bound. Migration count stays 45. Historical receipts keep their original facts. New registry assertions require sorted/unique 45-file list ending 0053 then 0096; owner upgrade asserts that exact preceding schema. | Source/registry checks plus pending real database upgrade suites. The SQL changes only the requested lock fix, corrected lock commentary and its own number marker. |
| Opus P3-5 | This receipt includes the entire first-parent range cb3d722…5610a6f and this repair. | Fourteen entries: main merge plus thirteen following cloud commits. Historical reported tests are attributed below; absent command/exit records are not invented. |

The earlier legacy-identity test's first schedule now asserts immediate refusal while the claimant remains open, rather than waiting for its commit. Its conflict and reverse-order waiting assertions remain. This updates the intentional behavior required by “keep triggers” and the non-blocking fix; the original guarantee of one effect is retained and strengthened by the new audit-first cases. The shared replay harness and all earlier contract cases remain intact.

## Commits after round 7 — historical record

Source inspected: `git log --first-parent --format='%h%n%B' cb3d722^..5610a6f` and affected source/diffs. This table reports prior commit messages, not tests rerun by this builder. Where only “green” and counts were recorded, exact command invocations and process exit codes are **not recorded in the available commit evidence**. Earlier round-7 commands/exit codes remain in its original receipt.

| Commit | Change | Test evidence reported in its commit message |
|---|---|---|
| cb3d722 | Merged main a5ed99a (SH-1); preserved both migrations/exports/docs/lanes and adjusted counts to 45. | No new run receipt in message. |
| cdcdfd9 | Previous-schema watchdog fixture explicitly stops before CH-2 instead of dropping the last registered migration. | Watchdog 37/37 reported. |
| 1434b50 | Proof answer recorded in the command transaction via completing hooks and recordIn; injected answer-store failure rolls back effect. | New integration red on cdcdfd9, green after repair; DB 357, API 133, web 63; lint/typecheck green reported. |
| 1207080 | Finalisation COMMAND_CONFLICT maps to application CONFLICT (409), preserving other refusals. | Unit cases in watchdog-registry; no numeric run/exit receipt in message. |
| cc8e1ed | Previous-schema stores reserve IDs with the same lock as claims; kind/job protection at database boundary. | Two integration cases red before/green after; DB 359, migrations 11, API 135, web 63, lint/typecheck green reported. This round fixes its audit-first blocking case. |
| 00853d7 | Deferred supplier-match check binds exact create/correct kind to audit event. | New case red on cc8e1ed; DB 360, migrations 11, API 135, web 63, lint/typecheck green reported. |
| ab10e6c | Only confirmed/corrected events qualify; unknown events unclaimable; corrected historical replay fixture. | New case red on 00853d7; DB 360, migrations 11, API 135, web 63, lint/typecheck green reported. |
| 9ac05bd | Revision must cite its own proposal event; owner-safe existing-row scan/pre-deploy query; restore FORCE RLS. | Wrong-subject and planted-upgrade cases red on ab10e6c; DB 361, migrations 11, API 135, web 63, lint/typecheck green reported. |
| 35ac67a | UNIQUE(tenant_id,audit_event_id), preventing borrowed events and refusing bad upgrades. | Borrowed-event case red on 9ac05bd; DB 361, migrations 11, API 135, web 63, lint/typecheck green reported. |
| d2e538a | Corrected event's payload hash must attest its own revision, including upgrade/pre-deploy scans. | Wrong-hash case red on 35ac67a; DB 361, migrations 11, API 135, web 63, lint/typecheck green reported. |
| 34a5341 | Only the claiming transaction can add effects under an already claimed ID; initially used a session setting. | Completed seed/create previous retries refused; DB 361, migrations 11, API 135, web 63, lint/typecheck green reported. Its ownership mechanism was strengthened by the next three commits. |
| 3f03327 | Ownership comes from database xmin, not a forgeable setting; uniquely keyed idempotent re-inserts remain compatible. | Forged setting and later replay cases red on 34a5341; DB 361, migrations 11, API 135, web 63, lint/typecheck green reported. |
| 989c6e6 | Non-wrapping xid8 claimed_xact replaces 32-bit xmin comparison. | Ownership cases remain green; wraparound itself not simulated; DB 361, migrations 11, API 135, web 63, lint/typecheck green reported. |
| 5610a6f | Stamp claimed_xact in BEFORE INSERT, overriding forged supplied values. | Forged claimed_xact case red on 989c6e6; DB 362, migrations 11, API 135, web 63, lint/typecheck green reported. |
| Round-8 working tree (dispatcher commit pending) | Non-blocking trigger, typed conflict, tests, 0096 renumber and ledger/docs/receipt. | Actual local commands below; database/browser gates pending. |

The supplied independent Opus verdict attributes `pnpm typecheck`, lint with genuine PR metadata, core/API/tool tests and its PostgreSQL probe to exit 0 at 5610a6f. It reports GitHub run 37523015515 checks/secrets green (359 PostgreSQL tests, 174 browser tests, build) and dependency-review red. These are reviewer/CI reports at the **old head**, not evidence for this working tree; the different historical DB counts are preserved rather than silently reconciled.

## Local execution — this builder

Environment: macOS arm64, Node 24.17.0, existing installed dependencies. The default pnpm launcher attempted version resolution and was interrupted (130); no install/download was requested. Subsequent pnpm commands use the already installed pinned 10.28.1 entry point from `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`, via a temporary PATH shim in `/private/tmp/ch2-bin`. No tracked package-manager or dependency files changed. A clean reinstall was not performed.

| Command actually run | Exit | Result |
|---|---:|---|
| `apps/api/node_modules/.bin/vitest run apps/api/src/watchdog-registry.test.ts` (first test-only draft on unchanged 5610a6f) | 1 | 27 pass, 5 fail. Three new Nest cases first exposed an incomplete test host; added its missing getArgByIndex before using the red evidence below. |
| `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts` (corrected test-only red run on unchanged 5610a6f) | 1 | 26 pass, 6 fail: changed payload/kind/job received **500 / Internal server error**, legacy conflict was ordinary Error, blocking-trigger source failed; one existing registry test exceeded its unchanged 5000ms limit. |
| `pnpm typecheck` (first repair run) | 2 | Test result union needed narrowing before Nest dispatch. Fixed the test typing; no assertion change. |
| `pnpm typecheck` (final) | 0 | 7/7 tasks; existing dependency-task cache hits, DB/API/web checks executed. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed; local lane checker rejects the explicitly authorized deletion of 0050 after the lane was changed to grant only 0096. It checks working-tree deletions as well as new paths. |
| `pnpm lint:lanes` | 1 | Same sole forbidden path: `packages/db/migrations/0050_watchdog_live.sql`. No self-comparison or detached-head workaround was used. |
| `pnpm turbo run lint` | 0 | All 7 package lint tasks pass. |
| `node tools/core-purity-lint.mjs`; `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | 0 each | All remaining repository guards pass; lane policy was not bypassed or weakened. |
| Deterministic prospective-PR scope check, using the unchanged exported lane matcher on `git diff --name-only --no-renames origin/main --` plus untracked files | 0 | Every prospective PR path is allowed, including 0096 and the receipt. Unlike the local per-working-tree checker, this does not include an old migration that never existed on origin/main. This is a separate deterministic scope check, not a green `lint:lanes` result. |
| `pnpm build` | 0 | 7/7 tasks; DB/API/web rebuilt. Next production build completed. |
| `pnpm --filter @jobguard/core test` | 1 | 632 pass, 8 existing timeout failures across source and generated-dist copies, under parallel worker/build contention. No test changed. The subsequent wrapper was interrupted (130) after this core result, before other suites completed. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` (during build) | 1 | 317 pass, 3 existing 5000ms timeouts; 38 source files. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` (retry with build finished) | 1 | 317 pass, the same 3 existing 5000ms timeouts / 38 files; no build running. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` | 0 | 63 tests / 8 files. |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts test/verify-evidence-pack-cli.test.ts --maxWorkers=1` | 0 | 7 tests / 2 files; no database server or provider used. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` | 1 | 140 pass, 1 fail / 16 files; only health.test.ts fails with sandbox `listen EPERM` and its associated unhandled socket error. The new regression and registry cases pass. |
| `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts --maxWorkers=1` (after dependency rebuild/OpenAPI generation) | 0 | 33/33; all new conflict/source/registry tests green. |
| `node --test tools/*.test.mjs` | 0 | 42 tests. |
| `node --import tsx src/generate-openapi.ts` (cwd apps/api) | 0 | Regenerated the API specification using the socket-free Node entry point. |
| `node --import tsx src/generate-openapi.ts --check` (cwd apps/api) | 0 | Specification matches. |
| `ts.transpileModule` syntax check of the new PostgreSQL test | 0 | Syntax transpiles; not semantic checking or database execution. |
| `git diff --check` | 0 | No whitespace errors. |

An intermediate post-edit API run (exit 1; 27 pass / 6 fail) was launched before dependency rebuild and OpenAPI generation finished, so it loaded stale runtime exports (including the old 44-file migration registry) and old specification. The full later API run proves the rebuilt conflict/registry cases pass. It is not presented as a repaired-code regression failure or hidden from the receipt.

The core timeouts are in unchanged, out-of-lane `packages/core/src/extra-origin.test.ts:33`, `packages/core/src/receipt-allocation.test.ts:125` (2000-line case) and `packages/core/src/receipt-allocation.test.ts:212`. No longer timeouts, skips or weaker assertions were introduced. If an implementation/performance repair is required, it belongs to the appropriate SH-1 follow-up with `packages/core/src/extra-origin.ts` / `packages/core/src/receipt-allocation.ts` and those tests; this lane does not grant those paths. CI must resolve final-head execution evidence.

Turbo emitted sandbox cache-write IO warnings; successful commands still completed with exit 0. Next emitted its existing multiple-lockfile/workspace-root warning. Neither warning was patched outside the lane.

## Remaining gates and follow-ups

- **CI pending:** actual `pnpm test:db`, `pnpm test:migrations`, the new two-connection PostgreSQL cases in both schedules (and their red proof against starting SQL), and all browser journeys in both projects. None ran here: dispatcher explicitly states this sandbox cannot bind localhost/start PostgreSQL. All tests are written, not skipped. A source check or query double is not a PostgreSQL execution verdict.
- **Independent verdict and separate acceptance pending:** the supplied Opus/Sol REPAIR verdicts bind 5610a6f, not this repair. No new recorded independent verdict or acceptance is claimed. C8 stays held until final-head CI/security and independent review/acceptance evidence exist.
- **Inherited dependency-review remains a separate security task:** `proxy-addr@2.0.7`, `sharp@0.35.4`, `source-map-js@1.2.1` were reported vulnerable at the old head. Remediation would touch `pnpm-lock.yaml` and potentially `package.json` / `apps/api/package.json` / `apps/web/package.json`, outside this lane; none was changed and no audit was weakened. The new head still needs security CI.
- READ COMMITTED assumption and pre-upgrade proof application 409 limit are documented resolutions, not waived claims of stronger isolation/replay support.
- Renumber deployment: 0096 is unmerged synthetic DDL, not a migration to apply twice to a database that already recorded 0050. Rebuild isolated synthetic fixtures for those branch installs. Normal fresh and preceding-schema upgrade retain all enforcement; rollback retains 0096 under the preceding application. No production data or migration receipts were rewritten.
- Merge order remains the requested ledger rule: if another lower-numbered PR merges first, CH-2 follows it or renumbers again. Dispatcher must commit this working tree and run final-head CI; this agent must not push or merge.
