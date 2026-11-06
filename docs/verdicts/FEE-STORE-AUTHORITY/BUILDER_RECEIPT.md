# Current-main catch-up — READY for router commit (RED)

Plan piece: fee-store-authority, existing PR #579, branch
`codex/sandbox/fee-store-authority`. Catch-up against origin/main and MERGE_HEAD
`68b104767b18fad6fc5b9676f95bcd7d68bcc19d` (#576, #577 and #580 merged).
This section supersedes the earlier enterprise-test repair below.

Resolved the sole textual conflict by restoring main's enterprise-access-upgrade
integration test byte-for-byte, including #578/#580's authority assertions. Removed
that test from this lane: it has no diff from main. No test expectation or product
behavior was changed. The later-empty-tables registry is the exact union of both
sides. All main migration files, including 0614–0618, remain byte-identical; the
only migration added relative to main is reserved 0619, with no duplicate stem.

Inspected every main migration for replacement fee-book definitions: 0608 remains
the latest body, with no successor through 0618. Diffed the 0619 three-argument
routine against that latest main body: all predecessor tenant, shape, duplicate,
identity, transition, event and audit guards remain. The existing authority delta
adds strict shapes, signed synthetic results and private archive/audit sealing;
its only replaced persistence is database-owned compaction. The two-argument
wrapper delegates to that guarded body with NULL result proof. The seal helper is
new, with no main predecessor to overwrite. No stale routine body needed changing.

Current local checks (installed binaries, no downloads):
- apps/api: `./node_modules/.bin/vitest run src/fee-collection/postgres-reservation-store.test.ts src/fee-collection/executor.test.ts src/fee-collection/fake-gocardless.test.ts --maxWorkers=2` — 116 passed.
- packages/db: `./node_modules/.bin/vitest run test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts --maxWorkers=2` — 108 passed.
- Root: `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` and
  `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- packages/db: `./node_modules/.bin/vitest list test/enterprise-access-upgrade.integration.test.ts test/fee-reservation.integration.test.ts test/fee-reservation-archive-upgrade.integration.test.ts --maxWorkers=2` — collected; no PostgreSQL execution.
- Money arithmetic, commercial boundary and PL/pgSQL CASE-in-IF lints — passed.
- Read-only assertions using the lane tool's exported helpers — exact 12-path
  lane excluding config/lanes, no self-entry, migration order, main test bytes and
  table-registry union passed. All main migration bytes matched.
- `git diff --check` and `git diff origin/main --check` — passed.

No git-writing commands ran. The read-only index still records the conflict;
router must stage the resolved working file, finish the pending merge, commit
and push this same branch to update #579. GitHub CI owns PostgreSQL, migration
and browser suites; independent RED review must cover the resulting exact head.
No new behavior, complexity, policy, provider access, production activation or
release. Prior LATER / SIMPLICITY observation remains below; no new review finding.

# CI repair try 1 — READY for router commit (RED)

Plan piece: fee-store-authority, PR #579. Repair based on `cd5519caa`, which
already merges current main (including #578). No application behavior or SQL
migration was changed, and no migration renumber or policy decision is needed.

Failed CI run: 42113294900 at e975ff02. The CLI could not reach api.github.com;
read the actual job logs through the connected GitHub API instead.
- core-db (2), job 127546217429: one failure, 199 files / 1447 tests passed.
  `enterprise-access-upgrade.integration.test.ts` compared pre-0612 catalogue
  authority against the entire later chain. Migration 0619 intentionally removes
  runtime archive INSERT and adds the private seal writer. The expected old
  `fee_reservation_archive` ACL therefore cannot equal the final ACL.
- core, job 127560007494: aggregate failed only because core-db failed;
  core-checks succeeded.
- checks, job 127564365278: aggregate failed only because core failed;
  web, secrets and dependency-review succeeded. No CI gate was edited.

Repair: apply and register the two named enterprise migrations (0612 and 0613)
using the existing harness's SQL/bookkeeping pattern, then compare every prior
relation, routine (including exact body), and policy without successor exclusions.
Next run the whole migration chain, snapshot its catalogue, replay it and assert
exact catalogue equality. Populated identity data equality is checked both after
the own upgrade and after full replay. Existing empty/default-OFF, RLS, ownership,
runtime privilege and SCIM role assertions remain. This preserves main's intent
that later replacements have their own proofs, while removing its routine-name
regex carve-out and preventing unrelated later authority changes from invalidating
the own-upgrade assertion. The lane adds only the failing test path.

Validation, using installed binaries, no downloads:
- packages/db: `./node_modules/.bin/vitest run test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts --maxWorkers=2` — 108 passed.
- Root: `./node_modules/.bin/tsc -p /tmp/fee-store-authority-repair-tsconfig.json` — passed. Temporary config extends the repository strict tsconfig, uses noEmit, and compiles the changed integration test and its imports.
- packages/db: `./node_modules/.bin/vitest list test/enterprise-access-upgrade.integration.test.ts test/fee-reservation.integration.test.ts test/fee-reservation-archive-upgrade.integration.test.ts --maxWorkers=2` — 31 cases collected; collection only.
- Root: `node tools/agent-lane-boundary-lint.mjs --lane=fee-store-authority` and `git diff --check` — passed.

PostgreSQL/browser execution is prohibited in this sandbox. CI must execute the
repaired integration test and mandatory database/migration suites after router
commit/push; an independent RED review remains required at the resulting exact
head. No git-writing commands ran. No new complexity or behavior was introduced.
The initial LATER / SIMPLICITY observation remains in the earlier receipt below;
this repair adds no second review finding.

# READY — fee-store authority fix (RED)

Plan piece: fee-store-authority; branch `codex/sandbox/fee-store-authority`.
Ready for the router to finish the existing merge, commit, push and open the PR.
This section supersedes the earlier NOPR/stem/lane handoff below. No git-writing
command, PostgreSQL server, browser, provider call or live activation ran here.

The sole textual conflict, `packages/db/test/later-empty-tables.ts`, is resolved
as the exact union of HEAD and origin/main, including `app.fee_provider_fixture_key`.
The read-only index still marks that path unmerged: router must stage the resolved
file and complete its pending merge. Every migration already on origin/main is
byte-identical; none is duplicated or amended. Main's latest fee replacement body
is 0608 (no successor through 0613). The prechecked authority SQL is unchanged,
renamed by stem only from 1065 to `0619_fee_store_authority.sql`, with the proof
and populated-upgrade references aligned. 0614–0618 remain reserved for #576/#577.
Policy-role proof representations remain PostgreSQL strings; runtime is
`"{jobguard_runtime}"`, never an array. Historical main proofs are untouched.

The forged release regression now executes the release, archive batch insert and
empty-book compaction as independent statements/transactions, each asserting its
own refusal (23514, 42501, 23514). The separate archive INSERT refusal, unchanged
book, refused second collection and absence of release audit events all remain.
No test or assertion was weakened. The lane lists exactly the 12 paths changed
from main outside config/lanes and does not list itself; new 0619 paths are included.

Local validation (installed dependencies; each Vitest invocation at most 2 workers):
- In apps/api: `./node_modules/.bin/vitest run src/fee-collection/postgres-reservation-store.test.ts src/fee-collection/executor.test.ts src/fee-collection/fake-gocardless.test.ts --maxWorkers=2` — 116 passed.
- In packages/db: `./node_modules/.bin/vitest run test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts --maxWorkers=2` — 108 passed.
- Root: `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` and
  `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — passed.
- In packages/db: `./node_modules/.bin/vitest list --maxWorkers=2 test/fee-reservation.integration.test.ts test/fee-reservation-archive-upgrade.integration.test.ts` — 30 cases collected, including the repaired attack; collection only.
- Root: `node tools/money-arithmetic-lint.mjs`,
  `node tools/commercial-boundary-lint.mjs`,
  `node tools/plpgsql-case-in-if-lint.mjs` — passed.
- Read-only checks: exact table union, all main migration bytes, renamed SQL bytes,
  exact lane membership and `git diff --check` — passed. Committed-range lane CLI
  must run after the router stages/completes the merge and commits.
- Initial collection command used a nonexistent root Vitest binary; corrected to
  packages/db's installed runner. No packages were downloaded.

CI must execute the two named PostgreSQL files, including every independent
attack refusal, populated 0619 upgrade, audit/archive preservation and migration
replay, plus mandatory full database/migration, tenancy/privilege and required
repository checks on the final head. This sandbox does not prove those guarantees.
The independent pre-check PASS at 4ba587bc is historical, not formal review of the
new committed head; obtain the required independent RED exact-head review.
Pre-check LATER items remain recorded in the existing coordinator pre-check;
in particular signed-result replay/event-key hardening remains before real rails.
Production authority, provider, money and release gates remain closed. Forward-fix
only; do not restore raw archive writes or unsigned provider-result authority.
No new complexity, operational alert, production route or commercial policy.

## Earlier builder evidence (historical)

# FEE-STORE-AUTHORITY — READY for router handoff (RED, NOPR)

Piece FEE-STORE-AUTHORITY on `codex/sandbox/fee-store-authority`, based on
`fee-store-safety` at `1bf409d6cc39919eb1bdd498d73d979585167ba1`.
Source-built and locally checked; not independently reviewed, committed, pushed,
merged or database-verified. The router owns those next steps. Made-up data only.

The raw release/history and archive-poison regressions were written before the
implementation. PostgreSQL execution of their predecessor failures was not
possible in this sandbox; these are not reported as observed failing database runs.

Migration `1065_fee_store_authority.sql` starts from 0608's latest guard body:

- Withdraw runtime archive INSERT. Runtime retains SELECT. A private helper owned
  by the existing audit writer inserts archive records; runtime cannot execute it,
  and the migration table owner still has no direct archive write policy.
- Derive chained audit events inside the replacement routine from actual attempt
  differences. The supplied book list is checked for exact new state transitions,
  but cannot substitute for `app.audit_event`. Same-state payment/object lifecycle
  changes also receive a chained event. Archive writes precede the seal; the audit
  head stays the final contending lock. No client-side append duplicates these events.
- Resolve unknown results only with a signed, versioned synthetic fixture bound
  to the tenant and entire resulting attempt, including command, rail, amount,
  immutable authority identity and provider object. Missing, altered and wrongly
  bound results fail closed. All other result/lifecycle changes are signed too.
  Existing fake adapters attest only after submit returns or their signed webhook
  passes verification; their test signing helpers remain synthetic fixture APIs.
- Store fixture verification keys in a new tenant-keyed private table with FORCE
  RLS, owner-only tenant SELECT and no runtime/infrastructure grants. Only the
  administrative synthetic fixture provisions keys; the migration seeds none.
  Its tenancy proof truthfully records `guarded: false`: this private SELECT
  policy is not an ALL/write policy. No new role, production key, route, rail or
  provider protocol is introduced. An application holding a fixture signing key
  is trusted; this does not protect against a compromised signer or database admin.
- Retain released snapshots/revisions, absolute audit ordinals, event replay keys,
  unknown reservations and immutable identities. The routine validates stored
  shapes before archiving to prevent malformed writes poisoning subsequent reads.
  No historical audit is invented or rewritten during upgrade/compaction.

Complexity is limited to the private seal and fixture-key verification needed to
separate raw runtime SQL from provider-result authority. The store now makes one
replacement call and no archive INSERT or generic audit append. LP-0 changes are
new named entries in the 1065 proof, including the exact 0604/0608 before records;
the historical proofs and scanners/pins are unchanged. No existing table gains a
column. No function has a SET app.* clause.

Local checks (installed binaries, at most two Vitest workers and three named files
per run; no downloaded dependencies):

- API/database TypeScript checks: `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit`
  and `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — PASS.
- `apps/api/node_modules/.bin/vitest run --root apps/api --maxWorkers=2 src/fee-collection/postgres-reservation-store.test.ts src/fee-collection/executor.test.ts src/fee-collection/fake-gocardless.test.ts`
  — 116 passed. These are deterministic adapter/executor checks, not PostgreSQL proof.
- `packages/db/node_modules/.bin/vitest run --root packages/db --maxWorkers=2 test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts`
  — 107 passed after the final LP-0 proof changes.
- `apps/api/node_modules/.bin/vitest run --root apps/api --maxWorkers=2 src/watchdog-registry.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts`
  — context/identity 152 passed; watchdog initially could not import the missing
  built AI package. After building the installed AI source, the named watchdog
  rerun passed 126 tests. Core/config/storage/db builds likewise restored missing
  local package exports before the focused API tests; no source checks were weakened.
- `packages/db/node_modules/.bin/vitest list --root packages/db --maxWorkers=2 test/fee-reservation.integration.test.ts test/fee-reservation-archive-upgrade.integration.test.ts`
  — collected all 30 cases, including the new regressions and populated upgrade;
  collection only, no PostgreSQL execution.
- Money, commercial, core-purity, AI-provider and PL/pgSQL CASE-in-IF lint scripts
  — PASS. Core purity retains its 11 existing reported computed-import warnings.
- `git diff --check` — PASS. Exact path comparison through the lane tool's exported
  `lanePathAllowed` — PASS: 12 changed paths from fee-store-safety plus its own
  lane, which does not list itself. No git-writing command was run.

The pnpm launcher attempted registry release-signature verification and failed
before executing checks. All successful checks above used the installed binaries;
no registry-verification setting or dependency pin was changed.

Named holds for landing:

1. **POSTGRES-1065 / RED-EXACT-HEAD.** CI must run the real PostgreSQL reservation
   and populated-upgrade files, including raw release/compaction refusal, archive
   poisoning, signed/unsigned/tampered/wrong-company/wrong-command/amount results,
   archive owner/runtime/infrastructure privileges, chained lifecycle/release
   events, atomic rollback, both-rail races, refund/retry limits, late settlement,
   restart/replay and migration replay. Run the full mandatory database/migration
   suites, particularly LP-0 catalogue/authority paths, tenancy and the named
   successor expectations. Independent RED review is required at the committed
   head before merge. No PostgreSQL or browser suite ran here.
2. **LANE-COMMITTED-RANGE.** The lane CLI against default main includes the parent
   fee-store-safety work and correctly refuses it. Against the task's required
   `LANE_BASE_REF=codex/sandbox/fee-store-safety`, it refuses a self-comparison
   because this read-only-.git sandbox cannot commit and HEAD still equals the
   base. The exact worktree path check passes. The router must rerun the unchanged
   CLI with that base after committing; do not widen this task's lane to parent work.
3. **ACTIVATION.** Existing production-source/commercial/release gates remain.
   This is a dark synthetic store; no route or live rail is enabled by this change.

No scanner or pin edit was needed by the local checks. Forward-fix only: preserve
book/archive/audit rows and the stricter grants if a later correction is needed;
do not roll back by restoring runtime archive writes or unsigned result authority.

Initial source review, LATER / SIMPLICITY: the strict attempt shape in
`apps/api/src/fee-collection/postgres-reservation-store.ts` and migration 1065 must
stay aligned. A future schema change should centralize its versioned contract
checks, reducing drift maintenance. This is non-blocking and adds no framework here.
