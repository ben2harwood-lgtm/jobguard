VERDICT: REPAIR
HEAD: 887c85e507a1c702dfb8d6ac8a9f151c46f60725

- **P2 BLOCKING — repair lengthens two timeouts.** [recovery-timing-pin.integration.test.ts:48](/private/tmp/jg-check-stored-times-1-20261012T001525/packages/db/test/recovery-timing-pin.integration.test.ts:48) adds a 120,000 ms setup allowance; line 381 adds a 60,000 ms AC9 allowance. At 0442abf these used Vitest’s defaults: 10,000 ms and 5,000 ms. This conflicts with your explicit “no … lengthened timeouts” requirement. **Required fix:** remove both increases and rerun the file, preserving every assertion. The recorded Mac run completed in 3.97 seconds, including AC9 in 680 ms.
- **P2 BLOCKING — required exact-head CI evidence remains incomplete.** [.github/workflows/ci.yml:31](/private/tmp/jg-check-stored-times-1-20261012T001525/.github/workflows/ci.yml:31) requires the browser suite. At my final check, [CI run 38183529869](https://github.com/ben2harwood-lgtm/jobguard/actions/runs/38183529869) had passed installation, typecheck, lint, tests, build, secrets and dependency audit. Browser installation was running; browser tests were pending. **Required fix:** obtain and record successful completion at the candidate head, resolving any failure before acceptance.

No additional functional blocker was found. The previous AC9 row-set blocker is repaired.

**First question: can the runtime change either stored time after insert? No.**

| Table | Privilege lineage and UPDATE guard |
|---|---|
| `app.recovery_case` | 0018:85 grants SELECT and revokes mutation privileges; 0034:3 grants INSERT; 0034:4 retains mutation denial. Runtime UPDATE/DELETE fails with 42501. The merged `recovery_immutable` trigger calls `reject_recovery_mutation` (0018:76), also refusing owner UPDATE/DELETE with 55000, `recovery history is append-only`. |
| `app.practice_feed_event` | 0106:100–107 assigns owner `jobguard_migration`, enables FORCE RLS, revokes PUBLIC/runtime privileges, then grants runtime SELECT/INSERT only. UPDATE/DELETE fails with 42501. Its mutation guard is **privilege only**. |

I traced the later registered migrations through 0122, including dynamic grant loops, column privileges, role membership and definer routines. None opens a time-changing path. Infrastructure lacks `app` access under 0000:88–89; identity under 0111:181.

Privilege alone is sufficient for these non-owner application roles: they cannot grant themselves UPDATE or assume the owner. The feed owner and superusers remain privileged exceptions. Superuser replica-mode UPDATE of both times remains possible, as expressly required by the order’s unchanged fixtures.

**Second question: does the insert pin hold? Yes, for every successful ordinary-mode insert.**

Migration 0127:5 unconditionally assigns `transaction_timestamp()`. Past, future, NULL and default values are replaced before constraints. Runtime, owner and ordinary-mode superuser inserts therefore receive the same pin. Infrastructure and identity cannot insert at all.

Both `a_recovery_timing_pin` triggers fire before their merged INSERT guards. `guard_practice_feed()` neither reads nor changes `created_at`; its thirteen-field integrity hash excludes it. The recovery source guard only takes its existing lock and returns the row. PostgreSQL documents the relevant [BEFORE-trigger behavior and name ordering](https://www.postgresql.org/docs/16/sql-createtrigger.html).

I found no bypass for the defined non-owner application roles:

- `COPY FROM` invokes triggers and is also unavailable under their RLS boundary. [PostgreSQL COPY documentation](https://www.postgresql.org/docs/16/sql-copy.html)
- `ON CONFLICT DO NOTHING` preserves the existing row; `DO UPDATE` requires denied UPDATE privileges.
- Neither table has a rewrite-rule, inheritance or partition route. These roles cannot create one.
- No migration grants SET permission for `session_replication_role`. Replica-mode bypass remains privileged; `local` behaves like `origin`. [PostgreSQL replication-setting documentation](https://www.postgresql.org/docs/16/runtime-config-client.html)

NULL, owner/superuser feed inserts and these alternative SQL paths were source-inspected, not independently executed here. The order’s required runtime past/future cases and owner/superuser case inserts have Mac PostgreSQL evidence.

**Third question: does the repaired upgrade proof satisfy the standing rule? Yes.**

At [test lines 319–342](/private/tmp/jg-check-stored-times-1-20261012T001525/packages/db/test/recovery-timing-pin.integration.test.ts:319), it installs everything before 0127, populates and snapshots, applies **0127 alone**, compares the complete snapshot, then calls `migrate()` twice.

After later migrations, lines 274–308:

- derive original primary-key columns from `pg_index`;
- match every original row by its primary-key identity;
- compare exactly its named pre-0127 columns using database-generated `row_to_json(...)::text`;
- require every original row to remain present and unchanged;
- ignore rows and columns added later;
- compare original column names and full `format_type(atttypid, atttypmod)` types.

The controls at lines 344–371 perform real SQL mutations inside rolled-back transactions and call the **same comparator**: microsecond changes on both stored times fail; the value-preserving retype fails; an added nullable column and an inserted row pass. The Mac log records AC9 passing with those controls.

There is no post-later-migrations assertion requiring an exact trigger inventory, complete row set, unchanged definitions of every function, or fixed total migration count. Those complete catalog comparisons occur immediately after 0127 alone. The final registry count concerns **0127 exactly once**, which is appropriate.

| Criterion | Result | Evidence |
|---|---|---|
| AC1 | MET | Function/trigger catalog shape; exactly two callers checked after 0127 alone. |
| AC2 | MET | First-trigger and merged-trigger-presence assertions. |
| AC3 | MET | Four runtime past/future cases; Mac PostgreSQL pass. |
| AC4 | MET | Owner and ordinary-mode superuser case inserts; Mac pass. |
| AC5 | MET | Product transaction-clock equality and server-time bounds. |
| AC6 | MET | F18/F19 scenarios, product controls, saved results and replay. |
| AC7 | MET | Visible-row mutation refusals and unchanged stored times. |
| AC8 | MET | Named merged database files unchanged and passing; tenancy/demo-bootstrap cover the migration-wrapper tests. |
| AC9 | MET | Repaired identity/type comparison and real rolled-back controls. |
| AC10 | MET | One registration line; sorted, unique, dependency-relative position. |
| AC11 | MET | Contract, appended migration notes, forward-fix instructions and exact residual. |

C1–C7’s applicable requirements are covered by this database-only change and the recorded regressions; no web workflow or new API boundary requires invention. **C8 remains held on incomplete CI evidence.**

Scope stays within eight task/registration/record files. Migration 0127 is correctly allocated. No table gains a column; no existing grant, policy, constraint, default, routine or stored row changes; no fingerprinted table is altered. No founder-reserved capability is introduced. The lane gains one line; `BUILD_PLAN.md` gains only the §12.2 ledger paragraph.

**Changed lines in merged test files: none.** The auth boundary test and all fourteen pinned/root files I checked are unchanged. The unedited superuser UPDATE fixtures passed on the Mac.

The money answers remain 0 pence with `Paid before you opened this case`, or F18 262,000p/F19 250,000p with the merged full-figure reason. The Mac scenarios establish that supplied times cannot flip them.

The contract and receipt plainly retain the residual: a raw writer can still back-date by keeping its transaction open, because the stored time is the transaction’s start. They also identify the privileged-owner/superuser exceptions.

**Executed locally**, using cached pnpm 10.28.1:

| Command/check | Exit | Result |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 tasks; 4 cached |
| `pnpm build` | 0 | 7 tasks; 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint` / `pnpm lint:lanes`, local mode | 1 / 1 | Detached HEAD refused |
| Same lint commands with actual PR #142 metadata | 0 / 0 | 7 lint tasks; lane checked 8 files |
| DB Vitest: `recovery-case-outcome`, `recovery-message-repository`, `--maxWorkers=2` | 0 | 2 files, 13 passed |
| API Vitest: `context-boundary`, `--maxWorkers=2` | 0 | 1 file, 145 passed |
| New integration-file TypeScript check | 0 | 0 diagnostics |
| Own scratch tests, `--test-concurrency=2` | 0 | 5 passed |
| Diff/unchanged-file checks | 0 | No tracked edits |

My [scratch tests](/private/tmp/jg-check-stored-times-1-20261012T001525/.tmp-check/independent.test.mjs) execute the candidate’s actual comparison helper with query doubles: later additions pass; missing originals, microsecond changes and full-type changes fail. They also inspect unconditional migration shape. They are not PostgreSQL integration tests.

I directly read the Mac logs supporting **27 new tests and 318 merged database regressions**, plus the repair-round rerun of 27 new and 63 merged tests. The tested code is unchanged between recorded commit 260b963 and this head.

I did not run PostgreSQL or a browser locally, inspect deployed grants, or verify the pending CI browser result. The host pnpm launcher initially failed registry verification; the checks above used the already cached pinned version. No tracked file was edited, committed or pushed.