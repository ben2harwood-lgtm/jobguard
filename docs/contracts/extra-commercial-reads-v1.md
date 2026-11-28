# Extra commercial reads v1 (EP-CC-R1, 28 November 2026)

These reads are RED and read-only. They are scoped by the caller's permissions and work in synthetic practice only (`JOBGUARD_ENV=synthetic_demo`). They write no rows, send nothing and invent nothing.

Every field whose source rows do not exist on main yet is returned as `{"status":"not_recorded","source":"CC-S1"|"CC-S2"|"D5"}`. It is never left out, defaulted or guessed. A field the caller's role may not see is returned as `{"status":"not_disclosed_to_role"}`. That marker is different from `not_recorded`, because the row may exist.

**Release gates.** Gate G1 stays closed. Only made-up data is used. A full pass needs CC-S1, CC-S2 and D5. See "Full-pass dependencies" below.

**Code locations:**

| Part | File |
|---|---|
| Schemas, work-state machine, role matrix, typed errors | `packages/core/src/extra-commercial-reads.ts` |
| Repository | `packages/db/src/extra-commercial-reads-repository.ts` (`ExtraCommercialReadRepository`) |
| Database (definer read routines and two customer-scoped read policies) | `packages/db/migrations/0786_extra_commercial_reads.sql` |
| Web routes | `apps/web/app/api/contractor/...` (see the table below) |
| Client projection | `apps/api/src/auth/extra-customer.ts`, action `entitlement` |

## Who can read what

All four contractor reads need a contractor practice session: the `jg_session` cookie, resolved through the existing `app.contractor_session`.

The authority comes from `app.cr_read_scope(session)`, which is the only place job coverage is decided. It works like this:

- The actor is always the session's active membership. No request field can name a tenant, an actor, a role or a team.
- The role must be one of `supervisor`, `surveyor`, `commercial_manager` or `finance`. Every other role (`operative`, `read_only`, `client_approver`, `owner` and others) gets `PERMISSION_DENIED`.
- For non-finance roles, a job is covered only if `app.xa_covers(actor, [role], job, 'job.read')` is satisfied by a current, unrevoked grant. Grants can be scoped to the tenant, region, branch or team.
- `finance` holds the existing tenant-wide finance grant. It covers every synthetic contractor work-order job in the tenant. The same check (`app.mon8_retained_fee_actor`) decides who may see the fee trail.
- The feature gate `app.mon8_feature_decision(actor,'approval_chains','retained_read')` must be open.

A job outside the caller's grants, another company's job, an unknown job, an extra that is not on the job, and a `clientContractId` filter that does not match all give the same result: `NOT_FOUND`.

| Read | Roles |
|---|---|
| Entitlement context | supervisor, surveyor, commercial_manager |
| Asked against approved | supervisor, surveyor, commercial_manager, finance |
| Work list | supervisor, surveyor, commercial_manager, finance |
| Claim record | supervisor, surveyor, commercial_manager, finance (fee trail: finance only) |

No contractor read ever returns resident contact details, capture text, recipient addresses, internal rationale or a free-text basis note.

### Errors

Every error response has the form `{"version":"extra-commercial-read-error.v1","code":...}` and is sent with `cache-control: no-store`.

| Code | HTTP status |
|---|---|
| `INVALID_QUERY` | 400 |
| `UNAUTHENTICATED` | 401 |
| `PERMISSION_DENIED`, `MODE_FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `INCONSISTENT_WORK_INPUT` | 409 |
| `DATABASE_UNAVAILABLE` | 503 |

Raw database errors are never passed through. Anything that is not a typed error is returned as `DATABASE_UNAVAILABLE`.

### Routes (GET only)

| Route | Response version |
|---|---|
| `/api/contractor/jobs/{jobId}/site-extras/{extraId}/entitlement-context[?clientContractId=]` | `extra-entitlement-context.v1` |
| `/api/contractor/jobs/{jobId}/site-extras/{extraId}/asked-against-approved[?clientContractId=]` | `extra-asked-against-approved.v1` |
| `/api/contractor/jobs/{jobId}/site-extras/{extraId}/claim-record[?clientContractId=]` | `extra-claim-record.v1` |
| `/api/contractor/extra-work-list?state=&state=&orderReference=&rateCode=&clientContractId=&teamId=&raisedFrom=&raisedTo=` | `extra-work-list.v1` |

Rules for query parameters:

- An unknown query parameter is refused before any read.
- Every parameter except `state` may appear at most once. `state` may repeat.
- `raisedFrom` and `raisedTo` are inclusive ISO instants, and `raisedFrom` must not be later than `raisedTo`.

## 1. Entitlement context (`extra-entitlement-context.v1`)

**Order lines.** The response includes:

- the origin and current order revision, with lines (rate code, unit, exact quantity, rate);
- `orderRevisionCurrent`.

**Claimed figures.** `claimed` comes from `app.extra_sor_revision`, which holds coverage, instructed, claimed and priced quantities, the adjustment and the net amount. This exists for server-priced (SOR) extras. For ordinary extras it is `not_recorded(CC-S1)`. Pricing basis v2 is part of CC-S1.

**Rate item and versions.**

- The rate item comes from the rate-list version and the item it was bound to.
- The contract version and rule version come from `app.extra_origin`.
- The current price binding includes its basis: `server_sor` with the time it was recorded, or `basis_not_recorded` for old and unpriced records.

**Duplicates.** Unresolved duplicate candidate groups come from the existing `app.extra_duplicate_unresolved`. Origin evidence ids are included.

**Not recorded until CC-S2:** `inclusionRule`, `rateIncludes`, `flags`, `decision`, `requestEvidence`.

## 2. Asked against approved (`extra-asked-against-approved.v1`)

There is one row per approval request revision. Each row has:

- the net amount (or null when unpriced);
- `status`: pending, approved, rejected, withdrawn, duplicate or superseded;
- the basis;
- the outcome, with its reason code, actor kind, whether it was decided by rule, and when it was recorded;
- step facts, with the amount approved at each step.

The summary fields are:

- `firstRequestedNetPence`;
- `pendingNetPence`: only the latest open, priced request;
- `latestUnpricedPending`;
- `approvedNetPence`: the latest approved request;
- `differencePence`: approved minus first requested.

Pending amounts are never added to approved ones, and nothing is summed across revisions.

Example (family 3): a request for £500 is rejected with `price_too_high`, then revised to £300 and approved. Both rows read with their figures. `firstRequestedNetPence=50000`, `approvedNetPence=30000`, `differencePence=-20000`.

**Not recorded until CC-S1:** `revisionReason` and `answersRequest`, which are the structured revision reasons.

## 3. Work list (`extra-work-list.v1`)

The work list covers open extras on jobs the caller is scoped to. Each item has:

- job, extra, description, order reference, rate code, client contract and team;
- when it was raised;
- `state`, `precedence`, `ownerRoles`, `nextAction`;
- `excludedMembershipIds`: the people a duplicate resolution must not be given to;
- `balance`, for billed-not-paid and part-paid items;
- `stateSince`: the latest stored fact on the extra's chain;
- `ageSeconds`: server time minus `stateSince`.

Items are sorted by precedence, then oldest first.

### State machine

The state machine is `classifyExtraWork(extra-work-input.v1)`. It is a pure function in `packages/core`. It gives one state per open extra, with an owner role and a next action. States in §4.4 precedence order:

| # | State | Owner roles | Next action |
|---|---|---|---|
| 0 | waiting_for_evidence | operative, supervisor | add_evidence |
| 1 | waiting_for_pricing | surveyor | price |
| 2 | waiting_for_entitlement_decision | surveyor | decide_entitlement |
| 3 | held_unclear | surveyor | obtain_instruction |
| 4 | included_withdraw | supervisor, surveyor, commercial_manager | withdraw |
| 5 | priced_not_submitted | supervisor, surveyor | submit |
| 6 | duplicate_resolution_required | supervisor, surveyor, commercial_manager (not the excluded members) | resolve_duplicate |
| 7 | waiting_for_contractor_approval | the next company step's eligible roles | approve_or_reject |
| 8 | waiting_for_client_approval | client_approver | client_approve_or_reject |
| 9 | rejected | surveyor | revise |
| 10 | approved_not_exported | finance | export |
| 11 | exported_not_billed | finance | chase_billing |
| 12 | billed_not_paid | finance | chase_payment |
| 13 | part_paid | finance | chase_balance |

**Closed extras** do not appear in the list. They are those that are withdrawn, duplicate, paid, credited in full, or rejected by billing.

**Impossible snapshots** are refused with `INCONSISTENT_WORK_INPUT`. Examples: a logged extra that has a request; billing without an export; a held rule step on an unpriced request; a valid `additional` decision while a rule step is still held.

**Billing.** Billed, credited and paid figures are exact rationals. They come only from the stored current allocation projection.

**States that depend on CC-S2.** In the database feed, `flags` is `null` (not recorded), so `waiting_for_entitlement_decision`, `held_unclear` and `included_withdraw` are entered only through a held contract-rule step. The pure tests feed synthetic CC-S2 inputs to cover every state.

**The evidence gate** is not fed from the database: main has no command to add evidence to an extra. `evidence` is `null`, which means the rules could not be read. It never means the evidence is missing.

## 4. Claim record (`extra-claim-record.v1`)

The claim record is contractor-only. It is assembled from existing rows and includes:

- the origin and current order;
- origin facts;
- every pricing binding, with its basis;
- every request revision, with steps and outcome;
- duplicate links, and unresolved duplicate candidate groups (the schema also allows `not_disclosed_to_role`, but v1 returns the groups to every reader role);
- the billing chain: export line, invoice lines with billed, credited and paid amounts and the balance, allocations, and billing facts (invoiced, credited, paid, payment_reversed, rejected);
- a single time-ordered `history`.

The fee trail is taken from `app.cr_fee_trail` for finance only. It gives the derivations, allocations, rule, qualifying principal and statements, with supersession. For every other role it is `not_disclosed_to_role`.

**Not recorded until CC-S2:** entitlement flags and decisions, and request evidence.

**Not recorded until D5:** `billing.realConnection`. The invoice and payment chain passes in full only with a real connection.

## 5. Client projection (`extra-client-entitlement.v1`)

The client projection is served only through the existing customer route, `POST /api/customer-portal/extra-approvals`, with `{"version":"extra-customer.v1","action":"entitlement","jobId","requestId"}`. The `requestId` must be the request of the customer's verified link.

The data comes from `identity.extra_customer_entitlement`. Only `jobguard_identity` can execute it. It uses the same link redeem/resolve checks, the same LP-11 customer scope and `app.lp6d_client_view_authority` as `extra_customer_approval`.

The projection contains only:

- `orderLines`: the origin order revision's lines;
- `claimed`: the SOR revision, or `not_recorded(CC-S1)`;
- `rateItem`: code, unit and rate, or `not_recorded(CC-S1)`;
- `inclusionRule`: `not_recorded(CC-S2)`;
- `decision`: `not_recorded(CC-S2)` (the entitlement decision outcome and reason code);
- `ownDecisions`: this client's own step decisions and rejected outcomes on this extra.

The schema is strict, so the API refuses any extra field. A client cannot reach any of these:

- the claim record, fees or fee statements;
- the work list;
- other clients' decisions or other requests' links;
- internal rationale or the basis note.

The runtime role cannot execute the identity function, and the identity role cannot execute `cr_*`.

### Customer-scoped read policies

0786 adds two `SELECT` policies for `jobguard_migration`, named `lp11_extra_customer_read`:

- on `app.work_order_line`, scoped by `lp11_extra_customer_tenant('job', job_id)`;
- on `app.extra_sor_revision`, scoped by `lp11_extra_customer_tenant('issued_variation', variation_id)`.

They match only inside an open LP-11 customer scope for that job or variation. The tenant-bound `tenant_isolation` policies are unchanged.

## Full-pass dependencies

| Waits on | What it provides |
|---|---|
| CC-S1 | Pricing basis v2 and structured revision reasons: `claimed` for ordinary extras, `revisionReason`, `answersRequest`, and the client `rateItem` for non-SOR extras |
| CC-S2 | Entitlement flags, decisions, the inclusion rule, rate inclusions and the request evidence list; this is what feeds the work-list entitlement states from the database |
| D5 | The real invoice and payment connection behind `billing.realConnection` |
