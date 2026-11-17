# Synthetic SCIM deactivation v1 — ENT-10a2

This contract implements a local inbound deactivation message from the made-up provider only. It is JobGuard JSON, not the SCIM 2.0 wire protocol. Both `POST /auth/scim/:connectionId/deactivations` (Nest) and `POST /api/auth/scim/:connectionId/deactivations` (Next) call `ScimApplication.deactivate`. No screen or outbound message exists. Real provider integration, reactivation and native paths remain HELD.

## Definitions

**Provider:** the made-up identity provider of ONE `identity.sso_connection`, whose database-constrained `metadata.provider` is `in-process-test-idp`. It exists in tests only.

**Seed:** one installation setting, `JOBGUARD_SCIM_SYNTHETIC_SEED`. `scimSeed(raw)` keeps a string of 43–200 characters from `A-Z a-z 0-9 _ -`; anything else is `unset`. No default and no other setting supplies it. Unset closes the route. It is read only at server composition, never from a request, and is never logged, returned or persisted.

**Bearer of a connection:** 43-character base64url HMAC-SHA-256, keyed with the seed, over `scim-bearer.v1:` followed by the lower-case connection id. One connection, one bearer. Nothing stores or issues it. The header is shown only as `Authorization: Bearer <the connection's bearer>`.

**Proved caller:** exactly `Bearer`, one space, that connection's bearer in Authorization. **Unproved caller:** everyone else, a signed-in owner included. No cookie, session, role, permission, origin or body field proves a caller. Verification always computes the expected bearer and performs one timing-safe comparison of two SHA-256 digests; malformed headers present the fixed empty value.

**Deactivation message (`scim-deactivation.v1`):** strict JSON with exactly `version`, UUID `eventId` (provider message identity), `subject` (1–200 characters, exactly the sign-in subject text), and literal `active: false`. Unknown keys, `active: true`, missing fields and non-objects are invalid. The company is never read from the body: merged `identity.sso_load_connection` reads it from the connection named by the path.

**The person:** `user_id` of `identity.sso_subject` for that company, connection and SHA-256 of the unchanged UTF-8 subject. No message creates a user, link or membership. An address is not a subject.

**Target memberships:** all `app.membership` rows of that company for the person with `revoked_at IS NULL`, expired or not, including a later invitation membership.

**Deactivated:** in one transaction with one `T = clock_timestamp()` read once, (a) every target membership receives `revoked_at = T`; (b) every still-unrevoked identity session bound in that company to that person through ANY connection receives `revoked_at = T`; (c) every grant of a target membership without a revocation receives an immutable `app.role_grant_revocation`. Other companies and ordinary emailed-code sessions are untouched. (d) `identity.identity_user`, `user_email`, `sso_subject` and `membership_locator` remain unchanged: the kept subject link makes subsequent provider sign-in refuse `MEMBERSHIP_REVOKED`. (e) No SSO-required switch changes; revoked members cease to count as unlinked and cannot block enabling it. Switch history stays even when its administrator is deactivated. (f) No invitation changes. (g) One immutable `identity.scim_event` and one company-chain audit event commit with the facts, or none does.

**Outcome:**

| outcome | cause | audit event |
|---|---|---|
| deactivated | SCIM_DEACTIVATED | sso.scim.deactivated |
| ignored | SCIM_SUBJECT_NOT_LINKED | sso.scim.ignored |
| ignored | SCIM_ALREADY_INACTIVE | sso.scim.ignored |
| refused | SCIM_OWNER_PROTECTED | sso.scim.refused |

Unknown subject or no target membership writes only record and audit. ANY target membership with role owner refuses the whole message, writing only record and audit. Owner protection prevents an irreversible company lockout; Ben may confirm/change it later.

**Replay:** same connection/eventId, subject hash and message hash returns the stored outcome without any write or audit append. It never acts again after re-admission. **Conflict:** same connection/eventId with different content gives `SCIM_EVENT_CONFLICT`, 409; no domain change. Only a new eventId can deactivate a later membership.

**Reactivation:** HELD. No statement moves or clears a revocation. `active: true` is invalid.

**Nothing written:** no new/changed membership, session, grant revocation, SCIM record or `sso.scim.*` audit event. A refusal may add its own refusal record.

**One public refusal:** every unproved caller and a proved caller naming an absent connection receives 403 with exactly `{"code":"SCIM_REFUSED"}`. Before proof, no database read occurs: exactly one global refusal insert uses fixed label `scim` and a server-only cause. A failed refusal insert preserves that answer. No company-chain event is appended. Responses set Cache-Control no-store and no cookie or authentication challenge.

**Synthetic only:** `JOBGUARD_ENV=synthetic_demo` and database `jobguard_synthetic_demo` are both required. Other deployment modes refuse before any database read; the only write is the global refusal record.

## Persistence and ordering

`identity.scim_deactivate(c uuid, p jsonb) RETURNS jsonb` trusts the restricted identity credential after application proof, like merged sign-in. Its strict SQL payload is exactly `{version,eventId,subjectHash,eventHash}`. Raw subject, bearer and seed never reach SQL. Message hash is lower-case hex SHA-256 of JSON.stringify with ordered keys `active:false`, lower-case `connectionId`, lower-case `eventId`, `subjectHash`, `version`.

The routine checks database and payload; calls merged connection load; reads the company setting; takes `pg_advisory_xact_lock(hashtextextended(t::text,54))`; checks replay; reads T; resolves person; locks target memberships in id order; checks owner; performs two one-way updates, one grant-revocation insert, and one record insert; returns strict outcome/cause/recordId/replayed. Every company-table query specifies the company. The load is the sole bootstrap read before the company lock. `ScimRepository` uses ONE merged enterprise transaction and appends audit LAST with actor `identity:scim`, subject type `sso-connection`, connection id, cause reference and message hash. No later business lock follows the audit head.

`identity.scim_event` has tenant-leading `(tenant_id,id)` primary key, unique `(tenant_id,connection_id,source_event_id)`, tenant-qualified connection foreign key, optional identity-user foreign key, SHA-256 subject/event hashes, closed paired outcome/cause, true nonnegative counts and server time. Unknown subject is exactly the null user case; only deactivated records have positive membership count; all other counts are zero for other outcomes. It is owned by `jobguard_migration`, ENABLE/FORCE RLS with the fail-closed 0129 tenant policy and the merged immutable trigger. No application role has table privileges. Only `jobguard_identity` receives EXECUTE on the new SECURITY DEFINER routine, owned by `jobguard_migration`, with search_path pg_catalog. PUBLIC, runtime and infrastructure receive no new privileges. No existing object or grant is altered or restated.

## Response and errors

Success is HTTP 200, strict `{version:"scim-deactivation-result.v1",environment:"synthetic_demo",eventId,outcome,cause}`. Only the paired outcomes above are valid. Replay gives the identical public body. Errors carry `{code}` only.

| code | status |
|---|---|
| INVALID_SCIM_INPUT | 400 |
| SCIM_REFUSED | 403 |
| SCIM_EVENT_CONFLICT | 409 |
| SCIM_UNAVAILABLE | 503 |

SQL failures translate only exact known cause messages; other details remain server-side causes. Unexpected errors before the service runs default to SCIM_REFUSED. A proved caller's unavailable repository error becomes SCIM_UNAVAILABLE. Invalid input and conflict are recorded after rollback through the merged refusal mechanism, globally and in the resolved company's chain.

## Gate map (merged checks unchanged)

| path | merged check | revocation fact |
|---|---|---|
| bound request | PersistedAuthProvider.authenticate → session, sso_session_scope → contractor_member_active | session.revoked_at and membership.revoked_at |
| list/resolve any session | memberships/findMembership → sso_session_memberships → current_memberships | membership.revoked_at IS NULL |
| emailed-code sign-in | sso_code_signin_allowed → current_memberships | same; ordinary session lists nothing here |
| provider sign-in again | sso_complete → contractor_member_active | membership revoked → MEMBERSHIP_REVOKED |
| contractor permission/admin/switch | contractor_allowed, sso_require_admin → contractor_member_active | membership.revoked_at and grant revocation |
| background | sso_action_allowed, ActionExecutor | session revocation, contractor_allowed, membership revocation |
| create invitation | invite_member | current owner membership.revoked_at IS NULL |
| emergency access | sso_emergency_use → current_memberships | same |

This is the first product code to set `app.membership.revoked_at`; previously tests alone set it. The separate contractor `membership.revoke` command remains outside this task.

## Stated limits

1. A request whose checks finished before commit may complete. The first check starting after commit refuses the person (zero grace).
2. Audit atomicity is enforced by the governed repository transaction, not by the database routine alone. The restricted identity credential remains a trust boundary.
3. If record/audit cannot commit, no deactivation happens; HTTP 503 requires the provider to retry.
4. One-way: mistaken deactivation needs a NEW invitation membership while SSO is not required. The provider link remains on the old membership; re-link is later.
5. With SSO OFF the owner's emailed-code invitation still admits the same address, including an unused invitation issued up to one day earlier. SSO ON closes invitations. Closing this exception waits for ENT-10e and Ben's card ruling.
6. An unknown subject is recorded without preventing a later first sign-in.
7. Ordinary sessions remain valid for other companies and empty for this company.
8. No route rate limit; each unproved request adds a global refusal, as refused sign-in does. Bearer strength is 256 bits.
9. Nest's JSON parser may answer malformed JSON with framework 400 before this code. That depends on caller bytes only. Next forwards its sentinel and returns the one refusal for an unproved caller.
10. One seed derives all synthetic bearers; its holder can act for every synthetic connection. Live stored/rotatable per-connection credentials stay HELD.

## HELD and later work

Real provider and SCIM 2.0 `/Users`, `/Groups`, PATCH, filters, paging, provider configuration and error format, provisioning, updates, group push, stored/rotatable credentials and issuing screens/commands, and rate limits: HELD for founder/D04/G5. Reactivation and clearing revocations: HELD. Owner deactivation/transfer: not built under adopted protection. Blocking emailed-code re-admission or first sign-in of unknown subjects needs a separate merged-gate change. Re-link (ENT-10a LATER 13), OIDC, native paths and founder evidence stay held/later. Every screen is parked; the existing event list may display plain event types. No notification is sent. Database-enforced audit is not built.

Card list: Ben to confirm/change owner protection; synthetic JSON and one-way behavior to revisit with live provider; emailed-code re-admission to close after ENT-10e. FIX-LATER: contractor `membership.revoke` writes only `app.contractor_membership_revocation`, which current_memberships does not read; address before any commercial module opens to real sign-ins. UI display of deactivation records remains parked.
