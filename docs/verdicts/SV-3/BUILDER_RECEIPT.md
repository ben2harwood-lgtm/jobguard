# SV-3 builder receipt

Builder: Codex GPT-6.1 Sol (dispatch-designated builder). Date: 12 October 2026.
Branch: `codex/sandbox/sv-3`.
Base: `262f939514383df28d6811e889650d0571a70145` (SV-2 refreshed head, supplied by the dispatcher and treated as merged).
No fetch, GitHub operation, add, commit, push, merge, package/dependency change, download or release was performed.

**Status: HOLD — only the issued external integrations (B) and ruling/release gates (C) remain. Nothing owed inside the SV-3 lane remains.** Continuation round 1 below supersedes the first round's HOLD reasons. This is builder evidence, not independent verification or technical acceptance. PostgreSQL and browser proofs are authored and NOT RUN.

Integrator-owned BUILD_PLAN §12.2 ledger sentence: the allocation first written here as 0129 (`0129_shadow_detection.sql`) was renumbered to **0133** on 12 October 2026; the new ledger paragraph is in BUILD_PLAN.md §12.2 ("Ledger amendment — SV-3, 12 October 2026 (catch-up renumber, merge-ahead ruling)"). The dated sections below (Continuation round 1, Mac verification (12 Oct), Follow-up (12 Oct), Repair round 2) were written before the renumber and still use the old name `0129_shadow_detection.sql` and the old SV-4 name `0130_final_account_lock.sql` (now `0132_final_account_lock.sql`); see "Mac verification (12 Oct, round 2)" at the end for the rename and the hashes.

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
- `packages/db/migrations/0133_shadow_detection.sql` (first written as `0129_shadow_detection.sql`; renumbered on 12 October 2026, see below)
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

`0133_shadow_detection.sql` (first written as `0129_shadow_detection.sql`) adds only `shadow_must_surface_firing`, `surface_shadow_signal_early(...)`, and the fourth permitted finding kind. No column added to a fingerprinted table, no other existing table/policy/grant/role/routine changed by this migration. Existing SV-2 routines and emergency path are untouched.

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

## Continuation round 1

Issued 12 October 2026. Continuation base: `87eb31ea85301af04bb0b38059fbe17f6773d278` (dispatcher merge of SV-4 `8d176a9`; SV-3 migration stays 0129). This section supersedes the earlier round's owed-status statements; its command history remains historical evidence.

Early receipt saved before final verification; completed with the evidence below. The exact SV-4 terms version is now checked by the runtime port and by the migration-owned early-alert routine before new commercial/disclosure effects. Dynamic relation resolution preserves install-before-0130 compatibility. Tests exercise the real worker composition's startup failure and successful registration/outbox dispatch, plus refused detection without tenant acceptance.

| Owed item | Classification and continuation result |
| --- | --- |
| SV-4 terms record, version, authorization, worker startup and shared outbox composition | A — BUILT; real-record reader port test, actual composition test, PostgreSQL direct-alert missing/hidden terms controls. No SV-4 file edited. |
| DW3 successful mutation/export/notification/cache/badge/analytics/telemetry paths | A — BUILT. Whole-request/UI/repository capability isolation; exhaustive current GET inventory and mutation error inventory; fixed successful command/effect script; browser cache/count/badge/notification/analytics/storage observations; negative control per observable channel. Execution of PostgreSQL/HTTP/browser proofs belongs to the helper/CI, not this sandbox. |
| Real DB, browser and upgrade proof execution | B — HELD for dispatcher Mac helper / GitHub CI. Every such suite is NOT RUN (sandbox cannot start PostgreSQL / a browser). Rule 9 own-step upgrade proof retained. |
| Finalized supplier/order source bindings and captions | B — HELD for supplier-document/purchase-order/evidence adapter owners (M2-2/M2-3/M2-1 source integration); files outside SV-3. |
| Imported baseline-to-scope and pre-adoption timing adapter | B — HELD for CH-5 import/adoption integration. Reader continues to refuse unsupported imports. |
| Diary/customer-request adapters | B — HELD for SV-7A / MON-5. Contract/fixtures remain built; no invented live adapter. |
| Post-lock orchestration | B — HELD for SV-5 / CH-4. No post-lock detector/reveal capability added. |
| Recovery/fee half of Test J | B — HELD for SV-6. One surviving signal remains this lane's assertion. |
| Q4 wording/action mapping | C — HELD for founder/integrator ruling as issued. Stored description and empty detail unchanged; UI parked. |
| Approved-region live-model evaluation and recall/precision pass bar | C — HELD for live-model release item / M0-12a. No threshold or approval invented. |
| Separate shadow login / SHADOW_DATABASE_URL deployment configuration | B — HELD for deployment/operations owner M0-13a; worker configuration/posture checks already built. |
| D12/D13/G1/G2/G4-S | C — HELD for their release/policy owners. No real-data or production capability enabled. |
| Exact-commit independent verdicts and acceptance | B — dispatcher obtains fresh Claude Opus review and separate Sol check, then a separate acceptance actor; builder cannot accept this work. |

**Continuation status: HOLD (B/C only). Nothing owed inside this lane remains.** All A work is implemented or authored as executable proofs. The external execution/release/owner holds are listed above. No commit made.

### Continuation implementation and proof boundaries

Q5 now consumes the actual SV-4 contract: `FINAL_CHECK_TERMS_VERSION`, matching tenant under runtime RLS, and the existing owner-authorized `accept_final_check_terms` command. No acceptance is inferred. The unit port test proves the exact parameter binding and refuses read/proposal/persist without it. The actual `worker.ts` module is imported with only external infrastructure/executor fakes: an absent relation prevents Graphile registration; its presence registers the existing outbox tasks and the detection task; existing outbox dispatch still receives verified queue scope; unaccepted detection refuses before evidence queries. This is a composition test, not a live Graphile integration.

The new 0129 routine reads SV-4's relation under its migration-owned, FORCE-RLS context before any new Decision/finding/firing/disclosure effects. A completed immutable replay retains its original result. The PostgreSQL test uses rolled-back missing-relation and restrictive-visibility controls, asserts no new Decision/finding/firing/disclosure or signal disclosure flag, verifies another tenant's acceptance is invisible, rejects direct runtime insertion of terms, and permits a real accepted-term firing. The original I/browser fixture now obtains terms through SV-4's real command. No SV-4 relation, routine, grant, policy or file is edited.

DW3 uses complementary proofs, with explicit scopes:

- The source policy covers all current request adapters, UI code (including caches and badges), and ordinary DB repositories. It denies imports/uses of executing shadow capabilities and shadow SQL tokens, including template fragments and identifiers; inert barrels remain allowed. It applies to every success/error branch, including routes not visited by the fixed script. It reads current source semantically; it pins no unowned file bytes, hashes or whole-file snapshots. A candidate filter avoids parsing files in which none of the forbidden names occurs; token assertions and the default five-second timeout remain intact.
- The retained HTTP inventory covers every current non-auth/non-health OpenAPI GET and every Next job GET. It now recognizes both function exports and `export const GET` (the parties route). The added matrix dynamically inventories non-auth/non-contractor Nest POSTs and builder Next POSTs for error/status/body/header/cache comparisons. Dynamic action routes get their invalid-action path; their successful branches are covered by the source policy and applicable command script.
- The fixed successful script uses exact cloned public history, actual runtime/shadow logins and 25 evidence-linked held signals for the tested job. It runs priced/unpriced/retried Log an extra, captured-extra approval, material rates/requirements, readiness plan/advance, relevance seed/budget/dismiss, finding evaluate/dismiss, terms, final-review addition, disposition, proof selection/finalization/completion, final-account lock/read, invoice issue/PDF, receipt/reversal, credit preview/issue and public projections. No success application response is mocked. Disposable DB clocks/UUID functions and Node time/UUID generation make the compared bytes deterministic; they are restored or the databases dropped. This is a fixed isolation script, not a claim that every feature's successful journey was executed here.
- Notification content comes from the actual authorized `ActionExecutor`, with a fake external adapter returning retryable then succeeded. Outbox/attempt rows, queue/retry telemetry, exported PDF bytes, public rows and audit facts are compared. The script itself logs the runtime statement sequence/count and forbids shadow statements. The separate eight-read query-log test now inserts all 25 signals with real evidence links.
- Browser Q observes actual API bodies, visible counts/badges/errors, cache headers and fetch/cache keys, notification construction, beacon/analytics events, and local/session storage on Jobs/Decisions and the saved job. Neither API success responses nor business state are browser-intercepted. Analytics has no separate current builder service; the test observes its actual browser/network hooks and public relevance inputs rather than inventing an analytics provider.
- Each of the 12 application trace channels and each of the nine browser channels has an injected signal-dependent negative control that must fail its comparator. Must-surface fixtures are excluded from Q.

These are source-inspected and, for the worker/source policy only, unit-test-executed. HTTP/PostgreSQL/browser byte comparisons remain **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. No wall-clock timing equality, live notification delivery, live model quality, production safety approval or independent verdict is claimed.

### Continuation commands and actual outcomes

All validation commands below ran from `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv-3` (root); `pnpm --filter … exec` runs its payload from the named package directory. Runtime: Node `v24.17.0`; pnpm `10.28.1` from its existing Corepack cache. A temporary PATH shim at `/private/tmp/jg-sv3-bin/pnpm` selects that exact installed JS; no download/install. Every pnpm command below used `PATH=/private/tmp/jg-sv3-bin:$PATH`. Counts are actual test/task counts, or “compiler only”; cached Turbo tasks are distinguished.

| Command | CWD for payload | Exit / result |
| --- | --- | --- |
| `pnpm --version` | root | 0; 10.28.1 |
| `pnpm --filter @jobguard/api exec vitest run src/shadow-detection.worker.test.ts --maxWorkers=2` | `apps/api` | Initial 0, 7/7 tests, one file. Final strengthened token scan initially 1: 6 passed, 1 default-timeout failure. Optimized candidate filtering without raising timeout or removing assertions; final 0, 7/7 tests, one file (6.13s total; tests 3.57s). Runs serial, never more than one test run active. |
| `pnpm --filter @jobguard/api exec tsc -p tsconfig.json --noEmit` | `apps/api` | Initial wrapper 1 (tsc 2): trace typing and telemetry callback typing. Fixed. Subsequent and final wrapper 0; compiler only. Final run includes the added Next mutation inventory. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --module nodenext --target es2023 --skipLibCheck --esModuleInterop --exactOptionalPropertyTypes test/shadow-detection.integration.test.ts test/shadow-isolation-query-log.integration.test.ts` | `packages/db` | Initial 0 and final 0; compiler only, exactly two integration source files; no PostgreSQL execution. |
| `pnpm --filter @jobguard/web exec tsc -p tsconfig.json --noEmit` | `apps/web` | First wrapper 1 (tsc 2): response-listener syntax. Second wrapper 1 (tsc 2): browser trace array type. Both repaired before root typecheck/build; those pass including the browser source. No browser execution. |
| `pnpm typecheck` | root | 0; 7/7 successful, 4 cached; 8.061s. |
| `LANE_BASE_REF=origin/main pnpm lint` | root | 1; core purity passed (135 files), then lane scanner refused the inherited SV-4 diff. It never reached the compiler lint phase. No own-lane violation was listed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | root | 1; lists 35 inherited SV-4 paths because SV-4 is absent from this local `origin/main`. Those files are preserved, not edited by this continuation. |
| `LANE_BASE_REF=HEAD node tools/lint.mjs` | root | 1; scanner correctly refuses a self-comparison range. No configuration/check weakening. |
| `LANE_BASE_REF=8d176a9 node tools/lint.mjs` | root | 0; source purity, complete SV-3 lane against the dispatcher-supplied SV-4 head, and money boundary pass. This does not relabel either main-based failure as a pass. |
| `pnpm turbo run lint` | root | 0; the otherwise-unreached compiler lint phase: 7/7 successful, 2 cached; 13.596s. |
| `pnpm build` | root | 0; 7/7 successful, 2 cached; 46.453s. Existing Next workspace-root/CSS and Turbo cache-write warnings; no error. Root typecheck/lint/build each invoked once. Final later source refinements affect tests only and received targeted compiler/unit checks. |
| `pnpm openapi:check` | root | 1; tsx CLI IPC `listen EPERM`, before comparison. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | `apps/api` | 0; identical generator/check without the prohibited tsx CLI IPC server. OpenAPI unchanged from continuation base. |
| `pnpm --filter @jobguard/ai exec node --import tsx src/evaluation-cli.ts` | `packages/ai` | 1; `tsx` is not a dependency resolvable from this package. No install attempted. |
| `pnpm --filter @jobguard/api exec node --import tsx ../../packages/ai/src/evaluation-cli.ts` | `apps/api` | 0; current source CLI through the installed API loader. Capture fixture PASS; 11 shadow classes/cases, TP 3 / FP 0 / FN 0, recall 1 and false-positive precision 1 separately; 0 invalid citations dropped / 0 network clients. Live model `not_run`. JSON saved to `/private/tmp/jg-sv3-eval-cont1.json`. |
| `git diff --check` | root | 0; no whitespace errors. |
| One-off preserved-file, assertion and credential-shape inspections | root | 0; nine continuation paths, no SV-4 intersection; 41 inherited SV-4-branch paths byte-identical to continuation base. All 84 prior complete assertions in the five changed test files remain verbatim (13 + 7 + 11 + 49 + 4). No credential-shaped literal in changed files. These are receipt inspections, not permanent file-pinning tests. |

Main-based lane lint remains the dispatcher/merge-state item: compare again after SV-4 is on main (or use the supplied SV-4 head for packet inspection). No allowlist widening, unowned edit, fetch or Git write was used to make it pass. The failed wrapper commands are preserved above alongside their successful applicable checks.

Only the changed runnable unit file was executed. No whole repository/package unit suite or unchanged core/AI test file was run. The evaluation CLI executed the unchanged committed fixture corpus; no prompt/model/detector/schema changed in this continuation.

### Continuation NOT RUN

Each following suite/item: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.

- `packages/db/test/shadow-detection.integration.test.ts`: retained J/P/I, grants/keys/RLS/audit/rollback, 0129 upgrade/control proof and new direct-alert terms gate.
- `packages/db/test/shadow-isolation-query-log.integration.test.ts`: actual PostgreSQL statement logs and evidence-linked signals.
- `apps/api/src/shadow-isolation.application.test.ts`: real Nest/Next HTTP inventory, successful command script, public effects/rows, query log and comparator controls.
- `apps/web/e2e/SV-3.spec.ts` on `mobile-360` and `desktop`: existing I and new browser Q.
- `pnpm test:db`, `pnpm test:migrations`, unchanged catalogue/tenancy/UIWIRE-12/demo-bootstrap regressions and prior browser suites: dispatcher Mac helper / full GitHub CI.

Live model: **NOT RUN (separate release item)**. No real data, provider/model call, spending, deployment, production mode or policy approval.

### Continuation preservation, catalogue and migration

The SV-2 catalogue receives no continuation edit. A one-off comparison against the supplied SV-2 base confirmed that its only task-wide byte change remains exactly this one line:

Before:
```ts
  const explicit:Record<string,string[]>={jobguard_shadow:["record_shadow_disclosure"],jobguard_shadow_emergency_access:["read_shadow_emergency","record_shadow_disclosure"]};
```
After:
```ts
  const explicit:Record<string,string[]>={jobguard_shadow:["record_shadow_disclosure","surface_shadow_signal_early"],jobguard_shadow_emergency_access:["read_shadow_emergency","record_shadow_disclosure"]};
```

`apps/api/src/auth/context-boundary.test.ts` remains byte-identical: SHA-256 `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d`. All SV-4 files and all its shared registrations remain byte-identical to the supplied continuation base. No registration, lane permission, fingerprinted-table column or package/lockfile changed in this continuation. Changes are the reader's version predicate, the owned 0129 routine's terms gate, owned tests, contract and receipt.

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

The existing 0129 proof still installs earlier migrations, snapshots nonempty pre-existing rows by named columns/full types and captured PKs, applies 0129 alone, compares, and applies all later migrations (now including 0130) successfully twice. Rolled-back one-microsecond/retype failures and nullable-column/replaced-function/later-insert passing controls remain unchanged. No schema backfill or new migration number. The routine's dynamic terms lookup is intentionally inactive at install. Forward fix remains: disable the worker and retain immutable facts; issue an additive correction, never rewrite disclosures.

### Continuation self-review

Re-read the full continuation diff and the task-wide SV-3 implementation against the issued order and applicable plan/contracts. Checked exact terms version, owner-command acceptance rather than manufactured approval, per-call stamped tenant contexts, actual module startup ordering, direct-alert refusal before inserts, FORCE RLS visibility, same transaction disclosure/Decision/audit, completed replay, unchanged lock order, runtime/shadow pool separation, stable capture/coalescing behavior, inference/injection boundaries, no new production/model policy, and no source adapter outside this lane.

For DW3 checked all request/UI/repository capability paths, GET/POST export syntax, route inventories, deterministic clone history, successful command identities/revisions, public rows/outbox/attempt/artifact bytes, actual executor authorization/retry telemetry, evidence links on all many-signal fixtures, browser storage/cache/count/badge/notification/beacon observations, and explicit poison controls per channel. Fixed the missed `export const GET` inventory, trace/listener typings, the source-vs-built-context module mismatch in test ports/executor, the reader fixture's missing commercial track, missing terms in the older I fixture, and source-scan runtime cost. No timeout increase, retry wrapper, skipped assertion, API success interception or DW3 business behavior stub.

Preservation checks establish unchanged prior complete assertions and unchanged SV-4/scanner/catalogue files as receipt evidence only; no standing test freezes them. Rechecked rule 9 upgrade controls, rule 11 credential shapes, rule 12 semantic rather than byte-pinning tests, exact lane, and unchanged shared registrations. No UI/product wording change.

Could not verify physical PostgreSQL grants/RLS/FKs/rollback/concurrency, SQL clock/identity controls, actual cloned command/HTTP output, Next process/query-log behavior, or either browser viewport. Their executable tests need the helper/CI; type/source checks are not those results. Could not run or approve live-model quality/residency, unowned adapters, post-lock orchestration, attribution/fee integration, professional/security/commercial policy, or independent acceptance. The main-based lane failure reflects inherited SV-4 merge state and is explicitly reported, not bypassed by editing policy.

Intended conventional commit message: `/private/tmp/jg-msg-sv-3.txt`. Dispatcher commits; no Git write, push or merge performed. Build/cache/test output cleanup is recorded below after final inspection.

**Builder receipt only — not independently verified, not accepted.**

Cleanup completed: removed generated `dist`, `.next`, `.turbo`, local Vitest caches and TypeScript build-info files; no `.pnpm-store`, build output or `test-results` remains in the worktree. Installed dependencies and all tracked files retained. Cleanup and final `git diff --check` exited 0.


## Mac verification (12 Oct)

Run by the JobGuard dispatcher's Mac helper (Claude Sonnet 5.5), 12 Oct 2026, in the worktree `W` = `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv-3`, branch `codex/sandbox/sv-3`. This is the first time any SV-3 database, API-with-database or browser test ran. It is a verification record by a helper, not a review and not an acceptance. `HS` = `~/.local/bin/heavy-slot <label>`; every vitest run used `--maxWorkers=2`, one run at a time, memory 66-71% free before each.

### Start and merges

Start HEAD `08d3299` (clean: `git status --short` printed nothing). `git fetch origin` (exit 0). `git merge origin/codex/sandbox/sv-4` (head `1965aea`, test-fixture fixes only) made merge commit `53d38ce` with NO conflicts (ort; 20 files, all append-only or SV-4-owned; `migrate.ts` order is 0127, 0128, 0129 SV-3, 0130 SV-4; both lane lines `sv-3` and `sv-4` present). `git merge origin/main` (`17c82ee`): "Already up to date". No migration renumbered. dist rebuilt first (each alone through HS, from W): `pnpm --filter @jobguard/core build`, `@jobguard/db`, `@jobguard/storage`, `@jobguard/config`, `@jobguard/ai` all exit 0. Later, because two tests need them: `pnpm --filter @jobguard/api build` (`nest build`) exit 0 and `pnpm --filter @jobguard/web build` (`next build`) exit 0, each alone. PostgreSQL started without needing `hydrate-symlinks.js`.

### Fixture fixes (test files only; no assertion deleted or weakened, no deadline changed, no product or merged/SV-4 file touched)

1. `packages/db/test/shadow-detection.integration.test.ts` (test "C4: firing catalog is migration-owned ..."), line 105. Failure: `expected [ { grantees: [ 'jobguard_shadow' ], ...} ] to deeply equal` received `grantees: "{jobguard_shadow}"`. Cause: the pg driver does not parse a `name[]` array. Before: `SELECT ARRAY(SELECT pg_get_userbyid(a.grantee) FROM aclexplode(...` After: `SELECT ARRAY(SELECT pg_get_userbyid(a.grantee)::text FROM aclexplode(...`. The expectation (`grantees:["jobguard_shadow"]`, proconfig) is unchanged.
2. `packages/db/test/shadow-isolation-query-log.integration.test.ts` (three set-up defects, found one after another):
   a. Practice session. Failure: `session fixture requires migration owner` (SQLSTATE 42501, from `app.seed_saved_v1_sample()` in migration 0109: the trigger on `control_plane.practice_session` refuses a direct insert by any role but the migration owner). Before: `await admin.query("INSERT INTO control_plane.practice_session(token_digest,expires_at) VALUES($1,'2099-10-01')",[digest]);` After: `await admin.query("SELECT app.issue_practice_session($1)",[digest]);` (the product's own SECURITY DEFINER routine, as SV-4's merged fixture does; it also creates three practice jobs and the saved v1 sample for that session, and the session expiry is the routine's default 7 days; no guard is switched off). SEE THE PERMISSION REFUSAL BELOW: my first attempt at this fix was refused.
   b. Failure: `new row for relation "evidence_object" violates check constraint "evidence_object_kind_ck"` (an original evidence object needs `upload_id`, so its `evidence_upload` parent row). Added one `INSERT INTO app.evidence_upload(...)` (same shape as the merged application test's) before the unchanged `evidence_object` insert, which now also names `upload_id`.
   c. Failure: `inconsistent types deduced for parameter $1` (text versus uuid) in my own new upload insert: `$1` and `$1::text` in one statement. Used a fourth parameter for `object_key`.
3. `apps/api/src/shadow-isolation.application.test.ts`:
   a. Same practice-session defect as 2a, same fix (`SELECT app.issue_practice_session($1)`); the `fixed` created_at is no longer applied to the session row only (the zero and many databases are clones of one template, so they still share it).
   b. Same `$1`/`$1::text` (evidence_upload) and `$3`/`$3::text` (evidence_object) parameter conflicts in the 25-row set-up: separate parameters for `object_key`.
   c. DEPENDENCY INJECTION. The test imported `AppModule` from `./app.module.js` (source). Nest's constructor injection here relies on tsc's `emitDecoratorMetadata`, which vitest's transform does not emit, so every controller's `pool` was `undefined` and every Nest route threw `TypeError: Cannot read properties of undefined` (500) in BOTH replays: the Nest half of the "byte-identical" comparison was vacuous. Before: `import { AppModule } from "./app.module.js";` After: `const {AppModule}=await import(new URL("../dist/app.module.js",import.meta.url).href);` (the compiled application, built with `pnpm --filter @jobguard/api build`). With the real application the Nest routes return their real answers (403/404/200 etc.).
   d. Statement log capture. `onLog` delivers raw stderr chunks cut anywhere and the log prefix contains the database name (`%d`), so the zero and many statement lists differed by chunking and by the prefix, not by content. Added a small helper `runtimeStatements(logStart, database)` that rebuilds log entries from the joined text (an entry starts at a `LOG:` line; `DETAIL` parameter lines and continuation lines stay with it) and makes the database name in the prefix neutral. Statement text AND bound parameters are still compared; used in both places that built the list.
   e. Mutation scenario set-up: `UPDATE app.job SET ... baseline_quote_version_id=$2` violated `job_baseline_shape`; now also sets `accepted_net_value_pence=100000,fee_policy_version='reference_fee_policy_v3'` (the constraint's required companions; 100000 is the fixture's net). The signal evidence object needed its `evidence_upload` parent and `upload_id` (same as 2b). Proof completion failed with `PROOF_INVALID` because the lock fixture's scope item has no `app.scope_progress` row (review confirmation creates it): added `INSERT INTO app.scope_progress(...) ... ON CONFLICT DO NOTHING` inside the existing fixture transaction.
   f. JUDGEMENT CALL (veto it if you disagree): the all-public-tables dump compared `app.watchdog_command_identity.claimed_xact`, which stores the cluster-wide PostgreSQL transaction number; the zero replay ran first (902-917) and the many replay later (941-956), a constant offset caused by order, not by signals. That one column is now left out of that one table's dump (`(to_jsonb(t)-'claimed_xact')::text`); every other byte of every row of every table is still compared and this was the ONLY differing table of 188.
4. `apps/web/e2e/SV-3.spec.ts`:
   a. Same four `$1`/`$1::text` and `$3`/`$3::text` parameter conflicts in the two evidence set-ups (two uploads, two objects), same fix.
   b. Both tests started with `openQuote(page); startWatchdogJob(page)`: the merged `startWatchdogJob` then waited for "Preview immutable quote" to enable, which it never did (unit rates not entered; four failures at `helpers/capture-journey.ts:55`). Now `openLiveWatchdogJob(page)` (the merged helper CH-2 uses: scope with five lines, then quote, then live). Import changed accordingly.
   c. JUDGEMENT CALL (veto it if you disagree): in test Q a fresh load of `/jobs/<id>` shows the scope summary with a "Price the work" button, not the quote editor, so `await expect(page.locator('.quote-editor')).toBeVisible()` never held. The assertion is unchanged; a click on "Price the work" (as `startWatchdogJob` does) now comes first.

### Permission refusal (reported as ordered)

While doing fix 2a I first tried to edit `packages/db/test/shadow-isolation-query-log.integration.test.ts` replacing the direct `practice_session` insert with a `BEGIN; SET LOCAL session_replication_role='replica'; INSERT ...; COMMIT` block (the trigger switched off for that transaction). The Mac's permission check refused that Edit: "Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Security Test Removal]." I did NOT repeat or route round that edit. I made a different change instead, which switches no guard off: the product's own `app.issue_practice_session` routine (2a/3a). The dispatcher should confirm that this substitute is acceptable. No other command or edit was refused.

### Product defects / wrong expectations found (NOT fixed, per the order)

P1. Wall-clock `retrievedAt` in the prevention-checks GET. `packages/db/src/prevention-check-repository.ts:45` sets `retrievedAt` from `SELECT clock_timestamp()`; both `GET /jobs/{id}/prevention-checks` (Nest) and `GET /api/jobs/{id}/prevention-checks` (Next) return it, and the page shows "Retrieved: <time>". Two replays can never be byte-identical, so SV-3's "byte-identical" expectation is wrong for this field (the mutation test already freezes the clock in its disposable databases; the GET replays do not). It fails:
   - `apps/api/src/shadow-isolation.application.test.ts` > "replays every OpenAPI builder GET and Next job GET with byte-identical status, headers and body": `AssertionError: expected { output: [ { …(4) }, …(72) ], …(1) } to deeply equal { output: [ { …(4) }, …(72) ], …(1) }`. Of 73 responses exactly TWO differ (the two routes above), only in body `retrievedAt` (e.g. `2026-10-12T17:35:11.604Z` versus `...10.392Z`) and the `etag` derived from it. All statement lists (text and parameters) are equal.
   - `apps/web/e2e/SV-3.spec.ts` test Q, both projects: `Error: responseShape`: the visible text differs only in `Source: Builder's saved paying-party record · Retrieved: <time>`, and one response body differs only in `retrievedAt` (decoded). `cacheHeaders` (etag) is the same cause.
   Diagnostic only (changed temporarily, run, then reverted byte for byte; not committed): with the `responseShape` and `cacheHeaders` channels skipped, all four browser tests passed (18.6 s), so no other browser surface channel differs with 25 held signals. The earlier "Test timeout of 30000ms exceeded" line in the failing runs is teardown after the failed assertion, not slowness. The fix choice (freeze the clock in the zero/many databases as the mutation test does, or mask that one field) belongs to the builder/dispatcher.
No other product defect was found. Nothing in migration 0129, the repository, the routine or core logic failed any database test.

### One-name diff on SV-2's catalogue test (verbatim, `git diff origin/main..HEAD -- packages/db/test/shadow-catalog.integration.test.ts`; numstat `1 1`)

```diff
@@ -74,7 +74,7 @@ describe("SV-2 catalog and actual role isolation (DW1, DW2, DW3, DW4)",()=>{
-  const explicit:Record<string,string[]>={jobguard_shadow:["record_shadow_disclosure"],jobguard_shadow_emergency_access:["read_shadow_emergency","record_shadow_disclosure"]};
+  const explicit:Record<string,string[]>={jobguard_shadow:["record_shadow_disclosure","surface_shadow_signal_early"],jobguard_shadow_emergency_access:["read_shadow_emergency","record_shadow_disclosure"]};
```

### Commands as run (working directory `W` unless a path is given; pnpm 10.28.1)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `HS pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --reporter=verbose test/shadow-detection.integration.test.ts` (first) | 1 | 13 passed, 1 failed (fix 1) |
| 2 | same, after fix 1 | 0 | 1 file, 14 passed |
| 3 | `... test/shadow-isolation-query-log.integration.test.ts` (first) | 1 | suite failed in beforeAll (2a), 1 skipped |
| 4 | same, after 2a | 1 | `Cannot find module .../apps/api/dist/workspace/application.js` (dist not built yet) |
| 5 | same, after `pnpm --filter @jobguard/api build` | 1 | `evidence_object_kind_ck` (2b) |
| 6 | same, after 2b | 1 | `inconsistent types deduced for parameter $1` (2c) |
| 7 | same, after 2c | 0 | 1 file, 1 passed |
| 8 | `... test/shadow-catalog.integration.test.ts test/tenancy.integration.test.ts test/small-builder-origin.integration.test.ts` | 0 | 3 files, 25 passed |
| 9 | `... test/final-account-lock.integration.test.ts` | 0 | 14 passed |
| 10 | `... test/final-account-lock-invoice.integration.test.ts` | 0 | 10 passed |
| 11 | `... test/final-account-lock-reveal.integration.test.ts` | 0 | 2 passed |
| 12 | `... test/final-account-lock-upgrade.integration.test.ts` | 0 | 1 passed |
| 13 | `... test/shared-money-origin.integration.test.ts test/recovery-timing-pin.integration.test.ts test/extra-origin-upgrade.integration.test.ts` | 0 | 3 files, 40 passed |
| 14 | `HS pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 --reporter=verbose src/observation.test.ts src/shadow-detection.test.ts` | 0 | 2 files, 15 passed |
| 15 | `HS pnpm --filter @jobguard/ai exec vitest run ... src/shadow-proposal.test.ts src/shadow-evaluation.test.ts` | 0 | 2 files, 8 passed |
| 16 | `HS pnpm --filter @jobguard/api exec vitest run ... src/shadow-detection.worker.test.ts src/auth/context-boundary.test.ts` (scanner run, not edited) | 0 | 2 files, 152 passed (7 worker + 145 scanner) |
| 17 | `HS pnpm --filter @jobguard/core exec vitest run ... src/final-account-lock.test.ts src/shadow-domain/lock.test.ts` (SV-4, combined branch) | 0 | 2 files, 9 passed |
| 18 | `HS pnpm --filter @jobguard/api exec vitest run ... src/final-account-lock.application.test.ts src/final-account-lock.controller.test.ts src/final-account-lock.isolation.test.ts` (SV-4, combined branch) | 0 | 3 files, 22 passed |
| 19 | `HS pnpm --filter @jobguard/api exec vitest run ... src/shadow-isolation.application.test.ts` (first; needs `apps/web/.next`, built alone before) | 1 | suite failed in beforeAll (3a), 15 skipped |
| 20 | same, after 3a and 3b | 1 | 13 passed, 2 failed (HTTP replay unequal: Nest routes all 500 because of 3c, `retrievedAt`, log chunking; mutation: `job_baseline_shape`) |
| 20b | same, after 3c, a first version of 3d and the 3e `job_baseline_shape` fix | 1 | 13 passed, 2 failed (HTTP replay unequal: `retrievedAt` and log chunking; mutation: `evidence_object_kind_ck`) |
| 21 | same, after the final 3d helper and the 3e evidence parent | 1 | 13 passed, 2 failed (HTTP replay: `retrievedAt` only; mutation: `PROOF_INVALID`) |
| 22 | same, `-t "successful mutations"`, after scope_progress | 1 | 1 failed: `publicRows` differs, only `watchdog_command_identity.claimed_xact` |
| 23 | same, whole file, after 3f (final) | 1 | 1 file, 14 passed, 1 failed (P1: HTTP replay, `retrievedAt`) |
| 24 | `HS pnpm typecheck` (twice; second after the last test edits) | 0 | 7 of 7 tasks |
| 25 | `LANE_BASE_REF=origin/main HS pnpm lint` | 1 | core purity passed (135 TypeScript files), then `Lane boundary FAILED: Lane sv-3 cannot edit:` followed by SV-4's files only (EXPECTED for a branch carrying two lanes): `apps/api/openapi.json`, `app.module.ts`, `final-account-lock.*` (application, contracts, controller, tests), `workspace/application.ts`, `workspace/index.ts`, the three `apps/web/app/api/jobs/[id]/final-account/*/route.ts`, `apps/web/app/ui/customer-invoices.tsx`, `final-account-lock.tsx`, `job-final-account.tsx`, `apps/web/e2e/SV-4.spec.ts` and its helper, `docs/contracts/final-account-lock-v1.md`, `docs/verdicts/SV-4/*`, `packages/core/src/final-account-lock*.ts`, `shadow-domain/lock*.ts`, `watchdog.ts`, `packages/db/migrations/0130_final_account_lock.sql`, `final-account-lock-repository.ts`, `variation-repository.ts` and the four `final-account-lock*.integration.test.ts` files |
| 26 | `node tools/core-purity-lint.mjs`; `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` (each with `LANE_BASE_REF=origin/main`) | 0 each | passed |
| 27 | `LANE_BASE_REF=origin/main HS pnpm turbo run lint` | 0 | 7 of 7 tasks |
| 28 | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | same SV-4-only list as row 25 (expected) |
| 29 | `HS pnpm openapi:check` | 0 | passed |
| 30 | `cd apps/web; CI=1 PLAYWRIGHT_SKIP_BROWSER_GC=1 HS pnpm exec playwright test --config ~/.local/share/full-steam/jg-runs/pw-local-channel-sv-3.config.ts --workers=1 --project=mobile-360 --project=desktop e2e/SV-3.spec.ts` (first) | 1 | 4 failed (4b: Preview immutable quote never enabled) |
| 31 | same, after 4a and 4b | 1 | 2 passed (I, both projects), 2 failed (Q: `.quote-editor` not visible, 4c) |
| 32 | same, after 4c (final) | 1 | 2 passed, 2 failed (Q both projects: P1 `responseShape`) |
| 33 | same, two temporary diagnostics (reverted, not committed) | 1, then 0 | the second, with `responseShape` and `cacheHeaders` skipped: 4 passed |

The wrapper `~/.local/share/full-steam/jg-runs/pw-local-channel-sv-3.config.ts` is out of repo: a copy of the SV-4 wrapper pointing at this worktree (`channel: "chromium"`). `CI=1` makes the repo config use `next start` on the production build.

### Done-when lines now backed by an executed run

DW3 database half (query-log, row 7): PASS. DW4 J/P, DW5 I (database half), DW6, atomic rollback, C4 catalogue, C5 boundary, reader, audit contract, 0129 own-step upgrade proof with its rolled-back controls and the terms-gated early alert (row 2): PASS. DW5 browser half, test I, both projects (row 32): PASS. Catalogue, tenancy, small-builder-origin (SV-2), shared-money-origin (SH-1), extra-origin-upgrade (ENT-4b), recovery-timing-pin and the four SV-4 database files (rows 8-13): PASS. DW3 application proof of Test Q: mutation, export, notification, telemetry, cache, count, badge and error channels PASS (row 23); the GET replay and the browser Q test are RED only for P1.

### NOT RUN

`pnpm test:db` and `pnpm test:migrations` as aggregates (the files named above were run singly; `test/demo-bootstrap.integration.test.ts` and `test/UIWIRE-12.integration.test.ts` were NOT run); the whole API vitest suite; the full-repository `pnpm build` (packages, api and web were built singly); `apps/web/e2e/SV-4.spec.ts` and every retained browser regression; live-model run (separate release item); anything that needs a real provider, real data or a deployment.

Mac verification record only — not an independent review, not acceptance.


## Follow-up (12 Oct): replay-comparison ruling and SV-4 catch-up

Run by the JobGuard dispatcher's Mac helper (Claude Sonnet 5.5), 12 Oct 2026, same worktree `W` and branch. Verification by a helper, not a review and not an acceptance. `HS` = `~/.local/bin/heavy-slot <label>`; every vitest run used `--maxWorkers=2`, one run at a time, at most three files per run, memory 70-71% free before each. The logs of every run are in the helper's scratchpad, not in the repository.

### The coordinator's ruling (quoted, binding)

"in the REPLAY COMPARISON only, exclude exactly those two named fields (`retrievedAt` and the etag derived from it) on exactly those two endpoints, each with its own POSITIVE assertion: (a) `retrievedAt` is a well-formed time inside that replay's own window (taken from the test's own before/after clock readings of that replay), and (b) the etag changes with it and with nothing else that is compared (show it equals the etag recomputed from the same other fields with the new `retrievedAt`, or changes when only `retrievedAt` changes: use whichever the code supports); every OTHER byte is still compared exactly; write it in the receipt as a NAMED LIMIT."

### Start, merges (no conflicts, nothing renumbered)

Start HEAD `5c3f920`, clean. `git fetch origin` (exit 0). `git merge codex/sandbox/sv-4 -m "Merge SV-4 (d620264) into codex/sandbox/sv-3"` (local branch; SV-4's `d620264` on top of `1965aea`, plus SV-4's own merge of main `860d34b`) made `327e267` with no conflict; its only content change against SV-3 is the one line of `packages/db/test/shadow-persistence.integration.test.ts` (1 insertion, 1 deletion). `git merge origin/main` (`18743cb`) made `b073873` with no conflict (ort). Both merges together change 32 files against `5c3f920`, 16 of them outside `docs/`: `.github/workflows/ci.yml`, `.gitleaksignore`, `DEPLOY.md`, `config/agent-lane-assignments.json` (+5 lines, the `sv-3` and `sv-4` entries both still present), `package.json`, `packages/db/src/audit*.ts`, `audit-checkpoint-handoff*`, three existing db integration tests, `upgrade-proof-utils.ts`, and the one SV-4 test line. Migrations: `0129_shadow_detection.sql` (SV-3) and `0130_final_account_lock.sql` (SV-4) are both present once each in `packages/db/migrations`, in `packages/db/src/migrate.ts` (one URL line each, after 0128) and in `packages/db/MIGRATIONS.md` (one line each). Not renumbered (ENT-10d holds 0129 in PR #146 and #138 holds 0130; the dispatcher renumbers at landing). No push of SV-4's branch from here. Rebuilt first, each alone through HS from `W`: `pnpm --filter @jobguard/db build` (main changed `audit.ts`), `@jobguard/api build`, `@jobguard/web build`: exit 0 each. Core, storage, config and ai dist were left as built (unchanged sources).

### What changed (one file)

`apps/api/src/shadow-isolation.application.test.ts`, SV-3's own replay-comparison test ("replays every OpenAPI builder GET and Next job GET ..."). No product code, no other test, no deadline or timeout touched; no assertion removed other than the two-field exclusion below. The test title gained a suffix (the original title is still a substring of the new one, so `-t` filters keep matching).

1. In `replay()` each request on the two prevention-checks GETs (Nest `/jobs/<id>/prevention-checks`, Next `/api/jobs/<id>/prevention-checks`) is bracketed by the test's own `Date.now()` readings (`before`, `after`). For exactly those two routes the compared record carries the body with the one exact string `"retrievedAt":"<that response's value>"` swapped for a fixed placeholder, and (Nest route only, see below) the `etag` header swapped for a fixed placeholder. Status, every other header and every other body byte of those responses go into the same exact `toEqual` as the other 71 responses, as do the statement lists.
2. After both replays, `expect(many.compared).toEqual(zero.compared)` is unchanged in kind, followed by the two positive assertions per route:
   (a) `checkRetrievedAt`: HTTP 200; `retrievedAt` is a string matching `YYYY-MM-DDTHH:mm:ss.mmmZ`, round-trips through `Date`/`toISOString()` unchanged, and lies between that request's own `before` and `after` readings (inclusive); `payingParty.retrievedAt`, when `payingParty` is not null, equals it; the exact `"retrievedAt":"<value>"` pair occurs exactly once (no `payingParty`) or twice (with `payingParty`) in the body.
   (b) Nest route: the etag is present in both replays and equals Express's own etag function (`app.getHttpAdapter().getInstance().get("etag fn")` from the running application) applied to the OTHER replay's body with only `retrievedAt` swapped for this replay's value, in both directions; and when the two `retrievedAt` values differ the two etags differ. So the etag changes with `retrievedAt` and with nothing else that is compared (the rest of the body is proved byte-equal by the `toEqual`).
3. FACT THAT DIFFERS FROM THE RULING'S ASSUMPTION: only the Nest endpoint has an etag. Express 5 adds a weak etag to the Nest JSON; the Next 15.5.27 route handler sends none (the API replay found no `etag` header on it in either database; in the browser run the spec keeps only `cache-control`, `etag` and `vary`, and it captured only `cache-control` and `vary` for that response). My first version asserted an etag on both and failed on exactly that (`.../api/jobs/<id>/prevention-checks many etag present: expected undefined to deeply equal Any<String>`), so on the Next endpoint the test does not mask any header and asserts that NO etag exists in either replay (if Next ever starts sending one, headers are compared exactly and the test fails loudly). The etag exclusion therefore exists on one endpoint only.
4. `retrievedAt` appears twice in the body (top level and `payingParty.retrievedAt`, one variable); both are the one named field and are counted exactly in (a). The separate `retrievedAt` fields inside each prevention result (`PreventionResultV1`, fixture-derived from `scenarioNow`) are not masked: the swap matches only the exact value of this response's own `retrievedAt`.

### NAMED LIMIT

In the replay comparison of `apps/api/src/shadow-isolation.application.test.ts` only, and only on `GET /jobs/{id}/prevention-checks` (Nest) and `GET /api/jobs/{id}/prevention-checks` (Next): the body field `retrievedAt` (both places it is written) and the Nest `etag` header are NOT compared for byte equality between the zero-signal and 25-held-signal replays. They are covered instead by a positive window assertion and an etag-recomputation assertion (above). Every other byte of those two responses and of the other 71 responses, and every statement text and parameter, remains compared exactly. Negative controls, each run as an uncommitted scratch edit restored byte for byte (file sha256 starting `a6a4fe8238541f25` before and after): shifting `before` an hour forward fails with `... retrievedAt is not before the request: expected 1791829369844 to be greater than or equal to 1791832969832`; using the unswapped body for the etag recomputation fails with `... many etag = etag(zero body with the many retrievedAt)` (two different weak etags of the same length, `W/"4f7-..."`); appending one space to the many replay's masked Nest body fails the exact `toEqual` (`expected { output: [ { …(4) }, …(72) ], …(1) } to deeply equal { output: [ { …(4) }, …(72) ], …(1) }`).

### Provenance of the two fields (read from the code) and whether a hidden signal can reach them

`retrievedAt`: `packages/db/src/prevention-check-repository.ts:45` in `viewIn`, `SELECT clock_timestamp() retrieved_at` (no parameter, no table; the database wall clock), `.rows[0].retrieved_at.toISOString()`, run inside the tenant transaction after `authorize` and before any data read. It is written once into `preventionViewV1.parse({... retrievedAt ...})` at line 62 and a second time into `payingParty.retrievedAt` at line 63 (same variable; `recordedAt` beside it is the party binding's stored `created_at`, a different compared field). The same value is rendered as "Retrieved: <time>" by `apps/web/app/ui/prevention-checks.tsx`. `etag` (Nest only): Express's own weak etag of the serialized JSON body (a hash and length of the body bytes), added by Express after the controller returns; it depends on nothing but the body bytes.
Can anything derived from a hidden shadow signal reach either field? Reading the code: no. The only inputs to the clock value are the system clock; the view's reads are `app.membership`, `app.job`/`app.audit_event` (event type `job.imported_baseline_attested` only, via `practiceOwnedJobsSql`), `app.job_party_current/binding/snapshot`, `app.customer_revision`, `app.property_constraint_fact`, `app.counterparty_check`; `grep -i shadow` over the repository, `practice-session.ts`, `tenant-context.ts`, the fixtures, the Nest controller/application, `practice-access.ts` and the Next route finds nothing; and this test itself asserts for each replay that the runtime role's statement log contains no shadow table or function name. The etag can differ only through the body, and the test proves the body is byte-identical except for `retrievedAt`. The one residual channel is timing (the clock reading is taken after the authorization queries, so its value shifts with elapsed time, not with content); the window assertion bounds it to the request. Reviewers to confirm.

### Findings that are NOT fixed (outside this order)

F1. Browser test Q (`apps/web/e2e/SV-3.spec.ts`, "Q: every visible count/badge/error ...") is STILL RED on both projects, for the same cause; I did not edit it because the ruling's words and the order name the API replay test only ("touch nothing else"). Exact failure on both: `Error: responseShape`; the only differences between the zero and 25-signal runs are the visible text `Source: Builder's saved paying-party record · Retrieved: <time>` (2026-10-12T18:10:33.545Z against 2026-10-12T18:10:35.697Z) and the same time inside the base64 of the `/api/jobs/<id>/prevention-checks` response body (top level and `payingParty`). CORRECTION to the first Mac record (P1): the browser run shows no `etag` on that Next response (only `cache-control` and `vary` captured), so `cacheHeaders` was not affected by this cause. Scratch experiment (uncommitted, restored with `git checkout --`, `SV-3.spec.ts` unchanged): masking only the body `retrievedAt` of that one response and the visible `Retrieved: <time>` text made `Q` pass on both projects (2 passed). Extending the ruling to Q needs one more named surface (the visible page text of the same field); the coordinator should rule on that.
F2. `packages/db/test/shadow-persistence.integration.test.ts` (SV-2's test) FAILS on this branch in "qualifies every shadow link by tenant/job, and classifications by run/signal": `expected 'FOREIGN KEY (tenant_id, decision_id) …' to contain 'job_id'` (`Received: "FOREIGN KEY (tenant_id, decision_id) REFERENCES app.decision(tenant_id, id)"`). Cause: migration 0129 (SV-3) adds `app.shadow_must_surface_firing` with `FOREIGN KEY(tenant_id,decision_id) REFERENCES app.decision(tenant_id,id)` (line 20), and SV-2's catalog assertion (line 149 of that test) requires every foreign key on a `shadow_%` table to contain `job_id` unless it references `audit_event`; `app.decision` has no `job_id` column. It is independent of the merges (that assertion and 0129 are unchanged by them; the first Mac record never ran this file). It is a cross-lane contradiction for the coordinator; I changed neither side.
F3. The coordinator's changed line (SV-2 test line 52, the lock-ROW count for J and K) passes: "returns nothing before a lock even with own revealed rows present (DW3 split)" is green (7 of the file's 8 tests pass; the 8th is F2). RED EXPERIMENT (uncommitted scratch edit, restored by `git checkout -- packages/db/test/shadow-persistence.integration.test.ts`, then `git status` showed only my intended file): inserting first, in a tenant transaction, a quote_version, final_account_draft, final_account_revision, a processing command_receipt, one audit event (through `appendAuditBatch`) and a real `app.final_account_lock` row for J made that test fail at the assertion: `AssertionError: expected 1 to be +0 // Object.is equality` (`test/shadow-persistence.integration.test.ts:63` in the edited copy). Two later tests of the file then also failed because the inserted lock row persisted into their state (Test R: `before_lock` false instead of true; the ADMIN-only membership test: `expected false to be true`); that is knock-on, and F2 failed as before. No `session_replication_role` was used in any of my edits. (Not mine, noted for the reviewers: the builder's existing mutation-scenario fixture in this same replay-comparison test already contains `SET LOCAL session_replication_role='replica'` for the job ownership binding; it ran unchanged and was not touched.)
F4. `pnpm openapi:check` printed nothing and exited 2 on its very first run in this session; two reruns (one with output to the screen, one redirected to a file) exited 0 with the normal output. Cause not established; not reproduced.

### Commands as run (working directory `W`, pnpm 10.28.1; counts are tests unless stated)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `HS pnpm --filter @jobguard/db build`; `... @jobguard/api build`; `... @jobguard/web build` (each alone) | 0, 0, 0 | built |
| 2 | `HS pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --reporter=verbose src/shadow-isolation.application.test.ts` (first version, etag asserted on both endpoints) | 1 | 14 passed, 1 failed (Next endpoint has no etag, item 3 above) |
| 3 | same file, final version | 0 | 15 passed (1 file) |
| 4 | same file with `-t "replays every OpenAPI"`, three scratch negative controls (see NAMED LIMIT) | 1, 1, 1 | each failed with the stated message; file restored (sha256 equal) |
| 5 | `HS pnpm --filter @jobguard/db exec vitest run ... test/shadow-detection.integration.test.ts` | 0 | 14 passed |
| 6 | `... test/shadow-isolation-query-log.integration.test.ts` | 0 | 1 passed |
| 7 | `... test/shadow-catalog.integration.test.ts test/tenancy.integration.test.ts test/small-builder-origin.integration.test.ts` | 0 | 3 files, 25 passed |
| 8 | `... test/shadow-persistence.integration.test.ts` (alone) | 1 | 7 passed, 1 failed (F2) |
| 9 | same file, scratch red experiment (F3) | 1 | 4 failed (F3 test at the new assertion, two knock-on, F2), 4 passed; file restored |
| 10 | `... test/final-account-lock.integration.test.ts`; `...-invoice...`; `...-reveal...`; `...-upgrade...` (one run each, SV-4) | 0, 0, 0, 0 | 14, 10, 2, 1 passed |
| 11 | `HS pnpm --filter @jobguard/core exec vitest run ... src/observation.test.ts src/shadow-detection.test.ts` | 0 | 2 files, 15 passed |
| 12 | `HS pnpm --filter @jobguard/ai exec vitest run ... src/shadow-proposal.test.ts src/shadow-evaluation.test.ts` | 0 | 2 files, 8 passed |
| 13 | `HS pnpm --filter @jobguard/api exec vitest run ... src/shadow-detection.worker.test.ts src/auth/context-boundary.test.ts` (scanner, not edited) | 0 | 2 files, 152 passed |
| 14 | `HS pnpm --filter @jobguard/core exec vitest run ... src/final-account-lock.test.ts src/shadow-domain/lock.test.ts` (SV-4) | 0 | 2 files, 9 passed |
| 15 | `HS pnpm --filter @jobguard/api exec vitest run ... src/final-account-lock.application.test.ts src/final-account-lock.controller.test.ts src/final-account-lock.isolation.test.ts` (SV-4) | 0 | 3 files, 22 passed |
| 16 | `HS pnpm --filter @jobguard/db exec vitest run ... test/prevention-checks.integration.test.ts test/job-activation-terms.integration.test.ts test/audit-checkpoint-handoff.integration.test.ts` (changed on main) | 0 | 3 files, 44 passed |
| 17 | `HS pnpm --filter @jobguard/db exec vitest run ... test/shared-money-origin.integration.test.ts test/recovery-timing-pin.integration.test.ts test/extra-origin-upgrade.integration.test.ts` | 0 | 3 files, 40 passed |
| 18 | `cd apps/web; CI=1 PLAYWRIGHT_SKIP_BROWSER_GC=1 HS pnpm exec playwright test --config ~/.local/share/full-steam/jg-runs/pw-local-channel-sv-3.config.ts --workers=1 --project=mobile-360 --project=desktop e2e/SV-3.spec.ts` | 1 | 2 passed (I, both projects), 2 failed (Q, both projects: `Error: responseShape`, F1) |
| 19 | same with `-g "Q:"`, scratch masking edit of `SV-3.spec.ts` (F1); file restored | 0 | 2 passed (scratch, not committed) |
| 20 | `HS pnpm typecheck` | 0 | 7 of 7 tasks (4 replayed from turbo's cache, inputs unchanged) |
| 21 | `LANE_BASE_REF=origin/main HS pnpm lint` | 1 | core purity passed (135 files), then `Lane boundary FAILED: Lane sv-3 cannot edit:` followed by SV-4's files and `packages/db/test/shadow-persistence.integration.test.ts` (the coordinator's one-line change, made in SV-4's branch) only: EXPECTED for a branch that carries two lanes. `apps/api/src/shadow-isolation.application.test.ts` is not in the list |
| 22 | `LANE_BASE_REF=origin/main node tools/core-purity-lint.mjs`; `... money-arithmetic-lint.mjs`; `... commercial-boundary-lint.mjs` (not through HS: seconds, no database) | 0, 0, 0 | passed |
| 23 | `LANE_BASE_REF=origin/main HS pnpm turbo run lint` | 0 | 7 of 7 tasks (4 cached) |
| 24 | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | same list as row 21 (expected) |
| 25 | `HS pnpm openapi:check` | 2, then 0, 0 | F4 |

### NOT RUN

`pnpm test:db` and `pnpm test:migrations` as aggregates; the other database files in `packages/db/test` not named above (including `demo-bootstrap` and `UIWIRE-12`); the whole API vitest suite; the full-repository `pnpm build`; `apps/web/e2e/SV-4.spec.ts` and every retained browser regression; any live-model run; anything that needs a real provider, real data or a deployment. `git push` of SV-4's branch (not done, by instruction). No pull request opened.

Mac verification record only — not an independent review, not acceptance.

## Repair round 2 (12 Oct)

Base HEAD: `43c3bf0ca46793965c77cef33b1b046d4c5f0f89`, initially clean. Re-read the issued order, dispatch addendum, continuation order, and the Follow-up (12 Oct) helper record. Only the five named SV-3 files changed; SV-4 and SV-2 tests stay untouched. Builder receipt only — not independently verified, not accepted.

Tests first: added T1's three direct-superuser FK refusal cases, each with a matching positive control, and extended the 0129 upgrade proof to include a pre-existing disclosure row as well as a finding row and to assert both additive keys. The early receipt was saved immediately after that first change; final implementation and check results follow below.

T1–T3 database and browser Q: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. No database/browser pass is claimed for this round.

### SV-2 catalogue test on the new head — to be filled by the Mac helper

Filled by the Mac helper on 12 October 2026 (evening): see "Mac verification (12 Oct, round 2)" at the end of this receipt, row 1 (`shadow-persistence.integration.test.ts`, UNEDITED, 8/8, including "qualifies every shadow link by tenant/job, and classifications by run/signal").

### Item 1: database bindings

Before (exact SQL):
```sql
 FOREIGN KEY(tenant_id,decision_id) REFERENCES app.decision(tenant_id,id),
 FOREIGN KEY(tenant_id,finding_id) REFERENCES app.job_finding(tenant_id,id),
 FOREIGN KEY(tenant_id,disclosure_event_id) REFERENCES app.shadow_disclosure_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
```
After (exact SQL; first two links become one):
```sql
 FOREIGN KEY(tenant_id,job_id,finding_id,decision_id) REFERENCES app.job_finding(tenant_id,job_id,id,decision_id),
 FOREIGN KEY(tenant_id,job_id,disclosure_event_id) REFERENCES app.shadow_disclosure_event(tenant_id,job_id,id) DEFERRABLE INITIALLY DEFERRED,
```

Migration 0129 adds exactly the two coordinator-named UNIQUE constraints before creating the firing table: `job_finding_tenant_job_id_decision_key` on `(tenant_id,job_id,id,decision_id)` and `shadow_disclosure_event_tenant_job_id_key` on `(tenant_id,job_id,id)`. Names are unchanged from the order. No column is added; no other constraint, grant, policy or trigger on these two existing tables is changed by this repair. Migration 0013 declares `job_finding`'s primary key `(tenant_id,id)` and its decision FK; migration 0128 declares `shadow_disclosure_event`'s primary key `(tenant_id,id)`. Each new key includes its table's already unique primary key, so two existing rows cannot duplicate the new key. This proves absence of data-uniqueness conflicts; it is not a claim that operational DDL cannot fail for unrelated reasons.

The routine body is unchanged: Decision INSERT → job_finding INSERT → firing INSERT → record_shadow_disclosure → audit. The immediate finding/decision link therefore has its parent before the firing insert. The disclosure link keeps `DEFERRABLE INITIALLY DEFERRED` because the disclosure is inserted after the firing, in the same transaction. All routine checks remain the second layer, and the table comment states that the database carries the job binding. The firing's existing unique keys and audit link stay unchanged.

- **T1 BUILT:** three parameterized direct-superuser INSERT refusals in `shadow-detection.integration.test.ts` (finding, decision, disclosure). The finding case uses K's finding and its own matching decision, isolating the job mismatch. The decision case uses J's finding with K's decision. The disclosure case uses J's finding/decision with K's disclosure and explicitly reaches `SET CONSTRAINTS ALL IMMEDIATE` after a successful INSERT. Each asserts SQLSTATE 23503 and the actual FK constraint name, rolls back to a savepoint, inserts the fully matching J row, forces constraints and verifies the accepted row. Audit parents are valid chain entries. No new trigger disabling or `session_replication_role` use. **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
- **T2 BUILT:** extended the existing rule-9 proof. Installs all registered migrations before 0129 by name, asserts those ledger names, seeds a finding plus a real disclosure/audit through SV-2's routine before the snapshot, and guards nonempty rows on all five compared tables. Applies 0129 alone, compares named-column `row_to_json(t)::text` and full `format_type` values, verifies both new unique keys, then runs `migrate()` twice, compares the same captured identities, and verifies the complete registered ledger. Retains the rolled-back microsecond/retype FAIL and nullable-column/function/later-insert PASS controls unchanged. **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
- **T3 SOURCE-INSPECTED:** existing direct firing fixture already inserts its own finding/decision before the firing; existing routine fixtures already bind every row to the same job. No older assertion or fixture was weakened or changed. **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.
- **T4:** SV-2's `shadow-persistence.integration.test.ts` is untouched; the Mac helper result belongs in the placeholder above. **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.

### Item 2: browser Q named limit

Only test Q changes. It brackets each browser request with its own Node `Date.now()` readings (request event before; complete response bytes after), asserts ISO format and exact Date round-trip, checks top-level and payingParty `retrievedAt` in that request window, and checks each visible `Retrieved: ` value against the same request's returned clock and window. Only the exact body pair for that value and the visible value after the exact label receive the placeholder; an occurrence-count assertion prevents masking another body's field. Every other page character and body byte, response status and all captured response headers remain compared exactly; the Next prevention-checks response must have no etag. Headers now include every name, replacing the prior three-header subset.

**Named limit:** the only field excluded is the database clock reading (`SELECT clock_timestamp()` at `packages/db/src/prevention-check-repository.ts:45`, no table input); timing is the only remaining channel and the window assertion bounds it.

The literal all-header requirement is implemented, including Date; no Date exception has been added. The optional clarification has not received an answer during this round. Node/Next may supply a changing Date header (the API test has an existing Date exclusion); the helper must verify this strict header comparison, and any further exclusion needs a ruling. Browser Q (both projects): **NOT RUN (sandbox cannot start PostgreSQL / a browser)**.

### Changed files and scratch control

Round-2 files only:

- `packages/db/test/shadow-detection.integration.test.ts` — T1 and populated own-step upgrade proof.
- `packages/db/migrations/0129_shadow_detection.sql` — two additive unique keys, two job-bound FKs, comments.
- `apps/web/e2e/SV-3.spec.ts` — test Q only.
- `docs/contracts/shadow-detection-v1.md` — corrected the obsolete routine-only binding paragraph to describe the database keys and second-layer checks.
- `docs/verdicts/SV-3/BUILDER_RECEIPT.md` — this round.

Uncommitted scratch `/private/tmp/jg-sv3-r2-comparison-control.cjs` extracted/transpiled the actual Q `checkClock`/`compareBody` helpers; it did not copy a different comparator. Clock-only body differences compared successfully (exit 0); `payingParty.recordedAt` and a result's separate `retrievedAt` stayed untouched; an out-of-window clock was refused. The RED invocation changed only `otherField` from `unchanged` to `changed` after clock normalization and reached the exact Playwright `toBe` assertion: exit 1, `Expected ... "otherField":"unchanged" ... Received ... "otherField":"changed" ...`, `matcherResult.pass=false`. This is comparator execution without a browser or database, not a browser-test pass. First scratch attempts could not resolve TypeScript from `/private/tmp` (both exit 1, `MODULE_NOT_FOUND`); changed the scratch harness to resolve the already installed module from the repository, then ran the successful positive and intended RED controls. Nothing from the scratch harness is committed.

### Sandbox commands and actual results

Working directory `W` = `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv-3`. Every command below was issued from W; package-filtered commands execute in the named package. `P` = `PATH=/private/tmp/jg-sv3-bin:$PATH`, the already-existing shim invoking cached pnpm **10.28.1** directly (Node **v24.17.0**), without an install/download. Dependencies were reused; this is not a clean-install claim. Root typecheck, root lint and root build each ran once.

| Command | Working directory | Exit / observed count and result |
| --- | --- | --- |
| `node /private/tmp/jg-sv3-r2-comparison-control.cjs` (initial attempt) | W | 1; TypeScript resolution failure before comparator execution. |
| `node /private/tmp/jg-sv3-r2-comparison-control.cjs red` (initial attempt) | W | 1; same resolution failure, not negative-control evidence. |
| `node /private/tmp/jg-sv3-r2-comparison-control.cjs` (fixed scratch harness) | W | 0; clock-only equality, both unrelated-field preservation checks and out-of-window refusal succeeded. Actual Q helpers executed; no browser/database. |
| `node /private/tmp/jg-sv3-r2-comparison-control.cjs red` (fixed scratch harness) | W | 1 **EXPECTED RED**; one OTHER-field byte-comparison assertion failed. |
| `P pnpm --filter @jobguard/db exec tsc --noEmit --strict --module nodenext --target es2023 --skipLibCheck --esModuleInterop --exactOptionalPropertyTypes --noUncheckedIndexedAccess test/shadow-detection.integration.test.ts` | W → `packages/db` | 0; one changed integration file source/typechecked, zero database tests executed. |
| `P pnpm typecheck` | W | 0; 7/7 tasks successful, 4 cached; 2m29.359s. Includes changed browser spec; database test checked separately above. |
| `P LANE_BASE_REF=origin/main pnpm lint` | W | 1; core purity passed (135 TypeScript files), then lane check rejected inherited SV-4 files and SV-2's inherited persistence-test change. Package lint did not run through this wrapper. None of the five round-2 files is rejected. |
| `P LANE_BASE_REF=origin/main pnpm lint:lanes` | W | 1; same inherited branch-state paths. No allowlist changed to obtain a pass. |
| `P LANE_BASE_REF=origin/main pnpm turbo run lint` | W | 0; 7/7 package lint tasks successful, 4 cached; 1m52.961s. Supplemental checks omitted by the failed root wrapper. |
| `LANE_BASE_REF=origin/main node tools/money-arithmetic-lint.mjs` | W | 0; money arithmetic boundary passed. |
| `LANE_BASE_REF=origin/main node tools/commercial-boundary-lint.mjs` | W | 0; commercial boundary completed, no output/count reported. |
| `P pnpm build` | W | 0; 7/7 tasks successful, 2 cached; 2m27.053s; Next generated 27/27 pages. Existing unowned CSS autoprefixer warning and sandbox Turbo cache-write IO warnings; no build failure. |
| `P pnpm openapi:check` | W | 1; tsx CLI IPC `listen EPERM`, before generator comparison. |
| `P pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | W → `apps/api` | 0; same source generator/check through the Node loader, no tsx CLI IPC socket. OpenAPI unchanged. |
| `ps -ax -o pid,etime,command` pipeline (one read-only progress diagnostic) | W | 1; sandbox denied process inspection; no state changed or escalation attempted. |
| One-off Python/Node lane, assertion-preservation, routine-byte and credential-shape inspections | W | 0; initially four paths, finally all five; 112 prior DB and 42 prior browser `expect` calls preserved; four protected file SHA-256 values recorded below. No standing test added. |
| `git diff --check`, final `git status --short` / `git diff --stat`, source reads/searches and temporary message/receipt writes | W | 0; whitespace clean; only the five named SV-3 files changed; intended message saved outside the repository. |

Logs: `/private/tmp/jg-sv3-r2-{typecheck,lint,lanes,package-lint,money-lint,commercial-lint,build,openapi,openapi-loader}.log`. All inspection/edit scripts completed with exit 0 except the explicitly recorded initial scratch resolution failures and denied process diagnostic. No root/package test aggregate ran. No changed runnable unit file exists in this round: the changed test files require PostgreSQL or a browser, so their suites stay NOT RUN; the scratch comparator is the available executable proof. No prompt/model/AI schema/detector changed, so no additional golden-set run was required for this repair.

All new/retained PostgreSQL cases (T1–T3, migration controls), SV-2's unchanged catalogue test (T4), browser I/Q on mobile-360 and desktop, `pnpm test:db`, `pnpm test:migrations` and retained DB/browser regressions: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. No sockets/browser/PostgreSQL service was started. Live-model evaluation remains **NOT RUN (separate release item)**.

### Repair self-review

Re-read every round-2 diff against HEAD, including the complete new SQL/tests, browser Q and contract/receipt. Inspected the main-based lane difference and separated inherited SV-4 work from this round. Checked that the only SQL edits are in 0129; the two candidate keys include their existing primary keys; all non-audit firing FKs carry tenant/job; decision existence is transitively guaranteed; deferrability, existing firing unique keys, role ownership/RLS/grants, routine checks and insert order are preserved. Verified that each bad T1 link isolates its own constraint and has a matching control with all deferred constraints forced, and that snapshots include populated findings/disclosures, exact named-column text/full types/captured identities and all retained rule-9 controls.

Verified Q's exact route scope, exact retrievedAt pair/count masking, preservation of other result clock fields and other bytes, visible-value/body association, request clock windows, status and full-header comparisons, and absent Next etag. All original assertions remain verbatim: the one-off AST inspection found **112** existing `expect` calls in the database test and **42** in the browser spec, including nested calls. No test timeout/retry was changed. No product screen/layout/wording changed. No detector, prompt/model/parser, worker composition, API replay, fee, authorization, or commercial policy changed. No new trigger disabling was added; the pre-existing rolled-back microsecond control remains unchanged.

One-off preservation checks (receipt evidence, no standing freeze test):

| Protected file | SHA-256, byte-identical to round base HEAD |
| --- | --- |
| `packages/db/test/shadow-persistence.integration.test.ts` | `a7b1f2670d96290a2778117317d6e8a6b590c4433415aa955d91af294933148c` |
| `packages/db/test/shadow-catalog.integration.test.ts` | `0ee8767ffdf773e515b679cb964dfa6f8b3ee511164cf2521978c221f1b3d455` |
| `apps/api/src/auth/context-boundary.test.ts` | `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d` |
| `packages/db/migrations/0130_final_account_lock.sql` | `31afda6d5d32c4afc92fa2c77b47fe7ac0b5abf3ae2bb845124d3d10571dfe8b` |

The complete SQL from `CREATE FUNCTION app.surface_shadow_signal_early` through its grants is byte-identical to HEAD. All five changed paths match the existing SV-3 lane; added lines have no credential-shaped literals. No lane/list/pin changed. No Git write, dependency install/download, network provider, real data, deployment or release operation. Intended conventional commit subject/body saved to `/private/tmp/jg-msg-sv-3.txt`; dispatcher owns commit/push/PR.

Could not verify PostgreSQL FK/catalog execution, populated migration/rollback execution, browser windows/rendering/full headers on either project, or live-model/provider processing. The expected main-based lane failure remains inherited branch-state evidence; it is not converted into a pass. Missing database/browser evidence is a hold for the helper/review, not acceptance. Previous external integrations and commercial/security/model/release gates remain held exactly as issued.

**Nothing owed inside this lane remains after this round.** This statement covers the authorized implementation and authored tests; the explicitly unrun helper suites and independent exact-commit verdict/acceptance remain required. Builder receipt only — not independently verified, not accepted.


## Mac verification (12 Oct, round 2)

Run by the JobGuard dispatcher's Mac helper (Claude Sonnet 5.5), 12 October 2026 (evening), in `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv-3`, branch `codex/sandbox/sv-3`. A verification record only: **not independently verified, not accepted**. Free disk at start 109 GiB.

**RESULT: RED on one test, and NOT PUSHED.** Everything database-side, API-side, build, typecheck, openapi and the lane step against SV-4's head is green. Browser test Q (`apps/web/e2e/SV-3.spec.ts:36`, both projects) fails on the channel `cacheHeaders`, because the response header `date` differs by one second between the zero-signal run and the 25-signal run. No product code is involved. Nothing was fixed (order: report the first failing assertion and the owning piece, stop that piece). No push, no pull request.

### Start, merges, renumber

- Start: head `d1c28d1` (clean), `origin/main` `ad1bad2`, SV-4 branch head `0c80c6f` (pushed earlier today, already caught up and renumbered 0132).
- `git merge origin/main` -> merge commit `5cf2157` "Merge main (ad1bad2) into SV-3". Conflicts only in append-only files, resolved keeping both sides, main's lines first: `packages/core/src/index.ts`, `packages/db/src/index.ts`, `packages/db/src/migrate.ts`, `packages/db/MIGRATIONS.md`, `apps/api/src/app.module.ts` (imports; main's `@Module` line plus `,FinalAccountLockController` once: character-level diff against main's line is the single insertion `,FinalAccountLockController`), `apps/api/src/workspace/application.ts` (imports; main's `return Object.freeze({ ssoRequired, sso, ...` line plus `, finalAccountLock` once before ` });`: single 18-character insertion). `apps/api/openapi.json`: not hand-merged. `config/agent-lane-assignments.json` parses.
- `git merge origin/codex/sandbox/sv-4` -> merge commit `e8d75df`. Git recognised the rename `0130_final_account_lock.sql` -> `0132_final_account_lock.sql`. Conflicts only in append-only files: `core` and `db` `index.ts` (kept SV-3's export lines), `migrate.ts` (main's lines, SV-4's 0132 line, then SV-3's own line), `MIGRATIONS.md` (SV-4's `## 0132` section replaces the stale 0130 bullet that the older SV-4 merge had left; SV-3's bullet kept), `config/agent-lane-assignments.json` (sv-3 line, then SV-4's current sv-4 line). After it: `ls packages/db/migrations` held exactly ONE `final_account_lock` file (`0132_final_account_lock.sql`); the only duplicate number left was SV-3's own 0129 (against `0129_sso_required.sql`), fixed by the renumber below.
- Renumber `0129_shadow_detection.sql` -> `0133_shadow_detection.sql` (`git mv`, commit `21d548e`): sha256 **before** `6d317e043790d4bb97acfb91d918b755a0e2ee9a08fdf6cbeefeb26fbdfe5aa6`, **after** `6d317e043790d4bb97acfb91d918b755a0e2ee9a08fdf6cbeefeb26fbdfe5aa6` (equal; it also equals the blob in `d1c28d1`). Because the SQL bytes are unchanged, the comment inside the SQL still says "0129 installs before SV-4 (0130)"; that comment is stale and was deliberately not touched. Changed: `migrate.ts` (registered last, after 0132), `MIGRATIONS.md` (heading `## 0133 — SV-3 shadow detection` plus the renumber sentence), `shadow-detection.integration.test.ts` (title, `endsWith(...)` lookup, ledger insert name), the `sv-3` lane line (allow-list path only), `docs/contracts/shadow-detection-v1.md`, this receipt's body, and a new `BUILD_PLAN.md` §12.2 paragraph "Ledger amendment — SV-3, 12 October 2026 (catch-up renumber, merge-ahead ruling)". `ls packages/db/migrations` now: no duplicate numbers (0127, 0128, 0129 sso, 0130, 0131, 0132, 0133).
- Packages rebuilt each alone before any test (`core`, `db`, `storage`, `config`, `ai`, then `api`; all exit 0). `apps/api/openapi.json`: took main's file, `pnpm openapi:generate` (exit 0), `pnpm openapi:check` (exit 0); 73 lines added, 0 removed against main (SV-4's four routes only; SV-3 adds no route); sha256 `04fdd616144672010f44a4ba7f543038bf4b645eee3b4450c3debd387c00c7f5` (commit `1e2fd2a`).
- Protected files not edited: `packages/db/test/shadow-persistence.integration.test.ts` sha256 `a7b1f2670d96290a2778117317d6e8a6b590c4433415aa955d91af294933148c` (one line differs from main: the coordinator's B1 change, arriving through SV-4); `packages/db/test/shadow-catalog.integration.test.ts` `0ee8767ffdf773e515b679cb964dfa6f8b3ee511164cf2521978c221f1b3d455` (the approved one-name edit); `apps/api/src/auth/context-boundary.test.ts` byte-identical to `origin/main` (sha256 `d082694df3dc005461d92ac79f275f31525d35c3e022948b47efa0ed7f9a772f`; the earlier pinned `7f191484...` is the pre-merge value).

### Results (every command through `~/.local/bin/heavy-slot <label>`; vitest `--reporter=verbose`, db files `--maxWorkers=1`, others `--maxWorkers=2`; logs in `~/.local/share/full-steam/jg-runs/sv-3-r2-mac/`)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `packages/db`: `test/shadow-persistence.integration.test.ts test/shadow-detection.integration.test.ts test/shadow-catalog.integration.test.ts` | 0 | 3 files, **31/31** (8 + 17 + 6). **Coordinator condition (d): SV-2's `shadow-persistence.integration.test.ts` UNEDITED passes 8/8, including "qualifies every shadow link by tenant/job, and classifications by run/signal" (325 ms)** |
| 1a | within row 1: T1 | | "T1: the database refuses a same-tenant other-job finding link, with an accepted matching control", "... decision link ...", "... disclosure link ..." all passed (SQLSTATE 23503 and the constraint name asserted; disclosure refused at the forced constraint check; each with its positive control) |
| 1b | within row 1: T2 | | "0133 upgrade proves its own step, named-column text/type preservation, and rolled-back adversarial controls" passed (1.3 s): populated before-state (pre-existing `job_finding` and `shadow_disclosure_event` rows), 0133 applied alone, both new unique keys present, rows identical, `migrate()` twice, microsecond and retype controls FAIL, nullable-column, replaced-function and later-insert controls PASS |
| 2 | `packages/db`: `test/command-replay-contract.integration.test.ts test/tenancy.integration.test.ts test/shadow-isolation-query-log.integration.test.ts` | 0 | 3 files, **63/63** (53 + 9 + 1) |
| 3 | `packages/db`: `test/final-account-lock.integration.test.ts test/final-account-lock-invoice.integration.test.ts test/final-account-lock-reveal.integration.test.ts` (SV-4) | 0 | 3 files, **26/26** (14 + 10 + 2) |
| 4 | `packages/db`: `test/final-account-lock-upgrade.integration.test.ts` (SV-4; here 0133 is a LATER migration for it) | 0 | **1/1** |
| 5 | `pnpm build` (production build used by the browser spec and by row 6) | 0 | 7/7 tasks |
| 6 | `apps/api`: `src/shadow-isolation.application.test.ts` (replay comparison) | 0 | **15/15** |
| 7 | `apps/api`: `src/auth/context-boundary.test.ts src/watchdog-registry.test.ts src/shadow-detection.worker.test.ts` | 0 | 3 files, **273/273**: scanner **145** (expected 145), watchdog registry **121**, worker 7 |
| 8 | `apps/api`: `src/final-account-lock.application.test.ts src/final-account-lock.controller.test.ts src/final-account-lock.isolation.test.ts` (SV-4) | 0 | **22/22** |
| 9 | `packages/core`: `src/observation.test.ts src/shadow-detection.test.ts src/watchdog.test.ts`; `packages/ai`: `src/shadow-proposal.test.ts src/shadow-evaluation.test.ts` | 0, 0 | 22/22; 8/8 |
| 10 | `pnpm typecheck` | 0 | 7/7 tasks |
| 11 | `LANE_BASE_REF=origin/main pnpm lint` | **1** | core purity passed (137 files), then `Lane boundary FAILED: Lane sv-3 cannot edit:` followed ONLY by SV-4's files (`apps/api/openapi.json`, `app.module.ts`, `workspace/application.ts`, `workspace/index.ts`, `final-account-lock.*` in api, core and db, the four `final-account/*/route.ts`, `customer-invoices.tsx`, `final-account-lock.tsx`, `job-final-account.tsx`, `SV-4.spec.ts` and its helper, `docs/contracts/final-account-lock-v1.md`, `docs/verdicts/SV-4/*`, `watchdog.ts`, `0132_final_account_lock.sql`, `variation-repository.ts`, the four SV-4 db tests) and the coordinator's one line in `shadow-persistence.integration.test.ts`. EXPECTED for a branch that carries SV-4 until SV-4 is on main; none of SV-3's own files is named |
| 11a | `LANE_BASE_REF=origin/codex/sandbox/sv-4 node tools/agent-lane-boundary-lint.mjs` (supplementary: base = SV-4's pushed head, so only SV-3's own delta is judged) | 0 | **Lane boundary passed**: 32 files, all SV-3's, including `packages/db/migrations/0133_shadow_detection.sql` |
| 11b | `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` (`LANE_BASE_REF=origin/main`); `pnpm turbo run lint` | 0, 0, 0 | passed; turbo lint 7/7 |
| 12 | `pnpm openapi:check` (in `apps/api`) | 0 | pass |
| 13 | `apps/web`: `CI=1 PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm exec playwright test --config ~/.local/share/full-steam/jg-runs/sv-3-r2-mac/pw-local-channel-sv-3-r2.config.ts --workers=1 e2e/SV-3.spec.ts` (both projects) | **1** | I: **2 passed** (mobile-360, desktop). **Q: 2 failed** (see below) |
| 14 | same, `--project=mobile-360` only (diagnostic rerun) | 1 | I passed; Q failed again, now with the same error as desktop |
| 15 | same, both projects, with ONE scratch edit that drops the `date` header from the compared headers (uncommitted; restored with `git checkout -- apps/web/e2e/SV-3.spec.ts`, sha256 back to `67e5bacd6886a949cb0292c7f6389e546867fc0dffb5bf18cfe7f88c7496bf7d`) | 0 | **4 passed** (I and Q, both projects) |

### Browser test Q, the failure (not fixed)

First failing assertion, desktop (and mobile-360 on its rerun): `Error: cacheHeaders`, `apps/web/e2e/SV-3.spec.ts:126:80`, `expect(JSON.stringify(many[channel]),channel).toBe(JSON.stringify(zero[channel]))`. The channels before it in the list (`responseShape`, `counts`, `badges`, `errors`, `cacheKeys`) all PASSED, so the named exclusions of the `Retrieved:` time and `retrievedAt` work as ruled. The `cacheHeaders` channel now compares every response header of every `/api/` response (round 2 replaced the old three-header subset by all headers, as the order said), and the Next server's `date` header differs between the zero run and the 25-signal run (for example `Mon, 12 Oct 2026 21:22:58 GMT` against `... 21:22:59 GMT` on `/api/decisions?tenantId=...`): two replays a few seconds apart cannot send the same `Date`. All other headers matched. The builder predicted this in its round-2 receipt ("the helper must verify this strict header comparison, and any further exclusion needs a ruling"). On the first mobile-360 run the failure was different and not repeatable: `response.body: Protocol error (Network.getResponseBody): No resource with given identifier found` at `SV-3.spec.ts:85` (the body read of an `/api/` response in the response listener, cut off by the next navigation); on the rerun mobile-360 reached the same `cacheHeaders` error as desktop. Treat it as a Chromium timing flake unless it returns after the `date` question is settled; it is a second small weakness of the same listener (the body read is not guarded).

Owner: SV-3 itself (its own browser test Q, repaired in round 2). Needs a ruling plus a small builder edit, in the same style as the `retrievedAt` ruling: exclude the `date` header by exact name from the header comparison, with a positive assertion that it is a well-formed HTTP date inside that request's own before/after window (one-second resolution, so the window should be widened by one second on each side), everything else still compared. Row 15 shows that with only that header left out all four browser tests pass. No change was made to the committed spec.

### NOT RUN

`pnpm test:db`, `pnpm test:migrations` and any whole-package suite (memory rule); `apps/web/e2e/SV-4.spec.ts` and every other retained browser spec; `ENT-2.spec.ts`; any live-model run (a separate release item); the scratch negative control for Q's other-field check (done by the builder in round 2; not repeated).

**Not pushed. No pull request opened.** Mac verification record only; this receipt remains "not independently verified, not accepted".

## Repair round 3 (date header, 12 Oct)

Issued 12 October 2026 by the dispatcher, on the coordinator's 22:45 ruling. Started from clean `03539e1` on `codex/sandbox/sv-3`; read **Mac verification (12 Oct, round 2)** first. Earlier issued orders and repairs remain in force.

> SV-3 browser test Q: YES. Exclude the `date` response header by exact name, with a positive assertion that it is a well-formed HTTP date inside the request's own before/after window widened by one second each side; every other header still compared. Same named-limit treatment as the Retrieved time, in the receipt.

**NAMED LIMIT:** the only fields excluded from the replay comparison are the database clock reading `Retrieved:`/`retrievedAt`, the Nest `etag` where present, and the Next `date` header, each excluded by exact name with a positive window assertion; timing remains the only channel and the window assertions bound it.

Changed only **test Q** in `apps/web/e2e/SV-3.spec.ts`, plus this receipt. Each captured `/api/` response in each replay must have a string `date` matching IMF-fixdate, parse to a finite instant, and round-trip through `toUTCString()` exactly (including the correct weekday and calendar/time values). Missing/malformed dates fail. The request event records its own `Date.now()` before reading; the response event records a separate `Date.now()` immediately on receipt, before awaiting headers/body. Bounds are exactly `[floor(before / 1000) * 1000 - 1000, floor(after / 1000) * 1000 + 1000]`, inclusive. Only the exact lower-case `date` key is filtered from the all-header comparison after the positive check. Every other header is still sorted and compared byte-for-byte in the same `cacheHeaders` channel. The prior database-clock windows, body/visible-value exclusions, absent Next etag assertion, channels and replay comparator are unchanged; this round adds no Nest etag exclusion.

### Scratch controls (not committed)

`/private/tmp/jg-sv3-r3-date-control.cjs` extracts the actual Q date helper, header-filter expression and final channel comparison using the TypeScript AST, transpiles those pieces, and executes them with the installed Playwright assertion library. No browser runner, network server or database is started. Positive execution passes date-only header differences, both inclusive one-second widened/floored bounds, preservation of `cache-control`, `etag` and the date-shaped `last-modified` header, and refusal of missing/malformed dates, wrong weekdays and values one second beyond either bound.

- **OTHER header RED:** changing only `cache-control` from `no-store` to `private` after checking the two dates reaches Q's actual `toBe` header comparison and fails, `matcherResult.pass=false`, exit **1 EXPECTED**. All other retained headers match.
- **Date-window RED:** a correctly formatted HTTP date sixty seconds later reaches the new upper-window assertion and fails (`1791840238000` received against maximum `1791840180000`), `matcherResult.pass=false`, exit **1 EXPECTED**.

These are execution of the extracted assertions/comparator, **not a browser test Q pass**. The scratch harness and logs are outside the repository.

### Commands and exits

Working directory `W` = `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv-3`. `P` = `PATH=/private/tmp/jg-sv3-bin:$PATH`, the existing shim invoking cached pnpm **10.28.1**, Node **v24.17.0**. Dependencies reused; no clean-install claim. Logs: `/private/tmp/jg-sv3-r3-*.log`.

| Command | Exit | Result |
| --- | --- | --- |
| Initial runtime probe: `node --version`, then plain `pnpm --version` | 0, 130 | Node reported v24.17.0; plain pnpm probe interrupted before a version was returned. Used the already-existing cached shim thereafter. |
| `P pnpm --version` | 0 | 10.28.1; no install/download command issued. |
| `node /private/tmp/jg-sv3-r3-date-control.cjs` | 0 | Actual Q helper/filter/comparison positive and malformed/boundary controls passed. |
| `node /private/tmp/jg-sv3-r3-date-control.cjs other-header` | 1 EXPECTED RED | Changed OTHER header fails exact replay comparison. |
| `node /private/tmp/jg-sv3-r3-date-control.cjs date-window` | 1 EXPECTED RED | Far-outside date fails positive window assertion. |
| `P pnpm typecheck` | 0 | 7/7 tasks, 6 cached; changed browser spec checked. |
| `P LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed (137 files); lane rejects inherited SV-4 paths and inherited coordinator B1 in `shadow-persistence.integration.test.ts`, as in the Mac receipt. Neither round-3 path is rejected. Package lint is not reached by this wrapper. |
| `P LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same inherited branch-state failure; no allowlist changed. |
| `LANE_BASE_REF=origin/codex/sandbox/sv-4 node tools/agent-lane-boundary-lint.mjs` | 0 | Supplementary SV-3 delta check passed (33 paths). |
| `P pnpm turbo run lint` | 0 | 7/7 package lint tasks, 6 cached. |
| `LANE_BASE_REF=origin/main node tools/money-arithmetic-lint.mjs` | 0 | Passed. |
| `LANE_BASE_REF=origin/main node tools/commercial-boundary-lint.mjs` | 0 | Passed. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | 0 | **19/19** runnable Node tests passed. Lane-test Git-write fixtures omitted under the dispatcher's no-Git-writes order. |
| `P pnpm build` | 0 | 7/7 tasks, 6 cached; Next 29/29 pages. Existing unowned CSS/autoprefixer and sandbox Turbo cache-write warnings remain. |
| `P pnpm openapi:check` | 1 | tsx CLI IPC `listen EPERM`, before comparison. |
| `P pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same generator/check via Node loader, without CLI IPC socket. OpenAPI unchanged. |
| Initial one-off self-review stdin script | 1 | Script syntax error before checks; corrected in the scratch file below. No repository change. |
| Final self-review before harness scope correction | 1 | Scratch harness initially matched only literal lane entries; the receipt uses an existing directory scope. Corrected the harness to honor that scope; no lane change. |
| `node /private/tmp/jg-sv3-r3-self-review.cjs` (corrected scope matcher) | 0 | Test I byte-identical; all **34** prior `expect` calls retained, **7** added; syntax, exact two-path lane and protected/list/OpenAPI preservation checked. |
| `git diff --check`, read-only status/diff/source inspections, scratch/receipt/message writes | 0 | Whitespace clean; only the test spec and this receipt changed. |

**NOT RUN:** Vitest suites, `pnpm test` aggregate, `pnpm test:db`, `pnpm test:migrations`, `pnpm eval`, Playwright/browser I and Q on **both mobile-360 and desktop**, and retained browser/database regressions. Vitest/Playwright cannot run in this sandbox under the issued order; PostgreSQL/localhost are unavailable. The Mac helper runs both browser projects; GitHub CI runs the required suites after dispatcher push. No prompt/model/schema/detector changed; no new live-model gate is triggered by this repair. Existing live-model evaluation remains NOT RUN (separate release item).

### Self-review pass and handoff

Re-read the entire round-3 diff. Strict format plus finite parse plus exact UTC round-trip rejects permissive `Date.parse()` normalization. Each API response is checked before its exact `date` key is removed; the same replay runs for zero and 25 linked signals. Both Date.now readings belong to that response's own request; only the date bounds receive the ruled one-second allowance. Every existing assertion, other header, channel, exclusion and timing limit remains intact. No other test, timeout, retry or security test list was touched. Rule 11: no credential-shaped literal added. Rule 12: semantic assertions only; no standing byte/hash pin introduced. Protected files, lane registry and OpenAPI are byte-identical to round base HEAD (one-off receipt evidence only).

No product code, migrations, commercial/authorization policy, provider action, operational alert or deployment changed. No Git write, commit, push, checkout, install or dependency-download command issued. Intended conventional commit subject/body saved to `/private/tmp/jg-msg-sv-3.txt`; dispatcher owns committing and pushing. Both named negative controls are recorded; sandbox implementation/self-review work is complete. Main-based lane failure remains a failure; browser/database evidence, independent verdict bound to the eventual exact commit, separate acceptance and prior release gates remain held. **Builder receipt only — not independently verified, not accepted.**

## Mac verification (12 Oct, round 3)

Run by the JobGuard dispatcher's Mac helper (Claude Sonnet 5.5), 12 October 2026 (night), in `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv-3`, branch `codex/sandbox/sv-3`. A verification record only: **not independently verified, not accepted**. Free disk at start 106 GiB.

**RESULT: RED on browser test Q, project mobile-360 only, and NOT PUSHED.** The `date` repair itself works: Q passes on desktop in every run and on mobile-360 in 4 of 4 warm-server runs, with none of its `date` assertions failing. But Q on mobile-360 fails the first time it runs after the web server starts, twice out of two full-spec runs (the same `response.body` error seen once in round 2), so "I and Q pass on both projects" is not met on a fresh server. Nothing was fixed (order: report the first failing assertion and the owning side). No push, no pull request.

### Start and merge

- Start: head `d11424f` (clean); `git diff 03539e1 HEAD --stat` showed exactly two files, `apps/web/e2e/SV-3.spec.ts` (+14/-2) and this receipt. `origin/main` had moved from `ad1bad2` to `a54d46f` (FEE-BOTH-1 and TRAIN-LANE-1), so `git merge origin/main` -> merge commit `8b8823e` "Merge main (a54d46f) into SV-3". One conflict, `BUILD_PLAN.md` section 12.2 (append-only ledger paragraphs): kept both sides, main's FEE-BOTH-1 paragraph first, then SV-4's and SV-3's. `config/agent-lane-assignments.json` merged cleanly and parses (main added `fee-both-1` and `train-lane-1`). `apps/api/openapi.json` was not touched by main; `pnpm openapi:check` passes. Migration `0133_shadow_detection.sql` sha256 unchanged (`6d317e04...fe5aa6`). `packages/db/test/shadow-persistence.integration.test.ts` sha256 `a7b1f267...3148c`, same as round 2 (unedited); `context-boundary.test.ts` untouched.
- Build: `pnpm build` (turbo, all seven packages incl. api and the Next production build) exit 0, 7/7 tasks.

### Browser spec `apps/web/e2e/SV-3.spec.ts` (wrapper `pw-local-channel-sv-3-r3.config.ts`, a copy of the round-2 wrapper with only the output folder changed; production build, channel chromium; `CI=1 ... --workers=1`; logs in `~/.local/share/full-steam/jg-runs/sv-3-r3-mac/`)

| Run | Command | Exit | mobile-360 | desktop |
|---|---|---|---|---|
| 1 | both projects | **1** | I pass, **Q FAIL** | I pass, Q pass |
| 2 | both projects, identical rerun (fresh server) | **1** | I pass, **Q FAIL** | I pass, Q pass |
| 3 | `--project=mobile-360 --repeat-each=4` (diagnostic, one server for all 8 tests) | 0 | I x4 pass, Q x4 pass | not run |

- **Q's `date` assertions:** IMF-fixdate regex, finite parse, exact `toUTCString()` round-trip, and the lower and upper window bounds ran for every `/api/` response in all six passing Q executions (2 desktop, 4 mobile-360) with **no failure**; the `cacheHeaders` channel (all headers except `date`) matched between the zero-signal and 25-signal runs, as did the five channels before it. The round-2 failure (`cacheHeaders` on `date`) did not recur.
- **First failing assertion (runs 1 and 2, mobile-360 Q):** `Error: response.body: Protocol error (Network.getResponseBody): No resource with given identifier found` at `apps/web/e2e/SV-3.spec.ts:96:69` (`await response.body()` inside the response listener; a follow-on `page.waitForLoadState: Test ended` at line 112 is a consequence). It occurs about 2.7 s into the test, in the first replay, on the first job-page load after the server starts. The Playwright trace shows five job-page API responses (`materials`, `things-to-check`, `readiness`, the job itself, `purchase-orders`) with no body saved, arriving after the page's first network-idle point and just before the next `page.goto`. This is read from the trace, not proven.
- **Owner: SV-3's own browser test Q** (the response listener's unguarded body read, and `networkidle` followed by `Promise.all(pending)` not covering responses that arrive after the idle point). No product code is involved. This is the same error the round-2 helper saw once on the first mobile-360 run and called a probable timing flake; it has now returned twice with the `date` question settled, and it is reproducible on a fresh server, so it needs a small builder edit and a ruling on whether to guard or await it. Warm-server reruns pass.

### Other results (every heavy command through `~/.local/bin/heavy-slot <label>`; db files `--maxWorkers=1`, others `--maxWorkers=2`)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `packages/db`: `test/shadow-persistence.integration.test.ts test/command-replay-contract.integration.test.ts test/shadow-detection.integration.test.ts` | 0 | 3 files, **78/78**: shadow-persistence **8/8 UNEDITED** (including "qualifies every shadow link by tenant/job, and classifications by run/signal"), command-replay-contract **53/53**, shadow-detection **17/17** (T1 x3 and the 0133 upgrade test pass) |
| 2 | `apps/api`: `src/auth/context-boundary.test.ts src/watchdog-registry.test.ts src/shadow-detection.worker.test.ts` | 0 | 3 files, **273/273**: scanner **145**, watchdog registry **121**, worker 7 |
| 3 | `pnpm typecheck` | 0 | 7/7 tasks |
| 4 | `pnpm openapi:check` (apps/api) | 0 | pass |
| 5 | `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1 | EXPECTED: 36 paths named, every one a path SV-4 carries until it merges (including the coordinator's one B1 line in `shadow-persistence.integration.test.ts`); none is SV-3's own |
| 6 | `LANE_BASE_REF=origin/codex/sandbox/sv-4 node tools/agent-lane-boundary-lint.mjs` | 1 | EXPECTED here: SV-4's pushed head predates main `a54d46f`, so the only eight paths named are those that arrived through main's FEE-BOTH-1 and TRAIN-LANE-1 (`ci.yml`, two receipts, `fee-both.test.ts`, `origin.ts`, `transitions.test.ts`, `agent-lane-boundary-lint.mjs`, `agent-lane-boundary-train.test.mjs`); none is SV-3's own, and the round-2 pass against SV-4's head (32 files) is unchanged in substance |

### NOT RUN

`pnpm test:db`, `pnpm test:migrations`, any whole-package suite (memory rule), the other retained browser specs, any live-model run, the `core`/`ai` unit files re-run (unchanged by this round). The scratch negative controls for Q (changed other header; far-out date) were done by the builder and are not repeated here.

**Not pushed. No pull request opened.** Local head after this record is the commit that adds it.

## Repair round 4 (late responses, 12 Oct)

Issued 12 October 2026 at approximately 23:05 by the JobGuard dispatcher after the Mac helper's round-3 rerun. Base: clean local `2658f9f`, branch `codex/sandbox/sv-3`, worktree `.worktrees/sv-3`; main `a54d46f` is already merged. Read AGENTS.md, BUILD_PLAN.md SV-3/DW3/Test Q and the prior repairs/Mac record before editing. Earlier coordinator rulings and rounds 1–3 remain in force.

**Reported failure:** `response.body: Protocol error (Network.getResponseBody): No resource with given identifier found` at `apps/web/e2e/SV-3.spec.ts:96:69`, approximately 2.7 seconds into the first job-page load on mobile-360 after each of two cold server starts. `page.waitForLoadState: Test ended` around old line 112 is a consequence. The helper's trace suggests late materials, things-to-check, readiness, job and purchase-orders responses crossed the old idle/snapshot barrier; that cause was trace-inferred, not independently proven here. The round-3 `date` assertions work and are retained.

**Approach and justification (two sentences):** Q now registers request/response listeners before replay navigation, records each API response with its request and body-read promise, awaits `response.finished()` and starts its body read alongside the header read while the page remains open. Before initial replay navigation, each view capture and each step's exit (including the next navigation and final replay return), a bounded barrier requires all page requests and API body reads to finish plus 500 ms without request/body activity, so late arrivals extend the live wait rather than escaping a single `networkidle`/promise-array snapshot.

A request failure or any response-finish/header/body/assertion failure is retained and thrown by that barrier with method, URL and original error/cause. The rejection handler prevents an unattached asynchronous rejection; it does not ignore a failure or skip a response. A request that never completes or a body read that never settles fails within the new 10-second barrier with outstanding URLs. This is a new bounded wait, not an increase to an existing test timeout or a retry. Listener cleanup is symmetrical in `finally`.

### Lines changed, before/after (relative to round base)

- Old **87–110** -> new **87–129**: the `pending: Promise<void>[]` snapshot becomes a request-keyed capture map plus live outstanding-request and failure tracking; add `requestfinished`/`requestfailed` listeners, `response.finished()`, concurrent header/body reading and `drain()`.
- Old **111–125** -> new **130–147**: attach/detach all four listeners, drain before the first `goto`, replace `waitForLoadState('networkidle'); Promise.all(pending)` with the live drain, and drain again after storing each view before leaving its page.
- Exactly **+33/-11** lines in the spec. All **41** previous simple `expect` calls, the nine channels, response URL/status/body/header projections, final exact comparator, visible/browser instrumentation, fixtures and named clock checks are unchanged. One new `expect.poll(...).toEqual(...)` assertion enforces the barrier. Test I and everything outside Q's response-capture lifecycle are unchanged. Only this spec and this receipt changed in the repository.

**NAMED LIMIT unchanged:** only the ruled exact `Retrieved:`/`retrievedAt`, Nest `etag` where present and Next `date` exclusions, with their existing positive assertions, remain authorized. This repair adds no exclusion, body substitution, filtered response or reduced channel/header list; Q's existing absent-Next-etag assertion remains intact.

### Scratch controls (uncommitted, no browser or database)

`/private/tmp/jg-sv3-r4-control.cjs` extracts/transpiles Q's actual clock helpers, request/capture listeners, drain, snapshot projection and final comparator, then executes them with the installed Playwright assertions and a synthetic event-emitting page. A scratch capture regression ran RED before implementation; the initial log is `/private/tmp/jg-sv3-r4-control-before.log` (the shell wrapper printed that log after Node's failure, so its aggregate exit was 0). A final baseline control against the archived HEAD spec explicitly models the old first idle point at 500 ms: only the early body has been read when its snapshot barrier returns, and the three-body assertion fails, exit **1 EXPECTED**. The repaired control holds an already-started request until its response arrives at 650 ms, includes a new request at 800 ms during the drain, and waits for that request's body read for another 800 ms even though `requestfinished` has fired; all three bodies are captured before exit, **PASS**.

- **Changed body RED:** change just one captured base64 body in the second replay snapshot. Q's actual final `responseShape` `toBe` comparison fails on the original body versus `{"fixture":"CHANGED"}`, exit **1 EXPECTED**. The same projection/comparator passes with no body change.
- **Missing response RED:** emit `GET https://fixture.invalid/api/never-completes` without a response or finish event. Q's actual drain fails after **10000 ms**, showing that URL in `inFlight` even though `quiet` is true, exit **1 EXPECTED**. Quiet time cannot excuse an outstanding request.
- **Unreadable body RED:** a synthetic response rejects `body()`; the actual capture/barrier fails with `Q response capture failed: GET https://fixture.invalid/api/unreadable: Error: fixture body unavailable`, exit **1 EXPECTED**. No response is silently dropped.

These are execution of extracted Q capture/assertion code against synthetic events, **not browser Q passes or proof of the cold Chromium behavior**. Scratch scripts/spec/logs remain outside the repository.

### Commands and actual outcomes

Installed dependencies reused; no clean-install claim. Node **v24.17.0**. Plain `pnpm --version` stalled on the installed launcher's self-selection and was interrupted (exit 130); all subsequent pnpm commands used the already-existing `/private/tmp/jg-sv3-bin` shim for cached **10.28.1**, without installing/downloading. Below `P` means `PATH=/private/tmp/jg-sv3-bin:$PATH`; logs are `/private/tmp/jg-sv3-r4-*.log`. Heavy repository checks were serialized.

| Command | Exit | Result |
| --- | --- | --- |
| `SV3_CONTROL_SOURCE=/private/tmp/jg-sv3-r4-before.ts node /private/tmp/jg-sv3-r4-control.cjs` | 1 EXPECTED RED | Archived base capture returns with only the early body, missing both late bodies. |
| `node /private/tmp/jg-sv3-r4-control.cjs` | 0 | Late response/new request/slow body captured; actual snapshot and all nine channel comparators pass. |
| Same scratch command with `changed-body`, `missing`, `unreadable` | 1 each EXPECTED RED | Body difference, never-completed request and body-read rejection fail loudly as above. |
| `P pnpm typecheck` | 0 | 7/7 tasks, 6 cached; changed browser spec checked. |
| `P LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed (137 files); lane rejects the same 36 inherited SV-4/coordinator paths as the Mac record, including inherited B1 in shadow-persistence. Neither repair path is rejected. No lane/security list edited; package lint not reached by wrapper. |
| `P LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same inherited branch-state lane failure. |
| `P pnpm turbo run lint` | 0 | Actual package lint: 7/7 tasks, 2 cached; final spec checked. |
| `LANE_BASE_REF=origin/main node tools/money-arithmetic-lint.mjs` | 0 | Passed. |
| `LANE_BASE_REF=origin/main node tools/commercial-boundary-lint.mjs` | 0 | Passed. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | 0 | **19/19** runnable Node tests passed. Git-write fixture tests omitted under the dispatcher's no-Git-writes instruction. |
| `P pnpm build` | 0 | 7/7 tasks, 6 cached; Next build passed. Existing workspace-root/CSS/autoprefixer and sandbox cache-write warnings. |
| `P pnpm openapi:check` | 1 | tsx CLI IPC `listen EPERM`, before comparison. |
| `P pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same generator/check via Node loader without CLI IPC socket; OpenAPI unchanged. |
| Initial scratch self-review invocation | 1 | Scratch-script syntax typo before checks; corrected only the temporary script. |
| `node /private/tmp/jg-sv3-r4-self-review.cjs` (corrected) | 0 | 41 prior expectations and all comparison blocks preserved; test I, protected files, lane and OpenAPI unchanged; exact two-file scope. |
| Read-only Git inspections and `git diff --check` | 0 | No whitespace errors; no Git write. |

**NOT RUN:** browser Q/I on mobile-360 or desktop, any other browser journey, `pnpm test:db`, `pnpm test:migrations`, PostgreSQL regressions and full `pnpm test` aggregate. Browser/localhost/PostgreSQL are unavailable in this sandbox as issued; the aggregate includes prohibited database suites and Git-write fixtures. No changed unit-test file exists outside the browser spec; unchanged Vitest/evaluation suites were not repeated. No prompt/model/schema/parser/detector changed, and the approved-region live-model evaluation remains a separate NOT RUN release item.

**Required helper handoff:** run Q on **mobile-360 FOUR times and desktop FOUR times**, each individual run from a **fresh cold web-server start**, with no reused warm server or repeat-each shortcut. Record first failing assertions if any and the date assertions/channel comparisons. Dispatcher/CI still own PostgreSQL/retained regression checks and the eventual push.

### Self-review pass and status

Read the full delta: the live request set includes every page request, while API bodies retain exactly the previous `/api/` inclusion rule. A late response has a pending capture before awaiting its finish; `requestfinished` alone cannot release a pending body read; every new request/finish/read resets quiet time; all retained errors are thrown before a successful barrier can release navigation. All prior assertions/comparisons are byte-preserved as one-off receipt evidence, with no permanent hash test. Rule 11: no credential-shaped literal added. Rule 12: semantic barrier assertions only. `apps/api/src/auth/context-boundary.test.ts`, `packages/db/test/shadow-persistence.integration.test.ts`, security lists, lane registry, OpenAPI, AGENTS.md and BUILD_PLAN.md remain unchanged from round base.

No product code, migration, provider action, commercial policy, operational alert or deployment changed. Self-review/source inspection and synthetic control execution are distinct from independently verified browser behavior. No independent verdict or technical acceptance claimed; those await the dispatcher's exact commit and separate reviewers. No commit, add, checkout, push, package download or dependency installation performed. Intended conventional-commit subject/body written to `/private/tmp/jg-msg-sv-3.txt`; dispatcher owns committing. Browser cold-start acceptance remains **HELD**.

## Mac verification (12 Oct, round 4)

Run by the JobGuard dispatcher's Mac helper (Claude Sonnet 5.5), 12 October 2026 (night), in `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv-3`, branch `codex/sandbox/sv-3`. A verification record only: **not independently verified, not accepted**. Free disk at the end 103 GiB.

**RESULT: GREEN.** Browser tests I and Q passed on BOTH projects in ALL EIGHT cold-server runs (four on mobile-360, four on desktop). The round-3 failure (`response.body: Protocol error ... No resource with given identifier found` on mobile-360 after a cold start) did not recur. Nothing was fixed or changed by the helper; the only commits are the main merge and this record.

### Start and merge

- Start: head `10c7a93` (clean). `git diff 2658f9f HEAD --stat` showed exactly two files, `apps/web/e2e/SV-3.spec.ts` (+33/-11) and this receipt.
- `origin/main` had moved from `a54d46f` to `96f051f` (ENT-10c). `git merge origin/main` merged with no conflict -> merge commit `175a21f` "Merge main (96f051f) into SV-3". Main added eight documents (`docs/security/*`, the ENT-10c receipt) and touched `config/agent-lane-assignments.json`, which merged cleanly and still parses. `apps/api/openapi.json` was not touched by main; `pnpm openapi:check` exits 0. `packages/db/test/shadow-persistence.integration.test.ts` sha256 starts `a7b1f2670d96290a` (same as rounds 2 and 3, unedited); migration `0133_shadow_detection.sql` sha256 starts `6d317e04` (unchanged); `apps/api/src/auth/context-boundary.test.ts` untouched.
- Rebuild: `pnpm build` (turbo, all seven packages including the Next production build) exit 0, 7/7 tasks (6 from the turbo cache; nothing under the build inputs changed in the merge).

### Browser spec `apps/web/e2e/SV-3.spec.ts`: eight separate cold-server runs

Wrapper `pw-local-channel-sv-3-r4.config.ts` (a copy of the round-3 wrapper with only the output folder changed: production build via `next start`, channel chromium). Each run: `CI=1 npx playwright test e2e/SV-3.spec.ts --config <wrapper> --workers=1 --project=<one project> --reporter=list` through `heavy-slot`, one project per run, so every run is the first and only thing the freshly started server serves. Playwright starts and stops `next start` and the embedded PostgreSQL itself; ports 3000 and 55432 were checked free before and after every run. Logs in `~/.local/share/full-steam/jg-runs/sv-3-r4-mac/cold-<project>-<n>.log`.

| Run | Project | Exit | I | Q | Playwright total | Wall incl. server start |
|---|---|---|---|---|---|---|
| 1 | mobile-360 | 0 | pass 3.3 s | pass 6.7 s | 14.9 s | 15 s |
| 2 | mobile-360 | 0 | pass 3.2 s | pass 6.7 s | 14.9 s | 15 s |
| 3 | mobile-360 | 0 | pass 3.3 s | pass 6.6 s | 15.1 s | 16 s |
| 4 | mobile-360 | 0 | pass 3.1 s | pass 6.4 s | 13.5 s | 14 s |
| 1 | desktop | 0 | pass 3.0 s | pass 6.5 s | 14.0 s | 15 s |
| 2 | desktop | 0 | pass 3.1 s | pass 6.5 s | 13.5 s | 14 s |
| 3 | desktop | 0 | pass 3.0 s | pass 6.4 s | 14.2 s | 15 s |
| 4 | desktop | 0 | pass 3.1 s | pass 6.6 s | 14.7 s | 15 s |

- No first failing assertion: none occurred. Q's date assertions and the nine-channel replay comparison are inside Q's body, so a Q pass means they all ran and held; the new request-drain barrier did not time out in any run.
- Before these eight runs, one run was started by mistake without a spec filename, so it ran the whole `e2e` directory on mobile-360 (174 tests, 6.7 min, one cold start): 173 passed and 1 failed. SV-3 I and Q both passed in it (2.7 s and 6.4 s). The one failure is `ENT-2.spec.ts:19` ("the office imports generated files...") at line 105, `expect(await noSideScroll(page)).toBe(true)` on `/contractor/work-orders` at the 360 px width, which is ENT-2's own page; it is unrelated to SV-3 (no SV-3 file touches it) and was not investigated or counted as one of the eight runs. Log kept as `accidental-full-e2e-mobile-360.log`.

### Other results (every heavy command through `~/.local/bin/heavy-slot <label>`; db files `--maxWorkers=1`, api files `--maxWorkers=2`)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `packages/db`: `vitest run test/shadow-persistence.integration.test.ts test/command-replay-contract.integration.test.ts` | 0 | 2 files, **61/61**: shadow-persistence **8/8 UNEDITED**, command-replay-contract **53/53** |
| 2 | `apps/api`: `vitest run src/auth/context-boundary.test.ts src/watchdog-registry.test.ts` | 0 | 2 files, **266/266**: scanner **145**, watchdog registry **121** |
| 3 | `pnpm typecheck` | 0 | 7/7 tasks (6 cached) |
| 4 | `pnpm openapi:check` (apps/api) | 0 | pass |
| 5 | `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1 | EXPECTED: 36 paths named, all inherited from SV-4 or main-side changes SV-4 carries until it merges; none is SV-3's own (same 36 as the builder's round-4 record) |
| 6 | `LANE_BASE_REF=origin/codex/sandbox/sv-4 node tools/agent-lane-boundary-lint.mjs` | 1 | EXPECTED: SV-4's pushed head predates main `96f051f`, so the paths named are those that arrived through main (ENT-10c documents, `ci.yml`, FEE-BOTH-1 and TRAIN-LANE-1 files); none is SV-3's own |

### NOT RUN

`pnpm test:db`, `pnpm test:migrations`, any whole-package suite (memory rule), the other retained browser specs (ENT-2 and SV-4 not rerun beyond the accidental full run described above), any live-model run, the shadow-detection and worker test files (unchanged by round 4; run in round 3), and the scratch negative controls (done by the builder).

**Pushed to `origin codex/sandbox/sv-3` after this record (plain push). No pull request opened** (SV-3 carries SV-4's files, so its lane check against main fails until SV-4 merges; the dispatcher opens the PR later). Local head after this record is the commit that adds it.

## Repair round 5 (13 Oct): CI-order build dependency of the isolation test, built by Claude, Codex unavailable

Issued 13 October 2026 at about 01:30 by the JobGuard dispatcher. Base: clean `97e013b`, branch `codex/sandbox/sv-3`, worktree `.worktrees/sv-3`. Built by a Claude Sonnet builder (Codex out of budget); a builder never reviews its own piece, and this record gives no verdict. Orders `SV-3-issued` and repair rounds 1 to 4 stay in force. Tests only: one test file plus this receipt. No product code, migration, package script, workflow, turbo configuration or other test changed. `apps/api/src/auth/context-boundary.test.ts` was not touched.

### The defect (found by GitHub CI, invisible on the Mac)

CI run **38322571867** on `97e013b`, job `checks`, step `pnpm test` (turbo, `@jobguard/api#test`, 23:34:30Z): `src/shadow-isolation.application.test.ts` line 13, `await import(new URL("../dist/app.module.js",import.meta.url).href)`, failed with `Cannot find module '.../apps/api/dist/app.module.js'` (`ERR_MODULE_NOT_FOUND`); 54 of 55 api files passed. CI order is `pnpm typecheck`, `pnpm lint`, `pnpm test`, then `pnpm build`, then Playwright (`.github/workflows/ci.yml` lines 24-32), and turbo's `test` task depends only on `^build` (the packages the app uses, not the app), so a clean checkout has no `apps/api/dist` and no `apps/web/.next` when the test starts. The same file runs the production web server (`next start`, old line 57; `startNext` calls at old lines 109 and 282), which needs `apps/web/.next/BUILD_ID`. On the Mac both folders existed from earlier builds. CI also showed `@jobguard/api#build` finishing at 23:34:11, after `@jobguard/api#test` had started at 23:33:38: the two run side by side.

### Lines changed, before/after (file total +18/-2)

- Old line 4 `import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";` becomes the same with `access` added. Old line 7 `import { spawn, type ChildProcess } from "node:child_process";` becomes the same with `spawnSync` added, and one new line `import { fileURLToPath } from "node:url";` sits above it.
- New lines 13-25 (two comment lines and eleven code lines) go between the `@jobguard/db` import and the unchanged comment and import: `repoRoot`, `BUILD_TIMEOUT_MS` (8 minutes), `BUILD_HOOK_TIMEOUT_MS` (10 minutes), `present(file)` (async `access` check), `buildEnvironment()` (a copy of `process.env` without `NODE_ENV`, `JOBGUARD_ENV`, `DATABASE_URL` and anything starting `VITEST`, so a build sees CI's own build environment and not vitest's `NODE_ENV=test`), and `buildIfAbsent(label, filter, marker)`: if the marker file exists it returns at once; otherwise it runs `pnpm --filter <filter> build` with `spawnSync` from the repository root (output captured, 8 minute timeout) and throws a clear error carrying the exit code, signal and the last 6000 characters of the build output if the build fails or if the marker is still missing afterwards. Line 25 is the one call before the import: `await buildIfAbsent("API","@jobguard/api",new URL("../dist/app.module.js",import.meta.url));`.
- Old line 13 (now line 27), the compiled-module import and the comment above it (the `emitDecoratorMetadata` reason) are byte-identical: the test still imports the compiled module.
- New lines 75-76 (one comment, one hook) before the existing `beforeAll`: `beforeAll(()=>buildIfAbsent("Web production","@jobguard/web",new URL("../../web/.next/BUILD_ID",import.meta.url)),BUILD_HOOK_TIMEOUT_MS);`. It runs once per file, before the database hook. The existing hook, its 60000 ms limit, every `it` timeout (180000) and every assertion are unchanged; nothing is skipped, loosened or re-worded; the named limit on `retrievedAt` and the etag is untouched.

### Proof runs (Mac; `~/.local/bin/heavy-slot`, at most two heavy steps at once; logs in `~/.local/share/full-steam/jg-runs/sv-3-r5/`)

Conditions: `apps/api/dist` and `apps/web/.next` renamed aside (not deleted; later moved to `.../sv-3-r5/aside/`), `@jobguard/core`, `storage`, `config`, `db`, `ai` each rebuilt alone first (`00-package-builds.log`). Command each time: `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/shadow-isolation.application.test.ts`.

| # | Condition | Exit | Result | Log |
|---|---|---|---|---|
| 1 | UNMODIFIED file, both folders absent | 1 | 0 tests; `Error: Cannot find module 'file:///.../apps/api/dist/app.module.js'` at test file line 13:19: the CI failure, for the stated reason | `01-baseline-unmodified-aside.log` |
| 2 | FIXED file, both folders still absent | 0 | 1 file, **15/15** passed, 114.3 s; the test built `apps/api/dist` (app.module.js written 00:42) and `apps/web/.next` (BUILD_ID written 00:43) itself | `02-fixed-aside-folders.log` |
| 3 | FIXED file, build outputs present | 0 | 1 file, **15/15** passed, 36.5 s; no rebuild: `dist/app.module.js` and `.next/BUILD_ID` modification times identical before and after | `03-fixed-outputs-present.log`, `03-mtimes-before.txt`, `03-mtimes-after.txt` |

(The Nest `ERROR [ExceptionsHandler] INVOICE_NOT_FOUND` lines in the logs of runs 2 and 3 are the test's own expected malformed-request replays.)

### What else was checked

- `pnpm typecheck`: exit 0, 7/7 tasks (`04-typecheck.log`).
- `LANE_BASE_REF=origin/main pnpm lint`: exit 0, "Lane boundary passed" (lane sv-3, merge-base `eb1e616`), 7/7 tasks (`05-lint.log`). A first attempt exited 1 only because the renamed aside folders (1346 untracked build files) sat inside the worktree and the lane check counts untracked files; they were moved outside the worktree and the check repeated (`05a-lint-failed-because-aside-folders-were-inside-worktree.log`). That first failure is not a product finding.
- Other packages, looking for CI-only failures hidden behind the stopped turbo run: `@jobguard/web` unit tests (`vitest run --maxWorkers=2`): exit 0, 22 files, 462 tests, the same counts CI printed for web (`06-web-test.log`). `pnpm --filter @jobguard/api openapi:check` (the step CI runs after api vitest and never reached): exit 0 (`07-openapi-check.log`).
- Read from the CI log: `@jobguard/db#test` was running side by side with the api tests and was cancelled by the api failure, so the full db suite has still never run in CI on this head. Two SV-3 db test files import another package's compiled output at run time: `packages/db/test/shadow-isolation-query-log.integration.test.ts:32` (`apps/api/dist/workspace/application.js`) and `packages/db/test/shadow-detection.integration.test.ts:71` (`packages/ai/dist/shadow-proposal.js`). turbo does not make `db#test` wait for the api or ai builds; in CI those builds finish early in the run and the db suite is long, so these probably find the files, but this is unproven and is the first place to look if CI shows a new failure. Not changed here (outside this round's one file).
- Possible overlap noted, not proven harmful: in CI turbo's own `@jobguard/api#build` runs while this test starts; if the test finds `dist` absent it starts its own build, so two builds can write the same files with the same content. The test checks the marker only before building and imports straight after its own build finishes; a read of a file the other build is rewriting at that instant is theoretically possible. In the failing run the turbo build ended 33 seconds after the test began; the test's own build should end later, after turbo's has finished writing.

### NOT RUN

`@jobguard/db#test` and any database package suite (heavy; beyond this round's order), the whole repository test suite, Playwright, `pnpm build`, and GitHub CI itself (it starts again when this commit is pushed).
