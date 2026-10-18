# CH-4-C builder receipt — Sub-order A

18 October 2026. Builder: Codex. Base inspected:
`b881f90be0a6d368838ca4392338147ef819bd3a`; branch `codex/sandbox/ch-4-c`.
Migration `0191_job_work_state_commands.sql`. Working-tree delivery only: no git
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
2. **Capacity handoff B.** `0191_job_work_state_commands.sql:31` supplies an
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

See `packages/db/migration-notes/0191_job_work_state_commands.md` for exact
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
