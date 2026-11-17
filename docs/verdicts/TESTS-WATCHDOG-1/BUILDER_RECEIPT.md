# TESTS-WATCHDOG-1 builder receipt

Issued 17 October 2026. Lane RED. **PARK / HOLD for CI and exact-commit RED reviews.**
Decision 74: never merge, enable or deploy without Ben's button.

## Scope and identity

- Base and current HEAD: `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`.
- Branch: `codex/sandbox/tests-watchdog-1`; started with a clean worktree.
- Only new files: `apps/api/src/watchdog.filter.privacy.test.ts`,
  `config/lanes/tests-watchdog-1.json`, this receipt and
  `docs/ledger/TESTS-WATCHDOG-1.md`.
- No commit, staging, checkout, push, PR, merge, enablement or deployment.
  Dispatcher commits; no Git writes were performed.
- Source read: AGENTS.md, BUILD_PLAN §2.4 C5/C6 and §8 CH-2,
  watchdog filter/registry tests, and the issued audit proposal.
- Supplied dependency install used without installing packages. Runtime
  Node `v24.17.0` (repository `.nvmrc`: `24.15.0`), pnpm `10.28.1`,
  Vitest `4.1.11`. The global pnpm shim stalled on a version query and was
  interrupted; subsequent pnpm commands use the existing cached 10.28.1 via
  `/private/tmp/jg-test-tests-watchdog-1/bin/pnpm` on PATH.
- Free disk: 53 GB initially and after unit tests; 52 GB during final build,
  above the 33 GB gate.

## Acceptance evidence

| Case | Code | Status | Leaking scratch filter | Unchanged real filter |
| --- | --- | --- | --- | --- |
| WD1 | JOB_NOT_FOUND | 404 | Exact-body assertion failed | Passed |
| WD2 | JOB_NOT_LIVE | 409 | Exact-body assertion failed | Passed |
| WD3 | IDEMPOTENCY_CONFLICT | 409 | Exact-body assertion failed | Passed |

Each error carries fictional tenant/job IDs, live state, amount in pence,
original-result evidence flag, message, stack and cause. Every case asserts
one status call, its exact status, one JSON call and strict equality of all
JSON call arguments to `[[{ code }]]`; extra diagnostics fail that assertion.

The retained scratch test is byte-identical to the new repository test.
The scratch filter differs from the retained original only by replacing
`.json({ code: error.code })` with `.json(error)`. Its report confirms exactly
three failures, all at the exact-body assertion, after the status/call-count
assertions. This valid mutant run preceded the real-filter green run.
An earlier scratch attempt collected zero tests because package build output
was absent; that attempt is retained and is **not** counted as mutation evidence.

This proves filter serialization only, not whole-application tenant isolation,
authorization, RLS, transport registration or job-state enforcement. No server,
PostgreSQL, browser, real data or provider integration was needed.

## Commands actually run

All pnpm checks below use the cached pinned pnpm PATH described above.
Logs and mutation reports are retained under
`/private/tmp/jg-test-tests-watchdog-1/`.

| Command | Exit/result | Evidence |
| --- | --- | --- |
| `git rev-parse HEAD`; `git status --short`; `git branch --show-current`; `git rev-parse origin/main` | 0; expected base/branch, only four task additions | HEAD and origin/main both equal the base above |
| `df -g /System/Volumes/Data` | 0; 53 GB initially, 52 GB during final build | Above 33 GB throughout observed checks |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --config /private/tmp/jg-test-tests-watchdog-1/vitest.config.mjs --reporter=json --outputFile=/private/tmp/jg-test-tests-watchdog-1/mutant-results-after-build.json` | 1, expected; 3/3 exact-body failures | `mutant-after-build.log`, JSON report |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/watchdog.filter.privacy.test.ts` | 0; 3/3 passed | `privacy.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/watchdog-registry.test.ts` | 0; 121/121 passed | `registry.log` |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0; 7/7 package checks passed | `typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force --concurrency=2` | 0; 7/7 package checks passed | `turbo-lint.log` |
| `pnpm build --force --concurrency=2` | 0; 7/7 package builds passed | `build.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; lane check refuses HEAD == base | `root-lint.log`; core purity passed before lane failure |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same self-comparison refusal | `lanes.log`; no alternate base or bypass used |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | 0 each, individual static checks | `money-lint.log`, `commercial-lint.log`; does not make root lint green |
| `pnpm openapi:check` | 1; tsx IPC pipe listen EPERM in sandbox | `openapi.log` |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | 0; same source check through loader | `openapi-loader.log`; normal wrapper remains a CI obligation |
| `git diff --check`; `git diff --exit-code` | 0; no tracked modifications | Also inspected untracked files for whitespace with no-index diffs |

Typecheck, package lint and build passed. Root lint and lane validation remain held
by the uncommitted self-comparison; do not interpret package lint as root lint.
Full tests, DB/migration suites, browsers/e2e and commit-dependent lane
validation: **NOT RUN locally**, per issued order. Fresh install and live
provider/model evaluation were not performed. CI obligations are unchanged.
The supplied sandbox prohibits socket binding; no harness or runner was changed.
Turbo emitted sandbox IO warnings but completed all seven tasks in each run.
Next emitted workspace-root, optional dependency and CSS warnings; build exited 0.

## Preservation and impact

`git diff --exit-code` confirms all tracked files remain unchanged, including
all existing expectations and fingerprints. Direct byte comparisons against
HEAD also verified the two requested protected files:

- `apps/api/src/watchdog.filter.ts` SHA-256:
  `b7043e954d800c0bfe7e94c4c8e94a21b10a8dc4dd802408131b9231c0779164`.
- `apps/api/src/watchdog-registry.test.ts` SHA-256:
  `09eece54785c3a0c3d8d8a91a4235164a66bc8842ed6f69817f985c38e5e5e0c`.

Affected guarantees: CH-2 refusal confidentiality and C5/C6 executable
negative coverage. No production code, permissions, prices, policies,
authorization, shared harness, existing tests or API expectations changed.
No migrations, grants, data backfill, rollback work, operational alerts,
external actions or shared-file ownership conflicts. Standard F unchanged.
C1: no web workflow changes; no browser spec is introduced. No deletion.

## Independent review and release gates

A requested Sol-high reviewer (`gpt-6-sol`, reasoning high; collaboration agent
`/root/sol_high_review`) returned **PASS for source review of the uncommitted
test/lane/ledger content**, with no defects. It inspected the retained mutant
report and the real-filter green log; it ran no tests. Its actual response and
reviewed SHA-256 values are retained in `sol-high-review.md` in the scratch
folder. It did not review a task commit or the final receipt.

Opus review was not run by the builder. The RED two-model check is incomplete.
After the dispatcher commits, require CI (including full mandatory suites and
real lane verification), exact-commit independent verdicts including Opus and
Sol-high, and separate technical acceptance. Then PARK under decision 74.
No acceptance, merge or release is claimed by this receipt.

## Retained handoff artifacts

- Scratch manifest: `/private/tmp/jg-test-tests-watchdog-1/manifest.json`;
  original/mutant filter copies, byte-identical test, isolated Vitest config,
  reports, logs, pinned pnpm symlink and provisional source-review response
  are retained. Scratch `node_modules` links the supplied API dependency tree.
- Intended commit message: `/private/tmp/jg-msg-tests-watchdog-1.txt`:
  `test(watchdog): keep private diagnostics out of refusals` plus a body.
- No task commit exists; all four additions remain untracked for the dispatcher.
