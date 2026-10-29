# 0374 — MON-2A first-period safety (RED: money)

Forward-only replacement of `mon2_command(uuid,text,uuid,jsonb)` (0195 body plus
0336's consent-hash amendment) and `mon2_issue(uuid,text,date,integer)` (0373,
including MON-3 source pinning and trial-day suppression of base and extras).
No tables, signatures, grants, owners or shared expectation entries are added or
removed. LP-0, SERIOUS-B5 and entitlement/privilege inventories retain the same
union of installed routines. No existing migration or historical row is edited.

First acceptance captures the server timestamp after the company lock and derives
its London day as the anchor. A different supplied anchor fails with
`SUBSCRIPTION_ANCHOR_NOT_ACCEPTANCE_DAY`; subsequent re-anchoring still fails.
Issue refuses a new period before revision 1's London acceptance date with
`SUBSCRIPTION_PERIOD_BEFORE_ACCEPTANCE`. Existing immutable receipts and issued
periods replay unchanged. There is no stub period or runtime backdating path.

The API supplies today's server London day for the unaccepted plans screen;
accepted plans display their stored anchor. A midnight-crossing stale selection
is refused and requires a reload. Historical fixture setup alone uses the admin
connection to align acceptance time, effective date and anchor; the nine fixture
amount assertions are unchanged.

Upgrade coverage checks populated legacy agreement/approval/receipt preservation
and unchanged ownership, ACLs, security mode and search path. Fresh-install tests
cover the 15th, 31st, leap day, full periods, replays, re-anchor refusal, backdating
and a foreign-company context. Database/browser suites require CI in this sandbox.
Recovery is a forward-fix migration; never revert or mutate issued artifacts.

Catch-up to merged PR #418: `mon2_issue` is rebuilt verbatim from 0373, then
only the pre-acceptance period refusal is reapplied. `mon2_command` is verified
against 0195 plus 0336, retaining only the acceptance timestamp/anchor changes.
The merged LP-0, SERIOUS-B5 and contractor entitlement expectation lists already
contain the MON-3 routines and tables and remain unchanged.

Catch-up local validation (installed package-local Vitest 4.1.12, one worker per
run, at most three named files per run):

- DB: `test/lp-0-catalog.test.ts test/free-first-job-source.test.ts` — 30 passed.
- API: `src/subscription.application.test.ts src/subscription.access.test.ts` — 25 passed.
- Web: `app/plans/plan-screen.test.tsx` — 17 passed.
- Core: `src/subscription-plan-view.test.ts src/subscription-period.test.ts src/subscription-allocation.test.ts` — 48 passed.
- Exact routine-body comparisons to the merged definitions, repository lane
  parser, exact changed-path set, unchanged merged shared lists and
  `git diff --check` passed. No test expectations or migrations already on main
  changed. PostgreSQL migration/integration and browser suites were not run;
  GitHub CI must execute them after the router pushes.
