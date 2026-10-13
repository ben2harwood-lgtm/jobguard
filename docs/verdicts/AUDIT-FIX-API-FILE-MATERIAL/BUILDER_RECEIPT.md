# AUDIT-FIX-API-FILE-MATERIAL — builder receipt

Issued 13 October 2026 by dispatcher 4. Builder: Codex. Branch:
`codex/sandbox/audit-fix-api-file-material`; base and unchanged HEAD:
`e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4` (`origin/main`).
Working-tree handoff only: dispatcher owns commit/push. No Git write commands.
No independent model verdict or technical acceptance is claimed.

## Scope and check lane

Read the issued `api-file-material.md` night audit, repository `AGENTS.md`,
`BUILD_PLAN.md` §§2.4, 5.4 and M2-1, material command schemas and migration 0031.
This repairs the existing synthetic materials read projection; no UI, route,
command/schema, prompt, model, vendor or production capability is added.
**RED**, raised for money even where the path floor is AMBER. The lane registry
adds only `audit-fix-api-file-material`, on one compact line with five exact paths.
Shared registry edits serialize with the dispatcher/integrator; no other lane changes.

## Blocking findings: failing tests first

1. **FIXED — gross prices become net costs.** Added
   `gross_agreement_requires_tax_review` before changing production code. It
   writes a 2400p gross/each agreement and a quantity of ten through the real
   `MaterialApplication` and repository, using an explicitly synthetic SQL fixture.
   The red run returned `status: applicable` instead of `review`. The fix permits
   cost normalization only for explicit `net`; gross and unknown stay in review
   without `eachPence` or `netPence`. No assumed VAT conversion is introduced.
2. **FIXED — expired offers change another agreement's pack size.** Added
   `expired_offer_does_not_change_remaining_agreement` before changing production
   code. It saves v1 (10000p/box, five each, from 1 October) and v2 (10000p/box,
   ten each, 5–7 October), then reads at frozen 8 October. The red run referenced
   v1 but returned pack ten, each 1000p and net 10000p; expected pack five,
   each 2000p and net 20000p. The conversion cutoff now uses the selected rate's
   `effective_from`, retaining the last explicit conversion at that date.
3. **DROPPED — concurrent first entries create duplicate agreements:** no failing real-PostgreSQL race reproduced; PostgreSQL cannot run in this sandbox.

Red evidence: `/private/tmp/jg-audit-file-material-red.log`, exit 1, both new
assertions failed for the reported values before the repository changes.
Green evidence: `/private/tmp/jg-audit-file-material-green.log`, exit 0, 2/2 passed
after rebuilding `@jobguard/db`. These are in-memory SQL-fixture tests, not
PostgreSQL, RLS, concurrency or HTTP integration proof. The fixture derives its
conversion cutoff from the actual repository SELECT and rejects unsupported SQL.

Added both regression cases to the existing real-PostgreSQL materials suite
for dispatcher/CI execution; these cases were authored but **not run locally**.
Existing suite setup, assertions, counts, refusal codes, pinned names and
fingerprints remain byte-for-byte. The application test file is entirely new.
`apps/api/src/auth/context-boundary.test.ts` and all its pinned lists are untouched.

## LATER — recorded only

- Same-date packed-price revision cannot be saved: duplicate conversion insertion
  violates the existing uniqueness constraint (report finding 4).
- Nest reports a server error for stale material commands instead of typed HTTP
  409 `STALE_MATERIAL_RATE_REVISION` (report finding 5).

The report's five suggested test-strengthening items were not part of the issued
BLOCKING scope. No existing expected value or assertion was changed.

## Invariants, compatibility and migration

AGENTS §§5.5/5.9 and BUILD_PLAN §5.4: explicit tax basis and exact net money;
M2-1: applicable agreement/version and pack quantity remain linked.
Existing unknown-tax, missing-price, overlap and unit review refusals remain.
The selected agreement identity, price, source and commercial history are intact.
Gross consumers now receive a review row rather than an unsupported net estimate.
No new external actions, grants, roles, permissions, schema objects, migrations,
data backfills or production data. Standard F has no new grant to review.
No new operational alerts. Revert the projection code to roll back; stored rows
are unchanged. No release gate, commercial approval or residency claim is advanced.

Catalogue before/after: lane registry **before** had no
`audit-fix-api-file-material` row; **after** adds exactly the following row for
this new issued lane (all other entries are byte-for-byte unchanged):

```json
"audit-fix-api-file-material":{"branches":["codex/sandbox/audit-fix-api-file-material"],"receipt":"docs/verdicts/AUDIT-FIX-API-FILE-MATERIAL/BUILDER_RECEIPT.md","note":"RED: audited material money projection; no migration or grants; existing assertions and context-boundary pins unchanged.","allow":["config/agent-lane-assignments.json","apps/api/src/material.application.test.ts","packages/db/src/material-repository.ts","packages/db/test/materials.integration.test.ts","docs/verdicts/AUDIT-FIX-API-FILE-MATERIAL/BUILDER_RECEIPT.md"]}
```

All existing test catalogues/setup: **before = after**. No premise-establishing
setup before an unchanged existing call was required. The new PostgreSQL cases
create only fictional jobs/scope identities using the existing fixture helper
and existing table grants; they do not alter old calls.

## Checks

Environment: installed Node `v24.17.0`, pnpm `10.28.1`, Vitest `4.1.11`.
No install or dependency changes. The default pnpm shim attempted its automatic
version/signature check and was blocked; subsequent commands used the already
installed pinned 10.28.1 binary via `/private/tmp/jg-audit-file-material-bin`
prepended to PATH. No signature check was disabled and no packages were installed.
Turbo reused its existing shared cache for unchanged dependencies where indicated.
Logs: `/private/tmp/jg-audit-file-material-*.log` (local artifacts, not committed).

| Command | Exit / result |
|---|---|
| `pnpm --filter @jobguard/api exec vitest run src/material.application.test.ts` before the fix | 1 — 2 expected assertion failures; red log |
| `pnpm --filter @jobguard/db build` | 0 |
| Same two-test application command after the fix | 0 — 2/2; green log |
| `pnpm typecheck` | 0 — 7 tasks, 4 unchanged cached |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 — lane checker refuses HEAD/base self-comparison |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 — same refusal; dispatcher must rerun after commit |
| `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | 0 for each |
| `pnpm build` | 0 — 7 tasks, 4 unchanged cached; actual API and web builds executed |
| `pnpm openapi:check` | 1 — tsx CLI IPC socket `listen EPERM` |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | 0 — same OpenAPI generator/check, no IPC server |
| Seven safe `node --test` tools suites listed below | 0 — 19/19 |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | 0 — 33 files, 784 tests |
| `pnpm --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage exec vitest run src --maxWorkers=1` | 0 — config 2, AI 80, storage 2 tests |
| `pnpm --filter @jobguard/db exec vitest run src` | 1 — 84 passed; unchanged C-OPS-1 source reachability test timed out at 5s |
| Same DB command with `--maxWorkers=1` | 1 — same timeout, 84 passed |
| Same DB command with `--maxWorkers=1 --testTimeout=30000` | 0 — 85/85; diagnostic with extended CLI time budget, **not a pass of the default-timeout check** |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2` | 1 — 4887 passed, 3 failed: generated-dist source-path ENOENT (two) and unchanged arithmetic stress-test 5s timeout (one) |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2` with initial socket exclusions | 1 — 1555 passed; final-account-lock isolation fixture cannot allocate a port; one dependent test skipped |
| `pnpm turbo run lint` while build was regenerating `.next/types` | 2 — web compiler saw missing generated type files; repeated after build below |
| `git diff --check` | 0 |
| Read-only exact worktree allow-list, existing lane/test prefix, repository transformation and protected-file byte checks | 0 — five exact paths; protected SHA-256 below |

Safe tools command (omits the two lane-test suites that write Git fixture repos):

```sh
node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs
```

Initial unbounded API/unit Turbo runs were interrupted (exit 130) after excessive
parallelism and default-timeout failures; they are not claimed as passing.
The final source-only command results and serialized compiler-lint result follow.
The API command explicitly excludes `src/health.test.ts`,
`src/shadow-isolation.application.test.ts`, `src/final-account-lock.isolation.test.ts`,
`src/contractor/*.http.test.ts` and `src/auth/sso/action-paths.test.ts`, all requiring
prohibited sockets and/or PostgreSQL. No test file/configuration was changed to
apply these local-only exclusions. The full suites remain dispatcher/CI work.

Protected `apps/api/src/auth/context-boundary.test.ts` before/after SHA-256:
`a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`.
The actual `lane-floor.py` cannot classify an uncommitted commit range; its
coordinator map and `rx` classifier applied to read-only working-tree paths give
AMBER (4 AMBER + receipt GREEN), raised to RED for money. This manual path/scope
check is not presented as the failing mandatory lane check passing.

Final source-only runs:

- `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1`:
  exit 0, 81 files, **2445/2445** at unchanged default timeout.
- `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2` with the
  six exclusions above: exit 0, 64 files, **1553/1553**, including the protected
  context-boundary suite and both new application regressions. No pinned list,
  expectation or timeout was edited.

`pnpm turbo run lint` after the completed build: exit 0, 7/7 tasks,
4 unchanged cached. This is the package compiler-lint result; the full root lint
and lane check still require a non-self commit range after dispatcher commit.

`pnpm --filter @jobguard/db exec vitest list test/materials.integration.test.ts
--maxWorkers=1`: exit 0; all four cases collect, including both new PostgreSQL
regressions. Collection executes no hooks and does not prove database behavior.

Intended conventional commit subject/body written to
`/private/tmp/jg-msg-audit-fix-api-file-material.txt`. No commit created.
Builder implementation handoff is ready; technical acceptance is **HOLD** for
unrun full suites, default-timeout DB check, and independent exact-commit RED
review. No approvals are inferred from these local results.

## Dispatcher / Mac / CI checks still required

After the dispatcher commits, rerun `LANE_BASE_REF=origin/main pnpm lint` and
`LANE_BASE_REF=origin/main pnpm lint:lanes`; before a commit, both fail closed
because HEAD equals the base. Run normal `pnpm openapi:check`, `pnpm typecheck`,
`pnpm test`, `pnpm build`, `pnpm test:db` and `pnpm test:migrations` on the Mac/CI.
The focused database command is:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/materials.integration.test.ts
```

Run the existing materials and purchase-order browser journeys in both projects:

```sh
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M2-1A-S.spec.ts M2-1B-S.spec.ts
```

Sandbox prohibition: no PostgreSQL, browser or localhost server started. Full
root tests include PostgreSQL, HTTP socket suites and temporary-fixture Git writes,
so the full command was not attempted here. Full DB/migration/browser checks and
an independent RED verdict bound to the dispatcher's exact new commit, followed
by separate technical acceptance, remain HOLD.
