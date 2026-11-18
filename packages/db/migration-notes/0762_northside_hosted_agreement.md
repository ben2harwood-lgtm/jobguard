# Northside hosted agreement repair — ENT-11a/ENT-11b (RED)

Authorized leaf: `northside-hosted-agreement` (alias
`jobguard:ent-11b-hosted-northside`), based on origin/main
`d628c81222fffa6071aca9d366df9e050a1128c3`.

Fresh hosted Northside stopped on its first operative invitation because ordinary
contractor startup assigned the track but supplied no active MON-8 status. The
browser suite concealed that failure with an owner-only fixture; it separately
inserted enterprise terms and copied their database UUID into the statement form.

Migration `0762_northside_hosted_agreement.sql` replaces the complete current
0749 `northside_register(uuid,jsonb)` body. Its original request-binding, tenant,
persisted original-owner session, lifetime, made-up-company, active-switch,
settings and conflict checks remain. Registration now takes the matching
**exclusive** tenant fence before its existing switch lock and re-reads lifetime
after waiting. It additionally verifies the active original owner and the exact
server-generated first contractor assignment. Only that isolated fictional
Northside instance can obtain a missing initial status and immutable proposed
1/10 on-payment reference terms. Ordinary contractor startup is unchanged.

This is the scoped synthetic bootstrap authorized in this repair, not a general
MON-8 operations writer. Existing inactive/suspended status refuses, including
retries; revoked/expired sessions and revoked owners refuse. No status revision
is overwritten or restored, and an unrelated existing enterprise agreement
causes conflict. The setup facts, run and identifier-only provisioning audit
commit atomically. A retry creates no extra facts or audit events. No actual
agreement, mandate, approval, invoice, charge or external action is created.

The new exact runtime EXECUTE entrypoint `ef_derive_northside(uuid,uuid,text)`
accepts a session, command and month. It verifies the actual synthetic database,
bound actor/tenant, existing finance/entitlement authority and this session's
persisted Northside run, resolves its fictional agreement on the server, then
calls the unchanged `ef_derive`. The original derivation, statement, approval,
posting, dispute, replay, exact money, RLS and audit controls remain authoritative.
There are no table grants, policies, columns, new tables or historical backfills.
The proof fragment chains the exact 0749 routine protection record, registers
both resulting definitions and the new routine's owner/ACL, and records its
upgrade catalogue addition. The existing runtime classification names it.

The statement form now needs only a month. Successful reads retain a scoped
statement link in the URL; refresh/reopen reauthenticates and reads the stored
statement. An identifier in a URL grants no read or financial authority. The
existing explicit reload control remains available.

ENT-11a/11b no longer intercept startup to inject entitlement. ENT-11b no longer
inserts enterprise terms. Its original photo, approvals, export, billed,
part-paid, paid, statement and dashboard figure assertions remain, with added
saved-link refresh/reopen assertions. Database reads still independently check
the displayed figures. The DB Northside happy-path fixture also starts without
privileged agreement seeding. Existing negative entitlement suites are unchanged.
New PostgreSQL coverage exercises missing setup, concurrent retries, reset,
inactive/suspended status, expired/revoked sessions, revoked owner, tenant/actor
mismatch, finance-only statement selection/replay, actual non-synthetic database
refusal, own-step populated upgrade, repeated migration and retained privileges.

Migration ordering is reconciled: hosted blocker PR #839 goes first as 0761 above
main's 0760; LP7 has no open PR and its unlanded placeholder moves to the next
free number at its own integration. Northside is not renamed in this repair.
Discovery registers the migration; landed 0138/0549/0749 are
untouched. Apply before the new statement route. Forward fix only: disable the
Northside entrypoint or ship a reviewed additive routine repair; preserve run,
status, terms, audit and financial histories. Never roll back by deleting facts.

Validation is recorded below after the actual local checks. This sandbox cannot
start PostgreSQL or bind localhost; source/unit checks are not database or browser
proof. The router/checker must run the new hosted-agreement integration and
upgrade suites, Northside DB integration, ENT-11a and ENT-11b on both widths,
full mandatory database/migration/tenant/privilege suites and required CI against
current main. Exact-head independent Claude RED PASS is required before
independent integration. Release remains with the existing release owner; fresh
hosted acceptance after its verified pin must also cover Start my own practice
firm through the saved paid report. No deployment or messages were sent.

LATER / SIMPLICITY — `packages/db/src/enterprise-fee-repository.ts`:
`enterpriseFeeDeriveCommandV1` duplicates the existing `period` validator's month
regex. Moving that validator before the derive schema and reusing it would remove
two separately maintained definitions of the accepted month range without
changing any boundary version. Deferred to keep this repair focused.

## Executed local validation

Installed Node 24.17.0, Vitest 4.1.12, TypeScript 5.8.3. Every Vitest run used
`--maxWorkers=2`, no more than three named files, with runs serialized:

- From `packages/db`, `node node_modules/vitest/vitest.mjs run --maxWorkers=2
  src/enterprise-fee-northside.test.ts test/northside-hosted-agreement.test.ts
  test/migration-proof-loader.test.ts`: **81 passed**.
- From `apps/web`, `node node_modules/vitest/vitest.mjs run --maxWorkers=2
  'app/api/contractor/statements/[action]/route.test.ts'
  app/ui/enterprise-statement.test.tsx app/api/northside/route.test.ts`:
  **19 passed**.
- From `packages/db`, `node node_modules/vitest/vitest.mjs run --maxWorkers=2
  test/lp6d-routines.test.ts test/contractor-entitlement-snapshot.test.ts`:
  **40 passed**. Total **140 passed**.
- Direct installed `node node_modules/typescript/bin/tsc -p <package>/tsconfig.json
  --noEmit` passed for **all seven** packages: config, core, storage, db, ai, api
  and web. Config/core/storage/db/ai compilation also supplied ignored `dist`
  artifacts needed for unit discovery. No dependency download or package change.
- `node tools/plpgsql-case-in-if-lint.mjs`,
  `node tools/money-arithmetic-lint.mjs`,
  `node tools/commercial-boundary-lint.mjs` and `git diff --check` passed.
- `node tools/agent-lane-boundary-lint.mjs` refused its commit comparison because
  read-only HEAD equals origin/main; it is **not** recorded as PASS. Using the
  same tool's exported `loadLanePolicy`, `selectLane`, `lanePathAllowed` and
  `migrationOrderViolations` on `git diff` plus untracked paths passed **all 18
  paths and 0761's order** against origin/main. The normal commit-range gate must
  run after the launcher commits. No policy bypass or Git write was used.

The first unit discovery failed because workspace `dist` dependencies did not
exist; compiling installed workspace sources fixed discovery. The first new
source-preservation assertion exposed its own comment-normalization error;
correcting both sides' normalization retained all original SQL statements and
made the final regression pass. No product guard or existing assertion was
removed. `pnpm typecheck --concurrency=2` and direct Turbo stalled in the local
pnpm wrapper before completing checks; they were interrupted. Aggregate wrapper
success is not claimed; the seven direct compiler checks above are the evidence.

**Not run / required from checker or CI:**
`northside-hosted-agreement.integration.test.ts`,
`northside-hosted-agreement-upgrade.integration.test.ts`,
`northside-demo.integration.test.ts`, the full `pnpm test:db` and
`pnpm test:migrations` gates (including SERIOUS-B5/tenant/privilege checks),
Playwright `ENT-11a.spec.ts` and `ENT-11b.spec.ts` at phone/desktop widths,
full required CI/build/lint and exact-head independent Claude RED review.
PostgreSQL and localhost/browser execution are unavailable in this sandbox.
Hosted Northside and own-practice saved-paid-report acceptance remain the source
owner's work after the release owner verifies the reviewed synthetic live pin.

## Repair 1 — explicit catalogue successor registration

Starting head `30fb1edddc71b029d3f8101057877b10648ad517`, base
`d628c81222fffa6071aca9d366df9e050a1128c3`, same piece and PR #839.
Required CI run `44155005339`, core-db(4) job `134293263052`, exposed two
explicit body maps still selecting 0749's `app.northside_register` definition.
`migfix-7-upgrade.integration.test.ts` and
`plan-entitlement-lifecycle-upgrade.integration.test.ts` now register the complete
0761 body in their existing LP-6d successor maps. The exact current proof remains
unchanged and is still consumed by their existing metadata/privilege comparisons.
All existing assertions, negative cases, historical bodies and replay checks
remain. No production code, SQL, proof fingerprint or dependency was changed.

Adjacent inspection found no further explicit Northside registration omission.
`enterprise-access-upgrade.integration.test.ts` discovers CREATE OR REPLACE
successors from migration URLs, so it already recognizes 0761 while retaining
its owner/ACL/security/settings comparisons. Northside's own populated upgrade
test retains its privilege checks. Lane registration includes both repaired tests.
ENT-11a/ENT-11b and all new targeted tests remain unchanged.

Executed locally with installed Node 24.17.0 and Vitest 4.1.12:

- From `packages/db`, `node node_modules/vitest/vitest.mjs run --maxWorkers=2
  test/northside-hosted-agreement.test.ts test/migration-proof-loader.test.ts
  test/lp6d-routines.test.ts`: **111 passed**, including current proof discovery,
  effective inventory comparison and original Northside guard preservation.
- From the repository root, `node node_modules/typescript/bin/tsc -p
  packages/db/tsconfig.json --noEmit` and the same command with
  `apps/web/tsconfig.json`: both **passed**.
- `LANE_BASE_REF=d628c812 node tools/agent-lane-boundary-lint.mjs`: **passed**,
  including the original piece and uncommitted repair paths and migration order.
- Installed TypeScript `transpileModule` syntax checks passed for both repaired
  integration files; this is syntax validation, not execution or typechecking of
  those database tests. `git diff --check` also passed.

PostgreSQL and browser execution remain unavailable here; no second database or
browser run was started. Required real-PostgreSQL recheck must include
`migfix-7-upgrade.integration.test.ts`,
`plan-entitlement-lifecycle-upgrade.integration.test.ts` and
`enterprise-access-upgrade.integration.test.ts`, plus the existing focused proof
validation. Preserve the existing controller's production-browser run on the
immutable public 30fb1edd snapshot; that evidence is not a resulting-head CI pass.
Required CI and an independent Claude RED delta PASS on the resulting full head
remain outstanding. Dependency-review independently fails on the reported
picomatch 4.0.4/4.0.7 advisory `GHSA-fc5q-39xc-vjpf`, with no patched version
reported. Resolving that prerequisite remains an explicit integration gate; this
scoped repair changes neither dependencies nor audit exceptions.
