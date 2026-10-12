VERDICT: PASS
77634e62900b46076220304a2bb9af13fe6a6421

# MIG-ORDER-3 (PR #141) — independent Opus review, RED lane

Reviewer: Claude Opus 5.5, fresh session, read and `git` only. Nothing was run by me (no tests, builds, databases).
Candidate: worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/mig-order-3`, branch `codex/sandbox/mig-order-3`, head `77634e62900b46076220304a2bb9af13fe6a6421` (confirmed), clean working tree, contains main `8e91b2d2e28564b8a19aa5293041bfae1e551485` (which is also `origin/main` in that worktree).
Piece = `git diff 8e91b2d HEAD`: three paths only. Line numbers below are the head file `packages/db/test/extra-origin-upgrade.integration.test.ts` unless marked "merged".

## First question: is anything that used to fail for a real reason now passing?

**No.** The only two things that stop failing are the two the ruling removes on purpose: a LATER migration that only adds a column to one of the three tables, and a LATER migration that only replaces or drops a function that existed before 0122. Every other fault the merged S8 caught is still caught, at the same or greater strictness.

**How values are compared, before and now (the precision question).** Unchanged. Merged: `before` = `SELECT *` rows as the driver returns them (merged :28), `after` = `SELECT *` rows (merged :33), compared with `toEqual` (merged :34). Now: `before` is the same line, byte-identical (:76); `after` is the same line, byte-identical (:102); the left side is `namedColumnRows(c.admin, table, after)` (:103), which only picks `row[name]` for each name in the written list (:41) and applies no conversion; same `toEqual(before[table])`. So it was driver-parsed values before and is driver-parsed values now: this file never compared database text, and nothing was lost HERE. The Mac red-control log shows `"created_at": 2026-10-11T22:50:16.967Z`, a JavaScript date, confirming it. The sub-millisecond blind spot on the three timestamp columns therefore exists exactly as it does on main (LATER 3), neither better nor worse.
Rows: same full-table selects, same `ORDER BY`, no narrowing. Columns: the projection list is the full pre-0122 list, and :78 requires the live catalogue to equal that list exactly (names and types) at the moment of the snapshot, so `before` has exactly those keys and none is left out. No weakening.

Fault by fault:

- **(a) 0122 changes an existing function — still fails.** :84 `expect(await changedFunctions(c.admin, existingFunctions)).toEqual([])`, run after 0122 alone (:81-82) and before step 2 (:97). Helper :43-50 compares the recorded `pg_get_functiondef` text of every recorded oid (snapshot :77 unchanged); a function that is gone counts as changed (:47, `current?.definition` undefined). Same strictness as merged :41, and stricter in one way: a change by 0122 that a later migration undid would have passed on main and fails now.
- **(b) 0122 adds an undeclared column to one of the three tables — still fails.** :85 requires each table's live ordered list to equal the pre-0122 list followed by exactly 0122's declared additions (`columnsAddedBy0122`, :14-18), names and types. Merged caught it only through the extra key at merged :34. Stricter (order and types of the additions are now pinned too). The declared lists match migration 0122 (`packages/db/migrations/0122_extra_origin_persistence.sql:3-13, :23-27`; nothing on `variation_revision`) and `newOriginColumns` (`extra-fixtures.ts:11`); :101 ties the merged `added` expression (:100, unchanged) to the same list.
- **(c) 0122 or a later migration changes a value in a pre-existing column of a pre-existing row — still fails.** :103, after ALL migrations. Same strictness (see comparison paragraph above).
- **(d) a pre-existing row deleted, duplicated or reordered — still fails.** :103: `toEqual` on arrays in the same `ORDER BY` checks count and order. Same strictness.
- **(e) a pre-existing column's type changed — still fails, and more often.** After 0122 alone: :85. After all migrations: :106 `changedColumnTypes(columnsBefore0122, await liveColumns(c.admin))` must be empty (helper :28-35; also reports a dropped or renamed column). Merged caught a retype only when it altered a parsed value; a retype that kept every value passed on main and fails now. Stricter.
- **(f) 0122's new columns not NULL on old rows — still fails.** :104, byte-identical to merged :35, still after all migrations. Same strictness; :101 additionally stops the column list drifting.
- **(g) `migrate()` not idempotent — still fails.** :97, text byte-identical to merged :30; a throw from either call fails the test. :98 adds that the registry is exactly `names` afterwards. See LATER 2 for what the two calls actually do at this head.
- **(h) 0122 not recorded as applied — still fails.** :159 byte-identical to merged :42; plus :83 (registry is exactly `names.slice(0, own + 1)` after step 1) and :98. See LATER 2.
- **(i) everything else the merged test asserted — unchanged, byte-identical.** Names sorted and unique (:62); 0122 after 0053 and 0110 (:63); both legacy provenances present (:74); `readExtra` of the backfilled origins (:155-158); each new origin column rejected with `23514` (:160); fresh-cluster catalogue of the new tables equals the upgraded one (:161-164); closing line `}, 120_000);` (:165).
- **New, not in merged:** the three tables are proved non-empty (control (iv) needs row 0 and `rowCount` 1, :132-135), so the row comparison cannot pass vacuously.

## The two things that must NOW pass

- **A later statement that only adds a nullable column to `app.extra_origin` — passes.** :85 runs before step 2 so later columns cannot touch it; :103 projects onto the old names so the new key never appears; :104 looks only at 0122's columns; :106 ignores extra columns; :153 compares against a snapshot taken after step 2 (:107), not against the pre-0122 list. No other line in S8 looks at the column list.
- **A later `CREATE OR REPLACE` of an existing `app` function after step 1 — passes.** `changedFunctions` is called at :84, :93, :95 only, all before :97; `pg_get_functiondef` appears nowhere after :77 except inside that helper. There is no function comparison after step 2.

## Evidence, both ways

**Builder's in-test controls (:86-154).** Real. Each runs as one transaction on one client taken from `c.admin` (`scratchStatement`, :51-55), `ROLLBACK` in `finally`, `release` in a nested `finally`; every read inside a control goes through that same client, so there is no self-blocking. `SET LOCAL session_replication_role=replica` (:131) dies with the rollback.
- (iii) own-step function change: same helper as the proof (:93 vs :84), must report exactly the one oid; :95 proves it was rolled back before step 2.
- (iv) one changed value in each table (:129-141): same helper and same `before[table]` as the proof, `not.toEqual(before)` plus `toEqual(expected)` (only the intended value differs), `rowCount` 1. Real retype (:143-147) and list-form retype (:149-152) both must report exactly `extra_origin.device_id` through the same `changedColumnTypes`/`liveColumns` as :106.
- (i) later column and (ii) later function (:119-127): `assertHeadComparisons` (:110-117) re-states the head checks using the same helpers. One fidelity gap, LATER 1.
- Left behind: :153-154 re-read columns and rows through `c.admin` and require the pre-control snapshots. Leak into other tests: none possible; the cluster is private to this file (own temp directory and port, `extra-fixtures.ts:15-20`; closed in `afterAll`, :58) and the file has one test.

**Mac helper's hand-made red control (receipt "Mac verification", item 1).** I read the log `/Users/benharwood/.local/share/full-steam/jg-runs/mig-order-3-mac-control-red.log`: `SCRATCH_UPDATE_ROWS 1`; 1 failed; `AssertionError` at `extra-origin-upgrade.integration.test.ts:104:57` on `expect(await namedColumnRows(c.admin, table, after)).toEqual(before…`; the single differing value is `description` "Fictional pre-SH-1 extra" against "scratch changed value". Line 104 is head line 103 shifted by the one inserted scratch line (the log shows `const after` at 103). This is the important one: it is the REAL assertion on the REAL `SELECT *` path going red, committed (not rolled back) on a throwaway cluster. The file was restored; the worktree is clean and the test file at the Mac-run commit `e1ced8c` is identical to head (`git diff e1ced8c 77634e6` touches the receipt only). Passing run log `mig-order-3-mac-s8-merged.log`: 1 file, 1 test passed, 7.01 s.

## Criteria

- **MO3-1 MET.** (a)–(f) enforced as listed above; controls (i) :119-122, (ii) :124-127, (iii) :86-95, (iv) :129-152; nothing left behind :153-154; receipt table at `docs/verdicts/MIG-ORDER-3/BUILDER_RECEIPT.md:59-66`.
- **MO3-2 MET.** :81-82 then :83 `toEqual(names.slice(0, own + 1))`; comment :79-80. (Registry order vs JavaScript sort is safe under any collation: all 62 names have unique four-digit prefixes and plain characters.)
- **MO3-3 MET.** :84; helper :43-50; gone counts as changed :47; no function comparison after :97.
- **MO3-4 MET.** :97 text unchanged; :98 `toEqual(names)`.
- **MO3-5 MET.** :103 (rows, order, count, values as before), :106 (every listed column still exists with listed type), :104 unchanged, :101 ties `added` to the declared list. Constant :9-13 is written out, and I confirmed text-for-text that :10, :11, :12 equal `packages/db/test/recovery-follow-up-upgrade.integration.test.ts:304, :423, :427` (15, 18, 19 entries). 0119–0121 name none of the three tables. Comment about the fingerprinted-table guard :36-37.
- **MO3-6 MET.** Diff vs `8e91b2d`: exactly 2 lines removed (merged :34, merged :41), 119 added, no other existing line altered; closing line as found on main.
- **MO3-7 MET on others' evidence** (not run by me): Mac run exit 0, 1 of 1 passed, log read. Invocation differed slightly from the order (LATER 5).
- **MO3-8 MET.** Rule word for word (receipt :7, identical to the order); fault with quoted lines (:11); before/after of 30, 34, 41 (:19-53); (a)–(f) table (:59-66); strength argument (:68); controls (:70-86); commands with exits and counts (:92-102); NOT RUN list (:110-117); Self-review (:121-127); closing sentence (:129).

Other points asked:

- **"Apply 0122 alone" is done the way the runner applies one file — MET.** :81 runs the file's text unmodified (the runner's only special case is 0095, `packages/db/src/migrate.ts:82`); :82 is the runner's own insert, including `ON CONFLICT DO NOTHING` (`migrate.ts:83`). The later `migrate()` skips it because the name is recorded (`migrate.ts:77-78`); had it not, the second `ADD COLUMN` would have thrown and the Mac run could not have passed.
- **`migrate.ts`, `extra-fixtures.ts`, every migration, every other test unchanged — MET.** `git diff --name-status 8e91b2d HEAD` lists only `config/agent-lane-assignments.json` (M), `docs/verdicts/MIG-ORDER-3/BUILDER_RECEIPT.md` (A), `packages/db/test/extra-origin-upgrade.integration.test.ts` (M).
- **Every merged assertion still exists — MET.** Only two merged lines were removed or changed:
  - merged :34 (whole-row equality minus 0122's columns) → its value/row assertion lives at :103; its "0122 added no undeclared column" assertion lives at :85; its "no later migration adds a column" assertion is deliberately dropped (ruling).
  - merged :41 (every pre-existing function text identical at head) → lives at :84 after 0122 alone; "at head" is deliberately dropped (ruling).
  - merged :30 is byte-identical but moved after step 1 (now :97).
- **S8 closing line keeps main's `120_000` — MET** (:165).
- **Lane registry: exactly one new line, no existing line changed — MET** (`git diff --numstat`: 1 added, 0 removed; `"mig-order-3"` between `"mig-order-2"` and `"mon-7a"`; note text and three allowed paths as ordered).

## BLOCKING findings

None.

## LATER findings

1. **Green control (i) does not feed an extra key through the real projection path.** The proof passes `SELECT *` rows into `namedColumnRows` (:102-103); `assertHeadComparisons` lets the helper select the named columns itself (:112, branch at :40), so the scratch column never reaches the projection. That the real path stays green is certain from :41 by reading, but it is not shown by any run (the Mac helper did not repeat the green cases by hand). Cheap fix when next touched: pass `SELECT * ... ORDER BY` rows into the helper inside `assertHeadComparisons`, as the proof does.
2. **Line 159 no longer says anything about the runner, and at this head the two `migrate()` calls apply nothing in the populated database.** The test writes 0122's registry row itself (:82), and 0122 is currently the newest migration, so :97 is two "nothing to do" runs until a later migration exists. This follows from the ruled shape and is not a weakening of anything 0122-specific (same two statements as the runner; the runner still installs 0122 on the fresh cluster at :161). Worth knowing so nobody reads :159 as runner evidence, and so the "byte for byte" comment (:79) is revisited if the runner ever gains a special case for 0122.
3. **Sub-millisecond timestamp changes are still invisible**, exactly as on main (driver dates). The order's Q4(C) (compare the named columns as database text) remains a possible later strengthening; it would be new strictness, not a repair.
4. **No check that the function text is back after control (ii).** Safe in practice (transactional rollback), but only columns and rows are re-checked at :153-154. A comparison against a function snapshot taken AFTER step 2 would close it without recreating the fault.
5. **Records.** The Mac helper ran `pnpm exec vitest run … --maxWorkers=2` from the package folder, not the order's `--filter @jobguard/db … --maxWorkers=1` form (one file, so immaterial). A few receipt line ranges are one short (43–49, 129–140). The builder's receipt also records an unprescribed `openapi` check reporting `openapi.json is stale` at its old base (receipt :98-99, :106); that is outside this lane and unverified by me, but someone should own it if it is real.
6. **Control (ii) replays the pre-0122 text of `app.half_even_ratio`.** If a later migration ever changes that function's return type or removes it, the control itself would error for an artificial reason. Remote; note for whoever writes such a migration.

## What I did not verify

- I ran nothing. Every "passes" above rests on reading the code plus the Mac helper's logs (S8 1/1 passed; red control failed at the named-column comparison; 48 and 15 passed in the neighbouring files as recorded in the receipt; I read the S8, red-control and 3-file logs, not the others).
- GitHub run 38182075499 on this head was still in progress when I last looked (`secrets` and `dependency-review` passed; `checks` running). A green result on Linux is not yet evidence; merging should wait for it as usual.
- Whether the four filtered words are absent (I do not know which words they are).
- The whole-repository lint and typecheck on the Mac were not run (receipt :151); the lane lint and the db typecheck were.
- I did not read the separate Codex check or its log.
- This verdict is bound to `77634e62900b46076220304a2bb9af13fe6a6421` only. No Command Center heartbeat was sent from this read-only review; the dispatching session reports.
