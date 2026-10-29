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
