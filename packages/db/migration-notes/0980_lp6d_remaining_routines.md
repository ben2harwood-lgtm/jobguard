# LP-6d remaining routines — router-authorized repair 5 on final LP-6c c2ec9e98

## 10 November 2026 — SQLSTATE ruling repair: READY for router commit

This ruling supersedes the repair 6 SQLSTATE stop recorded below. The router
explicitly authorizes 42501 before lookup for an unbound call. Existing r4 work
is preserved. This pass changes tests, this receipt and the task lane only;
production guard order, migration 0980, proof, scanners and source pins remain
unchanged. No new table or production privilege is introduced.

- `site-extra-authority.integration.test.ts`: A14 keeps every unbound tenant
  setting and now requires 42501 / REQUEST_BINDING_REFUSED. Counts prove no
  origin, variation, receipt or raised event is created. A separate genuinely
  bound missing-origin call retains P0002 / NOT_FOUND. The adjacent authority
  decision test also refuses an unbound NULL probe and settings inconsistent
  with the protected binding (including uppercase text); bound NULL/foreign
  membership and missing-job decisions remain exact. Business/identity row
  snapshots prove reads do not write; credential setup precedes the snapshot.
- `fee-illustration-later.integration.test.ts`: unbound real/random-job and
  bare-runtime probes require 42501 / REQUEST_BINDING_REFUSED. Bound probes
  still require FEE_ILLUSTRATION_FORBIDDEN after owner revocation and 22023 for
  the null command. Illustration rows and all command receipts stay unchanged.
- `contractor-parties.integration.test.ts`: raw unbound party binding requires
  42501 / REQUEST_BINDING_REFUSED, with unchanged binding rows and receipts.
  Existing bound audit/permission refusals are retained.
- `work-order-import.integration.test.ts`: the five raw unbound routine probes
  require exact 42501 / REQUEST_BINDING_REFUSED before business validation;
  existing spine/import/receipt/audit counts are unchanged. Bound business
  probes and tenant-isolation assertions are retained.
- `contractor-owner-grant.integration.test.ts`: PH19/PH20 raw unbound probes
  require 42501 / REQUEST_BINDING_REFUSED; genuine bound counterparts retain
  MODE_FORBIDDEN and FORBIDDEN. Grant/receipt/audit counts stay unchanged.
- `contractor-retained-read-boundaries.integration.test.ts`: the unbound feature
  lookup requires 42501 / REQUEST_BINDING_REFUSED. Its bound counterpart still
  returns false; existing complete business/receipt/audit no-write proof stays.

These are source-inspected guard-order repairs, not claimed executed PG
failures. The direct-runtime/guard-manifest search leaves historical migration
suites alone when they never install 0980, and leaves existing exact 42501
checks alone. No exhaustive whole-suite pass is claimed. Reuse of existing
binding, count and row-snapshot helpers avoids a new fixture abstraction.

Checks actually executed with installed dependencies (no download):

- `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — PASS.
- Same tsc command for `apps/api` and `apps/web` — PASS.
- `node tools/agent-lane-boundary-lint.mjs` — PASS, actual local comparison
  e3dc295d..c2ec9e98 plus working/untracked files. HEAD equals the supplied
  c2ec9e98 base; all piece changes remain uncommitted for the router.
- `node tools/lint.mjs` — PASS (11 existing computed-import notices).
- Vitest 4.1.12, `run --root packages/db --maxWorkers=2` naming only
  `test/lp6d-routines.test.ts`, `test/lp6d-repository-context.test.ts`,
  `test/migration-proof-loader.test.ts` — 3 files / 121 tests PASS.
- Vitest `list --root packages/db --maxWorkers=2 --json=<temporary file>` in
  two batches of three edited integration files — 164 tests collected; hooks
  and test bodies NOT executed. This is collection evidence only.
- `git diff --check` — PASS. No Git-writing command was run.

PostgreSQL and browser suites were NOT RUN: this sandbox cannot start PG or
bind localhost. CI must execute all six named integration files, the whole
required PostgreSQL/fresh/upgrade/catalogue suites, affected API/browser paths
and normal required checks. READY is for a router NOPR commit, not a database
PASS, independent RED/security approval, merge or release. Landing catch-up,
renumbering and independent exact-head checks below still apply.

## Historical repair 6 stop (superseded by the ruling above)

Decision: retain production guard order; unbound calls should assert the binding
refusal, with the old business refusal independently proved by a bound caller.

Item 2's explicit stop rule fired before any assertion edit. At
`packages/db/test/site-extra-authority.integration.test.ts:65`, the A14 loop
calls `app.ent3a_require_extra_authority` directly with no request binding and
expects `{ code: "P0002", message: "NOT_FOUND" }` for absent, empty, malformed
and valid tenant settings (lines 63-66). The retained 0980 guard calls
`app.current_actor()` before the business body (lines 3125-3128), which refuses
an unbound request with SQLSTATE 42501. The business body's absent-tenant
refusal remains P0002 (line 3136). Item 2 requires an unbound
REQUEST_BINDING_REFUSED assertion with the **same SQLSTATE**; that cannot be
satisfied here. Changing P0002 to 42501, bypassing the guard, or binding away the
absent/malformed-context attack would exceed that rule. No assertion was
changed, deleted, skipped or loosened; the fee-spec repair remains pending.

The db/API/web test search used the LP-6d routine manifest and inspected direct
SQL callers, fixture binding helpers and 0980 guards. It stopped at this
incompatibility; no exhaustive clean-search claim is made. Other direct-SQL
candidates, including contractor owner-grant and party-binding probes, remain
unresolved. No production file, migration, proof, scanner or pin changed in
repair 6. No simplification was introduced or needed for this assertion repair.

Repair 6 ran source inspection and installed version checks only (Node
v24.17.0, Vitest 4.1.12). The requested typechecks, lint and six unit files were
not rerun after the explicit stop condition. The repair 5 results below are
historical evidence, not repair 6 execution. PostgreSQL and browsers cannot run
in this sandbox; this stop is a source-inspected assertion conflict, not a
claimed PostgreSQL test failure. Once resolved, the first real-PostgreSQL file
for the checker is `packages/db/test/fee-illustration-later.integration.test.ts`,
followed by the A14 spec above and the whole required suite.

### Repair 5 test setup retained

Changed test setup (no assertion weakened):

- `fee-illustration-later.integration.test.ts`: each repository create call now
  receives its existing persisted practice owner's `auth.context`. Contractor
  refusal, identical/changed command replays, concurrent counts, source IDs and
  unchanged financial snapshots retain their exact expected values.
- `recovery-legacy-later.integration.test.ts`: explicitly persist the fictional
  demo owner, account and identity, then use `testBoundTenantContext` to persist
  the real identity session reference. Pass it to select/approve and the existing
  posting path. Exact 15000/16500/1500 fee/allocation assertions are unchanged.
- `job.integration.test.ts`: explicitly persist the fictional owner/account/user
  and obtain its session-bearing context through the existing helper. No test
  order or assertion changes: progress, frozen-money refusals, lifecycle revision
  conflicts and wrong-job foreign-key rejection all remain.

### Checks actually run in repair 5

- Installed `./node_modules/.bin/tsc -p <project>/tsconfig.json --noEmit`, for
  packages/db, apps/api and apps/web: all PASS; no stalled or failing typecheck.
- Installed Vitest 4.1.12, `./packages/db/node_modules/.bin/vitest run --root
  packages/db --maxWorkers=2`, at most three named files per run:
  - test/lp6d-routines.test.ts, test/lp6d-repository-context.test.ts,
    test/migration-proof-loader.test.ts: 3 files / 121 tests PASS.
  - test/lp6c-money-routines.test.ts, test/lp-0-catalog.test.ts,
    test/contractor-session-context.test.ts: 3 files / 55 tests PASS.
- `node tools/lint.mjs`: PASS (including actual lane lint, local default base
  e3dc295d). Explicit working-tree/untracked path comparison against supplied
  c2ec9e98 uses the actual `lanePathAllowed` validator: 27 non-lane paths, no
  missing or extra entries. The CLI's commit range cannot compare HEAD against
  itself; HEAD remains c2ec9e98, not a committed repair.
- `git diff --check`: PASS. These are local source/unit checks, not integration
  execution or independent review. PostgreSQL, browsers, full build and CI were
  NOT RUN. No Git-writing command or download was run.

### Named holds for landing

- Resolve the repair 6 A14 SQLSTATE conflict under item 2, then complete the
  pending fee-spec repair and the remaining same-cause search.
- Whole real PostgreSQL suite and catalogue/fresh/upgrade checks, all repair 4
  named database paths and affected API/browser checks; normal required CI/build.
- Independent exact-head RED review plus the second security look.
- Catch-up onto main (LP-6c is now 0723-0725 there); renumber placeholder 0980
  by filename stem only at landing, together with its existing proof.
- Whichever of LP-6d and real-wayin-linked-practice lands second needs a
  catch-up and re-check.
- Sibling customer-proof/inventory paths need a recheck. LP-6e audit attribution
  remains outside this piece. No grant, new role, new migration or real data.

### Repair 4 source work retained

- Reapply the remaining-routine guards on c2ec9e98, retaining all 390 predecessor
  migrations byte-for-byte. The exact-overload regression verifies every manifest
  body against its newest source on this base; the obsolete main-source snapshot
  is empty. All replacements of existing routines use OR REPLACE. Migration 0980
  is a placeholder for router renumbering. No new tables, so neither empty-table
  list needs an addition. No scanner, source pin or baseline JSON was edited.
- Contractor session resolution carries a genuine session reference in the
  context. Work orders, parties, SoR and contractor administration require that
  context before SQL; they no longer rebuild sessionless contexts. Billing
  resolves its actual session and checks the supplied tenant before binding.
  Recovery/fee application callers supply PracticeAccess.context. JobRepository's
  session-bearing context is exercised through the real withTenant adapter in
  the new unit regression. No context constructor invents a session from a job.
- Keep mon8_feature_decision guarded, including an explicit NULL-actor refusal
  for delegated bindings. All four pre-binding SSO edges (complete, admin,
  required, OIDC create) use the private fixed-feature SSO helper. No runtime,
  identity or login role gets direct helper execution.
- Historical upgrade test setup checks the exact installed bind_request
  signature before current client binding. Older schemas use an explicitly
  unbound test context rather than calling a nonexistent three-argument API.
  The actual base's three-argument binder remains unchanged.
- Fix the derived read_value_job actor comparison to use its actual member_id
  projection on the company branch and membership_id on the legacy branch.
  Preserve original body whitespace when adding derived-actor checks.
- Preserve LP-6c customer delegation: identity.customer_portal_message changes
  only its source call to a private copy with the approved scoped binder, exact
  latest source body and private live-state check. Client approval similarly
  retains the exact 0725 body with a private pre-binding view edge. General
  ports stay guarded and refuse delegated NULL actors. The extra private copies
  are necessary to retain credential-scoped customer authority without opening
  ordinary member accessors or weakening public guards; body/ACL regressions
  cover the split. The approved binders and reader grants are unchanged.
- Recovery-message revoke no longer tries to SELECT the command owner's private
  lifecycle table as migration. A private command-owner assertion checks the
  bound actor/tenant, exact active claim, transaction, resource, action and
  revision, and returns no data. Its only additional EXECUTE grantee is migration.
  Revocation stays in the existing command/audit/outbox transaction. The new
  integration attack now expects AUTHORIZATION_INVALID from a fabricated claim,
  rather than the accidental private-table permission error. Main specs were
  unchanged in repair 4; repair 5 changes only the three fixtures listed above. The proof records the exact added ACL, owners and static calls.


---

Historical receipts copied from the earlier attempt follow; none describes
this worktree's readiness or test execution.

# LP-6d remaining routines — RED, NOPR, held for landing

## 10 November — repair 4 on 4677be1d: READY

This section supersedes repair 3's commit refusal only. Repair 3's source work,
assertion explanations and remaining landing holds are retained below. READY is
for the router's combined pending-merge/repair commit on the held NOPR branch;
it is not PostgreSQL proof, independent review, landing or release approval.

- Fix only extra-proceed.application.test.ts's fixture: use the existing
  verifiedTenantContextFromMembership constructor with contractor_practice and
  that fixture's sessionId. No assertion changed: the two session lookups, exact
  repository member/tenant, entitlement, three INVALID_COMMAND refusals,
  UNAUTHENTICATED replay refusal and called-once check all remain intact.
- API and web direct typechecks both PASS; no other same-cause fixture needed a
  change. Add this test to the lane (49 non-lane paths), keep its sole branch and
  update the note to repair 4. No production, migration or proof change in repair 4.
- Installed runner only, no downloads; all Vitest runs use at most two workers
  and three named files. From repository root:
  `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` and the same command
  with `apps/web/tsconfig.json`: PASS.
- From apps/api: `../../packages/db/node_modules/.bin/vitest run --config
  ../../packages/db/vitest.config.ts --maxWorkers=2` with six groups (logs
  /tmp/lp6d-r4-api-1.log through /tmp/lp6d-r4-api-6.log):
  1. audit-export.application, audit-export.context, extra-proceed.application:
     3 files / 31 tests PASS.
  2. contractor-retained-read.application, contractor.projection,
     offline-risk.application: 3 files / 10 tests PASS.
  3. operative-entitlements.application, operative-offline.application,
     site-extra-evidence.application: 3 files / 22 tests PASS.
  4. site-extra-pricing.application, site-extra-pricing.http,
     site-extra.application: 2 files / 120 tests PASS; pricing HTTP's 17 tests
     blocked by sandbox listen EPERM.
  5. site-extra.http, site-visit.application, site-visit.http: application file /
     59 tests PASS; the two HTTP files' 50 tests blocked by sandbox listen EPERM.
  6. fee-illustration-later, contractor-parties.application,
     work-order.application: 3 files / 49 tests PASS.
  Total: 15 API files / 291 tests PASS; 3 HTTP files / 67 tests could not run
  successfully because localhost binding is forbidden. These are not green
  suites; CI must rerun all three without changing or skipping their assertions.
  An initial root-cwd invocation gave source-path failures; rerunning from the
  API package's required cwd passed those source assertions unchanged.
- From repository root: `./packages/db/node_modules/.bin/vitest run --root
  packages/db --maxWorkers=2` with groups lp6d-routines, lp6d-repository-context,
  migration-proof-loader (106); lp6c-money-routines, lp-0-catalog,
  contractor-session-context (54); recovery-legacy-later,
  recovery-message-repository (39). Use test/*.test.ts except
  src/recovery-legacy-later.test.ts. Eight distinct files / 199 tests PASS.
  Logs: /tmp/lp6d-r4-db-1.log through /tmp/lp6d-r4-db-3.log.
- `LANE_BASE_REF=4677be1d node tools/lint.mjs`: core purity PASS; actual lane
  guard FAILS on inherited/unmerged index paths, including extra-fixtures.ts,
  .env.example and BUILD_PLAN.md. Log: /tmp/lp6d-r4-lane.log. Router must stage
  the six resolved files, complete the pending merge and rerun the actual lane
  check. No lane PASS or subsequent root-lint checks are claimed.
- `git diff --check`: PASS. All six unmerged-index working files have no conflict
  markers. No Git-writing command was run. PostgreSQL and browsers unavailable;
  no database or browser execution is claimed.

Named holds for landing: retain the whole real PostgreSQL suite and every named
check in repair 3 below, ordinary CI/build/browser gates, independent RED review
and second security look, landing after LP-6c, renumbering 0780 by filename stem
only, and sibling customer-proof/inventory call-path rechecks. Repair 3's hold 1
(API TS2345) is closed; pending-index lane checking remains router work.

## 10 November — repair 3 on 4677be1d: do not commit

This section supersedes the earlier repair status and landing-hold lists below.
The launcher merged exactly `4677be1d2eb8979a24b27f695b779bb9859b8ec5` into
`4c6dc1922289f193441ee3ea0d7d15a247e1fb85`. All six expected working-file
conflicts are resolved. The index is deliberately untouched and still unmerged.
No Git write, fetch, commit, push, PR, provider or real-data operation was run.

Implemented within the allowed paths:

- Keep LP-6c's passed work-order transaction helper and contractor test behavior;
  put LP-6d's real session-bearing principals and typed binding refusals on top.
  Reject malformed import tenant IDs before opening a transaction. The new unit
  test proves NOT_FOUND and no pool connection. Quote's competing holder binds a
  persisted testBoundTenantContext credential before app.bind_job_parties.
- Refresh all 16 newly changed predecessor bodies in addition to the six named
  main bodies. Preserve LP6D_BOUND before original initializers and retain the
  explicit CH4/source-writer amendments. Unit checks bind every manifest body to
  its latest exact overload. All 353 predecessor migrations, including 0686,
  0687 and 0970, are byte-identical to 4677be1d. No LP-6c command/accessor body is
  recreated by LP-6d.
- Reinstate the bound mon8_feature_decision for every feature. Add one private,
  migration-owned SSO-only helper with constant feature/purpose and one argument;
  revoke PUBLIC, runtime, identity, infrastructure and direct login execution.
  Recreate the latest identity.sso_complete with exactly its single feature-call
  edge changed. No scanner/pin edit, role or person-facing grant is introduced.
- Correct LP0 owner entries to omit private routines. Extend the existing proof
  to all 125 re-created/new routine identities and their exact static-call/write
  records. Classify additions from main 0581–0685 and LP-6c, including the two
  approved binders. Existing synthetic fixture storage, trigger-only ports and
  credential bootstrap paths have specific reasons rather than an unassigned
  blanket category. signal_outbox/review_invalidated_recovery_evidence are
  trigger-context-only; demo_trial uses the checked owner bridge.
- Repair the own integration harness's environment, migration order and invitation
  role. Runtime-denied private overloads still require explicit permission refusal;
  owner-only calls are outside the runtime guard sweep. The fabricated revoke
  call correctly expects 42501: jobguard_migration cannot SELECT the private
  command_lifecycle_claim table. No grant is added to manufacture a later 23514;
  a separate owner query verifies no authorization write. The valid revoke path
  remains for PostgreSQL CI to prove.
- Retain incoming LP-6c's older fixture fixes, including evidence's bound context.
  D3 now verifies persisted tenant attribution, protected SQL binding refusal,
  and the original revoked-member business query refusal with an explicitly
  unbound fixture. Add SSO helper ACL/identity/runtime/login refusal checks and
  explicit unbound sso/work_orders checks. Add UTF8 to the legacy PostgreSQL seed.

Local evidence (installed tools only, at most two Vitest workers and three named
files per run):

- 8 distinct database unit files / 199 distinct tests PASS. Commands and logs:
  `./packages/db/node_modules/.bin/vitest run --root packages/db --maxWorkers=2`
  with groups `test/lp6d-routines.test.ts test/lp6d-repository-context.test.ts
  test/migration-proof-loader.test.ts` (106), `test/lp6c-money-routines.test.ts
  test/lp-0-catalog.test.ts test/contractor-session-context.test.ts` (54), and
  `test/lp6d-repository-context.test.ts src/recovery-legacy-later.test.ts
  test/recovery-message-repository.test.ts` (56, including the repeated 17).
  Logs: /tmp/lp6d-r3-unit.log, /tmp/lp6d-r3-compat.log,
  /tmp/lp6d-r3-final-db-unit.log.
- Database tsc --noEmit and direct tsc build PASS. AI direct tsc build PASS.
  Workspace turbo build stalled and was interrupted; its cache log is not a build
  completion claim. Direct compilers used installed dependencies, no download.
- SQL CASE-in-IF lint PASS (354 migrations); money arithmetic and commercial
  boundary lint PASS; protected source guard PASS (94 roots, zero diagnostics,
  ten existing baseline cases); git diff --check PASS. 41 changed TypeScript
  files transpile without syntax diagnostics (not integration execution).
- API/web targeted runs initially could not collect without built package
  entries. After db was built, six API files / 39 tests passed; eight API files
  still could not collect without the AI entry, and the web route could not
  collect without the API workspace entry. They are not declared green.
- Actual API tsc then FAILED at the new predecessor test
  apps/api/src/contractor/extra-proceed.application.test.ts:11:97, TS2345:
  resolveSession's mock returns AuthenticatedMembership without its required
  context. This is a real typecheck failure, not a load stall. The file is outside
  this repair's allowed paths; leave it untouched. /tmp/lp6d-r3-api-build.log.
- The lane contains exactly 48 non-lane working-file changes over 4677be1d,
  excluding itself. The real lane guard fails with inherited/index paths while
  the merge remains unmerged; no lane PASS is claimed. Both default and supplied
  LANE_BASE_REF runs are in /tmp/lp6d-r3-lane*.log.

### Named holds for landing

1. **do not commit — API TS2345 outside the allowed paths.** The predecessor's
   extra-proceed.application.test.ts mock must return the session-bearing
   ContractorSessionMembership with a genuine synthetic context. Preserve all
   assertions. The router must issue that exact test-fixture repair before this
   branch is READY. No wider source or permission change is needed or authorized.
2. Router stages the six resolved files and completes the pending merge only
   after the code failure above is repaired; rerun the real lane guard then.
   Keep NOPR and wait for LP-6c to land. Renumber 0780 by filename stem only.
3. CI/checker must run the whole real PostgreSQL database suite against the
   4677be1d baseline and every named suite in the repair brief: enterprise-identity
   (21/21 SSO), contractor-parties, work-order-import, fee-illustration-later,
   recovery-legacy-later, lp-0-grant-freeze (LP0-02), lp-0-authority-paths (LP0-17),
   lp-0-catalog, lp6d-routines unit/integration, lp6d-repository-context, quote,
   quote-reacceptance, lp5-commands, evidence, proof-replay,
   contractor-session-context, contractor-full-demo-package, sor-pricing and
   migration-proof-loader. Prove fresh/upgrade installs, guard-removal mutation,
   every runtime guarded unbound/forged/cross-tenant refusal without writes,
   permitted decided contractor/member flows, revoked/non-member NOT_FOUND,
   SSO private access and continued sign-in, and the valid revoke path. Run all
   affected API/web suites and required typecheck/lint/test/build/browser gates.
   PostgreSQL and localhost/browser execution are unavailable in this sandbox;
   no database or browser PASS is claimed.
4. Keep the independent RED PostgreSQL review and LP-6d's second security look.
   LP-6e audit attribution remains untouched. Sibling lp-6d-customer-proof and
   lp-6d-customer-inventory files are unchanged; their shared source-writer,
   final-check and customer-command call chains must be rechecked with these
   guarded latest bodies and LP-6c's approved delegation binders. No sibling
   acceptance or closure is claimed.

Changed assertions, with equal-strength reasons: LP0 private-owner expectations
now assert absence (the scanner deliberately records only reachable owners), and
its LP-6d entry count is two rather than four; routine identities remain checked.
The old blanket unbound SSO expectation is replaced by bound runtime and exact
single-edge/private-helper assertions. The private-overload sweep retains runtime
42501 and excludes only non-runtime owner execution. Fabricated revocation now
expects earlier 42501 with no-write proof instead of inaccessible 23514. D3 adds
binding refusal and retains FORBIDDEN business authorization. Contractor parties'
unbound call now expects REQUEST_BINDING_REFUSED and separately retains bound
NOT_FOUND for the absent job. Lifecycle checks all 125 exact named LP-6d bodies
and unchanged metadata before predecessor branches; LP-6c and all unrelated
assertions remain. Fixture roles, credentials and holder binding change setup,
not successful outcome criteria. The malformed-tenant and SSO ACL cases add
coverage. No test is deleted, weakened, marked skipped or made optional.

The initial LATER / SIMPLICITY note remains historical below; no new review
simplification is added in this repair.

---
Historical repair receipts follow.

## 6 November — real-PostgreSQL recheck repair round 2 (last): READY

READY for router staging, NOPR commit/push and CI; not database verification,
independent RED acceptance or permission to land. Pending merge is LP-6c
`397a5a53e11fcd5a30121e0ec65762f129e2edbc`. The contractor-party fixture conflict
is resolved in the working file, retaining the session changes from both sides;
the sandbox leaves the Git index unmerged for the router.

Repairs:

- Remove only the `mon8_feature_decision` replacement from the bound set. Its
  unchanged subject-membership feature lookup serves pre-session SSO and retained
  scheduling reads. All other routine guards remain; its request wrappers still
  enforce their actor/tenant checks. Manifest/classification tests name the exception.
- Work-order and contractor-party error mappers hide `RequestBindingRefusedError`
  as NOT_FOUND. Adapter tests assert that result without leaking database details.
- Bind contractor bootstrap immediately after issuing the credential and before
  tenant reads/audit. The shared extras fixture now uses that principal's context.
  Fee illustration binds before revoking the owner to test the owner recheck;
  recovery-legacy uses an issued practice session. Raw routine tests separately
  assert unbound refusal and the original business refusals with bound callers.
  Cross-branch commit probes prepare an audited binding and use separate actor
  transactions, preserving the commit-level defence without rebinding.
- LP0-02 proof names retained timeline ownership and private session ownership;
  LP0-17 records both new routine identities and their exact execution disposition.
  The human catalogue describes the amendment; no scanner or fingerprint is edited.
- Copy main's latest `lp_read`, `lp_command`, `lp_finish` (0620),
  `accounting_export` (0599), and both `mon9_elect` overloads (0614), retaining
  the binding guards. Main inspected: `128260957477d6be9aa88e94789095ac23a175f6`.
  This serial branch lacks those main migrations. Exact source snapshots in
  `test/lp6d-main-predecessors.json` support the body-preservation tests until
  router catch-up; an installed predecessor takes precedence over the snapshot.
  The snapshots do not install tables or pretend the branch is caught up.

Executed locally (installed binaries, no installation, at most two workers):

- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=2 test/lp6d-routines.test.ts test/lp6d-repository-context.test.ts test/migration-proof-loader.test.ts`
  — **104 passed**.
- From `packages/db`: `./node_modules/.bin/vitest run --maxWorkers=2 test/lp6c-money-routines.test.ts test/lp-0-catalog.test.ts src/recovery-legacy-later.test.ts`
  — **54 passed**.
- From repository root: `./packages/db/node_modules/.bin/vitest run --config packages/db/vitest.config.ts --maxWorkers=2 apps/api/src/workspace/fee-illustration-later.test.ts apps/api/src/contractor/contractor-parties.application.test.ts apps/api/src/contractor/work-order.application.test.ts`
  — **49 passed**. Total **207** targeted tests.
- `./packages/db/node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`
  — passed. TypeScript transpilation syntax check of seven changed fixture/test
  files — passed. `git diff --check` — passed.
- `LANE_BASE_REF=origin/codex/sandbox/lp-6c-money-routines node tools/lint.mjs`
  — core purity passed; lane check blocked by 14 inherited LP-6c files still
  present in the pending merge index. Router must stage the resolved merge and
  repeat the actual guard. Lane allow-list is the exact 47 non-lane paths changed
  over LP-6c, including untracked source snapshot, excluding all config/lanes paths.
- The default pnpm wrapper could not verify pinned 10.28.1 via the restricted
  registry. Direct installed runners above completed the checks. No packages
  were installed and the version-verification setting was not changed.

CI after router catch-up/push must prove (at most two workers per run, at most
three named Vitest files per run): enterprise-identity; work-order-import;
contractor-parties; fee-illustration-later; recovery-legacy-later; lp6d-routines;
quote; quote-reacceptance; lp-0-grant-freeze (LP0-02); lp-0-authority-paths
(LP0-17); contractor-full-demo-package; sor-pricing; evidence; proof-replay;
serious-b4-evidence-proof. Also required: full ordinary CI and fresh/upgrade/repeat
PostgreSQL migrations, applicable browser journeys, current-main routine
classification, customer-proof sibling landing and exact-head independent RED
review. PostgreSQL and browser execution are prohibited by this sandbox; none
was attempted or claimed. Earlier customer-proof/source-guard and migration
reservation holds below remain separate router landing work.

## 6 November — security precheck repair round 1: READY

Repair of the single blocking finding against `cdd4e3282`, on LP-6c base
`531e7d633`. READY means source repair ready for the router's NOPR save and CI;
it is not PostgreSQL execution, an independent review PASS or landing approval.

- Contractor session resolution now carries its genuine session-bearing context
  with the resolved membership. Work-order, SoR, contractor-party and contractor
  administration repositories consume that context instead of minting a bare
  membership context. Generated work-order/Northside callers retain that type.
  This reuses the existing membership/session constructor and `withTenant`; no
  new binding mode, fallback, opt-out or runtime grant is introduced.
- Recovery and fee-illustration methods require the caller's context. Their API
  applications pass `practice.context`; reads use its tenant rather than the
  module-level demo identity. Existing command, approval and money checks stay.
- Update affected adapter-double types and fictional member fixtures to carry
  the tested member's own credential. Keep all refusal assertions. Add 13 adapter
  regressions across all six paths: bind before business SQL, fail before business
  SQL on refused binding, and keep credentials out of principal JSON.
- No SQL body, manifest or migration proof was changed in this repair; therefore
  no routine was re-created from an older main body. Main-body catch-up,
  classification of later routines and renumbering remain the router's later
  link-by-link chain work. Existing refusal suites and all named holds remain.
  The old pending-index hold below is historical: the supplied starting branch
  was clean at `cdd4e3282`; this sandbox performs no Git-writing operation.

Executed locally using installed runners, at most two workers:

- `packages/db/node_modules/.bin/vitest run --root packages/db --maxWorkers=2 test/lp6d-repository-context.test.ts test/lp6d-routines.test.ts src/recovery-legacy-later.test.ts`
  — **40 passed**, three files.
- `packages/db/node_modules/.bin/vitest run --config packages/db/vitest.config.ts --maxWorkers=2 apps/api/src/contractor/contractor.projection.test.ts apps/api/src/contractor/work-order.application.test.ts apps/api/src/workspace/fee-illustration-later.test.ts`
  — **49 passed**, three files.
- Installed `node_modules/.bin/tsc -p <package>/tsconfig.json --noEmit`
  for `packages/db`, `apps/api` and `apps/web` — **passed** (also each affected
  package's lint script).
- `LANE_BASE_REF=531e7d633 node tools/lint.mjs` — **passed** after selecting
  this serial link's actual branch base; default origin/main includes predecessor
  work and is not this link's lane range. `git diff --check` — **passed**.
- The default pnpm launcher could not verify/start pinned pnpm 10.28.1 through
  the restricted registry. No install was performed; the installed TypeScript
  and Vitest entry points above ran the real checks directly.

CI must prove the full required suites, especially real-PostgreSQL
`fee-illustration-later.integration.test.ts`,
`contractor-full-demo-package.integration.test.ts`,
`contractor-parties.integration.test.ts`, `contractor.integration.test.ts`,
`work-order-import.integration.test.ts`, `work-order-concurrency.integration.test.ts`,
`sor-pricing.integration.test.ts`, `recovery-legacy-later.integration.test.ts`,
and `lp6d-routines.integration.test.ts`; fresh/upgrade/repeat migrations,
LP-0 catalogue/ACL/RLS/proof validation, and the two phone/desktop demos.
No PostgreSQL or browser was started here. The inherited demo-bootstrap,
customer-message and source-pin holds are not repaired or waived by this round.
An exact-head independent RED check and green CI remain required before landing.


4 November chain update onto supplied LP-6c `531e7d6339e483add1989d47765140c700ec716e`
(the pending MERGE_HEAD). READY for the router's held NOPR branch save. This is
source-built work, not database execution, independent review or landing approval.
No Git-writing command, fetch, PostgreSQL or browser service was run here.

## Changes and closed predecessor assumptions

- Keep reserved migration **0780** and its additive proof. It avoids the existing
  0526 commercial-integrity migration. Do not restore its historical number.
- Retain LP-6c's 28 actual replacements byte-for-byte and reuse its five owner-only
  binding/accessor grants. LP-6d does not recreate any of those exact signatures;
  the local regression checks disjointness. `final_lock_require_owner`, command
  begin/effect/completion, and LP-3's old/new money ports remain LP-6c's copies.
- Start the session helper from LP-6b's latest **0584** body, preserving the base
  owner's active/revocation checks while switched. Change only its contractor
  projection edge to the existing private LP-6d projection, avoiding recursive
  binding. The proof chains the exact 0584 record to that new call edge.
- The routine manifest now records **117** exact predecessor overloads. Add early
  checks before their original initializers, business locks, mutations or replays.
  Preserve CH4's 0380 resume/admission and 0539/0547 source-writer amendments,
  0548/0549 entitlement/operative/invitation rules, signatures and search paths.
- Close the old broad sibling-coverage assumption for the remaining draft,
  historical landing, credit/receipt, fee-source, supplier-credit, success-fee,
  value and Final Check helper ports that LP-6c did not replace. Derived practice
  principals are compared with the protected actor before their source reads.
  Other meter/mandate/contractor paths reuse the bound `mon1_company_actor`,
  contractor session or Final Check chokepoints; classification is not execution
  evidence. The lifecycle invoker helper is preserved, using LP-6c's existing
  bridge rather than inventing accessor grants for the meter role.
- `mon9_session` is now present: guard it and both election overloads. The older
  election remains private. A supplied real credential must agree with the
  established binding, in addition to its existing owner/session checks.
- Cover the newly inherited supervisor query, work-status, proceed-comparison,
  WORM submit, billability snapshot/command, money-trail and reconciliation ports.
  WORM's payload actor and billability's derived actor must match the binding.
  The SQL work-status reader retains its query and STABLE contract inside a
  guarded PL/pgSQL body. No new commercial permission is introduced.
- Entitlement's subject member remains separate from request identity: the base
  owner may be the subject of a switched session's company-entitlement check.
  Both entitlement and site-authority subject checks require a protected request;
  business entry points still check their own exact actor and decided permission.
- Preserve the checked recovery-message authorization revocation routine/caller;
  direct runtime UPDATE on `action_authorization.revoked_at` stays withdrawn.
  `apply_recovery_timeline_signal(uuid,jsonb)` stays unavailable to runtime pending
  LP-10 worker authority. Unconditional disabled historical ports remain disabled.
- Resolve the entitlement upgrade test conflict, retaining incoming LP-6c/current
  main assertions and its exact dispatcher exception, then add exact expectations
  for all **123** LP-6d definitions. No catalogue/body guard was weakened.
- The lane contains exactly the nine non-lane file-content changes from the supplied
  predecessor. Inherited LP-6b/c files are preserved, not added to LP-6d's lane.

## Actual local verification

Installed dependencies only; no downloads. Every Vitest run used one worker and
at most three named files. At most two local commands overlapped.

- From repository root: `./packages/db/node_modules/.bin/vitest run --root packages/db --maxWorkers=1 test/lp6d-routines.test.ts test/lp6c-money-routines.test.ts test/migration-proof-loader.test.ts`:
  **3 files / 91 tests PASS**. This includes exact latest-overload preservation,
  the LP-6b helper's exact single-edge change, source/actor checks, disjointness
  from LP-6c, classification and strict proof loading.
- Same installed runner/options: `test/recovery-message-repository.test.ts`,
  `test/lp6b-withtenant.test.ts`, `test/contractor-session-context.test.ts`:
  **3 files / 55 tests PASS** (service doubles, not PostgreSQL proof).
- `./packages/db/node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`: PASS.
- Installed TypeScript transpilation of both affected integration tests: PASS
  (syntax only, not execution or typechecking of database test behavior).
- Exact definition/signature order comparison for the upgrade test: **123 PASS**.
- `node tools/plpgsql-case-in-if-lint.mjs`: PASS, 248 migrations checked.
- `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs`
  and `git diff --check`: PASS.
- Read-only endpoint comparison against MERGE_HEAD: the lane's nine paths match.
- Real lane guard with the predecessor base: **FAIL**, because its Git-based view
  still includes the pending merge/index and inherited paths; output is at
  `/tmp/lp6d-chain-lane-check.log`. No substitute lane PASS is claimed.
- `node tools/commercial-integrity-current-source-guard.mjs`: **FAIL**, inherited
  `practice-session.ts` unresolved-case fingerprint mismatch, detailed below.

## Named holds for landing

1. **Customer-message credential design (router ruling):** 0547's
   `identity.customer_portal_message` calls `app.sv7a_intake_job_source` using a
   customer credential and grant sponsor. Member binding and LP-6c's command
   boundary do not establish that customer principal. Keep the writer held;
   design its separate customer sign-in proof after LP-6b lands. No sponsor
   impersonation, new binding kind, caller-setting bypass or weakened guard here.
2. **Protected source-guard follow-through, inherited from LP-6b:**
   `tools/commercial-integrity-current-source-guard.unresolved.json` records
   `packages/db/src/practice-session.ts:73`, `UNRESOLVED_COVERED_EDGE`, old
   fingerprint `ad3ac47cb73083599ccbd5fd355eb9f2f313b9af4ceca2115da91270658d50ca`,
   reason `Generic local query helper receives runtime sql/values parameters; callers are not specialized by runtime data flow.`
   Current output is line **75**, dependency `unknown query text/structure`, new
   fingerprint `a52add41726877212b3d0441a7351647222c7aa760b4e2be0f07d3ea2fd00c04`.
   The tool reports ten covered-edge diagnostics plus the one stale baseline.
   Both the source and guard file exactly match MERGE_HEAD. Their authorized
   owner must resolve the edge or review the exact old/new expectation change;
   LP-6d does not edit the scanner, source pin or guard.
3. **Router Git completion and actual lane check:** conflict markers are resolved
   in the working file, but the entitlement test remains unmerged in the read-only
   index. Router stages resolutions, completes the pending predecessor merge,
   saves this NOPR branch and reruns the actual lane guard. No Git completion,
   predecessor landing or lane PASS is inferred from matching working files.
4. **CI and exact-head independent security checks:** run the full real PostgreSQL
   suite, fresh/upgrade/repeat migrations, LP-0 catalogue/grants/owners/RLS, proof
   ACLs, exact source preservation, all old/new/private overload attacks and
   permitted contractor/member flows. New integration cases cover forged actor,
   wrong tenant/GUC, unbound/private signatures, substituted credentials, base-owner
   revocation while switched, WORM payload actors, operative command replay,
   supervisor reads/refusals, invitations, sync identity and revocation. Also run
   normal required typecheck/lint/test/build and applicable browser suites.
   LP-6e still owns trusted audit attribution; LP-10 owns separate worker authority.
   Customer-message compatibility needs hold 1's proof before landing.
5. **Migration reservation:** retain 0780 with its exact proof; router reconfirms
   its free landing position and predecessor order before opening the LP PR.

The absence-only predecessor, stale migration-path, missing MON-9 and broad
sibling-ownership holds are closed by this update. Database behavior and
independent security review remain unproved here; the branch stays held NOPR.

LATER / SIMPLICITY (initial source review): repeated routine bodies could eventually
use exact-signature, asserted guard insertion with source/configuration preservation
proofs. That would reduce maintenance drift; it is future work, never a gate bypass.
This catch-up retains the established explicit-copy pattern and adds exact latest-
body regression coverage rather than introducing another runtime abstraction.

Forward-fix only. No policy, approval, history, table fingerprint or function SET
app.* contract is relaxed. No live provider, real data, money, release or main push.
