# 0733 — identity-linked fictional practice

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
Full CREATE OR REPLACE definitions retain the latest legacy routine bodies plus
only this piece’s marker guards. Existing owners, grants and signatures remain
unchanged. The original pg_get_functiondef overlays were replaced in repair 2. The anonymous
authority body is retained privately to keep canonical-owner checks independent of
binding validation. The TypeScript authentication query retains an undefined-function
fallback for supported pre-0733 anonymous upgrade fixtures. Existing non-null
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
before 0733, but failing-before/passing-after and all lifecycle/race/commercial
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
The 0733 proof already contains all three exact `rows` additions with `before:
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
`packages/db/migrations/0734_identity_linked_practice.sql`, legacy routine patch
loop: replace the three body overlays with explicit latest routine definitions
in a separate focused change. This would make guard placement reviewable without
depending on string positions. Deferred optional work to keep this repair focused;
it does not block the fixture and upgrade-list corrections.


## Repair 2 — explicit latest bodies and upgrade pins (10 November 2026)

READY for router commit, NOPR; RED (sign-in/sessions). PostgreSQL was not run.

0733 now recreates `seed_saved_v1_sample`, `issue_practice_session`,
`start_blank_practice_company` and `start_blank_practice_company_v2` with complete
CREATE OR REPLACE statements. Their source migrations (0109, 0356, 0657, 0687)
match origin/main byte-for-byte at 98c839494. A source-only comparison reconstructed
the previous overlays and confirmed all four resulting bodies are byte-identical,
including whitespace. This completes the repair-1 LATER / SIMPLICITY item above:
guard placement is explicit and no longer depends on runtime string patching.

Both migfix-7 and plan-entitlement upgrade tests pin those four routines plus
`authenticate_practice_session`, `lp6_session_authority` and
`is_blank_practice_company` to 0733. Removed the stale 0657/0658 pins and the
plan-entitlement special case that still compared the LP-6 predecessor header/body.
Existing proof replay still checks complete routine privilege/security metadata.
The existing replacement parser ignores DEFAULT clauses when matching exact
identity arguments. A source-only check exercised both pin tables and confirmed
all seven identities select the same complete bodies, including default arguments.
A nullable proof-record access in migfix-7's latest-body lookup now uses optional
chaining for every field; absent after-records remain excluded.

The proof now supplies source-derived PostgreSQL 16 definition fingerprints for
the three legacy void routines that previously had null after-fingerprints.
The sample trigger fingerprint remains exactly unchanged and was checked against
its full definition rendering. Existing non-null fingerprints, before-records,
ACLs, tables, row proofs, signatures and trigger definition remain unchanged.
No new domain behavior, migration number, external action or release permission.

Local validation (installed binaries, no downloads):

- `./packages/db/node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- `./packages/db/node_modules/.bin/tsc -p /tmp/real-wayin-linked-practice-repair2-tsconfig.json`
  — passed after correcting the nullable proof access; temporary config includes
  both changed upgrade test files. The first run found that existing access.
- `node tools/agent-lane-boundary-lint.mjs --lane=real-wayin-linked-practice` — passed.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=1 src/blank-practice-company.test.ts test/migration-proof-loader.test.ts`
  — 83 passed, 2 files, Vitest 4.1.12.
- Source-only body-equivalence and seven-identity pin extraction assertions — passed.
- `git diff --check` — passed.

The coordinator reports the previous-head linked journey/race files passed 23/23
on real PostgreSQL. That is supplied evidence for the overlay implementation,
not execution evidence for this repair. PostgreSQL and browser suites were not
run here: this sandbox cannot start PostgreSQL or bind localhost. CI after the
router pushes must execute the linked journey/races, migfix-7 and plan-entitlement
upgrades, and the required current-main checks. Independent exact-head RED review
remains required. No Git writes, commit, push, PR or merge occurred here.


## Preparation — 0733 renumber and merged-main unions (11 November 2026)

READY for router commit; preparation only, NOPR, RED (practice sign-in/session
boundary). Landing approval remains with the router; this is no launch approval.

Renamed migration, proof and note from 0942 to 0733. SQL bytes are identical;
proof bytes differ only by migration-name references. Updated both upgrade pin
lists and the linked-practice upgrade fixture. The lane allows both old deleted
paths and new paths. Conflict resolution takes the union: all three identity
practice tables plus main's firm_profile, and all seven linked-practice routine
pins plus main's two 0727 billing-export routine pins. No behavior or other test
expectation changed.

Source inspection of the merged migration tree found the latest predecessor
bodies at 0109, 0185, 0356, 0657, 0658 and 0687. Source assertions confirmed the
four legacy bodies equal those latest bodies plus the existing private-marker
guards, anonymous authority retains the complete latest authentication body,
and LP6 retains its latest body plus the existing linked-practice prelude.
The blank-company predicate retains the previously reviewed linked-owner change.
No SQL rewrite was necessary. No Git command was run, including for inspection.

Protected packages/db/src/practice-session.ts is byte-identical to the start of
this preparation. Its pre-0942 historical comment, protected pin and bridge hash
were deliberately left untouched for the router. Advisory-lock key 942 is an
existing runtime key, not a migration reference, and remains unchanged in both
SQL and its description to preserve identical migration content.

Local validation (installed tools, no downloads, headless, one Vitest worker):

- From packages/db, ./node_modules/.bin/vitest run --maxWorkers=1
  src/blank-practice-company.test.ts test/migration-proof-loader.test.ts
  test/extra-proceed-migration.test.ts — 85 passed, three files.
- From packages/db, ./node_modules/.bin/vitest run --maxWorkers=1
  test/lp-0-catalog.test.ts test/lp6a-binding.test.ts — 33 passed, two files.
- ./packages/db/node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit — passed.
- ./packages/db/node_modules/.bin/tsc -p
  /tmp/real-wayin-linked-practice-renumber-tsconfig.json — passed; includes linked
  practice, extra-proceed, migfix-7 and plan-entitlement upgrade tests.
- Source assertions — identical SQL, name-only proof changes, unchanged protected
  source, latest-body preservation and conflict unions passed.
- Source-only lane validation using the existing loadLanePolicy/selectLane/
  lanePathAllowed/migrationOrderViolations exports printed "Lane boundary passed";
  registered branch, declared changed/deleted paths and 0733 above merged-main
  migrations passed. The Git-backed diff/CLI check was not run because Git commands
  are forbidden here. The router/CI must perform the full diff-based lane lint.

PostgreSQL and browser suites were not run: the sandbox cannot start PostgreSQL
or bind localhost. CI must prove fresh install and upgrade to 0733, migration
replay, preserved historical rows/catalog metadata/ACLs/RLS, exact latest routine
bodies, linked-session/namespace separation, parent expiry/revocation and owner
membership checks, entry/reset serialization and race outcomes. Run linked-practice
journey/races, extra-proceed, migfix-7 and plan-entitlement upgrade suites plus
required migration/tenant and browser journeys after the router pushes. The
protected S9 practice-session bridge pin must be refreshed separately by the
router; it was not changed to make a check pass. Exact-head RED review and green
required CI remain necessary before landing.
