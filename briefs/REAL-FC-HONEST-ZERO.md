COORDINATOR RULINGS (20 Nov 2026, all-builds coordinator under Ben's standing "decide yourself, cautious option" rule and his 20 Nov demo instruction for Tommy's Sunday 22 Nov demo; Astra not consulted for time; logged in AGENT_CHOICES). These replace the "ASTRA RULING NEEDED" section and authorise dispatch:
Q1 ALLOW: a readable note or message with a money amount or a yes becomes one ordinary "worth a look" item (part A).
Q2 ALLOW: remove the :121 lock.
Q3 For ALL FOUR trailing clauses ("There is a safety risk", "Written agreement is legally required", "There is an active dispute", "Do not proceed"): (c) keep the bill PENDING exactly as today. Keep their existing tests unchanged and add each as a row in the worthALook table test showing it stays pending.
Q4 AGREE: STOP gains "included in" and "job price"; real-fc-ordinary-words.integration.test.ts:165 stays unchanged.
Fee default stands (practice only).
ITEM 6 SCREEN WORDS APPROVED: empty-result sentence exactly as drafted ("JobGuard's final check didn't spot anything missing from your bill. It looks for prices and agreed extras in your notes and messages and can miss other wording, so read them through before you send the bill."). Item title / FINAL_CHECK_LOOK_LABEL = "Extra noted during the work" (it becomes the customer-facing extra name, so it must read naturally to a customer). If that label shares a word with an ordinary quote line in a way that breaks the matcher or a test, stop and report rather than changing it.
Base: current origin/main. Branch codex/sandbox/real-fc-honest-zero. Push, no PR.

CHANGED (r2, 20 Nov 09:3x, plan-check repair): item 6 now says the label becomes the extra's name on the customer's approval page and bill; Q3 covers all four trailing clauses; fee default line added to the Astra request; no-duplicate note corrected (#851/#854); test 2 is red via an exported label constant; test 4 uses the real control names; contract sentence file allowed; lane file names its branch; two LATER notes added. Plan-check text stays in REAL-FC-HONEST-ZERO.md.

# REAL-FC-HONEST-ZERO — build brief (JobGuard, NOPR, RED; written 20 Nov 2026 09:2x by Opus 5.5 medium helper)

Base: origin/main 228aa98740f64d201b90a61574581b686b73fa2e (fetched 09:14; lines at that commit). Source: fc-design/RECOMMENDATION.md, honest-zero.md, jg-walk4.md W4-1, jg-walk-kitchen-fitter.md K-1.
DISPATCH ONLY AFTER Astra answers the four questions at the end and the coordinator records the screen words (item 6) as approved.
PROBLEM
1. A real extra in everyday words ("Mrs Sample asked us to box in the boiler pipes under the sink while we were there. Said 95 quid...")
   reads as `readable`, is recorded as zero_result (shadow-detection-repository.ts:273-274), and the screen says "JobGuard's final check
   found nothing missing from your bill" (packages/core/src/final-check.ts:4), which JobGuard cannot know.
2. Any unread note containing extra/additional/added/as well/on top becomes `invalid` (final-check-typed-text.ts:121), so the source is
   unsupported, the check never completes (core final-check.ts checkSourceCompletion) and the bill stays locked for good (walk K-1).
SMALLEST CHANGE (no model calls, no migration, no screen/API/stored-format change)
A. packages/core/src/final-check.ts:4 — FINAL_CHECK_EMPTY_TEXT becomes the approved sentence (item 6).
B. packages/db/src/final-check-typed-text.ts — add one pure exported helper `worthALook(text, kind)` and replace :119-121 with:
   `result.status === "readable" ? worthALook(text, kind) ?? result : result`. The :121 extra-word lock is removed; nothing else in
   readFinalCheckTypedText or decodeFinalCheckTypedText changes (every decodeFinalCheckTypedText unit expectation stays as it is).
   worthALook returns null (honest zero) when the text has a stop phrase, or has neither MONEY nor YES. Otherwise a proposal:
   - MONEY: £ then digit | digit + quid/pound(s)/squid | digit + "all in" | digit + "cash" | pay(ing) + digit  (honest-zero.md list).
   - YES: asked us/me/if/can/could/for/whether/to | can/could/would you | go ahead | yes please | go on then | happy to pay |
     add/put it/that/this on | on the/my/her/his/their/your bill | ok'd/okayed | agreed | said/says yes/ok/fine | is fine |
     while you're/we were/we're there/here/at it/on site  (honest-zero.md AGREED list plus "is fine" from RECOMMENDATION).
   - STOP (case-insensitive): "no charge", "don't charge"/"dont charge", "deposit", "as per the quote", plus "included in" and
     "job price" — the last two only so real-fc-ordinary-words.integration.test.ts:165 stays unchanged (see Astra Q4).
   - facts: description = exported constant FINAL_CHECK_LOOK_LABEL (exactly the label approved in item 6; draft "Unmatched wording spotted"), scopeArea "job", status "completed" (note) / "requested" (message),
     customerClearlyRequested false, safety/dispute/disclosure facts false and significantWork null as :73-74; the four trailing clauses are handled exactly as Astra rules in Q3; citation as :70.
   - price: exactly one MONEY amount and no "each"/"per" -> estimatedValuePence via the existing parsePoundsToPence (bad parse -> null),
     workReference `practice:typed:look:<pence>`. Otherwise estimate null, workReference `practice:typed:look:<first 16 hex of
     sha256(text)>`. The existing same-workReference loop (repository :286-298) then folds the W4 diary and reply into one item.
C. apps/web/app/practice-company/walkthrough/voice-journey.tsx:149 — finalCheckDone must also accept FINAL_CHECK_EMPTY_TEXT
   (`startsWith("JobGuard's final check found") || text === FINAL_CHECK_EMPTY_TEXT`). Without this the walkthrough's step 7 never
   completes on a zero result. Do NOT widen to startsWith("JobGuard's final check"): the unlocked text starts that way (reveal-view.ts:37).
FILES ALLOWED TO CHANGE
Logic: packages/core/src/final-check.ts (line 4 only), packages/db/src/final-check-typed-text.ts, voice-journey.tsx (line 149 only).
Contract: docs/contracts/final-check-v1.md:50-51, one sentence only, replacing "produces an examined `zero_result`" with Astra's new ruling
(the earlier lane config/lanes/real-fc-typed-sources.json allowed this file too).
Tests (add cases; change only the old-sentence string): packages/db/src/final-check-typed-text.test.ts, packages/core/src/final-check.test.ts:25,
packages/db/test/real-fc-typed-sources.integration.test.ts, apps/web/e2e/real-fc-typed-sources.spec.ts (:98 and new scenario).
Sentence swap only (use FINAL_CHECK_EMPTY_TEXT where the file already imports @jobguard/core, else the new literal; `toContainText("found
nothing missing")` becomes `toContainText("didn't spot anything missing")`): BUILD_PLAN.md:1539,1886; apps/api/src/final-check.application.test.ts:19;
final-check.controller.test.ts:13; apps/web/app/practice-company/walkthrough/voice-journey.test.tsx:69; apps/web/app/ui/final-check-reveal.test.tsx:64,96,122,155,169;
apps/web/e2e/ DEMO-J1-core-1000:122, DEMO-J5-trial-final-check.spec.mts:103,105, SV-5:164,179,210, later-safety-140:128, real-fc-ordinary-words:98,
real-gap-proof-by-trade:145, real-journey-next-state:108, real-journey-next-to-paid:127,144, real-journey-receipt-balance-now:62,
real-own-job-to-paid:134, real-practice-firm-name-invoice:110; packages/db/test/free-first-job-final-check.integration.test.ts:99.
NEW config/lanes/real-fc-honest-zero.json (version 2 shape as real-fc-typed-sources.json; "branches": ["codex/sandbox/real-fc-honest-zero"];
exact changed paths, not itself). Nothing else.
If any other existing assertion breaks (an item count, a status), stop and report it with the text that caused it; do not edit it.
FAILING-FIRST TESTS (write and run red on the base, record the red run)
1. final-check-typed-text.test.ts, pure worthALook table: W4 diary (above) -> proposal, estimate 9500, ref practice:typed:look:9500;
   W4 reply "Thanks both, the boxing in round the pipes looks great, £95 is fine, just add it on." -> same ref; "fitted extra rad on back
   wall, 220 quid" -> 22000; "Added 2 double sockets, £85 each" -> estimate null, hash ref; null for "Sent the £500 deposit this morning",
   "hung the towel rail Mrs T bought herself, no charge", "Weather was sunny today.", "Thanks for the update.", "Boxed in the pipes under the sink".
   Plus one row per trailing clause from Q3 ("Fitted the towel rail as an extra. Agreed £180. <clause>." for each of the four), with
   exactly the result Astra ruled: null (joins STOP), a proposal (ordinary worth-a-look item), or the reader stays pending/invalid.
2. Same file: import FINAL_CHECK_LOOK_LABEL from final-check-typed-text.ts (red on the base because the export does not exist yet) and check
   matchBuilderCapture(FINAL_CHECK_LOOK_LABEL) against captures "Paint walls", "Fit kitchen units", "Box in pipes", "Labour"
   is "unmatched" (label shares no word with ordinary quote lines).
3. real-fc-typed-sources.integration.test.ts (real PostgreSQL): W4 diary + reply -> run completes, view.items has 1 item,
   description FINAL_CHECK_LOOK_LABEL, estimate 9500, both originals as evidence (red on main: 0 items). "fitted extra rad on back
   wall, 220 quid" alone -> completes with 1 item (red on main: FINAL_CHECK_PENDING). "Fitted the towel rail, added a shelf for her"
   (no money, no yes) -> completes as zero_result (red on main: pending). Then the invoice issues once, as the existing rows do.
4. real-fc-typed-sources.spec.ts, new scenario at 390x844, 1 worker: W4 diary + reply -> 1 item, "Estimated extra: £95.00",
   click "Yes — this was extra work", then on the job's variation row "Change price", fill "New price <label>", "Save new proposed
   revision", "Approve exact revision" (as DEMO-J3-shadow.spec.ts:142,154-157), issue invoice, Paid. The "Weather was sunny today." scenario now shows the new sentence.
DONE LOOKS LIKE
- [ ] Tests 1-4 red on the base and green after, on real PostgreSQL and headless Chromium; red runs recorded.
- [ ] No note JobGuard cannot read ever locks the bill: only bad bytes, wrong hash/version, invalidation and must-surface fixtures stay unsupported.
- [ ] Every grammar hit keeps its count: final-check-typed-text.test.ts, real-fc-ordinary-words(+saved-estimate) and real-own-job-promise
      integration tests, real-fc-ordinary-words.spec and real-fc-typed-recovery.spec pass unchanged apart from the sentence swap.
- [ ] git grep "found nothing missing" on the branch returns nothing; the walkthrough step 7 completes on a zero result.
- [ ] tsc for core/db/web, pnpm lint:lanes and git diff --check clean.
OUT OF SCOPE: showing the note's words on the card (read-model + screen change; next small piece); any new trade word, noun or grammar
row; numbers in words; merging different extras; success-fee code (the "no fee on worth-a-look items" default is a coordinator choice for
Ben, not code); live AI reader; marketing pages.
CHECK: RED (what Final Check finds feeds money items and the success fee; public screen sentence). One independent exact-head check that
RUNS: the db vitest file and core final-check.test.ts; real-fc-typed-sources, real-fc-ordinary-words, real-own-job-promise and
free-first-job-final-check integration tests on real PostgreSQL; then real-fc-typed-sources.spec, real-fc-ordinary-words.spec,
real-own-job-to-paid.spec, DEMO-J5 and SV-5 headless, 2 workers max, PLAYWRIGHT_SKIP_BROWSER_GC=1; integrity guard as usual.
Checker confirms against astra-replies/jg-1110-w1-final-check-typed.md: no claim of general language understanding (:23 ban stays); "no match is not an adapter failure" now holds; must-surface fixtures still win first (decoder :15-17); only the zero_result line (:24)
is changed, and only as Astra re-ruled. "e2e not run" or source-only review is a HOLD.
ASTRA RULING NEEDED (one request, before dispatch)
Q1 Part A reverses brief line :24 ("readable ... outside this bounded grammar ... finishes as zero_result") for money/yes notes. Allow?
Q2 Removing the :121 lock (its comment ties it to unsafe trailing clauses). Allow? If Q1 is refused, ship A + C + the lock removal alone.
Q3 Trailing clauses: the :121 lock today keeps four kinds of trailing clause pending, all tested (final-check-typed-text.test.ts:26,110):
   "There is a safety risk", "Written agreement is legally required", "There is an active dispute", "Do not proceed". Example:
   "Fitted the towel rail as an extra. Agreed £180. Written agreement is legally required." is locked pending today; after this change
   it would become an ordinary item with needsPriorWrittenAgreement (and every safety/dispute fact) false. For EACH of the four, Astra
   rules one of: (a) joins STOP (honest zero), (b) stays an ordinary worth-a-look item, (c) keeps the bill pending. The builder applies
   exactly that and adds each clause as a row in the worthALook table test (test 1), nothing more.
Q4 STOP gains "included in" and "job price" so the existing refusal test at real-fc-ordinary-words.integration.test.ts:165 stays as is. Agree?
Fee (for the record, no code): a worth-a-look "Yes" becomes a jobguard_catch extra, so by default it counts toward the simulated success
   fee (packages/core/src/shadow-domain/eligibility.ts:20). This is practice only, because the reader requires synthetic_demo
   (final-check-typed-text.ts:102-103). This default holds unless it is changed.
6. SCREEN WORDS FOR APPROVAL (public words): empty result "JobGuard's final check didn't spot anything missing from your bill. It looks for
   prices and agreed extras in your notes and messages and can miss other wording, so read them through before you send the bill."
   Item title "Unmatched wording spotted". This label also becomes the extra's name on the customer's approval page and bill, and the
   builder cannot rename it ("Yes — this was extra work" copies it into app.variation.description: 0281_final_check_catch.sql:36-39;
   shown at customer/extra-approvals/approvals.tsx:71, customer/extras/extras.tsx:32, ui/job-value.tsx; only the price can change,
   DEMO-J3-shadow.spec.ts:154-155), so a real customer would be asked to approve "Unmatched wording spotted £95". The approver accepts
   that, or names a label a customer can read that shares no word with ordinary quote lines. The builder uses exactly the approved
   label; renaming extras stays out of scope. Existing "Estimated extra: £95.00" / "Needs a price" (final-check-reveal.tsx:159) and header unchanged.
NO-DUPLICATE NOTE
Checked 09:14-09:20: cc-work list (only REAL-FC-TYPED-RECOVERY-SCREEN, which is pricing part two), AGENT_CHOICES tail, astra-replies,
briefs/, remote branches: nothing on this. Open PRs: #851 and #854 both change voice-journey.tsx (around :242), and #851 also changes
DEMO-J5-trial-final-check.spec.mts; expect nearby-line merges there, not conflicts on line :149. On #851's head, final-check-typed-text.ts
and its test are the same as main's. #849 (final-check-reveal.test.tsx) and #853 (later-safety-140.spec.ts) will give one-line text clashes. Not verified: no PostgreSQL/browser run by me; which other e2e texts gain an
item (builder reports); whether the simulated success-fee statement counts a worth-a-look variation.
LATER (notes only, not this piece): (a) the same extra written once in grammar words and once in ordinary words with a price gives two
items, a grammar item and a worth-a-look item, which risks billing it twice (shadow-detection-repository.ts:288-298); (b) once a
worth-a-look item is confirmed its extra carries the label, so on any rerun every other worth-a-look item on that job shares a word with
it and is dropped as builder_captured (packages/core/src/shadow-domain/capture.ts:25).
HANDOFF: fix(final-check): honest empty result; unread notes never lock the bill; money/yes notes become one worth-a-look item — READY /
tested: <commands+results> / not run: <omitted> / RED: one independent exact-head check on real PostgreSQL and browser runs before merge.

## Plan check (r2 re-check, 20 Nov 2026 09:27, Opus 5.5 medium helper; looked only at the 10 earlier findings)
Verdict: READY (dispatch still waits on Astra's four answers and the item 6 screen-words approval, as the brief says).
All 10 earlier findings are fixed, checked against origin/main 228aa98740f64d201b90a61574581b686b73fa2e:
1 item 6 now says the label becomes the extra's name on the customer's approval page and bill and the builder cannot rename it (blocking, fixed).
2 Q3 lists all four trailing clauses with the towel-rail example; matches final-check-typed-text.test.ts:26,110 and the :119-121 lock (blocking, fixed).
3 no-duplicate note corrected for #851/#854. 4 test 4 uses the real control names, matching DEMO-J3-shadow.spec.ts:142,154-157.
5 test 2 is red via the new FINAL_CHECK_LOOK_LABEL export. 6 docs/contracts/final-check-v1.md is allowed; the sentence to replace is at :50-51 as stated.
7 lane file names branch codex/sandbox/real-fc-honest-zero. 8 fee default line added. 9-10 both LATER notes added.
No regression seen in the repaired lines. Not done: no new hunt, no test runs.

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
