# 0374 — MON-2A first-period safety (RED: money)

Forward-only replacement of `mon2_command(uuid,text,uuid,jsonb)` (0195 body plus
0336's consent-hash amendment) and `mon2_issue(uuid,text,date,integer)` (0195).
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

PR #388's locally available MON-1 admission heads (local 79c0fb13, remote
4cd0b673) were inspected: 0367 adds subscription refresh triggers/read dependencies
but does not redefine either replaced routine. The router must recheck its actual
PR head before integration; no network was used in this build.
