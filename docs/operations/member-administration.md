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
revalidates the session and binds its SSO-filtered membership using `app.bind_request` after taking the same
tenant advisory lock (seed 54) used by revocation, invitation acceptance and outbox
claims. The routines require read-committed isolation so a stale repeatable-read
snapshot cannot retain authority across a lock wait. Concurrent mutual
removal/demotion therefore cannot leave no active owner.
The bound actor must have the current owner role; a conflicting existing transaction binding is refused.
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

## Built-ahead assumptions and handoff (4 November 2026)

Base: LP-6c `cebbbe2a8`, merged into this branch at `94424f283`. There is no
unfinished merge. LP-6b/LP-6c are present; LP-6d and LP-6e are absent and being built
as siblings. LP-7 leaves their remaining-routine conversion and trusted audit seal
implementation to them. No pre-existing routine body is copied or replaced here.
LP-7 binds the identity session in its own transaction for LP-6e's future audit
attribution and retains the existing checked-operation seal. Landing still requires
LP-6b/LP-6c and the dependency chain through LP-6e, plus exact-head RED review.

The 0790 migration proof records only its two identity entry points, their existing
migration-owner custody and their exact identity-only grants. No scanner, source pin,
protected table shape, existing merged migration or shared fixture was changed. CI must
compare this proof with actual PostgreSQL catalogs and run fresh/upgrade migrations,
LP-0/tenancy/privilege checks, the LP-7 race/rollback/binding/outbox/invitation tests,
and the affected identity journeys. Any additional protected scanner/source-pin
change discovered there is **do not commit** without Ben's piece-specific authority.

LATER / SIMPLICITY (initial review): the two routines in
`0790_member_administration.sql` repeat the owner/target/last-owner checks. A later
reviewed private helper could centralize those checks to prevent security fixes from
drifting between removal and role changes. This is non-blocking: introducing that
helper and its private grants requires a separate privilege review.

## Local check receipt (4 November 2026)

Node v24.17.0; installed tools only. Invoked the installed package binaries directly
because the pnpm wrapper stalled before starting Vitest (cancelled). No downloads,
Git writes, database startup, socket-bound HTTP test or provider call was performed.

- API: `./node_modules/.bin/vitest run --maxWorkers=2 src/auth/member-administration.test.ts`:
  9 passed, after adding the required LP-6b session credential to the test principal.
- API: `./node_modules/.bin/vitest run --maxWorkers=2 src/auth/context-boundary.test.ts src/auth/identity.test.ts src/watchdog-registry.test.ts`:
  identity/context 152 passed; watchdog initially failed during import on stale core
  build output. After rebuilding core, its named rerun passed all 126 tests.
- DB: `./node_modules/.bin/vitest run --maxWorkers=2 test/migration-proof-loader.test.ts`:
  initially failed during import on stale core build output; rerun after the core
  rebuild passed 76 tests, including discovery of the 0790 proof.
- API and DB: `./node_modules/.bin/tsc -p tsconfig.json --noEmit`: both passed.
  Core and DB `tsc -p tsconfig.json` builds also passed to refresh ignored build output.
- API: `node --import tsx src/generate-openapi.ts --check`: passed after rebuilding
  DB output. The tsx CLI itself was unavailable because its IPC listener is sandboxed;
  Node's tsx loader runs the same source without that listener.
- `git diff --check`: passed.
- `node tools/agent-lane-boundary-lint.mjs`: default-main comparison includes inherited
  LP-6b/LP-6c changes outside this lane. With
  `LANE_BASE_REF=origin/codex/sandbox/lp-6c-money-routines`, its only refusal is the
  uncommitted deletion of `0528_member_administration.sql`: the checker unions HEAD's
  tracked deletion with the final diff. That old file is absent on the LP-6c base
  and absent from the final tree, so the requested final lane deliberately lists
  only 0790. Router must rerun the check against LP-6c after committing the rename.
  An independent set comparison confirms the lane equals the final changed paths
  from LP-6c, excluding config/lanes/.

The LP-7 PostgreSQL tests have not run here. The new tests additionally cover
conflicting prebound session substitution, retained next-request access after
demotion, and MON-8 operative-invitation refusal after issuer removal/demotion.
No independent security review, CI PASS, acceptance, push or merge is claimed.


## No-PR save verification (4 November 2026, 21:24 UTC run)

Recovered the 17:52 handoff and retained its partial work. Read-only Git inspection
found no unmerged entries; HEAD remains `94424f283` on
`codex/sandbox/lp-7-member-removal`. No further code change was needed.
Using installed package binaries, with at most two Vitest workers:

- API `./node_modules/.bin/vitest run --maxWorkers=2 src/auth/member-administration.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts`: 161 passed.
- DB `./node_modules/.bin/vitest run --maxWorkers=2 test/migration-proof-loader.test.ts`: 76 passed.
- API and DB `./node_modules/.bin/tsc -p tsconfig.json --noEmit`: passed.
- API `node --import tsx src/generate-openapi.ts --check`: passed.
- `git diff --check`: passed.
- Lane lint against LP-6c still fails only on the tracked deletion of old 0528.
  Final changed-path equality, including untracked 0790 SQL/proof, passes.

READY is for the router's NOPR save only. All landing holds in the earlier handoff
remain: catch up through LP-6e and land predecessors in order; validate actual
PostgreSQL catalogs, fresh/upgrade migrations, authorization races, revocation,
audit rollback, invitation and queued-work semantics in CI; obtain independent
exact-head RED review; rerun lane lint after the rename is committed. No protected
scanner, pin or guard was edited; no concrete old/new protected pin values are known.
No additional design ruling is introduced. Existing invitation behavior and
migration-owner custody remain subject to the named security and CI checks.
