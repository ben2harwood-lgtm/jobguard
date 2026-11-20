REAL-CUSTOMER-LINK-RECIPIENT (JobGuard, Codex Cloud environment jobguard). Work on new branch codex/sandbox/real-customer-link-recipient from current origin/main. Made-up data only.

# REAL-CUSTOMER-LINK-RECIPIENT — build brief (JobGuard, NOPR, not RED; written 20 Nov 2026 08:3x by Opus 5.5 helper)

Base: JobGuard origin/main 228aa98740f64d201b90a61574581b686b73fa2e (checked 08:24, unchanged since #856). Line numbers are at that commit.
Source: coordinator/burn-2026-11-20/jg-walk4.md finding W4-2 (screens in jg-walk4/noemail-mobile-360/, 11-customer-link-failed.png).

PROBLEM
1. When the builder's own words name the customer ("for Mrs Sample at 4 Madeup Lane"), the Customer and site form fills name and
   address but also empties the email box (apps/web/app/ui/job-parties.tsx:84 `setEmail("")`), so the customer is saved with no email (:142).
2. The practice customer link then always fails ("The practice link could not be confirmed", quote-editor.tsx:135), because the
   database refuses a saved customer with no .invalid email (packages/db/migrations/0749_lp6d_remaining_routines.sql:3877-3878) and,
   for an own quote, also needs the quote's frozen email to equal the saved one (:3890). The quote's email is the "Confirmed recipient"
   box, which starts at a fixed practice-customer@example.invalid and never follows the saved customer (quote-editor.tsx:24 state, :79 reset,
   :157 preview, :179 input; snapshot email set in packages/db/src/quote-delivery-repository.ts preview()). So typing a different email
   in the customer form breaks the link too.

SMALLEST CHANGE (two client edits, no server, SQL or migration change)
A. job-parties.tsx:84 — when filling from the builder's words, keep the practice email ("practice-customer@example.invalid", the same
   default as :34) instead of setEmail(""). Leave every other blanked field as it is.
B. quote-editor.tsx — the Confirmed recipient follows the saved customer's email: in the existing parties load at :24 (runs on load and
   on "job-parties-saved"), when v.current.customer.email is present and the builder has not typed in Confirmed recipient, setRecipient to it.
   Track "typed" with a ref exactly like the existing customerEdited ref, set in the input's onChange at :179 and cleared in the job reset at :75.
   A manually typed recipient wins and stays. Do not change preview, send, link or acceptance logic.

FILES ALLOWED TO CHANGE
- apps/web/app/ui/job-parties.tsx, apps/web/app/ui/quote-editor.tsx
- apps/web/app/ui/job-parties.test.tsx — only :240: the email field now expects "practice-customer@example.invalid" (Town, postcode, phone stay "").
- apps/web/e2e/real-parties-atomic-save.spec.ts — only :46: same one expectation change for the email field; Town and postcode still "".
- apps/web/app/ui/quote-editor-reference.test.tsx — add one case (recipient follows saved email; a typed recipient is kept). Keep :151-:196.
- NEW apps/web/e2e/real-customer-link-recipient.spec.ts and NEW config/lanes/real-customer-link-recipient.json (exact changed paths, not itself).
Nothing else. If another existing assertion breaks, stop and report it in the handoff; do not edit it.

FAILING-FIRST TEST (write it and run it red on main before A and B)
apps/web/e2e/real-customer-link-recipient.spec.ts, copying the flow of apps/web/e2e/real-customer-link-own-quote.spec.ts, runs in both
playwright.config.ts projects (mobile-360 = 360x800, desktop = 1280x800). Two tests, made-up data only:
1. Words: "New kitchen worktops for Mrs Sample at 4 Madeup Lane. Fit two oak worktops, about 1400 quid all in." Accept the suggestion,
   fill Town and UK postcode only (no email), save; confirm scope, price, save draft, preview, "Get practice customer link".
   Expect the link box to have a value, the separate customer browser to sign in, see "To Mrs Sample · practice-customer@example.invalid",
   accept, and the builder to see "Customer accepted: authenticated customer".
2. Same, but type "mrs-sample@example.invalid" in "Customer email (fictional, optional)" and never touch Confirmed recipient. Expect
   Confirmed recipient to show mrs-sample@example.invalid before preview and the link and customer acceptance to work.
Both must fail on 228aa987 at the link step for the stated reason (no link value / "could not be confirmed"); record that red run.

DONE LOOKS LIKE
- [ ] New spec red on main, green after A+B, at 360 and 1280, on real PostgreSQL.
- [ ] Builder who never types an email gets a working practice customer link and customer acceptance.
- [ ] Builder who types a customer email gets a link without retyping it as the recipient; a typed recipient is never overwritten.
- [ ] real-customer-link-own-quote.spec.ts, real-parties-atomic-save.spec.ts, quote-send.spec.ts, UIWIRE-3.spec.ts and CH-3a.spec.ts still pass.
- [ ] job-parties.test.tsx, quote-editor-reference.test.tsx and the other quote-editor*.test.tsx unit files pass; tsc and git diff --check clean.
- [ ] No page sideways scroll at 360 on the customer and quote screens.

OUT OF SCOPE
Server, SQL, migrations, link route or customer sign-in; a nicer error when the saved email is blank (LATER note only); the "Exact terms:
document v ·" stop and the fallback "Start this practice job" stop from walk 4 (unverified, separate); any real email or sending; UI polish.

CHECK
Not RED: no money, sign-in, tenant or database change; the server's recipient and ownership checks (0749 :3878, :3890) are untouched.
One independent check that must RUN, on real PostgreSQL, headless, 2 workers max, PLAYWRIGHT_SKIP_BROWSER_GC=1: the new spec in both
projects, then real-customer-link-own-quote, real-parties-atomic-save, quote-send, UIWIRE-3, CH-3a; plus the unit files above.
"e2e not run" is a HOLD. Confirm the red run on main was recorded and no file outside the allowlist changed.

ORDER / NO-DUPLICATE NOTE
- Checked: cc-work list (no recipient line), AGENT_CHOICES.md tail (nothing on this), astra-replies (only jg-1110-b-customer-link, the
  original REAL-CUSTOMER-LINK brief), burn-2026-11-20 notes (only jg-walk4.md W4-2), branches (only the merged real-customer-link-main/
  -own-quote), open PRs #847-#857, #708, #489 and older: none fixes this.
- Overlap: open #851 (tommy-acceptance-recovery) and #708 (REAL-PAPERCUTS-2) both edit quote-editor.tsx, which is one long line per
  component, so conflicts are likely. Coordinator note (AGENT_CHOICES 08:19) lands #851 after LP-12: dispatch this after #851 merges,
  and branch from the main that has it. Neither PR touches job-parties.tsx or the recipient logic.
- Finish list: follow-on to JOBGUARD_FINISH_LIST.md:68 (REAL row 9, REAL-CUSTOMER-LINK, merged as #740).

HANDOFF LINE
fix(customer-link): practice link works when the customer came from the builder's words — READY / tested: <commands+results> /
not run: <omitted commands> / one independent check with real PostgreSQL browser runs before merge.

## Plan check (independent, Opus 5.5 medium, 20 Nov 2026 08:40 GMT; main still 228aa987)

Verdict: REPAIR. One blocking problem, the rest small.

What holds up. Every named file and line exists on 228aa987: job-parties.tsx:34 (practice email default), :84 (setEmail("") on suggestion), :142 (blank email left out on save); quote-editor.tsx:24 (recipient state and the parties load that runs on "job-parties-saved", dispatched at job-parties.tsx:164), :75/:79 (job reset), :135 ("could not be confirmed"), :157 (preview sends recipient), :179 (Confirmed recipient input). 0749 is the latest definition of demo_issue_customer_link (also in 0518, 0650, 0733); :3877-3878 refuse a null or non-.invalid saved email; the own-quote email match is :3891, not :3890 (:3890 is the customer revision id match). quote-delivery-repository.ts:33 copies the request recipient into the snapshot email, so a recipient that does not follow the saved email breaks the link, as the brief says. Walk 4 evidence of the red run at 360: jg-walk4/run-mobile-noemail.log (1 failed) and noemail-mobile-360/11-customer-link-failed.png. Not RED is right: client only, server checks untouched. No duplicate: cc-work list and AGENT_CHOICES tail have nothing on this; no branch or open PR touches it; #851 and #708 do rewrite quote-editor.tsx's long lines (gh pr diff), so the "after #851" order note stands.

BLOCKING 1 - change A reopens an Astra ruling. Astra's real-parties-atomic-save brief (astra-replies/jg-1110-w6-restack-six.md:163) says "Leave missing town, postcode and contacts empty; preserve the labelled practice example when no suggestion exists." Blanking the email on a suggestion is that rule, and job-parties.test.tsx:240 and real-parties-atomic-save.spec.ts:46 pin it. Change A and the two test edits undo it.
Exact fix (recommended, needs no new ruling): drop change A and both test edits; job-parties.tsx, job-parties.test.tsx and real-parties-atomic-save.spec.ts leave the allowlist. Keep change B. Add to B: when the saved customer has no email (the :24 load already reads v.current.customer), the "Get practice customer link" button is disabled and one plain line shows beside it: "Add a fictional customer email in Customer and site to get a practice link." Test 1 becomes: words, Town and postcode only, save; quote, preview; expect the button disabled and that line; then type mrs-sample@example.invalid in "Customer email (fictional, optional)", save; expect Confirmed recipient to show it; preview again, get the link, customer signs in, sees "To Mrs Sample · mrs-sample@example.invalid", accepts; builder sees "Customer accepted: authenticated customer". Move "a nicer message when the saved email is blank" out of OUT OF SCOPE. Done line 2 becomes: "a builder who never typed an email is told plainly what to add, and after adding it gets a working link without retyping it as the recipient."
(Alternative, only if the coordinator prefers: ask Astra to re-rule w6:163 for the email field alone, then the brief can stand as written.)

Small fixes (not blocking):
2. Red reason for test 2: on main it fails at the "Confirmed recipient shows mrs-sample@example.invalid" check (it stays practice-customer@example.invalid), not at the link step. Say so.
3. Run at true 360: real-parties-atomic-save.spec.ts:42 and real-customer-link-own-quote.spec.ts:3 widen mobile to 390. The new spec must not; use the playwright.config.ts:17-18 projects as they are.
4. "Accept the suggestion": there is no such button; the suggestion only fills the form. Copy the button steps from the walk 4 spec (review-scratch/burn-1120-jg-walk4/apps/web/e2e/walk4-journey.spec.ts, in that scratch worktree, not on main).
5. New unit case: quote-editor-reference.test.tsx:53 mocks parties with no email, so the new case needs its own parties mock with an email (and one without, for the disabled button). Keep :151-:196 unchanged.
6. Lane file: copy the shape of config/lanes/real-parties-atomic-save.json (version 2, branches ["codex/sandbox/real-customer-link-recipient"], allow = exact changed paths, not itself).

Not verified by me: I did not run any test; the red evidence is the walk 4 run. I did not confirm that the "Exact terms: document v ·" stop is unrelated.


Commit and push the branch; no PR, merge or deploy. Report the full 40-character SHA.

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
