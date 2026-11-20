Changed in r2 (plan-check repair, 20 Nov 2026 ~08:50): dropped change A and both test edits (they undid Astra ruling w6:163), took job-parties.tsx, job-parties.test.tsx and real-parties-atomic-save.spec.ts out of the allowlist; added the disabled button and plain line to change B; rewrote test 1; gave test 2's real red reason; fixed 0749 :3890 -> :3891; true 360 viewport rule; real button steps instead of "Accept the suggestion"; unit-test mock note; lane file shape; moved the blank-email message into scope and updated done line 2.

# REAL-CUSTOMER-LINK-RECIPIENT — build brief r2 (JobGuard, NOPR, not RED)

Base: JobGuard origin/main 228aa98740f64d201b90a61574581b686b73fa2e (checked 08:24, unchanged since #856). Line numbers are at that commit.
Source: coordinator/burn-2026-11-20/jg-walk4.md finding W4-2 (screens in jg-walk4/noemail-mobile-360/, 11-customer-link-failed.png).

PROBLEM
1. When the builder's own words name the customer ("for Mrs Sample at 4 Madeup Lane"), the Customer and site form fills name and
   address and leaves the email box empty (apps/web/app/ui/job-parties.tsx:84 `setEmail("")`), so the customer is saved with no email (:142).
   This blanking is deliberate: Astra's ruling (astra-replies/jg-1110-w6-restack-six.md:163) says to leave missing town, postcode and
   contacts empty when suggesting, and job-parties.test.tsx:240 and real-parties-atomic-save.spec.ts:46 pin it. Do NOT change it.
2. The practice customer link then always fails ("The practice link could not be confirmed", quote-editor.tsx:135), because the
   database refuses a saved customer with no .invalid email (packages/db/migrations/0749_lp6d_remaining_routines.sql:3877-3878) and,
   for an own quote, also needs the quote's frozen email to equal the saved one (:3891). The quote's email is the "Confirmed recipient"
   box, which starts at a fixed practice-customer@example.invalid and never follows the saved customer (quote-editor.tsx:24 state, :79 reset,
   :157 preview, :179 input; snapshot email set in packages/db/src/quote-delivery-repository.ts:33 preview()). So typing a different email
   in the customer form breaks the link too, and a builder with no saved email is given no clue what to do.

SMALLEST CHANGE (one client file, no server, SQL or migration change)
B. quote-editor.tsx only:
   - The Confirmed recipient follows the saved customer's email: in the existing parties load at :24 (runs on load and on
     "job-parties-saved"), when v.current.customer.email is present and the builder has not typed in Confirmed recipient, setRecipient to it.
     Track "typed" with a ref exactly like the existing customerEdited ref, set in the input's onChange at :179 and cleared in the job reset at :75.
     A manually typed recipient wins and stays.
   - When the saved customer has no email (the same :24 load already reads v.current.customer), disable "Get practice customer link" and
     show one plain line beside it: "Add a fictional customer email in Customer and site to get a practice link."
   Do not change preview, send, link or acceptance logic.

FILES ALLOWED TO CHANGE
- apps/web/app/ui/quote-editor.tsx
- apps/web/app/ui/quote-editor-reference.test.tsx — add cases only. The existing parties mock at :53 returns a customer with no email, so
  add one parties mock with an email (recipient follows it; a typed recipient is kept) and one without (button disabled, the plain line shows).
  Leave :151-:196 unchanged.
- NEW apps/web/e2e/real-customer-link-recipient.spec.ts
- NEW config/lanes/real-customer-link-recipient.json — copy the shape of config/lanes/real-parties-atomic-save.json:
  {"version": 2, "lanes": {"real-customer-link-recipient": {"branches": ["codex/sandbox/real-customer-link-recipient"], "allow": [...]}}}
  where allow lists the exact changed paths above (quote-editor.tsx, quote-editor-reference.test.tsx, the new spec) but not the lane file itself.
Nothing else. job-parties.tsx, job-parties.test.tsx and real-parties-atomic-save.spec.ts must not change. If another existing assertion
breaks, stop and report it in the handoff; do not edit it.

FAILING-FIRST TEST (write it and run it red on main before B)
apps/web/e2e/real-customer-link-recipient.spec.ts, copying the flow of apps/web/e2e/real-customer-link-own-quote.spec.ts, runs in both
playwright.config.ts projects exactly as they are (:17-18, mobile-360 = 360x800 and desktop = 1280x800). Do NOT widen the viewport the way
real-parties-atomic-save.spec.ts:42 and real-customer-link-own-quote.spec.ts:3 do (they set 390); this spec must test true 360.
Button steps: copy them from review-scratch/burn-1120-jg-walk4/apps/web/e2e/walk4-journey.spec.ts (in that scratch worktree, not on main):
type the words, "Make my draft", "Check and edit my draft" (the suggestion only fills the Customer and site form; there is no accept button),
fill fields, "Save customer and site", fill blank Quantity/Unit/Answer boxes, accept review lines, "Confirm scope", "Price the work",
fill Unit rate, "Save draft revision", "Preview immutable quote", "Get practice customer link"; customer side "Sign in",
"Review your quote", "Accept this quote". Made-up data only. Two tests:
1. Words: "New kitchen worktops for Mrs Sample at 4 Madeup Lane. Fit two oak worktops, about 1400 quid all in." Fill Town and UK postcode
   only (no email), save; confirm scope, price, save draft, preview. Expect "Get practice customer link" disabled and the line
   "Add a fictional customer email in Customer and site to get a practice link." Then type "mrs-sample@example.invalid" in
   "Customer email (fictional, optional)", save; expect Confirmed recipient to show mrs-sample@example.invalid; preview again, get the link,
   the separate customer browser signs in, sees "To Mrs Sample · mrs-sample@example.invalid", accepts; the builder sees
   "Customer accepted: authenticated customer".
2. Same words, but type "mrs-sample@example.invalid" in "Customer email (fictional, optional)" on the first save and never touch Confirmed
   recipient. Expect Confirmed recipient to show mrs-sample@example.invalid before preview and the link and customer acceptance to work.
Red reasons on 228aa987, to record: test 1 fails at the disabled-button check (the button is enabled and no plain line shows);
test 2 fails at the "Confirmed recipient shows mrs-sample@example.invalid" check (the box stays practice-customer@example.invalid).

DONE LOOKS LIKE
- [ ] New spec red on main for the reasons above, green after B, at 360 and 1280, on real PostgreSQL.
- [ ] A builder who never typed an email is told plainly what to add, and after adding it gets a working link without retyping it as the recipient.
- [ ] A builder who types a customer email gets a link without retyping it as the recipient; a typed recipient is never overwritten.
- [ ] real-customer-link-own-quote.spec.ts, real-parties-atomic-save.spec.ts, quote-send.spec.ts, UIWIRE-3.spec.ts and CH-3a.spec.ts still pass.
- [ ] job-parties.test.tsx, quote-editor-reference.test.tsx and the other quote-editor*.test.tsx unit files pass; tsc and git diff --check clean.
- [ ] No page sideways scroll at 360 on the customer and quote screens.

OUT OF SCOPE
Server, SQL, migrations, link route or customer sign-in; changing what the builder's-words suggestion fills (Astra w6:163 stands); the
"Exact terms: document v ·" stop and the fallback "Start this practice job" stop from walk 4 (unverified, separate); any real email or
sending; UI polish.

CHECK
Not RED: no money, sign-in, tenant or database change; the server's recipient and ownership checks (0749 :3878, :3891) are untouched.
One independent check that must RUN, on real PostgreSQL, headless, 2 workers max, PLAYWRIGHT_SKIP_BROWSER_GC=1: the new spec in both
projects, then real-customer-link-own-quote, real-parties-atomic-save, quote-send, UIWIRE-3, CH-3a; plus the unit files above.
"e2e not run" is a HOLD. Confirm the red run on main was recorded and no file outside the allowlist changed.

ORDER / NO-DUPLICATE NOTE
- Checked: cc-work list (no recipient line), AGENT_CHOICES.md tail (nothing on this), astra-replies (only jg-1110-b-customer-link, the
  original REAL-CUSTOMER-LINK brief), burn-2026-11-20 notes (only jg-walk4.md W4-2), branches (only the merged real-customer-link-main/
  -own-quote), open PRs #847-#857, #708, #489 and older: none fixes this.
- Overlap: open #851 (tommy-acceptance-recovery) and #708 (REAL-PAPERCUTS-2) both edit quote-editor.tsx, which is one long line per
  component, so conflicts are likely. Coordinator note (AGENT_CHOICES 08:19) lands #851 after LP-12: dispatch this after #851 merges,
  and branch from the main that has it.
- Finish list: follow-on to JOBGUARD_FINISH_LIST.md:68 (REAL row 9, REAL-CUSTOMER-LINK, merged as #740).

HANDOFF LINE
fix(customer-link): practice link follows the saved customer email and says plainly when one is missing — READY / tested: <commands+results> /
not run: <omitted commands> / one independent check with real PostgreSQL browser runs before merge.


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
