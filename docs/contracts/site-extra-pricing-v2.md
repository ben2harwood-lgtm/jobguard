# ENT-3 priced capture v2 (RED, synthetic only)

`POST /contractor/jobs/:id/site-extras/sor` accepts `log-sor-site-extra.v2`
alongside unchanged strict v1. V1 still returns `sor-site-extra-logged.v1`.
V2 returns `sor-site-extra-submitted.v2`, with the stored `requestId` and the
approval chain's first state (`awaiting_approval`, or `approved` if its existing
contract rule supplies the approval). Neither answer returns prices.

V2 adds reviewed `description`, required `photoEvidenceId`, required
`residentConfirmation: { shownContentSha256 }`, required strict `workStatus`
(`not_started`, `under_way`, `finished`), and optional `siteVisitId`.
It uses existing `site-extra-content.v1` and server-written
`resident-confirmation.v1` formats. Resident identity is not verified. All v1
fields retain their meaning, including total claimed quantity. Neither version
accepts tenant, actor, role, origin, price or server time.

The existing `LogSiteExtra` / `raiseExtra` transaction commits the server-priced
revision with ENT-3d evidence checks and the optional open-visit guard. Only then
the application calls `ExtraApprovalRepository.submitExtra` / `app.xa_submit`.
The submit command ID uses the existing derivedUuid helper with namespace
`ent3-priced-submit:<lowercase tenant>:<lowercase log command>`; the separate namespace gives submission its own stable
receipt identity, and any UUID collision fails closed. The existing xa_submit rule permits an
operative's own server-priced extra only while they retain extra.log on that job;
its supervisor/surveyor rules are unchanged. No role, permission or grant is widened.
Free-text logs remain logged. V1 does not attempt automatic submission.

Logging and submitting deliberately have separate transactions and receipts. A
submit failure returns a typed `SITE_PRICING_UNAVAILABLE` error without undoing the
log. Retry the exact v2 body: the log replays first, then the same SubmitExtra
receipt replays or completes. Concurrent replay makes one log and one approval
request; a different submit command cannot submit that extra again. The request
hash includes every v2 evidence/text/visit/status field and preserves the v1 hash bytes.
A changed log payload conflicts before any submission. Submission still checks
the existing approval_chains entitlement and current authority. No approval,
sending, fee or work permission is inferred by the application.

## Within-order supervisor question

An already-on-order check includes `orderRevisionId`; v1 readers may ignore this
additive field. `POST /contractor/jobs/:id/supervisor-queries` accepts exactly:

```
{ version: "record-site-supervisor-query.v1", commandId,
  orderLineScopeItemId, sorCode, quantity, expectedOrderRevisionId }
```

`quantity` is total claimed positive bounded decimal text. No tenant, actor, role,
time, origin, amount or price is accepted. The routine requires the authenticated
operative's existing LogSiteExtra authority and site_origin_capture entitlement.
It checks current assignment and cancellation, locks the current order pointer,
and requires the expected revision and matching order line/code. An outdated
revision/line is ORDER_LINE_NOT_FOUND (422); quantity above instructed is
INVALID_QUANTITY (400). Unassigned, cancelled and foreign-tenant jobs are identical
NOT_FOUND (404). No extra, variation, price or fee is produced. The existing priced
log's ALREADY_ON_ORDER refusal and never-call-raiseExtra guarantee remain intact.

Migration 0744_site_supervisor_query adds one immutable table with tenant-safe
references, forced RLS and no runtime table grant. One checked routine handles the
write and supervisor read. It claims/completes RecordSiteSupervisorQuery through
the existing command lifecycle, with an active-member registry entry and the
routine's stricter operative/job checks. Completion derives the result from that
transaction's stored query and seals command.succeeded through app.lp4_seal_audit.
No runtime command_receipt, decision_resolution or action_authorization writes.

The response `site-supervisor-query.v1` carries queryId, jobId,
orderLineScopeItemId, sorCode, quantity, orderRevisionId, operativeMembershipId
(from the session), recordedAt (server time), environment synthetic_demo and
realExternalActions 0. Same command and body returns the first answer after current
access checks, even after a non-cancelled order revision; different body or actor
conflicts (409). A cancelled or now-unassigned job remains not-found on replay.

`GET` on the same route returns `site-supervisor-queries.v1` with jobId and queries.
Only the existing scoped supervisor job.read authority may read. The existing
`/site/extra` screen supports supervisors as well as operatives; its job picker and
extras list now include a read-only supervisor-question section. No new page or
resolve/close workflow. Every API response uses Cache-Control no-store.

## Remaining ENT-3 acceptance

Q10 still requires typed SoR search; no recent-item list. Priced v2 work status
is an immutable operative statement with server time and session operative, written
in the log transaction (migration 0745). It is not visit timing or a preapproval
breach determination. Same-ID/different-status conflicts; replay preserves the
first statement. Finished above the limit is recorded; later approval cannot alter
it or the original requirement comparisons. ENT-5 not_derived stays unchanged.
Free-text work status remains open: its strict v1/v2/v3 contracts are unchanged.

The order-check response adds optional proceedComparison (within/above), computed
on the server using the job's bound rules and exact price, with unpriced above.
The screen labels this as a comparison giving no permission to work. Free text is
unpriced and shown above. The old generic Northside demo-setting limit is no longer
used as this job's comparison. The existing supervisor-queries GET adds optional
workStatuses, scoped to that supervisor's job, for read-only display alongside the
existing extras list. No commercial/timing consumer reads these statements.

The first priced capture now uses exactly four taps: choose SoR result, choose
work status, confirm resident, log; photo and typed search excluded by the card.
This count is authored in the mobile-360/desktop browser spec, awaiting CI.
Resolve/close, dictation, candidate duplicates, offline capture and real sending
remain open/out of scope. This partial work does not finish ENT-3.

Local unit tests exercise strict boundaries, adapter binding and retry routing.
PostgreSQL migration/catalogue/isolation/concurrency tests and the headless
mobile-360/desktop browser specs are authored for CI, not executed in this sandbox.
Mocked browser journeys do not prove a real persisted journey. Independent RED
review at the exact committed head, required CI and all release gates remain open.
