# LP-13 downstream effects, v1

RED. Synthetic build-ahead save on LP-6c `c2ec9e98adab349f60394b72415f390701ae458e`.
Source inspection and collected tests do not prove database behavior or acceptance.

| Item | Downstream treatment and required owner | Regression / additional CI suite |
| --- | --- | --- |
| 0017 invoice-number burning | LP-8a must revoke runtime/PUBLIC standalone reservation and direct sequence writes. It is **absent on this base**. LP-6c 0723 checked practice/lock-bound issuance allocates internally; preserve that latest body. No second allocator or reservation store. | LP13 repeats calls and attacks checked-command, actor, tenant, revoked approval and direct-write paths; compares issued records. Run lp8a-billing-revokes, UIWIRE-10 and lp5-commands integration suites, including supported issuance/concurrency/replay/rollback. |
| 0053 legacy unknown raiser | Existing legacy origin uses NULL membership/command and `legacy_unrecorded` / `legacy_synthetic_capture`. Unknown is not a verified person, time or command; do not invent a backfill. | LP13 exercises the legacy trigger. Run shared-money-origin and small-builder-origin integration suites and core extra-persistence tests. Fee qualification remains separately controlled. |
| 0003 scope progress actor | Base still has the 0003 operational routine. LP-6d must bind actor/protected tenant before lookup; it is **absent on this base**. Preserve start/complete/rework and keep writes limited to scope progress. | LP13 attacks unbound/forged/stale/wrong-tenant context, reason and revision; asserts operational positives and unchanged job, price, invoice, fee, approval and cap state. Run lp6d-routines, job, proof-application-records and practice-scope integration suites. |
| 0120 SSO audit connection | Latest base body is 0520: load the connection before sealing its tenant's audit event. Unknown connection refuses. Identity bootstrap creates no commercial authority. | LP13 uses stale tenant context and unknown connection under identity role, then checks exact audit tenant. Run enterprise-identity, sso-required, lp6a-sso and LP-6e audit integration suites. |
| 0095 replay branch | 0095 retires the 13-argument overload; 0356 revokes it. LP-5/6 binding protects supported command replay. Preserve all latest bodies and signatures. | LP13 attacks retired overload, forged original actor and second actor replay; original actor replays twice with unchanged effect counts. Run lp5-parties-import and lp3-activation-acceptance integration suites for supported adoption, concurrency and replay. |

Migration `0980_lp13_low_value_batch.sql` is an empty forward marker with an
empty proof. No tables, data changes, routines, grants, owners, policies, scanner
changes or source-pin changes. No new empty-table registrations are needed.
No backfill or rollback action. The upgrade regression snapshots every relevant
overload, definition, owner, ACL, search path, sequence/claim relation and policy,
and an existing sequence number; it checks exact preservation and predecessor
reservation revocation while retaining checked issuance.

## Landing dependencies

- LP-6d through LP-12 are siblings, absent from this pinned base. Their owners
  retain progress binding, audit/worker closure, sequence revocation, bound RLS
  and narrow owners, including legitimate identity/worker positive paths. This
  marker does not install those safeguards. The strict integration assertions
  are deliberately retained; they cannot pass on the LP-6c-only base. Rebase
  after those pieces land and run all suites above; do not skip the assertions.
- Fresh/upgrade PostgreSQL, catalogue/source/privilege/RLS checks, both LP13
  integration files and affected synthetic browser journeys remain CI work.
  Main's specs, scanner definitions and pins are unchanged.
- Independent exact-head RED review and green CI against current main are
  required. The old 6 Nov pre-check applies to `14a36c090`, not this candidate.
  No LP13 handoff was found under coordinator/handoffs-1109. Its pre-check had
  no blockers; this save follows its request to shorten this trace to current
  dependencies and run the downstream suites in CI.

## Local validation

- The `pnpm --filter ... exec tsc` wrappers could not activate pinned pnpm in this network-restricted environment (fetch/signature verification failed). No dependency installation completed; used installed Node tools directly.
- Installed TypeScript: `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` and the equivalent `apps/web/tsconfig.json`: passed.
- DB package runner: `node node_modules/vitest/vitest.mjs run --maxWorkers=2 test/lp13-low-value-batch.test.ts test/migration-proof-loader.test.ts`: 2 files, 81 tests passed. Initial proof-loader attempts failed because core dist was absent; built the existing core/storage packages with installed tsc and reran successfully. An initial root invocation also missed the DB config; final run used the package directory.
- DB package `vitest list --maxWorkers=2` on both LP13 integration files: 9 cases collected; no hooks or database execution.
- `node tools/agent-lane-boundary-lint.mjs --lane=lp-13-low-value-batch-r1`: main-relative failure lists inherited LP-6c paths. Used the same lint module's `lanePathAllowed` and `migrationOrderViolations` for the working tree plus `git diff c2ec9e98...HEAD`: exact six non-lane paths plus own lane file, no violation, migration order passed. HEAD equals base because Git is read-only; candidate-head CLI is router work.
- `git diff --check`: passed; no tracked base file changes.

PostgreSQL and browser suites were not run: this sandbox cannot start PostgreSQL
or bind localhost. No live providers, real money or customer data.
Lane scope is judged against c2ec9e98; until #666 lands, comparison to main also
contains LP-6c's files. The router commits/pushes this NOPR save.
