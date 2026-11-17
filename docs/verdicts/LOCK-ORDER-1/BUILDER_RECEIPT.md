Built by Codex; dispatched 13 Oct 2026.

The addendum's fallback-Claude attribution does not describe this run; this receipt names the actual builder. Execution date: 15 Oct 2026. This is a partial builder handoff, not an independent verdict or technical acceptance.

# LOCK-ORDER-1 — partial / coordinator prerequisite held

Branch: `codex/sandbox/lock-order-1`. Base and final unchanged HEAD: `2a230bb522c2c1146c0d0741ed374237176ff02c` (`origin/main` is identical). No commit, staging, push, migration, new routine, grant, route, UI, install, provider call or real data.

Intended commit message: `/private/tmp/jg-msg-lock-order-1.txt`. Do not merge this partial handoff as complete: the new mapping regression remains red.

## Scope and contracts inspected

Read AGENTS.md, the issued header/addendum and standing handoff rules, BUILD_PLAN §§2.4, 5.2–5.3, 5.6, ENT-2, ENT-3 and ENT-4b, and the merged site-extra/work-order-import contracts. LOCK-ORDER-1 is issued by this order rather than a task card in BUILD_PLAN. No plan edit.

Verified all draft citations against the actual main tree: extra-repository.ts:99–102 inserts origin before the seam; site-extra-repository.ts:31–35 calls the authority routine; migration 0135:77 takes the shared tenant lock; migration 0122:17 declares the work-order foreign key; work-order-repository.ts:120 takes the exclusive tenant lock; migration 0110:378 locks the order FOR UPDATE; extra-repository.ts:35 already maps 40P01 and 40001; work-order-repository.ts:42 maps only 40001 and :44 falls through to DATABASE_UNAVAILABLE. Main matches the cited base.

`git merge-base --is-ancestor origin/codex/sandbox/m3-1 origin/main` returned 1. M3-1's property was inspected read-only on its existing remote ref, and the equivalent same-instant property was added here using merged commands. No M3-1 dependency, shared harness change, merged-test edit, expectation relaxation or fingerprint change.

## Delivery and acceptance evidence

| Order line | Delivered | Evidence / limit |
| --- | --- | --- |
| (a) tenant lock before work-order row locks | Shared transaction-level tenant administration lock now precedes the per-job lock and all capture writes. No migration. | Source-inspected; new actual-pg_locks regression written first, NOT RUN. |
| (b) 40P01 / 40001 => STALE_REVISION | HELD: work-order repository is whole-source pinned by the protected boundary test. Final source restored to main exactly. | Unit test written first; final 1 failed, 3 passed. Exact coordinator prerequisite below. |
| (c) real database race | New 50-round barrier-released capture/revision test, each operation on a distinct pre-connected runtime session. | NOT RUN (cannot start PostgreSQL here). Requires 50 successful captures/revisions in this unchanged-authority scenario, exact revision increments and 51 revision rows; each origin must join its variation, scope, successful receipt, logged event, baseline and raised audit. |
| (d) M31-S15 same-instant history | Four capture/revoke/revise rounds with rotated arrival order and one release barrier, on three different sessions. | NOT RUN (cannot start PostgreSQL here). Revoke/revise must commit; capture commits against old/new baseline or gives STALE_REVISION / NOT_FOUND / EXTRA_FORBIDDEN and leaves no receipt/origin/variation. Replay/new capture after revocation must give NOT_FOUND. Audit chain verified by test. |

New exact titles in packages/db/test/lock-order-1.integration.test.ts:

- `[LOCK-ORDER-1(a)] holds the shared tenant administration lock before the origin foreign key can lock the work order`
- `[LOCK-ORDER-1(c)] 50 same-instant captures and baseline revisions use separate connections and leave consistent committed state`
- `[LOCK-ORDER-1(d)] M31-S15 same-instant capture, revoke and revise have explicit outcomes`

The first database test observes actual server locks just before the real origin insert, without replacing any database effect. It deterministically detects the original ordering even when a probabilistic race happens not to deadlock. Runtime sessions inherit 100ms deadlock detection and a 10s statement timeout. No timeout/unavailable result is accepted. The fixture is the existing embedded PostgreSQL 16 harness and non-owner runtime login; only fixture inspection uses the existing administrative pool.

## Final source before / after

`packages/db/src/extra-repository.ts`, main:66–67; final:66–70:

Before:
```ts
   const tenant = context.tenantId.toLowerCase();
   await lockJob(db, tenant, input.jobId);
```
After:
```ts
   const tenant = context.tenantId.toLowerCase();
   // Match revision/revocation order: tenant administration before job locks and origin foreign keys.
   await db.$client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1,54))", [tenant]);
   await lockJob(db, tenant, input.jobId);
```

This adds two lines; it changes no existing source line. Canonical lower-case tenant identity and advisory salt 54 match the persisted authority routine. Capture and revision now acquire the tenant administration lock before any conflicting job/order row lock. Capture/capture concurrency still uses shared tenant locks, with the existing per-job serialization. Audit remains after domain/seam work.

## STOP / coordinator-owned prerequisite

**(b) HELD.** `apps/api/src/auth/context-boundary.test.ts:92` pins the entire `packages/db/src/work-order-repository.ts` file. Line 98 computes its whole-source SHA-256; line 660 refuses changed practice-source bytes. The dispatch addendum forbids editing that test, its pinned value and files it pins. I initially made the requested mapping edit, then identified this prerequisite and restored only my own edit byte-for-byte. Nothing is rerouted around the protected check.

Source line `packages/db/src/work-order-repository.ts:42`, final before and after (UNCHANGED):
```ts
  if (e.code === "40001") return new WorkOrderError("STALE_REVISION");
```

Required future source change, for the coordinator after renewed caller review:
```ts
  // Serialization failures and deadlocks both roll back; callers may retry with current authority/revisions.
  if (e.code === "40001" || e.code === "40P01") return new WorkOrderError("STALE_REVISION");
```

Exact protected pin line 92 BEFORE (also the untouched final value):
```ts
  "packages/db/src/work-order-repository.ts": "4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3",
```
AFTER that exact proposed source edit (candidate measured during the interim edit; NOT applied to the pin):
```ts
  "packages/db/src/work-order-repository.ts": "a70071bb55ca3bed8f1c2a9ce4c7103ffa59306ccd3cc8479574db96dca9710f",
```

No permission is inferred to move this fingerprint. No extraction, helper, wrapper or alternate caller implements the mapping elsewhere. The new unit regression deliberately remains failing rather than marking the held requirement satisfied.

**Lane-check STOP.** `tools/agent-lane-boundary-lint.mjs:212` BEFORE and AFTER are identical:
```js
  if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");
```

With `LANE_BASE_REF=origin/main`, both root lint and lint:lanes exit 1 at this line because HEAD equals the base before the dispatcher commits. No checker change or alternate base was attempted. The dispatcher must create the authorized task commit and rerun these checks. The additive lane names only the five delivered paths.

## Commands and results

Node v24.17.0; pnpm 10.28.1; Turbo 2.10.12; Vitest 4.1.11; installed dependencies reused. The default global pnpm stalled on three version probes (interrupted, exit 130); no package download was requested. A task-owned temporary launcher uses the already-cached pinned pnpm at `$HOME/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. Every later pnpm command begins with the required Library/pnpm PATH export, then adds that task launcher. No repository tooling or package pins changed.

| Check | Exit / counts | Scope of evidence |
| --- | --- | --- |
| First unit attempt | 1; 0 tests collected | Missing compiled @jobguard/core export. |
| Prerequisite `pnpm exec tsc -p packages/core/tsconfig.json` | 0 | Compiles core so direct unit invocation can load it. No install. |
| First executable unit run, before source change | 1; 1 failed / 3 passed | 40P01 incorrectly returned DATABASE_UNAVAILABLE. |
| Interim unit run, with mapping edit | 0; 4 passed | Historical only: mapping later restored due protected source pin. |
| Final unit run, after restoring pinned source | 1; 1 failed / 3 passed | Final regression is RED for held (b). |
| `pnpm exec turbo run typecheck --force` | 0; 7/7 tasks, 0 cached | Executed once, on the interim mapping edit plus the delivered lock fix. Final mapping restored to byte-identical main afterwards. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 1 | Core purity passed (171 files); lane checker stops at :212 before remaining root checks. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same :212 self-comparison refusal. |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0; 7/7 tasks, 0 cached | Independent package lint, run once after root preflight refusal; interim mapping state. Root lint remains failed. |
| `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs` | 0 | Independent remaining root boundary checks. |
| TypeScript transpile diagnostics for the two new tests | 0; 2 syntax passes | Syntax only, no database execution or typechecking claim. |
| `pnpm build --concurrency=2 --force` | 0; 7/7 tasks, 0 cached | Executed once on interim source; 32 static pages generated. Mapping restored afterwards. No browser run. |
| `pnpm openapi:check` | 1 | Refused before schema comparison: tsx local IPC listen EPERM. No alternate execution attempted. |
| `git diff --check` | 0 | No whitespace errors. |

The three forced Turbo checks used `--force`; no cache-hit result is claimed as execution. Turbo emitted `WARNING IO error: Operation not permitted (os error 1)` while using its shared worktree cache; package tasks nevertheless executed and exited 0. No cache-permission workaround was attempted. Build also reported existing workspace-root, CSS/autoprefixer and dependency warnings; none were edited. These successful intermediate checks are not green CI on the final partial handoff; the dispatcher must rerun checks on its eventual commit. Per the once-only build/typecheck/lint restriction, those suites were not repeated after restoring the pinned file.

Memory before checks: 54–59% free; disk 56–59 GB free (both above dispatch thresholds). All test executions used one named file and --maxWorkers=2, sequentially. No database/browser execution or heavy-slot invocation occurred.

## Permission refusals — stopped, no alternate route

- Diagnostic pipeline: `ps -o pid,ppid,etime,command -ax | rg 'pnpm|63711' | head -18`. Refusal: `zsh:1: operation not permitted: ps`. The surrounding shell block returned 0 because the final pipeline consumer completed. No replacement process-enumeration command was attempted.
- `pnpm openapi:check` (with the PATH exports shown in the command audit) exited 1. Exact refusal: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/16693.pipe`. No retry, loader bypass or escalation.

## NOT RUN and remaining gates

- `packages/db/test/lock-order-1.integration.test.ts`: all 3 tests NOT RUN (cannot start PostgreSQL here), including the pre-fix database run. CI/dispatcher must execute through `~/.local/bin/heavy-slot lock-order-1 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lock-order-1.integration.test.ts` after the normal memory/disk checks and pinned PATH setup.
- PostgreSQL suites, migrations suites, existing integration regressions and browser suites: NOT RUN under the dispatch sandbox/own-files-only rules. No migration or browser behavior introduced. No new mandatory suite was made optional.
- OpenAPI schema comparison: NOT RUN because tsx IPC was refused; command failure recorded above.
- Whole repository tests, fresh pinned install, live providers and AI evaluation: NOT RUN / outside this piece. Existing dependencies were reused and no AI/prompt/policy changes were made.
- No independent review or technical acceptance. RED review, coordinator resolution of (b), final unit green, final-commit lane/root lint, OpenAPI comparison, real PostgreSQL regressions and full CI remain required.

## Migrations, grants, compatibility, operations

No migration; reserved 0171 unused. No new GRANT (zero lines). Standard F: no new direct INSERT/UPDATE/DELETE authority for jobguard_runtime; no routine/role/table changes. No backfill, financial effect, external action or new operational alert. No schema/API wire change. Existing current-authority checks, replay contracts, tenant scoping, transaction boundaries, receipt writes and audit order are retained. The b mapping's proposed retry advice requires checking current authority and revisions; it is not an automatic retry after an unknown network outcome.

Overlaps: extra-repository.ts is shared with ENT-4b; the held work-order-repository.ts belongs to ENT-2 and is protected by the coordinator's source pin; lane registry is shared. Dispatcher serializes these edits. There is no native/offline implementation or migration dependency here.

## Builder self-review (source inspection only)

Source-inspected the tenant-first order, transaction lifetime, shared lock key, placement before foreign-key side effects, and unchanged final pinned file. The deterministic database regression checks server lock state rather than freezing source bytes; the concurrency histories assert committed relationships and audit consistency. Test files are new and no merged expectation was changed. Synthetic fixtures only. This section is not a model review; database behavior is unverified until actual execution. Discovered prerequisite: protected whole-source pin blocks (b); no separate unrelated feature was added. No UI LATER item.

## Lane integrity evidence

One-time SHA-256 comparison of main and working files (not a permanent test):
```text
packages/db/migrations/0110_work_orders.sql 0ced6f208f1a9236b6fb5bd042580e1133c2462c137691fb472ff3d6629b3168 0ced6f208f1a9236b6fb5bd042580e1133c2462c137691fb472ff3d6629b3168 UNCHANGED
packages/db/migrations/0122_extra_origin_persistence.sql ea90def21912033102c82bbaecb44d73fc2531817945b41d6fd611ab8799a9f7 ea90def21912033102c82bbaecb44d73fc2531817945b41d6fd611ab8799a9f7 UNCHANGED
packages/db/migrations/0135_site_extra_authority.sql 1e3119299e15572885633d5f892f2bc385756589e65a1b280d476f5c5cc74eab 1e3119299e15572885633d5f892f2bc385756589e65a1b280d476f5c5cc74eab UNCHANGED
packages/db/src/site-extra-repository.ts f593561fd81e046e4a00b770a75251ceb9f4d9105c9bb1d4efec27ac61596758 f593561fd81e046e4a00b770a75251ceb9f4d9105c9bb1d4efec27ac61596758 UNCHANGED
packages/core/src/watchdog.ts a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca UNCHANGED
packages/db/test/watchdog-command-harness.ts 3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 UNCHANGED
packages/db/test/command-replay-contract.integration.test.ts db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f UNCHANGED
apps/api/src/auth/context-boundary.test.ts a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 UNCHANGED
tools/agent-lane-boundary-lint.mjs b20e4efad8c3651bef0f09b942820d950abc596efbaa72583409597eb4de2197 b20e4efad8c3651bef0f09b942820d950abc596efbaa72583409597eb4de2197 UNCHANGED
packages/db/src/work-order-repository.ts main=final=4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3 (restored after interim edit)
```

`git diff --stat` before adding this new receipt:
```text
2a230bb522c2c1146c0d0741ed374237176ff02c
 config/agent-lane-assignments.json  | 1 +
 packages/db/src/extra-repository.ts | 2 ++
 2 files changed, 3 insertions(+)
 M config/agent-lane-assignments.json
 M packages/db/src/extra-repository.ts
?? packages/db/test/lock-order-1.integration.test.ts
?? packages/db/test/lock-order-1.test.ts
4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3  packages/db/src/work-order-repository.ts
      22 packages/db/test/lock-order-1.test.ts
     173 packages/db/test/lock-order-1.integration.test.ts
     195 total
System-wide memory free percentage: 58%
Filesystem   1G-blocks Used Available Capacity  iused     ifree %iused  Mounted on
/dev/disk3s5       926  839        59    94% 30584802 620371840    5%   /System/Volumes/Data
```

The two new tests have 22 and 173 lines. New/untracked tests and this receipt are not included by ordinary git diff --stat until the dispatcher stages them. Final tracked diff: one additive registry line and two extra-repository lines. Final delivered paths: that registry, extra-repository.ts, the two new test files and this receipt. No existing test, pin, fingerprint, SQL, auth file, shared harness or unrelated tracked file has a final edit.

## Shell command audit

Each entry below is an actual shell invocation. Exit codes are the final shell/process status; a successful final pipeline can mask earlier diagnostics, so refusals and missing paths are separately described above. Read-only inspection commands have no test counts. Pending exec sessions were polled to completion; the three stalled global-pnpm probes were interrupted (130). All file edits used apply_patch successfully; no shell git-write command was invoked.

Invocation 1: exit 0.
```sh
pwd; git status --short; git branch --show-current; git rev-parse HEAD; git rev-parse origin/main; cat AGENTS.md; rg -n 'LOCK-ORDER|lock order|lane|M3-1|work.order|extra_origin' BUILD_PLAN.md | head -90
```

Invocation 2: exit 0.
```sh
cat package.json; cat packages/db/package.json; cat packages/db/src/extra-repository.ts; cat packages/db/src/work-order-repository.ts; cat packages/db/src/site-extra-repository.ts
```

Invocation 3: exit 0.
```sh
cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md; memory_pressure | tail -1; df -g /System/Volumes/Data; rg --files | rg '(lane|work-order.*test|extra.*test|offline-risk|vitest|test-setup)'
```

Invocation 4: exit 0.
```sh
cat packages/db/src/extra-repository.ts; sed -n '1,190p' packages/db/src/work-order-repository.ts; sed -n '1,110p' packages/db/src/site-extra-repository.ts
```

Invocation 5: exit 0.
```sh
cat package.json; cat packages/db/package.json; cat packages/db/vitest.config.ts; cat packages/db/test/work-order-concurrency.integration.test.ts; cat packages/db/test/site-extra-authority.integration.test.ts
```

Invocation 6: exit 0.
```sh
rg -n 'LOCK-ORDER|M3-1|tenant administration|lock order|§5.4|ENT-2|ENT-3' BUILD_PLAN.md; rg -n 'lock-order|work-order|site-extra|lane|codex/sandbox' config/agent-lane-assignments.json | tail -55; sed -n '1,125p' tools/agent-lane-boundary-lint.mjs; rg -n 'pg_advisory|raiseExtra|revoke|baseline|revision' packages/db/test/site-extra.integration.test.ts packages/db/test/work-order-import.integration.test.ts
```

Invocation 7: exit 0.
```sh
cat packages/db/test/work-order-concurrency.integration.test.ts
```

Invocation 8: exit 0.
```sh
sed -n '1,155p' packages/db/src/work-order-repository.ts; sed -n '1,70p' packages/db/src/site-extra-repository.ts
```

Invocation 9: exit 0.
```sh
sed -n '70,115p' packages/db/src/site-extra-repository.ts; sed -n '1,115p' packages/db/src/tenant-context.ts; sed -n '1,80p' tools/lint.mjs; sed -n '755,795p' BUILD_PLAN.md; sed -n '795,831p' BUILD_PLAN.md
```

Invocation 10: exit 0.
```sh
ls /opt/homebrew/bin/pnpm /usr/local/bin/pnpm; ls "$HOME/Library/pnpm/global/v11/933b1afb8467659abb23695dcb8cd7f3bad564cb27bb5c6843b75f41ac97b974/node_modules/pnpm/bin"; ls "$HOME/Library/pnpm/.tools/pnpm/9.0.0/bin"
```

Invocation 11: exit 0.
```sh
cat package.json; cat packages/db/package.json; cat packages/db/vitest.config.ts
```

Invocation 12: exit 0.
```sh
sed -n '1,165p' packages/db/test/site-extra-authority.integration.test.ts
```

Invocation 13: exit 0.
```sh
rg -n 'LOCK-ORDER|M3-1' BUILD_PLAN.md config/agent-lane-assignments.json; tail -65 config/agent-lane-assignments.json; sed -n '1,110p' tools/agent-lane-boundary-lint.mjs
```

Invocation 14: exit 1.
```sh
sed -n '65,100p' packages/db/migrations/0135_site_extra_authority.sql; sed -n '1,65p' packages/db/migrations/0122_extra_origin_persistence.sql; sed -n '360,392p' packages/db/migrations/0110_work_orders.sql; rg -n 'pg_advisory|FOR UPDATE|FOR SHARE' packages/db/src/contractor-repository.ts packages/db/migrations/0110_work_orders.sql; git branch -a --list '*m3-1*'; rg --files | rg 'offline-risk'
```

Invocation 15: exit 0.
```sh
cat packages/db/test/site-extra-fixtures.ts
```

Invocation 16: exit 0.
```sh
sed -n '1,145p' packages/db/test/extra-fixtures.ts
```

Invocation 17: exit 0.
```sh
node -e 'const c=require("./config/agent-lane-assignments.json"); console.log(JSON.stringify(Object.fromEntries(Object.entries(c.lanes).filter(([k])=>/lock-order|m3-1|ent-3a/.test(k))),null,2))'; rg -n '^## |^### |^#### .*ENT-2|M3-1|lock order|lock-order|^### 9.1|^### 5.' BUILD_PLAN.md | head -65
```

Invocation 18: exit 0.
```sh
git show origin/codex/sandbox/m3-1:packages/db/test/offline-risk.properties.integration.test.ts | head -220
```

Invocation 19: exit 0.
```sh
sed -n '63,145p' BUILD_PLAN.md; sed -n '198,269p' BUILD_PLAN.md; sed -n '302,312p' BUILD_PLAN.md; sed -n '755,830p' BUILD_PLAN.md; sed -n '862,889p' BUILD_PLAN.md
```

Invocation 20: exit 0.
```sh
sed -n '70,125p' packages/db/src/site-extra-repository.ts; sed -n '1,115p' packages/db/src/tenant-context.ts; rg -n 'STALE_REVISION|DATABASE_UNAVAILABLE' packages/core/src/site-extra.ts; sed -n '1,90p' tools/lint.mjs; head -12 config/agent-lane-assignments.json; cat packages/db/tsconfig.json; cat apps/api/package.json
```

Invocation 21: exit 130.
```sh
git merge-base --is-ancestor origin/codex/sandbox/m3-1 origin/main; git show origin/main:packages/db/src/extra-repository.ts | nl -ba | sed -n '63,110p'; git show origin/main:packages/db/src/work-order-repository.ts | nl -ba | sed -n '36,45p'; node --version; export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version
```

Invocation 22: exit 0.
```sh
command -v pnpm; ls -l "$HOME/Library/pnpm/bin/pnpm"; ls "$HOME/Library/pnpm"; ls node_modules/.bin/pnpm*; ps -o pid,ppid,etime,command -ax | rg 'pnpm|63711' | head -18
```

Invocation 23: exit 0.
```sh
cat "$HOME/Library/pnpm/bin/pnpm"; cat .npmrc; ls "$HOME/Library/pnpm/bin"; ls node_modules/.bin | head -15
```

Invocation 24: exit 1.
```sh
git merge-base --is-ancestor origin/codex/sandbox/m3-1 origin/main
```

Invocation 25: exit 0.
```sh
sed -n '140,210p' packages/db/src/site-extra-repository.ts; sed -n '1,90p' packages/core/src/site-extra.ts; rg -n 'LANE_BASE_REF|untracked|ls-files|diff' tools/agent-lane-boundary-lint.mjs | tail -18
```

Invocation 26: exit 130.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; npm_config_manage_package_manager_versions=false pnpm --version
```

Invocation 27: exit 130.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --manage-package-manager-versions=false --version
```

Invocation 28: exit 1.
```sh
ls "$HOME/Library/pnpm/.tools/pnpm/11.8.0/bin"; ls /private/tmp | rg 'pnpm|jg|jobguard' | head -30; ls "$HOME/Library/pnpm/global/v11/933b1afb8467659abb23695dcb8cd7f3bad564cb27bb5c6843b75f41ac97b974/node_modules"; ls /opt/homebrew/lib/node_modules; ls "$HOME/.local/share/pnpm/.tools/pnpm"
```

Invocation 29: exit 0.
```sh
ls -l /private/tmp/ch4-pnpm-bin; ls /private/tmp | rg 'pnpm' ; ls "$HOME/Library/pnpm/global/v11/933b1afb8467659abb23695dcb8cd7f3bad564cb27bb5c6843b75f41ac97b974/node_modules/@pnpm"; ls "$HOME/.cache/node/corepack"; ls "$HOME/Library/Caches/node/corepack"; head -25 "$HOME/Library/pnpm/.tools/pnpm/9.0.0/bin/pnpm"
```

Invocation 30: exit 0.
```sh
cat /private/tmp/ch4-pnpm-bin/pnpm; ls "$HOME/.cache/node/corepack/v1/pnpm"; ls /private/tmp/jg-r1-pnpm-bin; cat /private/tmp/jg-r1-pnpm-bin/pnpm; memory_pressure | tail -1; df -g /System/Volumes/Data
```

Invocation 31: exit 0.
```sh
chmod +x /private/tmp/jg-lock-order-1-bin/pnpm
```

Invocation 32: exit 1.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lock-order-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --version; pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lock-order-1.test.ts
```

Invocation 33: exit 0.
```sh
rg -n '^import .*@jobguard/' packages/db/src/contractor-repository.ts packages/db/src/contractor-party-repository.ts packages/db/src/*.ts | head -28; cat packages/core/package.json | head -24; cat packages/storage/package.json | head -24; git diff --stat
```

Invocation 34: exit 0.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lock-order-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm exec tsc -p packages/core/tsconfig.json
```

Invocation 35: exit 1.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lock-order-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lock-order-1.test.ts
```

Invocation 36: exit 0.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lock-order-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lock-order-1.test.ts
```

Invocation 37: exit 0.
```sh
sed -n '165,255p' tools/agent-lane-boundary-lint.mjs; git diff -- packages/db/src/extra-repository.ts packages/db/src/work-order-repository.ts config/agent-lane-assignments.json; rg -n 'deadlock|LOCK-ORDER' docs/contracts/work* docs/contracts/site-extra*; git status --short
```

Invocation 38: exit 0.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lock-order-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm exec turbo run typecheck --force
```

Invocation 39: exit 0.
```sh
git diff --check; nl -ba tools/agent-lane-boundary-lint.mjs | sed -n '208,218p'; rg -n 'function requireLiveJob|FOR UPDATE|FOR SHARE|pg_advisory' packages/db/src/watchdog.ts | head -16; sed -n '1,40p' packages/db/src/audit.ts
```

Invocation 40: exit 1.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lock-order-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; LANE_BASE_REF=origin/main pnpm lint --force
```

Invocation 41: exit 1.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lock-order-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; LANE_BASE_REF=origin/main pnpm lint:lanes
```

Invocation 42: exit 0.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lock-order-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; LANE_BASE_REF=origin/main pnpm exec turbo run lint --force
```

Invocation 43: exit 0.
```sh
node tools/money-arithmetic-lint.mjs; node tools/commercial-boundary-lint.mjs
```

Invocation 44: exit 0.
```sh
node --input-type=module -e 'import ts from "typescript"; import {readFileSync} from "node:fs"; for (const file of ["packages/db/test/lock-order-1.test.ts", "packages/db/test/lock-order-1.integration.test.ts"]) { const result=ts.transpileModule(readFileSync(file,"utf8"), {fileName:file, reportDiagnostics:true, compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}); const errors=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error); if(errors.length) {console.error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>process.cwd(),getNewLine:()=>"\n"})); process.exitCode=1;} else console.log(`${file}: syntax passed (not database execution or typechecking)`); }'
```

Invocation 45: exit 0.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lock-order-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm build --concurrency=2 --force
```

Invocation 46: exit 0.
```sh
python3 - <<'PY'
import hashlib, pathlib, subprocess
paths=['packages/db/migrations/0110_work_orders.sql','packages/db/migrations/0122_extra_origin_persistence.sql','packages/db/migrations/0135_site_extra_authority.sql','packages/db/src/site-extra-repository.ts','packages/core/src/watchdog.ts','packages/db/test/watchdog-command-harness.ts','packages/db/test/command-replay-contract.integration.test.ts','apps/api/src/auth/context-boundary.test.ts','tools/agent-lane-boundary-lint.mjs']
for p in paths:
    before=hashlib.sha256(subprocess.check_output(['git','show','origin/main:'+p])).hexdigest()
    after=hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
    print(p, before, after, 'UNCHANGED' if before==after else 'CHANGED')
PY
```

Invocation 47: exit 1.
```sh
tail -65 AGENTS.md; sed -n '107,145p' BUILD_PLAN.md; sed -n '1,90p' docs/contracts/site-extra-v1.md; sed -n '1,70p' docs/contracts/work-order-v1.md
```

Invocation 48: exit 0.
```sh
rg -n 'extra-repository|work-order-repository|config/agent-lane|lock-order' apps/api/src/auth/context-boundary.test.ts; rg --files docs/contracts | rg '(work-order|contractor|extra-origin)'
```

Invocation 49: exit 0.
```sh
sed -n '45,112p' apps/api/src/auth/context-boundary.test.ts; rg -n 'APPROVED|PINNED|expectedHash|createHash|SHA|digest|pins|fingerprint|hash' apps/api/src/auth/context-boundary.test.ts | head -38; sed -n '1,100p' docs/contracts/work-order-import-v1.md
```

Invocation 50: exit 0.
```sh
python3 - <<'PY'
import hashlib,subprocess,pathlib
p='packages/db/src/work-order-repository.ts'
print('main',hashlib.sha256(subprocess.check_output(['git','show','origin/main:'+p])).hexdigest())
print('working',hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest())
PY
sed -n '640,667p' apps/api/src/auth/context-boundary.test.ts
```

Invocation 51: exit 1.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lock-order-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lock-order-1.test.ts
```

Invocation 52: exit 1.
```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lock-order-1-bin:$PATH"; memory_pressure | tail -1; df -g /System/Volumes/Data; pnpm openapi:check
```

Invocation 53: exit 0.
```sh
git rev-parse HEAD; git diff --check; git diff --stat; git status --short; shasum -a 256 packages/db/src/work-order-repository.ts; wc -l packages/db/test/lock-order-1.test.ts packages/db/test/lock-order-1.integration.test.ts; memory_pressure | tail -1; df -g /System/Volumes/Data
```

Final verification invocation: exit 0; 5 delivered paths, pinned work-order bytes equal main; this is an inventory check, not the refused lane-checker result.
```sh
git diff --check; git diff --stat; git status --short; git rev-parse HEAD; shasum -a 256 packages/db/src/work-order-repository.ts packages/db/src/extra-repository.ts packages/db/test/lock-order-1.test.ts packages/db/test/lock-order-1.integration.test.ts; python3 - <<'PY'
import json,pathlib,subprocess
config=json.loads(pathlib.Path('config/agent-lane-assignments.json').read_text())
assert config['lanes']['lock-order-1']['branches']==['codex/sandbox/lock-order-1']
expected={'config/agent-lane-assignments.json','packages/db/src/extra-repository.ts','packages/db/test/lock-order-1.test.ts','packages/db/test/lock-order-1.integration.test.ts','docs/verdicts/LOCK-ORDER-1/BUILDER_RECEIPT.md'}
changed=set(subprocess.check_output(['git','diff','--name-only'],text=True).splitlines())
changed.update(subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines())
assert changed==expected,(changed,expected)
assert pathlib.Path('packages/db/src/work-order-repository.ts').read_bytes()==subprocess.check_output(['git','show','origin/main:packages/db/src/work-order-repository.ts'])
print('Final delivered paths match receipt (5); pinned work-order source equals main. This is an inventory check, not a lane-checker pass.')
PY
```

Final HEAD (no task commit): `2a230bb522c2c1146c0d0741ed374237176ff02c`.


## r-dec45 — dispatcher 13 repair (16 October 2026)

Ben's decision 45 as quoted in the repair order; PR #226. This section supersedes the earlier held-mapping status. Starting/final HEAD remains `bd02384853a950acfc3e38490fd75a62b66debc8`, with `origin/main` at `760fe6f52cb1364540c72092c3c882532d9b9d27`; working tree was initially clean. No Git writes, install, migration, permission, route, UI or provider changes.

Only the following line changes occur in the two repair files:

```diff
# packages/db/src/work-order-repository.ts:42
-  if (e.code === "40001") return new WorkOrderError("STALE_REVISION");
+  if (e.code === "40001" || e.code === "40P01") return new WorkOrderError("STALE_REVISION");
# apps/api/src/auth/context-boundary.test.ts:92
-  "packages/db/src/work-order-repository.ts": "4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3",
+  "packages/db/src/work-order-repository.ts": "9e4d46c5290e25647d714810d67b2efee6f674a1d52f654142297d22c476e22e",
```

Old SHA-256: `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3`. New SHA-256: `9e4d46c5290e25647d714810d67b2efee6f674a1d52f654142297d22c476e22e`. Confirmed test hashing at lines 98/734: SHA-256 of UTF-8 source text; computed from the new bytes with Python hashlib and confirmed with `shasum -a 256 packages/db/src/work-order-repository.ts`.

Both paths were absent from the `lock-order-1` allow list. Added only `packages/db/src/work-order-repository.ts` and `apps/api/src/auth/context-boundary.test.ts` to that list in `config/agent-lane-assignments.json:197`; all other configuration, including its historical note, is unchanged. No other pin, count, fingerprint, comment or test changed.

Commands used the existing `/private/tmp/jg-lock-order-1-bin/pnpm` launcher on PATH, with `COREPACK_ENABLE_NETWORK=0`: installed pnpm 10.28.1, Node v24.17.0; no dependency download or clean reinstall. Results:

| Command | Exit/result |
| --- | --- |
| `pnpm exec turbo run typecheck --force` (once) | 0; 7/7 tasks, no cache hits |
| `LANE_BASE_REF=origin/main pnpm lint --force` (once; includes `turbo run lint --force`) | 0; boundary checks and 7/7 tasks, no cache hits |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 0; lock-order-1 passed |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; lock-order-1 passed |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/auth/context-boundary.test.ts` | 0; 145/145 passed |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lock-order-1.test.ts` | 0; 4/4 passed |
| `pnpm build --concurrency=2` | 0; 7/7 tasks, 2 cache hits; Next production build completed |
| `pnpm openapi:check` | 1; tsx launcher IPC socket denied (`listen EPERM`) by sandbox |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | First attempt 1: stale core build lacked `customerMessageInputV1`; repeated after the running build refreshed core: 0, same OpenAPI check without launcher socket |
| `git diff --check`; deterministic exact-byte/scope inspection | 0; only the two specified repair lines, two allow-list additions and this appended receipt section |

Full check logs: `/private/tmp/jg-lock-order-1-r-dec45-{typecheck,lint,context-boundary,db-unit,build,openapi,openapi-node,openapi-after-core-build}.log`. Turbo emitted sandbox cache IO warnings; Next emitted workspace-root/dependency warnings; successful exit codes above are the actual results.

Database integration/migration and browser suites NOT RUN: dispatcher reserves these for GitHub CI because this sandbox cannot start PostgreSQL or bind localhost. Lock-order/audit and typed retry guarantees are affected; no schema, data migration, public signature or operational alert change. No independent model verdict or technical acceptance is claimed: both checkers must confirm the exact committed repair scope after the dispatcher commits. Intended conventional commit message overwritten at `/private/tmp/jg-msg-lock-order-1.txt`.


## r-owntests — dispatcher 13 own-test repair (16 October 2026)

PR #226; starting/final uncommitted HEAD `36ca6182a5b676868ff63ca8c5be672eb0a83258`, branch `codex/sandbox/lock-order-1`; working tree initially clean. This section records the repair ordered after CI run `38897748993`, following the already-reviewed decision-45 repair. It is builder evidence, not an independent verdict or acceptance.

Only `packages/db/test/lock-order-1.integration.test.ts` and this appended receipt section change. All three scenarios reuse ENT-3's merged `siteFixture(c)` and `f.members.operative`, establishing the same imported live work-order baseline, assignment and actor/grant setup as the governed site-extra integration tests. The shared fixture/harness itself is untouched. Both the observer pool in (a) and the three single-session pools in (c)/(d) now use `{ ...c.runtime.options, password: c.runtime.options.password, max: 1 }`, as merged multi-connection tests do (for example `job-work-state-sources.integration.test.ts` and `job-sources.integration.test.ts`). Installed pg-pool explicitly defines `options.password` as non-enumerable; object spread alone drops it. In (a), `logSiteExtra` maps an unclassified connection error to `SITE_EXTRA_UNAVAILABLE`, so that pool also requires the credential fix. No CI credential or URL is hardcoded or logged.

Read AGENTS.md, BUILD_PLAN §§2.2–2.4, 5.6, ENT-2, ENT-3 and ENT-4b, the CI failure excerpt, and the merged extra-origin/site-extra fixtures and tests. An exact-diff check against HEAD confirms that every assertion, accepted error code, round count, backend-PID check, lock observation and audit/state check is unchanged; only imports, fixture/actor selection and credential propagation differ. No product code, merged test, pin/hash/count/fingerprint, lane configuration, migration, data contract, operational alert, public interface or release policy changes. No Git writes, dependency downloads, PostgreSQL startup, browser startup or external provider calls.

Environment: Node `v24.17.0`, installed pnpm `10.28.1`, reused dependencies. Commands use `/private/tmp/jg-lock-order-1-bin` on PATH and `COREPACK_ENABLE_NETWORK=0`. No clean install is claimed. Logs are `/private/tmp/jg-lock-order-1-r-owntests-*.log`.

| Command / check | Actual result |
| --- | --- |
| `pnpm exec turbo run typecheck --force` | Exit 0; 7/7 tasks, none cached. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | Exit 0; boundary checks and 7/7 package tasks, none cached. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Exit 0; lock-order-1 passed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0; lock-order-1 passed. |
| `pnpm build --concurrency=2` | Exit 0; 7/7 tasks, 2 cached; Next production build completed. Existing sandbox cache IO and Next workspace/CSS warnings remain. |
| `node --test tools/*.test.mjs` | Exit 0; 100/100 passed. |
| `pnpm -r --workspace-concurrency=2 exec vitest run --maxWorkers=1 --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'` | Exit 1; generated core `dist` copies were collected: 2 generated-source lookup failures / 5,062 passed in core; config/storage also passed. Source-only retry below corrects selection without changing tests or tooling. |
| Same recursive command with additional `--exclude '**/dist/**'` | Exit 1 overall: core 2,532/2,532, config 1/1, storage 2/2, AI fixtures 85/85, DB 305/305 passed. API: 77 files passed, 8 failed; 1,643 tests passed, 108 failed, 23 skipped, 108 unhandled listen errors. Six failing HTTP files require prohibited socket binding (`EPERM` / Supertest null port); the other two suites (`final-account-lock.isolation.test.ts`, `shadow-isolation.application.test.ts`) attempt database fixtures but stop at `freePort` before PostgreSQL starts. These tests are unchanged and still require CI. Web had not run when recursive execution stopped. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1 --exclude '**/dist/**' --exclude '**/*.integration.test.ts'` | Exit 0; 36 files, 812/812 tests passed. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src/auth/context-boundary.test.ts` | Exit 0; 145/145 passed. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lock-order-1.test.ts` | Exit 0; 4/4 passed, including both retryable SQLSTATE mappings. |
| `pnpm openapi:check` | Exit 1; tsx launcher IPC `listen EPERM`, before the OpenAPI check runs. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same OpenAPI comparison without the IPC launcher. |
| Offline installed-pg pool construction check (`pnpm --filter @jobguard/db exec node --input-type=module -e ...`) | Exit 0; confirms password is non-enumerable and the repaired copy preserves password, database, runtime user and `max: 1`; no connection opened and no credentials printed. This is not a database test. |
| Exact-diff inspection against HEAD | Exit 0; only fixture/actor selection, imports and explicit password propagation; all assertions unchanged. |

The socket-dependent API failures are in `src/health.test.ts`, `src/auth/sso/action-paths.test.ts`, `src/contractor/contractor-practice-session.http.test.ts`, `src/contractor/site-extra-pricing.http.test.ts`, `src/contractor/site-extra.http.test.ts`, and `src/contractor/site-visit.http.test.ts`. They and the two database isolation suites need the normal CI environment. `free-port.test.ts` was excluded from the local source-unit selection because it intentionally binds localhost. No exclusion or optionality was added to repository/CI configuration. Full root `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and browser suites are not claimed as locally passing; PostgreSQL integration/migrations and browser execution remain CI-only here.

After the dispatcher commits/pushes, CI must pass **all three unchanged tests** in `packages/db/test/lock-order-1.integration.test.ts` (targeted reproduction: `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/lock-order-1.integration.test.ts`):

- `[LOCK-ORDER-1(a)] holds the shared tenant administration lock before the origin foreign key can lock the work order`: observe `[true]` immediately before the actual origin insert.
- `[LOCK-ORDER-1(c)] 50 same-instant captures and baseline revisions use separate connections and leave consistent committed state`: retain 50 successful captures/revisions, 51 revisions, distinct backend sessions, complete origin/variation/scope/receipt/event/baseline/audit joins and valid audit chain.
- `[LOCK-ORDER-1(d)] M31-S15 same-instant capture, revoke and revise have explicit outcomes`: retain four simultaneous rotated rounds, committed revoke/revise, only the existing explicit capture outcomes, no partial effects, post-revocation NOT_FOUND and valid audit chains.

CI must also preserve the 4/4 `lock-order-1.test.ts` and 145/145 context-boundary results, and the existing full checks (root `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, OpenAPI and browser coverage). The separate known `[S9] scanner and seven pinned bridges stay byte-identical` failure in `extra-origin.integration.test.ts` is deliberately untouched: this repair does not resolve it, repin either source, or claim green full CI. That coordinator ruling remains required before full technical acceptance. New committed bytes require independent review bound to the dispatcher's exact commit and separate acceptance; neither is claimed here.

Intended conventional commit message overwritten at `/private/tmp/jg-msg-lock-order-1.txt`. Only this test and the appended `r-owntests` receipt are handed back for the dispatcher to commit; no Git write command was run.


## r-ruling54 — coordinator ruling 54, dispatcher 13 (16 October 2026)

PR #226; explicit repair order under coordinator ruling 54, following Ben's decision 45. Starting HEAD `a8505bf949f2dc895422865bba9a6c7e1efdbfd6`, branch `codex/sandbox/lock-order-1`; working tree initially clean. Read AGENTS.md and applicable BUILD_PLAN command/audit, acceptance and contractor task contracts. This is builder evidence, not an independent verdict or technical acceptance.

`shasum -a 256 packages/db/src/work-order-repository.ts apps/api/src/auth/context-boundary.test.ts` confirmed both expected hashes exactly. Only these two lines change in `packages/db/test/extra-origin.integration.test.ts`, within `[S9] scanner and seven pinned bridges stay byte-identical`:

```diff
# line 248
-   "packages/db/src/work-order-repository.ts": "4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3",
+   "packages/db/src/work-order-repository.ts": "9e4d46c5290e25647d714810d67b2efee6f674a1d52f654142297d22c476e22e",
# line 252
-   "apps/api/src/auth/context-boundary.test.ts": "a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35"
+   "apps/api/src/auth/context-boundary.test.ts": "ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2"
```

The `lock-order-1` lane lacked this test path. Added only `packages/db/test/extra-origin.integration.test.ts` to its allow list; the historical lane note and all other lane configuration remain unchanged. No other test or production file changes. Exact-content comparison against HEAD verifies the two replacements and the single allowance addition. Affected invariant: preserve earlier byte-pinning guarantees with the explicitly authorized current bytes. No migration, backwards-compatibility impact, new operational alert, provider action or release enablement.

Environment: Node `v24.17.0`, installed pnpm `10.28.1`, reused dependencies; no clean install or download. Commands use the existing `/private/tmp/jg-lock-order-1-bin/pnpm` launcher with `COREPACK_ENABLE_NETWORK=0`. Logs: `/private/tmp/jg-lock-order-1-r-ruling54-*.log`.


| Command / check | Actual result |
| --- | --- |
| `shasum -a 256 packages/db/src/work-order-repository.ts apps/api/src/auth/context-boundary.test.ts` | Exit 0; both hashes match the order's expected values. |
| `pnpm typecheck --force` | Exit 0; 7/7 tasks passed, none cached. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | Exit 0; boundary checks and 7/7 package tasks passed, none cached. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Exit 0; lock-order-1 passed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0; lock-order-1 passed. |
| `node --test tools/*.test.mjs` | Exit 0; 100/100 passed. |
| `pnpm build --concurrency=2` | Exit 0; 7/7 tasks passed, 2 cached; Next production build completed. Sandbox cache IO and Next dependency/CSS warnings were emitted. |
| `pnpm openapi:check` | Exit 1; tsx launcher IPC `listen EPERM` before the comparison runs. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same OpenAPI comparison without the IPC launcher. |
| Offline S9 file comparison using Node SHA-256 | Exit 0; all eight pinned files match. Deterministic file check only, not PostgreSQL execution. |
| Exact-content comparison against HEAD | Exit 0; only two test line replacements and one lane allowance addition. |
| `pnpm -r --workspace-concurrency=2 exec vitest run --maxWorkers=1 --exclude '**/dist/**' --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts' --exclude '**/health.test.ts' --exclude '**/auth/sso/action-paths.test.ts' --exclude '**/contractor/*.http.test.ts' --exclude '**/final-account-lock.isolation.test.ts' --exclude '**/shadow-isolation.application.test.ts'` | Exit 0; core 2,532/2,532, config 1/1, storage 2/2, AI fixtures 85/85, DB units 305/305, API 1,625/1,625 and web 812/812 passed (5,362 total). Context-boundary and lock-order unit tests are included. |
| Final `git diff --check` and scope inspection | Exit 0; exactly the authorized test, lane file and append-only receipt changed; HEAD unchanged. |

The local unit selection excludes generated build copies, PostgreSQL integration suites, the free-port socket test, and the previously documented HTTP/socket and PostgreSQL isolation tests. These are command-line selections only; no test, assertion, suite configuration or CI requirement was weakened. Full root `pnpm test`, database/migration suites, S9's enclosing PostgreSQL integration suite and browser suites are NOT claimed as locally executed or passing: PostgreSQL and socket/browser execution remain GitHub CI work after the dispatcher commits/pushes. Fixture AI checks are not a live-model evaluation. All existing release gates and exact-commit independent review/separate acceptance requirements remain held.

Final HEAD remains `a8505bf949f2dc895422865bba9a6c7e1efdbfd6`. Intended conventional commit subject/body overwritten at `/private/tmp/jg-msg-lock-order-1.txt`. No Git write command was run; the dispatcher owns commit/push. This section supersedes only the prior receipt's outstanding ruling for the two S9 pins; it does not assert green full CI or technical acceptance.
