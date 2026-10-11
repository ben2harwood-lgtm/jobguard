# ENT-10b-OPS builder receipt

Builder: Codex GPT-6.1 Sol (assigned builder in the issued order). Working-tree implementation only, 11 October 2026. Base and current HEAD: `4564e888b85aba559c542e935e52fe9f78769595`; origin/main is the same commit. Branch: `codex/sandbox/ent-10b-ops`. No commit was made: .git is read-only and the dispatcher owns the commit. Intended message: `/private/tmp/jg-msg-ent-10b-ops.txt`.

Authority: issued ENT-10b-OPS header, C-OPS-1 through C-OPS-5 and the integrator's Q1–Q7 answers. The header's required operator label and owner refusal detail supersede the draft's fixed-actor-only later item and omission of user detail. No adjacent task was added. The integrator confirmed exclusive editing ownership of the five shared files; no overlap was found in this working tree.

Builder receipt only — not independently verified, not accepted.

## Result and invariants

The existing all-company checkpoint helper skips existing heads, returns only inserted rows and refuses a different stored hash at the newest sequence. The new shell command is synthetic-only, requires the database-owning login and existing migration/runtime memberships, locks each company's audit head before fresh reads, appends the operator hand-off event and records/copies its checkpoint atomically. Repeats with no new events roll back and emit `nothing to do`. Failure is scoped to its company; the next company is handled. The dedicated connection is destroyed and its pool ended on exit.

No migration; no database object, grant or role membership added or changed. This refers to product implementation. The disposable PostgreSQL test provisions its fixture logins through the existing bootstrap and uses a test-only failure trigger that is removed afterwards; it also seeds control-row faults through its setup connection. It adds no deployment migration or runtime right.

The operator records `references.operator` and `references.sessionUser` in the existing `audit.v1` payload; when is the merged appender's stored `occurred_at`. Neither the event shape nor hash rule changed. Operator is validated at both function and CLI boundaries. The function module exports `runAuditCheckpointHandoff`, `AuditCheckpointHandoffError`, `AuditCheckpointHandoffCode` and `AuditCheckpointHandoffResult`; the CLI module exports `runAuditCheckpointHandoffCli` for tests and executes it only as the direct entrypoint. No new symbol is exported by the shared DB index or package exports, and no application file imports the new modules. The existing copy helper's parameter accepts a transaction client with its body unchanged. The application retains only its pre-existing shared exports.

Affected invariants: restricted checkpoints, append-only audit, tenant separation, transaction-local scope, unchanged runtime privileges, synthetic gating, command-line input validation, repeated/concurrent execution and truthful review evidence. No commercial action, provider call, request handler, UI workflow, worker or scheduler was added. No new operational alert was introduced; failed company outcomes and the non-zero CLI status are the operator's failure signal. Compatibility: the old helper retains its signature but returns only rows it inserted, so repeated idle calls now return an empty array. Root script added once; no dependency, lockfile, engine or package export changed.

## Changed files

- `config/agent-lane-assignments.json`
- `packages/db/src/audit.ts`
- `packages/db/src/audit-export-repository.ts`
- `packages/db/src/audit-checkpoint-handoff.ts`
- `packages/db/src/audit-checkpoint-handoff-cli.ts`
- `packages/db/src/audit-checkpoint-handoff.test.ts`
- `packages/db/test/audit-checkpoint-handoff.integration.test.ts`
- `package.json`
- `DEPLOY.md`
- `docs/contracts/audit-export-v1.md`
- `docs/verdicts/ENT-10b-OPS/BUILDER_RECEIPT.md`

## Definitions — BUILT

- **Checkpoint:** one row of `audit_control.checkpoint` `(tenant_id, sequence, event_hash, recorded_at)`: a statement that at `recorded_at` the tenant's chain held the event with that sequence and hash. Immutable; only the migration role can read or write it.
- **Hand-off row:** one row of `app.audit_export_checkpoint`: a copy of one checkpoint that the runtime role may read for its own tenant and can never write.
- **The audit-checkpoint hand-off:** the two-step act, for one tenant, of (1) recording a checkpoint and (2) copying it into a hand-off row. Export creation needs at least one hand-off row for the tenant.
- **Audit head:** the tenant's row in `audit_control.audit_head` (the sequence and hash of its newest event). **Head lock:** the row lock `app.lock_audit_head()` takes; every appender takes it.
- **No new events:** a tenant has no new events exactly when a hand-off row exists whose `(sequence, event_hash)` equals the tenant's audit head. Decided only AFTER the head lock is held, by a fresh statement.
- **Hand-off event:** the single audit event this command appends for a tenant in an effective run, defined below. The checkpoint is taken AT this event, so the record of the hand-off is itself inside the checkpointed chain, and the next run finds no new events.
- **Disagreement:** for a tenant, any of: the audit head differs from the tenant's newest event; a checkpoint or hand-off row whose sequence has no event of that tenant, or whose hash differs from that event's hash.
- **Outcome (per tenant, per run):** `handed_off` (exactly one hand-off event, one checkpoint and one hand-off row were committed together), `unchanged` (no new events; nothing written), `failed` (nothing written for that tenant; carries a code).
- **Owner login:** the PostgreSQL login in `MIGRATION_DATABASE_URL`. **Runtime login:** the one in `DATABASE_URL` (`jobguard_runtime`). **Operator:** a person with a trusted shell holding the deploy variables.
- **Synthetic gate:** `JOBGUARD_ENV` is exactly `synthetic_demo` AND the URL's database name is exactly `jobguard_synthetic_demo` AND, once connected, `current_database()` is that name.

The exact hand-off event additionally carries `references.operator` and `references.sessionUser` under C-OPS-4. Its actor remains `operations:audit-checkpoint-handoff`. These definitions are implemented in the command and documented in the contract; database guarantees remain NOT RUN here.

## Hand-off event — BUILT

The operator uses the merged appender, which stores its own server time and hashes this unchanged audit.v1 shape. The exact event call is:

```ts
    const [event] = await appendAuditBatch({ $client: client } as TenantTransaction, [{
      id: randomUUID(), version: "audit.v1", actorRef: "operations:audit-checkpoint-handoff",
      eventType: "audit.checkpoint.handed_off", subjectType: "audit-checkpoint", subjectRef: tenantId,
      payload: { references: { environment: "synthetic_demo", priorSequence: head.sequence, operator, sessionUser },
        hashes: { priorHead: head.event_hash }, classifications: { action: "security" } },
    }]);
```

## C-OPS acceptance evidence

| Criterion | Build / test evidence | Execution |
| --- | --- | --- |
| C-OPS-1 | U: request source and API registrations cannot name or import the operator entry. It scans all API/web source and all other DB source, plus package export shape. | BUILT; passed |
| C-OPS-2 | U: runtime login refusal; another login refusal names owner/migration. D: runtime and another login fail before writes and cannot assume migration. Identity compares session_user to actual database owner before BEGIN. | BUILT; U passed; D NOT RUN |
| C-OPS-3 | D: same connection has empty company setting after commit and forced rollback and is destroyed. U also asserts release(true), pool end and only local settings. | BUILT; U trace passed; D NOT RUN |
| C-OPS-4 | U: required bounded operator; stored session user/server time; missing/invalid CLI flags; nothing-to-do output. D A5/A6 assert identical second-run snapshots and exact event/operator/server time. | BUILT; U passed; D NOT RUN |
| C-OPS-5 | U A15 hashes; untouched merged context-boundary test: 145 passed. No verified context is constructed or received by the command. All pinned source remains byte-identical. | BUILT; passed |

U = `packages/db/src/audit-checkpoint-handoff.test.ts`; D = `packages/db/test/audit-checkpoint-handoff.integration.test.ts`. BUILT means source and test written, not database verification or acceptance.

## A1–A15 acceptance evidence

| ID | Status / evidence |
| --- | --- |
| A1 | BUILT; D NOT RUN. D: second checkpoint export returns empty and changes no rows. At base the second call would raise 23505 (original INSERT and primary-key inspection); no base PostgreSQL run is claimed. |
| A2 | BUILT; D NOT RUN. D: checkpoint export returns only the company with a new event. |
| A3 | BUILT; D NOT RUN. D: concurrent checkpoint exports resolve with one record per newest sequence. |
| A4 | BUILT; D NOT RUN. D: different stored hash fails verification while true other-company records stand. |
| A5 | BUILT; D NOT RUN. D: effective run followed by unchanged run has identical snapshots. U: unchanged has no inserts and closes its sole connection (passed). |
| A6 | BUILT; D NOT RUN. D: only A advances with the exact hand-off event, operator and stored server time; row-count deltas and every handed-off chain verify. |
| A7 | BUILT; D NOT RUN. D: two simultaneous operators create only one hand-off; two operators demonstrably wait on the held head then serialize (two distinct backend IDs). |
| A8 | BUILT; D NOT RUN. D: selected company leaves B untouched and runtime cannot insert either company's controls; B still needs its checkpoint; cross-company reads and control-schema access tested. |
| A9 | BUILT; D NOT RUN. D: runtime and another login fail before writes and cannot assume migration; catalog compared before/after including all objects and roles. U runtime refusal passed. |
| A10 | BUILT; D NOT RUN. D: export goes from required to signed and includes the hand-off, both files keep verifying. |
| A11 | BUILT; D NOT RUN. D: failing copy rolls back event and controls together, other company proceeds; after trigger removal X succeeds once. U copy failure gives not-ok JSON and exit-status 1 (passed). |
| A12 | BUILT; D NOT RUN. D: above/different checkpoint disagreement writes nothing for X and handles B; audit head and hand-off hash disagreements fail closed. |
| A13 | BUILT; D NOT RUN. U modes, URL targets, malformed inputs, connected target and unknown tenant passed. D actual database target and unknown tenant refusal written. |
| A14 | BUILT. U trace/order/local settings, no-insert disagreement/idle paths, rollback, one redacted JSON line and failure code/status cases all passed. CLI direct entry assigns the returned status to process.exitCode. |
| A15 | BUILT. U merged regression and boundary file hashes passed. Existing verifier 14 passed; existing API audit-export application 14 passed after dependency build; context boundary 145 passed. Merged PostgreSQL/browser regressions remain NOT RUN; no merged assertion changed. |

## Exact E1

```ts
/** Migration/assurance credentials only. Returns only newly recorded checkpoints; idle heads are skipped.
 * A different stored hash at a newest sequence fails verification; true records inserted by this call remain. */
export async function exportAuditCheckpoints(pool: Pool): Promise<AuditCheckpoint[]> {
  const result = await pool.query<AuditCheckpoint>(`INSERT INTO audit_control.checkpoint
    (tenant_id, sequence, event_hash)
    SELECT DISTINCT ON (tenant_id) tenant_id, sequence, event_hash FROM app.audit_event
    ORDER BY tenant_id, sequence DESC
    ON CONFLICT (tenant_id, sequence) DO NOTHING RETURNING tenant_id AS "tenantId", sequence::int,
    event_hash AS "eventHash", recorded_at AS "recordedAt"`);
  const disagreement = await pool.query(`SELECT 1 FROM (
    SELECT DISTINCT ON (tenant_id) tenant_id, sequence, event_hash FROM app.audit_event
    ORDER BY tenant_id, sequence DESC
  ) newest JOIN audit_control.checkpoint c ON (c.tenant_id,c.sequence)=(newest.tenant_id,newest.sequence)
    WHERE c.event_hash <> newest.event_hash LIMIT 1`);
  if (disagreement.rows.length) throw new AuditVerificationError("Stored checkpoint differs from the newest event");
  return result.rows;
}
```

## Exact E2

Only these two declarations changed; the copy function body is byte-identical:

```ts
import type { Pool, PoolClient } from "pg";
export async function handoffAuditExportCheckpoint(assurancePool: Pick<Pool | PoolClient, "query">, checkpoint: AuditCheckpoint): Promise<void> {
```

## Executed commands and observed outcomes

Dependencies were already installed; no install or package download was performed. Node `v24.17.0`. The normal pnpm launcher stalled during initial version inspection and was interrupted (exit 130); the version was therefore not claimed from that invocation. Subsequent commands use the already cached, pinned pnpm `10.28.1` executable through a temporary PATH shim at `/private/tmp/jg-ent-10b-ops-bin/pnpm`. This avoids the machine's unrelated global pnpm launcher. No repository configuration was changed for the shim.

Test runs were sequential, never over three files and used `--maxWorkers=2`. No repository/package-wide test suite was invoked. Root typecheck, root lint and root build each ran once; targeted DB build is the separate command required by the order. The corrected code was then compiled successfully by the targeted/full builds and by all seven package lint/compiler checks. The original root typecheck result is retained, not relabelled as passed.

| Command | Exit | Observed result |
| --- | --- | --- |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/audit-checkpoint-handoff.test.ts` (failed-first, both test files written, command absent) | 1 | 1 suite failed; 0 tests loaded; cannot find `./audit-checkpoint-handoff.js`. |
| Same unit command (development, before prerequisite build) | 1 | 1 suite failed; 0 tests loaded; failed to resolve `@jobguard/core` from `demo-seed.ts`. |
| `pnpm typecheck` | 2 | 4 cached tasks succeeded; DB reported TS2379 in the CLI's spread of an optional UUID. Corrected by conditionally including tenantId; final builds and compiler checks pass. Not rerun under the once-only limit. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed (129 files); lane check stopped before package lint: `Missing branch or self-comparison range; refusing a misleading pass.` HEAD equals origin/main and .git cannot be written. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same self-comparison refusal. No checker was weakened or altered. Dispatcher must rerun after committing. |
| `pnpm turbo run build --filter=@jobguard/db...` | 0 | 3 tasks successful, 2 cached; DB compiled, including the new unit file. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/audit-checkpoint-handoff.test.ts` (final) | 0 | 1 file, 15 passed. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/verify-audit-export-cli.test.ts` | 0 | 1 file, 14 passed, unchanged. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts src/audit-export/audit-export.application.test.ts` | 1 | Context boundary: 145 passed, unchanged. Audit-export application: failed to load `@jobguard/config` from `sso.contracts.ts` because its build was absent. No assertion failed. |
| `pnpm build` | 0 | 7 tasks successful, 4 cached; API and Next production build completed. Existing workspace-root and CSS warnings, plus Turbo `IO error: Operation not permitted (os error 1)` warnings. |
| `pnpm openapi:check` | 1 | tsx launcher failed to open its IPC pipe: `listen EPERM: operation not permitted`, before the generator ran. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/audit-export/audit-export.application.test.ts` (after build supplied missing dependency) | 0 | 1 file, 14 passed, unchanged. |
| `pnpm turbo run lint` (supplemental package compiler checks, retaining failed root lint) | 0 | 7 tasks successful, 4 cached; all package compiler checks pass. |
| `node apps/api/dist/generate-openapi.js --check` (supplemental compiled generator) | 1 | `openapi.json is stale`; not equivalent output to the tsx source generator. No schema file changed. |
| `node --import tsx src/generate-openapi.ts --check` in `apps/api` (same source generator, no CLI IPC listener) | 0 | Exact committed OpenAPI comparison passed with no file change. This is supplemental evidence; original root command remains recorded as blocked. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Money arithmetic boundary check passed. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Passed, no output. |
| `git diff --check` | 0 | No whitespace error. |
| Read-only working-tree lane-path check using merged `selectLane`/`matches` | 0 | All changed paths inside the registered lane; deterministic working-tree check, not the commit-range lane verdict. |
| Read-only preservation checks | 0 | 19 required hashes match base; every migration byte-identical; E2 exactly import/type-only; package.json exactly one script line. |

188 distinct tests passed: 15 new unit, 14 merged verifier, 145 merged context boundary, 14 merged API application. These are unit/static/adapter evidence, not PostgreSQL or live-provider verification. Logs are under `/private/tmp/ent-10b-ops-*.log`; no generated test log is added to the repository. Successful supplemental compilation does not erase the original typecheck/lint receipts.

## NOT RUN — integrator first-run order

The sandbox cannot bind localhost, start PostgreSQL or run a browser. No database or browser test was attempted, skipped or represented as executed. In particular the non-superuser owner copy (Q3) is only source-inspected: if it fails on the Mac, return the affected part to the integrator; add no grant and use no elevated substitute. Run the new PostgreSQL file first.

1. `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-checkpoint-handoff.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL).
2. `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-export.integration.test.ts test/audit.integration.test.ts` — NOT RUN (sandbox cannot start PostgreSQL).
3. `pnpm test:migrations` — NOT RUN (sandbox cannot start PostgreSQL); covers the unchanged tenancy and demo-bootstrap files.
4. `pnpm test:restore` — NOT RUN (sandbox cannot start PostgreSQL).
5. `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop ENT-10b.spec.ts` — NOT RUN (sandbox cannot start PostgreSQL / a browser).

The unchanged web page unit file was not run in this lane; its hash is recorded below and its execution remains owed to CI. Full repository checks, including original root typecheck/lint and original OpenAPI launcher, remain owed after dispatcher commit. No golden-set change or native subsystem applies.

## Preserved SHA-256 hashes

Every value below was computed from the working file and matched against the issued base; U A15 independently exercises the same byte equality. The scanner and its seven pinned files are included.

| File | SHA-256 |
| --- | --- |
| `packages/db/test/audit-export.integration.test.ts` | `99d1b31a941ada69c31b0d9184b00ce8cbebf0efa0c14b6dbec749529ce70c45` |
| `packages/db/test/verify-audit-export-cli.test.ts` | `bce6ddb9e84724e3a58cc631f92e878f8f5ff7eade68f6b13c6c2c482fdc1bfe` |
| `packages/db/test/audit.integration.test.ts` | `c9060dfcbeba72c9b14e6e42aeea7c2cc2aec71f1e3ac7361b82eef8d1fb57c0` |
| `packages/db/test/tenancy.integration.test.ts` | `443e068f784cd594b0ba7745294b4137bb57d7fdd3388f286f11a4ba952f7312` |
| `packages/db/test/demo-bootstrap.integration.test.ts` | `9105566ea61864253a0ee7de158dbe6b076b5538457b454e75d97f33ce684b8f` |
| `apps/api/src/audit-export/audit-export.application.test.ts` | `8bac90b630ea3f782c6be2f811fdcbf6ad154b262cfb7ee592547794590ae1bd` |
| `apps/web/app/admin/contractor/audit-exports/page.test.tsx` | `d4da63e68075f6370c06964ceb6016ebb1984796cf749e01f2e08f295488abf8` |
| `apps/web/e2e/ENT-10b.spec.ts` | `3acbff5c76f607296ca0c415ec3da4ff38f6915e985f32714e771d1218087023` |
| `packages/db/tools/synthetic-restore.mjs` | `b95e18b6e8794b2ca75e28990dfef38e8d77d98bb922ce185c55a128c85e11bd` |
| `packages/db/migrations/0001_audit.sql` | `0466f67cf6bd1e6c67dbc95538d1b50e2f9c2a0547478845323791c5432af9ca` |
| `packages/db/migrations/0121_audit_export.sql` | `a4a36afbe8c4e0fdc7940e47057f8c7d3e52db1b2e651dd5cd56a983fc9eaf68` |
| `apps/api/src/auth/context-boundary.test.ts` | `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d` |
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` |
| `packages/db/src/contractor-repository.ts` | `56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c` |
| `packages/db/src/contractor-party-repository.ts` | `e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0` |
| `packages/db/src/work-order-repository.ts` | `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3` |
| `packages/db/src/sor-repository.ts` | `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5` |
| `packages/db/src/job-scheduling-repository.ts` | `ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d` |
| `packages/db/src/work-order-fixtures.ts` | `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386` |

## Self-review

Read the whole merged-file diff against origin/main and the four new files against the issued header and draft. Checked every A line has an ID-prefixed test, C-OPS-1 through C-OPS-5 each has its own test, definitions match the contract, company IDs originate in the head list, no request graph import exists, owner refusal precedes BEGIN, role/company settings are transaction-local, the head lock precedes fresh reads, no later business lock follows append, idle paths roll back without INSERT, disagreements cannot be silently skipped, copy failure rolls back the event with its checkpoint, and another company still proceeds. The same-connection commit/rollback cleanup and deterministic lock-wait assertions are in D but not claimed as executed.

Checked exact E1/E2 scope, shared index/package exports unchanged, every migration unchanged, all merged regression/scanner/pinned-file hashes, root package one-line change, lockfile/dependencies unchanged and every path within the lane. Inspected new text for credential-literal patterns and the wording restriction. No forbidden credential fixture literal was added: fixture values are generated at run time, URL credentials are assembled from those values, and documentation uses placeholders. The command never constructs a verified tenant context. The merged security scanner passed all 145 cases and needed no edit.

Changes made during local review: corrected the CLI optional-property spread found by typecheck; strengthened early-disagreement and typed failure unit cases, broadened the static reachability check to all other DB source, added explicit A5 company/count assertions and exact per-table A6 row deltas, kept the real connection observer away from unrelated pool-query callbacks, and made integration teardown release resources even if the final catalog assertion fails. Both test files were written before command implementation; the added boundary cases strengthen their initial coverage. No merged assertion was weakened. The failure trigger is removed and the immutable trigger is re-enabled in test finally blocks. No test retry wrapper or timeout extension was added.

Source inspection of SQL privileges indicates the owner acting as jobguard_migration can copy through the merged policy; no actual PostgreSQL evidence exists in this receipt. The scripted tests use the non-superuser, non-bypass, no-inherit owner login for every operator execution and the owner helper call. Their setup connection only provisions disposable fixtures, seeds faults, inspects catalogs and snapshots, and observes waiting backends. The runtime and other-login calls are solely refusal tests.

## Later and remaining gates

- LATER: automatic/scheduled hand-off — separate RED order; frequency, owner-credential location and evidential worth need decisions.
- LATER: hand-off at deploy — same separate RED order; no deploy hook changed.
- LATER: screen or route — excluded from this shell-only order; no application import or interface added.
- BUILT under C-OPS-4: naming the operator in the audit record, together with the database session user and stored event time. The draft's contrary LATER line is superseded by the issued header.
- LATER: external time-stamping — M4 / M5-9, no external anchor built.

Every hosted practice sign-in creates a new company. A manual run covers only companies present at enumeration, and a later company still sees CHECKPOINT_REQUIRED until the next operator run. A future scheduler holding the owner credential outside requests/runtime, or a separate bootstrap step, needs a new RED order deciding how often, where the owner credential may live outside the build, and how much a system-taken checkpoint is worth compared with a deliberate operator observation.

Remaining gates: actual PostgreSQL 16 owner/copy and concurrency proof; mandatory unedited DB/restore/browser regressions; full committed CI; fresh Claude Opus review plus separate Codex Sol check bound to the dispatcher's exact commit (RED, at most two repair rounds); separate acceptance. Non-synthetic modes remain disabled; D04/G5 real-data/live approval and M5-9 signer/rotation/long-term verification remain held. No release, deploy, provider, real-data, spending or approval gate was opened.

No push, merge or PR opening was performed. No commit was made. Generated build output, local store and test-result directories are removed from the working tree before hand-off.

Builder receipt only — not independently verified, not accepted.

## Mac verification (test helper, Claude Sonnet, 11 October 2026)

Run record only. The helper changed no product code, no test and no document other than this section; no set-up repair was needed. This is not a review and not an acceptance.

Code under test: branch `codex/sandbox/ent-10b-ops`, head `b45deb1`, clean tree, cut from `origin/main` `4564e88`. When the runs finished, `origin/main` had moved to `8e91b2d` (FIXLATER-3, #140; test files and one lane line only, no file of this piece except the lane file). A trial merge of the two heads (`git merge-tree --write-tree origin/main HEAD`) is clean. All runs below are on the `4564e88` base; no catch-up was done.

Environment: Mac, Node v24.17.0, pnpm 10.28.1, embedded PostgreSQL 16.10.0-beta.15 (library links made by the package's own `scripts/hydrate-symlinks.js`). Every command ran inside `~/.local/bin/heavy-slot`, with `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`, memory at least 78% free beforehand, one command at a time. Logs: `~/.local/share/full-steam/jg-runs/ent-10b-ops-mac-*`.

Scope check: `git diff --stat origin/main...HEAD` shows exactly the eleven registered paths (822 insertions, 5 deletions); `package.json` has one added `scripts` line; no migration, lockfile or `apps/api/src/auth/context-boundary.test.ts` change.

The named risk (Q3), run first and alone: the new database test ran as the NOSUPERUSER, NOBYPASSRLS, NOINHERIT owner login. It passed; the hand-off copy as the owner login acting as `jobguard_migration` was NOT refused. No grant was added and no superuser was used.

| # | Working directory | Command (exact) | Exit | Result |
| --- | --- | --- | --- | --- |
| 1 | worktree root | `PLAYWRIGHT_SKIP_BROWSER_GC=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile` | 0 | Already up to date; tree still clean |
| 2 | `node_modules/.pnpm/@embedded-postgres+darwin-arm64@16.10.0-beta.15/node_modules/@embedded-postgres/darwin-arm64` | `node scripts/hydrate-symlinks.js` | 0 | library links present |
| 3 | worktree root | `pnpm turbo run build --filter=@jobguard/db... --concurrency=2` | 0 | 3 tasks successful, 2 cached |
| 4 | `packages/db` | `pnpm exec vitest run test/audit-checkpoint-handoff.integration.test.ts --maxWorkers=2` | 0 | 1 file, 17 passed (new database test) |
| 5 | `packages/db` | `pnpm exec vitest run src/audit-checkpoint-handoff.test.ts test/verify-audit-export-cli.test.ts --maxWorkers=2` | 0 | 2 files, 29 passed (15 new unit + 14 merged verifier) |
| 6 | `packages/db` | `pnpm exec vitest run test/audit-export.integration.test.ts test/tenancy.integration.test.ts test/demo-bootstrap.integration.test.ts --maxWorkers=2` | 0 | 3 files, 24 passed, merged files unedited |
| 7 | `packages/db` | `pnpm exec vitest run test/audit.integration.test.ts --maxWorkers=2` | 0 | 1 file, 5 passed (second caller of `exportAuditCheckpoints`) |
| 8 | worktree root | `pnpm turbo run build --filter=@jobguard/api... --concurrency=2` | 0 | 6 tasks successful, 5 cached |
| 9 | `apps/api` | `pnpm exec vitest run src/audit-export/audit-export.application.test.ts src/auth/context-boundary.test.ts --maxWorkers=2` | 0 | 2 files, 159 passed (14 + context boundary 145), unedited |
| 10 | worktree root | `TMPDIR=<runs folder>/ent-10b-ops-mac-tmp node packages/db/tools/synthetic-restore.mjs` | 0 | third caller of `exportAuditCheckpoints`; 12 PASS, 0 FAIL, including `audit-checkpoint-restored` |
| 11 | worktree root | `node <runs folder>/ent-10b-ops-mac-cli-e2e.mjs` (scratch script kept outside the repository) | 0 | see below |
| 12 | worktree root | `pnpm turbo run typecheck --filter=@jobguard/db --filter=@jobguard/api --concurrency=2` | 0 | 6 tasks successful |
| 13 | worktree root | `LANE_BASE_REF=origin/main sh -c 'node tools/lint.mjs && pnpm turbo run lint --concurrency=2'` | 0 | 7 tasks successful |
| 14 | worktree root | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane boundary passed, the eleven files |

Command line, run 11: the built command `node packages/db/dist/audit-checkpoint-handoff-cli.js` was started as a separate process (the database test calls the function and the exported CLI function directly, not the built file) against a scratch embedded database set up like the database test (owner login, then `bootstrapSyntheticDemo`, two practice companies). Results: with `--operator mac.check`, exit 0, one JSON line, both companies `handed_off` at sequence 2 (events 2 to 4, checkpoints 0 to 2, hand-off rows 0 to 2); a second run, exit 0, both `unchanged` with `nothing to do`, counts unchanged; missing `--operator` and an invalid operator name, exit 1, `AUDIT_CHECKPOINT_INVALID_INPUT`; `MIGRATION_DATABASE_URL` set to the runtime login, exit 1, `AUDIT_CHECKPOINT_FORBIDDEN` naming the role found and the role needed, counts unchanged; `JOBGUARD_ENV=pilot_no_charge`, exit 1, `AUDIT_CHECKPOINT_MODE_HELD`. The two stored hand-off events carry `references.operator` `mac.check`, `references.sessionUser` the owner login, and the stored `occurred_at`. No output contained the password, host or port. (Observation: the `AUDIT_CHECKPOINT_FORBIDDEN` message names the owner login role, as C-OPS-2 asks it to name the role needed; it is a role name, not a secret.)

Not run: `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, any package `test` script, the web unit file, the browser (Playwright) spec, `pnpm openapi:check` (no API route or schema changed). No browser was installed.

Merge of `origin/main` `8e91b2d` (FIXLATER-3) into the branch at `30c30f4`, merge only, no conflicts and no edits (the diff against main is still the eleven paths). Re-run on the merged state, in `packages/db`: `pnpm exec vitest run test/audit-checkpoint-handoff.integration.test.ts --maxWorkers=2`, exit 0, 1 file, 17 passed; at the worktree root `LANE_BASE_REF=origin/main pnpm lint:lanes`, exit 0, lane boundary passed. A unit test builds a made-up database URL with a random run-time value on a `.invalid` host (`packages/db/src/audit-checkpoint-handoff.test.ts` line 11); it contains no secret.

Mac run record only — not a review, not an acceptance.


## Round 1 — 12 October 2026 repair

Working-tree repair of `codex/sandbox/ent-10b-ops`, starting at
`1be22ba75ca2d3f0c74d3d0c3df22247e80f6709`. Re-read the issued order header,
AGENTS, applicable plan/contracts and both head-bound review sources before editing.
This section is the evidence for this repair; earlier build and Mac sections remain
historical evidence for their stated heads, and are not rebound to this diff.
The dispatcher commits locally after this hand-off. No git write, GitHub-contacting
command, install, migration, route, screen or scheduler was run or added.

### Fix results

| Fix | Status | Before / after |
| --- | --- | --- |
| 1 | DONE (implementation; PostgreSQL execution owed) | Two statements could skip a disagreement if the newest event moved. One statement now materializes candidates once, inserts missing rows and returns disagreements for exactly those candidates. The existing typed error names the tenant and sequence. Equal hashes skip; newly inserted rows retain the public return shape. |
| 2 | DONE | The guard previously scanned only API/web/DB and DB export keys. The same parser-based guard now walks every transitive workspace dependency of API/web, follows imports and all re-export forms through relative and package paths, and inspects every `exports`/`main` target, including emitted targets and corresponding source. Mutation fixtures cover direct request imports, two-package aliases, export stars, import-then-export bindings, conditional export-map targets and main targets. |
| 3 | DONE | Removed the nineteen-file historic-commit/hash assertion entirely, including its git subprocess and digest imports. C-OPS-5 now tests only this piece's operator source for request-context construction. The hashes below are a one-time record, not a test. No standing test added here freezes another piece's files. |
| 4 | DONE (required evidence record); execution NOT RUN | `apps/web/e2e/ENT-10b.spec.ts` is unchanged. NOT RUN (sandbox cannot start a browser); owed on the Mac, both projects, on the repaired head. |

The five command conditions retain their implementation behavior. Operator core/CLI,
shared copy helper, package manifests/exports, security scanner and its pinned files,
all migrations, grants, routines and hash rules are unchanged by this round.
No migration is needed. Changes to `audit.ts` are confined to `exportAuditCheckpoints`.
The three merged callers in `audit.integration.test.ts`,
`audit-export.integration.test.ts` and `synthetic-restore.mjs` keep their signature
and successful return shape. The operator command still does not call this helper.

**Commit behavior on disagreement:** the one pool statement commits every valid
missing checkpoint, including those of other companies, before TypeScript rejects.
Existing checkpoint rows remain unchanged. The rejecting call returns no list;
a later idle call skips the already committed records. This preserves the prior
partial-success behavior and is stated in the appended contract. The operator
command's separate per-company atomic commit/rollback behavior is unchanged.

### Tests and commands

Tests were written before the production query repair. The shape regression was
executed against the old helper: exit 1, one failure (two query calls instead of
one), 22 filtered tests. This is a deterministic unit failure, not PostgreSQL
execution. The three new database cases are source-inspected only; they are
NOT RUN (sandbox cannot start PostgreSQL). Against `1be22ba`, F1a/F1b would miss
the rejection after the forced append; F1c would fail the single-statement count
assertion (its equal-hash/no-duplicate behavior already worked on that head).

The advisory-lock helper holds connection A immediately after its insert statement
commits, before returning that query result to the function. It observes the actual
lock wait, commits N+1 through a distinct runtime connection B, then releases A.
There is no sleep ordering. The three named PostgreSQL cases are:

- `[Round 1 F1a] candidate disagreement rejects naming company and sequence after an intervening append` — NOT RUN (sandbox cannot start PostgreSQL).
- `[Round 1 F1b] other-company checkpoint is committed and kept when the candidate disagrees after an append` — NOT RUN (sandbox cannot start PostgreSQL).
- `[Round 1 F1c] equal candidate hash skips without a duplicate after an intervening append` — NOT RUN (sandbox cannot start PostgreSQL).

Executed unit coverage includes the one-statement shape, public return shape and
exact disagreement identity; the source-graph guard on the repository; and the
same guard against direct-import, indirect-alias, export-star, import-then-export,
export-map and main mutations, with safe control fixtures. All existing operator
unit cases remain, apart from the explicitly ordered removal of the byte freeze.

The default pnpm launcher stalled twice (the initial filtered test and a version
probe); both were interrupted, exit 130, before producing test results. Switched
to the already installed pinned pnpm 10.28.1 via
`PATH=/private/tmp/jg-ent-10b-ops-bin:$PATH`, a temporary symlink to
`~/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. All pnpm commands below use
that PATH. No package download or dependency change was requested. Node v24.17.0.
Only this piece's changed unit file was executed, one run at a time, with two
workers maximum. No full package/repository test suite was run.

| Command (worktree root unless stated) | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=2 -t 'Round 1 F1'` before repair | 1 | 1 failed, 22 filtered; expected old-helper red result. |
| `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=2` after initial repair | 0 | 23 passed, 1 file. |
| Same command after additional return/error and manifest coverage | 0 | 25 passed, 1 file. |
| Same command after emitted-entry control coverage | 0 | 26 passed, 1 file. |
| Same command after final SQL ordering adjustment | 0 | 26 passed, 1 file; final unit run. |
| `pnpm typecheck` | 0 | 7 successful tasks, 4 cached. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | 0 | Root source/boundary lints and 7 successful package lint tasks, 4 cached. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Registered ENT-10b-OPS lane passed, including working-tree changes. |
| `pnpm build --concurrency=2` | 0 | 7 successful tasks, 4 cached; Next production build completed. |
| `pnpm openapi:check` | 1 | tsx launcher refused IPC pipe binding with EPERM before the check ran; sandbox limitation. |
| `node apps/api/dist/generate-openapi.js --check` | 1 | Compiled-generator fallback reported stale output; this is a different transpilation path from the mandated source check. No schema file changed. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | 0 | Same source generator and installed tsx loader, bypassing only the IPC launcher; committed OpenAPI matched. |
| `git diff --check` | 0 | No whitespace errors. |
| Read-only nineteen-path comparison to HEAD and added-text credential-shape scan | 0 | All nineteen unchanged; no matching added credential shape. One-time deterministic checks, not standing tests or model review. |

Logs of the final unit/typecheck/lint/lane/build/OpenAPI checks are in
`/private/tmp/jg-ent-10b-ops-round1-*.log`. Turbo reported cache IO permission
warnings during typecheck/lint/build; the real tasks completed successfully.
The standard OpenAPI launcher is sandbox-blocked; the equivalent source/tsx-loader
check passed. The compiled fallback failure is not reported as a source-check failure
or repaired by changing any out-of-lane schema.

`packages/db/test/audit-checkpoint-handoff.integration.test.ts` now has 20 cases
(previously 17). The full file, merged PostgreSQL regression suites, migration
checks and restore rehearsal are NOT RUN (sandbox cannot start PostgreSQL).
`pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop ENT-10b.spec.ts`
is NOT RUN (sandbox cannot start a browser); owed on the Mac. Database CI and
browser evidence on the repaired commit remain outstanding. No earlier Mac result
is claimed for this repair. AI evaluation is inapplicable: no AI/model/prompt change.

### Nineteen-path preservation record

SHA-256 values read from the working tree at base head `1be22ba`; every listed
path was compared once with that head and remains unchanged. This table is a
record, not a test, and does not constrain future authorized changes.

| File | SHA-256 |
| --- | --- |
| `packages/db/test/audit-export.integration.test.ts` | `99d1b31a941ada69c31b0d9184b00ce8cbebf0efa0c14b6dbec749529ce70c45` |
| `packages/db/test/verify-audit-export-cli.test.ts` | `bce6ddb9e84724e3a58cc631f92e878f8f5ff7eade68f6b13c6c2c482fdc1bfe` |
| `packages/db/test/audit.integration.test.ts` | `c9060dfcbeba72c9b14e6e42aeea7c2cc2aec71f1e3ac7361b82eef8d1fb57c0` |
| `packages/db/test/tenancy.integration.test.ts` | `443e068f784cd594b0ba7745294b4137bb57d7fdd3388f286f11a4ba952f7312` |
| `packages/db/test/demo-bootstrap.integration.test.ts` | `9105566ea61864253a0ee7de158dbe6b076b5538457b454e75d97f33ce684b8f` |
| `apps/api/src/audit-export/audit-export.application.test.ts` | `8bac90b630ea3f782c6be2f811fdcbf6ad154b262cfb7ee592547794590ae1bd` |
| `apps/web/app/admin/contractor/audit-exports/page.test.tsx` | `d4da63e68075f6370c06964ceb6016ebb1984796cf749e01f2e08f295488abf8` |
| `apps/web/e2e/ENT-10b.spec.ts` | `3acbff5c76f607296ca0c415ec3da4ff38f6915e985f32714e771d1218087023` |
| `packages/db/tools/synthetic-restore.mjs` | `b95e18b6e8794b2ca75e28990dfef38e8d77d98bb922ce185c55a128c85e11bd` |
| `packages/db/migrations/0001_audit.sql` | `0466f67cf6bd1e6c67dbc95538d1b50e2f9c2a0547478845323791c5432af9ca` |
| `packages/db/migrations/0121_audit_export.sql` | `a4a36afbe8c4e0fdc7940e47057f8c7d3e52db1b2e651dd5cd56a983fc9eaf68` |
| `apps/api/src/auth/context-boundary.test.ts` | `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d` |
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` |
| `packages/db/src/contractor-repository.ts` | `56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c` |
| `packages/db/src/contractor-party-repository.ts` | `e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0` |
| `packages/db/src/work-order-repository.ts` | `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3` |
| `packages/db/src/sor-repository.ts` | `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5` |
| `packages/db/src/job-scheduling-repository.ts` | `ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d` |
| `packages/db/src/work-order-fixtures.ts` | `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386` |

### Strict self-review of the Round 1 diff

Re-read the complete round diff, query shape, test graph, new concurrency helper
and contract. Checked these possible statement pairs individually:

1. `audit.ts / exportAuditCheckpoints`: the moving second read is gone. The sole materialized candidate set feeds both insert and disagreement join. UNION results include valid inserts and disagreements without throwing inside SQL, so valid inserts commit. Insert order remains tenant/sequence ordered; the discriminator is stripped from successful public results.
2. `audit.ts / appendAuditBatch`: context read, head read, server-clock reads, event inserts and head advance remain protected by the head lock acquired before any event append. A concurrent ordinary appender cannot move that head until the transaction ends. `verifyAuditChain` has no database reads.
3. `audit-checkpoint-handoff.ts / handleTenant`: head lock precedes newest-event, checkpoint and hand-off reads. All control rows are compared to their fixed tenant/sequence event, and the no-new-events check uses the captured locked head. Reacquiring that same lock in `appendAuditBatch` does not release it. Checkpoint insertion uses the returned event identity; there is no moving head read after insertion.
4. `audit-checkpoint-handoff.ts / runAuditCheckpointHandoff`: identity read and positive-head enumeration precede per-company transactions. Enumeration is deliberately a fixed company list; each selected company obtains its own head lock and fresh reads. An intervening append is covered by that locked read, not skipped by a later newest-event lookup. CLI gates have no second database read.
5. `audit-export-repository.ts / handoffAuditExportCheckpoint`: insert then fallback lookup both bind the exact supplied tenant, sequence, hash and millisecond timestamp. They never select newest; checkpoint/hand-off rows are immutable. An append cannot move this identity.
6. `audit-export-repository.ts / create`: captures fixed hand-off checkpoints, takes the head lock through append, then reads entries under that held lock and verifies every captured checkpoint against the chain. The list/refusal/authorization paths have no moving checkpoint-candidate pair.

No other append-sensitive second-read pair was found in these paths. This is
builder source inspection, not independent verification or acceptance. The review
guard conservatively forbids a module dependency that reaches either operator
module even if only an unrelated binding was imported; aliases cannot bypass it.
It parses TypeScript/JavaScript module syntax using the existing TypeScript package,
walks declared workspace dependencies, follows relative/package re-export chains,
and evaluates export/main targets without adding dependencies. Mutation tests use
the exact repository guard, and the emitted-entry safe control ensures export-map
coverage is exercised rather than incidental source scanning.

Reconfirmed C-OPS-5's scanner and pinned files unchanged; the replacement standing
check inspects only owned operator files. Original operator behavior and all five
conditions are preserved. The fixture URL now uses a URL object and generated
values, including the previously flagged line 11 shape. No load-bearing policy,
new operator feature or later-list item was added. Intended conventional commit
subject/body written to `/private/tmp/jg-msg-ent-10b-ops.txt` for the dispatcher.
Fresh Opus review and fresh Sol re-check bound to the dispatcher's repaired commit,
plus separate acceptance, remain required; builder does not accept this work.
