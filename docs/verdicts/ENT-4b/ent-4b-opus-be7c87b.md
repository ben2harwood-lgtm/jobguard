VERDICT: REPAIR — bound to head be7c87b11ce54aaf55334d49179e1f317c4372de

Reviewer: fresh Claude Opus (Opus 5.5); did not build or order this piece; edited nothing. Head confirmed equal to PR #134's head; base origin/main bbca5ca.
Lane: RED

## Short version
The piece itself is well built and its own 38 database tests pass in GitHub CI. But CI is RED on this head: adding columns to three existing tables breaks two already-merged upgrade suites, and one of those failures is a real fault, not a fussy test. The new `pricing_basis` column on `app.variation_revision` changes the fingerprint of every existing small-builder evidence pack. Two blockers need an integrator ruling because the order itself asked for those columns.

## (1) Does it meet the order?
Done-when lines (all passed in CI on this head; O = extra-origin 22 tests, L = extra-links 15, U = upgrade 1, P = core 3):
- DW1 runtime cannot update, delete or truncate: MET. O[DW1], L[DW1]; grants are SELECT+INSERT only (0122:217-218), owner refused 55000.
- DW2 the four refusals: MET. O[DW2a] mismatched command/kind, [DW2b] wrong actor / not processing / wrong key, [DW2c] second origin and reused capture id (23505), [DW2d] other track's kinds. Mostly SH-1's merged routine, untouched.
- DW3 missing origin fails at commit: MET. O[DW3]; still SH-1's one deferred key, no second constraint added.
- DW4 links: MET. L[DW4a] cross-tenant and cross-job links, order lines, both evidence columns and visits refused (23503); L[DW4b] self, A→B→C, A→B→A, second active link, two connections at once; L[DW4c] origin row and hash identical before/after, recomputed hash equals stored.
- DW5 failure and replay: MET. O[DW5a] and L[DW5a] inject a failure at each step and count zero rows; O[DW5b] one capture id gives one extra, different payload or type is COMMAND_CONFLICT.
- DW6 audit holds ids and hashes only: MET. O[DW6], L[DW6]; errors carry a closed code only (extra-persistence.ts:22-24).
Build lines: B1 built (its columns trip blocker 2). B2 and B3 already merged in 0053; one new guard added after it by name (0122:90). B4 built. B5 built, but `pricing_basis` is blocker 1. B6 built.

Held parts, all correctly NOT built and recorded as held (receipt lines 173-177, contract doc line 76):
- Q3 no role-per-command rule in the SQL or the repository. Q9 no unlink function and no `UnlinkDuplicate` anywhere; only the row kind and its guards. Q6 no prompt column; `jobguard_surfaced_confirmed` refused on work-order jobs (0122:47, tested). Q1 nothing under apps/**.

Migration promises, one by one:
- Adds three tables with tenant-qualified composite keys, FORCE row-level security, minimal grants, append-only guards: HOLDS (0122:92-128, 211-222).
- Alters the three existing tables by addition only: HOLDS literally. The whole diff is 1289 added lines, 0 deleted.
- Changes no existing row: values HOLD (U proves old columns identical, new ones NULL, seeded with real pre-SH-1, legacy, fixture-contractor and imported rows). But merged code and a merged test read whole rows, so the new columns still change behaviour: blockers 1 and 2.
- No existing constraint, policy, grant, role, column type or default changed: HOLDS.
- Merged routines byte-identical, no `CREATE OR REPLACE`, no `DROP`: HOLDS (grep clean; U compares every app function's definition before and after).
- No routine callable by runtime or PUBLIC, none SECURITY DEFINER, optional helper not used: HOLDS (0122:223-227, O[S3]).
- Could a new CHECK, key or trigger refuse a merged write? NO. Small-builder variations, SH-1's fixture, ENT-2 import and SV-style origins all leave the new columns NULL and exit the new trigger at 0122:40-46. CI agrees: shared-money-origin 12, work-order-import 49, variation 2.

Merged tests: `shared-money-origin` and `work-order-import` diffs are empty. `tenancy.integration.test.ts` gains 6 rows only (3 per list) for the three new tables, in name order. The moved rows are this leaf's own `extra_order_line_link` rows, now placed above the existing `extra_origin` row. That existing row is byte-identical and no existing expectation changed.
Forbidden files: none touched (context-boundary test and its seven pinned files, variation-repository, tenant-context, commands, audit, core extra-origin, enterprise-domain, every merged migration, apps/**). Lane registry: own line only. No dependency or lockfile change.
Money: no pence figure stored or derived; no fee asserted.
SV-2 (#119): ENT-4b never restates `validate_extra_origin`. The two migrations apply in either order without undoing each other (SV-2 replaces only SH-1's function; ENT-4b's trigger is separate and still fires after it). SV-2 will meet blocker 2 as well, because it also adds a column to `extra_origin`.

## (2) Could it cause harm? Cases reasoned through the SQL
- Grant from another tenant on a work-order job: refused; lookup is tenant-qualified (0122:55-66), plus the key at 0122:16.
- A→B then B→A, A→B→C, C→A: refused (0122:157-161); serialised per job by a lock.
- Origin inserted before its variation: refused at once by SH-1's immediate key, not left to commit.
- Capture id reused with a different payload: COMMAND_CONFLICT, nothing written (extra-repository.ts:70-76; index at 0122:22).
- Small-builder variation written exactly as today: accepted. But after the upgrade its revision rows read differently to merged code: blocker 1.
No tenant or access hole found. No wrong money.

## BLOCKING
1. Existing evidence packs change fingerprint after this migration (broken existing small-builder journey; red merged test). 0122:33 adds `pricing_basis` to `app.variation_revision`. Merged code builds each pack record from the whole row: `packages/db/src/evidence-pack-sources.ts:69-70`, and the freshness check `app.recovery_message_sources_current` at `0107_recovery_messages.sql:278`. Every approved variation revision now carries an extra `"pricing_basis": null`, so an unchanged case hashes differently. Failing case: `recovery-message-upgrade.integration.test.ts:91` (expected manifest caef7d67…, got 85a8746d…) and `:103` (`EVIDENCE_PACK_STALE_APPROVAL`). Required fix: remove the `pricing_basis` column and its CHECK from `app.variation_revision` in 0122, with its lines in the upgrade test, contract and MIGRATIONS.md. Record pricing basis as HELD, or carry it in a new ENT-4b-owned table, on the integrator's ruling (this changes order step 6 / B5). Do NOT restate the 0107 routine or edit evidence-pack-sources.ts.
2. Merged upgrade proof is red. `recovery-follow-up-upgrade.integration.test.ts:207-209` snapshots every row as JSON before `migrate()` and requires the same after. Rows in `app.extra_origin` (10 new keys), `app.variation` (4) and `app.variation_revision` (1) now differ. I checked the log: once the 15 new empty keys are dropped the rows are identical, so no value changed. Any added column on a populated table trips this assertion, so the order (B1, B5) conflicts with a test merged after the order was drafted. Required fix, integrator to choose: (a) move the new columns off the three existing tables into ENT-4b-owned tables (for example a one-to-one provenance table keyed by tenant and variation) with the same keys and guards; or (b) a separate, explicit decision by that test's owner to compare only pre-existing columns. Neither this builder nor a reviewer may edit that merged assertion.
3. Required evidence missing for this head. CI stopped at the red test step, so `pnpm build` and the browser suite never ran: no browser totals. Required: one full green CI run on the repaired head.

## LATER (one line each)
- The origin audit check fails open if the tenant setting is cleared before COMMIT (0122:185-187 returns when the row is not visible); make it fail closed like 0110:220-240.
- The deferred checks compare `xmin` (0122:188-191, 205); after a logical dump-and-restore every later event on an existing extra would be refused. Keep xmin in tests only, before real data.
- O[S9] pins SHA-256 of seven merged test files (extra-origin.integration.test.ts:194-213); SV-2 edits two of them, so whichever merges second goes red. The order asked for hashes in the receipt.
- Unlink rows accept any processing receipt (0122:162-166 has no command-type gate); ENT-5 must add it with its command.
- Any processing receipt can write any later event kind, including `exported` (0122:140-149); ENT-5 and ENT-6 must gate.
- Chain and sequence guards assume the default isolation level; under REPEATABLE READ by direct SQL two connections could both pass.
- `readExtra` returns INVALID_ORIGIN for legacy and backfilled small-builder origins (receipt line 178); needs a schema ruling before any screen reads them.
- The database records `raiser_assigned` but does not enforce the merged operative rule; fine under Q3, ENT-3 must enforce it.
- An order-line link is unique per (revision, line), so a line carried into a later revision could be linked to a second extra; ENT-6's billed-once proof should cover it.
- The SoR item is not checked against the job's own schedule; the excess revision can trail the origin's revision under a concurrent import.
- BUILD_PLAN.md ledger paragraph and the widened lane line were added by the helper, not the integrator; matches ENT-2 and ENT-10a precedent, integrator to confirm.
- The receipt's acceptance map still says NOT RUN and does not mention the two red merged suites.

## Executed vs inspected vs not verified
- Executed by me: git and gh read commands only (head, diff, numstat, CI status, CI log). No test suite run on the Mac.
- Inspected in full: migration 0122, extra-repository.ts, extra-persistence.ts, the three new test files, extra-fixtures.ts, the tenancy diff, the repair commit; the relevant parts of 0053, 0054, 0110, 0107, commands.ts and SV-2's 0118.
- Not verified: anything in a browser; main's own run on bbca5ca (still in progress at 19:20 UTC). Attribution rests on the failing diff naming exactly this leaf's 15 columns, and on main 4a70824 and the ENT-10b branch finishing green at 18:48 and 19:01.

## Test evidence seen (GitHub CI run 38166671162 on be7c87b)
- typecheck PASS, lint PASS, secrets PASS, dependency-review PASS.
- `pnpm test` FAIL. Database package: 74 files, 976 tests, 973 passed, 3 failed, all in the two merged suites named above.
- Passed in the same run: extra-origin 22, extra-links 15, extra-origin-upgrade 1, core extra-persistence 3, shared-money-origin 12, work-order-import 49, tenancy 9, demo-bootstrap 4, variation 2, context-boundary 145.
- build and browser: SKIPPED.
- The helper's Mac runs in the receipt (9, 38, 61, 13, 145) match CI for those files. The helper did not run the two suites that fail.
