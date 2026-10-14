# AUDIT-FIX-API-FILE-FINAL-ACCOUNT-LOCK — builder receipt

## Repair r1 — 14 October 2026, dispatcher 6: DO NOT COMMIT

**Stopped under the work order's protected-test conflict rule.** Starting HEAD is exactly `d7f124860ee974d978cfff51af386814f1f61146` (PR #196); the working tree was clean. No product code, test, pinned list, migration or lane entry was changed in this round. Only this receipt is updated. The overwritten intended-message file `/private/tmp/jg-msg-audit-fix-api-file-final-account-lock.txt` starts with `do not commit`. No Git write command was run. This is source inspection and local execution evidence, not an independent verdict or acceptance.

### Confirmed failure and incompatible premises

The supplied filtered log for GitHub CI **38515411523** reports exactly one failure: `apps/api/src/shadow-isolation.application.test.ts`, **Test Q: successful mutations, exports, delivery/retry telemetry and every mutation error surface are identical**, throws `FinalAccountLockError: STALE_REVISION` at repository line 92, called through Test Q's `success` helper. No other CI failure appears in that supplied log; it is not a full CI log reviewed here.

The cause is an actually stale source set, despite the unchanged draft revision number:

1. Test Q calls exported `seedAccount(initial, DEMO_TENANT_ID, 100000)` before cloning its databases. That fixture inserts revision 1 with exactly one baseline line, net/tax/gross **100000 / 20000 / 120000 pence**, and no variation lines. It supplies an artificial source hash of repeated `a` characters.
2. In each replay, Test Q proposes, prices and **approves** `Fictional captured tap` for **12000 pence** (current source line 338). `VariationApplication.command` calls the same `approvePricedVariation` path used by the audit regression. That path inserts the approval and sets the variation to `approved`; it does not assemble or change the final-account revision or lines.
3. The remaining commands add unpriced captures, proof and operational facts. None rebuilds the account. Test Q then locks the original `a.revisionId` with `expectedRevision: 1` (current source line 358), and later invoices that same revision with the artificial original source hash (line 366).
4. Thus `approved_sources` contains the approved 12000p variation, while `account_sources` is empty. The two-direction `EXCEPT ALL` correctly returns stale. The snapshot's capture register includes the extra, but its line set does not bill it; those are different records.
5. The audit PostgreSQL regression requires this exact predicate to refuse: assemble baseline-only revision 1, approve a capture, then attempt to lock revision 1. Its ordinary-capture and final-review cases require `STALE_REVISION` and transaction rollback. The new adapter regressions still pass unchanged locally.

Accepting Test Q's original account would restore the audited omission of approved builder work. Automatically assembling during approval or lock cannot preserve its immutable revision ID, expected revision and source hash. Recognizing its handmade baseline/hash, amount, fixture name, caller or test environment as a freshness exemption would introduce a bypass; all affected code already runs in `synthetic_demo`. No legitimate product distinction was found. The contradiction concerns freshness, not shadow-signal visibility. The historical-replay exception does not apply: Test Q creates a fresh lock.

### Exact fixture setup proposed to the coordinator — NOT APPLIED

The minimal fixture-only option is to complete the handcrafted account in **each disposable replay database**, immediately before its existing `final-account lock` success call (current line 358). The following is one additional setup statement, formatted across lines for review:

```ts
await withTenant(inspect,testTenantContext(DEMO_TENANT_ID),async(db:{$client:PoolClient})=>{
 await db.$client.query("INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal) SELECT gen_random_uuid(),r.tenant_id,r.job_id,$3,'variation',r.id,r.scope_item_id,r.id,a.id,r.description,r.signed_delta_pence,2 FROM app.variation_approval a JOIN app.variation_revision r ON(r.tenant_id,r.job_id,r.id)=(a.tenant_id,a.job_id,a.revision_id) JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(a.tenant_id,a.job_id,a.variation_id) WHERE a.tenant_id=$1 AND a.job_id=$2 AND v.state='approved' AND v.current_revision_id=a.revision_id",[DEMO_TENANT_ID,a.jobId,a.revisionId]);
 await db.$client.query("SET LOCAL session_replication_role='replica'");
 await db.$client.query("UPDATE app.final_account_revision SET net_pence=112000,tax_pence=22400,total_pence=134400 WHERE tenant_id=$1 AND job_id=$2 AND id=$3",[DEMO_TENANT_ID,a.jobId,a.revisionId]);
});
```

This records the exact current approved source identities/approval/description/value and makes the fixture header agree with its baseline plus the approved £120 extra: **£1,120 net / £224 candidate VAT / £1,344 gross**. It retains the fixture's original revision ID, revision number and artificial source hash, so existing lock/invoice calls and isolation comparisons need no edits. The owner connection and transaction-local trigger bypass are fixture infrastructure only, following the protected test's existing ownership-setup pattern; the bypass is needed because the seeded revision header is immutable. It must never enter product code. A fuller alternative is to replace the handcrafted fixture with authentic assembler inputs and use the resulting revision/hash in subsequent calls; that requires more protected-test changes.

**The proposed setup is source-inspected only and has NOT been executed or approved.** It mutates an artificial fixture's immutable header, so only the coordinator may authorize it. A PostgreSQL CI run must verify the complete isolation replay and all audit regressions after any authorized fixture change. This round adds no helper, bypass, test change or permanent byte/hash pin. Protected Test Q line 393 and the entire protected file remain byte-identical to starting HEAD, as does `apps/api/src/auth/context-boundary.test.ts`; this is a one-off read-only comparison, not a new test.

### r1 checks and all failures

Dependencies were already installed; no install/download was attempted. Commands use the existing `/private/tmp/jg-audit-lock-bin/pnpm` launcher for pinned **pnpm 10.28.1**, with Node **24.17.0** (repository `.nvmrc` remains **24.15.0**). `origin/main` at inspection is `774cc81b097ab223dcf7d463ec433c62736ac6ca`; no fetch was run. Detailed local logs are `/private/tmp/jg-lock-r1-*.log`.

- `pnpm typecheck`: exit 0; seven workspace results replayed from Turbo cache.
- `LANE_BASE_REF=origin/main pnpm lint`: exit 0; real root boundary/lane checks run, seven workspace compiler results cached.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 0; actual branch/base comparison passed.
- `pnpm build`: exit 0; seven workspace build results cached. No fresh build claim.
- `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs`: exit 0, **19 passed**.
- Core `vitest run src --maxWorkers=1`: exit 0, **81 files / 2445 passed**.
- Web `vitest run --maxWorkers=1`: exit 0, **33 files / 784 passed**.
- AI `vitest run src --maxWorkers=1`: exit 0, **5 files / 80 passed**; fixture-only, no live model call.
- Config and storage `vitest run --maxWorkers=1`: exit 0 each; **2 passed** and **4 passed**, respectively (including compiled duplicates).
- DB `vitest run test/audit-api-file-final-account-lock.test.ts --maxWorkers=1`: exit 0, **2 passed**; scripted adapter, not PostgreSQL.
- `pnpm openapi:check`: **exit 1**, tsx CLI cannot bind its IPC pipe (`listen EPERM`) in this sandbox. Same generator via `node --import tsx src/generate-openapi.ts --check` in `apps/api`: **exit 0**; no generated artifact changed.

- API `vitest run src --maxWorkers=1 --exclude 'src/**/*.http.test.ts' --exclude 'src/health.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/final-account-lock.isolation.test.ts' --exclude 'src/watchdog-registry.test.ts'`: exit 0, **64 files / 1436 passed**.
- API `vitest run src/final-account-lock.isolation.test.ts -t 'DW8 application read' --maxWorkers=1`: exit 0, **2 passed / 1 selected out**; scripted adapters only, real-database isolation remains for CI.
- API `vitest run src/watchdog-registry.test.ts -t '^(?!.*round 12)' --maxWorkers=1`: exit 0, **86 passed / 35 selected out**; listener-dependent cases remain for CI.
- DB `vitest run src test --maxWorkers=1 --exclude '**/*.integration.test.ts' --exclude 'test/free-port.test.ts'`: **exit 1**, **301 passed / 1 failed**, 24 files. The `test` name filter also selected compiled unit copies. The sole failure is `dist/audit-checkpoint-handoff.test.js`, **[C-OPS-1] all transitive request workspace sources and package entry targets cannot reach the operator**, mapped to unchanged `src/audit-checkpoint-handoff.test.ts:279`, exceeding its unchanged **5000ms** limit (5338ms).
- DB source-only retry `vitest run src test --maxWorkers=1 --exclude 'dist/**' --exclude '**/*.integration.test.ts' --exclude 'test/free-port.test.ts'`: **exit 1**, **208 passed / 1 failed**, 18 files. The same C-OPS-1 case fails in the source file at line 279 (5131ms / unchanged 5000ms limit). Neither the test nor its timeout was changed. This source-inspection failure also appears in the earlier builder receipt; it is additional local failure evidence, not an additional failure in the supplied CI log.
- Receipt-inclusive `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 0. `git diff --check`: exit 0. Read-only protected-file comparison: unchanged. `git diff --numstat`: only this receipt.

**All failures this round:** (1) supplied CI Test Q `STALE_REVISION`, unresolved; (2) local OpenAPI wrapper IPC `EPERM`, direct generator succeeds; (3) local DB compiled C-OPS-1 timeout; (4) local DB source-only C-OPS-1 timeout. No other executed check failed. Earlier historical failures below are previous-round evidence, not reruns this round.

Root `pnpm test` is not run because it includes PostgreSQL/listener suites and lane-tool fixture tests that execute Git write commands. No PostgreSQL, migration, HTTP listener or browser/E2E suite was started, as explicitly prohibited by the dispatcher's environment note. These remain mandatory CI evidence. No prior suite, assertion, expected value, refusal or timeout was weakened. Rules 11/12: no credential literal and no permanent source-file pin added.

**Remaining gate:** coordinator decision on the protected fixture; then real-PostgreSQL Test Q plus the unchanged stale-source/rollback/concurrency/replay regressions, full CI and browser/migration checks as applicable, independent RED verdict bound to the exact commit and separate acceptance. The originally reported CI failure remains unresolved by design under the stop instruction. No migrations, backfills, grants, production enablement, provider changes or operational alerts.

---

Issued 13 October 2026 by dispatcher 4. Built in the working tree on `codex/sandbox/audit-fix-api-file-final-account-lock`, starting HEAD `c08a53784c05b54b18f7bfff87f4c7597032ca7e`. No Git write command, commit, push or merge was performed. Intended commit text is `/private/tmp/jg-msg-audit-fix-api-file-final-account-lock.txt`.

**RED — money, immutable commercial history, tenant-scoped commands and retries.** This is builder evidence, not independent verification or technical acceptance. Independent verdict on the dispatcher's exact commit, separate acceptance and database/browser CI remain outstanding.

## Finding and implementation

Source report: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-final-account-lock.md` (1 BLOCKING, 0 LATER).

**BLOCKING #1 reproduced and fixed at the API repository transaction:** a draft head can remain revision 1 after a captured extra is approved. `FinalAccountLockRepository.lock` now checks that every current approved variation source exactly matches the account's variation lines, in both directions, including source/revision/scope/approval identity, description and signed pence. It uses the same approved-source predicate as the existing assembler. A mismatch raises `STALE_REVISION` before `withTenant` commits, rolling back the lock, receipt and audit event together. No source or historical account is rewritten.

The existing controlled routine acquires the job and all existing variation locks; they remain held through validation. The new queries take no business locks after the audit append. New variation insertions serialize on the job via existing triggers, while pricing/approval/rejection serialize on the variation rows. The new row's `xmin` compared with the current transaction ID distinguishes a fresh insert from replay, including a duplicate command that waited for another transaction. Historical replay skips current-source validation and keeps the immutable response. PostgreSQL 16 documents the current transaction ID and `xid8` to `xid` cast: [system information functions](https://www.postgresql.org/docs/16/functions-info.html#FUNCTIONS-PG-SNAPSHOT).

Scope limitation: the freshness check is in the repository transaction, alongside its existing snapshot-hash checks. The raw SQL routine called outside this repository has not acquired this guard; no independent raw-routine freshness guarantee is claimed by this API fix. Production/release approvals remain pending under the existing contract.

Affected invariants: AGENTS §§5.1–5.5, 5.7, 5.10, 5.14; BUILD_PLAN §10.2.6 and SV-4. Commercial behavior changes only for new lock attempts with stale approved variation lines; these now refuse with the existing typed error. Replay, policy versions, terms, invoice amounts and schemas are unchanged. No provider call, real data, spending, new operational alert or production enablement.

## Test first

Before implementation, added `packages/db/test/audit-api-file-final-account-lock.test.ts` and ran:

```sh
cd packages/db
./node_modules/.bin/vitest run test/audit-api-file-final-account-lock.test.ts --config /private/tmp/jg-audit-lock.vitest.config.mjs --maxWorkers=1
```

**Exit 1, expected failure:** `lock rejects an account assembled before a captured variation was approved` failed at `.rejects.toMatchObject({ code: 'STALE_REVISION' })`: `promise resolved "{ …(14) }" instead of rejecting`. The real application and repository returned the valid baseline-only lock. This is a scripted SQL-adapter reproduction, not a PostgreSQL result. Temporary aliases mapped existing package names to source to avoid supplied stale dist exports. An earlier attempt with the standard DB configuration failed because its supplied core dist lacked `createFinalAccountLockSnapshot`; that setup failure is not the reproduction evidence.

After the fix, the same regression passed. A second adapter test checks successful commit and unchanged historical replay after current sources change. Standard DB-config run: **exit 0, 1 file / 2 tests**.

New PostgreSQL regression file (NOT EXECUTED HERE) establishes an authenticated session-owned synthetic job at INSERT, an accepted £33,600 baseline and verified proof, then calls the existing assembler. It approves a £400 extra after revision 1, asserts `STALE_REVISION` and zero lock/receipt/lock-audit effects, reassembles, races duplicate locks, adds an explicit completed-check fixture and issues through the application. Expected net/VAT/gross: **3,400,000 / 680,000 / 4,080,000 pence**. Covers ordinary and final-review origin separately, pending-capture omission, later-approval replay and a variation leaving the approved state. The completion row and evidence bytes are synthetic fixtures; they are not a detector, live reconciliation or provider integration.

DROPPED findings: none.

## Scope and preservation

Zero migrations, schema changes, backfills or deployed GRANTs. **Standard F:** no new application-login money, membership, authorization, receipt or audit write privilege. The only new GRANT text is disposable PostgreSQL test-cluster setup: `GRANT jobguard_runtime TO audit_lock_login`. It grants role membership to a new non-superuser/non-BYPASSRLS test login, adds no table privilege and never runs against a deployed database. The completion fixture uses the existing superuser test connection with tenant context. Rollback is a code rollback; immutable stored facts keep their existing shape.

No existing test, expected value, refusal, count, pinned name, fingerprint or catalogue was edited. `apps/api/src/auth/context-boundary.test.ts` and all its pinned lists remain byte-identical. No existing catalogue row was added. Before/after premise-setup exception in an existing test: **none**. The new standalone integration file establishes its own baseline/proof/session before unchanged product calls; no trigger bypass is used. Only one compact new exact-path lane entry was added; every existing lane entry is unchanged. Shared lane registry edits serialize with the coordinator. No sub-agents were used.

## Checks actually run

Dependencies were supplied; no clean install was performed and no package installation completed. Node observed **24.17.0**, repository `.nvmrc` **24.15.0**. Default launcher **11.8.0** tried automatic version switching and reported registry fetch/signature verification failure. A cached **pnpm 10.28.1** was found and used directly through `/private/tmp/jg-audit-lock-bin/pnpm` for the remaining commands and nested Turbo tasks; package pins/lockfile were untouched. The first typecheck attempt with the wrong nested launcher was interrupted and is not a passing check.

`LANE_BASE_REF=origin/main` is used for lint/lanes. Origin/main advanced externally during the run from the issued HEAD to `bd959b01e857de0ba7cbd3588bab84add7d0f493`; no fetch or Git write was performed here. Current lane lint compares against that live reference. Dispatcher should bind the final review to the actual commit and intended base.

- `pnpm lint:lanes`: PASS, exact task lane and working-tree paths.
- Safe tool unit tests (`node --test` commercial-boundary, core-purity, decision-check-purity, decision-records, dependency-audit, policy-gate-sites, shared-money-origin): PASS, 19 tests.
- Targeted adapter regression: PASS, 2 tests.
- `pnpm typecheck`: PASS, 7 workspaces (4 cached, 3 executed).
- `pnpm lint`: PASS, source/lane/money checks and 7 workspaces (4 cached, 3 executed).
- `pnpm build --force`: PASS, 7 workspaces freshly built; 31 Next.js static pages. Existing Next workspace-root/CSS/cache warnings remain.
- New-test TypeScript check (`tsc -p /private/tmp/jg-audit-lock-test-tsconfig.json`): PASS after correcting an implicit-any callback in the NEW test only.
- `pnpm openapi:check`: exit 1, sandbox EPERM opening the tsx CLI IPC pipe. Same generator through `node --import tsx src/generate-openapi.ts --check`: PASS, exit 0.
- Relevant API tests via temporary source aliases (final-account-lock application/controller and final-account application): PASS, 3 files / 21 tests.
- Scripted API isolation portion only (`-t 'DW8 application read'`): PASS, 2 tests; the real-PostgreSQL test is skipped by this explicit selector.
- Watchdog registry without listener-based round-12 tests (`-t '^(?!.*round 12)'`): PASS, 86 tests; 35 selected-out tests remain for dispatcher/CI.
- AI source fixtures: PASS, 5 files / 80 tests; no live model calls or changed prompt/model/schema, so no new live evaluation gate is invoked.
- Config/storage package scripts: PASS, 2 and 4 tests respectively, including their compiled duplicates.
- Core source suite (`vitest run src --maxWorkers=1`): exit 1, 2443 passed / 2 timed out, 81 files. Both failures were in the unchanged `receipt-allocation.test.ts` at its unchanged 5000 ms budget. Isolated unchanged-file retry: PASS, all 34 tests.
- DB unit subset after fresh dist (excludes integration, free-port and compiled tests): exit 1, 170 passed / 1 timed out. Isolated unchanged-file retry: exit 1, 55 passed / 1 timed out. Remaining failure is `src/audit-checkpoint-handoff.test.ts:279`, `[C-OPS-1] all transitive request workspace sources and package entry targets cannot reach the operator`, exceeding its unchanged 5000 ms budget (about 11.4 seconds on retry). No assertion or timeout was changed; dispatcher must rerun it.
- Web unit suite: PASS, 33 files / 784 tests.
- `git diff --check`, existing-lane comparison, existing-test/migration path comparison and protected-auth byte comparison: PASS (read-only Git).
- Working-tree classifier using the coordinator's actual `lane-floor.py` glob logic/map: path minimum AMBER (four AMBER paths, GREEN receipt). Raised to RED for money; canonical post-commit lane-floor command remains in the dispatcher list.
- Final broad API source subset after fresh dist: PASS, 62 files / 1430 tests. Command: `vitest run src --maxWorkers=1 --exclude 'src/**/*.http.test.ts' --exclude 'src/health.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/final-account-lock.isolation.test.ts' --exclude 'src/watchdog-registry.test.ts'`. The latter two files have their permitted portions checked separately above; all selected-out database/listener tests remain mandatory dispatcher/CI checks.

Initial broad API and DB unit runs before dist refresh were interrupted (130); they showed missing compiled exports and timeouts. The first default core script run included `dist` duplicates and was also interrupted (130), with duplicate source-inspection failures and timeouts. These are NOT passes. Remaining direct runs exclude compiled duplicates and use one worker. No timeout, refusal, expected value or test was adjusted.

Full root `pnpm test` is deliberately not launched here: it starts forbidden PostgreSQL suites and tool fixtures that issue Git write commands. The permitted unit subsets are run separately. No PostgreSQL, browser, HTTP listener, migration or E2E suite is started in this sandbox.

## LATER and weakest-test recommendations — receipt only

The report has **zero LATER findings**. Its five weakest-test recommendations are deferred unchanged:

1. Real isolation fixture: also create an independent fresh lock in the populated database and compare persisted capture identities, lines and totals, preserving byte-exact replay.
2. Scripted isolation response: add signal-dependent field/hidden-query mutation controls, keeping PostgreSQL as the isolation proof.
3. Final-review application forwarding: assert the entire command and persist exact origin/price with PostgreSQL.
4. Unowned-job refusal tests: use valid commands for every method plus `get`, and spy on all relevant operations.
5. Controller tests: assert distinct exact job/body/result/session-token forwarding.

## Dispatcher / Mac / CI checks

After the dispatcher commits, with the clean pinned install:

```sh
LANE_BASE_REF=origin/main pnpm typecheck
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm test
pnpm build
pnpm openapi:check
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-api-file-final-account-lock.integration.test.ts test/final-account-lock.integration.test.ts test/final-account-lock-invoice.integration.test.ts test/final-account-lock-upgrade.integration.test.ts test/final-account-lock-reveal.integration.test.ts test/final-account.integration.test.ts test/variation.integration.test.ts
pnpm --filter @jobguard/api exec vitest run src/final-account-lock.isolation.test.ts --maxWorkers=1
pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1
pnpm test:db
pnpm test:migrations
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop SV-4.spec.ts final-account.spec.ts
python3 /Users/benharwood/.local/share/full-steam/lane-floor.py jobguard "$PWD" c08a53784c05b54b18f7bfff87f4c7597032ca7e <dispatcher-commit>
```

Database and browser suites must run on the Mac outside the sandbox or in GitHub CI. Preserve RED even if the path floor is lower. PostgreSQL execution is required to prove source-set SQL, transaction-ID replay detection, rollback and concurrent duplicate behavior. Obtain the independent RED verdict on the exact dispatcher commit and separate technical acceptance before merge. This receipt does not provide either.

## Final handoff status

Implementation and permitted local checks are recorded; technical acceptance is **HELD** for the unchanged DB unit timeout, real PostgreSQL/source-set/concurrency/rollback tests, browser journeys, clean pinned full CI and the independent exact-commit RED verdict. No builder acceptance, merge or release is claimed. Intended commit file is present; dispatcher owns committing/pushing this tree.

---

## Repair r2 — 14 October 2026, Test Q premise set-up (coordinator ruling) — NOT PUSHED

Supersedes the r1 "do not commit" note. Merge of origin/main (353686d6) done as commit d364fe09 (only conflict: `config/agent-lane-assignments.json`, resolved with lane-union.py, 172 lanes). Set-up applied as its own commit 0f415386.

### BEFORE / AFTER — `apps/api/src/shadow-isolation.application.test.ts`
Pure insertion: 0 lines removed or altered, 6 lines added immediately before the unchanged line `await success("final-account lock",()=>app.finalAccountLock.lock(a.jobId,{...expectedRevision:1,...}))` (was line 358).
- BEFORE: `...await success("proof complete",...);` then `await success("final-account lock",...)`.
- AFTER: same, with between them one comment line + a `withTenant(inspect,...)` block (INSERT of the approved variation as `final_account_line` ordinal 2; `SET LOCAL session_replication_role='replica'`; UPDATE of the fixture revision header to 112000/22400/134400). Text is exactly the r1 proposal. No assertion, expected value, call under test, revision id, expectedRevision or source hash changed.

### Commands
- Environment fix: `@embedded-postgres/darwin-arm64` dylib symlinks were missing; ran its own `scripts/hydrate-symlinks.js` (node_modules only).
- heavy-slot vitest (apps/api): shadow-isolation.application + final-account-lock.application + final-account-lock.isolation: exit 0, 3 files / 39 tests passed (Test Q passes with the set-up).
- heavy-slot vitest (packages/db): audit-api-file-final-account-lock.integration + .test + final-account-lock.integration: exit 1; 16 passed / 4 failed, all 4 in the piece's OWN new `audit-api-file-final-account-lock.integration.test.ts`: `SCOPE_ITEM_NOT_BASELINE` thrown by its `fixture()` (disposition recorded at line 67 before any assemble exists). Never run against PostgreSQL before. Proposed fixture-only fix (move the disposition after the first assemble) was blocked by the permission classifier, so NOT applied.
- heavy-slot vitest (apps/api): shadow-detection-lock-race + final-account-lock.controller + job-work-state.isolation: exit 1; 6 passed / 7 failed, all in job-work-state.isolation (`JobWorkStateRepository is not a constructor`, `checkPostLockAfterLiveRefusal is not a function`): most likely stale `packages/db/dist` (not rebuilt after merging main); not diagnosed further, not run after a build.
- `pnpm typecheck`: exit 0.
- `LANE_BASE_REF=origin/main pnpm lint` and `pnpm lint:lanes`: exit 1. "Lane audit-fix-api-file-final-account-lock cannot edit apps/api/src/shadow-isolation.application.test.ts": the lane `allow` list does not include the protected test file. Adding it is a lane-config change needing a coordinator ruling.

Not pushed. Not independently verified, not accepted.
