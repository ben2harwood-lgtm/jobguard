VERDICT: PASS — bound to head 16480356af089a1d5ec645fb79b52ccb40215a00

Reviewer: the same Claude Opus (Opus 5.5) as rounds 0 and 1; did not build or order this; edited nothing. Lane: RED. Scope: `git diff 75f079f HEAD` only (4 files, +85 −8). Head equals PR #134's head. This PASS covers the one round 2 fix. The branch is still not mergeable today: the one expected test is red, so build and browser were skipped again.

## The fix: compare the tenant setting by value
- Migration (0122:183-191): the setting is cast to uuid and compared with the row's tenant as uuid. Absent or empty becomes NULL and is refused. A different tenant is refused. A non-uuid value fails the cast, is caught, and is refused with the same `INVALID_ORIGIN` (23514). The same tenant in any letter case is accepted. Nothing but a refusal can come out of a bad value.
- Every use of the setting in 0122 is now by value: line 185 (this guard) and line 223 (the standard row policy, already a uuid compare). No text comparison remains.
- Repository (extra-repository.ts): the tenant is lower-cased once per call and used for every query and for the derived extra id; the job lock key is built from the uuid values (line 41), so it now matches the key the database guard takes. All SQL compares the tenant against uuid columns.
- Tests, all added, no existing assertion touched: upper-case context commits one extra and reads the same under both spellings; both spellings give one extra for one capture id; absent, empty, different tenant (both cases) and non-uuid are each refused with zero rows left and the audit chain intact. The upper-case test would fail at 75f079f: the old text compare refused it at commit (the receipt records it red before the fix).

## Nothing else changed
0122 still has no `CREATE OR REPLACE`, `DROP`, `UPDATE` or SECURITY DEFINER, and alters only `app.extra_origin` and `app.variation`; no column on a fingerprinted table. `tenant-context.ts`, the other forbidden files, apps/** and the merged tests are untouched (17 files against base, 0 deleted lines in any existing file). Held parts still unbuilt: no unlink function or `UnlinkDuplicate`, no role-per-command rule, no prompt column.

## BLOCKING
None.

## LATER (one line each)
- Job, capture and command ids from the caller are not put into one spelling; an upper-case job id is refused and a re-spelled capture id is COMMAND_CONFLICT. Fails closed; tidy when ENT-3 adds the first route.
- The guard's cast sits in an inner error-catching block, which opens a small sub-transaction per origin or event row at commit; harmless, but a plain format test before the cast would avoid it. Round 1 and earlier later items still stand.

## CI on this head (run 38172102128)
- typecheck, lint, secrets, dependency-review PASS. `pnpm test` FAIL by exactly one test, the expected `recovery-follow-up-upgrade.integration.test.ts:209` (its diff names only this leaf's 10 + 4 new columns). Database package: 73 of 74 files, 989 of 990 tests pass. Nothing else is red.
- Passed: extra-origin 32, extra-links 15, upgrade 1 (48); shared-money-origin 12, work-order-import 49, tenancy 9 (70); recovery-message-upgrade 3, evidence-pack-sources 6, demo-bootstrap 4, context-boundary 145, core extra-persistence 4. These match the helper's Mac counts (48 and 70).
- Not verified: build and browser (skipped). Before merge: MIG-ORDER-2 (#137) merged, this branch refreshed, one fully green run. That refreshed head is a new sha this verdict does not cover. Executed by me: git and gh read commands only.
