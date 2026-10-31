# MON-5 customer authority proposal — M5-PREP

25 October 2026 · synthetic preparation only · no runtime authorization or decision approval.
Issue: C270, M5-PREP; base `cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe`.
Read with [candidate reconciliation](../planning/mon5-candidate-reuse-map.md) and
[adversarial vector specification](../fixtures/customer-portal-authority-cases.json).
The vectors grant no access and define no successful authenticated principal.

## MON-5 variation approval slice — 29 October 2026

The issued `m5-extra-approve` order supersedes the earlier variation-only route and
consumer holds below. Synthetic customers use the unchanged 0387 session boundary
(shared by `CustomerAuthGuard` and `CustomerSigninApplication`); a builder cookie
or a method label supplies no customer authority. ENT-5 remains separate.

`POST /customer-portal/variations/read` and `/customer-portal/variation-approvals`
have matching Next `/api` adapters. Read accepts only
`{version:'customer-variations-read.v1',jobId}`. Approval uses the existing proposed
`customer-portal-approval.v1` envelope, restricted to its variation target:
`commandId`, `jobId`, `expectedJobRevision`, and
`target:{kind:'variation',id,revision,hash,amount:{pence,currency:'GBP'}}`.
Here target `id` is the variation identity; revision/hash/signed amount bind its
immutable priced revision. Unknown fields, including actor and method, are refused.
The review screen displays the exact description, revision, hash and signed amount.

Migration 0389 resolves the 0387 customer session again in the approval transaction,
locks the variation, checks the current job/revision, and records one immutable
`variation_approval` with method `customer_authenticated`, a session reference and
canonical command hash. Member actor and evidence are null for this method;
legacy approvals retain their fields and require member actors as before.
A runtime insert cannot manufacture customer provenance. Replays reauthenticate,
return only the same session's exact stored command, and create no second effect.
All public refusals remain generic across Next/Nest, including malformed JSON.

The existing 0282 trigger still creates catch claim revision 1, at exactly the
approved positive amount. Its only change is to use a customer-session reviewer
reference for the new method. Negative approvals create no positive claim.
Builder final-account/invoice readers continue to consume the existing approval
row, and variation history distinguishes authenticated approval from attestation.
No shadow source, fee, settlement, send, provider or live release is enabled.
Database/browser CI and independent Claude RED review remain required.

## MON-5 sign-in foundation ruling — 29 October 2026

Ben selected emailed one-time links, no passwords, with browser-session cookies.
Migration `0387_customer_signin.sql` implements this synthetic foundation only.
`POST /customer-portal/{issue,revoke,signin,signout,read}` and matching Next `/api`
paths are registered. Their customer scope is distinct from member authority.
The earlier blanket AUTH/GRANT/ROUTES refusal below is superseded only for these
five routes. All commercial, message, stage and cancellation-kit slices stay held.

Owner or finance may request a server-generated 256-bit token for a current
customer/job binding. Only `app.action_outbox`, `fake_email` and the current
customer revision's `.invalid` address are allowed. The grant stores the HMAC,
company, tenant, job, customer, exact binding/revision, issuer and outbox reference.
The outbox alone retains the token-bearing fictional email artifact; it must never
be returned by a customer or issuer response. Audit contains identifiers only.
Issuance is limited to one request per job per minute; a new grant revokes previous
grants and sessions and cancels pending old delivery. Revocation is owner/finance
within the same company. No grant is standing commercial authority.

A link expires ten minutes after issue. Atomic redemption consumes it once and
creates one session. The cookie is HttpOnly, Secure, SameSite=Strict, with neither
Max-Age nor Expires on issue. The conservative server cap is one hour from
redemption, without sliding refresh. Closing a browser session removes the
session cookie under normal browser behavior; browser session-restoration settings
can restore session cookies, so the server cap and explicit sign-out remain the
backstop. Sign-out revokes the stored session. Expiry of the consumed link does
not truncate an otherwise valid session. Revoked/replaced grants, changed party
bindings or customer revisions and inactive issuers refuse subsequent access.
Both transports require the configured real Origin; issuance/revocation also
require the builder session and its CSRF token. Customer credentials, even when
mixed with builder cookies, cannot enter builder APIs. Reads return only their
bound job/customer/company scope and never list jobs or inspect shadow data.

`customerApprovalMethodV1` names `customer_authenticated` alongside existing
methods. Existing quote/variation writers and stored history remain on their
existing contracts; this foundation cannot turn a method label into an approval.
No real customer data, delivery, payment or release is authorized. PostgreSQL CI,
the browser suite and independent Claude RED review remain necessary evidence.

## Authority and safest synthetic choices

The issued order supersedes the draft status and its suggested branch/registration
with `codex/sandbox/m5-prep`, `.worktrees/m5-prep`, `config/lanes/m5-prep.json`.
It issues preparation only. BUILD_PLAN §12.1's ready rule still requires merged
prerequisites for runtime work. The planning pack's MON-5 evidence register,
common leaf contract and §§3.1–3.4 retain their exclusions and exact-head reviews.
Nothing here changes AGENTS, BUILD_PLAN, decision statuses or candidate bytes.

Ben's 23 October answer was inspected at the dispatcher's
`jg-orders/next-wave/BEN-ANSWERS-20261023.md` (under the full-steam data directory):
“Use safest choice (Recommended)”. It explicitly covers synthetic MON-5 questions:
refuse rather than allow; hold back rather than reveal; finance or owner only;
approve each exact item; no standing authority; no unverified paid/settled result.
This answers the open synthetic policy questions without granting a new persisted
principal or approving a public route. These choices are changeable before real
customers. Applied here:

| Hold | Specific safe choice / disposition | Still needed before runtime issuance |
|---|---|---|
| M5-H-AUTHORITY | Refuse customer execution until server-verified persisted tenant/customer/job/current-party binding and actual tester provenance exist. Company owner, finance, contractor client approver and a fictional name alone confer no customer authority. | Security owner selects and documents an exact synthetic actor-switch binding or capability/session boundary; typed opaque authority, trusted construction and current-source checks. |
| M5-H-GRANT | No grant issued; no standing consent; separate explicit approval of each immutable subject. Do not turn A's sample 30-minute timestamps into policy. | Exact issuer/revoker policy (owner or finance ceiling only, no assumed new role), purposes, lifetime, replacement/reuse rules, party revision, permitted view, redemption and credential transfer. Unknown values remain HELD. |
| M5-H-ROUTES | Keep every proposed route unregistered; gate OFF. No token-in-path or `/auth/*` business bypass; no manufactured Origin. | Exact separately reviewed security composition, source of issuer/customer credentials, real Origin/CSRF, direct Nest enforcement before legacy cookie shortcut and persisted Next/Nest parity. |
| M5-H-CONSUMERS | Preserve builder-attested history; customer facts do not impersonate members or enable activation by label. | Approved additive side-fact/reader path or compatible constraint evolution, exact namespace and locks; quote/activation and variation/final-account/invoice consumers in each leaf's final diff. |
| M5-H-STAGES | Acknowledge only an exact existing verified completion snapshot; sign nothing unsupported. Later invalidation retains historical acknowledgement and requires current review. No payment/certification/liability waiver. | Source-locked stage eligibility, exact displayed content and acknowledgement semantics; no new stage catalogue or M4-18 workflow. |
| M5-H-INTAKE | Refuse new messages after lock; retain historical reads and freshly authorized identical replay. Never direct-insert a portal message. | Accepted CH-4 admission and SV-7A checked intake accepting this approved principal; exact writer/transaction contract. DEPENDENCY-BOUND until supplied. |
| M5-H-CANDIDATES | Preserve A/B as unmerged source; do not recreate them. | Candidate-owner repairs, actual independent exact-head verdicts, separate acceptance and integrated target commits. Source/receipt inspection is complete; technical reconciliation remains DEPENDENCY-BOUND. |

A synthetic alternative could bind the actual tester to a separately persisted
fictional customer actor for one job, or use an independently approved customer
capability/session with the same qualification. Neither alternative is selected
or implemented here. Until the security handoff fixes all required values the
selected behavior is refusal. No invented role, expiry, assurance level, legal
statement or policy version fills a gap. G1, D06 v2, D12 v3 and all live gates stay
closed; no real link, provider action, data, funds or delivery is authorized.

## Exact action envelopes to reuse

A's `customer-portal-approval.v1` remains the sole candidate approval command:
`version`, `commandId`, `jobId`, `expectedJobRevision`, `target`. Its targets are:

| Target | Exact candidate fields | Required future storage verification |
|---|---|---|
| quote | `kind`, `id`, `revision`, `hash`, `amount:{pence,currency:'GBP'}` | Current immutable document/revision/hash/total, job and current party binding; nonnegative safe integer pence within existing limit. |
| variation | Same commercial fields, `kind:'variation'`, signed amount | Exact current priced revision/hash/signed delta, approvable state, original scope/lineage and origin. An existing post-lock `jobguard_catch` can be approved through this path; no new source is injected. |
| stage | `kind:'stage'`, `id`, `hash`, `scopeItemId`, `evidenceLinkId`, `evidenceHash`, `objectVersionId` | Exact completion, scope, finalized original evidence/type/version/hash, no invalidation or supersession. No amount field. |

The trusted server binding supplies tenant/customer/current party-binding revision,
policy, grant/purpose/version and actual tester provenance. A's existing binding
contains `tenantId`, `customerId`, `partyBindingId`, `policyVersion`,
`realActorMembershipId`, `actingMembershipId`, `practiceSwitchId`,
`practiceSessionRef`; these reference fields do not prove a valid small-builder
switch. Its link reference binds ID/digest/grant revision/timestamps, but does not
currently encode an approved purpose catalogue or independent party revision.
Any needed extension belongs to A/security owners in an exact later order.
Do not create a second command/link schema here. Result
`customer-portal-approval-result.v1` is proposed persisted provenance, never an
existing writer or proof that `customer_authenticated` occurred.

Proposed issuer scope read has strict `{jobId}` only. Exact issue/revoke body
schemas are HELD for the selected authority design: no requester-supplied tenant,
customer/member role, policy, received time, digest or successful result. A grant ID
is an identifier. Proposed message input wraps only accepted command identity
and exact `jobSourceTextV1` text; exact envelope is DEPENDENCY-BOUND to the accepted
writer. Preserve nonblank/NUL/surrogate/UTF-16/UTF-8 limits and exact source bytes.
A body `fictionalCustomer` cannot bind the actor. Text saying “I agree” is evidence,
never the exact quote/variation/stage approval command.

## Real and proposed interfaces

“Real” below means source inspected on the recorded base, not a live integration
or release claim. “Candidate” means inspected at A/B heads, absent from base main.

| State | Interface / module | Authority limit |
|---|---|---|
| Real | `QuoteAcceptanceRepository.view/accept`; `RecordBuilderAcceptanceMutation` | Builder attestation, demo-member facade; not a customer executor. Preserve `0011`/`0155` row history. |
| Real | `PracticeActivationRepository.start`; `SwitchJobLiveV3Mutation` | Consumes accepted quote/job state; no customer fact adapter supplied by this preparation. |
| Real | `approvePricedVariation`, variation read facade and `variation_approval`; final-account and invoice readers | Member-based approval/current-source path; a side row alone cannot satisfy downstream acceptance. |
| Real | `ProofCommandService.complete/invalidate`, `stage_completion`, evidence links and invalidations | Builder/member proof, separate from customer acknowledgement. Never call completion as customer or set verified flags. |
| Real | `JobSourceRepository.read(context,jobId,digest,kind)`; `JobSourceApplication.diary/messages`; `JobSourceController` | Practice-owned GET reads; no customer message POST writer on this base. |
| Real | `readJobSourceObservations`; `decodeJobSourceFixture`; shadow worker/sink | Exact finalized original verification; only tap fixtures integrated on base. Portal does not read or write shadow signals. |
| Real | `ExtraApprovalRepository.issueClientApproval/revokeClientApproval/clientApprovalView/decideClientApproval` | Contractor ENT-5 only. Mechanical reference; unchanged; sharing would require a revised serialized order. |
| Real | `ApplicationAuthGuard`, PracticeAccess, per-request workspace factory | Existing legacy synthetic shortcut / company `SYNTHETIC_WORKFLOW_ONLY` refusal; no customer route authority. Do not infer approval from a cookie. |
| Candidate A | `customerPortalApprovalTargetV1/CommandV1/ResultV1`, `customerPortalApprovalBinding`, `assertCustomerPortalApprovalTarget`, `customerPortalApprovalReplay`, `CustomerPortalApprovalError` | Pure strict parsing/exact matching/canonical text; no authentication, persistence or successful principal. |
| Candidate A | `customerPortalApprovalLinkReferenceV1`, `assertCustomerPortalApprovalLinkReference`, `CUSTOMER_PORTAL_APPROVAL_LIVE_LINKS_ENABLED`, `assertCustomerPortalApprovalLiveLinkDisabled` | Constant false; unconditional `LINK_UNAVAILABLE`; reference predicate is not credential verification. |
| Candidate B | `cancellationKitV1`, `attachCancellationKit`, `cancellationKitRows`, `CANCELLATION_KIT_LABEL`, `CancellationKitError`; quote snapshot/PDF integration | Synthetic-only companion; frozen legacy artifact compatibility; reuse exact bytes and original renderer. |
| Candidate B | `CUSTOMER_MESSAGE_SAFETY_FIXTURE/TEXT`, `decodeCustomerMessageFixture`, existing decoder extension | One exact synthetic original, unknown price; no classifier or customer intake. |
| Proposed AUTH | `CustomerPortalAuthorityRepository.issue/revoke/resolve/readScope/readIssuerScope`; `apps/api/src/customer-portal/authority.ts` | Missing approved opaque types, SQL signatures, issuer policy and persisted binding. No implementation in M5-PREP. |
| Proposed Q/V/S | `CustomerQuoteApprovalRepository.accept`, `CustomerVariationApprovalRepository.approve`, `CustomerStageSignoffRepository.signOff` and corresponding API applications | Exact authorized facts with actual downstream consumers and separate proof acknowledgement; names are planned, not callable here. |
| Proposed MESSAGE | `CustomerPortalMessageApplication.post`, `CustomerMessageAuthorityAdapter` | Thin adapter to accepted SV-7A writer; no guessed writer signature. |
| Proposed HTTP | `createCustomerPortalApplication({pool,authority,requestEvidence})`, `customerPortalApplication(request)` | Request-scoped facade over accepted services; no `workspaceApplication()`/legacy-cookie authority substitution. |
| Proposed JOURNEY | Customer page, issuer controls, truthful quote/variation method labels | Server-authoritative projections; no usable customer journey before accepted transport/domain leaves. |

### Installed related routes on the issue base

These inspected Nest routes have matching Next paths with `/api` prefixed.
They retain practice/builder authority; none authenticates a small-builder customer.

| Methods | Existing Nest path | Current function |
|---|---|---|
| GET, POST | `/jobs/:id/quotes` | Quote draft read/save |
| POST | `/jobs/:id/quotes/preview` | Existing immutable quote preview |
| GET, POST | `/jobs/:id/quotes/acceptance` | Read timeline / builder-attested acceptance |
| POST | `/jobs/:id/quotes/acceptance/disposition` | Builder disposition |
| GET, POST | `/jobs/:id/quotes/activation` | Practice activation snapshot / explicit activation |
| GET, POST | `/jobs/:id/variations` | Existing variation read/member command |
| GET, POST | `/jobs/:id/proof` | Existing proof read/member completion or invalidation |
| GET | `/jobs/:id/customer-messages` | Saved synthetic message/evidence read only |
| GET | `/jobs/:id/diary` | Saved synthetic diary read only |

### Exact route inventory

Every following mutation/read proposal is **unregistered and HELD**, including
issuer reads. Customer page GET may eventually render an unauthorized shell only.
POST read is inert domain access, with required security/refusal auditing intact.

| Method | Nest proposal | Next proposal |
|---|---|---|
| POST | `/customer-portal/read` | `/api/customer-portal/read` |
| POST | `/customer-portal/quote-approvals` | `/api/customer-portal/quote-approvals` |
| POST | `/customer-portal/variation-approvals` | `/api/customer-portal/variation-approvals` |
| POST | `/customer-portal/stage-signoffs` | `/api/customer-portal/stage-signoffs` |
| POST | `/customer-portal/messages` | `/api/customer-portal/messages` |
| POST | `/customer-portal-grants/read` | `/api/customer-portal-grants/read` |
| POST | `/customer-portal-grants` | `/api/customer-portal-grants` |
| POST | `/customer-portal-grants/:grantId/revocations` | `/api/customer-portal-grants/[grantId]/revocations` |

Existing GET `/jobs/:id/customer-messages` and Next
`/api/jobs/[id]/customer-messages` remain reads; same for diary. They do not become
POST endpoints. No route under `/auth`, token-bearing URL, tenant-wide customer
list or implicit GET mutation is proposed. Selected method/path checks must precede
the legacy `jg_session` shortcut. Direct Nest and production Next must independently
enforce the same persisted authority; real Origin/CSRF forwarding, no-store and
uniform refusals are mandatory. Parity is M5-HTTP's same-diff obligation and cannot
be deferred to M5-JOURNEY or replaced with successful mocks/guard replacement.

## Future guard and mutation evidence design

Every guard below has hostile mutations in the JSON specification. These are
**NOT RUN designs**, not successful implementation tests. No new runtime guard
exists in this leaf. Each future guard needs its own executed mutation proof in
its owning leaf's receipt; replacing a guard with unconditional allow must make
those tests fail. The only new executable configuration boundary here is the
lane registration; its actual negative controls are recorded in this receipt.

| Guard | Mutations / expected observable result | Owner |
|---|---|---|
| G-AUTH | Forged/absent/expired/revoked grant or tester; change tenant/job/customer/party revision/purpose/track/mode; all refuse before informative scope lookup and before replay. | AUTH, HTTP |
| G-CURRENT | Revoke/expire/rebind during lock wait or replay; freshly check storage authority and refuse or serialize a valid prior commit; no stale success. | AUTH, Q/V/S/M |
| G-EXACT | Change quote revision/hash/total, variation revision/hash/signed amount/state, stage proof version/hash/type/completion; no approval/effect. | Q/V/S |
| G-COMMAND | Replay identical command after fresh authority; changed actor/job/customer/target/text/family conflicts; atomic rollback, one durable result across concurrent clients. | AUTH, Q/V/S/M |
| G-SECRECY | Inject token/text/email into logs/audit/error/cache/HTML/referral URL; compare unknown and foreign scope, both-cookie and legacy-cookie attempts. No credential/PII leak or enumeration. | AUTH, HTTP |
| G-MESSAGE | Edited/unknown fixture text never invents facts; wrong original/hash/version/upload/type/job refuses; new post-lock source refuses while genuine authorized replay/history remain. | MESSAGE, SV-7A |
| G-SHADOW | Zero/one/many pre-lock hidden signals must leave ordinary read/intake response/query/cache/error paths identical; exact safety fixture must surface and permanently lose fee eligibility. | MESSAGE, owning worker |
| G-KIT | Change text/hash/template/revision/document version/reference; refuse stale approval; legacy PDF bytes unchanged and both new creation paths include the exact companion. | B, Q, JOURNEY |
| G-CONSUMER | Side-fact-only customer approval, member relabelling, skipped final-account consumer, or invalid proof must not enable activation/invoice/fees. | Q/V/S, coordinator |
| G-TRANSPORT | Change method, Origin/CSRF, internal fields, tenant selector, route family or credential; direct Nest and Next refuse identically without bypass. | HTTP |

All future DB leaves need tenant/job/customer-qualified keys, ENABLE/FORCE RLS,
narrow EXECUTE, no direct runtime DML, LP-0 (including authority paths), tenancy,
SERIOUS-B5 and contractor-entitlement inventory deltas for their actual objects.
No objects exist in this leaf; every catalogue delta is empty, no freeze changed.
Proof requires real PostgreSQL catalogues, own-migration upgrade/negative controls,
rollback, contention, current authority after waits and pooled isolation in CI.

## Serialized ownership and retained gates

The coordinator/security owner alone handles `apps/api/src/auth/application-auth.guard.ts`,
`app.module.ts`, workspace/core/db barrels, reviewed context bridges/pins and
OpenAPI composition. Q consumer edits serialize with MON-3; V/final-account/invoice
edits with SV-5 and the money chain; source intake/decoders with SV-7A/CH-4; A/B
contracts/rendering with their original owners. ENT-5 remains unchanged. No
`#189`/`#181` or reserved worktree access. No shared file edit is authorized by
this proposal. The lane file has only the three preparation documents and receipt
in `allow`; it excludes every registration path and the legacy register.

Downstream construction remains DEPENDENCY-BOUND to merged/accepted A/B, AUTH,
CH-3a, SV-7A and each named source/consumer/security handoff. Runtime route approval,
customer execution, browser proof, stage semantics and real data gates remain
separate. Two actual independent Claude exact-head verdicts and separate acceptance
must be supplied by the dispatcher; no review or approval is created here.
