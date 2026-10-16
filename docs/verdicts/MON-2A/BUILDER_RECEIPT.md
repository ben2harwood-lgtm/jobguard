Built by Codex; dispatched 13 Oct 2026; implementation evidence recorded 15 Oct 2026.

# MON-2A builder receipt — PARTIAL / HOLD

The addendum's requested first line attributed this build to Claude Sonnet and
said Codex was unavailable. That attribution is false for this session, so the
first line identifies the actual builder. This receipt is source-inspection and
local execution evidence, not an independent model verdict or acceptance.

## Head, scope and authority

- Branch: `codex/sandbox/mon-2a`.
- Supplied/final unchanged HEAD: `2514049c8dfb7630598fdf81f5c0d6d23444abb4`.
- Build-ahead base: `origin/codex/sandbox/mon-1`, same SHA. Parent is unmerged.
- Main inspected: `6671538c8d69936c162368c760dd6ce0f7f10493`.
- No git add/commit/push/checkout, package installation, database startup, socket
  binding, browser, publication or external message. No explicit install/download
  command was issued; the system manager version probe unexpectedly attempted
  registry verification and failed, as recorded below.
- Intended commit message: `/private/tmp/jg-msg-mon-2a.txt`. Dispatcher commits.
- Migration **0166** allocated, **not created or registered**: prerequisite STOP.
- First working-tree change registered this lane; all pre-existing entries stay
  identical. Existing-file changes are additive: own lane, three exports and one
  factual BUILD_PLAN ledger paragraph. No parent source/test/receipt was edited.

The pricing/formula/card/graph citations agree with inspected main. Main's
migration list reaches 0158, rather than the draft's 0138 inspection. The header's
build-ahead exception supersedes the draft wait-for-merge rule, without supplying
missing parent contracts. MON-1 contains only pure foundations: no SQL ledger,
qualified correction keys, event derivation revision, capacity lock or reviewed
company/session authority. Exact available exports and fields are recorded in
`docs/contracts/subscription-v1.md`. No executable meter adapter was invented.
No platform-statement namespace is present in inspected db source/migrations;
its creation/access remains held. D09/D05/D02 still say proposed, no approval
evidence. Q3–Q9 remain held. There is no authority inference from synthetic data.

Built: frozen proposed Solo/Builder catalogue schemas, unaccepted terms/change
selection schemas, monthly-default/annual-off behavior, explicit supplied-period
previews delegated to MON-1, checked signed arithmetic, pure explicit-period
review detection, pure onboarding routing, two API schema definitions and tests.
No HTTP composition, business persistence, statements, simulated adapter,
payments, audit/receipt writes, provider integration, actual track move or UI.

## STOPs — exact source lines and before/after

1. **Coordinator-owned LP-0 inventory is required before catalogue SQL.**
   `docs/contracts/lp-0-effective-privileges-v1.json:61` before: `"entries":[`;
   after: **unchanged**, `"entries":[`. The entries contain no catalogue SELECT.
   The prerequisite is a separately reviewed addition for
   `acl|rel|table|control_plane.subscription_plan_catalogue|jobguard_runtime|SELECT|-`
   with an appropriate reviewed group and any additional required schema-access
   facts. No entry, group, pin or policy was invented here.
   `packages/db/test/lp-0-grant-freeze.integration.test.ts:64` before and after:
   `expect(brief(compareInventory(inventory, baselineMigrationOnly))).toEqual([]);`
   (same requirement also at line 71). `packages/db/test/lp-0-catalog.ts:584`
   classifies a capability absent from the inventory as `unreviewed_addition`.
   Do not weaken that assertion. No catalogue migration/repository/access or
   upgrade-proof implementation proceeds around this prerequisite.

2. **Parent-owned module isolation is required for M2A-08/M2A-29.**
   `packages/core/src/jobs-on-the-go.ts:2` before and after, unchanged:
   `import { isSmallJobV3 } from "./activation-v3.js";`
   `packages/core/src/activation-v3.ts:3` before and after, unchanged:
   `import { shadowSuccessFeeV1 } from "./shadow-domain/success-fee.js";`
   Required after-state: a parent-owned supplied-pricing/date/policy export
   reachable without that activation/fee dependency. Its filename/API must be
   supplied by the parent owner; no guessed symbol, duplicate calculation or
   change to their classifier is made here. The new transitive architecture
   assertion stays **failing**, not skipped/relaxed. It reaches four modules:
   shadow-domain success-fee, eligibility, attribution and types. No subscription
   fee operation is invoked, but module isolation is not proved.

3. **Build-ahead lane check cannot pass against main until parent integration.**
   `LANE_BASE_REF=origin/main node tools/lint.mjs` exited **1**. It reported
   MON-1's receipt, pricing test, main test and source outside the MON-2A lane.
   No expansion to permit those parent paths and no retry with a different base.
   `config/agent-lane-assignments.json:2` contains this piece's new lane only;
   all pre-existing lane rows, including MON-1, are unchanged. Parent merge and
   dispatcher reconciliation remain required before a PR.

4. **System pnpm safety refusal; version switching not retried.** The inspection
   command `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version` returned
   **1** after a delayed verification failure. Exact refusal output:

   ```text
   [ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed). The bytes selected by this project's lockfile/registry do not match a published, signed pnpm release.
   This can indicate a tampered lockfile or a malicious/unreachable registry. Set `pmOnFail` to `ignore` to skip the version switch if this is unexpected.
   ```

   No setting changed and no retry/bypass of the refused version switch. Before
   the refusal returned, test commands had used the **pre-existing**
   `/private/tmp/ch4-pnpm-bin/pnpm` launcher already recorded by MON-1. Its file
   directly invokes cached pnpm 10.28.1, and its version command exited 0 before
   the refusal returned. No further pnpm invocation followed the refusal.
   Independent checks subsequently used the already installed TypeScript/Vitest
   binaries directly, without starting pnpm or fetching/verifying a manager.
   These limited checks are not the forced repository gates.

## Tests-first and actual command results

Local pnpm invocations below began with
`export PATH="$HOME/Library/pnpm/bin:$PATH"` and used the existing cached
launcher above. `--maxWorkers=2`, at most three own test files, one run at a
time. No tests/build ran concurrently. No new skipped/placeholder suite claims
held behavior. Core/API tests do not bind sockets or start a server.

| Command (launcher abbreviated `CACHED_PNPM`, as identified above) | Exit | Result |
|---|---:|---|
| `CACHED_PNPM --version` | 0 | 10.28.1, before system-manager refusal returned |
| `CACHED_PNPM --filter @jobguard/core exec vitest run --maxWorkers=2 src/subscription.test.ts src/subscription-period.test.ts src/subscription-track-review.test.ts` first run | 1 | **29 failed, 2 passed / 3 files** against explicit temporary own-file stubs; substantive expected figures/thresholds failed, not missing modules |
| Same three-file command after implementation | 0 | **31 passed / 3 files** |
| `CACHED_PNPM --filter @jobguard/api exec vitest run --maxWorkers=2 src/subscription-boundaries.test.ts` first run | 1 | **2 failed, 1 passed / 1 file** against `z.never()` schema stubs |
| `CACHED_PNPM --filter @jobguard/core exec vitest run --maxWorkers=2 src/subscription-architecture.test.ts` | 1 | **1 failed, 2 passed / 1 file**, transitive parent dependency |
| `CACHED_PNPM --filter @jobguard/core exec vitest run --maxWorkers=2 src/subscription.test.ts src/subscription-period.test.ts` added assertions before repair | 1 | **2 failed, 21 passed / 2 files**: change schema and preview result version |
| Three-file core command after change-schema/result-version implementation | 0 | **32 passed / 3 files**, last run of these unchanged files |
| API boundary command after schema implementation | 0 | **3 passed / 1 file**, last run of these unchanged files |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 1 | Core purity **passed, 177 TS files**; lane refused four unmerged parent paths; later lint stages did not run |
| `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json --noEmit` first direct compiler check | 2 | Two missing Node type imports in own architecture test |
| `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit` | 0 | API compiler check, no cache |
| Core direct compiler command after own test-only import repair | 0 | Core compiler check, no cache |
| `node node_modules/vitest/vitest.mjs run --maxWorkers=2 src/subscription-architecture.test.ts` from packages/core, after import repair | 1 | **1 failed, 2 passed / 1 file**; same parent dependency, final architecture run |
| `git diff --check` (repeated before/final receipt) | 0 | Whitespace check; does not prove acceptance |

The compiler found this package has no Node type dependency. Own architecture
tests now use the test-only dynamic file-import pattern already present in
MON-1 tests. No dependency/pin/lockfile changed. Only the own test changed after
the final 32-test core run; it was re-executed directly, retaining the one
known dependency failure. Architecture tests inspect imports semantically, not
merged bytes/hashes. They do not freeze another piece's file contents.

Final local results across the separate targeted runs: **32 pure tests + 3 API
schema tests passed; architecture 2 passed / 1 failed**. The generated property
covers **720 supplied timelines** (four day lengths, 180 seeds each), varying
plans, counts, trial days and annual-prepaid reference flags. No whole package
or whole repository test was run.

Other commands actually run (read/write invocations, shell final status):

- `pwd`, `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main`,
  `git rev-parse origin/codex/sandbox/mon-1`: **0**, clean initial tree and stated
  refs. `git diff origin/main --stat`: **0**, six inherited MON-1 paths only.
- `rg --files` filtered for AGENTS/packages/meter/subscription/upgrade/lane files:
  **0**. `cat AGENTS.md`, `cat package.json`, `cat .nvmrc`: **0**.
- Batched `rg` on BUILD_PLAN/migrate/lane references; reads of money, package
  manifests, MON-1 source, rational, upgrade comparators, db pool utilities,
  migrate, vitest config, decision records, lane tool, standing handoff and
  parent receipt: **0** for successful reads. Some broad read batches attempted
  nonexistent `rounding.ts`, `arithmetic.ts`, db setup, guessed db meter file,
  0093 migration name, API vitest/build config and @types directories; those
  individual reads returned **1**, without a mutation. Two zsh wildcard searches
  for nonexistent privilege test paths returned **1**. Actual paths were found
  by rg; no guessed implementation was used.
- `memory_pressure | tail -1`: **0**, initially **59%**, finally **58%** free.
  `df -g /System/Volumes/Data`: **0**, available **63 GB**, then **62 GB**, finally
  **60 GB**; above the 45 GB threshold. `node --version`: **0**, **24.17.0**;
  repository .nvmrc pins **24.15.0**. This is not a clean pinned-install claim.
- `which -a pnpm`, directory listings and `ls -l`/`cat` of the pre-existing
  cached launcher: **0**. No launcher was created or modified in this task.
- Reads of LP-0 test/comparator/inventory, `nl -ba` for precise STOP lines,
  comparison of main's plan and own additive exports, and searches for statement
  namespace objects: **0** where matching; no namespace match. No new grants.
- Python working-tree edits and shell heredocs creating this lane's new
  sources/tests/docs, additive exports, additive ledger, and commit-message file:
  **0**. Temporary own stubs replaced after their failing runs; no existing
  uncommitted file was overwritten. No file was deleted.
- Python Git/base and SHA-256 preservation inspection: **0**; 22 named protected
  and parent files equal supplied HEAD; existing lane entries equal supplied
  HEAD; core index is supplied bytes plus exactly three exports. All own
  modified/new paths are allowed by this lane. Hash output below.
- `git status --short`, `git diff --stat`, `git diff --check`, final `git rev-parse
  HEAD`, receipt/hash updates and final path/preservation checks: **0** (final
  command result is recorded in the closing evidence paragraph).

## NOT RUN and remaining gates

- `pnpm install --frozen-lockfile`: **NOT RUN**, dispatcher says dependencies
  already installed, no downloads. Runtime differs from .nvmrc as above.
- `pnpm exec turbo run typecheck --force`, `pnpm exec turbo run lint --force`,
  `pnpm build --concurrency=2 --force`: **NOT RUN**, no pnpm invocation after its
  safety refusal. No FULL TURBO/cache-hit green is claimed. Direct compiler
  results above do not substitute for these aggregate forced gates.
- `pnpm lint:lanes`: **NOT RUN** via pnpm; equivalent existing lane script ran
  inside direct repository lint and **failed**, as recorded above. No workaround.
- `pnpm openapi:check`: **NOT RUN**, manager refusal; no routes added and actual
  OpenAPI bytes equal supplied HEAD (hash below), not a generated-check pass.
- All database files: **NOT RUN (cannot start PostgreSQL here)**. Catalogue
  files `subscription-fixtures.ts`, `subscription.integration.test.ts`,
  `subscription-access.integration.test.ts`, `subscription-upgrade.integration.test.ts`
  are **not created** because catalogue SQL is stopped on the inventory.
  Thus no first red database run or fresh/upgrade/real-grant proof is claimed.
- Held new business suites: subscription replay, simulated adapter, application
  and HTTP tests **not created / NOT RUN**, pending Q3–Q9 as applicable. No
  placeholders/skipped tests claim their acceptance.
- Existing `auth/context-boundary.test.ts`, fingerprinted-row-shape,
  contractor-session-context, site-extra (six named proofs), command-replay,
  watchdog lock-order/legacy-identities, tenancy, demo-bootstrap, ledger,
  final-account-lock-upgrade and extra-origin-upgrade suites: **NOT RUN**.
  Database checks require PostgreSQL; broader regression runs are dispatcher/CI
  only under the addendum's own-files-only limit. All files untouched.
- `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm eval`,
  `pnpm test:e2e`: **NOT RUN**, aggregate suites belong to dispatcher/CI;
  browser/e2e explicitly CI only. No prompt/model changes or live-model claim.
- No exact-head GitHub CI execution, independent verdict or separate acceptance
  is available for these uncommitted changes. RED lane retained. Card remains
  partial; no PR until parent merge and resolution of technical STOPs.

## Acceptance mapping and explicit unbuilt portions

| IDs | Evidence and limit |
|---|---|
| M2A-01 | Exact frozen proposed catalogue and strict invalid-version/plan/override tests pass; catalogue database/access/immutability proof STOPPED |
| M2A-02 | All nine exact pure fixtures pass, annual profiles are 12 monthly periods; persisted parity held |
| M2A-03 | Exact daily contributions, 28/29/30/31 supplied dates, signed half-even/magnitude checks pass; no correction collection semantics |
| M2A-04 | 720 ordinary pure bounds cases pass; issued mismatch/maximum alerts and correction execution held |
| M2A-05 | Pure cap/grace/excess examples pass; no activation admission or Builder blocking code introduced; database proof held |
| M2A-06 | Entire line attribution/allocation sub-part unbuilt under Q4 |
| M2A-07 | Entire persisted trusted-source/cache mismatch sub-part unbuilt (no actual MON-1 source ledger/Q7/Q8) |
| M2A-08 | Strict hidden-input rejection/direct boundary tests pass; transitive module-isolation test FAILS; artifacts, grants and query-path proofs unbuilt |
| M2A-09 | Settled unaccepted terms/change selection schemas strict; anchor acceptance, approval, actor binding and persistence held |
| M2A-10/M2A-11 | Supplied day-eleven arithmetic passes only; actual upgrade/downgrade/replay/authority/concurrency unbuilt |
| M2A-12 | Monthly default, annual unavailable, pure prepaid-base-zero/undiscounted extras pass; activation/prepayment/proration/maximum authorization unbuilt |
| M2A-13 | Pure trial contribution and no quote/settlement input tests pass; trial/card/HTTP/business-effect proofs unbuilt |
| M2A-14/M2A-15/M2A-16 | Issued history, namespace, statement bindings, deterministic lines and corrections unbuilt |
| M2A-17 | Pure 13/14 capacity, 9/10 busy days, two-of-three and invalid consecutive-history tests pass; ledger completeness/durable notices held |
| M2A-18 | Pure detector produces no track mutation; mandatory Decision/operations persistence/replay unbuilt |
| M2A-19 | Pure strict routing and API schema tests pass; no persisted assessment/agreement/replay |
| M2A-20/M2A-21/M2A-22/M2A-23/M2A-24/M2A-25 | Payment/command/session/tenant authority execution and durable proofs wholly held |
| M2A-26 | No new grants; actual new-object catalogue access proof STOPPED; business RLS/routines held |
| M2A-27/M2A-28 | Atomic persistence/locks/audit and typed SQL refusal proofs unbuilt |
| M2A-29 | No subscription fee inputs/writes; direct architecture passes but transitive architecture FAILS; database unchanged is source/hash evidence only |
| M2A-30 | Pure input/no-effect and route-free schema module checks pass; server-mode/SQL/HTTP authority held |
| M2A-31/M2A-32 | Catalogue migration/upgrade comparator/control proofs STOPPED, not implemented or executed |
| M2A-33 | Changes through lapse/downgrade/actual legal track move unbuilt |
| M2A-34 | Own schema module introduces no route/context; original OpenAPI/security/parent bytes preserved; mandatory regression execution missing |

## Grants, migration and compatibility

**Every new GRANT: none.** Standard F is preserved: no new direct INSERT,
UPDATE or DELETE grant, SELECT grant, EXECUTE grant or role membership. No SQL
migration, app table, control-plane table, backfill or alteration exists in this
piece. No fingerprinted table gains a column. No business write routine/private
helper is guessed while Q7/Q8 remain held. 0166 remains allocated only.

All APIs are new pure exports. No existing request/operation changed; API schemas
are unregistered definitions. Monetary outputs are hypothetical GBP principal;
unknown tax is not recorded as zero tax. No settlement facts or recovery source
can be produced. No operational alert is installed. Source-schema compatibility
must be reconciled after any MON-1 repair; there is no trusted source hash or
immutable statement contract to migrate yet. Future released persistence uses
additive forward-fix and linked corrections, preserving history, with the full
rule-9 comparator requirements recorded in the operations document.

## Builder self-inspection (not independent review)

Inspected own changes for exact bounds, source versions, invalid numeric values,
trial/annual behavior, explicit day coverage, immutable catalogue rows and
consecutive-history checks. Confirmed no anchor construction, attribution,
fee/settlement authority, route registration or hidden-data query is added.
Kept the failing transitive assertion and reported its parent repair instead of
weakening it. Kept LP-0 unchanged and stopped the SQL work. Tests expose a
hypothetical daily contribution, not an agreement or amount due. No context is
constructed/cast/cloned/cached in feature code. No provider SDK/network call.

Architecture assertions were first run after the initial pure functions existed;
they are source inspection, not tests-first evidence for those initial edits.
The numerical/schema/detector tests were written before their implementations
and ran substantively red against own stubs. No claim that an untouched boundary
was independently verified. The final architecture suite remains red.

LATER: plan/onboarding/payment journeys belong to the parked UI and assigned
MON-3/MON-8/MON-2B work, with no screen changes in this piece.

## Preservation evidence

`git diff --stat` before final receipt (tracked files only; all new files remain
untracked because the builder must not stage):

```text
 BUILD_PLAN.md                      | 2 ++
 config/agent-lane-assignments.json | 1 +
 packages/core/src/index.ts         | 3 +++
 3 files changed, 6 insertions(+)
```

New owned files: the nine core/API source/test files, contract, operations note
and this receipt. Full final path/line/hash manifest follows. No claim that a
tracked-only diff stat includes untracked content. Parent inherited diff against
main is separate; no parent file was changed during this session.

The following protected/parent file SHA-256 values were compared with actual
`git show 2514049c:<path>` bytes and **all matched**:

```text
ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1  AGENTS.md
83af87f03d10ed56c1292e99095e3f50ff9ba91931798e1ed4acb6c5f25e30d2  packages/core/src/jobs-on-the-go.ts
70174b93c50ccfaad664933be135e2daaead9d88d9981ac09cbe25ef44237ffe  packages/core/src/jobs-on-the-go.test.ts
bcaca66d7e466df0bd647be0004ec4c559eaee6b0a18bbfdae52f48fcd3e1d23  packages/core/src/jobs-on-the-go-pricing.test.ts
a3d328088773f745713967428672e00dac7f1ec077b1e844b656d145a2755267  docs/verdicts/MON-1/BUILDER_RECEIPT.md
216343758d5f089ad8d73f100632428e67a0cd547e23ef3218db53e11880de40  apps/api/openapi.json
a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca  packages/core/src/watchdog.ts
6880dd1191e0372e99f43e14c7b029f56ad97a25bf0ec47ffdb51e7125a50401  packages/db/src/migrate.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6  packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f  packages/db/test/command-replay-contract.integration.test.ts
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35  apps/api/src/auth/context-boundary.test.ts
9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14  packages/db/src/practice-session.ts
56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c  packages/db/src/contractor-repository.ts
e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0  packages/db/src/contractor-party-repository.ts
4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3  packages/db/src/work-order-repository.ts
45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5  packages/db/src/sor-repository.ts
ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d  packages/db/src/job-scheduling-repository.ts
cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386  packages/db/src/work-order-fixtures.ts
a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c  packages/db/src/contractor-session-context.ts
be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8  packages/db/test/fingerprinted-row-shape.integration.test.ts
8d392724e3796dcb6ba656928d54836ff934f1017860cae6f7de623ebb2e7448  packages/db/test/tenancy.integration.test.ts
f57578bb4f454cbbed54c6d520735d122804f8d091ca48834c97462258ba9861  docs/contracts/lp-0-effective-privileges-v1.json
```

Final own-file manifest (receipt excluded from its own hash):
```text
bfe0dbf743341e4f5bc0c33af2a559a3f873ae8d4b13afa7639cee28c5953bd0  BUILD_PLAN.md (4045 lines)
fd4eee6c0dd864ee2b7dedf691ec05045b4125d046fec5118be71efb54cde592  apps/api/src/subscription-boundaries.test.ts (21 lines)
042eaf561a3f3f59359c047d1d19784cdb0062ae115066bbf59fa126cb1cca62  apps/api/src/subscription.contracts.ts (9 lines)
2f80ab0b8b243cab09331d33550497ec95f8a6d669056fcb857e7228fc408604  config/agent-lane-assignments.json (193 lines)
88118676b5a2691a5135116f5ca0f6f72170455a65caf019240f3903c5cc3ba2  docs/contracts/subscription-v1.md (142 lines)
fcb683cc273fabd65dacdfea496a108449293e7d47436a35d89a45e8939f0891  docs/operations/subscription-synthetic.md (52 lines)
bdcbde7329c486d8433d5e4a985d8c4c5d995e50c31ddc1b1a95c2047fa071f8  packages/core/src/index.ts (76 lines)
3c7e7e631f63bc6f7467b627641a0c8624b6a25aeccc85bc180fcdd6f2decd3b  packages/core/src/subscription-architecture.test.ts (35 lines)
18a81eae71048ba230308c9ff537fcc445d8d94f16a261ca9fbac157d7855ed6  packages/core/src/subscription-period.test.ts (80 lines)
b04b52aa02e3de0b1f08943dacf86376124d0128f23cd1cce7f3be341e945f60  packages/core/src/subscription-period.ts (31 lines)
e08d382c9fa40bbf37525ca94d997726da615a8b1c4f97d0933901bffb8ad717  packages/core/src/subscription-track-review.test.ts (38 lines)
8d2824466508f2c629e44950f70310c33c1b04bcbe42c9ae5fe08e519de04478  packages/core/src/subscription-track-review.ts (42 lines)
880e7c556001157a255253d832749b64435c7ea2c9a4aff105702ed51d8c5e6c  packages/core/src/subscription.test.ts (39 lines)
65898c00ffd8631a3032703c6fbe916d0b072f0534b7a3a47ab9dd14a2c8b843  packages/core/src/subscription.ts (54 lines)
```

Final preservation/path/manifest write: **exit 0**. Exactly **3 existing files
changed additively and 12 new owned files**, all inside the issued lane. The 22
protected/parent hashes above matched supplied HEAD; no implementation changed
after the last compiler and targeted-test evidence. Final `git diff --check`,
status/stat and unchanged-head verification: **exit 0**. No commit or push.

Final HEAD: `2514049c8dfb7630598fdf81f5c0d6d23444abb4`. Dispatcher must commit
these working-tree changes, resolve the STOPs, then obtain exact-commit CI,
independent verdict and separate acceptance. MON-2A remains **PARTIAL / HOLD**.


## r1 — 16 October 2026, dispatcher 14: STOP before implementation

**Result: BLOCKED on lane scope; no repair implemented.** Supplied and actual
HEAD is `175262fb972f14bd6e5a353486d95a64854a6740` (keep-both merge), with
`origin/main` at `49fc07f33a440bcca7ac443de365aba3670e9999`. MON-1 #221 is now
merged and MON-2A PR #239 is open; the earlier build-ahead statements above are
historical. The initial working tree was clean. This addendum changes only this
receipt. No migration, source, test, expectation, byte pin, shared list or lane
registration is changed. No commit, staging, checkout, push or package install.

Read the independent Opus REPAIR verdict at
`~/.local/share/full-steam/jg-runs/d14-mon-2a-opus-175262f.md`, repository AGENTS,
the applicable BUILD_PLAN MON-2 and 10.1 contracts, and the subscription contract.
The verdict reports CI run 38950045197 failing the unchanged transitive
subscription architecture assertion. That result is supplied/review evidence,
not a fresh test execution in this round.

### Exact STOP, preflight and before/after

The r1 instruction explicitly requires stopping if a merged repair file is
outside the lane, without editing the assertion or shared lists. The effective
policy from `loadLanePolicy(process.cwd())` in
`tools/agent-lane-boundary-lint.mjs`, tested with its exported
`lanePathAllowed("mon-2a", lane, file)`, returned **false** for all candidates:

| File / exact line | Before | Actual after |
|---|---|---|
| `packages/core/src/jobs-on-the-go.ts:2` | `import { isSmallJobV3 } from "./activation-v3.js";` | Identical; not edited |
| `packages/core/src/activation-v3.ts:3` | `import { shadowSuccessFeeV1 } from "./shadow-domain/success-fee.js";` | Identical; not edited |
| `packages/core/src/activation-v3.ts:6` | `export const activationFeePolicyV3 = shadowSuccessFeeV1.unwrap().unwrap().shape.policyVersion;` | Identical; not edited |
| `packages/core/src/shadow-domain/success-fee.ts:9` | `shadowSuccessFeeV1` contains `policyVersion: z.literal("reference_fee_policy_v3")` | Identical; not edited |

The refusing MON-2A allow-list is
`config/agent-lane-assignments.json:6`; none of those three files is included.
No `config/lanes/mon-2a.json` override exists. The first proposed repair boundary
is `jobs-on-the-go.ts:2`; route (2) is also blocked at `activation-v3.ts:3` and
`shadow-domain/success-fee.ts:9`. No hypothetical edit was written to bypass the
preflight, and the allow-list was not extended by the builder.

Before any source mutation, searched repository test/spec files for these
paths/names and inspected the two specifically named merged byte-pin registries:
`apps/api/src/auth/context-boundary.test.ts:88-97` and
`packages/db/test/extra-origin.integration.test.ts:243-254` ([S9]). Neither pins
these three source files. The meter's source-inspection assertion at
`packages/core/src/jobs-on-the-go.test.ts:153-160` checks domain imports and
absence of environment/network/wall-clock access, rather than a byte hash.
Shadow architecture tests also inspect their own source structurally. These
observations do not override the lane refusal. All existing tests remain
byte-identical to HEAD, including `subscription-architecture.test.ts`.

**Coordinator ruling required:** permit an exact-file neutral dependency repair
through an extended lane or a separately issued owner lane. Route (2) would
share the existing Zod literal schema from a neutral module so that
`activationFeePolicyV3` and the shadow schema retain the same schema identity
and value, with the requested equality test. No such change or test was built.
No ruling, approval, independent r1 verdict or acceptance is inferred.

### Commands and verification actually performed

- Read-only `git rev-parse HEAD`, `git rev-parse origin/main`, initial
  `git status --short`: exit 0; refs as above and clean tree.
- Repository `rg` searches and source/policy/verdict reads: inspected the import
  chain and named pin registries. Some broad read output was truncated and was
  followed by narrower reads; no implementation was inferred from truncation.
- Effective-policy `lanePathAllowed` preflight: exit 0, **false** for each of the
  three candidate files. This is the blocking deterministic result.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: **interrupted, exit 130**. The
  installed launcher printed a pnpm configuration warning and produced no lane
  result before interruption. No successful pnpm check is claimed; no package
  download/install command was issued. `ps` inspection was denied by sandbox.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`: **exit 0**,
  existing 15-path PR diff passes the current lane. This does not authorize any
  of the three proposed repair paths: they remain outside that allow-list.
- `git diff --check`: exit 0 before the receipt edit; rerun below for the final
  documentation change, together with byte-preservation and path checks.
- `node --version`: `v24.17.0`; this is not a clean pinned-install claim.

Core targeted/full Vitest, `pnpm test`, typecheck, lint, build and OpenAPI checks
are **NOT RUN in r1**, following the explicit pre-implementation STOP; no source
was changed to verify. Database, migration and browser suites are **NOT RUN**;
the dispatcher states this sandbox cannot start PostgreSQL or bind localhost
and those suites belong to GitHub CI after push. No new CI run is claimed.
The reported architecture failure remains unresolved, and the earlier LP-0
catalogue STOP and Q3-Q9 holds remain in force. No new operational alert,
external action, behavior change, public export change or migration exists.

Intended receipt-only conventional commit message is written to both
`/private/tmp/jg-msg-mon-2a-r1.txt` (round-specific request) and
`/private/tmp/jg-msg-mon-2a.txt` (dispatcher handoff). The dispatcher owns any
commit and subsequent exact-head CI/review. This is a builder STOP report,
not technical acceptance or an independent verdict.

Final r1 preservation check: **exit 0**; every tracked file equals HEAD except
this append-only receipt. Final `git diff --check` and direct lane lint: **exit 0**.
Only the receipt is modified; HEAD remains `175262fb972f14bd6e5a353486d95a64854a6740`.


## r2 — 16 October 2026, dispatcher 14: ruling 62 dependency repair

**Result: scoped repair implemented; independent verdict and acceptance pending.**
Started clean on `codex/sandbox/mon-2a`, HEAD
`b1c5bd201bb5f91efefc2f6e20ed5f1dfeec0dda`, with `origin/main` at
`d74fd66d684226a5150fe3d3576a853d58abcf31`. Ruling 62 supplied in the dispatch
supersedes r1's exact-file lane STOP. This round makes no commit, staging,
checkout, push, package install, migration or policy approval.

### Scope, preflight and preservation

- Extended only the `mon-2a` entry's allow array at
  `config/agent-lane-assignments.json:6`, adding exactly
  `packages/core/src/jobs-on-the-go.ts`, `packages/core/src/activation-v3.ts`
  and `packages/core/src/small-job-v3.ts`. Every other byte of that register
  is preserved, including every other lane and the existing note.
- `packages/core/src/jobs-on-the-go.ts:2` before:
  `import { isSmallJobV3 } from "./activation-v3.js";`; after:
  `import { isSmallJobV3 } from "./small-job-v3.js";`. All other bytes preserved.
- Moved the original `isSmallJobV3` function and its comment verbatim from
  `activation-v3.ts:10` into new `small-job-v3.ts:6`, with only its existing
  Zod pence validator and imports of Zod and `MAX_MONEY_PENCE`. The new module
  has no fee/shadow import. Its validation, parse order and `< 200_000` rule
  are unchanged. Activation now re-exports the same named function at line 10;
  all its other bytes, including the fee-policy schema reference, are unchanged.
- All existing tests/expectations, `shadow-domain/success-fee.ts`, public barrel
  exports, pins and other shared lists remain byte-identical to starting HEAD.
  No assertion was edited, including `subscription-architecture.test.ts`.
- Before editing, searched test/spec and tool/config references for all three
  paths and searched the current source hashes across the repository. Inspected
  the merged pin registries in `auth/context-boundary.test.ts:88` and
  `extra-origin.integration.test.ts:243`; neither pins these paths. The only
  matching activation source hash is the historical CH-1 receipt manifest
  `docs/verdicts/CH-1/attempt2-source-hashes.json:18`, described by its receipt
  as recorded changed-source hashes; no executable guard references that
  manifest. It is unchanged. No merged byte-pin covering the repair was found.
- Deterministic preservation checks verify the exact function/validator move,
  import-only meter change, exact three allow additions and every other tracked
  file unchanged (except this append-only receipt). Built-module checks verify
  activation's four runtime export names, function identity with the neutral
  re-export and `reference_fee_policy_v3` value. These are deterministic builder
  checks, not an independent model verdict.

### Commands and results actually obtained

Runtime is Node `v24.17.0`; used the already installed pnpm `10.28.1` binary
from the local pnpm store through `/private/tmp/jg-bin-mon-2a-r2/pnpm` on PATH.
The default pnpm launcher stalled at `--version` and was interrupted (130);
no package download/install command was issued. No clean-install claim.
Logs are under `/private/tmp/jg-mon-2a-r2-*.log` (not committed).

- Affected headless command, from `packages/core`:
  `node_modules/.bin/vitest run src/subscription-architecture.test.ts src/activation-v3.test.ts src/jobs-on-the-go.test.ts src/jobs-on-the-go-pricing.test.ts src/subscription.test.ts src/subscription-period.test.ts src/subscription-track-review.test.ts`:
  **PASS, exit 0; 7 files, 101 tests**. The architecture assertion passed unchanged.
- `pnpm typecheck`: **PASS, exit 0; 7/7 Turbo tasks** (2 cache hits).
- `LANE_BASE_REF=origin/main pnpm lint`: **PASS, exit 0; 7/7 Turbo tasks**
  (2 cache hits); core purity, lane, money and commercial-boundary checks ran.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: **PASS, exit 0**; includes
  the new neutral module and both amended source paths.
- `node --test tools/*.test.mjs`: **PASS, exit 0; 100 tests**.
- `pnpm exec turbo run test --filter='!@jobguard/db'`: **FAIL, exit 1**;
  core discovered generated `dist` test copies (missing relative `.ts` files)
  and timed out two source receipt-allocation tests under unrestricted workers.
  Summary: 6 failed/195 passed files; 9 failed/5,319 passed tests. No test,
  expectation or timeout was changed. Follow-up source-only runs bound workers:
  - `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2`:
    **PASS, exit 0; 102 files, 2,709 tests**.
  - `pnpm --filter @jobguard/ai exec vitest run src --maxWorkers=2`:
    **PASS, exit 0; 6 files, 85 tests**, synthetic fixtures only, no live model.
  - `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2`:
    **PASS, exit 0; 40 files, 867 tests** (unit tests, not browser journeys).
  - Config/storage tests completed in the Turbo attempt: **PASS**, respectively
    2 files/2 tests and 2 files/4 tests (includes generated duplicates).
  - `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2`:
    **FAIL, exit 1; 14 failed/77 passed files; 178 failed/1,611 passed/
    23 skipped tests, 41 errors**. This includes socket `listen EPERM`,
    null listener ports, two embedded-database fixture port-setup failures
    (no PostgreSQL started), and `PracticeWorkerSwitchRepository is not a
    constructor` while dependencies were being rebuilt. After the build,
    `pnpm --filter @jobguard/api exec vitest run src/subscription-boundaries.test.ts src/contractor/practice-worker-switch.application.test.ts --maxWorkers=2`:
    **PASS, exit 0; 2 files, 20 tests**. The broad API run remains a recorded
    failure; no whole-suite pass is inferred from this focused rerun.
- Direct core `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`:
  **PASS, exit 0**.
- `pnpm build`: **PASS, exit 0; 7/7 Turbo tasks** (2 cache hits), including
  the Next.js production build and 41 static pages.
- `pnpm openapi:check`: **FAIL, exit 1**, tsx CLI IPC `listen EPERM`.
  Initial source-loader fallback runs found stale dependency builds (missing
  exports); after rebuilding dependencies,
  `node --import tsx src/generate-openapi.ts --check` from `apps/api`:
  **PASS, exit 0**, validating the committed OpenAPI unchanged. A compiled-script
  attempt `node dist/generate-openapi.js --check` reported a stale serialization
  (exit 1); the final source-loader command matches the prescribed source entry.
- `git diff --check` and final scope/byte-preservation checks: **PASS, exit 0**.
  Final lane lint also passes; HEAD remains the starting commit.

`pnpm test` as a whole, `pnpm test:db`, `pnpm test:migrations` and
`pnpm test:e2e`: **NOT RUN**. The dispatcher reserves PostgreSQL and browser
suites for GitHub CI because this sandbox cannot start PostgreSQL or bind
localhost. No new CI run or live-provider verification is claimed. Existing
LP-0 catalogue persistence and Q3-Q9 holds remain; this repair does not complete
MON-2A, authorize charges or change any commercial policy. No new external
action, data migration, compatibility impact or operational alert is introduced.
The affected invariants are AGENTS §§5.10/5.14 (separation of subscription inputs
from shadow/fee proposals); the fee and activation contracts remain unchanged.

Intended conventional commit message is written to both
`/private/tmp/jg-msg-mon-2a-r2.txt` and `/private/tmp/jg-msg-mon-2a.txt`.
The dispatcher owns commit/push and exact-commit CI; a different model must
record an independent verdict before separate acceptance. This receipt is
builder execution evidence, not acceptance or independent verification.
