# MON-5 foundation — m5-signin (RED)

29 October 2026. Ben's emailed one-time link ruling; made-up data only.
Builder source inspection and local tests are not independent review or a release.
The router owns the finish-list/work-list handoff, commit, push and PR.

Implemented migration 0387, private tenant-scoped grant/session tables, identity-only
SQL entrypoints, owner/finance issuance and revocation, fake_email/.invalid outbox
artifacts, HMAC credentials, ten-minute single-use links, browser-session cookies,
one-hour non-sliding server cap, current-party/revision checks, uniform Nest/Next
refusals, a separate customer guard, and builder-route cookie refusal. The emailed
credential is a fragment removed before rendering or requesting redemption. Issuer
responses return only a grant identifier. Audit payloads contain identifiers only.
Existing quote and variation writers cannot accept a customer method label; the
additive method catalogue is available to the later authorized approval slices.
No quote acceptance, extras, stages, messages, cancellation kit or live provider
was implemented here. ENT-5 link behavior is unchanged.

The existing outbox executor now permits finance solely for the exact
customer_portal.signin.send action on fake_email. All other executor actions keep
the existing owner predicate. A real PostgreSQL regression covers this distinction.
The existing JSON-parser refusal filter adds only the new exact customer paths.

Migration: expand-only, with no changes to any migration on main or existing SQL
routine definitions. Existing history is preserved. Recovery is to disable the
five route adapters, cancel outstanding pending fictional deliveries and revoke
grants/sessions through the checked issuer entrypoint; retain rows for audit.
Correct any migration defect with a new forward migration after merge. No schema
rollback/delete is proposed. Shared LP-0 identity capabilities, tenancy tables,
SERIOUS-B5 and entitlement upgrade expectations are extended additively. Recorded
new routine definition hashes await PostgreSQL catalogue capture in CI.

Validation (final results appended below):

- Installed Node 24.17.0, TypeScript 5.8.3 and Vitest 4.1.12; tests use maxWorkers=1.
- The pnpm shim did not advance to the requested commands in this sandbox. Used
  the installed repository binaries directly; no package installation requested.
- Built config/core/storage/db/ai dependencies locally for real package resolution.
- Database suites and Playwright execution are deliberately left to GitHub CI:
  this sandbox cannot start PostgreSQL or bind localhost. Test collection is not
  database execution. The new CI suites cover concurrent redemption, invalid and
  stale scope, role refusal, revocation/expiry, privileges, upgrade preservation,
  fake-only finance delivery, and the browser cookie/replay/sign-out journey.
- Full green CI against current main and one independent Claude RED review of the
  exact pushed head remain merge gates. G1/D06 v2/D12 v3 and live release gates remain.

LATER / SIMPLICITY — apps/api/src/app.module.ts: the existing repeated workspace
provider factories could share one clearly named factory during the next module
wiring task, reducing duplicated composition and making guard injection easier
to inspect. This suggestion does not block this piece and is not refactored here.

Final local results:

- `tsc -p apps/api/tsconfig.json` passed (including emitted API build).
- `tsc -p apps/web/tsconfig.json --noEmit`, `tsc -p packages/db/tsconfig.json --noEmit`
  and `tsc -p packages/core/tsconfig.json --noEmit` passed.
- In apps/api: `vitest run --maxWorkers=1 src/auth/customer-signin.test.ts
  src/auth/sso/oidc-paths.test.ts src/watchdog-registry.test.ts` — 157 tests passed.
- In packages/db: `vitest run --maxWorkers=1 src/outbox.test.ts
  src/later-outbox.test.ts test/lp-0-catalog.test.ts` — 44 tests passed.
- Existing `src/auth/auth.test.ts` and `src/auth/identity.test.ts` — 22 tests passed
  after building their local dependency packages.
- `node tools/lint.mjs` passed: core purity, lane boundary, money arithmetic,
  commercial boundary and PL/pgSQL CASE checks. The lane's own file is implicitly
  editable under the lane convention and therefore excluded from its allow array;
  every other changed path matches that array exactly.
- In apps/api: `node --import ./node_modules/tsx/dist/loader.mjs
  src/generate-openapi.ts --check` passed. The tsx CLI's IPC pipe is unavailable in
  this sandbox; the installed Node loader runs the same generator without a pipe.
- `vitest list --maxWorkers=1 test/customer-signin.integration.test.ts` collected
  25 PostgreSQL cases; none executed locally. `playwright test --list --workers=1
  customer-signin.spec.ts` collected both browser projects; neither executed locally.
- `git diff --check` passed. No git-writing command was run.
- The pnpm shim eventually reported that registry fetches failed while verifying
  the pinned manager version. Its requested checks did not run through that shim;
  the successful results above come from the installed repository binaries.

Required CI follow-up: full typecheck/lint/test/build, real PostgreSQL tests,
mandatory migration/tenancy/LP-0/SERIOUS-B5/entitlement suites and Playwright.
No prompt/model/extraction path changed, so no new AI evaluation gate is introduced.

## PR #423 — CI repair try 1, 30 October 2026

Inspected the complete GitHub job logs for 123564851379 and 123564851420,
then the worktree after main was merged (0c57ddac). No unresolved conflicts.
Only the failing test fixtures and their regression coverage change; no product
behavior, migration or SQL routine is modified or recreated.

- Finance outbox negative-case fixture: PostgreSQL reported `42P08`, inconsistent
  types for `$1` (`text versus uuid`), at the insert into `app.action_outbox`.
  The same parameter was a bare UUID target and an explicit `$1::text` provider
  key. Pin both uses to UUID, then convert the provider key with `$1::uuid::text`.
  Preserve every forbidden-action/policy/recipient/amount case and assertion.
- SERIOUS-B5: the complete diff contains the same catalogue property values in
  different positions, including OIDC relations and policies. The OIDC helper
  inserts at final database positions while earlier-sorting customer objects are
  still absent; inserting customer objects later preserves that incorrect order
  among the already accumulated rows. The final customer union now sorts its
  retained historical rows and exact approved additions by their final database
  positions. It copies no new live metadata into historical expectations and
  accepts no extra catalogue objects. The full snapshot equality, repeat-migrate
  equality and all shared expectation-list rows remain intact.

Added a seven-line test-only ordering helper in the existing upgrade proof
utilities. Its regression reproduces OIDC/customer interleaving using distinct
snapshot objects; the original splice algorithm failed it locally. Negative
controls prove that changed historical privileges still fail equality and an
unapproved live row is not adopted. All three tests pass with the repair.

Validation:

- In packages/db, installed Vitest 4.1.12:
  `vitest run --maxWorkers=1 test/upgrade-proof-utils.test.ts` — 3 passed.
- Installed TypeScript:
  `tsc --noEmit --target ES2023 --module NodeNext --moduleResolution NodeNext
  --strict --skipLibCheck packages/db/test/upgrade-proof-utils.ts
  packages/db/test/upgrade-proof-utils.test.ts` — passed.
- In packages/db: `vitest list --maxWorkers=1
  test/customer-signin.integration.test.ts
  test/serious-b5-upgrade.integration.test.ts` — 26 cases collected, not executed.
- `node tools/agent-lane-boundary-lint.mjs` and `git diff --check` — passed.
- PostgreSQL is unavailable in this sandbox. Actual SQL execution and both
  previously failing database suites require the router's GitHub CI rerun.
  No git-writing commands, package downloads or live provider calls were used.

## Main catch-up — 30 October 2026

Catch-up only for MON-5 foundation / m5-signin (RED). Resolved all four
conflict blocks in docs/contracts/lp-0-effective-privileges-v1.json:
capability groups, routine ACL/owner entries, recorded routine definitions,
and forced-RLS records. Retained both customer sign-in and MON-1 additions;
all current-main group/entry/routine values are preserved exactly, including
main's removal of the obsolete counted-reader runtime grant. No behavior,
test expectations, or SQL routines changed. Migration 0387 remains unchanged;
no migration already on main was edited. SERIOUS-B5, entitlement and tenancy
expectation additions from both branches remain in the automatic merge.
The existing lane allow list exactly matches the diff against origin/main,
with its own lane file implicitly permitted; no lane widening was needed.

Local verification (installed binaries, no downloads):

- packages/db: `vitest run --maxWorkers=1 test/lp-0-catalog.test.ts
  test/upgrade-proof-utils.test.ts src/outbox.test.ts` — 35 passed.
- apps/api: `vitest run --maxWorkers=1 src/auth/customer-signin.test.ts
  src/watchdog-registry.test.ts src/meter-work-state.application.test.ts`
  — 159 passed.
- apps/api and packages/db: `tsc -p tsconfig.json --noEmit` — both passed.
- Core purity, money arithmetic, commercial boundary and PL/pgSQL CASE lint
  passed; `git diff --check` passed and no conflict markers remain.
- Structural inventory verification preserved exact current-main entries and
  exact branch customer entries, with no duplicate group/entry/routine keys.
- `node tools/lint.mjs` stopped at lane lint: its uncommitted-merge comparison
  includes incoming MON-1 paths. Direct path-set comparison against origin/main
  passes exactly. The router must stage the resolved file, finish the merge,
  and rerun the normal lane lint/CI; the index remains unmerged because git
  writes are prohibited here. This is not a full lint pass.

PostgreSQL, migration/upgrade and browser execution remain GitHub CI gates,
as does one independent Claude RED review against the final pushed head.
No git-writing commands were run.

## PR #423 — CI repair try 2, 30 October 2026

Inspected the full core-checks log for job 124188525009 at 902e0987 via the
GitHub connector (the local gh command could not reach api.github.com).
The worktree was clean, with no new merge conflicts.

Root cause: four real Next route imports in customer-signin.test.ts failed
before assertions with ERR_MODULE_NOT_FOUND for @jobguard/api/identity.
The export points to apps/api/dist/auth/index.js, but Turbo's API test task
builds dependencies (^build), not the API itself. Earlier local API output
masked this clean-CI ordering dependency. The test now maps the Next package
import to the actual source customer-signin module with a Vitest factory;
CustomerSigninApplication and customerHttp execute unchanged, and only the
existing identity-server fixture remains faked. No assertion was removed or
changed. This introduces no product or build-order behavior change.

Scoped every element locator in customer-signin.spec.ts to main, per the
repair brief, so document-level accessibility roles cannot interfere with
the product journey. Cookie, replay, cross-job, sign-out and all other
expectations remain unchanged. No migrations, SQL routines, shared database
expectation rows or lane paths changed.

Validation (installed binaries, no downloads):

- Temporarily renamed apps/api/dist, ran `vitest run --maxWorkers=1
  src/auth/customer-signin.test.ts`, and restored the directory in finally:
  all 26 tests passed without compiled API output. No output was deleted.
- apps/api: `vitest run --maxWorkers=1 src/auth/customer-signin.test.ts
  src/auth/sso/oidc-paths.test.ts` — 32 tests passed.
- apps/api and apps/web: `tsc -p tsconfig.json --noEmit` — both passed.
- apps/web: `playwright test --list --workers=1 customer-signin.spec.ts`
  collected both projects (2 cases); collection is not browser execution.
- `node tools/lint.mjs` — passed, including lane boundary and PL/pgSQL CASE;
  `git diff --check` — passed.

The router owns commit/push and the CI rerun. PostgreSQL and Playwright
execution, green CI against current main and independent exact-head Claude
RED review remain required. No git-writing command was run.


## PR #423 — current-main catch-up, 30 October 2026 17:39 UTC

MON-5 / m5-signin (RED), from a18dfe11. The router had already started the
merge of origin/main fb933151 (including #425 and migrations through 0381).
Resolved the single remaining LP-0 recorded-routines conflict by retaining
all six customer sign-in routines and main's private final-check lock-request
trigger function. No behavior or SQL routine was changed or recreated.

Verified the LP-0 groups, capability entries, authority paths, recorded routines,
RLS, policies and triggers equal the exact union of both sides, with no duplicate
rows; keyed groups/paths/routines also have unique keys. Every main value remains
exact. Source inspection of the shared SERIOUS-B5, entitlement and tenancy diffs
against origin/main confirms only the existing MON-5 additions; main's 0381
lock-request expectations and ACL assertions remain intact. All main lane files
and every migration on main are byte-identical to origin/main; 0387 is byte-identical
to a18dfe11. No older migration copies remain in the diff. In particular, main's
latest mon2_issue body in 0374 is untouched. The protected contract
`docs/contracts/lp-downstream-effects-v1.md` is unchanged against both sides.
The changed-path set against origin/main exactly equals the MON-5 lane allow
list plus its implicitly permitted own lane file; no lane widening was needed.

Local validation with installed Node 24.17.0, TypeScript 5.8.3 and Vitest 4.1.12
(no downloads, maxWorkers=1 per Vitest run, at most two test workers total):

- packages/db: `vitest run --maxWorkers=1 test/lp-0-catalog.test.ts
  test/upgrade-proof-utils.test.ts src/outbox.test.ts` — 35 passed.
- apps/api: `vitest run --maxWorkers=1 src/auth/customer-signin.test.ts
  src/auth/sso/oidc-paths.test.ts src/watchdog-registry.test.ts` — 157 passed.
- Installed `tsc -p <package>/tsconfig.json --noEmit` for apps/api, packages/db
  and apps/web — all passed.
- Core purity, money arithmetic, commercial boundary and PL/pgSQL CASE checks
  passed. `git diff --check` passed; no LP-0 conflict markers remain.
- `node tools/lint.mjs` stopped at lane lint because its uncommitted-merge
  comparison counts incoming main paths as branch changes. The independent
  exact path-set comparison against origin/main passes. This is not a full lint
  pass; rerun normal lane lint after the router stages the resolution and
  completes the existing merge. The Git index remains unmerged by design:
  no Git-writing commands were run in this sandbox.

Ready for router commit/push and CI. PostgreSQL, migration/upgrade and browser
execution cannot run in this sandbox and remain required CI gates. Full green
CI against current main and one independent Claude RED review of the exact
pushed head remain merge gates. This source inspection is not that review.

## PR #423 — merged-main verification, 30 October 2026 19:18 UTC

Verified the router's completed merge 667b017e (origin/main 48843eeb).
The worktree started clean, with no unmerged index entries or conflict markers.
The merge changes no LP-0 inventory, tenancy, SERIOUS-B5 or entitlement upgrade
expectations relative to its first parent; both sides' previously accumulated
expectation rows remain intact. No source, SQL, migration or expectation repair
was necessary. This update records verification only, within the existing lane.

Local checks used installed binaries (Node 24.17.0, Vitest 4.1.12), with
maxWorkers=1 per test process and at most two test workers total:

- apps/api: `vitest run --maxWorkers=1 src/auth/customer-signin.test.ts
  src/auth/sso/oidc-paths.test.ts src/watchdog-registry.test.ts` — 157 passed.
- packages/db: `vitest run --maxWorkers=1 test/lp-0-catalog.test.ts
  test/upgrade-proof-utils.test.ts src/outbox.test.ts` — 35 passed.
- Installed `tsc -p <package>/tsconfig.json --noEmit` for apps/api, packages/db
  and apps/web — all passed.
- `node tools/lint.mjs` — passed, including normal lane boundary lint now that
  the merge is complete, core purity, money arithmetic and PL/pgSQL CASE checks.
- `git diff --check` — passed. No git-writing commands were run.

Router owns commit/push and CI. Real PostgreSQL, migration/upgrade and browser
execution remain CI gates; none was executed or claimed here. Green CI against
current main and one independent Claude RED review of the exact pushed head
remain required before merge. No live providers or real customer data used.
