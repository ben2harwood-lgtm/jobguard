Changed in r2 (20 Nov 2026, Opus 5.5 medium, plan-check repair only): change B adds overflowWrap:"anywhere" on the extras <main> (allowed change widened to that style) and a true minus sign put in front of the Intl-formatted absolute value; the helper wording now formats totals with the same en-GB Intl formatter; DEMO-A1-rest and SV-6 added to Done, and DEMO-J3-integrity, SV-5, DEMO-A1-rest and SV-6 added to CHECK. Nothing else changed.

# REAL-CUSTOMER-EXTRA-VAT — build brief (JobGuard, NOPR, RED money shown to a customer; written 20 Nov 2026 09:3x by Opus 5.5 medium helper)

Base: JobGuard origin/main 228aa98740f64d201b90a61574581b686b73fa2e (fetched 09:29; main had not moved). Line numbers are at that commit.
Source: coordinator/burn-2026-11-20/jg-walk-customer.md C-1 (:28-47), independently verified (:80-98), narrowed (:100-103).

PROBLEM
1. The customer approves an extra shown as "+£140.00" (button "Approve revision 1 for +£140.00", no VAT on the page; 11-c-extra-approved.png)
   and is billed £168 for it: invoice GBP 1,848.00 = (£1,400 + £140) x 1.2, while quote £1,680 + £140 = £1,820 (log.json entries 29, 117).
2. The extras screen prints the bare net figure (apps/web/app/customer/extras/extras.tsx:28 `pounds()`, used at :32 and :33; the view holds
   only net, packages/core/src/customer-variation-approval.ts:16-17), and the bill screen shows only "Amount due" with no word about VAT
   (apps/web/app/customer/practice-pay-now/screen.tsx:7), while the customer's quote does show Net · VAT · Total (customer/quote/quote.tsx:33).

SMALLEST CHANGE (screen only; no server, contract, SQL, migration or VAT-rule change)
A. extras.tsx: work out each extra's VAT with the SAME function the final account and invoice use:
   `candidateM1TaxPolicy.calculateGroup(money(item.amount.pence), "standard_rate_20")` (packages/core/src/tax.ts:10-15; used at
   core/src/final-account.ts:22 and db/src/final-account-lock-repository.ts:121; `money`, `addMoney` from core money.ts). Both are already
   exported from @jobguard/core (index.ts:10, :14), which extras.tsx already imports. Total = net + VAT. No new rate, rounding or helper in core.
B. Replace the line at :32 with plain words: `Revision {n} · £140.00 plus VAT £28.00 · total £168.00` and the button at :33 with
   `Approve revision {n} for £168.00 including VAT`. Credits keep their minus sign on all three figures (e.g. −£25.00 plus VAT −£5.00 ·
   total −£30.00). Use one en-GB currency formatter like quote.tsx:26 (it gives £1,234.56 with thousands commas). Format the
   absolute value with Intl and put "−" (U+2212) in front for negatives, keeping today's sign character (extras.tsx:28); Intl on its
   own gives a hyphen "-" (char code 45), which test 1's credit case would not match.
   Give the extras <main> style={{overflowWrap:"anywhere"}}, as screen.tsx:23 and customer/extra-approvals/approvals.tsx:69 already
   do (no margin or layout change), so the 64-character content hash at :32 wraps at 360 px instead of pushing the page sideways.
C. The approval command is UNCHANGED: it must still send `amount: item.amount` (the net) — the server refuses any other figure
   (MON-5-customer-journey.spec.ts:92 refuses 5001). Only the words on screen change.
D. To make A-B testable without a browser, export a small pure view piece from extras.tsx (e.g. `ExtraPrice({pence})` or
   `extraPriceWords(pence)` returning the line and the button words) and use it in the component, as screen.tsx:6 does with PracticePayNowView.
E. screen.tsx: directly under "Amount due …" add one plain line: `This includes VAT at 20%, as shown on your quote and extras.`
   Honest because the only tax policy accepts standard_rate_20 and refuses anything else (tax.ts:13). Keep it free of the words
   fee, catch, surcharge, button, href, form (screen.test.tsx:10 and MON-6-customer-practice-pay-now.spec.ts:83 reject them).

FILES ALLOWED TO CHANGE
apps/web/app/customer/extras/extras.tsx (including the overflowWrap style on its <main>); NEW apps/web/app/customer/extras/extras.test.tsx; apps/web/app/customer/practice-pay-now/screen.tsx;
apps/web/app/customer/practice-pay-now/screen.test.tsx (add cases only); NEW config/lanes/real-customer-extra-vat.json (shape as
config/lanes/final-account-double-click.json, branch codex/sandbox/real-customer-extra-vat, exact changed paths, not itself).
Existing tests that match the old button words, only to change that name to the new total wording (keep every other assertion):
- apps/web/e2e/customer-extra-approval.spec.ts:48 (£50 net -> "Approve revision 1 for £60.00 including VAT");
- apps/web/e2e/MON-5-customer-journey.spec.ts:102 (same £50);
- apps/web/e2e/helpers/j3-customer-approval.ts:33 and apps/web/e2e/helpers/j3-integrity-approval.ts:88 (they build the name from
  signedDeltaPence: compute total = net + net/5 rounded half up, the same rule, inline in the helper, and format the total with the
  same en-GB Intl currency formatter, so amounts of £1,000 and over get the thousands comma the screen shows; toFixed(2) does not).
Any other test that fails only because of the button or price-line words gets the same one-name change; list each in the handoff.
If any other assertion breaks, stop and report it; do not edit it. Nothing else. Leave customer/extra-approvals/ alone (C-1 :102).

FAILING-FIRST TESTS (write and run red on the base before the change; record the red run)
1. NEW apps/web/app/customer/extras/extras.test.tsx (renderToStaticMarkup, like screen.test.tsx:1-4): 14000 -> markup contains
   "£140.00 plus VAT £28.00 · total £168.00" and button words "Approve revision 1 for £168.00 including VAT"; 5000 -> £10.00 / £60.00;
   an odd amount 1234 -> VAT equals candidateM1TaxPolicy.calculateGroup(money(1234),"standard_rate_20") (£2.47), total £14.81;
   −2500 -> "−£25.00 plus VAT −£5.00 · total −£30.00"; 150000 -> "£1,500.00 plus VAT £300.00 · total £1,800.00". Red on base because the
   export does not exist / the words are absent.
2. apps/web/app/customer/practice-pay-now/screen.test.tsx: add one case: the markup contains "This includes VAT at 20%" once, before the
   options list; existing cases unchanged (they must still pass the no-fee/catch/button/href/form check).
3. apps/web/e2e/customer-extra-approval.spec.ts (projects mobile-360 and desktop, real PostgreSQL): with the existing seeded £50 extra, the
   section shows "£50.00 plus VAT £10.00 · total £60.00"; the button "Approve revision 1 for £60.00 including VAT" works; the stored
   approval still has signed_delta_pence "5000" (:50, unchanged); at 360 the page has no sideways scroll (as MON-6 spec :84 checks).

DONE LOOKS LIKE
- [ ] Tests 1-2 red on base, green after; test 3 green at 360 px and desktop on real PostgreSQL.
- [ ] Every priced extra on the customer's extras screen shows net, VAT and total in plain words; the button names the total with "including VAT".
- [ ] The VAT figure comes from candidateM1TaxPolicy (no new rate or rounding code); the approval command still sends the net amount.
- [ ] For the walk's figures the customer now sees quote £1,680 + extra £168 = £1,848, the bill's amount due.
- [ ] The bill screen says the amount includes VAT at 20%; MON-6-customer-practice-pay-now, MON-5-customer-journey, DEMO-J3-shadow,
      DEMO-J3-integrity, SV-5, DEMO-A1-rest and SV-6 still pass (they use the changed helpers; DEMO-A1-rest.spec.ts:6 and
      SV-6.spec.ts:6 import j3-integrity-approval).
- [ ] vitest for both customer test files, tsc for apps/web, pnpm lint:lanes and git diff --check clean.

OUT OF SCOPE
Any change to how VAT is chosen or worked out (BUILD_PLAN.md:278 fixes illustrative 20%; not reopened); the server view or SQL
(identity.customer_variation, 0765:2700-2718); net/VAT/total figures or lines on the bill (needs a new migration replacing
identity.customer_practice_pay_now, which upgrade tests pin by name: migfix-7-upgrade.integration.test.ts:392,
plan-entitlement-lifecycle-upgrade.integration.test.ts:122, lp6d-runtime-classification.json:319; and MON-6 spec :87-89 requires the
catch and non-catch bill replies to be identical, so lines could reveal a Final Check catch); the client-approvals screen; the jargon
("revision", "Content hash"), side margins, the builder's "140 all in" wording; the builder's own screens (job-variations.tsx).

CHECK: RED (money shown to a customer at the moment they agree to pay). One independent check, headless, 2 workers max,
PLAYWRIGHT_SKIP_BROWSER_GC=1: vitest for extras.test.tsx and screen.test.tsx; customer-extra-approval.spec.ts and MON-5-customer-journey at
mobile-360 and desktop on real PostgreSQL; MON-6-customer-practice-pay-now; DEMO-J3-shadow (uses j3-customer-approval); DEMO-J3-integrity,
SV-5, DEMO-A1-rest and SV-6 (use the changed helpers); integrity guard as
usual. "e2e not run" is a HOLD. Confirm the red runs were recorded, the approval POST body is byte-for-byte unchanged in shape and amount,
the diff is screen-and-test only, and nothing outside the allowlist changed.

NO-DUPLICATE NOTE
C-1's verifier checked 09:0x: no open PR, cc-work line, brief or remote branch covers customer VAT or the extras screen (jg-walk-customer.md
:92-93). I re-checked briefs/ at 09:29: no other brief names extras.tsx or practice-pay-now. The plumber walk's later note ("VAT is always
20%") is the builder's tax choice, a different matter. REAL-LOCK-PENDING-EXTRA touches final-account-lock.tsx only; no overlap.
Not verified by me: gh pr list and cc-work list (I did not rerun them); the exact full list of specs that click the extras button beyond the
four named (found by git grep for "Approve revision" and "+£" in apps/web/e2e); whether REAL-FC-HONEST-ZERO (its r2 :98 cites extras.tsx:32 for the heading only, no edit) ends up touching this file. Projects mobile-360/desktop: apps/web/playwright.config.ts:17-18.

HANDOFF LINE
fix(customer): extras show net + VAT = total and the bill says it includes VAT — READY / tested: <commands+results> / not run: <omitted> /
RED: one independent exact-head check with real PostgreSQL browser runs before merge.
LATER NOTES (not for this build)
- Bill page with net/VAT/total figures from the stored invoice: own leaf with a migration and proof; must not reveal catch lines.
- Per-extra VAT can differ by 1p from the bill, which works VAT out on the whole bill (final-account.ts:22); only for amounts not divisible by 5p.

## Plan check
(plancheck-REAL-CUSTOMER-EXTRA-VAT, Opus 5.5 medium, 20 Nov 2026 09:33-09:40 UK. Read-only; origin/main fetched = 228aa98740f64d201b90a61574581b686b73fa2e. Nothing run except reads, one node line for currency formatting, gh pr list, cc-work list.)

Verdict: REPAIR (one blocking, three small). The brief is sound: the right two screens, the smallest change, no VAT decision reopened, approval command unchanged, figures come from the same function the bill uses.

Checked and true at 228aa987: extras.tsx:28 pounds(), :32 price line, :33 button, :22 sends amount:item.amount; customer-variation-approval.ts:14-20 view holds net only; screen.tsx:6-7 "Amount due" only; quote.tsx:26 Intl formatter, :33 Net · VAT · Total; tax.ts:10-15 candidateM1TaxPolicy (half_up, sign kept: rational.ts divideRounded); core index.ts:10, :14 export money and tax; final-account.ts:22 and final-account-lock-repository.ts:121 use it; screen.test.tsx:10 forbidden-words regex; MON-6 spec :83 words check, :84 scroll check, :87-89 identical catch/non-catch replies; MON-5 spec :92 refuses 5001, :102 button; customer-extra-approval.spec.ts:48 button, :50 signed_delta_pence "5000"; j3-customer-approval.ts:33, j3-integrity-approval.ts:88; playwright.config.ts:17-18 projects; final-account-double-click.json shape (excludes itself). Test 1 figures check out (1234 -> 247p VAT, total £14.81; 150000 -> £300 / £1,800). Tests 1-2 are red on base (export and sentence absent). git grep for "Approve revision" and "+£" finds only the four named tests on the customer screen, so the allowlist is complete.

No duplicate: no open PR touches apps/web/app/customer/extras or practice-pay-now (gh pr list, 20 open); no cc-work line or remote branch on customer VAT; REAL-FC-HONEST-ZERO.r2:98 only cites extras.tsx:32, no edit. Overlap to sequence, not a duplicate: REAL-PLAIN-BUTTON-NAMES.r2 also edits apps/web/e2e/MON-5-customer-journey.spec.ts (text swap of "Preview immutable quote", different line) — whichever lands second does a trivial catch-up.

1. BLOCKING — test 3's "no sideways scroll at 360" will very likely fail on base for a reason outside this piece. extras.tsx:29 <main> has no overflowWrap, and the 64-character <code> content hash at :32 does not wrap; the walk saw "long fingerprints are cut off at the right edge" at 360 (jg-walk-customer.md later notes). The MON-6 check passes only because screen.tsx:23 sets overflowWrap:"anywhere". As written, the builder adds the assertion, it fails, and the brief says stop. (Not run by me.)
   FIX: in change B add: "Give the extras <main> style={{overflowWrap:"anywhere"}}, as screen.tsx:23 and customer/extra-approvals/approvals.tsx:69 already do (no margin or layout change)." Keep the scroll assertion.
2. Non-blocking — B says use the en-GB Intl formatter like quote.tsx:26 and also that credits show "−£25.00" with the true minus sign used today (extras.tsx:28). Intl gives "-£25.00" with a hyphen (checked: node, char code 45), so test 1's credit case would not match.
   FIX: in B add: "Format the absolute value with Intl and put "−" (U+2212) in front for negatives, keeping today's sign character."
3. Non-blocking — j3-integrity-approval.ts is also used by DEMO-A1-rest.spec.ts:6 and SV-6.spec.ts:6, which the brief does not name.
   FIX: add DEMO-A1-rest and SV-6 to the Done list and the CHECK list (CHECK also names only DEMO-J3-shadow; add DEMO-J3-integrity and SV-5 there too).
4. Non-blocking — helper totals built with toFixed(2) have no thousands comma; Intl adds one at £1,000 and over. Today's J3 amounts are 30000 and 50000 (DEMO-J3-shadow.spec.ts:163) -> £360.00 / £600.00, so no failure now.
   FIX: in the helper wording say "format the total with the same en-GB Intl currency formatter".

RED is right (money shown to a customer at the moment they agree). Done-looks-like is checkable. Not verified: I ran no tests; the scroll failure in item 1 is inferred from code and the walk note, not reproduced.

## Plan check (r2 re-check)
(plancheck-REAL-CUSTOMER-EXTRA-VAT, Opus 5.5 medium, 20 Nov 2026 ~09:40 UK. Re-check only: were the four round-1 findings fixed, and did anything regress. origin/main still 228aa98740f64d201b90a61574581b686b73fa2e.)

Verdict: READY.
1. Fixed (was blocking): change B now gives the extras <main> style={{overflowWrap:"anywhere"}}, and the allowlist entry for extras.tsx names it. Confirmed the precedent at screen.tsx:23 and customer/extra-approvals/approvals.tsx:69; extras.tsx:29 <main> has no style today.
2. Fixed: B says to format the absolute value with Intl and put U+2212 in front for negatives. node check: "−"+Intl(2500) gives "−£25.00", matching test 1; extras.tsx:28 uses U+2212 today.
3. Fixed: Done and CHECK now name DEMO-J3-integrity, SV-5, DEMO-A1-rest and SV-6. All four spec files exist on main; DEMO-A1-rest.spec.ts:6 and SV-6.spec.ts:6 import j3-integrity-approval.
4. Fixed: the helper wording says to use the same en-GB Intl formatter. The two helper lines (j3-customer-approval.ts:33, j3-integrity-approval.ts:88) are as cited.
No regression: the r2 changes are only these four wording additions, as its change note says. Scope, the RED rating, the unchanged approval command and the VAT decision are as before. Not verified: I ran no tests.

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
