# SERIOUS-B2 builder receipt — HOLD / coordinator ruling required

Issued by dispatcher 13 on 16 October 2026 under FAST MODE rule 5; RED lane (access/data).
Branch: `codex/sandbox/serious-b2`. Inspected HEAD and `origin/main` both equal
`0bbb5ddbd074b791ece740a1861a6b7cc2fd6577`. Builder evidence only; no independent
model verdict, separate technical acceptance, commit, push or release is claimed.

## Disposition

| Item | Result | Evidence / next owner |
| --- | --- | --- |
| S02 | **STOPPED** | Scripted repository regression failed as expected: the general schedule list returned both A and B. Refusing access contradicts an existing expected success; the repository also has an exact source-hash pin. Coordinator ruling required. |
| S03 | **STOPPED** | Scripted preparation regression failed on reversed site IDs. A minimal prototype made it pass, but failed the existing exact source-hash checks. Prototype reverted; coordinator ruling required. |
| S04 | **DEFERRED** | Partial demo-organisation setup recovery: expressly outside this PR under dispatcher 13's scope limit. |
| S05 | **DEFERRED** | Finance using generated imports: expressly outside this PR under dispatcher 13's scope limit. |

No item is DROPPED. **Neither production defect is fixed in the final working tree.**
Only this receipt, diagnostic patches and the exact-path lane file remain. All
existing application, test, policy, fingerprint and migration files are unchanged.

Read: AGENTS.md; BUILD_PLAN.md §§2, 3, 9.1.2–9.1.3 and ENT-2; every S-item
in Batch 2 of `NIGHT-AUDIT-TRIAGE-SERIOUS-2026-10-16.md`; source aliases
`dbsrc-15#1`, `api-contractor#1/#2/#3`, `dbsrc-17#2/#3` at their issued
`/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/` paths.
Other batches were not implemented. S02 concerns the documented restricted
client-approver scope; S03 concerns the identical-import/stable-party guarantee.

## S02 — exact stop and reproducer

The current path is `WorkOrderApplication.sorVersions` → `SorRepository.list`.
The `contract.read` existence check on any client allows the unfiltered tenant-wide
schedule SELECT. The scripted test models a false tenant grant and a true grant
for client A, then returns distinguishable schedule rows A/B from that SELECT.
It exercises real repository control flow, **not real PostgreSQL authorization**.
The underlying permission-function semantics were source-inspected in migration
0054; PostgreSQL confirmation remains outstanding.

The new regression was written and run before any production fix:

```sh
cd packages/db
pnpm exec vitest run --maxWorkers=1 src/serious-b2-fixtures.test.ts src/serious-b2-sor.test.ts
```

Exit 1: both new tests failed. S02's exact failure was:
`AssertionError: promise resolved "{ version: 'sor-version-list.v1', …(3) }" instead of rejecting`;
the received versions contained references `A` and `B`. Local output:
`/private/tmp/jg-serious-b2-red.log`.

**Existing expected value requiring a ruling:**
`packages/db/test/contractor.integration.test.ts:422` currently says:

```ts
expect(await outcome(()=>rates.list(actor)),`${label}: price-list read`).toBe(may('contract.read',tenantTarget)||may('contract.read',clientTargets.A)||may('contract.read',clientTargets.B));
```

Before: `true` for `client_approver@client` (actor defined at line 389).
Required after for the documented approval-pack-only role: `false`.
A proposed expression for coordinator consideration, **not applied**, is:

```ts
expect(await outcome(()=>rates.list(actor)),`${label}: price-list read`).toBe(!grants.some(g=>g.role==='client_approver')&&(may('contract.read',tenantTarget)||may('contract.read',clientTargets.A)||may('contract.read',clientTargets.B)));
```

There is also a whole-source pin at
`apps/api/src/auth/context-boundary.test.ts:93` for `packages/db/src/sor-repository.ts`:
`45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5`.
No S02 production prototype or replacement hash was generated after finding the
expectation conflict. Any reviewed implementation needs a separately authorized
pin disposition. No pinned list or test was edited.

The failing new test is preserved, inactive, in `s02-reproducer.patch`. It was
removed from active test discovery because S02 is stopped, not passed. The patch
can recreate the reproducer for the coordinator after the ruling; it is not a fix.

## S03 — exact stop, prototype and PostgreSQL handoff

Initial preparation returns site revisions in creation order. Reuse orders equal
transaction timestamps by random UUID. The application regenerates its CSV on each
call, so an array-position site lookup changes both payload hashes and parties.

The scripted regression uses twelve numbered streets with descending UUIDs and
checks both the original site array and all three generated sample files. Before
the prototype it failed at the array equality: expected descending creation order,
received ascending UUID order. This is driver-double evidence, not a PostgreSQL run.

The minimal prototype selected the stored street address and sorted reloads in
numeric street order (stable UUID tie-break), leaving initial creation order intact.
The same regression then passed: 1 file, 1 test, exit 0, via
`pnpm exec vitest run --maxWorkers=1 src/serious-b2-fixtures.test.ts`.
Output: `/private/tmp/jg-serious-b2-green.log`. No money or access policy changed.

**Pin requiring a ruling:** `apps/api/src/auth/context-boundary.test.ts:95`,
entry `packages/db/src/work-order-fixtures.ts`:

```text
before: cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386
after:  703b2f726e9d4256cbd0a1908676f2cd401d64bad28741853f8131183cd0a0ea
```

The after hash identifies the archived prototype, **not an authorized pin change**.
Both existing checks refused it:

- `holds for the real repository: only the bridge, its definition, the worker queue, the retained synthetic sandbox and the rehearsal construct a tenant context` (line 748 assertion).
- `approves each main practice caller only at its exact reviewed source identity` (line 1290 assertion).

Failure: `packages/db/src/work-order-fixtures.ts practice constructors must match
the exact reviewed authenticated practice-session source; changed code needs
renewed caller review and grants no pilot/production authority`.

On discovering that requirement, the prototype and active regression additions
were reverted. The source, unit test and append-only integration-test addition are
preserved in **inactive** `s03-prototype.patch`; the patch does not change any pin.

PostgreSQL regression written but **not run**, for dispatcher/CI after the ruling:
`packages/db/test/work-order-import.integration.test.ts`, test
`S03: generated samples retain site bindings across preparation, replay and amendments`.
It forces descending UUIDs, confirms equal creation timestamps, compares all sample
bytes, checks same-command and fresh-command replay with unchanged database counts,
then requires 3 amended revisions, 1 unchanged row and 0 rejected rows. Suggested
CI command after applying the approved implementation/test changes:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/work-order-import.integration.test.ts --testNamePattern='S03: generated samples'
```

The archived prototype's integration test is unverified. It is not evidence of
database guarantees or completion, and the final tree intentionally contains no
active test claiming this unfixed behavior passes.

## Commands and verification

Node `v24.17.0`; cached pinned pnpm `10.28.1`; installed Vitest `4.1.11`.
No installation or dependency download was attempted. The default pnpm launcher
stalled during version discovery; subsequent commands used the already-cached
10.28.1 through `/private/tmp/jg-serious-b2-bin/pnpm` on PATH. No clean install is
claimed. Logs named below are local `/private/tmp/jg-serious-b2-*.log` artifacts.

| Command actually run | Result |
| --- | --- |
| `pnpm typecheck` | PASS, 7 packages; rerun after restoring sources (`typecheck-final.log`). An earlier first run caught an incomplete new test-double type, corrected before the prototype's successful run. |
| `pnpm build` | PASS, 7 packages on restored sources (`build-final.log`). No server or browser journey started. |
| `LANE_BASE_REF=origin/main pnpm lint` | BLOCKED at the standard lane check: `Missing branch or self-comparison range; refusing a misleading pass.` HEAD equals origin/main because commits are forbidden in this work order. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Same range refusal; no bypass or tool modification. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Same range refusal. Dispatcher must rerun after committing. |
| `pnpm exec turbo run lint` | PASS, 7 package lint tasks; restored-source rerun (`package-lint-final.log`). |
| `node tools/core-purity-lint.mjs` | PASS, 182 TypeScript files. |
| `node tools/money-arithmetic-lint.mjs` | PASS. |
| `node tools/commercial-boundary-lint.mjs` | PASS. |
| `pnpm openapi:check` | BLOCKED by tsx CLI IPC socket `listen EPERM`; no schema change. |
| `cd apps/api && node --import tsx src/generate-openapi.ts --check` | PASS, exit 0; same source generator/check via a socket-free invocation. |
| Core/config/storage/AI source unit suites (command below) | PASS: core 2,601; config 1; storage 2; AI 85. Synthetic evaluation output only; no live model calls. |
| DB source unit suite (command below) | PASS: 10 files, 110 tests (`unit-db-final.log`). |
| API source unit suite with unavailable integration/HTTP suites excluded (command below) | PASS: 77 files, 1,639 tests, including unchanged context-boundary pins (`unit-api-final.log`). |
| `cd apps/api && pnpm exec vitest run --maxWorkers=1 src/auth/context-boundary.test.ts` | PASS after restoration: all 145 pinned boundary tests (`pinned-final.log`); this is a subset of the API suite, not additional coverage. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` | PASS: 39 files, 844 unit tests (`unit-web.log`). No browser/e2e run. |
| Seven safe tool unit suites (command below) | PASS: 19 tests (`unit-tools.log`). Git-writing lane/churn fixture suites omitted under the work order's no-write rule. |

Successful source-suite commands:

```sh
pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai exec vitest run --maxWorkers=1 src
cd packages/db
pnpm exec vitest run --maxWorkers=1 src --exclude 'test/**'
cd ../../apps/api
pnpm exec vitest run --maxWorkers=1 src --exclude '**/shadow-isolation.application.test.ts' --exclude '**/final-account-lock.isolation.test.ts' --exclude '**/health.test.ts' --exclude '**/*.http.test.ts' --exclude '**/auth/sso/action-paths.test.ts'
cd ../..
node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs
```

Earlier broad package-script tests selected emitted `dist` duplicates: core had
5,200 passes and 2 `ENOENT` source-relative failures. Source-only reruns above passed.
An initial DB `src` name filter also matched integration filenames containing
`dbsrc`; those and API's initially included final-account isolation suite failed at
free-port probes. **No PostgreSQL process or browser was started.** They were then
excluded explicitly. That initial DB run also had one source-scan timeout under
concurrent checks; the final DB source run passed without relaxing a test timeout.
Root `pnpm test`, database/migration suites and browser/e2e suites were not run;
these partial unit results are not a whole-CI pass.

A supplemental read-only check loads the actual merged lane policy, selects this
branch with `selectLane`, enumerates tracked/untracked working-tree paths, and
uses `lanePathAllowed` for each. This verifies the exact allow list only; it is not
the blocked standard range check or an independent verdict. Final result: PASS,
exactly four files (`dirty-lane-final.log`): the lane, this receipt and the two
diagnostic patches. `git diff --check` passed; byte comparisons against HEAD
confirmed both production repositories and all relevant existing tests unchanged.

## Final handoff

No migrations, migration runner edits, ledger changes, new credentials, operational
alerts, external actions, real data, spending or production-policy decisions.
Compatibility: runtime behavior is unchanged because both items are stopped.
G0/G1/G4-C and every other existing release gate remain unresolved as before.

The coordinator must rule on the exact expected-value/pin conflicts above before
implementation can resume; then dispatcher/CI must run real PostgreSQL checks and
the normal complete suite. The different-model exact-commit verdict and separate
technical acceptance remain required. The builder does not accept this work.

Intended commit message is in `/private/tmp/jg-msg-serious-b2.txt`. No Git-writing
command was run; the dispatcher owns committing, pushing, review and merge.


## build

Dispatcher 14, 16 October 2026 night; rulings 64 and 68 inspected verbatim in
`/Users/benharwood/.local/share/full-steam/handoffs/BEN-DECISIONS-2026-10-14.md`.
**STOPPED before implementation under the work order's exact-file:line stop rule.**
This section supersedes the earlier handoff only as to this new build attempt;
S02/S03 remain unfixed. S04/S05 remain deferred.

Inspected branch: `codex/sandbox/serious-b2`.
HEAD: `1d2994a96b27ed29b70e289eb789f7e2b9b61d5c`.
Local `origin/main`: `d74fd66d684226a5150fe3d3576a853d58abcf31`.
`git rev-list --count HEAD..origin/main` returned `0`; the branch is not behind
that local reference. No fetch, merge, Git-writing command, install or download.
The working tree was clean before inspection. Node reports `v24.17.0`.

### Exact blocker and before/after

`packages/db/test/extra-origin.integration.test.ts:249` independently pins the
whole S02 repository, and `:252` independently pins the whole boundary scanner.
Both are additional to the explicitly authorized S03 pin at `:251`:

| File:line | Before (also actual after this stopped attempt) | Required after implementing the authorized edits |
| --- | --- | --- |
| `packages/db/test/extra-origin.integration.test.ts:249` | `"packages/db/src/sor-repository.ts": "45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5",` | Pin to the final S02 source hash; changing this extra-origin pin is not named in ruling 68. |
| `packages/db/test/extra-origin.integration.test.ts:252` | `"apps/api/src/auth/context-boundary.test.ts": "ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2"` | Pin to the scanner's final hash after its authorized lines 93/95 change; changing this pin is not named in either ruling. |

`shasum -a 256` confirmed these two current pins match their source files.
The existing loop at `:254` checks every whole-source hash. Updating only the
named lines would therefore leave that existing assertion failing. Final hashes
were not invented or recorded: no implementation was made. The work order says
all other pins stay byte-identical and to STOP if its assumptions fail; this is
that stop, not a request to weaken the test or widen the allowed scope.

The lane file `config/lanes/serious-b2.json` also still permits only the earlier
receipt/diagnostic artifacts. It was inspected and left byte-identical, as required.
The dispatcher must reconcile the authorized implementation paths with the lane
before its normal CI check can accept those edits.

### Verification and handoff

Read-only inspection covered AGENTS.md, applicable BUILD_PLAN.md contracts and
ENT-2, both archived reproducer/prototype patches, repository implementations,
permission-function semantics, named expectations and all matching source pins.
Commands actually run include `git status --short`, `git branch --show-current`,
`git rev-parse HEAD`, `git rev-parse origin/main`,
`git rev-list --count HEAD..origin/main`, `git diff --stat origin/main`, `rg`,
`sed`, `nl`, `cat`, `node --version` and the SHA-256 checks above.

**NOT RUN:** typecheck, lint (`LANE_BASE_REF=origin/main`), lint:lanes, unit tests,
build and OpenAPI check: stopped at the pin conflict before implementation.
**NOT RUN:** affected PostgreSQL tests, test:db, test:migrations and browser suites;
the dispatcher states this sandbox cannot bind localhost/start PostgreSQL, and
no such process was attempted. No passing implementation or independent verdict
is claimed. No migrations, role changes, new alerts or release-gate changes.

Only this build section was appended. All code, tests, expectations, pins, shared
lists, lane files and archived patches remain byte-identical to HEAD. Intended
commit message written to both requested locations:
`/private/tmp/jg-msg-ent-3b.txt` and
`/private/tmp/jg-msg-serious-b2-build.txt`.
Dispatcher owns committing/pushing and resolving the additional pin scope;
independent exact-commit verdict and separate acceptance remain outstanding.

### Addendum build attempt — rulings 70/71, STOP at lane location

Dispatcher 14's addendum authorizes the extra-origin pins previously blocking
the build. Those pins and the other named source/test lines are present. This
attempt found a different, exact mismatch with ruling 70 before implementing:
**`config/lanes/serious-b2.json:4` owns the existing `serious-b2` lane, with its
allow-list starting at line 8. `config/agent-lane-assignments.json` has no
`serious-b2` entry.** Ruling 70 explicitly locates the allow-list amendment in
the latter file, while this work order requires every other shared list to
stay byte-identical and a STOP when a ruling assumption is false.

Before and actual after: both lane files remain byte-identical. The existing
allow-list is exactly:

```json
[
  "docs/verdicts/SERIOUS-B2/BUILDER_RECEIPT.md",
  "docs/verdicts/SERIOUS-B2/s02-reproducer.patch",
  "docs/verdicts/SERIOUS-B2/s03-prototype.patch"
]
```

Required disposition before resuming: apply the ruled path additions to the
existing lane at `config/lanes/serious-b2.json:8`, rather than introduce a second
lane in the named legacy register. The proposed after would retain those three
entries and append only the authorized implementation/test paths. No such
amendment was made. `tools/agent-lane-boundary-lint.mjs:64` explicitly refuses
duplicate registration. A read-only in-memory `mergeLanePolicy` check confirmed
that copying this lane into the named register fails with:

```text
Lane file "config/lanes/serious-b2.json" refused: lane "serious-b2" is already registered in config/agent-lane-assignments.json; a lane file cannot replace it.
```

Inspected HEAD: `0c19f840b1d76dc73c1188af413278654f2fb5c2` on
`codex/sandbox/serious-b2`; local `origin/main`:
`d74fd66d684226a5150fe3d3576a853d58abcf31`.
`git rev-list --count HEAD..origin/main` returned `0`. The initial working tree
was clean. Node is `v24.17.0`. No fetch, merge, installation, download or
Git-writing command was run.

Read-only inspection covered AGENTS.md, the applicable BUILD_PLAN.md contractor
contracts, the work-order import contract, the production repositories, named
test lines/pins, both archived patches and the lane policy loader. The diagnostic
above used only JSON parsing and an in-memory call; it did not write either
register. `git diff --check` passed.

**NOT RUN:** typecheck, lint with `LANE_BASE_REF=origin/main`, lint:lanes, unit
tests, build and OpenAPI check: stopped before implementation under the explicit
work-order rule. **NOT RUN:** affected PostgreSQL test files, test:db,
test:migrations and browser suites. The dispatcher states this sandbox cannot
bind localhost or start PostgreSQL. No database/browser process was attempted.

Only this subsection of the existing build receipt changed. All production code,
tests, expectations, pins, lane files, other shared lists and archived patches
remain byte-identical to HEAD. S02/S03 remain unfixed; S04/S05 remain deferred.
No migration, authorization change, new alert or release-gate change occurred.
Intended conventional commit message written to
`/private/tmp/jg-msg-ent-3b.txt` and
`/private/tmp/jg-msg-serious-b2-build.txt`. Dispatcher owns commit/push; exact-commit
independent verdicts and separate acceptance remain outstanding.

### Completed S02/S03 build — rulings 64, 68, 70 and 71; lane clarification

Dispatcher 14, 16 October 2026 night. **S02 and S03 are now implemented in the
working tree.** This subsection supersedes the stopped build attempts above.
S04/S05 remain deferred. This is builder evidence, not an independent verdict or
technical acceptance. No commit, push, merge, release or deployment was performed.

Inspected starting HEAD: `15a055fe5351b107548d79d21423939be79c594f` on
`codex/sandbox/serious-b2`; local `origin/main`:
`d74fd66d684226a5150fe3d3576a853d58abcf31`. The starting working tree was clean.
`git rev-list --left-right --count HEAD...origin/main` returned `4 0`;
`git rev-list --count HEAD..origin/main` returned `0`. No fetch or merge was
necessary or attempted. Read AGENTS.md, BUILD_PLAN.md §§2.1–2.4, 3,
9.1.2–9.1.3 and ENT-1/ENT-2, the S02/S03 audit entries, both preserved patches,
the existing permission function and the ruled files before changing code.

**Implementation and invariants:**

- S02: after the existing active-membership/contractor gate, read the membership's
  persisted role inside the tenant transaction. Missing membership or
  `client_approver` returns the existing typed `NOT_FOUND` before any schedule
  read. All other roles retain the exact existing contract-read permission SQL
  and schedule SELECT. Approval-pack access and the shared role/permission matrix
  are unchanged. Only the client-approver outcome at
  `packages/db/test/contractor.integration.test.ts:422` changes from true to false.
- S03: reload generated site revisions by their stored numbered street address,
  using numeric ordering and an ID tie-break. This restores initial creation
  order instead of ordering equal transaction timestamps by random UUID, so the
  same sample keeps its site bindings and bytes across preparation calls. The
  final implementation matches the archived prototype's source hash. No migration
  or data rewrite; no attempt to repair already-imported historical misbindings.
- Lane: appended exactly the five ruled paths, in the clarification's order, to
  `config/lanes/serious-b2.json`'s existing allow array. Its note and all other
  values remain unchanged. `config/agent-lane-assignments.json` is unchanged.
- Pin order: finalized both sources, refreshed only context-boundary lines 93/95,
  then refreshed only extra-origin lines 249/251/252 to those final source hashes
  and the final scanner hash. No source/test edits followed those pin updates.

Final SHA-256 identities (before → after):

| Source | Before | Final |
| --- | --- | --- |
| `packages/db/src/sor-repository.ts` | `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5` | `122322172cea27dc52754ff19629abbbe049b8d96997a1a2e42a8887ac5a62d2` |
| `packages/db/src/work-order-fixtures.ts` | `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386` | `703b2f726e9d4256cbd0a1908676f2cd401d64bad28741853f8131183cd0a0ea` |
| `apps/api/src/auth/context-boundary.test.ts` | `ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2` | `ad2b6cd2fe2d1d7a4edd8351312a9fc8bee0dde18bb2eafa215f233727766e03` |

**Preserved regressions:** both archived patches remain byte-identical. To obey
the restriction on every other test file, their two source-unit reproducers were
extracted into `/private/tmp/jg-serious-b2-build-regressions/`; only their relative
source imports were rewritten to absolute imports of this worktree's real source.
No test assertions were changed. Both failed before the fix (exit 1, two failures,
`/private/tmp/jg-serious-b2-build-red.log`) and both passed after it (exit 0,
`/private/tmp/jg-serious-b2-build-green.log`). They remain preserved as patches,
not added to normal repository test discovery.

A supplemental temporary suite exercises all nine persisted roles with both
prior permission outcomes, missing membership and revoked membership: 20 passing
scripted-driver checks. It explicitly verifies no schedule SELECT for a refused
caller. The archived S02 double itself supplies no role row to the new query,
so its green result proves the fail-closed path; the supplemental cases also
supply a real `client_approver` role value to test that refusal directly.
An extracted copy of the existing [S9] assertion also passes without its enclosing
PostgreSQL setup (only its original file URL base was restored for temporary
execution). Final temporary result: **4 files, 23 tests, exit 0**. These are
scripted repository and file-integrity checks, not PostgreSQL authorization proof.

Actual final harness command:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --root /private/tmp/jg-serious-b2-build-regressions
```

**Checks actually run:** Node `v24.17.0`, installed pnpm `10.28.1`, Vitest
`4.1.11`; no install/download or clean-install claim. pnpm commands used the
already-cached launcher via `PATH=/private/tmp/jg-serious-b2-bin:$PATH`.
Logs are `/private/tmp/jg-serious-b2-build-*.log`.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | PASS, exit 0; 7 package tasks (`typecheck.log`). |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS, exit 0; root boundary checks and 7 package tasks (`lint.log`). |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, exit 0 (`lanes.log`); includes the working-tree changes. |
| `pnpm build` | PASS, exit 0; 7 package tasks, including production Next build (`build.log`). Next reports dynamic-dependency warnings; Turbo reports sandbox IO warnings, without task failures. |
| `pnpm openapi:check` | BLOCKED, exit 1: tsx CLI IPC socket `listen EPERM` (`openapi.log`). |
| `cd apps/api && node --import tsx src/generate-openapi.ts --check` | PASS, exit 0; same generator/check without the CLI socket, repeated after build (`openapi-final.log`). No schema edit. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/auth/context-boundary.test.ts` | PASS, 145 tests, exit 0 (`boundary.log`); also included in the final API suite below. |
| Foundation source suites, command below | PASS, exit 0: core 2,674; config 1; storage 2; AI 85 (`unit-foundations.log`). AI evidence is synthetic fixtures only. |
| DB source suite, command below | PASS, exit 0: 15 files, 124 tests (`unit-db.log`). |
| API source suite with listed environment-dependent exclusions, command below | PASS after build, exit 0: 80 files, 1,653 tests (`unit-api-final.log`). |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` | PASS, exit 0: 40 files, 867 tests (`unit-web.log`); unit tests, not browser journeys. |
| Seven safe tool suites, command below | PASS, exit 0: 19 tests (`unit-tools.log`). |
| Temporary regression/S9 harness, command above | PASS, exit 0: 23 tests (`regressions-final.log`). |
| `python3 /private/tmp/jg-serious-b2-build-audit.py` | PASS, exit 0 (`scope.log`): exact authorized test-line changes, final hashes, exact ordered lane delta, all other tracked files byte-identical to inspected HEAD; this receipt only appended. Deterministic verification, not checker review. |
| `git diff --check` | PASS, exit 0. |

The first broad API source run preceded the required build and failed eight
billing-adapter tests because installed workspace imports used older generated
core exports (`renderBillingExport` and a billing schema). The normal build
refreshed ignored artifacts. The full same API command then passed, without any
source change, test change or additional exclusion (`unit-api.log` →
`unit-api-final.log`). No failing test was weakened.

Successful source-suite commands (from repo root unless shown):

```sh
pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai exec vitest run --maxWorkers=1 src
cd packages/db
pnpm exec vitest run --maxWorkers=1 src --exclude 'test/**'
cd ../../apps/api
pnpm exec vitest run --maxWorkers=1 src --exclude '**/shadow-isolation.application.test.ts' --exclude '**/final-account-lock.isolation.test.ts' --exclude '**/health.test.ts' --exclude '**/*.http.test.ts' --exclude '**/auth/sso/action-paths.test.ts'
cd ../..
node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs
```

**NOT RUN:** the complete affected files
`packages/db/test/contractor.integration.test.ts` and
`packages/db/test/extra-origin.integration.test.ts`; the archived S03 PostgreSQL
replay/amendment regression in `s03-prototype.patch`; `pnpm test:db`,
`pnpm test:migrations`, browser/e2e suites and the excluded API database/HTTP
suites. The dispatcher states this sandbox cannot bind localhost or start
PostgreSQL; no database or browser process was attempted. The isolated S9 check
is not a passing full extra-origin integration run. **NOT RUN:** root `pnpm test`,
which includes Git-writing tool fixtures and unavailable integration suites.
These partial source-unit runs do not constitute full CI. Dispatcher/GitHub CI
must run the real PostgreSQL and browser checks after committing/pushing.

No new tables, migrations, ledger effects, external actions, credentials, alerts,
provider calls, policy approvals or release-gate changes. Affected invariants are
scoped access and stable generated party identity/idempotency. Existing imported
records are not backfilled. Shared source pins and the single conformance
expectation were changed only under the recorded rulings; overlap edits must
serialize against these final hashes. All other tests, expectations, pins, shared
lists and preserved patches are byte-identical to starting HEAD.

The dispatcher owns committing and pushing. Intended conventional commit message
(subject and body) is written to `/private/tmp/jg-msg-ent-3b.txt` and
`/private/tmp/jg-msg-serious-b2-build.txt`. Both independent checker verdicts bound
to the eventual exact commit and separate technical acceptance remain outstanding;
no builder self-acceptance or production-release approval is claimed.
