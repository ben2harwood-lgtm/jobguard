Built by Codex (GPT-6.1 Sol) via the full-steam supervisor backlog; order written 16 Oct 2026 by the queue-filler

MON-1B, RED. Builder working receipt; independent verdict and separate acceptance
are outstanding. No Git mutation or PR. Build-ahead from unmerged MON-1; parent
merge and any repair integration remain dispatcher-owned.

Starting HEAD: `f03d19ae25bb60cbf3c84a380a61907a392b24a1`.
Final HEAD: `f03d19ae25bb60cbf3c84a380a61907a392b24a1` (unchanged).
Starting working tree was clean. Provisional migration: 0184.

## Worktree authority and scope

Read the parent's receipt first, then local AGENTS.md, BUILD_PLAN.md §10.1.2–10.1.9,
MON-1 card (§10, lines 2095 onward), dependency rows and §10.5 ownership.
The supplied MON-1 card matches this worktree. The worktree migration runner now
has 0162 and 0164 in its closed historical list; its directory discovery accepts
new 0184. The parent's older statement that the runner ends at 0158 is historical.
No 0163 migration design or SQL exists to copy; that number was allocated only.
0184 implements the parent's supplied-input persistence scope, not guessed live
lifecycle replay. The plan's old 0070 graph allocation is superseded by this order.
The 13 Oct finisher draft was read; this order lifts its catalogue construction
hold, while preserving held time, trip, attribution, access and charging policy.

## Implemented

- Immutable tenant-qualified synthetic input snapshots, computations, day records,
  incremental next-period corrections and durable once-per-computation alerts.
- Isolated NOLOGIN meter role with no shadow table or role grants. Runtime table
  grants are SELECT only, with no matching direct-read RLS policy; checked company
  reads and recomputations enforce persisted owner/admin session authority.
- Migration-only checked fixture loader; no actor, price or cached count supplied
  by runtime callers. Versioned Zod server service, using per-call verified
  context. No HTTP route, UI or contractor-track writer.
- Daily grouping/allowance and scalar formula reuse unchanged parent modules in
  TypeScript. Independent SQL boundary projection is compared with that model in
  new PostgreSQL tests. Reads and corrections recompute from immutable sources,
  including when a prior cached computation/day is changed.
- One tenant transaction lock serializes loaders, replay, rebuild and correction
  derivation. Authority precedes target lookup/replay and is rechecked after the
  lock wait. No subsequent job/source/commercial/audit locks are acquired.
- Own-migration upgrade proof with canonical named-column text, full types,
  original PK identities, non-empty fixtures and rolled-back comparator controls.
  Existing rows/functions/grants are compared across N alone, then later
  migrations are applied twice. No existing row or function is rewritten by N.

This is persisted supplied-fact metering. It does not derive day membership from
unsettled lifecycle intervals, activate plans or execute money movement. Whole
MON-1 and its event/admission/server/UI criteria remain incomplete. A computation
is an internal hypothetical snapshot; it creates no commercial decision or audit
claim that an external action happened. Its source, actor and server time are
recorded immutably. No charge, obligation, journal, send or provider call exists.

## BUILDER ASSUMPTIONS (for coordinator ruling, decision 51)

- Narrow persistence input is a complete immutable daily synthetic fact snapshot,
  matching the parent's explicit-input scope. Fixture job/party UUIDs are supplied
  identities, not references claiming real evidence/activation provenance. Live
  adapters remain held rather than guessing lifecycle timing or trial policy.
- Normal persisted identity owner/admin sessions can read their company, as this
  order permits. The known shared-practice tenant is always refused (Q5).
- Each first computation closes its synthetic input revision; later revisions
  correct the next period. If that next period is already closed, refuse rather
  than invent a later target rule (`METER_CORRECTION_PERIOD_CLOSED`).
- Named job-line beneficiaries and allocations stay absent: only aggregate day
  counts and aggregate correction principal are persisted.
- Direct runtime SELECT returns no rows; checked routines release company results.
  The private migration-owned authority bridge consumes the merged SSO membership
  gate, restoring the original tenant, without granting meter identity-table access.

## HELD

- Q5: shared-practice tenant-summary access.
- Q6: exact stop/quiet/trial endpoints and conversion-day charging.
- Trip-latch/source-transition hooks and persisted trip policy.
- Any charge; D09 remains proposed and D02/D05/G4-S approvals are not inferred.
- Named allowance/paid-extra/grace attribution and place-adding command integration.
- Real customer information, spending, provider/outward actions and production use.
- UI/browser assertions; independent exact-commit verdict, separate acceptance and
  parent merge. No PR before parent merges.

## ADDITIVE LIST ROWS (pending coordinator ruling)

Five tables added in name order to each of the two exact catalogues in
`packages/db/test/tenancy.integration.test.ts`: `meter_computation`,
`meter_correction`, `meter_day_ledger`, `meter_input_event`, `meter_projection_alert`.
No existing catalogue row changed or moved. Effective-privilege inventory adds
one `a-mon1b-meter` group and the 31 exact new keys appended below. The inventory
schema only permits `approved_current` or `existing_exception`; the new group's
note explicitly records pending coordinator ruling. Its syntactic status is not
independent acceptance or policy approval. No existing group/entry changed.

## New GRANT statements — standard F

No direct runtime INSERT, UPDATE or DELETE grant. All writes are checked routines
with persisted actor/role rechecks, owned by a role other than runtime. Runtime
can neither load fixture inputs nor assume meter/migration/shadow roles.

1. `GRANT USAGE ON SCHEMA app TO jobguard_meter;`
2. `GRANT SELECT ON app.meter_input_event,app.meter_computation,app.meter_day_ledger,app.meter_correction,app.meter_projection_alert TO jobguard_runtime;`
3. `GRANT SELECT,INSERT ON app.meter_input_event,app.meter_computation,app.meter_day_ledger,app.meter_correction,app.meter_projection_alert TO jobguard_meter;`
4. `GRANT EXECUTE ON FUNCTION app.mon1_company_actor(uuid,text) TO jobguard_meter;`
5. `GRANT EXECUTE ON FUNCTION app.mon1_store_fixture(uuid,text,uuid,jsonb) TO jobguard_migration;`
6. `GRANT EXECUTE ON FUNCTION app.mon1_rebuild(uuid,text,date),app.mon1_read(uuid,text,uuid) TO jobguard_runtime;`

## Tests first and verification

New unit and PostgreSQL tests were written before their corresponding service/
migration implementation. The initial unit run was interrupted before collection:
the default pnpm launcher stalled. A subsequent collection failed because the
parent's core dist had not been built; an own-test alias to core source avoids a
prerequisite build or dependency download. These are not assertion failures.
The initial foundation implementation was written while the stalled first command
was pending, so that part lacks a completed red-before-code run.

- Repository first run: exit 1, missing new module (0 collected tests), before
  implementing it.
- First combined run: exit 1, 9 passed / 1 failed because the test attempted to
  change the parent's frozen Money object. Fixed the new fixture with a copy.
- Explicit boundary red run: exit 1, 10 passed / 2 failed: malformed tenant on empty
  days was accepted, and a pilot result passed the synthetic persistence boundary.
  Implementation then tightened both checks.
- Subsequent own unit run: exit 0, 2 files / 12 tests passed.
- Added closed-target typed-error case: exit 1, 11 passed / 1 failed, then added
  explicit repository error mapping. Final results recorded below.

NOT RUN (cannot start PostgreSQL here):
`packages/db/test/meter-persistence.integration.test.ts` and
`packages/db/test/meter-persistence-upgrade.integration.test.ts`.
Their first failing database execution is also NOT RUN. No mocked result is
claimed as PostgreSQL proof. Existing tenancy/privilege catalogue, money,
activation, audit, migrations and full-regression suites are CI/dispatcher work.
All browser/e2e/Playwright suites are NOT RUN (explicit CI-only instruction).
AI eval is unchanged and NOT RUN (no prompt/model/parser/gateway changes).
Clean pinned install is NOT RUN (dependencies supplied, downloads prohibited).

## Self-inspection (not an independent review)

Inspected authority-first lookup, synthetic-only flags, replay payload binding,
tenant locking, no source query into shadow data, no runtime writes, immutable
source/history, incremental positive/negative corrections, and privileged-cache
changes. SQL execution and the complete privilege comparison remain unverified
until PostgreSQL CI. Reviewed lists were changed additively only under the issued
override. No reviewer verdict or technical acceptance is asserted.

LATER: settle lifecycle/admission source contracts and named per-job allocations;
connect authorized transport only after shared-practice scope is ruled; UI remains
parked. Handle facts arriving after the next period closes under an approved
correction-target rule.

## Upgrade rule (verbatim)

An upgrade proof proves ITS OWN migration only: install everything before N,
snapshot, apply N alone, compare; then apply everything after N and require
success twice. Compare existing rows by named pre-existing columns after all
migrations. Never assert that later migrations add no column or replace no
function; the fingerprinted-table guard owns 'may never gain a column'.

## STOP / environment refusals

Read-only process inspection command `ps -axo pid,ppid,etime,command` was refused:
`zsh:1: operation not permitted: ps`. Stopped that inspection; no alternative
process-inspection route was attempted. No permission escalation was requested.
The source inspection also found no `packages/core/src/jobs-on-the-go-pricing.ts`
or `packages/db/src/identity-session-repository.ts`; the actual foundation is in
`jobs-on-the-go.ts` and the actual identity session schema/routines were read.
No protected line required a rule-G change or workaround.

## Final command results, preservation evidence and additive keys

Final own units: **2 files / 12 tests passed**, exit **0**.
Final collection-only check: **2 PostgreSQL files / 12 cases collected**, exit **0**.
Collection executes no test body and proves no PostgreSQL behavior.

Forced checks used `--force`, with **0 cache hits**:

| Command (cached pnpm 10.28.1 launcher prepended to PATH) | Exit | Result |
| --- | --- | --- |
| `pnpm exec turbo run typecheck --force` | 2 | Initial own cross-version Zod type errors; 4/5 tasks completed before stop |
| `pnpm exec turbo run typecheck --force` (after fix) | 0 | 7/7 tasks executed, zero cached |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0 | Package lint, 7/7 tasks executed, zero cached |
| `pnpm build --concurrency=2 --force` | 0 | 7/7 tasks executed, zero cached; actual Next production build |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Six unchanged inherited MON-1 paths outside this piece's lane |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 1 | Core purity passed (185 TS files); stopped at same lane failure |
| `pnpm openapi:check` | 1 | NOT RUN to completion: tsx IPC listener refused with EPERM |
| `git diff --check` | 0 | No whitespace errors |
| Own preservation/additive-list/exact-lane Python check | 0 | 16 own paths; 14 protected-file hashes; original shared-file bytes recovered exactly |

The package checks emitted `WARNING IO error: Operation not permitted (os error 1)`
while writing Turbo metadata; all seven real task commands completed on the final
forced runs. No alternate permission route or cache-hit success was used. Build
also warned that Next inferred the outer workspace from multiple lockfiles; no
configuration outside this lane was changed. Node was **24.17.0** versus repository
pin **24.15.0**; cached pnpm was **10.28.1**, Vitest **4.1.11**, Turbo **2.10.12**.
Free disk: **35 GB** initially, **33 GB** after build (above the issued 30 GB floor).
Observed memory free: **57–63%**, above 35% before heavy commands.

OpenAPI refusal (no retry or alternative listener path):
`pnpm openapi:check` -> `Error: listen EPERM: operation not permitted
/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/1973.pipe`.
This is sandbox permission refusal, not automatic approval-review rejection.

Lane lint refused these inherited parent paths; every one remains byte-identical
to the starting HEAD:

- `config/agent-lane-assignments.json`
- `docs/verdicts/MON-1/BUILDER_RECEIPT.md`
- `packages/core/src/index.ts`
- `packages/core/src/jobs-on-the-go-pricing.test.ts`
- `packages/core/src/jobs-on-the-go.test.ts`
- `packages/core/src/jobs-on-the-go.ts`

No allowance, legacy lane entry or merged assertion was loosened to make that
check green. Main-based whole-branch lane validation remains HOLD until parent
integration. No rule-G line needs modification: the only shared test edits are
the ten expressly permitted additive table rows, and the effective privilege
inventory adds 31 new keys and one new group. Stripping those exact additions
recovers the starting files **byte for byte** (56 existing groups and 1,137
existing inventory entries preserved in order).

The first forced typecheck found that core pins Zod **3.25.67** and db pins
**3.25.76**. New local date/job schemas and a safeParse result bridge avoid mixing
those implementation types. Parent schemas still validate grouping and output;
no dependency pin, parent source, public money representation or policy changed.

### Exact added effective-privilege keys

```text
acl|rel|table|app.meter_computation|jobguard_meter|INSERT|-
acl|rel|table|app.meter_computation|jobguard_meter|SELECT|-
acl|rel|table|app.meter_computation|jobguard_runtime|SELECT|-
acl|rel|table|app.meter_correction|jobguard_meter|INSERT|-
acl|rel|table|app.meter_correction|jobguard_meter|SELECT|-
acl|rel|table|app.meter_correction|jobguard_runtime|SELECT|-
acl|rel|table|app.meter_day_ledger|jobguard_meter|INSERT|-
acl|rel|table|app.meter_day_ledger|jobguard_meter|SELECT|-
acl|rel|table|app.meter_day_ledger|jobguard_runtime|SELECT|-
acl|rel|table|app.meter_input_event|jobguard_meter|INSERT|-
acl|rel|table|app.meter_input_event|jobguard_meter|SELECT|-
acl|rel|table|app.meter_input_event|jobguard_runtime|SELECT|-
acl|rel|table|app.meter_projection_alert|jobguard_meter|INSERT|-
acl|rel|table|app.meter_projection_alert|jobguard_meter|SELECT|-
acl|rel|table|app.meter_projection_alert|jobguard_runtime|SELECT|-
acl|routine|function:app.mon1_company_actor(uuid,text)|jobguard_meter|EXECUTE|-
acl|routine|function:app.mon1_read(uuid,text,uuid)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.mon1_rebuild(uuid,text,date)|jobguard_runtime|EXECUTE|-
acl|routine|function:app.mon1_store_fixture(uuid,text,uuid,jsonb)|jobguard_migration|EXECUTE|-
acl|schema|app|jobguard_meter|USAGE|-
owner|rel:table|app.meter_computation|jobguard_migration
owner|rel:table|app.meter_correction|jobguard_migration
owner|rel:table|app.meter_day_ledger|jobguard_migration
owner|rel:table|app.meter_input_event|jobguard_migration
owner|rel:table|app.meter_projection_alert|jobguard_migration
owner|routine|function:app.mon1_company_actor(uuid,text)|jobguard_migration
owner|routine|function:app.mon1_project(uuid,jsonb)|jobguard_meter
owner|routine|function:app.mon1_read(uuid,text,uuid)|jobguard_meter
owner|routine|function:app.mon1_rebuild(uuid,text,date)|jobguard_meter
owner|routine|function:app.mon1_store_fixture(uuid,text,uuid,jsonb)|jobguard_meter
role|jobguard_meter|super=f,inherit=f,createrole=f,createdb=f,login=f,replication=f,bypassrls=f,connlimit=-1,settings=
```

### Preserved SHA-256 values (equal to starting HEAD)

```text
ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1  AGENTS.md
384fdb07869e780e44e9761a7aaa355ddb4dc0b7fb03b5370d65c47c2891fcdd  BUILD_PLAN.md
06b501e413424d77fc5c3a1ac0f481b7230c271e36bfbde2cb953385ccccd349  pnpm-lock.yaml
d9ac38c5bae60a487b2835c1681167ea5bf985f1449469c56eec0403772c8983  packages/db/src/migrate.ts
ced92a4c39a40395f9814b52ba7c4d4c6dcbdce13f8a8ecf5bcc1e0fba0d05bf  packages/db/MIGRATIONS.md
278534cf6bff11bd0bde187daebea3068904311dd95996eb15f14448ab2ed6ff  config/agent-lane-assignments.json
a3d328088773f745713967428672e00dac7f1ec077b1e844b656d145a2755267  docs/verdicts/MON-1/BUILDER_RECEIPT.md
ae49af6feedb97f619e0e5fbd9ccb45e87d0f668a1830d7ee61849d9cad866b6  packages/core/src/index.ts
83af87f03d10ed56c1292e99095e3f50ff9ba91931798e1ed4acb6c5f25e30d2  packages/core/src/jobs-on-the-go.ts
70174b93c50ccfaad664933be135e2daaead9d88d9981ac09cbe25ef44237ffe  packages/core/src/jobs-on-the-go.test.ts
bcaca66d7e466df0bd647be0004ec4c559eaee6b0a18bbfdae52f48fcd3e1d23  packages/core/src/jobs-on-the-go-pricing.test.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6  packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f  packages/db/test/command-replay-contract.integration.test.ts
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35  apps/api/src/auth/context-boundary.test.ts
```

### Tracked diff stat

```text
 docs/contracts/lp-0-effective-privileges-v1.json | 32 ++++++++++++++++++++++++
 packages/db/src/index.ts                         |  3 +++
 packages/db/test/tenancy.integration.test.ts     | 10 ++++++++
 3 files changed, 45 insertions(+)
```

The stat above intentionally reports tracked changes only. Thirteen new files
are untracked for the dispatcher to stage: the exact set is the remaining paths
in `config/lanes/mon-1b.json` plus that lane file itself. No Git write was run.

### Command execution record

All pnpm commands began with `export PATH="$HOME/Library/pnpm/bin:$PATH"`.
After the stalled default launcher was identified, commands also used the already
existing `/private/tmp/ch4-pnpm-bin` launcher (its text calls cached 10.28.1 with
Node). No install/download command ran.

Inspection commands, exit 0 unless noted:

1. `pwd; git rev-parse HEAD; git status --short; df -g /System/Volumes/Data; memory_pressure | tail -1` — clean base, disk 35 GB, memory 63%.
2. `cat docs/verdicts/MON-1/BUILDER_RECEIPT.md; cat AGENTS.md` — parent read first.
3. `rg -n` searches of meter contracts, plan lines, schemas, auth/session routines,
   grants, RLS, role inventory and runner; targeted `sed`/`cat` reads of actual
   BUILD_PLAN, pure parent, CH-4, identity/SSO, activation terms, lane tooling and
   upgrade utilities. Read the named 13 Oct draft in full. Missing candidate
   `jobs-on-the-go-pricing.ts`/`identity-session-repository.ts` reads were diagnosed
   and the actual definitions read; no source file was fabricated to match them.
4. `ps -axo pid,ppid,etime,command | rg 'pnpm|vitest|corepack' | head -25` — permission refused; stopped this inspection. The surrounding grouped command
   also used `which node`, `which pnpm`, `ls` of launcher/dependency directories
   and `cat .npmrc` (absent), so its final exit was 1.
5. `head`/`tail` of installed pnpm/vitest launchers, `ls` of installed tools and
   `/private/tmp`, `node --version`, cached `pnpm --version` — read-only diagnosis.
6. `git diff --stat`, `git diff --numstat`, `git status --short`,
   `git diff --check`, `git ls-files --others --exclude-standard`, and
   `git show <base>:<protected-path>` — read-only preservation evidence.
7. Repeated `df -g /System/Volumes/Data; memory_pressure | tail -1`, and `tail`/
   `cat`/`rg` of own `/private/tmp/jg-mon1b-*.log` files — all inspected successfully.
8. `mkdir -p docs/verdicts/MON-1B`; own `cat > <file>` heredocs and Python edits
   for the 16 paths in the lane (plus the intended commit message and evidence
   files under `/private/tmp`) — all write steps exit 0. Existing shared-file
   edits were additive only; no uncommitted file from another actor was overwritten.

Exact local Vitest invocation history (one run at a time, own files only):

| Invocation, beneath `pnpm --filter @jobguard/db exec` | Exit | Counts / purpose |
| --- | --- | --- |
| `vitest run --maxWorkers=2 src/meter-persistence.test.ts` (default launcher) | 130 | Interrupted after no collection output; stalled launcher |
| Same invocation via cached launcher | 1 | 1 failed collection, 0 tests; core runtime dist absent |
| `vitest run --config test/meter-vitest.config.ts --maxWorkers=2 src/meter-persistence.test.ts` | 0 | 1 file, 7 passed |
| `vitest run --config test/meter-vitest.config.ts --maxWorkers=2 src/meter-repository.test.ts` | 1 | Missing module, 0 tests; repository not implemented yet |
| `vitest run --config test/meter-vitest.config.ts --maxWorkers=2 src/meter-persistence.test.ts src/meter-repository.test.ts` | 1 | 9 passed / 1 failed; attempted frozen-fixture mutation |
| Same combined invocation | 1 | 10 passed / 2 failed; genuine tenant/synthetic boundary red tests |
| Same combined invocation | 0 | 12 passed |
| Same combined invocation | 1 | 11 passed / 1 failed; closed-target error mapping red test |
| Same combined invocation | 0 | 12 passed |
| Same combined invocation after cross-version Zod type fix | 0 | 12 passed (final unit run) |
| `vitest list --config test/meter-vitest.config.ts --maxWorkers=2 test/meter-persistence.integration.test.ts test/meter-persistence-upgrade.integration.test.ts` | 0 | Initial 10 cases collected, no test execution |
| Same collection after final fixture/identity/schedule cases | 0 | 12 cases collected, no test execution |

The first `--force` typecheck was rerun only because own type errors required a
source fix; all other forced package checks ran once. Build and tests did not run
together. No PostgreSQL/browser startup, heavy-slot database run, full-suite run,
Git staging/commit/push, PR creation or independent-review invocation occurred.

Final HEAD remains `f03d19ae25bb60cbf3c84a380a61907a392b24a1`.
Intended commit message: `/private/tmp/jg-msg-mon-1b.txt` (overwritten as requested).

