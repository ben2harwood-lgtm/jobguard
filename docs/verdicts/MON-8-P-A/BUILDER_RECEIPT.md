# MON-8-P-A builder receipt

18 October 2026 · Codex builder · **RED; implementation supplied, acceptance HOLD**.
Only issued sub-order A. No commit, push, PR, merge or release performed. Dispatcher
creates the final commit; a different-model verdict bound to that exact commit and
separate acceptance remain outstanding. No independent verification is claimed.

## Base, changes and invariants

Inspected HEAD and origin/main both `c4f929f5a37bbc2639186fa3e2a4b2e7adc1ec3a`;
branch `codex/sandbox/mon-8-p-a`. Highest existing migration 0192; added
`0193_contractor_entitlement_authority.sql` (dispatcher renumbers at merge).
Working tree was clean initially. Node v24.17.0; cached pnpm 10.28.1. Dependencies
were reused as instructed: **no clean reinstall was performed**. Initial PATH's
`pnpm -v` shim attempted its automatic version resolution and failed registry
verification/fetch; subsequent commands use the already cached pinned executable.
No dependency or lockfile change, package installation or download succeeded.

Adds append-only synthetic agreement-status facts with tenant-qualified assignment
FK, unique revision, pinned server timestamp, fictional provenance, FORCE RLS and
no runtime table access. Adds the session-bound SQL/repository reader holding the
seed-54 shared tenant lock through its callback, with fresh reads after waiting.
Current effective acting membership is checked separately from eligibility. Adds
strict independently versioned projection/evaluator for the five capabilities,
active-only eligibility, disabled-by-default execution and permission-dependent
retained-read handling. No new context constructor or existing bridge replacement.

Existing API port and v1 plan map are unchanged. No status writer, automatic status
backfill, command activation, historical endpoint, subscription authority, charge,
audit/receipt/outbox effect or commercial row-shape change. Earlier data and grants
are not intentionally modified. Core/DB indexes contain additive exports only.
Tenancy and LP-0 additions concern only A's objects. Private table ownership is
checked by tenancy/new PostgreSQL tests; LP-0's effective-ACL projection omits
owner-only tables by design. New routine source digests are null, not invented
PostgreSQL fingerprints. Standing ruling 113 extends SERIOUS-B5 only with A's
objects while retaining prior expected values. Shared index/catalogue/snapshot
files require serialized dispatcher integration with other touching tasks.

Affected invariants: tenant isolation, immutable provenance, current membership,
server-owned eligibility, no commercial side effects, retained permissions,
practice-only execution and truthful test evidence. No new operational alert or
external service. Compatibility is expand-only; v1 callers retain their contracts.
Rollback/forward fix and future writer lock ordering are in the migration note.

## Tests first

Before evaluator implementation, from `packages/core`:
`node node_modules/vitest/vitest.mjs run src/contractor-entitlement-authority.test.ts --maxWorkers=2`
exited 1: **3 actual assertion failures**, evaluator export absent; 2 negative tests
passed because they expected a throw. Those negatives now require the typed
`INVALID_ENTITLEMENT_INPUT` error. No collection failure is counted as an assertion
failure. An earlier root-level Vitest-path probe exited 1 (`MODULE_NOT_FOUND`);
that was a launcher/path failure, not a red test.

All three named PostgreSQL suites and their fixture file were written before the
migration/repository implementation. **No PostgreSQL failing-first execution** was
possible under the dispatcher's environment ruling. Their existence/typecheck is
not evidence that assertions passed. Tests cover current/latest/missing/foreign
assignment, runtime writes, effective switched member, expired/revoked sessions,
revoked membership, non-synthetic DB refusal, actual lock waiting, side-effect
snapshots, populated predecessor rows/catalogues and rollback negative controls.
The missing-assignment case uses explicitly labelled owner-only fixture removal
inside a rolled-back transaction; migration installation never removes assignments.

## Actual local commands and outcomes

Commands below ran from the repository root unless indicated. For pinned commands,
PATH prefixed `/private/tmp/jg-r1-pnpm-bin` (symlink to the cached
`/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`);
the first typecheck used `/private/tmp/jg-allocation-pnpm-bin`, a wrapper to the same
cached executable. Logs are `/private/tmp/mon8a-*.log`, local evidence only.

| Command | Exit / result |
| --- | --- |
| `pnpm typecheck` | 0; 7 tasks successful, 2 cache hits, 5 fresh |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passed; lane tool refuses HEAD == origin/main before examining the uncommitted diff |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same self-comparison refusal; no alternate base or tool relaxation used |
| `pnpm exec turbo run lint` | 0; all 7 workspace lint tasks, 2 cached and 5 fresh |
| `node tools/money-arithmetic-lint.mjs` | 0, fresh |
| `node tools/commercial-boundary-lint.mjs` | 0, fresh |
| `node --test tools/*.test.mjs` | 0; 100/100, fresh |
| `pnpm build` | 0; 7 tasks successful, 2 cached and 5 fresh, including Next production build |
| `pnpm openapi:check` | 1; tsx launcher IPC socket EPERM before generator execution |
| `node apps/api/dist/generate-openapi.js --check` | 1; built generator reported stale OpenAPI; no generated document edited |
| `node --import tsx src/generate-openapi.ts --check` (apps/api) | 0; fresh **source** generator, avoids launcher IPC; committed OpenAPI matches |
| `node node_modules/vitest/vitest.mjs run src/contractor-entitlement-authority.test.ts src/plan-entitlements.test.ts --maxWorkers=2` (packages/core) | 0; 13/13, fresh |
| `pnpm --filter @jobguard/core test --maxWorkers=2` | 1; 5,783 passed, 5 failed; compiled dist source-inspection tests tried to open absent dist/*.ts files |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | 0; 115 files, 2,894/2,894 source tests, fresh |
| `pnpm --filter @jobguard/db exec vitest run test/lp-0-catalog.test.ts --maxWorkers=2` | 0; 26/26 comparator unit tests, fresh; not a PostgreSQL privilege proof |
| `pnpm --filter @jobguard/api exec vitest run src/plan-entitlements.application.test.ts src/plan-entitlements.boundary.test.ts --maxWorkers=2` | 0; 12/12, fresh |
| `pnpm --filter @jobguard/db exec vitest run test/contractor-session-context.test.ts --maxWorkers=2` | 0; 17/17 existing bridge unit tests, fresh; not persisted-session evidence |
| `git diff --check` | 0 |

The five dist failures were ENOENT in jobs-on-the-go, recovery-allocation,
site-extra-pricing and the two subscription-architecture source-inspection tests.
STOP for the unrelated compiled-test discovery issue; no earlier test was weakened
or removed. Source suites pass. Turbo emitted cache IO permission warnings while
reporting successful task completion; cache hits are explicitly distinguished above.

Additional fresh static checks:

- `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json --noEmit`: 0.
- `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext --esModuleInterop packages/db/test/contractor-entitlement-authority.integration.test.ts packages/db/test/contractor-entitlement-session.integration.test.ts packages/db/test/contractor-entitlement-upgrade.integration.test.ts packages/db/test/serious-b5-upgrade.integration.test.ts`: 0. Repeated after test refinements; this is compilation, not database execution.
- An inline Node script imported the unchanged lane loader and `lanePathAllowed`,
  enumerated `git diff --name-only -z` plus `git ls-files --others --exclude-standard -z`,
  and checked all 19 changed paths: no outside-lane paths. This is a working-tree
  allowlist check, **not a passing committed-range lane check**.
- An inline Node script invoked the unchanged `migrationOrderViolations` against
  `git ls-tree -r --name-only origin/main -- packages/db/migrations/` plus new 0193:
  no ordering violations. The lane file never lists itself.

## NOT RUN and acceptance holds

Per explicit dispatcher instruction, **PostgreSQL and browser locally: NOT RUN**.
Therefore `pnpm test:db`, `pnpm test:migrations`, new real-PostgreSQL tests, existing
session-boundary/shared-money-origin/origin-persistence/fingerprint/tenancy/audit/
privilege suites and `pnpm test:e2e` have no local execution claim. Full `pnpm test`
was not launched because it includes PostgreSQL; constituent feasible unit/tool
checks are recorded above. No query double substitutes for those required suites.
`pnpm eval` is inapplicable to A's entitlement schemas: no AI prompt, extraction,
model, matching policy or gateway change; no evaluation gate/script was changed.

CI must run the full mandated suites from the pinned install, including new A
PostgreSQL tests, existing SERIOUS-B5 and least-privilege/tenancy suites. It must
verify migration syntax, real constraints/RLS/role posture, session/concurrency,
legacy preservation, repeat migration and actual grants. The exact final commit
must pass lane checking and receive the separate model verdict and acceptance.
No clean-install or real-PostgreSQL success is asserted here.

STOP for B only: runtime enforcement, Q-03 command/direct-write denial matrix,
historical readers/exports and legacy compatibility activation. STOP for C only:
full port/subscription composition and lifecycle preservation pending merged
MON-2A-P and MON-3-P interfaces. STOP for an agreement writer/actor policy:
fixture ownership is not customer/operations activation authority. These do not
expand or block implementation of A. MON-8 remains open. D01/D02/D03/D08/D09/D16,
real-data/provider, sending/spending, charging, deployment and release approvals
remain outside scope. No policy approval is inferred from local green tests.

Intended dispatcher commit text: `/private/tmp/jg-msg-mon-8-p-a.txt`.

## r1 (CI)

18 October 2026 · Codex gpt-6-astra builder. CI repair for PR #293, run
39136710407; inspected HEAD `79b69614612453641b6e4e23496396b40e70b3a5`.
Dispatcher reports one independent inspection PASS for that earlier code; this
repair is not independently verified or accepted by the builder.

The superseded-assignment fixture now takes the seed-54 exclusive tenant lock,
inserts the replacement assignment and appends its required
`commercial_track.assigned` audit event with the same assignment ID and actor in
one transaction. It additionally asserts the replacement identity and refused
new-work eligibility. No trigger is disabled in this fixture. The two tenancy
catalogue lists only relocate A's existing `contractor_agreement_status_revision`
row into name order, before `contractor_client_customer`. No merged assertions,
prior catalogue values, grants, migration SQL or production behavior changed.
SERIOUS-B5 was not changed: no additional failure was supplied for it.

Dependencies reused without installation; Node v24.17.0, cached pnpm 10.28.1 via
`PATH=/private/tmp/jg-r1-pnpm-bin:$PATH`. Logs:
`/private/tmp/mon8a-ci-r1-*.log`. Actual checks:

| Command | Result |
| --- | --- |
| `pnpm --filter @jobguard/db typecheck` | PASS, exit 0 |
| `LANE_BASE_REF=origin/main pnpm lint` | STOP, exit 1: migration numbering collision; core purity passed |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | STOP, exit 1: same migration numbering collision |
| `node --test tools/*.test.mjs` | PASS, 100/100 |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | PASS, 116 files, 2,902/2,902 |
| `pnpm --filter @jobguard/db exec vitest run test/contractor-session-context.test.ts test/lp-0-catalog.test.ts --maxWorkers=2` | PASS, 43/43; unit tests, not PostgreSQL proof |
| `node tools/money-arithmetic-lint.mjs` | PASS |
| `node tools/commercial-boundary-lint.mjs` | PASS |
| `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext --esModuleInterop packages/db/test/contractor-entitlement-authority.integration.test.ts` | PASS; fixture compilation, not execution |
| `pnpm openapi:check` | Exit 1: tsx launcher IPC socket EPERM |
| `node --import tsx src/generate-openapi.ts --check` (apps/api) | PASS; source generator checked committed OpenAPI without IPC launcher |

STOP for migration renumbering only: current `origin/main`
`42990862881cd048c7167869246551d5360beb17` already has migration 0193. The lane
checker requires A's migration above 0193. Dispatcher must reconcile/renumber the
migration and its references at integration as the original receipt specifies;
this CI fixture repair does not edit the lane policy or migration history.

**PostgreSQL NOT RUN**, per dispatcher: no database server, migration suite or
integration assertions executed locally. Browser NOT RUN. Full `pnpm test` was
not launched because it includes PostgreSQL; feasible unit suites are above.
CI must rerun the three reported failures and mandatory database/upgrade suites.
No clean-install, database success, professional approval or release is claimed.
No git add, commit, push, checkout, merge or release performed in this worktree.
Intended commit text: `/private/tmp/jg-msg-mon-8-p-a.txt`.

Remaining completed checks: `pnpm exec turbo run lint` PASS (7 tasks, 1 cached,
6 fresh); `pnpm build` PASS (7 tasks, 1 cached, 6 fresh, including Next production
build); `git diff --check` PASS. Turbo logged cache IO permission warnings;
Next logged dependency-expression warnings, but the build exited 0. Workspace
lint success does not supersede the migration-order failure in root lint.
