Built by Codex; dispatched 13 Oct 2026; prepared 15 Oct 2026.

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
