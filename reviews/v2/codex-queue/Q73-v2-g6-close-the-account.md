# Q73 · V2-G6: close the account on a V2 job. A final review of what's still open, then the existing lock, Final Check and invoice

**Tier:** RED money (the final account and final invoice). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** the top of the K5 line, `claude/project-thread-trp08u-k5a1` @ 6c1634d47 (K5A → K5A-2 → K5A-1, with K5B-1 #1013 merged in). Record the head you start from. Catch up through #1055 when it lands. **Not waiting for G2:** close-out doesn't read the handover pack (reading 5). **Branch:** the builder thread's own branch, in `config/lanes/v2-g6.json`. **PR:** draft into the k5a1 branch. **Migration:** none expected. If you find you need one, take **2088** and tell the planner; the next free is then 2089. **Plan:** build plan rev 1.3 line 173, "v2-g6 · Close the account. Final-account review, lock and Final Check run through the existing invoice path. A failed reconciliation leaves the invoice pending. A genuine approved late catch follows the existing supplement route without rewriting an issued invoice." Roadmap row G5. **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 09:20 UK.

## What it is
A V2 job ends with work-plan tasks done, extras approved by link, a payment schedule, and possibly drafted stage invoices. Main already has a complete close-out:
- the final account draft and revision (`final-account-repository.ts`), built from the accepted quote document, the latest approved variation revisions and verified proof;
- the lock (`final-account-lock-repository.ts`);
- Final Check;
- the final and supplementary invoices (`customer-invoices.tsx`, `customer-invoice.application.ts`).
This piece adds one V2 screen and one V2 guard in front of that path, and changes none of it.

## Planner reading (please confirm or correct)
1. **Main's money path only.** The final account, lock, Final Check and invoices go through main's existing repositories and routes unchanged: the "Shared v1" routes Q69 mounts. No new money table, no second total, no change to `assembleDraftFinalAccount`, the source hash or the lock. If a V2 job can't reach "Complete final account" through that path without changing it, **stop and report**. Don't bridge it.
2. **V2 extras are already in it.** V2 extras approved by link (F6) and in the editor (C3B) are rows in `app.variation` / `variation_revision` / `variation_approval`. The final account reads the latest approved revision per variation (`final-account-repository.ts` line 27). K5A-1's `approvedExtrasTotalSql` (`v2-approved-extras.ts`) uses the same rule. Prove the two agree on the practice job: the final account's variation total equals `approvedExtrasTotal`.
3. **A final review screen on V2, read-only.** Before the existing "Complete final account" control, the V2 money tab shows "Before you close this job". Each item links to where it is fixed:
   - work-plan tasks not done (SQ-F / F1);
   - approved extras the plan couldn't place (`extrasNotPlanned`, Q72);
   - open questions still waiting (E1 open facts, if on the base);
   - stage invoice drafts not withdrawn (K5B-1);
   - a quote line with no proof where the existing proof requirements need one.
   Each item is a **warning**, except the next reading's. The builder can still complete the account. The review is computed on read from existing tables; nothing is stored.
4. **One V2 guard: no live stage draft at lock.** A K5B-1 stage draft is never an invoice, but once the account locks, a stage draft must never become a second bill for the same work.
   - The V2 lock path refuses with `V2_STAGE_DRAFT_OPEN` while any `v2_stage_invoice_draft` for the job has no withdrawal.
   - After the lock, `draftStage` refuses with `FINAL_ACCOUNT_LOCKED`.
   - Both checks take the same per-job lock K5B-1 uses, before the existing lock's own locks. Name the order in the PR.
   Main's lock route is unchanged for main jobs. The guard runs only under `JOBGUARD_LOCAL_V2=1` on the practice tenant.
5. **Handover is not a gate.** Close-out doesn't read the G2 or G3 pack. A pack can be released before or after the account closes. If Ben later wants "no close before handover", that's a later card.
6. **Late catch and failed reconciliation stay main's.** A failed reconciliation leaves the invoice pending, and a genuine approved late extra goes to the existing supplementary invoice. Both are main's behaviour, proved here on a V2 job, never re-implemented.

## Dry-check (rule 23; re-check on your base)
- `packages/db/src/final-account-repository.ts`:
  - line 24 refuses `FINAL_ACCOUNT_TOTAL_MISMATCH` unless the baseline quote document's revision net matches;
  - line 27 reads variation lines (latest approval per variation);
  - lines 32 to 41 check proof eligibility through `stage_completion` → `evidence_link` → verified `evidence_upload`;
  - line 42 is `assembleDraftFinalAccount`, then the source hash and an immutable revision.
- `packages/db/src/final-account-lock-repository.ts`, plus its tables and functions in migrations `0016_final_accounts.sql`, `0132_final_account_lock.sql` and `0281_final_check_catch.sql`.
- `apps/web/app/ui/customer-invoices.tsx`: lines 22, 32 and 40 (`FINAL_ACCOUNT_LOCK_REQUIRED`, `SUPPLEMENTARY_INVOICE_BASE_REQUIRED`, `LockInvoiceGuard`), and 152 to 153 (supplementary issue).
- K5 line @ 6c1634d47:
  - `2071_v2_stage_invoice_draft.sql`: `v2_stage_invoice_draft` and `_withdrawal`, with the comment "never an invoice, never numbered, posted or sent";
  - `v2-payment-schedule-repository.ts`: `draftStage` (line 175), `withdrawDraft` (223), `drafts` (277);
  - `v2-approved-extras.ts` (`approvedExtrasTotalSql`).
- Q69 #1046 mounts the designed money tab with `JobInvoices` on the same shared routes. If it has landed, put the review card above `JobInvoices`. Otherwise mount it on the base's money page.

## Build
1. **Core.** A pure `v2CloseOutReview(facts) → { items: [{ kind, blocking, count, href }] }`, with labels from a pure helper.
2. **Repository.** `V2CloseOutRepository.review(context, jobId)` reads the facts in one tenant transaction. Add the reading 4 guard to the V2 lock path and to `draftStage`.
3. **Route.** GET `/api/jobs/[id]/close-out` (V2 local, practice tenant), with the usual job, firm and session gates. Rule 29: pending V2-SX unless SX is on the base.
4. **Screen.** The "Before you close this job" card on the V2 money tab, at 1280 and 360, with no horizontal scroll and buttons at least 44 px.
5. **Lane** `config/lanes/v2-g6.json`. Note each mount on main-owned files. There should be none in the money path. If there is one, it's a stop under reading 1.

## Tests
- **Seed (appended), on the practice job:**
  1. **Done-when.** Accepted quote, one extra approved by link (+£240), one stage draft that is then withdrawn, and all tasks done. The review shows no blocking item. Complete the final account, lock it and run Final Check. The final invoice total equals the accepted quote plus £240 plus VAT, to the penny. The final account's variation total equals `approvedExtrasTotal`.
  2. With an un-withdrawn stage draft, lock gives `V2_STAGE_DRAFT_OPEN` and writes nothing. After withdrawing it, the lock succeeds. After the lock, `draftStage` gives `FINAL_ACCOUNT_LOCKED`.
  3. A failed reconciliation leaves the invoice pending, with main's existing behaviour and codes.
  4. A late approved extra after the final invoice goes to a supplementary invoice. The issued final invoice's bytes and hash don't change.
  5. Open tasks and a no-direction extra show as warnings and don't block.
  6. Another firm gets 404 on the close-out route. The rule 30 firm A/B check is not needed for tables, because none are added.
  7. Main's final-account, lock, Final Check and invoice specs pass unchanged.
- **Unit:** `v2CloseOutReview` for each item kind, the labels, and the refusal mapping.
- **Browser:** 1280 and 360. Review card, withdraw the draft, complete, lock, Final Check, final invoice. Screenshots go in the PR.

## Stop
- If completing the account on a V2 job needs any change to `assembleDraftFinalAccount`, the source hash, the lock or Final Check, stop and report.
- If the final account's variation total and `approvedExtrasTotal` ever differ on the practice job, that's a defect. Stop.

## Known limits (to write in the PR)
- Stage invoices aren't issued yet (K5B-2), so the final invoice covers the whole account. When K5B-2 issues stage invoices, the final invoice must credit them. That belongs to K5B-2's packet.
- Handover isn't a close-out gate (reading 5).

## Done when
- On the practice job, a builder sees what's still open, closes the account through main's lock and Final Check, and gets a final invoice that equals quote plus approved extras to the penny. No stage draft can become a second bill.
- CI1 is green, and the Codex check is clean or answered. Merge only on Ben's own card (RED money).

## Plan check (Claude stand-in, 28 Nov 11:25 UK, on #1060 @ 9f804b8da, with Codex's design reply on #3 7237808230)
Passed for part 1, with three conditions. The lock and the draft both take the same `v2-schedule:<tenant>` advisory lock before anything else, so they are serialised. The draft replay compares the request digest, which includes the actor, so an earlier draft only comes back for the same authorised command. That matches Codex's condition.
1. **A race test (Codex: "check concurrent stage-draft creation against close").** In the seed suite, start a stage draft and a final-account lock on two connections at the same time, and repeat it a few times. Exactly one succeeds: either the draft exists and the lock is refused with `V2_STAGE_DRAFT_OPEN`, or the lock exists and the draft is refused with `FINAL_ACCOUNT_LOCKED`. Never both rows, never neither. The test seeds the lock row the same way the existing G6 test does, so note that main's lock still refuses V2 sessions until Q74.
2. **Lock wait.** `assertNoLiveStageDraft` takes the advisory lock before `lock_timeout` is set, so it can wait without a limit. Set the same `lock_timeout` before the guard (move the `set_config` line up by one). That is still a one-line edit to main's file.
3. **Another firm.** Add one case: a same-tenant, different-firm session asking for a stage draft on this job gets 404, the same as the review route.
Q74 is still parked. Codex's design notes for it (one command boundary for the write, an actor binding rechecked on retry, membership in the audit, an invoice and its digest kept after a supplement) are recorded in Q74 for when it restarts.
