# AUDIT-FIX-API-FILE-SHADOW-DETECTION — repair r1 builder receipt

Repair issued 14 October 2026 by dispatcher 5. Builder: Codex. Branch `codex/sandbox/audit-fix-api-file-shadow-detection`. Inspected starting HEAD `1179535548f833ce0d9d20255f7868a47c4bee5d`; origin/main `bd959b01e857de0ba7cbd3588bab84add7d0f493`. Read the complete Opus REPAIR verdict at `/Users/benharwood/.local/share/full-steam/jg-runs/audit-fix-api-file-shadow-detection-opus-1179535.md`, AGENTS.md rev 3.0, BUILD_PLAN.md §§10.2.2–10.2.7 and SV-3/SV-4/SV-5, the detection contract, actual worker/reader/repository and controlled routines in 0128/0132/0133.

**The no-migration repair is implemented.** This supersedes the r0 receipt's migration stop for preventing the stranded state. The stop remains applicable only to completing a new firing after a final-account lock has committed. No independent verdict on this repair, separate technical acceptance, real-PostgreSQL execution or release approval is claimed. The recorded Opus verdict reviewed the starting commit by source inspection only.

All edits are in the working tree. No Git-writing command, staging, commit, checkout, push, merge or release. Intended commit message is overwritten at `/private/tmp/jg-msg-audit-fix-api-file-shadow-detection.txt` for the dispatcher to commit.

## Repair and failing-first evidence

BLOCKING 1: `ShadowDetectionRepository.persist` now persists every group and executes every `surface_shadow_signal_early` call on the same `withTenant` transaction/client, before COMMIT. The helper takes that transaction rather than opening later transactions. The existing tenant/job advisory lock, shadow login, controlled routine, validation, replay identities and SQL refusals remain intact. A new mandatory signal cannot commit held and undisclosed while its firing waits in another transaction. If surfacing fails, `withTenant` rolls back the entire batch, including proposals and any earlier alert effects.

BLOCKING 2: retained `apps/api/src/shadow-detection-lock-race.test.ts` and all four original assertions byte-for-byte. Ran it at starting HEAD before the repair: exit 1, one failed test with four failed business assertions; Decision/firing/disclosure arrays empty and held undisclosed signal. Diagnostic: `early surface requires an unlocked job; DETECTION_LOCKED_JOB`. After repair: exit 0, one passed test. The double was corrected to read/update its own transaction-local uncommitted signal (`inserted ?? signal`), which PostgreSQL already permits. The COMMIT barrier still pauses at the first commit after the signal insert; it now sees the signal plus mandatory effects together. No refusal, expected value or count was changed.

This test executes the actual worker, observation reader and repository with SQL contract doubles. It is a sequencing regression, not a PostgreSQL race proof, provider integration or database effect count. The unchanged retry still refuses the now-locked job. Unit verification does not prove database locking or the SQL audit chain.

## Lock-order argument

1. Batch schemas and explicit tenant/job binding checks constrain every proposal, observation and capture to the same verified tenant and `b.jobId`. The existing transaction-scoped advisory lock serializes detection snapshots/replays for that tenant/job until COMMIT or ROLLBACK.
2. Complete **all** group persistence before the first surface call: signal inserts/updates, survivor evidence links, exclusions and coalescing therefore precede any firing's audit-head acquisition. No next-group persistence occurs after an audit append.
3. `surface_shadow_signal_early` takes the job row `FOR UPDATE` before locking its signal, testing the final-account lock, writing alert effects and appending audits (0133:71 onward). PostgreSQL holds that job row lock until this enclosing transaction ends, including across all later firings and groups.
4. `record_shadow_disclosure` takes the same job row before a signal row and before audit allocation (0128:249 onward). `lock_final_account` takes the job row first (0132:260–262). A concurrent same-job disclosure or final-account lock consequently cannot acquire signal locks or an audit head while waiting behind our first firing. Other detection snapshots wait on the already-held advisory lock. Subsequent firing calls reacquire our own job lock and use already-held or job-fenced same-job signal locks. Replaying an existing firing also acquires the job row before returning its immutable result.
5. Therefore later same-job lock requests after the first firing's audit-head lock cannot form the job/signal-versus-audit wait cycle with these paths: the competing same-job writer is fenced at the job row before it can own the downstream locks. This is a bounded argument for this single-job batch and these controlled paths, not permission to batch arbitrary jobs or a blanket deadlock-free claim. No external business network call occurs in the transaction. Contract paragraph 15 and the repository comment now describe this arrangement rather than claiming separate post-persistence firing transactions.

If the builder lock wins before the first new surface call, 0133's unchanged locked-job refusal raises and the **whole detection transaction rolls back**; it does not commit a new held mandatory signal. If detection wins, the builder lock waits until all signals, Decisions/findings, firings, disclosures, permanent exclusions and audits commit together. A rollback leaves no newly durable batch. No one-transaction-per-group fallback is needed for the above same-job fence; a future path that violates it must be reviewed separately.

**STOP — completing a new firing AFTER lock requires a separately numbered work order**, a forward migration changing the controlled boundary, and an approved post-lock disclosure rule under SV-5. None is invented or issued by this receipt. This repair refuses/rolls back a late batch and prevents a newly stranded state; it does not complete already-stranded historical signals or implement delayed post-lock detection. The reader's existing `DETECTION_LOCKED_JOB` refusal and SV-5 hold remain. Do not relax the routine, grant direct firing inserts, reinterpret post-lock disclosure as before-lock disclosure, or infer fee entitlement to finish that separate work.

## Exact lane, protected sources and compatibility

The lane entry is widened to exactly these five changed paths, with its existing branch and receipt binding preserved:

- `apps/api/src/shadow-detection-lock-race.test.ts`
- `packages/db/src/shadow-detection-repository.ts`
- `docs/contracts/shadow-detection-v1.md`
- `docs/verdicts/AUDIT-FIX-API-FILE-SHADOW-DETECTION/BUILDER_RECEIPT.md`
- `config/agent-lane-assignments.json`

Parsed comparison to starting HEAD proves every other lane entry unchanged. The shared registry edit must serialize with other registrations. No BUILD_PLAN.md edit or adjacent feature bundled. All four original regression assertions are unchanged. `apps/api/src/auth/context-boundary.test.ts` is byte-identical to starting HEAD (SHA-256 `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`). No existing expected value, refusal, count, pinned name, fingerprint or hash is changed.

Affected invariants: AGENTS §§5.1 (verified transaction-local context), 5.4 (atomic durable effects and replay), 5.7 (audit serialization), 5.14 (mandatory disclosure and permanent ineligibility). No migration/backfill, schema/grant/RLS/role change, financial posting, fee rule, prompt/model/parser change, provider request, real data or new operational alert. Standard F: no new grant. Public interfaces and identifiers are unchanged; the private helper's transaction parameter is internal. The entire batch now rolls back on a firing failure rather than retaining held proposals. Rollback strategy: disable detection and forward-fix; reverting this repair restores the known race and is not a safe operational remedy. Existing synthetic-only, D12/D13/G1 and independent-review gates remain.

## Local validation

Dependencies already installed; no package install/download. Existing `/private/tmp/jg-audit-bin/pnpm` wrapper selects cached pnpm 10.28.1. Node 24.17.0 is installed; `.nvmrc` pins 24.15.0, so this is not a clean pinned-install claim. Use `PATH=/private/tmp/jg-audit-bin:$PATH` for pnpm commands below. Temporary full logs are `/private/tmp/jg-shadow-r1-*.log`; durable command/results are recorded here rather than claiming those temporary paths are retained artifacts.

| Command | Result |
|---|---|
| `pnpm --filter @jobguard/api exec vitest run src/shadow-detection-lock-race.test.ts --maxWorkers=1`, before repair | Exit 1; one test / four business assertions failed |
| Same targeted regression after repair | Exit 0; one passed, all four original assertions preserved |
| `pnpm typecheck` | Exit 0; all 7 tasks successful |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; boundary checks and all 7 package lint tasks successful |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (also after receipt rewrite) | Exit 0; exact five-file task scope |
| `pnpm build` | Exit 0; all 7 tasks successful, 4 cached; 31 web pages generated |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | Exit 0; 81 files / 2,445 passed |
| `pnpm --filter @jobguard/db exec vitest run src --maxWorkers=1 --testTimeout=60000` | Exit 0; 5 files / 87 passed; source units only |
| `pnpm --filter @jobguard/ai --filter @jobguard/config --filter @jobguard/storage --parallel exec vitest run src --maxWorkers=1` | Exit 0; AI 5 files / 80 passed, config 1 file / 2 passed, storage 1 file / 1 passed |
| `node --test $(rg --files tools -g '*.test.mjs' \| rg -v 'agent-lane-boundary(-train)?\.test\.mjs$')` | Exit 0; 19 passed; Git-writing fixture suites excluded |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --testTimeout=60000 --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/final-account-lock.isolation.test.ts' --exclude 'src/health.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --exclude 'src/contractor/*.http.test.ts'` | Exit 0; 64 files / 1,552 passed, including the repaired regression |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1 --testTimeout=60000` | Exit 0; 33 files / 784 passed |
| `pnpm openapi:check` | Exit 1; tsx CLI IPC listener refused with `listen EPERM` |
| `node --import tsx src/generate-openapi.ts --check` (apps/api) | Exit 0; same OpenAPI generator/check via loader without CLI IPC |
| Parsed registry/scope/assertion and protected-file comparison against HEAD | Passed; exact lane, every other entry unchanged, original regression assertions unchanged, protected test byte-identical |
| `git diff --check` | Exit 0 |

Turbo reported shared-cache IO permission warnings; successful task exits above are distinct from those warnings. The web build reported the existing workspace-root/CSS autoprefixer/cache warnings. No adjacent configuration or CSS change. `ps` process inspection was sandbox-denied; no escalation or service start attempted.

The root `pnpm test` includes PostgreSQL/HTTP suites and tool-fixture tests that write Git repositories. Those suites remain mandatory in CI; they were not run in this read-only-Git, no-listener sandbox. No PostgreSQL service or browser was started. API exclusions are the existing database/browser/listener suites: `src/shadow-isolation.application.test.ts`, `src/final-account-lock.isolation.test.ts`, `src/health.test.ts`, `src/auth/sso/action-paths.test.ts`, `src/contractor/*.http.test.ts`. Source-only unit discovery avoids generated dist duplicates. CLI test timeout overrides are recorded and do not change any test source or prove the default root suite passes.

## Remaining holds and discovered later

- Post-lock completion: STOP for the separately numbered order described above; requires migration and disclosure policy, including handling historical stranded signals.
- Opus L1: a real-PostgreSQL counterpart exercising the actual final-account command and both lock winners is still needed; the SQL double is not substituted for it. Existing shadow-detection, shadow-persistence and final-account-lock PostgreSQL suites must run in CI. No new integration fixture is claimed in this repair.
- Opus L2: the regression's relative URL imports into DB source/test utilities remain brittle; not changed here.
- Opus L3: previous full logs were temporary; r1's durable evidence is the command/results in this receipt. No claim of retained full-log artifacts.
- Audit LATER 2: AI proposal failure can block deterministic mandatory persistence; untouched.
- Audit LATER 3: multiple valid AI candidates can share a signal identity and reject the batch; untouched.
- Five weak-test notes remain: A/B/A context isolation; startup refusals leave ports untouched; malformed/cross-tenant payloads leave ports untouched; exact-version/tenant terms success/refusal; actual shared-worker composition completion and replay with unique persisted effects. No protected worker or context-boundary test edited.

## Dispatcher / CI follow-up

Dispatcher commits/pushes the working-tree repair, then runs pinned `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm test`, `pnpm build`, `pnpm openapi:check`, `pnpm test:db`, `pnpm test:migrations` and `pnpm test:e2e`, including every excluded local suite. Database and browser suites run in GitHub CI as dispatcher 5 directed. Path-floor classification uses the actual committed diff; retain RED review for the controlled mandatory-effect transaction change.

A different model must record a real verdict against the dispatcher's exact resulting commit; a separate actor must record technical acceptance. This receipt does not accept the builder's own work. Founder/explicitly delegated dispatcher retains push/merge/release ownership.
