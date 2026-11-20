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
- Pending invitations retain their immutable history, but current migration 0703
  rechecks the issuer's active, unexpired owner membership for every role at
  acceptance. Removal or demotion therefore blocks pending finance invitations too.
  Expired invitations and challenges remain unusable; accepted memberships are
  retained. Operative invitations additionally require current entitlement.

## Verification and rollout

`apps/api/src/auth/member-administration.test.ts` exercises the controller/application
without binding a socket: session/CSRF/origin, tenant selection, strict inputs,
server-derived digest and database refusal mapping. The PostgreSQL regression suite
`packages/db/test/lp7-member-administration.integration.test.ts` covers live identity
privileges, last-owner protection, two-connection barrier races, next-request binding,
audit rollback, pending invitations and queued sends. Database execution is deferred
to CI in the restricted builder sandbox; these are test cases, not a claimed DB PASS.

Migration `0763_member_administration.sql` is additive. Apply it after its LP
predecessors; deployment numbering is serialized by the router. No backfill is needed.
Forward-fix a failed procedure; emergency disablement revokes its identity EXECUTE
grant. Never restore business-runtime membership writes. Do not reverse committed
membership history to undo a deployment.

## Current-main catch-up receipt — 17 November 2026

LP-7, RED: sign-in, membership authority and tenant isolation. Construction base
is `eea626e17d3a6d05d643475aaf2e5aeafd7639c1` (HEAD and locally available
origin/main), containing merged LP-6d/0749 and LP-6e/0758. No fetch was performed.
The saved branch `codex/sandbox/lp-7-member-removal` at
`3c7961efa96c65a77898924259a03649ccbd9025` and its worktree remain untouched.
Only its LP-7 payload was reused: schema, application method, controller endpoint,
unit/integration tests, procedure and additive SQL/proof. OpenAPI was generated
from current code. No predecessor migration, snapshot, seal body, pin or protected
baseline was copied. Main's signout, invitation CSRF, typed failures, session binding,
issuer-revocation policy and audit.v3 sealer remain in place.

Migration **0763_member_administration.sql** adds exactly two identity-only
routines. It replaces no existing routine, so neither successor-source registry
needs an edit. No new table, fingerprinted column, business-runtime authority,
owner creation, emergency access or provider action is introduced. Both routines
retain the shared revocation lock before session binding, last-owner serialization,
delegated-grant revocation and post-seal protected actor/tenant recheck. Their proof
lists exactly `app.bind_request`, `app.current_actor`, `app.current_tenant` and
`app.lp4_seal_audit` as calls, and membership/grant-revocation as writes. Actual
catalogue/grant comparison remains pending. New routine definition digests retain
the existing additive-proof null representation; this is not a verified digest or
permission to replace a protected existing digest with null.

The saved invitation test was tightened to merged 0703: finance and operative
invitations both refuse an inactive/demoted issuer. Added cases retain accepted
invitations, completed sends, other-company access and claimed/unknown outcomes.
The latter uses a fake adapter barrier across revocation, then verifies no second
delivery and unchanged unknown reconciliation. The suite also covers entered-code
sign-in, missing session, SSO-required refusal, removed/expired/contractor-revoked
owners, every existing non-owner role, expiry at target and audit locks, delegated
grant rollback on audit failure, PUBLIC/effective grants, overload inventory, forged
settings/digests, mutual races and sealed `auditActorRef`. No new execution or
invitation policy is inferred from those authored cases.

### Commands actually run

Installed Node **v24.17.0**, Vitest **4.1.12**, TypeScript **5.8.3**; package manager
is pinned to pnpm **10.28.1**. `pnpm --version` stalled before returning a version
and was interrupted. Used installed package-local binaries, with no downloads.
The initial unit imports failed because workspace `dist` outputs were absent;
compiled config, core, storage, AI, DB and API with their existing
`./node_modules/.bin/tsc -p tsconfig.json` (all PASS). This writes ignored local
outputs only. The identity unit's self-package import also passed after API output
was compiled; no source workaround or weakened assertion was used.

- In apps/api: `./node_modules/.bin/vitest run --maxWorkers=1 src/auth/member-administration.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts`:
  member administration **9 PASS**, context boundary **146 PASS**; identity initially
  failed its missing self-package output import. After compilation,
  `./node_modules/.bin/vitest run --maxWorkers=1 src/auth/identity.test.ts`:
  **10 PASS**. All 165 named tests passed across these runs.
- In packages/db: `./node_modules/.bin/vitest run --maxWorkers=1 test/migration-proof-loader.test.ts`:
  **77 PASS**, including the additive proof.
- In apps/api and packages/db: `./node_modules/.bin/tsc -p tsconfig.json --noEmit`:
  **PASS** for both.
- In packages/db: `./node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext --experimentalDecorators --emitDecoratorMetadata test/lp7-member-administration.integration.test.ts`:
  **PASS** after correcting the saved fixture's UUID parameter type. This checks
  integration-test types, not PostgreSQL behavior.
- In apps/api: `node --import tsx src/generate-openapi.ts`, followed by
  `node --import tsx src/generate-openapi.ts --check`: **PASS**.
- At repository root: `node tools/plpgsql-case-in-if-lint.mjs`: **PASS**, 424 migrations;
  `node tools/commercial-boundary-lint.mjs`: **PASS**;
  `node tools/commercial-integrity-current-source-guard.mjs`: **PASS**, 94 protected
  roots, zero diagnostics, ten existing baselined unresolved cases unchanged.
- `git diff --check`: **PASS**. A read-only working-tree check using the existing
  `loadLanePolicy`/`lanePathAllowed` exports and Git's tracked/untracked path lists:
  **PASS**, nine exact payload paths plus this branch's own lane file. The lane
  grants neither itself nor the legacy lane register.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs`:
  **REFUSED** its self-comparison because uncommitted HEAD equals origin/main.
  Run the ordinary CLI again after the router's commit; the working-tree check
  above is not a claim that the CLI passed.

### Remaining evidence and ordered landing

READY for the router's **NOPR=1 save**, not accepted or ready to merge. The sandbox
has performed no Git writes, commit, push, PR, PostgreSQL, browser, live service,
real-person/data, payment, deployment or release action. G0–G5 remain closed.
No unresolved implementation conflict or known failing local test remains.

1. **PostgreSQL behavior and mutation evidence pending.** In CI/the existing
   approved checker environment, execute LP-7's real identity-login, entered-code,
   mutual-removal/demotion barriers, stale-context, expiry, audit/grant rollback,
   invitation and queued/claimed/unknown tests. Run current identity, SSO,
   deactivation, invitation and outbox regressions. On a disposable scratch copy,
   remove only the last-owner refusal block from one LP-7 routine, run the
   corresponding `protects the last active owner` test and require failure, then
   restore the original migration/routine and require PASS. This mutation was
   **not executed** here because PostgreSQL is prohibited in this sandbox.
2. **Migration/catalogue evidence pending.** Execute fresh, repeat and populated
   upgrades, full required PostgreSQL suites, both existing successor suites,
   catalog/effective grants/RLS/LP-0 checks and applicable identity/browser journeys.
   Verify the new proof against actual call inventory and ACLs. No existing routine
   was replaced and no protected delta is currently identified; any newly exposed
   scanner, privilege-baseline or fingerprint delta belongs to its authorized owner,
   never a local waiver. Old branch-only 0785/0790/predecessor holds are historical
   and are not restored by this main-based construction.
3. **Review/CI/landing pending.** Router commits and saves the branch without a PR
   under NOPR=1. Recheck the lane CLI after commit. Obtain independent exact-head
   RED review and all required green CI against then-current main before ordered
   LP landing, one LP piece at a time after LP-6e. Reconcile reserved 0761 before
   landing. Do not run the superseded LP-7 leaf or include later LP repairs.

LATER / SIMPLICITY (retained initial-review observation): the owner/target/last-owner
checks are repeated in the two routines in `0763_member_administration.sql`.
A later reviewed private helper could centralize them so security fixes cannot drift
between removal and role changes. That would need separate privilege review; it
is non-blocking and outside this additive catch-up.
