# MON1-A builder receipt — partial build, STOPs retained

23 October 2026. Codex builder. RED lane: money/meter and tenant isolation.
Issued order: MON1-A, decision 74, Build Speed Plan v5 wave 6. Build only;
Ben merges. NOT committed, pushed, independently reviewed, accepted or released.
This is a partial foundation, **not completion of atomic admission**.

## Exact source and authority

- HEAD/base: `e7589b3857a00cadc2ca447a541233d87661e392`, issued MON1-S parent.
- Branch: `codex/sandbox/mon1-a`; integration target `main`.
- Local `origin/main`: `dc5721230fd8aedbf2d9d0457789074b66b48765`; no fetch/freshness claim.
- Initial working tree was clean. No Git-writing command used.
- Read repository AGENTS.md, applicable BUILD_PLAN §§10.1.3–10.1.6/MON-1,
  full MON1-A draft, workstate–meter–trial common order/holds/verification
  contract, migration rules and MON1-L/S/persistence contracts.
- Read `~/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261023.md`.
  Build-only dependency amendment overrides the draft build hold; all MERGE
  prerequisites, independent exact-head verdicts and separate acceptance remain.

## Symbol verification (git grep, not assumed from draft)

Verified `SwitchJobLiveV3Mutation` in activation-repository.ts and its existing
`lock`/`mutate` hooks; `app.switch_job_live_v3` is called with accepted document,
expected job revision, actor, command and authorization IDs. Its existing hook
is not a checked MON1-A pre-mutation resolver. `UserCommandDispatcher` acquires
receipts and then creates exact authorization before calling `mutate`; simply
using a future activation row as source would not satisfy this order.

Verified `groupSuppliedMeterPlaces`, `computeSmallPlaceAllowance`,
`syntheticMeterPolicyV1`, subscription allocation APIs, `projectMeterJobTimeline`,
`projectMeterDays`, `app.mon1_company_actor`, `app.ch4_capture_site_source`,
tenant lock 184 and `test/lock-order-1.test.ts` (also inspected its DB test).
`evaluateMeterPlaceAddition` and `app.mon1_admit_place` were absent in tracked
base source: proposed new symbols, added only within this lane. No accepted
pre-mutation admission resolver/source enum exists at the proposed seam.
MON1-L explicitly returns candidate commitments, null day counts, empty intervals
and H-METER-CLOCK; MON1-S preserves that held contract. These cannot establish
actual committed membership.

## Changes and safest choices applied

1. Added pure strict/versioned synthetic `evaluateMeterPlaceAddition` oracle.
   Reuses existing canonical grouping, small allowance and fixed policy; exposes
   raw jobs/grouped/small/free/chargeable counts separately. Committed jobs are
   supplied independently of today's counted membership. No runtime caller.
2. Solo 4 included/5 paid/6 grace/7 refusal; Builder 7 included/12 paid-cap/13
   grace/14+ track review. Zero-place grouping adds no capacity consequence.
   Existing maxima 4,900p/16,900p remain. No subscription/fee/track mutation.
3. Day31 and small-trip are synthetic automatic oracle cases, never runtime
   bypass flags. Trip replaces the same job's small classification. The unresolved
   first-evidence overlap throws a typed hold: safest choice is refusal to infer
   authority, with no hook installed that could refuse an actual automatic fact.
4. SHA-256 binds normalized/sorted source input, plan/source revisions and exact
   prospective identity. A hash/result is never authorization or a durable permit.
5. 0210 installs only a private, unconditional held SQL boundary. It verifies
   migration-owner invocation, tenant context and preheld 184 lock, then refuses.
   No source enum, plan, membership, session or count is fabricated. No callable
   DB executor: DB module exports a strict held value only.
6. No runtime/PUBLIC/meter execute grant, route, UI, consumer, business table,
   standing approval, external action, settlement or billing effect. Existing
   RLS/FORCE RLS and runtime non-owner boundary are preserved. New-table RLS is
   inapplicable because there are no new tables.
7. Ben's safest-choice instruction applied as: hold rather than infer actual
   counts/authority; reject unsupported input; no disclosure/charge/paid fact;
   no automatic upgrade or standing approval. No owner/finance permission is
   newly invented. Decisions remain changeable through a later issued synthetic
   source contract. The separate dependency patch order is outside this allowlist;
   no package pins or lockfile were changed.

## STOPs and holds

- **STOP-SOURCE**: require accepted closed server source enum and immutable
  pre-mutation command/authorization/revision resolver. Then bind eventual result
  to that same source inside one transaction. Current routine cannot admit.
- **STOP-COMMITMENT / H-METER-CLOCK**: require authoritative membership projection
  covering live/unlocked/unstopped/unclosed, finish/quiet/cancellation endpoints,
  prospective resume/reopen/import and first-evidence overlap. Never treat held
  empty intervals as zero commitment. Safest-choice answer does not approve money
  endpoint policy or supply missing contracts.
- **STOP-LOCK-ORDER — coordinator confirmation required**: reconcile 184 before
  receipt/job/source/plan locks, post-wait current authority/plan check, audit last,
  with LOCK-ORDER-1 and accepted C/activation/import source paths. This leaf checks
  preheld 184 and acquires no business/audit locks. No business lock after audit.
- **STOP-DECISION**: mandatory grace upgrade Decision and deduplicated operations
  card/track-review persistence cannot be derived from an unverified source.
  Oracle labels do not claim these records exist.
- **STOP-POSITIVE-RACES/AUTH/ROLLBACK**: real successful admission races, rechecked
  session/membership/plan/replay conflicts and successful source/receipt/Decision/
  audit rollback require the above executable source seam. Held-boundary tests do
  not prove these acceptance criteria. Do not wire the refusal into automatic paths.
- **STOP-INTEGRATION**: MON1-I supplies no consumer here; CH-5/SV-7A import/diary
  closure and MON-3C trial/card legality remain independently gated. Same-site
  grouping never authorizes a second live trial job or waives a card.
- **H-MERGE**: parents remain under independent review/unmerged as supplied by
  dispatcher. Both exact-commit Claude verdicts, green required CI, separate
  acceptance and Ben's merge are outstanding. No subagent review was substituted.
- **H-LANE-BASE**: required origin/main lane lint includes inherited CH-4/MON1-L/T/S
  changes outside this leaf. Do not widen this lane's allowlist to absorb them.
- PostgreSQL/catalog/RLS/grants/upgrade/race suites **NOT RUN locally**, per order.
  CI after dispatcher push is mandatory. All D01–D16/G1–G5/live/provider gates stay.

## Acceptance evidence and rule-removal checks

Tests were authored before their corresponding implementation. Initial scheduled
unit execution occurred after source creation and exposed 23 failures from an
incorrect readonly Zod unwrap; corrected without weakening tests. This is not a
claim of an initial missing-implementation red run. Targeted rule-removal runs
were performed on the actual unit source, restored after each mutation:

| ID | Authored evidence | Status/limits |
| --- | --- | --- |
| M1A-01 | Solo 4/5/6/7 table | Pure assertions pass; threshold mutation killed |
| M1A-02 | Builder 7/12/13/14/100; fixed max | Pure assertions pass; denial mutation killed; no persisted operations card |
| M1A-03 | Committed before/after even without today-counting field | Pass; initial count mutation survived, strengthened before/after assertion, rerun killed |
| M1A-04 | Both allowances, mixed groups, customer/site separation, zero-place | Pass; removed free allowance mutation killed |
| M1A-05 | Same pure boundary for resume/reopen/import; CI lock-wait refusal tests | Resume bypass mutation killed; positive concurrent one-winner/all lock orders STOP |
| M1A-06 | Automatic day31/trip oracle, trip identity, overlap hold/no bypass | Automatic-denial mutation killed; actual automatic source wiring STOP |
| M1A-07 | Source/revision/content hash binding; CI tenant/lock and repeated held calls | Constant hash mutation killed; successful authority/plan/session/replay proof STOP |
| M1A-08 | Pure refusal leaves supplied input unchanged; held SQL performs no writes | Input mutation killed; actual source/receipt/Decision/audit rollback STOP |
| M1A-09 | Strict tenant/input rejection; CI owner/invoker/search-path/ACL/direct-runtime tests | Removed tenant guard mutation killed; DB grants NOT RUN |
| M1A-10 | Own 0210 upgrade, catalog/policy preservation, successors twice, microsecond control; definition forbids DML/late lock/audit | Written; NOT RUN; SQL rule-removal execution NOT RUN (DB prohibited) |

Nine targeted unit mutation runs each exited nonzero for assertion failure.
M1A-10 and DB portions of other IDs have assertion source-inspection only;
**no claim that all ten acceptance IDs are satisfied or mutation-proven**.
No existing test modified. No skip/todo/expected-failure/passWithNoTests added.

## Commands actually run

Toolchain: Node `v24.17.0`, cached pinned pnpm `10.28.1`, Vitest `4.1.11`.
Existing dependencies used; no install/download command. The unqualified pnpm
shim emitted pnpm-11 warnings and hung before any test result; terminated only
that owned attempt. Used the existing cached pnpm CLI subsequently.

Checks used existing `heavy-slot`, `HEAVY_SLOTS=2`, one owned batch at a time,
Vitest `--maxWorkers=1` (within issued maximum 2). Disk observations approximately
201 GiB available, memory 69–73% free. Initial sandboxed wrapper could not inspect
sysctl/ps; subsequent runs used approved execution of the same scheduler. No
scheduler replacement or quota bypass. Logs/scripts under `/private/tmp/jg-mon1-a-*`.
Pinned command prefix (called `pnpm` below):
`node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.
A temporary PATH shim routes nested pnpm to that same installed CLI.

- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/meter-place-admission.test.ts src/jobs-on-the-go.test.ts src/subscription-allocation.test.ts`:
  first real run 23 failed/45 passed (readonly unwrap bug); corrected run 68 passed.
- Nine targeted mutations: same owned test file with `-t M1A-01` through `-t M1A-09`,
  `--maxWorkers=1`; all killed on final run. Source restored in `finally`.
- Core `typecheck` and `lint`: initial both exit 0.
- DB `typecheck` and `lint`: initial both exit 2 because parent's private import
  `../../core/dist/meter-lifecycle.js` had not been built; subsequent results below.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 1, inherited parent paths.
- `LANE_BASE_REF=origin/main node tools/lint.mjs`: exit 1 at same lane boundary;
  core purity completed (8 existing computed imports reported, not refused).
- `pnpm openapi:check`: initial exit 1, missing DB dist before build.
- `pnpm build --concurrency=2`: exit 0, 7 tasks successful (2 cached), 44.963s.
  Existing webpack dynamic-dependency/cache warnings; no listener or browser run.
- `git diff --check`: exit 0. Read-only git status/rev-parse/branch/git grep used.

Final rerun results are appended below; initial failures above are retained.

## CI-only commands written, NOT RUN

`pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/meter-place-admission.integration.test.ts test/meter-place-admission-races.integration.test.ts test/meter-place-admission-upgrade.integration.test.ts`

Own upgrade installs predecessors, seeds old rows, applies 0210 alone after 0209,
compares populated canonical rows/types and existing owner/ACL/RLS/policies,
executes successors/runner twice and checks rolled-back microsecond damage.
These tests prove only held/private boundaries until positive source handoff.
Full required database/regression/CI gates remain, not waived by narrow tests.
Browser test authoring/execution is C1 inapplicable: no public route or consumer
per this order and no browser-spec path in allowlist. MON1-I/J own eventual journeys.
AI eval is inapplicable: no prompt/model/parser/matching/gateway change.

## Migration, integration and operations handoff

0210 SQL plus same-stem note only; automatic discovery, no runner/shared catalogue
edits. No data backfill, old routine replacement, backwards-compatibility change,
new network provider, actual charge or operational alert producer. Upgrade and
track-review alert production remain STOP. Forward fix while retaining refusal;
never delete commercial history. Coordinator catalogue row needed:
`app.mon1_admit_place(uuid,uuid,text,uuid)` — owner jobguard_migration,
SECURITY INVOKER, search_path=pg_catalog, no PUBLIC/runtime/meter EXECUTE.
No new table rows to add. No shared barrel export or routing in this leaf.

Intended conventional commit message written to `/private/tmp/jg-msg-mon1-a.txt`.
Dispatcher stages/commits/pushes; Ben alone merges. Receipt is builder evidence,
not an independent verdict, professional approval, technical acceptance or release.

### Final rerun after dependency build

- Core typecheck/lint: both exit 0.
- DB typecheck/lint: both exit 0; initial missing-dist failures resolved by build.
- Unit/regression batch: exit 0, **68 passed across 3 files** (23 owned tests).
- OpenAPI check: exit 0; missing-dist failure resolved by build.
- Parent-HEAD lane diagnostic: exit 1, linter deliberately refuses a
  self-comparison range. Not misrepresented as PASS; required origin/main
  lane result remains exit 1 on inherited changes.
- Observed free memory later 66–73%, disk still over 200 GiB available.

- `pnpm typecheck --concurrency=2`: exit 0, 7 tasks successful, 2 cached,
  1m7.925s (final source, across the workspace).
- `LANE_BASE_REF=origin/main pnpm lint --concurrency=2`: exit 1 at inherited
  lane boundary, consistent with required lane check; package lint passes above.
- Source review caught that private DB calls must use the migration role;
  CI tests now explicitly select it. This is source inspection, not a DB pass.

- Static compilation only: `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-mon1-a-db-tests-tsconfig.json`
  exit 0. Temporary config extends repository strict settings and includes the
  three new integration-test files; this did NOT execute tests/start PostgreSQL.
- Resource observations across final checks: 59–73% free memory; approximately
  199–202 GiB available disk. No observed sub-50% condition during these owned invocations.

### Final-source build and boundary results

- Repeated `pnpm build --concurrency=2` after the trip-rule correction: exit 0,
  7 successful tasks, 2 cached, 2m53.583s. This is the final source build.
- `node /private/tmp/jg-mon1-a-scope.mjs`: exit 0; **11 new files, zero tracked
  edits**, all within issued allowlist including special own-lane handling;
  migration 0210 is above issued parent 0209. This read-only working-tree diagnostic
  does not replace the failed required origin/main lane gate.
- `node tools/core-purity-lint.mjs`: exit 0, 237 TypeScript files, same existing
  computed-import observations. `node tools/money-arithmetic-lint.mjs`: exit 0.
  `node tools/commercial-boundary-lint.mjs`: exit 0. Each used shared heavy-slot.
- Final build ended with 62% free memory and approximately 199 GiB disk available,
  still above the 45 GiB minimum. Final Git whitespace check passed.

Outstanding: positive atomic admission STOPs; required origin/main lane integration
hold; unexecuted PostgreSQL proof; exact-head independent reviews, CI and separate
acceptance. No assertion that MON1-A is complete or mergeable.

## r1 (catch-up + review)

23 October 2026; Codex builder, MON1-A RED money/meter lane. Issued worktree
HEAD `cf3c670faaf74d4713a2d9dd2db064a20080e401`, branch
`codex/sandbox/mon1-a`. This head includes repaired MON1-S `24aa4f91`.
Read the full repository AGENTS.md, BUILD_PLAN §10.1.4 and MON-1 criteria,
current admission contract, repaired 0209/bootstrap and both independent reviews
from `~/.local/share/full-steam/jg-runs/`:
`v5-mon1-a-claude-A-196a95e2-20261023.md` (bounded-foundation PASS) and
`v5-mon1-a-claude-B-196a95e2-20261023.md` (REPAIR). Their verdicts bind
`196a95e2`, not these uncommitted repairs. No new independent verdict or acceptance
is claimed. No PR, commit, staging, checkout, push, install or download performed.

### Repairs and parent compatibility

- B BLOCKING 1 / A LATER 1: day 31 now requires existing committed membership
  with unchanged customer, site and small classification. It returns `admit`
  with before == after, including well beyond Solo grace. A new job labelled
  `day31` fails with `INVALID_METER_PLACE_ADMISSION`; the label cannot bypass
  Solo six. The only automatic capacity increase is derived from the validated
  existing-small to non-small transition, rather than from a caller's kind label.
  These are still supplied synthetic facts. Authoritative server reconstruction
  and actual admission remain STOP; no result becomes a runtime permit.
- Corrected the erroneous M1A-06 assertion, preserving its never-refused and
  maximum-bound checks for the actual committed-job continuation. Added the old
  bypass regression and day31 customer/site/classification tampering assertions.
- A LATER 2: added independent trip customer and site mismatch rejections, plus
  same customer/site counts once and same customer/different site adds a place
  assertions at Solo six. Existing tests were retained except the explicitly
  ordered correction of the wrong day31 expectation.
- 0210 still owns its routine as `jobguard_migration`; no ownership handoff or
  runtime execution grant. Its only meter-role use is REVOKE. Repaired 0209
  provides guarded creation and posture validation; demo-bootstrap pre-creates
  and checks that role before SET ROLE to the migration owner. No duplicate role
  provisioner is necessary in 0210. Added dependency comments/notes. Parent
  `v_revision` and held allowance changes need no consuming-code changes: this
  leaf consumes neither source computation nor held allowance fields.
- Migration executable SQL is unchanged (comments only); no new role, migration,
  table, data backfill, permissions, alert, provider or external action. Forward-fix
  strategy and compatibility notes remain in the 0210 migration note.
- **STOP-LOCK-ORDER remains held**, together with source, clock/commitment,
  Decision, positive race/replay/rollback, consumer, CI and release gates. The
  routine still checks preheld 184 and unconditionally refuses. No automatic
  event path has been wired to that refusal.

### Regression evidence actually executed

Using installed Node v24.17.0, cached pnpm 10.28.1, Vitest 4.1.11;
`PATH=/private/tmp/jg-mon1-a-bin:$PATH` selects the pinned CLI for nested commands.
All unit invocations used `--maxWorkers=2`.

1. Added the regression assertions BEFORE fixing the kernel. Ran
   `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/meter-place-admission.test.ts`:
   **exit 1, 2 failed / 29 passed**. The existing-job day31 continuation threw,
   and the new-job bypass did not throw. Log: `/private/tmp/jg-mon1-a-r1-red.log`.
2. Repaired kernel: targeted admission/grouping/allocation batch **76 passed**
   across three files (31 admission assertions). Repeated after restoring mutations.
3. Seven individual mutations each produced **exit 1 with assertion failure**:
   remove trip customer guard; remove trip site guard (the surviving review
   mutation); remove day31 customer/site/classification guards separately; split
   identical customer/site by job ID; group different sites by customer alone.
   The two grouping tests and both trip identity tests therefore fail without
   their respective guards. Sources restored in `finally` after each probe;
   production grouping source has no final diff. Script and per-mutation logs:
   `/private/tmp/jg-mon1-a-r1-mutate.py`,
   `/private/tmp/jg-mon1-a-r1-mutation-*.log`. These are deterministic test evidence,
   not an independent model review or PostgreSQL verification.

### r1 checks

Executed check script: `/private/tmp/jg-mon1-a-r1-checks.sh`; logs at
`/private/tmp/jg-mon1-a-r1-*.log`.

- Core and DB `pnpm --filter @jobguard/{core,db} typecheck`: exit 0 each.
- Core and DB `pnpm --filter @jobguard/{core,db} lint`: exit 0 each.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/meter-place-admission.test.ts src/jobs-on-the-go.test.ts src/subscription-allocation.test.ts`:
  exit 0, **76 passed / 3 files**.
- `LANE_BASE_REF=cf3c670f pnpm lint:lanes`: exit 1, **self-comparison refused**:
  issued base equals current HEAD because the dispatcher commits after exit.
  This is an outstanding gate, not a pass.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 1, inherited parent changes
  outside MON1-A. `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` also
  exits 1 at this lane gate (core purity passed). No lane policy weakened.
- Read-only working-tree allowlist diagnostic:
  `node /private/tmp/jg-mon1-a-r1-scope.mjs`: exit 0. This verifies only repair
  paths against the issued lane and does not replace either required lane check.
- `pnpm typecheck --concurrency=2`: exit 0, 7 successful tasks (2 cached).
- `pnpm build --concurrency=2`: exit 0, 7 successful tasks (2 cached), 1m2.292s.
  Turbo reported a sandbox IO warning; the build itself succeeded.
- `pnpm openapi:check`: exit 1 because the tsx CLI tried to listen on an IPC
  socket and received EPERM. Safe launcher fallback:
  `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`:
  **exit 0**, same generator/check flag, no socket listener and no generated diff.
- `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-mon1-a-db-tests-tsconfig.json`:
  exit 0; compiles the three owned DB integration files only, does not execute them.
- Final `git diff --check`: exit 0. Final working-tree scope diagnostic:
  6 tracked edits, zero new files, all within MON1-A; no migration additions.

**PostgreSQL NOT RUN here.** No database/server/browser suite attempted: dispatcher
states this sandbox cannot start PostgreSQL or bind localhost. CI after dispatcher
push must run required database/migration/security suites and final lane checks.
No browser flow or AI prompt/model was changed; consumer journeys and live gates
remain with their existing owners. Unit checks and static DB test compilation do
not establish PostgreSQL privileges, upgrade safety, positive atomic admission
or lock ordering. Independent exact-commit review and separate acceptance are
still required after the dispatcher commits. Other review LATER items were not
silently declared repaired by this scoped round.

Intended conventional commit subject/body written to
`/private/tmp/jg-msg-mon1-a.txt`. Working-tree handoff only; no commit or push.
