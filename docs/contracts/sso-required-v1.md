# Single sign-on required v1 — ENT-10d

Status: synthetic-only ENT-10e construction. Ben confirmed company-owner-only one-step approval, time-limited OFF behavior and the strict unlinked-member guard on 12 October 2026. Default and bounds confirmed by the integrator Q3. Builder evidence is not an independent verdict or acceptance. ON/OFF still requires the existing SAML-bound owner/admin session.

## Definitions

- **The switch; “a company has enabled SSO”; “SSO-required tenant”:** an explicit per-tenant switch stored as append-only revision rows. The highest revision determines `required`; no row means OFF. Connections, domains and mappings never imply ON. Default OFF retains every merged identity path.
- **Ordinary session:** an `identity.session` row with no `identity.sso_session_binding`, issued by emailed code for 24 hours. **Bound session:** one with a binding, issued only by merged `identity.sso_complete`, capped at 15 minutes and bound to one tenant and membership.
- **Its people:** accounts with an active membership under merged `identity.current_memberships`: a membership locator naming a membership that is neither revoked nor expired. The rule is per tenant. An ordinary session never yields membership in a required tenant; a bound session yields it only for its bound tenant/membership. A domain address without membership is outside this rule.
- **Emailed-code sign-in is closed:** code request remains byte-identical: acknowledgement, challenge, limits and delivery path never inspect the switch. After merged provisioning, an account with active memberships only in required tenants receives existing `INVALID_CODE` (400), no session, cookie or `session.issued`. No active membership behaves as merged. Invitation acceptance is checked before the consumed-and-verified update: a closed invitation consumes the challenge only, sets no verified latch and never calls provisioning.
- **Membership listing and tenant context:** `identity.sso_session_memberships(user,session)` calls merged `current_memberships`, then filters by the latest switch and exact subject/user/membership binding. `PersistedAuthProvider.memberships` supplies authenticated session identity. Both Nest and Next, invitation creation, the global guard, SSO view/admin/link and all ordinary bridge callers consume it. Naming a filtered tenant gives existing `TENANT_FORBIDDEN`; the new routes translate it to `SSO_REQUIRED_FORBIDDEN`. Worker authority continues to use merged live-binding permission checks.
- **Composition with merged binding:** SQL removes rows first; the merged provider `scope` filter stays unchanged and can only remove more rows. A binding invisible to the provider cannot open a required tenant through an ordinary-shaped request; SQL still requires the matching binding there. Gates add no session time/expiry tests; merged authentication and scope own those tests.
- **Existing sessions:** ON does not revoke them because other tenants may remain accessible. Zero grace: the first membership/context check beginning after switch commit observes ON; work already past the check may finish. OFF restores still-live ordinary session access. A prior ten-minute linking request may finish through merged SAML completion and yields only a bound session. No listing/context is cached.
- **Multi-company member:** A required, B ordinary: emailed-code verification succeeds, listing/context/writes reach B only, A is absent and explicitly refused. An A-only account invited into B can accept and gain a B-only ordinary session.
- **Invitations and joiners:** creation in required tenants returns no invitation; accepting an earlier invitation consumes the code, leaves verified false and writes no membership/locator/acceptance mark. SAML JIT remains the join path, with verified domain and enabled mapped group.
- **Group-mapped grants:** rows remain as merged. Required tenants honor them only through bound web/worker authority. OFF retains merged behavior, including grants accessible by emailed-code sessions (Q6 adopted, LATER). No replacement of `app.contractor_allowed`.
- **Turning ON/OFF:** exact origin, session CSRF, current `organisation.manage` through merged `sso_require_admin`, expected revision and 20–500-character reason. Ordinary sessions can do neither. SQL takes exclusive tenant lock `hashtextextended(tenant::text,54)` before checks and audit. ON requires a connection with verified domain, latest enabled mapping and successful sign-in; this administrator's live binding in this tenant; no active member missing a SAML subject pointing at that active membership. A re-invited member whose subject still names a revoked membership blocks ON. OFF needs current admin plus its live same-tenant binding. The stricter guard was confirmed by Ben on 12 October 2026 (Q4).
- **The ONE emergency route:** only possible effect is appending OFF for one required tenant, actor kind `emergency`. No session is issued; no connection/domain/mapping/grant/membership/session or financial/evidence/history mutation occurs. Its OFF-only action was confirmed by Ben on 12 October 2026 (Q3); ENT-10e below replaces the held approval and unbounded duration described in this historical paragraph. It consumes the latest ordinary `signin` mailbox code under existing expiry/five-attempt/timing-safe/single-use rules without verified latch or provisioning. Required conditions: synthetic database, active member with `organisation.manage`, required switch, a configured approver rule, a matching approval no older than 30 minutes, unexpired, never used. Approval/use FK and tenant-qualified primary key enforce single use. The held `CHECK(false)` means there can be no rule and therefore no approval; every request is refused. No configuration/approve action ships. Later policy requires a reviewed migration.

## Boundaries and transports

All methods first apply merged `requireSyntheticSso(mode,"in-process-test-idp")`; mode is required, never defaulted. Pilot, production and missing mode refuse before authentication. Mutation/view/emergency SQL also gates the database name. Membership/code/invitation gates run in every database and never acquire a tenant advisory lock on emailed-code paths: SAML locks tenant then email; code already owns email. A narrowly concurrent invitation acceptance may leave one unlinked member, who gains no ordinary access to the required tenant.

Strict schemas refuse unknown keys:

| Schema | Fields |
|---|---|
| `sso-required-command.v1` | `requested_tenant_id` UUID; `required` boolean; `expectedRevision` integer 0–2147483646; `reason` 20–500 characters |
| `sso-required-view.v1` | `requested_tenant_id` UUID |
| `sso-emergency.v1` | `requested_tenant_id` UUID; `email` valid email ≤320; `code` eight decimal digits; `reason` 20–500 characters |

Nest: GET/POST `/auth/sso-required`, POST `/auth/sso-required/emergency`. Next twins: `/api/auth/sso-required` and `/api/auth/sso-required/emergency`, over the same `createWorkspaceApplication().ssoRequired`. GET carries `version=sso-required-view.v1` plus requested tenant. Reads require CSRF and membership and derive configured origin only when same-origin GET omits it. Writes require exact supplied Origin. Responses use no-store; no public sign-in hint is added. View returns `sso-required-state.v1`, environment, tenant, required, revision, unlinked count and nullable server-derived `auditConnectionId`; the latter supplies authorized refusal targeting, never client authority. Missing/invalid SQL responses refuse.

| Code | Status |
|---|---:|
| `INVALID_SSO_REQUIRED_INPUT` | 400 |
| `SSO_REQUIRED_FORBIDDEN` | 403 |
| `SSO_REQUIRED_NEEDS_SSO_SESSION` | 409 |
| `SSO_REQUIRED_NO_CONNECTION` | 409 |
| `SSO_REQUIRED_UNLINKED_MEMBERS` | 409 |
| `STALE_SSO_REQUIRED` | 409 |
| `SSO_ROUTE_BLOCKED` | 403 |
| `SSO_EMERGENCY_REFUSED` | 403 |
| `SSO_REQUIRED_UNAVAILABLE` | 503 |

Error bodies contain `code` only. Every emergency cause, including invalid input/origin/mode/mailbox/member/approval, maps to identical `SSO_EMERGENCY_REFUSED` (403), never a sign-in cookie. Requests take no switch-dependent unauthenticated branch; only valid mailbox proof reaches membership-dependent processing. Synthetic fixture code is disclosed identically for all addresses, as merged.

## Persistence, auditing and limits

Migration `0129_sso_required.sql` owns `sso_required_event`, `sso_emergency_approval`, `sso_emergency_use`, `sso_emergency_event`: tenant-leading keys/FKs, non-null tenant, FORCE RLS, migration ownership, merged immutable trigger; identity SELECT only; no public/business/infrastructure privileges. Invalid/missing tenant settings read no new tenant rows. Global `sso_emergency_approver_rule` is a reviewed control-plane exception with held constraint and no runtime privilege. All eight public new routines explicitly grant EXECUTE only to restricted identity credentials. The ninth routine, `sso_required_append`, is private: no identity EXECUTE grant, so it cannot bypass command/emergency guards. No object from 0111 or 0120 altered or restated. No fingerprinted row changes.

Success switch events `sso.required.enabled` / `sso.required.disabled` append to the tenant chain in the same transaction. Failure rolls back mutation before merged global and, where authorized, tenant `sso.refused` audit. Targets derive only from a live binding, switch or permission-checked SQL view. Code refusals use `SSO_REQUIRED_CODE_SIGNIN`; invitation refusals `SSO_REQUIRED_INVITE_CLOSED`; ordinary context denials `SSO_REQUIRED`. Global unknown targets carry no supplied tenant/email. Audit payload holds references, classifications and reason hash only.

Emergency routine returns rather than raises for business refusal. Eligible mailbox-proven administrators in a required tenant commit separate emergency log plus `sso.emergency.refused` in one repository transaction; eligible success commits use/switch/log plus `sso.emergency.used`. Others create only the global refusal, with server-only cause code. This narrows tenant-log eligibility to the valid administrator case required by S10b; merely knowing a tenant UUID never permits a tenant append. Raw synthetic emergency reason remains in its protected log. PostgreSQL outage cannot guarantee durable auditing; emergency still returns its uniform refusal. Privileged database/identity credential compromise lies outside RLS's application guarantee. Hash chaining retains merged trusted-head/checkpoint limits.

## Held and later

HELD Q2: approver rule, approve action/screen, locked-out request screen, post-use review sign-off. INTERIM Q3/Q4 await Ben. OIDC library approval, native M3 path, D04/G5 evidence remain HELD; SCIM is later ENT-10a2. OFF session-scoped grants (Q6), re-linking re-invited members and domain capture (Q9) are LATER. No live provider, outbound action, real data, fee or release is enabled.

ENT-10d2 needs: founder approver/reviewer decision; confirmation of OFF-only effect; migration lifting held latch with versioned rule and one approval-recording routine; approver/request/review routes and screens; real DB/browser success proof through that approval routine, including `sso.emergency.used`; contract/data-flow updates. The current success mechanism uses only one owner-run rolled-back fixture. Concurrent uncommitted approval use cannot be proved with independent transactions on that single connection; this evidence conflict is raised in the receipt, not claimed as passed.


## ENT-10e

This section supersedes ENT-10d's held emergency rule, v1 emergency request, unbounded latest-OFF interpretation and Q2/Q3/Q4 status above. The administrative command and private append primitive are unchanged. All deployment/provider release gates remain in force.

**Owner.** A person whose active membership in that company has the role `owner`. Active is decided only by merged `identity.current_memberships(u)` and owner is the returned role for that company. Merged `app.contractor_allowed(actor,'organisation.manage',t) IS TRUE` remains the second condition. Group mapping cannot supply owner; with multiple owners, any one may act.

**Approval, one step.** The owner's own command is the request and approval: proving the owner's mailbox and submitting the command writes a separate named approval under the one rule and consumes it in the same transaction. No other role can request it; no second person or JobGuard support approval exists.

**Emergency window.** One immutable row per successful use records opened time, closing time and configured minutes, with `closes_at = opened_at + window minutes`. It cannot be changed, lengthened or removed. Rule id `14300000-0000-4000-8000-000000000001`, version `company-owner-only.v1`, definition `{"approver":"company_owner"}` is the single constrained, immutable global control-plane row. Window keys and references are tenant-qualified; application roles have no direct write grant. Owner checks inside the security-definer command own authority.

**Effective state; SSO-required company.** One private routine `identity.sso_required_state(t)` reads the highest-revision switch. No row: not required. ON: required. Administrative OFF: not required. Emergency OFF: not required only while its window exists and `clock_timestamp() < closes_at`; required from closing time onward and required if its window is absent. All existing gates and the v1 view use this routine. Missing, null or invalid effective state refuses access. The routine raises on missing, malformed or different company setting, takes no lock, sets no context and accepts no caller time.

**Switches itself back on, no clock process.** Each gate checks the database clock. No scheduler, worker, new switch revision or audit row runs at expiry; the use-time window row records the end. An administrator's newer ON or OFF revision supersedes the emergency row. Expiry never waits for the strict unlinked guard.

**Sessions when a window closes.** An ordinary session issued while open is not revoked: from the first listing/context check at or after closing time it yields nothing in this company and retains its other companies. A request past its check before closing time may finish afterward, the same zero-grace boundary as ENT-10d.

**People who joined during a window.** Invitations work while effectively OFF. Unlinked joiners lose access when the window closes and appear in the list. Switch-back cannot be refused because of them.

**Not yet linked.** Exactly the strict guard population: the company's membership locator whose same-company/id/user membership is neither revoked nor expired and lacks a subject for that company, user and current membership. `never_linked`: no subject in that company for that user. `linked_to_earlier_membership`: an existing subject names a different earlier membership. Revoked/expired memberships and people with no sign-in account are absent; pending invitations are separate and never block ON. Member addresses come from their own `identity.user_email`, never caller data. Results order by email then membership id; at most 200 members, a true total and truncated flag. Pending unaccepted, unexpired invitations also cap at 200, ordered by email/id.

**Replay.** Mailbox code, approval primary key and company-scoped forever-unique command id are single-use facts. An applied command id is refused both during and after its window, changing no window. A fresh command and fresh mailbox code may open a new window after expiry, with a new record.

**Configuration.** `JOBGUARD_SSO_EMERGENCY_WINDOW_MINUTES` is read only at service composition alongside deployment mode. Default 60 minutes; allowed 15 to 240; chosen by the order drafter and confirmed by the integrator's answer to Q3. Unset/empty selects 60; only one-to-three decimal digit strings in range are valid. Signs, whitespace, decimals, exponent notation and non-strings are invalid, never rounded/clamped/defaulted. Absent service argument or invalid setting forwards null. SQL requires a JSON numeric integer in range; table checks independently enforce range and exact duration. Minutes never come from the request.

| New boundary | Contract |
| --- | --- |
| `sso-emergency.v2` | Strict version, requested company UUID, commandId UUID, email, eight-digit code, reason 20–500; unknown keys including windowMinutes refused. v1 schema stays exported solely for compatibility tests; the route refuses v1. |
| SQL emergency payload | Exactly version, requested_tenant_id, commandId, configured windowMinutes, reason; never email or code. Success gains eventId, windowMinutes and canonical closesAt together; refusal never has those fields. |
| `sso-emergency-response.v2` | environment synthetic_demo, required false, requiredAgainAt, windowMinutes; no session/cookie. |
| `sso-required-detail-view.v1` | Strict version and requested_tenant_id UUID. |
| `sso-required-detail.v1` | environment, tenantId, effective required, revision, emergencyWindow, unlinked total/truncated/members, pendingInvitations. Window is null unless latest actor is emergency; then openedAt, closesAt, windowMinutes, open (all three values null and open false if missing). UTC times are canonical text with six fractional digits and Z. |

GET `/auth/sso-required/detail` and thin Next GET `/api/auth/sso-required/detail` use the same application, credentials, CSRF/origin behavior, synthetic gate and administrator authority as the existing view; both are no-store. POST emergency keeps the existing two route paths and changes only to v2. The v1 state view retains exactly its seven fields. The one 409 `SSO_REQUIRED_UNLINKED_MEMBERS` response optionally carries `{code,unlinked}`, read after command rollback and its existing refusal audit with the same credentials. A failed list read retains the original code-only refusal and adds no second refusal audit; all other bodies remain `{code}`.

New server causes: `EMERGENCY_NOT_OWNER`, `EMERGENCY_WINDOW_INVALID`, `EMERGENCY_COMMAND_REPLAYED`; existing `EMERGENCY_APPROVER_RULE_UNSET` remains fail-closed. Every public emergency refusal, including retired v1, origin, mailbox, membership, open window, invalid setting, replay and audit failure, is identical 403 `SSO_EMERGENCY_REFUSED`. Eligible refusals append company log plus chain event in one repository transaction; successful use writes approval, OFF switch, use, window, log and chain event together. Audit failure rolls all of them back. Reasons are hashed with SHA-256 of UTF-8 bytes in the approval and audit; raw reasons remain only in existing protected switch/log records. The route creates no session and modifies no identity authority, money or evidence history.

Limits: no end-time row/audit event; the route does not repair the provider or sign anyone in. Re-invited people remain unlinked until linked; the re-link path stays LATER (ENT-10a LATER 13). Second-person post-use sign-off is HELD; JobGuard support approval was ruled out. Screens (owner form, list/window and obsolete held-rule text), per-company duration, two-step approval, domain capture, OFF session-scoped grants, OIDC, SCIM/native paths for this route, D04/G5 evidence and any real provider/person/data are not built here. UI is parked. Source-inspected/test-executed construction is not independent verification or release approval.
