# CH-3b builder receipt — working-tree delivery

Builder: Codex. Issued work order: JobGuard integrator, 7 October 2026 evening.
This receipt records source inspection and local execution, not independent
verification or technical acceptance.

Base and current committed HEAD: `0264158ffa8fbe61f7c896be9a9c5aa210f07af0`
(CH-3a merge #98). The checkout includes ENT-1. Branch:
`codex/sandbox/ch-3b`. **Final head is pending the dispatcher commit**; the builder
made no git write, commit, push, merge or PR. The dispatcher must bind this receipt,
Claude verdict and separate acceptance to its exact resulting head. Intended
message: `/private/tmp/jg-msg-ch-3b.txt`.

## Delivered behavior and choices

Strict versioned core boundaries, exact client/customer type matching, immutable
client link, tenant/client/contract/version/job-qualified contractor binding and
separate restricted resident contact; closed absence reasons; pending independent
resident retention class. PostgreSQL computes the request hashes itself. Controlled
routines use ENT-1's seed-54 lock, expected job revision, unique command/job/order
identities, exact replay checks, and deferred reciprocal effect/receipt/audit
requirements. No missing-party transaction can leave a partial effect. Runtime
raw writes to the new tables and direct resident-payload reads are denied.

The link requires existing `organisation.manage` on the persisted client. The
import seam permits that scoped administration or existing tenant `data.import`;
it adds no permission. Customer is the exact linked revision; payer defaults to
that revision or the work-order-supplied same-tenant revision; site is the supplied
revision. The current immutable client contract version is pinned under the ENT-1
lock. Subsequent revisions do not rewrite it. This adds no ENT-2 import, order,
assignment table, provenance/state command or screen.

The resident reader requires `resident.read` on the actual persisted job ID,
checks actual job existence, and denies IDs also naming a team/unit/client. ENT-1
cannot yet resolve job IDs: **all unresolved job scopes deny**, including members
with tenant-level resident grants. No client-to-branch inference is substituted
for a job assignment. ENT-2 must extend the persisted scope resolver and prove the
held positive cases. Runtime can read only resident row metadata outside that
routine, never contact or no-resident reason. No builder-facing projection joins
resident contents.

Next and Nest share `ContractorPartiesApplication`, following ENT-1's contractor
session composition (not the small-builder PracticeAccess principal). Next uses
`syntheticPool()`, the real contractor session cookie and `origin.ts`; resident
responses are no-store on both transports. Shared workspace/application.ts stays
unchanged; only the narrow export and Nest registration are appended. The generator
adds both endpoints to OpenAPI. No new screen: C1 as issued; C7/new Playwright spec
inapplicable, previous e2e suites still mandatory.

Test jobs are created only by ENT-1 `startPractice` and the merged
`JobRepository.create` path under its authenticated tenant context. Customers,
sites, clients, contracts, memberships, grants and lifecycle changes use existing
commands. The DW6 quoted-job regression invokes the existing quote, acceptance and
switch-live mutations in a contractor tenant; it does not claim an ENT-2
work-order/job-track fixture. No new test job is inserted by a superuser or
migration owner, and no job status/provenance/track is directly written. The
forged-receipt test is a deliberate runtime SQL attack, not fixture setup.

## Done-when mapping

| Criterion | Source and execution evidence | Remaining evidence |
|---|---|---|
| DW1 | New PostgreSQL suite calls the controlled routine with each required party absent, checks no effect/receipt/audit/outbox additions, and a complete call. Exported `@jobguard/db` `assertContractorPartiesRequired` callback assertion for ENT-2, with no test-suite registration side effects. Core required-field tests pass. | Database bodies not executed locally. **ENT-2 import-test clause HELD**. |
| DW2 | All six client types vs all seven CH-3a customer types; every mismatch refused, including business. Composite same-tenant wrong-client and foreign-tenant contract attacks; foreign registry reference; pinned contract version and retention checks. Privilege/catalog tests. | Real PostgreSQL execution in CI. |
| DW3 | PostgreSQL role matrix denies all excluded roles and unresolved scope; actual application/session + PostgreSQL test compares hidden/absent typed 404s; UUID/team collision attack. Existing job list, parties, job read and contractor workspace projections checked for absent keys/canary values. API projection allowlist protects existing builders. | Real PostgreSQL execution. **Operative on the job / that team's supervisor positives HELD**; ENT-6 exports and ENT-9 dashboards do not exist. |
| DW4 | Strict allowlist over both audit event types; DB console capture and audit/receipt canary assertions; API-side actual zero-spend gateway request capture and Next transport source assertions. Core and API assertions pass. | Database log/audit assertions await CI. AI test uses reviewed fictional work text from a contractor-shaped fixture, not a live model or a persisted work-order import. No claim of redaction for contacts typed into other free-text workflows. |
| DW5 | Two pool connections call the same link/import concurrently; exact replay, changed payload conflict, another command stale; unique tenant/order/job bindings. Missing audit and forged succeeded receipt must roll back. | Real PostgreSQL race/rollback execution. |
| DW6 | New contractor-tenant regression uses existing commands for two matching customer/site jobs, preview, send authorization, acceptance and concurrent switch-live; checks recognition start and one activation. Earlier CH-3a test file is byte-identical. | New and existing database assertions await CI. |

Both held clauses are the **binding founder ruling**, card
`jobguard-ch3b-held-clauses-2026-10-07`, Ben 7 Oct ~21:00: **"hold the two checks"**.
They must be proved before ENT-2 acceptance. The test helper is not evidence that
ENT-2 ran. The future verdict and acceptance must retain these holds.

## Commands actually observed

Installed dependencies were reused. No install/download command was run. Commands
below use cached pinned pnpm **10.28.1**, Node **v24.17.0**; shell prefix was
`PATH=/private/tmp/jg-ch-3a-merge-bin:$PATH`. That pre-existing shim invokes
`node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.

| Command | Exit | Observed result |
|---|---:|---|
| Initial shell `pnpm --filter @jobguard/core exec vitest run src/contractor-parties.test.ts` | 130 | Unpinned shell launcher entered automatic version management; interrupted before a test ran. Switched to cached pinned binary. |
| `pnpm --filter @jobguard/core exec vitest run src/contractor-parties.test.ts` — before implementation | 1 | Expected fail-first: `Cannot find module './contractor-parties.js'`; no implementation existed. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/contractor-parties.integration.test.ts` — before implementation | 1 | Suite authored before repository/routine implementation; unbuilt `@jobguard/core` entry could not resolve. This is not a failing database assertion. |
| `pnpm --filter @jobguard/core build` | 0 | Built workspace dependency. |
| `pnpm --filter @jobguard/api exec vitest run src/contractor/contractor-parties.application.test.ts src/contractor/contractor-parties.controller.test.ts src/contractor/contractor-parties.privacy.test.ts` — pre-build | 1 | Unbuilt db/AI package entrypoints; no test bodies ran. |
| Same targeted API command — after build, including controller header | 0 | 3 files, 8 tests pass. Adapter/schema/privacy evidence, not PostgreSQL proof. |
| Same targeted API command — helper export test before dependent rebuild | 1 | 8 pass; new helper test sees stale built db exports (`assertContractorPartiesRequired is not a function`). Rebuilt dependencies. |
| Same targeted API command — final helper export and false-positive test | 0 | 3 files, 9 tests pass, including refusal on success/unrelated failure. |
| `pnpm --filter @jobguard/core exec vitest run src/contractor-parties.test.ts` — after implementation | 0 | 4 tests pass. |
| `pnpm typecheck` (initial and final) | 0 | All seven package tasks succeed. |
| `pnpm --filter @jobguard/api typecheck` | 0 | API checks pass. |
| `pnpm --filter @jobguard/db typecheck` | 0 | DB source checks pass. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --module NodeNext --moduleResolution NodeNext --target ES2023 test/contractor-parties.integration.test.ts test/contractor.integration.test.ts` | 1, then 0 | Found unknown-typed CH-3a result fields; fixed by parsing returned command results through the public versioned result schema. Final integration-test source typecheck passes. |
| `pnpm build` | 0 | All seven tasks, production Next build includes both new routes. Existing workspace-root/autoprefixer warnings and Turbo shared-cache `Operation not permitted` warnings. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passes; lane checker refuses `Missing branch or self-comparison range; refusing a misleading pass.` HEAD equals base before dispatcher commit. No workaround changes the mandatory check. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same uncommitted-HEAD comparison refusal. Must run after dispatcher commit. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Money arithmetic boundary passes. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Commercial boundary passes. |
| `pnpm turbo run lint` | 0 | All seven package lint tasks pass; this does not replace root lane checking. |
| Read-only Node working-tree allowlist check using unchanged `selectLane`/`matches`, `git diff --name-only HEAD` and `git ls-files --others --exclude-standard` | 0 | All changed/new files fit ch-3b; explicitly not a committed lane-range PASS. |
| `git diff --check` | 0 | No whitespace errors. |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | tsx CLI IPC socket fails `listen EPERM`, temporary `tsx-501/*.pipe`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` | 0 | Same generator executes without the CLI IPC listener; OpenAPI regenerated. |
| `pnpm openapi:check` | 1 | Same tsx IPC `listen EPERM`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same committed-artifact generator check passes via Node loader. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/contractor-parties.integration.test.ts test/contractor.integration.test.ts test/job-parties.integration.test.ts` | 1 | Final discovery: 14 new + 18 contractor + 86 job-parties tests; all 118 skipped by failing embedded-Postgres initialization. Exact error: `Postgres init script exited with code null. Please check the logs for extra info. The data directory might already exist.` No database guarantee verified. |
| `pnpm test` | 1 | Root tool tests run; core 2,868 tests and AI 72 tests pass in this run. API 384 tests pass, existing health HTTP test fails `listen EPERM: operation not permitted 0.0.0.0`; DB initialization also fails; Turbo stops remaining tasks. Not a full-suite pass. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1` | 0 | All 108 files / 2,868 tests pass with unchanged assertions and timeouts. |
| `pnpm --filter @jobguard/core test` (additional run) | 1 | 2,866 pass; source/dist copies of existing receipt-allocation bounded-denominator test hit unchanged 5,000 ms timeout under concurrent builds. No assertion or timeout was edited. |
| `pnpm --filter @jobguard/web exec vitest run app/api/contractor/route.test.ts app/api/contractor/origin.test.ts` | 0 | Existing contractor session/origin adapter regressions: 2 files, 19 tests pass. |

The final single-worker core rerun passed. The build was repeated after final
source edits; its last observed outcome is recorded below. Local command logs are in `/private/tmp/ch3b-*.log`;
this receipt includes the relevant results and does not depend on those ephemeral
logs for its claims.

Not run: `pnpm install --frozen-lockfile` (dispatcher explicitly says dependencies
installed, no downloads); standalone `pnpm test:db`, `pnpm test:migrations` and
`pnpm test:e2e` (dispatcher assigns database/browser suites to GitHub CI; the
prescribed targeted DB run confirms initialization restriction). CI must run a
clean frozen install, all full mandatory checks, fresh/upgrade/catalog DB and
existing browser regressions on the committed head. No live evaluation/provider
run; no model/prompt/parser change. Existing AI fixture evaluation ran through
root tests (72 tests; golden-set receipt PASS), distinct from any live-model gate.

## Migration, invariants, compatibility and integration ownership

**0102_contractor_parties.sql**, issued number. Three additive tables; one
additive contract-version composite unique constraint; pure contact validator;
three narrowly permission-checked, migration-owned routines; immutable triggers
and deferred reciprocal receipt/effect/audit guards; exact runtime EXECUTE grants;
metadata-only resident SELECT. No backfill or earlier migration edit. SQL is
source-inspected, not locally PostgreSQL-executed. Preceding application code
remains compatible; migration/bootstrap tests remain mandatory. Forward-fix
strategy is in MIGRATIONS.md: retain all immutable records, stop callers before a
destructive rollback and require an approved retention/export plan first.

Affected invariants: tenant context/RLS/composite keys (§5.1), immutable job
commercial history (§5.2), durable idempotency/audit atomicity and lock order
(§§5.4, 5.7), privacy/processing gates (§§5.9, 5.11), contractor controller/processor
boundary (§9.1.12), no synthetic-to-production promotion (§5.10). No commercial
send, live provider, payment, production mode, retention approval or policy record
is introduced. No new operational alert is introduced; database constraint failure
remains a typed rejected command. No binary asset or screen.

Shared files serialized with the integrator: lane registry, core/db exports,
MIGRATION_URLS/MIGRATIONS.md, Nest app.module, workspace/index, generated OpenAPI,
tenancy catalog rows and migration-count assertions. ENT-1's conformance file has
one appended CH-3b test; previous assertions are untouched. CH-3a's integration file
and both dependencies' source/migrations remain unchanged. BUILD_PLAN.md is in the
lane only for the **integrator's** §12.2 ledger amendment; builder never edits it.
No other lane line changed. Lane C1 note records the issued no-screen exception.

B5 register: `docs/operations/contractor-parties-data-flow.md`, every field of
provider-data-flow-v1 filled, synthetic-only, contractor controller / JobGuard
processor, **D12 v4 proposed**, **D04 proposed**, gate closed, no external route.
It deliberately records unverified deployment/backup regions rather than inventing
residency approval. D07 retention/deletion instructions, G1 and ENT-14 pilot
agreement/DPA remain prerequisites. Independent Claude verdict on the dispatcher
commit, separate acceptance and full CI remain outstanding; builder self-accepts
nothing.

## Exact changed files

- `apps/api/openapi.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/contractor/contractor-parties.application.test.ts`
- `apps/api/src/contractor/contractor-parties.application.ts`
- `apps/api/src/contractor/contractor-parties.contracts.ts`
- `apps/api/src/contractor/contractor-parties.controller.test.ts`
- `apps/api/src/contractor/contractor-parties.controller.ts`
- `apps/api/src/contractor/contractor-parties.privacy.test.ts`
- `apps/api/src/workspace/index.ts`
- `apps/web/app/api/contractor/clients/[clientId]/customer-link/route.ts`
- `apps/web/app/api/contractor/jobs/[id]/resident-contact/route.ts`
- `config/agent-lane-assignments.json`
- `docs/contracts/contractor-parties-v1.md`
- `docs/operations/contractor-parties-data-flow.md`
- `docs/verdicts/CH-3b/BUILDER_RECEIPT.md`
- `packages/core/src/contractor-parties.test.ts`
- `packages/core/src/contractor-parties.ts`
- `packages/core/src/index.ts`
- `packages/db/MIGRATIONS.md`
- `packages/db/migrations/0102_contractor_parties.sql`
- `packages/db/src/contractor-party-repository.ts`
- `packages/db/src/index.ts`
- `packages/db/src/migrate.ts`
- `packages/db/test/UIWIRE-12.integration.test.ts`
- `packages/db/test/contractor-parties.integration.test.ts`
- `packages/db/test/contractor.integration.test.ts`
- `packages/db/test/demo-bootstrap.integration.test.ts`
- `packages/db/test/tenancy.integration.test.ts`

## Final observed completion

After the final source edit, `pnpm build` exited **0**: all seven tasks successful,
production Next routes present. The last targeted API run exited **0**, 9/9 tests;
integration-test source `tsc` exited **0**; final `pnpm typecheck` exited **0**.
Single-worker full core run exited **0**, 108 files / 2,868 tests, with unchanged
5,000 ms timeouts. Same OpenAPI generator `node --import tsx ... --check` exited
**0**. Working-tree allowlist check exited **0**, 28 paths; every other lane line,
BUILD_PLAN.md, AGENTS.md, CH-3a's integration test, and dependency source/migrations
were byte-identical. `git diff --check` exited **0**.

Full root test/lint and exact standard OpenAPI CLI checks have the environment
failures above; they are not reported green. PostgreSQL, migration, browser and
committed-range lane checks, exact-head independent Claude verdict and separate
acceptance are still required. No commit or remote action was made. Both founder-
held ENT-2 clauses remain HELD.

Final helper-export adjustment: the refusal assertion is exported from
`contractor-party-repository.ts`/`@jobguard/db`, with no Vitest dependency or test
registration side effects. Final `pnpm build` and `pnpm typecheck` after this
adjustment each exited **0**; final API 9/9 and integration-test source typecheck
exited **0**. The source test also asserts that an already-bound work-order ID
cannot bind a different job in the same tenant; that PostgreSQL assertion still
awaits CI. No additional path or held-clause change.
