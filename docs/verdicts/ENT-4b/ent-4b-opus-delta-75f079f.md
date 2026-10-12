VERDICT: PASS — bound to head 75f079f07c86488c0fa53de1f47ec6a89204398f

Reviewer: the same Claude Opus (Opus 5.5) that reviewed be7c87b; did not build or order this; edited nothing. Lane: RED. Scope: `git diff be7c87b HEAD` (10 files, +207 −33), the six ordered fixes and regressions only. Head equals PR #134's head.

This PASS covers round 1 only. It does not make the branch mergeable today: one merged test is still red (expected, see "CI"), so build and browser never ran on this head.

## The six fixes
- A (my blocker 1) DONE. `pricing_basis` and its CHECK are gone from 0122; the name appears nowhere outside the receipt (`git grep` empty). 0122 now alters only `app.extra_origin` and `app.variation` (lines 3, 23); no column lands on `variation_revision` or on any other fingerprinted table. Nothing is left half-removed: the upgrade test now requires revision rows to be wholly unchanged. Recorded HELD in the receipt, contract and MIGRATIONS.md. Proof in CI: `recovery-message-upgrade` 3 and `evidence-pack-sources` 6 pass, both unedited.
- B DONE. A capture retry now claims and completes its own receipt in the same transaction (extra-repository.ts:73-80), using the merged receipt table and the same raising type with a retry key. No new receipt type. A retry key can never write an origin, because SH-1's routine demands the exact `extra-origin:` key. Reasoned: A raises X; B retries X → same extra; B with capture Y and new content → COMMAND_CONFLICT (B's stored hash differs); B again with X → stored result. Test `[DW5b] a successful capture retry durably binds…` checks one variation, origin, logged event and raised audit, unchanged counts, and the audit chain.
- C DONE. `readExtra` returns a leaf-owned `extra-record-legacy.v1` with `legacy: true`, the stored provenance, command id null and membership id null as stored (extra-persistence.ts:18-27); command-backed rows keep the strict SH-1 shape. `packages/core/src/extra-origin.ts` untouched; no stored row altered (tests compare the row before and after). Tests use real rows: one written by the merged `insertVariationProposal`, one by the merged legacy trigger, and a true SH-1 backfilled row in the upgrade test. Existing `[R4]` assertions are intact; cases were only added.
- D DONE. `[DW5a] link, raw unlink and order writes roll back…` now verifies the audit chain and compares the audit head (sequence and hash) before and after each of its 12 injected failures. Existing assertions kept.
- E DONE. 0122:183-185 refuses when the tenant setting is absent, empty or not the row's tenant. Test `[S4] clearing tenant context… refuses commit` proves it and counts zero rows left. Can it refuse a legitimate commit? Not on any merged path: variations and origins are written only through `withTenant` (variation-repository, this repository) and SH-1's trigger, which restores the caller's setting; the migration-owner fixture path sets the tenant too. CI agrees: 73 of 74 database files pass.
- F DONE. Only the seven merged-test hash lines were removed from `[S9]`; the scanner and seven pinned source-file pins remain.

## Regressions ruled out
0122 has no `CREATE OR REPLACE`, `DROP`, `UPDATE` or SECURITY DEFINER. Held parts still unbuilt: no role-per-command rule, no unlink function, no `UnlinkDuplicate`, no prompt column, nothing under apps/**. Against base bbca5ca: 17 files, 0 deleted lines in any existing file; `shared-money-origin`, `work-order-import`, `recovery-message-upgrade`, `recovery-follow-up-upgrade`, `evidence-pack-sources.ts`, variation-repository, tenant-context, commands, audit, enterprise-domain untouched; tenancy test still only this leaf's 6 rows; lane registry still one own line. Fix C does not open a hole: a small-builder extra now reads instead of throwing, but linking it is still refused by the database guard.

## BLOCKING
None.

## LATER (one line each)
- The new guard compares the tenant setting as text (0122:183), while `withTenant` accepts upper-case ids (tenant-context.ts:5, :86) and every merged policy compares as uuid; an upper-case id would refuse every variation write at commit. No merged caller mints one today (ids come from database rows). Fix: cast the setting to uuid before comparing.
- A future migration or data-only restore that writes origins for several tenants in one transaction will now be refused; it must set the tenant per transaction. SV-2's migration writes no origins, so it is unaffected.
- Every fresh command id that retries a capture adds one receipt row, with no cap.
- My earlier later items still stand (xmin comparisons, unlink and later-event gating, isolation level, operative rule, line carried across revisions, SoR check).

## CI on this head (run 38170588498)
- typecheck PASS, lint PASS, secrets PASS, dependency-review PASS.
- `pnpm test` FAIL by exactly one test, the expected one: `recovery-follow-up-upgrade.integration.test.ts:209`. Database package: 74 files, 73 passed; 980 tests, 979 passed. Its diff now names only `extra_origin` (10 new keys) and `variation` (4); `variation_revision` no longer differs. Nothing else is red.
- Passed: extra-origin 26, extra-links 15, upgrade 1 (42); core extra-persistence 4; shared-money-origin 12 + work-order-import 49 (61); tenancy 9 + demo-bootstrap 4 (13); recovery-message-upgrade 3 + evidence-pack-sources 6 (9); context-boundary 145. These match the helper's Mac counts in the receipt.
- build and browser: SKIPPED, because the test step stopped the run.

## Executed vs inspected vs not verified
- Executed: git and gh read commands only; no test run on the Mac.
- Inspected in full: the round 1 diff of 0122, extra-repository.ts, extra-persistence.ts, the four test files, the contract; tenant-context.ts; where tenant contexts are minted.
- Not verified: build and browser on this head. Before merge: MIG-ORDER-2 (#137) merged, this branch refreshed, and one fully green CI run including the browser suite. That refreshed head is a new sha this verdict does not cover.
