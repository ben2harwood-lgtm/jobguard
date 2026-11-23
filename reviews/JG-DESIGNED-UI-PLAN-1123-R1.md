Make the designed screens the normal route through every JobGuard journey, including the working forms inside them.  
Finish one own-job journey from quote to paid report first; follow with Northside, customer portal, pilot and remaining tools.  
Reuse existing backend commands and safeguards; changing the appearance must not change financial or permission rules.  
Keep the hosted demo pinned at `ea10154b` through Tommy’s meeting on Tuesday 24 November; the first pieces include no redeployment.  
This is a read-only plan against locally recorded `origin/main` (`76e48522`); no files changed or tests run.

**Inventory**

D = already designed; L = designed shell with Legacy insides; N = not designed. These are source classifications, not visual acceptance. Paths below are grouped exhaustively; `{…}` lists alternatives, and `*` includes descendants. `J` means `/jobs/[id]`.

The clickable reference contains interactive journeys **and generic specimens**. Its Quotes/Supplies navigation also differs from the rebuilt tabs: the mapping below is proposed, not proof of visual equivalence.

| Journey and current routes | Now | Target and reference coverage |
|---|---|---|
| `/`, `/today`, `/jobs`, `J/overview`, `/money` | D | Today, Jobs, Overview and Money; compare with business-home, jobs and money companions. |
| `/jobs/new`, `J/{work,money,records}`, `/check`, `/more` | L | Keep destinations; replace embedded forms with designed controls. Reference covers quote, capture, final account, money and review patterns. |
| `J` | N; pilot partial | Retire from main navigation. Quote → acceptance → extras → Final Check in Work; invoice → payment → paid report in Money; evidence in Records. |
| `J/{recovery-journey,shadow-journey,value,trial}` | N | Money/Work, with source records linked. Recovery/value/trial have specimens, not complete dedicated designs. |
| `J/{dunning,direct-debit-practice,interim-drafts,retention-records}`, `J/invoices/[invoiceId]/pay-now-preview`, `J/reconciliation/*`, `J/recovery-cases/*` | N | Money detail views. Detailed recovery, reconciliation and payment states need design completion. |
| `J/{imports,evidence-holds,supplier-lines,merchant-reliability,rate-suggestions,recurring-extras,signal-to-noise,cis-fixtures,vat-fixtures,notice-fixtures}` | N | Work for operational actions; Records for evidence; Money for financial review. Supplies companion exists; specialist controls are mostly specimens or gaps. |
| `/northside` | N | Contractor overview and work-order register; reference has contractor role journeys, but no dedicated 2,000-order practice-hub design. |
| `/contractor/{dashboard,work-orders,work-orders/[workOrderId],statements,connector-promotions}` | N | Overview, Work orders, Statements, Setup. Contractor companions exist; connector promotion needs detailed design. |
| `/contractor/jobs/[id]/{billing,bundle-check,completion-observations,materials-issues,office-signals,possible-extras}` | N | Work-order detail, review, supplies and billing; use role-specific reference patterns. |
| `/site/extra`, `/approvals/extras` | N | Log an extra and Review queue; interactive reference coverage. |
| `/customer/{sign-in,quote,extras,extra-approvals,jobs/[jobId],practice-pay-now}`, `/extra-approval/[jobId]/[requestId]` | N | Separate customer request/document experience. Customer catalogue exists; complete portal screens are not designed. |
| Pilot branches of `/jobs`, `/jobs/new`, `J`, `J/{overview,work,money,records}` | Partial/L | Same designed navigation with pilot-authorised capabilities. Today’s tabs collapse into `PilotJobs`; no complete pilot-specific reference. |
| `/sign-in`, `/firm-details`, `/plans/*`, `/meter`, `/meter/jobs/[id]/imports` | N | Sign-in/onboarding; More → settings, plans and capacity. Mostly specimens, requiring detailed states. |
| `/value`, `/accounting-exports/[sourceId]`, `/things-to-check-report`, `/supplier-fixtures` | N | Money, Records, Check and Work respectively; report/fixture detail gaps remain. |
| `/admin/contractor/{identity,audit-exports}`, `/admin/contractor` | N | Restricted administration; never ordinary customer navigation. Reference provides internal/setup specimens. |
| `/classic`, `/demo-s/*`, `/practice/[id]`, `/practice-bank`, `/practice-company`, `/practice-company/walkthrough` | N | Practice entry under More, leading into designed journeys. Bespoke chooser/walkthrough designs are missing. |

Keep every old URL reachable during migration; remove obsolete main-path links only after equivalent journeys pass. Archive rather than delete files.

**Numbered pieces — one PR each, in dependency order**

File paths below are relative to `apps/web/app`; tests live in `apps/web/e2e`.

1. **Capture and quote.** Scope: new job, scope review, pricing and quote preview/send. Files: `(designed)/jobs-screens.tsx`, `jobs/new/page.tsx`, relevant `ui/jobguard-app` and review components. Done when a fresh fictional job reaches a saved quote entirely through designed controls. Duplicate applicable `WALK-*`, `review-confirm` and own-job assertions first.

2. **Acceptance, live job and extras.** Files: designed Work/Overview, `ui/workspace-shell.tsx` and its acceptance/variation components. Done when exact quote acceptance, separate switch-live, evidence and approved extras preserve one job identity. Move `switch-live`, `variations`, approval-error and stale-revision scenarios.

3. **Final Check.** Files: Work and existing final-account/check components. Done when declaration, lock, incomplete processing, results and confirmed catches use designed screens without early disclosure. Move `SV-*`, `real-lock-pending-extra` and `real-fc-*` coverage; preserve double-click and hidden-state assertions.

4. **Invoice through paid report.** Files: designed Money/Records, invoice/receipt components, `ui/job-value.tsx`, `ui/mapped-value-receipt.tsx`. Done when issue, partial payment, payment evidence, reversals and paid report agree with authoritative facts. Duplicate `real-own-job-to-paid`, `real-found-extra-to-paid`, receipt-balance and customer-invoice tests. Complete the uninterrupted own-job journey here.

5. **Northside work and approvals.** Files: `northside/page.tsx`, NorthsideHub, contractor work-order pages, site capture and approvals. Done when the 2,000-order practice supports search, detail, capture and role-specific decisions in designed screens. Move relevant `ENT-1/2/3/5` and Tommy scenarios.

6. **Northside billing and settlement.** Files: contractor billing, statements and dashboard components. Done when export → billed → part-paid → paid → statement → dashboard passes. Move `ENT-11b*`, preserving totals, origins and approval-chain checks.

7. **Customer portal.** Files: customer and extra-approval routes/components. Done when approved portal designs cover exact requests, acceptance, extras, invoices and expired links without internal-data leakage. Move `MON-5/6`, `customer-*` and recipient-isolation tests.

8. **Pilot presentation.** Files: `pilot-jobs.tsx`, `pilot-job-continuation.tsx`, `pilot-final-account.tsx`, designed route branches. Done when tabs remain distinct and supported flows match the design with G1 unchanged. Extend pilot/session tests across owner, read-only, revoked and unavailable states.

9. **Remaining screens.** Issue separate bounded PRs for sign-in/onboarding, settings/plans, specialist tools, administration and practice navigation. Each names its inventory rows, route/component files and corresponding existing specs; done means approved designs and unchanged behaviour, not merely a surrounding shell.

Every piece carries functional and visual checks at **360px and desktop**, comparing matching reference states: navigation, typography, spacing, forms, overflow, focus and errors. Duplicate existing journey specs before repointing; preserve every assertion and retire old coverage only after designed equivalents pass. Run required CI and independent reviews; screenshots cannot prove backend correctness.

Follow the full simplicity rule: reuse commands and components, avoid a parallel application, preserve all safety guards. This UI work is go-to-market work now.

**Needs Ben**

Confirm the tab-to-reference mapping and approve detailed designs where only specimens exist—especially portal, pilot, specialist financial screens and paid reports. Approve public claims and commercial wording separately. Deployment remains a later, explicit decision after Tommy’s meeting.
---

## Repair addendum R1 (coordinator, 23 Nov 2026) — binding on every piece

Source: independent Opus plan check, coordinator/prechecks/jg-designed-ui-plan-check-1123.md (verdict REPAIR, origin/main 76e48522). Where this addendum and the plan above disagree, this addendum wins.

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

Resulting order: 1a, 1b, 2, 3, 4 strictly in sequence; then 5–9. No merge to main before Tue 24 Nov meeting unless Vercel GitHub auto-deploy is confirmed off.
