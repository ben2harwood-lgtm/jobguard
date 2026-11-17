VERDICT: PASS — bound to head 5a69467b7a82758cb29723cc10c0b5d90ea24f98
Reviewer: the same Claude Opus (claude-opus-5-5) that reviewed 8c74591; did not build or order this; edited nothing in the repository.
Lane: RED. Scope: fixes and regressions only, `git diff 8c74591 5a69467` (one commit, 9 files, 122 lines added, 8 changed). Head and PR head both confirmed as 5a69467; worktree clean.
Counts: BLOCKING 0, LATER 6 new (the 16 from ch-7-opus-8c74591.md still stand, except items 7 and 16, which this commit fixes).

## FIX 1 — the old v1 review can no longer be used on a duplicate-payment case: DONE
- Application: `eligibilityCommand` (packages/db/src/recovery-case-repository.ts) refuses `review` and `approve` for that category with the existing typed ELIGIBILITY_FIXTURE_MISMATCH (400). It sits after the replay check and the case lookup and before the stale check, the insert and the audit, so nothing is written. For every other category the condition is false and the code path is unchanged.
- Database: a NEW function `app.refuse_v1_eligibility_for_duplicate_payment()` and a NEW trigger on `recovery_eligibility_revision` (0119:163-172). No merged routine is replaced: 0119 contains no `CREATE OR REPLACE`, and neither name exists on main. No column, policy or grant on the v1 table changes. Owner set, execute revoked from runtime.
- Is the trigger tight? It refuses only when the row's own case (same tenant, job and case id) is of the new type. Other categories return the row untouched. The type cannot exist before 0119, so no upgrade or backfill row can be hit. It fires on insert only, so existing rows are untouched. The only role with insert on that table is the runtime role, which can read cases.
- Screen: only the v1 "Why this may qualify" section is hidden for that category; the v3 section stays.
- Effect on money: the merged landing routine needs a v1 approval id to post a fee (0097:61), so with no v1 approval possible there is no fee route for the new category.
- Tests: database (application refuses review and approve; raw runtime insert refused for "reviewed" and "approved" with the trigger's message; zero v1 rows and zero audit rows; a withheld-payment v1 review still saves), browser (no v1 controls; 400 with the typed code; nothing saved), API mapping. The DW4 upgrade test is unchanged.

## FIX 2 — "settled before the case was opened" decided once, in the database: DONE
- The source query now returns `e.state='settled' AND e.created_at <= the case's created_at` (repository:40-41). Direction and the equal-instant case match 0119's own guard (0119:102, also `<=`): a movement settled at exactly the opening instant counts as "before", Q is 0 — the side that never creates a fee.
- No JavaScript date comparison remains: both `created_at: Date` fields are gone and `before` is the SQL result only.
- Tests: settlement 800 microseconds before opening in the same millisecond gives F20, 0p, "Paid before you opened this case"; 800 microseconds after gives F18 at 262,000p (this second test fails on the old code).

## FIX 3 — the guard needs all ten result keys with the right types: DONE
- 0119:114-119 adds a presence check for all ten keys and a type check for each; `reason` may be text or an explicit JSON null; a missing key is refused.
- Still accepts every legitimate result. I checked the built core's output (core is unchanged in this commit) for F15, F17 settled and pending, F18 settled and pending, F19, F20, F21 and F22: ten keys, no extras, right types, and an explicit null reason for F17 settled and F21. CI's 23 of 23 on the CH-7 database file confirms it against a real database.
- Refuses a missing key: tests for an F17 and an F21 result without `reason` (these committed before the fix) and for lines without `reason`.

## Not fixed, by design — do I agree?
- Sol 5 (the browser test opens the job by its address after visiting Jobs): agree it is the existing merged pattern, not a CH-7 gap. Main's Jobs home lists only jobs with no practice-session owner (packages/db/src/demo-runtime.ts:37), a merged test says so by name (workspace-read.integration.test.ts:50), and merged M4-2-S.spec.ts:6 navigates the same way. LATER, founder decision.
- Sol 4 (evidence packs for the new category): agree LATER. It is a missing feature for the new category (pack building is refused with a typed "source not found"), not a regression.

## Also confirmed
No expected money figure, reason, outcome or timeout changed: no line was removed from any test file, core is untouched, and the migration's figures are unchanged. No held part built (the only matches for held words are unchanged existing copy on rewritten long lines). All 9 files are on CH-7's own lane line; the lane file is not touched. No merged leaf's test was edited.

## BLOCKING
None.

## LATER (new)
1. No test for the exact same instant; by reading, both places use `<=`.
2. In the "after opening" test the last F20 refusal comes from the one-example-per-case lock, not from timing.
3. The missing-key tests only assert "rejects", not the code, and have no passing twin through the same raw route.
4. The application refuses v1 `review` and `approve` but not `supersede` for the category; unreachable without an earlier v1 row, and the trigger refuses any v1 insert.
5. The commit subject says "prove Jobs navigation", which was not done; the body and receipt say so correctly.
6. docs/contracts/recovery-eligibility-v3.md does not mention the new trigger on the v1 table (MIGRATIONS.md does).
Still open from the first verdict, untouched here: F18's £120 interest has no matching payment in the practice feed, and a supplier refund that arrived before the case was opened still counts (both for the coordinator before any fee reads these figures).

## Evidence for this exact head
- Executed by me: nothing on this Mac after the restart (as instructed); before it, one read-only probe of the already-built core for the result shapes. No database or browser suite run by me.
- GitHub run 38158275171, attempt 1, head sha 5a69467b7a82758cb29723cc10c0b5d90ea24f98: SUCCESS. Typecheck, lint (lane boundary passed for "ch-7"), `pnpm test`, build and the browser step all passed. By name in the log: core recovery-eligibility-v3.test.ts 22 tests; API recovery-eligibility-v3.application.test.ts 15; database recovery-eligibility-v3.integration.test.ts 23, tenancy 9, demo-bootstrap 4, and the neighbouring recovery, practice-feed and UIWIRE-12 database files all passed. Browser step: "Running 318 tests", "318 passed", no failed, flaky or retried test and no dropped connection. The browser log prints totals, not test names, so CH-7's browser tests are not visible by name; 318 is the 316 of the earlier run plus the new CH-7 test in two screen sizes.
- The helper's Mac runs in the receipt's "Round 1" section are the builder's record, not my observation.

TL;DR — The three ordered fixes are done properly and nothing else moved: the new case type can no longer go through the old approval route (so no fee can be posted for it), timing is decided in one place, and a malformed saved result is refused. GitHub's checks are green on this exact head. Nothing blocks merge from my side; the two money questions from the first verdict are still worth a knowing yes before any fee ever reads these figures.
