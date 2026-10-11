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
