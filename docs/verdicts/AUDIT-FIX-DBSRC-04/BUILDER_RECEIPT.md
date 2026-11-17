# AUDIT-FIX-DBSRC-04 — builder receipt

Issued 13 October 2026 by dispatcher 4; built locally 14 October 2026.
Branch: `codex/sandbox/audit-fix-dbsrc-04`. Inspected HEAD and `origin/main`:
`bd959b01e857de0ba7cbd3588bab84add7d0f493` (both still equal).
Audit source: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-04.md`.
Lane: **RED**, money/source identity and tenant-qualified database reads. This is
builder evidence, not an independent verdict or technical acceptance. Dispatcher
must commit, push and obtain the independent exact-commit verdict and acceptance.
No git-writing commands, migrations, grants, real data, spending or providers.
Intended commit message: `/private/tmp/jg-msg-audit-fix-dbsrc-04.txt`.

Read AGENTS.md, BUILD_PLAN.md §§2, 5.3–5.6, §7 synthetic/live boundary,
and M2-4/M2-5 cards before implementation. Applicable invariants: tenant-qualified
source joins, immutable revisions, exact quantities/money, audit order, command
replay, live guard, operational proposals without settlement or fee authority.

## Blocking findings: failing tests first, then fixes

All reproductions below were written and executed before implementation changes.
These are domain/scripted-adapter reproductions; no PostgreSQL guarantee is
claimed from their results. Added PostgreSQL tests use existing command/harness
setup and the actual runtime role; they require CI or the dispatcher's Mac.

1. **Unrelated bill replacement** — new scripted test “supersession rejects
   unrelated confirmed invoices” failed: promise resolved instead of rejecting
   `UNRELATED_SUPPLIER_BILLS`. Reproduced with the report's £1,120 original and
   £160 replacement fixture identities. Now load immutable document identity,
   supplier, type and hash. Accept only increasing fact revisions of the same
   invoice, or the existing exact synthetic materials-B original/revised pair,
   checked by supplier context, both document numbers and both content hashes.
   There is no generic suffix-based lineage inference. Unknown cross-document
   lineage fails closed. Related £250→£160 remains supported. New adversarial
   tests cover wrong supplier, altered bytes, credit type and reversed revision.
   PostgreSQL regression checks rejection, zero supersessions and zero reduction.
2. **Older money restored by overlapping transactions** — new executed query
   regression “latest supersession follows committed revision order” failed:
   `ORDER BY s.created_at DESC`, not `ORDER BY se.sequence DESC`. This reproduces
   the erroneous ordering choice, not the PostgreSQL race itself. Projection now
   uses the already-linked tenant audit sequence, which serializes append/commit
   order across original invoices as well as revisions. New PostgreSQL test pauses
   B before the Things-to-check lock, commits A, then releases B; checks revision
   2, B's 7000 response and a fresh 7000 projection. Race execution is pending CI.
3. **Corrected match leaves stale finding actionable/reviewable** — new scripted
   view test failed `actionable` versus `superseded`; new scripted review test
   resolved instead of rejecting `FINDING_SUPERSEDED`. Shared finding query now
   checks newer revisions of the same tenant/job/match proposal and the
   `invalidates_unresolved_findings` flag. Unresolved stale findings project as
   superseded; review refuses before writing an outcome. Original rows remain
   immutable, and resolved historical outcomes remain historical. Legacy as-of
   projections bound correction visibility to the same audit cutoff; stored
   command replay still returns its saved first result. Evaluation/review take
   the supplier-match lock before Things-to-check and before audit, so a correction
   cannot interleave with their source validation. Evaluation selects the latest
   match by its audit sequence. PostgreSQL regression checks £90→superseded,
   rejected review/no outcome, explicit £130 reevaluation and the exact new match ID.
4. **Fractional quantity rejected** — new pure-domain test “evaluates confirmed
   fractional quantities” failed with Zod `Expected integer, received float` on
   accepted/billed quantity 2.5. Now accept canonical decimal strings and compatible
   numeric callers, up to six places and the existing 1,000,000 quantity limit.
   Parse scaled integers; subtract fractions exactly, use bigint multiplication,
   and half-even rounding once at each separately displayed net component boundary.
   Components sum to the reported total; magnitude checks remain. SQL quantities
   stay decimal strings. Strip SQL scale-padding without floats so existing whole
   quantity calculation text and legacy payload hashes are preserved. Tests cover
   fractional arithmetic, ties, invalid precision, negatives and magnitude bounds.
   PostgreSQL regression creates confirmed 2.5×2500/6250 facts and a 2.5 allocation
   through runtime commands, then checks 1250/0/1250 and the persisted finding.

No blocking finding was dropped: each has an executed failing regression. The
query-only ordering reproduction and scripted invalidation cases do not replace
real database verification; their PostgreSQL scenarios are explicitly unexecuted.

## Scope, before/after, compatibility

- Catalogue addition: `config/agent-lane-assignments.json` before: no
  `audit-fix-dbsrc-04`; after: one compact entry with the exact branch and seven
  allowed files, including this receipt. Removing this new row reproduces the
  original parsed catalogue exactly (executed equality check).
- New files: `packages/core/src/discrepancy-audit-fix.test.ts`,
  `packages/db/test/audit-fix-dbsrc-04.test.ts`,
  `packages/db/test/audit-fix-dbsrc-04.integration.test.ts`, this receipt.
- No existing test file, expected value, refusal, count, pinned name or fingerprint
  was edited. `apps/api/src/auth/context-boundary.test.ts` is byte-identical to
  HEAD (executed comparison). No protected line required a STOP.
- No premise setup was inserted in any existing test. New regression tests use
  new isolated jobs and existing harness helpers. No existing catalogue rows
  changed and no new production file requires a catalogue entry.
- No migration or privilege change is required for these repository projections
  and input checks. Standard F: no grant introduced; all existing grants remain.
  No data backfill. Rollback is reverting the source change; immutable stored
  facts are preserved. General cross-document replacement lineage remains absent
  and is deliberately refused outside the exact existing synthetic pair.
- Existing public numeric inputs and integer arithmetic results remain compatible;
  decimal strings are additive. Previously accepted unrelated replacement commands
  are now refused. Existing persisted replay receipts remain replayable.
- No UI, endpoint, provider, external action, settlement, recovery fee or production
  policy added. No new operational alerts. Existing synthetic/live/G1/G2 gates
  remain. Shared edit ownership: the lane registry serializes with the coordinator;
  discrepancy source edits serialize with any concurrent owner of that repository.

## Local checks

Dependencies were already installed; no package install/download was requested.
Node is v24.17.0. Initial PATH `pnpm` launcher advertised pnpm 11 and stalled;
interrupted it (130), then used the already-cached pnpm **10.28.1** through a
`/private/tmp/jg-dbsrc04-bin/pnpm` shim. Subsequent pnpm commands set that directory
first on PATH and as PNPM_HOME. No clean pinned reinstall is claimed.
All lint attempts used `LANE_BASE_REF=origin/main`; no comparison base was weakened.
Logs are under `/private/tmp/jg-dbsrc04-*.log`.

- Pre-fix core Vitest: exit 1, 1 expected fractional validation failure.
- Pre-fix db scripted Vitest: exit 1, 4 expected failures and 1 related-pair pass.
  Initial new-test mock omitted the membership-context export; corrected only
  that new test setup and reran before implementing fixes. That initial collection
  failure is not counted as a reproduction.
- Final focused core command: `pnpm --filter @jobguard/core exec vitest run
  src/discrepancy-audit-fix.test.ts src/discrepancy.test.ts --maxWorkers=1`:
  **0, 15 passed**.
- Final focused db command: `pnpm --filter @jobguard/db exec vitest run
  test/audit-fix-dbsrc-04.test.ts --maxWorkers=1`: **0, 10 passed**.
- AI fixtures/evaluation: `pnpm --filter @jobguard/ai test --maxWorkers=1`:
  **0, 80 passed in 5 files**. Synthetic fixture evaluation only; no live model.
- Config/storage package tests: **0, 2 config and 4 storage tests passed**.
- Safe tooling: `node --test tools/commercial-boundary.test.mjs
  tools/core-purity.test.mjs tools/dependency-audit.test.mjs
  tools/decision-check-purity.test.mjs tools/decision-records.test.mjs
  tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs`:
  **0, 19 passed**. Lane-tool tests not run because they write git repositories.
- `pnpm lint` and `pnpm lint:lanes`: **1**, lane checker rejects the unchanged
  HEAD/base self-comparison. Expected until dispatcher commits; not a lane PASS.
  Supplemental working-tree check using the real `selectLane`/`matches` functions
  covered tracked diffs and untracked files: **0**, exact allowed paths only.
  Core purity, money arithmetic and commercial boundary checks: **0**.
- `git diff --check`: **0**.
- PostgreSQL regression collection via `vitest list`: **0**; not execution.

Broader local results (unchanged tests/timeouts preserved):

- Core source units: `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1`:
  **1, 2453 passed / 3 failed, 82 files**. The three receipt-allocation working-size
  tests timed out at their unchanged 5000ms limit. No assertion/timeout edits.
- Database units: `pnpm --filter @jobguard/db exec vitest run --exclude
  '**/dist/**' --exclude '**/*.integration.test.ts' --exclude
  '**/free-port.test.ts' --maxWorkers=1`: **1, 178 passed / 1 failed, 14 files**.
  Existing audit-checkpoint `[C-OPS-1]` transitive-source scanner exceeded its
  unchanged 5000ms timeout. No PostgreSQL or listener-dependent tests selected.
- Web units: `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1`:
  **0, 784 passed in 33 files**. Browser journeys remain pending separately.
- OpenAPI: requested `pnpm openapi:check`: **1**, tsx CLI IPC socket `listen EPERM`.
  Safe equivalent from `apps/api`: `node --import tsx src/generate-openapi.ts --check`:
  **0 after dependency rebuild**, with no artifact change. Early loader attempts
  before fresh builds failed on missing core/db exports; those were not passes.
- Early broad attempts before fresh dependency builds were interrupted (130 or
  an outer 0 with incomplete Turbo summaries), including root typecheck/build,
  duplicate package lint, source db/API runs and default-worker package tests.
  Default-worker web tests returned 1/EPIPE; earlier AI source tests returned 1
  with 7 missing-export failures. Final rebuilt AI/web runs above supersede those
  results. Config/storage success above occurred in the first recursive run.
  Broader db attempts included compiled source-test duplicates; final command
  explicitly excludes dist. No compiled PostgreSQL integration tests were present.

Full build/typecheck, isolated timeout rechecks and API results follow at the end.

## Dispatcher/CI checks still required

After committing these working-tree changes, rerun the unchanged full gates on
that exact commit:

```sh
LANE_BASE_REF=origin/main pnpm typecheck
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm test
pnpm build
pnpm openapi:check
pnpm eval
pnpm test:db
pnpm test:migrations
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M2-5-S.spec.ts M2-4-S.spec.ts
```

Run these targeted PostgreSQL regressions on the Mac if available, otherwise CI:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-fix-dbsrc-04.integration.test.ts test/things-replay.integration.test.ts test/supplier-matching.integration.test.ts test/watchdog-lock-order.integration.test.ts test/command-replay-contract.integration.test.ts
```

No PostgreSQL process, successful localhost listener or browser was started in this sandbox.
One API isolation fixture indirectly attempted free-port probes, which the sandbox
refused before database setup; see the explicit API result below.
Root `pnpm test`, `test:db`, `test:migrations` and browser suites were not invoked:
root test includes forbidden PostgreSQL/browser-capable tests and git-writing lane
fixtures. These mandatory checks remain pending, not optional.

## LATER findings — recorded only

- Report #5: repeated no-op evaluation audits a newly generated finding ID that
  `ON CONFLICT DO NOTHING` discards; audit reference can point to no finding.
- Report #6: seed test's shared semantic-key Map does not prove independent complete
  envelope determinism; random command IDs would not be caught.
- Additional report test-hardening recommendations left unchanged: seed CLI sentinel
  preservation; audit-reference joins for no-op replay; exact enterprise callback
  audit deltas/actors. Fractional/corrected source IDs and arithmetic are covered
  only by the new scoped regressions here, without changing existing tests.

## Completed full compile/build checks

- `LANE_BASE_REF=origin/main pnpm typecheck --concurrency=1
  --cache-dir=/private/tmp/jg-dbsrc04-cache`: **0**, all 7 package checks successful
  (one cached). Log: `/private/tmp/jg-dbsrc04-typecheck-complete.log`.
- `LANE_BASE_REF=origin/main pnpm build --concurrency=1
  --cache-dir=/private/tmp/jg-dbsrc04-cache`: **0**, all 7 package builds successful,
  no cache hits. Log: `/private/tmp/jg-dbsrc04-build-serial.log`.
  Next emitted existing workspace-root/CSS warnings; artifacts are generated only,
  with no additional tracked source edits.


## Unchanged timeout rechecks and API sandbox limitation

After the heavy builds finished, the unchanged failing tests were rerun without
increasing their timeout or changing any expectations:

- `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts
  --maxWorkers=1`: **0, all 34 passed**, including the three prior timeouts.
  Log: `/private/tmp/jg-dbsrc04-core-timeout-recheck.log`.
- `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts
  -t 'C-OPS-1' --maxWorkers=1`: **0, scanner passed, 55 unselected**.
  Log: `/private/tmp/jg-dbsrc04-db-timeout-recheck.log`.

Broad runs therefore did fail under build load, with every failing test passing
unchanged in isolation. A full post-commit CI run remains required; an isolated
recheck is not relabelled as a successful full-suite run.

API selected run: `pnpm --filter @jobguard/api exec vitest run src --exclude
'**/shadow-isolation.application.test.ts' --exclude '**/*.http.test.ts' --exclude
'**/health.test.ts' --exclude '**/auth/sso/action-paths.test.ts' --maxWorkers=1`:
**1, 1557 passed / 1 skipped, 64 files passed / 1 suite failed**. An indirect
fixture import in `src/final-account-lock.isolation.test.ts` attempted free-port
checks and failed `no free port in 58400..58650` before PostgreSQL setup. This
file was missed by the initial direct listener/provider search. No server or
PostgreSQL process started. The final safe local run additionally excludes that
file; none of these exclusions alter a repository script or CI requirement.
The dispatcher must run this isolation suite and the HTTP/SSO/health/shadow-isolation
suites on the Mac/CI as part of the unchanged root checks.

## Final safe API and package lint results

- Final API command adds `--exclude '**/final-account-lock.isolation.test.ts'`
  to the selection above: **0, 1555 passed in 64 files**.
  Log: `/private/tmp/jg-dbsrc04-api-safe-complete.log`.
- `pnpm turbo run lint --concurrency=1
  --cache-dir=/private/tmp/jg-dbsrc04-cache`: **0**, all 7 package lint checks
  successful (one cached). This is the package portion of lint, not a claim that
  the root lane self-comparison refusal passed.
  Log: `/private/tmp/jg-dbsrc04-package-lint-complete.log`.

Final status: all four blocking source fixes implemented with test-first local
reproductions; no migrations, grants, existing test modifications or protected-pin
edits. Build/typecheck/package lint, focused regressions, safe API/web/AI units,
static tooling and OpenAPI loader check pass. Broader timeout failures and their
unchanged isolated passes are retained above. PostgreSQL/browser/HTTP isolation,
post-commit lane/root CI, independent verdict and separate acceptance are **HOLD**
until the dispatcher supplies their evidence. This builder does not accept the task.
