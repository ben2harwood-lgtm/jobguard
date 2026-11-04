# Member administration (LP-7)

This is an authenticated server procedure with no new screen. Use fictional identities
in the synthetic environment. LP-7 is RED and still requires the complete PostgreSQL
CI run and an independent review at the exact proposed head. The inherited LP chain
through LP-6e is present; its landing and protected-control holds remain separate gates.

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
revalidates the session and binds its SSO-filtered membership using `app.bind_request` after taking the same
tenant advisory lock (seed 54) used by revocation, invitation acceptance and outbox
claims. The routines require read-committed isolation so a stale repeatable-read
snapshot cannot retain authority across a lock wait. Concurrent mutual
removal/demotion therefore cannot leave no active owner.
The bound actor must have the current owner role; a conflicting existing transaction binding is refused.
The application context's earlier role is never an authorization input to SQL.
After sealing, LP-7 rechecks the protected actor and tenant without taking another
lock. Expiry during a target-row or audit-head wait therefore rolls back both the
membership change and any system-fallback audit stamp; it cannot return success.
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
- Pending invitations are immutable, time-limited grants. Finance invitation
  acceptance checks the invitation itself, not its issuer's current role. They therefore
  remain usable for the tested `finance` role after the issuer is demoted or removed,
  until accepted or expired; they cannot grant owner status. The current MON-8
  operative-invitation path additionally rechecks its issuer's live owner role and
  entitlement at acceptance, so those invitations are refused after removal/demotion. This piece does not invent an invitation-revocation
  policy or mutate accepted grants.

## Verification and rollout

`apps/api/src/auth/member-administration.test.ts` exercises the controller/application
without binding a socket: session/CSRF/origin, tenant selection, strict inputs,
server-derived digest and database refusal mapping. The PostgreSQL regression suite
`packages/db/test/lp7-member-administration.integration.test.ts` covers live identity
privileges, last-owner protection, two-connection barrier races, next-request binding,
audit rollback, pending invitations and queued sends. Database execution is deferred
to CI in the restricted builder sandbox; these are test cases, not a claimed DB PASS.

Migration `0790_member_administration.sql` is additive. Apply it after its LP
predecessors; deployment numbering is serialized by the router. No backfill is needed.
Forward-fix a failed procedure; emergency disablement revokes its identity EXECUTE
grant. Never restore business-runtime membership writes. Do not reverse committed
membership history to undo a deployment.

## LP-chain handoff (4 November 2026, 22:00 UTC run)

The router merge `317b16202` contains LP-6e `e24a0355e` and its current LP-6d,
LP-6c and LP-6b predecessors. No unfinished merge/index entries exist. Close the
previous absence-only LP-6d/e hold and the old uncommitted-0528 rename/lane hold.
LP-7 reuses the inherited binding and audit routines; no predecessor body is copied
or recreated. ENT-10a2's SCIM migration is present; landing order/current-main
reconciliation remains the router's responsibility.

Reserved migration **0790** and its additive proof are retained. The proof's call
inventory includes the post-seal current-tenant lookup; actual catalogue comparison
is still required. The lane's nine non-lane paths match the delta from
`origin/codex/sandbox/lp-6e-audit-attribution`; the lane does not list itself.
No scanner, pin, guard, protected baseline or earlier test is modified.

The PostgreSQL suite now uses a real identity login for administration and mutual
races. Additional authored cases check v3 bound-member attribution, legitimate
self-removal/demotion with another owner, forged actor/tenant settings, the complete
administration overload inventory and explicit retired actor-based call shapes,
and expiry behind a proven target-row lock with atomic rollback. These cases have
not executed here. Existing last-owner, next-request, rollback, delegated-grant,
invitation and queued-send assertions remain in place.

LATER / SIMPLICITY (initial review): the two routines in
`0790_member_administration.sql` repeat the owner/target/last-owner checks. A later
reviewed private helper could centralize those checks to prevent security fixes from
drifting between removal and role changes. This is non-blocking: introducing that
helper and its private grants requires a separate privilege review.

## Local check receipt

Installed Node v24.17.0 and package binaries only; no downloads. At most two Vitest
workers per invocation, at most three named files. Current-run results:

- API `vitest run --maxWorkers=2 src/auth/member-administration.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts`: PASS, 161 tests / three files.
- DB `vitest run --maxWorkers=2 test/migration-proof-loader.test.ts`: PASS, 76 tests / one file.
- API and DB `tsc -p tsconfig.json --noEmit`: PASS.
- DB, core and AI `tsc -p tsconfig.json`: PASS, refreshing ignored build output.
- API OpenAPI `node --import tsx src/generate-openapi.ts --check`: PASS after refreshing stale DB/core/AI outputs. One invocation from the repository root failed to resolve its package-local tsx loader; the final command ran in apps/api.
- TypeScript transpilation of the LP-7 integration test: PASS, zero syntax diagnostics; this is not semantic checking or PostgreSQL execution.
- `node tools/plpgsql-case-in-if-lint.mjs`: PASS, 250 migrations.
- `git diff --check` and exact final lane equality: PASS; no unmerged entries.
- `LANE_BASE_REF=origin/codex/sandbox/lp-6e-audit-attribution node tools/agent-lane-boundary-lint.mjs`: PASS.
- `node tools/commercial-integrity-current-source-guard.mjs`: FAIL, the same 11 inherited diagnostics (ten covered-edge paths and one stale baseline); see `/tmp/lp7-current-source-guard.log`. No waiver or new PASS is claimed.

## Named holds for landing

1. **Protected predecessor controls — held.** In
   `docs/contracts/lp-0-effective-privileges-v1.json`, the old definition digest for
   `function:app.lp4_seal_audit(jsonb,text)` is
   `ddad34ee09aeb9ad16503ad6a3f8f077cca9f80e31fbdb6ce8fb8c3fd80e6eb1`.
   The new digest is unknown until PostgreSQL `pg_get_functiondef` of 0785 is
   available; compute and authorize it without substituting NULL. Old staticCalls:
   `[app.final_lock_canonical]`; new:
   `[app.current_actor, app.current_tenant, app.final_lock_canonical]`, catalogue
   ordering to verify. Authorized owner must close the protected replacement.
2. **Inherited source guard — held.** In
   `tools/commercial-integrity-current-source-guard.unresolved.json`, old
   practice-session.ts line 73 fingerprint:
   `ad3ac47cb73083599ccbd5fd355eb9f2f313b9af4ceca2115da91270658d50ca`;
   new line 75 fingerprint:
   `a52add41726877212b3d0441a7351647222c7aa760b4e2be0f07d3ea2fd00c04`.
   The generic runtime SQL helper remains unresolved; authorized owner must review
   that precise expectation change or resolve the edge without weakening the guard.
3. **Inherited authority compatibility — held.** Preserve historical LP-4 v2
   assertions at their schema boundary and prove current v3 consumers separately.
   Checked-domain conversion/compatibility of generic acceptance/activation events
   and practice ownership adoption references is not established by actor binding.
4. **Customer-message writer — held under the router's LP-6d ruling.**
   `identity.customer_portal_message` (0547) reaches `sv7a_intake_job_source`
   through the grant sponsor. Design separate customer sign-in proof after LP-6b
   lands; no invented binding kind or sponsor impersonation here.
5. **PostgreSQL/CI/review — held.** CI must run fresh, upgrade and repeat migrations,
   full catalog/proof/grant/RLS/owner checks, LP-0/tenancy checks and LP-7 real-login
   races, revocation, expiry, rollback, all signature/forgery attacks, invitations
   and queued-work tests. Also prove inherited v1/v2 history and current v3
   verifier/export/authority behavior. Reconcile reserved 0790 and predecessor
   landing order against current main; run all required CI and applicable identity
   browser journeys and obtain independent RED review at the exact proposed head.
   No PostgreSQL/browser suite ran in this sandbox, which cannot start PostgreSQL
   or bind localhost. No CI, independent review, acceptance or landing is claimed.

READY for the router's held NOPR save. Made-up data only. No live providers, real
customer data, money, release, fetch, Git writes, commit, push or PR performed here.
