# Q51 · V2-K5A-1: the payment schedule counts every approved extra, the same way job profit does

**Tier:** RED (money). **Builder:** Opus 5.5 thread. **Checker:** Codex, `@codex review` on the PR. **Base:** K5A-2 #961 `claude/project-thread-ek9rje-k5a-2` @ 795557053 (stacked on K5 #929 `codex/sandbox/v2-k5`). **Branch:** the builder thread's own, listed in `config/lanes/v2-k5a1.json`. **PR:** draft into `claude/project-thread-ek9rje-k5a-2`. **Migration:** none. **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: Fable thread, 26 Nov 16:40 UK.

## Why
The roadmap's D2 row asks for the "payment schedule [to] count every approved extra (same total as K10)". Today the two disagree:
- **K5's schedule** counts only extras whose `app.variation.origin` is `builder_logged` or `final_review`.
- **K10's job profit** counts every approved variation's latest approved revision.

So an approved extra with another origin moves job profit but never reaches a payment stage. A customer could approve an extra that the builder then never asks to be paid for. That includes `jobguard_catch` (an extra raised by the Final Check, which counts only once the customer has approved it) and a variation with no origin recorded (`origin` is nullable, added in 0053).

## Dry-check (rule 23)
On `claude/project-thread-ek9rje-k5a-2` @ 795557053:
- `packages/db/src/v2-payment-schedule-repository.ts`:
  - `read()` (lines 23 to 42) projects from `head.net`, which is the accepted quote's `snapshot->>'netPence'` (`head()`, which reads `quote_document_version` through `job.accepted_quote_version_id`);
  - `facts()` reads approvals at lines 200 to 208. The approval-to-revision join checks revision, content hash **and** `signed_delta_pence` (lines 204 to 205);
  - **line 207: `AND v.origin IN ('builder_logged','final_review')`** is the filter this packet removes;
  - lines 209 to 220: an approval before the schedule was saved becomes `prior_extra`, and a later one becomes `extra`. `approvalIds` (line 212) feeds K5A-2's frozen-stage record (plan-check condition 1).
- `packages/db/src/v2-payment-schedule.ts`:
  - `replayPaymentSchedule` (lines 95 to 138) applies each variation's latest approved amount as a delta against the last one counted (lines 130 to 134), so a later revision replaces an earlier one and is never added twice;
  - `projectPaymentSchedule` (lines 140 to 148) returns `extrasBeforeSchedule`, `extrasSinceSchedule` and `unscheduledExtras`.
- `packages/db/migrations/0053_shared_money_origin.sql` line 14: `app.variation.origin varchar(32)` is nullable. Lines 25 to 26 give the small-builder kinds `builder_logged`, `final_review` and `jobguard_catch`.

On K10 #931 `codex/sandbox/v2-k10` @ 28d2030dd:
- `packages/db/src/v2-job-profit-repository.ts` lines 17 to 26: extras are `sum(r.signed_delta_pence)` over every approval with no newer approved revision of the same variation. There is no origin filter, and the join is on revision id only.

## Build
1. **Remove the origin filter** at line 207. Every approved revision counts, whatever its origin, including null. Keep the stricter join (revision, content hash, signed amount) exactly as it is.
2. **Keep the rest of the money logic unchanged:**
   - stages already due or frozen don't move (K5A-2's rules);
   - an omission can't reduce a stage that is already due;
   - nothing is recalculated from line prices.
3. **One shared rule for "approved extras total".** Add `approvedExtrasTotalSql` (or a small function) in `packages/db/src/v2-approved-extras.ts`, returning the sum of each variation's latest approved revision. Use it in a new read-only check in the schedule view: `extrasTotal`, which equals `extrasBeforeSchedule + extrasSinceSchedule`. K10 doesn't use it yet, because it's on another unmerged branch. When K5 and K10 are both on v2/main, a follow-up (K5A-1-T) switches K10 to the same function and adds one cross-check test.
4. **Screen:** no new text unless the builder finds the stage totals now change on the practice job. If they do, the existing "extras since the schedule" line already shows it.
5. **Lane** `config/lanes/v2-k5a1.json`. K5- and K5A-2-owned files are each noted "K5A-1 mount, owned by K5 #929 / K5A-2 #961: <what>".

## Tests
- **Seed tests**, appended, on the practice job with a saved schedule:
  - approve one extra of each origin (`builder_logged`, `final_review`, `jobguard_catch`, and null) after the schedule is saved. Each moves only stages not yet due, and the stage amounts still add up to the accepted net plus all four extras, to the penny;
  - a second approved revision of one extra replaces the first and is never added twice;
  - an unapproved or declined revision adds nothing;
  - `extrasTotal` equals the sum of latest approved revisions, computed in the test straight from `variation_approval` and `variation_revision`. That is the same rule as K10 lines 20 to 26;
  - K5A-2's frozen stages are unchanged, and their stored `approvalIds` now include the newly counted approvals only where they were approved before that stage froze;
  - rule 30: the second firm sees no schedule for the first firm's job.
- Unit: a fact set with the four origins goes through `replayPaymentSchedule` (the origin isn't used there, so this guards the repository read).
- Browser (`tools/v2/payment-schedule.browser.test.mjs`): the existing run stays green. Add one step that approves a `jobguard_catch`-origin extra in setup and checks that the next planned stage grows.

## Done when
- On the practice job, every approved extra moves the remaining stages, and the schedule's extras total matches job profit's rule.
- CI1 is green, and the Codex check is clean or answered.
