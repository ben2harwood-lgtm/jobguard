# Q26 · V2-SX revision 5: who is refused on V2, on a fixed list of routes

> **Revision 5 (planner, 25 Nov 16:15 UK; planner miss in revision 4).** Revision 4 asked for "every builder route", which a scan of `app/api` can't do:
> - 161 method and path pairs come up, most of them main-only routes with no V2 fixture. An empty body gets a 400 before the job check (for example `retention-record.application.ts` lines 19 to 32), and a random id gets a 404. Neither proves anything.
> - `/api/v2-backend/*` is a Next **rewrite** (`apps/web/next.config.mjs` lines 1 to 13), not a `route.ts`.
>
> **This section replaces revision 4's "What to build" items 1 and 2.** Revision 4's decision, cases (a) to (f), items 3 and 4, and its dependencies all still stand. **Round count:** this resumes the held round 1 of 3. The kept uncommitted draft may be reused.

## Plan-check conditions (frm-management-layer#3 comment 7167278263, GO WITH CONDITIONS; folded in by planner 16:55 UK; these override the text above)
1. **Case (b)** sends two values: `fictional-invalid`, and a well-formed UUID v4 that was never issued. The UUID one reaches the real session check (`apps/web/app/lib/synthetic-server.ts` line 13 checks the format only). If that value gets a 5xx, it fails closed but isn't typed: record it as a finding, and don't loosen the typed rule.
2. **Case (c)** reuses the **old `jg_session` value** after signout. If it still gets 200, that's a session defect under rule 24: **stop and report**, and don't change the test.
3. **Typed codes** are `UNAUTHENTICATED`, `TENANT_FORBIDDEN`, `FORBIDDEN` (from `practiceFailure`, line 60) and `NOT_FOUND`. List the code you saw for each route and case in the PR body. Route 1's `jobs: []` counts as refused only in case (d); cases (a) to (c) expect a typed 401.
   - **Planner ruling, 25 Nov 17:55 UK (check comment 7170063113 on #965 @ 47937bbe): Nest routes (route 9, and any later Nest route in `builderGetRoutes`) in case d-real.** Nest's `ApplicationAuthGuard` checks CSRF before the business gate (`application-auth.guard.ts` line 31, `identity.application.ts` line 33). So d-real on a Nest route runs **twice**:
     - **(i)** with no `x-csrf-token`: expects exactly 403 `ORIGIN_FORBIDDEN`. This proves the CSRF gate fails closed.
     - **(ii)** with the second firm's own CSRF token from its real sign-in: expects exactly 403 `SYNTHETIC_WORKFLOW_ONLY`. This proves the business gate itself refuses, not just CSRF.
     Both are added to the typed list **for Nest transport only**, and each is required at its own step. Web routes keep the four codes above. Body has no job data (£, pence and the job id checks still apply). This is test-only. No product code changes.
4. **The positive controls for routes 2, 6 and 9 aren't in the seed test today.** If any of them isn't 200 with the expected body, **stop at round 1 and report it as a planner miss**. Don't drop the route quietly.
5. **Export `builderGetRoutes`** from `tools/v2/test/refusals.mjs`, starting with routes 1 to 10. The last test signs out once and runs case (c) over every route in the list. After it runs, the helper marks the cached `builder` entry revoked, so a later `signIn("builder")` throws a clear error. Rule 29 in `01-RULES.md` tells later pieces to append their routes here.
6. Conditions 1 to 3 and 5 of the revision 4 verdict still stand:
   - case (d) uses both contexts;
   - case (e) passes the capability value as `jg_session`;
   - the no-leak check covers £ and pence values;
   - the pilot-gate item.

## Routes, fixed list (each one already reads the seeded job with a valid fixture in `tools/v2/seed.integration.test.mjs` lines 104 to 133; GET only)
Next routes, through the web origin. `jobId` is the seeded job.
1. `GET /api/jobs?tenantId=<DEMO_TENANT_ID>` (line 79). Refused means `jobs` is `[]`, not an error.
2. `GET /api/jobs/<jobId>`
3. `GET /api/jobs/<jobId>/proposal`
4. `GET /api/jobs/<jobId>/parties`
5. `GET /api/jobs/<jobId>/materials`
6. `GET /api/jobs/<jobId>/quotes`
7. `GET /api/jobs/<jobId>/quotes/delivery`
8. `GET /api/jobs/<jobId>/quotes/acceptance`

The V2 API (Nest), called **directly** at `settings.NEXT_PUBLIC_API_URL` (plain mode, `http://127.0.0.1:3401`, `tools/v2/settings.mjs` lines 11 and 36):

9. `GET /jobs/<jobId>`, from `apps/api/src/workspace/workspace.controller.ts` line 9. It reads `jg_session` at line 16 and maps codes to 401, 403 or 404 at line 19.
10. `GET /jobs/<jobId>/fee-illustration`, from `fee-illustration.controller.ts` line 14. **The planner hasn't confirmed** that the seeded job has an illustration source. If the builder's positive control isn't 200, drop route 10, say so in the PR body, and don't fail the test. Routes 1 to 9 are all read by the existing seed test, so they must pass.

**Write routes (POST) are out of SX.** Each writing piece already proves its own refusal with its command's fixture. A shared POST list would need a valid body per route, and that is the trap revision 4 fell into.

## Rule that makes a refusal count (planner, binding)
- **A positive control comes first.** For each route, the builder's own session must get **200 with the expected body** (for example the job id, or `jobs.length === 1`), from the same request helper, path and transport. Without that, the test fails, except for route 10 (see above). A refusal is never counted on a route the builder can't open.
- **A refusal must be typed.** The status is 401, 403 or 404 **and** the JSON `code` is one of `UNAUTHENTICATED`, `TENANT_FORBIDDEN` or `NOT_FOUND`. For route 1, `jobs` is `[]`. A 400, a 5xx, an HTML 404 or a missing body fails.
- **No fields leak.** A refused body contains none of: `jobs[0]`, `title`, `customer`, `email`, `totalPence`, `amount`, `price`, `profit`, `margin`, `finding`.

## The rewrite path (`/api/v2-backend/*`)
The rewrite is a transport, not a boundary: in phone mode it forwards to the same Nest routes 9 and 10 (`next.config.mjs` line 12 to `127.0.0.1:3401`). CI1 runs plain mode (`.github/workflows/ci.yml` lines 160 to 186, `start.mjs` with no phone flag), so the boundary is proven on routes 9 and 10 directly.
- **Also add a phone-mode check** `tools/v2/refusals.phone.test.mjs`, run by Mac lane B. It isn't in CI. First, a positive control that the builder's `GET /api/v2-backend/jobs/<jobId>` returns 200 with the job id, which proves the proxy is there. Then cases (a) to (d) on that path.
- A 404 without that positive control is "proxy missing" and fails the test, never "refused".

## Helper, and BH1
**Don't wait for BH1 (#936, still open at 6edfa7400).**
- Write `tools/v2/test/refusals.mjs` as plain functions that **take** the caller's `request` and `signIn`: `assertBuilderRouteRefuses({ request, signIn, route, expect })`. It doesn't import or create any session helper. It works with the seed test's own `signIn` (lines 41 to 77) today, and with BH1's helper after #936 merges.
- **Don't create `tools/v2/test/session.mjs`.** That file belongs to BH1.

## Cases, and the order that avoids the sign-in rate limit
The rate limit is one code per email per 60 s and at most 10 recent (`apps/api/src/auth/auth-provider.ts` line 83). The seed has exactly two identities (line 137 asserts `identities: 2`), so add **no** new identity.
- **(a) no session:** no cookies.
- **(b) invalid session:** `jg_session=fictional-invalid` plus `jobguard_session=fictional-invalid`.
- **(d) second firm:** the cached `signIn("second-builder")`.
- **(c) signed out:** this goes in **one test placed last in the file**, with the comment `// must stay the last test: it signs the cached builder out`. It takes the cached `signIn("builder")` cookies and runs the positive control first. Then it calls `POST /api/auth/signout` (`apps/web/app/api/auth/signout/route.ts` line 5, which revokes the real session and clears both cookies). Then it **reuses the old cookie values** on routes 2 and 9 and expects a typed refusal.

## Done when (replaces revision 4's)
- Routes 1 to 10 each pass their positive control and cases (a) to (d), in CI1. Three CI runs in a row pass with no 429.
- Lane B's phone-mode file passes three times in a row.
- No file under `packages/db/migrations/` or `tools/v2/migrations/` changes, and no grant, role, policy or `next.config.mjs` change.
- A Claude check on the frozen head, and the plan-check verdict is recorded.

---

## Revision 4 (decision and cases still in force)


> **Revision 4 (planner, 25 Nov 16:35 UK).** This replaces revisions 1 to 3 below, which are kept only as history. The SX builder stopped at both plan-check stop points with no code written (`/mnt/project-files/jobguard-v2/v2-sx-stop-report-2026-11-25.md`). The planner checked its findings line by line against v2/main @ 63f3af5ab, and they hold. **Needs a separate Claude RED plan check before it's called ready.** It changes what the refusal proof means, even though it only adds tests.

**Tier:** T1 (test helper and tests only; no product code, no migration, no grant, no change to any main file). **Builder:** desktop Codex or web Codex. No database is needed before building: the tests are seed tests that CI1 runs, and lane B may run them too. **Base:** `v2/main`. **Branch:** `codex/sandbox/v2-sx`. **PR:** draft into `v2/main`. Rules 1 to 28 apply, with a "Rules met" list in the PR body.

## Why the old design can't work (each point checked by the planner)
1. **Every V2 builder screen and command runs only in the shared practice tenant through a linked practice session.**
   - Capture refuses any other tenant: `apps/api/src/capture/capture.application.ts` line 13 (`requested_tenant_id!==DEMO_TENANT_ID` gives `TENANT_FORBIDDEN`), and `apps/api/src/workspace/workspace.service.ts` line 17 does the same.
   - `DEMO_TENANT_ID` is `11111111-…` (`packages/db/src/demo-seed.ts` line 12).
   - The seed enters it through `enterLinkedPracticeCompany` (`tools/v2/seed.mjs` lines 33 to 57).
   - So a "separate V2 test firm" with its own tenant would be a firm no V2 piece can open. That rules out the stop report's options A and B.
2. **A customer portal session needs a real owner or finance membership in the job's tenant.**
   - `app.customer_portal_issuer` (`0765_lp11_bound_tenant_rls.sql` line 2386) calls `app.bind_request('real',digest,t)` at line 2394 (the function is defined in `0562_lp6a_request_binding.sql` line 104).
   - A builder's real membership is only in their own sign-up tenant (owner row created at `0765` lines 2181 to 2187), never in the shared practice tenant.
   - Giving them one would be a new membership in a tenant both practice firms share. **Rejected:** it would cut across firm isolation.
3. **Crew sign-ins are operative memberships, and main allows those only on the contractor track.**
   - `app.mon8_operative_write_guard` (`0549_contractor_feature_guards.sql` line 779) calls `app.mon8_require_operative_agreement` (line 757) on every operative insert.
   - The invitation path also checks `operative_roles` (`0765` lines 2170 to 2175).
   - **Rejected:** putting the practice tenant on the contractor track would change every practice test, and routing around the guard would weaken a deliberate main rule.
4. **Extra-link customers** (`identity.extra_customer_use`) redeem only contractor extra-approval links. **Out of scope:** V2's F6 has its own link (`app.v2_f6_agree`, #923 migration 2018 line 121).

## Decision
On V2, customers and crew **never get a main sign-in**. They reach V2 only through V2's own capability links, as plan section 3 already says ("My brief: Trade, by link"; "Your choices" and "Your handover pack" are customer pages). The links are F6's agreement link, E2's reply token, K3's local inbox, and later My brief (F7), K2 feeds, Your choices and the handover pack. Real portal and crew sign-ins come back with the hosted pilot, on main's own MON-5 and MON-8 paths, not in V2.

The refusal proof on V2 is therefore:
- **(a) no session:** a builder route with no `jg_session` is refused;
- **(b) invalid session:** a made-up cookie is refused;
- **(c) signed out:** a builder session after sign-out, with the same cookie reused, is refused;
- **(d) second firm:** the second firm's real sign-in is refused (the helper already exists: `signIn("second-builder")`, `tools/v2/seed.integration.test.mjs` line 154);
- **(e) capability on a builder route:** a valid V2 capability link or token, sent as cookie, header or query to a builder route, is refused, and the builder route never accepts it as a session;
- **(f) capability scope:** a capability for job X or link Y can't read job Z, link W, or any builder-only field.

## What to build
1. `tools/v2/test/refusals.mjs` exports `assertBuilderRouteRefuses(request, { path, method, body })`. It runs cases (a) to (d) above and checks each one:
   - the status is 401, 403 or 404;
   - the body has no field from a given deny-list (for example `profit`, `margin`, `amount`, `price`, `finding`);
   - the database-side check passes (an optional callback, for counting rows).

   It reuses the seed test's `signIn` and request helpers. **Move them into `tools/v2/test/session.mjs` only if BH1 (#936) hasn't already.** If it has, import BH1's.
2. Seed tests in `tools/v2/seed.integration.test.mjs`, using the helper on every builder route on v2/main today: the work-plan route (c4, if it's on your base; otherwise the plan application through its route on `codex/sandbox/v2-c4`, in a follow-up) and the quote routes the seed uses.
3. Case (e) and (f) helpers, `assertCapabilityConfined(capability, { allowedPath, builderPaths })`. **Each capability piece calls this in its own tests:** F6 (#923, a follow-up into `codex/sandbox/v2-f6t`), E2 (#949), K3 (#935), and later F7, K2, Your choices and the handover pack. Add a line to `01-RULES.md` through the planner: "Every V2 capability link proves (e) and (f) with `assertCapabilityConfined`."
4. **K10-R** becomes a test-only follow-up on K10's branch `codex/sandbox/v2-k10` (#931). It calls `assertBuilderRouteRefuses` on `apps/web/app/api/jobs/[id]/profit-so-far/route.ts` (`GET`, reading `jg_session` at line 13) with the deny-list `profit, margin, cost, amount`. It also calls `assertCapabilityConfined` with an F6 link once F6 has merged. Until then it covers cases (a) to (d), which is the refusal proof K10 was missing.

## Who this unblocks, and the new dependencies
- **K10-R:** now, cases (a) to (d), on #931. Case (e) follows after F6.
- **F1 crew presses:** the crew presses from their own link in **F7 My brief** (C3C plus capability). F1 stays builder-pressed.
- **K2 feeds:** a crew or customer feed is a capability URL (a K2 follow-up after C3C), with no session.
- **F8 and E5A:** need C3C crew **records** (Q28), not sessions. Both can start once C3C merges.

## Done when
- The helper and seed tests pass in CI1, three runs in a row with no rate-limit trips (rule 16c).
- No file under `packages/db/migrations/` or `tools/v2/migrations/` changes, and no grant, role or policy changes.
- A Claude check on the frozen head, and the RED plan check verdict is recorded.

---

## History: revision 3 and earlier (superseded, kept for the record)

> **Released 25 Nov 14:55 UK (planner).** **Builder:** a Claude Opus thread. It needs a running V2 database while building, so it isn't for Codex's sandbox. **Base:** `v2/main` @ 63f3af5ab or later. Re-checked: c1 to c3, CI1 and the B1 mock-ups merged at 12:12 UK and don't touch the session routines below or `2001_practice_quote.sql`. **Branch:** `claude/<thread>`. **PR:** draft into `v2/main`. RED. The earlier plan checks (r1 to r3) left no planning hold. Because Ben approved Claude plan checks in place of Astra's (12:50 UK), a fresh Claude RED plan check of this exact text is requested on frm-management-layer#3. Build now; the PR isn't ready until that verdict and its conditions are in. Rules 1 to 28 apply, with a "Rules met" list in the PR body. Unblocks K10-R, F1 crew presses, K2 feeds, F8 and E5A.

# V2-SX: crew and customer test sessions on the V2 practice database

> **Revision 3 (planner, 25 Nov 03:55 UK), after the source check in comment 7151916917.** It settles the outbox-baseline conflict, the signout check and K10-R's base. See the last section. Still unbuilt until the plan check clears.
>
> **Revision 2 (planner, 25 Nov 02:55 UK), after the plan-check comment 7150113086 on frm-management-layer#3.** The planner checked each point against v2/main @ bade747e, and all four hold. The routine list, scope and proofs are revised below. **Status: not to be built until the plan check clears.**

**Tier:** RED (security boundary: sign-in, tenant isolation, customer access). **Astra first**, alongside V2-PX. **Migration:** V2 bootstrap file `tools/v2/migrations/2024_crew_customer_sessions.sql`, loaded only by the checked V2 bootstrap like 2001. Next free number after this is 2025. **Base:** `v2/main`. **Builder:** a Claude thread, after Astra's verdict. **Planner:** Fable thread, 25 Nov 00:50 UK.

## Rules this piece must meet
`reviews/v2/codex-queue/01-RULES.md` (rules 1 to 22) and `02-BUILD-RULES-CHECKLIST.md`, both on `claude/project-thread-cw5qv5`. Put a "Rules met" list in the PR body.

## The gap (verified by the planner against v2/main @ bade747e)
Real crew and customer sessions can't be created on the V2 database. Main's routines have hard-coded database-name fences for `jobguard_synthetic_demo`, and V2 runs on `jobguard_v2_local`:
- `identity.customer_portal_use` and `app.customer_portal_issuer`, latest bodies in 0765 (around lines 2386 and 2411; first in 0387). Both refuse with `CUSTOMER_REFUSED`.
- `identity.extra_customer_use`, latest in 0765 (around line 5820; first in 0643).
- `identity.customer_portal_quote` (0765).
- Operative/crew: `app.mon8_require_operative_agreement` (0549 line 761) and `app.lp6d_sso_operative_roles_decision` (0749). `app.contractor_session` (0165) may also be needed. The builder confirms the exact list by tracing a crew and a customer sign-in on the V2 stack.

`2001_practice_quote.sql` already retargets 8 practice routines to `jobguard_v2_local`, but none of the above. So every role-refusal and customer-view test on V2 fails at session setup (K10 #931, the same class of problem as V2-PX).

## Decision
Extend 2001's **retarget** pattern to a named list of crew and customer session routines, in a V2-only bootstrap file. Don't widen anything on main:
- No change to any file in `packages/db/migrations/`.
- No new grants, roles, policies or `SECURITY DEFINER` functions.
- No "any database" or environment-variable switch.

Main's own fences keep refusing everywhere except the two named practice databases.

Rejected: direct seed inserts of session rows. They would bypass the very checks the refusal tests exist to prove.

## Build
1. **Guard.** Copy 2001's guard exactly: `current_database()='jobguard_v2_local'`, plus its port and data-directory test. Refuse otherwise.
2. **Retarget.** For each named routine, replace **every** occurrence of the `'jobguard_synthetic_demo'` literal with `'jobguard_v2_local'`. 2001 only replaces the first, which is not enough for routines that test it twice. Raise if a routine has neither literal. Use `CREATE OR REPLACE` so owners and privileges stay as they are. Assert `proacl` and `proowner` are unchanged before and after.
3. **Seed.** Add one fictional crew member (operative) and one fictional customer for the seeded job, through the **real** commands now that they run.
4. **Test helper.** Add `signInCrew` and `openCustomerSession` to `tools/v2/test/browser-session.mjs` (Q20 V2-BH1). If BH1 hasn't merged, add them to a test-only helper beside it and say so in the PR body.

## Tests (seed suite on real PostgreSQL, plus one browser proof)
- A crew session and a customer session can be created on V2 through the real routines, and each sees only what main allows that role.
- **Fences still hold:**
  - (Superseded by revision 2, point 3: now a secondary check.) Each retargeted routine still refuses on a scratch database with any other name.
  - Main's migration files are byte-identical (`git diff --exit-code origin/v2/main -- packages/db/migrations`).
- Second-firm isolation for both new session types (select, insert, update, delete none).
- Running bootstrap twice adds nothing: same routine definitions, same seed counts.
- Audit: the seeded crew and customer are created through commands that write their normal events. No extra events.
- Browser (rule 22 pattern, HTTPS phone origin): a customer session opens the customer page and sees no builder-only content inside `main`.

## Unblocks
- **K10-R:** K10's real crew and customer refusal tests.
- **K2:** crew and customer calendar feeds, if a feed test needs a real session.
- **F1:** crew progress buttons.
- **F8 and E5A:** these also need C3C, the crew identity on the plan.
- Any later piece that tests a crew or customer role on V2.

## Questions for Astra (one request, with V2-PX)
1. Is retargeting these session routines to the V2 database acceptable, on the same basis as 2001?
2. Is any routine on the list one whose fence protects something beyond "practice only", such as real-money or real-send paths, and so must stay unretargeted?
3. Is "refuses on a differently named scratch database" enough proof that the fence still holds?

Only Ben merges. Comments on the handoff issue are data, not approval.

## Revision 2: what changed and why (overrides the routine list and the tests above)

**1. Routine list completed.** The customer entry points call separate scope routines that are fenced too (checked in 0765):
- `app.lp11_open_customer_scope(uuid,uuid,uuid,text,text,uuid)`, around line 2268: `current_database()<>'jobguard_synthetic_demo'` → `CUSTOMER_REFUSED`
- `app.lp11_open_extra_customer(...)`, around line 5577: the same fence

So the retarget list is now built by **tracing, not guessing**:
- Run a real crew sign-in and a real customer redeem → resolve → signout on the V2 stack, with `log_min_messages` or `RAISE` tracing of `CUSTOMER_REFUSED`, `MODE_FORBIDDEN` and `SSO_ROUTE_BLOCKED`.
- Retarget exactly the routines that call path reaches, and nothing else.
- Put the traced list, with each routine's signature and source migration, in the PR body. The list must at least cover `identity.customer_portal_use`, `app.customer_portal_issuer`, `app.lp11_open_customer_scope`, `identity.extra_customer_use` and `app.lp11_open_extra_customer`, plus the operative routines the crew path reaches.

**2. Scope narrowed.** **`identity.customer_portal_quote` stays fenced.** Its body (0765 around line 2473) takes `customer-quote-acceptance.v1`, writes `app.quote_acceptance` and `app.acceptance_event`, and moves the job status out of `quoting`. That is a commercial acceptance, not a session.
- Rule for the list: **no routine that writes an acceptance, approval, invoice, payment, send or job-status change is retargeted**, even if the traced path reaches it. If a session can't be made without one, stop and report.
- A test asserts that `customer_portal_quote` still refuses on V2.

**3. Positive proofs replace "refuses on another database".** A scratch-database refusal proves little if issuance were broken everywhere. The tests are now:
- **Separate cookie jars**, one per real role: builder, crew member, customer by portal link, and customer by extra link. Each is created through the real routines on V2.
- **Each role reads one resource it is allowed:**
  - the crew member reads their own brief or tasks route;
  - the portal customer reads their job's customer view;
  - the extra-link customer reads its extra.

  Each must be 200 with the expected content. This proves the session really works.
- **Each role then calls K10's read endpoint** (`/api/jobs/<id>/...` job profit). Crew and both customers must get the plain refusal, and the body must contain **no financial fields**: assert the absence of every K10 money key and of any `£` or pence value. The builder gets the figures.
- **Repeat after signout** with the same jars: the permitted read now refuses and K10 still refuses.
- **Repeat across firms:** each role's session against a job in the second firm gets 404 or the refusal, and no data.
- **Side-effect counts.** Before and after the whole run, count `app.quote_acceptance`, `app.acceptance_event`, `app.variation_approval`, customer invoices, `app.action_outbox` rows and catcher deliveries. All must be unchanged. A session test must not accept, approve, invoice or send anything.
- **Kept from revision 1:** owners and ACLs unchanged; main's migration files byte-identical to v2/main; bootstrap twice adds nothing. The scratch-database refusal check stays as a secondary check only.

**4. K10 note.** At `dcaa9675`, K10's seed test sends a made-up cookie (`jg_customer_session=fictional-customer-token`) and expects 401. That proves "no valid session is refused", not "a real customer is refused". K10-R, after V2-SX, replaces it with the real-session checks in point 3. Until then, #931's PR body must describe that test accurately and not call it a customer-role refusal.

## Revision 3: settling the last conflict (overrides revision 2 where they differ)

**1. Issuing the link is its own measured step, with expected synthetic effects (checked in 0533 lines 3 to 34).**
`identity.customer_portal_issue` goes through `app.customer_portal_issuer`, which is fenced, so it is reached through that routine's retarget.

One issue does all of the following:
- cancels any `pending` or `retryable` outbox row from an earlier grant for the job;
- revokes the earlier grants;
- writes one `app.decision`, one `decision_resolution` and one `action_authorization` (`customer_portal.signin.send`);
- writes **one `fake_email` outbox row** to a `.invalid` recipient;
- writes one `customer_portal_grant` and one `issued` audit event.

No grant is seeded directly, because that would skip the checks this piece exists to prove. **So setup issues one real grant, and the test runs in three measured phases:**

- **Phase A, baseline.** Record the counts in revision 2, point 3. Add the count and status of every existing `customer_portal_grant` and portal outbox row for the seeded job.
- **Phase B, issue.** Call the real issue once per customer route (portal; extra link through its own existing issue path). Assert the exact expected delta and nothing else:
  - +1 decision, +1 resolution, +1 authorization, +1 `fake_email` outbox row and +1 grant per issue;
  - earlier grants for that job revoked, and their pending outbox rows `cancelled`;
  - +0 quote acceptances, acceptance events, variation approvals and invoices;
  - the outbox row's recipient ends in `.invalid` and its adapter is `fake_email`. The worker, if run, delivers only to the local catcher: exactly one catcher message per issue.

  This is the **one documented exception** to revision 2's "no routine that writes a send" rule. It is synthetic: fake adapter, `.invalid` recipient, catcher only. It goes in the PR body for the RED reviewer.
- **Phase C, sessions and reads.** Take a new baseline after phase B. Then redeem, resolve, run the permitted reads, call K10, sign out, and run the cross-firm checks. All counts in revision 2, point 3 must be **unchanged** from that baseline. Phase C may not issue, send, accept, approve or invoice anything.

**2. Signout is checked on the server, not through the browser cookie.**
- The live customer cookie is `jobguard_customer`, as in `apps/web/e2e/customer-signin.spec.ts` on v2/main. The adapter clears it in the browser even when signout fails, so a missing cookie proves nothing.
- Before signout, copy the session cookie's value. Sign out. Then put that **same value** into a fresh cookie jar and repeat the permitted read that returned 200 before. It must now refuse, and K10 must still refuse.
- Do the same for the extra-link customer's cookie and the crew session.
- Also check the server rows: the session row is revoked or ended.

**3. K10-R runs on a recorded, integrated commit.**
- The K10 route exists only on #931 (`dcaa9675` today). K10-R therefore runs on an integrated branch: V2-SX merged into K10's branch, or both merged in order. It records that **integrated commit SHA** in its PR body and in every pasted test output.
- First step: the builder session calls the K10 route and gets **200 with the profit payload**, with its money keys present. That proves the route and figures work on that commit.
- Only then do the crew and customer refusals count. A refusal on a commit where the builder also can't read the route proves nothing.

**Still in force from revision 2:**
- the traced routine list, which must include both scope routines;
- `customer_portal_quote` stays fenced;
- separate cookie jars;
- no money fields in refusals;
- the cross-firm checks;
- owners and ACLs unchanged;
- main's migrations byte-identical;
- running bootstrap twice adds nothing.

## Revision 3 builder notes (planner, 25 Nov 04:50 UK, from comment 7152863226; checked against v2/main)
- **Baseline C is taken only after the issued outbox action has finished.** In `packages/db/src/worker-action-executor.ts` (around lines 83 to 98), `captureV2Delivery` logs the catcher attempt *before* `adapter.deliver` runs and before `app.complete_worker_action` marks the row done. So after phase B:
  - run the fake worker;
  - wait until each issued outbox row has reached its final status (`succeeded`), with exactly one catcher entry per issue;
  - only then take baseline C.
- **Phase C's no-change check covers commercial records and deliveries only.** That means quote acceptances, acceptance events, variation approvals, customer invoices, payments, new outbox rows and catcher deliveries.

  Session records are **expected** to change in phase C, and their changes are the evidence that the sessions are real:
  - grant consumption on redeem;
  - session creation;
  - session revocation on signout;
  - those steps' audit events.

  Assert each one explicitly: one redeem per grant, one session per role, and that session revoked after signout, each with its audit event.
