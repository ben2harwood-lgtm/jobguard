# CH-4-C builder receipt — Sub-order A

18 October 2026. Builder: Codex. Base inspected:
`b881f90be0a6d368838ca4392338147ef819bd3a`; branch `codex/sandbox/ch-4-c`.
Migration `0201_job_work_state_commands.sql`. Working-tree delivery only: no git
add/commit/push, no browser, Playwright or real provider execution. PostgreSQL
proofs were not run; see the interrupted mixed-suite selection below.
Dependencies were supplied; no install/download was performed by the builder.
A clean pinned-install result is **not** claimed.

**Disposition: implementation delivered with holds; NOT technically accepted and
NOT a complete CH-4 card.** No independent model verdict exists for this diff.
RED requires two independent Claude checks bound to the dispatcher's exact commit,
then a separate actor's acceptance. Founder owns commit/push/merge/release.

## Implemented source

- Strict versioned lifecycle/link mutation schemas, persisted active-owner session
  checks, exact directly owned small-builder synthetic jobs and both link endpoints.
- SQL expected revision, shared tenant-wide watchdog command identity and legacy
  identity reservation, canonical hash, receipt, immutable event/link and audit.
  Replay rechecks authority and returns the stored first snapshot without effects.
- Finish/cancel/close; locked reopen for non-site administration; resume/unlocked
  reopen fail closed through a private capacity seam pending B. Linking creates
  no job/activation/fee and retains exact current party bindings and cycle guards.
- Serialized closed-state gates for new checks including completion, reveal, and
  new lock-bound invoice use. Successful invoice replay remains before the guard.
  The complete 0187 PDF routine is copied unchanged except that guard. Legacy
  invoice debt is not claimed fixed. Safety/emergency disclosure is untouched.
- Existing image refusal remains purpose-independent; diary/message/original
  insert guards now serialize and refuse post-lock intake. No snagging exception.
- Nest/Next POST, shared application/repository, no-store typed refusal,
  generated OpenAPI, ruling 107 registry and real shared harness entries.
- Shared London calendar version, day31, original microsecond fact comparison,
  7/30/90 date candidates and immutable switch-live trial origin with earlier
  lock/close/second-live termination facts. MON-3 retains qualification ownership.
- Required named core/API/Next and real PostgreSQL suites, including concurrency,
  rollback, source boundaries, link cycles and isolated predecessor upgrade.

No screen, commercial money rule, external action, fee, AI, provider, identity
bridge, historical backfill or fingerprinted-table column was added. Existing
source receipt times and the original command/read contracts remain intact.

## Executed checks

Installed runtime: Node `v24.17.0`; installed compiler `5.8.3`; Vitest `4.1.11`.
Commands below use local installed binaries because pnpm's version switch failed.

| Command actually executed | Result |
| --- | --- |
| Core failing-first direct Vitest for new suites before implementation | FAILED as expected: absent timing module and three absent transition-function failures. This is core-only red evidence. |
| `./node_modules/.bin/vitest run src/job-work-state-commands.test.ts src/job-work-timing.test.ts src/job-work-state.test.ts src/jobs-on-the-go.test.ts --maxWorkers=1` (cwd core) | PASS: 4 suites, 64 tests, including final rerun after edits. |
| Core `vitest run src --maxWorkers=1` | 112 suites passed, 1 failed; 2,815 tests passed, 1 failed. Unchanged `receipt-allocation.test.ts` working-size test timed out at 5 seconds. |
| Focused `vitest run src/receipt-allocation.test.ts --maxWorkers=1` | 32 passed, 2 timed out at 5 seconds (2,000-line exact aggregation and working-size bound). No timeout/test was weakened. |
| Initial unfiltered core `vitest run` after build | Interrupted: it also collected generated `dist/*.test.js`, whose TS-source inspection assumptions fail; not counted as a source-suite pass. |
| API `vitest run src/job-work-state-commands.test.ts src/job-work-state.test.ts src/watchdog-registry.test.ts --maxWorkers=1` | 126 tests passed, 5 failed across 2 discovered suites. New command suite passed; five failures are unchanged registry assertions described below. `src/job-work-state.test.ts` does not exist and supplied no coverage. |
| Web `vitest run 'app/api/jobs/[id]/work-state/route.test.ts' --maxWorkers=1` | PASS: 8 unit tests. This is mocked transport coverage, not browser/runtime PostgreSQL proof. |
| `node --test tools/*.test.mjs` | 99 passed, 1 failed: exact issued lane allowlist conflicts with lane-file validator. |
| Direct `tsc -p` for core, config, AI, storage and DB | PASS, generated local ignored build output; core/DB repeated after changes. These are compiler checks, not live integrations. |
| Direct API `tsc -p tsconfig.json --noEmit`; `nest build` | PASS. |
| Strict direct NodeNext TypeScript check of all new DB suites/helper | PASS; PostgreSQL NOT RUN. |
| `node --import tsx src/generate-openapi.ts` and same with `--check` (cwd API) | PASS. Avoids tsx CLI IPC listener; no HTTP listener or database connection was started. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | Core purity passed; lane gate refused no-commit self-comparison. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | FAILED: missing branch/self-comparison range; no commit was made to bypass it. |
| `loadLanePolicy(process.cwd())` using the unchanged lane validator | FAILED: own lane file in exact issued allowlist is forbidden by validator. |
| `git diff --check` | PASS. |

Web final build/typecheck results are recorded in the final-check addendum below.
Initial web build failed because API build artifacts had not completed; rerun
started after `nest build` passed. Initial API failing-first attempt failed at
missing package build resolution, **not** at the intended behavioural assertion.
No API or database failing-first execution is claimed from that attempt.

The installed pnpm launcher attempted to select pinned `10.28.1` and failed its
registry-signature fetch (`fetch failed` for the pnpm executable/package). Direct
local binaries were used without installing packages or relaxing verification.
Thus aggregate `pnpm typecheck/lint/test/build/openapi:check` green results are
not claimed. Root `pnpm test` includes the prohibited PostgreSQL suite and was not
run as an aggregate. The direct equivalents and their limits are listed above.

## Required proofs NOT RUN

`pnpm test:db`, `pnpm test:migrations`, all new four PostgreSQL integration suites,
existing CH-4 source/post-lock/race/catalog/upgrade suites, shared watchdog
replay/lock-order DB suites and PostgreSQL context/shadow-isolation proofs:
**NOT RUN** because dispatcher forbids starting PostgreSQL in this sandbox.
Written tests are not database evidence. A later API regression selection
mistakenly included `shadow-isolation.application.test.ts`, whose setup starts
PostgreSQL and servers after an automatic web-build prerequisite. On inspecting
that setup, the grouped process was interrupted (exit 130); its log contains only
the Vitest RUN banner and no test results. No PostgreSQL/server success or test
execution is claimed from that attempt. The safe subset was selected separately.
Browser/`pnpm test:e2e`/Playwright:
**NOT RUN**, explicitly prohibited. No browser was launched.

`pnpm eval`: inapplicable; no model, prompt, extraction schema/parser, matching
policy or AI gateway changed. Compiling the unchanged AI package does not count
as a live model evaluation.

## Item-specific STOPs and checker blockers

1. **STOP T-01 — timer instant/interval convention only.** Before:
   `BUILD_PLAN.md:1353–1360` and `:1372–1376`, old held scope at
   `docs/contracts/job-work-state-v1.md:35`. After:
   `packages/core/src/job-work-timing.ts:64` explicitly refuses instant resolution;
   `docs/contracts/job-work-timing-v1.md:26` records the missing clock/DST/tie rule.
   No operational counting intervals or implicit restart places are derived.
   Existing sources still record immutable facts; B must add source restart
   admission before interpreting those facts as new places. No restoration of
   past stopped/billed intervals or restarted trial was invented.
2. **Capacity handoff B.** `0201_job_work_state_commands.sql:31` supplies an
   always-refusing private admission seam; unlocked reopen/resume cannot commit.
   `job-work-state-admission.ts` is the typed transaction-bound integration seam.
   No fixture snapshot or cached count authorizes admission. Shared exhaustive
   resume success/replay cases intentionally remain unavailable, not skipped.
3. **Exact lane conflict.** Before validator:
   `tools/agent-lane-boundary-lint.mjs:63` rejects every `config/lanes/*` allow
   entry. After issued exact list: `config/lanes/ch-4-c.json:11` includes itself.
   Both the issued list and validator were preserved. Dispatcher must reconcile
   this authority mismatch; builder did not silently edit either rule.
4. **Registry/observer compatibility.** Before unchanged
   `apps/api/src/watchdog-registry.test.ts:373` treats a null regex match as an
   array, and `:386–390` treats `#action` as literal URL text and requires one
   legacy 409 enum. Ruling 107 now requires action-qualified keys and checked SQL
   commands with richer typed refusals. The exact Nest key equality assertion
   also fails. After: registry contains all six required action entries and
   command identities; SQL owns current authority/live/transaction guards.
   The five executed failures are retained, not evaded with fake guard calls.
   `packages/db/test/watchdog-lock-order.integration.test.ts:33–34` additionally
   assumes the original imported fixture job and a separate share-lock statement;
   real CH-4 commands use directly owned ordinary practice jobs and an SQL command
   boundary. This is source-inspected, NOT an executed DB result. Existing
   exhaustive assertions remain unchanged; coordinator work is required.

## Migration, compatibility and operational limits

See `packages/db/migration-notes/0201_job_work_state_commands.md` for exact
routines, ACLs, serializer order, forward-fix recovery and B rollout dependency.
Two public runtime EXECUTE signatures, six new routines, five definition
replacements and a six-kind extension to the existing watchdog identity CHECK;
no business table write grants or columns. Inventory updates are exact signatures
and source-inspected definitions only; null new/changed PostgreSQL definition
hashes require real catalogue capture in CI, not a bulk baseline refresh.

GET and historical receipts remain compatible. Mutation response is the stored
first read snapshot; current revision is max work-event sequence plus outgoing
link count. Capacity failures are explicit `CAPACITY_ADMISSION_UNAVAILABLE`.
No new background work or operational alert provider exists; typed refusal is
observable through the current application error boundary. Production gates,
D01/D02/D03/D08/D09/D16 and every existing real-use gate remain closed.

Shared registry/composition/OpenAPI edits must serialize with other builders at
integration. No test except the expressly superseded catalogue expectations was
changed outside the issued allowlist. All checks above are builder evidence;
none is an independent verdict or founder acceptance.

## Final-check addendum

- Web `tsc -p apps/web/tsconfig.json --noEmit`: PASS.
- Final web `next build`, after API build output existed: PASS, 41 static pages
  generated and dynamic routes built. Existing CSS autoprefixer warnings and
  multi-lockfile root warning remain. This was a build, not browser execution.
- Final strict TypeScript check of the new DB test files/helper: PASS.
- Existing `job-work-state-syntax.test.ts`: PASS, 10 lexical tests. It is a
  lexical check of 0144, not a PostgreSQL parse/execution of 0191.
- Working-tree path audit: all 35 changed/new files fall within the dispatcher's
  exact allowlist. This manual path comparison is not a passing official lane gate.
- Intended conventional commit message written to `/private/tmp/jg-msg-ch-4-c.txt`.
- Socket-free API regression selection (existing CH-4 application/controller/http/
  isolation, new commands, auth context boundary): 167 passed, 1 failed across
  six suites. Failure is unchanged `job-work-state.http.test.ts:44`, which asserts
  the prototype has only `constructor,get` and no mutation method. Required POST
  now adds `post`. That file is outside the allowlist and only catalogue
  supersession was authorized, so the expectation remains unchanged and is a
  coordinator blocker, not an implementation test pass.
- Final API command unit rerun after adding no-store handling before identity
  refusals: PASS, 8 tests. Final API TypeScript noEmit check: PASS.
- Final OpenAPI check after the controller header change: PASS.
- Executed source comparison confirms the 0191 invoice routine equals 0187
  byte-for-byte after removing the single added open-state guard. This is source
  comparison, not a database/PDF integration result.

## r1 (ruling 114)

18 October 2026. Repair of PR #290 at inspected head `0b5b6c94`, branch
`codex/sandbox/ch-4-c`. Working-tree delivery only; no git write, commit or push.
This receipt is builder evidence, not an independent verdict or acceptance.

Applied within ruling 114:

- (a) finish/cancelFinish/resume entrypoints now carry requireLiveJob prechecks;
  active finish/cancel calls run that precheck inside the same tenant transaction
  before the SQL command. The generic command boundary dispatches through those
  entrypoints. Active watchdog guard entries require one call. Resume is held
  before execution, per (e).
- (b) only strip the trailing action qualifier for Nest route-key comparison
  (deduplicating the resulting route keys) and OpenAPI lookup. Other registry
  assertions, including the exact 409 enum, remain unchanged.
- (c) generated OpenAPI and runtime work-state conflict mapping retain the exact
  409 codes JOB_NOT_LIVE / IDEMPOTENCY_CONFLICT. Repository identity collisions
  surface the existing WatchdogError IDEMPOTENCY_CONFLICT. No test was changed.
- (d) prototype assertion is exactly constructor/get/post; added the POST
  no-store metadata assertion without deleting the GET assertion.
- (e) removed resume transport/command registry keys, guard registration, shared
  harness case, SQL identity kind and execution branch. Explicit resume refusal
  remains; MON-1-PLACES is required before registering an executable action.
- (f) restored the original random tenant/member/user/account setup and original
  CONFLICT regex. Existing harness cases are unchanged from origin/main. Added
  finish/cancel cases remain subject to STOP R1-F below.
- Added the two newly permitted test paths to config/lanes/ch-4-c.json.
- Parenthesised the CASE expression in the version condition of the internal
  app.ch4_work_state_command implementation called by ch4_record_work_state.
  Re-read the whole 0191 migration and inspected every CASE/WHEN occurrence:
  no other CASE embedded in an IF/WHEN condition was found. Other CASEs occur
  in INSERT values or SQL SELECT expressions. This is source inspection only,
  not a PostgreSQL parse or fresh-migration proof.

### Item-specific STOPs and remaining failures

**STOP R1-F — added shared harness cases.** The required restoration is complete,
including the unrelated user/account substitutions. Making the added cases pass
in the restored harness is blocked by the existing practice authority contract:
0094 constrains owned jobs to the fixed demo tenant, and practice authentication
requires the fixed demo membership/user. The existing harness uses a random
tenant/member and its cross-case assertions rely on one tenant-wide identity
namespace. The added prepareWork currently cannot issue an authenticated practice
session from that setup. Moving just the added cases to another tenant would
invalidate the cross-case collision proof; changing the original identities is
expressly forbidden. No authentication bypass, fixture policy relaxation or
existing-case edit was made. Coordinator must supply/approve a compatible fixture
approach; the added cases are NOT claimed executable or verified.

**STOP R1-C-TEST — unchanged command assertion conflicts with the ruling.**
apps/api/src/job-work-state-commands.test.ts:35 requires a JOB_WORK_CLOSED body
at status 409. Ruling 114(c) permits only JOB_NOT_LIVE / IDEMPOTENCY_CONFLICT at
409 and forbids changing tests. Runtime follows the ruling; that test remains
unchanged and fails. Registry and HTTP suites pass. No weaker mapping was used
just to satisfy this assertion.

**Lane check hold:** origin/main now contains migration 0192; lane lint refuses
0191 because it must be above the base's highest migration. This repair was
explicitly scoped to the assigned 0191, so no renumbering was attempted.

### Commands actually executed

Dependencies were already installed; no install was performed. Node v24.17.0,
TypeScript 5.8.3, Vitest 4.1.11. The pnpm launcher stalled selecting its version:
`PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS=false pnpm --version` and
`pnpm --manage-package-manager-versions=false --version` were interrupted (130).
Direct installed binaries below ran the checks; aggregate pnpm results and a
clean pinned-install result are not claimed.

| Command (relative to indicated working directory) | Result |
| --- | --- |
| API: `./node_modules/.bin/vitest run src/watchdog-registry.test.ts src/job-work-state.http.test.ts src/job-work-state-commands.test.ts --maxWorkers=2` | 133 passed, 1 failed; 2 suites passed, command suite failed only at R1-C-TEST above. |
| DB: `./node_modules/.bin/vitest run src --exclude '**/test/**' --maxWorkers=2` | 180 passed, 1 failed; 21 suites passed. audit-checkpoint-handoff.test.ts:303 transitive source traversal timed out at unchanged 5000ms. |
| Each of core/config/ai/storage/db/api/web: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` | PASS all seven. These are also each package's configured lint checks. |
| Root: `LANE_BASE_REF=origin/main node tools/lint.mjs` | Core purity passed; lane migration-order gate failed (0191 vs base 0192). |
| Root: `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | FAILED same migration-order gate. No bypass. |
| core/config/ai/storage/db: installed `tsc -p tsconfig.json`; API: installed `nest build`; web: installed `next build` | PASS all package builds. Web emitted workspace-root/multiple-lockfile and existing import warnings. |
| API: `node --import tsx src/generate-openapi.ts`, then same with `--check` | PASS generation and verification; no socket required. |
| Root: `git diff --check` | PASS. |

Initial DB `vitest run src --maxWorkers=2` also matched integration filenames
containing "dbsrc". Their setup failed before tests executed (all reported tests
skipped); selection was interrupted (130) and corrected to exclude test/.
No PostgreSQL migration or integration test passed or is claimed run. No server
was successfully started. PostgreSQL, database migrations, browser/Playwright:
**NOT RUN**; dispatcher runs these in GitHub CI. The broad root test command was
not run because it includes those prohibited suites. No provider/AI change:
no live-model evaluation is applicable. No new alert or release authority.

The existing migration strategy remains the unmerged 0191 edit, with no data
backfill. Compatibility changes are the exact 409 mapping and the resume hold.
Earlier timing/capacity/release holds remain. FIX-LATER items were not pursued.

Focused rerun after the timeout: DB
`./node_modules/.bin/vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1`
**PASS: 71/71**, unchanged timeout and assertions (2.17 seconds total). This
resolves the isolated timeout on rerun; the initial full-unit run remains recorded
as failed. Final diff whitespace check also passed.


## r2 (ruling 116)

18 October 2026; builder: Codex gpt-6-astra. Last repair round for PR #290,
starting at `2345e6cf21686f1a82f0a6aa6eb6d519dd41027e`.

Applied exactly the two authorized repairs:

- 116(a): only the added finish/cancel cases seed the fixed demo tenant,
  identity, account and owner membership before issuing their practice session,
  then select the owned live home job in that demo tenant. Existing cases,
  random harness identities and conflict assertions are unchanged. This applies
  the coordinator's fixture ruling to the previous STOP R1-F; it does not claim
  a successful PostgreSQL run or cross-case collision proof.
- 116(b): the piece's new no-store refusal test now expects
  `IDEMPOTENCY_CONFLICT`, retaining its input, 409 status and no-store assertions.
  This resolves STOP R1-C-TEST consistently with ruling 114(c).

No item-specific implementation STOP remains. No runtime, migration, policy,
contract or existing-case change was made in r2. The migration remains
`0201_job_work_state_commands.sql`; it was already renumbered at the supplied
head. Previous capacity/timer/release holds remain. No independent verdict or
technical acceptance is claimed; the dispatcher owns commit/push and CI.

### Commands actually executed

Dependencies were already installed; no install or package download was requested.
Node v24.17.0, TypeScript 5.8.3 and Vitest 4.1.11. `pnpm --version` stalled and
was interrupted (130), as in r1. Checks use the installed binaries and configured
script bodies below; no successful aggregate pnpm or clean-install run is claimed.

| Command (relative to indicated working directory) | Result |
| --- | --- |
| API: `./node_modules/.bin/vitest run src/job-work-state-commands.test.ts src/watchdog-registry.test.ts src/job-work-state.http.test.ts --maxWorkers=2` | PASS: 134 tests, 3 suites. |
| DB: `./node_modules/.bin/vitest run src --exclude '**/test/**' --maxWorkers=2` | FAIL: 197 passed, 1 failed (22 suites passed, 1 failed). Unchanged audit-checkpoint-handoff.test.ts:303 source traversal exceeded its 5000ms timeout. |
| DB: `./node_modules/.bin/vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1` | FAIL: 70 passed, 1 failed at the same 5000ms timeout. No timeout or assertion was changed. |
| Root: `LANE_BASE_REF=origin/main node tools/lint.mjs` | PASS: core purity, lane boundary and money arithmetic. |
| Root: `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | PASS. |
| API: `node --import tsx src/generate-openapi.ts --check` | PASS; no generation or API artifact edit. |
| core/config/ai/storage/db: `./node_modules/.bin/tsc -p tsconfig.json`; API: `./node_modules/.bin/nest build`; web: `./node_modules/.bin/next build` | PASS all package builds. Web emitted workspace-lockfile, CSS compatibility/cache and dependency-import warnings. |
| Each of core/config/ai/storage/db/api/web: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` | PASS all seven; also their configured package lint checks. |
| Root: `git diff --check` | PASS. |

PostgreSQL, migration and browser/Playwright suites: **NOT RUN**, per dispatcher
environment restriction. These must run in GitHub CI after dispatcher push.
The shared-harness repair is source-inspected only. Broad root tests were not
run because they include PostgreSQL suites. No provider/AI change or live-model
evaluation applies. The DB unit timeout remains a validation hold, outside the
two authorized repairs.

## b1 (ruling 118)

18 October 2026. Fresh order CH-4-C-b1 for PR #290, starting at `045f9066`.
Working-tree delivery only; no git add/commit/push or dependency download.
This is builder evidence, not independent verification or technical acceptance.

The added finish/cancel prepare path now restores the exact previous
`JOBGUARD_ENV` value in `finally` (including deleting an originally absent key),
and holds its typed fixture state in a separate map rather than the existing
cases' memo. Only that prepare path inserts the fixed demo rows. Existing cases,
random tenant/member identities, boot/live/probe helpers and merged assertions
remain byte-identical to origin/main. A source comparison removed only the CH-4
imports, helper and two case registrations and verified exact equality; it also
verified the entire shared replay-contract file is unchanged.

**STOP B1-CROSS-TENANT — cross-kind replay/race proof cannot be repaired by
fixture isolation under these constraints.** The shared replay test runs every
other kind with the successful command's ID and expects a conflict; its race
also expects exactly one winner. Existing cases use the random harness tenant.
The two added cases must use demo-owned jobs: 0094's
`practice_binding_synthetic_tenant` CHECK binds practice ownership to the fixed
demo tenant, and its authentication routine binds the fixed membership/user.
0193's identity lookup, receipt lookup and advisory lock are explicitly scoped
by tenant (lines 81–88). A command in the random tenant therefore cannot conflict
with a command in the demo tenant merely because their IDs match. Fresh probes
can succeed, and reused probes can reject with stale-revision/domain errors,
consistent with the supplied CI excerpt. Restoring the environment does not
change that namespace mismatch. This is source analysis, not a PostgreSQL run.

A separate database or more isolated prepare path cannot supply the missing
same-tenant collision. No synthetic receipt copying, simulated conflict,
authentication bypass, registry omission, case skip, changed random identity or
weakened assertion was introduced. The demo rows remain in their own tenant in
the suite database; full cross-case fixture isolation and a passing exhaustive
contract are NOT claimed. Coordinator resolution of the incompatible fixture and
cross-kind requirements is needed for this item only. The r2 statement that no
implementation STOP remains is superseded for this item.

**Validation hold — migration order.** Both lane checks now reject this branch's
0193 because origin/main already contains 0193. No renumbering was performed in
this fixture-only order. Earlier capacity, timer and release holds remain.

### Commands actually executed

Used installed binaries and configured script bodies, following the prior
receipt's pnpm version-launcher failure; no fresh pnpm/clean-install pass is
claimed. PostgreSQL, migration and browser suites: **NOT RUN**, per dispatcher.
No model/prompt/provider change; evaluation is inapplicable.

| Command | Result |
| --- | --- |
| DB: `./node_modules/.bin/vitest run src --exclude '**/test/**' --maxWorkers=1` | PASS: 23 suites, 198 tests. |
| Root: `LANE_BASE_REF=origin/main node tools/lint.mjs` | FAIL: core purity passes; lane migration-order gate rejects 0193. |
| Root: `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | FAIL: same migration-order gate. |
| API: `node --import tsx src/generate-openapi.ts --check` | PASS. |
| DB: direct `tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/watchdog-command-harness.ts` | FAIL: existing inbox seed case passes `ids[0]` (string or undefined) to dismiss at line 204. That case is byte-identical to main and was not edited. This extra check includes tests excluded from normal package typecheck. |

No production code, SQL, migration, permission, commercial policy, public API or
operational alert changed in b1. No data backfill or new migration is required.
Commit message is supplied at `/private/tmp/jg-msg-ch-4-c.txt`; dispatcher owns
commit/push, subsequent CI and independent review.

Final b1 validation addendum:

- Each of core/config/ai/storage/db/api/web: installed
  `tsc -p tsconfig.json --noEmit` **PASS** (all seven). These are also the
  configured package lint checks; the root lane failure remains above.
- Source byte comparisons against origin/main and `git diff --check`: **PASS**.
- core/config/ai/storage/db: installed `tsc -p tsconfig.json`; API:
  installed `nest build`; web: installed `next build`: **PASS** all package
  builds. Web emitted workspace-lockfile, CSS and dependency-import warnings.
  Build completion is not browser or database verification.

## c1 (rulings 124/126)

Order CH-4-C-c1, PR #290. Starting HEAD `c12971ed`; inspected local
`origin/main` at `dbd3b165`. No git writes, commit, push, install or database
startup. Migration 0194 is edited in place as ordered. This is builder evidence,
not independent review or acceptance. RED: dispatcher obtains two independent
checks bound to its eventual commit, then PARK. No review is fabricated here.

### Implementation and authority

- Finish, cancel_finish, close, reopen and link accept a normal active owner of
  the job's tenant. The command authority argument accepts a server-authenticated
  membership UUID, like existing owner command routines, or an authenticated
  practice digest. SQL reuses `final_lock_require_owner`; revoked, expired,
  foreign-tenant and non-owner memberships fail closed. Rechecks and replay
  ordering remain. Practice sessions still authenticate; creator-session job
  ownership is no longer command authority.
- The application command optionally uses the existing identity context bridge
  (session, origin, CSRF, membership), deriving the owner ID server-side. The
  practice path authenticates the session without requiring creator ownership.
  Body-supplied authority remains rejected. The existing synthetic small-builder
  gate remains; this is not a production release.
- A private command projection returns tenant-scoped facts without invoking the
  merged practice-only GET reader. The public reader and its ACL are unchanged.
  The projection is migration-owned and has no runtime/infrastructure/shadow
  EXECUTE grant. The storage guard no longer requires equal creator digests for
  links or a live creator session for command events. Tenant, party, cycle,
  source, photo, lock and immutable-history constraints remain.
- Finish/cancel harness preparation uses the existing random tenant, normal
  owner and job. Removed demo seeding, practice issuance, substituted job IDs and
  JOBGUARD_ENV switching. Existing cases/helpers/assertions are byte-identical
  to origin/main: a deterministic comparison removes only the CH-4 import,
  helper and two registrations, then compares the complete remaining file.
  Shared replay files were not edited. No expectation was narrowed.
- Rulings 114/116 remain: resume HELD; 409 response contract unchanged.
  Added normal-owner lifecycle and negative authority integration coverage and
  private-projection ACL/upgrade assertions; updated only this unmerged task's
  obsolete practice-only command assertions. PostgreSQL coverage is NOT RUN.

### STOP items and handoff

1. **Normal-session HTTP transport remains outside this lane.** The shared
   `apps/api/src/auth/application-auth.guard.ts` explicitly rejects every normal
   session workflow as SYNTHETIC_WORKFLOW_ONLY, even after identity verification.
   It is not in the CH-4-C lane. Next's shared workspace factory supplies only
   practice credentials. No changes to these shared identity boundaries were
   made. The command/application bridge is ready, but normal-session HTTP
   availability is NOT claimed. Dispatcher must issue the bounded transport work.
2. **Migration numbering:** origin/main already contains
   `0194_free_first_job_keys.sql`. Both lane and root lint fail because this
   branch's 0194 is not higher. This order explicitly specifies editable 0194;
   no renumber, rebase or unrelated main catch-up was attempted. This repeats
   b1's numbering hold. Dispatcher owns the catch-up/renumber before merge.
3. SQL and shared replay/race behavior need real PostgreSQL CI. Browser and
   localhost suites need a permitted environment. The previous b1 cross-tenant
   harness mismatch is removed in source; an actual PostgreSQL pass is not claimed.

The trusted server must bind membership IDs to the verified principal/context;
UUIDs are not bearer credentials. This follows existing owner-command trust
boundaries and does not protect against a compromised privileged application
choosing another actor/tenant. No schema/data backfill or money/provider change.
Migration note records pre-merge reapplication and post-deploy forward-fix policy.

### Executed checks

Node v24.17.0; installed TypeScript 5.8.3 / Vitest 4.1.11. The installed pnpm
launcher stalled selecting the pinned package manager, as earlier receipts
recorded. Attempted pnpm typecheck/lint/lint:lanes/unit/build/openapi wrappers
were interrupted (130); no successful aggregate pnpm or clean-install claim.
Configured script bodies were run with installed local binaries instead.

| Check (installed script body) | Result |
| --- | --- |
| Root `tsc -p apps/api/tsconfig.json --noEmit` and `tsc -p packages/db/tsconfig.json --noEmit` | PASS; API repeated after final application edit, PASS. These also implement package lint. |
| Root `LANE_BASE_REF=origin/main node tools/lint.mjs` | FAIL at lane migration-number check; core purity PASS. |
| Root `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | FAIL: 0194 must be above main's existing 0194. |
| Root `node tools/money-arithmetic-lint.mjs` | PASS. |
| Root `node --test tools/*.test.mjs` | PASS: 100 tests. |
| API `vitest run src/job-work-state-commands.test.ts src/watchdog-registry.test.ts --maxWorkers=1` | PASS: 135 tests, 2 files, after final application edit. |
| DB `vitest run src --exclude '**/test/**' --maxWorkers=2` | 197 passed, 1 failed: unchanged audit-checkpoint-handoff.test.ts:303 exceeded 5000ms. |
| DB second check `vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1` | 70 passed, same timeout failed. PARK; no timeout/expectation change. |
| API `node --import tsx src/generate-openapi.ts --check` | PASS after building DB. First attempt failed against stale built DB export evaluateDecisionChecks; no source or OpenAPI artifact correction was needed. |
| core/config/ai/storage/db `tsc -p tsconfig.json`; API `nest build` | PASS all six builds. |

The initial broad API `vitest run src --exclude '**/*.http.test.ts'
--maxWorkers=2` was interrupted: it still included localhost-dependent SSO and
health tests. It reported two SSO action-path failures, a stale DB-export suite
load failure, and a registry scan failure from an intermediate extra command
method. The final implementation folds identity authorization into the existing
command method; the focused registry pass above confirms no additional registry
key is needed. Those intermediate results are not reported as passing evidence.

Web `./node_modules/.bin/next build` (apps/web): PASS, including type validation,
41 static pages and build traces. Warnings: workspace lockfile selection, CSS
compatibility and pre-existing dynamic Nest dependency imports. An initial root
Next invocation used the wrong working directory and exited 1; the package
invocation above is the applicable build. No tracked build artifact changed.

Final broader API command (apps/api):
`./node_modules/.bin/vitest run src --exclude '**/*.http.test.ts' --exclude
'**/health.test.ts' --exclude '**/shadow-isolation.application.test.ts' --exclude
'**/auth/sso/action-paths.test.ts' --maxWorkers=2`.
Result: **1953 tests passed, 1 skipped; 107 files passed, 1 file failed**.
The remaining mixed file `final-account-lock.isolation.test.ts` dynamically
imports a PostgreSQL fixture. Its beforeAll failed at `freePort` with
`no free port in 58400..58650`, before constructing/initialising/starting
EmbeddedPostgres. The two scripted tests in that file passed; its real-database
case did not run. This is not an all-green API suite or PostgreSQL evidence.
No further broad rerun; dispatcher CI owns the mixed integration suite.

Final deterministic harness-preservation comparison and `git diff --check`:
PASS. All ten changed tracked paths are within CH-4-C's allowlist; the lane
failure is migration ordering. No existing merged harness/replay expectation
was modified. PostgreSQL/migrations/shared replay races: **NOT RUN**. Browser:
**NOT RUN**. AI evaluation: inapplicable. No independent verdict or acceptance.

Commit message written to `/private/tmp/jg-msg-ch-4-c.txt`; dispatcher owns the
commit/push. Status: **PARK / not accepted**, with transport, migration numbering,
DB unit timeout and CI evidence holds above. No git write was performed.

## CI ROUND v5-r1

20 October 2026; PR #290, sub-order A. Started at `e34b3e30`, with
`origin/main` at `dc572123`. Read AGENTS.md, lane, earlier receipts, CH-4 and C5
in BUILD_PLAN, lock observer, LOCK-ORDER-1 tests, shared replay harness and
`docs/contracts/lp-command-binding-design-v1.md` §4 before finalizing changes.
Working-tree delivery only: no git add/commit/push, install, package download,
server startup or database execution. Builder evidence only; independent
commit-bound verdicts and separate technical acceptance remain required.

### Source diagnosis and changes

1. Renamed the SQL and migration note to **0201_job_work_state_commands**.
   Updated active fixture, lane, receipt, privilege-record note, contract and
   CH-4-C ledger references. The main-checkout speed-v5 ledger was read-only
   inspected: line 43 already reserves 0201 for #290, so no external edit was
   needed. The retired 0197 paths remain in the lane allowlist solely to permit
   deleting them from the current commit; only 0201 exists in the working tree.
   No new table, data backfill, grant or policy is introduced. The SQL retains
   its existing prerequisite objects from migrations through 0198. Actual fresh
   install/upgrade applicability is NOT VERIFIED without PostgreSQL CI.
2. Parallel duplicate deadlock: the repository live guard holds SHARE, while
   the command and storage trigger previously upgraded that same job to UPDATE.
   Multiple callers can hold SHARE and wait on each other's upgrades. Final
   implementation preserves the merged first-SHARE lock observer and all command
   registry entries: plain owner/authentication reads precede the guard; SQL and
   event storage retain SHARE for finish/cancel; the existing per-job event
   serializer is taken before reading revision. Other commands retain sorted
   job UPDATE locks. Identity, event/graph serialization, receipt/effect writes
   and audit-last remain. Added distinct-ID finish/cancel races (NOT RUN here)
   and a supplemental source-only lock-order assertion. Existing shared replay,
   lock-observer and registry assertions are not weakened or deleted.
3. Both failed link racers and the pre-live/sibling refusals hit the same track
   gate: 0053's legacy trigger binds live jobs only, while issued practice
   quoting siblings have no track row. The underlying practice fixture seeds a
   current owner; no creator-session restriction was reintroduced. The command
   fixture wrapper now explicitly binds its issued pre-live jobs as labelled
   `backfilled_synthetic_fixture` small-builder/synthetic_demo jobs. The original
   fixture and shared harness are unchanged. Sorted endpoint locking and the
   existing cycle trigger still select one winner; the original one-edge/cycle
   assertion is unchanged. No exception is swallowed or converted to success.
4. SQL checks current owner before lifecycle/revision and live state before
   expected revision for new finish/cancel commands. Stored SQL replay retains
   its current-authority check and original snapshot. Added normal-owner pre-live
   stale-revision and invalid-owner assertions. Contractor/pilot, revoked,
   expired, foreign and non-owner refusals remain intact. Resume stays HELD.
5. LP0-17: added only the missing private
   `ch4_command_work_facts(uuid,uuid,text)` recorded routine row, alongside the
   CH-4 command records. No runtime EXECUTE or newly claimed approval. Existing
   main additions mean the final recorded routine count is 366; this round adds
   exactly one. No fixed expected count was weakened.
6. SERIOUS-B5: additive helper admits only the seven exact new 0201 routine
   identities and asserts they did not exist in the predecessor. There are no
   own new tables/indexes/policies to add. Every original expected catalogue and
   data row remains in the full comparison, including replaced routine ACLs.

An intermediate implementation delegated all locking to SQL and removed this
piece's precheck registrations. Source inspection of the shared exhaustive and
first-SHARE assertions showed that approach incompatible; the final code retains
both registrations and the first-SHARE guard, eliminating upgrades instead.
The initial API run before dependency rebuild/final lock fix reported 38 failed,
97 passed (two guard failures, stale export/classifier failures, including
EnterpriseLivePromptRepository not a constructor). Final reruns below passed.
One Python edit invocation used the API cwd and failed with FileNotFoundError
before changing files; it was rerun successfully from the worktree root.

### Commands actually run and results

Node v24.17.0; installed TypeScript 5.8.3 / Vitest 4.1.11. Dependencies were
already installed. No clean pinned-install or successful pnpm-wrapper result is
claimed. All test invocations used at most two Vitest workers.

| Command | Result |
| --- | --- |
| `pnpm --version`; `PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS=false pnpm --manage-package-manager-versions=false --package-manager-strict=false --version` | Both stalled in the launcher; interrupted (130). |
| `pnpm --filter @jobguard/core --filter @jobguard/db --filter @jobguard/api --filter @jobguard/web typecheck`; `LANE_BASE_REF=origin/main pnpm lint`; `pnpm lint:lanes`; `pnpm --filter @jobguard/db exec vitest run src --exclude '**/test/**' --maxWorkers=2`; `pnpm --filter @jobguard/api build`; `pnpm openapi:check` | Each attempted through a Python subprocess with 5s timeout, then terminated while launcher stalled. Checks did not execute through pnpm. |
| Each of core/db/api/web: installed `tsc -p tsconfig.json --noEmit` | PASS; repeated after implementation edits. Config/ai/storage same command also PASS. These are each package's lint script bodies. |
| Root `LANE_BASE_REF=origin/main node tools/lint.mjs` | FAIL: core purity PASS; lane migration-order gate still counts the committed 0197 addition despite its working-tree deletion. |
| Root `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | FAIL: same committed-0197-vs-main-0198 migration-order check. Initial invocation also needed the retired exact paths allowed for their deletion; corrected in lane. |
| Root `node tools/money-arithmetic-lint.mjs` | PASS. |
| core: `./node_modules/.bin/vitest run src --maxWorkers=2` | PASS: 124 suites, 2956 tests; final run after restoring both guard entries. |
| db: `./node_modules/.bin/vitest run src --exclude '**/test/**' --maxWorkers=2` | PASS: 26 suites, 221 tests, including unchanged audit-checkpoint-handoff timeout. Repeated after final lock implementation, PASS. |
| api: `./node_modules/.bin/vitest run src/job-work-state-commands.test.ts src/watchdog-registry.test.ts --maxWorkers=2` | Final PASS: 2 suites, 136 tests. Intermediate SQL-only design run passed 134 tests before restoring the exhaustive registrations; not the final design. |
| web: `./node_modules/.bin/vitest run 'app/api/jobs/[id]/work-state/route.test.ts' --maxWorkers=2` | PASS: 1 suite, 8 tests; no socket/browser. |
| core/config/storage/ai/db: installed `tsc -p tsconfig.json`; api: installed `nest build` | PASS all six builds. Core/db rebuilt and API build repeated after final lock changes. |
| api: `node --import tsx src/generate-openapi.ts --check` | PASS after dependency rebuild, repeated after final API build. No OpenAPI artifact or route change in this round. |
| db: installed `tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/job-work-state-command-fixtures.ts test/job-work-state-commands.integration.test.ts test/job-work-state-commands-races.integration.test.ts test/job-work-state-commands-boundaries.integration.test.ts test/serious-b5-upgrade.integration.test.ts` | PASS, repeated with the new race cases. This is source typechecking, not PostgreSQL execution. |
| Root `git diff --check`; read-only status/diff/source and JSON inspection | PASS whitespace; only lane paths plus expressly authorized shared upgrade-test addition. |

The local lane checker unions changes in HEAD with working-tree/untracked paths,
so its migration gate still sees HEAD's added 0197 even though this delivery
renames it to 0201. No gate was bypassed and no git index write was used. The
dispatcher must commit the deletion/addition together and rerun both lane/root
lint against origin/main; a passing post-commit gate is not claimed here.

### PARK and remaining evidence

PostgreSQL, migrations/fresh-install/upgrade, shared replay/lock observer races,
LP0 and SERIOUS-B5: **NOT RUN** locally. Browser/Playwright and socket-dependent
HTTP suites: **NOT RUN**. GitHub required `checks` after dispatcher push must
supply this evidence. Broad root test/build wrappers: NOT RUN successfully;
focused actual script-body results are above. No AI/provider/prompt change;
evaluation is inapplicable. No new alert, external action or production release.

Normal-session HTTP wiring remains **PARK / outside lane**. The historical DB
unit timeout item remains parked with no timeout/assertion change; this round's
full DB unit selection passed. Capacity B, timing conventions, release gates,
independent verdicts and separate acceptance remain outstanding as before.
Rollback/forward-fix remains as documented in the renamed migration note; no
historical receipts, events, links, audit or money are rewritten.

Commit message delivered to `/private/tmp/jg-msg-ch-4-c.txt`. Dispatcher owns
commit/push and CI. This receipt is not independent verification or acceptance.

## CI ROUND v5-r2 — fourteen-failure repair

20 October 2026. Starting HEAD `499a7140ffda7086e289f1b9ae3cb5d2c6ec555c`,
branch `codex/sandbox/ch-4-c`; observed frozen `origin/main`
`dc5721230fd8aedbf2d9d0457789074b66b48765`. Migration **0201 retained**.
Builder evidence only; no independent verdict or technical acceptance.

Read AGENTS.md in full, CH-4 card and lifecycle/counting contracts in BUILD_PLAN,
work-state and command-binding contracts, prior receipt, and the approved main
checkout speed-v5 milestone/deferral dispatch. Prior issued/r1/r2/b1/c1/v5-r1
orders and BEN-ANSWERS-20261017.md were read from the existing review archive
`/private/tmp/jobguard-claude-web-20261020/ch-4-c-A-499a7140.zip`, under
`requirements/orders/` and `requirements/`. No Claude run was made.

### Diagnosis, source repairs and detecting regressions

Real failing-first evidence is the supplied CI log
`/private/tmp/jg-ch4-ci-39465455025.log`: **14 failed, 3007 passed,
1 expected fail** in DB; 5 failed files. This is prior CI evidence, not a local
failing-first execution, and none of the fourteen was called pre-existing.

1. **Two pre-live failures (log lines 3066–3091).** The stack reaches
   `guard_watchdog_input -> require_watchdog_live` at the WorkState identity
   insert, after legitimate owner checks. 0201 now preserves the original guard
   verbatim except one administrative identity branch: current migration role,
   exact app identity table, exact close/reopen/link kind, matching processing
   receipt/type/hash/semantic key, active owner and synthetic small-builder track.
   Processing receipt moves just before identity insertion under the existing
   identity lock; both roll back with facts/audit. Existing session and both-job
   authority checks remain in the command. No new grant, role, RLS exception,
   job policy or non-live site-work capability. Finish/cancel and every original
   table/action keep their live guard. Regressions: unchanged pre-live close
   and link-cycle one-winner cases; additive real pre-live locked reopen/link,
   unchanged job-row comparisons, foreign/invalid/revoked owner/session/job
   refusal, and raw runtime identity inserts with forged matching receipts/GUCs.
2. **Five observer failures (3122–3206).** The conservative scanner treats every
   FROM/JOIN table in a definer routine containing FOR UPDATE as mutable. The
   new CH4 routine combined job UPDATE locks with eleven plain legacy ownership
   reads. Extracted that complete SELECT, retaining every predicate and its
   original invocation/acquisition order, into private SQL STABLE invoker helper
   `ch4_legacy_command_owned(uuid,uuid)`. It has no writes/locks/runtime EXECUTE.
   Regressions: unchanged watchdog-lock-order observer/assertions and supplier/
   discrepancy commands; own read-only/security/owner/search-path/ACL catalogue
   and exact upgrade routine assertions. No observer assertion was edited.
3. **Six exhaustive non-live failures (3207–3238).** Add actual finish/cancelFinish
   repository invocations first in registry order. Bind predecessor jobs to the
   existing synthetic owner and an explicit synthetic small-builder track, so
   authority succeeds and the real live check refuses. Exhaustive equality and
   exact JOB_NOT_LIVE refusals remain; no-write counts additionally cover work
   events, links and stored watchdog results. No catch-all, skip or reclassification.
4. **15 vs 13 persistent IDs (3092–3121).** Immutable CH4 command events/links
   now reserve IDs in the tenant-scoped legacy ownership query. Existing kind/job
   conflict algebra is unchanged. Add actual finish/cancel to discovery's exact
   expected set only alongside that protection. The existing exhaustive other-kind
   refusal/original replay/changed payload assertions now run for both. Additional
   own close/reopen/link cases remove modern bookkeeping, prove local rejection
   and permit the same UUID in a different tenant. Original watchdog replay,
   race and cycle assertions are untouched.

Own upgrade proof populates every compared predecessor table, applies 0201
alone, compares original rows/full named types/keys/ACLs, then applies later
migrations twice and checks the named original-column row_to_json text projection.
Existing microsecond/retyping refusal and later column/function/insert positive
controls remain. No claim of PostgreSQL execution or parsing is made.

### Actual local commands and results

Node v24.17.0; TypeScript 5.8.3; Vitest 4.1.11. All heavy commands used
`HEAVY_SLOTS=2 ~/.local/bin/heavy-slot <label> <command>`; at most two at once,
at most three named Vitest files and two workers per test invocation. Disk checks
showed about 47.43 million available KiB (above 45 GB); no install/download.
No clean pinned-install or aggregate all-suite pass is claimed.

| Executed command (cwd root unless indicated) | Exit/result |
| --- | --- |
| `pnpm --version`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes` | Each stalled in installed pnpm launcher after ignored-overrides warning; interrupted, exit 130. No package installed. Used installed script bodies below. |
| `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` | PASS 0; DB typecheck and configured package lint. Final sequential repeat PASS 0. |
| `./node_modules/.bin/tsc -p packages/db/tsconfig.json` | PASS 0; DB build. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | PASS 0, twice: core purity, lane, money and commercial boundaries. Existing computed-import diagnostics are reported warnings. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | PASS 0. |
| core cwd: `./node_modules/.bin/vitest run src/watchdog.test.ts src/job-work-state-commands.test.ts --maxWorkers=2` | PASS 0: 2 files, 13 tests. |
| DB cwd: `./node_modules/.bin/vitest run src/supplier-match-repository.test.ts src/proof-replacement.test.ts src/evidence-finalization-race.test.ts --maxWorkers=2` | PASS 0: 3 files, 10 tests; mocked/source units, not PostgreSQL. |
| `./node_modules/.bin/tsc -p /private/tmp/jg-ch4c-v5r2-tsconfig.json` | FAIL 2, twice: sole diagnostic is unchanged shared `watchdog-command-harness.ts:180:91`, string-or-undefined passed to string (ids[0], noUncheckedIndexedAccess). HEAD comparison confirms the line is unchanged. No unrelated harness edit. |
| `./node_modules/.bin/tsc -p /private/tmp/jg-ch4c-v5r2-own-tsconfig.json` | PASS 0: all edited integration suites except the legacy suite which imports that shared harness; strict settings retained. |
| API cwd: `node --import tsx src/generate-openapi.ts --check` | PASS 0; no generated API artifact or route edited. |
| Source comparison script using HEAD and 0096 | PASS 0: original tenant/recovery/live guard retained, all eleven old legacy query predicates present, helper invoked at same position, observer/repositories/replay/cycle-race files byte-unchanged. Deterministic source evidence only. |
| `git apply --check /private/tmp/SHARED-CH-4-C.patch` | PASS 0; proposed shared patch applies, was NOT applied. |
| `git diff --check` | PASS 0. |

One concurrent final DB-typecheck invocation exited 2 in heavy-slot with only
sysctl/sysmon/pgrep sandbox diagnostics and no compiler output; it is not counted
as a compiler failure or pass. It was retried sequentially: PASS 0. Those helper warnings
also appear before successful runs; no slot/timeout/worker bypass was used.

### CI selection and outstanding acceptance

PostgreSQL/migration/browser/Playwright suites **NOT RUN** locally, per issuance.
CI must execute all own `job-work-state-commands{,-boundaries,-races,-upgrade}`
and `job-work-state-catalog` integration suites (plus existing CH4 source/upgrade
regressions), `watchdog.integration`, `watchdog-legacy-identities`,
`watchdog-lock-order`, `command-replay-contract`, LP0, tenancy and SERIOUS-B5.
No assertion or mandatory suite was skipped, disabled or weakened. No live
provider/real data/AI change; eval is inapplicable.

**Shared integration HOLD:** `/private/tmp/SHARED-CH-4-C.patch` and companion
`/private/tmp/SHARED-CH-4-C.md` propose exactly the new helper's SERIOUS-B5/LP0
rows, CH4's own call metadata and a pending guard digest. Shared inventory and
SERIOUS-B5 files remain unchanged in this worktree. Root applies serially before
CI; without it the new helper is deliberately unregistered and those checks hold.
No source/hash of another piece was frozen or bulk catalogue baseline refreshed.

**Strict auxiliary typecheck HOLD:** unchanged shared harness line 180 above;
requires its owner if strict checking of that whole imported test graph is desired.
It does not change the CI-only requirement for the fourteen runtime regressions.

Two independent exact-head Claude checks, green required CI and separate
acceptance remain outstanding. No self-acceptance. Capacity/timer and normal-session
transport holds from earlier receipts remain; production/real-use gates stay closed.
No commit, staging, checkout, push, merge, deploy, provider activation, real-data
access, spend, global configuration or reserved SV5 worktree work was performed.
Intended commit message: `/private/tmp/jg-msg-ch-4-c.txt`; dispatcher owns commit/push.


## Coordinator serial integration — 20 October 2026

Actual coordinator: Codex JobGuard coordinator (legacy dispatch script trailer naming a Claude session is stale). Builder committed r2 at d031ca54. Applied the builder-proposed exact additive SERIOUS-B5 signature row and own helper routine record, plus corrected CH4 command static-call references. The existing guard_watchdog_input recorded definition digest is preserved; the proposed replacement with null was NOT applied. Its definition changes in0201, so the old digest remains historical/stale and actual PostgreSQL catalogue capture is still required before technical acceptance. No pin/assertion was removed to obtain a pass. No PostgreSQL/browser execution or independent Claude verdict is claimed.


## v5-r3 — actual independent A AND B S1 repair (20 October 2026)

Builder run only; uncommitted working tree based on exact
`73a0e755c82f7a308ec02b0bd84a27e36f785611`, branch `codex/sandbox/ch-4-c`;
frozen observed `origin/main` is `dc5721230fd8aedbf2d9d0457789074b66b48765`.
No commit/push/merge/acceptance or Claude run was performed. Both complete actual
REPAIR verdicts were read from:

- `/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch-4-c-opus-A-73a0e755.md`
- `/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch-4-c-opus-B-73a0e755.md`

Also read AGENTS in full, the applicable BUILD_PLAN CH-4/C1–C8/counting contracts,
the job-work-state contract and migration note, Ben's answers at
`/Users/benharwood/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261017.md`,
and the approved main-checkout speed-v5 milestone/deferrals at
`/Users/benharwood/Claude/Projects/my-new-project/docs/dispatch/2026-10-20-speed-v5-milestone-and-deferrals.md`.
No new delegation or other-piece editing occurred.

### Repair and preserved boundaries

For a practice DIGEST, `ch4_require_command_owner` additionally requires the
merged reader's recursive owned-job closure, including null-digest imported jobs
with immutable source lineage. All existing target/both-link-endpoint rechecks
remain in place before locks, after job locks, after command identity waits,
before stored replay, and after audit. Normal server-supplied membership UUID
owner authority remains intact. No shared-owner practice-session exception exists.
The application uses job-bound access; repository finish/cancel prechecks use the
existing `practiceOwnedJobsSql` closure before the live SHARE guard.

The command response filters practice links exactly as GET: both endpoints must
carry that digest directly. Imported target history remains accessible through
lineage; imported endpoint links remain omitted from practice responses. Normal
owner responses retain tenant-authorized endpoints. No cross-session close note
can be returned through a practice command/replay on another visitor's job.

Link storage verifies the exact transient command envelope against the existing
request hash, processing receipt, actor, endpoint/binding IDs and transaction's
identity claim, then rechecks both endpoints with that authority. The setting is
restored after insertion. A caller-set GUC alone cannot grant authority; direct
storage without it retains the predecessor digest equality rule, and runtime
still has no INSERT grant. A normal-owner command can legitimately link jobs
with different practice digests. No new migration/schema/grant/role or money
path; 0201 remains. Original source gates, r2 guards, serializers and audit order
are retained.

The expressly issued sibling-session success assertion was replaced by refusal
and unchanged commandCounts (receipt/event/link/audit/money/outbox). This restores
the original access requirement. Other old assertions remain. Added PostgreSQL
cases cover actual owned command success; foreign/sibling command refusal; exact
common-party sibling link refusal on both endpoints; normal-owner cross-session
link success; practice projection filtering; session/job replay substitution;
real synthetic adoption and recursive lineage; imported predecessor link;
direct storage/forged-envelope/runtime bypass; revocation after predecessor,
successor, identity and audit waits, plus direct/imported command replay waits.
Application units verify bound-job refusal before repository execution.

Existing exhaustive watchdog, legacy, lock observer, link one-winner, money,
grants/catalogue and 0201-only upgrade tests are unchanged. No observer/global
harness/assertion weakening, skips, timeouts or worker bypasses were introduced.
The lane adds only the existing permitted application test path. The optional
repository unit-test path does not exist and was not added under another name.

### Actual commands and evidence limits

Node `v24.17.0`; installed TypeScript `5.8.3`; Vitest `4.1.11`. No package
install/download. Used installed script bodies because prior receipts establish
the pnpm-launcher stall; pnpm itself was not retried in this round. All compiler,
unit and build commands below used
`HEAVY_SLOTS=2 ~/.local/bin/heavy-slot <ch4c-r3-label> <command>`.
No more than two commands were in flight, and each Vitest invocation names at
most three files with `--maxWorkers=2`. Wrapper sysctl/sysmon/pgrep sandbox
warnings preceded successful exits and were not hidden or bypassed.

Initial `df -h .`: 43 GiB available; `df -k .` later recorded 45,171,944 KiB.
Heavy tests/builds were held conservatively below 45 GiB while source work and
no-emit source compilation continued. Before unit runs, disk recovered to
47,202,160 KiB (just over 45 GiB); subsequent pre-command readings were
47,204,024 / 47,205,664 / 47,205,988 / 47,205,876 KiB. Heavy checks then resumed.
Latest observed 47,211,148 KiB: **disk-floor hold cleared at that observation**.
No files or data were deleted to free space. Recheck the floor for subsequent work.

| Actual executed command | Exit/result |
| --- | --- |
| `git rev-parse HEAD`, `git branch --show-current`, `git rev-parse origin/main` | 0; exact head/branch/base above |
| `python3 /private/tmp/jg-ch4c-r3-source-check.py --old` | 1 as expected: source predicates fail at old head for missing practice closure/projection/storage binding; membership path passes. Deterministic source-only failing-first evidence, not an executed authorization test. |
| `python3 /private/tmp/jg-ch4c-r3-source-check.py` | 0: source predicates pass; unaffected r2 routine bodies byte-identical; all existing successor recheck calls preserved. Not PostgreSQL parsing or execution. |
| `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` | 0; affected DB typecheck/configured package lint |
| `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` | 0; affected API typecheck/configured package lint, including application test source |
| `./node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext packages/db/test/job-work-state-command-fixtures.ts packages/db/test/job-work-state-commands.integration.test.ts packages/db/test/job-work-state-commands-boundaries.integration.test.ts packages/db/test/job-work-state-commands-races.integration.test.ts packages/db/test/job-work-state-commands-upgrade.integration.test.ts` | 0; repeated after final test additions, 0. Strict PostgreSQL-test source compilation only. |
| API cwd: `./node_modules/.bin/vitest run src/job-work-state.application.test.ts src/job-work-state-commands.test.ts src/job-work-state.isolation.test.ts --maxWorkers=2` | 0; 3 files, 24 tests. Scripted/source units, not HTTP/PostgreSQL execution. |
| core cwd: `./node_modules/.bin/vitest run src/job-work-state-commands.test.ts src/job-work-state.test.ts src/watchdog.test.ts --maxWorkers=2` | 0; 3 files, 24 tests |
| DB cwd: `./node_modules/.bin/vitest run src/tenant-context.test.ts src/proof-replacement.test.ts src/evidence-finalization-race.test.ts --maxWorkers=2` | 0; 3 files, 25 tests. Mocked boundary units, not PostgreSQL execution. |
| `./node_modules/.bin/tsc -p packages/db/tsconfig.json` | 0; affected DB build |
| API cwd: `./node_modules/.bin/nest build` | 0; affected API build |
| API cwd: `node --import tsx src/generate-openapi.ts --check` | 0; existing generated API unchanged |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0, repeated; core purity/lane/money boundaries pass. Seven existing computed-import warnings remain. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 0, repeated; main-range lane check |
| `git apply --check /private/tmp/SHARED-CH-4-C-v5-r3.patch` | 0; proposal applies, NOT applied |
| `git diff --check` | 0, repeated |

No clean install, broad root test, whole-repository build or all-suite pass is
claimed. No unit failing-first run was performed before the repair because of
the initial disk hold; only the explicitly labelled source comparison above is
failing-first evidence. PostgreSQL/migration/catalogue/race/browser/Playwright
suites were **NOT RUN locally**, per issuance. No live provider, real data,
model/prompt or eval change.

### Dispatcher handoff and holds

**Shared serial integration HOLD:** apply
`/private/tmp/SHARED-CH-4-C-v5-r3.patch` with rationale
`/private/tmp/SHARED-CH-4-C-v5-r3.md`. It adds only this piece's storage-trigger
static call metadata for existing functions. No shared catalogue was edited;
recorded historical hashes are not fabricated/refreshed. Actual PostgreSQL
catalogue extraction is still needed. Earlier r2 coordinator integration at
73a0e755 remains intact; the older r2 pending-patch text is historical.

**Explicit review-context request:** include these actual pinned files in BOTH
fresh full-head packets (all source-inspected in this checkout):
`apps/api/src/practice-access.ts`, `apps/api/src/app.module.ts`,
`apps/api/src/main.ts`, `packages/db/src/migrate.ts`. Also include the existing
`packages/db/src/practice-session.ts` so reviewers can inspect digest hashing
and owned-job SQL. PracticeAccess uses persisted authentication/job authorization;
practice-session derives a SHA-256 digest from a validated UUID token. AppModule
registers JobWorkStateExceptionFilter as APP_FILTER and the work-state controller;
main boots AppModule. These are source observations, not HTTP/runtime proof.
The migration runner discovers numbered migrations and records each atomically;
this repair creates no number. No shared file was edited to supply this context.

CI must run every existing required PostgreSQL/catalogue/upgrade/watchdog/legacy/
lock-order/replay/LP0/tenancy/SERIOUS-B5 suite plus the new cases. Old-head CI
attempt 2, regardless of result, does not prove this uncommitted diff. Fresh CI
and **two fresh independent full-head Claude verdicts after dispatcher commit**
are required. Builder never self-accepts. Separate acceptance and Ben's merge
remain outstanding. Normal HTTP transport, capacity B/resume, T-01 timer and all
production gates remain held. A/B fix-later findings are recorded in the ledger;
they do not authorize broader source/policy changes. Prior shared-harness strict
compile debt was not widened into this repair; own five-file strict check passes.

Intended conventional commit message written to
`/private/tmp/jg-msg-ch-4-c.txt`. Dispatcher owns commit; root owns feature push.

## Coordinator serial r3 metadata integration

Applied only the proposed own ch4_storage_integrity static-call metadata line after builder completion. Preserved every historical digest and permission; real migrated catalogue extraction remains held. Root postintegration range/static lint and diff checks precede feature push. This is deterministic coordination evidence, not independent review or acceptance.


## CH-4-C v5-r4 cloud source preparation — unexecuted


Status: **SOURCE PATCH PREPARED; UNEXECUTED, UNREVIEWED, UNACCEPTED.**

Target full predecessor head: `e1d677c342d74e9033e8e8c9f5a97a2190043f93`.
Builder configuration specified by issuance: GPT-6.1 Sol, medium. No model switch or delegation was requested or used by this task.
Source authority: uploaded `jg-CH4-r4-cloud-patch-packet.zip`, its CLOUD-PREPARATION.txt, ORDER.txt, DIAGNOSIS.md, MANIFEST.json, requirements and candidate copies. No repository connection or live head verification was performed. Exact-head attribution comes from the supplied manifest; the coordinator must verify the real checkout head and source-before digests before application.

## Bounded source change

- Only E25's pre0141 photo setup is replaced in `packages/db/test/site-extra-evidence-routines.integration.test.ts`, with additive imports for node `createHash` and existing `pngBytes`.
- E25 seeds a historical verified upload, persisted synthetic PNG original, and original `site_photo` evidence object with named pre0141 columns. Actual PNG bytes determine the SHA256 and exact length. Upload/evidence IDs are distinct; immutable key/version, tenant, job, scope and server timestamps are bound consistently. The object copies receive/verify timestamps directly from its upload. Expiry is generated by PostgreSQL one hour ahead.
- Schema detail: 0025 requires synthetic original `scope_item_id NOT NULL`. The fixture selects one already-confirmed scope of this exact tenant/job, asserts it exists, and uses it for all three rows. No scope row, fake table or migration is added. 0110's real work-order import creates confirmed scopes and puts this fixture job live.
- Existing `ownerTx` sets the tenant and owner role; the new block then explicitly uses `SET LOCAL ROLE jobguard_runtime`, the role named by 0025's existing synthetic-original INSERT policy. This preserves FORCE RLS and normal grants/constraints/triggers rather than relying on table-owner bypass or inventing a new policy. 0096's live-job and SQL command-reservation triggers remain active. No modern EvidenceService/watchdog TypeScript claim is called by this block.
- Added preconditions require both `app.job_work_state_event` and `app.job_link` absent via `to_regclass`, and require consistent upload/object/original metadata, verified state, byte-for-byte PNG storage, stored-byte SHA256 and exact evidence length. These are authored assertions, NOT executed results.
- Both existing note-only and photo-linked `ExtraRepository.raiseExtra` calls stay unchanged. All existing code from those calls to E25's end stays unchanged: named-column/full-type/identity canonical snapshots, nonempty guards, own0141 catalogue checks, successor migrations twice, microsecond damage, retyping, added nullable column/replaced function and inserted-row controls. Existing rolled-back controls retain their existing replication-role statements; the new historical seed does not disable triggers or RLS.
- Shared `photo`, E20–E24, all production guards including the CH4 watchdog query, migrations, shared fixtures and r3 session-isolation repair are untouched.
- `config/lanes/ch-4-c.json` gains exactly the test path as one literal `allow` entry. All other existing lane values/rules/paths are preserved.
- `docs/verdicts/CH-4-C/BUILDER_RECEIPT.md` receives only this task's appended receipt; earlier sections are historical and retain their original claims.

## Supplied failing-first evidence (not rerun)

Uploaded CI-FAILURE.txt and DIAGNOSIS.md bind CI **39492634939**, job **118872273386**, to the target predecessor: 3038 DB tests passed, one failed, one expected fail; E25 raises PostgreSQL **42P01**, `relation "app.job_work_state_event" does not exist`.
Supplied stack: E25 line146 → shared `photo` line36 → `EvidenceService.beginUpload` lines53–54 → `claimCommandIdentity` → `assertNotLegacyOwned` at watchdog line68. Physical workstate tables begin at **0144**; CH4 adds the current query. E25 must continue proving **0141 alone** over its true predecessors. No later migration is applied early.

## Source-before SHA256s

| Relative patch path | Uploaded original SHA256 |
| --- | --- |
| `packages/db/test/site-extra-evidence-routines.integration.test.ts` | `06580a23bec2a34dbd65fc086ec2139de81611dba2e896e49097a9510a47c728` |
| `config/lanes/ch-4-c.json` | `fdea6fed503975af67badaa8f07c195f1a63351131ba5d22d59e04da38b5eaf1` |
| `docs/verdicts/CH-4-C/BUILDER_RECEIPT.md` | `91c47948c0c9bf3369690f5fcd64cc25eecfacaa72a039409de2042bdc5a5717` |

These source-before digests identify the complete original files, including the entire pre-existing builder receipt. They are application preconditions, not source freezes of other pieces. `CH4-C-v5-r4-source-before.sha256` contains the same three values in sha256sum format. The patch uses repository-relative `a/` and `b/` paths and has no sandbox paths.

## Execution checks and command status

| Check | Status / exit |
| --- | --- |
| DB package typecheck (`tsc -p packages/db/tsconfig.json --noEmit`) | **NOT RUN**; no exit |
| Strict affected integration-test source compilation | **NOT RUN**; no exit |
| Scoped lint, root lint, lane lint | **NOT RUN**; no exit |
| `git diff --check` / `git apply --check` | **NOT RUN**; no exit |
| Build | **NOT RUN**; no exit |
| E20–E25 PostgreSQL integration and upgrade proof/controls | **NOT RUN**; no exit |
| Related site-extra/evidence/watchdog legacy/replay suites and mandatory CI | **NOT RUN**; no exit |
| Migration/catalogue/RLS/constraint/race suites | **NOT RUN**; no exit |
| Browser/Playwright suites, both projects | **NOT RUN**; no exit |
| Exact-head independent Claude A/B review and separate acceptance | **NOT RUN**; mandatory holds |

Only local archive listing/extraction, supplied text reading, source editing, byte hashing, unified-diff construction and deliverable packaging were performed with standard file tools. No project code, SQL, compiler, linter, test, check script, package install/download, DB or browser was executed. SHA256 calculation and diff construction are artifact preparation, not execution verification. No helper scripts were downloaded or used, no sub-agents were used, and no external service was connected for source work or artifact delivery. No credentials, user Mac files, repository, GitHub or external live state were accessed. No commit, push, dispatch, acceptance or merge occurred. Mac heavy gate remains enforced; no local heavy command was started.

## Coordinator handoff / holds

1. Coordinator must verify full checkout head `e1d677c342d74e9033e8e8c9f5a97a2190043f93` and the three source-before SHA256s. On any mismatch: **HOLD; do not fuzzy-apply or transplant to a different head**.
2. Coordinator owns application, patch applicability/whitespace checks, any permitted resource-gated static checks, commit and feature-branch push. Intended commit subject: `test(db): seed E25 historical evidence before migration 0141`. No commit-message file was written outside this sandbox.
3. GitHub CI must execute E25 and all existing required affected suites on the resulting full commit. The old failing log and this source inspection do not verify the repair. Any further later-schema dependency is an exact item-specific HOLD, not authorization for broader fixture changes.
4. Fresh exact-head independent Claude A/B verdicts (same original reviewers after reset) and separate acceptance remain mandatory. Old-head packets are superseded for the resulting head. All earlier unrelated holds and production gates remain in force. Ben owns merge; no main push, deployment, provider activation, real data or spending is authorized.

This is a reviewable source proposal only. No files were saved on Ben's Mac, and no reviewed/accepted status is claimed.


## Coordinator r4 feature candidate for required CI

Actual cloud Sol Medium source patch downloaded byte-identically and applied only after exact e1d677 full head, all three source-before hashes and clean-worktree checks. git apply --check and git diff --check passed; the complete existing E25 tail beginning with BOTH ExtraRepository.raiseExtra calls is byte-identical. This is bounded source inspection and applicability evidence, not independent review.

All local compiler/lint/build checks remain NOT RUN: shared scheduler stayed above45 Node processes (latest52, memory35%, disk161GiB). Own validation-only launcher11806 was stopped before its first command (log contains WAIT and no RESULT); no running check was interrupted and no gate was bypassed. This complete source candidate is committed/pushed to the existing feature branch for the unchanged mandatory GitHub CI to execute exact-head type/lint/build, PostgreSQL and browser suites. No CI success is presumed; dependency-review is separately blocked by the issued Vite patch. No local DB/browser execution, no source assertion weakening or exception. Exact final-head independent Claude A/B review and separate acceptance remain required; Ben alone merges.


## CH-4-C v5-r5 — bounded CI catalogue capture source (21 October 2026)

Status: **SOURCE PREPARED / NOT RUN** for actual PostgreSQL capture. This is the builder's run receipt, not an independent verdict or acceptance. No prior-head source PASS is carried to this changed source.

### Issuance, executor and source chain

- Issued scope: root's CH-4-C v5-r5 catalogue-capture order, binding the bounded Astra design. Exactly two writable repository files: `packages/db/test/job-work-state-catalog.integration.test.ts` and this append-only receipt. The separate intended dispatcher message is `/private/tmp/jg-msg-ch-4-c.txt`.
- Builder: Codex GPT-6.1-Sol, medium reasoning, through the matching stock dispatcher `/Users/benharwood/.local/share/full-steam/jg-dispatch-cont.sh`; account home `/Users/benharwood/.codex-ben2`. The launcher's inspected source calls `codex-pick-home` freshly inside the lifetime outer gate, maps the returned home to its stock dispatcher, and its recorded result selects that account/dispatcher. The stock invocation specifies `-m gpt-6.1-sol -c model_reasoning_effort="medium"`. No replacement executor or sub-agent was launched. The dispatcher's old Claude attribution is not actual builder/coordinator ownership.
- Coordinator: the issuing root Codex session; launcher record identifies PID 34436, started `2026-10-21T02:19:16.481783+00:00`. Execution evidence inspected at `/Users/benharwood/.local/share/full-steam/jg-runs/ch4-catalogue-capture-r5-20261021T021837Z/{launcher-pid.json,launcher-status.json,launcher.log}` and `/private/tmp/jg-ch4-r5-catalogue-build-launcher.py`. Launch status records `HEAVY_SLOTS=1 heavy-slot, lifetime ownership`; no nested heavy-slot invocation occurred. A process-list probe was sandbox-refused; no process was killed or scheduler bypassed.
- Actual source predecessor and current uncommitted checkout: `72521431722f3e6e06b2df388e4e49b67c07df9a`. Actual branch: `codex/sandbox/ch-4-c`. Starting worktree was clean. Supplied main/base `dc5721230fd8aedbf2d9d0457789074b66b48765` is an ancestor; `origin/main` also resolved to that base during normal lane lint.
- New feature commit, tested checkout/merge SHA, CI run/attempt/job/step, final checks and payload identifiers: **NOT AVAILABLE / NOT RUN**. Dispatcher owns the resulting commit; root alone owns feature push following bounds inspection; Ben alone owns merge. No git-writing command, commit, push, merge or release was performed by this builder.
- All 14 source-before hashes in root's run manifest were checked against actual predecessor bytes and match the issued Appendix A. Original own-test SHA-256: `70946dbced2be9ed96fe1ebe8c4e3ab86dce02cd0d104559166df4a2041eb701` (4,848 bytes). Original receipt SHA-256: `34caceb0931bb0c138a69b32176edb64d1431ca602fdcc0a4bd9d44ce2bf4f56` (76,128 bytes); those bytes are retained as the exact prefix of this file.
- Prepared own-test SHA-256: `46c6671791e2d9529cb65452a14a3b653d64ef94571d88307df0429e10f42677` (28,464 bytes). This is a source-file hash, never a PostgreSQL definition or payload hash. Actual CI source hashes will be emitted by the diagnostic and must bind this chain before collection acceptance.

### Additive implementation and preservation

- Added existing-reader/registry and Node built-in imports, private capture/encoding helpers, and one final unconditional capture case. Its own timeout is 60 seconds. The original imports, entire original three-case describe content, test order, bodies, assertions, fixture selection and hooks including their timeouts were compared byte-for-byte with the predecessor and preserved. No skip, only, opt-in switch, accepted failure or empty-success branch was introduced.
- Fifteen exact function identities are selected, including eight new and seven replacement definitions in 0201. Older routine-count notes above are stale and remain historical; they are not rewritten. Required definitions/digests, uniqueness, exact identity selection and row/preimage correspondence fail closed when incomplete.
- The added diagnostic uses one existing administrator PoolClient and `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verifies read-only/isolation metadata, commits after successful reads and byte checks, rolls back on errors, preserves rollback failures and always releases the client. It performs SELECT-only catalogue/preimage/ledger queries. No application function is invoked to discover its definition. Existing fixture setup and original negative cases retain their original writes.
- The bounded closure is the 18 issued seeds plus every actual non-system relation attached through any non-internal trigger to the five exact target function OIDs. Disabled triggers remain included. It records all raw relation rows and all policies/non-internal triggers on that closure, with full function/trigger definitions and nullable policy expressions. OIDs are only transient query join keys, not emitted identities. No historical attachment counts are expected values.
- `readProtectionRecord` runs on the full actual Catalogue before selection; its complete selected routine records retain out-of-scope scan references. All closure summaries accompany raw records. Complete roles/memberships/reach, selected schema rows, scoped effective routine/relation/column/schema privileges, current database metadata and database ACL accompany the direct ACL observations. Static call/write arrays remain labelled regex hypotheses.
- Encoding sorts object keys and record collections by locale-independent identity/complete composite keys. Explicit ACL/column/policy-role/settings/options/dependency sets are sorted with duplicates retained. Registry order, routine configuration, trigger events and source strings retain their observed order. Current JSON round-trip, reversed current routine-record ordering, exact preimage digest correspondence and chunk reconstruction are self-consistency checks only; no expected protection or historical digest comparison is added.
- Schema provenance is the actual fully installed CH4 `postgres` fixture: `migrate(admin)` then `installLegacySyntheticPartyFixtures(admin)`, with a random `ch4_<uuid>` runtime login inheriting `jobguard_runtime`. Query actor, reader subject and runtime login are separately recorded. No LP0 second bootstrap/harness is used.
- Actual source bytes are hashed for the own test, fixture, reader, authority test, 0201, read-only inventory, migration runner/export, legacy-fixture source, manifests and lockfile. The actual registry export supplies ordered registered filenames and individual SQL source hashes. The established `public.jobguard_schema_migration` ledger is read as ordered `migration_name, applied_at::text`, with `packages/db/src/migrate.ts` identified as provenance; registered files and applied facts remain separate. Installed TypeScript/Vitest/pg/embedded-postgres package versions and package-JSON hashes, Node version, server version/encoding/collation, snapshot metadata, whitelisted CI identifiers and a detached checkout SHA when available are recorded. Missing checkout information is explicitly unavailable at emission, requiring later root binding.
- This is a full installed synthetic fixture observation including legacy setup and successors, not isolated-0201 execution, a SQL-to-catalogue equivalence proof, production evidence, or an origin claim about a successor-replaced routine. No business rows, secrets, connection strings, password fields, arbitrary environment dump, subprocess or network metadata discovery is emitted.
- No lane, inventory, migration, registry, production file, shared helper, package/lock, workflow or other test was edited. No inventory pin was refreshed or nulled. All other 13 manifested files were byte-identical before this receipt append; source-preservation checks also explicitly checked package/lock/lane/runner/export/legacy-fixture source bytes. Final scope checks remain recorded below.

### Commands actually executed locally

All compiler/lint commands remained within the already-owned outer scheduler gate; no install, download, provisioning/config workaround, DB, Vitest, migration, browser, Playwright, turbo fanout, pnpm test/build or OpenAPI invocation occurred. The pinned installed toolchain was retained.

| Command/evidence | Actual result |
| --- | --- |
| `git rev-parse HEAD`, `git branch --show-current`, initial `git status --porcelain=v1` | Issued full predecessor / exact branch / clean |
| `git merge-base --is-ancestor dc5721230fd8aedbf2d9d0457789074b66b48765 72521431722f3e6e06b2df388e4e49b67c07df9a` | Exit 0 |
| One strict full changed-test compiler: `node packages/db/node_modules/typescript/bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --forceConsistentCasingInFileNames --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext packages/db/test/job-work-state-catalog.integration.test.ts` | Exit 0, no diagnostics. Sole compiler invocation; test not executed. Immediately preceding `df -k .`: 245,824,060 KiB available, above 47,185,920 KiB (45 GiB) floor |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | Exit 0. Core purity, ordinary CH-4-C lane and money/commercial checks passed; seven existing computed-import sites reported as unverifiable under the existing policy. Immediately preceding disk observation: 245,824,120 KiB available |
| Python byte/hash preservation checks over `git show` predecessor versus working files | All 14 source-before hashes match; original three cases/hooks/imports byte-identical; package/lock/lane/shared provenance bytes unchanged |
| `git diff --check` and path-scoped predecessor diff check | Exit 0 before receipt append; final checks below |
| PostgreSQL catalogue capture / original tests / CI full suites | **NOT RUN locally**, intentionally CI-only under the issuance |
| Fresh exact-full-head Claude A/B and separate acceptance | **NOT RUN / HOLD**; no self-acceptance |

These are deterministic source/static check results, not independent model review or database execution evidence.

### Framing, future collection and mandatory holds

- Proposed private format: `ch4-ci-catalogue-capture.v1`; scope: `ch4-0201-routines-and-trigger-relation-closure.v1`. Stdout emits `CH4_CAPTURE_BEGIN`, indexed `CH4_CAPTURE_CHUNK` JSON records (base64 data at most 3,000 characters each), `CH4_CAPTURE_END` with section counts/chunk count/exact UTF-8 byte length/Node SHA-256, then the separate `CH4_CAPTURE_COMPLETE` observation-only label. An error before completion cannot emit a valid completion sequence. Frame count, bytes, actual observed identities/counts and payload digest are **NOT AVAILABLE until CI**; planning counts are not results.
- Root's pre-issuance CI-path/log-route verification is supplied evidence, not repeated execution here. Existing required CI must run the unchanged full suites and own four-case file normally; no workflow change or optional job was added. The existing required job's normal `pnpm test` -> turbo -> DB Vitest wrapper is retained; no scoped selector replaces full required CI.
- Root must fetch the NEW exact run/job/attempt's complete log using the established `gh run view <run> --job <job> --log` route and retain raw bytes, SHA and verified reconstructed canonical payload at `/Users/benharwood/.local/share/full-steam/jg-runs/ch4-catalogue-capture-r5-20261021T021837Z`. No new raw log or capture bytes have been collected by this builder. That location's existing preflight records are not future capture evidence.
- Collector must find a unique complete begin/chunk/end/completion sequence despite runner prefixes; reject missing, duplicate, reordered, malformed or out-of-range chunk indices, inconsistent totals, invalid/noncanonical base64, clipped output, wrong byte length/digest or section/identity counts. Preserve partial evidence and mark INCOMPLETE/HOLD on any failure. A test PASS alone never proves complete log delivery.
- Post-run receipt must bind the immutable original payload to actual resulting feature head, tested checkout/merge SHA, workflow/job/step/run/attempt, command path, final own-test/job/all-required-check statuses, raw-log and payload retained locations/hashes/bytes and successful reconstruction. Missing emission-time identifiers require real checkout/run/source evidence or provenance remains held. Do not modify payload bytes to insert later metadata. Receipt-only later heads and tested source heads stay distinct and still require applicable fresh full-head reviews/CI.
- All mandatory CI remains pending, including the separate Vite dependency-review gate and retained PostgreSQL, migration, browser and other suites. No historical failure is hidden by static success or a future capture. Source PASSes at 72521431 are historical once this source changes.
- Fresh SAME original Claude A and B reviewers after the issued reset (07:10 London; first 07:15), exact new full head and complete retained CH4 scope, plus an actual separate accepting actor, remain mandatory. No fresh verdict, acceptance or merge is represented here.
- Continuing holds remain: LP0-13 same-signature protection detection; LP0-22 whole-task acceptance; inventory refresh; capacity/resume; T-01 timer; normal transport; isolated own-migration/successor proofs; production/release and all other carried gates. This source change clears none of them.


### Final builder scope/static closure

- Standalone `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: exit 0 with the ordinary registered `ch-4-c` branch and no override. Immediately preceding `df -k .` showed 245,823,644 KiB available, above the exact 45 GiB floor. This ran after the source receipt append.
- Final predecessor `git diff --name-only` showed exactly the two issued repository paths. Status had only those two modifications and no untracked files. Full two-file diff inspected; `git diff --check` passed (exit 0).
- Final byte/hash checks passed: original receipt is an exact 76,128-byte prefix; original three cases/hooks/imports remain byte-identical; all 14 predecessor source hashes still match the manifest; all 12 manifested files outside the two-file allowance and package/lock/shared provenance source remain unchanged. The own-test bytes remain exactly the compiler-tested SHA-256 above; no code edit followed that sole successful compilation.
- Intended conventional dispatcher message is prepared at `/private/tmp/jg-msg-ch-4-c.txt`, subject `test(db): capture CH4 synthetic catalogue in required CI logs`. Work remains uncommitted for the stock dispatcher. Actual capture/required CI/log reconstruction/fresh full-head reviews/separate acceptance remain **NOT RUN / HOLD**. No additional local suite is authorized or claimed.
