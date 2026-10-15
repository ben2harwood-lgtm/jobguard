Built by Codex; dispatched 13 Oct 2026; prepared 15 Oct 2026.

# LP-1 builder receipt — preparatory work only

**PARTIAL, NOT ACCEPTED.** Q1 fixture role/access and Q3 access treatment remain HELD. No migration, runner, grant or seed change. Real customer data remains blocked by the whole LP track and G1.

The dispatch requested an opener attributing this work to Claude Sonnet 5.5 with Codex unavailable. That attribution would be false; this receipt identifies the actual builder.

## Base and prerequisites

Initial and final HEAD: `9865e4b32b71c75b763240bcdf27bd6a75b42f34`, branch `codex/sandbox/lp-1`. Initial worktree was clean. No git writes, commit or push; no implementation commit exists yet to bind a verdict to. Intended commit message: `/private/tmp/jg-msg-lp-1.txt`.

PLAN-LPL #174 merge `a778d64c4439c4cf3e149962e67ef49ae969bfbe` and content commit `3485f5277c4a02541e977f2d130644a7dbcda130` are in main history. The local plan branch now points to `8b39d0c792ab5ee2b288d9817ca8c19d8db68d03`; dispatch and adopted main govern over a moving branch. LP-0 #208 merge `a8b6b365c1c50f8a3b4f47122a7b62a2626bdf7e`, #214 merge `9f6d01ddfa1eccbca164c54a33c9376cf185c30a`: prerequisites met per issued header. Their receipts are source evidence, not this builder's independent acceptance.

The issued checkout has 86 registered migrations, highest `0157_extra_approval.sql`; the draft's end-at-0138 statement is stale and main wins. Reservation is **0162**, replacing both draft placeholders; 0159–0161 belong to other pieces. No LP-1 SQL file exists.

During checks, shared `origin/main` advanced to `6671538c8d69936c162368c760dd6ce0f7f10493` (ENT-5b #217 / 0158). Worktree HEAD stayed on the issued base. The newer main touches 13 files, including shared lane, migration notes/runner, LP-0 inventory, watchdog row and tenancy catalogue rows. Its `xa_covers` membership join and `xa_begin` authority/receipt/advisory-lock helpers were source-inspected. That diff changes no preceding account/membership ACL or seed role. Main's newer content wins at dispatcher integration; none was overwritten. No execution against a rebased newer schema is claimed.

An initial receipt-only preservation comparison against moving origin/main failed at `packages/db/src/migrate.ts`. The corrected comparison uses the exact issued base. This is disclosed; no permanent pin or merged assertion was changed.

Node v24.17.0; pinned pnpm 10.28.1 from existing corepack cache; TypeScript 5.8.3; Vitest 4.1.11. Embedded PostgreSQL package 16.10.0-beta.15 is installed; **no PostgreSQL server version was executed here**. No install/download. Default pnpm 11 wrapper stalled twice and was interrupted (130). Task-owned `/private/tmp/jg-lp1-bin/pnpm` selects cached 10.28.1 for later commands and children; no repo script/lockfile changed.

## Scope and grants

Nine allowed paths: three additive shared edits (lane first, dated §12.2 reservation, appended pending migration note), four new test files, contract and receipt. UI parked; no HTTP route, watchdog row, caller, schema, seed or operational alert change. No data migration or compatibility cutover performed.

**Every new migration GRANT: none.** No migration or new callable production mutation routine. Standard F: no new runtime object INSERT/UPDATE/DELETE grant on money, membership, authorization, receipt or audit tables.

Disposable test setup grants, separately from migration grants; NOT EXECUTED here:

- Refusal file: `GRANT jobguard_runtime TO lp1_inherited_login`; inherits existing runtime powers, no object privilege addition, not Q1's proposed fixture role.
- Lock file: `GRANT jobguard_runtime TO lp1_lock_login`; same boundary.
- Seed test invokes unchanged bootstrap setup; adds no new grant SQL.
- Rolled-back update-effect trigger helper revokes PUBLIC EXECUTE and grants none. No production bypass.

Owner setup is separately authenticated. Runtime RLS assertions execute as runtime, never as superuser. No Q1 fixture role/powers were added.

## Tests first and acceptance

All four test files precede any corresponding production implementation; that implementation remains unbuilt. Database first runs: **NOT RUN (cannot start PostgreSQL here)**, not passed or accepted failures.

Comparator fixture first run: **1 failed**, `ReferenceError: compareSnapshots is not defined`, before helper implementation (not a behavioral red). After helper: **1 passed**, two PostgreSQL tests filtered out. Two-file non-DB run initially failed suite import because `@jobguard/core` was not built. After required forced build, same filtered run: **2 passed**, **3 PostgreSQL tests filtered out**. Eight database tests in the two unselected files were also not run. No source skip/skip-if-unavailable logic hides requirements.

Temporary TypeScript config checked all four new test sources, which ordinary package src-only checks exclude. First run exit 2: one invalid-context parameter inference error. Explicit `string` annotation fixed new test source; next run exit 0. No merged assertion changed.

| IDs | Preparation | Status |
|---|---|---|
| AC-01–05 | Five exact-title runtime refusal/grant/no-op-effect tests; named/inherited roles; canonical committed-state comparison | PostgreSQL NOT RUN, Q3 post-change proof HELD. Receipt/audit snapshots in refusal fixture include empty sets. |
| AC-06–07 | Exact-title four lock strengths, both tables, observed waits, commit/rollback; tenant/context/pool and rolled-back restrictive UPDATE policy | PostgreSQL NOT RUN; Q1 backstop conversion/Q3 proof HELD. |
| AC-08 | Real member read and eligibility/message/follow-up membership-wait entry points | PostgreSQL NOT RUN; full successful business/trigger/audit-order proof still needs unchanged suites. |
| AC-09 | Real non-superuser bootstrap; effective role/session observed before real SQL; four rows/rerun/runtime continuation/FORCE RLS | PostgreSQL NOT RUN; conversion HELD. SQL results are not mocked. |
| AC-10 | Preconnection environment/target refusal, import side effect and focused startup source checks | 1 non-DB test passed. Deployment credential proof remains pending. |
| AC-11 | Populated identities/account/member and command/audit history; named columns/full types/PKs; own-step security; later runner twice | PostgreSQL NOT RUN; migration absent/HELD; representative commercial fingerprints and exact helper/trigger catalogue delta remain incomplete. |
| AC-12 | Same comparator used by pure fixtures and rolled-back real PostgreSQL precision/type/add-column/function/later-insert controls | Pure fixture 1 passed; real controls NOT RUN; AC-12 not complete. |
| AC-13–16 | Earlier fingerprint/identity/SCIM/replay/lock suites preserved | NOT RUN, no post-withdrawal proof. |
| AC-17 | Lane/diff and 25 protected-file SHA comparisons; earlier lane objects identical | Local evidence, integration with moving main pending. |
| AC-18 | Truthful receipt and runnable checks | PARTIAL: OpenAPI sandbox refusal, database/CI/RED verdict/separate acceptance outstanding. |

## Checks executed

| Check | Exit | Result |
|---|---|---|
| `pnpm exec turbo run typecheck --force` | 0 | 7 successful, **0 cached** |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0 | 7 successful, **0 cached** |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0 | Purity, lane, money/commercial boundaries |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Nine allowed paths, merge-base comparison against newer main ref |
| `pnpm build --concurrency=2 --force` | 0 | 7 successful, **0 cached**, 38.368s |
| Own four test-source TypeScript check | 0 | After one new-source correction |
| Own filtered non-DB Vitest controls, two files, `--maxWorkers=2` | 0 | 2 passed; 3 DB tests filtered out |
| `pnpm openapi:check` | 1 | STOP: tsx IPC `listen EPERM`, before generation |
| `git diff --check` | 0 | Final rerun below |

Turbo emitted shared-cache `WARNING IO error: Operation not permitted (os error 1)` while all forced task compilers/builds executed and exited 0; no cache relocation/retry. Existing Next warnings include inferred workspace root, CSS autoprefixer/cache serialization, and dependency dynamic require. No unrelated warning source edited. Recorded free memory was at least 47% before heavy commands, disk at least 66 GB, above the thresholds. Build/tests ran serially. No PostgreSQL/browser was started; filtered controls invoke no database hooks.

## STOP / coordinator-owned prerequisites

**Q1 HELD**, `packages/db/test/tenancy.integration.test.ts:97–102,112–123,127–137,159–166`. Exact before at 114: `await withTenant(runtime, context(TENANT_A), async (database) => {`; 119 executes runtime UPDATE and 120/122 require one changed/deleted row. Hidden UPDATE at 98 and DELETE at 128 expect zero; 166 expects `synthetic failure`. **After: no authorized replacement line until Ben chooses the fixture role/access and dispatcher supplies its exact lane.** Preserve every RLS/FK/rollback assertion. No setup/assertion changed here.

**Q2 STOP**, `packages/db/test/audit-export.integration.test.ts:105–108`, assertion 277. Exact before at 106:

```ts
      && !was.columnGrants.some(old => old.column === grant.column && old.fact === grant.fact)) {
```

Proposed technical after, documentation only:

```ts
      && !was.columnGrants.some(old => old.column === grant.column && old.fact === grant.fact)
      && !was.facts.includes(grant.fact)) {
```

Matching table-wide grantee/privilege/grant-option facts cover retained column capability, without named-table exceptions. Separate coordinator authorization must preserve widening controls including line 154 and add the reduction control. No grant/Q3 approval follows from Q2.

**Q3 HELD**, `packages/db/src/demo-bootstrap.ts:92` before `await client.query("SET LOCAL ROLE jobguard_runtime");`; held proposed after `await client.query("SET LOCAL ROLE jobguard_migration");`, with runtime restored before line 99 as part of the integrated conversion. Migration `packages/db/migrations/0162_membership_account_closed.sql` and runner registration near `packages/db/src/migrate.ts:92` remain absent. No alternative lock routine implemented.

**Pinned-inventory STOP**, `docs/contracts/lp-0-effective-privileges-v1.json:114,115,117,263,264,266`: six obsolete table-write entries would need coordinator withdrawal and reviewed contingent column entries. Example exact before at 114:

```json
{"key":"acl|rel|table|app.account|jobguard_runtime|DELETE|-","group":"x-membership-account-writes"},
```

After: coordinator-pruned/reviewed entries bound to actual grant changes; exact after-values HELD with Q3, outside lane. Merged `packages/db/test/lp-0-grant-freeze.integration.test.ts:80–83` rejects stale entries; these assertions stay unchanged. No inventory or scanner pin workaround.

**Environment STOP**, `pnpm openapi:check`, exit 1:

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/21110.pipe
```

No alternative socket/command route tried. Earlier read-only `ps -axo pid,ppid,etime,command | rg 'pnpm|vitest|55219' | head -15` printed `zsh:5: operation not permitted: ps`; that inspection stopped, no alternate route. Enclosing shell exit 0 reflects its final pipeline, not successful process inspection.

## Source inspection, not execution

- Draft's `0000_tenancy.sql:82`, bootstrap 92–97/99, recovery-case 56/74–77, message 367, follow-up 351, practice-feed 139/157, eligibility 0119:81 and 0130:32 findings survive on issued main. Message owner query starts at 366; follow-up function starts at 348. Another recovery command holds membership at 126–127.
- SCIM 0137:71/78/98 retains identity-side locks/revocation/identity-only EXECUTE. Later 0150 adds membership authority guard (7/25) and replaces identity provision/current-membership/invite behavior. Do not reimplement it or count its narrower refusals as LP-1 closure.
- Existing migration-owner tenant policies are in 0054:177–178 and 0111:57–62; verifier selects each tenant explicitly under FORCE RLS. No new policy.
- Conflicting tenancy/audit-export assertions remain. Newer main adds only later tenancy catalogue rows, not fixes to those assertions.
- `docs/contracts/final-account-lock-v1.md:44` confirms rule 9 verbatim. Upgrade comparator uses canonical text/full types/captured PKs, ignores later rows and permits later columns/functions. It asserts nonempty compared fixtures.
- LP-0 inventory receipt records existing exception `x-membership-account-writes`. Its MD line 349 names `demo-seed.ts` for the four writes; actual affected source is `demo-bootstrap.ts:93–97`. Main source wins, pinned demo-seed unchanged.

## NOT RUN and remaining gates

Every PostgreSQL portion: **NOT RUN (cannot start PostgreSQL here, as issued)**. No restricted attempt or held migration was used. Own-file-only rule also reserves unchanged regressions for dispatcher/CI. Exact files are listed below. No six-site-extra-property claim is made. Browser/Playwright: **NOT RUN, founder 15 October CI-only rule and sandbox cannot start a browser**.

`pnpm install --frozen-lockfile`: NOT RUN, installed dependencies/no downloads instruction. Aggregate `pnpm test`, `pnpm test:db`, `pnpm test:migrations`: NOT RUN, dispatcher/CI only. No CI results independently obtained. No native/model/prompt change; corresponding changed-feature evaluations inapplicable without making earlier mandatory suites optional.

Shared owner: dispatcher/coordinator serializes lane/ledger/runner/inventory and merged tests; builder only edited this worktree's authorized preparation. No separate concurrent editing owner was appointed by builder. Integrate newer #217 content first, obtain Q1/Q3 rulings and exact Q2/inventory lanes, then implement grant/lock/seed group together. Reinspect callers and run all proofs on integrated exact commit.

## Builder self-inspection (requested self-review; no independent verdict)

Source-inspected: no production SQL/route/seed change, no new business authority, no merged assertion/pin/fingerprint change, no lock downgrade. Hashes below are receipt evidence, not permanent tests. New refusal tests keep the adopted outcomes against currently broader grants. Empty linked-effect snapshots, partial positive-caller coverage, missing representative commercial upgrade fixtures and unavailable PostgreSQL execution limit proof. Compilation and two non-DB controls do not prove grants/RLS/concurrency/identity integration.

Remaining: Q1/Q3, coordinator Q2/inventory changes, full integrated implementation and remaining fixtures/proofs, moving-main integration, actual PostgreSQL 16 fresh/populated upgrade and AC-12 controls, OpenAPI, mandatory CI/browser suites, fresh Opus plus Sol exact-commit verdicts, separate acceptance, entire LP track/G1. LATER: member-management UI belongs to later scope.

No acceptance or independent review is claimed. The requested own-migration proof remains explicitly incomplete. Final HEAD is the issued base, not a fabricated implementation SHA.

## Files NOT RUN

All paths below are relative to `packages/db/test/`; all database suites/portions NOT RUN for the issued PostgreSQL restriction.

- `lp1-membership-account.integration.test.ts`
- `lp1-lock-compatibility.integration.test.ts`
- `lp1-seed.integration.test.ts`
- `lp1-upgrade.integration.test.ts`
- `fingerprinted-row-shape.integration.test.ts`
- `demo-bootstrap.integration.test.ts`
- `tenancy.integration.test.ts`
- `audit-export.integration.test.ts`
- `enterprise-identity.integration.test.ts`
- `command-replay-contract.integration.test.ts`
- `proof-replay.integration.test.ts`
- `match-inbox-replay.integration.test.ts`
- `watchdog-lock-order.integration.test.ts`
- `watchdog-migration-owner.integration.test.ts`
- `commands.integration.test.ts`
- `recovery-case-join.integration.test.ts`
- `recovery-cases.workbench.integration.test.ts`
- `recovery-messages.integration.test.ts`
- `recovery-follow-up-upgrade.integration.test.ts`
- `recovery-message-upgrade.integration.test.ts`
- `recovery-eligibility-v3.integration.test.ts`
- `site-extra.integration.test.ts`
- `extra-origin.integration.test.ts`
- `extra-origin-upgrade.integration.test.ts`
- `contractor-session-context.integration.test.ts`
- `identity.integration.test.ts`
- `scim-deactivation.integration.test.ts`
- `scim-deactivation-access.integration.test.ts`
- `scim-deactivation-concurrency.integration.test.ts`
- `scim-deactivation-upgrade.integration.test.ts`
- `UIWIRE-12.integration.test.ts`
- `work-order-import.integration.test.ts`

The seed and upgrade files had only their non-DB controls executed, as mapped above. Also NOT RUN under own-file-only dispatch rule: `packages/db/test/contractor-session-context.test.ts`, `apps/api/src/auth/context-boundary.test.ts`, `apps/api/src/auth/identity.test.ts`, `apps/api/src/watchdog-registry.test.ts`.

## Preservation hashes and actual diff statistics

All 25 protected files match issued HEAD byte-for-byte; other lane entries also match issued HEAD. No permanent test pins added. Hashes measure the checkout, not the moving main ref.

| Preserved path | SHA-256 (base = working tree) |
|---|---|
| `packages/db/src/demo-bootstrap.ts` | `9483925dff922727c19875f885fe256a40631eb44cedb9312863d82612c1bfaa` |
| `packages/db/src/migrate.ts` | `302f2cdcc2bfaa4a17ab730225404631634aa5ba02c9d027c20683fc79b03cc5` |
| `apps/api/src/auth/context-boundary.test.ts` | `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35` |
| `apps/api/src/auth/principal-bridge.ts` | `a0dafefa440ee16dbcca0d52f354ea6377f478c5bdaede47a956b9e27cf4ec54` |
| `apps/api/src/worker.ts` | `372532c1aa575ad775df66c50a32fecd5881d703fd00d80136608bea4bccbd8f` |
| `packages/db/src/tenant-context.ts` | `9237013c368deeec3d14098b030264dbd6cc3e57534e4cbc237cad06aa2b4b0f` |
| `packages/db/tools/synthetic-restore.mjs` | `b95e18b6e8794b2ca75e28990dfef38e8d77d98bb922ce185c55a128c85e11bd` |
| `packages/db/src/demo-seed.ts` | `6c4672e75c0af70accee37c05fbd95e2922ac00c9dc74bfa156721788b224da0` |
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` |
| `packages/db/src/contractor-repository.ts` | `56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c` |
| `packages/db/src/contractor-party-repository.ts` | `e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0` |
| `packages/db/src/work-order-repository.ts` | `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3` |
| `packages/db/src/sor-repository.ts` | `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5` |
| `packages/db/src/job-scheduling-repository.ts` | `ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d` |
| `packages/db/src/work-order-fixtures.ts` | `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386` |
| `packages/db/src/contractor-session-context.ts` | `a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c` |
| `packages/core/src/watchdog.ts` | `1628a2c3dc2d24cdb20c11ded7461a9206af9e71f918bff571ba51e66cf9aaf7` |
| `packages/db/test/watchdog-command-harness.ts` | `3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6` |
| `packages/db/test/command-replay-contract.integration.test.ts` | `db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f` |
| `packages/db/test/tenancy.integration.test.ts` | `cdc958e1afaf59c4c3f8545fc8db7c6414afa82c928b41afeade11cd999141ec` |
| `packages/db/test/audit-export.integration.test.ts` | `dadb5e37870aa5178b023b52c385731cb40403b6d8d73163e9270281b4d018ee` |
| `packages/db/test/extra-origin.integration.test.ts` | `119f5049f3c00e20c11220c44b915ce3ac52f0490d46c6401905bbf2c142836a` |
| `packages/db/test/fingerprinted-row-shape.integration.test.ts` | `be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8` |
| `docs/contracts/lp-0-effective-privileges-v1.json` | `7641b6b671938cdd7c2c76d465aab0b4b8f7ad29c6fd4b6ef96d3d63ff64124f` |
| `packages/db/test/lp-0-grant-freeze.integration.test.ts` | `a73ac807718653f39e5a541762a08f64eebf3fcf0fe27a840180f31a985e83fa` |

| Changed/new path | SHA-256 | Lines |
|---|---|---|
| `BUILD_PLAN.md` | `f161b122030648e9f67bdc21bedc98d06cb1789aa47e392522d0670f91425efb` | 4045 |
| `config/agent-lane-assignments.json` | `d008ec6496015cc25054e7d6d01a81b3d3bb675bc3423078dabb108bebaa2e40` | 191 |
| `packages/db/MIGRATIONS.md` | `330de47ffcc96ce7d12e5da4c9b3e0239956aa4720e051483c3e80f6b46ec8b4` | 1144 |
| `docs/contracts/least-privilege-membership-account-v1.md` | `a896649fc38b98fe77f249f48c0ad22705cc20dfef14331d9e640ba5bc0e3d66` | 120 |
| `packages/db/test/lp1-lock-compatibility.integration.test.ts` | `e199d491ed03ead1bb7c4bf137aae5981d2d0190220d4ee2b996b6d6b5695b58` | 162 |
| `packages/db/test/lp1-membership-account.integration.test.ts` | `54232eb1f0dd58d6c0a1e456ed680defef4d856a3c81424b7d36e017182b4a0c` | 196 |
| `packages/db/test/lp1-seed.integration.test.ts` | `b49b7e618a64ace3513890f765477823e616d9ab271f7b6a674e71957c58c8f4` | 133 |
| `packages/db/test/lp1-upgrade.integration.test.ts` | `f9fff45fbbfa00c66e64bc8a545cddac542e98f52a3bba95f07eb4e70f1f9477` | 198 |

Receipt excludes its own hash/stat to avoid self-reference. Actual `git diff --stat`, then `git diff --no-index --stat /dev/null <new-file>` per new file (expected exit 1):

```text
 BUILD_PLAN.md                      | 2 ++
 config/agent-lane-assignments.json | 1 +
 packages/db/MIGRATIONS.md          | 8 ++++++++
 3 files changed, 11 insertions(+)
 .../least-privilege-membership-account-v1.md       | 120 +++++++++++++++++++++
 1 file changed, 120 insertions(+)
 .../lp1-lock-compatibility.integration.test.ts     | 162 +++++++++++++++++++++
 1 file changed, 162 insertions(+)
 .../lp1-membership-account.integration.test.ts     | 196 +++++++++++++++++++++
 1 file changed, 196 insertions(+)
 .../db/test/lp1-seed.integration.test.ts           | 133 +++++++++++++++++++++
 1 file changed, 133 insertions(+)
 .../db/test/lp1-upgrade.integration.test.ts        | 198 +++++++++++++++++++++
 1 file changed, 198 insertions(+)
```

## Exact captured command ledger

Read batches report enclosing shell exit; missing guessed paths/globs and truncated output are not test passes. Session polling is not a new shell command. `apply_patch` edits are accounted for by scoped manifest. No git writes/install/escalation. Initial/diagnostic commands outside automatic capture follow the numbered ledger.

### Command 1 — exit 0

```sh
sed -n '280,380p' AGENTS.md
 sed -n '55,175p' BUILD_PLAN.md
 rg -n 'LP-1|LP-0|Standing rules from adoption|Compatible landing|Ledger amendment — PLAN-LPL' BUILD_PLAN.md
 rg --files docs/verdicts/LP-0
```

### Command 2 — exit 0

```sh
cat packages/db/test/demo-bootstrap.integration.test.ts
 cat packages/db/test/tenancy.integration.test.ts
```

### Command 3 — exit 0

```sh
cat packages/db/test/recovery-follow-up-upgrade.integration.test.ts
 cat packages/db/test/helpers.ts
 cat packages/db/vitest.config.ts
```

### Command 4 — exit 0

```sh
cat packages/db/src/demo-bootstrap.ts
 cat packages/db/migrations/0000_tenancy.sql
 cat packages/db/package.json
 cat package.json
```

### Command 5 — exit 0

```sh
rg --files docs/verdicts/LP-0
 rg -n 'LP-1|LP-0|Standing rules from adoption|Compatible landing|Ledger amendment — PLAN-LPL' BUILD_PLAN.md
 cat packages/db/test/helpers.ts
 cat packages/db/vitest.config.ts
 cat packages/db/tsconfig.json
```

### Command 6 — exit 0

```sh
cat docs/verdicts/LP-0/BUILDER_RECEIPT.md
 sed -n '3300,3335p' BUILD_PLAN.md
 sed -n '3600,3625p' BUILD_PLAN.md
 sed -n '1,150p' packages/db/test/demo-bootstrap.integration.test.ts
```

### Command 7 — exit 0

```sh
sed -n '1,125p' packages/db/test/recovery-follow-up-upgrade.integration.test.ts
 sed -n '1,110p' packages/db/test/recovery-case-join.integration.test.ts
 sed -n '1,110p' packages/db/test/recovery-messages.integration.test.ts
 cat packages/db/test/pool-test-utils.ts
 sed -n '3602,3618p' BUILD_PLAN.md
 rg -n 'account|membership' docs/contracts/lp-0-effective-privileges-v1.md
 tail -12 packages/db/src/migrate.ts
```

### Command 8 — exit 0

```sh
python3 - <<'PY'
from pathlib import Path
import json
p=Path('config/agent-lane-assignments.json')
s=p.read_text()
entry={'branches':['codex/sandbox/lp-1'],'test':'packages/db/test/lp1-membership-account.integration.test.ts','receipt':'docs/verdicts/LP-1/BUILDER_RECEIPT.md','note':'C1: database/server preparation only; UI parked, no new web workflow. Q1 fixture-role/access choice and Q3 access treatment HELD. No migration, runner registration, seed conversion, merged-test edit, pin or fingerprint change. Migration 0162 reserved by dispatcher; preparatory tests and comparator controls only; partial LP-1 acceptance is not claimed. Shared lane and ledger serialize with dispatcher.','allow':['BUILD_PLAN.md','config/agent-lane-assignments.json','packages/db/MIGRATIONS.md','packages/db/src/migrate.ts','packages/db/src/demo-bootstrap.ts','packages/db/migrations/0162_membership_account_closed.sql','packages/db/test/lp1-membership-account.integration.test.ts','packages/db/test/lp1-lock-compatibility.integration.test.ts','packages/db/test/lp1-seed.integration.test.ts','packages/db/test/lp1-upgrade.integration.test.ts','docs/contracts/least-privilege-membership-account-v1.md','docs/verdicts/LP-1/BUILDER_RECEIPT.md']}
assert '"lp-1":' not in s
lines=s.splitlines(keepends=True)
i=next(i for i,l in enumerate(lines) if l.startswith('"lp-0":'))
lines.insert(i+1,'"lp-1":'+json.dumps(entry,separators=(',',':'))+',\n')
p.write_text(''.join(lines))
PY
```

### Command 9 — exit 0

```sh
cat packages/db/migrations/0150_membership_authority_fix.sql
 sed -n '40,120p' packages/db/src/recovery-case-repository.ts
 sed -n '1,70p' packages/db/test/pool-test-utils.ts
 rg -n 'revoked_at|expires_at|membership.*UPDATE|account.*UPDATE' packages/db/migrations/{0004*,0015*,0137*,0150*}
 rg -n 'columnGrants|afterAllDifferences|same-tenant|synthetic failure|hidden account' packages/db/test/{audit-export,tenancy}.integration.test.ts
 rg -n '015[0-9]|016[0-9]' packages/db/src/migrate.ts
```

### Command 10 — exit 0

```sh
sed -n '40,105p' packages/db/src/recovery-case-repository.ts
 sed -n '1,70p' packages/db/test/tenancy.integration.test.ts
 sed -n '1,36p' packages/db/test/pool-test-utils.ts
 sed -n '1,65p' packages/db/migrations/0001_audit.sql
 rg -n 'guard|TRIGGER|membership' packages/db/migrations/014[4-9]* | head -25
 cat tsconfig.json
```

### Command 11 — exit 130

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
 memory_pressure | tail -1
 df -g /System/Volumes/Data
 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lp1-upgrade.integration.test.ts --testNamePattern='comparator fixtures'
```

Interrupted stalled default pnpm wrapper; no tests executed.

### Command 12 — exit 0

```sh
command -v pnpm
 ls -ld node_modules node_modules/.bin/vitest packages/db/node_modules/.bin/vitest
 ls /Users/benharwood/Library/pnpm/bin
 ls /Users/benharwood/Library/pnpm
 ps -axo pid,ppid,etime,command | rg 'pnpm|vitest|55219' | head -15
```

### Command 13 — exit 1

Working directory: `packages/db`.

```sh
./node_modules/.bin/vitest run --maxWorkers=2 test/lp1-upgrade.integration.test.ts --testNamePattern='comparator fixtures'
```

1 failed comparator fixture (compareSnapshots undefined), before helper.

### Command 14 — exit 0

```sh
sed -n '1,42p' packages/db/test/recovery-messages.integration.test.ts
 sed -n '1,45p' packages/db/test/recovery-eligibility-v3.integration.test.ts
 rg -n 'async read|async preview|constructor|requireOwner' packages/db/src/recovery-{message,follow-up}-repository.ts
 sed -n '105,135p' packages/db/test/recovery-case-join.integration.test.ts
```

### Command 15 — exit 0

```sh
rg -n 'export async function appendAuditBatch' packages/db/src/audit.ts
 cat packages/db/test/upgrade-proof-utils.ts | head -90
 sed -n '110,150p' packages/db/src/recovery-message-repository.ts
 sed -n '200,235p' packages/db/src/recovery-follow-up-repository.ts
 rg -n 'recoveryEligibilityCommandV1|action: z.literal|action:.*review' packages/core/src/recovery-eligibility.ts
```

### Command 16 — exit 0

```sh
ls -l /opt/homebrew/bin/pnpm /opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs /usr/local/bin/pnpm
 memory_pressure | tail -1
 df -g /System/Volumes/Data
```

### Command 17 — exit 0

Working directory: `packages/db`.

```sh
./node_modules/.bin/vitest run --maxWorkers=2 test/lp1-upgrade.integration.test.ts --testNamePattern='comparator fixtures'
```

### Command 18 — exit 0

```sh
head -36 packages/core/src/recovery-eligibility.ts
 rg -n 'version:|followUpId|expectedRevision' packages/core/src/recovery-follow-up.ts | head -18
 rg -n 'bootstrapSyntheticDemo|demo-bootstrap|MIGRATION_DATABASE_URL|ownerUrl' apps/api/src/{worker.ts,main.ts} apps/web/next.config.* packages/db/src/demo-runtime.ts
 rg -n 'stale inventory|staleEntries|reductions|COLUMN_GRANT_ADDED' packages/db/test/lp-0-grant-freeze.integration.test.ts packages/db/test/lp-0-catalog.ts
 sed -n '90,130p' packages/db/test/tenancy.integration.test.ts
 tail -7 packages/db/MIGRATIONS.md
```

### Command 19 — exit 1

```sh
rg -n 'bootstrapSyntheticDemo|MIGRATION_DATABASE_URL|demo-bootstrap' apps/api/src/main.ts apps/api/src/worker.ts packages/db/src/demo-runtime.ts
 rg -n 'CREATE POLICY.*account|CREATE POLICY.*membership|ALTER POLICY.*tenant_isolation' packages/db/migrations/000[0-3]*
 sed -n '72,87p' packages/db/test/lp-0-grant-freeze.integration.test.ts
 node -p 'JSON.stringify(require("./node_modules/.pnpm/lock.yaml"))'
```

### Command 20 — exit 130

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
 pnpm --version
 ls -ld /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1 /Users/benharwood/Library/pnpm/.tools/pnpm/10.28.1 /Users/benharwood/.local/share/pnpm/.tools/pnpm/10.28.1
```

Interrupted stalled pnpm --version wrapper.

### Command 21 — exit 1

Working directory: `packages/db`.

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
 memory_pressure | tail -1
 df -g /System/Volumes/Data
 ./node_modules/.bin/vitest run --maxWorkers=2 test/lp1-upgrade.integration.test.ts test/lp1-seed.integration.test.ts --testNamePattern='comparator fixtures|owner seed preparation'
```

### Command 22 — exit 0

```sh
rg -n 'account|membership' packages/db/migrations/0002_commands.sql
 sed -n '1,55p' packages/db/src/demo-seed.ts
 rg -n 'account.*policy|migration.*account|ALTER POLICY tenant_isolation|migration_all' packages/db/migrations | head -20
 sed -n '350,382p' packages/db/src/recovery-message-repository.ts
 rg -n 'const version|COMMAND_VERSION' packages/core/src/recovery-follow-up.ts
 sed -n '45,73p' packages/db/test/lp-0-grant-freeze.integration.test.ts
```

### Command 23 — exit 0

```sh
ls /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin
 rg -n 'CREATE TABLE.*recovery_case' packages/db/migrations/000*.sql
 rg -n 'account|membership' packages/db/migrations/0002_identity.sql | head -15
```

### Command 24 — exit 0

```sh
rg -n '(account|membership).*jobguard_migration|tenant_isolation.*TO jobguard_runtime,jobguard_migration' packages/db/migrations/000*.sql | head -16
 rg -n 'CREATE TABLE app.recovery_case|CREATE TABLE IF NOT EXISTS app.recovery_case' packages/db/migrations | head -6
 sed -n '35,62p' packages/db/migrations/0005_commands.sql
 sed -n '1,80p' packages/db/test/evidence-pack-fixture.ts
 cat tools/lint.mjs | head -55
```

### Command 25 — exit 0

```sh
rg -n 'account|membership|migration_identity' packages/db/migrations/0002*
 rg -n 'app.account|app.membership' packages/db/migrations | rg -i 'POLICY|FORCE|SECURITY|TO jobguard|GRANT|migration' | head -32
 sed -n '5,22p' packages/db/migrations/0018_recovery_outcomes.sql
 sed -n '35,58p' packages/db/migrations/0005_commands.sql
```

### Command 26 — exit 0

```sh
rg --files packages/db/migrations | sort | head -10
 rg -n 'POLICY|FOREACH|account|membership' packages/db/migrations/0002*.sql
 rg -n 'POLICY.*account|POLICY.*membership|FOREACH.*account.*membership' packages/db/migrations
 sed -n '1,60p' docs/contracts/lp-0-effective-privileges-v1.json
```

### Command 27 — exit 0

```sh
sed -n '52,65p' packages/db/migrations/0111_persisted_identity.sql
 sed -n '172,180p' packages/db/migrations/0054_contractor_organisation.sql
 rg -n 'expires_at|revoked_at' packages/db/migrations/0150_membership_authority_fix.sql | head -6
 python3 - <<'PY'
from pathlib import Path
p=Path('/private/tmp/jg-lp1-bin')
p.mkdir(exist_ok=True)
f=p/'pnpm'
f.write_text('#!/bin/sh\nexec node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs "$@"\n')
f.chmod(0o755)
PY
 export PATH="$HOME/Library/pnpm/bin:$PATH"
 export PATH="/private/tmp/jg-lp1-bin:$PATH"
 pnpm --version
```

### Command 28 — exit 0

```sh
git log origin/main --format='%H %s' --grep='LP-0' --grep='PLAN-LPL'
 git rev-parse codex/sandbox/plan-lpl
 rg -n 'staleEntries|reductions' packages/db/test/lp-0-grant-freeze.integration.test.ts | head -6
 rg -n 'x-membership-account-writes|app.account.*(INSERT|UPDATE|DELETE)|app.membership.*(INSERT|UPDATE|DELETE)' docs/contracts/lp-0-effective-privileges-v1.json | head -9
 rg -n 'llp|lp1|0162' config/agent-lane-assignments.json
```

### Command 29 — exit 0

```sh
head -50 packages/db/src/audit.ts
 rg -n 'export.*AuditEventInput|auditPayload|references:' packages/core/src/audit.ts | head -15
 git log origin/main --format='%H %s' --grep='#208' --grep='#174'
 git diff --stat
```

### Command 30 — exit 0

```sh
python3 - <<'PY'
from pathlib import Path
p=Path('BUILD_PLAN.md')
s=p.read_text()
marker='### 12.3 The graph (synthetic work, buildable after adoption)'
assert s.count(marker)==1
s=s.replace(marker,'**Ledger amendment — LP-1, 15 October 2026 (dispatcher reservation; preparatory work only).** The issued header reserves **0162** (`membership_account_closed`) on `codex/sandbox/lp-1`, base `9865e4b32b71c75b763240bcdf27bd6a75b42f34`. Q1 fixture-role/access disposition and Q3 access-treatment confirmation remain HELD. No migration, registration, grants or seed conversion is implemented by this preparatory piece. The compatible grant/lock/seed group and its post-change acceptance remain pending; the dispatcher serializes the lane, inventory, runner and ledger at integration and renumbers if needed. Whole-track and G1 real-data gates remain closed.\n\n'+marker)
p.write_text(s)
p=Path('packages/db/MIGRATIONS.md')
with p.open('a') as f:
 f.write('''\n## 0162 — LP-1 membership/account closure (RESERVED; implementation and rollout pending)\n\nThe 13 October dispatch, updated 15 October, reserves 0162. There is no LP-1 SQL file or runner registration in this preparatory piece. Q1 (merged tenancy-fixture role/access disposition) and Q3 (immutable-column treatment under standard F) remain HELD. Existing runtime writes and seed roles are unchanged. New preparatory tests assert the intended outcomes and are expected to fail against preceding grants; they are not accepted failures or proof of closure.\n\nIf separately released, the proposed integrated group withdraws account/membership table writes, rejects every created_at update (including no-op), retains only proven locking-column UPDATE, and converts all four bootstrap rows to the separately authenticated migration owner. No business table/column/backfill is proposed. Existing row locks, RLS boundaries, identity routines and audit ordering must survive. The alternative lock routine needs a revised exact lane.\n\nRollout remains pending: grant protection, seed conversion and approved fixture/comparator/inventory changes land together, after real-role and populated upgrade proofs. Do not apply a standalone revoke. Forward fixes retain the withdrawal; never restore broad runtime writes. No current deployment or real-data authority follows from this note. See docs/contracts/least-privilege-membership-account-v1.md.\n''')
PY
```

### Command 31 — exit 2

```sh
python3 - <<'PY'
from pathlib import Path
import json
root=Path.cwd()
Path('/private/tmp/jg-lp1-tests.tsconfig.json').write_text(json.dumps({'extends':str(root/'tsconfig.json'),'compilerOptions':{'noEmit':True},'include':[str(root/'packages/db/test'/name) for name in ['lp1-membership-account.integration.test.ts','lp1-lock-compatibility.integration.test.ts','lp1-seed.integration.test.ts','lp1-upgrade.integration.test.ts']]}))
p=root/'docs/verdicts/LP-1'
p.mkdir(parents=True,exist_ok=True)
(p/'BUILDER_RECEIPT.md').write_text('''Built by Codex; dispatched 13 Oct 2026; prepared 15 Oct 2026.\n\n# LP-1 builder receipt — preparatory work only\n\n**PARTIAL, NOT ACCEPTED.** Q1 fixture role/access and Q3 access treatment remain HELD. No migration, runner, grant or seed change. Real customer data remains blocked by the whole LP track and G1.\n\nThe dispatch requested an opener attributing this work to Claude Sonnet 5.5 with Codex unavailable. That attribution would be false; this receipt identifies the actual builder.\n\nVerification results and exact command ledger are appended after execution.\n''')
PY
 export PATH="$HOME/Library/pnpm/bin:$PATH"
 export PATH="/private/tmp/jg-lp1-bin:$PATH"
 memory_pressure | tail -1
 df -g /System/Volumes/Data
 pnpm exec tsc -p /private/tmp/jg-lp1-tests.tsconfig.json
```

Own test-source compilation: 1 invalid-context parameter type error.

### Command 32 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
 export PATH="/private/tmp/jg-lp1-bin:$PATH"
 memory_pressure | tail -1
 df -g /System/Volumes/Data
 pnpm exec tsc -p /private/tmp/jg-lp1-tests.tsconfig.json
```

Own four new test files compile, after explicit string annotation.

### Command 33 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
 export PATH="/private/tmp/jg-lp1-bin:$PATH"
 memory_pressure | tail -1
 df -g /System/Volumes/Data
 pnpm exec turbo run typecheck --force
```

Forced typecheck: 7 successful, 0 cached; Turbo cache IO warnings.

### Command 34 — exit 0

```sh
python3 - <<'PY'
from pathlib import Path
import re
p=Path('packages/db/src/migrate.ts')
names=re.findall(r'new URL\("../migrations/([^\"]+)"',p.read_text())
print('Registry:',len(names),'highest:',max(names))
for path,needles in {
 'packages/db/src/recovery-case-repository.ts':['async listForMember','FOR SHARE`,[context.tenantId'],
 'packages/db/src/recovery-message-repository.ts':['const owner = await'],
 'packages/db/src/recovery-follow-up-repository.ts':['private async requireOwner'],
 'packages/db/migrations/0106_practice_feed.sql':['FOR SHARE;'],
 'packages/db/migrations/0119_recovery_eligibility_v3.sql':['FOR SHARE;'],
 'packages/db/migrations/0130_recovery_eligibility_v3_f17_timing.sql':['FOR SHARE;'],
 'packages/db/migrations/0137_scim_deactivation.sql':['FOR UPDATE LOOP','UPDATE app.membership','GRANT EXECUTE'],
 'docs/contracts/final-account-lock-v1.md':['An upgrade proof proves'],
}.items():
 for i,line in enumerate(Path(path).read_text().splitlines(),1):
  if any(n in line for n in needles): print(f'{path}:{i}: {line[:185]}')
PY
```

### Command 35 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
 export PATH="/private/tmp/jg-lp1-bin:$PATH"
 memory_pressure | tail -1
 df -g /System/Volumes/Data
 LANE_BASE_REF=origin/main pnpm exec turbo run lint --force
```

Forced lint: 7 successful, 0 cached; Turbo cache IO warnings.

### Command 36 — exit 0

```sh
sed -n '30,41p' packages/db/test/audit-export.integration.test.ts
 sed -n '95,110p' packages/db/test/audit-export.integration.test.ts
 sed -n '71,82p' packages/db/test/lp-0-grant-freeze.integration.test.ts
 sed -n '111,123p' docs/contracts/lp-0-effective-privileges-v1.json
 git status --short
```

### Command 37 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
 export PATH="/private/tmp/jg-lp1-bin:$PATH"
 LANE_BASE_REF=origin/main node tools/lint.mjs
```

### Command 38 — exit 0

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
 export PATH="/private/tmp/jg-lp1-bin:$PATH"
 memory_pressure | tail -1
 df -g /System/Volumes/Data
 pnpm build --concurrency=2 --force
```

Forced build: 7 successful, 0 cached; existing Turbo/cache/Next warnings.

### Command 39 — exit 0

```sh
node -p 'JSON.stringify(require("./apps/api/package.json").scripts)'
 git diff -- BUILD_PLAN.md packages/db/MIGRATIONS.md
 rg -n 'INSERT INTO app.account|INSERT INTO app.membership|SET LOCAL ROLE jobguard_runtime|app.job\(' packages/db/src/demo-bootstrap.ts | head -10
 git diff --check
```

### Command 40 — exit 1

```sh
python3 - <<'PY'
from pathlib import Path
import hashlib, json, subprocess
paths=['packages/db/src/demo-bootstrap.ts','packages/db/src/migrate.ts','apps/api/src/auth/context-boundary.test.ts','apps/api/src/auth/principal-bridge.ts','apps/api/src/worker.ts','packages/db/src/tenant-context.ts','packages/db/tools/synthetic-restore.mjs','packages/db/src/demo-seed.ts','packages/db/src/practice-session.ts','packages/db/src/contractor-repository.ts','packages/db/src/contractor-party-repository.ts','packages/db/src/work-order-repository.ts','packages/db/src/sor-repository.ts','packages/db/src/job-scheduling-repository.ts','packages/db/src/work-order-fixtures.ts','packages/db/src/contractor-session-context.ts','packages/core/src/watchdog.ts','packages/db/test/watchdog-command-harness.ts','packages/db/test/command-replay-contract.integration.test.ts','packages/db/test/tenancy.integration.test.ts','packages/db/test/audit-export.integration.test.ts','packages/db/test/extra-origin.integration.test.ts','packages/db/test/fingerprinted-row-shape.integration.test.ts','docs/contracts/lp-0-effective-privileges-v1.json','packages/db/test/lp-0-grant-freeze.integration.test.ts']
rows=[]
for path in paths:
 before=subprocess.check_output(['git','show','origin/main:'+path])
 after=Path(path).read_bytes()
 assert before==after,path
 rows.append({'path':path,'sha256':hashlib.sha256(after).hexdigest()})
previous=json.loads(subprocess.check_output(['git','show','origin/main:config/agent-lane-assignments.json']))
now=json.loads(Path('config/agent-lane-assignments.json').read_text())
# Preserve the registry object shape; only the lp-1 line may differ.
def strip_lane(value):
 if isinstance(value,dict): return {k:strip_lane(v) for k,v in value.items() if k!='lp-1'}
 if isinstance(value,list): return [strip_lane(v) for v in value]
 return value
assert strip_lane(previous)==strip_lane(now)
Path('/private/tmp/jg-lp1-preservation.json').write_text(json.dumps(rows,indent=2)+'\n')
print('Preserved:',len(rows),'specified files; all other lane entries unchanged.')
print(subprocess.check_output(['git','diff','--stat'],text=True))
PY
```

### Command 41 — exit 0

```sh
git rev-parse HEAD
 git rev-parse origin/main
 git log origin/main --format='%H %s' -5
 git diff HEAD origin/main --stat
 git diff HEAD origin/main -- packages/db/src/migrate.ts packages/db/src/demo-bootstrap.ts packages/db/migrations/0000_tenancy.sql
 git status --short
```

### Command 42 — exit 0

```sh
git show origin/main:packages/db/migrations/0158_extra_approval_chain.sql | rg -n 'membership|account|FOR SHARE|GRANT|created_at' | head -26
 git show origin/main:packages/db/src/extra-approval-chain-repository.ts | rg -n 'membership|FOR SHARE|transaction|audit' | head -15
 git diff HEAD origin/main -- packages/db/test/tenancy.integration.test.ts
 export PATH="$HOME/Library/pnpm/bin:$PATH"
 export PATH="/private/tmp/jg-lp1-bin:$PATH"
 LANE_BASE_REF=origin/main pnpm lint:lanes
```

### Command 43 — exit 0

```sh
git show origin/main:packages/db/migrations/0158_extra_approval_chain.sql | sed -n '115,148p'
 export PATH="$HOME/Library/pnpm/bin:$PATH"
 export PATH="/private/tmp/jg-lp1-bin:$PATH"
 memory_pressure | tail -1
 df -g /System/Volumes/Data
 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lp1-upgrade.integration.test.ts test/lp1-seed.integration.test.ts --testNamePattern='comparator fixtures|owner seed preparation'
```

### Command 44 — exit 1

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"
 export PATH="/private/tmp/jg-lp1-bin:$PATH"
 pnpm openapi:check
```

### Command 45 — exit 0

```sh
sed -n '42,68p' packages/db/test/audit-export.integration.test.ts
 nl -ba packages/db/test/tenancy.integration.test.ts | sed -n '110,140p'
 python3 - <<'PY'
from pathlib import Path
import hashlib,json,subprocess
base='9865e4b32b71c75b763240bcdf27bd6a75b42f34'
paths=['packages/db/src/demo-bootstrap.ts','packages/db/src/migrate.ts','apps/api/src/auth/context-boundary.test.ts','apps/api/src/auth/principal-bridge.ts','apps/api/src/worker.ts','packages/db/src/tenant-context.ts','packages/db/tools/synthetic-restore.mjs','packages/db/src/demo-seed.ts','packages/db/src/practice-session.ts','packages/db/src/contractor-repository.ts','packages/db/src/contractor-party-repository.ts','packages/db/src/work-order-repository.ts','packages/db/src/sor-repository.ts','packages/db/src/job-scheduling-repository.ts','packages/db/src/work-order-fixtures.ts','packages/db/src/contractor-session-context.ts','packages/core/src/watchdog.ts','packages/db/test/watchdog-command-harness.ts','packages/db/test/command-replay-contract.integration.test.ts','packages/db/test/tenancy.integration.test.ts','packages/db/test/audit-export.integration.test.ts','packages/db/test/extra-origin.integration.test.ts','packages/db/test/fingerprinted-row-shape.integration.test.ts','docs/contracts/lp-0-effective-privileges-v1.json','packages/db/test/lp-0-grant-freeze.integration.test.ts']
rows=[]
for path in paths:
 before=subprocess.check_output(['git','show',base+':'+path])
 after=Path(path).read_bytes()
 assert before==after,path
 rows.append({'path':path,'sha256':hashlib.sha256(after).hexdigest()})
previous=json.loads(subprocess.check_output(['git','show',base+':config/agent-lane-assignments.json']))
now=json.loads(Path('config/agent-lane-assignments.json').read_text())
def strip_lane(value):
 if isinstance(value,dict): return {k:strip_lane(v) for k,v in value.items() if k!='lp-1'}
 if isinstance(value,list): return [strip_lane(v) for v in value]
 return value
assert strip_lane(previous)==strip_lane(now)
changed=subprocess.check_output(['git','diff','--name-only',base],text=True).splitlines()
assert changed==['BUILD_PLAN.md','config/agent-lane-assignments.json','packages/db/MIGRATIONS.md'],changed
untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines()
assert len(untracked)==6,untracked
assert all(x.startswith(('packages/db/test/lp1-','docs/verdicts/LP-1/','docs/contracts/least-privilege-membership-account-v1.md')) for x in untracked)
manifest={'base':base,'observedMain':subprocess.check_output(['git','rev-parse','origin/main'],text=True).strip(),'preserved':rows,'changed':[],'stat':subprocess.check_output(['git','diff','--stat'],text=True)}
for path in changed+untracked:
 if path.endswith('BUILDER_RECEIPT.md'): continue
 manifest['changed'].append({'path':path,'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'lines':len(Path(path).read_text().splitlines())})
for path in untracked:
 if path.endswith('BUILDER_RECEIPT.md'):continue
 result=subprocess.run(['git','diff','--no-index','--stat','/dev/null',path],capture_output=True,text=True)
 assert result.returncode==1
 manifest['stat']+=result.stdout
Path('/private/tmp/jg-lp1-preservation.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('25 protected files match issued base; 3 bounded tracked edits; 6 new allowed files; other lanes identical.')
print(manifest['stat'])
PY
```

### Command 46 — exit 0

```sh
python3 - <<'PY'
from pathlib import Path
Path('/private/tmp/jg-msg-lp-1.txt').write_text('''test(db): prepare held LP-1 authority and lock proofs\n\nAdd actual-role refusal, row-lock/RLS, bootstrap-role and populated-upgrade\npreparatory tests, with exact named-column/type/identity comparator controls.\nRecord reservation 0162, the contract, executed evidence and coordinator holds.\n\nQ1 fixture access and Q3 access treatment remain held. No migration, grant,\nrunner registration, seed conversion, merged test, pin or fingerprint changes.\nDatabase proofs and integrated LP-1 acceptance remain pending.\n''')
PY
```

### Initial and additional diagnostic batches

Exit 0:

```sh
pwd
 git status --short
 git branch --show-current
 git rev-parse HEAD
 git rev-parse origin/main
 rg --files -g AGENTS.md -g '*LP-0*' -g '*lp0*' -g '*least-privilege*'
 df -g /System/Volumes/Data
 memory_pressure | tail -1
```

Exit 0:

```sh
cat AGENTS.md
 rg -n 'LP-1|LP-0|Standing rules from adoption|Compatible landing|Ledger amendment — PLAN-LPL|2.4|11.8' BUILD_PLAN.md
 rg --files docs/verdicts/LP-0 packages/db/test | head -65
 cat package.json
 cat packages/db/package.json
 cat config/agent-lane-assignments.json
```

Exit 0:

```sh
ls -l /Users/benharwood/Library/pnpm/bin/pnpm
 ls -l node_modules/.bin
 ls -l /Users/benharwood/Library/pnpm/.tools/pnpm/10.28.1/bin/pnpm 2>/dev/null
 sed -n '1,35p' .npmrc
 sed -n '1,20p' packages/db/node_modules/.bin/vitest
```

Exit 0:

```sh
cat /Users/benharwood/Library/pnpm/bin/pnpm
 node --version
 rg --files /Users/benharwood/Library/pnpm/global | head -8
```

Exit 1:

```sh
rg -n 'CREATE TABLE.*recovery_case\(|CREATE POLICY.*migration|ALTER POLICY tenant_isolation ON app.(account|membership)|RecoveryMessageActor' packages/db/migrations/000{3,5}* packages/db/src/recovery-message-repository.ts
 rg -n 'account|membership' packages/db/migrations/0003_recovery.sql | head -12
 sed -n '1,35p' packages/db/migrations/0005_commands.sql
 ls -ld /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1 /Users/benharwood/Library/pnpm/.tools/pnpm/10.28.1 /Users/benharwood/.local/share/pnpm/.tools/pnpm/10.28.1
```

### Receipt finalization

A Python write stored the captured ledger in `/private/tmp/jg-lp1-command-ledger.json` (exit 0); an initial receipt-generation Python command failed before writing with `JSONDecodeError: Extra data` (exit 1), caused by a literal trailing backslash-n in that task-owned JSON. A Python diagnostic printed its final bytes, replaced that suffix with a newline, and parsed 46 records (exit 0). Receipt content was then written with apply_patch and this append command (exit 0). This was a documentation-generation error, not a failed product check or a modified merged test. Python mutation snippets in the numbered ledger are the exact shell text used; the two receipt-generation snippets are described here to avoid self-referential duplication.

The final read-only verification command is recorded in the appendix below, including exit, HEAD, whitespace and file counts. No source changes followed the successful compiler/build/test runs.

## Final verification appendix

First finalization: new-file whitespace check rejected trailing spaces copied into the receipt's shell-command ledger (Python exit 1; enclosing read-only batch exit 0). Displayed trailing spaces were normalized; no test/product source changed. Tracked `git diff --check` passed in that batch.

Final command: task-owned Python receipt finalization, with `git diff --check`, `git diff --name-only HEAD`, `git ls-files --others --exclude-standard`, and `git rev-parse HEAD` executed through checked subprocesses. New-file whitespace checked on all six new files. Finalization exit 0; 3 tracked additive edits, 6 allowed new files, no migration. HEAD `9865e4b32b71c75b763240bcdf27bd6a75b42f34`; last observed main `6671538c8d69936c162368c760dd6ce0f7f10493`. Last memory/disk readings: 58% free, 63 GB available. Receipt self-hash omitted. No independent verdict or acceptance is asserted.
