Built by Codex; dispatched 13 Oct 2026; prepared 15 Oct 2026.

The catch-up record at the end of this file supersedes the earlier base, blocker and coverage statements below. Earlier commands/results remain historical evidence, not current validation.

# LP-2 — tests-first preparation; enforcement STOPPED

The requested Claude Sonnet attribution would be inaccurate; the actual builder is named above. No acceptance, independent verdict, completed insertion group or real-data protection is claimed.

## Base and scope

Initial and final HEAD: `cbd336611aa21c1a9a54f72df0863c172080c0e4`, exactly the issued `origin/codex/sandbox/lp-1` parent. Observed `origin/main`: `6671538c8d69936c162368c760dd6ce0f7f10493`. Branch: `codex/sandbox/lp-2`. The working tree began clean. BUILD-AHEAD supersedes the draft's merged-parent prerequisite, but supplies no authority to edit parent files or coordinator-owned merged tests. No git write, commit, push, PR, provider call, deployment, approval, download or deletion command was performed.

Delivered: an additive LP-2 lane entry; the preparation contract; a new isolated PostgreSQL fixture; three tests-first integration files containing **36 declared test cases, zero executed**. Enforcement, migration `0168_unchecked_job_doors.sql`, migration registration, caller conversions and the upgrade proof are **not implemented** because the coordinator-owned prerequisites below are absent. No placeholder migration or passing substitute test was added.

The order explicitly says to stop on a needed coordinator prerequisite and continue independent work. Adding enforcement would invalidate merged fixtures; weakening those fixtures, exempting a shared owner, preserving the import flag or adding an owner service connection would violate the same order. The tests/contract are the independent preparation completed here. They are not a merge-ready implementation: several refusal cases are expected to fail on the current baseline.

## STOP — exact unchanged source and required after behavior

All findings here are source-inspected, not executed PostgreSQL results. No exact coordinator-owned fixture patch or reviewed expand-compatible rollout evidence accompanied dispatch. The required after descriptions below are requirements for the coordinator, **not approved code or edits made here**. This is a confirmed prerequisite list, not a claim that the coordinator's complete direct-insert inventory has been supplied.

1. `packages/db/test/migfix-4.integration.test.ts:24`, in the runtime transaction opened on line 23.

Before:

```ts
    await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional quote','quoting')", [tenant, job]);
```

Required after: separately supplied owner-connected setup or checked product creation prepares the identical quoting fixture. Keep the runtime scope/document/acceptance/disposition operations and every existing result, concurrency, rollback and revision assertion. The coordinator must supply the exact conversion; this builder may not edit the merged setup. An ordinary draft-only runtime guard cannot land while this unchanged setup requires quoting insertion.

2. `packages/db/test/quote-reacceptance-upgrade.integration.test.ts:25`, in the runtime transaction opened on line 24.

Before:

```ts
    await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional quote','quoting')", [tenant, job]);
```

Required after: coordinator-owned setup preserves that same quoting fixture and all acceptance/upgrade controls without a runtime direct insert. No alternate fixture role or function was invented here.

3. `packages/db/test/small-builder-origin.integration.test.ts:156`, inside `asTenant` (owner pool, lines 17–20).

Before:

```ts
    await db.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence) VALUES($1,$2,'Fictional No charge practice job','live',$3,'capture','imported',10000,'reference_fee_policy_v1',150)",[job,DEMO_TENANT_ID,auth.digest]);
```

Required after: a coordinator-supplied checked adoption fixture preserves the existing job identity, session ownership, imported lineage, live state, v1 net 10000/cap 150 and following pilot track binding. Shared owner identity cannot substitute for the exact insertion permit. Merely moving this already owner-connected SQL to another owner connection does not resolve it. The exact compatible fixture conversion remains coordinator-owned.

4. `packages/db/src/demo-bootstrap.ts:100–101` belongs to the unmerged parent, and the BUILD-AHEAD header forbids editing parent's files except additive exports.

Before:

```ts
    await client.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Practice kitchen','quoting') ON CONFLICT DO NOTHING", [DEMO_JOB_ID, DEMO_TENANT_ID]);
    await client.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',$1,'Kitchen extension','quoting'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',$1,'Loft conversion','quoting') ON CONFLICT DO NOTHING", [DEMO_TENANT_ID]);
```

Required after: dispatcher serializes the named compatible job-creation conversion with LP-1's seed repairs and explicitly makes that parent-file edit available. Preserve the existing visible state/revision and seed replay behavior; do not revert LP-1's account/membership conversion. No edit was made.

Q7 also requires coordinator-reviewed rollout evidence before enforcement. The contract describes a proposed expand-compatible sequence; it does not manufacture approval or claim the preceding deployment has been tested. The insertion group's replacement/caller/withdrawal changes must remain compatible together.

## Held work and acceptance map

| Criterion | Preparation/evidence |
|---|---|
| LP2-A02 | 16 cases: safe persisted draft; every prohibited status; revision; each pointer/money/policy field; combinations; refusal counts. NOT RUN; enforcement stopped. |
| LP2-A03 | 10 cases: fresh physical connection for unset/empty/false/malformed/enabled import flag; missing/empty/invalid/foreign tenant settings. NOT RUN. |
| LP2-A04 | Shared-owner imported and work-order refusal examples added. Exact private-permit substitution, reuse, shape, backend and transaction tests remain unbuilt with the permit implementation. NOT RUN; incomplete. |
| LP2-A05 | Current product adoption preservation and transaction rollback groundwork added. Complete actor/receipt/approval/parties negative matrix remains outstanding. NOT RUN; incomplete. |
| LP2-A06 | Actual inherited-runtime call of thirteen-argument signature expects SQL permission refusal; current adoption preserves weaker attestation, v1 100100/1502, parties, replay, immutable baseline and zero billing. NOT RUN. Revocation not implemented. |
| LP2-A12 | Current ENT-2 repository imports one live job, replays without changing counts; runtime and shared-owner direct insertion checks added. NOT RUN; existing role/client and full atomic failure regressions still required. |
| LP2-A13 | Existing home/sandbox ownership/state/revision, second-session read/mutation refusal and expired/revoked session creation refusal added. NOT RUN. Saved-v1 and bootstrap regression evidence remains outstanding. |
| LP2-A14/A15 | No new database objects or migration. Catalogue/permit and own-step upgrade proofs remain unbuilt, not passed or inapplicable to eventual implementation. |
| LP2-A16/A17 | Protected source, tests, pins and fingerprints unchanged against parent. Source preservation is not executed scanner/fingerprint verification. |
| LP2-A18/A19 | No contractor route/guard/registry or lock-order code changed. All six named replay/refusal properties and earlier lock-order/replay tests remain mandatory CI work, NOT RUN. |
| LP2-A01/A07/A08/A09 | Unbuilt under Q5. Broad transition and review caller unchanged. |
| LP2-A11 | Unbuilt under Q6. All four actor-less practice route bodies/signatures/callers unchanged. |
| LP2-A10/A20/A21 | Remain unaccepted as whole criteria. Independent permit work, full compatibility evidence, exact-commit RED verdicts and separate acceptance are still required. |

No changed model/prompt/parser, external action, native component, public endpoint or web workflow was introduced. UI remains parked. No real data or commercial capability is enabled. All LP and G1 release holds persist.

## Grants, routines and migrations

**New migration GRANTs: NONE.** Standard F: no new direct protected-table INSERT/UPDATE/DELETE grant or equivalent routine bypass is added. No production table, function, trigger, policy, default privilege or existing row is changed. No caller conversion or broad-transition withdrawal is claimed.

Disposable test setup only, listed separately: `GRANT jobguard_runtime TO lp2_login`. The restricted inherited login has no fixture writes and cannot assume the owner. All authority prerequisites are prepared by a separate owner connection; services retain only runtime credentials. No generic permit helper or environment-based test success switch exists.

No migration is applied, so there is no schema rollback. A future implementation needs additive forward repair, not restoration of unchecked grants. Migration 0168 remains the issued reservation. No BUILD_PLAN, migration ledger, export, scanner, pin or parent source file was edited.

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

The required canonical row text, full types, original primary-key identities, nonempty-table guards and rolled-back microsecond/retype/nullable-column/function/later-insert controls remain requirements for the future 0168 proof. No mocked comparison is labelled a PostgreSQL proof.

## Commands and results

Environment: Node `v24.17.0`; pinned cached pnpm `10.28.1`; Turbo `2.10.12`; TypeScript pin `5.8.3`; PostgreSQL test dependency `16.10.0-beta.15`. Dependencies were already installed; install/download was NOT RUN as directed. No socket, database or browser test was attempted. Test commands must run through `~/.local/bin/heavy-slot`, at most three files, `--maxWorkers=2`, in the dispatcher's permitted environment.

Every pnpm shell call started with `export PATH="$HOME/Library/pnpm/bin:$PATH"`. Successful pinned calls additionally used the **existing, unchanged** `/private/tmp/jg-lp1-bin` shim, whose executable target is the already cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. No download or signature-check exception was used.

| Actual invocation | Exit and count |
|---|---|
| Initial `pnpm --filter @jobguard/db exec tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2023 --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck test/lp-job-doors-fixtures.ts test/lp-job-doors.integration.test.ts test/lp-adoption-boundary.integration.test.ts test/lp-job-doors-compatibility.integration.test.ts` | 130, cancelled before compiler output; default launcher stalled. No test result. |
| Default-launcher `pnpm --version` | 130, cancelled after the same warning/stall; no version result. |
| Pinned `pnpm --version`, then the exact own-test tsc invocation above | 0; pnpm 10.28.1; four test/helper sources typechecked, zero tests executed. |
| `pnpm exec turbo run typecheck --force` | 0; 7 successful / 7, 0 cached; 25.487s. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; 10 inherited LP-1 paths refused. See below. No lane widening or alternate base was used to obtain green. |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0; 7 successful / 7, 0 cached; 17.85s. This is package lint, not a full root boundary-lint pass. |
| `pnpm build --concurrency=2 --force` | 0; 7 successful / 7, 0 cached; 52.438s. |
| `pnpm openapi:check` | 1; tsx's local pipe listen refused before generation; no OpenAPI parity result. |
| `node tools/core-purity-lint.mjs` | 0; 167 TypeScript files. |
| `node tools/money-arithmetic-lint.mjs` | 0; boundary check passed. |
| `node tools/commercial-boundary-lint.mjs` | 0; no findings/output. |
| `git diff --check` (three inspections before final receipt) | 0 each. |
| Python preservation inspection | 0; 23 protected files equal parent; every other lane entry preserved; every own path in lane. |

The forced typecheck, lint and build actually executed; none is a FULL TURBO cache hit. Turbo emitted cache IO `Operation not permitted (os error 1)` warnings; no alternative cache-writing route was attempted. Build also emitted existing Next workspace-root, CSS/autoprefixer, webpack serialization and Nest/file-type warnings. It completed successfully.

`memory_pressure | tail -1` and `df -g /System/Volumes/Data` preceded compilation/forced checks. Observed free memory 50–58%; free disk 58–62 GB. Limits were satisfied. Build and tests were never concurrent; no Vitest run occurred.

### Refusals, unchanged

Process inspection command:

```sh
cat /private/tmp/jg-lp1-bin/pnpm; ps -axo pid,ppid,command | rg '(pnpm|tsc --noEmit)' | head -18; cat /Users/benharwood/Library/pnpm/bin/pnpm
```

The shell reported `zsh:1: operation not permitted: ps`. The overall batch exited 0 because its final read succeeded; process inspection itself was refused. No alternate process-inspection route was attempted. Both previously launched pnpm calls were cancelled through their existing execution sessions (exit 130).

OpenAPI command refusal:

```text
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/65130.pipe
code: 'EPERM', syscall: 'listen'
```

No alternate tsx invocation or socket route was attempted. No automatic approval escalation was requested or rejected.

The unchanged lane checker compares committed parent history as well as the working tree. Against the requested `origin/main` it rejects these inherited LP-1 paths: BUILD_PLAN.md; docs/contracts/least-privilege-membership-account-v1.md; docs/contracts/lp-0-effective-privileges-v1.json; docs/verdicts/LP-1/BUILDER_RECEIPT.md; packages/db/migrations/0162_membership_account_closed.sql; packages/db/test/lp1-lock-compatibility.integration.test.ts; packages/db/test/lp1-membership-account.integration.test.ts; packages/db/test/lp1-seed.integration.test.ts; packages/db/test/lp1-upgrade.integration.test.ts; packages/db/test/tenancy.integration.test.ts. All equal the parent here. Root `pnpm lint` is not claimed green; its boundary stage remains blocked on parent landing. The explicit forced package lint and independent purity/money/commercial checks are recorded separately.

## NOT RUN and missing evidence

- `packages/db/test/lp-job-doors.integration.test.ts`: NOT RUN (cannot start PostgreSQL or bind sockets here); 16 cases declared.
- `packages/db/test/lp-adoption-boundary.integration.test.ts`: NOT RUN (same environment); 14 cases declared.
- `packages/db/test/lp-job-doors-compatibility.integration.test.ts`: NOT RUN (same environment); 6 cases declared.
- `lp-job-doors-upgrade.integration.test.ts`: not authored; migration/enforcement stopped on prerequisites. No executed upgrade proof.
- `lp-start-quote.integration.test.ts` and `lp-practice-doors.integration.test.ts`: not authored under Q5/Q6; no held behavior tested as if decided.
- The unchanged `lp-0-grant-freeze.integration.test.ts` and `lp-0-authority-paths.integration.test.ts`: NOT RUN (PostgreSQL unavailable; only own-piece tests locally). Actual grant-freeze CI command: `~/.local/bin/heavy-slot lp-2 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lp-0-grant-freeze.integration.test.ts`.
- All unchanged prescribed regressions are NOT RUN (same PostgreSQL/own-piece-only restriction): fingerprinted-row-shape, tenancy, demo-bootstrap, review, job-import, job, work-order-import, practice-session, site-extra, command-replay-contract, proof-replay, match-inbox-replay, commands, watchdog-lock-order and watchdog integration files. Existing pack/message, allocation, restore and financial-source regressions also remain mandatory CI work, NOT RUN.
- Authentication `context-boundary.test.ts` and API `watchdog-registry.test.ts`: NOT RUN (unchanged tests, outside own-piece local allowance). Hash/source inspection below is not scanner execution.
- Whole `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, restore and broader regression runs: NOT RUN (dispatcher-only whole suites; PostgreSQL unavailable). No script was changed or made optional.
- Browser/e2e/Playwright for both projects: NOT RUN (CI only; cannot start a browser here). No new workflow requires a new UI spec.
- No failed-first PostgreSQL assertion was observed. Environment restrictions are not represented as the intended negative assertion failing. Source inspection predicts baseline failures but is not an executed test.
- Fresh exact-commit Opus and Sol RED verdicts, exact committed diff, reviewed subset rollout evidence and separate technical acceptance: absent. The dispatcher must commit before requesting exact-commit review. Full LP-2 acceptance remains held.

## Source anchor recheck and builder self-inspection

The draft's old baseline ec6ad4d does not select implementation here; the header's parent wins. Anchors were rechecked with `git show origin/main:<path>` and source reads. Differences from the draft: ConfirmProposalReview.mutate is at review-repository.ts:63, its transition at :80 (rather than :52/:68); current adoption starts 0095_job_parties.sql:261 (rather than :259); trusted database constant is demo-bootstrap.ts:10 (rather than :11). Main wins. Other object locations confirmed: broad transition 0003:70; JobRepository.transition:21; capture confirmation:16; imported guard 0020:30; old adoption 0020:40; current repository SQL:13; recovery demo 0023:17; latest legacy landing 0097:38; reversal 0018:68; illustration 0024:15; work_order_begin 0110:341; practice issuer 0094:45; sandbox insert:26. These are source-inspected statements only.

Builder self-inspection: own tracked diff is one additive lane line; six new files with this receipt. Parent source and all merged tests remain untouched. No private permit exists yet, so no permit authority/grant/RLS guarantee is claimed. Test setup uses restricted inherited runtime SQL and separate owner fixtures, not mocked PostgreSQL. The existing authority-first contractor routes, six named replay properties, commercial history, fee formulae, fingerprints and audit ordering are unchanged in source. Full runtime evidence remains outstanding.

The intended commit message is written to `/private/tmp/jg-msg-lp-2.txt`. It describes preparation only. No commit was created. Final HEAD remains `cbd336611aa21c1a9a54f72df0863c172080c0e4`.

## Preservation evidence (receipt only; no permanent source-pin test)

All hashes below are SHA-256 of bytes compared with the issued parent, not with a proposed implementation. Main differs only by inherited LP-1 work.

| Unchanged path | SHA-256 |
|---|---|
| BUILD_PLAN.md | e5bf18d2044644b33cfca6948f4c8e571eaababdc19279649a076839adaca284 |
| packages/db/src/demo-bootstrap.ts | dac11737318be79c741b451a5972644d6836e085d4b1942ae11c3f6abe361e6b |
| packages/db/src/migrate.ts | a3e33fed0015f7cef8ef64f1721accf601e5aaabb756942e5c76c9bf7010b854 |
| packages/db/src/review-repository.ts | 7c5b227410ebf2b17822dc6455c44d66aa93f7c9a6d258baedb51d8a5128dd48 |
| packages/db/src/sandbox-repository.ts | d848b2259c0538e997b83437182d9086553f3a62a19f837718f1ff7bc00a0f26 |
| packages/db/test/migfix-4.integration.test.ts | 3f45db86ff4e281ff9788029cf1d082c0bb09087f129f0d8e844b57a04ae70d3 |
| packages/db/test/quote-reacceptance-upgrade.integration.test.ts | de090ede9e23a9ca5ad7b63b91e4d0b873b7f4919f41932c10bac3c9baf7ecad |
| packages/db/test/small-builder-origin.integration.test.ts | 757e0d9e12685f9a459f74ff1be68b643d0986db1df1026b4b489221ddf28697 |
| apps/api/src/auth/context-boundary.test.ts | a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 |
| packages/db/test/fingerprinted-row-shape.integration.test.ts | be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8 |
| packages/db/test/tenancy.integration.test.ts | adef5c4c9b3cc3003d23de8dc0e6f11d9a44e96e1e1392882d7b96d9dede9283 |
| packages/core/src/watchdog.ts | a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca |
| packages/db/test/watchdog-command-harness.ts | 3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 |
| packages/db/test/command-replay-contract.integration.test.ts | db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f |
| packages/db/src/practice-session.ts | 9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14 |
| packages/db/src/contractor-repository.ts | 56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c |
| packages/db/src/contractor-party-repository.ts | e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0 |
| packages/db/src/work-order-repository.ts | 4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3 |
| packages/db/src/sor-repository.ts | 45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5 |
| packages/db/src/job-scheduling-repository.ts | ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d |
| packages/db/src/work-order-fixtures.ts | cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386 |
| packages/db/src/contractor-session-context.ts | a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c |
| docs/contracts/lp-0-effective-privileges-v1.json | 4bc97467d3a4a6939270b2894e02bb561c7b00d311d10bc51f7074822c769691 |

Actual `git diff --stat` (exit 0; Git excludes untracked files):

```text
 config/agent-lane-assignments.json | 1 +
 1 file changed, 1 insertion(+)
```

New untracked delivery files, counted separately (not hidden by the Git statistic):

```text
40 lines  docs/contracts/least-privilege-job-doors-v1.md
162 lines  docs/verdicts/LP-2/BUILDER_RECEIPT.md
96 lines  packages/db/test/lp-adoption-boundary.integration.test.ts
84 lines  packages/db/test/lp-job-doors-compatibility.integration.test.ts
107 lines  packages/db/test/lp-job-doors-fixtures.ts
42 lines  packages/db/test/lp-job-doors.integration.test.ts
```

The receipt line count is measured before this appendix is written. Final verification repeats the lane/preservation checks after writing the receipt.

## Additional command ledger — inspections and writes

These are read/preparation operations, not passing tests. Read-only shell batches returned 0, including batches whose final successful read followed a missing-path diagnostic. No missing-path read is represented as evidence about that file. The commands below list the inspection invocations grouped by subject; repeated reads checked source/line accuracy and did not run business code.

| Commands/operations actually used | Exit/result/count |
|---|---|
| `pwd`; `git status --short`; `git rev-parse HEAD origin/main origin/codex/sandbox/lp-1`; `rg --files -g 'AGENTS.md' -g 'BUILD_PLAN.md' -g '*lp*' -g '*LP*' -g '*upgrade-proof*' -g 'package.json' -g '.nvmrc'` (first 100 lines) | Shell batch 0; clean worktree and issued refs established. |
| `cat AGENTS.md`; `cat /Users/benharwood/.local/share/full-steam/handoffs/jobguard-task.md` | 0; applicable instructions read. |
| `rg -n 'LP-2\|Standing rules from adoption\|Compatible landing groups\|C1\|C4\|C8' BUILD_PLAN.md`; `git show codex/sandbox/plan-lpl:BUILD_PLAN.md` piped through the LP-2 card range; `sed -n '3300,3346p' BUILD_PLAN.md` | 0; adopted authority rechecked. |
| `rg --files docs/verdicts/LP-0 docs/verdicts/LP-1`; `cat docs/verdicts/LP-1/BUILDER_RECEIPT.md`; `rg -n 'Q2\|STOP\|BLOCK\|tenancy\|grant.freeze' docs/verdicts/LP-1/BUILDER_RECEIPT.md` (first 25); receipt ranges 105–130, 140–182, 145–173 and 149–182 | 0; parent status/source holds read, not accepted. |
| `cat packages/db/migrations/0020_job_import.sql`; `sed -n '259,420p' packages/db/migrations/0095_job_parties.sql`; repeat adoption range 259–400; `sed -n '341,530p' packages/db/migrations/0110_work_orders.sql`; repeat 341–440, guards 169–186, permissions 240–268 | 0; insert/adoption/ENT-2 behavior source-inspected. |
| `cat packages/db/src/sandbox-repository.ts`; `cat packages/db/src/demo-bootstrap.ts`; bootstrap ranges 1–95, 70–145 and numbered 96–106; `rg -n 'INSERT INTO app.job\|withTenant\|Pool\|seed\|status\|revision' packages/db/src/demo-bootstrap.ts` | 0; compatible callers and parent-file conflict identified. |
| `cat packages/db/migrations/0094_practice_session_ownership.sql`; range 1–160, later 1–70 and 1–42; `cat packages/db/test/upgrade-proof-utils.ts`; later range 1–105 | 0; existing helpers/ownership boundaries read unchanged. |
| `cat package.json`; `cat packages/db/package.json`; `cat .nvmrc`; lane registry head 35/tail 60/ranges 72–82/LP matches; `tail -70 packages/db/src/migrate.ts`; later tail 14 | 0; package scripts and additive registry shape inspected. |
| `rg -n -U 'INSERT INTO app.job[\s\S]{0,500}' packages/db/test` (first 150 lines); later direct-insert `rg` excluding obvious owner prefixes (first 60); `rg -n 'asTenant\|async function\|const asTenant\|let runtime' packages/db/test/small-builder-origin.integration.test.ts` (first 18) | 0; source inventory examples only, not a complete prerequisite conversion. |
| `nl -ba` with ranges: migfix-4.integration.test.ts 12–32; quote-reacceptance-upgrade.integration.test.ts 15–31; small-builder-origin.integration.test.ts 149–161; extra-unlink.integration.test.ts 94–106; lp-0-grant-freeze.integration.test.ts 305–355 | 0; exact source before lines checked. |
| `sed` ranges: migfix-4.integration.test.ts 1–125 and 1–60; small-builder-origin.integration.test.ts 135–165 and 1–33; extra-unlink.integration.test.ts 85–110; lp-0-grant-freeze.integration.test.ts 325–344; lp-0-authority-paths.integration.test.ts first 65; lp1-lock-compatibility.integration.test.ts 1–70 | 0; merged test behavior and parent guarantees read unchanged. |
| `cat packages/db/test/job-import.integration.test.ts`; `cat packages/db/src/job-import-repository.ts`; `sed -n '1,100p' packages/db/test/site-extra-pricing-fixtures.ts`; work-order-import.integration.test.ts 1–85 and 36–62; work-order-fixtures.ts 1–60; pool-test-utils.ts 1–65 | 0; real product fixture/command contracts read. |
| `cat packages/db/tsconfig.json`; `cat packages/db/vitest.config.ts`; `cat tsconfig.json`; `sed -n '1,95p' packages/db/src/practice-session.ts`; demo-seed.ts first 25; review-repository.ts 58–85 | 0; compiler, test and caller contracts read unchanged. |
| `rg --files packages/db/migrations` filtered for 0138/practice/0162; `sed -n '1,105p' packages/db/migrations/0138_practice_session_hardening.sql`; `cat packages/db/migrations/0162_membership_account_closed.sql` first 35 | 0; current migrations read, no historical SQL edited. |
| `rg` searches in migrations for guard_imported_job, work_order guards, issue_practice_session, saved_v1_sample, command tables, practice expiry checks and contractor membership; repository searches for exports, demo builders, importCsv, review/transition and sandbox permissions; practice-session test searches and range 205–229 | 0; ancillary source checks, no new behavior or executed assertion. |
| `sed` of tools/lint.mjs 1–95; agent-lane-boundary-lint.mjs 1–150, 1–25 and 155–230 | 0; existing checks read, never edited. |
| `node --version`; `command -v pnpm`; `ls -l /Users/benharwood/Library/pnpm/bin/pnpm /private/tmp/jg-lp1-bin`; `head -5` and `cat` of default launcher; `cat /private/tmp/jg-lp1-bin/pnpm`; receipt pnpm-related search | 0 apart from the separately recorded stalled pnpm/process-refusal items; actual local launcher inspected. |
| `git diff origin/main HEAD --name-only`; source `git show origin/main:` for the two exact fixture before lines; Python source-anchor loop using `git show origin/main:<path>` for every object listed above | 0; main-vs-draft offsets rechecked. |
| Missing-path inspections: migfix-4-fixtures.ts; 0004_commands.sql; 0138_practice_session_identifier_hardening.sql | `sed` reported missing files; surrounding shell batches ended 0 after other reads. No access refusal or inferred contents; actual existing 0005/0138 files were subsequently read. |
| Python additive lane script | 0; asserted LP-2 absent, inserted one line without reformatting any existing entry. |
| `apply_patch` for new fixture/test files, fresh-connection refinement, adoption groundwork, contract, exact line correction, receipt and intended message | All returned successfully; no existing merged test/source edited. |
| Python preservation script using `git diff --name-only origin/codex/sandbox/lp-1`, `git ls-files --others --exclude-standard`, parent `git show` and SHA-256 | 0; 23 named files unchanged, all own paths allowed, all other lane objects identical; wrote /private/tmp/jg-lp2-preservation.json. |
| Python receipt appendix script reading that JSON and actual `git diff --stat`/untracked paths | 0; 23 hashes/statistics appended. |
| `test -e /private/tmp/jg-msg-lp-2.txt && ls -l /private/tmp/jg-msg-lp-2.txt` | Existing-file condition false; no prior file was overwritten. Following memory/disk/diff batch exited 0. |
| Repeated `memory_pressure \| tail -1`, `df -g /System/Volumes/Data`, `git diff --check`, `git rev-parse HEAD`, `git status --short` | 0; capacity, whitespace and worktree evidence recorded. |

Final command: a read-only Python preservation/lane/message verification plus `git diff --check`, `git rev-parse HEAD origin/main origin/codex/sandbox/lp-1` and `git status --short`. Its actual result is reported in the final response; this receipt does not self-accept. No tests are run by that inspection.

## Dispatcher 11 catch-up — 15 October 2026

Actual builder: Codex. The requested first-line Claude attribution would be inaccurate. Current HEAD is `ad0a8088be34a734bbd564fa92516cd4d1db5c8a`; verified `origin/main` is the issued `cca704ef3d70d018a7d9a7d1822784f5dc0f370f`. The working tree began in an unfinished merge. No commit, push, add, checkout, reset, download, database start, browser run or deletion was performed. No independent verdict or acceptance is claimed.

The lane conflict's working content is resolved: main's LP-1 entry is kept exactly, followed by this piece's LP-2 entry. A read-only byte comparison proves that removing only the LP-2 line reproduces main's whole registry exactly. JSON parses, there are no conflict markers, and the unchanged migration registry contains 88 numerically ordered unique names. **Git still reports UU because staging/finishing the merge is dispatcher-owned and .git is read-only.** The builder did not attempt a git write.

LP-1's merge resolves the old parent-file restriction on demo-bootstrap.ts. Its account/membership seed role changes, Q1/Q3 repairs and decisions 40–44 are retained exactly as main. The three earlier fixture SQL lines remain unchanged on main. The old draft base and original BUILD-AHEAD branch no longer select implementation; current main wins. Current main's review transition is review-repository.ts:80; adoption is 0095_job_parties.sql:261; bootstrap quoting inserts are still demo-bootstrap.ts:100–101; the trusted database constant is :10.

### Delivered in this continuation

- Added 26 LP2-A05 direct-SQL refusal cases using owner-created persisted prerequisites and the actual restricted runtime login: non-owner/revoked/expired membership; missing, wrong-actor, wrong-type, wrong-subject and completed receipts; missing, mismatched, rejected, revoked or expired authorization; wrong subject/type, actor, resolution actor, action, recipient, hash, value, terms or revision; foreign tenant and missing customer/site/payer. No service-level precheck can satisfy these SQL assertions.
- Added two LP2-A14 catalogue/actual-runtime cases for the proposed private permit's owner, FORCE RLS, tenant/backend/transaction/job key, zero table privileges, role-assumption refusal and guard-disable refusal.
- Added lp-job-doors-upgrade.integration.test.ts. Its two cases prepare canonical PostgreSQL comparison controls and an isolated own-step proof with populated original job/scope/review/adoption/receipt/authorization/audit/commercial/legacy financial sources. The shared upgrade-proof-utils.ts remains unchanged. Controls exercise microseconds, full types, nullable columns, function replacement, later inserted identities and empty-source rejection. Held routine definitions/grants are compared only at N; after later migrations twice only original named rows/types are compared. The actual proof explicitly requires the missing 0168 migration and cannot pass as a substitute implementation.
- Updated the contract and LP-2 lane note; retained the existing preparation without duplicating it. Four integration files now declare **66 cases: 18 + 40 + 6 + 2; zero executed**. The isolated test/helper compile covers five files.

### STOP list after rechecking current main

No production enforcement/migration/caller group is delivered. The binding header says to STOP on coordinator-owned prerequisites and keep their exact lines unchanged. The optional question about the continuation's “set-up lines and NEW-ROW additions only” wording remains unanswered; no dependent fixture edit was performed. Even permission for fixture setup would not release the pinned-inventory STOP.

1. **Pinned inventory — docs/contracts/lp-0-effective-privileges-v1.json:508.** Before (exact line):

```json
{"key":"acl|routine|function:app.adopt_in_flight_job(uuid,uuid,uuid,character varying,character varying,character,character varying,bigint,bigint,character varying,character varying,uuid,timestamp with time zone)|jobguard_runtime|EXECUTE|-","group":"a-exec-job-parties-work-orders"},
```

Required after: coordinator removes this now-closed capability when the migration withdraws the thirteen-argument signature. Leaving it would fail LP0-02's stale-entry assertions at packages/db/test/lp-0-grant-freeze.integration.test.ts:82–83; those assertions must stay unchanged. New permit/creator/helper ownership and EXECUTE facts also require coordinator-reviewed NEW-ROW entries. The identity-completeness assertion at packages/db/test/lp-0-authority-paths.integration.test.ts:198 remains unchanged. Relevant existing records are inventory :958–959 and :1238–1239; new routine identities cannot be inferred as approved. No inventory key, source digest, merged expectation or pinned list was edited.

2. **Merged fixture — packages/db/test/migfix-4.integration.test.ts:24.** Before (exact line):

```ts
    await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional quote','quoting')", [tenant, job]);
```

Required after: coordinator-supplied owner-connected job setup or checked product creation outside the runtime fixture transaction, preserving the identical job and all existing scope, pricing, acceptance, revision, rollback and concurrency assertions. Runtime remains the operation-under-test connection. No exact replacement was supplied; line is unchanged.

3. **Merged fixture — packages/db/test/quote-reacceptance-upgrade.integration.test.ts:25.** Before (exact line):

```ts
    await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional quote','quoting')", [tenant, job]);
```

Required after: the corresponding coordinator-owned pre-upgrade fixture conversion, with every supersession, reacceptance, precision and compatibility assertion preserved. No exact replacement was supplied; line is unchanged.

4. **Merged fixture — packages/db/test/small-builder-origin.integration.test.ts:156.** Before (exact line):

```ts
    await db.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence) VALUES($1,$2,'Fictional No charge practice job','live',$3,'capture','imported',10000,'reference_fee_policy_v1',150)",[job,DEMO_TENANT_ID,auth.digest]);
```

Required after: coordinator-supplied checked adoption fixture retaining this job identity, persisted practice ownership, capture scenario, imported provenance, live state, v1 net 10000/cap 150 and following pilot binding. This is already an owner connection; moving it to another owner cannot satisfy the required private insertion permit. No unchecked owner exception or generic mint route is authorized. Line is unchanged.

Additional confirmed runtime quoting setup remains inside the long setup line at packages/db/test/quote.integration.test.ts:4. Exact relevant before SQL: `INSERT INTO app.job(id,tenant_id,title,status)VALUES($1,$2,'Synthetic kitchen','quoting')`; required after is owner-connected job setup with identical JOB/TENANT/state and unchanged runtime quote assertions. This is further evidence that the coordinator's direct-insert fixture inventory is still needed; the three examples above are not represented as exhaustive.

**Q7 rollout prerequisite:** no reviewed expand-compatible rollout evidence was supplied. Main's demo-bootstrap.ts:100–101 and sandbox-repository.ts:26 still use direct runtime quoting inserts. Required after: the complete checked-creator/caller/guard/obsolete-adoption-grant group with an approved sequence preserving preceding deployed callers; no unchecked fallback. The old parent-file edit prohibition is resolved; rollout/inventory dependencies are not. No deployment was attempted.

**Held, independently of these STOPs:** Q5 review replacement/caller/transition withdrawal; Q6's four actor-less routes; full A10/A20/A21. A01/A07/A08/A09/A11 remain unbuilt. Broad transition and all four practice routes remain unchanged and reachable as before. No real-data guarantee or full LP-2 completion follows from this preparation.

### Current validation and command receipt

All pnpm commands used the installed, already inspected shim with these prefixes: `export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lp1-bin:$PATH"`. Node is v24.17.0; the shim invokes cached pnpm 10.28.1. No package installation was attempted. Memory before heavy checks was 62% free and disk was 50 GB available; both exceeded the issued limits. Build and tests were never concurrent. No Vitest invocation occurred.

| Actual command | Exit / result |
|---|---|
| `pnpm --filter @jobguard/db exec tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2023 --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck test/lp-job-doors-fixtures.ts test/lp-job-doors.integration.test.ts test/lp-adoption-boundary.integration.test.ts test/lp-job-doors-compatibility.integration.test.ts` | 0; four test/helper files before upgrade preparation. |
| Same explicit compiler command with `test/lp-job-doors-upgrade.integration.test.ts` appended | 0; all five final test/helper sources. No test execution. |
| `pnpm exec turbo run typecheck --force` | 0; 7/7 tasks, 0 cached; 14.744s. |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0; 7/7 package tasks, 0 cached; 9.536s. |
| `pnpm build --concurrency=2 --force` | 0; 7/7 tasks, 0 cached; 27.533s. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; 45 incoming main paths counted against LP-2 while merge/index is unfinished. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passed, 174 TypeScript files; stops at the same lane failure before package lint. Root lint is not green. |
| `pnpm openapi:check` | 1; refused before generation: `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/21985.pipe`; code EPERM, syscall listen. Stopped this item; no alternate route attempted. |
| `node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs` | 0; arithmetic passed; commercial check had no findings. |
| `git diff --check` | 0 at each inspection. |
| Read-only Python main/lane/hash inspection | 0; 21 named protected/main files byte-identical, every non-LP-2 lane byte preserved, all eight changed/new own paths allowed, 88 migration names sorted. |

Forced checks executed with cache OFF; no cache-hit green is claimed. Turbo reported cache IO warnings `Operation not permitted (os error 1)` while tasks themselves returned 0; no alternate cache location or permission route was attempted. Build completed with the existing Next workspace-root, CSS/autoprefixer, webpack serialization and Nest/file-type warnings. No automatic approval escalation was requested or rejected.

Read-only command audit for this continuation (all exit 0 unless stated): `pwd`; `git status --short`; `git rev-parse HEAD` and `origin/main`; `git ls-files -u`; `git diff origin/main --name-only`, `--stat`, `--numstat`; `wc -l` on the order/AGENTS/receipt/upgrade test; `cat`, `sed`, `nl`, `tail` and `rg` inspection of the issued order, AGENTS, standing handoff, BUILD_PLAN §11.8/C4, previous LP-0/LP-1/LP-2 receipts, lane conflicts, LP-2 contract/tests/fixtures, package/tsconfig/lint scripts, existing adoption/work-order/practice/review/capture/financial migrations and repositories, merged fixture lines, shared upgrade helpers and LP-0 catalogue guards; `node --version`; existing pnpm shim and intended-message reads; repeated `memory_pressure | tail -1` and `df -g /System/Volumes/Data`. One inspection batch exited 1 because `cat packages/db/migrations/0020_imported_jobs.sql` used a nonexistent filename; the correct actual file is 0020_job_import.sql and was subsequently read. This was not a permission refusal. One receipt apply_patch failed verification due to an empty trailing hunk; a corrected patch succeeded. All other patch calls succeeded. Registry edits used apply_patch only. No shell mutation or test altered an existing merged source/test or inventory.

### NOT RUN / acceptance limits

- lp-job-doors.integration.test.ts (18), lp-adoption-boundary.integration.test.ts (40), lp-job-doors-compatibility.integration.test.ts (6), lp-job-doors-upgrade.integration.test.ts (2): **NOT RUN — cannot start PostgreSQL/bind sockets here**. No behavioural failed-first result exists; environment/source inspection is not one.
- All prescribed existing database, fingerprint, pack/message, import/review, replay/lock, LP-0 grant-freeze and authority-path regressions: NOT RUN (same environment; only own-piece local tests authorized). Exact unchanged grant-freeze command remains `~/.local/bin/heavy-slot lp-2 pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lp-0-grant-freeze.integration.test.ts`.
- Existing authentication scanner and watchdog registry tests: NOT RUN (outside own-piece local allowance). Their sources/pins remain equal to main; this is source preservation, not executed verification.
- Browser/e2e/Playwright, both projects: NOT RUN (CI only). Whole pnpm test/test:db/test:migrations/restore: NOT RUN (dispatcher/CI suites). No mandatory check was weakened. No separate own non-database unit suite exists; direct test-source compilation is recorded accurately.
- No migration, GRANT, trigger, policy, business-row rewrite, production function or caller change. **New migration GRANTs: NONE. Standard F is preserved by making no new production write path.** Disposable helper still grants only `jobguard_runtime TO lp2_login`; no owner role or fixture grant reaches the application. No migration rollback applies. Future installed changes must fix forward without restoring unchecked grants.
- A02/A03/A04/A05/A06/A12/A13/A14/A15 have preparation only; no criterion is passed. A16–A19 have source preservation only, pending unchanged regression execution. Private-permit reuse/substitution/backend/transaction tests, complete helper/search-path/trigger posture, saved-v1 compatibility and executed rollout/upgrade evidence remain unfinished with the implementation. Fresh exact-commit Opus + Sol RED review and separate acceptance remain absent; the dispatcher must produce a committed head first. All LP/G1 gates remain closed.

### Catch-up preservation hashes (SHA-256, each equal to origin/main)

```text
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35 apps/api/src/auth/context-boundary.test.ts
9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14 packages/db/src/practice-session.ts
56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c packages/db/src/contractor-repository.ts
e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0 packages/db/src/contractor-party-repository.ts
4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3 packages/db/src/work-order-repository.ts
45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5 packages/db/src/sor-repository.ts
ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d packages/db/src/job-scheduling-repository.ts
cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386 packages/db/src/work-order-fixtures.ts
a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c packages/db/src/contractor-session-context.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f packages/db/test/command-replay-contract.integration.test.ts
be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8 packages/db/test/fingerprinted-row-shape.integration.test.ts
a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca packages/core/src/watchdog.ts
1396e92160af7d7076f5b7c2a3ba2cb01bf5b839173afaa98cecc2d302ef0f5e docs/contracts/lp-0-effective-privileges-v1.json
16c65584bfad972b8cb16710fe778172017a8f00057c8e126868b89daa1ca85b packages/db/src/migrate.ts
dac11737318be79c741b451a5972644d6836e085d4b1942ae11c3f6abe361e6b packages/db/src/demo-bootstrap.ts
d848b2259c0538e997b83437182d9086553f3a62a19f837718f1ff7bc00a0f26 packages/db/src/sandbox-repository.ts
3f45db86ff4e281ff9788029cf1d082c0bb09087f129f0d8e844b57a04ae70d3 packages/db/test/migfix-4.integration.test.ts
de090ede9e23a9ca5ad7b63b91e4d0b873b7f4919f41932c10bac3c9baf7ecad packages/db/test/quote-reacceptance-upgrade.integration.test.ts
757e0d9e12685f9a459f74ff1be68b643d0986db1df1026b4b489221ddf28697 packages/db/test/small-builder-origin.integration.test.ts
6f7d00c09fa5837c639ec792a08924d0d95133e996bd791a889934186b0c8ab9 packages/db/test/quote.integration.test.ts
```

Builder self-inspection: no merged test, scanner, inventory, fingerprinted table, watchdog guard/harness, provider, UI or production source is changed relative to main. The only application-facing result is unfinished tests-first preparation. An owner fixture is used solely for synthetic prerequisite rows; runtime SQL independently exercises refusals. No helper creates a production bypass. New upgrade comparisons preserve original identities and PostgreSQL text precision; they do not freeze later function definitions or prohibit later columns. The fixture permission question and pinned inventory remain unresolved, so the implementation and compatible group were not silently advanced.

Diff evidence, captured with `git diff origin/main --stat` before adding this evidence block (untracked files are not included by git diff):

```text
 config/agent-lane-assignments.json                 |   1 +
 docs/contracts/least-privilege-job-doors-v1.md     |  42 +++
 docs/verdicts/LP-2/BUILDER_RECEIPT.md              | 366 +++++++++++++++++++++
 .../test/lp-adoption-boundary.integration.test.ts  | 122 +++++++
 .../lp-job-doors-compatibility.integration.test.ts |  84 +++++
 packages/db/test/lp-job-doors-fixtures.ts          | 172 ++++++++++
 packages/db/test/lp-job-doors.integration.test.ts  |  72 ++++
 7 files changed, 859 insertions(+)
```

Additionally untracked: packages/db/test/lp-job-doors-upgrade.integration.test.ts, 129 lines. All eight changed/new paths belong to the LP-2 lane. Incoming staged main files explain the longer git status; they are identical to origin/main, not LP-2 edits. Final read-only inspection checks lane preservation, receipt hashes, intended message and whitespace; no further test/build run is authorized or needed after documentation-only edits.

Final HEAD remains `ad0a8088be34a734bbd564fa92516cd4d1db5c8a`. Intended commit message is `/private/tmp/jg-msg-lp-2.txt`. The dispatcher must stage the resolved JSON/new upgrade file, finish the merge, obtain the missing coordinator prerequisites and request fresh reviews on an exact committed head. No acceptance is claimed.


## Round 3 — 16 October 2026, build and park

Actual builder: Codex. Earlier text above is preserved byte for byte as historical evidence; the requested Claude attribution remains inaccurate and is not substituted. This round supersedes the earlier preparation-only/Q5/Q6/migration-number status. **No acceptance, independent verdict, deployed enforcement or executed PostgreSQL guarantee is claimed.** Decision 74/75 authorizes construction of the money/access parts, with RED Opus plus Sol checks and then PARK; no merge, enablement or deployment without Ben's button.

### Current base and merge

Issued header base was `ca435eeb5791638c787c830d6ba717146f694539`; observed `origin/main` is `31682762c903d716657c573e1b5deae63588aad7`. Current main wins. HEAD is `7aa461d0b6fb9842231734d62143ed78d0503434`, branch `codex/sandbox/lp-2`. The dispatcher completed the merge before this turn: initial `git status --short` and `git ls-files -u` were empty, no conflict marker remained. The builder performed no git write, staging, commit, merge, push, deployment, approval, install/download, database start, browser run, external send, spending or deletion command. Dependencies were already installed. Node is v24.17.0, cached pinned pnpm 10.28.1, Turbo 2.10.12; the PostgreSQL dependency remains 16.10.0-beta.15.

Cited current sites were re-read against main. LP-1's account/membership seed conversion remains, including the existing transaction-local role changes. MERGE-CHURN-1 is present: the shared migration registry and MIGRATIONS.md are untouched. Migration 0195 and its per-file note use automatic discovery; no earlier SQL is edited. Main's latest predecessor is 0172, not the draft's 0138/0162 floor. Existing reservations/gaps are not reused. The old receipt's earlier hashes and base describe earlier rounds, not today's main.

### Delivered, source-inspected

- Migration `0198_unchecked_job_doors.sql`: ordinary runtime draft-only insertion guard; null-safe permit-based imported/work-order/home/sandbox insertion; private exact tenant/job/backend/xid8/operation/shape permits, tenant-qualified identity references, FORCE RLS, one-use consumption and deferred unused-permit refusal. No caller-set import flag is read. Shared migration ownership alone cannot insert an imported/work-order/home/core-1000 job.
- Static replacements preserve the current eighteen-argument adoption checks/party binding/deferred record checks and v1 value/cap/lineage, ENT-2's checked work-order creation, and home state/revision/session recipe. The old thirteen-argument adoption runtime grant is withdrawn. No business table gains a column, no existing row is backfilled or rewritten, and no financial formula is changed.
- The narrow review routine preserves the existing current-owner confirmation permission. It validates the processing actor/type/job/proposal receipt and exact approved action, hashes the unchanged raw review serialization, reconstructs the persisted review and checks accepted canonical scope. Only non-stored parent/question ordering is normalized for content comparison. It checks ordinary draft source/expected revision, confirms the review and changes only job status/revision/update time. It cannot express acceptance/live/settlement or set money/policy/pointers. `reviewContentHash` is unchanged. The review caller remains in its existing dispatcher transaction; broad transition runtime/PUBLIC/identity/infrastructure EXECUTE is withdrawn. Source search finds no SQL wrapper reaching it; generic JobRepository.transition remains unavailable with runtime credentials.
- Sandbox creation uses its existing persisted session's authenticated membership and a fixed checked core-1000 creator, with state/revision and existing replay behavior preserved. Bootstrap's same owner connection creates its three existing quoting rows as the migration role; LP-1's account/membership work and row identities/replay SQL are preserved. No service receives owner credentials.
- The four named actor-less practice signatures retain their current business bodies and gain the trusted-database restriction. The landing body comes from 0097, including current-state reads and lock order; it is not replaced with 0018's old body. Restricting the database does not supply actor binding. Later LP binding gates remain.
- Per-file version-2 lane and migration note; exact proposed coordinator fixture/catalogue/lane changes; rollout document labelled **prepared, not reviewed, not run**. No new public endpoint, UI, provider, AI/parser/prompt, native work or operational alert. C1: existing journeys only; browser regression execution is CI-only.

### Tests and acceptance evidence (all PostgreSQL NOT RUN)

The earlier 66 prepared cases remain represented, including the original 36. Initial new transition/practice/permit tests and the corrected own-step proof were written before the migration/caller implementation. Additional catalogue and preservation cases were added during source inspection. No intended boundary assertion was executed without the implementation because PostgreSQL and local sockets cannot start here: **first failing behavioral run NOT RUN**, never presented as a red-to-green test run.

| Own file | Declared cases | Coverage / execution |
|---|---:|---|
| lp-job-doors.integration.test.ts | 19 | A02/A14: initial fields/refusal effects, actual inherited-runtime table/role/trigger denial, private helpers/search paths/trigger timing. NOT RUN. |
| lp-adoption-boundary.integration.test.ts | 46 | A03–A06/A10: tenant/settings, persisted actor/receipt/approval/parties, immutable v1 product adoption, replay/rollback, exact permits and job/shape/backend/transaction substitutions, one-use/deferred cleanup. NOT RUN. |
| lp-job-doors-compatibility.integration.test.ts | 7 | A04/A12/A13: ENT-2 product creation/replay, direct work-order refusal, home/sandbox ownership/session expiry/revocation, saved-v1 and sandbox replay. NOT RUN. |
| lp-job-doors-upgrade.integration.test.ts | 2 | A15/A16: own step and later runner twice, populated original identities, canonical row text/full types, comparator controls. NOT RUN. |
| lp-start-quote.integration.test.ts | 13 | A01/A07–A10: broad grant/call refusal, stable concurrent result, no billing, changed significant input conflict, authority-first identical refusal, SQL boundary fields and rollback. NOT RUN. |
| lp-practice-doors.integration.test.ts | 5 | A11: all four signatures refuse a non-practice database despite forged settings; trusted-database legacy scenario/landing/reversal/illustration and invalid evidence preserve their checks. NOT RUN. |

Total: **92 declared cases, zero executed**. Compilation is not behavioral evidence. The prepared home assertion is now explicitly filtered to home scenarios; an additional saved-v1 assertion covers the separately generated draft instead of incorrectly counting it as a home. No earlier intended case is skipped or deleted. The own-piece tests/helpers (seven TypeScript files) compile with strict settings. One later compile caught an out-of-scope test variable (TS2304), which was corrected; its final compile passed.

A02–A15 are implemented/prepared, not passed. A16–A19 have source preservation plus own historical proof preparation, not executed regression evidence. All six contractor replay/refusal properties and the shared watchdog/replay/lock suites remain mandatory, unchanged. No new contractor command or watchdog registry/guard/harness is introduced. A20 has a prepared release sequence only; A21 lacks CI and exact-commit RED/acceptance records. No whole acceptance criterion is closed by this receipt.

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

The own proof uses unchanged upgrade-proof-utils: canonical `row_to_json(t)::text`, original primary keys, names plus `format_type(atttypid,atttypmod)`, and nonempty guards. Rolled-back controls exercise one microsecond and retyping failures, and nullable-column/function-replacement/later-insert passes through the same comparator. Existing rows/types are compared immediately after 0195 alone, then after later migrations twice. Function replacement after N is allowed. No later definition or entire shared file is frozen.

### STOP / coordinator-owned compatibility work

`docs/verdicts/LP-2/PROPOSED-COORDINATOR-CHANGES.md` contains exact current lines, before text and proposed after setup. No change in that document is approval, and none was applied to merged tests/pins.

1. **Item 1**, `packages/db/test/migfix-4.integration.test.ts:24`: runtime quoting INSERT -> identical owner-connected tenant setup before the unchanged runtime scope/quote operations. All seven tests using issued() are source-inspected as blocked on PROPOSED-COORDINATOR-CHANGES item 1 once 0195 is installed; exact declarations follow below.
2. **Item 2**, `packages/db/test/quote-reacceptance-upgrade.integration.test.ts:25`: same proposed fixture conversion. Its current exact test is `keeps old acceptance rows byte for byte and then accepts the same document again as sequence 2`. **Its existing sequence seeds before 0155/0195, then migrates, so that line is not claimed to fail in the current upgrade ordering.** The requested proposal preserves compatibility for full-schema setup and every acceptance assertion; it is not a fabricated executed blocker.
3. **Item 3**, `packages/db/test/small-builder-origin.integration.test.ts:156`: explicit owner-only exact permit setup for the identical live/revision-zero/imported/capture/v1-net-10000-cap-150 fixture. Exact affected test: `the existing application propose action works on a No charge (pilot_no_charge) practice job`, blocked on PROPOSED-COORDINATOR-CHANGES item 3 and its trusted-practice database setup. The current adoption product signature creates an unowned revision-one job, so moving this INSERT to another owner connection or assigning ownership later would not preserve the fixture. No production bypass was added.
4. **Item 4**, `config/agent-lane-assignments.json:85`: existing legacy lp-2 entry -> coordinator retires it when adopting the requested per-file version-2 lane. Loader :65 deliberately refuses duplicate registrations; the builder does not relax it, edit another lane or use another base. The legacy entry itself is unchanged from HEAD; removing only its prior LP-2 addition reproduces origin/main's registry byte for byte. New exact allow list does not list itself or the legacy register. Both root lint and lint:lanes fail here, truthfully.
5. **Item 5**, `docs/contracts/lp-0-effective-privileges-v1.json:517`, :553 and :628: existing old-adoption-runtime, imported-guard-PUBLIC and broad-transition-runtime ACL keys -> remove the withdrawn capabilities in a coordinator-reviewed inventory delta. Add the new permit/helper/routine identities and reviewed dispositions/protection facts. `packages/db/test/lp-0-authority-paths.integration.test.ts:198` identity-completeness check needs that updated inventory, unchanged assertion. At :247 its existing `rejects.not.toMatchObject({ code: "42501" })` for broad transition must become coordinator-owned runtime refusal expectation; the exact before/after is proposed, never applied. Exact blocked tests: `[LP0-02] installed base matches reviewed capabilities`, `[LP0-17] every reachable authority path has a disposition`, and `reports existing exceptions truthfully: the real runtime login can do these things today`. Additional LP-0 controls require their inventory precondition and cannot be claimed green.
6. **Item 6 / inherited Q3/Q4**: further confirmed setup sites are `small-builder-origin.integration.test.ts:90`, `quote.integration.test.ts:4` and `practice-session.integration.test.ts:288`, plus the issued Q3 broad-transition and Q4 positive-practice target lists. They stay untouched. The machine-derived nearest declaration below names the :90 test exactly. Existing positive suites targeting postgres need the trusted practice database. The coordinator must preserve observed transactions/races, not move a mutation out of its observed transaction. The owner invocation of evidence-pack-fixture.ts:34 in this piece's own proof and the explicitly owner-connected demo-seed.ts:83 need no conversion.

Reviewed rollout evidence is a separate hold. The prepared document explains the additive expand step, compatible callers, old-instance/queue observations and the contract step; current 0195 is an atomic contract artifact and must not be applied blindly over expanded objects or old running callers. No deployment evidence/approval was supplied or manufactured. Build-only decision 74 does not waive the compatible-landing group or whole-track real-data gate.

### Commands and actual results

Every pnpm invocation used `export PATH="$HOME/Library/pnpm/bin:$PATH"; export PATH="/private/tmp/jg-lp1-bin:$PATH"`; the already existing shim invokes cached pinned pnpm. No launcher download or alternate permission route was attempted. Heavy checks ran serially; memory checks showed 79–82% free and disk 47 GB available throughout, above the 35%/45 GB limits. No test/build overlap occurred.

| Actual invocation | Exit / result |
|---|---|
| Strict own-test compiler command below, first run | 0; seven test/helper files at that point, no tests executed. |
| Same compiler command after extending preservation cases | 1 (underlying tsc exit 2); TS2304 at lp-start-quote.integration.test.ts:78, out-of-scope `field`. |
| Same compiler command after removing that unintended test line | 0; seven final test/helper files, no tests executed. |
| `pnpm exec turbo run typecheck --force` | 0; 7 successful / 7, 0 cached, 15.588s. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; duplicate lp-2 registration at legacy register :85; no alternate lane/base. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passes 190 files, then the same lane failure before package lint. Root lint is NOT green. |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | 0; 7 successful / 7 package checks, 0 cached, 11.686s. |
| `node tools/money-arithmetic-lint.mjs` | 0; money arithmetic boundary passed. |
| `node tools/commercial-boundary-lint.mjs` | 0; no findings/output. |
| `pnpm openapi:check` | 1; refused before generation by tsx pipe listen EPERM, exact refusal below. |
| `pnpm build --concurrency=2 --force` | 0; 7 successful / 7, 0 cached, 34.552s. |
| Repeated `git diff --check` | 0; no whitespace errors. |
| Read-only Python preservation inspection | 0; 25 protected files and all historical migrations equal main, no merged test edited, all 18 changed/new paths in the new exact lane, original receipt unchanged before append. |

Exact own-test compilation:

```sh
pnpm --filter @jobguard/db exec tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2023 --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck test/lp-job-doors-fixtures.ts test/lp-job-doors.integration.test.ts test/lp-adoption-boundary.integration.test.ts test/lp-job-doors-compatibility.integration.test.ts test/lp-job-doors-upgrade.integration.test.ts test/lp-start-quote.integration.test.ts test/lp-practice-doors.integration.test.ts
```

All three forced checks actually executed with `--force`; no FULL TURBO/cache-hit result is presented as a run. Turbo printed cache IO warnings `Operation not permitted (os error 1)` while the tasks themselves completed successfully; no alternative cache-write route was attempted. Build retained existing Next workspace-root, CSS/autoprefixer, webpack serialization and Nest/file-type/load-esm warnings. No warning was suppressed or code changed to hide it.

Exact stopped OpenAPI item:

```text
Command: pnpm openapi:check
Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/12925.pipe
code: EPERM; syscall: listen
```

No alternate invocation, socket route or escalation was attempted. No automatic approval review was requested or rejected. OpenAPI parity is NOT RUN, not failed application parity.

Read-only command audit (all shell batches exit 0 unless listed above): `pwd`; `git status --short`; `git branch --show-current`; `git rev-parse HEAD`, `origin/main`; `git ls-files -u`; `git diff origin/main --stat`, `--name-only`, `--numstat`; `git diff --check`; `git show origin/main:<protected path>` and `HEAD:<receipt/legacy lane>`; `git ls-tree -r --name-only origin/main`; `git ls-files --others --exclude-standard`; repeated `memory_pressure | tail -1` and `df -g /System/Volumes/Data`. `cat`, `sed`, `nl` and `rg` read the complete two issued orders and standing handoff, AGENTS, BUILD_PLAN contracts/task, previous receipt, LP-0 guards/inventory, current migrations and callers, shared upgrade/harness fixtures, own tests, lane loader and package scripts. Inspections of nonexistent config/lanes/lp-2.json (before creation), lp-1.json and ent-11a.json produced `No such file or directory`; those combined read batches ended 0 after their final successful read. They were missing files, not permission refusals. No contents were inferred from them.

Mutation-command audit (each exit 0): create and run `/private/tmp/lp2-tests-first.py`, `/private/tmp/lp2-implement.py`, `/private/tmp/lp2-docs.py`, `/private/tmp/lp2-practice-positive.py`; inline Python exact caller/test/contract/lane updates; here-doc append of private-permit and catalogue/saved-v1 tests; here-doc append of the narrow SQL and final COMMIT; here-doc writes of the migration note and prepared rollout document; create and run `/private/tmp/lp2-round3-receipt.py` to append this section and write the expressly requested intended message. These edit only LP-2 paths and temporary task scripts, never .git or a merged test. Final read-only whitespace/preservation inspection is recorded after this append. No Vitest, browser, DB gate invocation or whole-suite run occurred.

### NOT RUN list and release limits

- All six own PostgreSQL test files in the table above: **NOT RUN (cannot start PostgreSQL or bind sockets here)**. The seven-file compile includes the helper; it is not a substitute. Failed-first and fresh/upgrade/concurrency/rollback/catalogue execution all require CI.
- All unchanged required DB/fingerprint/pack/message/receipt/financial-source, auth-context, watchdog registry/replay/lock, LP-0, import/review/quote/practice/bootstrap and restore regressions: NOT RUN (PostgreSQL unavailable and local runs limited to own piece). No earlier suite is waived. The six exact contractor replay/refusal properties remain the unchanged CI contracts.
- Whole pnpm test/test:db/test:migrations/test:restore: NOT RUN (dispatcher/CI only, no database here). No distinct own non-database unit suite exists for these SQL/caller changes; no artificial passing substitute was added.
- Browser/e2e/Playwright, both projects: **NOT RUN (explicitly CI only; browser unavailable)**. No browser was started.
- OpenAPI parity: NOT RUN (generation refused by pipe permission, as above).
- Install/clean install, paid/live provider/model eval: NOT RUN (already installed; downloads and real processing excluded; no AI change).
- Expanded/mixed-version rollout: NOT RUN / NOT REVIEWED; RED model verdicts and separate acceptance: NOT DONE. Dispatcher must commit the working diff before reviewers can bind a verdict to its exact head. No reviewer is impersonated and no model review is claimed.

### New GRANTs — one line each

Build standard F: **no new direct INSERT/UPDATE/DELETE grant to jobguard_runtime on any money, membership, authorization, receipt or audit table; no unrestricted equivalent routine bypass.** The new permit table has no runtime table access. Exactly two GRANT statements occur in 0195:

```sql
GRANT EXECUTE ON FUNCTION app.create_practice_sandbox_job(uuid,uuid,uuid,text) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.start_quote_from_review(uuid,uuid,integer,uuid,uuid,uuid,uuid,text) TO jobguard_runtime;
```

The first is the existing fixed sandbox recipe with its own persisted session/member/database checks; the second is the existing owner-approved review transition with exact receipt/authorization/content/source checks. Other changed existing signatures retain their prior EXECUTE grants via CREATE OR REPLACE; there is no grant-default widening. The migration revokes all private helper execution and the old broad-transition/adoption capabilities. Test-only inherited login setup retains `GRANT jobguard_runtime TO lp2_login`; it grants no fixture or owner power and is not migration SQL.

### Builder self-inspection (not an independent verdict)

Checked the new SQL against current static definitions: fixed trusted search paths; schema-qualified private tables; no dynamic SQL or generic permit mint function; no runtime role assumption; no secret values; no new protected-table grants; exact transaction-bound consumption and rollback; original party/track/saved-v1/baseline triggers retained; no fingerprinted-column change; existing `reviewContentHash` bytes preserved; no business lock after audit append. Own tests exercise actual SQL/roles when CI runs, not ORM mocks. Existing main tests and all pinned inputs remain unchanged. The new private table/entry points still require the coordinator's reviewed LP-0 inventory delta; a successful source inspection cannot replace that evidence.

The ordinary owner fixture capability is explicit and limited to ordinary rows; shared ownership cannot substitute for an insertion permit on protected provenance/practice paths. Tenant context and server-selected identity remain on the existing pre-binding boundary; no full protection against compromised privileged credentials is claimed. Trusted database naming is operational configuration, not an administrator-proof boundary. Temporary actor-less signatures still need later actor/receipt binding. No check is made weaker to get green. No real data, fee, send, collection, UI or production enablement is introduced.

Operational repair is additive forward-fix, not restoration of unchecked runtime grants. Migration/application compatibility must be resolved as one group before landing. This remains a **partial, parked build with unexecuted database evidence and coordinator prerequisites**, not full LP-2 completion or technical acceptance.

Exact tests blocked on PROPOSED-COORDINATOR-CHANGES item 1 (source-inspected, NOT RUN):

- `[MIGFIX-4.1] supersession invalidates pending acceptance`
- `[MIGFIX-4.2] superseded document cannot be accepted with a fresh revision`
- `[MIGFIX-4.3] acceptance and supersession serialize on the job`
- `[MIGFIX-4.4] issued unsuperseded control accepts once and original command replays without duplicate effects`
- `[MIGFIX-4.4] supersession original command replays without a second event or revision`
- `[MIGFIX-4.exact] exact document hash, version, total, issue record and live baseline refusals remain`
- `[MIGFIX-4.authority] routine authority is checked before unknown, foreign, quoting, accepted or live job state`

Item 6, small-builder-origin.integration.test.ts:90 nearest declaration: `it("the existing application propose action issues LogBuilderExtra, with price, and replays",async()=>{` (line 78).

### Round 3 preservation evidence

25 SHA-256 values below are byte-equal to current origin/main (source preservation, not executed regression evidence):

```text
ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2 apps/api/src/auth/context-boundary.test.ts
9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14 packages/db/src/practice-session.ts
56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c packages/db/src/contractor-repository.ts
e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0 packages/db/src/contractor-party-repository.ts
9e4d46c5290e25647d714810d67b2efee6f674a1d52f654142297d22c476e22e packages/db/src/work-order-repository.ts
45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5 packages/db/src/sor-repository.ts
ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d packages/db/src/job-scheduling-repository.ts
cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386 packages/db/src/work-order-fixtures.ts
a1c76687dc593763d97603cf196c7ef015087359191051d882f6229cac6adf4c packages/db/src/contractor-session-context.ts
a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca packages/core/src/watchdog.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6 packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f packages/db/test/command-replay-contract.integration.test.ts
be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8 packages/db/test/fingerprinted-row-shape.integration.test.ts
468dd30e7a0b9ac92f64bc93585d27040ca205047bcd080393c7d6a12f85513e docs/contracts/lp-0-effective-privileges-v1.json
d9ac38c5bae60a487b2835c1681167ea5bf985f1449469c56eec0403772c8983 packages/db/src/migrate.ts
1790932d10a34c8cd0bf2bced5426ebff39717d4c9bafe55f290795ad462356d packages/db/MIGRATIONS.md
3f45db86ff4e281ff9788029cf1d082c0bb09087f129f0d8e844b57a04ae70d3 packages/db/test/migfix-4.integration.test.ts
de090ede9e23a9ca5ad7b63b91e4d0b873b7f4919f41932c10bac3c9baf7ecad packages/db/test/quote-reacceptance-upgrade.integration.test.ts
757e0d9e12685f9a459f74ff1be68b643d0986db1df1026b4b489221ddf28697 packages/db/test/small-builder-origin.integration.test.ts
6f7d00c09fa5837c639ec792a08924d0d95133e996bd791a889934186b0c8ab9 packages/db/test/quote.integration.test.ts
ff75968d7871497050997b660398f7968e18dff474ad1ebefb6ee67c78cc7cce packages/db/test/practice-session.integration.test.ts
625cfe56ef983fd58562300bc7886b2f7b011de671e0f7ac958b9f08a6e009bc packages/db/test/lp-0-authority-paths.integration.test.ts
18196d9cfaac0fed6ee8301a0c1f305a79aa1757f0f0963fb6a4a78e9ad6ece5 packages/db/test/lp-0-grant-freeze.integration.test.ts
8903cfb2ce110bfa8f5d7f0bef33b5c629a32f9a2ca2f613cfaef2a823119e45 tools/agent-lane-boundary-lint.mjs
384fdb07869e780e44e9761a7aaa355ddb4dc0b7fb03b5370d65c47c2891fcdd BUILD_PLAN.md
```

All historical migration files also compare byte-equal to main; no merged test is edited. Original 381-line receipt prefix SHA-256: `82ce4e8527de00879f577b4b2489798bc9ca63fad36308c38a6fef8c29aacb42` (checked unchanged before this append). New migration SHA-256: `f78976e3645f4e247b2b18141822ee8631c85a77e381902627d940a48cee377a`.

`git diff origin/main --stat` captured after the Round 3 text, before this evidence block:

```text
 config/agent-lane-assignments.json                 |   1 +
 docs/contracts/least-privilege-job-doors-v1.md     |  21 +
 docs/verdicts/LP-2/BUILDER_RECEIPT.md              | 518 +++++++++++++++++++++
 packages/db/src/demo-bootstrap.ts                  |   3 +-
 packages/db/src/review-repository.ts               |   3 +-
 packages/db/src/sandbox-repository.ts              |   4 +-
 .../test/lp-adoption-boundary.integration.test.ts  | 170 +++++++
 .../lp-job-doors-compatibility.integration.test.ts | 103 ++++
 packages/db/test/lp-job-doors-fixtures.ts          | 197 ++++++++
 .../test/lp-job-doors-upgrade.integration.test.ts  | 123 +++++
 packages/db/test/lp-job-doors.integration.test.ts  |  98 ++++
 11 files changed, 1236 insertions(+), 5 deletions(-)
```

Untracked artifacts (git diff --stat omits them):

- `config/lanes/lp-2.json`
- `docs/operations/lp-2-rollout-evidence.md`
- `docs/verdicts/LP-2/PROPOSED-COORDINATOR-CHANGES.md`
- `packages/db/migration-notes/0198_unchecked_job_doors.md`
- `packages/db/migrations/0198_unchecked_job_doors.sql`
- `packages/db/test/lp-practice-doors.integration.test.ts`
- `packages/db/test/lp-start-quote.integration.test.ts`

All 18 changed/new paths belong to the requested LP-2 scope. The legacy registry's sole difference from main is the earlier LP-2 entry; it is unchanged by this round and no other lane changes. Exact new lane allow list excludes the lane file itself and both frozen shared migration files. Final read-only inspection verifies the preserved prefix, hashes, lane paths and whitespace; any resulting failure is reported rather than silently repaired outside this lane.

Final HEAD: `7aa461d0b6fb9842231734d62143ed78d0503434` (unchanged; implementation is uncommitted). Intended commit message: `/private/tmp/jg-msg-lp-2.txt`. The dispatcher owns the commit and RED review handoff. No acceptance, push, merge, enablement or deployment is performed.

Final read-only command receipt: `git diff --check` and Python prefix/hash/line/message verification exited 0; confirmed seven MIGFIX-4 test declarations and exactly two new GRANT statements. `git rev-parse HEAD origin/main`, `git status --short`, memory/disk checks exited 0; HEAD unchanged, memory 81% free, disk 47 GB available. This documentation correction changes only the Round 3 count, preserving the historical prefix.


## r3 (ruling 80)

16 October 2026; dispatcher 14; branch `codex/sandbox/lp-2`. Issued/current HEAD `ae0e1ceef9009cb4b4f1d83631f553483ee4e983`; `origin/main` `4c407a6c81bd714a6875b7adf995812381d0fe57`. **BUILD-DON'T-MERGE under decision 74. PARTIAL / STOP on the legacy-lane union below.** No commit, index write, push, merge, technical acceptance or release performed. Both independent exact-commit checker verdicts remain pending; no deterministic check below is represented as a model review.

Read AGENTS.md, BUILD_PLAN.md §2/§5.1/§11.8 LP-2 and the issued PROPOSED-COORDINATOR-CHANGES.md. The six named setup sites match the proposal's current before text. The proposal, all application code, migrations, grants, credentials, shared inventories, scanner pins, every other test and every other lane remain byte-identical to this round's starting HEAD. No test exemption or runtime grant was added. Existing release/rollout/LP-0 holds are not discharged.

Applied only the named setup conversions:

- `packages/db/test/migfix-4.integration.test.ts`, original :24: the identical quoting job INSERT now runs in a preceding `withTenant(c.admin, context, ...)`; scope setup and all quote operations remain on `c.runtime`.
- `packages/db/test/quote-reacceptance-upgrade.integration.test.ts`, original :25: the same conversion, preserving the upgrade operations and assertions.
- `packages/db/test/small-builder-origin.integration.test.ts`, original :156: copied item 3's entire owner fixture code block byte for byte, around the identical original INSERT in the existing `asTenant` transaction; the original following pilot track binding is unchanged.
- The same file, original :90: item 6's same owner-capability recipe in `asTenant`, with permit shape selected using the original SELECT's existing title, practice digest and scenario. The original INSERT SELECT SQL/arguments are unchanged; only its connection changes from `admin` to that owner transaction's `db`. Its following track/scope setup and assertions are unchanged.
- `packages/db/test/quote.integration.test.ts`, original :4: moved only the identical quoting job INSERT to a preceding `withTenant(admin, context, ...)`; runtime scope setup and the rest of the compact line are unchanged.
- `packages/db/test/practice-session.integration.test.ts`, original :288: the same tagged quoting/home job INSERT runs in `withTenant(admin, a.context, ...)` after an exact `practice_home` fixture permit for its existing tenant, ID, title, status, revision zero, digest, home scenario and default provenance. The existing assertions remain byte-identical.
- `config/lanes/lp-2.json`: added exactly the five named test paths, preserving all previous paths, note, branch and receipt fields. No extra path or wildcard added.

### STOP: literal lane union is refused by the unchanged loader

Stopped on `config/agent-lane-assignments.json:85`; **no edit to that file**. Before: the legacy `lp-2` entry's allow list includes `"config/agent-lane-assignments.json"`, along with five other old-only paths (`packages/db/migrations/0168_unchecked_job_doors.sql`, `packages/db/src/migrate.ts`, `packages/db/MIGRATIONS.md`, `packages/db/src/index.ts`, `packages/db/src/lp-job-doors.ts`).

Ruling 80's required after is one registration with the union of the old paths and the per-file paths. Retiring the legacy entry and putting that literal union in `config/lanes/lp-2.json` is rejected by `tools/agent-lane-boundary-lint.mjs:63`:

```text
Lane file "config/lanes/lp-2.json" refused: a lane file cannot grant the lane register (config/agent-lane-assignments.json or config/lanes/); its own file is always editable by its own branch.
```

This was reproduced read-only by passing an in-memory union, with the legacy duplicate removed, to the unchanged `mergeLanePolicy`. Nothing was written by that reproduction. Dropping the forbidden path would violate the literal union requirement; changing the loader is outside scope. A clarification was requested via the user-input tool: retire the legacy entry and retain every other old path plus the five named test paths. **No answer has arrived; dependent lane consolidation remains held.** No alternate base, lane, loader relaxation or exemption was used. The five expressly authorized own-lane additions were completed independently.

### Checks actually run

Actual check commands used the existing cached pnpm 10.28.1 shim via `PATH="/private/tmp/jg-lp1-bin:$PATH"`; no install performed. Runtime is Node 24.17.0; the unchanged `.nvmrc` says 24.15.0. Initial default-launcher `pnpm --version` probes emitted pnpm warnings without a version before the cached shim was found; the last probe was interrupted (130). No dependency download command was issued.

Logs and the exact selected unit-file manifests are in `/private/tmp/jg-lp2-r3/` (not committed).

| Command/check | Actual result |
|---|---|
| `pnpm typecheck` | PASS, 7/7 tasks; 2 cached, 5 executed. |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL (1): core purity passes, then existing duplicate `lp-2` registration blocks the lane stage. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL (1): same existing duplicate; no alternate base. |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --concurrency=2 --force` | PASS, 7/7 package checks, zero cached; does not make root lint green. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | PASS, both exit 0. |
| `node --test tools/*.test.mjs` | FAIL (1), 99 pass / 1 fail: unchanged MC-5 cannot load the duplicate lane registration. Its fixture Git writes are confined to temporary test repositories; this worktree's Git/index was not written. |
| `pnpm exec turbo run test --filter=@jobguard/core --filter=@jobguard/config --filter=@jobguard/ai --filter=@jobguard/storage --concurrency=2 --force` | FAIL (1), core 5,385 pass / 7 fail: generated-dist tests cannot find three adjacent `.ts` source files, and four allocator executions time out at the unchanged 5-second limit. Other tasks not claimed complete by this aborted run. No fix or expectation change made. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | PASS, 99 files / 2,696 source tests. Follow-up distinguishes source execution from the generated-dist failures above; no timeout change. |
| `pnpm --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage --workspace-concurrency=1 test` | PASS: config 2, AI 113, storage 4 tests. AI results are synthetic fixtures, not live-model approval. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 <21 non-integration unit files>` | FAIL (1), 193 pass / 8 fail. All failures in unchanged `audit-api-capture.test.ts`: scripted SQL rejects the already-existing `SELECT revision FROM app.start_quote_from_review(...)`. Full arguments: `db-unit-files.json`; output: `db-unit.log`. No changed integration file runs here. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 <83 non-database/non-HTTP unit files>` | PASS, 83 files / 1,664 tests. Full arguments: `api-unit-files.json`; output: `api-unit.log`. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | PASS, 40 files / 867 tests. |
| Direct strict `tsc` on the five changed integration files (command below) | PASS (0). |
| `pnpm build --concurrency=2 --force` | PASS, 7/7 tasks, zero cached. |
| `pnpm openapi:check` | Launcher FAIL (1), before checking parity: tsx CLI IPC `listen EPERM`. |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | PASS (0). Same source generator and `--check`, launched without the tsx CLI IPC listener; no schema output rewritten. |
| TypeScript AST/source-byte assertion and declaration comparison | PASS: all 412 assertion call expressions and all declarations in the five files byte-identical; no parse errors. Item 3's complete code block matches the proposal exactly. `assertion-preservation.json`. |
| Tracked-file SHA-256 comparison against the round-start snapshot | PASS before this receipt: only the five named tests and own lane file differ; all 2,098 other tracked files identical. Final check also allows this append only. `scope-preservation.json`. |
| `git diff --check`; final scope/prefix/message verification | PASS (0). |

Strict fixture compilation command:

```text
pnpm --filter @jobguard/db exec tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2023 --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck test/migfix-4.integration.test.ts test/quote-reacceptance-upgrade.integration.test.ts test/small-builder-origin.integration.test.ts test/quote.integration.test.ts test/practice-session.integration.test.ts
```

**NOT RUN:** the five affected PostgreSQL suites, all other PostgreSQL suites, test:db/test:migrations/test:restore, DB-backed API isolation, localhost/HTTP tests and browser/e2e suites. The dispatcher explicitly states that this sandbox cannot start PostgreSQL or bind localhost; these run in GitHub CI after dispatcher's push. API selection excludes `health.test.ts`, `shadow-isolation.application.test.ts`, `final-account-lock.isolation.test.ts`, `auth/sso/action-paths.test.ts` and `*.http.test.ts`; DB selection excludes integration files and socket-based `free-port.test.ts`. These are execution selections, not changed tests or new exemptions. Full `pnpm test` is NOT RUN and not claimed green. No baseline test rerun, clean install, live provider/model test or rollout execution claimed.

The original receipt prefix is retained exactly, SHA-256 `942e8d1d5601cb30cb929e2a462c6ef5f26a566f718243fa63cff82d53feeabf`. No migration, backwards-compatibility change to application code, new runtime permission or operational alert in this round. Existing LP-0/coordinator delta and rollout holds persist. Exact-commit independent Opus/Sol verdicts, their confirmation that only named setup changed, and separate actor acceptance remain absent; builder does not accept its own work. Park for Ben's button; no merge authority.

Intended conventional commit message written to both requested paths: `/private/tmp/jg-msg-LP-2-r3.txt` and `/private/tmp/jg-msg-lp-2.txt`. Dispatcher owns any subsequent commit, push and checker handoff.


## r4 (ruling 103)

18 October 2026. **STOP — ruling scope incomplete; BUILD-DON'T-MERGE, decision 74 remains.** Round-start HEAD `2ee3f87c8694e8f8543d869eaf84f0a3ec4474b4`, branch `codex/sandbox/lp-2`; worktree was clean. Read AGENTS.md, BUILD_PLAN §11.8, the LP-2 contract, proposal items 5/6, and both independent REPAIR verdicts supplied inline by the dispatcher. The external verdict files were not accessed. CI run 39018190840 evidence is from those supplied verdicts, not a fresh CI query.

### Required STOP: merged scripted-SQL fixture omitted from ruling 103

`packages/db/test/audit-api-capture.test.ts:55` is unchanged from origin/main and is absent from LP-2's own-file list. Independent second-checker finding B2 requires this fixture to recognise the replacement routine called by `packages/db/src/review-repository.ts:79`. Ruling 103 authorises the inventory/capability delta and Q3 owner/Q4 trusted-database fixtures; this scripted unit mock is neither conversion and is not named. The dispatch explicitly forbids other merged-test changes and requires STOP with file:line and before/after. No grant restoration or product-code workaround was attempted.

Before (actual line 55):

```ts
    if (sql.includes("app.transition_job")) { this.status = "quoting"; return rows([{ revision: 1 }]); }
```

Required after (PROPOSED ONLY, NOT APPLIED; needs coordinator scope amendment):

```ts
    if (sql.includes("app.start_quote_from_review")) { this.status = "quoting"; return rows([{ revision: 1 }]); }
```

Every assertion would remain byte-identical. The coordinator amendment would also need to allow this test path in `config/lanes/lp-2.json`. Do not restore `transition_job` access. This is the same missing authorisation identified explicitly in B2, not a newly invented approval requirement.

### Execution evidence and disposition

- `git rev-parse HEAD`, `git status --short`, and read-only source/diff inspection: expected head, clean initial tree; merged fixture matches origin/main.
- Initial default-launcher `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/audit-api-capture.test.ts`: emitted a pnpm configuration warning, did not reach Vitest, interrupted with exit 130. No install/download command issued.
- `PATH="/private/tmp/jg-lp1-bin:$PATH" pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/audit-api-capture.test.ts`: **FAIL**, exit 1, **8 failed / 6 passed**. All eight failures report `Unexpected SQL: SELECT revision FROM app.start_quote_from_review($1,$2,$3,$4,$5,$6,$7,$8)` at fixture line 61, called from repository line 79. This is a scripted unit reproduction, not PostgreSQL evidence.
- DB/API typecheck, root lint with `LANE_BASE_REF=origin/main`, lint:lanes, remaining unit suites, build and OpenAPI check: **NOT RUN** after the explicit STOP/build-nothing-else condition. No prior-round result is claimed as this round's verification.
- PostgreSQL, migrations, database-backed API isolation, browser/e2e/Playwright: **NOT RUN**, as ordered. No server or browser started.

Only this receipt is changed in the repository. Its path is already allowed in `config/lanes/lp-2.json`, so no lane change is needed; the shared lane register is untouched. Ruling 103 implementation changes remain unapplied because the dispatch requires stopping before building anything else. No tests, assertions, pins, ACL inventory, migrations, grants or application code changed. No commit, push, merge, deployment, independent acceptance or green-CI claim. Intended receipt-only conventional commit message is at `/private/tmp/jg-msg-lp-2.txt` for the dispatcher.

Pre-r4 receipt SHA-256: `e085e52dd36294bc6bfd142d751002092f36c5d3a0f8cc1ce7ca318d5122240b`. The preceding receipt bytes are preserved exactly.
