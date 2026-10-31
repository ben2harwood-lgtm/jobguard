# MON-8-P-B builder receipt — issued sub-order A only

18 October 2026. Builder: Codex (requested gpt-6-astra); RED access/database authorization lane. Working-tree delivery only, no commit, push, PR, merge or release. This is builder evidence, not an independent verdict or acceptance.

## Binding and scope

Started clean at `79b69614612453641b6e4e23496396b40e70b3a5`, branch `codex/sandbox/mon-8-p-b`, explicitly cut from unmerged MON-8-P-A / PR #293. Parent implementation `33078567` and current parent interfaces were source-inspected. The dispatcher's explicit BUILD-AHEAD exception permits construction; it does not establish parent acceptance or merge. Parent interfaces were not edited.

Read AGENTS.md, BUILD_PLAN.md preservation/immutable-terms and MON-8 card, Ben's 17 October answer 2 and Q-03 delegation, parent authority contract/source, effective session-switch routine, legacy contractor scopes/projection, MON-8 receipt, ENT-3a repaired replay/refusal contract and MERGE-CHURN-1 guidance. No command/replay paths changed.

The issued task name overrides the draft's branch/lane/receipt names: `config/lanes/mon-8-p-b.json`, receipt here, ledger `docs/ledger/MON-8-P-B-A.md`. Own lane file is not listed in its allow list. All additions are exact paths, no wildcards. Migration `0194` was next free above parent's `0193`; dispatcher renumbers if necessary.

## Delivered implementation

- `ContractorRetainedReadRepository` consumes parent `withAuthority` for session-based query/resume. All SQL checks and reads remain in the callback transaction. No verified-context reconstruction or cached authority.
- `app.mon8_retained_contractor_workspace(uuid,jsonb)` revalidates the session/tenant through the parent's persisted SQL boundary, with shared tenant advisory lock seed 54 retained through transaction completion. No exclusive lock upgrade.
- Strict query validation at application/repository and direct SQL boundary; existing workspace schema validates output.
- Historical scopes reproduce 0054's membership/grant/client/contract rules while dropping only commercial track/agreement eligibility. Actual membership revocation/expiry, both membership-revocation mechanisms, grant revocation and effective switched actor still matter. Member status does not become revoked on track change.
- Revision disclosure remains limited to existing organisation readers/scoped commercial writers. Restricted readers receive revision zero and no administrative fields. Function returns data only; it has no permission-name parameter or writer predicate.
- Only application `read` and `resume` route through the new reader. Start, commands, legacy repository, authentication bridges, job/resident/export endpoints and commercial terms are unchanged.
- Exact additive LP-0 ACL/owner/function rows and standing-ruling-113 serious-b5 snapshot accounting for this one signature. No predecessor comparison removed. No new table requires tenancy-table inventory changes.

Migration is transactionally installed, migration-owned, VOLATILE SECURITY DEFINER, fixed `search_path=pg_catalog`, EXECUTE only owner/runtime. No new table grants, rows, backfill, runtime status writer, audit/receipt side effects, outward action or execution enablement. Installed defects require a later forward-fix migration. No new operational alert, environment variable, dependency or provider destination.

## Failing-first and negative controls

Before the retained repository/application implementation, new application tests collected and failed four assertions: `persisted retained reader must be exported: expected undefined to be defined`. Command:

`pnpm --filter @jobguard/api exec vitest run src/contractor/contractor-retained-read.application.test.ts --maxWorkers=2` — exit 1, four failed assertions (`/private/tmp/mon8b-red.log`). The SQL draft had already been written; this was application/repository red evidence, not a database red phase.

An earlier direct Vitest invocation failed package-entry resolution before the baseline DB build. That collection error is NOT red evidence. Initial default pnpm invocation was interrupted (130); subsequent pnpm commands used the already installed pinned 10.28.1 through `/private/tmp/jg-r1-pnpm-bin`, without package downloads/install.

A later controlled routing negative test temporarily restored only the parent's application source from `git show HEAD:...` and restored final bytes in `finally`. With the new repository available and legacy methods explicitly stubbed, the same test command exited 1: two routing assertions expected `membershipId: effective` but received `legacy`; the two refusal/command-isolation tests passed. This is labelled a post-implementation mutation control, not falsely dated failing-first evidence. Final routing was restored and seven retained/projection tests passed. API was rebuilt again after this control to ensure final compiled source.

No PostgreSQL failing-first execution is claimed. All database proofs below are authored, NOT RUN.

## Actual local verification

Environment: Node `v24.17.0`, pinned installed pnpm `10.28.1`, Vitest `4.1.11`. Existing dependencies reused; no clean install attempted per dispatcher instruction. Turbo remote caching disabled; local/shared-worktree cache used where explicitly reported. All targeted Vitest commands ran serially, at most three files and `--maxWorkers=2`.

| Command | Exit/result |
|---|---|
| `pnpm turbo run build --filter=@jobguard/db` (baseline before red) | 0; 3 tasks, 1 cached, 24.834s |
| `pnpm typecheck` | 0; 7 tasks, 1 cached, 45.167s |
| `pnpm turbo run build --filter=@jobguard/db` (new repository) | 0; 3 tasks, 1 cached, 19.343s |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core-purity stage passed, lane stage refused inherited part-A paths; remaining root stages did not run in this invocation |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same inherited-parent boundary hold |
| `LANE_BASE_REF=HEAD pnpm lint:lanes` | 1; checker explicitly refuses self-comparison; NOT presented as a pass |
| Supplementary working-tree path/migration check using exported `lanePathAllowed` and `migrationOrderViolations` against HEAD | 0; every own working-tree path allowed, no migration-order violation; NOT a replacement for required origin/main check |
| `pnpm turbo run lint` | 0; all 7 package lint tasks, 1 cached, 2m0.956s |
| `node tools/money-arithmetic-lint.mjs` | 0 |
| `node tools/commercial-boundary-lint.mjs` | 0 |
| `pnpm build` | 0; all 7 tasks, 1 cached, 3m9.911s; web compiled/generated 41 pages |
| `pnpm --filter @jobguard/api build` after routing negative control | 0; fresh Nest build of restored final source |
| `pnpm openapi:check` | 1; tsx CLI IPC socket `listen EPERM` in sandbox |
| `node --import tsx src/generate-openapi.ts --check` (cwd apps/api) | 0; same source OpenAPI comparison without the CLI socket |
| `node_modules/.bin/tsc -p /private/tmp/mon8b-test-types.json` | 0; extra no-emit strict compile of new test files and imports, including DB tests excluded by package src-only tsconfig |
| `node --test tools/*.test.mjs` | 0; 100 passed, none skipped |
| `pnpm --filter @jobguard/api exec vitest run src/contractor/contractor-retained-read.application.test.ts src/contractor/contractor.projection.test.ts --maxWorkers=2` | 0; 7 passed, including final rerun after mutation control |
| `pnpm --filter @jobguard/api exec vitest run src/contractor/contractor.application.test.ts src/contractor/contractor-practice-session.application.test.ts src/contractor/practice-worker-switch.application.test.ts --maxWorkers=2` | 0; 62 passed |
| `pnpm --filter @jobguard/core exec vitest run src/contractor-entitlement-authority.test.ts src/contractor.test.ts src/plan-entitlements.test.ts --maxWorkers=2` | 0; 738 passed |
| `pnpm --filter @jobguard/db exec vitest run test/contractor-session-context.test.ts --maxWorkers=2` | 0; 17 passed; unit doubles, no PostgreSQL |
| `pnpm eval` | 0; 14 files, 145 fixture tests passed; releaseDecision NOT_AUTHORIZED, no live-model evaluation |
| `git diff --check` | 0 |

824 targeted unit tests passed, plus 100 tooling tests and 145 AI fixture/evaluation tests. These are fresh Vitest/Node executions, not replayed Turbo test logs. Build/typecheck/package-lint cache counts above are not clean-run claims. Turbo emitted sandbox cache I/O warnings; Next emitted existing workspace-root/CSS warnings, without failing build.

## Database and whole-suite holds

`pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e`: NOT RUN. Full test invokes real PostgreSQL; dispatcher expressly forbids local PostgreSQL/browser startup. No mocked database test is substituted for these mandatory checks. CI after dispatcher push must supply all real results.

Authored 18 real-PostgreSQL tests across the three named new integration suites. They exercise actual runtime connections and, via the shared read fixture, actual ContractorApplication.read/resume methods. Coverage includes agreement loss/missing status, track changes, client/branch/contract scopes, restricted-reader revision privacy and commercial-writer parity, switched operative, expired/revoked sessions/membership, malformed/foreign context, single-connection reuse, lock-wait revocation, full business/audit/receipt row snapshots, no new write capability, populated predecessor upgrade, fresh/repeat migration, exact execute ACLs, and negative comparator controls. Fictional status fixture and privileged existing operations track routine are not user-facing agreement-management authorization.

Required CI serial batches (max 3 files each, `--maxWorkers=2`), under `pnpm --filter @jobguard/db exec vitest run`:

1. `test/contractor-retained-read.integration.test.ts test/contractor-retained-read-boundaries.integration.test.ts test/contractor-retained-read-upgrade.integration.test.ts`
2. `test/contractor.integration.test.ts test/contractor-practice-session.integration.test.ts test/contractor-session-context.integration.test.ts`
3. `test/practice-worker-switch.integration.test.ts test/tenancy.integration.test.ts test/lp-0-grant-freeze.integration.test.ts`
4. `test/fingerprinted-row-shape.integration.test.ts test/serious-b5-upgrade.integration.test.ts test/contractor-entitlement-authority.integration.test.ts`
5. `test/contractor-entitlement-session.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts test/site-extra.integration.test.ts`

Keep all six exact ENT-3a replay/refusal test titles unchanged in that final suite. This slice adds no command integration and cannot claim their new enforcement coverage. CI must also run the required complete checks from a clean pinned install.

## STOP/remaining decisions and handoff

- Parent acceptance/merge and exact-commit independent verdict are HOLD. Build-ahead authorization is not acceptance. No parent substitute authority fabricated.
- Required origin/main lane check is HOLD on inherited PR #293 paths (including its own lane file, core authority, migration 0193, parent tests and tenancy additions). Own lane was not broadened. Rebase/integrate after A merges, then rerun. The supplemental own-diff check does not waive this.
- No extra access/money rule was needed or invented. Agreement-management actors/triggers, new authority, production enablement, broader exports, alternate authentication and all release gates remain out of scope. No new STOP item prevented this authorized reader implementation.
- Remaining B slices: operative grants/security cleanup; site-origin/work-order enforcement and retained readers; approval chains/synthetic SSO/remaining exports. Whole MON-8 also requires subscription/lifecycle composition. No whole B or MON-8 completion claim.
- No different-model verdict or separate acceptance is fabricated. Dispatcher commits and pushes; a different model must review the exact resulting commit and a separate actor accept. Founder owns merge/release.

Commit message handoff: `/private/tmp/jg-msg-mon-8-p-b.txt`. No Git writes performed.

## CI ROUND v5-r1 — 20 October 2026

Dispatcher-issued repair for PR #299, starting clean at `6ebd9f922204e65d61adbc102f0e21d37490ecf2`, branch `codex/sandbox/mon-8-p-b`; local `origin/main` is `dc5721230fd8aedbf2d9d0457789074b66b48765`. Read AGENTS.md, own lane, this receipt, BUILD_PLAN.md MON-8 and applicable retained-read contract before editing. Dispatcher reports two independent Opus passes for the starting commit; those are not verdicts on this uncommitted repair. No self-acceptance, commit, push, migration execution or release.

Renumbered the own migration and note from `0199_contractor_retained_workspace` to dispatcher-reserved `0200_contractor_retained_workspace`. This supersedes the historical 0194 number above. SQL migration bytes are unchanged. Updated fixture `own`, migration-note heading, ledger and serious-b5 additive catalogue helper name. Own lane allows the new paths and retains the deleted 0199 paths because lane checking inspects both sides of a rename. No other 0199 allocation was used. Source inspection found directory-based migration discovery, with no current retained-reader filename reference in a shared ordering list or contract requiring an edit.

For CI run `39322683718`, cast the EXECUTE ACL aggregate to `text[]`, allowing node-postgres to decode a JS array. The entire upgrade test is byte-for-byte its predecessor plus this SQL cast; all assertions, including `executors.sort()`, remain identical. No authorization behavior or function definition changed. Scope is only the issued fixes and their references; no STOP item needed.

Installed dependencies reused, no downloads or install. Node `v24.17.0`, pnpm `10.28.1` through existing `PATH=/private/tmp/jg-r1-pnpm-bin:$PATH` for every successful pnpm invocation below. The default pnpm launcher stalled during `pnpm --version` and was interrupted (130); the existing pinned launcher then returned 10.28.1. Initial read tried a nonexistent root BUILDER_RECEIPT.md (exit 1), then read the actual lane-designated receipt. Ancillary process listing was sandbox-refused; no verification result inferred from it.

| Actual command | Result |
|---|---|
| `pnpm --filter @jobguard/db typecheck` | PASS, exit 0 |
| `LANE_BASE_REF=origin/main TURBO_CONCURRENCY=2 pnpm lint` | PASS, exit 0; all boundary checks and 7 package tasks; 4 cached, 3 executed |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, exit 0, including migration ordering against dc572123 |
| `pnpm --filter @jobguard/db exec vitest run --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts' --maxWorkers=2` | PASS, exit 0; 69 files, 615 tests; free-port requires prohibited localhost binding and is NOT RUN |
| `pnpm --filter @jobguard/api typecheck` | PASS, exit 0 |
| `pnpm --filter @jobguard/api build` | PASS, exit 0 |
| `pnpm --filter @jobguard/api exec vitest run src/contractor/contractor-retained-read.application.test.ts src/contractor/contractor.projection.test.ts src/contractor/contractor.application.test.ts src/contractor/contractor-practice-session.application.test.ts src/contractor/practice-worker-switch.application.test.ts --maxWorkers=2` | PASS, exit 0; 5 files, 69 tests |
| `pnpm openapi:check` | BLOCKED, exit 1; tsx CLI IPC socket `listen EPERM` |
| `node --import tsx src/generate-openapi.ts --check` (cwd apps/api), first attempt | FAIL, exit 1; preexisting compiled core lacked `EnterpriseLivePromptPersistenceError` export |
| `pnpm turbo run build --filter='@jobguard/api^...' --concurrency=2` | PASS, exit 0; refreshed dependency build outputs, 5 successful tasks, 3 cached |
| `node --import tsx src/generate-openapi.ts --check` (cwd apps/api), after dependency build | PASS, exit 0; same OpenAPI comparison without CLI IPC socket |
| Python comparison using read-only `git show HEAD:<path>` | PASS; migration SQL unchanged and upgrade test differs only by SQL aggregate cast; assertions unchanged |
| `git diff --check` | PASS, exit 0 |

PostgreSQL suites (`pnpm test:db`, `pnpm test:migrations`, retained-reader integration/upgrade and serious-b5 upgrade), full `pnpm test`, and browser suites: NOT RUN locally by dispatcher instruction. Required GitHub CI `checks` after dispatcher push must prove real PostgreSQL behavior, including the failing ACL test, fresh/upgrade ordering and migration coexistence with reserved CH-7-REST-B 0199. No fixture/unit result substitutes for those checks. AI evaluation: NOT RUN, no AI change. No clean-install claim. Turbo shared-cache logs include other worktree paths and nonfatal sandbox cache I/O warnings; cached tasks are explicitly counted.

Only assigned lane files and the explicitly permitted renumbering references changed. No backfill, external action, policy, production gate or operational alert changed. Existing transactional installation/forward-fix guidance applies. Commit message written to `/private/tmp/jg-msg-mon-8-p-b.txt`; dispatcher owns commit/push, exact-resulting-commit review and acceptance.
