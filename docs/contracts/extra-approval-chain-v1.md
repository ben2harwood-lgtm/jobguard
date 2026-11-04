# Extra approval chain v1 — ENT-5b, 14 October 2026

Built ahead on ENT-5 foundation (PR #215, migration 0157). Synthetic practice only: real data OFF, no real recipient, nothing is delivered. Every fixture value is listed in `docs/verdicts/ENT-5b/BUILDER_RECEIPT.md` as "demo fixture value, to be set by Ben before real use".

Ben's adopted answers (BEN-ANSWERS-20261013, card jobguard-twenty-product-decisions-2026-10-13) as built: surveyors price (PriceExtra, ReviseExtra); supervisors withdraw (WithdrawExtra, wider roles refused); approvers stay separate across versions and never self-approve; company steps first, then the customer; start/finish uncertainty is NOT built (work-report source held); sends are owner-approved one by one (decision 18), links expire, a replacement cancels the earlier request; original approvers stay eligible and only the agreed alternates are added after the agreed wait; history survives loss of authority (facts are immutable, later actions refused); named fictional client roles are recorded together with the actual tester.

Model: a request is created per priced revision (`extra_approval_request`, with the frozen requirement snapshot and the rule/contract versions in force). A step fact is one approval (unique per request and step; unique per person within a request). One outcome per request (approved, rejected, withdrawn, duplicate) is the single effect that approve/withdraw races resolve to. Staleness is "a later request exists". An extra submitted unpriced can be priced once by a surveyor (PriceExtra on a submitted, not-yet-decided, unpriced extra): that writes the price revision and a new request revision with a fresh requirement snapshot, the unpriced request becomes stale, and its open Decision is dismissed. Pricing an already priced or decided extra is refused (ReviseExtra is the only later change). The client approver is always the actor of the client step (`actor_kind=client_approver`); a contractor attestation is never written. The queue (`app.xa_queue`) is the mandatory lane filtered by stored grants and reads no advisory state. Escalation (`app.xa_escalate`, no time argument) fires once per step via a unique key.

## ENT-5 scheduled escalation worker slice (4 November 2026)

Synthetic practice only: the existing worker registers `discover_extra_escalations`
and `escalate_overdue_extras` only for `JOBGUARD_ENV=synthetic_demo`, including its
practice-only task list. Discovery runs every minute using the infrastructure
connection and returns tenant IDs only through `infrastructure.discover_extra_escalations()`.
The per-tenant payload is strictly `{version: "extra-escalation-task.v1", tenantId}`;
unknown fields are refused. Job keys combine tenant and minute bucket. These keys
coalesce queue work; the existing database unique key guarantees one fact per step.

Execution uses the existing queue tenant constructor and `escalateOverdueExtrasTask`.
The unchanged repository commits escalation facts and their audit events together;
crash rollback and replay therefore cannot separate them. The server routine alone
checks deadlines and current step/outcome. Advisory state cannot suppress escalation.
Only the snapshot's listed escalation/alternate roles gain eligibility, subject to
current grants, while original approvers retain it. The task sends no email or
notification and emits no business content to logs. Production scheduling, timing,
proceed policy and the remaining held policy items stay closed; ENT-5 remains open.
