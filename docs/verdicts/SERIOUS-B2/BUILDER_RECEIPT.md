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
