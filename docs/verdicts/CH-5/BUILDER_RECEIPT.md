Built by Codex; dispatched 13 Oct 2026.

# CH-5 builder receipt — independent core portion only

Built on 15 October 2026. This receipt records construction and executed checks;
it is not a review verdict or acceptance. The issued Sonnet attribution was not
used because it would incorrectly identify the builder and claim Codex was
unavailable. No independent different-model review or separate acceptance exists
for this uncommitted diff.

## Base and authority

- Branch: `codex/sandbox/ch-5`.
- Initial and final HEAD: `2514049c8dfb7630598fdf81f5c0d6d23444abb4`.
- Actual build base: `origin/codex/sandbox/mon-1` at that exact SHA, per the
  build-ahead header. It is not an accepted MON-1 merge.
- `origin/main`: `6671538c8d69936c162368c760dd6ce0f7f10493`, matching the header.
  `BUILD_PLAN.md` is unchanged between main, the parent and this worktree.
- The draft's historical `ec6ad4d` reference is superseded by the header/main.
  Inspected plan lines: CH-3a 490–511; counting 1312–1370; imports and exclusions
  1430–1468; CH-5 1977–1998; MON-1 2095–2133; CH-1 amendment 3553; final SV-2,
  SV-4 and SV-3 amendments 3581, 3592 and 3598; graph row 3660. The cited card,
  rules and final migration names agree with this main. The graph's 0076 remains
  historical. CH-1 is 0109; SV-2 0128; SV-4 0132; SV-3 0133.
- Q1's accepted-parent requirement is superseded for build-ahead construction
  only. No PR is opened before the parent merges; parent repair commits remain
  dispatcher-owned. No git write, commit, push or package installation was run.

The available MON-1 symbols are pure supplied-input boundaries:
`meterDay31Candidate`, `groupSuppliedMeterPlaces`, `computeSmallPlaceAllowance`,
`classifyMeterActivation`, `computeSuppliedMeterPeriod`, `suppliedMeterCorrection`.
There is **no accepted capacity-lock identity, event interval representation or
admission writer**. The explicit declaration at
`packages/core/src/jobs-on-the-go.ts:7` reads:

```ts
/** Independent synthetic inputs only. No event intervals, command admission or job attribution. */
```

STOP on that integration dependency. Before: the line above and pure parent
exports only. After: unchanged; no replacement or permissive implementation is
proposed. The dispatcher must supply the actual accepted execution interfaces
for a continuation. The independent core portion does not require them.

## Built scope and invariants

Six paths constitute CH-5: the new strict request/numeric/identity module and its
tests, one additive core export, one additive lane entry, the contract and this
receipt. Shared files are `config/agent-lane-assignments.json` (new CH-5 entry
only) and `packages/core/src/index.ts` (one appended export); their integration
serializes with the dispatcher. Parent-owned code and tests are unchanged.

- Strict `adopt-job.v3` intent: command UUID, expected source binding UUID,
  `live | invoiced`, bounded fictional baseline key. No public authority,
  money, v1 cap/policy or mode override. Invalid input returns a typed error
  through the parser. Direct Zod parsing remains available.
- Reversible choices: UUIDs normalize to lowercase; fixture keys use 1–80
  lowercase letters/digits separated by single hyphens. A key's existence and
  synthetic mode must be checked by the held server continuation.
- Canonical tuple text covers normalized public payload, source job and actor.
  It is not durable replay, authentication or a new context constructor.
- Explicit already-known integer inputs are validated to the existing money
  limit and delegated to CH-1's `isSmallJobV3`. No external-value provenance,
  missing-value fallback, import small flag or allowance is chosen.
- The lineage label aliases the unchanged existing label exactly.
- A pure reference test exercises existing signal/coalescing/confirmation,
  attribution, eligibility and fee functions with supplied pre-adoption timing.
  The exclusion survives newer evidence and confirmation; settled synthetic
  facts still yield exact zero qualifying principal and GBP zero fee/delta.
  Reason remains on signal/attribution facts; the fee function has no reason
  field. An otherwise identical positive control yields an £80 reference fee.

Affected invariants: strict boundaries, integer money, immutable input copies,
weaker imported lineage, explicit authorization separation and permanent
fee-exclusion semantics. No domain persistence, tenant context, commercial action,
audit, queue, provider, secret, environment configuration or operational alert is
introduced. No AI gateway, extraction, matching or detector behavior changes;
`pnpm eval` is inapplicable to this portion.

## Held scope and acceptance

All of Q2–Q5 and Q9 remain unanswered. Their draft proposals are not defaults or
fixture policy. Q6 and Q8 authorize only the continuation described by the order,
not current persistence/admission. CH5-H01 awaits the actual SV-5/SV-6 imported
baseline journey and exact continuation lane. CH5-H02 UI remains parked.

| Acceptance | Evidence in this diff | Remaining status |
| --- | --- | --- |
| CH5-S01 | Core strict boundary and negatives | Application layer HELD |
| CH5-S02, S08, S09 | Known numeric validation/delegation only | All persistence/capacity assertions HELD |
| CH5-S04 | Exact pure lineage label | Persisted lineage and separate linked identities HELD |
| CH5-S11 | Pure request identity only | Durable authenticated replay and shared receipts HELD |
| CH5-S17 | Pure supplied-exclusion reference only | Persisted timing and exclusion proof HELD |
| CH5-S22 | Unchanged v1 core regressions executed | Database/contractor regressions and new admission negative unverified/HELD |
| CH5-S03, S05–S07, S10, S12–S16, S18–S21 | No implementation claimed | HELD |
| CH5-H01 | No server journey implemented | HELD |
| CH5-H02 | No UI or new browser journey | PARKED |

**No complete CH5-S01–S22 assertion or full card is claimed as satisfied.**

Migration `0167` is allocated but **not implemented or registered**. Unbuilt:
`imported_job_baseline_v3`, `imported_job_activation_terms_v3`,
`job_import_v3_command`, `job_import_link`, `imported_evidence_timing`, both checked
writers, private guards, deferred success proof, audit and exclusion triggers.
No repository, API application/controller, Next route, watchdog registration,
application composition, OpenAPI operation or migration notes were added.
Admission is held for both lifecycle points; no invoiced shortcut was built.

New GRANTs: **none**. Standard F: no new direct INSERT/UPDATE/DELETE grant to
`jobguard_runtime` on any protected table; no table, role or EXECUTE grant at all.
No database locks or migrations were introduced. Fresh/upgrade/repair proofs are
held with the migration; no PostgreSQL or mocked persistence claim is made.

## Runs and environment

Dependencies were already installed; no frozen reinstall or download was
attempted. Runtime is Node `v24.17.0` (repository `.nvmrc` says `24.15.0`), pnpm
`10.28.1`, Vitest `4.1.11`, Turbo `2.10.12`, Next `15.5.27`. Tests use fictional
in-memory data and `synthetic_reference` only. PostgreSQL version: NOT RUN / not
observed in this sandbox. It cannot start PostgreSQL or bind sockets, per dispatch.
Browser/e2e/Playwright were explicitly prohibited here.

The default pnpm launcher stalled during `pnpm --version`; that invocation was
interrupted (130). The existing `/private/tmp/ch4-pnpm-bin/pnpm` script delegates
to the cached pinned 10.28.1 CLI. Subsequent pnpm commands prefix PATH with both
the required `$HOME/Library/pnpm/bin` and that existing shim. No package change.

Resource preflights before heavy commands showed 57–60% free memory and 60–63 GB
free disk, above the 35% / 45 GB limits. No test/build ran concurrently. Test
batches contain at most three files and use `--maxWorkers=2`. No whole suite ran.

First failing test run, before creating the implementation: own suite failed to
import `./job-import-v3.js`, while both existing core suites passed (17 tests).
Exit 1: 1 failed suite, 2 passed. This is a real missing-implementation failure;
the pure existing-function reference assertions themselves require no new fee
implementation. After implementation, 3 core files / 23 tests passed (exit 0).

Forced verification uses `--force`, not cached success: typecheck 7/7 successful,
0 cached; package lint 7/7 successful, 0 cached. Repository lint is **not green**:
its lane phase refuses the inherited MON-1 diff from main. Core purity passed
(172 TypeScript files); money arithmetic and commercial boundary checks passed
when run individually. Turbo emitted `IO error: Operation not permitted (os error
1)` cache I/O warnings while still executing tasks; no alternative cache route
or retry was used.

The first API boundary batch passed all 145 auth boundary tests, but the watchdog
suite could not collect because `@jobguard/db` had no built entry. Exit 1: 1
passed file, 1 failed suite. This is not a watchdog pass. The required build and
subsequent available checks are recorded below.

The forced build completed successfully: 7/7 packages, 0 cached, exit 0,
1m14.609s. Observed warnings concerned Next workspace-root inference, unchanged
CSS/autoprefixer paths, Nest/file-type exports, dynamic dependencies and cache
serialization. No unrelated file was changed to address them. After that build,
the watchdog-only regression rerun passed: 1 file, 121 tests, exit 0. Combined
successful coverage is 5 distinct files / 289 tests (6 new CH-5 tests, 17 existing
core tests, 145 auth boundary tests and 121 watchdog tests). Earlier failed
invocations remain recorded and are not included as additional passing tests.

`pnpm openapi:check` exited 1 **before checking OpenAPI**. STOP: tsx tried to bind
its local IPC pipe, which this sandbox refuses. Exact command (with the PATH
prefixes described above): `pnpm openapi:check`. Exact refusal:

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/20105.pipe
code: 'EPERM', errno: -1, syscall: 'listen'
```

No alternate invocation, permission escalation or retry was attempted. OpenAPI
remains unverified for the dispatcher/CI. `apps/api/openapi.json` is unchanged.

## Lane STOP

`LANE_BASE_REF=origin/main pnpm lint:lanes` exited 1; the lane portion of
`LANE_BASE_REF=origin/main node tools/lint.mjs` also exited 1:

```text
Lane boundary FAILED: Lane ch-5 cannot edit:
"docs/verdicts/MON-1/BUILDER_RECEIPT.md"
"packages/core/src/jobs-on-the-go-pricing.test.ts"
"packages/core/src/jobs-on-the-go.test.ts"
"packages/core/src/jobs-on-the-go.ts"
```

These four files belong to the unchanged unmerged parent. STOP: dispatcher must
merge the parent before the CH-5 PR/check against main. No allow-list expansion,
base override, test change or checking-tool workaround was attempted. Exact
enforcement is `tools/agent-lane-boundary-lint.mjs:232–233`:

```js
const violations = [...files].filter((file) => !lane.allow.some((pattern) => matches(pattern, file)));
if (violations.length) throw new Error(`Lane ${name} cannot edit:\n${violations.map((file) => JSON.stringify(file)).join("\n")}`);
```

Before and after are identical. No merged assertion, pinned value, fingerprint
or shared harness requires a proposed edit; no coordinator-only edit was made.

## NOT RUN

The following existing database regression files were NOT RUN (cannot start
PostgreSQL here, as instructed; no socket experiment or fallback was attempted):

```text
packages/db/test/job-import.integration.test.ts
packages/db/test/job-activation-terms.integration.test.ts
packages/db/test/shared-money-origin.integration.test.ts
packages/db/test/fingerprinted-row-shape.integration.test.ts
packages/db/test/shadow-catalog.integration.test.ts
packages/db/test/tenancy.integration.test.ts
packages/db/test/site-extra.integration.test.ts
packages/db/test/contractor-session-context.integration.test.ts
packages/db/test/work-order-import.integration.test.ts
```

`apps/api/src/contractor/site-extra.http.test.ts` NOT RUN: its real Supertest
pipeline binds a socket, prohibited in this sandbox. Browser regressions and
`pnpm test:e2e` NOT RUN (CI only). `pnpm test`, `pnpm test:db` and
`pnpm test:migrations` NOT RUN: whole-suite/fan-out wrappers are prohibited;
dispatcher/CI must provide the complete sequential mapping. No weakening of
scripts, assertions or release requirements. The actual parent acceptance test
paths are `packages/core/src/jobs-on-the-go.test.ts` and
`packages/core/src/jobs-on-the-go-pricing.test.ts`; neither was run under this
piece's own-file limit. Parent execution/admission tests do not exist yet.

Held new files were **not created, not run**: all five `job-import-v3*.integration`
files, fixtures, application/HTTP tests and web route tests named by the order.
Their first failing runs, database persistence, catalog and rule-9 proof remain
held with their owning implementation. No placeholder/skipped test was created.

## Preservation and builder inspection

One-time receipt-only preservation comparison against the exact parent covered
489 pre-existing paths: all tracked database migration files (87), all existing
TypeScript `.test.ts` files, AGENTS/BUILD_PLAN, v1 import, activation, MON-1 source,
watchdog source/harness and the protected context files. SHA-256 of the sorted
path/NUL/content-hash/newline manifest is identical before and after:

```text
284b9f993465b2c534ac40d9b6b1061d9b16c259838d9621b9b59257762686a8
```

Zero changed protected paths. The comparison is an ephemeral inspection recorded
in `/private/tmp/ch-5-preservation.json`, not a permanent file-pinning test.
`git diff --stat` for tracked changes shows only one lane entry and one export:

```text
 config/agent-lane-assignments.json | 1 +
 packages/core/src/index.ts         | 1 +
 2 files changed, 2 insertions(+)
```

Git stat omits untracked new files; their complete inventory and final content
hashes are recorded below. `git diff --check` passed.

Builder inspection (not independent model review): checked strictness, detached
frozen copies, normalized identity dimensions, absence of numeric defaults,
delegation rather than copied pricing, lineage alias, supplied rather than
derived timing, reference fee positive control, unchanged parent code and tests,
and absence of schema/routes/grants. Test-executed claims are only those above
and in the final run ledger. No database, live integration, production or
independently-verified claim. Remaining material limitations are all holds,
unmerged dependency, lane failure and unexecuted CI suites listed here.

Final commit message is supplied separately at `/private/tmp/jg-msg-ch-5.txt`.
The dispatcher commits; HEAD remains the supplied parent until then. An exact
new commit and a different-model recorded verdict plus separate acceptance are
still required. UI LATER: parked import screens and reason display belong to
CH5-H02, outside this diff.

## Exact check/write command ledger

Each block is the literal shell invocation; exit codes are for the complete
invocation. Preflight/inspection commands have no test count. Polls only waited
on the same process and did not rerun commands. Edits used `tools.apply_patch`
successfully; no git mutation was used.

1. Exit 1; 1 failed suite (missing implementation); 2 files / 17 existing tests passed.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-import-v3.test.ts src/job-import.test.ts src/activation-v3.test.ts
```

2. Exit 0.

```sh
memory_pressure | tail -1
df -g /System/Volumes/Data
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-import-v3.test.ts src/job-import.test.ts src/activation-v3.test.ts
```

3. Exit 1.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
LANE_BASE_REF=origin/main pnpm lint:lanes
```

4. Exit 1; 1 failed suite (unbuilt DB entry); 1 file / 145 auth tests passed.

```sh
memory_pressure | tail -1
df -g /System/Volumes/Data
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts src/watchdog-registry.test.ts
```

5. Exit 0; 7 packages successful; 0 cached.

```sh
cat turbo.json
memory_pressure | tail -1
df -g /System/Volumes/Data
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
pnpm exec turbo run typecheck --force
```

6. Exit 1.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
LANE_BASE_REF=origin/main node tools/lint.mjs
```

7. Exit 0; 7 packages successful; 0 cached.

```sh
memory_pressure | tail -1
df -g /System/Volumes/Data
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
LANE_BASE_REF=origin/main pnpm exec turbo run lint --force
```

8. Exit 0.

```sh
node tools/money-arithmetic-lint.mjs
node tools/commercial-boundary-lint.mjs
```

9. Exit 0; 7 packages successful; 0 cached.

```sh
memory_pressure | tail -1
df -g /System/Volumes/Data
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
pnpm build --concurrency=2 --force
```

10. Exit 0; 1 file / 121 tests passed.

```sh
memory_pressure | tail -1
df -g /System/Volumes/Data
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/watchdog-registry.test.ts
```

11. Exit 1.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/ch4-pnpm-bin:$PATH"
pnpm openapi:check
```

12. Exit 0.

```sh
python3 - <<'PY'
from pathlib import Path
message = '''feat(import): add v3 import core boundaries

Add strict versioned import intent, canonical request identity, known-value
classification through CH-1, and independent lineage/exclusion reference tests.
Register the core-only CH-5 lane and document construction and check evidence.

Build ahead on MON-1 2514049c; admission, persistence, counting, evidence timing,
Final Check and UI remain held. No migration, grants, routes or production use.
'''
with Path('/private/tmp/jg-msg-ch-5.txt').open('x') as target:
    target.write(message)
print('/private/tmp/jg-msg-ch-5.txt written')
PY
```

## Inspection-only command ledger

The following complete shell invocations exited 0 (test counts: inapplicable).
Some early combined outputs were truncated, so narrower reads follow. Missing
exploratory paths/globs were not implementation failures: `subscription*` and
`apps/api/src/job-import*` had no match; `shadow-domain/evidence.ts`,
`node_modules/.bin/pnpm` and `.npmrc` did not exist (individual reads exited 1,
while their whole shell batches ended 0). No permission refusal was retried.

```sh
pwd; git status --short; git rev-parse HEAD; git branch --show-current; git rev-parse origin/main; git rev-parse origin/codex/sandbox/mon-1
```

```sh
cat AGENTS.md; rg -n 'CH-5|MON-1|10\.1\.4|10\.1\.5|10\.1\.6|10\.2\.1|10\.2\.2|C1|C8' BUILD_PLAN.md; cat package.json; cat config/agent-lane-assignments.json
```

```sh
sed -n '270,370p' AGENTS.md; sed -n '60,150p' BUILD_PLAN.md; sed -n '1500,1770p' BUILD_PLAN.md
```

```sh
cat packages/core/src/job-import.ts; cat packages/core/src/activation-v3.ts; cat packages/core/src/money.ts; cat packages/core/package.json; cat package.json
```

```sh
rg --files -g AGENTS.md -g '*job-import*' -g '*subscription*' -g '*mon-1*' -g '*shadow*' docs/contracts packages/core/src packages/db/src; rg -n 'lock|interval|export|admission' packages/db/src/subscription*; rg -n 'createShadowSignal|createAttributionFacts|evaluateRecoveryEligibility|deriveShadowSuccessFee' packages/core/src; cat ~/.local/share/full-steam/handoffs/jobguard-task.md
```

```sh
cat packages/core/src/job-import.ts; cat packages/core/src/activation-v3.ts; cat packages/core/src/money.ts
```

```sh
rg -n 'CH-5|MON-1|10\.1\.[456]|10\.2\.[12]|CH-3a' BUILD_PLAN.md; cat package.json; cat packages/core/package.json; rg -n 'ch-5|mon-1' config/agent-lane-assignments.json; rg --files packages/db/src packages/core/src docs/contracts | rg 'subscription|meter|mon-1|job-import|shadow.*v1'
```

```sh
sed -n '490,518p' BUILD_PLAN.md; sed -n '1312,1380p' BUILD_PLAN.md; sed -n '1430,1477p' BUILD_PLAN.md; sed -n '1932,2000p' BUILD_PLAN.md; sed -n '2095,2134p' BUILD_PLAN.md; sed -n '3548,3610p' BUILD_PLAN.md; cat packages/core/src/jobs-on-the-go.ts; cat docs/verdicts/MON-1/BUILDER_RECEIPT.md
```

```sh
cat packages/core/src/shadow-domain/eligibility.ts; cat packages/core/src/shadow-domain/attribution.ts; cat packages/core/src/shadow-domain/success-fee.ts; cat packages/core/src/shadow-domain/success-fee.test.ts; cat packages/core/src/shadow-domain/signal.ts; cat packages/core/src/shadow-domain/evidence.ts; tail -30 packages/core/src/index.ts; rg -n 'baselineKey|fictional.*key|commandId|requestIdentity' packages/core/src/job-parties.ts packages/core/src/*import* apps/api/src/job-import*; cat tools/lint.mjs
```

```sh
cat packages/core/src/shadow-domain/eligibility.ts; cat packages/core/src/shadow-domain/attribution.ts; sed -n '1,95p' packages/core/src/shadow-domain/success-fee.ts; sed -n '1,55p' packages/core/src/shadow-domain/success-fee.test.ts; sed -n '1,40p' packages/core/src/shadow-domain/evaluation.test.ts
```

```sh
sed -n '1,160p' tools/agent-lane-boundary-lint.mjs; rg -n 'baselineKey|fixtureKey' packages/core/src/job-parties.ts packages/core/src/site-extra.ts packages/core/src/work-order.ts; sed -n '1,90p' packages/core/src/shadow-domain/types.ts; tail -16 packages/core/src/shadow-domain/success-fee.ts; ls /private/tmp/ch4-pnpm-bin; ls node_modules/.bin/pnpm; cat .npmrc; cat .nvmrc
```

```sh
cat /private/tmp/ch4-pnpm-bin/pnpm; ls "$HOME/Library/pnpm"; rg -n 'LANE_BASE_REF|comparison|untracked' tools/agent-lane-boundary-lint.mjs; git diff --stat origin/codex/sandbox/mon-1; git diff origin/main -- BUILD_PLAN.md; git show origin/main:BUILD_PLAN.md | sed -n '1977,1999p'; sed -n '1,75p' docs/contracts/shadow-persistence-v1.md
```

```sh
sed -n '1,6p' config/agent-lane-assignments.json; sed -n '1,80p' packages/core/src/job-parties.ts; sed -n '168,239p' tools/agent-lane-boundary-lint.mjs; sed -n '127,136p' packages/core/src/jobs-on-the-go.ts; git log -5 --oneline; export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/ch4-pnpm-bin:$PATH"; pnpm --version
```

```sh
cat apps/api/package.json; sed -n '1,70p' apps/api/src/contractor/site-extra.http.test.ts; sed -n '1,40p' apps/api/src/watchdog-registry.test.ts; sed -n '1,80p' docs/contracts/job-work-state-v1.md; git show origin/main:BUILD_PLAN.md | sed -n '3550,3600p'; git diff --name-only origin/main origin/codex/sandbox/mon-1; rg -n 'baseline|cap|activation' packages/db/migrations/0020_job_import.sql packages/db/migrations/0109_job_activation_terms.sql
```

```sh
git diff --stat; git diff -- packages/core/src/index.ts; rg -n 'activationFeePolicyV3|isSmallJobV3|IMPORT_LINEAGE_LABEL' packages/core/src/activation-v3.ts packages/core/src/job-import.ts; rg -n '^export function|^export const|^export type' packages/core/src/job-import-v3.ts; git diff --name-only origin/main origin/codex/sandbox/mon-1; git show origin/main:BUILD_PLAN.md | rg -n 'Ledger amendment — (CH-1|SV-2|SV-4|SV-3)|0128|0132|0133|CH-5'
```

```sh
git diff --check; git status --short; nl -ba packages/core/src/jobs-on-the-go.ts | sed -n '1,14p'; nl -ba tools/agent-lane-boundary-lint.mjs | sed -n '228,235p'; git ls-files packages/db/migrations | wc -l; shasum -a 256 packages/core/src/job-import-v3.ts packages/core/src/job-import-v3.test.ts docs/contracts/job-import-v3-v1.md
```

```sh
sed -n '235,290p' AGENTS.md; sed -n '2095,2134p' BUILD_PLAN.md; git status --short; git diff --check
```

The stalled inspection batch exited 130 when interrupted; the final search after
pnpm did not execute:

```sh
rg -n '^export|lock|interval|HELD|HOLD' packages/core/src/jobs-on-the-go.ts docs/verdicts/MON-1/BUILDER_RECEIPT.md; rg -n 'baselineKey|fictional|commandId' packages/core/src/job-parties.ts packages/core/src/job-import.test.ts; sed -n '1,24p' config/agent-lane-assignments.json; memory_pressure | tail -1; df -g /System/Volumes/Data; node --version; export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version; rg -n 'test|exists|receipt|LANE_BASE_REF' tools/agent-lane-boundary-lint.mjs
```

The receipt-only Python preservation invocation exited 0: enumerated tracked
paths with `git ls-tree -r --name-only 2514049c8dfb7630598fdf81f5c0d6d23444abb4`,
selected the 489 paths described above, read original bytes using
`git show <base>:<path>`, compared SHA-256 with the worktree, and wrote
`/private/tmp/ch-5-preservation.json`. It reported identical aggregate hashes and
zero changed paths. No file in the repository was written by that inspection.

Final inventory invocation exited 0:

```sh
git rev-parse HEAD
git diff --stat
git status --short
git diff --check
nl -ba apps/api/package.json | sed -n '84,94p'
python3 - <<'PY'
from pathlib import Path
from hashlib import sha256
paths=['config/agent-lane-assignments.json','packages/core/src/index.ts','packages/core/src/job-import-v3.ts','packages/core/src/job-import-v3.test.ts','docs/contracts/job-import-v3-v1.md']
for path in paths:
    data=Path(path).read_bytes()
    print(f'{sha256(data).hexdigest()}  {path}  {len(data.splitlines())} lines')
print('receipt:',len(Path('docs/verdicts/CH-5/BUILDER_RECEIPT.md').read_text().splitlines()),'lines (self-hash omitted)')
PY
```

Final non-receipt SHA-256 inventory:

```text
db51bb3e7f84916cb3adfbe2b1208366b2e8c14466543a3b6779c9280d2868bd  config/agent-lane-assignments.json
9879ad66af1feb28f835c2070f988be01ab822c3eaf6a57afa3ef642a4cf22ff  packages/core/src/index.ts
ed9ea51d86bfbd5d282320076fbfd2169de993e866791349f907dd5b1dd57e84  packages/core/src/job-import-v3.ts
8dca4ac64a1a84b1aa1b5e694d7f903d72e405f00a8f30f88fcb8b6be92311b4  packages/core/src/job-import-v3.test.ts
2beb5f45203176cb91d7b5ee0e5ace37d2a1b7c33567a2e7d987263dd9b3c8ce  docs/contracts/job-import-v3-v1.md
```

Untracked files are precisely the new core module (58 lines), new test (133
lines), contract (134 lines) and this receipt (self-hash omitted). Final HEAD:
`2514049c8dfb7630598fdf81f5c0d6d23444abb4`. No source changed after verification.


