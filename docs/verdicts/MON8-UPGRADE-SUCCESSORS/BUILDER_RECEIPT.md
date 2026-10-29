# MON8-UPGRADE-SUCCESSORS builder receipt

Status: the final authorized 29 October handoff below supersedes historical holds; ready for router Git merge completion, commit, CI and RED review.

Base: `dc5721230fd8aedbf2d9d0457789074b66b48765` (HEAD and frozen observed origin/main), branch `codex/sandbox/mon8-upgrade-successors`. No commit, push, PR, merge or rebase by builder. Only the three issued files are writable. No production, migration, fixture, shared helper, manifest, routing or inventory changes.

## Failing baseline and implementation

Read AGENTS.md in full, BUILD_PLAN §§2, 2.4 and MON-8, main-checkout `docs/dispatch/2026-10-20-speed-v5-milestone-and-deferrals.md`, `/private/tmp/BEN-ANSWERS-20261017.md`, diagnosis and CI log. CI 39480594536 at ENT6B candidate `05c4a226d64b63ab2457987172725be675c3fb2c` reports one failed test, 3047 passed, one expected failure: entitlement upgrade line 23 rejected ten additional empty 0203 tables. This is supplied existing failing-first CI evidence, not a local reproduction or proof of predecessor damage. The billing upgrade reference is absent at this isolated main base; no ENT6B files were copied into it.

The candidate retains the exact own-step whole snapshot and predecessor catalogue immediately after applying 0198 alone. It adds pre-0198 named-column canonical row_to_json text, original PK identity and full format_type comparisons through unchanged upgrade-proof helpers. It discovers every table in the original four schemas, asserts complete representation and row counts (including zero), and requires populated tenant, identity user, account, membership, contractor practice session, commercial-track assignment and extra-origin history. Before successors it captures all tables again, including agreement status rows from earlier authorization tests, applies discovered migrations twice and compares both captured proofs plus the full migration registry each time.

Existing runtime denial, immutable status, no-backfill, least-privilege, grant and own-step catalogue controls remain. Added rolled-back controls use the same comparator for value, one-microsecond, full varchar type, missing scratch identity (PK move, no DELETE), nullable column, inserted fictional row, new table and comment-only replacement of an existing reject-mutation function. Added column/function controls must pass successor comparison and fail exact catalogue comparison. No immutable trigger is suppressed. No new destructive SQL is introduced; existing denied DELETE assertions are retained.

## Exact STOP: unkeyed predecessor

Source inspection found `identity.request_window`, created in `packages/db/migrations/0111_persisted_identity.sql:42–45`, has only `ip_digest char(64) NOT NULL` and `requested_at timestamptz NOT NULL`, with a non-unique index on the pair and no primary key. No later migration references/keys this table. `proofBefore` explicitly throws `identity.request_window: no primary key`. The candidate deliberately retains that fail-closed behavior; it must not be delivered as a passing repair. No table or billing prefix is filtered.

There is no truthful stable unique identity available from that schema: `(ip_digest, requested_at)` can duplicate; ctid is a physical location, not a stable identity. A separately authorized stable surrogate primary key would solve identity capture but exceeds this no-migration order. Alternatively root must explicitly authorize a different preservation contract for this unkeyed infrastructure table (canonical complete-row multiset with duplicate multiplicities); that is not an assertion of original PK identity. Fixture population cannot create a database-enforced identity. No shared fixture/helper/schema patch has been applied. Root owns the serial decision; no approval is inferred.

## Checks

Environment: Node `v24.17.0`; installed TypeScript `5.8.3`. Pinned package manager is pnpm 10.28.1; invoked pnpm wrapper did not return a version (printed a warning about ignored pnpm.overrides, then stalled). Interrupted the initial shell at that command, exit 130; it never reached its following typecheck. No installation attempted. Used installed binaries as authorized.

Commands actually executed:

- `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot mon8-upgrade-typecheck node packages/db/node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` — exit 0 with host resource visibility. Initial sandbox attempt could not read sysctl/sysmond/process counts and was interrupted before completion (reported exit 0); it is not counted as a typecheck pass. The scheduler was not bypassed.
- `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot mon8-upgrade-test-source node packages/db/node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext packages/db/test/contractor-entitlement-upgrade.integration.test.ts` — exit 0, host-visible scheduler. This includes the changed integration test and imported helper/fixture TypeScript, unlike the package src-only config.
- `LANE_BASE_REF=origin/main node tools/lint.mjs` — exit 1. Core purity passed (228 files, seven existing reported computed imports); range-aware lane lint refuses self-comparison because HEAD equals frozen origin/main before the dispatcher commit. No alternate base or fake CI event supplied. Root pnpm/turbo lint was not completed; package typecheck runs the same compiler arguments as db package lint.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` — exit 1, same truthful self-comparison HOLD. Must repeat after dispatcher commit.
- `node tools/money-arithmetic-lint.mjs` — exit 0; `node tools/commercial-boundary-lint.mjs` — exit 0. These ran separately because root lint stopped at the range check.
- Separate inline working-tree check using unchanged exports `loadLanePolicy`, `selectLane`, `lanePathAllowed` and real git diff/untracked output — exit 0. Selected exact branch/lane; all three changed paths permitted. This verifies lane schema and current paths only, not the refused commit-range lint.
- `git diff --check` — exit 0.
- `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot mon8-upgrade-openapi node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/src/generate-openapi.ts --check` from repository root — exit 1, wrong working directory left API parameter decorators disabled. Corrected to the existing script's API working directory.
- From `apps/api`, `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot mon8-upgrade-openapi node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` — exit 1: missing workspace `@jobguard/db/dist/index.js`. Not a passing OpenAPI check; no generated OpenAPI change or dependency build was attempted.

Disk: initial df showed 45 GiB available; later df showed 44 GiB (45,932,888 KiB and then less). Conservatively applied the 45 GB floor: no new tests or builds. Unit suites and build NOT RUN; no pure comparator unit file exists at this base, and no extra test file is authorized. Only no-output static compilation and lightweight read-only checks proceeded. No broad tests, PostgreSQL, browser tests, installs or downloads. No fixture-only or schema change could honestly supply the missing stable original PK. No viable fixture patch is proposed for that reason; any surrogate identity would need separately authorized schema work, or root must change the unkeyed-table contract explicitly. PostgreSQL, migrations and browser suites NOT RUN locally by explicit order. Static compilation cannot validate SQL behavior or demonstrate that catalogue/rollback controls pass. No dependencies installed/downloaded. No live or real data used.

## Gates and handoff

Root must resolve the exact unkeyed-table STOP before CI delivery. Dispatcher commits only after builder exit and repeats actual-range lint after commit. Independent Claude reviews (two per wave), separate technical acceptance and all exact-head CI remain pending. Required CI: entitlement upgrade, entitlement authority, entitlement session, billing upgrade and billing import/ordering regressions, plus mandatory repository checks. This repair does not accept ENT6B, lift decision 74, complete MON-8 or any product card, or open a release gate. C1: no web workflow changed; no new migration, operational alert, external action, commercial policy or backwards compatibility change.

## r2 additive completion — 20 October 2026

Current status: source implementation complete within the issued scope; HOLD for exact-head CI, independent review and separate acceptance. The historical r1 missing-PK STOP above is superseded only for the explicitly authorized observable-fact multiset contract for `identity.request_window`. No stronger physical-row identity claim is made.

Actual r2 starting HEAD: `39341972a3076beeae965f730f0b42f7d2cec592`, branch `codex/sandbox/mon8-upgrade-successors`. Starting `git status --short` and `git diff` were empty: the dispatcher had committed r1. Frozen observed origin/main remains `dc5721230fd8aedbf2d9d0457789074b66b48765`. Read the existing receipt/source and clean diff before edits and preserved prior controls. Read the required originals at `/Users/benharwood/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261017.md` and `/Users/benharwood/Claude/Projects/my-new-project/docs/dispatch/2026-10-20-speed-v5-milestone-and-deferrals.md`, AGENTS.md, BUILD_PLAN §2/§2.4/MON-8 and unchanged proof/fixture helpers. No production modules or migrations copied. Only the issued test, own lane note and this receipt changed. No commits, git index writes, pushes, PRs, merges, rebases, dependency downloads or other worktrees changed by builder.

### Implementation and proof boundary

Every capture discovers all tables in the original four schemas once, partitions by actual catalogue primary-key presence, and requires the entire no-PK set to equal exactly `identity.request_window`. Unexpected unkeyed predecessors still STOP. Keyed tables retain unchanged `proofBefore`/`proofDifferences` named-column, original-PK and full-type behavior. The shared `upgrade-proof-utils.ts`, including `proofColumns`, is unchanged. Both partitions are included in original-table coverage and captured-versus-actual row-count checks; empty keyed tables remain represented honestly. The populated authority-spine guards remain.

The exception uses ordered original names and `format_type` from `proofColumns`, safely quoted named projections, `row_to_json(s)::text`, C-collated grouping/ordering, and exact multiplicities parsed only as BigInt. Row JSON is never parsed by the unkeyed branch; no timestamps pass through driver Date values. Captures/comparisons pin one connection and use transaction-local UTC and ISO/YMD rendering for both keyed and unkeyed branches. Missing original tables/columns and altered original full types fail. Later columns are excluded only from the successor projection; exact own-step catalogue checks remain mandatory.

Three fictional request facts are inserted through the existing isolated admin before the original baseline: two identical facts and one with a distinct runtime-generated SHA-256 digest, all at a six-digit fractional timestamp. Runtime assertions validate digest shape, exactly two seeded byte strings, per-digest multiplicities 2 and 1, total seeded multiplicity 3 and exact microsecond timestamp text, without assuming no other fixture rows exist.

At 0198 alone, the existing full snapshot and strict catalogue assertions remain, plus exact request-window multiset equality (no added or missing fact allowed). Before successors a second complete proof includes status rows created by authorization tests. Each of two migrate calls is followed by comparisons against both baselines and the complete migration registry. Successor comparison allows added facts/duplicates but fails any original byte string whose multiplicity declines. This proves observable original facts with multiplicity; it cannot distinguish physical duplicates or detect deletion/modification paired with an indistinguishable replacement. Successor additions are deliberately allowed, not reviewed production rate-window behavior. No ctid, invented key, table omission, access/schema/product-policy change or deletion introduced.

Added same-comparator controls (authored, NOT database-executed locally): `[A,A,B]` loses to `[A,B]`, empty and same-total `[A,B,B]`; additions `[A,A,B,C]` and `[A,A,A,B]` pass successor mode and fail exact mode; identical multisets pass exact mode; counts beyond safe-number precision use BigInt. Rolled-back request-window controls change only the distinct seeded fact's timestamp by one microsecond or its digest, retype the timestamp to timestamptz(3), insert a new fact or duplicate, and add a nullable request-window scratch column. Corruptions fail; insertions pass successor comparison but fail exact own-step fact comparison; the nullable column passes named-column comparisons and fails strict own-step catalogue comparison. Snapshot/catalogue restoration is asserted after rollback. Prior account row-edit, timestamp/type, grants, nullable-column, new-row/new-table, replaced-function and scratch-PK-move controls are preserved. No trigger suppression or DELETE added.

### r2 actual checks and limits

Used installed binaries as r1 authorized after its recorded stalled pnpm wrapper; no install attempted. Slot-wrapped compiler commands used host resource visibility so the unchanged shared scheduler could read real host pressure; no scheduler bypass.

- `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot mon8-r2-typecheck node packages/db/node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` — exit 0.
- `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot mon8-r2-test-source node packages/db/node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext packages/db/test/contractor-entitlement-upgrade.integration.test.ts` — exit 2, TS7053 on a test-local inferred object indexed by table name. Corrected by explicitly typing the unkeyed proof record.
- Same strict source command with label `mon8-r2-test-source-fixed` — exit 0. Covers the changed integration test and its imported TypeScript; package source-only typecheck alone does not cover it.
- `LANE_BASE_REF=origin/main node tools/lint.mjs` — exit 0: core purity (228 files, seven existing computed-import reports), actual range plus working tree lane boundary, money and commercial checks.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` — exit 0. Actual base dc572123, HEAD 39341972 and working-tree paths are exactly the three authorized files. Dispatcher must repeat after its r2 commit.
- `git diff --check` — exit 0 before receipt completion; final repeat recorded below.

Disk check: 45,184,220 KiB available initially, later 45,168,288 KiB (below 45 GiB; conservative r1 floor retained). No new heavy tests/builds/installs. Only no-output static compilers and lightweight checks ran. Unit assertions are in the authorized integration test and remain CI-only; no extra unit/support file or extracted substitute test was used. PostgreSQL, migration, browser suites and builds NOT RUN locally. OpenAPI was not rerun: read-only existence check confirms `packages/db/dist/index.js` remains absent, the r1 dependency blocker; generating dependencies would require a build below the floor. No OpenAPI output changed. No claim that any SQL, comparator Vitest control, rollback or real integration passed locally. No real data/providers used.

Required exact-head CI remains entitlement upgrade, entitlement authority/session, billing upgrade and billing import/ordering regressions plus mandatory repository checks. This frozen main base lacks the later billing reference; no entitlement/billing production module was copied to manufacture it. Independent Claude verdicts, separate acceptance, CI, integration and release gates remain pending. The earlier supplied ENT6B CI failure remains the failing baseline; this source/static result is neither independent review nor acceptance. No Ben decision is needed for the bounded proof exception. No production migration, rollback strategy change, operational alert, external action, permission or commercial behavior changed. The repair does not accept ENT6B, lift decision 74, complete MON-8 or any product card.

Final r2 repeats after receipt/handoff preparation: `LANE_BASE_REF=origin/main node tools/lint.mjs` exit 0; `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` exit 0; `git diff --check` exit 0. Intended conventional commit subject/body written to `/private/tmp/jg-msg-mon8-upgrade-successors.txt`. Final source HEAD remains 39341972 and origin/main dc572123; dispatcher owns the next commit and exact-head CI delivery.

## v5-r3 pre-review completion — 20 October 2026

Status: bounded source implementation complete; HOLD for new exact-head CI, real independent Claude verdicts and separate acceptance. This is the coordinator-issued FIX for proof completeness, not automatic acceptance. Actual starting HEAD `5866d283ada44dcca156567e83d46c55e27d5a4c`; starting status/diff clean. Frozen observed origin/main remains `dc5721230fd8aedbf2d9d0457789074b66b48765`. Draft PR302 is an existing dispatcher/root delivery; builder neither creates nor updates it. Prior 5866 review packets are historical and unsubmitted; root regenerates the complete exact-head review queue after dispatcher commit. Old-head CI supplies no execution evidence for these new bytes.

Read the r1/r2 receipt and current source/clean diff first; read AGENTS.md fully, BUILD_PLAN §2/§2.4/MON-8, and both required original dispatch/Ben-answer paths listed in r2. Only the same test, own lane note and own receipt changed. No production schema, migration, permission, policy, shared helper, fixture, manifest or other lane edits. No builder git writes, commit, push, merge, rebase, installation or download.

### Complete proof partition and boundaries

Before 0198 and again immediately before successors, discovery retains every predecessor in the original four schemas without name/prefix exclusions. On the same pinned, UTC/ISO-YMD capture connection, count every table using PostgreSQL count text -> BigInt. Classify keyed tables by these actual baseline counts: every positive count goes through unchanged `proofBefore`; every zero count goes into explicit `emptyKeyed` STRUCTURAL evidence containing all ordered original names, full `format_type` types and actual ordered primary-key columns. Counts and all zero-table names/shapes remain recorded in each returned baseline proof; no fixed total or purported locally observed database population is invented.

`assertPartition` requires the sorted union of populated keyed, empty keyed and explicit request-window partitions to equal the entire discovered set, with multiplicities enforcing pairwise disjointness, and a matching complete count map. Every data-compared keyed table must have at least one original row, with captured identity count exactly equal to its pre-capture count. Every empty-keyed structural baseline must count exactly zero and have a real PK shape. The fixed populated authority spine still requires membership in the data partition and a positive count, preventing a broken fixture from silently becoming structural-only. Unexpected unkeyed tables still STOP; request-window full named-column text/microsecond/multiplicity behavior and three seeded observable facts remain unchanged.

Successor comparison uses unchanged `proofDifferences` for every original populated keyed row/value/identity/full type. Empty keyed comparison checks every original column/full type and the original PK shape; added rows and nullable columns pass because this partition had no original rows to preserve. This is structural evidence only, never populated-row preservation. Both baselines are still compared after EACH of two migrate calls. Exact own-N whole snapshot, strict predecessor catalogue equality, request-window exact own-step facts and the sole allowed 0198 table addition are preserved. All prior r1/r2 corruption, BigInt deficit, microsecond, type, grants, new-table/new-row/column/routine and scratch-PK controls remain.

Added a rolled-back, non-fingerprinted empty keyed scratch predecessor control. It verifies the actual zero count and complete column/type/PK shape; original varchar(200) -> varchar(201) damage fails the structural comparator, as does removing the scratch PK in a savepoint. After rollback to each savepoint, a fictional later row plus nullable column passes the same comparator. No DELETE or original table omission is used. Guard fault injections separately reject an omitted empty partition entry, overlapping partition entries, missing captured populated rows and a complete but falsely zero-row/reclassified account fixture. That last control simulates fixture data loss in proof metadata; it does not claim to execute deletion or prove physical fixture loss in a database run. All new controls are authored/source-inspected only; r3 static compilation is held as recorded below, and database execution remains CI-only.

Request-window limitation remains: observable original fact multiplicity is preserved, not physical identity among identical duplicates. Empty predecessors supply no original data evidence. No claim that SQL, rollback behavior, fixture population or controls have passed through source inspection alone.

### r3 actual local checks and item-specific holds

Node `v24.17.0`; installed compiler remains TypeScript 5.8.3. Used installed binaries under the prior authorized stalled-pnpm fallback; no package download. Commands attempted:

- `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot mon8-r3-test-source node packages/db/node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext packages/db/test/contractor-entitlement-upgrade.integration.test.ts` — initial sandbox attempt could not read sysctl/sysmond/process counts; interrupted before a compiler pass. Same command retried with host resource visibility, as r1/r2, waited without compiler output. Read-only host diagnostics twice showed 47 Node processes, exceeding unchanged scheduler limit 45; load and memory otherwise met thresholds, slots empty. Interrupted the waiting scheduler without modifying limits or stopping other processes. Shell interruption result is not a compiler exit or pass. Strict full changed-source compilation is therefore NOT COMPLETED for r3, an explicit resource STOP to be rerun once admission is available.
- `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot mon8-r3-typecheck node packages/db/node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` — same host-visible scheduler Node-count hold, no compiler output; interrupted while waiting. Package typecheck/lint compiler is NOT COMPLETED for r3 and must be rerun after scheduler admission. No unwrapped compiler substitute used.
- `LANE_BASE_REF=origin/main node tools/lint.mjs` — exit 0, repeated after receipt edits: core purity (228 files, seven existing computed-import reports), actual committed range plus working-tree lane boundary, money and commercial checks. This is the root lint guard script, not a claim that the full pnpm/turbo workspace lint ran.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` — exit 0, repeated. Exact three authorized paths, base dc572123, HEAD 5866d283; dispatcher repeats with its final commit.
- `git diff --check` — exit 0, repeated; final repeat below.

Disk read-only `df -k .`: available 47,150,388 then 47,151,820 KiB (below the conservative 45 GiB floor carried from r1/r2). No heavy tests/builds/installs run. Only the two no-output static compiler commands were submitted to the mandated scheduler, and neither is claimed executed. No unit/Vitest, PostgreSQL, migration or browser suite ran locally. Builds and broad checks were not run under the narrow issuance/resource rules. OpenAPI check not rerun: read-only `ls packages/db/dist/index.js` confirms the prior absent-built-dependency blocker; no production/OpenAPI file changes. An initial read batch using `rg ... && ...` stopped at no testTimeout/hookTimeout match (exit 1); the intended version/base/disk reads were then rerun separately. This has no check-pass meaning.

Mandatory r3 compiler holds remain item-specific and unaccepted. Required real PostgreSQL controls and entitlement upgrade/authority/session, billing upgrade/import/ordering regressions plus mandatory repository CI remain CI-only. Earlier r1/r2 source checks and old-head CI do not prove new bytes. Independent Claude review, separate technical acceptance, merge and release are pending; this repair does not accept ENT6B, lift decision 74, complete MON-8 or any product card. No new operational alert, migration/rollback strategy, external action, commercial behavior, permission or release gate changed.

Final r3 checks after receipt/handoff preparation: root lint guard script exit 0; lane lint exit 0; diffcheck exit 0. Both host-visible scheduler interruptions returned exit 130, not compiler results. Final repeated diffcheck after this receipt correction also exit 0. Intended commit subject/body written to `/private/tmp/jg-msg-mon8-upgrade-successors.txt`. Builder leaves HEAD 5866d283 unchanged; exactly the three issued tracked files differ. Dispatcher owns commit; root owns existing PR302 feature-branch delivery and regenerated exact-head review queue.


## 28 October 2026 catch-up — incomplete MON-8, do not commit

The router supplied a current-main merge with one conflicted path,
`packages/db/test/contractor-entitlement-upgrade.integration.test.ts`. Resolved its
working-file conflict by preserving the branch's full populated/empty/unkeyed
predecessor proof, comparison against both captures after each of two migration
passes, and exact migration bookkeeping. Also retained current main's explicit
six successor-routine signature assertions. Also retained main's explicit empty successor-table expectations after each pass,
without imposing whole-table snapshots on populated predecessors after authorized
successor changes. Those predecessors use the branch's full general proof.
No git writes were performed: the index remains unmerged until the router stages
the resolved file. No migration, runtime feature, permission or production
behavior changed. The existing lane lists precisely the two non-lane paths edited
here; the lane file itself is implicitly editable under the lane checker.

The broader issued build is NOT COMPLETE. Source inspection establishes these
remaining concrete gaps, without claiming an external approval blocker:

- `apps/api/src/plan-entitlements.application.ts` still has no installed persisted
  plan-authority adapter. Its existing unit port is not an executing command guard.
- `packages/db/src/contractor-repository.ts` and the underlying
  `app.contractor_admin_command` still use legacy membership/permission checks;
  operative grants do not consume the active agreement projection.
- `packages/db/src/work-order-repository.ts:60` gates both new work and retained
  readers on current contractor track. Site-extra prechecks share that legacy
  gate. These require separate command enforcement and retained-read treatment,
  preserving actor/resource authorization and transaction lock ordering.
- Approval-chain SQL and SSO admin SQL still have their own authority paths.
  Retained exports/readers also need the explicit downgrade/lapse/track matrix.
- Subscription persistence has effective-date plan changes, but MON-8 has no
  composed adapter for them or the free-first-job/lifecycle transitions. Existing
  pure plan parity tests do not prove billing-boundary or upgrade/downgrade races.

Safest choice taken: leave runtime behavior untouched rather than introduce a
partial guard and represent it as complete authorization enforcement. This change introduces no new
feature enablement or active-status default. The requested
replay/duplicate, cross-company and period/race tests for the remaining slices
are still outstanding. This is RED and requires independent Claude review and
current-head CI after implementation, not merely after this conflict repair.

Actual local verification (installed tools; no packages downloaded):

- Node v24.17.0; installed Vitest v4.1.12, explicit `--maxWorkers=2`.
- `node packages/db/node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext packages/db/test/contractor-entitlement-upgrade.integration.test.ts`: passed.
- `node packages/db/node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit`: passed.
- From packages/core, `node node_modules/vitest/vitest.mjs run --maxWorkers=2 src/plan-entitlements.test.ts src/contractor-entitlement-authority.test.ts`: 2 files / 13 tests passed. These are existing pure-domain tests, not database or command-enforcement evidence.
- The API's two existing entitlement unit suites initially could not import the
  absent built `@jobguard/core`. Built only that local dependency using
  `node packages/core/node_modules/typescript/bin/tsc -p packages/core/tsconfig.json`
  (passed), then retried the same named suites; result recorded below.
- `pnpm --version` stalled after an installed pnpm compatibility warning; interrupted
  with exit 130. Used installed Node tool entrypoints thereafter.
- PostgreSQL, migration execution and browser suites were not run, per the issued
  sandbox constraints. No live provider, release, customer data or money used.

API retry: from apps/api, `node node_modules/vitest/vitest.mjs run --maxWorkers=2 src/plan-entitlements.application.test.ts src/plan-entitlements.boundary.test.ts`: 2 files / 12 tests passed. Existing unit doubles do not prove persisted authorization.

Final verification: repeated strict compilation of the resolved upgrade test
passed after restoring main's explicit empty successor-table assertions.
`git diff --check` passed. `LANE_BASE_REF=origin/main node
tools/agent-lane-boundary-lint.mjs` failed because the unfinished merge index
attributes the incoming main catch-up files to this lane. The working-tree edits
are only the upgrade test, this receipt and the lane file. The router must finish
staging the merge resolution and recheck the final committed range; no lane
allowlist was widened to cover main's unrelated incoming files.

Handoff file: `/tmp/mon8-upgrade-successors-20261028T190939Z-commit-msg.txt`,
explicitly marked `do not commit`. No MON-8 completion, new adversarial integration
coverage, CI pass or independent review is claimed. The requested remaining build
requires further implementation; this run only completes the conflict repair.

## 28 October continuation — MON-8 RED server enforcement candidate

This section supersedes the preceding incomplete handoff. Source implementation
is ready for router commit/push and CI/independent Claude review; no local
PostgreSQL, browser, independent-review or release pass is claimed.

0318 introduces the one persisted server decision service and the normal-company
session adapter. The adapter independently authenticates the stored session after
lock waits, checks the requested job in the verified company, and reads effective
subscription terms using server London dates. Solo/Builder decisions are identical.
Unknown features/purposes and malformed authority refuse. Client flags cannot
supply plan, agreement status, lifecycle or enablement. The legacy pure facts port
remains a domain/compatibility API, with no command authority.

0319 preserves the current definitions/ACLs of existing guarded routines while
adding the service at operative/admin grants, work-order/batch/rate/party writes,
site-origin/visit writes, approval chains and SSO administration/provisioning.
Repository entrypoints check before replay returns and before business locks.
The worker also rechecks queued client-approval sends before claiming a delivery:
agreement loss cancels pending/retryable work, with an existing cancellation audit,
no attempt and no adapter call. Executing/unknown outcomes retain reconciliation.
Retained contractor billing/export authority uses the same service's explicit
retained-read purpose plus all original finance/job permissions.

Membership validity is separated from commercial eligibility. Historical order,
visit, scheduling, rate, organisation and audit-export readers keep their existing
identity, scope and revocation checks without filtering on agreement/track.
Existing SSO-linked users can re-authenticate after agreement loss without adding
scopes: only grants matching current IdP claims survive; removed claims still
revoke. New linking/JIT and configuration/mapping changes require active agreement.
Disabling required SSO and membership/grant/link revocation retain their existing
security permissions. The service never grants resource access or exact commercial
approval, and a result cannot be reused as an execution permit.

Safest choices (also listed in the commit message):

- Missing/inactive/suspended/superseded bound agreement refuses new contractor work,
  including replays. No backfill, reference-only activation or runtime status writer.
- No contractor capability comes from Solo, Builder, a payment result or client flags.
- Missing effective subscription terms or persisted MON-3 trial authority refuses
  new small-builder feature execution; no trial lifecycle is invented.
- Pay-now and new accounting exports remain disabled pending their readiness paths.
  Retained exports remain available only under their original current permissions.
- Existing normal-company commercial routes still refuse outside the current
  subscription allowlist (`SYNTHETIC_WORKFLOW_ONLY`); no guard bypass or live route.
- Security revocation/SSO-required disable remains possible after commercial loss.
  Retained SSO sign-in cannot add grants, and current IdP removals still revoke.
- Pending approval deliveries are cancelled on entitlement loss; executing/unknown
  actions keep reconciliation rather than being blindly replayed or rewritten.

The organisation/status lock (54) precedes the subscription/lifecycle lock (184)
when small-builder new-work terms need it, then business locks, then audit.
Contractor/retained checks do not acquire the irrelevant subscription lock. Status
inserts mechanically acquire the exclusive tenant lock. READ COMMITTED queries
re-read after waits. Existing supported writers use those keys; privileged-owner
compromise is outside the verified-tenant runtime trust boundary.

Complexity and compatibility: PostgreSQL requires complete explicit replacement
bodies, so 0319 contains the existing routines plus narrow guards rather than a
runtime SQL-rewriting framework. Older positive suites now explicitly insert an
owner-only fictional active agreement fixture; missing-status tests omit it.
Earlier-schema upgrade fixtures run today's repository source, so the existing
legacy fixture installer supplies the pre-MON-8 gate only before 0318 exists.
0318 replaces those exact signatures. It cannot mask a missing service in a schema
recorded as migrated to 0318. Current-schema MON-8 tests exercise the real service,
never that earlier-schema fixture shim. No production/demo code calls this setup.
The missing-status retained-read test now builds actual pre-0318 records, upgrades,
and proves there is no status backfill and no loss of authorized records. Two
existing fixture type annotations were corrected without changing runtime values
(nonempty enum default and deliberately undefined optional SAML fixture input).

Data/migration impact: no business rows are updated/deleted, no tables or runtime
table privileges are added, and no fee/settlement/price policy changes. Existing
status facts, job terms and audit history remain intact. Fresh/upgrade/idempotence
and catalog assertions are authored for CI. Forward fix: preserve immutable facts
and retained-read scope; issue a reviewed later migration correcting the guard
function while refusing affected new work. Do not roll back by deleting statuses,
rewriting history or granting an inferred active agreement. No new operational
alert is needed; delivery cancellation uses the existing audit event.

Adversarial PostgreSQL coverage added (CI-only here): missing agreements, foreign
company grant targets/actors, exact-command replay after suspension, downgrade
then use, retained orders/audit exports, a status change while blocked on lock 54,
effective-date exclusion/inclusion, plan parity across upgrade/pending downgrade,
a subscription change while blocked on lock 184, session revocation while waiting,
0318/0319 populated upgrade preservation/idempotence, retained SSO scopes with no
new grants, IdP-removal revocation, refused JIT/mapping and cancelled queued delivery.
The catch-up proof retains the complete populated/empty/unkeyed predecessor proof,
main's empty successor expectations and its routine signatures. Own-step populated
status rows remain in the baseline proof, not the empty-successor list.

Actual local checks (installed Node tools; no package download, git write, real
customer data, live provider, money action or release):

- Node v24.17.0 and Vitest v4.1.12, explicit `--maxWorkers=2` throughout.
- From packages/db: `node node_modules/vitest/vitest.mjs run --maxWorkers=2 src/outbox.test.ts src/later-outbox.test.ts src/plan-entitlement-service.test.ts`: 3 files / 23 tests passed. Includes a unit double proving no adapter/attempt on lost entitlement. Initial outbox tests failed on their exact old SELECT-prefix expectations; updated them to require the new authorization-actor column, preserving all behavior assertions; final rerun passed.
- From apps/api: `node node_modules/vitest/vitest.mjs run --maxWorkers=2 src/plan-entitlements.application.test.ts src/plan-entitlements.boundary.test.ts src/plan-entitlements.persisted.test.ts`: 3 files / 14 tests passed.
- `node packages/db/node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` and `node apps/api/node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit`: passed.
- Strict `tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext` over the resolved upgrade proof, three new integration files, enterprise identity and approval-chain suites: passed. Earlier attempts exposed the two existing fixture type issues noted above; final strict compilation passed.
- PostgreSQL/migration/browser execution remains CI-only under the issued sandbox constraint. These authored suites are not represented as executed or independently verified.


Final boundary inspection also found ordinary email invitations can assign an
operative membership without the contractor-admin path. 0319 now guards operative
invitation issue and rechecks the original issuer's current owner membership,
account and active agreement before acceptance. A lost agreement returns the
existing invalid-code result before any new identity/membership is created,
consuming the one-use verified latch. Added real-PG tests for small-builder issue
refusal and active issue followed by suspension-before-acceptance. The unrelated
existing invitation expiry test uses its ordinary foreman role so it continues
testing expiry/revocation rather than contradicting the new operative restriction.
This is an additional safest choice in the commit message.

Final static checks: core purity passed (282 TypeScript files; ten existing computed
module-name reports), money arithmetic boundary passed, commercial boundary passed,
and `git diff --check` passed. Working-tree-only lane validation through the
repository's `loadLanePolicy`/`lanePathAllowed` exports passed; this is not a full
branch-range lane pass. The merge index still marks the upgrade proof unmerged
although its file has no conflict markers: the router must stage that resolution
and run final range/CI checks. No allowlist was widened for unrelated incoming
main files. Rechecked the incoming successor expectation union against index stage
3; own-step populated status rows remain covered by the full baseline proof.
Strict compilation including the ordinary identity invitation suite also passed.
No required release, RED review or current-main CI gate is waived.


## Repair round 1 — RED verdict at 1551d456 (28 October)

Addresses the contractor-to-small-builder authority regression using the reviewer's
option (b): keep membership-only validity for scoped retained reads and security
revocation, and require the current persisted contractor feature at every remaining
legacy writer boundary. 0318 is edited in place. It now guards `ef_actor` (and
therefore fee derivation, preparation, approval and dispute),
`enterprise_baseline_actor`, `ent3a_extra_authority` (including resident
confirmation), practice worker decisions and switch-on before replay, customer
linking, live-prompt mutations and visit evaluation. 0319's billing authority
requires current contractor entitlement only for `p_write=true`. Existing
`contractor_allowed` / `contractor_job_allowed` checks remain resource permissions,
not commercial eligibility. Missing/current small-builder assignment refuses;
old active status on a superseded contractor assignment cannot authorize work.

The existing finance and baseline actor checks are reused as two private
migration-owned retained-reader helpers. They grant neither new work nor runtime
execution. Existing derivation, statement and baseline readers use these helpers
and preserve their original tenant/session/finance/resource checks. Fee writers
re-read finance authority after the entitlement lock wait. No membership/grant/link
revocation or required-SSO disable guard is tightened. No data is deleted, migrated
or backfilled; no provider, release or policy activation occurs. PostgreSQL requires
full explicit CREATE OR REPLACE definitions: the added text preserves original
bodies/ACLs plus narrow guards, rather than introducing dynamic source rewriting.

The existing real-PostgreSQL server-entitlements suite now includes a populated
contractor company with positive finance, baseline, extra and worker authority
controls. It derives and prepares an actual synthetic zero-value fee statement,
reassigns the company through `assign_commercial_track` to small_builder, and
requires FORBIDDEN/42501 for the legacy writer matrix, including exact fee-command
replays. It asserts no table changes from refused calls, identical retained fee and
organisation reads, and successful scoped grant/membership revocation. Installed
routine checks include every added writer guard. These are authored CI tests,
not locally executed PostgreSQL evidence.

Actual local checks (installed tools; no downloads or git writes):

- `node packages/db/node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit`: passed.
- Strict standalone compilation of `packages/db/test/server-entitlements.integration.test.ts`
  with `--noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes
  --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext`: passed.
- From packages/db, `node node_modules/vitest/vitest.mjs run --maxWorkers=2
  src/plan-entitlement-service.test.ts src/outbox.test.ts src/later-outbox.test.ts`:
  3 files, 23 tests passed.
- From packages/db, `node node_modules/vitest/vitest.mjs list --maxWorkers=2
  test/server-entitlements.integration.test.ts`: collected all 8 cases, including
  the new regression. The first collection failed because the installed storage
  dependency lacked dist; `node packages/storage/node_modules/typescript/bin/tsc
  -p packages/storage/tsconfig.json` passed and the same collection then passed.
  Listing tests does not execute their hooks or PostgreSQL assertions.
- Core purity, money-arithmetic and commercial-boundary tools passed. Core purity
  reported its 10 existing computed-import notices.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: passed for
  the existing committed branch range ending 1551d456. Repair paths are already
  within this lane's exact allowlist; the router must check its new committed head.
- `git diff --check`: passed.

Ready for router commit/push and CI, followed by the one independent RED review
against the resulting head. PostgreSQL, migration, browser and current-head CI
execution remain pending under the issued sandbox constraints. The router owns
finish-list/work-list state and delivery. Commit message:
`/tmp/mon8-upgrade-successors-20261028T212412Z-commit-msg.txt`.

## 29 October 2026 — combined MON-8 catch-up, ready for router delivery (RED)

Current status: implementation and relevant local checks complete; ready for router
commit/push and CI. This supersedes the historical HOLD entries above, not the
required PostgreSQL/CI or exact-head independent RED review. Prior reviewed heads
were a6c2cab5 (this branch) and 07d7cab1 (operative); neither review verifies this
combined uncommitted candidate.

1. Resolved the supplied main catch-up conflicts in the db exports and contractor
   entitlement upgrade proof. Kept both exports and the union of all explicit
   successor-table assertions, alongside the branch's named-column/identity/type
   and multiset preservation proofs. Renumbered own migrations 0318/0319 to the
   issued reserved 0352/0353, including executable fixture/upgrade references and
   lane paths. Used `planRenumber` exported by `tools/migration-renumber.mjs` with
   the reserved-number floor, applying filesystem moves/reference rewrites only.
   Its normal CLI requires a clean tree and runs git add, both incompatible with
   this supplied pending merge and read-only .git. No tool or git policy changed.
2. Rebuilt `practice_worker_switch_decision` from the exact 0332 definition,
   preserving its Northside fictional finance/read_only allowance, owner/session
   binding, forbidden wider grants and no-sign-in predicates. The existing MON-8
   entitlement guard precedes worker selection; volatility remains VOLATILE for
   lock/snapshot correctness. A deterministic source comparison tests the entire
   0332 definition plus only those intended differences. The Northside upgrade
   test now supplies explicit active fictional agreements after migrating, since
   MON-8 deliberately never backfills predecessor authority.
3. Folded operative 0402's membership/grant/invitation and site-origin guards into
   0353, including forged job-track refusal and same-role membership revocation/
   expiry updates after agreement loss. There is exactly one replacement
   `mon8_agreement_status_guard`, in 0352: insert-only immutability, synthetic-mode
   restriction, exclusive tenant fence and server timestamp. Included operative
   application boundaries, strict parsers, mock caller adaptations and tests.
   `codex/sandbox/mon8-operative` is superseded and must not be merged separately.
   Its automatic active-agreement bootstrap was intentionally not imported: the
   current branch's explicit owner-only positive fixtures remain authoritative,
   and missing status continues to hold new work without backfill.

Self-attack tests cover forged flags; replay/conflict; small-builder denial at
membership, grant, invitation and both site-origin kinds; cross-tenant denial;
contractor→small-builder→contractor reassignment without a current status;
missing legacy status; retained rows; membership expiry/revocation and scoped grant
revocation after suspension; and callable helper/trigger ACLs. The concurrency
case inserts suspension first and relies on the actual status trigger's exclusive
lock (no manually acquired substitute), then requires the blocked operative insert
to observe suspension after commit. These PostgreSQL assertions are authored and
collected, not executed locally. No CASE expression occurs inside a PL/pgSQL IF
condition in these two migrations; existing parenthesised expressions remain.

Local checks actually run (Node v24.17.0, installed tools, no downloads):

- `node packages/db/node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit`:
  passed. DB build using the same config without --noEmit also passed.
- Same installed tsc with `-p apps/api/tsconfig.json --noEmit`: passed, including
  the adjusted membership-refusal mock. Config and AI package builds also passed
  to populate missing local dist dependencies for caller tests.
- Strict standalone tsc (`--noEmit --strict --noUncheckedIndexedAccess
  --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext
  --moduleResolution NodeNext`) on the operative integration, operative upgrade,
  contractor entitlement upgrade and Northside finance upgrade files: passed.
- From packages/db, `node node_modules/vitest/vitest.mjs run --maxWorkers=2
  test/mon8-combined-migration.test.ts src/plan-entitlement-service.test.ts
  src/outbox.test.ts`: 3 files, 13 tests passed.
- From apps/api, Vitest with `run --maxWorkers=2` and no more than three named files
  per invocation: operative-entitlements.application (11 passed) and
  site-extra-pricing.application (71 passed); site-extra.application,
  contractor-retained-read.application and offline-risk.application (48 passed);
  site-extra-evidence.application, site-visit.application and
  plan-entitlements.persisted (69 passed). Earlier attempts exposed missing db,
  config and AI dist outputs; rebuilt installed packages. Two initial membership
  tests then failed because their legacy SQL stub omitted the new entitlement
  projection; supplied a positive projection to preserve the real independent
  inactive-member check, then both passed. No assertions were weakened.
- From packages/db, Vitest `list --maxWorkers=2` on operative-entitlements,
  operative-entitlements-upgrade and northside-finance-upgrade integration files:
  all 12 cases collected. Listing does not run hooks or PostgreSQL assertions.
- Core purity (10 existing computed-import notices), money arithmetic and commercial
  boundary tools: passed. `git diff --check`: passed. Working-tree lane coverage
  checked with the existing `loadLanePolicy` / `lanePathAllowed` APIs against
  MERGE_HEAD plus untracked files: 67 paths covered. This is a deterministic path
  check, not committed-head lane CI or independent review.

Delivery boundary: the supplied catch-up MERGE_HEAD is fe80add539fc9f97028b90420918d16759f636ee;
observed origin/main has advanced to 32411c4e45a094cbe65ae90ee1d5debd1f266e2a
(including 0340). Router must stage the two resolved files, finish the supplied
merge, catch up as needed, commit/push and run current-main CI. Index entries stay
UU because the builder cannot write .git; source conflict markers are gone.
Database, migrations, browser and full-repository suites remain for GitHub CI under
the issued sandbox constraint. No PostgreSQL server, localhost, customer data,
live money, providers, release, git mutation or independent acceptance occurred.

No new reporting mechanism or speculative abstraction was introduced. Existing
receipt, contract and exact lane file carry this handoff. Commit message:
`/tmp/mon8-upgrade-successors-20261029T063054Z-commit-msg.txt`.


## 29 October 2026 — 08:13 main catch-up conflict repair

Resolved the sole supplied conflict in
`packages/db/test/contractor-entitlement-upgrade.integration.test.ts`.
Preserved the branch's complete predecessor partition, named-column/type and
unkeyed-multiset comparisons, both migration passes and migration-ledger checks.
Unioned main's OIDC identity tables and four evidence-pack-v3 tables into the
explicit empty successor expectations. Schema-qualified names preserve the
identity/app distinction through the existing identifier quoting helper. Both
merge-stage successor lists compare as included in the resulting 63-table list;
original own-step status rows remain in the populated baseline proof.

Checks actually run with installed Node v24.17.0 tools:

- DB Vitest `run --maxWorkers=2 test/mon8-combined-migration.test.ts
  src/plan-entitlement-service.test.ts src/outbox.test.ts`: 3 files / 13 passed.
- DB TypeScript `-p packages/db/tsconfig.json --noEmit`: passed.
- Strict standalone TypeScript on the resolved upgrade integration file, with
  `--noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes
  --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext`:
  passed.
- DB Vitest `list --maxWorkers=2
  test/contractor-entitlement-upgrade.integration.test.ts`: all 13 cases collected;
  this did not execute PostgreSQL hooks or assertions.
- Deterministic comparison against index stages 2 and 3: all explicit successor
  expectations retained. `git diff --check`: passed.

No git writes or PostgreSQL startup attempted. Source conflict markers are gone;
the index necessarily remains UU until the router stages the resolution. Router
owns merge completion, commit/push, current-main CI including DB/migration suites,
and the required exact-head independent RED review. Incoming main changes were
preserved. Commit message:
`/tmp/mon8-upgrade-successors-20261029T081356Z-commit-msg.txt`.


## 29 October 2026 — PR #302 CI-fix try 2: preserve merged OIDC (RED)

Repair of the independent RED failure at 282f104a. No conflicts remained in the
supplied worktree. Rebuilt 0353's identity.sso_complete from 0347's exact body,
applying only the existing MON-8 commercial-loss changes: current feature lookup,
retained mapped grants without new grants after entitlement loss, revocation of
removed mappings, and the JIT/link feature guard. Preserved 0347's connection-bound
OIDC replay lookup and both replay insertion branches (success and no mapped
grants), alongside its unchanged SAML namespace and sign-in checks.

Added a CREATE OR REPLACE identity.oidc_create inside 0353 from 0347's exact body,
with only its admin check extended to require the server-derived membership's
sso feature. Existing routine identity, owner, signature, search path and grants
are preserved by replacement. Never edited merged 0347 or renumbered 0352/0353.

New real-PG test mon8-oidc.integration.test.ts requires 0353 installed, verifies
OIDC replay rows on successful and no-group outcomes, and directly calls the
installed sso_complete routine to require ASSERTION_REPLAY/23505 for both a reused
assertion and a fresh assertion with the same consumed request. Refusals preserve
sessions, bindings, subjects, replay tables, security events, memberships, grants
and revocations. This deliberately bypasses the application callback's earlier
one-use request check. A positive OIDC admin registration is followed by agreement
suspension: sso_require_admin still returns that owner, but oidc_create must refuse
with FORBIDDEN/42501 and leave connections unchanged. Added oidc_create to the
existing installed entitlement-guard expectation list. PostgreSQL tests are
AUTHORED AND COLLECTED, not executed under this sandbox.

Added deterministic full-body comparisons to 0347 plus only the listed MON-8
changes, matching the existing 0332 preservation test. Regenerated the existing
lp-downstream-effects-v1.md with its checked-in generator after its reproducibility
check detected drift from the merged migrations and this replacement. This is a
source appendix refresh, not a change to frozen LP-0 capabilities or acceptance.
The lane includes the new test and regenerated appendix. LP-0 JSON, SERIOUS-B5 and
contractor-upgrade expectation unions remain unchanged; these replacements add no
new routine identities, tables, policies or grants.

Actual local checks (installed tools, at most two Vitest workers):

- DB Vitest run --maxWorkers=2 test/mon8-combined-migration.test.ts
  src/plan-entitlement-service.test.ts src/outbox.test.ts: 3 files / 15 passed.
- Strict standalone tsc --noEmit --strict --noUncheckedIndexedAccess
  --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext
  --moduleResolution NodeNext on mon8-oidc.integration.test.ts,
  mon8-combined-migration.test.ts and server-entitlements.integration.test.ts:
  passed.
- DB Vitest list --maxWorkers=2 test/mon8-oidc.integration.test.ts
  test/oidc-signin.integration.test.ts test/server-entitlements.integration.test.ts:
  all 18 cases collected. Listing executes neither PG hooks nor assertions.
- node --test --test-concurrency=2 tools/lp-downstream-inventory.test.mjs:
  all 4 passed; generator --check passed after regeneration.
- Existing loadLanePolicy/lanePathAllowed APIs: all six then-changed/untracked
  paths covered. This receipt is already in the lane. git diff --check: passed.
- git diff --exit-code on 0347, 0352, LP-0 JSON, SERIOUS-B5 and contractor
  entitlement upgrade test: passed, confirming no changes to those files.

No git writes, PostgreSQL startup, live provider or release. Ready for router
commit/push and current-main CI, including DB/migrations, then independent RED
review at the resulting exact head. This is not an independent acceptance.
Commit message: /tmp/mon8-upgrade-successors-20261029T083824Z-commit-msg.txt.


## 29 October 2026 — 09:32 CI repair try 3, NOT READY / router Ben card

Read the supplied mon8-upgrade-successors-ci-traces-0932.txt, including its malformed
UTF-8 fragment using replacement decoding. No PostgreSQL or browser execution was
attempted. Resolved the downstream appendix conflict by retaining main #411's
MAX_MIGRATION=347 generator and its new regression test, then regenerating the
appendix with the exact capability union below. The source has no merge markers;
its index remains UU because git writes belong to the router.

Failure groups and changes:

- SERIOUS-B10 source/dist unit failures: the mock still matched the old outbox
  SELECT prefix. Match the exact new authorization_actor projection. Existing
  cancellation, audit, rollback, unavailable-authority and no-delivery assertions
  remain enforced. CI must rebuild generated dist from source.
- Site-jobs-scope source/dist unit failures: supply and assert the new retained_read
  entitlement query in the SQL double; retain scope-query identity, projection,
  row-limit and truncation assertions.
- Offline-risk, site-extra and site-jobs-scope PG membership-revocation failures:
  assertContractorGate performed entitlement SQL before checking membership. A
  revoked member raised raw SQL 42501 and became service-unavailable. Check the
  original identity/active/resource permission first, preserving NOT_FOUND and
  public EXTRA_FORBIDDEN / VISIT_FORBIDDEN. Feature checks still precede work.
  Added three unit regressions proving no feature query on invalid membership.
- Practice-worker-switch owner/small-builder refusals: map only database
  FORBIDDEN/42501 to existing SWITCH_FORBIDDEN, preserving the existing refusal
  audit attempt and uniform target-independent answer. Its foreign sign-in locator
  fixture now inserts the operative under an explicit tenant transaction.
- Contractor hierarchy/FK, party raw-context and origin membership/schema failures:
  0353's added guards preempted established errors. These are actual SQL ordering
  bugs, so 0353 changed narrowly: foreign operative membership reports 23503 before
  feature lookup; party binding rejects missing tenant/member as NOT_FOUND before
  feature lookup; origin provenance validates its existing shape/member/grant
  before requiring the feature on its successful command-origin path. The separate
  early tenant-agreement trigger remains, including forged job-track refusal.
- Audit-checkpoint, enterprise-fee-posting upgrade and legacy-origin R4/S8 failures:
  positive fixtures lacked explicit current agreements after full migration or
  contractor reassignment. Added owner-only seedActiveContractorAgreement calls
  at the precise positive-fixture points, after preservation assertions where
  applicable. Missing-status negative fixtures are unchanged.
- CH-4 role matrix, recovery-terms operative and SH-1 raw-origin fixture failures:
  these suites used database postgres, while the new synthetic operative/site
  guards correctly require jobguard_synthetic_demo. Use that database in their
  fixtures; provide explicit positive contractor authority for operative setup.
  CH-4 retains every non-owner role command-refusal assertion. Recovery terms
  creates a historically valid operative under explicit contractor authority,
  then restores the tenant's builder track before testing role refusal. SH-1's
  raw legacy contractor origins now have explicit fictional tenant authority.
- Server-entitlements and server-entitlement-upgrade MODE_FORBIDDEN: set the
  required synthetic_demo application environment before session-context setup.
- SSO suspension test: authenticate returns undefined on revoked sessions; use
  its exact established return contract rather than null. Revocation assertions
  remain intact. Reviewed sso_complete/OIDC registration changes are untouched.
- LP-0 freeze/path failures: union exactly six installed owner/EXECUTE facts for
  mon8_company_feature, mon8_feature_decision and mon8_require_feature into the
  existing approved-current helper/owner groups. No exception group was added or
  widened; scanner/test logic is unchanged.
- SERIOUS-B5 catalogue failure: its pre-schema compatibility routines were owned
  by postgres and acquired migration ownership on upgrade. Assign those fixture
  shims their actual migration owner up front. Add exactly five new 0352/0353
  routines to the expected catalogue, verifying signature, owner, definer mode,
  search_path and exact ACLs; preserve all existing rows/relations/policies and
  prior expected routine values.
- Retained-read/contractor old-track assertions: resource permission is deliberately
  membership-only; executable new work also requires the current feature. Assert
  that combined capability is false, raw mutation remains refused, historical
  projection remains identical and new commands fail after track loss. The
  operative replay test now requires refusal and identical stored facts after
  agreement suspension, matching the existing reviewed before-replay guard.
- ENT-1 desktop/mobile browser failures: generated practice has no implicit active
  agreement. A test-only route lets the real start finish, explicitly seeds the
  fictional agreement using the owner fixture, then returns the unmodified real
  response. Browser revision, persistence, isolation, stale-state and policy tests
  retain their actual mutation assertions; production/demo bootstrap is untouched.
- CSG installed-source failure: capture replay no longer reads joined receipt
  result JSON; it reconstructs the unchanged RaisedExtra result from the bound
  origin identity with matching receipt hash/status and finite command families.
  Rename the private visit business dispatcher to executeVisit so it is not an
  ambiguous SQL execute call. Remove only the three now-resolved unresolved
  exceptions. Scanner code remains byte-identical, with zero diagnostics and ten
  existing unresolved cases instead of thirteen. No new exception/fingerprint.

Known remaining blocker (NOT repaired by loosening a check): ENT-4b [S9] pins the
pre-MON-8 bridge bytes, while this branch necessarily changed their entitlement
and retained-read behavior. Deterministic SHA-256 comparison still fails for:

- packages/db/src/work-order-repository.ts: expected 9e4d46c5290e25647d714810d67b2efee6f674a1d52f654142297d22c476e22e;
  observed 6f769b3b5261219e8e277b3c8460b19b917fe93e66245d15285af5a04c098418.
- packages/db/src/sor-repository.ts: expected 122322172cea27dc52754ff19629abbbe049b8d96997a1a2e42a8887ac5a62d2;
  observed b66552d4d408c5e476ab9bff44324cf160b741561b5a03926c0697853e31514f.
- packages/db/src/job-scheduling-repository.ts: expected ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d;
  observed 7517df3c6597af44f651c8b704c9bd91c4f40894ce5aa58e3b4fcea16cc9eb57.

The [S9] hash table was NOT changed. Restoring those old bytes would reinstate the
old track gate on historical reads and remove the current service guard; that is
not a valid repair of the approved MON-8 contract. No fingerprint renewal authority
was issued in this repair. This is try 3: router must file the Ben card with these
three protected bridges and obtain the required review/authority or a separately
scoped compatible implementation. This builder did not file a card or update the
external work list from the restricted sandbox. Do not present this candidate as
ready or CI-green; DB/browser effects of the authored fixes also remain unexecuted.

Actual local checks:

- DB Vitest run --maxWorkers=2 src/serious-b10.test.ts
  src/site-jobs-scope.test.ts src/plan-entitlement-service.test.ts src/outbox.test.ts
  src/later-outbox.test.ts test/mon8-combined-migration.test.ts
  test/lp-0-catalog.test.ts: final 7 files / 64 passed. An initial new parameterized
  case supplied an empty argument tuple; corrected its fixture to explicit rows
  objects, then all three invalid-membership cases passed without weaker assertions.
- node --test --test-concurrency=2 tools/lp-downstream-inventory.test.mjs
  tools/commercial-integrity-current-source-guard.test.mjs: 174 passed, no skipped
  tests. After the final private method rename, the installed scanner was rerun:
  67 protected roots, zero diagnostics, ten existing unresolved cases.
- DB tsc --noEmit and web tsc --noEmit: passed. Initial compilation caught an
  incomplete private generic method rename; declaration/call sites now agree.
- Strict standalone tsc with noUncheckedIndexedAccess, exactOptionalPropertyTypes,
  skipLibCheck, target ES2023 and NodeNext on the sixteen affected PG suites:
  passed. Added as-const tuple typing in the contractor matrix exposed by this
  stricter check; behavior assertions are unchanged.
- DB Vitest list --maxWorkers=2: 270 cases collected across those PG suites.
  Playwright test --list e2e/ENT-1.spec.ts --project=desktop: ten cases collected.
  Collection does not execute PostgreSQL hooks, requests or browser assertions.
- Commercial boundary tool and source appendix --check: passed. Working-tree
  lane validation with the existing loadLanePolicy/lanePathAllowed APIs passed;
  this is not committed-head range CI. git diff --check passed.
- Own migration IF-condition inspection found zero CASE expressions requiring
  parentheses. 0352 bytes and all already-main migrations, including 0347, remain
  unchanged. Only the three described SQL ordering fixes alter 0353 this round.

No git mutation, PostgreSQL startup, live provider, real data or release occurred.
New message file begins do not commit:
/tmp/mon8-upgrade-successors-20261029T093229Z-commit-msg.txt.


## 29 October 2026 — round 4 authorised bridge-pin renewal

Ben's issued authority: one more round and exactly the three ENT-4b [S9] bridge
fingerprint updates, answer "Yes, update them" in the 10:15 chat as quoted in this
brief. This supersedes the preceding fingerprint-specific NOT READY disposition;
it does not represent CI, PostgreSQL execution or independent RED acceptance.
Every uncommitted try-3 fix is preserved. The fingerprint registry changes ONLY
the values for work-order-repository.ts, sor-repository.ts and
job-scheduling-repository.ts. Its remaining five entries, comments, keys and
comparison assertions remain unchanged.

packages/db/src/work-order-repository.ts
  old: 9e4d46c5290e25647d714810d67b2efee6f674a1d52f654142297d22c476e22e
  new: 6f769b3b5261219e8e277b3c8460b19b917fe93e66245d15285af5a04c098418
packages/db/src/sor-repository.ts
  old: 122322172cea27dc52754ff19629abbbe049b8d96997a1a2e42a8887ac5a62d2
  new: b66552d4d408c5e476ab9bff44324cf160b741561b5a03926c0697853e31514f
packages/db/src/job-scheduling-repository.ts
  old: ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d
  new: 7517df3c6597af44f651c8b704c9bd91c4f40894ce5aa58e3b4fcea16cc9eb57

Checked current origin/main 7eef37d694d98e95eb76baae95169e089e3b98e5, which
contains 0356/0357 (LP-2) and 0358 (CH-9 p2). Among MON-8's replacement routines,
only work_order_begin overlaps definitions introduced after merged 0347. Rebuilt
its body directly from origin/main's 0356_unchecked_job_doors.sql plus only the
existing MON-8 feature guard. This preserves the LP-2 job-insert permit row and
shape binding. Deterministic full-body comparison against that main SQL passed.
No already-main migration was edited; 0352 is unchanged. The reviewed OIDC bodies
remain protected by the existing full-body source comparison tests.

The worktree has NOT received a clean current-main merge: MERGE_HEAD is still
baad7d56475e8ccce7ce6e39dccff33bfb77d3e1 and the previously resolved source appendix
remains UU in the read-only index. Therefore the brief's renumber condition was
not satisfied. Per its explicit fallback, left 0352/0353 numbers unchanged. Router
must finish that pending merge, catch up main through 0358 and renumber this
candidate to reserved 0365/0366 with tools/migration-renumber.mjs, preserving the
candidate SQL bytes. That order is necessary so 0356 cannot subsequently replace
the MON-8 work-order feature guard. No clean-merge claim or git write was made.

Local checks actually run this round:

- From packages/db, installed Vitest run --maxWorkers=2
  src/plan-entitlement-service.test.ts test/mon8-combined-migration.test.ts:
  2 files / 12 passed.
- Installed DB tsc -p packages/db/tsconfig.json --noEmit: passed.
- Extracted the actual [S9] registry and computed SHA-256 from all eight files:
  all match. Compared registry entries against HEAD: exactly the three authorised
  values differ; all other entries match. This deterministic check does not run
  the PostgreSQL hooks of the enclosing integration suite.
- work_order_begin source equals latest main 0356 plus only its MON-8 guard:
  passed. New main migrations 0357/0358 replace none of this lane's routines.
- git diff --check: passed. No PostgreSQL/browser startup or git mutation.

Ready for router catch-up/commit/push and CI, then the required independent RED
review against the resulting exact head. The instruction to ignore main-wide
inventory/core-export failures is respected; no additional repair was attempted
for those checks. Earlier tests remain recorded as earlier evidence, not rerun
or represented as this round's execution. New commit message:
/tmp/mon8-upgrade-successors-20261029T101233Z-commit-msg.txt.

## 29 October 2026 — PR #302 reviewer merge precondition

MON-8 RED catch-up from reviewed c98b9fda. The router prepared a merge of
origin/main f56a25201426b2b8afb60c2d904a94195d8ba1e9 (also MERGE_HEAD).
Resolved the four remaining working-file conflicts, keeping both imports and
both SERIOUS-B5 additive expectation helpers, main's parameterized job-work
fixture, and the contractor successor expectation union including
app.lp_job_insert_permit. LP-0 authority/grant-freeze and tenancy tests equal
main; LP-0's privilege inventory retains main plus the existing six MON-8 keys.
No new behavior, routine recreation or unrelated expectation repair.

Used tools/migration-renumber.mjs's exported planRenumber with the reviewer’s
reserved floor (numbers through 0364 unavailable) to move 0352 to 0365 and 0353
to 0366, and rewrote full-stem references in branch-owned changed files. The
CLI --write path cannot be used in this pending merge/read-only .git environment:
it requires a clean tree and invokes git add. No git write was attempted.
Both SQL files compare byte-for-byte with c98b9fda's originals. All 147 SQL
migrations on current main compare byte-for-byte unchanged, and no older branch
migration copies remain. The complete S9 fingerprint registry is unchanged from
c98b9fda; all eight current source hashes match, including the three renewed
ENT-4b pins. work_order_begin still equals latest main's 0356 definition plus
only the existing MON-8 guard; 0366 now executes after it.

Checks actually run:
- Installed DB Vitest: --maxWorkers=2 src/plan-entitlement-service.test.ts
  test/mon8-combined-migration.test.ts — 2 files, 12 tests passed.
- Installed DB TypeScript: tsc -p tsconfig.json --noEmit — passed.
- TypeScript transpile diagnostics on the four resolved conflict files — passed
  (syntax check only, not database execution).
- Deterministic SQL-byte, latest-main routine, S9 registry/hash, LP-0 and tenancy
  comparisons described above — passed.
- node --check tools/migration-renumber.mjs and git diff --check — passed.
- Initial pnpm invocations stalled before runner output; interrupted both and
  used installed packages/db/node_modules/.bin executables successfully without
  downloading packages. An attempted tools/migration-renumber.test.mjs command
  found no such test file; no helper-test pass is claimed.

Ready for router staging of the four conflict resolutions and renames, completion
of the pending main merge, commit/push, then GitHub CI. The read-only index still
reports the four paths as unmerged; working files contain no conflict markers.
PostgreSQL/browser suites were not run here, per sandbox constraints. No real
customer data, providers, releases, git mutation or fresh RED review occurred.
Prior RED evidence is c98b9fda; this receipt does not claim review of a new head.
Commit message: /tmp/mon8-upgrade-successors-20261029T103153Z-commit-msg.txt.

## 29 October 2026 — post-main A17 fixture catch-up

PR #302 / MON-8 RED; catch-up after router merged main, not a new repair round.
Read codex-runs/mon8-upgrade-successors-ci-traces-1131.txt: exactly one reported
failure, site-extras route [A17], expected 201 but received 503 at line 45.
The context-stamp fixture mocked session lookup and the site-extra writer but
not MON-8's server-side contractor entitlement lookup. That lookup reached the
fixture's deliberately rejecting pool.connect before the writer, producing the
503. Added a positive requireFeature test stub scoped to A17, using the same
pattern as the other site-extra application fixtures. Its existing finally block
restores the spy. Every existing test statement and tamper assertion is identical;
production authorization and refusal handling are unchanged. Added this test path
to the existing lane. No pending conflicts were present.

Local verification:
- Installed web Vitest --maxWorkers=2 on
  app/api/contractor/jobs/[id]/site-extras/route.test.ts and
  app/api/contractor/jobs/[id]/site-extras/sor/route.test.ts: 2 files, 78 passed.
- Installed tsc -p tsconfig.json in apps/api, packages/core and packages/db:
  passed. These restored missing/stale ignored dependency build outputs before
  the final route run. Earlier collection attempts failed for absent API dist
  and then stale core dist; no production source repair was needed.
- Byte comparisons against starting HEAD f0b062de: 0365/0366 SQL, S9 fingerprint
  registry, all three re-pinned source files, and the protected
  docs/contracts/lp-downstream-effects-v1.md unchanged.
- Removing only the two added fixture lines reproduces the original test file
  byte-for-byte; all A17 assertions are preserved. git diff --check passed.

Ready for router commit/push and CI. No git writes, PostgreSQL startup, real data,
provider calls, releases or new independent RED review. Database suites remain
for GitHub CI. Commit message:
/tmp/mon8-upgrade-successors-20261029T113200Z-commit-msg.txt.

## 29 October 2026 — catch-up after MON-4A #407 and DEMO-J3 #410

Resolved the two remaining working-tree conflicts in the router-started merge of
origin/main db2aff37b1207ba0c543c3e6bd32f2a26f8a9af8 into starting HEAD
fe34bdb1cc88bc46db947bc9a9460cc026d3a653. Kept both plan-entitlement and
payment-fee repository exports. Added payment_fee_command and
payment_fee_statement to MON-8's existing empty-successor list, retaining its
two-pass preservation proof. No routine recreation or new behaviour.

Deterministic comparisons confirmed all main migration and lane files unchanged
(300 paths), all main LP-0 expectations retained exactly, both sides' SERIOUS-B5
and tenancy expectation lines retained, and all 50 explicit main app-table empty
successor expectations retained. 0365/0366 SQL, the ENT-4b fingerprint registry,
all three re-pinned source files, and docs/contracts/lp-downstream-effects-v1.md
are byte-identical to starting HEAD. No migration numbers or SQL bytes changed.

Local validation:
- packages/db installed Vitest: --maxWorkers=2 test/mon8-combined-migration.test.ts
  src/plan-entitlement-service.test.ts — 2 files, 12 tests passed.
- Installed tsc -p packages/db/tsconfig.json --noEmit — passed.
- TypeScript syntax parsing of both conflict-resolved files — passed.
- git diff --check — passed; no conflict markers remain in either resolved file.
- Deterministic lanePathAllowed check of the working tree against origin/main:
  all 85 changed paths allowed before this receipt update (receipt is already
  in the lane). This is not the post-commit CI lane check.
- node tools/lint.mjs: core purity passed; lane guard failed because its local
  mode compares the old unmerged HEAD and includes staged incoming main files.
  Did not widen the lane to cover main's unrelated MON-4A/DEMO-J3 files.
- pnpm --version stalled in the machine's wrapper and was interrupted; used
  existing installed executables directly. No packages downloaded.

Ready for router staging and merge commit, push and GitHub CI. The index still
reports the original two unmerged entries until the router stages these resolved
files; .git is read-only here and the builder ran no git writes. PostgreSQL and
browser suites remain for CI under the issued sandbox restrictions. RED:
independent exact-head Claude review remains with the loop owner.
Commit message: /tmp/mon8-upgrade-successors-20261029T121301Z-commit-msg.txt.

## 29 October 2026 — Round 5, Ben's final extra round (~14:25)

Status: NOT READY / do not commit. Router must park if the unresolved checks
cannot be resolved within the issued authority; no further repair round inferred.
Starting HEAD dfb8a644bcec9de76aa139ae5ed7c358d0076576; pending merge target
60552dcb50d888bd65d630531e9079680550c3ae. Read the full CI failure trace file
mon8-upgrade-successors-ci-traces-1522.txt in bounded sections. No git writes.

Changes and traced causes:
- LP2-A12: its new direct startPractice fixture omitted the explicit positive
  agreement needed before prepareWorkOrderDemo imports its SoR. Added the
  existing owner-only agreement fixture; all LP-2 assertions remain.
- PW15/PW16 invitation setup: direct owner inserts omitted transaction-local
  tenant context required by the operative trigger. Use existing ownerTx for
  the pre-marker invitation setup; post-marker refusal assertions remain.
- PW33/RC2 handBuilt: explicit hand-built contractor had no active agreement
  before inviting its operative. Seed explicitly before that command.
- SSO emergency E1: operative membership and grant fixture inserts now run with
  tenant context; the already explicit agreement and all role refusals remain.
- Recovery T2, shared-money-origin setup, CH-4 non-owner roles: new contractor
  track assignments omitted their deferred same-ID audit events. Append real
  commercial_track.assigned events through appendAuditBatch in each assignment
  transaction, including restoration of the recovery fixture's prior track.
- ENT-3a/3c HTTP tests mocked database I/O but omitted the new entitlement
  dependency. Add the same positive requireFeature spy used by the existing
  application tests; preserve every HTTP response, no-write and tamper assertion.
- SAML/OIDC/SSO-required browser fixtures lacked explicit agreement authority.
  Seed it after their persisted owner transaction using the existing helper.
- ENT-2/9/11a/11b browser journeys lacked agreement before their next command.
  Reuse ENT-1's fixture pattern: await the real start response, seed explicit
  fictional agreement owner-side, return the unchanged response. A small shared
  browser fixture avoids copying this setup into four suites; no production
  authority or automatic agreement activation was added.
- LP0-17: the recorded inventory omitted seven existing MON-8 routines. Add
  their identities and source-inspected protection/call facts to the existing
  JSON inventory, retaining every prior/main expectation and the protected MD.
- Work-order tenant-boundary refusal: MON-8's work_order_begin guard ran before
  main's principal check, changing NOT_FOUND to FORBIDDEN. SQL BUG EXCEPTION:
  0366 changes only the position of that one entitlement check, after principal
  validation and before all writes. Started from the latest 0356 definition on
  the pinned main and retained its whole body plus the entitlement check.
  No migration already on main changed. 0365 is unchanged. CASE-in-IF lint passes
  without exceptions or SQL CASE edits.
- Merge conflicts: union job_import_v3 into the entitlement successor list;
  retain main's explicit pre_cover_photo default in the work-state fixture.

Unresolved, deliberately not bypassed:
1. The real context-boundary suite still fails two assertions: its reviewed
   source registry has older work-order/SoR/job-scheduling hashes than the
   three preserved ENT-4b pins and source files. The scanner explicitly requires
   renewed caller review. No scanner hash, exception or pinned source changed;
   no review approval invented.
2. Q5 in work-order-import still expects overview to reject after track loss,
   while MON-8's pinned retained_import implementation deliberately preserves
   those reads. Did not change that assertion, loosen entitlement, or rewrite
   pinned code. This contract/test conflict remains for the loop owner.
3. origin/main advanced during the run to 72226d28b8f095956e7ae9b728a0f024c2bc3590
   while MERGE_HEAD remains 60552dcb. The newly arrived main migrations/lane
   files are not part of the pending merge. No manual partial import was made;
   a router catch-up is needed before current-main CI.

Local evidence:
- Installed database Vitest --maxWorkers=2 on mon8-combined-migration.test.ts
  and plan-entitlement-service.test.ts: 12 passed across two files.
- Installed API Vitest --maxWorkers=2 on auth/context-boundary.test.ts:
  143 passed, 2 failed as described above. No retries or altered expectations.
- Installed tsc --noEmit for packages/db, apps/api and apps/web: passed.
- An additional ad hoc check initially included incoming main dashboard tests:
  four type diagnostics in those untouched main tests. Narrowed to the nine
  edited DB fixture/conflict files: zero TypeScript diagnostics.
- node tools/plpgsql-case-in-if-lint.mjs: 152 migrations, zero exceptions, passed.
- Byte checks: all 306 pinned main migration/lane files unchanged; 0365,
  protected MD, ENT-4b registry, three source files and boundary scanner exactly
  match starting HEAD. Both-side LP-0/SERIOUS-B5/tenancy expectations preserved;
  entitlement successor expectations unioned. Only the documented 0366 guard
  ordering differs among this branch's SQL.
- Deterministic lane path check against pinned MERGE_HEAD: 97 paths allowed,
  including the new browser helper. This is not a post-commit CI lane result.
- git diff --check passed; no conflict markers remain in the two resolved files.

PostgreSQL, browser and localhost HTTP suites were not executed in this sandbox;
fixture/SQL repairs are source-inspected and typechecked, not DB-verified. Made-up
fixtures only; no provider actions, releases, commits, pushes or independent
RED acceptance. Router must stage resolved entries if subsequently proceeding.
Handoff: /tmp/mon8-upgrade-successors-20261029T152220Z-commit-msg.txt.

## 29 October 2026 — final go, Ben's explicit scanner-lock authority (~15:52)

Status: READY for router staging, Git merge completion and commit/push, followed
by CI and exact-head RED review. This section supersedes the Round 5 holds above.
No further repair round is inferred if this final attempt fails.

Kept every Round 5 repair. Updated ONLY the three authorized hash values in
apps/api/src/auth/context-boundary.test.ts; no scanner rule, other entry or
source changed. Existing ENT-4b pins and their three source files are untouched:
- work-order-repository.ts:
  9e4d46c5290e25647d714810d67b2efee6f674a1d52f654142297d22c476e22e ->
  6f769b3b5261219e8e277b3c8460b19b917fe93e66245d15285af5a04c098418
- sor-repository.ts:
  122322172cea27dc52754ff19629abbbe049b8d96997a1a2e42a8887ac5a62d2 ->
  b66552d4d408c5e476ab9bff44324cf160b741561b5a03926c0697853e31514f
- job-scheduling-repository.ts:
  ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d ->
  7517df3c6597af44f651c8b704c9bd91c4f40894ce5aa58e3b4fcea16cc9eb57

Resolved Q5 at the obsolete test contract: seed an actual saved order and compare
its register, batch and revisions before/after track loss. BOTH new order and
SoR import refusals and the no-write count assertion remain. A gate-level unit
regression additionally exercises every import/sor/member new_work gate and both
read-only retained gate purposes after track loss. No production gate changed;
retained eligibility remains internal and read-only.

The supplied pending MERGE_HEAD was still 60552dcb50d888bd65d630531e9079680550c3ae.
Applied the current-main content delta through 72226d28, then through the observed
new main cd8703fc90885ecada114adce4d7aa7d9b739065 (migrations through 0375), using
read-only git show/diff/merge-file -p and working-tree writes. Unioned the MON-3
recorded routine inventory and seven trial successor-table expectations; kept
both sides' shared expectation rows and Round 5 fixtures. No conflict markers
remain. The router must complete Git ancestry as well as stage files: .git is
read-only here, so MERGE_HEAD/index cannot be updated by this builder.

Renumbered 0365 -> 0378 and 0366 -> 0379 using the exported planRenumber planner
in tools/migration-renumber.mjs with the issued reservation ceiling 0377, then
filesystem moves and the tool's reference-replacement rules. The CLI dry run
otherwise proposed 0374/0375 against main at 0373. Its write mode requires a
clean tree and stages with git add, so it was not run in this dirty, read-only
Git sandbox. The tool itself is unchanged. All executable filename references,
contract references and the lane use the new stems. 0378 is byte-identical to
starting HEAD's 0365; 0379 differs from its 0366 ONLY by the documented Round 5
work_order_begin guard-order fix. No SQL already on main changed. The latest
0373 mon2_issue remains byte-identical; neither own migration recreates it or
any routine newly defined in 0369/0372/0373/0374/0375.

Validation performed with installed executables, no downloads, <=2 workers:
- API context-boundary.test.ts: 145 passed after the authorized lock update.
- DB mon8-combined-migration.test.ts and plan-entitlement-service.test.ts:
  13 passed across two files, including the new read/write gate regression.
- Final tsc --noEmit for packages/db, apps/api and apps/web: passed.
- Focused TypeScript program for 11 edited DB tests/fixtures: zero diagnostics.
- CASE-in-IF lint: 157 migrations, zero exceptions, passed.
- Byte comparisons: all 315 latest-main migration/lane files identical;
  protected docs/contracts/lp-downstream-effects-v1.md and all three pinned
  sources/ENT-4b registry match starting HEAD. Scanner diff is exactly three
  authorized hash substitutions. Own SQL bytes match the stated exception.
- Latest-main LP-0 inventory retained exactly; both-side SERIOUS-B5/tenancy
  expectation string values retained; all 57 explicit main app-table successor
  expectations retained. No newly merged main routine is overwritten by own SQL.
- Exact filesystem delta against cd8703fc: 98 paths, all in the own lane;
  pure lane schema/path and migration-order checks passed. The normal local CI
  lane command cannot give a meaningful final-range result before the router
  stages/completes the merge; post-commit CI remains required.
- git diff --check passed. No Git writes, DB startups, localhost HTTP/browser
  runs, provider activity, real data or releases.

Database upgrade/integration tests, HTTP/browser journeys, full CI and the RED
review still run through the router. This is a local repair handoff, not an
independent review or merge/release claim.
Commit message: /tmp/mon8-upgrade-successors-20261029T154727Z-commit-msg.txt.
