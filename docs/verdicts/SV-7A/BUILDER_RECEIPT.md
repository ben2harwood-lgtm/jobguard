Built by Codex; dispatched 13 Oct 2026.

# Current catch-up receipt — 15 October 2026

This section supersedes the older run receipt preserved below. Builder evidence
only: no independent verdict, technical acceptance, commit, push or release.
The requested Sonnet attribution would be false: this run is Codex.

## Current base, merge and scope

- Issued and inspected `origin/main`: `6671538c8d69936c162368c760dd6ce0f7f10493`.
- Current HEAD: `12072ab3e6e8d494b3d8c2c978737968f0f9df59`. The existing
  merge is still in progress: working-file conflicts are resolved, but the
  dispatcher must stage resolutions and finish it. No Git write was performed.
- Draft SHA `1f54750cf4b8a5f499d5dcb1be9beed2add989a5`, older receipt's
  `e9f9bc9` main and `f93716d` build-ahead base are superseded. Main wins.
- Read repository AGENTS.md and inspected plan C3, CH-2 (:463), standing notice
  (:1444), structural isolation (:1471), privacy (:1559), Test O (§10.2.11),
  SV-7 (:1901), CH-4 (:1953), ready rule (:3510), dispatch row (:3656).
  The cited contracts remain in main. CH-4/0144 has merged; its current source
  key list is at :13, rather than :8 as the historical receipt says.
- Migration allocation is **0164**, replacing old 0149. Renamed the lane's SQL,
  registration, own upgrade proof and operational references. Numeric runner
  order ends 0158, 0164. No ledger/plan edits or requested dependency install;
  no download completion was observed from the unexpected global shim.
- The five conflicts preserve main's content exactly before this lane's additions.
  Read-only comparison returned true for main lane bytes, core/db index bytes,
  migration runner bytes and MIGRATIONS.md prefix. Lane JSON parses; no conflict
  marker remains. Git index still reports unmerged until dispatcher staging.
- Scope remains the independent synthetic storage/read/observation slice, with
  named fictional customer and separate actual tester attribution. Both source
  writers, all POST routes, diary event linkage, UI, full Test O and real data
  remain unbuilt/held. No new mutation is registered while execution is held.
- Corrected malformed SQL quoting in this lane's tenant policy; strengthened
  exact UTF-8 text validation and shared Next refusal mapping. Added catalogue
  assertions for the exact read signature/helper privileges and held-writer
  absence, plus SQL read checks for session ownership/expiry and inactive actors.
  Corrected this lane's wrong-job fixture to include the track needed to reach
  its intended foreign-key check. No existing main test was edited.

## Current STOP / BLOCKING register

1. **Q3 / missing CH-4 interface:** `packages/db/migrations/0144_job_work_state.sql:13`
   before: `source_kind text NOT NULL CHECK(source_kind IN('photo','delivery_note','goods_receipt','builder_extra','stage_completion')),`
   after: **unchanged**. A coordinator-owned, reviewed diary key/tuple/checked
   adapter is required; this lane cannot choose its replacement. The existing
   adapter at :219 only handles merged sources; text originals return before
   activity handling at :225. Q3's continued post-lock permission is unresolved.
   Whole executable diary intake remains HELD as the order expressly permits.
   No new blanket ban or activity category was invented. SV7A-14 is not passed.
2. **Q2 / fixed catalogue:** `packages/db/test/tenancy.integration.test.ts:225`
   before/after unchanged: `{ relname: "decision", relrowsecurity: true, relforcerowsecurity: true, guarded: true },`.
   Coordinator must add `customer_message_source` immediately before that line.
   At :276, unchanged `{ relname: "job_finding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },`
   needs `job_diary_entry` before it. At :283, unchanged
   `{ relname: "job_work_state_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },`
   needs `job_source_original` before it. No rows/assertions were changed here.
3. **Current-main privilege inventory prerequisite:**
   `packages/db/test/lp-0-grant-freeze.integration.test.ts:64`, before/after
   `expect(brief(compareInventory(inventory, baselineMigrationOnly))).toEqual([]);`
   remains unchanged. `docs/contracts/lp-0-effective-privileges-v1.json` contains
   no new source tables/routines. Its reviewed entries/policies/triggers need a
   coordinator-owned additive review; this lane has no authority to change it.
   No inventory refresh or weakened assertion was attempted. This is source
   inspection of a required prerequisite, not an executed database failure.
4. **Q4:** customer-message authentication, session binding, provisioning,
   exact creation authority and its complete executable intake remain HELD.
   Fixture storage/read/observation proves no runtime message intake permission.
5. **Q8/Q1/Q5:** real use stays OFF; policy/privacy/provider/retention/release
   approvals absent; UI parked; full Test O and actual diary-intake source
   segment remain outstanding. BEN-ANSWERS settlements quoted below still apply.

## Current tests-first and command evidence

Node `v24.17.0`, pinned cached pnpm `10.28.1`, Vitest `4.1.11`, turbo `2.10.12`.
Dependencies pre-existed. Clean install NOT RUN (no downloads authorized).
All pnpm commands begin `export PATH="$HOME/Library/pnpm/bin:$PATH"`.
Initial unit commands used a shell function invoking cached pnpm's `bin/pnpm.cjs`;
final turbo runs use `/private/tmp/jg-sv7a-bin/pnpm` (same cached entrypoint),
so child commands also resolve the pinned version. No package was installed.
Before every heavy invocation, `memory_pressure | tail -1` showed >=44% free
and `df -g /System/Volumes/Data` showed >=57 GB free during observed runs.
No simultaneous test runs, build/test overlap, DB or browser launch.

| Command / run | Exit and result |
| --- | --- |
| `pwd`, `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main`, `git diff --name-only --diff-filter=U` | 0; confirmed worktree, both SHAs, five conflicts |
| `git log origin/main --oneline -12`, read-only `cat`/`sed`/`rg`/`nl`/`head` inspection of AGENTS, plan, lane, source/test/contracts, package scripts, pnpm launcher, helpers and merged CH-4 | 0 overall; source inspection only |
| `python3 -m json.tool config/agent-lane-assignments.json` to temporary output | 0; valid JSON after Edit/apply_patch resolution |
| `rg` conflict-marker check (inside compound JSON validation command) | 1 = no markers; compound command exit 0 |
| global `pnpm --version` twice (one attempted PATH-only cache selection) | stopped 130 both times; global shim unexpectedly stalled; no download/install completed |
| cached `node .../pnpm/10.28.1/bin/pnpm.cjs --version`, temporary launcher `pnpm --version` | 0; 10.28.1 |
| core Vitest command below, red | 1; 1 failed / 5 passed; unpaired surrogate was accepted before correction |
| same core command, green | 0; 6 passed in 1 file |
| API Vitest command below | 0; 7 passed in 2 files |
| Next Vitest command below, red | 1; 4 failed / 4 passed; early refusals omitted shared version/environment fields |
| same Next command, green | 0; 8 passed in 2 files |
| temporary TypeScript semantic check, first three DB roots | 0; 3 roots typechecked; no PostgreSQL execution |
| temporary TypeScript semantic check, isolation/upgrade/fixture roots | 0; 3 roots typechecked; no PostgreSQL execution |
| forced turbo typecheck, first invocation | stopped 130; unpinned child shim stalled config/storage tasks; no pass claimed |
| read-only main-preservation/path inventory Python check | 0; all five main-preservation checks true; 34 task paths, outside lane `[]` |
| `git diff --check` | 0 |

Exact Vitest commands (one run at a time, no more than three files):

```sh
pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-sources.test.ts
pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/job-source.application.test.ts src/job-source.controller.test.ts
pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/jobs/[id]/diary/route.test.ts' 'app/api/jobs/[id]/customer-messages/route.test.ts'
```

Temporary source-check commands (compiler only; not database tests):

```sh
node /private/tmp/jg-sv7a-check-tests.mjs packages/db/test/job-sources.integration.test.ts packages/db/test/job-sources-authority.integration.test.ts packages/db/test/job-sources-evidence.integration.test.ts
node /private/tmp/jg-sv7a-check-tests.mjs packages/db/test/job-sources-isolation.integration.test.ts packages/db/test/job-sources-upgrade.integration.test.ts packages/db/test/job-sources-fixture.ts
```

## Current database/browser/full-suite status

**NOT RUN (cannot start PostgreSQL here):**
`job-sources.integration.test.ts`, `job-sources-authority.integration.test.ts`,
`job-sources-evidence.integration.test.ts`, `job-sources-isolation.integration.test.ts`,
`job-sources-upgrade.integration.test.ts`. First failing SQL runs NOT RUN too.
Schema/integrity changes therefore have no executed migration/catalogue proof.
No placeholder/skip or mocked SQL pass substitutes for real PostgreSQL 16.

Mandatory unchanged regression files in dispatch §9, complete `pnpm test`,
`pnpm test:db`, `pnpm test:migrations` and `pnpm eval`: NOT RUN locally (own-file
three-file batching rule; dispatcher/CI matrix required). Actual merged CH-4
files for that matrix: `job-work-state.integration.test.ts`,
`job-work-state-sources.integration.test.ts`, `job-work-state-post-lock.integration.test.ts`,
`job-work-state-races.integration.test.ts`, `job-work-state-upgrade.integration.test.ts`,
`job-work-state-catalog.integration.test.ts`, `job-work-state-syntax.test.ts`;
API `job-work-state.application.test.ts`, `job-work-state.controller.test.ts`,
`job-work-state.http.test.ts`, `job-work-state.isolation.test.ts`; core
`job-work-state.test.ts`. No mandatory suite was removed or made optional.
Browser/Playwright `e2e/SV-3.spec.ts`, `e2e/SV-4.spec.ts`: NOT RUN (CI only,
explicit dispatcher instruction; sandbox cannot start a browser).
No prompt/model changed; fixture decoder changes still need applicable synthetic
evaluation regressions in CI. No approved-region live-model run is claimed.

## Current GRANT inventory and standard F

Each new GRANT, one per line:

- `GRANT SELECT ON app.job_diary_entry TO jobguard_runtime;`
- `GRANT SELECT ON app.customer_message_source TO jobguard_runtime;`
- `GRANT SELECT ON app.job_source_original TO jobguard_runtime;`
- `GRANT EXECUTE ON FUNCTION app.read_job_sources(uuid,uuid,text,text) TO jobguard_runtime;`

Standard F: no direct INSERT/UPDATE/DELETE grant is added to the application
login on any table. New tables have SELECT only. The read routine rechecks
persisted session, active actor and owned job itself. Private trigger helpers
and both held writers expose no executable write authority. Existing grants
remain unchanged; shadow/infrastructure/emergency roles gain no business access.

## Current acceptance allocation and builder source check

The historical 27-row acceptance matrix below remains the allocation, with these
updates: SV7A-01 has **6** executed core tests; SV7A-23 has **7 API + 8 Next**
executed tests. All database rows remain written/NOT RUN. CH-4's merge itself
is now satisfied, while its missing diary interface, Q3, Q2 and privilege inventory
remain holds. No runtime intake/event/replay assertion is marked passed.
The real source-to-worker proof remains unbuilt with held diary intake; the
labelled fixture source-to-worker/sink test is written but NOT RUN. Full SV-7A
card acceptance remains open. Separate verdict and actor acceptance are absent.

Builder source check is not a review verdict. Checked SQL quoting, forced-RLS
policy construction, exact tuple relationships, append-only triggers, least
privilege, source-only decoder and unchanged worker restrictions. Text schemas
now reject byte-replacing Unicode input, and all early Next refusals use the
same typed mapper. The catalog/authority tests are unexecuted, so no security
acceptance is inferred. No UI, provider SDK, raw audio, fee/meter effect or source
writer was introduced. Forward fix only; preserve committed originals/history.

Final forced checks, current hashes/stat and any sandbox refusals are appended
below after completion. The older hashes/SHAs/results below are historical only.

---

# Historical receipt (superseded by the current catch-up section above)

# SV-7A builder receipt — partial independent storage/read slice

The addendum's requested first-line attribution, “Built by Claude Sonnet 5.5,
Codex unavailable; dispatched 13 Oct 2026”, is not true of this run. The actual
builder is Codex. This receipt records builder evidence only, no independent
model verdict or technical acceptance. No commit, push, PR, merge or release.
Intended commit message: `/private/tmp/jg-msg-sv-7a.txt`.

## Base, authority and scope

- Issued `origin/main`: `e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4`, verified unchanged.
- Actual HEAD/build base: `f93716da170f1ba10a98abe1e17f57dd169f8cc2`, CH-4 build-ahead.
- Draft inspection: `1f54750cf4b8a5f499d5dcb1be9beed2add989a5`; not the build base.
- Node actually installed: `v24.17.0`; cached pinned pnpm actually used: `10.28.1`;
  Vitest `4.1.11`, turbo `2.10.12`. Dependencies were already present; no install
  or package download was requested/performed. A clean pinned install was NOT RUN.
- Migration number 0149 is the issued header allocation, replacing all draft
  placeholders. HEAD runner ends at CH-4/0144, not the draft's historical 0138.
  Main wins wherever the older draft differs. No reliance on ENT branch work.
- Read AGENTS.md. Checked the cited plan passages against the on-disk plan and
  `git diff origin/main -- BUILD_PLAN.md AGENTS.md` (empty): C3 at :113,
  CH-2 at :463, standing notice :1444, shadow isolation :1473–1477, privacy
  :1559 onward, Test O in §10.2.11, SV-7 :1901–1922, CH-4 :1953 onward,
  ready rule :3302 and dispatch row :3439. The full documents have no task diff.
  Ledger amendments remain dispatcher-owned. Main is later than draft inspection.
- No PR before CH-4 merges; dispatcher catch-up and independent exact-commit
  verdict/acceptance remain necessary. Shared registration files serialize with
  CH-4 and other pieces. No builder edit to BUILD_PLAN.md.

This builds strict synthetic schemas, immutable exact original/provenance side
storage, authorized persisted GET reads, separately labelled fictional-customer
and actual tester attribution, exact fixture observations and an additive existing
worker reader. No intake routine, writer repository method, POST or mutation
registration is installed. No CH-4 diary event linkage is guessed.

BEN-ANSWERS-20261013.md, card
`jobguard-twenty-product-decisions-2026-10-13`, answer 20 (SV-7A Q4):

> Allow named fictional roles; record who actually acted.

The independent representation/read fixtures implement that settled principle.
The fictional label is not authentication, authorization, customer approval or
a replacement for the actual actor. The separate tester remains the immutable
membership reference. Authentication/session binding/provisioning/exact creation
permissions and the entire message creation path stay HELD.

Answer 1 (SV-7A Q8), same source/card:

> Keep real use off until those promises are approved.

Real customer information stays OFF. No privacy, safety, retention, legal,
provider-route, fee or release approval is claimed. The quoted answers were
supplied in the issued order; their private source was not independently opened.
Reviewers need no access to jg-orders to understand the bounded settlement here.

## STOPs and outstanding obligations

**Q3 — whole executable diary sub-part HELD.** The strict diary contract accepts
both `onSite=true` and `false`. Exposing its routine/transport would have to choose
permission/refusal for locked off-site entries. The order explicitly forbids
choosing that policy and permits holding the whole executable sub-part.
`docs/contracts/job-work-state-v1.md:39–42` holds lifecycle permissions and says
no such command routine/route exists. `packages/db/migrations/0144_job_work_state.sql:189–204`
validates photo/delivery/goods/extra/stage sources; it supplies no diary checked
adapter. No diary event linkage, receipt, audit or executable redirect is built.
The CH-4 established redirect remains unchanged, as does watchdog's 409 schema.
Future source mutation keys remain `watchdog_live_only`; none are registered now.
Storage insert guards constrain privileged fixtures; they grant no new intake
permission and add no post-lock intake policy. Independent pre-lock storage,
reads and observations are built. Q3-dependent runtime acceptance is unbuilt.

**Q4 — customer-message execution HELD.** No
`app.record_customer_message_source`, helper bypass, EXECUTE grant, creation
method, POST, principal selection or OpenAPI mutation. Named-fictional-role
fixture/storage/read evidence cannot substitute for runtime intake evidence.

**Q2 — coordinator catalogue prerequisite BLOCKING.** No merged test was edited.
The exact six proposed additive rows in `packages/db/test/tenancy.integration.test.ts`
are below. Each “before” is the current line to retain, “after” adds one row before
it, in name order. The coordinator owns these changes; this builder stopped here.

| Current line | Before (retain) | Add immediately before it |
| --- | --- | --- |
| 222 | `{ relname: "customer_payment", relrowsecurity: true, relforcerowsecurity: true, guarded: true },` | `{ relname: "customer_message_source", relrowsecurity: true, relforcerowsecurity: true, guarded: true },` |
| 268 | `{ relname: "job_finding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },` | `{ relname: "job_diary_entry", relrowsecurity: true, relforcerowsecurity: true, guarded: true },` |
| 275 | `{ relname: "job_work_state_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },` | `{ relname: "job_source_original", relrowsecurity: true, relforcerowsecurity: true, guarded: true },` |
| 467 | `{ relname: "customer_payment", owner: "jobguard_migration" },` | `{ relname: "customer_message_source", owner: "jobguard_migration" },` |
| 513 | `{ relname: "job_finding", owner: "jobguard_migration" },` | `{ relname: "job_diary_entry", owner: "jobguard_migration" },` |
| 520 | `{ relname: "job_work_state_event", owner: "jobguard_migration" },` | `{ relname: "job_source_original", owner: "jobguard_migration" },` |

Line numbers are from the issued CH-4 HEAD; main lacks CH-4's pending rows.
Coordinator must apply against the actual landing tree. No changed pinned value,
assertion removal or self-issued lane widening.

Q1 UI/pages/browser dictation are parked. Q5 full Test O remains outstanding,
and SV7A-19's actual diary-intake source segment is HELD with Q3. The new fixture
worker/sink proof is expressly labelled and is not that intake journey. Q8 real
use/providers/connectors/policy/fees stay OFF; ENT-10e remains outside the lane.
Q6 is resolved to 0149 by the header; landing renumber is dispatcher-owned.
LATER: implement the parked diary/customer-message pages in their issued UI lane.

## New grants and standard F

No new direct INSERT/UPDATE/DELETE/TRUNCATE grant to the application login on
any table, including money/membership/authorization/receipt/audit families.
All three new tables give runtime SELECT at most. No existing grant is changed.
No new business-table grant to shadow, infrastructure or emergency-access roles.
The installed SECURITY DEFINER routine is a read and independently rechecks
persisted session, membership, tenant and job ownership; both intake routines
remain absent. All private trigger functions have execution revoked from runtime,
PUBLIC and other business roles. Migration grant lines, one per new GRANT:

```sql
GRANT SELECT ON app.job_diary_entry TO jobguard_runtime;
GRANT SELECT ON app.customer_message_source TO jobguard_runtime;
GRANT SELECT ON app.job_source_original TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.read_job_sources(uuid,uuid,text,text) TO jobguard_runtime;
```

## Test-first evidence and executed commands

All five test files with local executed assertions were written before their
corresponding implementation. All five PostgreSQL test suites and their fixture
were written before DDL/repository/reader implementation. The core first failing
run failed module resolution, 0 executed assertions; application/controller first
run failed missing built workspace package entry points, 0 executed assertions.
Next tests were written first but their first run was after initial implementation.
A later added shared-error-mapping assertion failed in both Next files before
its corrective handler change (2 failed / 6 passed), then passed (8 / 8). No
pre-implementation failing run for the initial Next handlers is claimed. PostgreSQL red runs NOT RUN.
No skips/placeholders count as acceptance. No run was a live integration.

The installed global pnpm launcher was v11 and stalled before Vitest/version
output. Four interrupted launcher attempts exited 130. A temporary executable
`/private/tmp/jg-sv7a-bin/pnpm` invokes the already cached pinned
`/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. No download.
For all later pnpm commands the prefix was:

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
export PATH="/private/tmp/jg-sv7a-bin:$PATH"
```

| Exact verification command | Exit / result |
| --- | --- |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-sources.test.ts` (global launcher) | 130, interrupted stall, no Vitest results |
| `npm_config_manage_package_manager_versions=false pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-sources.test.ts` | 130, same stall, no results |
| `pnpm --manage-package-manager-versions=false --version` | 130, same stall |
| `pnpm --config.manage-package-manager-versions=false --version` | 130, same stall |
| `./node_modules/.bin/vitest run --maxWorkers=2 src/job-sources.test.ts` (cwd packages/core) | 1, 1 failed suite, 0 assertions: absent job-sources module; recorded red |
| `pnpm --version` (cached pinned launcher) | 0, 10.28.1 |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/job-source.application.test.ts src/job-source.controller.test.ts` (first run) | 1, 2 failed suites, 0 assertions: absent built core/db package entries |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-sources.test.ts` | 0, 1 file / 5 tests passed |
| `pnpm exec turbo run build --filter=@jobguard/core --filter=@jobguard/db --filter=@jobguard/storage --filter=@jobguard/config --filter=@jobguard/ai --filter=@jobguard/api --concurrency=2 --force` | 0, 6 successful tasks, 0 cached; IO permission warnings |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/job-source.application.test.ts src/job-source.controller.test.ts` (after implementation/build) | 0, 2 files / 7 tests passed |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/jobs/[id]/diary/route.test.ts' 'app/api/jobs/[id]/customer-messages/route.test.ts'` | 0, 2 files / 6 tests passed |
| `~/.local/bin/heavy-slot sv-7a pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/job-sources.integration.test.ts test/job-sources-authority.integration.test.ts test/job-sources-evidence.integration.test.ts` | 130; gate system/process inspection denied, interrupted; Vitest banner only, no database assertions completed |
| `pnpm --filter @jobguard/api openapi:generate` | 1; tsx IPC listen EPERM; generated artifact unchanged |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1; lists inherited CH-4 files outside SV-7A lane; no lane widening or alternative base |
| `node tools/core-purity-lint.mjs` | 0, 162 TypeScript files |
| `node tools/money-arithmetic-lint.mjs` | 0 |
| `node tools/commercial-boundary-lint.mjs` | 0 |

Final forced typecheck/lint/build results and evidence inventory are appended
below when the running checks complete. Source inspection/read/write commands
were `pwd`, `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/main`,
`git rev-parse --abbrev-ref HEAD`, `git diff origin/main -- BUILD_PLAN.md AGENTS.md`,
`git diff origin/main HEAD --name-only`, `git diff HEAD -- ...`, `git diff --check`,
`git diff --stat HEAD`, `rg`/`rg --files`, `cat`, `head`, `tail`, `sed`, `nl`,
`which pnpm`, `ls`, `node --version`, and `python3` heredocs creating/editing only
lane files. Successful file-edit commands exited 0. Inspection batches with
nonexistent guessed filenames reported “No such file or directory” / “no matches
found” and were corrected by `rg --files`; no code authority was inferred from
those failed reads. `ps -axo pid,etime,command | rg 'pnpm|vitest' | head -15`
reported `zsh:1: operation not permitted: ps`; process inspection stopped and was
not attempted through another route. `mkdir`/`cat`/`chmod` created only the new
private temporary pinned-launcher script. No git write or deletion command.

Before each heavy command `memory_pressure | tail -1` reported 60–66% free,
above 35%; `df -g /System/Volumes/Data` reported 46–48 GB available, above 45 GB.
Both commands exited 0 in each recorded check. Builds/tests were sequential,
Vitest at maxWorkers=2 and at most three explicitly named files per invocation.
No whole-package/repository test suite was invoked. Forced checks bypass cache;
cache IO warnings were not called a cache hit or a successful cache write.

## NOT RUN / blocked runs

- `job-sources.integration.test.ts`, `job-sources-authority.integration.test.ts`,
  `job-sources-evidence.integration.test.ts`: NOT RUN (cannot start PostgreSQL
  here; shared gate denied inspection and run was interrupted without results).
- `job-sources-isolation.integration.test.ts`, `job-sources-upgrade.integration.test.ts`:
  NOT RUN (same PostgreSQL/shared-gate restriction; no alternate execution route).
- `pnpm openapi:check`: NOT RUN after generator's tsx IPC listen EPERM. Dispatcher
  must generate and check in the permitted environment; no hand-edit or fallback.
- `pnpm lint` / `pnpm lint:lanes`: root/lane acceptance blocked by the recorded
  inherited CH-4 lane failure. No alternate base/harness/pin changes.
- All unchanged auth/context, watchdog, contractor six-property, evidence,
  shadow, final-lock and migration regressions: NOT RUN, addendum permits only
  this piece's local test files. The coordinator/CI must run them unchanged.
- `job-work-state*.integration.test.ts` (CH-4 files: integration, sources,
  post-lock, races, catalog, upgrade), `job-work-state-syntax.test.ts`, core
  `job-work-state.test.ts`, API work-state application/controller/http/isolation
  suites: NOT RUN, unchanged prerequisite suites are coordinator/CI-owned.
- Existing SV-3/SV-4 Playwright mobile-360 and desktop journeys: NOT RUN (cannot
  start a browser here, UI parked). No new UI/browser journey implemented.
- Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, applicable `pnpm eval`:
  NOT RUN (addendum forbids broad local runs; dispatcher must batch real suites).
  No prompt/model change or live-model invocation. Fixture decoder evaluation
  still needs dispatcher evidence, and is not an approved-region live run.
- Clean install, live data/provider tests, restore rehearsal, independent verdict,
  technical acceptance and release approval: NOT RUN / absent.

## Acceptance allocation (no builder acceptance)

| ID | Implemented evidence / retained hold |
| --- | --- |
| SV7A-01 | 5 executed core contract tests include strict typed/dictated/message shapes, limits/authority-field refusal and Q4 attribution. Executable intake HELD. |
| SV7A-02 | Core constant notice/strict response and scripted application/adapter tests executed. Persisted SQL read assertions written, NOT RUN; intake result HELD. |
| SV7A-03 | Labelled fixture storage/restart/read assertion written, NOT RUN. Both runtime routine-intake portions HELD. |
| SV7A-04 | Exact text byte/hash/version/time persistence/mapping test written, NOT RUN; runtime intake HELD. |
| SV7A-05 | Changed bytes/hash/version, pending upload, missing original and invalidation rolled-back controls written, NOT RUN. |
| SV7A-06 | Unchanged observation.v1, exact citations and unknown edited-text omission tests written, NOT RUN. |
| SV7A-07 | Read authority-first unit tests executed; SQL session/job/copy/revocation tests written, NOT RUN. Intake authority variants HELD. |
| SV7A-08 | Read routine direct-invocation refusal written, NOT RUN; intake wait/revocation/concurrency HELD. |
| SV7A-09 | Privileged fixture storage not-live refusal assertions written, NOT RUN; actual intake/same-ID activation journey HELD. |
| SV7A-10 | Command/lifecycle concurrency and CH-4 adapter HELD with executable intake. |
| SV7A-11 | Command replay/change-conflict/restart identity HELD with executable intake. No disguised watchdog command. |
| SV7A-12 | Concurrent retry/event/audit/no-op identities HELD with executable intake. |
| SV7A-13 | Actual on-site/off-site/message intake/event linkage HELD; no guessed adapter. |
| SV7A-14 | Post-lock intake authority HELD; whole diary execution held, no new policy/redirect transport. Existing CH-4 unchanged. |
| SV7A-15 | Intake event/receipt/audit transaction failure/race assertions HELD. Storage deferred exact binding only built. |
| SV7A-16 | Ownership/RLS/read/write denial and tuple/immutability fixtures written, NOT RUN. No runtime write grants. |
| SV7A-17 | Scripted read boundary tests executed; SQL shadow denial/role/grant checks written, NOT RUN. No detector in builder routes. Intake held. |
| SV7A-18 | Identical scripted GET bodies/headers/call sequence executed; transaction-local SQL sequence/zero-held comparison written, NOT RUN. Intake results held. |
| SV7A-19 | Labelled fixture observation → existing worker/sink proof written, NOT RUN; actual diary intake Test O segment HELD, full Test O outstanding. |
| SV7A-20 | Unchanged capture matcher draft/rejected/withdrawn assertions and repeated worker source coalescing written, NOT RUN. |
| SV7A-21 | Server mode and no intake detection scripted tests executed; fixture accepted-terms/worker evidence written, NOT RUN. Intake boundary held. |
| SV7A-22 | GET contract realExternalActions=0, no source writer/outbound/commercial code; scripted real-mode refusal executed. Source-save commercial-effect test remains held. |
| SV7A-23 | 7 API + 8 Next boundary tests executed. Shared GET application built. Actual read-after-write/HTTP server/intake and malformed POST JSON HELD. |
| SV7A-24 | Read application forwarding tests executed; persisted post-live reads/authority assertions written, NOT RUN. |
| SV7A-25 | Own-step migration + unchanged canonical row/type/PK utilities, grants/routine own-step snapshot, later twice and comparator controls written, NOT RUN. |
| SV7A-26 | Mandatory unchanged/full/browser suites NOT RUN. Q2 catalogue and CH-4 merge/lane integration BLOCKING. |
| SV7A-27 | Receipt distinguishes source inspection, execution, unbuilt/held assertions, absent independent verdict and separate acceptance. Full card remains open. |

## Builder source self-check (not an independent verdict)

Source inspection found and corrected a generic trigger's reference to a field
absent on the originals table by separating its actor-check branch. New test
controls use genuine whole contexts and unchanged upgrade helpers, not new
context constructors or shared fingerprints. Routine/code checks use original
byte identity and UTC microseconds, never normalized text or Date timestamps.
Runtime SELECT only, no new source POST, no read of shadow, no detection enqueue,
no existing commercial/auth/test file changed by this task. New application
instances carry no cached context. No business write/audit lock path is installed.
Q3 separation was not invented: whole execution was held as the order permits.
The PostgreSQL fixtures prove structure/read/mapping when run; they never grant
runtime creation authority. Unrun PostgreSQL assertions are a HOLD, not a pass.


## Final verification results and lane evidence

`pnpm exec turbo run typecheck --concurrency=2 --force`: exit 0; 7 successful
tasks, 0 cached. Uses `--force` and actual executions, with cache IO permission
warnings. Forced compiler lint and final build results will be appended.

Read-only independent path inventory (`python3` + git diff/ls-files): exit 0, all
current SV-7A working changes are in the exact lane allowlist. This is a path
inventory, not a replacement pass for the failed mandated origin/main lane gate.
It does not change the checker or its base. `git diff --check`: exit 0.

Current `git diff --stat HEAD` (tracked changes only; new files below):

```text
 apps/api/src/app.module.ts                   |  3 ++-
 apps/api/src/workspace/application.ts        |  3 ++-
 apps/api/src/workspace/index.ts              |  4 ++++
 config/agent-lane-assignments.json           |  1 +
 packages/core/src/index.ts                   |  2 ++
 packages/db/MIGRATIONS.md                    | 14 ++++++++++++++
 packages/db/src/index.ts                     |  4 ++++
 packages/db/src/migrate.ts                   |  1 +
 packages/db/src/shadow-observation-reader.ts |  5 +++++
 9 files changed, 35 insertions(+), 2 deletions(-)
```

SHA-256 of each task file except this receipt (self-hash excluded):

| Path | SHA-256 |
| --- | --- |
| `apps/api/src/app.module.ts` | `e07870ecc3db7084578680bb76878dbf3466f2302ed92a5d75c6cfc5abda70ea` |
| `apps/api/src/job-source.application.test.ts` | `4cd3ac56543a1adb3093e95a0ab432a3d6507f7147df6e287fde7f7f1ca62bb2` |
| `apps/api/src/job-source.application.ts` | `5f42cc115980328465d0ead212b20e6259e91981452c1db307773e1823bb9228` |
| `apps/api/src/job-source.contracts.ts` | `44ee1651d9757ed0258488e09fd68d9d548280058e3e050c79cc8bb1498b2bfb` |
| `apps/api/src/job-source.controller.test.ts` | `099fd0add286c7f70fb7ff3a24e0bdc6d58bfa87ae8216f52db82c8049b5ee34` |
| `apps/api/src/job-source.controller.ts` | `8b3f101bae863a58287324a027097dbe1bebc9f8f445503d378c40b7ee399111` |
| `apps/api/src/job-source.errors.ts` | `7efbf6307584e8c340d17d294049664f8113db11e1f7b7ee336622974c285f04` |
| `apps/api/src/workspace/application.ts` | `9a175195dd5175e889cbf148247c14fd3dd7c03c6e5e4cffdd5bbc7866a1334f` |
| `apps/api/src/workspace/index.ts` | `fa03023f69b7ca6cc738ef6bd9cca899ed002d5fed1a393c302737068632793f` |
| `apps/web/app/api/jobs/[id]/customer-messages/route.test.ts` | `72e3b9fc2ec9672e1e2419d963566f1d4c097da8122c81bf1a512ca2ec9eb124` |
| `apps/web/app/api/jobs/[id]/customer-messages/route.ts` | `689cead45be98c11cfe5aafc5ed202a11ede83553828b50229d2b0e252cd4a75` |
| `apps/web/app/api/jobs/[id]/diary/route.test.ts` | `030a5c29e7cab1253ca9dcedbb8fc1c0a84a5bc5f4f7c055557d61d1b83bcde8` |
| `apps/web/app/api/jobs/[id]/diary/route.ts` | `c6e370db9e6d6ab2c24df5a55933020350637b5fc0f1ded162179038cdb37848` |
| `config/agent-lane-assignments.json` | `0e79c996701fe8901765d4b3722db1af8b7625aff74d38dc487933d77838bc08` |
| `docs/contracts/job-sources-v1.md` | `e40b064cabc7b3c84fc32adbb73d52c59bce674c6a14c17558a218f1bc78720f` |
| `docs/operations/job-sources-data-flow.md` | `04b644b83a1177fc6553ae13f7a758dc644e2a924f3660f39b43fe570c5505e5` |
| `packages/core/src/index.ts` | `446f717d4d8844839f0e9678bbfd836382fb8abfd3c5aed86c82f32e94666c8b` |
| `packages/core/src/job-sources.test.ts` | `425ac5d6575d5d5c8da9114be8a3b6eb1dab621164b47ac117ac225f3ead4944` |
| `packages/core/src/job-sources.ts` | `a0eea9665c3f6c6bfbcc0762e162c2a98ba636dcd8ee189c2f81bf141f7a9afe` |
| `packages/db/MIGRATIONS.md` | `df99f06aa13cea6ec8ca5cad531754c9c416bcb85ebc091e5f761b19c0bc8aa4` |
| `packages/db/migrations/0149_job_sources.sql` | `35af8b9753072e2fba9250ffbb2e0b423b4467febc421b951ad0b2b284156900` |
| `packages/db/src/index.ts` | `d0f6eaf04d5afea329bf24be0df5c624b7a0efe4ebb877cfe44f5aa4eb2adf1a` |
| `packages/db/src/job-source-fixtures.ts` | `82390a6c331dc2680da5b0ae9466ed4cedd19a733bf3055a05214ff39d5e86ab` |
| `packages/db/src/job-source-observation-reader.ts` | `e640b66ec88d4005e3bcf75646f87edac59ca2c5e17d6b57b256c78d2119d344` |
| `packages/db/src/job-source-repository.ts` | `578d61dba62f3f0823cab9c16fead5a7166d48a82e4975b28599ddd59280be87` |
| `packages/db/src/migrate.ts` | `35200533d714f300bf7b137d2510fbfb30e9a3c2e80191dafc05eefdec7cc085` |
| `packages/db/src/shadow-observation-reader.ts` | `a5b2c3b07e305051777947195943911230c0b9a250df61ffaa2d7fb91ec0b93f` |
| `packages/db/test/job-sources-authority.integration.test.ts` | `427061dab39a75c896a8bde15af71ff5fb470f734b4498156d35e54bd9c79365` |
| `packages/db/test/job-sources-evidence.integration.test.ts` | `079c24192eb9234c2c4c4b1475b7ff18c7f4fddb242732e9ba8f17467f749695` |
| `packages/db/test/job-sources-fixture.ts` | `a4c22662e2da0ab5df511d22d8b2552a4367fbce2e1a7cf870252f0bbdfe9aa6` |
| `packages/db/test/job-sources-isolation.integration.test.ts` | `30be7e1623d9682ba36d305e3ef51c40177d7cec3029aa7b9cb004472f82ffcd` |
| `packages/db/test/job-sources-upgrade.integration.test.ts` | `ebb3498a9c45f3ca5848631273c49681260c9b9d43a91f294b64793a2c6b659d` |
| `packages/db/test/job-sources.integration.test.ts` | `9ff8e59cd94a4be21fd304ac103a5f6c6d0ef42085ea0a6bb93a1e6200af9376` |

No task changes to existing test/pin/auth/CH-4/UI files outside the lane. Source
inspection compares the inherited CH-4 files to HEAD separately from the task
diff; the origin/main checker quite correctly includes that prerequisite branch
while it is unmerged. No files were edited to hide that inherited diff.

Final HEAD (no commit was made): `f93716da170f1ba10a98abe1e17f57dd169f8cc2`. Dispatcher must commit the
working changes and bind any independent verdict to that resulting exact commit.

Protected/inherited reference evidence (not new permanent fingerprints):

| File | SHA-256 (same as HEAD) |
| --- | --- |
| `apps/api/src/auth/context-boundary.test.ts` | `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35` |
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` |
| `packages/db/src/tenant-context.ts` | `9237013c368deeec3d14098b030264dbd6cc3e57534e4cbc237cad06aa2b4b0f` |
| `packages/core/src/watchdog.ts` | `1628a2c3dc2d24cdb20c11ded7461a9206af9e71f918bff571ba51e66cf9aaf7` |
| `packages/db/test/watchdog-command-harness.ts` | `3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6` |
| `packages/db/test/command-replay-contract.integration.test.ts` | `db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f` |
| `packages/db/test/tenancy.integration.test.ts` | `3ce02135b6a36425844678799fc84598ab92869d022add83abfca609b8b6ed02` |
| `packages/db/migrations/0144_job_work_state.sql` | `51f8cce888ae8e9da2ed0e6bc938d1795313ec5df1d30bf9848877ede190bf19` |
| `apps/api/openapi.json` | `23b6338d1de18155090cbcce3385fb83ffdc64b0b58b0140b9751701c8ccb085` |

Exact refused operations (no escalation or alternate route):

```text
ps -axo pid,etime,command | rg 'pnpm|vitest' | head -15
zsh:1: operation not permitted: ps

~/.local/bin/heavy-slot sv-7a pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/job-sources.integration.test.ts test/job-sources-authority.integration.test.ts test/job-sources-evidence.integration.test.ts
sysctl: sysctl fmt -1 1024 1: Operation not permitted
sysmon request failed with error: sysmond service not found
pgrep: Cannot get process list
Interrupted, exit 130; no PostgreSQL assertion result.

pnpm --filter @jobguard/api openapi:generate
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/20334.pipe
Exit status 1.
```

No automatic approval-review rejection occurred and no escalated permission was
requested. The above are operating-system sandbox refusals, not human approvals.

Origin/main lane refusal (exit 1, exact paths):

```text
"apps/api/src/job-work-state.application.test.ts"
"apps/api/src/job-work-state.application.ts"
"apps/api/src/job-work-state.contracts.ts"
"apps/api/src/job-work-state.controller.test.ts"
"apps/api/src/job-work-state.controller.ts"
"apps/api/src/job-work-state.errors.ts"
"apps/api/src/job-work-state.http.test.ts"
"apps/api/src/job-work-state.isolation.test.ts"
"apps/api/src/proof/proof.application.ts"
"apps/api/src/variation/variation.controller.ts"
"apps/web/app/api/jobs/[id]/proof/route.ts"
"apps/web/app/api/jobs/[id]/purchase-orders/placement/route.ts"
"apps/web/app/api/jobs/[id]/purchase-orders/revisions/route.ts"
"apps/web/app/api/jobs/[id]/supplier-documents/intake/route.ts"
"apps/web/app/api/jobs/[id]/variations/route.ts"
"apps/web/app/api/jobs/[id]/work-state/route.ts"
"docs/contracts/job-work-state-v1.md"
"docs/verdicts/CH-4/BUILDER_RECEIPT.md"
"packages/core/src/job-work-state.test.ts"
"packages/core/src/job-work-state.ts"
"packages/db/migrations/0144_job_work_state.sql"
"packages/db/src/evidence.ts"
"packages/db/src/job-work-state-repository.ts"
"packages/db/src/job-work-state-sources.ts"
"packages/db/src/proof-repository.ts"
"packages/db/src/purchase-order-repository.ts"
"packages/db/src/supplier-document-repository.ts"
"packages/db/src/variation-repository.ts"
"packages/db/test/job-work-state-catalog.integration.test.ts"
"packages/db/test/job-work-state-fixtures.ts"
"packages/db/test/job-work-state-post-lock.integration.test.ts"
"packages/db/test/job-work-state-races.integration.test.ts"
"packages/db/test/job-work-state-sources.integration.test.ts"
"packages/db/test/job-work-state-syntax.test.ts"
"packages/db/test/job-work-state-upgrade.integration.test.ts"
"packages/db/test/job-work-state.integration.test.ts"
"packages/db/test/tenancy.integration.test.ts"
```

These paths all belong to the issued CH-4 ancestor; this task left their HEAD
bytes unchanged. Coordinator resolution is to land CH-4 and perform the issued
catch-up, not to broaden SV-7A's lane or change the pinned checker.

Additional verification after the initial force checks:

| Exact command | Exit / result |
| --- | --- |
| `pnpm exec turbo run lint --concurrency=2 --force` | 0; 7 successful tasks, 0 cached; compiler lint only, origin/main lane gate remains failed |
| `node /private/tmp/jg-sv7a-check-tests.mjs packages/db/test/job-sources.integration.test.ts packages/db/test/job-sources-authority.integration.test.ts packages/db/test/job-sources-evidence.integration.test.ts` (first run) | 1; 2 TS2345 errors in new fixtures: string versus Node UUID template type, at own authority :32 / evidence :21; not a database run |
| same 3-file semantic check after own fixture fixes | 0; 3 files typechecked; no PostgreSQL execution |
| `node /private/tmp/jg-sv7a-check-tests.mjs packages/db/test/job-sources-isolation.integration.test.ts packages/db/test/job-sources-upgrade.integration.test.ts packages/db/test/job-sources-fixture.ts` | 0; 3 files typechecked; no PostgreSQL execution |
| same two-file Next Vitest command with added SV7A-23 mapping assertions (before handler fix) | 1; 2 failed, 6 passed; found bypass of shared mapping by the generic practice failure branch |
| same two-file Next Vitest command after own handler fix | 0; 2 files / 8 tests passed |

The temporary semantic-check script uses installed TypeScript and the repository's
compiler options with only the named new test roots and `noEmit`; it does not
start a database, remove a test or alter shared configuration. The UUID type
fixes are confined to new lane fixtures; no merged fixture/harness was changed.
Final Next caught-read errors now use the same `jobSourceFailure` mapping as
Nest. The added failure-mapping tests preceded that correction. The force checks
are repeated only because those new routing changes followed the earlier runs.

Additional CH-4 prerequisite detail: `0144_job_work_state.sql:8` currently reads
`source_kind text NOT NULL CHECK(source_kind IN('photo','delivery_note','goods_receipt','builder_extra','stage_completion')),`. There is no issued diary discriminator,
tuple or checked adapter. No after-line is guessed: the coordinator must supply
the reviewed diary interface when Q3 permits execution. This builder changes
neither that list nor its existing tests.

Temporary file commands: `cat > /private/tmp/jg-sv7a-check-tests.mjs` and
`python3` writing `/private/tmp/jg-msg-sv-7a.txt` both exited 0. The intended
commit message has been read back with `cat` (exit 0). `git diff HEAD --numstat`,
`git diff --check`, `git status --short`, `wc -l`, and the receipt SHA/path
`python3` inventory commands exited 0. The inventory reports 34 changed/new
paths, each in the issued exact allowlist. No task-created source file is outside
the lane. Receipt updates and late hash refresh commands exited 0.

The final check repeat follows the added SV7A-23 handler correction, not a cache
hit or an attempt to alter the refused origin/main lane check. Compiler lint and
root security/lane lint are recorded as different checks.

Final source-snapshot compiler check after the Next mapping fix:
`pnpm exec turbo run typecheck lint --concurrency=2 --force`: exit 0,
14 successful tasks, 0 cached (7 typecheck + 7 compiler lint). Cache bypass
actually executed every task. Earlier runs were repeated because of the new
mapper correction. Root lane/security acceptance remains blocked as documented.
Locally executed final unit/adapter result is 20 passed tests across 5 files:
5 core, 7 API, 8 Next. This is not PostgreSQL/browser or independent acceptance.

Final forced build: `pnpm build --concurrency=2 --force`, exit 0;
7 successful tasks, 0 cached. Next.js compiled both read routes and generated
31 static pages; this is compilation/prerender evidence, not a browser journey.
Warnings were recorded: turbo cache IO permission warnings, existing multiple
lockfile tracing-root inference, existing CSS `end`/autoprefixer warnings, and
Nest's file-type/load-esm dependency warnings traced through inherited CH-4
`job-work-state.errors.js`. No unrelated config, CSS, dependency or CH-4 file
was changed to silence them. No OpenAPI generation pass is inferred from build.
Final disk check: 46 GB free (>45 GB); memory free 66% (>35%).

Final `git diff --check` and exact path inventory both exited 0: 34 changed/new
files in the issued lane; no generated build file appeared in the task diff.
HEAD remains `f93716da170f1ba10a98abe1e17f57dd169f8cc2`; origin/main remains
`e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4`. No git write was performed.

The final three-file PostgreSQL test-source semantic check was repeated after
the labelled fixture gained a dictated-text mode parameter: exit 0, all three
new integration/authority/evidence roots typechecked. No database execution.
All six new PostgreSQL fixture/test sources have semantic-check evidence.
The final receipt SHA refresh and final diff/path checks exited 0.

Delivery is partial and the full SV-7A card remains open. Independent verdict,
separate acceptance, CH-4 landing/catch-up, catalogue coverage, PostgreSQL/full
regressions, OpenAPI generation/check, UI and full Test O remain outstanding.
No release or real customer processing is authorized by this receipt.


# Current final check evidence (15 October 2026)

- `pnpm exec turbo run typecheck --concurrency=2 --force`: exit 0, 7 successful tasks, **0 cached**.
- `pnpm exec turbo run lint --concurrency=2 --force`: exit 0, 7 successful tasks, **0 cached** (compiler lint).
- `LANE_BASE_REF=origin/main node tools/lint.mjs`: exit 1; core purity passed (169 TypeScript files); root lint stops at lane boundary.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 1, same lane refusal. Full logs at `/private/tmp/jg-sv7a-root-lint.log` and `/private/tmp/jg-sv7a-lane-lint.log`. No checker/base/allowlist widening. The in-progress merge index includes incoming main changes and old 0149; dispatcher staging/merge completion is needed before the mandated checker can assess the final tree.
- `pnpm --filter @jobguard/api openapi:generate`: exit 1; exact sandbox refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/2702.pipe`. Stopped that item; no alternate generator or hand edit. `pnpm openapi:check` NOT RUN: same tsx launcher is blocked. Dispatcher must generate and check the two new GET operations. Existing OpenAPI stays byte-identical to main, so **new routes are not yet represented in the generated document**.
- Temporary pinned launcher creation (`mkdir -p`, here-document write, `chmod +x`), all `apply_patch` edits, temporary patch construction, source/docs/receipt updates and intended-commit-message write/readback: exit 0.
- Read-only `git diff origin/main --name-status/--stat/--numstat`, protected SHA-256 checks and path inventory: exit 0. The source-inspection `ls` reported absent `$HOME/Library/pnpm/pnpm` (not a write/permission refusal); its compound read command exited 0.

No automatic approval-review rejection occurred. The tsx refusal is an operating-system sandbox denial. No escalated or alternate attempt was made.

Unchanged protected/current-main evidence (receipt hashes only, no permanent tests pinning shared bytes):

| File | SHA-256, identical to origin/main |
| --- | --- |
| `AGENTS.md` | `ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1` |
| `BUILD_PLAN.md` | `d8793fa7c3112ca2d07d8976d5823546fcbf681c1f152cd2cc2a04e128aae2d5` |
| `apps/api/src/auth/context-boundary.test.ts` | `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35` |
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` |
| `packages/db/src/tenant-context.ts` | `9237013c368deeec3d14098b030264dbd6cc3e57534e4cbc237cad06aa2b4b0f` |
| `packages/core/src/watchdog.ts` | `a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca` |
| `packages/db/test/watchdog-command-harness.ts` | `3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6` |
| `packages/db/test/command-replay-contract.integration.test.ts` | `db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f` |
| `packages/db/test/tenancy.integration.test.ts` | `8d392724e3796dcb6ba656928d54836ff934f1017860cae6f7de623ebb2e7448` |
| `packages/db/migrations/0144_job_work_state.sql` | `4911b23648506a4bb585e4a4d1b50cd92c96345209ee2ae8097ef51c6cf3e94b` |
| `docs/contracts/lp-0-effective-privileges-v1.json` | `f57578bb4f454cbbed54c6d520735d122804f8d091ca48834c97462258ba9861` |
| `packages/db/test/upgrade-proof-utils.ts` | `9c0db8b49cd23bc3bae5dc19bdc9749486bd1869b7d642b37a137d7175b56e49` |
| `apps/api/openapi.json` | `216343758d5f089ad8d73f100632428e67a0cd547e23ef3218db53e11880de40` |


Final forced build: `pnpm build --concurrency=2 --force`, exit 0;
**7 successful tasks, 0 cached**. Next compiled both GET routes and generated
32 static pages. This is compilation/prerender evidence, not a browser journey.
Warnings: turbo cache IO permission warnings, existing multiple-lockfile tracing
root inference, CSS/autoprefixer `end`, Nest file-type/load-esm dependency warnings
through inherited CH-4 imports. No unrelated file was changed to silence warnings.
Final observed resources: 59% memory free, 64 GB disk free.

Final task file SHA-256 inventory (receipt excluded to avoid a self hash):

| File | SHA-256 |
| --- | --- |
| `apps/api/src/app.module.ts` | `e07870ecc3db7084578680bb76878dbf3466f2302ed92a5d75c6cfc5abda70ea` |
| `apps/api/src/job-source.application.test.ts` | `4cd3ac56543a1adb3093e95a0ab432a3d6507f7147df6e287fde7f7f1ca62bb2` |
| `apps/api/src/job-source.application.ts` | `5f42cc115980328465d0ead212b20e6259e91981452c1db307773e1823bb9228` |
| `apps/api/src/job-source.contracts.ts` | `44ee1651d9757ed0258488e09fd68d9d548280058e3e050c79cc8bb1498b2bfb` |
| `apps/api/src/job-source.controller.test.ts` | `099fd0add286c7f70fb7ff3a24e0bdc6d58bfa87ae8216f52db82c8049b5ee34` |
| `apps/api/src/job-source.controller.ts` | `8b3f101bae863a58287324a027097dbe1bebc9f8f445503d378c40b7ee399111` |
| `apps/api/src/job-source.errors.ts` | `7efbf6307584e8c340d17d294049664f8113db11e1f7b7ee336622974c285f04` |
| `apps/api/src/workspace/application.ts` | `4b85157f0beb163c8404fabf4c83cd797fe3d5e3f960bd24cd24bf081452518c` |
| `apps/api/src/workspace/index.ts` | `fa03023f69b7ca6cc738ef6bd9cca899ed002d5fed1a393c302737068632793f` |
| `apps/web/app/api/jobs/[id]/customer-messages/route.test.ts` | `4f9faae8924cb3ce8200f79d871b35cda41561a0d222d034f83187e87fc2e54e` |
| `apps/web/app/api/jobs/[id]/customer-messages/route.ts` | `368ad8fa97784659f6ab85a6f7e42582c1d339f1e36538abbdf966527cdddb4e` |
| `apps/web/app/api/jobs/[id]/diary/route.test.ts` | `a4d93923442350a993e31d5783f62648518693437efec578553f560907d03063` |
| `apps/web/app/api/jobs/[id]/diary/route.ts` | `b175cc8366a250df825b7d830927f170bc6d0605c7b9e968fac59ae6e6d706ca` |
| `config/agent-lane-assignments.json` | `a898fa3dc18900891b128d16203e2ab62923707579675d466d7f87e1e8a51a2b` |
| `docs/contracts/job-sources-v1.md` | `115948968f7ffc633593c13b6acc02b45f8b9ba0db33e1932df2e558cc7aa98c` |
| `docs/operations/job-sources-data-flow.md` | `8ba3231cb37d50abde25a94f2ff97a7d64dbe00796b374c6961d0c3f825b78aa` |
| `packages/core/src/index.ts` | `ddf0d4788d6b51c6492c8264071961008d1450f65b6bcc6b0b3638ed0ec4690a` |
| `packages/core/src/job-sources.test.ts` | `af306087c80d1f47fed4571ea8e7b6dfdc3ab482593b9231a5d7ceacaec0a9f3` |
| `packages/core/src/job-sources.ts` | `8a274fd8ea8d52830422075d5b1bcf55227cd58a053581f742d9afac6a4e2386` |
| `packages/db/MIGRATIONS.md` | `412624735d99a9b137a7349099c2d88bcf07666807961f482f32fdea76d59127` |
| `packages/db/migrations/0164_job_sources.sql` | `4ff1cd94ae485555d86f9289dc650932dac26d729fb4b5f6a372a0bee8cc1c70` |
| `packages/db/src/index.ts` | `6c4f9206f1ae3bb6dc367b323a57a0918159877842789b767551d77609a1f58c` |
| `packages/db/src/job-source-fixtures.ts` | `82390a6c331dc2680da5b0ae9466ed4cedd19a733bf3055a05214ff39d5e86ab` |
| `packages/db/src/job-source-observation-reader.ts` | `e640b66ec88d4005e3bcf75646f87edac59ca2c5e17d6b57b256c78d2119d344` |
| `packages/db/src/job-source-repository.ts` | `578d61dba62f3f0823cab9c16fead5a7166d48a82e4975b28599ddd59280be87` |
| `packages/db/src/migrate.ts` | `61cb0ab5fea41f2834459cb2def32f448481bd2d361bb1ec384a8fcfdbbac337` |
| `packages/db/src/shadow-observation-reader.ts` | `a5b2c3b07e305051777947195943911230c0b9a250df61ffaa2d7fb91ec0b93f` |
| `packages/db/test/job-sources-authority.integration.test.ts` | `cb0960928121530db88048f1accb8f33dc07ff45abc16b7f54a50a280d13b987` |
| `packages/db/test/job-sources-evidence.integration.test.ts` | `079c24192eb9234c2c4c4b1475b7ff18c7f4fddb242732e9ba8f17467f749695` |
| `packages/db/test/job-sources-fixture.ts` | `a4c22662e2da0ab5df511d22d8b2552a4367fbce2e1a7cf870252f0bbdfe9aa6` |
| `packages/db/test/job-sources-isolation.integration.test.ts` | `30be7e1623d9682ba36d305e3ef51c40177d7cec3029aa7b9cb004472f82ffcd` |
| `packages/db/test/job-sources-upgrade.integration.test.ts` | `a9933a2949220b486aed752e7ac09ee5d05dab823a97725002ef2954043e1efd` |
| `packages/db/test/job-sources.integration.test.ts` | `9ff8e59cd94a4be21fd304ac103a5f6c6d0ef42085ea0a6bb93a1e6200af9376` |

Final `git diff origin/main --stat` (tracked comparison; the untracked new migration is listed separately):

```text
 apps/api/src/app.module.ts                         |   3 +-
 apps/api/src/job-source.application.test.ts        |  29 +
 apps/api/src/job-source.application.ts             |  14 +
 apps/api/src/job-source.contracts.ts               |   1 +
 apps/api/src/job-source.controller.test.ts         |  19 +
 apps/api/src/job-source.controller.ts              |  22 +
 apps/api/src/job-source.errors.ts                  |   8 +
 apps/api/src/workspace/application.ts              |   3 +-
 apps/api/src/workspace/index.ts                    |   4 +
 .../api/jobs/[id]/customer-messages/route.test.ts  |  25 +
 .../app/api/jobs/[id]/customer-messages/route.ts   |  16 +
 apps/web/app/api/jobs/[id]/diary/route.test.ts     |  25 +
 apps/web/app/api/jobs/[id]/diary/route.ts          |  16 +
 config/agent-lane-assignments.json                 |   1 +
 docs/contracts/job-sources-v1.md                   | 126 ++++
 docs/operations/job-sources-data-flow.md           |  32 +
 docs/verdicts/SV-7A/BUILDER_RECEIPT.md             | 787 +++++++++++++++++++++
 packages/core/src/index.ts                         |   2 +
 packages/core/src/job-sources.test.ts              |  30 +
 packages/core/src/job-sources.ts                   |  26 +
 packages/db/MIGRATIONS.md                          |  14 +
 packages/db/src/index.ts                           |   4 +
 packages/db/src/job-source-fixtures.ts             |   8 +
 packages/db/src/job-source-observation-reader.ts   |  35 +
 packages/db/src/job-source-repository.ts           |  19 +
 packages/db/src/migrate.ts                         |   1 +
 packages/db/src/shadow-observation-reader.ts       |   5 +
 .../test/job-sources-authority.integration.test.ts |  82 +++
 .../test/job-sources-evidence.integration.test.ts  |  51 ++
 packages/db/test/job-sources-fixture.ts            |  19 +
 .../test/job-sources-isolation.integration.test.ts |  39 +
 .../test/job-sources-upgrade.integration.test.ts   |  32 +
 packages/db/test/job-sources.integration.test.ts   |  25 +
 33 files changed, 1521 insertions(+), 2 deletions(-)
```

`packages/db/migrations/0164_job_sources.sql`: new/untracked, 130 lines; dispatcher must add it. Old 0149 was renamed, not retained as a second migration.

Final read-only path inventory: **34 paths, all in the issued lane**. No task edit to main tests, pins, auth bridges, CH-4, plan, worker composition or UI. No Git writes.

Final HEAD remains `12072ab3e6e8d494b3d8c2c978737968f0f9df59`; origin/main remains `6671538c8d69936c162368c760dd6ce0f7f10493`. Dispatcher must stage the five working-file conflict resolutions, finish the merge and commit this partial slice before any different-model verdict can bind the exact commit. Intended message: `/private/tmp/jg-msg-sv-7a.txt`. Independent verdict and separate acceptance remain absent.

## Repair r1 — 15 October 2026, dispatcher 11

Repair base: PR #222, branch `codex/sandbox/sv-7a`, exact HEAD
`ff8fa3c39920a30731c2d1b07c74f1b91247cd7a`. The working tree was clean at
entry. This section supersedes earlier receipt claims that catalogue additions
were outstanding/coordinator-only: dispatcher 11 explicitly authorizes NEW ROWS
ONLY in the two inventories below. It does not close the remaining SV-7A product
holds or supply independent review/acceptance.

The supplied CI excerpt at
`/Users/benharwood/.local/share/full-steam/jg-runs/d11/sv7a-ci-fail-excerpt.txt`
was read. It reports missing source ownership/SELECT/routine capability entries.
`gh run view --branch ... --log-failed` exited 1 (unsupported flag); the corrected
read-only `gh run list --repo ben2harwood-lgtm/jobguard --branch codex/sandbox/sv-7a --limit 1 --json databaseId,headSha,status,conclusion`
also exited 1 because api.github.com was unreachable. No full-log or real-DB
execution is claimed; the tenancy failure detail absent from the excerpt was
resolved by inspecting its existing ordered catalogues against migration 0164.

### Changes and additions-only inventory

- `packages/db/test/job-sources-fixture.ts`: explicitly cast command-receipt
  UUID arguments (`$1`, `$2`, `$4`) and text arguments (`$2`, `$3`). The reused
  `$2` now has explicit UUID and text uses rather than conflicting inferred
  assignment types. `job-work-state-fixtures.ts` is unchanged.
- `config/agent-lane-assignments.json`: edited with `apply_patch` only; add
  `packages/db/test/tenancy.integration.test.ts` and
  `docs/contracts/lp-0-effective-privileges-v1.json` to this lane, plus its r1
  authorization note. Other lane entries remain unchanged.
- No production code, SQL migration, grant, external action, commercial policy,
  API schema or OpenAPI artifact changed. No migration/backfill/rollback is
  introduced by this repair. Existing synthetic-only/intake/release holds remain.

Every row added to the two merged files is listed here:

| Merged file / collection | Before → after | Exact additions |
| --- | --- | --- |
| `packages/db/test/tenancy.integration.test.ts`, RLS/guard catalogue | 220 → 223 | `customer_message_source`, `job_diary_entry`, `job_source_original`; each `relrowsecurity=true`, `relforcerowsecurity=true`, `guarded=true`, in existing name order |
| Same file, ownership catalogue | 220 → 223 | The same three names, each `owner=jobguard_migration`, in existing name order |
| `docs/contracts/lp-0-effective-privileges-v1.json`, groups | 54 → 55 | `a-sv7a-read-only-authority`: new read-only authority disposition, synthetic read scope, LP-6d/LP-11/LP-12 responsibilities and retained real-data holds |
| Same file, authorityPaths | 32 → 33 | `ap-sv7a-read-only`: new read-only authority path, source/test references and the same responsibilities/holds |
| Same file, entries | 1,127 → 1,135 | The eight keys listed below, all assigned to the new disposition group |
| Same file, recorded.routines | 297 → 300 | `function:app.job_source_insert_guard()`, `function:app.job_source_original_binding()`, `function:app.read_job_sources(uuid,uuid,text,text)` |

Exact eight new capability keys:

```text
acl|rel|table|app.customer_message_source|jobguard_runtime|SELECT|-
acl|rel|table|app.job_diary_entry|jobguard_runtime|SELECT|-
acl|rel|table|app.job_source_original|jobguard_runtime|SELECT|-
acl|routine|function:app.read_job_sources(uuid,uuid,text,text)|jobguard_runtime|EXECUTE|-
owner|rel:table|app.customer_message_source|jobguard_migration
owner|rel:table|app.job_diary_entry|jobguard_migration
owner|rel:table|app.job_source_original|jobguard_migration
owner|routine|function:app.read_job_sources(uuid,uuid,text,text)|jobguard_migration
```

The routine owner is the eighth capability required by `deriveFacts`, alongside
the seven table-owner/table-grant/routine-grant entries named in the order.
The three additional routine protection records are needed by LP0-17's existing
routine-identity completeness assertion, including owner-only trigger functions.
No earlier routine record is changed. New definitionSha256 values:

| New routine | Source-derived SHA-256 |
| --- | --- |
| `app.job_source_insert_guard()` | `52e0a17f9338b210abee374670bc5c2cf6bef47498330e8e44f605cee1e1f3d9` |
| `app.job_source_original_binding()` | `67a6b9a2f532b14f08c85b52f78e54727714e7e3e69d187788ff0fc9483821f9` |
| `app.read_job_sources(uuid,uuid,text,text)` | `db5d1d4963d5033e0a0027559619a60001bbeaef5b0c39dac4c8f3f4d1d2e3e7` |

These new hashes were computed from migration 0164's exact function bodies and
PostgreSQL's `pg_get_functiondef` header format (CREATE OR REPLACE, typed/spaced
arguments, RETURNS, LANGUAGE, SECURITY DEFINER, quoted search_path, `$function$`
body delimiter and trailing newline). As a source-level control, the identical
method reproduced the existing hashes for `ch4_storage_integrity()` and
`ch4_read_work_facts(uuid,uuid,text)` exactly. This is not a PostgreSQL run.
The two trigger helpers have no runtime/PUBLIC EXECUTE and are unreachable;
`read_job_sources` is runtime-executable only, with no static writes and its
existing practice-authentication call recorded. Protection hashes remain
recorded facts, not an implemented LP0-13 comparator.

Preservation command `python3 /private/tmp/sv7a-r1-preservation.py`: exit 0.
It compared the working files to `git show HEAD:<path>`, checked every original
line remains byte-for-byte in order, checked zero removed diff lines, and checked
all original parsed records remain equal. Tenancy: 667 → 673 lines (+6/-0).
LP-0: 2,397 → 2,410 lines (+13/-0). Existing base, target state, holds, gaps,
recorded note, RLS (240), policies (252), triggers (354), entries, groups,
authority paths and all 297 earlier routine records/hashes remain unchanged.
`job-work-state-fixtures.ts` and `apps/api/openapi.json` have no repair diff.
No existing pin/hash/row adjustment was required.

### Commands actually run and results

Existing dependencies only: Node `v24.17.0`, cached pinned pnpm `10.28.1`, Vitest
`4.1.11`. All successful pnpm commands below used
`PATH=/private/tmp/jg-sv7a-bin:$PATH`; its launcher runs the existing cached
`/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` through Node.
No install/download was completed or needed. No browser or PostgreSQL start was
attempted. Every Vitest run used `~/.local/bin/heavy-slot`, `--maxWorkers=2`, and
at most two explicitly named files.

| Command (with pinned PATH above) | Exit / actual result | Log under `/private/tmp/` |
| --- | --- | --- |
| `pnpm typecheck` | 0; 7 successful tasks, 2 cached | `sv7a-r1-typecheck-pinned.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | 0; root lint and 7 package tasks, 2 cached | `sv7a-r1-lint-pinned.log` |
| Same lint after adding the three routine records | 0 | `sv7a-r1-lint-final.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; sv-7a boundary passed | `sv7a-r1-lint-lanes-pinned.log` |
| `~/.local/bin/heavy-slot sv-7a-r1-build pnpm build` | 0; 7 successful tasks, 2 cached | `sv7a-r1-build-pinned.log` |
| `~/.local/bin/heavy-slot sv-7a-r1-db-unit pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lp-0-catalog.test.ts` | 0; 26 tests passed | `sv7a-r1-db-unit-pinned.log` |
| `~/.local/bin/heavy-slot sv-7a-r1-core-unit pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-sources.test.ts` | 0; 6 tests passed | `sv7a-r1-core-unit.log` |
| `~/.local/bin/heavy-slot sv-7a-r1-api-unit pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/job-source.application.test.ts src/job-source.controller.test.ts` | 0 on retry; 7 tests passed | `sv7a-r1-api-unit-retry.log` |
| `~/.local/bin/heavy-slot sv-7a-r1-web-unit pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/jobs/[id]/diary/route.test.ts' 'app/api/jobs/[id]/customer-messages/route.test.ts'` | 0; 8 tests passed, no browser | `sv7a-r1-web-unit.log` |
| `pnpm openapi:check` | 1; tsx CLI IPC listener refused with EPERM before generation check | `sv7a-r1-openapi-pinned.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; same generator/check, no IPC listener; committed artifact unchanged | `sv7a-r1-openapi-node.log` |
| `node /private/tmp/jg-sv7a-check-tests.mjs packages/db/test/job-sources-fixture.ts packages/db/test/tenancy.integration.test.ts` | 0; both test sources typechecked, no database execution | `sv7a-r1-fixture-typecheck.log` |
| `pnpm --filter @jobguard/api exec node --import tsx --input-type=module -e '<loadReviewedInventory + pathCompleteness + repoFileExists validation>'` | 0; actual committed inventory parsed; zero path-completeness problems; 1,135 entries / 55 groups / 33 paths / 300 routine records / 8 new capability entries | `sv7a-r1-inventory-final.log` |
| `python3 /private/tmp/sv7a-r1-preservation.py` | 0; additions only as above | `sv7a-r1-preservation.log` |
| `git diff --check` | 0 | terminal output |

Initial global-shim attempts (`pnpm --version`, typecheck, lint, lint:lanes,
openapi:check, heavy-slot DB unit/build) stalled before check output and were
stopped with exit 130. Cached native-binary version probes eventually returned
10.28.1/exit 0; the Node launcher was used for all useful checks. One pinned
heavy-slot API invocation exited 2 before Vitest started; its retry above passed.
A first inventory validation invoked from the DB workspace exited 1 because
`tsx` is not a dependency there; rerunning from the API workspace passed, both
before and after the routine additions. These attempts establish no test pass.
The slot wrapper printed sandbox sysctl/sysmon/pgrep errors; successful runs
acquired its slots and executed the named commands. Turbo emitted sandbox IO
warnings; task exit codes/results above are the actual reported outcomes.

### CI and review still owed

47 targeted unit tests passed. Real PostgreSQL evidence remains **CI-only**:
`job-sources-evidence.integration.test.ts`, `job-sources-isolation.integration.test.ts`
(including SV7A-17), `tenancy.integration.test.ts`,
`lp-0-grant-freeze.integration.test.ts`, `lp-0-authority-paths.integration.test.ts`,
and mandatory migration/regression coverage must run after dispatcher push.
No assertion of a green database repair run, full-suite pass, browser pass,
independent model verdict or technical acceptance is made here. There is no
AI/prompt/parser/model change requiring a new model evaluation. No new alerts,
release permission or operational authority is introduced. All prior unbuilt
intake/UI/CH-4 integration and real-data release gates remain held.

All changes are left in the working tree. No git write command was run.
The conventional commit subject/body was overwritten at
`/private/tmp/jg-msg-sv-7a.txt`; the dispatcher owns commit/push and exact-commit
independent review/acceptance remains separate.

## Repair r2 — dispatcher 11, 15 October 2026

Repair against PR #222 head `f1706d229726f6ae2fb053515b1461e864be10a0` on
`codex/sandbox/sv-7a`. Read the dispatcher excerpt at
`/Users/benharwood/.local/share/full-steam/jg-runs/d11/sv7a-ci-fail2.txt`,
repository AGENTS, BUILD_PLAN §2.4/SV-7/§12 and the source contract before edits.
Only the three SV-7A integration test files and this receipt change in r2.
Merged tests, production readers, domain binding checks and migrations are unchanged.

### Three failures: before and after

1. **SV7A-16, authority fixture:** the fresh same-tenant wrong-job insert already
   invokes migration 0053's `job_legacy_live_track` trigger. The test then inserted
   the identical commercial-track key explicitly, producing SQLSTATE 23505 before
   the substitution assertions. Keep the distinct job and reuse its trigger-created
   track; remove only the duplicate track INSERT. All wrong-job, version, tenant
   and immutable-mutation assertions remain.
2. **SV7A-18/19, isolation fixture:** four observations reused one evidence ID but
   changed `facts.workReference`. `groupShadowProposals` first finds the observation
   by tenant/job/evidence ID, then checks the derived work ID (tenant/job/scope
   area/work reference), and every evidence tuple's tenant/job/ID/version/SHA-256/
   exact receive time. The second work reference therefore failed at line 53.
   The reader was emitting the correct persisted tuple; no reader change is needed.
   Seed five distinct persisted originals before taking either public-read snapshot.
   They initially describe the same work and coalesce to one survivor. Reuse four
   separate reader-emitted originals for the labelled isolation-only work references,
   keeping each evidence tuple intact. Assert five observations with five unique
   evidence IDs. The existing five-survivor, unchanged diary/message response,
   identical transaction-query-path and no-shadow-query assertions all remain.
3. **SV7A-03/04, restart fixture:** pg 8.16.3 stores `Pool.options.password` as a
   non-enumerable property, so object spread omits it. Explicitly pass
   `password:f.runtime.options.password`, following the existing restart/clone
   pattern in `job-work-state-sources.integration.test.ts:126`. Keep the distinct
   backend PID and fresh repository/application persistence assertions.

### Commands actually run and results

Installed dependencies only: Node `v24.17.0`, pinned cached pnpm `10.28.1`, Vitest
`4.1.11`. No install or download. All pnpm commands below used
`PATH=/private/tmp/jg-sv7a-bin:$PATH`, the existing cached Node launcher from r1.
Vitest invocations used `~/.local/bin/heavy-slot` and two explicitly named files
with `--maxWorkers=2`. Logs are under `/private/tmp/`.

| Command | Exit / actual result | Log |
| --- | --- | --- |
| `pnpm typecheck` | 0; 7 successful tasks, 2 cached | `sv7a-r2-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | 0; root lint and 7 package tasks, 2 cached | `sv7a-r2-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; SV-7A boundary passed | `sv7a-r2-lint-lanes.log` |
| `node /private/tmp/jg-sv7a-check-tests.mjs packages/db/test/job-sources-authority.integration.test.ts packages/db/test/job-sources-isolation.integration.test.ts packages/db/test/job-sources.integration.test.ts` | 0; all three integration test sources typechecked, no database execution | `sv7a-r2-test-typecheck.log` |
| `~/.local/bin/heavy-slot sv-7a-r2-build pnpm build` | 0; 7 successful tasks, 2 cached | `sv7a-r2-build.log` |
| `~/.local/bin/heavy-slot sv-7a-r2-core pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-sources.test.ts src/shadow-detection.test.ts` | 0; 14 tests passed | `sv7a-r2-core-unit.log` |
| `~/.local/bin/heavy-slot sv-7a-r2-api pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/job-source.application.test.ts src/job-source.controller.test.ts` | 0; 7 tests passed | `sv7a-r2-api-unit.log` |
| `~/.local/bin/heavy-slot sv-7a-r2-worker pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/shadow-detection.worker.test.ts src/shadow-detection-lock-race.test.ts` | 0; 8 tests passed | `sv7a-r2-worker-unit.log` |
| `~/.local/bin/heavy-slot sv-7a-r2-web-final pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/jobs/[id]/diary/route.test.ts' 'app/api/jobs/[id]/customer-messages/route.test.ts'` | 0; 8 route tests passed, no browser | `sv7a-r2-web-unit-final.log` |
| `node --test tools/*.test.mjs` | 0; 85 tests passed | `sv7a-r2-tools-unit.log` |
| `pnpm openapi:check` | 1; tsx CLI IPC listener rejected with EPERM | `sv7a-r2-openapi.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; same OpenAPI generator/check without IPC listener; committed artifact unchanged | `sv7a-r2-openapi-node.log` |
| `node --input-type=module` (inline deterministic binding/pool controls) | 0; reproduced both original faults and validated repaired inputs, without a database connection | `sv7a-r2-binding-controls.log` |
| `git diff --check` | 0 | terminal output |

The deterministic controls use the built production fixture decoder, observation
parser, proposal factory and unchanged grouping function: the old shared-ID batch
throws `OBSERVATION_BINDING_MISMATCH`; five separate originals coalesce to one
signal with five evidence links; the repaired four-original batch yields four
separate groups; a substituted SHA-256 remains rejected. A separate pool-constructor
control proves the password descriptor is non-enumerable, spread loses it and an
explicit password preserves it. No connection was opened or password logged.
These are deterministic controls, not PostgreSQL or independent-model verification.

The first two web heavy-slot attempts exited 2 before Vitest started
(`sv7a-r2-web-unit.log`, `sv7a-r2-web-unit-retry.log`); the final invocation above
passed. The wrapper emitted sandbox sysctl/sysmon/pgrep errors on successful runs
as well. Turbo emitted sandbox IO warnings; its seven tasks completed successfully.
The tooling suite's existing lane tests create disposable Git repositories in
temporary directories; no Git write command was issued against this worktree.

### Remaining evidence and delivery

122 automated tests passed across the targeted unit/route/worker and tooling runs.
No PostgreSQL, migration, browser or full `pnpm test` execution was attempted:
this sandbox cannot bind localhost or start PostgreSQL. CI after dispatcher push
must run the repaired three integration suites and the existing mandatory database,
migration and regression suites. Local source typechecking and grouping controls
do not establish a database pass. No AI/model/prompt/parser/matching-policy change,
schema migration, application behavior, new alert or release authority is introduced.
All existing intake/UI/CH-4 integration, real-data and release holds remain.
A fresh exact-commit independent verdict and separate technical acceptance are still
required; this receipt grants neither.

Working tree changes are ready for the dispatcher. No add, commit, checkout,
push or other Git write command was issued against the worktree. Intended
conventional commit subject/body is overwritten at `/private/tmp/jg-msg-sv-7a.txt`.
