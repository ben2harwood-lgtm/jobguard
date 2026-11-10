# 0942 — identity-linked fictional practice

Piece `real-wayin-linked-practice`, RED (sessions, tenancy, immutable ownership).
Base inspected: `ae125e625` on `codex/sandbox/real-wayin-linked-practice`; no stacked branches.
M0-6L and LP-6a–d remain separate contracts. No web entry is activated.

Three private control-plane associations separate an identity company's active practice
namespace, historical namespace identities and per-parent-session credentials. These
are identity/control-plane exceptions, owned by the existing migration role, with
RLS enabled and no runtime/identity/infrastructure table grants. Namespace rows are
**not credentials**. Both namespaces and credential digests reference existing
practice_session rows; business jobs remain in the existing synthetic tenant and
retain their immutable ownership digest. No anonymous ownership is transferred.

The identity-role entry helper uses the existing identity provider's HMAC-SHA256 of
`session:` plus token. Each entry returns a fresh random UUID practice credential;
only its SHA-256 digest is stored. Retrying a lost reply mints another credential
on the same namespace. There is no stored token to recover. SQL validates the
parent's database/environment, liveness and exactly one effective owner membership,
using `identity.sso_session_memberships` and `identity.sso_session_scope`.

Lock order is tenant administration key 54 shared, parent session SHARE, identity
membership locator SHARE, exact membership SHARE, company association, namespace,
credential. Entry/reset also serialize absence on tenant key 942 before locking
the association exclusively. Authentication holds the association SHARE, then
namespace and credential SHARE. Reset never locks another device's parent. Parent
sign-out updates the parent row; membership removal/revocation conflicts with the
locator/member row locks; contractor administration's key 54 conflicts with the
shared key. Every mutable lifecycle fact is checked again after waits. These locks
last through transaction commit, so a revocation/reset either precedes and refuses
a write, or follows its valid commit. Binding expiry is capped by credential,
namespace, parent and membership expiry, and the protected reader checks time.
The eight race cases use actual job writes and observed pg_blocking_pids waits.

The authenticating digest stays in VerifiedTenantContext's existing private
WeakMap. Ownership queries receive the canonical digest. LP-6 practice binding
validates the credential before hashing `lp6-home:` plus canonical owner for the
existing session reference. Canonical digests cannot establish bindings. The new
private binding-owner predicate permits internal canonical-owner authentication
only in that matching protected practice transaction; actor/tenant equality and
material GUCs are insufficient. Authentication does not call binding.

`isBlankPracticeCompany(pool, digest, context)` supports canonical-owner checks in
a validated bound transaction; its two-argument anonymous/credential callers remain
compatible. The web successor must supply context when passing a canonical digest.
The legacy start/reset/issue routines reject linked markers, including direct SQL.
The existing sample trigger's identity and pinned definition remain unchanged;
its routine now checks private markers before any seeding, even when the WHEN
expression cannot authenticate a non-credential namespace. Markers precede
practice_session inserts through deferred foreign keys. This preserves anonymous
sample behavior while linked namespace/device/retry inserts create no jobs.

Complexity is confined to lifecycle validation and the existing SQL boundaries.
Small guarded pg_get_functiondef patches retain the installed legacy routine bodies,
grants and signatures rather than copying their business logic. The anonymous
authority body is retained privately to keep canonical-owner checks independent of
binding validation. The TypeScript authentication query retains an undefined-function
fallback for supported pre-0942 anonymous upgrade fixtures. Existing non-null
authentication and sample-trigger fingerprints remain non-null in the proof.

Forward fix only. Do not remove the association tables, clear ownership or revive
old namespaces. A faulty rollout should disable linked entry while retaining all
historical rows; ship a reviewed corrective migration. D04 and G1–G5 remain closed.
No real data, provider, delivery, payment, deployment or launch is enabled.

Validation performed locally:

- `./packages/core/node_modules/.bin/tsc -p packages/core/tsconfig.json` — passed.
- `./packages/storage/node_modules/.bin/tsc -p packages/storage/tsconfig.json` — passed.
- `./packages/db/node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- `./packages/db/node_modules/.bin/tsc -p /tmp/real-wayin-linked-practice-tsconfig.json`
  — passed; temporary config extends the repository config and includes both new integration files.
- From packages/db, `./node_modules/.bin/vitest run --maxWorkers=1 src/blank-practice-company.test.ts test/lp6b-withtenant.test.ts test/migration-proof-loader.test.ts`
  — 3 files, 99 tests passed. Initial run lacked compiled core/storage exports;
  built those existing packages and reran successfully.
- Vitest `list --maxWorkers=1` collects the two new integration files. Collection
  is not execution or PostgreSQL evidence.
- `git diff --check` — passed.

`pnpm --filter @jobguard/db typecheck` could not start: the installed pnpm launcher
attempted to select 10.28.1 and refused when registry signature retrieval failed
(network fetch failure). No package downloads or version-check bypass was used;
local checks used already-installed TypeScript/Vitest executables instead.

Not run here (sandbox cannot start PostgreSQL or bind localhost):

- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/real-wayin-linked-practice.integration.test.ts test/real-wayin-linked-practice-races.integration.test.ts test/practice-session.integration.test.ts`
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/blank-practice-company.integration.test.ts test/identity.integration.test.ts`
- `pnpm test:db`; `pnpm test:migrations`; fresh/upgrade catalogue and grant comparisons.
- Existing LP-6b/c PostgreSQL checks, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` in current-main CI.
- `pnpm --filter @jobguard/web test:e2e --workers=1 --project=mobile-360 --project=desktop` (anonymous 390px compatibility belongs to the unchanged entry journey).

The named regression is included, with an upgrade assertion that entry is absent
before 0942, but failing-before/passing-after and all lifecycle/race/commercial
results still require actual PostgreSQL evidence. The independent RED checker must
run these on the router's exact committed head. No self-review or merge occurred.


## Repair 1 — owner fixture and successor upgrade rows (10 November 2026)

READY for router commit and CI; RED independent review remains required.

Source inspection traced the initial `n<>1` refusal to zero effective memberships:
`0150_membership_authority_fix.sql` defines `identity.current_memberships` with
an inner join to `identity.user_email`. The LP job-door actor supplies the identity,
account and owner membership; these tests added the locator/session but omitted
that email. `identity.provision_verified_challenge` creates the email during a
real sign-up. Both linked-practice fixture paths now include it. Production SQL,
including both exactly-one checks and all revocation/expiry checks, is unchanged.

Added PostgreSQL regressions for the actual PersistedAuthProvider sign-up path
through linked entry/authentication, and for zero effective memberships without
an email becoming exactly one after the email is supplied. Existing multiple-
membership refusal and all eight lock races remain collected for CI execution.

Registered the three new control-plane tables as empty in later-empty-tables.ts
(used by migfix-7 and plan-entitlement upgrades) and extra-proceed's replay list.
The 0942 proof already contains all three exact `rows` additions with `before:
null` and `data: []`; those existing proof rows are retained unchanged.

Local checks, using the installed binaries without package downloads:

- `packages/db/node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- `apps/api/node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` — passed.
- `node tools/agent-lane-boundary-lint.mjs --lane=real-wayin-linked-practice` — passed.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=1 src/blank-practice-company.test.ts test/migration-proof-loader.test.ts` — 83 passed, 2 files.
- From packages/db: `./node_modules/.bin/vitest list --maxWorkers=1 test/real-wayin-linked-practice.integration.test.ts test/real-wayin-linked-practice-races.integration.test.ts test/extra-proceed-upgrade.integration.test.ts` — 24 cases collected, including all eight races. Collection only.
- `git diff --check` — passed.

PostgreSQL was not run. Database/browser execution is unavailable in this sandbox.
CI must execute the linked journey, races, migfix-7, plan-entitlement and extra-
proceed upgrades after the router pushes. No Git writes, push, PR or merge here.
The referenced coordinator precheck file was absent from this checkout; diagnosis
used the supplied failure report and inspected source/callers/tests.

LATER / SIMPLICITY (initial inspection):
`packages/db/migrations/0942_identity_linked_practice.sql`, legacy routine patch
loop: replace the three body overlays with explicit latest routine definitions
in a separate focused change. This would make guard placement reviewable without
depending on string positions. Deferred optional work to keep this repair focused;
it does not block the fixture and upgrade-list corrections.
