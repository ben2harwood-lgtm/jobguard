# FLAKE-DIAG-1 repair receipt — 24 October 2026

Builder: Codex. Uncommitted working-tree repair of PR #308, HEAD `aa8686cd289cdbb1c4f23253b863dadb5a4d3945`, parent `89b7b3d2`. This receipt was written after the implementation and checks below. It is a builder run receipt, not independent review or technical acceptance. The dispatcher owns commit/push; no Git writes were run.

## Changes and invariants

- `SiteVisitRepository.assignedJobs` now materializes current-revision assignments for the verified tenant/member with a set-based EXISTS join before invoking the unchanged `ent3b_visit_authority`. The prefilter is the same predicate as `contractor_job_assigned` in migration 0110. Materialization prevents PostgreSQL from moving authority evaluation before that filter. Authority, RLS, runtime credentials, caller-only open visits, ordering and the 201-row truncation probe remain in place; the limit follows authorization. The query is exported from its implementation module solely for exact-query integration coverage, not added to the public package index.
- The Northside DB regression freezes the old SQL verbatim. On the real 2,000-order command seed, it runs legacy EXPLAIN ANALYZE first, then the replacement, printing JSON plans including timing/buffers. It asserts 2,000 legacy authority calls and fewer replacement calls, compares complete ordered rows and the repository response, and checks inclusion/exclusion individually against authority for every seeded job, requiring both allowed and denied rows and no truncation. This instrumentation is implemented but NOT executed locally; there is no locally measured speedup to report.
- ENT-11a no longer waits on an untimed response promise. It navigates and uses the existing 10-second readiness and job-text assertions. No timeout defaults were stretched. The existing site-extra read-error state is retained: a failed read is not presented as an empty job list.
- M4-1-S routes every proof GET on the test page to 503 throughout the test, including retries after confirmation. Errors remain gated until focus has moved with Tab to the withheld-payment control. The test then requires the alert inside `#work-proof`, preserved focus with a visible keyboard indicator, and the reverse keyboard path. POSTs pass through. No success proof response is fabricated. The existing proof-stage fix is retained unchanged (only failed commands focus errors; background alert stays in its section).
- The lane file gains only the repository, its seeded integration test and this receipt, as authorized by the 24 October repair order. No migrations, commercial-policy changes, API changes, operational alerts or production approvals. Existing data and clients are compatible; rollback is a source revert, with no data migration.

## Executed checks

All checks ran sequentially. Turbo used `--concurrency=1`; Vitest used `--maxWorkers=2`. Sampled 1-minute load stayed below 20 (approximately 3–6), so no load wait was required. Node `v24.17.0`; installed pinned pnpm `10.28.1`; existing dependencies only, no install/download.

The global pnpm launcher stalled selecting a version. After stopping it, commands used a temporary PATH shim pointing to the already installed `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. The shim lives in `/private/tmp/jg-flake-repair-vgn7r6cr` and changes no repository configuration. Raw logs are `/private/tmp/flake-diag-1-*.log`.

| Command | Result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | PASS, 7 packages (2 cached) |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | PASS, boundary checks and 7 packages (2 cached) |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS against origin/main, including working-tree files |
| `pnpm build --concurrency=1` | PASS, 7 packages (4 cached), including production Next build |
| `pnpm turbo run test --concurrency=1 --filter='!@jobguard/db' --filter='!@jobguard/api' -- --maxWorkers=2 --exclude '**/dist/**'` | PASS: core 2,946; storage 2; config 41; AI 147; web 867 = 4,003 tests, 183 files |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --exclude '**/shadow-isolation.application.test.ts' --exclude '**/final-account-lock.isolation.test.ts' --exclude '**/*.http.test.ts' --exclude '**/health.test.ts' --exclude '**/auth/sso/action-paths.test.ts'` | PASS: 2,049 tests, 117 files |
| `pnpm --filter @jobguard/api exec vitest run src/final-account-lock.isolation.test.ts --maxWorkers=2 -t 'DW8 application read'` | PASS: 2 unit cases; real-DB case skipped by name filter |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'` | PASS: 638 tests, 72 files |
| `node --test --test-concurrency=1` on the 12 tools test files excluding the three Git-writing fixture files | PASS: 45 tests; exact expanded command in `flake-diag-1-tools.log` |
| `pnpm openapi:check` | BLOCKED: tsx CLI's IPC listener gets `listen EPERM` before checking the schema |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS: same OpenAPI check without the CLI IPC listener |
| `git diff --check` | PASS |

Total passing selected unit/tool tests: 6,692 Vitest + 45 Node tests. This is not a claim that unrestricted `pnpm test` passed.

Earlier diagnostic runs are retained in the logs, not hidden:

- The initial turbo unit run without the dist exclusion failed 5 compiled tests in 4 `packages/core/dist` files: those source-inspection tests try to read adjacent `.ts` sources from dist. Source copies passed. The source-only repeat above passed; no test source was weakened or removed.
- The broad API run (excluding only shadow-isolation) failed 8 files, with 129 failed / 2,077 passed / 1 skipped. HTTP cases emitted `Error: listen EPERM: operation not permitted 0.0.0.0`; the mixed final-account-lock file also imports a real PostgreSQL fixture dynamically. A subsequent run excluding socket files still failed that DB fixture (2,051 passed / 1 skipped); the final DB-free selection passed, and its two pure cases were separately run successfully.
- Three tooling files were not run: `agent-lane-boundary.test.mjs`, `agent-lane-boundary-train.test.mjs`, `merge-churn.test.mjs`. They create Git fixture commits, excluded under the dispatcher's no-Git-writes instruction. `free-port.test.ts` binds sockets and was excluded. Full DB, migration and browser suites require CI.

## Pending evidence — HOLD, not a pass

No PostgreSQL or browser suite was started. The dispatcher states this sandbox cannot bind localhost or start PostgreSQL, and port 3000 belongs to an unrelated process which was not touched. This also prevents the requested pre-change DB timing measurement; the regression will measure the frozen baseline before the replacement in CI.

The parent-component counterexample is PREPARED, NOT EXECUTED. Scratch-only copies of the rewritten M4-1-S spec and `aa8686cd^:apps/web/app/ui/proof-stage.tsx` are in `/private/tmp/jg-flake-parent-counterexample-ick01yxw` (see STATUS.txt). This is a two-file counterexample overlay, not a runnable independent checkout. No scratch file is committed. There is **no failing Playwright output** to attach from this environment. Source inspection shows the parent focuses every error and replaces the section with the alert; that is not executed browser proof.

Before acceptance the coordinator must:

1. Run `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/northside-demo.integration.test.ts` in CI, retaining both printed EXPLAIN plans, invocation counts and all seeded equivalence assertions. Run the existing site-visit authority/adversarial DB suites and the mandatory full DB/migration checks.
2. Run ENT-11a and M4-1-S on both Playwright projects repeatedly after push, preserving trace/output. Local green unit checks do not replace this evidence.
3. In a full scratch copy of the repair, replace only `apps/web/app/ui/proof-stage.tsx` with `git show aa8686cd^:apps/web/app/ui/proof-stage.tsx`, keeping the rewritten spec. Build there and run `M4-1-S.spec.ts --grep 'opens and manages'` on both projects. Attach its actual failing alert/focus output and verify the repaired component passes. The current receipt cannot claim the requested negative control was proved.
4. Obtain new independent Claude verdicts bound to the dispatcher-created commit, then separate technical acceptance. Prior REPAIR verdicts and CI run 40034569775 are context supplied by the repair order, not new verification.

## R3 — function-scan counter repair, 24 October 2026

Uncommitted repair of PR #308 at HEAD `91def9691273472acc4b64c26d22f9e1eee60398`, responding to the single blocker reported by both Claude reviewers in the dispatch order. This is a builder receipt, not an independent verdict or acceptance. Only the Northside integration test and this receipt change.

The EXPLAIN walker now identifies the authority scan by `"Function Name": "ent3b_visit_authority"`, independent of PostgreSQL's alias renaming. The optimized invocation count must equal the number of current work orders assigned to the switched operative, counted from tenant-scoped work-order/current-revision/assignment rows (58 in the dispatched seed evidence, not hard-coded). The count must be positive and smaller than the unchanged 2,000-call baseline. Complete ordered row equality, all 2,000 individual allowed/denied membership comparisons, the no-truncation assertion and the repository response comparison remain intact after this repaired assertion. Their execution on the repaired test still requires real PostgreSQL in CI; local unit results do not prove them.

Checks ran one at a time using the existing temporary pnpm PATH shim and installed dependencies, with Turbo `--concurrency=1` and Vitest `--maxWorkers=2`. Sampled one-minute load was approximately 4–6, below 20; no load wait was required. Node `v24.17.0`, pnpm `10.28.1`. Logs: `/private/tmp/flake-diag-1-r3-*.log`.

| Command | R3 result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | PASS: 7 packages, 2 cached |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | PASS: boundary checks and 7 packages, 2 cached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS against origin/main, including working-tree files |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'` | PASS: 638 tests in 72 files; socket-binding free-port test excluded |
| `pnpm build --concurrency=1` | PASS: 7 packages, 4 cached, including production Next build |
| `pnpm openapi:check` | BLOCKED before schema check: tsx CLI IPC listener receives `listen EPERM` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS: same OpenAPI check without CLI IPC listener |
| `git diff --check` | PASS |

No runtime SQL, migrations, production behavior, authorization, commercial policy, dependencies or other tests changed. No new operational alerts or compatibility impacts; rollback is a source revert. No database or browser suite was started because the dispatcher identifies localhost/PostgreSQL as unavailable in this sandbox. After dispatcher commit/push, CI must run the repaired Northside PostgreSQL regression and retain its plans/counts and full equivalence results; exact-head independent review and separate acceptance remain pending. The dispatch order reports prior CI green for ENT-11a and M4-1-S; this receipt makes no new browser verification claim. No Git-writing commands or downloads were run. Intended commit message is `/private/tmp/jg-msg-flake-diag-1.txt`.
