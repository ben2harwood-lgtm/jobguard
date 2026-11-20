Changed from r1 (plan check 08:4x): job-value.tsx:40 keeps "does not guess"/"does not add" (fix 1, blocking); UIWIRE-8 added and unit/e2e line refs split for "Approved immutable commercial fact" (fix 2); new unit test checks split JSX pieces (fix 3); follow-up note for the already-running builder (fix 4). Nothing else changed.
# REAL-PLAIN-BUTTON-NAMES — build brief (JobGuard, NOPR, not RED; written 20 Nov 2026 08:3x by Opus 5.5 helper)
Base: JobGuard origin/main 228aa98740f64d201b90a61574581b686b73fa2e (fetched 08:26). Line numbers are at that commit. Replaces the
10 Nov Astra draft astra-replies/jg-1110-a-button-names.md (merges three 10 Nov branches, spans ~30 screens; do not use it).
Source: coordinator/burn-2026-11-20/jg-walk-fixes.md item 4 and its check note (:75); held work line REAL-PLAIN-BUTTON-NAMES.
PROBLEM
1. A builder walking their own job still meets system words on the main path: the quote button says "Preview immutable quote"
   (apps/web/app/ui/quote-editor.tsx:179), a started job is headed "Live · baseline frozen" (:172), and lines say "Human-added extra ·
   Rate provenance" beside "Download runtime PDF" and "Customer accepted: builder-attested claim" (all :179).
2. The customer, value and extras screens do the same: "baseline is builder-attested … no historic billing", "Import the fictional
   underway job" (job-parties.tsx:181-182), "guess ROI … persisted source" (job-value.tsx:40), "Scope lineage" and "Approved immutable
   commercial fact" (job-variations.tsx:95, :99). Builders don't know what these mean (walk 3 stop 5).
SMALLEST CHANGE (wording only: same elements, order, ids, test ids, option values and logic; aria-labels only where listed)
 quote-editor.tsx:179 "Preview immutable quote" -> "Preview this quote" ("Preview quote" is taken by review-proposal.tsx:73);
   "Preparing immutable quote…" -> "Preparing your quote…"; "Human-added extra"/"Captured scope" -> "Added by you"/"From your description";
   "Rate provenance: entered by builder|not confirmed" -> "Price: entered by you|not confirmed yet"; "Human-added extras: N" -> "Extras you
   added: N"; "Download runtime PDF" -> "Download quote PDF"; "builder-attested claim" -> "recorded by you, not confirmed by the customer".
 quote-editor.tsx:163 "Previewing immutable quote version ${v} for ${r}." -> "Showing quote version ${v} for ${r}."
 quote-editor.tsx:167 "Practice job started with its immutable accepted baseline and cap snapshot." -> "Practice job started. The agreed
   quote and its price limit are saved."; "...and activation terms." -> "...The agreed quote and its terms are saved." (keep the
   "Nothing was sent or charged." that follows each)
 quote-editor.tsx:172 h2 "Live · baseline frozen" -> "Job started · agreed quote saved" (aria-label "Live activation" stays)
 job-parties.tsx:181 -> "You can bring in the practice job that's already under way, using these saved details. Its £1,000.00 starting
   value is the figure you gave; it creates no past bills."   :182 button -> "Bring in the practice job already under way"
 job-value.tsx:40 -> "This page does not guess what the job earned you, and does not add approved extras to invoice totals. Each result
   below links to where it was saved." (keep "This page does not guess" word for word: job-value.test.tsx:81 finds it with indexOf, and
   open PR #342 adds the same phrase)
 job-variations.tsx:95 label and aria-label "Scope lineage" -> "Which work does this change?"; options -> "New work" / "Change work already
   agreed" (values new/existing stay).   :99 "Approved immutable commercial fact" -> "Approved and saved"
 practice-company/walkthrough/voice-journey.tsx:21, :83 (exact textContent), :296 (click) -> "Preview this quote"; :22 "builder-attested
   practice acceptance" -> "practice acceptance recorded by you"
FILES ALLOWED TO CHANGE (tests: only the old->new text swap; no other assertion edits)
- Product: apps/web/app/ui/{quote-editor,job-parties,job-value,job-variations}.tsx, apps/web/app/practice-company/walkthrough/voice-journey.tsx
- Unit: walkthrough/voice-journey.test.tsx, ui/{quote-editor-papercuts,quote-editor-reference,real-found-extra-to-paid}.test.tsx; NEW ui/plain-button-names.test.ts
- Browser (apps/web/e2e/*.spec.ts unless shown), every file matching an old string at 228aa987:
  "Preview immutable quote": CH-1 CH-3a DEMO-J1-core-1000 DEMO-J2 M4-3-S MON-5-customer-journey MON-7 SBOX-resume UIWIRE-2/-3/-4/-5/-7/-8/-9/
   -10/-11/-13/-14/-15 UIWIRE-15-READ-RECOVERY VALUE-1 WALK-3 WALK-stress fee-statement later-safety-140 m1-15-complete-journey
   payment-fee-statements quote-acceptance quote-send real-customer-link-own-quote real-diary-extra-link real-gap-proof-by-trade
   real-journey-{money-status,next-state,next-to-paid-send,next-to-paid,receipt-balance-now} real-overview-paid-status real-own-job-promise
   real-own-job-to-paid real-practice-firm-name-invoice real-practice-firm-name real-proof-keeps-finished real-quote-firm-sequence-{screen,
   server} real-tour-one-saved-job-now (incl. regex :115) simulation-fee-collection simulation-fee-statements simulation-money-check
   switch-live; helpers/{capture-journey,customer-invoice-journey,recovery-allocation-journey,recovery-sources,v1-sample-job}.ts
  "Live · baseline frozen" (heading, often exact:true): CH-3a M4-3-S MON-7 m1-15-complete-journey real-customer-link-own-quote
   real-diary-extra-link real-gap-proof-by-trade real-journey-{money-status,next-state,next-to-paid-send,next-to-paid,receipt-balance-now}
   real-overview-paid-status real-own-job-to-paid real-practice-firm-name-invoice real-proof-keeps-finished real-quote-firm-sequence-screen;
   helpers/{capture-journey,recovery-allocation-journey,recovery-sources}.ts
  "Download runtime PDF": UIWIRE-3 real-practice-firm-name-invoice real-practice-firm-name real-quote-firm-sequence-{screen,server}
  "Scope lineage": UIWIRE-8 (:4 getByLabel). "Import the fictional underway job": CH-3a.
  "Approved immutable commercial fact": DEMO-J3-shadow (:52 exact) UIWIRE-8 (:5 extra.getByText exact:true)
   real-found-extra-to-paid.spec.ts (:208) real-found-money-attention (:112); unit: real-found-extra-to-paid.test.tsx:130
- NEW config/lanes/real-plain-button-names.json (exact changed paths, not itself). Nothing else.
Before editing, re-run `git grep -l -F "<old>" -- apps/web` for each old string on your base: open PRs #851, #848, #850 add new uses. A
newly found matching test may get the same swap; list it in the handoff. Any other assertion break: stop and report, do not edit it.
FAILING-FIRST TEST
NEW apps/web/app/ui/plain-button-names.test.ts (vitest; reads the five product files with node:fs, no rendering): none of the old strings
above appear and each new string appears literally. Where the JSX splits a new string around an expression, check the pieces
instead: "Price: ", "entered by you", "not confirmed yet" and "Extras you added: " (not "Price: entered by you" or "Extras you added: N"
as one string). Run it red on the base and record that run. The real proof is the browser specs.
DONE LOOKS LIKE
- [ ] plain-button-names.test.ts red on the base, green after; old strings gone from the five product files.
- [ ] Every browser spec listed passes on real PostgreSQL, headless, in both projects (mobile-360, desktop).
- [ ] The tour still finds and presses "Preview this quote" (voice-journey.test.tsx, real-tour-one-saved-job-now, WALK-3 pass).
- [ ] Customer-confirmed vs builder-recorded acceptance is still told apart in words; no assertion weakened, skipped or removed.
- [ ] Diff is text-only inside the allowlist; pnpm typecheck, lint, unit tests and git diff --check clean.
OUT OF SCOPE (LATER notes only)
"Save draft revision", "Coverage diff", "Delivery facts", "Artifact hash", "Continue fake worker" and the rest of :179; invoice, receipt,
final-account, practice-panel and import-v3 wording (job-import-v3.tsx:104, practice-receipts.tsx); the jobs/[id] "Captured scope"
region; any shared label file, Technical-details disclosures or layout change; error codes; Final Check terms (Ben's call).
CHECK
Not RED: wording only; no money, sign-in, tenant, data or database change. One independent check that must RUN (headless, 2 workers max,
PLAYWRIGHT_SKIP_BROWSER_GC=1, real PostgreSQL): the new unit test and the four unit files, then every browser spec above (sharded if
needed). "e2e not run" is a HOLD. Confirm the diff is text-only and inside the allowlist.
ORDER / NO-DUPLICATE NOTE
- Checked: cc-work list (line held since 10 Nov, "re-written ... after the walk fixes land"); AGENT_CHOICES.md tail (nothing); astra-replies
  (only stale jg-1110-a-button-names.md); burn-2026-11-20 notes (jg-walk-fixes.md item 4, :75); branches real-plain-words-quote,
  demo-guide-plain-words, walk-plain-practice-approval, demo-s-customer-wording (all merged, none renames these); no open PR renames these.
- Builder already running: the work line says building (Codex Cloud, 08:42) on the first version of this brief (also on branch
  coordinator/briefs-1120). The coordinator sends that builder one follow-up: "In job-value.tsx:40 keep the words 'This page does not
  guess' and 'does not add', not 'doesn't'; job-value.test.tsx:81 looks for that exact phrase. Also: the new unit test checks the split
  pieces 'Price: ', 'entered by you', 'not confirmed yet', 'Extras you added: '; and UIWIRE-8.spec.ts:5 needs the 'Approved immutable
  commercial fact' -> 'Approved and saved' swap too."
- Overlap: #851 and #708 edit quote-editor.tsx, #854 edits voice-journey.tsx and its test, #342 edits job-value.tsx. Dispatch after the
  #847-#854 batch lands (work line TOMMY-1119-PRS), branch from that main, and run one after REAL-CUSTOMER-LINK-RECIPIENT (also
  quote-editor.tsx), not alongside it.
HANDOFF LINE
fix(words): plain names on quote, job-start, extras and value screens — READY / tested: <commands+results> / not run: <omitted> /
one independent check with real PostgreSQL browser runs before merge.


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
