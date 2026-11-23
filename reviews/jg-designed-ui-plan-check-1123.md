# Plan check: JG-DESIGNED-UI-PLAN-1123 (Astra)

**Verdict: REPAIR**

Checker: independent Claude plan check (Opus 5.5, medium), read-only, 23 Nov 2026.
Code read: JobGuard `origin/main` 76e48522bc36eba3ad6a0de3e8bec1d7fbbf03ce (same commit the plan names). Reference read: `~/Downloads/JobGuard_Clickable_Preview.html` (303 KB, dated 16 Oct).

## For Ben (plain English)

1. The plan's direction is right and its list of screens is accurate. Every one of the 81 page routes is covered and the rows I checked are correctly sorted.
2. It misreads one important thing. The new design's Work tab already shows the whole old job page inside it. So the real job is rebuilding the old parts in the new style, and splitting one big nested component so that invoices can move to Money. The plan doesn't name that split.
3. For acceptance, Final Check results, invoices and the paid report, the approved preview only has general placeholder layouts, not finished screens. There is no paid-report screen at all. The plan needs a rule for building these without waiting for you.
4. Pieces 1–4 change parts the live pilot also uses, so the pilot's tests must run on every one of them. The plan only tests the pilot at piece 8.
5. With about ten specific fixes to the plan (listed below), it is buildable. Nothing in it threatens money rules or Tommy's pinned demo if the fixes are followed.

## Findings with evidence

### 1. Inventory: accurate, two omissions
- Route count: 81 `page.tsx` under `apps/web/app` on origin/main. Every one maps to a plan row.
- I checked 14 rows, and all of them were classified correctly:
  - D: `(designed)/page.tsx`, `today`, `jobs`, `jobs/[id]/overview` and `money` render designed components with no `<Legacy>`. In `home-screens.tsx` the only `<Legacy>` uses are in DesignedCheck (DecisionInbox) and DesignedMore (:165).
  - L: `jobs/new` (`jobs-screens.tsx` NewJob wraps WalkIt in `<Legacy>`), `jobs/[id]/work` (WorkTab `<Legacy>` around WorkspaceShell), `money` (MoneyTab `<Legacy>` around ValuePage), `records` (RecordsTab `<Legacy>`), `/check`, `/more`.
  - N: all 23 `jobs/[id]/*` sub-pages listed exist, as do 6 contractor job pages, 6 customer pages plus `extra-approval`, admin, demo-s, practice, plans and meter.
- **Omission A: the `/jobs/[id]?company=` branch.** `jobs/[id]/page.tsx` has a second, server-side path for the company session (CH-4). It re-authenticates, reads the capture server-side and renders `JobWorkState` with a CSRF token, and is used by `e2e/CH-4.spec.ts`. The plan says "retire J" without mentioning it.
- **Omission B: the panels inside WorkspaceShell.** The inventory lists routes only. `ui/workspace-shell.tsx:105-134` renders about 20 panels under the job page: PracticeJourney, JobParties, ProofStage/Watchdog, ReviewProposal, Materials, PurchaseOrder, SupplierDocuments, SupplierMatch, ThingsToCheck, Readiness, RelevanceInbox, CommercialIntegrity, PreventionChecks, RecoveryCases, PracticeReceipts, PracticeFacts, RecoveryAllocations, PaymentFeeStatements, SimulationFeeStatements, plus the trial and recovery links. None of pieces 1–9 says where they end up.

### 2. Job-page target: sound, but the plan's description is wrong and a refactor is missing
- The designed Work tab already hosts the whole old workspace: `(designed)/jobs/[id]/work/page.tsx` renders `<DesignedJob tab="work"><WorkspaceShell/>…`. The own-job journey already runs through it (`e2e/real-own-job-to-paid.spec.ts:79` goes to `/jobs/${jobId}/work#quote`). "Retire /jobs/[id]" is therefore mostly about inbound links. The real work is replacing what sits inside `<Legacy>`.
- **The flows are one nested tree, not separate sections:** WorkspaceShell → ReviewProposal (`ui/review-proposal.tsx`, 74 lines / 18 KB) → QuoteEditor (`ui/quote-editor.tsx`, 350 lines / 52 KB). QuoteEditor holds acceptance (AcceptancePhase), the switch-live panel (:303), JobVariations, ProofStage and JobFinalAccount. JobFinalAccount (`ui/job-final-account.tsx`) renders `{beforeInvoices}` (FinalCheckReveal, injected from workspace-shell.tsx:114), then `<CustomerInvoices finalAccount={account}/>` and `<FinalAccountLock/>`.
- Moving invoices and payments to Money therefore means pulling `CustomerInvoices` (which contains `CustomerReceipts`) out of JobFinalAccount. Money then needs its own load of `/api/jobs/[id]/final-account`, and the lock and FinalCheckReveal order must stay intact in Work. This can be done by reusing the same components and commands. Nothing is server-only: they are all client components using `jobPageFetch`. The plan has to name it as the core of piece 4.
- **Navigation by `#anchor`:** WorkspaceShell routes and focuses on `#scope #quote #work-proof #variations-title #final-account-title #final-check #practice-tools #job-diary #customer-messages #variation-<uuid> #invoice-<uuid>` (workspace-shell.tsx:66-94). Overview already sends people to `/work#final-account-title` and `/work#variation-<id>`. Once invoices live in Money, `#invoice-<id>` (5 spec uses) and the in-page links need a defined new target.
- A server redirect from `/jobs/[id]` loses the `#` part, so any redirect has to run in the browser.
- **Same-page refresh:** `jobPageFetch` sends a `job-saved` event within one window (`ui/job-page-fetch.ts`). Panels on separate tab routes reload when you navigate, which is fine. Panels that stay on one page must keep listening.
- **Session rule on Money:** `(designed)/jobs/[id]/money/page.tsx` hides `ValuePage` for a company-session user who has no practice session. Invoices moved into Money must get an explicit decision, and a test, for that session type.
- 16 non-test app files link to bare `/jobs/<id>`, for example `demo-s/shadow-30000/journey.tsx:21,31` (`#final-check`), `demo-s/core-1000/journey.tsx:75`, `ui/recovery-journey.tsx:166` (`#simulation-fee-statements`), the WalkIt default `reviewHref` (`ui/jobguard-app.tsx:91`), `practice-company/walkthrough/voice-journey.tsx:420`, and the back links in dunning, notice-fixtures, supplier-lines, import-v3, first-job-trial and the reconciliation report.

### 3. The clickable reference: what it actually contains
The reference has 143 named views in 14 groups (`catalog.groups`) plus 15 interface states. It says of itself: "Core journeys have interactive screens; remaining views are labelled layout specimens". Specimens come from `renderSpecBody`, which has one generic body per group, not one per screen.

Builder screens that have an interactive companion (the `dedicated` map in `renderSpec`):
- **Quotes** (`renderQuotes`): an editable scope note, "Simulate quote send" and a customer block. Pricing (v079) and acceptance (v081) are only "Explore … design" links to generic specimens.
- **Supplies** (`renderSupplies`): ordered/received/invoiced discrepancy.
- **Final account** (`renderFinal`): "Complete the final account", "Explore the locked-account scenario", "Show a prepared completed example", and one illustrative finding.
- **Money** (`renderMoney`): only an empty state ("No connected invoice data") plus a JobGuard account card.

Generic specimens only, with no screen-specific design:
- v075/v076 quote-from-notes and scope review (both mapped to the Quotes companion), v079 Quote pricing, v081 Quote response and acceptance, v082 Start an active job, v085 Builder-logged extras, v086 Work proof
- v098 Final Check running/incomplete, v099 results, v100 review a missing item
- v101 final invoice, v102 invoice and payment record, v103 value/fee, v105 credits and reversals

**No paid-report screen exists.** The plan's line "Reference covers quote, capture, final account, money and review patterns" overstates the money side. It is also accurate to say pieces 2–4 have no screen-level reference beyond the Final account companion.

**Tab naming:** the reference's builder navigation is Today, Jobs, Quotes, Money, Supplies, and its job view is a single job panel. The rebuild uses Today, Jobs, To check, Money, More (`designed-ui.tsx:34`) and job tabs Overview/Work/Money/Records (`jobs-screens.tsx`). The plan's mismatch note is correct.

### 4. Test strategy: workable with conditions
- There are 198 `*.spec.ts`. 57 of them `goto` a bare `/jobs/${…}`, and 79 files in e2e (specs, .mts and helpers) reference it. 10 specs already use the designed tab routes. 19 rely on old test ids (`workspace-job-id`, `captured-job-workspace`, `job-revision`, `accepted-net`).
- Anchor uses in e2e: #quote 36, #final-account-title 23, #final-check 16, #work-proof 11, #variation- 10, #job-diary 7, #invoice- 5, #simulation-fee-statements 4, #variations-title 3.
- Shared helpers carry the risk:
  - `helpers/capture-journey.ts` starts at `/classic` and is used by 67 files.
  - `helpers/v1-sample-job.ts` (18 files) goes to `/jobs/${id}`.
  - `helpers/final-account-lock-journey.ts:21` (13 files) goes to `/jobs/${id}#final-account-title`.
  - `helpers/customer-invoice-journey.ts` (25 files) is API-only and safe.
- Selectors are mostly role and name based, for example "Check the work items", "Make my draft", "Price the work" and "Save customer and site". That makes "duplicate, then repoint" practical, as long as designed controls keep the same accessible names and headings, or the copies drift away from the originals.
- Helpers must get designed copies (for example `openCaptureDesigned`) and must not be changed in place, or 67 specs move at once.
- Hidden-state and no-early-disclosure checks that must keep holding: `SV-3..7A` (5), `real-fc-*` (5), `real-lock-pending-extra`, and the FinalCheckReveal placement between account and invoices. 128 specs carry absence assertions such as `toHaveCount(0)` or `toBeHidden`. Every duplicated spec has to keep them.
- 360px coverage already exists in `UI-DESIGN-JOBS`, `real-own-job-to-paid`, `real-discard-draft`, `ENT-3-priced-journey` and others, so it is reusable.

### 5. Sequencing and sizing
- **Piece 1 is too big.** It covers capture plus scope review plus pricing plus quote preview and send, which means rebuilding most of WalkIt, ReviewProposal and the 52 KB QuoteEditor. Split it into 1a (capture → scope review → customer/site) and 1b (pricing → preview → send).
- Pieces 1 and 2 both edit `quote-editor.tsx` (acceptance and the switch-live panel live there), so they must run strictly in order. Piece 4 depends on piece 3's handling of JobFinalAccount. The order 1→2→3→4 is right.
- **Pilot dependency missed.** PilotJobs uses the same shared parts: WalkIt, ReviewProposal/QuoteEditor through the `pilotFetch` and `pilotProfile` props (`pilot-jobs.tsx:8-12`), and FinalCheckReveal (`pilot-final-account.tsx:7`). Pieces 1–4 therefore change the pilot UI while pilot G1 is under way. Pieces 1–4 must run `e2e/pilot-04a.*` and the 8 pilot specs, and keep the pilot props.
- **CSS scoping.** Taking a component out of `<Legacy>` turns on the generated `design.css` rules, which all carry `:not(.jgd-legacy *)` (`tools/scope-reference-css.mjs`, `LEGACY` constant). The old global workspace CSS still applies at the same time. Builders should not hand-edit `design.css`, because it is regenerated by the tool. Put new rules in `design-fit.css` or `design-tools.css` and check for leftover old styles at 360px.
- **Hosted demo.** `ea10154b` is an ancestor of main, 115 commits behind. Deploys go through the three scripts guarded by `DEMO-PIN.txt` (AGENT_CHOICES 21 Nov 06:20). `vercel.json` has no `git.deploymentEnabled:false`, and I could not confirm whether Vercel's GitHub auto-deploy is off. Confirm it before merging piece 1 before Tuesday.
- The demo-s guides (WALK-1 starts at `/demo-s/core-1000`) link to bare `/jobs/<id>`. Keeping that route working is required, not optional.

### 6. Risks
- **Money:** when invoices move out of JobFinalAccount, the issue command must keep its `finalAccountRevisionId`, `expectedSourceHash` and lock inputs. `real-own-job-to-paid` (:103-161) already pins stale-hash, replay, duplicate and foreign-tenant refusals and an unchanged lock. Keep that spec running unchanged as the guard.
- **Permission:** the company-only Money rule (finding 2), and the CH-4 `?company=` branch, which must not be redirected into a designed tab that assumes a practice session.
- **CI:** repointing shared helpers in place would move 67+ specs at once. Duplicate them instead.
- **Disclosure:** reordering FinalCheckReveal relative to the lock or invoices could reveal results early. SV and real-fc specs guard this only if they are duplicated against the new screens.

## Exact repairs to the plan
1. **Rewrite the J row and the pieces 2–4 targets.** Say that the designed Work tab already hosts WorkspaceShell, and name the component tree. Make piece 4 explicitly extract `CustomerInvoices`/`CustomerReceipts` from `JobFinalAccount` into Money, with its own final-account load. FinalCheckReveal and FinalAccountLock stay in Work, in their current order.
2. **Add an anchor map** from each old `#anchor` (the 11 above) to its new route and anchor. Make `/jobs/[id]` (no `?company`) redirect in the browser to the mapped tab with the `#` preserved, and keep the old page reachable.
3. **Add the `/jobs/[id]?company=` CH-4 server branch** to the inventory as "keep as is", with CH-4.spec unchanged.
4. **Add a panel table** that assigns each of the ~20 WorkspaceShell panels to a piece, or to "stays inside Legacy under Practice tools in Work until piece 9".
5. **Replace "Reference covers … money"** with the true coverage from finding 3. Add a build rule for the gaps, in line with Ben's yes-to-everything rule:
   - compose from the reference design kit (Card, DescriptionList, Metric, Money, Notice, Evidence, Progress, Modal) and the 15 interface states;
   - log the choice in AGENT_CHOICES.md;
   - don't wait on Ben.
   Keep only public wording and claims on Ben's list.
6. **Split piece 1** into 1a (capture → scope review → customer/site) and 1b (pricing → preview → send). State that 1a→1b→2→3→4 run strictly in order.
7. **For pieces 1–4, require** `pilot-04a` and the pilot specs to pass, the `pilotFetch`/`pilotProfile` props to be preserved, and G1 behaviour to be unchanged.
8. **Test rule:**
   - make designed copies of `capture-journey`, `v1-sample-job` and `final-account-lock-journey` rather than editing them;
   - keep accessible names and headings used by selectors stable;
   - list SV-3..7A, real-fc-*, real-lock-pending-extra and the money-refusal block of real-own-job-to-paid as must-keep;
   - keep real-own-job-to-paid running unchanged throughout.
9. **CSS rule:** don't hand-edit `design.css` (it is generated by `tools/scope-reference-css.mjs`). Put new styles in `design-fit.css`/`design-tools.css`, and check old-style bleed at 360px when a component leaves `<Legacy>`.
10. **Money and permission rule:** state how company-only sessions see invoices in Money, and add a test. Before the first merge to main ahead of 24 Nov, confirm that Vercel's GitHub auto-deploy is off. Keep the demo-s links to `/jobs/<id>` working.
