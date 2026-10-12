VERDICT: REPAIR — bound to head aa3541f69a0e607ffaa0425d66e1d51531a552a9
Reviewer: Claude Opus 5.5, fresh independent check of MIG-ORDER-2 (PR #137, base bbca5ca); did not build it or write the order. Inspection + CI log only.
Lane: RED

IMPORTANT — THE HEAD MOVED WHILE I WAS REVIEWING. HEAD and the PR head were both aa3541f at the start. At 19:54 UTC two more commits were pushed
(3d5b8bf "round 1 — compare column types; guard the discrepancy receipt table", cbd8d57 receipt); the PR head is now cbd8d57. This verdict covers
aa3541f ONLY; 3d5b8bf/cbd8d57 are NOT reviewed or approved here. I found both blockers below myself from aa3541f and origin/main; the round-1
commit title says the builder has since addressed the same two points, which needs its own re-check.

THE DECIDING QUESTION — is anything that used to fail for a real reason now passing?  YES, one thing (B1). Plus one hole in the new guard (B2).

Part 1 (upgrade test), item by item, at aa3541f
(a) Lists explicit and complete? Yes. 186 tables / 1904 columns are written out in the file (I counted; no duplicate tables or columns). Before the
    head step the test asserts the live catalogue equals that list exactly, so a missing or extra table or column fails in CI. Same table scope as
    the old test (ordinary tables in the same five schemas).
(b) Row identity, count, nothing missing? Yes. Per table it compares the full sorted set of rows, each row being all its 0115 columns (keys included).
    A row added, removed or altered in any pre-existing table still fails.
(c) Value change in a listed column? Still fails. Each column is printed exactly as before (same row_to_json text), so NULLs, text-vs-number,
    timestamps, json, bytea and padding behave as in the old test. A dropped column cannot become "absent": the query errors.
(d) Drop or rename: fails (SQL error — clear enough, not pretty). TYPE CHANGE: fails only when the printed JSON changes (number→text,
    timestamp kinds). A type change that prints the same (integer↔bigint, a shorter varchar, char→text on full-length values) PASSES. -> B1.
(e) Losing the row-version (xmin/ctid) check for later migrations. Mostly acceptable, with one real loss. Acceptable part: a same-value rewrite or
    backfill changes nothing the product stores, hashes or shows; no product code reads xmin/ctid (only an explicit claimed_xact column, which is
    value-compared); trigger side effects on existing tables show up as changed values or extra rows; a failing deferred check aborts the
    migration; and 0112/0115 still get the full row-version check. Real loss: the row-version check was the ONLY thing catching a type change that
    rewrites the table without changing printed values (B1). Note: the relaxation was not needed for ENT-4b — 0122 only adds nullable columns,
    which does not touch xmin/ctid — so either keeping xmin/ctid in the head step or comparing types would close it.
(f) Everything else byte-identical? Yes. 219 lines added, 3 removed; the 3 are the old comment and the two old head-step lines. Privileges, audit
    chains, message workflow checks and the 0112/0115 step are untouched.

Part 2 (new guard), at aa3541f
- The 11 pack/message tables: complete and correct. I re-derived them from origin/main: 11 whole-row to_jsonb reads in
  packages/db/src/evidence-pack-sources.ts (lines 39–108) and the same 11 in app.recovery_message_sources_current (0107 lines 267–297); the routine
  is not redefined by a later migration. Every SQL hash in the migrations is over named fields. Audit hash = fixed fields. Practice-feed events are
  mapped to named fields. supplier-match hash(proposal) is over a computed object, not the row. readiness maps named fields.
- Pinned lists match the merged schema (CI compares them to the live catalogue; I hand-checked two against CREATE TABLE; all 11 equal the 0115 lists).
- Failure message says why and names both code places. Drop, rename, reorder or a dropped table also fails (exact ordered list).
- MISSING: app.discrepancy_review_outcome. -> B2.

BLOCKING (2)
B1. A later migration that changes the TYPE of an existing column without changing how its values print now passes the head step; before, the
    table rewrite changed xmin/ctid and the test failed. I found no other test that pins column types across these tables. This matters for
    narrowing changes (bigint→integer, shorter varchar) that small fixture values survive but real data may not. Repair: compare each listed
    column's type as well as its name (or keep xmin/ctid in the head comparison).
B2. The guard omits app.discrepancy_review_outcome. Its WHOLE row (row_to_json(o), discrepancy-repository.ts:23) is passed unchanged into the
    discrepancy view (finding.outcome), and finish() (:16) stores that view as the command's replayable result (storeCommandResult, watchdog.ts,
    app.watchdog_command_result) under a "replay is byte-identical" promise. The receipt calls this site "view output" and misses that it is kept.
    Milder than packs — nothing stored is re-hashed against live rows — but an added column would make fresh reads and history-derived replays
    differ from stored results. The order says every whole-row site, receipts included: pin it, or record a reasoned exclusion.

LATER (one line each)
- The guard pins column names and order, not types, for the fingerprinted tables.
- The guard's 12th test only counts to_jsonb(/row_to_json( in two known places; a whole-row site elsewhere, or written as SELECT *, would not trip it.
- A dropped/renamed column in Part 1 fails as a raw SQL error; "columnsAt0115" really means "after 0111 + 0112 + 0115 applied by hand" (fine today).
- For the coordinator: ENT-4b's 0122 adds pricing_basis to app.variation_revision, which IS fingerprinted, so the guard will go red on ENT-4b.
  That is the guard working; it needs a deliberate decision there.

Wrong money, access hole, lost/corrupted data, broken main journey? No — tests only; the only risk is a weaker net. Scope at aa3541f: only the two
test files, the one new lane line (allow-list matches the order) and the receipt.

Inspected: full Part 1 diff and file; guard file; order; receipt; evidence-pack-sources.ts; 0107 routine; migrate.ts and registry; 0122 in the ent-4b
worktree (read only); every to_jsonb/row_to_json/SELECT * site in packages/db/src, migrations, core, apps/api; the files that store command results.
Counts and both gaps re-confirmed against the aa3541f blobs after the head moved.
Not verified: I ran nothing; the builder's scratch proofs are taken from the receipt; the other reviewer's verdict unread; later commits unreviewed here.

CI evidence seen (run 38168594660, head aa3541f): typecheck, lint, lane boundary and `pnpm test` succeeded; log shows "✓ test/fingerprinted-row-
shape.integration.test.ts (12 tests)" and "✓ test/recovery-follow-up-upgrade.integration.test.ts (3 tests)", db package 72 files / 950 tests passed.
The run was then CANCELLED in the web end-to-end step by the new push, so aa3541f has no completed green check. Run 38169981466 (cbd8d57) was
still running when I finished.
