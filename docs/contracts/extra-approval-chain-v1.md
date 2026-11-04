# Extra approval chain v1 — ENT-5b, 14 October 2026

Built ahead on ENT-5 foundation (PR #215, migration 0157). Synthetic practice only: real data OFF, no real recipient, nothing is delivered. Every fixture value is listed in `docs/verdicts/ENT-5b/BUILDER_RECEIPT.md` as "demo fixture value, to be set by Ben before real use".

Ben's adopted answers (BEN-ANSWERS-20261013, card jobguard-twenty-product-decisions-2026-10-13) as built: surveyors price (PriceExtra, ReviseExtra); supervisors withdraw (WithdrawExtra, wider roles refused); approvers stay separate across versions and never self-approve; company steps first, then the customer; start/finish uncertainty is NOT built (work-report source held); sends are owner-approved one by one (decision 18), links expire, a replacement cancels the earlier request; original approvers stay eligible and only the agreed alternates are added after the agreed wait; history survives loss of authority (facts are immutable, later actions refused); named fictional client roles are recorded together with the actual tester.

Model: a request is created per priced revision (`extra_approval_request`, with the frozen requirement snapshot and the rule/contract versions in force). A step fact is one approval (unique per request and step; unique per person within a request). One outcome per request (approved, rejected, withdrawn, duplicate) is the single effect that approve/withdraw races resolve to. Staleness is "a later request exists". An extra submitted unpriced can be priced once by a surveyor (PriceExtra on a submitted, not-yet-decided, unpriced extra): that writes the price revision and a new request revision with a fresh requirement snapshot, the unpriced request becomes stale, and its open Decision is dismissed. Pricing an already priced or decided extra is refused (ReviseExtra is the only later change). The client approver is always the actor of the client step (`actor_kind=client_approver`); a contractor attestation is never written. The queue (`app.xa_queue`) is the mandatory lane filtered by stored grants and reads no advisory state. Escalation (`app.xa_escalate`, no time argument) fires once per step via a unique key.

## ENT-5 screen actions — reject, withdraw and revise (4 November 2026)

This partial ENT-5 addition exposes the existing commands in the synthetic Northside
practice route and `/approvals/extras`. It does not close ENT-5 or open G0–G5.

- Reject uses the same eligible queue and exact request/hash/net/step binding as
  approve, with a required reason. The screen offers the existing `not_agreed`
  reason; the command's existing reason-code grammar remains authoritative.
- Withdraw offers only supervisors the four existing reasons: `not_done`,
  `raised_in_error`, `resident_cancelled`, `already_on_order`. Database authority
  remains decisive, including job coverage and current membership.
- Surveyors can revise an approved or rejected extra using a rate-card code and
  measured integer quantity. The route calculates pence from the stored job rate;
  the client cannot submit a revised amount. A read-only `GET` on the same revise
  URL supplies those controls after the extra has left the logged list. Its
  session, visible-extra and pricing-grant checks precede the rate read.
- Every mutation requires trusted browser origin and a session-derived tenant and
  actor. Strict schemas reject supplied authority, clock and other unknown fields.
  The existing command registry already classifies RejectExtra, WithdrawExtra and
  ReviseExtra; this adds no command type or mutation route path.
- Rejection retries can leave the eligible queue. A tenant/actor/type-scoped receipt
  read binds its original request to the URL extra and job, then permits only the
  existing repository replay path; it never returns
  a result itself. The command boundary rechecks authority and exact command content.
  Withdraw and revise likewise use the existing durable command implementation.
- Outcomes and refusals are displayed from the server. In particular an old open
  approval screen displays `STALE_REVISION` after revision; the client does not
  infer that refusal from its local state.

Validation: route unit tests cover binding, queue exclusion, stale amounts, missing
reasons/steps, untrusted origins, forged fields, supervisor-only withdrawal,
server-derived revised pricing, uncovered pricing grants, scoped rate reads and
forwarding of durable replay/conflict results. These use command doubles, not a
PostgreSQL integration claim. The existing price/send route tests stay unchanged.
The new `ENT-5-chain-actions.spec.ts` is for CI at `mobile-360` and `desktop`, headless
with at most two workers. Its real synthetic journey covers rejection, replay and
changed-payload conflict, revision and its replay/conflict, stale approval on screen,
approve/withdraw racing through the route with a single stored outcome, withdrawal
replay/conflict, foreign-tenant refusal and unknown job/extra refusal. A separate
transport fixture always exercises the withdrawal button and server refusal.
Focused accessibility assertions check visible control names, labels, duplicate IDs,
44px targets and horizontal overflow; they are not a full WCAG/axe audit.

No migration, fee, role, proceed, duplicate or client-link policy changes. The
existing approval-chain PostgreSQL suites and both viewport journeys must pass in
CI; no database or browser execution is possible in this build sandbox. A fresh
independent RED review at the committed head and green CI remain required.
