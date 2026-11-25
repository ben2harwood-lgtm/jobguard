# Q26 · V2-SX: crew and customer test sessions on the V2 practice database

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
