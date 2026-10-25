# CH8-V builder receipt — build-ahead, source boundary only; aggregate HELD

24 October 2026. Builder: Codex. No independent verdict or technical acceptance
is claimed. This is one issued build, with local diagnostic corrections; no
external repair order, commit, push, merge, release or provider action occurred.

## Authority and exact base

- Issued CH8-V order, decision 74: build ahead; dependencies gate merge. C250
  limits retained. The specific order overrides the draft's old branch/base and
  merge-before-build rules. Branch `codex/sandbox/ch8-v`; clean at entry.
- Exact unchanged HEAD/base:
  `9fff1e27bf648b9538c4baf2de99e93861c07414`. All changes are uncommitted.
  There is no new commit to bind a reviewer verdict to; dispatcher must commit
  and obtain exact-head checks. Intended message: `/private/tmp/jg-msg-ch8-v.txt`.
- Target: main, dispatcher reports `4b1a7790`. Local `origin/main` resolves to
  `cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe`; local `main` is the historical
  `694e9e1755f2a5680898eb0fa04af48afd66c86b`. Neither was fetched/reset/rebased.
  The issued accepted stacked base is preserved.
- Read repository AGENTS.md, applicable BUILD_PLAN §§2, 10.2.5–6, SV-5/SV-6,
  CH-8, the full Astra CH8-V card (6402 through its ownership paragraph), common
  contract §§2.1–2.4, CH8-A contract and actual producer/repository source.
- CH8-A accepted head: `ea5c131e083a105f23d137878156c6eadf0fd66c`.
  Read `jg-runs/v5-ch8-a-acceptance-ea5c131e-20261023.md`: **unbound specimens
  only**, explicitly carrying the self-link/duplicate-section-link test gaps.
- SV6-PERSIST-B accepted head: `dc9dbfba3735dfdbedba43b160fe2609ed3abd6a`.
  Read `jg-runs/v5-sv6-persist-b-acceptance-dc9dbfba-20261024.md`: accepted stacked
  persistence; merge gates and source adapter holds are distinct. Actual SQL
  `app.assess_recovery_attribution` still raises
  `RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND` (0213); it is not full SV-6 closure.
- SV-5 `a13fc5f1` is excluded by order, not copied or cherry-picked. No absent
  interface was substituted with that candidate. No merge/push/git-write command.

## Delivered and safest choices

Read Ben's `jg-orders/next-wave/BEN-ANSWERS-20261023.md`. Applied choices:

1. Refuse v3 generation/approval until authentic source, worker and writer
   bindings exist. A self-consistent CH8-A specimen cannot become a runtime fact.
2. Owner authority only; derive tenant/job from the current authenticated case.
   Reauthenticate after a wait. Canonicalise UUIDs before consumer comparisons.
3. Before lock, ordinary sources only: no shadow import, query, credential,
   detector execution, signal count or candidate-dependent response. Unknown,
   pending and failed handoffs never mean clear.
4. Request worker work outside the source transaction; retain the supplied
   request identity. No automatic retry/new identity after unknown outcome.
5. No public paid/settled/complete claim, no fee/attribution calculation, no
   standing authority, send, customer action, payment or financial posting.
6. Hold missing source semantics rather than invent eight-section payloads,
   timestamp meanings, receipt-line/settlement mapping or a production threshold.

Implementation:

- `evidence-pack-v3-ports.ts`: typed internal holds; must-surface request and
  `readCompletion` seam; explicitly held SV-5 lock/reveal port (`Promise<never>`).
  No installed producer adapter. Default ports always refuse uniformly.
- `evidence-pack-v3-sources.ts`: transaction-object-stamped verified case binding;
  actual session, owner, tenant and job ownership checks; synthetic DB boundary;
  repeatable-read read-only snapshots; reuse of existing ordinary source loader;
  exact visible-source fingerprint; reauthentication and source comparison after
  the port wait. Locked jobs stop before any content read. Returned preparation
  always has `producerBindings: held`, `complete: false`.
- `evidence-pack-v3-command.ts`: explicit checked-writer hold, no legacy INSERT
  fallback. This is not a persisted command implementation.
- API strict additive v3 schemas, canonical command UUIDs, typed authenticated
  409 hold before any v1 writer/list/approval path. Existing Nest/Next shared
  service remains in use. Next POST failures explicitly use `no-store`.
- New pure/API/controller and Next transport tests. Two isolated carried CH8-A
  tests target self-link and duplicate section-link guards with exactly one
  expected schema issue apiece. No core preparation source changed.
- CI-only PostgreSQL tests and fixture, and real existing-route browser refusal
  spec. Supporting ordinary records are inherited synthetic fixtures; tested
  case is freshly opened via actual recovery command. Not a fresh shadow-30000
  journey. Injected handoffs are clearly labelled contract doubles.
- Operational map: `docs/operations/evidence-pack-v3.md` covers every section,
  exact seam behavior, holds and resumption criteria.

## Symbol verification and STOPs

Producer symbols were checked with `git grep`, not inferred from the draft.

| Symbol / source | Finding and action |
| --- | --- |
| `PracticeAccess.case` / `authorizePracticeJob` / `authenticatePracticeSession` | Present; actual SQL session/ownership helpers consumed, owner rechecked |
| `practiceOwnedJobsSql` / `withTenant` / `TenantTransaction` | Present; consumed as they stand |
| `loadEvidencePackSources` | Present; reused only for ordinary source rows and original-byte/hash verification |
| `FinalAccountLockRepository.read/verify` | Present; no transaction-safe complete SV-5 export bundle. Only lock existence is read here; verified lock/cutoff payload binding remains held |
| `ShadowRepository.reveal` | Present; insufficient full chain; deliberately never invoked by this consumer |
| `ShadowDetectionRepository.persist` | Present; deliberately never imported/invoked in builder request path |
| `RecoveryAttributionRepository.history`, core `recoveryAttributionRevisionV1` | Present; accepted persistence read; source assessment remains dependency-bound, no fabricated export binding |
| `loadEvidencePackV3Sources` | Absent before build; new consumer seam implemented in this lane, not a claim of producer existence |
| `EvidencePackMustSurfaceCheckPort.requestCheck/readCompletion` | **STOP-EP-MUST-SURFACE**: absent accepted producer. New held consumer interface only, no all-clear or successful runtime generation |
| `app.write_evidence_pack_v3` | **STOP-EP-WRITER**: absent. No writer or checked binding installed |
| accepted SV-5 immutable eight-section lock/reveal source bundle | **STOP-EP-SV5**: unavailable at accepted base; held port, no candidate copying |
| accepted CH8-A producer/source-section binding | **STOP-EP-SECTIONS**: acceptance is explicitly unbound. All eight maps remain held |
| accepted version-aware message/follow-up sink compatibility | **STOP-EP-CONSUMERS**: full v3 consumption prerequisite not established; no v3 stored pack produced or attachable |
| standalone `packages/db/tools/verify-evidence-pack.mjs` | Present and inspected: v1, TEXT input, optional trusted SHA, exit 0/1/2. Conditional edit grant was not issued; unchanged |
| existing Nest controller and four Next path templates | Present/registered. Negative transport work only; no invented route/page |

0226 remains reserved and unused. Source-only work adds no schema, grants,
roles, routine, fingerprinted column or migration note. The required checked
writer migration and its own-step upgrade proof remain HELD; this is not a
claim that the full vertical needs no migration. No role-owner/provisioning
exception is needed. Existing test helpers create disposable test login roles;
no new application role is added.

## Acceptance evidence and limits

| IDs | Status |
| --- | --- |
| CH8-A carried self-link / duplicate section-link | Unit PASS, isolated negatives in new application test; still specimen semantics only |
| EP-B01 | HELD: real catch/lock/reveal/invoice/settlement chain requires accepted producers |
| EP-B02 | CI test written for exact ordinary-source bytes and client SQL/parameters before/after 25 hidden signals, plus constant held response. NOT RUN. Twin disposable worlds/server nested query log/HTTP timing and actual artifact equality remain HELD |
| EP-B03 | Default producer refusal unit PASS; pending/failed/stale port contract tests written for CI. Actual must-surface Decision/permanent disclosure/ineligibility HELD |
| EP-B04 | Forged/copy binding, wrong principal, missing owner and wrong-job consumer guards unit PASS. Actual foreign tenant/unowned job/session expiry and post-wait revocation tests written, NOT RUN |
| EP-B05 | Read-only coherent snapshots implemented; actual claim amendment across injected wait produces conflict in CI test, NOT RUN. Actual lock/check/settlement races HELD |
| EP-B06 | Original-byte corruption and receive-time immutability tests written, NOT RUN. Actual M4-8 reversal/new provenance/old v3 artifact preservation HELD |
| EP-C01 | API/controller refusal and Next delegation unit PASS; new DB command no-effect test written. No successful v3 service path claimed |
| EP-C02–C06 | HELD: authoritative chain, real worker, persisted replay/race/approval behavior and complete v3 verifier semantics unavailable |
| EP-C07 | v1 pure/API regressions PASS; no v3 output/send/charge implemented. Full API/browser/verifier equivalence and measured external-adapter sentinels remain HELD |
| EP-C08 | Real existing-route unauthenticated refusal browser spec written for both configured projects, NOT RUN. No full journey/accessibility/navigation/second-context acceptance claimed |
| EP-C09 | HELD for future checked-writer migration; no schema changed in this slice |
| EP-C10–C11 | HELD: no authentic checked writer or downstream mixed-version sink integration. No claim that legacy runtime INSERT grants provide semantic v3 validation |

No source inspector/UI/CLI eight-section runtime, v3 list/inspect/download
version dispatch, valid attachment or positive browser journey is implemented.
These depend on the held producers. No route/page for those missing capabilities
was invented. No test is skipped/softened to represent a hold as PASS.

## Check receipt

Existing installed dependencies only. No install/download, lockfile or package
version edit. Node `v24.17.0` (repo pin 24.15.0); pnpm 10.28.1 through the existing
`/private/tmp/ch8-a-bin` shim to the cached Corepack binary. This is not evidence
of a fresh pinned install. Global `pnpm --version` stalled and was interrupted
(exit 130); all checks used the cached pinned executable afterwards.

Disk floor: 107 GiB initially, 105 GiB after builds. Observed memory free 55%,
then 52%. Heavy commands used `HEAVY_SLOTS=2` with the existing heavy-slot wrapper,
Turbo concurrency 1, focused Vitest maxWorkers 2 and <=3 named files per batch.
The sandbox denied wrapper `sysctl`/`ps` observations; the independent
`memory_pressure`/disk observations succeeded. No DB or browser was started.

Logs: `/private/tmp/ch8-v-*.log`. Commands below use
`PATH=/private/tmp/ch8-a-bin:$PATH`; heavy wrapper prefix as above where relevant.

| Command | Actual result |
| --- | --- |
| `pnpm --filter @jobguard/db typecheck` (initial) | FAIL exit 2: duplicate `jobId` spread; corrected; later workspace typechecks passed |
| new API two-file Vitest batch before build | FAIL exit 1 before tests: missing built `@jobguard/db` package entry; built dependencies, reran successfully |
| `pnpm typecheck --concurrency=1` | PASS exit 0 after final source/test changes, all 7 tasks (17.849s); earlier complete runs also passed |
| `pnpm turbo run lint --concurrency=1` (initial) | FAIL exit 2: optional browser `baseURL` needed narrowing; corrected |
| `pnpm turbo run lint --concurrency=1` (rerun) | PASS exit 0 after final source/test changes, all 7 package lint tasks (15.831s); earlier rerun also PASS (19.394s) |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | FAIL exit 1 at lane lint: inherited accepted base stack includes out-of-lane SV-6/CH8-A paths relative to local origin/main; package lint run separately, no allowlist widening |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL exit 1 for same inherited base paths; dispatcher must integrate/rebind main before final CI |
| `LANE_BASE_REF=9fff1e27... node tools/agent-lane-boundary-lint.mjs` | FAIL exit 1: self-comparison range refused; no misleading pass claimed |
| separate uncommitted path check using real `loadLanePolicy/lanePathAllowed` | PASS exit 0: all 19 working-tree/untracked files within own lane |
| `node tools/core-purity-lint.mjs` | PASS exit 0; 236 TypeScript files, eight pre-existing computed import reports |
| `node tools/money-arithmetic-lint.mjs` | PASS exit 0 |
| `node tools/commercial-boundary-lint.mjs` | PASS exit 0 |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/evidence-pack.application.test.ts src/evidence-pack-v3.application.test.ts src/evidence-pack-v3.controller.test.ts` | PASS exit 0, 31 tests after final port naming/guard tests; earlier scoped runs PASS (27 then 30 tests) |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/recovery-cases/[id]/evidence-packs/route-v3.test.ts'` | PASS exit 0, 2 tests |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/evidence-pack-v3.test.ts src/evidence-pack.test.ts` | PASS exit 0, 96 tests |
| `pnpm build --concurrency=1` | PASS exit 0 after final source changes, all 7 tasks (36.335s). Prior complete builds also passed (47.784s, 39.515s) |
| `pnpm openapi:check` | FAIL exit 1: tsx CLI IPC listen EPERM, before checker execution |
| `node --import tsx src/generate-openapi.ts --check` in apps/api | PASS exit 0; same checker without CLI IPC; no generated-file edit |
| `git diff --check` | PASS exit 0 |

Build emitted existing Nest dynamic-module/Next/CSS warnings and nonfatal Turbo
cache-write EPERM warnings. No warning-free or full-CI-green claim.

## Exact shared integration rows (not edited)

No shared registration is needed for the installed authenticated refusal: Nest,
Next and workspace already use the existing EvidencePackApplication. No new
route, AppModule, OpenAPI operation, catalogue or schema row is requested now.
No public barrel was edited. The uncomposed source seam is intentionally local.

After source-boundary review, the coordinator may add these exact DB barrel rows
for consumer composition; these exports do not clear any producer hold:

```ts
export * from "./evidence-pack-v3-ports.js";
export { verifyEvidencePackV3Case, loadEvidencePackV3Sources, prepareEvidencePackV3Sources,
  type EvidencePackV3VerifiedBinding, type EvidencePackV3OrdinarySources } from "./evidence-pack-v3-sources.js";
export { requireEvidencePackV3Writer } from "./evidence-pack-v3-command.js";
```

No CH8-A core export is consumed by runtime code. Tests alone dynamically load
its actual source and fixture to cover the carried guards. A later authoritative
v3 renderer/export registration waits for CH8-A producer binding; adding a barrel
now cannot solve that hold. Source-current/message/follow-up and generated shared
composition remain their owners' serialized work, with fresh exact-head review.

## Required CI and remaining handoff

New DB files are NOT RUN locally:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/evidence-pack-v3-sources.integration.test.ts test/evidence-pack-v3-isolation.integration.test.ts test/evidence-pack-v3-commands.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/evidence-pack-sources.integration.test.ts test/shadow-isolation-query-log.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/evidence-packs.integration.test.ts test/evidence-pack-upgrade.integration.test.ts
pnpm --filter @jobguard/web test:e2e --workers=1 --project=mobile-360 --project=desktop CH-8.spec.ts M4-3-S.spec.ts
```

Full required CI, DB/migration/role/RLS suites, both browser projects, source
acceptance, two independent Claude exact-head verdicts and separate technical
acceptance remain pending. New migration upgrade/consumer success suites are not
invented for a writer that does not exist; their full EP-C09–11 obligations stay
held until the checked binding is implementable. No live provider, AI prompt,
retention, native, production or fee capability changed. No live eval applies.
Dispatcher owns committing, integration onto current main, CI and acceptance.


## Changed-file inventory and final checks

- `apps/api/src/evidence-pack-v3.application.test.ts`
- `apps/api/src/evidence-pack-v3.controller.test.ts`
- `apps/api/src/evidence-pack.application.ts`
- `apps/api/src/evidence-pack.contracts.ts`
- `apps/api/src/evidence-pack.errors.ts`
- `apps/web/app/api/recovery-cases/[id]/evidence-packs/[packId]/attachment-approval/route.ts`
- `apps/web/app/api/recovery-cases/[id]/evidence-packs/route-v3.test.ts`
- `apps/web/app/api/recovery-cases/[id]/evidence-packs/route.ts`
- `apps/web/e2e/CH-8.spec.ts`
- `config/lanes/ch8-v.json`
- `docs/operations/evidence-pack-v3.md`
- `docs/verdicts/CH8-V/BUILDER_RECEIPT.md`
- `packages/db/src/evidence-pack-v3-command.ts`
- `packages/db/src/evidence-pack-v3-ports.ts`
- `packages/db/src/evidence-pack-v3-sources.ts`
- `packages/db/test/evidence-pack-v3-commands.integration.test.ts`
- `packages/db/test/evidence-pack-v3-fixture.ts`
- `packages/db/test/evidence-pack-v3-isolation.integration.test.ts`
- `packages/db/test/evidence-pack-v3-sources.integration.test.ts`

No new operational alert, worker scheduler or external service/data destination
is introduced. No source or financial history is migrated. Database no-effect
assertions and full source/conservation evidence await CI and producer binding;
local unit evidence is not a database guarantee. New integrations remain disabled.

Final handoff: 31 API/controller + 2 Next transport + 96 core tests = 129
focused passing tests. Final workspace typecheck 17.849s, final package lint
15.831s, final full build 36.335s; all seven tasks passed in each. Direct OpenAPI
check passed. `git diff --check` passed after this receipt update. All 19 changed
files are inside CH8-V's allowlist. Aggregate CH8-V/CH-8 acceptance remains HELD.

## catch-up onto SV-5 7e139e0b

25 October 2026. Issued CH8-V-CATCHUP, C261. Builder: Codex. Entry HEAD
`18cc6867f857e24fe6eebe1a5e006f0151f53813`; the dispatcher had already started
merging accepted SV-5 `7e139e0b325c020c07e69867ef12fcfe191d5528`. This section
supersedes the original receipt's exclusion of the old SV-5 candidate. No new
independent verdict, technical acceptance, commit, push or release is claimed.
The dispatcher concludes the merge and returns the result to `codex/sandbox/ch8-v`.

Resolved the seven issued files. Both controller registrations/imports and both
core/database export lists are retained. The privilege contract keeps both sides'
full rows unchanged; an additional deterministic comparison against index stages
2 and 3 verified the group/fact/routine preservation. Upgrade tests compose the
exact named SV-5/0200 additions with the exact 0213 attribution additions; existing
predecessor rows, assertions and grants are preserved. The serious-B5 expected
snapshot layers 0200, 0205 then 0213, rather than dropping either helper. OpenAPI
is regenerated from the combined controllers, with both endpoint additions.
No migration, business row, grant or producer implementation was edited here.

CH8-V alone adapts its port to the actual public services:
`FinalAccountLockRepository.read/verify` and `FinalCheckRepository.read`. The old
transaction-taking `Promise<never>` signature now takes the server-derived scope
and returns the accepted persisted lock and controlled reveal projections.
The authenticated preparation factory installs the actual repositories; locked
preparation closes its read-only source transaction before those APIs open their
own transactions. It checks tenant/job identity, lock existence, verification,
completed reveal, matching lock ID and a nonempty run ID. The reveal service gets
the authenticated session digest and performs its own current authorization.
No reveal call occurs before lock or on failed verification. No shadow worker,
manifest query, credential, detection or commercial write is introduced.

These public projections are not an eight-section export contract. Successful
port binding reaches the existing section-mapping hold, now explicitly typed
`HOLD-EP-SECTIONS`, with the same public dependency-held error. Pending/failed
checks never become completed or clear; producer failures propagate. Must-surface,
checked writer, section mapping, attribution/settlement export and consumer holds
remain. No HTTP success or fee capability is enabled. The unlocked source path
remains ordinary-only. Separate producer transactions are not claimed to establish
a coherent whole-pack snapshot. Operational notes record this limitation.

One C261 delta unit check was appended to the existing CH8-V application test
file. It exercises the real factory/public classes with method doubles: no lock,
failed verification, unlocked/pending/failed reveal, wrong lock, revoked-access
failure, exact completed result, foreign tenant and foreign-job lock. It is
unit evidence, not a PostgreSQL isolation or browser guarantee. No existing test
assertion was weakened or deleted; no lane allowlist was expanded.

Checks use installed dependencies only, Node v24.17.0 and cached pnpm 10.28.1 via
`PATH=/private/tmp/ch8-a-bin:$PATH`. This is not a clean pinned-install claim.
Logs: `/private/tmp/ch8-v-catchup-*.log`.

| Command | Result |
| --- | --- |
| `pnpm --filter @jobguard/core --filter @jobguard/db --filter @jobguard/api typecheck` | PASS initially and after final source/test changes: core, db and api |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | FAIL: only the expected unregistered `codex/sandbox/ch8-v-catchup` branch at the lane gate; purity passed first |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Same expected branch-name failure; no bypass or registry edit |
| `pnpm turbo run lint --concurrency=1` | PASS initially and after final source/test changes: all 7 packages (final 1m44.908s) |
| `node tools/money-arithmetic-lint.mjs` | PASS |
| `node tools/commercial-boundary-lint.mjs` | PASS |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/evidence-pack-v3.test.ts src/evidence-pack.test.ts src/final-check.test.ts src/final-check-completion.test.ts src/final-account-lock.test.ts` | PASS: 5 files, 120 tests |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/final-check-c239.test.ts` | PASS: 1 file, 8 tests |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/evidence-pack.application.test.ts src/evidence-pack-v3.application.test.ts src/evidence-pack-v3.controller.test.ts src/final-check.application.test.ts src/final-check.controller.test.ts src/final-check.http.test.ts src/final-check.isolation.test.ts src/final-check.worker.test.ts src/final-account-lock.application.test.ts src/final-account-lock.controller.test.ts src/customer-invoice-sv5pre.filter.test.ts src/sv5pre-worker-registration.test.ts` | PASS: 12 files, 73 tests, including the C261 delta |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/recovery-cases/[id]/evidence-packs/route-v3.test.ts'` | PASS: 1 file, 2 tests |
| `pnpm build --concurrency=1` | PASS initially and after final source/test changes: all 7 tasks (final 3m30.5s) |
| `pnpm --filter @jobguard/api openapi:generate` / `pnpm openapi:check` | Both CLI invocations FAIL before execution: tsx IPC listen EPERM |
| `node --import tsx src/generate-openapi.ts` then `node --import tsx src/generate-openapi.ts --check`, in apps/api | Both PASS, same repository generator/checker without CLI socket |
| `git diff --check` and seven-file marker scan | PASS |

Diagnostic attempts: the first direct generator invocation preceded the dependency
build and failed on missing `@jobguard/db/dist/index.js`; it passed after build.
A direct check launched at the workspace root could not resolve the API-local
`tsx` dependency; the correct apps/api invocation passed. The adapter delta first
passed in a temporary db unit file (9 tests with C239); it was moved into the
existing CH8-V API test file before the final 73-test run. No temporary test remains.

The initial API selection also included `final-account-lock.isolation.test.ts`,
which contains a real-database suite despite its name. Its setup attempted port
allocation and failed (`no free port in 58400..58650`); PostgreSQL never started,
its database assertion did not execute, and the runner reported one skipped test.
The corrected unit-only batch above passed. PostgreSQL integration/migrations/RLS
and browser suites are NOT RUN; GitHub CI after the dispatcher pushes must supply
them. This records the failed setup attempt, not a database pass. Existing build
warnings about tracing roots/CSS and nonfatal Turbo cache-write EPERM remain.

The seven paths remain unmerged in the read-only Git index by design, even though
the working files are resolved. No `git add`, commit, checkout, push, package
installation or download occurred. Intended conventional commit message:
`/private/tmp/jg-msg-ch8-v-catchup.txt`. C261's one independent delta review and
separate acceptance remain the dispatcher's handoff; this builder does not supply
its own verdict. Aggregate CH8-V/CH-8 acceptance and all unrelated gates stay held.

Final C261 handoff: 120 core + 8 database-package unit + 73 API + 2 Next transport
= 203 passing tests on the final source/test layout. Final three-package typecheck,
seven-package lint, seven-task build, direct OpenAPI check and `git diff --check`
passed. Both conflicted upgrade test files also passed a TypeScript syntax-only
transpile check; this is explicitly not their database acceptance. The index still
reports seven UU paths until the dispatcher stages and commits the resolved files.

## r1 — C250 repair, 25 October 2026

Issued repair round 1 of 2, RED lane (shadow disclosure and evidence). Builder:
Codex, issued gpt-6.1-sol / medium. Branch `codex/sandbox/ch8-v`; clean on entry,
HEAD `fce9c7be615d4e9f6c5840fb9f501f011480b694` (CH8-V-CATCHUP, accepted
SV-5 `7e139e0b` port bound). This receipt describes the uncommitted repair delta
against that exact HEAD, not a new independently reviewed or accepted commit.
Dispatcher owns staging, commit, push and the exact-commit independent recheck.

Read the full independent REPAIR verdict for
`18cc6867f857e24fe6eebe1a5e006f0151f53813` at
`/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch8-v-claude-A-18cc6867-20261025.md`
(the relative `jg-runs/` path is absent in this checkout). Also read AGENTS.md,
BUILD_PLAN CH-8, the v3 contract, source/fixture/tests, tenant context and the
existing recovery-case integration command examples.

Repairs:

- Blocking 1: fixture opening and handoff-time claim amendment now call the
  repository's public `command` path, as existing recovery integrations do.
  Opening uses the returned view's `id`; amendment reads the authorized member
  view's revision before issuing the command. `commandInTransaction` and its
  landing-only action restriction are unchanged.
- Blocking 2: a local `withEvidencePackV3Snapshot` helper adapts the pool's exact
  `BEGIN` to `BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY`, following the
  existing `practiceMaterialPool` connect/query wrapper pattern and the existing
  BEGIN-time isolation syntax in `test/lock-observer.ts`. Source snapshots and
  fixture ordinary reads use that helper. `withTenant` still validates the
  original stamped context and owns parameterized transaction-local tenant
  setup, commit/rollback and release. No shared tenant-context edit was needed.
- Added three unit checks for snapshot commit/rollback/release and rejection of
  copied tenant context before connecting. Added one real-PostgreSQL assertion
  for isolation/read-only settings, tenant setting and actual BEGIN-before-context
  SQL order, for the reviewer/CI to execute. Existing assertions remain intact.

No schema, migration, grants, provider settings, commercial policy or operational
alerts change. Ordinary source shapes and public APIs remain compatible; no new
barrel export. SV-5 binding is preserved. Sections/must-surface/writer and other
aggregate CH-8 holds remain; this repair does not enable v3 exports, hidden source
reads, sends, charges or fee qualification. Affected invariants: §5.1 tenant
context, §5.8 original evidence integrity and §5.14 pre-lock non-disclosure.

Commands actually run with Node 24.17.0 and cached pnpm 10.28.1 through
`PATH=/private/tmp/ch8-a-bin:$PATH` (no install/download). Logs are
`/private/tmp/ch8-v-r1-*.log`:

| Command | Result |
| --- | --- |
| `pnpm --filter @jobguard/core --filter @jobguard/db typecheck` | PASS, both packages |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | FAIL at lane gate: comparison includes inherited stacked changes outside CH8-V; no lane policy bypass/edit |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Same inherited-path failure; local origin/main is `cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe` |
| `pnpm turbo run lint --concurrency=1` | PASS, all 7 package checks |
| `pnpm exec vitest run --maxWorkers=2 src/*.test.ts` in packages/core | PASS, 112 files / 2,537 tests |
| `pnpm exec vitest run --maxWorkers=2 src/*.test.ts test/final-check-c239.test.ts test/recovery-case-join.test.ts test/recovery-case-outcome.test.ts test/verify-evidence-pack-cli.test.ts` in packages/db | Final run after dependency builds PASS, 30 files / 250 tests |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/evidence-pack.application.test.ts src/evidence-pack-v3.application.test.ts src/evidence-pack-v3.controller.test.ts` | PASS, 3 files / 35 tests, including 3 new snapshot lifecycle negatives/positives |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/recovery-cases/[id]/evidence-packs/route-v3.test.ts'` | PASS, 1 file / 2 tests |
| `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | All PASS |
| `pnpm openapi:check` | FAIL before checker execution: tsx CLI IPC listen EPERM |
| `node --import tsx src/generate-openapi.ts --check` in apps/api, after dependency builds | PASS; same repository checker without the CLI IPC server |
| `pnpm build --concurrency=1` | PASS, all 7 tasks; 1m27.617s |
| `git diff --check` | PASS, including the r1 receipt |

Diagnostics, not passing evidence: the initial unfiltered core command selected
generated dist tests and failed two source-inspection checks against emitted JS;
stopped and reran explicit source paths, all green. The first db command used
Vitest's substring filter `src`, unintentionally selecting four `dbsrc`-named
integration files. Their cluster setup failed before PostgreSQL started (18 tests
skipped); stopped the run and switched to explicit source filenames. PostgreSQL
assertions did not execute. The first explicit db unit run, concurrent with
dependency builds, had 4 C239 failures from stale built exports and 1 existing
audit reachability timeout at its unchanged 5s limit. The same complete selection
passed after dependency builds, with no test or timeout weakened. The first direct
OpenAPI attempt also hit stale db exports; the post-build checker passed.

The three CH8-V PostgreSQL files, database/migration/RLS/catalogue suites and
browser suites are NOT RUN here. Reviewer/CI must rerun all three CH8-V files
(now 17 assertions, including the added isolation regression), with API build
available for the command test's dist import. Green unit doubles do not prove
PostgreSQL isolation or hidden-world noninterference. No acceptance is claimed.
No git-writing commands, commit, push, PR, package download or live provider action.
Intended conventional commit subject/body: `/private/tmp/jg-msg-ch8-v.txt`.

Final r1 handoff: 2,537 core + 250 db-package unit + 35 API + 2 Next transport =
2,824 passing tests. Six tracked repair paths changed, all within the CH8-V lane's
allowlist. Full build and package lint passed; existing Next workspace-root/CSS
warnings and nonfatal Turbo cache-write EPERM are retained in the logs. Required
origin/main lane checks remain failed on inherited changes, not waived. Both
blocking fixes are source-inspected and unit-tested where applicable; their
real-PostgreSQL verdict remains for the independent reviewer after dispatcher
commit/push. No aggregate acceptance, independent r1 verdict or release is claimed.
