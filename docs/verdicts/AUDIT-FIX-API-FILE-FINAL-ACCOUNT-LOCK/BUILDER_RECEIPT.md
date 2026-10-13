# AUDIT-FIX-API-FILE-FINAL-ACCOUNT-LOCK — builder receipt

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
