# CH5-P builder receipt — partial build; executable admission STOP

24 October 2026. Codex builder. RED lane: money/meter, tenant isolation.
Build-ahead order, Build Speed Plan v5 wave 8, decision 74; C250 one build.
**Not complete, independently reviewed, technically accepted, committed, pushed,
merged or released.** No successful adoption or persisted v3 baseline is claimed.

## Source and authority

- Issued/base HEAD: `5fc6453e7c476b96e70346080357cdd97395866c`, clean at entry;
  branch `codex/sandbox/ch5-p`, integration target main.
- Read-only local origin/main: `4b1a779008505c86ca85db78fb38eda412394fe4`.
  No fetch or remote-freshness claim. Supplied accepted CH5-C `fdfda588` and
  MON1-A `a9dc9c42` are consumed as they stand; acceptance does not add an API.
- Read repository AGENTS.md, BUILD_PLAN CH-5 and §§10.1.4–10.1.6, the full
  CH5-P draft at planning-pack lines 3770–3814, its common contract/holds,
  import source handoffs, CH5-C contract and MON1-A contract/receipt/source.
- Read Ben's `jg-orders/next-wave/BEN-ANSWERS-20261023.md`. Issuance overrides
  draft build/lane restrictions; merge/review/release gates remain. The issued
  note-path correction places the 0224 note in `packages/db/migration-notes/`.
- No other agent was spawned. No package install/download, Git-writing command,
  external message, provider, deployment, database or browser run occurred.

## Verified seams and STOP inventory

Actual symbols were checked with `git grep`, then source-inspected:

| Symbol / seam | Finding |
| --- | --- |
| `jobPartiesImportV3`, `adoptJobV3`, `importActionHashV3`, `assertImportIntentV3` | Present in core job-import-v3.ts; imported through its built relative module because shared barrels are coordinator-owned |
| `CommandMutation`, `UserCommandDispatcher` | Present in db commands.ts; lock hook precedes receipt claim and replay; mutations finish business locking before dispatcher audit |
| `withTenant`, `VerifiedTenantContext` | Present; genuine original context is passed, never reconstructed/copied |
| `practiceOwnedJobsSql`, `app.authenticate_practice_session(text,uuid)` | Present; session-scoped immutable adoption ownership CTE and fresh owner/session check reused |
| `PracticeAccess.job` | Present at apps/api/src/practice-access.ts, outside this DB-only allowlist; no transport integration claimed |
| `meterPlaceAdmissionHold` | Present; the ENTIRE db meter-place-admission.ts executor contract is a typed held value |
| `app.mon1_admit_place(uuid,uuid,text,uuid)` | Present in 0210; private, migration-owned, SECURITY INVOKER, checks preheld tenant lock then UNCONDITIONALLY raises `METER_PLACE_SOURCE_HANDOFF_HELD` |
| Executable `import_live` DB adapter | `git grep -n 'import_live' -- packages/db/src` returned no match. **STOP-ADMISSION** |
| `ImportedActivationTermsV3`, `trialPlanContextRef` DB source | Relevant `git grep` returned no match. **STOP-TERMS**; no substituted fixture plan/trial reference |
| `app.adopt_in_flight_job_v3` | Absent in tracked base; only the private refusal signature is added here. **STOP-WRITER** for its requested successful behavior |
| `JobImportV3Repository`, `AdoptInFlightJobV3Mutation` | Proposed new symbols, absent at base; added with explicit held execution, not a functioning persistence writer |

**STOP-ADMISSION:** accepted MON1-A is a bounded held foundation. There is no
checked source vocabulary, current commitment reconstruction, ordinary-start
resolver, transactional import-live admission result, persisted grace/review
Decision, session-scoped link/place result or plan/trial output to consume.
The pure supplied-input oracle is not admission. No copied engine, permissive
adapter, fake result reference, trial bypass or counted-event exemption was added.
The existing unconditional held DB API is consumed explicitly.

**STOP-LOCK-ORDER:** parent MON1-A retains its own lock-order/source STOP. A
complete import writer needs tenant/period admission locks before receipt/job/
party locks and audit last. This leaf takes no business locks because it always
refuses; it does not claim to establish the missing order by guessing lock keys.

**STOP-PERSISTENCE / STOP-TERMS:** no baseline/line/terms/provenance/completion
ledger tables, ownership assignment, job constraint expansion, commercial-track
binding or successful result storage are installed. Their full relationships to
MON1 result and accepted imported activation source remain missing. The private
SQL signature cannot execute adoption, even after a future parent change.
CH-1/MON1 source acknowledgement and downstream Final Account/SV5/SV6 handoffs
remain holds. No existing quote, v1 cap, invoice, journal or ownership is changed.

**STOP-REPLAY / STOP-POSITIVE-RACES:** no succeeded import means no original
receipt/time/result to replay. Public hash utility binds every normalized public
field plus tenant/session/path, but is NOT persisted and is not a durable
idempotency implementation. Successful import/import, switch-live, resume/reopen,
Solo/Builder/grace/trial and London-day/period acceptance require real upstream
sources. Regenerated expiry reconciliation remains unimplemented. Concurrent
refusals do not prove successful capacity enforcement.

## Changes and safest choices

1. New `JobImportV3Repository.preview(context,digest,sourceJobId,request)` returns
   the exact server-owned fictional snapshot/hash and explicit held availability.
   Preview input is strict `job-import-preview.v3` with expected binding, fixture
   ID and live/invoiced lifecycle. No actor/tenant/price/cap/time overrides.
   Snapshot uses CH5-C's complete strict schema and canonical content hash.
2. Fresh persisted session/owner authentication and session-owned source lookup
   run before informative fixture/binding/body errors, including dispatcher
   preflight. UUIDs normalize before comparisons; binding revisions are read
   from the exact tenant/job current binding. Server fixture description/value/
   wording/history cannot be supplied by a caller. No hidden-table reads.
3. `adopt` resolves current actor, validates full intent/snapshot, then uses the
   EXISTING dispatcher with `AdoptInFlightJobV3Mutation`. Its lock hook repeats
   authority/content checks and throws MON1-A's typed hold BEFORE receipt claim,
   replay or approval. `mutate` independently refuses. The preliminary read
   transaction finishes before dispatcher entry; no nested transaction, second
   command authorization, audit batch or network action is introduced.
4. Exact intended command binding: `job.adopt_in_flight_v3` command/action,
   `job` subject and deterministic lowercase target derived from tenant/session/
   command, null recipient, full snapshot action hash, revision 0, exact net/GBP,
   `synthetic_demo_import.v3`. This is checked application input, not persisted
   authorization. A future writer still must revalidate SQL authorization and
   reproduce CH5-C's UTF-16-key-sorted canonical JSON hash; no jsonb-text hash is
   substituted here. Generated baseline/scope/time/result IDs remain STOP.
5. P refuses nonempty history; E's checked history path remains unimplemented.
   Read authenticates current owned job and returns typed held error, never a
   fabricated successful import result or an old v1 object cast into v3.
6. 0224 adds only the private unconditional refusal with the proposed exact
   signature. Owner jobguard_migration; SECURITY DEFINER; search_path=pg_catalog;
   PUBLIC/runtime/meter/infrastructure/shadow/emergency EXECUTE revoked. No new
   role: bootstrap ensureRoles/posture amendment is inapplicable. Runtime grant
   is intentionally withheld until the complete checked writer exists.
7. Ben's safest-choice rule applied explicitly: refuse both live AND invoiced
   adoption until an authoritative zero/nonzero MON1 result exists; owner only;
   exact-item approval only; no standing authority; no paid/settled/count/fee
   claim. The fictional baseline is a clearly labelled server fixture, never
   simulated evidence, a meter permit or production fact. These choices can be
   changed only through an issued synthetic source contract before real users.

## Acceptance status

| IDs | Actual evidence / limit |
| --- | --- |
| P01–P08 | **STOP** positive baseline/terms/links/cap/grace/Builder/races absent. Local unit and CI-authored tests only prove refusal creates no effects |
| P09 | Scripted unit auth-before-error, canonical IDs, wrong actor, swapped binding, stale preview, complete snapshot, history, revocation between preparation/dispatch; real session/foreign tenant/revocation/pool cases authored, **NOT RUN** |
| P10 | **STOP** successful exact-replay identity/time/result storage absent; repeated attempts remain held |
| P11 | CI-authored exact signature/owner/search-path/ACL, runtime direct SQL/role/GUC refusal; **NOT RUN**. No new side tables/FKs/RLS exist to claim tested |
| P12 | CI-authored own-step preservation/rollback/successors/comparator controls; **NOT RUN**. Successful v1 replay coverage remains existing CI regression, not a local DB pass |
| P13 | **STOP** no ordinary London-day imported lifecycle source exists; historical dates cannot affect counts because no import is created |

Guard assertions cover mode, digest/UUID, session, session-owned source, current
binding, strict input, fixture selection, complete preview/snapshot, actor,
command/action/subject/recipient/revision/value/currency/policy, no-history path,
and unconditional lock/mutate/read refusal. SQL own-step test contains a
transaction-rolled-back removal of its sole refusal guard and asserts the actual
behavioral check fails; **not executed locally**. There are no equivalent new
constraint/index keys to drop. No old test, catalogue, guard or privilege weakened.
This is source inspection and unit evidence, not independent verification.

## Validation

Dependencies already installed. Node v24.17.0, cached pnpm 10.28.1 CLI,
Vitest 4.1.11. Nested pnpm uses `/private/tmp/jg-ch5-p-bin/pnpm`, a thin wrapper
around that existing CLI; no download. Heavy actions use the existing
`/Users/benharwood/.local/bin/heavy-slot`, never a replacement scheduler. First
core build's sandboxed wrapper emitted resource-inspection permission errors;
subsequent actions used approved execution of the same wrapper. Resource sample:
53% free memory, 107 GiB disk, 4 Node processes, load approximately 4. All later
heavy actions use ONE shared slot, serially, with at most 2 Vitest workers and
3 named files. No PostgreSQL or browser listener started.

Executed commands/results (pnpm below means the installed pinned CLI):

- `pnpm --filter @jobguard/core build`: exit 0.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/job-import-v3.integration.test.ts -t 'CH5-P source-only'`:
  initial exit 0, 10 passed; after added revocation assertion exit 0, 11 passed.
  Three PostgreSQL tests were DESELECTED by name (Vitest prints “skipped”);
  no `.skip`, `.todo` or passWithNoTests was introduced. This is scripted
  application transport evidence, explicitly not PostgreSQL execution.
- `pnpm --filter @jobguard/db typecheck`: initial exit 2 on cross-package Zod
  schema generic mismatch; replaced inferred schema constraint with parse return
  type. Rerun exit 0. No shared dependency or schema contract changed.
- Static test compilation with `/private/tmp/jg-ch5-p-tests-tsconfig.json`:
  initial cross-package issue above, then exit 2 for the scripted Pool overload
  cast; corrected the unit-only explicit cast. Final result appended below.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-import-v3.test.ts src/job-import.test.ts src/meter-place-admission.test.ts`:
  exit 0, **48 passed across 3 files**.
- `pnpm build --concurrency=1`: exit 0, **7 tasks successful, 2 cached**, 43.062s.
  Existing Next workspace-root, webpack and CSS warnings; no browser run.
- `git diff --check`: exit 0 (new-file scope/whitespace inspection also required).

Remaining check results are recorded below after their actual completion.

## CI-only authored checks and handoff

NOT RUN locally:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-import-v3.integration.test.ts test/job-import.integration.test.ts test/job-parties.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-import-v3-races.integration.test.ts test/commands.integration.test.ts test/command-replay-contract.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-import-v3-upgrade.integration.test.ts test/job-activation-terms.integration.test.ts test/meter-persistence.integration.test.ts
pnpm test:db
pnpm test:migrations
```

Own-step suite uses this build's actual predecessor 0210, historical SQL setup,
populated named columns/full types/PK identities/canonical values, existing table
owners/ACL/RLS/policies and old routine definitions; applies 0224 ALONE; records it;
runs discovered successors twice; checks rolled-back microsecond corruption and
SQL refusal-removal controls. It is not a populated v3 adoption or v1 replay proof.
On integration rebase, coordinator must reconcile the exact supported predecessor
with intervening allocated migrations before treating own-step CI as satisfied.
No migration discovery edit: migrate.ts discovers new numbered files automatically.

C1 browser applicability: no route/page exists for this held v3 feature in the
issued scope. No browser spec fabricated. CH5-A/J own future transport/browser
journeys. AI evaluation is inapplicable to this leaf: no model, prompt, extraction
parser, matching policy or AI gateway change. Root mandatory CI is retained;
root `pnpm test` was not run locally because it includes forbidden DB suites.

## Exact shared integration requests (not edited)

1. Optional DB barrel rows ONLY after bounded acceptance:
   `export { JobImportV3Repository, AdoptInFlightJobV3Mutation, JobImportV3Error, importPreviewRequestV3 } from './job-import-v3-repository.js';`
   No fixture/hash/target helper public exports are requested. CH5-A must retain
   held availability and cannot compose an executing writer from this foundation.
2. Catalogue `recorded.routines` additive row:
   `{"identity":"function:app.adopt_in_flight_job_v3(uuid,uuid,text,uuid,uuid,jsonb)","owner":"jobguard_migration","securityDefiner":true,"searchPath":"search_path=pg_catalog","returnsTrigger":false,"extension":null,"reachable":false,"runtimeExecute":false,"publicExecute":false,"otherExecute":[],"definitionSha256":null,"staticWrites":[],"staticCalls":[]}`.
   No effective runtime EXECUTE/owner relation rows, new table rows, tenant table
   classifications, RLS exemptions or historical routine replacements requested.
   Coordinator reconciles actual live catalog before adding any generated record.
3. Route/OpenAPI/watchdog registration: **none now**. Do not register execution
   or pretend CH5-A's route exists. A future successful writer requires the exact
   new runtime grant, protected tables/completion guards and downstream entries
   after separate issuance; those are STOP proposals, not rows supplied here.
4. Lane file `config/lanes/ch5-p.json` created under this order's explicit exception,
   exact file allowlist, no shared register edits. No BUILD_PLAN edit authorized;
   adjacent discoveries/remaining work are recorded here for coordinator adoption.

0224 migration notes contain rollback/forward-fix strategy. No backfill, old
commercial history change, new external provider or operational alert producer.
Full successful admission/persistence, required green integrated CI, exact-head
independent Claude A/B PASS verdicts, separate acceptance and dispatcher/Ben merge
remain held. Builder receipt is not an independent verdict or acceptance.
Intended conventional commit message: `/private/tmp/jg-msg-ch5-p.txt`.

## Final local results and integration hold

- `pnpm typecheck --concurrency=1`: **exit 0**, 7 workspace tasks successful,
  2 cached, 20.297s.
- `pnpm --filter @jobguard/db lint`: **exit 0**.
- `LANE_BASE_REF=origin/main pnpm lint --concurrency=1`: **exit 1**, core purity
  passes (241 TS files; 8 existing computed-import observations), then lane
  check refuses inherited parent paths. Package lint is separately green.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: **exit 1**, same inherited range.
  Examples: apps/api/openapi.json, existing job-work-state application/controller/
  tests, workspace application, meter predecessor and tenancy/catalogue tests.
  **H-LANE-BASE**: issued synthetic base contains accepted parent work ahead of
  main. No tracked files were edited by CH5-P; do not absorb inherited paths into
  this lane or waive required current-main CI. Full diagnostics are in
  `/private/tmp/jg-ch5-p-lanes.log` and `/private/tmp/jg-ch5-p-lint.log`.
- `pnpm openapi:check`: **exit 0**; no generated OpenAPI edit.
- `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-ch5-p-tests-tsconfig.json`:
  **final exit 0**. The final intermediate failure was an inferred Vitest mock
  declaration portability error; explicit named mock/return types fixed it.
  No test execution, DB or listener is implied by this compile.
- Final source-only unit rerun after the test helper type correction: **exit 0,
  11 passed, 3 DB tests deselected**; log `/private/tmp/jg-ch5-p-unit-final.log`.
- `node tools/money-arithmetic-lint.mjs`: **exit 0**.
- `node tools/commercial-boundary-lint.mjs`: **exit 0**. These ran separately
  because root lint stopped at the lane check.
- `node /private/tmp/jg-ch5-p-scope.mjs`: **exit 0**, 10 new files, ZERO tracked
  edits, exact current lane-policy allowlist and whitespace pass. This diagnostic
  does not replace the failed required origin/main lane check.
- `git diff --check`: **exit 0**. Final resource sample: 52% free memory,
  105 GiB free disk, above the issued 45 GiB floor.

Final production source matches the successful build/typecheck/package-lint;
subsequent changes were only test type annotations and this receipt. Intended
message exists at `/private/tmp/jg-msg-ch5-p.txt`. All changes remain unstaged and
uncommitted. Dispatcher owns subsequent commit/push; CI and independent verdicts
must bind the resulting exact head. Executable admission and positive CH5-P
acceptance remain STOP, not cleared by the green local checks.

## r1

25 October 2026. Repair against issued HEAD `c6c4ec97`; working-tree changes
only, no commit/push. The named review
`jg-runs/v5-ch5-p-claude-A-c6c4ec97-20261025.md` was absent both from this
worktree and a filename search under the parent project. This repair follows the
two blocking findings quoted in the dispatch. No independent verdict or technical
acceptance is claimed.

Exact additive catalogue/allowance rows:

1. `docs/contracts/lp-0-effective-privileges-v1.json`, `recorded.routines`,
   immediately after the existing `adopt_in_flight_job` overloads and before
   `advance_audit_head`:
   `{"identity":"function:app.adopt_in_flight_job_v3(uuid,uuid,text,uuid,uuid,jsonb)","owner":"jobguard_migration","securityDefiner":true,"searchPath":"search_path=pg_catalog","returnsTrigger":false,"extension":null,"reachable":false,"runtimeExecute":false,"publicExecute":false,"otherExecute":[],"definitionSha256":null,"staticWrites":[],"staticCalls":[]}`.
   Static additive comparison against HEAD: **373 -> 374** routine records;
   every prior row and its order preserved. The null definition digest follows
   neighbouring additive entries; no live catalogue capture is claimed.
2. `packages/db/test/serious-b5-upgrade.integration.test.ts`: the exact
   `(app, adopt_in_flight_job_v3, t uuid, source_job_id uuid, session_digest text,
   command_id uuid, authorization_id uuid, snapshot jsonb)` routine allowance,
   applied after 0210's allowance in migration order. The new helper asserts one
   new matching signature, migration ownership, SECURITY DEFINER,
   `search_path=pg_catalog`, and owner-only EXECUTE, then merges that row at its
   server catalogue position while retaining all predecessor expected values.
   No existing assertion or allowance is removed or weakened.

Standing migration line audited against all of 0224: **one new routine, zero new
tables**. There are no matching rows to add in
`contractor-entitlement-upgrade.integration.test.ts`: its successor comparison
uses table-data snapshots only; its routine catalogue check compares immediately
before/after its own 0198 migration, before 0224 runs. Likewise,
`tenancy.integration.test.ts` has table RLS/guard/owner lists, no routine
expected-additions list. Both files remain unchanged because 0224 adds no table.
No privilege relation, migration SQL, lane policy or application code changed.
The earlier shared-integration request for this routine is fulfilled by row 1
above; its remaining unrelated requests and all executable-admission STOPs remain.

Commands actually run (pnpm uses the pre-existing pinned 10.28.1 CLI via
`PATH=/private/tmp/jg-ch5-p-bin:$PATH`; Node v24.17.0; no install/download):

- `pnpm --filter @jobguard/db typecheck`: **exit 0**.
- `pnpm --filter @jobguard/db lint`: **exit 0**.
- `pnpm typecheck --concurrency=1`: **exit 0**, 7 tasks successful, 4 cached.
- `pnpm build --concurrency=1`: **exit 0**, 7 tasks successful, 4 cached;
  existing Next/webpack/CSS warnings and Turbo sandbox telemetry IO warning.
- `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-ch5-p-r1-tests-tsconfig.json`:
  **exit 0**, compiles the modified SERIOUS-B5 test and its dependencies; not DB
  execution.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/job-import-v3.integration.test.ts -t 'CH5-P source-only'`:
  **exit 0**, 11 passed; 3 PostgreSQL tests deselected by name (reported skipped).
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-import-v3.test.ts src/job-import.test.ts src/meter-place-admission.test.ts`:
  **exit 0**, 48 passed across 3 files.
- `node --test tools/*.test.mjs`: **exit 0**, 122 passed.
- `pnpm openapi:check`: **exit 1**, tsx CLI cannot bind its local IPC pipe
  (`listen EPERM`). Same generator/check executed without the CLI IPC server:
  `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`:
  **exit 0**, no generated file change.
- `LANE_BASE_REF=5fc6453e pnpm lint:lanes`: **exit 1**, rejects exactly the
  dispatcher-assigned additive shared paths
  `docs/contracts/lp-0-effective-privileges-v1.json` and
  `packages/db/test/serious-b5-upgrade.integration.test.ts`. The checked-in lane
  allowlist does not contain this repair order's exception. No allowlist widening.
- `LANE_BASE_REF=origin/main pnpm lint --concurrency=1`: **exit 1**, core purity
  passes; lane lint rejects inherited parent paths plus the assigned shared paths.
  No remote fetch/freshness claim. Package lint is separately green.
- `node tools/money-arithmetic-lint.mjs`,
  `node tools/commercial-boundary-lint.mjs`, static catalogue additive/order check,
  and `git diff --check`: **exit 0**.

Detailed logs: `/private/tmp/jg-ch5-p-r1-{typecheck,build,test-types,unit,core-unit,tools-unit,openapi,openapi-loader,lanes,lint}.log`.
An initial system `pnpm --version` did not return promptly and was interrupted;
all subsequent pnpm commands used the existing pinned CLI wrapper.

NOT RUN: PostgreSQL, migrations, browser/listener suites or root `pnpm test`
(which includes PostgreSQL). Dispatcher/reviewer must execute
`lp-0-authority-paths`, `serious-b5-upgrade`, `contractor-entitlement-upgrade` and
`tenancy` on PostgreSQL. Those four checks and an exact-result independent verdict
remain pending. This repair supplies the two catalogue additions, not a database
pass or complete CH5-P acceptance. Intended commit message rewritten at
`/private/tmp/jg-msg-ch5-p.txt`; dispatcher owns commit/push.
