# AUDIT-FIX-API-CONTRACTOR — builder receipt

Issued 13 October 2026 by dispatcher 4. Branch `codex/sandbox/audit-fix-api-contractor`; inspected HEAD and `origin/main` both `e4cb8437d044746300c377647f6061d06cd960cc`. **HOLD — implementation stopped at a pinned-source boundary. Working-tree proposal only; do not merge as a completed fix.** No commit, independent verdict or technical acceptance is claimed.

## Required STOP: reviewed practice-source fingerprint

The proposed fix changes `packages/db/src/work-order-fixtures.ts`, which is source-pinned by `apps/api/src/auth/context-boundary.test.ts:95`. The dispatch prohibits changing this test or its pinned lists/fingerprints. That file remains byte-identical to HEAD. No existing expected value, refusal, count, pinned name or fingerprint was edited.

- File and line that would require a prohibited update: `apps/api/src/auth/context-boundary.test.ts:95`.
- Before (and still the actual line): `"packages/db/src/work-order-fixtures.ts": "cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386",`.
- After that would be needed for this proposal, **NOT APPLIED**: `"packages/db/src/work-order-fixtures.ts": "6a759b3f449cb6e341ed5d317c37f69cc18169705d9c7b65e80913153ea7ae59",`.
- Guard verification: `pnpm --filter @jobguard/api exec vitest run src/auth/context-boundary.test.ts` exited 1: 143 passed, 2 failed. Both failures identify this source as requiring renewed caller review: the real-repository constructor-boundary assertion at line 748 and the exact-reviewed-source assertion at line 1290. The existing expectation remains `[]` in both cases.

The task needs dispatcher/coordinator resolution of this explicit constraint before more implementation. This is not a dropped audit finding, a migration requirement, an approval, or an independent review. No attempt was made to work around the guard by moving a constructor or adding a new exception.

## Blocking findings: reproduced before the proposal

Both smallest reproductions are new tests in `packages/db/test/work-order-fixtures.unit.test.ts`. They execute the actual preparation function with stateful repository/SQL adapter doubles and reverse-ordered generated UUIDs. They do **not** prove PostgreSQL persistence, grants, RLS, application-session resolution or importer replay.

Command before any product edit: `pnpm --filter @jobguard/db exec vitest run test/work-order-fixtures.unit.test.ts` — exit 1, 2 tests failed. Log: `/private/tmp/jg-api-contractor-before.log`.

1. **BLOCKING 1, generated site bindings:** `generated samples retain site bindings across preparation and replay` failed on byte equality of the regenerated CSV. The retry returned different `siteRevisionId` values because identical-timestamp rows reloaded in UUID order. The new test also checks generated revisions and unchanged preparation counts.
2. **BLOCKING 2, interrupted preparation:** `generated import resumes after interrupted preparation` first injected a failure immediately before `contract.revise`, after the client was recorded, and verified exactly one client. Retrying failed with `TypeError: Cannot read properties of undefined (reading 'document')` at the original `work-order-fixtures.ts:43`.

Same command after the proposal — exit 0, 2 passed. Log: `/private/tmp/jg-api-contractor-after.log`. Neither blocking finding is DROPPED. Their PostgreSQL acceptance remains unverified and the proposal is on HOLD.

## Proposed change retained for review

Preparation uses each numbered fictional address to order site bindings numerically and keeps its original revision. It inspects persisted schedule, client, contract, customer, customer link, site and operative records and creates missing steps under the existing per-tenant session advisory lock. An existing client is no longer used as a completion marker. These are synthetic setup/retry changes, with no HTTP schema, permission, tax, fee-policy, migration or grant changes. Database/catalog guarantees have not been verified.

Affected invariants: AGENTS §§5.1 (verified tenant context), 5.2 (stable party bindings), 5.4 (retry/idempotency), 5.10 (synthetic/free quoting), 5.13 (independent verdict), BUILD_PLAN §§2.4 C4/C5/C6/C8, 9.1.3 and ENT-2 identical-import acceptance. The unchanged source-pinning guard blocks acceptance. No new alert or operational deployment is introduced. Restore the original source for rollback before any deployment; no data migration is involved. Existing organisations that already imported a misbound regenerated sample need assessment before release; no historical rows were rewritten here.

## Scope and additive registration

RED review is required for tenancy/party relationships regardless of the path floor. `lane-floor.py` compares commits only; HEAD equals the issued base and the proposal is uncommitted, so it cannot assess this working-tree diff. The dispatcher must rerun it against the resulting commit.

Lane registry: before, `audit-fix-api-contractor` was absent; after, one compact entry with exactly these paths: `config/agent-lane-assignments.json`, `packages/db/src/work-order-fixtures.ts`, `packages/db/test/work-order-fixtures.unit.test.ts`, `docs/verdicts/AUDIT-FIX-API-CONTRACTOR/BUILDER_RECEIPT.md`. Existing entries remain unchanged. Shared files overlap the registry and the ENT-2 fixture source; this task is their editing owner for this proposal and dispatcher integration must serialize those overlaps.

Existing test/catalogue edits: none. New catalogue rows: none. Premise-establishing setup changes before existing calls: none. C1: no new web workflow or UI; the existing ENT-2 import browser regression remains mandatory.

## LATER only — not changed

- Finance has `data.import` but generated preparation requires `organisation.read`, so finance cannot import an already prepared sample.
- `site-extra-pricing.application.test.ts:147`: the C19 test swallows all rejections rather than asserting successful extra pricing/result.
- `contractor-parties.privacy.test.ts:26`: privacy test removes resident data before the extractor instead of testing actual request construction.
- `contractor-parties.privacy.test.ts:17`: projection privacy uses source/schema checks instead of executing serialized projections.
- `contractor-parties.controller.test.ts:19`: identical 404 test mocks both failures instead of comparing existing hidden and absent PostgreSQL resources.
- `site-extra-pricing.http.test.ts:84`: C20 mocks identical results instead of proving persistence, replay, origin, audit and changed-quantity conflict.

## Verification environment and outstanding handoff

Node `v24.17.0`, cached pinned pnpm `10.28.1`, preinstalled dependencies. The default pnpm launcher attempted registry signature verification for a version switch and failed with fetch errors (both `pnpm --version` and `npm_config_manage_package_manager_versions=false pnpm --version`, exit 1); no package installation occurred. Checks use a temporary PATH wrapper pointing to `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`, including nested pnpm calls. No install/download command was run. All lint/check invocations used `LANE_BASE_REF=origin/main`. Detailed logs are `/private/tmp/jg-api-contractor-*.log`.

No migration, SQL grant, real data, spending, provider action, PostgreSQL startup, browser startup, git write, push or merge. Standard F is inapplicable: no grant change. The full `pnpm test` wrapper was not launched because it starts prohibited PostgreSQL/socket tests and its lane-tool fixtures execute git-writing commands; permitted subsets were run instead. No suite has been changed or made optional in CI.

Dispatcher must run on the Mac or unrestricted GitHub CI after resolving the source pin: clean pinned-install `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `pnpm lint:lanes`, full `pnpm test`, `pnpm build`, `pnpm openapi:check`, `pnpm test:db`, `pnpm test:migrations`, and `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop ENT-2.spec.ts`. The report's two real-PostgreSQL generated-import reproductions still need adding/execution (implementation stopped before creating them): force reverse site UUID ordering and assert same/fresh command replay, original batch/hash, unchanged counts and no rejected rows; inject one pre-contract failure after committed client creation and assert successful retry with five orders, complete party links and one client. Unit doubles do not replace those acceptance tests.

No production/release gate or commercial/security approval is satisfied by this receipt. Independent RED verdict bound to the dispatcher's exact commit and separate technical acceptance remain required.

## Check results

| Command | Exit / observed result |
| --- | --- |
| `pnpm typecheck` | 0; all seven workspace tasks successful (two cache hits). |
| `pnpm lint` | 1; lane guard refuses HEAD equal to `origin/main`, before package lint. |
| `pnpm lint:lanes` | 1; `Missing branch or self-comparison range; refusing a misleading pass.` No comparison base or guard was weakened. |
| Separate `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | Each exited 0; supplements the lane-blocked root lint. |
| `pnpm exec turbo run lint` | 0; all seven package lint tasks successful. This is supplementary and does not make root lint green. |
| Manual working-tree lane inspection | 0; exact four-path allow list matches modified/untracked files and every earlier registry entry is unchanged. |
| Selected safe tools tests (`node --test tools/policy-gate-sites.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs`) | 0; 19 tests passed. Lane fixture tests excluded because they execute git writes. |
| `pnpm --filter @jobguard/db exec vitest run --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'` | 1; 183 passed, 1 timed out: existing `src/audit-checkpoint-handoff.test.ts` C-OPS-1 graph traversal. Known socket/embedded PostgreSQL DB tests excluded. |
| `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1` | 1; 55 passed, same C-OPS-1 assertion timed out at its unchanged 5000 ms limit. No timeout/expectation edited. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage test` | 1; config 2/2 and storage 4/4 passed; core 4822 passed, 8 failed (duplicate generated `dist` source-inspection fixtures and concurrent timeouts); AI had not been scheduled, so was run separately below. |
| `pnpm --filter @jobguard/core exec vitest run src` | 1; 2411 passed, 4 existing tests timed out under concurrent load. |
| `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts src/extra-origin.test.ts src/enterprise-domain/boundaries.test.ts --maxWorkers=1` | 0; all 45 tests passed, including the four source-only timeout cases. Original timeout limits unchanged. |
| `pnpm --filter @jobguard/ai test` | 0; 80 passed. Synthetic adapter/fixture tests, not a live-model evaluation. |
| First permitted API subset, before dependency build finished | 1; 849 passed, 147 failed, 1 skipped; errors included stale built dependency exports and the two pinned-source guard failures. Rechecked after dependency build, below. |
| First web unit run, before API dependency build finished | 1; 147 tests passed; 16 suites failed loading missing built API exports. Rechecked after dependency build, below. |
| `pnpm openapi:check` | 1; `tsx` CLI IPC socket creation refused with `listen EPERM`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`, before dependencies finished building | 1; stale built DB export `ContractorPracticeSessionRepository` missing. |
| Same OpenAPI source check after dependencies built | 0; direct Node import avoids CLI IPC and checks the unchanged published OpenAPI document. |
| `git diff --check` | 0. Read-only git checks only. |

Additional final results:

- `pnpm build`: exit 0; all seven workspace tasks successful (two cache hits), including the production Next build. Existing CSS/autoprefixer, workspace-root and Turbo cache-permission warnings appeared; no checks were weakened.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` after dependencies built: exit 0; 33 files, 784 tests passed. This is a unit run, not a browser journey.
- `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude '**/health.test.ts' --exclude '**/shadow-isolation.application.test.ts' --exclude '**/*.http.test.ts' --exclude '**/auth/sso/action-paths.test.ts'` after dependencies built: exit 1; 1540 tests passed, 2 failed (the unchanged source-pin assertions), 1 skipped; 61 files passed and 2 files failed. The second failing file, `final-account-lock.isolation.test.ts`, dynamically imports a PostgreSQL fixture not caught by the initial socket/embedded-PostgreSQL scan; its beforeAll failed in `freePort` with `no free port in 58400..58650`, before PostgreSQL initialisation/start. This attempted port probing is recorded, not claimed as PostgreSQL coverage. That whole file also requires Mac/CI execution and must be excluded from any further sandbox-only API run.
- No new PostgreSQL integration test was authored after the explicit fingerprint STOP. The two new adapter reproducers pass; database acceptance is incomplete. All first-attempt failures are retained here; reruns were limited to actual load or stale-output concerns. The root suite remains unverified, with the source-pin failure still a mandatory HOLD.
