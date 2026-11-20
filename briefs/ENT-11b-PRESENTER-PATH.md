# ENT-11b-PRESENTER-PATH: build brief (JobGuard, NOPR, not RED; written 20 Nov 2026 ~09:20 UK by Opus 5.5 helper)

Base: JobGuard origin/main 228aa98740f64d201b90a61574581b686b73fa2e (fetched 09:13). Line numbers are at that commit.
Source: coordinator/burn-2026-11-20/jg-walk-northside.md (NS-1, NS-2, NS-3, independently confirmed); BUILD_PLAN.md:1105-1120.

PROBLEM
1. The automated Northside run passes, but a person can't finish it by hand. Ben's recorded rehearsal is the last ENT-11b gate
   (BUILD_PLAN.md:1113), and the walk hit three stops. The test gets past each one by reading IDs from the database (ENT-11b.spec.ts:161-162, :171-188, :404-405).
2. Stops: the hub finance link (northside-hub.tsx:72) opens the newest 200 of 2,000 orders with no search, and NS-1-0001 is not among them
   (work-order-repository.ts:330). Billed, part-paid and paid need hand-written billing-status.v1 JSON full of hidden IDs (contractor-billing.tsx:124-127).
   The baseline import needs two team IDs that are never shown (enterprise-dashboard.tsx:115).

PLAN CHECK: the plan is silent on demo helpers. Precedent: "Load fictional Northside baseline sample" (enterprise-dashboard.tsx:113) and "Simulate invoice
(practice)" (ENT-11b.spec.ts:251). The fill buttons stand in for the fictional client's own billing system; all these screens run on syntheticPool only.

SMALLEST CHANGE (no migration, no SQL routine, no new route, no change to any command, rule or money calculation)
A. packages/db/src/northside-run.ts: one function northsideJourneyTargets(pool, member, context), placed beside northsideSwitchTargets (:27). It reads,
   under withTenant, the named journey order (app.work_order where reference='NS-1-0001': id, job_id, reference) and
   `SELECT id,name FROM app.team WHERE tenant_id=$1 ORDER BY id LIMIT 2`. These are the same two teams the spec binds (:404).
   It returns { journeyOrder | null, practiceTeams }. It's already exported through packages/db/src/index.ts:123.
B. apps/web/app/api/northside/route.ts GET (:13-20): add `journey: run && (role==="owner"||role==="finance") ? await northsideJourneyTargets(...) : null`.
   Every other field stays unchanged.
C. apps/web/app/northside/northside-hub.tsx:72: when summary.journey?.journeyOrder exists, link
   "Finance: open work order NS-1-0001 and its billing" to /contractor/work-orders/<workOrderId>. That's the same page the spec opens at :162, and the
   presenter then presses the existing "Billing and reconciliation" link. Otherwise keep today's list link.
D. apps/web/app/ui/contractor-billing.tsx: ContractorBilling fetches /api/northside once and passes practice={body.seeded===true} to BillingView.
   BillingView gets an optional practice prop (static renders unchanged). With practice, send, exactly one export line and whole-penny VAT, it shows
   "Fill practice invoice", "Fill practice part payment", "Fill practice balance payment".
   Each only sets format "json" and the Status data text; the presenter still presses "Import status". One exported pure function
   practiceBillingEvents(view, step) builds the events, copying spec :177-184, :219 and :224 exactly:
   version billing-status.v1, source northside-fictional, invoice NS-INVOICE-1, the fixed 2026-10-02/03/04 dates, reconciliationId northside-part or
   northside-balance, a fictional original_order line of 100000 net plus the extra line at its approvedNet.pence, the match copied from the export line,
   clientContractId view.clientContractIds[0]. Parse the needed line fields with zod; read nothing else.
E. apps/web/app/ui/enterprise-dashboard.tsx:115: make the bindings textarea controlled, the way baselineContent is (:69, :112).
   EnterpriseDashboard fetches /api/northside once on mount. When it gets two or more practiceTeams, add a "Use two practice teams" button beside :113.
   It fills `fictional-pilot=<team1 id>\nfictional-rest=<team2 id>` and shows both team names. Pilot/rest inputs stay (their words are on screen, :114).

FILES ALLOWED TO CHANGE
The five files in A-E. Added cases only in apps/web/app/ui/contractor-billing.test.tsx, apps/web/app/ui/enterprise-dashboard.test.tsx,
apps/web/app/api/northside/route.test.ts and apps/web/app/api/northside/routes.test.ts.
Both route test files mock "@jobguard/db" with a fixed list (route.test.ts:5-10, routes.test.ts:15-22). Add one northsideJourneyTargets mock entry to
each, or every GET in them returns 503. Change no existing expectation.
Also allowed: NEW apps/web/e2e/ENT-11b-presenter.spec.ts and NEW config/lanes/ent-11b-presenter-path.json (exact changed paths, not itself).
In docs/operations/contractor-full-demo-package.md:26 you may change only the import sentence, to name the three fill buttons.
Nothing else. ENT-11b.spec.ts stays byte-for-byte unchanged. If another existing assertion breaks, stop and report it. Do not edit it.

FAILING-FIRST TEST (write it and run it red on the base before A-E; record the red run)
apps/web/e2e/ENT-11b-presenter.spec.ts, desktop project, at 360 and 1280. Copy the start of ENT-11b.spec.ts:18-27 and its role switch helper (:43-48).
It may navigate only by page.goto("/northside") and the on-screen client link href. It may read no IDs from the database and make no
page.request/fetch calls. It must find and press the hub finance link, "Billing and reconciliation", export, approve delivery, the three fill
buttons, each followed by "Import status", the statement steps, the dashboard, "Load fictional Northside baseline sample", "Use two practice teams",
typed fictional-pilot/fictional-rest, compare, and download.
Expected on-screen figures (oracle tools/money-check.mjs:62-85): export £1,080.00; invoice £2,080.00 Billed; part-paid £1,040.00;
Paid £2,080.00; statement delta £108.00; dashboard billed and paid £1,080.00.
It must finish in under 600000 ms. On the base it fails at the hub step, because NS-1-0001 isn't on the list.
Units: practiceBillingEvents produces the spec's three events and refuses anything other than exactly one export line. The route returns journey
to owner and finance only, and null for operative, surveyor, supervisor and client_approver. The dashboard binding text uses the two given teams in order.

DONE LOOKS LIKE
- [ ] The new spec is red on base and green after, at both widths, on real PostgreSQL. It also passes a grep check: no Pool, no db.query,
      no page.request, and no page.goto other than /northside and the client href.
- [ ] ENT-11b.spec.ts is unchanged and still passes at both widths. ENT-11a.spec.ts still passes.
- [ ] A presenter goes from "Start Northside practice" to the downloaded baseline only by pressing on-screen controls and typing visible words or
      dates. The figures match the automated run.
- [ ] Outside a seeded Northside run, the billing and dashboard screens show no fill or team buttons. The hub without journey keeps its list link.
- [ ] Unit suites for contractor-billing, enterprise-dashboard and both northside route files pass, along with apps/web tsc, pnpm lint:lanes and
      git diff --check.

OUT OF SCOPE
Work-order search or sorting; links from extra-approval cards; any server-side billing generator, import-command change or new route; hosted demo,
voice and Ben's recording (his). Walk later notes stay later: phone table scroll, raw IDs/hashes, identical cohorts, fractions, empty dates,
underscored role names, home-page link to /northside.

CHECK: not RED. This adds no migration, money rule, authority or command change, and the new read is tenant-scoped and limited to owner and finance on
a practice-only route. One independent check that must RUN, headless, 2 workers max, PLAYWRIGHT_SKIP_BROWSER_GC=1, on real PostgreSQL: the new
spec and ENT-11b.spec.ts at both widths, ENT-11a.spec.ts, and the four unit files above. The check must also confirm the red run was recorded, the allowlist was kept, and the integrity guard was run as usual. "e2e not run" is a HOLD.

NO-DUPLICATE NOTE
cc-work list: ENT-11b only "held, needs Ben's recorded rehearsal" (15 Nov), no presenter line. AGENT_CHOICES.md tail: no Northside entry.
astra-replies: only jg-ent11b-sales-pack.md (sales bible, merged per jg-finish-recount.md:13). burn-2026-11-20: jg-walk-northside.md is the source;
no ENT-11b brief in briefs/. Open PRs #857-#847, #708, #489, #342, #341, #284, #274, #273, #235, #206, #196, #69 and branch coordinator/briefs-1120:
a name-only diff of the main ones (#857, #847, #708, #274, #235, briefs-1120) touches no northside, contractor-billing, enterprise-dashboard or ENT-11b file.

NOT VERIFIED
That finance can open /contractor/work-orders/<id> (the spec does it as finance at :160-162, so likely); that the runtime role may SELECT app.team
under withTenant (if not, stop and report; add no grants); a human timing.

HANDOFF LINE
fix(northside): a presenter can run the full Northside demo from on-screen controls. READY / tested: <commands+results> / not run: <omitted>
/ one independent check that runs both ENT-11b specs on real PostgreSQL before merge.

## Plan check (independent, Opus 5.5 medium, 20 Nov 2026 ~09:25 UK, origin/main 228aa98740f6)

Verdict: READY. No blocking problems; five small fixes the builder should fold in.

Checked and true at 228aa987: northside-hub.tsx:72 links to the plain list; contractor-billing.tsx:123-127 has only the free-text box and file picker; enterprise-dashboard.tsx:69/112/113/115 as described (bindings textarea uncontrolled); route.ts GET :12-21; northsideSwitchTargets at northside-run.ts:27; index.ts:123 is `export * from "./northside-run.js"`; route.test.ts:5-10 and routes.test.ts:15-22 mock @jobguard/db with fixed lists (a missing export throws, then 503), and routes.test.ts:173 calls GET as owner; spec lines :18-27, :43-48, :161-162, :171-190, :219, :224, :404-405 match. Export lines carry approvedNet.pence and the six match fields (packages/core/src/contractor-billing.ts:22-23, :164-189). Oracle tools/money-check.mjs:62-85 gives exportNet 108000, invoiceNet 208000, dashboard 108000, statement fee 10800. The statement screen needs only the month (enterprise-statement.tsx:62), so there is no fourth hidden-ID stop. Runtime code already reads app.team under withTenant (contractor-repository.ts:129, work-order-repository.ts:367). /api/northside only works in synthetic_demo (northside-server.ts:19). The new spec gets picked up with no registry entry (playwright.config.ts testDir ./e2e). A new lane file may list itself (agent-lane-boundary-lint.mjs lanePathAllowed). Nothing in the integrity-guard baselines names these files. Not RED is right. No overlap: no open PR or recent branch touches these files, cc-work has ENT-11b only as held for Ben, and AGENT_CHOICES has no entry. BUILD_PLAN.md:1105-1120 says nothing about demo helpers, and the "Simulate invoice (practice)" button and the sample-load button are precedent. Nothing Ben or Astra ruled is reopened.

Fixes (none blocking):
1. Failing-first reason. If the new spec looks for the new link wording, on base it fails with "link not found", not because NS-1-0001 is missing. Fix: press the first hub link whose name starts with "Finance:" and links to work orders, then expect a "Billing and reconciliation" link. On base it then fails on the list page, which has no such link and no NS-1-0001 row. Record that failure.
2. ENT-9.spec.ts:40 also fills the bindings textarea that step E makes controlled. Add ENT-9.spec.ts to the builder's and checker's regression runs.
3. ENT-11b.spec.ts uses `page.getByRole("status")` in strict mode (:168, :189, :407). Any new team-name or fill text must not carry role="status" or role="alert", or the unchanged spec breaks.
4. practiceBillingEvents: use fixed sourceEventIds made from the export line ID and the step (e.g. `northside-part-<exportLineId>`), not crypto.randomUUID. A presenter who presses a fill button twice then gets a replay, not a second payment, and the unit test can compare exact events.
5. The unit test "binding text uses the two teams in order" needs an exported pure helper (e.g. practiceTeamBindings(teams)). enterprise-dashboard.test.tsx only does static renders and cannot press buttons.
Later note only: docs/operations/contractor-full-demo-package.md:28 still says finance must type an agreement ID. The screen no longer asks for one.
Builder hint: jg-walk-northside/ already holds walkns-presenter.spec.ts, an on-screen-only path, as a starting point.
Not verified: no test run; finance opening /contractor/work-orders/<id> (the spec does it at :160-162); a human timing.

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
