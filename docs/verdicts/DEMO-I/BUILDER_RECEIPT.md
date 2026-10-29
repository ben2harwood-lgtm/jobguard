# DEMO-S / DEMO-I builder receipt — RED lifecycle groundwork

28 October 2026. Builder: Codex in `codex/sandbox/demo-i`. Builder/source inspection and local test execution only; no independent review, database execution, browser acceptance, commit, push or merge is claimed.

## Scope and behavior

The issued order supersedes the old preparation-only storage hold for bounded synthetic lifecycle groundwork. Current working tree began clean after the router's main catch-up; no conflict markers or unresolved merge entries required repair. Read repository AGENTS, DEMO-S in BUILD_PLAN §10.4, the supplied SIMPLE_LOOP and on-disk SIMPLICITY_RULE, existing P1/P2 contracts, company/practice authority and callers/tests before implementation.

Implemented an additive 0313 migration, shared strict command schemas, repository and application composition class. Five chosen-scenario run attempts can be saved, resumed and reset; immutable lifecycle report snapshots can be written and read. Every scenario currently records a plain refusal, as executable J1–J5 bindings are not installed. Core correction; recovery execution/collection/refund; Final Check execution/attribution; meter profile execution/clock; trial execution/identity/clock still refuse. No domain journey or end figures are faked.

The existing MON-2A company authority is reused instead of treating a practice cookie as company permission. SQL checks persisted synthetic session and active membership on every call, before replay and after lock waits. Follow-up: runs and receipts bind the creator membership returned by `mon1_company_actor` within the company. A fresh valid sign-in for that same user/company resumes saved runs, immutable reports and exact command results. Another member or company cannot adopt the run. Session digests remain request credentials and are no longer stored in lifecycle tables. Database name is independently restricted to the synthetic database. Three new tables have tenant-qualified FKs and FORCE RLS; runtime has no direct table permissions. One metadata-only routine exposes five closed operations.

Reset archives metadata, retains all history and makes one successor. Reports are immutable lifecycle facts only; no source results, hidden data, money, external-action count or success claim. Metadata commands are idempotent with payload conflicts; mutation audit contains references/hashes and allocates its head last. No network actions, business jobs, company bootstrap, trial keys, subscription terms or financial records are changed. No chooser, transports or J1–J5 implementation is included. The application class is explicit backend composition groundwork, not a registered HTTP/browser feature.

## Actual validation

- Installed Node v24.17.0, TypeScript 5.8.3, Vitest 4.1.12; explicit repository working directories, existing installed binaries, maxWorkers=1, one named Vitest file per invocation.
- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` — passed, including the added application tests.
- Rebuilt existing core/config/db dist with their installed TypeScript compiler to resolve stale local build exports; no package download or tracked dependency change. Initial API collection errors came from stale activation/config exports; final actual runner passed.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=1 src/small-builder-demo-repository.test.ts` — 17 passed. Real repository boundary/transaction/rollback tests using fake pg; not PostgreSQL evidence.
- From apps/api: `./node_modules/.bin/vitest run --maxWorkers=1 src/small-builder-demo.application.test.ts` — 106 passed: existing strict-boundary cases plus actual application current-session/membership/production refusal tests.
- `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` — passed; purity reports its existing computed-import notices.
- Exact lane allowlist comparison against all 13 changed/untracked files — passed (12 functional/receipt paths plus the lane file).
- Supplemental no-emit compilation of the two CI integration files reached an existing imported fixture error at `packages/db/test/job-work-state-fixtures.ts:45` (`proofEvidenceTypeSchema.options[0]` is `string | undefined` under strict indexing); no diagnostic points to the new files. This supplemental check is not claimed passed and the unrelated fixture is unchanged.
- `git diff --check` — passed. Read-only git only; no commit/index/branch writes.
- The pnpm version launcher attempted registry verification and refused due to unavailable registry; used already installed repository compiler/test binaries, without downloading packages or changing launcher policy.

CI must run `test/small-builder-demo.integration.test.ts` and `test/small-builder-demo-upgrade.integration.test.ts` with maxWorkers=1. They cover fresh install, populated own-step upgrade and repeated runner; all-five persisted refusals; reload; replay and changed payload; same/different concurrent resets; stale/archive boundaries; immutable snapshots and exact run/snapshot binding; another company, another user in the same company and fresh valid sessions for the owner; session revocation including lock wait; raw SQL injection/privilege/RLS/pooled-context boundaries; unchanged job, trial-key, meter, subscription and journal history; and one audit event per original metadata command. They are written but NOT RUN locally: issued sandbox cannot start PostgreSQL or bind localhost. Browser suites are likewise left to CI; no browser behavior changes in this groundwork. Required complete CI and independent Claude RED review remain before merge.

## Initial source review

Found and fixed a trigger error before handoff: report/receipt immutability must branch before accessing run-only OLD/NEW fields. Guards now reject non-run updates immediately. No weakened tests or unrelated refactoring.

LATER / SIMPLICITY — `packages/db/migrations/0313_small_builder_demo_runs.sql`, `small_builder_demo_audit`: it follows the existing MON-2 SQL audit pattern. A future shared SQL audit-append helper could replace the duplicated canonical/hash assembly in MON-2 and DEMO-I, reducing future audit-format drift. That cross-piece refactor is outside this task and does not block.

## Handoff

Router commits/pushes/opens PR and updates finish/work lists outside this sandbox. Lane file lists exactly this piece's changed paths (its own metadata file is implicitly permitted). Migration discovery needs no manual edit. No secret, operational alert, provider or release configuration added. Existing interfaces are preserved through the API contracts re-export; added interfaces are versioned. No data backfill; forward-fix only, no destructive rollback. This remains RED for tenant/session isolation and hidden-data boundaries; product/journey acceptance is not asserted.

## Resume/reset follow-up — 28 October 2026

Issued follow-up to DEMO-I for DEMO-S finish-list row 21; RED (tenant isolation). Edited unmerged migration 0313 in place. Removed session-digest columns from run and receipt metadata and session comparisons from run, successor and replay lookup. Company-qualified owner membership is the authoritative identity. Every call still revalidates the current synthetic session and membership before replay and after the company lock. Reset still archives; no deletes, domain writes or changes to the synthetic database guard.

Added a locally executed application regression for re-authentication and fresh digest forwarding for the same membership. Added CI PostgreSQL cases for two fresh sign-ins with prior sessions revoked, create/snapshot/reset replay without duplicate runs/receipts/reports/audit events, unchanged historical snapshots, current archived state versus original replay results, successor resume, stale/archive rejection, expired/revoked session denial, another owner in the same company, foreign-company command scoping and the owning user with valid membership in another company. Extended the existing company fixture with an optional tenant ID to reuse its existing identity/session setup for the same-company adversary.

Follow-up checks actually run using installed binaries (no downloads):

- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` — passed.
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=1 src/small-builder-demo-repository.test.ts` — 17 passed.
- From `apps/api`: `./node_modules/.bin/vitest run --maxWorkers=1 src/small-builder-demo.application.test.ts` — 107 passed, including the new fresh-sign-in boundary regression.
- From `packages/db`: `./node_modules/.bin/vitest list --maxWorkers=1 test/small-builder-demo.integration.test.ts test/small-builder-demo-upgrade.integration.test.ts` — collected all 14 cases, including the new adversaries; collection only, no PostgreSQL execution. An initial invocation from the repository root found no root Vitest binary; reran from the established database package directory.
- `git diff --check` — passed. Existing lane-policy loader and `lanePathAllowed` checked all eight follow-up paths successfully. The lane retains original DEMO-I PR paths and adds only the reused company fixture path; its own file is implicitly allowed by repository policy.

The updated PostgreSQL adversaries and existing upgrade/browser suites require GitHub CI; no database/browser execution is claimed. The earlier RED review at 418e6115 does not cover this follow-up; the router must arrange the new exact-head RED review. No git writes performed; router owns commit, push, PR and work-list updates.

## PR #387 repair round 1 — migration syntax

The current-main merge arrived clean: no unresolved conflict entries or shared expectation-list conflicts. Re-read SIMPLE_LOOP, SIMPLICITY_RULE, repository instructions, DEMO-S plan scope, migration 0313, runner and affected tests.

CI error position 6288 lands at the end of `WHEN 'snapshot'`, immediately before the CASE expression's `THEN` in the contract-version IF. The unparenthesized SQL CASE lets PL/pgSQL terminate its IF expression at that inner THEN, producing an incomplete SQL expression. Parenthesized that CASE expression; this is a one-line syntax repair with no ownership, replay, archival or synthetic-guard behavior change. The dollar delimiters and transaction were already complete.

The migration runner reads the full file and submits one atomic query; it does not split statements or dollar-quoted bodies. Its only 0313 rewrite inserts migration bookkeeping before the terminal COMMIT. Added a runner regression to the existing repository unit suite proving the submitted batch equals the entire on-disk 0313 with precisely that bookkeeping insertion, including the routine's end. The existing lane already covers every repair path.

Actual local checks, using installed binaries and no downloads:

- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=1 src/small-builder-demo-repository.test.ts src/migrate-discovery.test.ts` — 21 tests passed across two files, including the new complete-batch regression.
- Static check of the entire SQL: five complete dollar-quoted bodies; balanced SQL quotes and parentheses inside/outside each body; body ENDs, closing statement semicolons, BEGIN/COMMIT and parenthesized CASE confirmed. This is structural validation, not a PostgreSQL parser execution.
- From `packages/db`: `./node_modules/.bin/vitest list --maxWorkers=1 test/small-builder-demo.integration.test.ts test/small-builder-demo-upgrade.integration.test.ts` — 14 cases collected, not executed. Existing tests exercise fresh migration, populated upgrade, repeated runner, all operations and ownership adversaries in CI.
- `git diff --check` and existing lane-path validation — passed.

The sandbox cannot start PostgreSQL, so actual PostgreSQL compilation and database assertions still require GitHub CI. No database success or new independent review is claimed. No git writes; router commits and pushes the repair. RED classification remains unchanged.

## PR #387 repair round 2 — successor catalogue expectations

Current-main merge arrived clean (`git status --short` and `git ls-files -u` had no unresolved entries). Read current SIMPLE_LOOP/SIMPLICITY_RULE, repository instructions, DEMO-S scope, 0313 and the failing catalogue consumers.

Cause: migration 0313 installs three private lifecycle tables and three routines, but shared successor expectations did not enumerate them. Updated contractor-entitlement's exact expected row map with the three empty tables. Added a bounded SERIOUS-B5 successor extension for precisely the three tables, four indexes, three tenant_scope policies and three routine signatures. The extension explicitly verifies migration ownership, FORCE RLS, no non-owner table grants, fixed search_path, the sole runtime-executable definer, and owner-only audit/guard helpers; all predecessor rows/catalogue values remain compared.

LP-0 now records exactly two new capability facts: runtime EXECUTE on `small_builder_demo(uuid,text,text,uuid,jsonb)` and that reachable routine's migration owner. Private tables and helpers contribute no executable/read capabilities and are not allowlisted. Added the source-referenced lifecycle authority disposition/path and three routine protection records, labelled source inspection with actual PostgreSQL CI/RED review still required. Preserved every existing inventory row and its compact formatting; no baseline was regenerated and no SQL or grants changed. The new local catalogue regression rejects runtime SELECT on each private table and runtime/PUBLIC/infrastructure EXECUTE on either helper.

The DEMO-I lane now lists exactly its 22 current branch payload paths, including inherited DEMO-P2 payloads and the shared expectation repairs. It excludes every config/lanes path and the lane register, as required. No other lane file was edited.

Actual checks:

- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=1 test/lp-0-catalog.test.ts src/small-builder-demo-repository.test.ts` — 45 passed across two files. Repeated after preserving inventory formatting/order; final run passed.
- From `packages/db`: Vitest `list --maxWorkers=1` collected contractor-entitlement upgrade, SERIOUS-B5 upgrade and LP-0 grant-freeze (three named files); a separate list collected LP-0 authority paths, DEMO-I lifecycle and DEMO-I upgrade (three named files). Collection only, no PostgreSQL hooks or database assertions executed.
- Explicit inventory union check — every predecessor group, capability, authority path and routine record retained; exactly one group/path, two capability facts and three routine records added; base, targets, held records and prior protection data unchanged.
- Exact branch payload/lane comparison — passed; no lane-metadata grants.
- `git diff --check` — passed.

Remaining concrete blocker: `node tools/agent-lane-boundary-lint.mjs --lane=demo-i` fails solely on inherited `config/lanes/demo-p2.json`, which is already present in HEAD but absent from origin/main. This piece cannot authorize another lane file, and adding it to allow is explicitly prohibited; no files were deleted and no checker weakened. The router must reconcile that inherited dependency with the PR base (for example, land DEMO-P2 and merge the resulting main) before committing this as ready. Commit-message file is marked `do not commit` for that reason. The database suites still require CI because this sandbox cannot start PostgreSQL. No git writes or independent-review claims.

## PR #387 repair round 2 continued — inherited lane consolidation

The issued continuation explicitly authorizes archiving the inherited DEMO-P2 registration and consolidating this branch's payload under DEMO-I. This resolves the previous subsection's lane blocker and supersedes its not-ready handoff. No unresolved merge entries were present.

Moved `config/lanes/demo-p2.json` to `archive/2026-10-28/demo-i-inherited-lanes/demo-p2.json` with identical bytes, checked against its HEAD contents. Its registration is no longer active; its contents and git history are preserved. Updated `config/lanes/demo-i.json` to enumerate exactly the 23 payload paths differing from main, including inherited DEMO-P2 sources/contracts/fixtures/receipt, the archive and the existing LP-0/entitlement/SERIOUS-B5 repairs. The only active lane-metadata path in the prospective PR is DEMO-I's own registration, implicitly allowed by the existing checker. No config/lanes or lane-register grants, checker changes, SQL/grant changes or extra product changes.

Relevant actual validation:

- The existing lane-policy loader and selector loaded the final working-tree policy; the existing `lanePathAllowed` checked every path in `git diff --no-renames --name-only -z origin/main --` plus untracked files. Prospective PR boundary passed: 24 total paths, 23 payload paths. Exact equality with the lane allowlist passed.
- The existing `migrationOrderViolations` checked the main migration tree and the prospective added migration paths — passed.
- Byte comparison of the archive against `git show HEAD:config/lanes/demo-p2.json` — passed; the original active path and DEMO-P2 active policy are absent.
- `git diff --check` — passed. No git writes performed.

The stock local CLI compares main to HEAD and then unions uncommitted paths, so it still sees the old HEAD's inherited registration until the router commits the move. Validation above checks the actual prospective PR diff against main using the unchanged checker predicates, rather than claiming that pre-commit HEAD is already repaired. GitHub CI must run the full lane check on the committed head. Prior round-2 typecheck and 45 passing local tests remain applicable: catalogue/test code is unchanged by this continuation; PostgreSQL execution still belongs to CI. Ready commit message written to the newly issued path; the router commits/pushes and updates finish/work lists. RED review/merge gates remain unchanged.

## PR #387 repair round 3-last — policy roles and tenancy catalogue

The incoming main merge left two conflict blocks in LP-0's shared JSON. Resolved both in the working file by unioning DEMO-I entries/routine records with M4-9-S success-fee entries/routine records. Retained main's additive recovery-money authority-path description and source/test references. Verified every entry/group/routine record from both index stages remains; the older recovery-money description is preserved as the prefix of main's extended description. JSON parses with no duplicate keys/identities or conflict markers. The index still lists the file as unmerged because .git writes are prohibited; the router must stage the resolved file normally when completing the merge. All other incoming-main staged files were preserved.

SERIOUS-B5 cause: `pg_policies.roles` is PostgreSQL `name[]`. The installed pg parser returns that type as a string, whereas the expected row contains a JavaScript array. Reused the existing nearby SQL cast pattern `SELECT $1::name[]::text[] roles` before the exact comparison. The expected roles remain exactly migration-only for all three policies; no grants, policies, migration or application behavior changed.

Tenancy cause: the two exact catalogue arrays omitted 0313's `small_builder_demo_receipt`, `small_builder_demo_report` and `small_builder_demo_run`. Added those three rows in server name order to both the RLS/check-policy and ownership expectations. Each requires enabled and forced RLS, an ALL policy with USING/WITH CHECK, and `jobguard_migration` ownership. No wildcard, exclusion, skip or dynamic expected baseline was introduced. DEMO-I's lane adds only the tenancy test path and matches the current prospective payload against main.

Actual validation with installed tools, no downloads:

- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=1 test/lp-0-catalog.test.ts src/small-builder-demo-repository.test.ts` — 45 tests passed across two named files, including committed LP-0 inventory validation and forbidden-grant controls.
- Installed pg parser probe confirmed OID 1003 (name[]) returns `"{jobguard_migration}"` and OID 1009 (text[]) returns `["jobguard_migration"]`. Initial direct CommonJS named import failed; the corrected default import probe passed.
- From `packages/db`: `./node_modules/.bin/vitest list --maxWorkers=1 test/serious-b5-upgrade.integration.test.ts test/tenancy.integration.test.ts test/small-builder-demo.integration.test.ts` — collected all cases, including all three reported failures. Collection only, no PostgreSQL execution.
- Static exact-row checks verified both tenancy arrays contain 312 unique, sorted table names with precisely 0313's required three DEMO-I postures.
- Both-stage LP-0 union check passed, allowing only main's additive recovery-money description/source/test extension; JSON is valid and marker-free.
- Existing lane-policy predicates and migration-order validator passed against the prospective diff from origin/main: exactly 24 payload paths, no config/lanes or register grants.
- `git diff --check` — passed.

Database suites still run in GitHub CI because this sandbox cannot start PostgreSQL. No live database success, new review, git write, commit or push is claimed. Ready commit message written to the issued /tmp path; router stages the resolved merge file, completes the merge as needed, commits/pushes and updates work-list state. RED review and CI gates remain unchanged.


## PR #387 catch-up after SV-7A intake (#354)

Catch-up only for DEMO-I / DEMO-S (RED). Incoming main includes SV-7A migration 0303. Resolved the single SERIOUS-B5 conflict by retaining both `sourceIntakeAdditions` and `demoRunAdditions`, in migration order. No behavior, SQL, grants or expected predecessor records changed. The index still records the conflict until the router stages the resolved working file; no git writes were performed.

Verified every expectation line from both HEAD and origin/main remains in LP-0 privileges, SERIOUS-B5, contractor entitlement and tenancy. LP-0 groups, entries, authority paths and routine protection records preserve the exact records from both sides with unique identities. The existing DEMO-I lane registration matches exactly all 24 payload paths in the prospective PR, plus its own implicitly allowed lane path (25 paths total); no extra lane grant is needed.

Actual local checks using installed tools, no downloads:

- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=1 test/lp-0-catalog.test.ts src/small-builder-demo-repository.test.ts src/migrate-discovery.test.ts` — 48 tests passed across three named files.
- From `packages/db`: `./node_modules/.bin/vitest list --maxWorkers=1 test/serious-b5-upgrade.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts test/tenancy.integration.test.ts` — 18 tests collected; collection only, no database execution.
- Both-side expectation retention, exact LP-0 union, exact lane allowlist, and conflict-marker scan — passed.
- All tracked SQL bytes match their source side: incoming 0303 matches origin/main; all other SQL matches HEAD. Migration 0313 remains unchanged, SHA-256 `53c3ce08833a3804ea3f00442047193d9c15b7ad6fd99921bdfd939a494d7601`. The initial all-HEAD comparison encountered incoming 0303, which exists only on main; the corrected source-side comparison passed.
- `git diff --check` — passed.

Database and browser suites remain for GitHub CI under the issued sandbox limits. No new independent review is claimed; the brief reports the pre-catch-up head as RED-passed. Router stages the resolved conflict, commits and pushes, and updates the work-list state. No provider, release or real-data action.


## PR #387 catch-up after CH-8 part 2 (#389)

Catch-up only for DEMO-I / DEMO-S (RED), based on the brief's RED-passed head `4bd9118d`. Resolved three working-file conflicts by retaining both sides: LP-0 groups, entries, authority paths and routine records; contractor-entitlement expected tables; SERIOUS-B5 successor additions. SERIOUS-B5 applies 0306 evidence-pack additions before 0313 demo additions. No new behavior, grants, SQL or weakened expectations. The existing DEMO-I lane retains exactly the 24 PR payload paths plus its implicitly allowed own lane file; its note records this catch-up.

Actual local validation:

- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed after the final conflict resolution.
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=1 test/lp-0-catalog.test.ts src/small-builder-demo-repository.test.ts` — 45 tests passed in two files.
- From `packages/db`: `./node_modules/.bin/vitest list --maxWorkers=1 test/serious-b5-upgrade.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts test/tenancy.integration.test.ts` — 18 tests collected, not database-executed.
- Exact both-side record retention and unique identities checked for the LP-0 union. Every line from each source side remains in the entitlement, SERIOUS-B5 and tenancy tests. Shadow privilege expectations are byte-identical to current main. Exact lane coverage and conflict-marker scan passed.
- All migration SQL bytes match their source side: incoming 0306 matches main, every other migration matches HEAD. Migration 0313 is byte-identical to `4bd9118d`, SHA-256 `53c3ce08833a3804ea3f00442047193d9c15b7ad6fd99921bdfd939a494d7601`.
- `git diff --check` — passed.

The initial Vitest attempt used a nonexistent root binary; the package-local installed runner above passed. An initial edit used package-relative paths from the package directory and made no changes; rerun from the explicit repository root succeeded. A blanket old-line-retention assertion encountered main's deliberate replacement of the shadow routine allowlist; the correct check confirmed that entire file matches main exactly.

No git writes performed. The index still marks three paths unmerged until the router stages these resolved working files and completes the merge. PostgreSQL and browser execution remain for GitHub CI after router push; no new independent review, commit, push, merge or release is claimed. This repeat catch-up adds no initial-review simplification finding.
