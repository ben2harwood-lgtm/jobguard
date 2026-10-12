# SV-3 builder receipt

Builder: Codex GPT-6.1 Sol (dispatch-designated builder). Date: 12 October 2026.
Branch: `codex/sandbox/sv-3`.
Base: `262f939514383df28d6811e889650d0571a70145` (SV-2 refreshed head, supplied by the dispatcher and treated as merged).
No fetch, GitHub operation, add, commit, push, merge, package/dependency change, download or release was performed.

**Status: HOLD. This is a reviewable implementation with explicit incomplete parts; it is not technical acceptance or a completed SV-3 verdict.** Missing source integrations and the exhaustive mutation/export/notification/telemetry isolation proof remain work. PostgreSQL and browser proofs are authored, never claimed executed. The shared outbox composition cannot start before SV-4's terms relation exists.

## Changed files

- `apps/api/src/shadow-detection.worker.test.ts`
- `apps/api/src/shadow-detection.worker.ts`
- `apps/api/src/shadow-isolation.application.test.ts`
- `apps/api/src/worker.ts`
- `apps/web/e2e/SV-3.spec.ts`
- `config/agent-lane-assignments.json`
- `docs/contracts/shadow-detection-v1.md`
- `docs/fixtures/ai/SHADOW_EVALUATION.md`
- `docs/fixtures/ai/shadow-labels.v1.json`
- `docs/fixtures/ai/shadow-observations.v1.json`
- `packages/ai/src/evaluation-cli.ts`
- `packages/ai/src/index.ts`
- `packages/ai/src/shadow-evaluation.test.ts`
- `packages/ai/src/shadow-evaluation.ts`
- `packages/ai/src/shadow-proposal.test.ts`
- `packages/ai/src/shadow-proposal.ts`
- `packages/core/src/index.ts`
- `packages/core/src/observation.test.ts`
- `packages/core/src/observation.ts`
- `packages/core/src/shadow-detection.test.ts`
- `packages/core/src/shadow-detection.ts`
- `packages/db/MIGRATIONS.md`
- `packages/db/migrations/0129_shadow_detection.sql`
- `packages/db/src/index.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/shadow-detection-repository.ts`
- `packages/db/src/shadow-observation-reader.ts`
- `packages/db/test/shadow-catalog.integration.test.ts`
- `packages/db/test/shadow-detection.integration.test.ts`
- `packages/db/test/shadow-isolation-query-log.integration.test.ts`
- `packages/db/test/tenancy.integration.test.ts`
- `docs/verdicts/SV-3/BUILDER_RECEIPT.md`

## Build and Done-when mapping

“BUILT” below means implemented with named coverage. It does not turn an unexecuted PostgreSQL/browser test into a pass.

| Item | Status and evidence |
| --- | --- |
| B1 Deterministic detectors | **HELD in full; fixture portion BUILT.** `shadow-detection.test.ts` covers supplier/order, completion-photo, note/voice and customer-request families. Runtime reader has real RLS reads and immutable source binding for supported synthetic caption fixtures. Missing finalized-object/source bindings hold supplier sources; the order authority hash cannot bind evidence, so the runtime order adapter is held. Imported baseline/scope/timing adapter is held; imports are refused. |
| B2 AI proposals | **BUILT.** `shadow-proposal.test.ts`: strict output, individually dropped/countable bad citations, fixed gateway controls, fixture-only provider, and rule I despite low confidence/model hold. No network client/provider factory is constructed. |
| B3 Coalescing/matching | **BUILT.** `shadow-detection.test.ts` J/P and `shadow-detection.integration.test.ts` J/P: SV-1 functions, stable per-source identities, one surviving work identity, three sources, late-source identity preservation, replay, and draft/rejected/withdrawn captures. Pre-lock capture exclusion is a held-state outcome marker; post-lock reconciliation is SV-5's work. Database cases NOT RUN. |
| B4 Must-surface | **BUILT, Q4 wording HELD.** Migration 0129; named I, rollback, audit-contract/chain, role/catalog and FK cases in `shadow-detection.integration.test.ts`. Decision/disclosure/firing/audit are one controlled transaction. Rule version and permanent ineligibility retained. Database/browser cases NOT RUN. |
| B5 Track-neutral observations | **BUILT.** `observation.test.ts`: five strict versioned kinds, immutable finalized-object metadata, resolving character spans, no track/signal/origin/eligibility/financial authority. No contractor sink. |
| DW1 Held-out evaluation | **BUILT.** `shadow-evaluation.test.ts` verifies all eleven classes and TP **3**, FP **0**, FN **0**; recall **1**, false-positive precision **1**, dropped citations **0**. Separate labels, one-to-one identities, predictions before labels. Both current CLI and filtered `pnpm eval` executed successfully. Small synthetic corpus; no general accuracy claim. |
| DW2 Fixture/live distinction | **BUILT.** Distinct `fixture` figures and `live_model.status=not_run`, with `live-model: NOT RUN (separate release item)`. Fixture provider execution and no fetch verified. |
| DW3 Q/SB-02 | **HELD.** Application proof enumerates OpenAPI builder GETs and Next job GETs, starts real Nest/Next against a migrated baseline and an exact cloned seed, inserts 25 held signals **with evidence links**, compares status/headers (only Date excluded)/body bytes, and checks runtime statement sequences/counts/no shadow access. A successful Log an extra/retry, inbox, value response, error commands and outbox snapshots are included. The separate DB query-log test covers eight real builder application reads. Exhaustive successful mutating routes, export bytes, notifications, cache/telemetry events and every badge path are not yet covered; do not call this exhaustive Test Q. All runtime proofs NOT RUN. Shared package barrels export inert domain/repository definitions; no direct detector import, call or enqueue was added to a builder controller/Next adapter. Strict transitive-import isolation, if required beyond execution/query isolation, is not claimed. |
| DW4 J/P | **BUILT for this leaf.** Core J/P pass; real-PostgreSQL J/P authored, NOT RUN. J's one recovery/one fee half is owed by SV-6, as issued. P stores `builder_captured` with an exact capture reference and no fee/eligibility construction; £0 means exclusion, not arithmetic. |
| DW5 I/SB-04 | **BUILT; database/browser evidence HELD.** Synthetic 800000 pence significance fact; real fixture AI hold/low confidence; one mandatory finding/Decision via normal inbox query; rule-version firing, disclosure and both permanent reasons; replay/conflict, rollback and monotonicity tests. `SV-3.spec.ts` checks reload/Jobs, persisted identity/mandatory classification, no suppression, banner, keyboard operation, 44px primary target and overflow. Q4 detail remains empty; no £ figure or invented reason. |
| DW6 Supplier outside quote | **BUILT.** Pure held-state assertion and PostgreSQL case for no finding/disclosure/outbox change. Model/estimate alone does not surface it. PostgreSQL case NOT RUN. |
| DW7 Document instructions | **BUILT.** Core and AI injection tests pass. Text/source hash can change as data; detector output, rule result and gateway controls/request shape stay identical. A live-model injection evaluation remains a release item. |

## Q1–Q10 and remaining integrations

- Q1 ADOPTED: one appended worker task, one local queue-context helper, one queued constructor invocation; the unchanged context scanner **passes**. Added validated `SHADOW_DATABASE_URL`, separate runtime/shadow pools, and a shadow-login membership/posture check.
- Q2 ADOPTED: exactly one new routine `app.surface_shadow_signal_early`, one `must_surface_signal` kind and one append-only firing table. It calls SV-2's disclosure routine internally. No two-transaction Decision/disclosure substitute.
- Q3 HELD: no threshold constant. Rule 2 uses `basis: synthetic_fixture` only.
- Q4 HELD: title is the stored description, detail is empty, no estimate displayed. Existing generic inbox rule/action mapping remains outside this lane; semantic mapping/wording is not claimed.
- Q5 real-record half HELD: reads the SV-4-owned terms relation through a port; absence refuses startup. A tenant must have a visible accepted row before reading/detecting/writing. Actual SV-4 record version/shape/authorization and startup integration must be checked after its merge. No terms approval invented.
- Q6 diary/customer adapters HELD for SV-7A/MON-5; contract and fixtures built. Additional observed dispatch gaps: finalized source-object linkage/captions for existing supplier/order sources and imported baseline-to-scope/pre-adoption bindings. Their owner files are outside this lane. The reader refuses imports and post-lock jobs rather than manufacturing provenance. Post-lock orchestration is owed to SV-5 integration.
- Q7 live-model pass bar and approved-region run HELD; no metric threshold invented.
- Q8 BUILT: shadow pool reads no business table; runtime reader issues no shadow statement. Real-role tests authored; NOT RUN.
- Q9 timing is structural: statement sequence/count assertions, not wall-clock comparison. Full-path runtime evidence remains pending.
- Q10 migration 0129, after 0128. No demo bootstrap change; tests generate their own shadow logins.

## Migration and role catalogue

`0129_shadow_detection.sql` adds only `shadow_must_surface_firing`, `surface_shadow_signal_early(...)`, and the fourth permitted finding kind. No column added to a fingerprinted table, no other existing table/policy/grant/role/routine changed by this migration. Existing SV-2 routines and emergency path are untouched.

| Object | Ownership, RLS and effective privileges |
| --- | --- |
| Firing table | `jobguard_migration`; non-null tenant; tenant/job-qualified signal and source FKs; ENABLE/FORCE RLS; shadow SELECT only; no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER for shadow; no runtime/emergency/infrastructure privileges. Existing immutable statement trigger refuses owner UPDATE/DELETE/TRUNCATE too. |
| Surface routine | `jobguard_migration`; SECURITY DEFINER; pinned `pg_catalog,app`; non-owner EXECUTE grantees exactly `jobguard_shadow`. Tenant context verified, job then signal locked, structured predicates checked, evidence source bound. |
| Older Decision/finding/disclosure/audit keys | Existing tenant-qualified keys reused. The routine owns exact job/subject binding because those tables lack a job-qualified candidate key; no existing constraint is added there except the adopted finding-kind widening. |
| Audit | SV-2 disclosure audit plus a final `shadow.must_surface_fired` audit. Rule/version are identifier references; classification is `operational`, preserving audit.v1. No business lock follows disclosure/audit. Each firing is a separate transaction after durable detection persistence, avoiding later firings' locks after an audit lock. |

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

Upgrade case compares exact prior named columns using `row_to_json(t)::text`, full column names/`format_type`, captured primary-key identities, and nonempty-row guards. Rolled-back controls reject one microsecond and a prior-column retype; permit a nullable column, a replaced function and a later inserted row. NOT RUN. Forward fix: retain immutable facts, disable the detection task, and issue a corrective migration; do not delete/rewrite prior disclosures.

## Required catalogue edit — exact before/after

Before:
```ts
  const explicit:Record<string,string[]>={jobguard_shadow:["record_shadow_disclosure"],jobguard_shadow_emergency_access:["read_shadow_emergency","record_shadow_disclosure"]};
```
After:
```ts
  const explicit:Record<string,string[]>={jobguard_shadow:["record_shadow_disclosure","surface_shadow_signal_early"],jobguard_shadow_emergency_access:["read_shadow_emergency","record_shadow_disclosure"]};
```
A one-off whole-file comparison against HEAD confirmed this replacement is the **only byte difference** in SV-2's catalogue test. It is receipt evidence, not a permanent pinning test. Tenancy test changes are exactly two appended catalogue rows. UIWIRE-12 and demo-bootstrap tests are untouched.

## Commands and actual outcomes

Installed dependencies reused; no clean-install claim. Runtime `v24.17.0`. All substantive commands used the already-cached **pnpm 10.28.1** via a temporary PATH shim (the ordinary pnpm 11 launcher stalled on self-selection). The shim calls its installed cached JS directly, with no install/download. No whole repository test command was run.

| Command | Exit and observed result |
| --- | --- |
| `pnpm typecheck` | **2**. Initial readonly-array `.sort()` error in the new AI test. Fixed using a copy. Core/config/storage completed; later packages were not all reached. Once-only root command was not repeated. |
| `LANE_BASE_REF=origin/main pnpm lint` | **2**. Purity/lane/money/commercial checks passed. Core/AI/config/storage compiler checks passed; DB hit cross-version Zod generic expansion. Fixed by parsing array elements separately with the original strict core schemas. Root command not repeated. |
| `pnpm build` | **7/7 successful**, 2 cached, 38.282s in its complete Turbo log. **Session exit status was not retained by the tool wrapper**, so an exact process exit is not claimed. Build happened after those compiler repairs; later CLI/reader/test refinements have targeted compiler/evaluation checks rather than another root build. |
| `pnpm --filter @jobguard/core exec vitest run src/observation.test.ts src/shadow-detection.test.ts --maxWorkers=2` | Initial **1**, 14 failures/1 pass: synthetic citation end was 18 for a 19-character sentence. Corrected. Final **0**, **15 passed**, 2 files. |
| `pnpm eval -- src/shadow-proposal.test.ts src/shadow-evaluation.test.ts --maxWorkers=2` | **1**, 78 passed/1 failed in **5 files**: `--` prevented filters applying and exposed the CLI JSON compatibility regression. This accidentally exceeded the dispatch's three-file limit; it is not hidden as a compliant filtered run. No further broad test run was made. |
| `pnpm eval src/shadow-proposal.test.ts src/shadow-evaluation.test.ts --maxWorkers=2` | **0**. Initially 7 passed; final after adding explicit model-hold I case: **8 passed**, exactly 2 files. CLI remains one JSON document with additive shadow report/summary; existing capture fields remain. |
| `pnpm --filter @jobguard/api exec vitest run src/shadow-detection.worker.test.ts src/auth/context-boundary.test.ts --maxWorkers=2` | **0**, **149 passed**, 2 files: 4 worker cases and 145 unchanged scanner cases. The scanner is the expressly required unchanged boundary exception to the changed-file-only rule. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **0**, SV-3 exact-file lane passed against the available main merge base. |
| `pnpm openapi:check` | **1**, tsx CLI attempted an IPC socket and received `listen EPERM`; no OpenAPI comparison ran through that wrapper. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | **0**. Same generator/check, Node loader avoids the tsx CLI IPC server. OpenAPI file unchanged. |
| `pnpm --filter @jobguard/api exec tsc -p tsconfig.json --noEmit` | **0**, targeted final API compiler repair check, including application isolation harness. |
| `pnpm --filter @jobguard/ai exec tsc -p tsconfig.json --noEmit` | **0**, targeted AI compiler repair check. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --module nodenext --target es2023 --skipLibCheck --esModuleInterop --exactOptionalPropertyTypes test/shadow-detection.integration.test.ts test/shadow-isolation-query-log.integration.test.ts` | **0**, first and final targeted integration-file compiler checks. This is source/type checking, **not PostgreSQL execution**. Later explicit model-hold test import is fixture-only. |
| `pnpm --filter @jobguard/db exec tsc -p tsconfig.json --noEmit` | **0**, targeted DB compiler checks, including final reader guards/binding changes. |
| `pnpm --filter @jobguard/api exec node --import tsx ../../packages/ai/src/evaluation-cli.ts` | **0**. Current source CLI: capture PASS, shadow TP 3/FP 0/FN 0, recall and false-positive precision separately, live_model not_run. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | **0**, final source-only purity/lane/money/commercial checks after all refinements and receipt creation. |
| `git diff --check` | **0**, no whitespace errors at recorded check. |
| One-off preserved-file and credential-shape checks | **0**: exact catalogue replacement; 13 untouched-file comparisons; no credential-shaped literal in owned files. No standing file-freeze test added. |

Build prerequisites were consolidated into the single root build under the binding once-only memory rule, rather than running the two draft filtered builds as well. Tests ran serially, with two workers; the accidentally broad first eval invocation is the documented exception above. Root typecheck/lint and a clean final build still need the dispatcher's rerun; targeted repairs are not misreported as successful root invocations.

## NOT RUN

Each following item: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.

- `packages/db/test/shadow-detection.integration.test.ts`, including its 0129 upgrade/control proof.
- `packages/db/test/shadow-isolation-query-log.integration.test.ts`.
- `apps/api/src/shadow-isolation.application.test.ts` (starts real PostgreSQL, Nest and production Next).
- Updated `packages/db/test/shadow-catalog.integration.test.ts` and `tenancy.integration.test.ts`.
- `pnpm test:db`, `pnpm test:migrations`, retained UIWIRE-12/demo-bootstrap/database regressions.
- `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop SV-3.spec.ts` and retained browser regressions.

Live-model: **NOT RUN (separate release item)**. No model/provider network, spend, real data, deployment, production mode or policy approval.

## Invariants, overlaps and follow-ups

Touched: strict versioned boundaries; tenant/job/evidence binding; split role/pool authority; pure cited proposals; builder-favourable captures; immutable/coalesced provenance; mandatory early disclosure and permanent exclusions; audit atomicity/lock order; durable replay/conflict; simulation and terms gates. No fee, qualifying principal, posting, allocation, attribution, invoice, settlement or authorization is created. No fingerprinted row gains a column.

Shared owner at this dispatch: SV-3 working-tree changes; dispatcher/integrator serializes commits/rebases/merge. `migrate.ts`, DB/core barrels, `MIGRATIONS.md`, lane registry and tenancy catalog overlap SV-4/M4-8-S. One appended migration/registry/export line each, no reordering. AI barrel/CLI owned here. SV-2 catalogue receives only its approved name addition. No route, app module, OpenAPI, existing UI or BUILD_PLAN edit. No work in the other leaves.

Owed: complete DW3 successful mutation/export/notification/cache/badge/analytics/telemetry proof; run all real-DB/browser suites and upgrade controls; verify SV-4 terms record and startup gate; finish dependable source bindings/captions and imported baseline/timing adapter; SV-7A/MON-5 diary/customer adapters; SV-5 post-lock orchestration; SV-6 recovery/fee half of J; approved-region live-model evaluation and release threshold; Q4 wording/action mapping; operational deployment configuration for the separate shadow login/SHADOW_DATABASE_URL. D12, D13, G1/G2/G4-S remain unresolved release gates. Fresh Claude Opus verdict and separate Sol check bound to the dispatcher's exact commit, then separate acceptance, are still required.

## Self-review

Re-read the existing-file diff and new implementation/test files against the issued order, including the receipt's explicit holes. Checked scope against the lane; SV-1/SV-2 reuse; strict schema and citation binding; source identity across tenant/job; matching every source in a coalesced group; stable surviving identity; metadata conflict handling; permanent disclosure; PostgreSQL key/grant/RLS/immutable-trigger definitions; atomic Decision/disclosure and audit-head lock last; audit.v1 payload/hash shape; own-migration install-before/apply-alone/later-twice proof and all five rollback controls; no modified old assertion; single catalogue name change; no fingerprinted-table columns; direct builder request code unchanged; runtime reader/shadow writer statement boundaries; no live provider or label input to detectors; no unsolicited UI changes; fixture/live reporting; and truthful NOT RUN/HELD labels.

Fixed findings: citation off-by-one; readonly test array; Zod-version generic expansion; CLI JSON compatibility; proposal/evidence binding validation; capture matching across all coalesced sources; fixture decoder tenant/job binding; audit classification enum mismatch (rule/version moved to identifier references, verifier test added); removed false order-authority-hash/content-hash equivalence; refused imported/post-lock jobs until their orchestration/bindings exist. No old test was weakened.

Could not check: SQL execution, physical rollback/privileges/RLS/FKs/concurrency, fresh/upgrade migration success, PostgreSQL log format/statement sequence, HTTP comparison on real servers, final UI/browser assertions, live-model quality, terms record not yet merged, or the full missing DW3 matrix. Static/source inspection and targeted TypeScript compilation are distinct from test execution. The source reader's missing adapters and acceptance coverage gaps are BLOCKING for full SV-3 acceptance, not LATER polish. Existing generic inbox action/rule mapping is HELD with Q4 and has not been edited outside this lane.

### Working-tree diff stat

Tracked-file diff (new files are listed in the inventory above):

```text
 apps/api/src/worker.ts                             | 27 ++++++++++++++++++----
 config/agent-lane-assignments.json                 |  1 +
 packages/ai/src/evaluation-cli.ts                  |  4 +++-
 packages/ai/src/index.ts                           |  1 +
 packages/core/src/index.ts                         |  1 +
 packages/db/MIGRATIONS.md                          |  2 ++
 packages/db/src/index.ts                           |  1 +
 packages/db/src/migrate.ts                         |  1 +
 .../db/test/shadow-catalog.integration.test.ts     |  2 +-
 packages/db/test/tenancy.integration.test.ts       |  2 ++
 10 files changed, 36 insertions(+), 6 deletions(-)
```

### Preserved-file receipt evidence

- `apps/api/src/auth/context-boundary.test.ts`: `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d` (before = after).
- `packages/db/src/practice-session.ts`: `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` (before = after).
- `packages/db/src/contractor-repository.ts`: `56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c` (before = after).
- `packages/db/src/contractor-party-repository.ts`: `e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0` (before = after).
- `packages/db/src/work-order-repository.ts`: `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3` (before = after).
- `packages/db/src/sor-repository.ts`: `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5` (before = after).
- `packages/db/src/job-scheduling-repository.ts`: `ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d` (before = after).
- `packages/db/src/work-order-fixtures.ts`: `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386` (before = after).
- `packages/db/migrations/0128_shadow_persistence.sql`: `d8f7370560595a47f1395dad198abacda1e1351ade096697656c76805e957afe` (before = after).
- `packages/db/src/shadow-repository.ts`: `b61fd395d8aca86135f1f4b2d88d7cf6bd7d4bf95d5105df86f542b51bb6386d` (before = after).
- `BUILD_PLAN.md`: `b6021a708553264dfa448d47c48361f0917104cdbd4871a9f66e8650bc130656` (before = after).
- `package.json`: `22bfd8b87cd90ac045d05b79c8beaf70804e704ce6d5fc3fa569aeb60b9b7aea` (before = after).
- `pnpm-lock.yaml`: `06b501e413424d77fc5c3a1ac0f481b7230c271e36bfbde2cb953385ccccd349` (before = after).

Build outputs and test-results were removed before dispatch. Initial cleanup detected an existing workspace `.pnpm-store`; its ignored cache was then removed successfully. No tracked file was removed. No `.pnpm-store` left in the worktree. Intended conventional commit message is in `/private/tmp/jg-msg-sv-3.txt`.

**Builder receipt only — not independently verified, not accepted.**
