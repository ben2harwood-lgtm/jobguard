VERDICT: PASS
887c85e507a1c702dfb8d6ac8a9f151c46f60725

# STORED-TIMES-1 (PR #142) — round 1 delta check, Claude Opus 5.5, 12 Oct 2026

Same reviewer as the first pass (`stored-times-1-opus-0442abf.md`, PASS at `0442abf`). Reviewed: worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/stored-times-1`, head `887c85e507a1c702dfb8d6ac8a9f151c46f60725` (confirmed; tree clean; equals the pushed branch; contains `0442abf`). The delta is `git diff 0442abf 887c85e`: two commits (`260b963` test + ledger sentence, `887c85e` receipt), three files, +234 / −18.

Reading and `git` only; I ran nothing. "The test" is `packages/db/test/recovery-timing-pin.integration.test.ts`.

Blocking findings: 0. Later findings from this round: 3. From the first pass, L1 and L2 are closed; L3 to L8 stand unchanged.

## What changed, exactly

- The test: nine small hunks, all inside the upgrade proof and its helpers, plus the two time budgets (:8 import, :48 hook budget, :269-313 helpers, :332-333, :342-371, :381 test budget). AC1 to AC8, AC10 and AC11 are byte-identical to `0442abf`.
- `BUILD_PLAN.md:3365`: one phrase.
- The receipt: one paragraph replaced by a table, one section appended.
- Untouched since `0442abf`: the migration and both triggers, `migrate.ts`, `MIGRATIONS.md`, the contract, the lane line. Against main the piece is still 8 files, additions only, 0 lines removed.

## Items

**1. After 0127 ALONE the complete snapshot is kept at full strength — MET.**
`snapshot()` (:252-268) is unchanged. The comparison (:337) and the three catalogue checks after it (:338-340: one more function, two more triggers, exactly two triggers call the function, both ordinary) are unchanged. The only new lines before 0127 is applied (:332-333) read the database and write nothing.

**2. After all later migrations, each pre-0127 row is found again by primary key and compared as database text — MET.**
- How it works: before 0127, `proofBefore` (:283-293) reads each table's primary-key columns from `pg_index`, in key order, and stores every row as two pieces of text made by PostgreSQL: the key (`row_to_json` over the key columns) and the content (`row_to_json` over all columns that existed then). After all migrations `proofDifferences` (:296-309) re-reads by the same names and reports each original row that is `missing` or `changed`. The assertion is that both lists are empty (:342). Nothing is parsed by the driver, so microseconds survive.
- Deleted row: reported `missing` (:304). Changed row: reported `changed` (:305). A row whose key value was altered reads as `missing`. A dropped original column is reported under types as `(gone)` (:300), which also fails.
- Duplicated row: cannot exist while the primary key stands, and I checked every one of the eight tables has one and no migration alters it: `(tenant_id,id)` on `recovery_case` (0018:8), `practice_feed_event` (0106:69), `practice_feed_command` (0106:43), `recovery_claim_revision` (0034:7), `recovery_case_event` (0034:12), `recovery_eligibility_v3_review` (0119:19), `recovery_claim_line` (0119:29); `(tenant_id,sequence)` on `audit_event` (0001:21). So yes, the identity really is the primary key for each. The test does not itself assert that a key was found (D3).
- Rows added later are ignored, as intended.

**3. Column names with full types snapshotted before 0127 and required after — MET.**
`proofColumns` (:279-282) reads name and `format_type(atttypid, atttypmod)` for every live column, in order. Every pre-0127 column must have the same type afterwards (:300). Later columns are not looked at.

**4. Controls — MET: they are real and cannot leak.**
- Real: each calls the same `proofDifferences` used by the proof itself, on the same connection that made the change, so it sees the change.
  - (a) :344-353, on both tables: a superuser UPDATE adds one microsecond to `created_at`, the update is checked to have hit at least one row, and the comparison must then report a row of that table, with no type difference.
  - (b) :355-359: retyping `recovery_claim_line.net_pence` to `numeric(20,0)` must give exactly no row difference and exactly one type difference.
  - (c) :361-371: a new nullable column (checked to be visible) and a new inserted row must each give no difference.
  - Guard, :333: every compared table must hold at least one pre-0127 row.
- Leak: each control runs inside `rolledBack` (:310-313), which always rolls back, even if an inner check throws. Table changes in PostgreSQL roll back with the transaction, and `SET LOCAL` ends with it. All of it happens in the throwaway upgrade database, which the test drops (:377-380); the main test database is never touched. A leak of control (a) would be caught anyway: the very next line (:372) re-checks the old chosen-time row to the microsecond.

**5. Does anything that used to fail for a real reason now pass? Is any assertion left that a later unrelated migration could fail? — MET, with one narrow later item.**
- Nothing real is lost. The only thing the after-all-migrations comparison no longer catches is a row ADDED by a later migration, which is the point of the round. A row added, changed or removed by 0127 itself is still caught by the complete snapshot at :337. Deleted and changed original rows are still caught. A retype is now caught, which it was not before.
- Left that a later migration could fail:
  - By this round's own design (item 3): a later migration that changes, deletes or retypes something that existed before 0127 in these eight tables. That includes a harmless widening such as `varchar(120)` to `varchar(200)`. This is "changing an existing thing", not "adding", so I read it as intended; see D2.
  - Not intended: control (b) runs its retype AFTER all later migrations. If a later migration adds a view, policy, generated column or trigger condition that uses `recovery_claim_line.net_pence`, PostgreSQL refuses the retype and the control throws, although nothing about 0127 is wrong. Nothing does today and none of the reserved 0123-0126 pieces is described as adding one, so I do not hold the piece for it; see D1.
  - Nothing else: no exact list, count, definition or whole-table comparison remains after later migrations.

**6. Records and budgets — MET.**
- The receipt's role/time table matches the test exactly: runtime, both tables, past and future (`[AC3]`, :148-153); owner and superuser, `recovery_case`, past only (`[AC4]`, :154-157); no owner or superuser insert on the feed table.
- `BUILD_PLAN.md:3365` now reads "no role other than the owner (or a superuser)"; the rest of the line is unchanged. It no longer claims more than the pin delivers.
- The hook has `120_000` (:48) and AC9 `60_000` (:381).
- Nothing else changed (see "What changed").

## BLOCKING findings

None.

## LATER findings from this round

- **D1. The retype control depends on later migrations leaving one column free to retype.** Test :355-359. A later view, policy, generated column or trigger condition over `recovery_claim_line.net_pence` would make it throw. Simple cure: run the control block (:343-371) before the `migrate()` pair at :341, on the 0127-alone state, where no later migration can interfere; the proof line at :342 stays where it is. Worth doing if this file is touched again for any reason.
- **D2. The type requirement also trips on a harmless later widening** of any pre-0127 column in the eight tables (several are `varchar(24/30/40/120/200)`). That is how the round was specified, and a retype deserves a look by whoever does it, but it is stricter than the standing rule's wording ("compare existing rows by named pre-existing columns"). The piece that first widens one of these columns will need an order that covers this test.
- **D3. The test trusts that a primary key was found.** If a table had none, every row would share one identity, only one row would be compared, and the row guard (:333) would still pass. All eight have one today (item 2). Two cheap assertions would close it: the key list is not empty, and the number of stored identities equals the table's row count.

Still open from the first pass, unchanged: L3 (two assertions that pin a weakness or an unrelated fact), L4 (no observed pre-pin run for the feed table; NULL, upsert and owner feed-insert probes; the receipt now says plainly what is untested), L5 (no append-only trigger on the feed table), L6 (the residual has no number), L7 (small record slips, including `MIGRATIONS.md:794` still saying NOT RUN and the contract citing `0000:24` for `0000:22`), L8 (neighbouring times the rule does not read).

## What I did not verify

- I ran nothing. Others' evidence for this round: `~/.local/share/full-steam/jg-runs/stored-times-1-mac-round1-own-run1.log` shows 27 of 27 with AC9 at 680 ms; `…-merged-run2.log` shows 63 passed; `…-lint-lanes.log` shows "Lane boundary passed" at `260b963` (the later commit changes only the receipt, which is inside the lane). The changed lines in the saved `…-round1-test-diff.txt` are identical to the committed diff and the saved "before" copy is identical to the file I reviewed at `0442abf`, which supports that the run used the committed content; the run itself (00:12) was a minute before the commit (00:13) and carries no hash.
- GitHub run 38183529869: not checked. CI must be green before merge.
- The eleven-file merged regression set was not re-run at this head (only three files were); the product code and migration are unchanged since the earlier run.
- PostgreSQL behaviour taken from knowledge: a retype is refused when a view, policy, generated column or trigger definition depends on the column; table changes roll back with their transaction.
- The other RED-lane check (Codex); I did not open its files.
