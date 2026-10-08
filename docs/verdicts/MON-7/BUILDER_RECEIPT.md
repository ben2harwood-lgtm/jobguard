# MON-7a builder receipt — review and CI pending

Branch/lane: `codex/sandbox/mon-7a` / `mon-7a`.
Base and starting HEAD: `0264158ffa8fbe61f7c896be9a9c5aa210f07af0` (merged CH-3a #98; M2-6-S #89 is present).
Implementation HEAD: **not yet assigned**. The implementation is an uncommitted
working-tree diff. The dispatcher commits and supplies the exact implementation
SHA; the starting HEAD is not a claim that this implementation was committed or
reviewed. No git write, push, merge or PR operation was performed.

**B4 is MON-7b and PARKED until payment stages exist. No exposure figure, curve
or schedule is built or defined. MON-7 is not fully accepted while B4 is parked.**
This receipt covers only issued MON-7a: B1, B2, B3, B5 and B6 and their DW1–DW4.
The draft's Sol PASS was a work-order check, not review of this implementation.
No independent Claude verdict or separate technical acceptance exists for this diff.

## Delivered behavior and decisions

- B1: five persisted property checks on the current CH-3a site revision, available
  in the quote editor and the existing non-capture workspace. Homeowners remain
  eligible for property facts. The card shows its exact source and retrieval date.
- B2: the job's own saved paying-party binding, with server retrieval time and
  separately labelled binding recorded time/revision. Missing binding shows
  `unknown`. No named individual is searched.
- B3: a cited free generated company card. The binding's customer revision is
  authoritative; no client eligibility/type/individual/company-number claim is
  accepted. Unknown boundary fields are rejected by the strict schema.
- B5: explicit start/stop/evaluate commands, no default watch or scheduler. Only
  Companies House (synthetic) and The Gazette (synthetic) fixtures are evaluated
  on demand at the supplied scenario server time. Results are advisory cards;
  no Decision, notification, outbox action, fee or outbound call is created.
- B6: generated dated fictional records, with mixed, fresh, stale and missing
  variants. No live route, real company/address lookup or paid check is built.
  The live factory refuses every initialization, with no fallback.

`prevention-company-eligibility-reference.v1` (Q7): exactly `business` AND a valid
CH-3a company number (eight digits, or two capitals and six digits). Every other
customer type or missing/invalid number yields `not run — not a registered company`,
never `clear`. `person` is always ineligible for a company check or watch. This is
reference-only; production eligibility remains D12 v3 / Ben's decision.

Fixture identity: `generated-prevention-registers.2026-10-07.v1`.
Retrieval: `2026-10-07T12:00:00.000Z`; stale observation:
`2026-09-01T00:00:00.000Z`; missing information keeps the dated retrieval attempt
but has null fact/observation. Mixed: Article 4 missing, flood stale, listed-building
constraint, company active, a fictional Gazette notice. UI scenario evaluation:
`2026-10-07T13:00:00.000Z`. Results remain labelled snapshots at their evaluation
scenario time; GET does not re-run a check. Dates are not fabricated at read time.

Q2: `prevention-staleness-reference.v1`, explicitly reference-only, with observation
age inclusive at the maximum and fail-closed missing/future data. Each synthetic
maximum is recorded below; none selects a production source threshold.

| Source | Maximum age (minutes) |
|---|---:|
| synthetic-listed-building.v1 | 1440 |
| synthetic-conservation-area.v1 | 1440 |
| synthetic-article-4.v1 | 1440 |
| synthetic-planning-history.v1 | 1440 |
| synthetic-flood.v1 | 180 |
| synthetic-companies-house-card.v1 | 1440 |
| synthetic-companies-house-feed.v1 | 180 |
| synthetic-gazette-feed.v1 | 180 |

## Done-when evidence

| Assertion | Implemented coverage | Observed result / limit |
|---|---|---|
| DW1 source and retrieval date | Strict core result/schema; matching PostgreSQL citation constraints; property/company/feed UI cards; separate paying-party provenance | Core tests pass. PostgreSQL and browser assertions await CI. |
| DW2 stale/missing = unknown | Pure versioned staleness policy, all eight result kinds, forged-clear rejection, future-date handling; API fixture tests; PostgreSQL invalid-state inserts; browser stale/missing variants | Core/API deterministic tests pass. PostgreSQL/browser behavior is not locally verified. |
| DW3 subject restrictions | Business+number guard; current binding derived server-side; PracticeAccess on every endpoint; repository membership/session check; wrong-job/individual SQL guards; all seven types tested; forged type/flag rejected | Core/API checks pass. Actual PostgreSQL and two-session browser denial assertions await CI. |
| DW4 complete severance | Architecture scan of fee, charging, ledger, journal, recovery, meter, plan, entitlement and value modules; DB byte-identical financial/value-input/Decision/outbox snapshots; browser unchanged £125 VALUE-1 extra and £203 fee-illustration figures after all actions | Architecture test passes. DB/browser assertions await CI. No protected money/value module changed. CH-9 and MON-1 must retain this architecture test and re-prove their future receipts/meters. |

C1–C2: shared `createWorkspaceApplication.preventionChecks`, thin Next adapters,
Nest controller and generated OpenAPI. Same persisted source results survive
reload, Jobs reopening and a returning browser in the authored browser assertions.
C3: synthetic gate; fixture-only adapter; live refusal; zero fixture fetch calls
verified by a deterministic spy (not a live-provider test).
C4–C5: two tenant-owned append-only tables; command receipt uniqueness; expected
binding/watch revisions; concurrent replay/one-effect conflict tests; atomic audit
rollback test. No new SECURITY DEFINER helper or elevated runtime table grants.
Runtime cannot directly row-lock job or membership tables (no UPDATE grants),
so prevention commands use a tenant/job transaction advisory lock and reuse
CH-3a's narrow `require_current_job_parties` share-lock routine. All business and
receipt writes precede the final audit-head lock. Replays recheck current access
and return the exact persisted command result.
The quote-panel mount follows the existing Price the work heading so the
existing workspace keyboard-focus target remains first.
C6–C7: nine PostgreSQL integration cases and three browser journeys in both
viewports; source assertions, unknown states, focus, 44px targets, banner and
horizontal-overflow checks. Test discovery succeeds; execution is held by sandbox.
C8: receipt and path manifest supplied. Independent exact-commit review and
separate acceptance are still required. The builder does not self-accept.

## Commands actually observed

Node: `v24.17.0`; local cached pnpm: `10.28.1`; Vitest: `4.1.11`.
Dependencies were already installed. `pnpm install --frozen-lockfile` was NOT run,
following the dispatcher's explicit no-download/preinstalled-dependencies note;
this is not a clean-install verification.

For pnpm commands below, the actual command prefix was
`PATH=/private/tmp/jg-pnpm-mon7a:$PATH`. This temporary launcher executes
`node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.
The default pnpm launcher warned that the package's pnpm.overrides were ignored
and hung before the first core/API tests; both attempts were interrupted (130).
The cached pinned launcher needs no download and leaves package/lockfiles intact.

| Exact command (prefix above unless stated) | Exit | Evidence |
|---|---:|---|
| `pnpm --filter @jobguard/core exec vitest run src/prevention-checks.test.ts` — failed first | 1 | `Cannot find module './prevention-checks.js'`; implementation absent, 0 tests collected. |
| `pnpm --filter @jobguard/api exec vitest run src/prevention-check.application.test.ts` — failed first | 1 | Unbuilt `@jobguard/db` entry prevented collection; this is not a behavioral failure proof. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/prevention-checks.integration.test.ts` — failed first | 1 | Unbuilt `@jobguard/core` entry prevented collection; no PostgreSQL assertion executed. |
| `pnpm --filter @jobguard/core build` | 0 | Compiled core exports. |
| `pnpm --filter @jobguard/db typecheck` | 0 | Compiled repository types. |
| `pnpm --filter @jobguard/db build` | 0 | Compiled DB exports. |
| `pnpm --filter @jobguard/storage build`; `pnpm --filter @jobguard/config build`; `pnpm --filter @jobguard/ai build` | 0 each | Materialized existing workspace dependency dist outputs; no source changes. |
| `pnpm --filter @jobguard/core exec vitest run src/prevention-checks.test.ts` — final | 0 | 27 tests pass (`/private/tmp/mon7a-core-final-exact.log`). Earlier passing run: 26 before additional policy predicate case. |
| `pnpm --filter @jobguard/api exec vitest run src/prevention-check.application.test.ts` — final | 0 | 5 tests pass (`/private/tmp/mon7a-api-final-exact.log`). |
| `pnpm typecheck` — three runs | 0 each | 7 packages successful, final `/private/tmp/mon7a-typecheck-last.log`. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passes; lane guard refuses a self-comparison because HEAD equals origin/main. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same `Missing branch or self-comparison range; refusing a misleading pass.` |
| `pnpm turbo run lint` — twice | 0 each | All 7 package checks pass; final `/private/tmp/mon7a-package-lint-final.log`. This does not replace the root lane guard. |
| `node tools/core-purity-lint.mjs` (no pnpm prefix) | 0 | Core purity passes, 109 TypeScript files. |
| `node tools/money-arithmetic-lint.mjs` (no pnpm prefix) | 0 | Money arithmetic boundary check passes. |
| `node tools/commercial-boundary-lint.mjs` (no pnpm prefix) | 0 | Commercial boundary check passes. |
| `pnpm test` | 1 | Tool tests pass; unchanged receipt-allocation tests time out (4 failures across src/dist, 2910 pass). Turbo stops before full downstream suites. `/private/tmp/mon7a-test.log`. |
| `VITEST_MAX_WORKERS=1 pnpm test` | 1 | Same four receipt-allocation timeouts; 2910 pass. `/private/tmp/mon7a-test-serial.log`. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/prevention-checks.test.ts src/receipt-allocation.test.ts` | 1 | 60 pass; one unchanged 2000-line receipt-allocation test exceeds 5000ms. `/private/tmp/mon7a-core-final.log`. No money implementation or test timeout weakened. No baseline checkout/run performed, so pre-existing failure is not claimed as independently established. |
| `pnpm build` — three runs | 0 each | All 7 packages; production Next build includes both new routes. Final `/private/tmp/mon7a-build-last.log`. |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | tsx CLI IPC `listen EPERM` for its temporary `.pipe`. |
| `node --import tsx apps/api/src/generate-openapi.ts` from root | 1 | Root cannot resolve the API-local tsx package. |
| `node --import tsx src/generate-openapi.ts` from `apps/api` (no pnpm prefix) | 0 | Actual generator executed without CLI IPC; openapi.json regenerated. |
| `pnpm openapi:check` from `apps/api` | 1 | Same tsx CLI IPC `listen EPERM`. |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` (no pnpm prefix) — twice | 0 each | Same real generator verifies committed JSON, no substituted contract check. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/prevention-checks.integration.test.ts` — with built dependencies | 1 | `Postgres init script exited with code null. Please check the logs for extra info. The data directory might already exist.` Final run: 9 skipped, 0 DB assertions; `/private/tmp/mon7a-db-final.log`. |
| `pnpm test:db` | 1 | Embedded PostgreSQL unavailable; 41 suites failed, 5 passed, 30 tests passed/302 skipped/3 failed, 2 errors. Two free-port cases time out at 5000ms; restore-rehearsal and its errors report `listen EPERM: operation not permitted 127.0.0.1`. `/private/tmp/mon7a-testdb.log`; no claim of a DB guarantee passing. |
| `pnpm test:migrations` | 1 | Both integration suites fail PostgreSQL initialization; 1 deterministic test passes, 12 skip. `/private/tmp/mon7a-migrations.log`. |
| `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop MON-7.spec.ts` | 1 | Web server `listen EPERM: operation not permitted 0.0.0.0:3000`; journeys never execute. `/private/tmp/mon7a-e2e.log`. |
| `pnpm --filter @jobguard/web exec playwright test --list --project=mobile-360 --project=desktop MON-7.spec.ts` | 0 | Discovers all six cases; not execution evidence. |
| `pnpm --filter @jobguard/db exec vitest list test/prevention-checks.integration.test.ts` | 0 | Discovers all nine cases; not execution evidence. |
| `pnpm --filter @jobguard/web typecheck` | 0 | Includes the final browser spec. |
| `git diff --check` (no pnpm prefix) | 0 | No whitespace errors. |

A separate read-only working-tree path check used the existing `selectLane` and
`matches` helpers against `git diff --name-only` plus untracked files: exit 0,
all paths in mon-7a. It is explicitly not the failed commit-range CI guard.
The lane file changes by exactly one compact JSON line, between main-integration
and outbox-adapter-1. No other lane line changed. The real lane guard must run
again on the dispatcher's committed head. Turbo emitted non-fatal sandbox cache
`IO error: Operation not permitted (os error 1)` warnings and replayed two existing
package-cache entries; this is recorded rather than called a clean pinned install.
Existing global CSS autoprefixer and multiple-lockfile tracing warnings remain.

No screenshot/trace of a successful browser run exists. No live model/provider,
CI, clean install, PostgreSQL constraint or browser success is claimed. `pnpm eval`
was not run: AI prompts/models/parsers/gateway/matching are unchanged; prevention
is a deterministic fixture result policy with its own domain tests.

## Migration, overlaps and gates

0103 is the issued number, not draft 0057. Additive two-table migration with
reference-only validation, subject guards, indexes, RLS, ownership and narrow
grants. No data backfill or historical rewrite. Fresh install and upgrade from
0095 are authored tests, not locally executed proof. Rollout is expand-compatible;
forward fix in a later reviewed migration, preserving facts/audit; disable affected
commands during repair. Migration notes and the versioned contract are updated.

Shared editing seams: lane registry, core/db barrel exports, migration registry,
Nest module/OpenAPI, workspace composition/index, quote-editor and workspace-shell
mount points, and catalog/count test rows. Integration/serialization owner is the
JobGuard integrator/dispatcher; this builder owns only this working-tree leaf.
No other lane was edited. Catalog/count changes are additions/totals for 0103 only.
`BUILD_PLAN.md` is allowed solely for the integrator's §12.2 ledger and remains
untouched by the builder. The data-flow register remains untouched (Q6): no
external route is introduced; each live source needs its own entry with D04 and
D12 v3 evidence before use. AGENTS, decisions, policy/config packages, AI source,
fee/recovery/value/meter/entitlement code, package files and lockfile are unchanged.
TENANT-STAMP-1 is not merged in this base. New tests use the available membership
context constructor; applications obtain context exclusively through PracticeAccess.

Invariants touched: tenant/subject isolation, immutable binding lineage, strict
input/output schemas, exact idempotency, explicit watch authorization, audit atomicity
and final-lock ordering, synthetic-only gate, prevention/financial severance.
No new provider destination, financial migration, professional approval or worker
alert/schedule. Remaining gates: G1; live M2-6; D04 and D12 v3 per live source;
D14 for any future paid check; full exact-head CI, independent Claude verdict and
separate technical acceptance. CH-9 / MON-1 must keep severance tests passing.
B4 remains parked; full MON-7 acceptance is not achieved.

Intended message is `/private/tmp/jg-msg-mon-7a.txt`.

## Changed-file SHA-256 manifest

Generated from actual tracked changes and untracked source files. Receipt excluded
from its own hash to avoid a circular digest. Exact implementation commit binding
is still the dispatcher's responsibility.

| File | SHA-256 |
|---|---|
| `apps/api/openapi.json` | `b6ae856f90bb5374cad701724242b84ef9a55df07ef042fe6e1032ae5b7fbf7a` |
| `apps/api/src/app.module.ts` | `0ba4cfae46270dd6a0e3c6f774b4049bfeff7e67d28f882b607c6bb87acd5045` |
| `apps/api/src/prevention-check.application.test.ts` | `68029216d8ad5b1b90f9d36bf61023532c6a5472994a788d2b97ee8337370be3` |
| `apps/api/src/prevention-check.application.ts` | `260852260866eb1f215d08d585ab25ab2f440bf58865748a07a510e59ad99003` |
| `apps/api/src/prevention-check.contracts.ts` | `dbd4045fbfacbb8de7b3b469a34fcce2de8700a97488d8a68615d46aa1c80834` |
| `apps/api/src/prevention-check.controller.ts` | `1d31f6403c5ab94382e145de0070fc7e8808dad9a530924ea0774bdb058950a5` |
| `apps/api/src/workspace/application.ts` | `c47bb72068801b145816f478e4f0b6b71cd440809d937d0d2ab4575faa489196` |
| `apps/api/src/workspace/index.ts` | `a97d4fb7a8fe395efd81df247c73296198f2f9de1c49beb40e1600046cb9619c` |
| `apps/web/app/api/jobs/[id]/prevention-checks/[action]/route.ts` | `baefc90791373916554a2eb47793bea445ab79dbf97ffbb80c400f139d502b08` |
| `apps/web/app/api/jobs/[id]/prevention-checks/route.ts` | `9faa4b06f00e2cd8d489b857a244c738c22e8d12bde04d80a64665112f56b12e` |
| `apps/web/app/ui/prevention-checks.module.css` | `596fc35d139673ee4d3b84f4c85a6588e0132eff093e08e62df45f8a289118a4` |
| `apps/web/app/ui/prevention-checks.tsx` | `4b7d9e7f2edaed1db93afe1bf44b407f1a1e16aa843134d7b14fb5fbf9b87da9` |
| `apps/web/app/ui/quote-editor.tsx` | `28537d248486bde1fdd437de6826abb4d1d24dd247072182b8cbb8a5a7af5d8c` |
| `apps/web/app/ui/workspace-shell.tsx` | `28cee80d4e1bfc3f928177d76845d072f042967d4730b3a116d182dd2f09dafb` |
| `apps/web/e2e/MON-7.spec.ts` | `1b2a0f9093e847dc6d447ed0876d263fd7d3a22cdc508ad41a167a65dcc39fc3` |
| `config/agent-lane-assignments.json` | `c34b68c92560a5c5f15a131bdc3b5a16ecafd932f50d85f19e51f00c1bc023f6` |
| `docs/contracts/prevention-checks-v1.md` | `24ea613a06a46e6a7a7303a7bb56ff5d2d3713c56b8ed64875d88131da6e8810` |
| `packages/core/src/index.ts` | `820e2035ce92369b7ff840c387c78e34f928b1571fd12ba851b1443664f42c33` |
| `packages/core/src/prevention-checks.test.ts` | `dc58123474245094966b2954b5245cd0890d6b018e824e8f6d6e4b189331f570` |
| `packages/core/src/prevention-checks.ts` | `ddddf67d82e3891ef99439ef9a76d1a4fe3d6a85aedcd6365b08ee0f851b5677` |
| `packages/db/MIGRATIONS.md` | `1ff994692a17e009717d61ff2c90dc93e17bf50aa57e5c990eefa4482ff931e6` |
| `packages/db/migrations/0103_prevention_checks.sql` | `f0ba63eb2e9c47bd446fb2977fd453ed4ac11174946f4b47b1c2625c8e407340` |
| `packages/db/src/index.ts` | `bd2f36b9932f49aa18cc814525b564dae4160a3fbe35c70290bac52acf2275e3` |
| `packages/db/src/migrate.ts` | `6a2323d2e6b23b339cf0a81eaf73bce2fb037f7668c4719167c41049e14dfb57` |
| `packages/db/src/prevention-check-repository.ts` | `0a6e7a8d940b244682546c97be0ffc10e0a9f9236dfe72ecd0b098c09ab0d712` |
| `packages/db/src/prevention-register-fixtures.ts` | `6f0910cb67dc5d744cd7c09a9e4ae8a117f9eecac804cb3529043e5108259544` |
| `packages/db/test/UIWIRE-12.integration.test.ts` | `03e3c38329963fc739ff2ec490089113563b5694741b850718e0df912ae238f8` |
| `packages/db/test/demo-bootstrap.integration.test.ts` | `9dc34365251f6f9e38010198f4b470e93d8ea80753ea7795dc7e37a49b7251f0` |
| `packages/db/test/prevention-checks.integration.test.ts` | `5983ddc23b539980eca8fd9f9aeeb72c453ffe7975bb670cc1afda849cfd4116` |
| `packages/db/test/tenancy.integration.test.ts` | `bca558d942571dabe7469cc6b40b6e607d92f0889c3c324403f486bac2f42dad` |
