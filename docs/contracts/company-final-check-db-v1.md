# Company Final Check database v1

DEMO-S-FC-COMPANY-DB · DEMO-S / MON-3 · RED + second security check required.

Status: blocked at source inspection; no company entry point implemented or granted.
Slice 1 remains dark: no API or web route exists as part of this piece. Migration
0951_company_final_check remains reserved and unwritten. No repository, migration
proof, or company integration test is supplied: there is no implemented authority
to certify. This document is a named-holds handoff, not an acceptance claim.

## Scope and decision

The issued decision is: “accept slice 1 only, exactly as section 2 and section 4
slice 1 of the design describe.” The inspected design is
`docs/contracts/company-final-check-authority-v1.md` at commit `7fb2c4bbd`
on `origin/codex/sandbox/demo-s-trial-fc-design`; it was read without merging.

The intended additions are separate company-only checked assemble/read, scope
disposition/terms, lock, request-run and reveal routines owned by
`jobguard_migration`, with runtime execution only on those new entry points.
Existing `final_check_builder` and all callers must remain unchanged. No table
SELECT, new role, role membership, practice impersonation or shadow grant is
permitted. None of those additions has been made.

## Named holds for landing

All proposed entry points are omitted: **assemble, read final account, record
scope disposition, accept terms, lock, request-run, and reveal**. They share one
unresolved prerequisite: protected, company-only session authority accessible to
the required routine owner, without widening existing authority.

Evidence in current source:

- `0562_lp6a_request_binding.sql` stores `credential_kind`, `session_ref`, actor,
  tenant and expiry in `control_plane.request_binding`, owned by
  `jobguard_binding_owner`. It explicitly revokes all table privileges from
  `jobguard_migration` as well as runtime. Reading this table is outside scope.
- `app.lp6_bound_request()` exposes that protected row, but is owned by
  `jobguard_binding_owner`; PUBLIC execution is revoked and no execution grant
  to `jobguard_migration` exists. The temporary migration role membership is
  not a retained business capability: `src/demo-bootstrap.ts` grants it only
  around migration execution and revokes it in `finally`. Changing role
  membership is forbidden. A migration-time grant would widen existing private
  routine execution; that is not one of the new company entry points.
- `app.current_actor()` and `app.current_tenant()` expose only actor and tenant.
  Their execution is granted to runtime, not the specified definer owner, after
  PUBLIC execution is revoked. Even granting their execution alone would not
  prove credential kind: real, practice and contractor-practice bindings all
  populate actor/tenant through `bind_request`.
- `0658_lp6b_effective_session_actor.sql` replaces only
  `app.lp6_session_authority(text,text,uuid)`. It does not add protected kind or
  session-reference access. That helper requires the credential; a new routine
  cannot recover it from `withTenant`, which deliberately keeps it private.
- `lp6a-binding.integration.test.ts` already requires denial of private helper
  access to runtime and absence of retained binding-owner memberships. Those
  tests are unchanged. No live catalogue inspection was possible here.

A caller-supplied kind, digest, actor, tenant setting, or the existence of an
active identity session for an actor cannot prove that this transaction was
bound with that real session. A null practice digest on the job cannot prove
that either, and does not exclude imported practice descendants. Wrapping an
existing routine without this distinction would violate the issued decision.
An always-refusing or partially checked entry point would not satisfy slice 1.

Before reissuing this piece, resolve an explicitly reviewed protected authority
interface that proves the real binding and permits the prescribed owner to use
it, including current session/member checks after waits and before replay.
Any change to existing accessors, ownership, privileges, catalogue or pins needs
its own authorised scope; it was not performed here. Then implement and test
company-job ownership, practice-lineage exclusion, immutable lock/replay,
request-after-lock, completed-run gates, fixed pre-lock reveal, and unchanged
financial rows/grants as specified in the original brief.

## Validation and remaining work

Local evidence is recorded in the router commit-message handoff. No PostgreSQL,
browser, provider, real account, key, customer data or money was used. Existing
SQL routines, callers, grants and tests are untouched. Database integration,
upgrade/catalogue, pre-lock noninterference, financial isolation and scratch
session-check mutation proofs have not run. Company integration tests were not
authored because no company entry point could meet the authority prerequisite.

Slices 2–3, company illustration and fee illustration remain unbuilt. This
handoff does not complete DEMO-S or MON-3 and does not authorise a release.
