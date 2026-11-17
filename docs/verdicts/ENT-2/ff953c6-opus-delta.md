VERDICT: PASS — bound to head ff953c6288d93a2eb4c4c2f1ea9dfeb5e864027e
Reviewer: fresh Claude Opus review agent spawned by the JobGuard integrator (Claude week, 9 Oct 2026); did not build, repair or order any commit in this PR.

**In short:** The blocking problem from the last review is fixed: a manager whose grant covers one branch can no longer see, change, cancel or probe another branch's work orders, because the database now asks "may this person import for *this order's* client?" (the same check CH-3b uses), and the office screens show only orders and batch rows for clients the person covers, with other-branch orders looking exactly like orders that do not exist. Re-importing an old file after a newer file has changed some orders is no longer silently answered as "nothing to do"; those rows are now refused as out of date and recorded, which is the right, honest behaviour. The CH-1 merge kept both sides intact, and 0110 does not undo anything 0109 added. On this exact head CI passed every database, unit and build check and 291 of 292 browser tests; the one failure is a known timing flake in a screen ENT-2 does not touch (it also failed on main's own CI today), so this PASS covers the code, but the integrator still needs one green CI run on this head before merging.

## Scope

Delta `de29e5c..ff953c6`: the five attempt-3 commits (`51b678d` red tests, `4d7ab9d` fix, `1bc0902` contract doc, `441fd8a` fixture move, `0f5608c` receipt and failed-first logs), the merge `c7a8830` of `origin/main` `a7d5917` (CH-1 #123, 0109), and receipt `ff953c6`. Read in full: the 0110 diff (new `app.work_order_client_permitted` and its three call sites), the `work-order-repository.ts` diff (replay query, `batchResult`, `applyRow`, `overview`, `revisions`), the seven new tests and the extended catalogue test in `work-order-import.integration.test.ts`, the extended ENT-2 conformance test in `contractor.integration.test.ts`, `addBranchClient` in `work-order-fixtures.ts`, the contract-doc change, both receipts and both failed-first logs. Compared against 0102:117 (`bind_contractor_parties` authority) and 0054:83–112 (`contractor_member_active`, `contractor_allowed`). Merge checked as a union: per-file change counts of `c283d4e..0f5608c` equal those of `a7d5917..c7a8830`, and those of `c283d4e..a7d5917` equal those of `0f5608c..c7a8830`; each of the six files touched by both sides read. 0109 read for `app.job` objects. Everything the previous verdict found sound was not re-reviewed. No local PostgreSQL/browser run; builder logs and CI used.

## Findings

### P1 — none

P1-1 is resolved (answer 1).

### P2 — none

P2-1 is resolved (answer 3).

### P3 (non-blocking, no repair required)

- **P3-a. One new hook budget, contrary to the receipt's wording.** `packages/db/test/work-order-import.integration.test.ts:510` gives the new per-order `beforeAll` a 180 s budget. It copies the same file's existing top-level `beforeAll` (`:49`, 180 s) and changes no existing timeout, so nothing is weakened; but `BUILDER_RECEIPT_attempt3.md` says "I added **no** new or longer timeout", which is not quite accurate.
- **P3-b. Stale prose in `packages/db/MIGRATIONS.md`** (0110 section, `:658` onward): still says 0110 is "registered last, after `0106_practice_feed.sql`" and follows "the held 0107-0109". After the merge it follows 0109 and 0107–0109 are all merged. The builder flagged this in the merge receipt and left it to the lane owner. Docs only.
- **P3-c. Row-number gaps in a filtered batch view.** A branch-scoped admin looking at a mixed batch sees only their rows, with their original row numbers (`work-order-repository.ts:174–186`), so gaps show that other rows exist. Gaps do not reveal which orders, clients or references those rows were. Acceptable; noted only because the brief asks about other-branch existence.
- **P3-d. Outside the delta, for the integrator: team scope on assignment.** `0110:411` checks only that an assigned team exists in the tenant, so a branch-A admin may route their *own* order to a branch-B team, and `ASSIGNMENT_INVALID` versus success tells them whether a guessed team id exists (UUIDs, so guessing is not practical). This is not about another branch's orders and the previous verdict accepted the assignment design. Whether cross-branch team routing is allowed is an ENT-1 product question, not a repair condition here.
- Carried over: P3-1 (`prepareWorkOrderDemo` runs before the import gate) remains open and is recorded in the receipt; P3-2 unchanged; P3-3 done (`:399`).

## Answers

**1. P1-1: per-order client authority.** Resolved, and enforced in the database.
- `app.work_order_client_permitted(actor, client)` (`0110:269–273`) = `contractor_member_active(actor) AND (contractor_allowed(actor,'organisation.manage',client) OR contractor_allowed(actor,'data.import',tenant))`. That is 0102:117 exactly. The extra `contractor_member_active` and `client IS NOT NULL` terms change nothing: `contractor_allowed` already requires an active member (0054:90), and 0102 checks membership first. Owner, revoke and grant match the other routines (`:279–282`). A tenant, region or branch grant covers a client through `contractor_allowed`'s branch join (0054:93–111). `data.import` only ever matches a tenant-scope grant.
- `work_order_commit`: the revise path refuses an unknown order or an out-of-scope order with the same `NOT_FOUND`/P0002 (`:380`), before the revision number is compared, so a stale or right number reveals nothing. The create path checks `binding.client_id` (`:370`) as defence in depth on top of CH-3b's own check.
- `work_order_parties_unchanged` looks up the order's client and refuses unknown or out-of-scope orders with the same not-found before any comparison (`:491–493`). It is no longer a yes/no oracle.
- Repository: `applyRow` finds an existing order only if the member covers its client (`work-order-repository.ts:196–200`). A row naming another branch's order therefore goes down the create path and gets exactly what a row naming no order gets. Proved: outcomes and error codes equal (rows 0/2 and 1/3 of the cross-branch test), and no `workOrderId` leaks into the receipt.
- `overview` (`:300–317`) joins orders to the covered clients. Batches are listed only if the member is tenant-wide, recorded the batch, or has a visible receipt in it. Counts are recomputed from the visible receipts (`visibleReceipts`/`receiptCounts`, `:90–99`).
- `batchResult` (`:174–186`) applies the same filter. It is used by the batch view, the import's own result and the replay, so a replay cannot show another branch's rows either. A batch with nothing visible is `NOT_FOUND`, asserted identical (same error fields and message) to an unknown id.
- `revisions` (`:338–346`) allows `work_order_client_permitted` on the order's client, or the existing job-read route.
- Refused rows, which name no order, are shown only to tenant-wide importers and to whoever recorded the batch.
- Remaining paths I checked: scheduling, visits and resident reads go through `contractor_job_allowed` (team scope; admins hold no `job.read`/`resident.read`); `import_batch_record` writes only the caller's own batch. I found no remaining way for a branch-A admin to read, revise, cancel or probe a branch-B order. (A different scoped member who reused someone else's command id would now get `COMMAND_CONFLICT` from `UNIQUE(tenant_id,command_id)` with nothing committed, where `de29e5c` would have replayed the other member's batch. That needs a guessed UUID, and the new behaviour is the safer one.)

**2. Tests.**
- **Red first, for the right reasons.** `failed-first-work-order-import-on-de29e5c.log` shows 7 failed and 1 passed:
  - register returned `WO-DEMO-0010, 0011, 0012` where only `WO-DEMO-0010` was expected;
  - the cross-branch import gave `revised, revised, rejected, rejected, revised`, so both cross-branch writes committed;
  - the party check returned `{same:true}` to branch A;
  - the direct commit returned `revision: 2`;
  - the create probe was `{ok:true}` for both actors;
  - A-B-A: `a2.replayed` was `true` at `:182`;
  - the catalogue test failed because the new routine was missing.
- The one that passed is the positive "tenant-wide admin and finance revise and cancel both branches; each branch admin revises their own" test, which should be green on both heads.
- `failed-first-conformance-on-de29e5c.log` shows `admin@branch: revision of the clientB order … expected true to be false`.
- **Green now.** Builder at `441fd8a` and `c7a8830`: `work-order-import` 49/49, `contractor` 19/19, `job-scheduling` 9, `tenancy` 9, CH-1's `job-activation-terms` 11. CI below.
- **Tenant-wide still works.** Tenant-wide admin and finance see both branches' orders, batches and revisions (`:533–539`). They revise and cancel both branches through the import (`:626–635`) and directly at `work_order_commit` (`:595–604`), and the owner sees both.
- **Genuine.** The positive controls prove the refused payloads are valid. The direct probes always roll back. The conformance test now compares the database with core's pure rule per client, for every role and scope, on new orders, revisions, register contents, batch contents and revisions.

**3. P2-1 and the builder's reading.** Resolved, and I agree with the reading.
- The replay query (`work-order-repository.ts:125–131`) matches a stored batch only when it is the same command, or the same file, clean, with every order it touched still at the revision that batch recorded (`work_order_current.revision_id = receipt.revision_id`). In both cases the batch must be the member's own, or the member must be tenant-wide.
- A → B → A therefore processes A row by row: 9 unchanged and 3 `STALE_REVISION`, in a new recorded batch, with exactly 3 revision-2 rows left (`:164–191`).
- This is consistent with §9.1.3 and with the contract's existing rule ("a changed row whose expected revision is not the current one is `STALE_REVISION`"). A's rows still say revision 0. Writing them back as revision 3 would mean ignoring the sender's stated revision, which would weaken the optimistic-concurrency guard and silently overwrite B. The change is not hidden: it shows up as recorded, typed refusals, where `de29e5c` claimed "replayed, created 12". The previous verdict's parenthetical "(new revisions where content differs)" was loose; a file that names the current revision still gets a new revision, as before.
- Same file twice in a row is still a replay (`:171–173`), and B again is still a replay. A batch with refusals is never a replay source, which is unchanged behaviour. The same command is a replay for the member who sent it, or for a tenant-wide member.
- No cross-branch leakage. The NOT EXISTS check looks only at batches the member recorded, or that a tenant-wide member (who covers everything) may see. The replayed result goes through the filtered `batchResult`. A scoped member re-importing a tenant-wide member's file is processed row by row, and other-branch rows get the same not-found as unknown ones.

**4. Merge `a7d5917`.** Clean union, nothing lost.
- Change counts per file are identical in both directions (method in Scope).
- The six files both sides touched each show only the other side's additions:
  - `BUILD_PLAN.md:3342/3344`: CH-1 and ENT-2 ledger lines both kept;
  - `packages/core/src/index.ts`: union of exports;
  - `migrate.ts:58–60`: …0107, 0109, 0110;
  - `MIGRATIONS.md`: both sections, 0109 then 0110;
  - `tenancy.integration.test.ts`: union of rows;
  - lane registry: both lanes.
- **0110 against 0109.** No object is changed by both. 0109 rebuilds `job_baseline_shape` and `job_practice_scenario_check`, and adds column `saved_v1_sample`, trigger `saved_v1_sample_guard` and the session seeding trigger. 0110 rebuilds only `job_provenance_check` (0020's, which no other migration touches), adds `work_order_job_has_no_quote_or_fee` and trigger `a_work_order_job_guard`, and changes no 0109 object.
- **How they interact.** A work-order job has all four baseline columns null, so it passes 0109's new `job_baseline_shape` through its first branch. `practice_scenario` and `saved_v1_sample` are left at null/false, so 0109's guard passes on insert and on the draft→live update. 0110's guard ignores non-work-order jobs except for a provenance change, so the saved-v1-sample seed, which uses the default provenance, is untouched.

**5. Weakened, skipped or timed out?**
- **Nothing weakened or skipped.** No assertion was removed, skipped, `.only`'d or loosened, and no existing timeout was changed. The one new budget is P3-a.
- **The one deletion.** The only file deleted anywhere in the delta is `packages/db/test/work-order-two-branch-test-utils.ts`. It was added in `51b678d` (this round), was absent at `de29e5c` and on main, and was removed in `441fd8a` after the lane refused it. Its `addBranchClient` moved to the allowed `work-order-fixtures.ts`, and history keeps the original.
- **Lane and reserved areas.** The lane check passed in CI's `pnpm lint` on this head. The ENT-2 side touches only 0110, the repository, fixtures, two tests, the contract doc and receipts. Nothing founder-reserved is touched (no apps, CI, tools, package files, providers, sends, spending or release), and all data is synthetic.

**6. CI.** **FAIL: one known main browser flake, not caused by this PR.**
- **Run.** 37954728411 (pull_request, head ff953c6288d93a2eb4c4c2f1ea9dfeb5e864027e). `checks` failed after 18 m 08 s (15:50:41–16:08:49 UTC, inside the 30-minute limit); `secrets` and `dependency-review` succeeded.
- **Inside `checks`, all passed except the browser step:**
  - typecheck;
  - lint, including the lane check (`Lane boundary passed`, lane `ent-2`, base `a7d5917`);
  - unit tests: core 61 files/1,751 tests, api 32/744, web 21/448;
  - `@jobguard/db` 66 files/826 tests, including `work-order-import` 49, `contractor.integration` 19, `job-scheduling` 9, `sor-pricing` 9, `work-order-concurrency` 6 and CH-1's `job-activation-terms` 11 (the 2,000-order import measured 23,460 ms);
  - build.
- **The failure.** Playwright: 291 passed, 1 failed, `[desktop] e2e/M4-1-S.spec.ts:11`, `toBeFocused` on "Open £320 withheld payment", "Received: inactive".
- **Why it is the known flake.** This is main's recorded focus race (`docs/verdicts/CH-1/040c9ba-acceptance.md:22`; CH-1 round-4 receipt §4): the spec calls `.focus()` on an "Open …" button that `recovery-cases.tsx` still holds `disabled` while it loads.
  - The same test failed main's own push CI at `c283d4e` (run 37942077378, mobile-360).
  - It passed on this PR's previous head `de29e5c`, which carried the same ENT-2 web changes.
  - ENT-2 touches neither the spec nor `recovery-cases.tsx`.
  - It is not the PostgreSQL ECONNREFUSED flake; there is no ECONNREFUSED in the log.
- **Not re-run**, per the brief.
- **Merge condition.** The PASS covers the code. The run as it stands is red, so the integrator needs a green CI run on this head before merging.

---
_Generated by [Claude Code](https://claude.ai/code)_

