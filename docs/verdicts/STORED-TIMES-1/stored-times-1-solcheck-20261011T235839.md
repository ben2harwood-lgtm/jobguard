VERDICT: REPAIR
HEAD: 0442abfa124c83f4851871bad04c3e0fdc6e4609

- **P2 BLOCKING — AC9 still restricts later migrations.** [recovery-timing-pin.integration.test.ts:280](/private/tmp/jg-check-stored-times-1-20261011T235839/packages/db/test/recovery-timing-pin.integration.test.ts:280) selects every row; line 311 compares that complete collection after later migrations. A later migration appending its own audit event fails this assertion despite preserving every pre-existing row. My test executed the candidate’s actual helper with a query double and reproduced the failure. **Fix:** capture pre-0127 row identities and compare only those identities’ named pre-existing columns after later migrations. Preserve the complete snapshot comparison immediately after applying 0127 alone. Require every original row to remain present and unchanged.

- **P2 BLOCKING — required CI evidence remains incomplete.** [.github/workflows/ci.yml:31](/private/tmp/jg-check-stored-times-1-20261011T235839/.github/workflows/ci.yml:31) requires the browser suite. At my final check, [CI run 38182080763](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/38182080763) was still running that step. **Fix:** obtain and record its successful result at this head; investigate any failure before acceptance. Earlier CI steps passed.

- **P3 LATER — receipt overstates the observed role/time matrix.** [BUILDER_RECEIPT.md:243](/private/tmp/jg-check-stored-times-1-20261011T235839/docs/verdicts/STORED-TIMES-1/BUILDER_RECEIPT.md:243) reads as though both past and future case inserts were exercised for runtime, owner and superuser. The owner/superuser tests at test lines 154–156 supply only the past time. **Fix:** describe runtime past/future coverage and owner/superuser past-time coverage separately. AC4’s required cases are covered.

The runtime role **cannot change either time after insert**. I traced all merged migrations, including dynamic grant loops, role memberships, column grants and definer routines:

| Table | Privilege lineage and UPDATE refusal |
|---|---|
| `recovery_case` | 0018:85 grants SELECT and denies mutation; 0034:3 restores INSERT; 0034:4 retains mutation denial, SQLSTATE 42501. `recovery_immutable` calls `reject_recovery_mutation` from 0018:76, rejecting owner UPDATE/DELETE with 55000, `recovery history is append-only`. |
| `practice_feed_event` | 0106:100–107 revokes PUBLIC/runtime privileges, then grants runtime SELECT/INSERT only. UPDATE/DELETE is denied with 42501. There is no mutation trigger. |

Later migrations add no mutation privilege or callable time-changing route. Infrastructure lacks `app` access under 0000:88–89; identity under 0111:181. Both tables retain owner `jobguard_migration`, tenant policies and FORCE RLS.

Privilege alone is sufficient for the **non-owner application-role boundary**: those roles cannot grant themselves UPDATE or assume the owner. It is not administrator protection. The owner and superuser can update a feed row; superuser replica mode can update both times. These privileged exceptions are expressly preserved by the issued order and required unchanged fixtures.

The insert pin itself holds for every successful ordinary-mode insert, including owner and superuser inserts. Infrastructure and identity cannot insert. Migration 0127:5 unconditionally assigns `transaction_timestamp()`, replacing past, future, NULL and default values before constraints. Its `a_recovery_timing_pin` triggers precede `recovery_message_source_write` and `practice_feed_event_guard`. Neither merged guard changes the time; the thirteen-field feed integrity hash excludes it.

I found no bypass for a non-owner application role:

- `COPY FROM` fires triggers and is additionally unavailable under these roles’ RLS.
- `ON CONFLICT DO NOTHING` leaves the existing pinned row unchanged; `DO UPDATE` requires the denied UPDATE privilege.
- Neither table has an inheritance/partition route or rewrite rule. Those roles cannot create or attach one.
- No merged migration grants SET permission for `session_replication_role`; `local` mode still fires ordinary triggers. Owners can disable triggers and superusers can use replica mode—the documented privileged boundary.

These conclusions agree with PostgreSQL 16’s [trigger](https://www.postgresql.org/docs/16/sql-createtrigger.html), [COPY](https://www.postgresql.org/docs/16/sql-copy.html), [rule](https://www.postgresql.org/docs/16/sql-createrule.html) and [replication-setting](https://www.postgresql.org/docs/16/runtime-config-client.html) documentation.

The upgrade proof correctly applies 0127 alone before comparing complete rows, functions, triggers, privileges, constraints and columns. Those assertions precede later migrations. There is no final exact trigger inventory, whole-row-column comparison, all-function comparison or total migration-count assertion. The remaining problem is the unrestricted row collection at line 311.

| Criterion | Result | Evidence |
|---|---|---|
| AC1 | MET | Catalog shape, permissions and two callers checked at the appropriate migration state. |
| AC2 | MET | First-trigger and merged-trigger-presence assertions. |
| AC3 | MET | Four runtime past/future insert cases; Mac PostgreSQL pass. |
| AC4 | MET | Owner and ordinary-mode superuser case inserts; Mac pass. |
| AC5 | MET | Product clock equality and server-time bounds; Mac pass. |
| AC6 | MET | F18/F19 chosen-time scenarios, controls, persisted results and replay; Mac pass. |
| AC7 | MET | Application-role refusals, unchanged visible rows and owner boundary; Mac pass. |
| AC8 | MET | All eleven named merged files unchanged and passing; tenancy/demo-bootstrap also passed, covering the migration-wrapper tests. |
| AC9 | **NOT MET** | Later appended rows invalidate line 311. |
| AC10 | MET | One registry line; sorted, unique, dependency-relative position. |
| AC11 | MET | Contract, appended migration notes, forward-fix instructions and exact residual sentence. |

Scope inspection found eight changed files, all within the task plus the authorized ledger paragraph. Migration number 0127 is correct. No column, existing grant, policy, constraint, routine, stored row or fingerprinted table is changed. No founder-reserved capability is introduced. The lane gains one line; `BUILD_PLAN.md` gains only its §12.2 paragraph. **Changed lines in existing test files: none.** The auth boundary test and all fifteen pinned/root files are byte-identical to main.

The merged money calculation remains unchanged: 0 pence with `Paid before you opened this case`, or F18 262,000p/F19 250,000p with the merged reason. The Mac tests confirm supplied times cannot flip those answers. The unedited superuser UPDATE fixtures passed.

Executed locally, using cached pnpm 10.28.1 and serial runs:

| Check | Exit | Result |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 tasks; 4 cached |
| `pnpm build` | 0 | 7 tasks; 5 cached |
| Lint / lane lint, detached local mode | 1 / 1 | Refused detached HEAD |
| Same lint commands with actual PR metadata | 0 / 0 | Lint 7 tasks; lane checked 8 files |
| DB unit tests, two files, `--maxWorkers=2` | 0 | 13 passed |
| Auth boundary test, `--maxWorkers=2` | 0 | 145 passed |
| New integration-test TypeScript inspection | 0 | 0 diagnostics |
| Own scratch tests, `--test-concurrency=2` | 1 | 2 passed; upgrade counterexample failed as reported above |

My cases are in [.tmp-check/stored-times-independent.test.mjs](/private/tmp/jg-check-stored-times-1-20261011T235839/.tmp-check/stored-times-independent.test.mjs). They test unconditional migration shape, later-column tolerance and later-row tolerance; the latter two execute the actual helper with a query double.

I source-inspected the specifications, migrations, write paths, guards, upgrade proof and full diff. I relied on the receipt **and directly read Mac logs** for 27 new PostgreSQL cases and 318 merged regression tests. The tested migration, registration and new test are unchanged between the recorded Mac commit and this head. Exact-head CI has passed install, typecheck, lint, tests, build, secrets and dependency audit.

I did not run PostgreSQL or a browser locally, verify deployed privileges, or obtain the still-pending browser result. No tracked file was edited, committed or pushed.

The contract and receipt plainly retain the residual: a raw writer can still back-date by as long as it keeps its transaction open, because the stored time is the transaction’s start.