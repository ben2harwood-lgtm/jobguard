ONE ORDER, TWO PARTS, built in this order on one branch codex/sandbox/real-lock-pending-extra (both edit final-account-lock.tsx). Part 1 then part 2; one lane file covering both. RED (part 1).

===== PART 1
# REAL-LOCK-PENDING-EXTRA — build brief (JobGuard, NOPR, RED money; written 20 Nov 2026 09:1x by Opus 5.5 helper)

Base: JobGuard origin/main 228aa98740f64d201b90a61574581b686b73fa2e (fetched 09:14). Line numbers are at that commit.
Source: coordinator/burn-2026-11-20/jg-walk-plumber.md P-1 (:54-66, verified :107-114, :128) and jg-walk-decorator.md D-1
(:66-76, verified :100-107, :111: widen this piece, no second piece). Both confirmed independently from screenshots and log.json.

PROBLEM
1. A builder can press "Complete final account" while an extra is still waiting: priced but not approved (P-1, £220 left off, bill
   GBP 5,208.00) or logged with no price (D-1, ceiling repair left off, bill GBP 1,680.00). After the lock it can never be billed
   (0694_variation_post_lock_refusal.sql refuses new revisions/approvals unless origin jobguard_catch) and Final Check stays silent.
2. Nothing near the button says so: final-account-lock.tsx:108 disables Complete only for `!allDisposed || !view.termsAccepted ||
   account.issueBlocked`; the view already carries every capture's state (:20, draft|priced|approved|rejected|withdrawn) but nothing reads it.

SMALLEST CHANGE (screen only; no server, contract, SQL or migration change)
In apps/web/app/ui/final-account-lock.tsx, in the unlocked branch (:87-110):
A. `waiting = view.captures.filter(c => c.state === "draft" || c.state === "priced")`. Approved, rejected and withdrawn never wait.
B. Directly above the Complete button, when `waiting.length > 0`, a section aria-label "Extras not on this bill yet" with one row per
   waiting extra: its description; "Needs a price" (draft) or "£X — not approved yet" (priced); a link "Price or approve it" to
   `#variation-<capture.id>` (the extra's card in JobVariations on the same page, id set at job-variations.tsx:99; same id as captures
   `v.id`, final-account-lock-repository.ts:63); and a checkbox labelled `Leave "<description>" off this bill on purpose`.
C. Plain line while any waiting extra is unticked: "Approve or price each extra above, or tick to leave it off this bill on purpose,
   before completing the final account." (beside the existing hints at :105-107).
D. Complete is also disabled while any waiting extra is not ticked. Ticks live in component state, keyed by capture id, cleared in the
   existing reset effect (:50) and dropped for any id no longer waiting after a reload. Nothing is saved; the lock's own capture-register
   hash already records what was waiting at the lock.
Approving still happens on the extra's own card; after an approval the builder presses the existing "Rebuild from approved sources"
(the STALE_REVISION message there is the separate piece REAL-STALE-AFTER-APPROVE; do not fix it here).

FILES ALLOWED TO CHANGE
apps/web/app/ui/final-account-lock.tsx; apps/web/app/ui/final-account-lock.test.tsx (add cases only); NEW
apps/web/e2e/real-lock-pending-extra.spec.ts; NEW config/lanes/real-lock-pending-extra.json (shape as config/lanes/final-account-double-click.json;
exact changed paths, not itself).
Existing journeys that click "Complete final account" with a priced extra still pending, only to add ONE step that ticks its
leave-off box immediately before the click (keep every assertion that the extra stays off the bill):
- apps/web/e2e/later-safety-140.spec.ts ("Pending trim repair" £50 added :83, never approved, Complete :119);
- apps/web/e2e/DEMO-J1-core-1000.spec.ts (same extra :77, Complete :113);
- apps/web/e2e/TOMMY-money-gaps.spec.ts only if open PR #850 has merged into the main you branch from (Complete at its :225).
Any other existing spec that fails only because Complete is now disabled by a waiting extra gets the same one step; name each in the
handoff. Journeys that lock by direct POST to /final-account/lock (e.g. SV-4.spec.ts:28-31, helpers/customer-invoice-journey.ts) are
unaffected and must not change. If any other assertion breaks, stop and report it; do not edit it. Nothing else.

FAILING-FIRST TESTS (write and run red on the base before the change; record the red run)
1. apps/web/app/ui/final-account-lock.test.tsx, using its existing setup()/find() helpers (:52-70) with a copy of `account` whose
   issueBlocked is false and dispositions done, terms accepted: (a) one "draft" capture -> Complete disabled, markup names it with
   "Needs a price" and the leave-off label; (b) one "priced" capture 22000 -> disabled, shows "£220.00 — not approved yet";
   (c) after the leave-off checkbox's onChange for each waiting extra -> Complete enabled; (d) approved, rejected and withdrawn captures
   alone -> no "Extras not on this bill yet" section and Complete enabled. Existing cases stay unchanged.
2. apps/web/e2e/real-lock-pending-extra.spec.ts, projects mobile-360 and desktop: start with prepareLockJob + finishDispositionsAndTerms
   (helpers/final-account-lock-journey.ts:7, :37), then in the lock panel add "moved rad to other wall" at 220 and "made good ceiling,
   price tbc" with no price. Assert Complete is disabled and both are listed next to it with plain words. "Price or approve it" scrolls
   to the matching #variation- card. Tick both leave-off boxes -> Complete enabled -> lock -> the bill excludes both (net unchanged from
   the fixture account) and the lock view still shows them priced/draft. Second job: approve the £220 on its card, press "Rebuild from
   approved sources", redo Done and terms, then only the unpriced one is listed; tick it, complete, and the bill includes £220 net.

DONE LOOKS LIKE
- [ ] Both new tests red on the base, green after the change; the browser spec green at 360 px and desktop on real PostgreSQL.
- [ ] With any draft or priced extra waiting, "Complete final account" is disabled and every waiting extra is named next to it.
- [ ] For each waiting extra the builder can reach its price/approve card in one tap, or tick "leave off on purpose".
- [ ] Approved, rejected and withdrawn extras never block; a job with no waiting extras completes exactly as today.
- [ ] later-safety-140, DEMO-J1-core-1000, SV-4, SV-5, DEMO-J3-shadow, real-own-job-to-paid, real-journey-next-to-paid still pass.
- [ ] final-account-lock.test.tsx, job-final-account.test.tsx, tsc for apps/web, pnpm lint:lanes and git diff --check clean.

OUT OF SCOPE
Server-side refusal of the lock while extras wait; a saved "left off" record or a wired withdraw command (variation-repository.ts:190
says SV-2 added no Withdraw route); approving from inside the lock panel; the STALE_REVISION message and dispositions cleared by
rebuild (REAL-STALE-AFTER-APPROVE); the "No pending priced extras" wording in job-final-account.tsx:36 after the lock; Final Check
reading; post-lock rules (0694); the demo-s trial screen (demo-s/trial/final-account/screen.tsx:73); hiding the extra form after lock.

CHECK: RED (money: what goes on the final bill). One independent check, headless, 2 workers max, PLAYWRIGHT_SKIP_BROWSER_GC=1:
vitest for final-account-lock.test.tsx and job-final-account.test.tsx; the new spec at mobile-360 and desktop on real PostgreSQL;
then later-safety-140, DEMO-J1-core-1000 and real-journey-next-to-paid; integrity guard as usual. "e2e not run" is a HOLD.
Confirm the red runs were recorded, the diff is screen-only, and nothing outside the allowlist changed.

NO-DUPLICATE NOTE
Checked 09:1x: cc-work list (no lock/pending-extra line; REAL-ONE-MAIN-INVOICE-BUTTON is a different panel button); AGENT_CHOICES.md
tail (nothing); astra-replies (pending-extra mentions are the job-header "Continue" link, jg-1110-w3/w6, jg-1114-check-21, not the
lock); briefs/ (no lock brief yet; no REAL-STALE-AFTER-APPROVE brief either); remote branches (none named lock-pending/stale-after);
open PRs #857-#69: #850 is tests-only and asserts pending extras stay off (hence the TOMMY line above), #196 is a lock audit fix,
#849/#853 Final Check reads/tests. Verifier notes confirm not on main or in flight. Tours: practice-journey.tsx:172 resolves extras
before review_account and voice-journey.tsx approves its pre-lock extra (:324) before Complete (:346); not run, checker may skip.
Not verified: the exact full list of existing specs that complete via the button with a waiting extra (I checked the 30 specs that
click Complete; the two named are the ones I found); whether "Price or approve it" lands inside a closed details on the designed work page.

HANDOFF LINE
fix(final-account): waiting extras are listed at Complete and must be priced, approved or left off on purpose — READY / tested:
<commands+results> / not run: <omitted> / RED: one independent exact-head check with real PostgreSQL browser runs before merge.
LATER NOTES (not for this build)
- A direct POST to /final-account/lock still locks with extras waiting (outside the screen only). Could share one order with
  REAL-STALE-AFTER-APPROVE (same panel), as the plumber verifier suggested (:129).

## Plan check

Independent plan check, 20 Nov 2026 ~09:22 UK, Opus 5.5 medium (lane plancheck-REAL-LOCK-PENDING-EXTRA). I did not write this
brief. Read on origin/main 228aa98740f64d201b90a61574581b686b73fa2e (re-fetched 09:18; main has not moved). Nothing run; reading only.

Verdict: READY. No blocking problems. Five small notes the coordinator can paste into the order.

What I checked and found true:
- final-account-lock.tsx:20 view carries captures with draft|priced|approved|rejected|withdrawn; :50 is the reset effect; :87-110
  the unlocked branch; :105-107 hints; :108 Complete disabled only on `!allDisposed || !view.termsAccepted || account.issueBlocked`.
- captures come from final-account-lock-repository.ts:63-67: every variation with origin builder_logged or final_review (withdrawn
  derived from variation_withdrawal). jobguard_catch is excluded, which is right (Final Check catches, post-lock). Both P-1 (final
  review, priced) and D-1 (final review, no price = draft) are covered.
- job-variations.tsx:99 sets id `variation-${v.id}` on every card; its read (variation-repository.ts:204) lists all variations of
  the job, final-review ones included. JobVariations and the lock panel sit in the same activation panel (quote-editor.tsx:172).
  workspace-shell.tsx (hash handler, its regex for `#variation-<uuid>`) already supports that anchor, and
  real-journey-next-to-paid.spec.ts:154-175 proves a `#variation-<id>` link lands on the card and its Approve button.
- A draft card has "Change price" (job-variations.tsx:99) so "price it" is reachable; a priced card has "Approve exact revision".
- Unit test file :52-70 has setup()/find(); job-final-account.test.tsx:8 mocks FinalAccountLock to null (unaffected);
  workspace-shell-order.test.tsx:74 lists testids but renders before the lock view loads, so new markup inside the loaded branch does
  not touch it. designed-screens test (:224) uses a locked view only.
- helpers/final-account-lock-journey.ts:7 prepareLockJob logs no extras; :37 finishDispositionsAndTerms ends by asserting Complete
  enabled, so the new spec must add its extras after it (as the brief says). openLiveWatchdogJob adds none.
- Existing button journeys: of the 30 e2e files that mention "Complete final account", I read the extra-adding parts of 17. Only
  later-safety-140 (:83, :119) and DEMO-J1-core-1000 (:77, :113) complete with an extra still waiting. DEMO-J3-shadow approves its
  extras first (:51, :114); real-journey-next-to-paid rejects its capture (:97); DEMO-A1-rest/SV-6 add diary notes, which are not
  variations. The brief's catch-all clause covers anything I missed.
- Lane lint (tools/agent-lane-boundary-lint.mjs) wants one lane per config/lanes/<id>.json, never listing itself; no spec registry
  exists (playwright.config.ts:17-18 has mobile-360 and desktop). Allowed list is complete and not too wide.
- Failing-first: on main the unit cases (a)-(c) fail (no "Needs a price"/"not approved yet" text, Complete enabled); (d) passes on
  main as a guard, which is fine. The e2e's "Complete disabled" assertion fails on main for the stated reason. Not run by me.
- RED is right (money on the final bill). Not on main, not in an open PR (#850 tests-only, #196 repository audit, #708/#851/#854
  don't touch these files), not on cc-work. Respects the verifiers' "don't change post-lock rules".

Notes to paste into the order (none blocking):
1. Unit test helper: setup() closes over the module `account` (issueBlocked: true) and returns captures: [] (:54-62), so it cannot
   express the new cases. Allow a new helper (e.g. setupWith(account, captures)) beside it; existing setup() and cases unchanged.
   find() only matches buttons; a small label-based finder for the checkbox is fine.
2. PR #850 is on HOLD for repair (AGENT_CHOICES 08:19). Its support-v02 "£50-present" run completes via the button with "Pending trim
   repair" waiting (inside its finishAndInvoice helper). Whichever of #850 and this piece lands second must add the one tick step
   there; tell #850's repair too.
3. A final-review extra added in the lock panel shows on its JobVariations card only after that panel reloads (DEMO-J3-shadow.spec.ts
   :112-113 reloads). The new spec should reload before using "Price or approve it" and assert the card is visible, not just the URL.
4. The `#variation-` hash can move the workspace section (workspace-shell.tsx requestedWorkspaceSection); if the lock panel unmounts,
   the ticks clear. That is the safe direction; the spec should tick after it returns to the final account.
5. Name the lane branch codex/sandbox/real-lock-pending-extra in config/lanes/real-lock-pending-extra.json.

===== PART 2
# REAL-STALE-AFTER-APPROVE — build brief (JobGuard, NOPR, not RED; written 20 Nov 2026 09:2x by Opus 5.5 helper)

Base: JobGuard origin/main 228aa98740f64d201b90a61574581b686b73fa2e (fetched 09:14). Line numbers are at that commit.
Source: coordinator/burn-2026-11-20/jg-walk-plumber.md:68-76 (P-2) and :116-121 (independent confirmation).

PROBLEM
1. After a builder approves a final-review extra, "Complete final account" fails: approving adds an approved line the saved account
   does not have yet, so app.lock_final_account refuses (0735_per_firm_final_check_terms.sql:202-226, STALE_OR_BLOCKED_FINAL_ACCOUNT),
   the repository turns that into STALE_REVISION (packages/db/src/final-account-lock-repository.ts:31) and the panel prints the bare
   code (apps/web/app/ui/final-account-lock.tsx:118), off screen at 360px (jg-walk-plumber/mobile-360-careful/19-complete-refused.png).
2. The way out is "Rebuild from approved sources" in a different part of the page (job-final-account.tsx:36), and nothing points to it.
Note: the walk's "choices reset" evidence is select innerText, which lists every option whatever is chosen (log.json
panel-after-rebuild). Choices are saved per job and scope item, not per account revision (0132_final_account_lock.sql:166-171;
final-account-lock-repository.ts:61), so a rebuild should keep them. The new tests below prove that; do not build anything for it.

SMALLEST CHANGE (client only; the server refusal stays exactly as it is)
A. apps/web/app/ui/final-account-lock.tsx: add an optional prop `onRebuild?: () => Promise<void>`. When the error is "STALE_REVISION",
   the alert at :118 shows "You approved a change after this bill was built. Update the bill, check the new total, then press
   Complete final account again." (data-error-code stays "STALE_REVISION"), and directly under it, inside the same panel, a button
   "Update the bill with approved extras" that calls onRebuild (disabled while busy). Every other code keeps today's rendering:
   SV-4.spec.ts:13 still expects the raw INVALID_FINAL_ACCOUNT_LOCK_INPUT text. Do NOT auto-rebuild and do NOT auto-retry the lock:
   the builder must see the new total before making the declaration (job-final-account.test.tsx:117 pins explicit rebuilding).
   Use a different button name from "Rebuild from approved sources" so page-wide getByRole lookups in existing specs stay unique.
B. apps/web/app/ui/job-final-account.tsx:36: pass `onRebuild={build}` to <FinalAccountLock>. No other change. After the rebuild the
   account id changes, and FinalAccountLock's effect (final-account-lock.tsx:49-58) already clears the error and re-reads choices.

FILES ALLOWED TO CHANGE
apps/web/app/ui/final-account-lock.tsx, apps/web/app/ui/job-final-account.tsx, apps/web/app/ui/final-account-lock.test.tsx (add cases
only), apps/web/app/ui/job-final-account.test.tsx (add cases only; it mocks FinalAccountLock at :8, so assert the prop is passed),
NEW apps/web/e2e/real-stale-after-approve.spec.ts, NEW config/lanes/real-stale-after-approve.json (exact changed paths, not itself;
shape as config/lanes/real-found-extra-to-paid.json). Nothing else: no backend, SQL, migration, contract, customer-invoices.tsx,
job-variations.tsx or shared-helper edits. If another existing assertion breaks, stop and report it; do not edit it.

FAILING-FIRST TESTS (write and run red on the base before A-B; record the red run)
1. apps/web/app/ui/final-account-lock.test.tsx (reuse setup() at :49-60 with disposed and terms true, account.issueBlocked false):
   the "lock" POST answers 409 {code:"STALE_REVISION"} -> the alert has data-error-code STALE_REVISION and the plain sentence, not the
   bare code; the "Update the bill with approved extras" button exists and pressing it calls onRebuild once and sends no further POST;
   a 400 INVALID_FINAL_ACCOUNT_LOCK_INPUT still renders the raw code (matches SV-4:13).
2. apps/web/e2e/real-stale-after-approve.spec.ts at 390x844 and desktop (start copied from real-found-extra-to-paid.spec.ts:1-30; steps
   as in the walker script jg-walk-plumber/plumber-journey.spec.ts:124-150, which is outside the repo): build the final account,
   add a priced final-review extra, approve it, choose Done for every line, accept terms, press Complete -> the plain message is
   visible in the viewport (toBeInViewport) and the raw code is not shown; press "Update the bill with approved extras" -> every
   select still has value "done" (inputValue, not innerText), the final net includes the extra; press Complete -> "Final account
   completed". Also assert a direct POST to /final-account/lock with the old revision still returns 409 STALE_REVISION.

DONE LOOKS LIKE
- [ ] Both tests red on the base, green after the change; the spec at both widths on real PostgreSQL.
- [ ] After approving an extra, the builder finishes with one plain message and one press, then Complete; never a raw code.
- [ ] Choices already made survive the rebuild (or, if the spec shows they do not, stop and report it: do not change storage).
- [ ] Server still refuses a stale lock with 409 STALE_REVISION; no server file changed.
- [ ] SV-4.spec.ts, real-found-extra-to-paid.spec.ts, real-own-job-to-paid.spec.ts, WALK-stress.spec.ts still pass.
- [ ] final-account-lock.test.tsx, job-final-account.test.tsx, customer-invoices.test.tsx, tsc, pnpm lint:lanes, git diff --check clean.

OUT OF SCOPE
Auto-rebuild or auto-lock; refusing or warning at the lock while a priced extra waits (that is REAL-LOCK-PENDING-EXTRA, a separate
piece in the same panel: do not build it here); billing a missed extra after the lock (P-3, later); plain messages for any other lock
code; moving the panel or the rebuild button; VAT wording; any change to STALE_REVISION handling in customer-invoices.tsx.

CHECK: not RED (one client screen, no server, money calculation, migration or access change). One independent check that must RUN,
headless, 2 workers max, PLAYWRIGHT_SKIP_BROWSER_GC=1, on real PostgreSQL: the two vitest files above, the new spec at both widths,
then SV-4, real-found-extra-to-paid and real-own-job-to-paid; integrity guard as usual. "e2e not run" is a HOLD. Confirm the red runs
were recorded and nothing outside the allowlist changed.

NO-DUPLICATE NOTE
Checked 09:14-09:16: cc-work list (no stale/approve/lock-panel line), AGENT_CHOICES.md tail (nothing), astra-replies (no file on this;
jg-1114-w20-found-extra-repair.md covers STALE_REVISION only for invoice issue, now on main at customer-invoices.tsx:28), this
morning's briefs (no REAL-LOCK-PENDING-EXTRA brief yet), remote branches (m5-extra-approve, sv6-review-approve: both merged in Oct),
open PRs #847-#857, #708 and older: none touches final-account-lock.tsx or job-final-account.tsx. If REAL-LOCK-PENDING-EXTRA is
dispatched too, run them one after the other or as one order: both edit final-account-lock.tsx.
Not verified: I ran no tests or stack; the "choices kept" claim is from SQL and the walk log, not a run.

HANDOFF LINE
fix(final-account): after approving an extra, a plain message and one press update the bill before completing — READY / tested:
<commands+results> / not run: <omitted> / one independent check with the browser spec run before merge.

## Plan check (independent, Opus 5.5 medium, 20 Nov 2026 09:2x, against origin/main 228aa98740f64d201b90a61574581b686b73fa2e)

Verdict: READY. Three small non-blocking wording fixes below; a builder can follow the brief as written.

Checked and true at that commit:
- The cause is real. lock_final_account raises STALE_OR_BLOCKED_FINAL_ACCOUNT when the saved account's approved lines differ
  from the approved variations (0735_per_firm_final_check_terms.sql:198-226); the repository maps it to STALE_REVISION
  (final-account-lock-repository.ts:31); the route sends 409 for /STALE/ (api/jobs/[id]/final-account/lock/route.ts:12); the panel
  prints the raw code because STALE_REVISION is not in invoiceGuardMessages (final-account-lock.tsx:118, customer-invoices.tsx:21-28).
  JobFinalAccount never reloads on an approval (job-final-account.test.tsx:117-120), so the panel keeps the old revision id.
- Choices are stored per job and scope item, not per revision (final-account-lock-repository.ts:61; disposition input has no
  revision, :16). A rebuild writes a new revision id (final-account-repository.ts:43), so FinalAccountLock's effect
  (final-account-lock.tsx:49-58, deps include account.id) clears the error and re-reads. The fix in A-B works with no server change.
- `build` in job-final-account.tsx returns Promise<void> and already guards double presses (buildingRef, :8). The render is all on :36.
- Named tests exist: SV-4.spec.ts:13 expects the raw INVALID_FINAL_ACCOUNT_LOCK_INPUT; job-final-account.test.tsx:8 mocks
  FinalAccountLock; :117 pins explicit rebuilding; :123 shows the find-by-component pattern to assert the new prop.
- The allowed files are enough. No catalog or wording test reads the new text: "Update the bill" appears nowhere today;
  workspace-shell-order.test.tsx:74 lists data-testids from a static render, which has no error, so it is untouched as long as
  the builder adds no new always-rendered data-testid. The lane file shape matches tools/agent-lane-boundary-lint.mjs (only
  branches/allow/note/receipt/test; it must not list itself). No other screen renders <FinalAccountLock>.
- No duplicate: open PRs #196 (repository only), #708, #847-#857 do not touch either file; cc-work has no line for it;
  REAL-LOCK-PENDING-EXTRA.md:27 and :65 explicitly leave STALE_REVISION to this piece. Both edit final-account-lock.tsx, so run
  one after the other, as the brief says.
- Not RED is right: one client screen, server refusal unchanged.

Non-blocking fixes (do them in the order text, no new work):
1. Widths: playwright.config.ts defines projects "mobile-360" (360x800) and "desktop" (1280x800); there is no 390x844. Say "run
   in both configured projects, mobile-360 and desktop" instead of "390x844 and desktop". The walk's failure was at 360.
2. Unit setup: setup() is at final-account-lock.test.tsx:52-61 (not :49-60), and it uses the module `account` with issueBlocked
   true (:50) and passes no onRebuild. Since the file is "add cases only", say "add a new helper beside setup() that takes a
   copy of account with issueBlocked false and an onRebuild spy; do not change setup()".
3. Say the new button renders only when onRebuild is given, and name the branch codex/sandbox/real-stale-after-approve in the lane file.

Later note only: STALE_OR_BLOCKED also fires when another device rebuilt first; the new sentence ("You approved a change...")
would then be slightly wrong, but pressing the button is still the right step.

Not verified: I ran no tests or stack; the failing-first claims are from reading the code (the new button and sentence do not
exist on main, so both tests must start red).

# Keep it simple: rule for every Codex build order

Revision: rev 2, 25 Oct 2026 (Ben's card simplicity-check-before-launch; original rules from Keep It Simple plan rev 3, section 2; Ben-approved coding-run audit additions 7–11).
Build dispatchers append this whole file to every Codex build prompt, so an edit here reaches every later build.

**KEEP IT SIMPLE — builder rule.** Build the smallest clear, maintainable solution that fulfils the approved
task and preserves all required behaviour and controls.

1. Reuse suitable existing code before introducing new abstractions.
2. Do not introduce speculative frameworks, versions, configuration switches or layers. Preserve anything
   required by approved contracts, including compatibility and recovery.
3. Prefer one authoritative source for a fact, except where separate sources or independent verification are
   deliberately required.
4. Keep functions and files understandable. Treat 80-line functions, 800-line files and 1,500-line files as
   prompts to investigate, not automatic failures. Data-heavy files are exempt from size-based criticism.
5. Never simplify away child safety, privacy, identity, financial controls, access restrictions, audit evidence,
   data protection or independent acceptance.
6. Never refactor unrelated code during a repair or catch-up. Never change checks, protected fingerprints, stored
   formats or approved interfaces without the required separate authorisation.

7. After reading required instructions, inspect the affected source, callers and tests. Search explicit paths first; exclude generated evidence, logs and dependency trees unless they answer a specific question. If output is truncated, narrow the query. Once the behaviour and affected path are clear, implement.
8. Use an explicit working directory and the repository's existing interpreter, dependency tool and test runner. Establish these from available configuration once; do not guess paths or rediscover them between commands. Before a long or permission-gated run of a new helper, perform its cheap syntax/import check where available.
9. Reuse existing parsers, validators and test helpers before writing alternatives. Keep repair diffs focused; avoid whole-file formatting and unrelated cleanup unless required by the repository. Preserve necessary compatibility, isolation and evidence binding.
10. Test the changed behaviour and the existing rules that depend on it, not just input syntax. When extending a state or format, inspect its consumers and cover affected open/closed, permission or failure boundaries. Confirm that new regression tests run through the actual repository test runner before handing them off.
11. Complete required checks and advance to the required review or handoff. Repeat or broaden checks only when a change, failure, specific unresolved risk or explicit gate requires it. Keep evidence in the existing receipt. A real external hold blocks the affected action; it does not justify speculative code or new reporting machinery.

Explain any substantial new complexity in the existing task receipt. Do not introduce another reporting document.
