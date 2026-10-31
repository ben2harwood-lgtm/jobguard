# Member administration (LP-7)

This is an authenticated server procedure with no new screen. Use fictional identities
in the synthetic environment. LP-7 is RED and still requires the complete PostgreSQL
CI run and an independent review at the exact proposed head. The LP chain must catch up
through LP-6e before merge; this built-ahead branch does not prove the whole cutover.

1. Sign in using the existing entered-code flow, obtaining the Secure HttpOnly
   `jobguard_session` cookie and the session's CSRF token. Select the intended company
   from the current session membership list. The signed-in person must be an active
   owner, with any required SSO binding; an admin or delegated grant is insufficient.
2. Send `POST /auth/members/commands` to the same approved origin, using the session
   cookie, `Origin` and `X-CSRF-Token`. For removal the JSON body is:

   ```json
   {"version":"member-administration.v1","action":"remove","requested_tenant_id":"11111111-1111-4111-8111-111111111111","membershipId":"22222222-2222-4222-8222-222222222222"}
   ```

   For a role change use `action: "change_role"` and add `role`. Allowed roles are
   `admin`, `estimator`, `foreman`, `operative`, `finance`, `read_only`. This procedure
   cannot create an owner. Identify another active owner before removing or demoting
   an owner, including yourself. The last active owner is protected server-side.
3. A 201 result contains `membershipId` and `auditId` under
   `member-administration-result.v1`. The role/removal and the checked audit event
   commit together. A refusal returns the generic 403 `TENANT_FORBIDDEN`; invalid
   bodies return 400. Investigate a 503 before repeating an action: an unknown HTTP
   result is not proof that the database rolled back. Inspect current membership and
   the audit with the existing authenticated administration tools first.
4. Refresh the target's session view and make a new request. Removal prevents the
   next `bind_request` for that company. Demotion preserves ordinary access at the
   new role but the next owner-only command is refused. Sessions and memberships in
   other companies are retained. Existing requests may finish under their original
   authority; this does not recall network effects already claimed or delivered.

The two identity-only SQL entry points are `identity.member_remove(char(64),uuid,uuid)`
and `identity.member_change_role(char(64),uuid,uuid,text)`. The digest is derived by
server code from the authenticated cookie, never supplied in the JSON. Each routine
revalidates the session and its SSO-filtered owner membership after taking the same
tenant advisory lock (seed 54) used by revocation, invitation acceptance and outbox
claims. The routines require read-committed isolation so a stale repeatable-read
snapshot cannot retain authority across a lock wait. Concurrent mutual
removal/demotion therefore cannot leave no active owner.
The application context's earlier role is never an authorization input to SQL.
Delegated role grants are revoked using the existing SCIM mechanism. Memberships,
authorizations and audit history are retained; no global signout or provider action
is performed.

## Previously authorized work

- Completed commands and delivered artifacts remain historical facts. Removal or
  demotion neither rewrites approvals nor reverses completed business effects.
- Queued owner sends are checked by the existing executor at claim time. A removed
  owner or an owner demoted to `read_only` cannot deliver: no adapter call or attempt
  occurs. Under the current executor these actions remain `pending` (contractor
  revocation has a separate terminal cancellation path). A later explicit operator
  cancellation uses the existing outbox command. This piece adds no new retry policy.
  Existing role-specific exceptions, such as permitted finance customer sign-in
  messages, retain their current checks. Already claimed work and unknown outcomes
  retain existing reconciliation semantics.
- Pending invitations are immutable, time-limited grants. Their existing acceptance
  routine checks the invitation itself, not its issuer's current role. They therefore
  remain usable after the issuer is demoted or removed, until accepted or expired;
  they cannot grant owner status. This piece does not invent an invitation-revocation
  policy or mutate accepted grants.

## Verification and rollout

`apps/api/src/auth/member-administration.test.ts` exercises the controller/application
without binding a socket: session/CSRF/origin, tenant selection, strict inputs,
server-derived digest and database refusal mapping. The PostgreSQL regression suite
`packages/db/test/lp7-member-administration.integration.test.ts` covers live identity
privileges, last-owner protection, two-connection barrier races, next-request binding,
audit rollback, pending invitations and queued sends. Database execution is deferred
to CI in the restricted builder sandbox; these are test cases, not a claimed DB PASS.

Migration `0528_member_administration.sql` is additive. Apply it after its LP
predecessors; deployment numbering is serialized by the router. No backfill is needed.
Forward-fix a failed procedure; emergency disablement revokes its identity EXECUTE
grant. Never restore business-runtime membership writes. Do not reverse committed
membership history to undo a deployment.

HELD-FOR-BEN: the coordinator must add the two new identity EXECUTE signatures and
source paths to the reviewed LP-0 effective-privilege inventory and any protected
scanner/source-pin expectation that names reachable identity routines, after Ben's
piece-specific typed yes (BUILD_PLAN §11.8). No scanner definitions or pins were edited
in this piece. Catalogue CI may remain held until those authorized updates and the
LP-6e catch-up land.
