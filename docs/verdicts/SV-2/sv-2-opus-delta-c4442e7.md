VERDICT: PASS — bound to head c4442e760c3fffc50eb8a5988073f3960156654f
Reviewer: fresh Claude Opus 5.5 (subagent, 11 Oct 2026); did not build or order this; edited nothing, ran no database suite.
Lane: RED (catch-up delta)
Scope: only what changed since the accepted head fe76e7f (commits 58c10c0, 2fd903f, c4442e7), judged against main 530681c and, for stale restatements, main 8db62b3. PASS is by inspection plus the builder's reported runs; it is conditional on green CI on the final head.

## 1. Merge kept both sides, nothing else — PASS
Compared SV-2's own added/removed lines per file, `df1f9c1..fe76e7f` against `530681c..c4442e7`. 14 files identical line for line (incl. the migration SQL, `index.ts`, `variation-repository.ts`, `variation.application.ts`, `shared-money-origin`, `tenancy`, `demo-bootstrap`). Every difference:
- `migrations/0100_…` → `0118_shadow_persistence.sql` (rename only, same blob f98c889).
- `migrate.ts`: one line, filename, now after 0112. `index.ts`: SV-2's one export appended, main's 13 kept.
- `MIGRATIONS.md`: section moved after 0112, heading `### 0100` → `## 0118`, one "renumbered" sentence, one `0100`→`0118` in prose. Additions only against main (+43/−0).
- `BUILD_PLAN.md`: one §12.2 ledger paragraph (+2). `config/agent-lane-assignments.json`: path swap on SV-2's own line only.
- `docs/contracts/shadow-persistence-v1.md`, `shadow-catalog` and `shadow-persistence` tests: filename/number swaps only (3, 3 and 1 lines).
- `small-builder-origin` test: the three repairs (check 4) plus number swaps.
- New: `BUILDER_RECEIPT_main-merge.md`, and the two fe76e7f verdict records (added at 99c33ea).
`git diff 530681c c4442e7` touches 25 files, all SV-2's. 58c10c0 has parents 99c33ea + 530681c; the three conflicted files are additions-only against main.

## 2. Stale restatements — PASS (none found)
| Object 0118 restates or alters | Latest prior definition on main 8db62b3 | Differences beyond SV-2's intended change |
|---|---|---|
| `app.validate_extra_origin()` (CREATE OR REPLACE, 0118:170–198) | `0053_shared_money_origin.sql:136–160` — the only definition on main | None. Diffed both bodies: adds pinned search_path and the two new guards; two line joins and one dropped comment. Nothing lost. |
| `app.extra_origin` (+column, CHECK, FK) | 0053 only; no later migration names the table | None |
| PUBLIC EXECUTE revoked on 4 older routines | 0016/0026, 0016, 0017, 0027/0095 — all at or before SV-2's base | None; 0102–0115 never mention them |
| `app.evidence_object` (+UNIQUE) | last altered ≤0097; 0107 only reads it | None |
| `app.final_account_line` (+UNIQUE) | 0016/0026 | None |
| `reject_immutable_commercial_mutation()` (used, not restated) | defined ≤0019; 0109/0110 only attach it | n/a |
| `lock_audit_head` / `advance_audit_head` (called) | 0001; 0115 only calls them | n/a |
No routine SV-2 replaces was replaced by 0102–0115, so nothing is undone. Reverse check: 0102–0115 never reference `extra_origin`; 0118 does not alter `app.variation`; main's `work-order-import` test (lines 403–405) inserts contractor-kind origins as runtime expecting 23514 and still gets 23514 under the new validator (neither new guard fires when kind is not a catch and the source is null). Its "every table with job_id" scan (line 321) counts rows only, so nine empty new tables do not change it.

## 3. Rename is pure — PASS
100% rename, 0 insertions/deletions. Registry: 58 entries, strictly increasing, equal to the files on disk, 0118 last. No test asserts `0100` or "last"; SV-2's tests locate the migration by name. Remaining `0100` mentions are historical receipts, ledger history and two main-owned lines (LATER 2).

## 4. Test repairs weaken nothing — PASS
`git diff fe76e7f c4442e7` on `small-builder-origin.integration.test.ts`: only the three repairs plus number/comment swaps; every other `expect` and every statement under test is byte-identical. No `.skip`/`.only`.
- (a) Fix 1 (lines 86–92) and Fix 2 (line 156): cause confirmed at `0110_work_orders.sql:176–177` ("job provenance is immutable"). End state is the same as before (live, imported, full baseline, same session). The hand-inserted track row in Fix 1 equals what 0053's trigger binds for a live non-imported job (`small_builder`/`synthetic_demo`/`legacy_synthetic_live_fixture`, source = job id; 0053:84–95). The runtime role could never create it (SELECT only, 0053:40–41); it is written through the superuser `admin` pool, the same actor as the UPDATE it replaces. It does not bypass the rule under test: that test is about the application's propose → LogBuilderExtra, replay and the two ownership refusals, all still exercised through the runtime login. Trigger-bound track + runtime capture is still proven in the same file on job J (first test and the lock test).
- (b) Line 235: a count of 5 became an exact sorted list of six names (adds 0106's `guard_practice_feed`); strictly stronger. `expect(await sboxCatalog()).toEqual(sboxBefore)` after the migration is intact (line 239).
- Existing money test `shared-money-origin.integration.test.ts`: SV-2's change is byte-identical to the accepted head: 31 appended lines, and the one `ConfirmJobGuardCatch` row moved out of the 7-row runtime loop (line 142) into the appended runtime-refused / owner-insert case. That one row is an existing assertion that SV-2 changes; it was ruled on and accepted at fe76e7f (item 1f, "granted lane amendment") and the catch-up did not touch it, so I do not count it as a new finding. Main's own two changed lines in that file are kept. No other existing assertion changed.

## 5. Tenant and role isolation — PASS
SQL bytes unchanged: all nine tables keyed and foreign-keyed on `tenant_id`, owner `jobguard_migration`, ENABLE + FORCE RLS, tenant policy, REVOKE ALL then explicit minimal grants. What changed is what runs before it:
- Routines: I listed every routine created by 0102, 0103, 0106, 0107, 0109, 0110, 0112 in schema `app`; each non-trigger one has `REVOKE ALL … FROM PUBLIC` (0102:59,204; 0103:39; 0107:378–379,386; 0109:89; 0110:202–502; 0112:484–491). 0111 only adds `identity` routines (no schema USAGE for shadow roles). 0115 is CREATE OR REPLACE only, so grants are kept. So the new schema USAGE gives `jobguard_shadow` nothing from 0102–0115. SV-2's catalogue test checks this by scanning the whole schema, not a list.
- Tables: no `GRANT … TO PUBLIC`, no default or bulk grants in 0102–0115; the shadow roles did not exist then. Nothing reaches them.
- Runtime gets nothing new on shadow tables: only `reveal_shadow_signals` EXECUTE and SELECT/INSERT on `variation_withdrawal`, as accepted. 0111's new `jobguard_identity` role gets nothing on shadow objects.
- Work-order (contractor) jobs cannot carry shadow signals: the signal's track is fixed to `small_builder` by CHECK + FK.

## BLOCKING findings
None.

## LATER findings
1. Receipt Fix 1 does not say outright that the hand-bound track row is owner-level set-up the runtime role cannot write. Add one sentence; better, copy the home job's track row by SELECT so the test keeps depending on what the real trigger bound.
2. `MIGRATIONS.md:696` (0111's section) and the comment at `practice-feed.integration.test.ts:113` still say "0100 (SV-2)". Main-owned text, outside SV-2's lane.
3. The ledger paragraph and MIGRATIONS.md call 0115 "reserved"; it is now merged on main. Dated statement; refresh at the final catch-up if wanted.
4. `MIGRATIONS.md` heading level changed `###` → `##` (cosmetic, matches neighbours).
5. Plan PR #118 is still OPEN. The fe76e7f acceptance holds the merge until Ben merges it himself. Integrator hold, not a code defect.
6. The carried P3s from fe76e7f (e.g. shadow SELECT on `shadow_break_glass_access`) are unchanged.

## Executed vs inspected vs not verified
- Executed by me (read-only): `git fetch`; per-file before/after line comparison; blob-hash equality of the migration; registry order and registry-equals-disk script; `diff` of the two validator bodies (files under /private/tmp/claude-501/sv2-delta/); greps of every merged migration for each object; `gh pr view` 118/119.
- Inspected: all of 0118; 0053; the relevant parts of 0102–0115; the test diffs; the catch-up receipt; SV-2's catalogue test; main's `work-order-import` and `recovery-follow-up-upgrade` tests.
- Not verified by me: no database, unit or browser suite was run. The 36/36 (four SV-2 database files), 13/13 (`pnpm test:migrations`) and 5/5 figures are the builder's own report in the receipt. I saw no completed CI result for c4442e7: the PR is CONFLICTING with main; `secrets` passed and a `checks` run was still in progress when I looked. Main's other database suites and the newer browser journeys (MON-7, M4-5-S, M4-6-S) have not run against a schema that includes 0118; I only read them. Lane lint not re-run.
- For the re-check after the final catch-up: 0115 registered between 0112 and 0118, SV-2's delta otherwise unchanged, and green CI on that exact head.
