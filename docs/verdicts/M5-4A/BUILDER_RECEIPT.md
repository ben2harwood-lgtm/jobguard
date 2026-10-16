# M5-4A builder receipt — 16 October 2026

**Builder receipt only — not independently reviewed or accepted.**

## Base, scope and ownership

- Issued base: `0bbb5ddbd074b791ece740a1861a6b7cc2fd6577`.
- Prepared HEAD and initial `origin/main`: `49fc07f33a440bcca7ac443de365aba3670e9999`.
- Branch: `codex/sandbox/m5-4a`; physical worktree:
  `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/m5-4a`.
- `origin/main` changed during execution to `d74fd66d684226a5150fe3d3576a853d58abcf31`.
  Read-only `git diff` against the issued base returned no changes for AGENTS,
  BUILD_PLAN or all five specified dependency files, both initially and after
  this ref change. Therefore the cited §11.6 lines 3162–3170 and §12.4 line 3710,
  and inherited §2.4 C1–C8, still match. No stale local main was used.
- M2-2-S implementation and receipt were read; `git merge-base --is-ancestor
  2c5c492 0bbb5ddbd074b791ece740a1861a6b7cc2fd6577` exited 0.
- Initial status was clean. All six proposed repository paths and the temporary
  message path were absent. The worktree resolves to the specified physical
  path. Ownership checks found no registration/path collision. No ENT-13A
  connector or supplier-document repair path is edited.
- Partial M5-4 only: a synchronous deterministic checker, trusted separate
  descriptor, strict versioned envelope/results, complete subset inspection
  before document parsing, exact kind/version comparison, safe ordered review
  diagnostics, fictional adversarial tests and documentation. No integration.

Exactly these six new repository files are proposed and inspected explicitly;
ordinary `git diff --stat` cannot enumerate their untracked contents:

1. `config/lanes/m5-4a.json`
2. `packages/core/src/merchant-feed-review.ts`
3. `packages/core/src/merchant-feed-review.test.ts`
4. `docs/contracts/merchant-feed-review-v1.md`
5. `docs/ledger/M5-4A.md`
6. `docs/verdicts/M5-4A/BUILDER_RECEIPT.md`

Additional authorized output: `/private/tmp/jg-msg-m5-4a.txt` (subject and body).
The lane does not list itself in `allow`. No shared export, manifest, lockfile,
CI configuration, lane tooling, protected value or existing source file is edited.

## Toolchain and execution environment

- Node `v24.17.0`, within `package.json`'s `>=24.0.0 <25` engine range;
  `.nvmrc` records `24.15.0`. This run did not switch or install Node.
- Pinned pnpm `10.28.1` was already present in
  `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1`.
  Direct cached CLI and `COREPACK_ENABLE_NETWORK=0 corepack pnpm --version`
  each exited 0 and reported `10.28.1`.
- Initial PATH launcher resolved to installed `@pnpm/exe` 11.8.0, emitted an
  ignored-overrides warning and stalled on `pnpm --version`. That invocation
  and a diagnostic invocation with `--manage-package-manager-versions=false`
  were interrupted, each exit 130; neither is a version-check pass.
- Subsequent checks used the cached pinned CLI through Corepack, with
  `COREPACK_ENABLE_NETWORK=0`. For nested invocations, PATH was prefixed with
  `/usr/local/lib/node_modules/corepack/shims`. No install/download command,
  dependency/pin change or borrowed task worktree was used.
- Installed versions match core/root package and committed lockfile pins:
  Zod `3.25.67`, Vitest `4.1.11`, TypeScript `5.8.3`, Turbo `2.10.12`;
  build reports Next `15.5.27`. Existing dependencies were available.
- All test invocations used at most two workers. Commands ran sequentially;
  tests and builds never overlapped. All fixtures were locally constructed and
  fictional. No browser was opened.

## Commands and results

The pnpm commands below use the pinned cached toolchain/environment described
above. Final build additionally disabled Next/Turbo telemetry. The forced
typecheck, Turbo lint and build commands were each run once.

| Command / stage | Exit | Actual result |
| --- | --- | --- |
| `git rev-parse HEAD`, `git branch --show-current`, initial `git status --short`, `pwd -P`, `git rev-parse origin/main` | 0 each | Prepared base/branch/path above; clean initial tree. |
| `node --version` | 0 | `v24.17.0`. |
| Read-only `git show` of issued AGENTS/BUILD_PLAN; file reads and authority/dependency `git diff` comparisons | 0 | Instructions/task/dependency sources inspected; no cited-file drift. |
| `pnpm --filter @jobguard/core exec vitest run src/merchant-feed-review.test.ts --maxWorkers=2` — absent module | 1 | Import failure; 0 tests executed. Setup evidence only, not a behavioural regression. |
| Same targeted command — API skeleton | 1 | 13 behavioural assertions failed, 1 immutability test passed. |
| Same targeted command — first implementation | 1 | 1 failed, 13 passed: optional/nullable internal Zod maps needed correct inspection. |
| Same targeted command — corrected inspection | 0 | All 14 named tests passed. |
| Same targeted command — added adversarial error-map/message/array-order assertions | 0 | All 14 named tests passed against final implementation. |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0 | 7/7 packages, no cache hits. |
| `pnpm exec turbo run lint --force --concurrency=2` | 0 | 7/7 packages, no cache hits; does **not** run root scanners or lane checks. |
| `pnpm build --force --concurrency=2` | 0 | 7/7 packages, no cache hits, production Next build completed. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2` | 1 | **FAILED:** 3 failed, 5,373 passed across 198 files after build discovered compiled tests as well as source. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | 0 | 99 source files, 2,688 tests passed, including all 14 new tests and existing supplier-document tests. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Root scanners and 7/7 package lints passed; 2 cached packages replayed. Lane comparison used `d74fd66...` and enumerated the then-present five new files (receipt added subsequently). |
| `pnpm openapi:check` | 1 | **NOT RUN (sandbox-blocked):** tsx CLI failed at IPC `listen EPERM` before running the generator; not a pass. |
| `node --import tsx src/generate-openapi.ts --check` in `apps/api` | 0 | Same actual source generator/check passed through Node's import hook, avoiding launcher IPC. No snapshot was changed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Working-tree lane check passed and explicitly enumerated all six authorized files, including this receipt. Not exact-commit validation. |
| `git diff --check` | 0 | No tracked diff whitespace errors; untracked files checked separately below. |
| `git diff --stat` | 0 | Empty, because all authored files are untracked; not evidence of an empty change. |
| Final `git status --short` and `git ls-files --others --exclude-standard` | 0 each | Exactly the six files listed above, no existing tracked-file changes. |
| Read-only Node inspection of all six files, current lane policy and temporary message | 0 | File contents read; terminal newlines/no trailing whitespace; exact new-file scope; all six paths allowed; intended subject/body present. |

The three failures in the unfiltered core run were compiled copies of existing
source-inspection tests: MON1-A27 (`jobs-on-the-go.test.js`), DW9
(`recovery-allocation.test.js`) and ENT-3c C3 (`site-extra-pricing.test.js`). Each
raised ENOENT looking for its sibling `.ts` implementation under `dist/`.
Their source copies passed. The failed command remains failed; the explicit
source run is separate evidence. No deletion or test-discovery/configuration
repair was attempted. This remains a coordinator/CI landing concern.

Turbo emitted sandbox `IO error: Operation not permitted` cache warnings despite
the successful forced checks. Next emitted workspace-root/multiple-lockfile,
existing CSS/autoprefixer/cache-serialization, Nest `file-type` export and dynamic
dependency warnings. No unrelated warning fix was made. Exploratory path probes
returned expected missing-path errors (exit 1/2); `ps` was denied by the sandbox
(exit 127). None of these probes is counted as a passing implementation check.

Final inspection covered every proposed repository file explicitly, including
the lane and this receipt. Ordinary ignored compilation/cache outputs remain
outside the source diff. The intended commit message is present at the exact
authorized temporary path. The work remains uncommitted.

## NOT RUN and remaining gates

- Full root `pnpm test`, `pnpm test:db`, `pnpm test:migrations`: NOT RUN by the
  issued builder order; whole-suite/infrastructure checks belong to integration/CI.
- `pnpm test:e2e`: NOT RUN, expressly CI-only; no browser/Playwright invocation.
  No new browser journey is applicable to this pure-core C1/C6/C7 slice.
- Native/device and AI/live-model evaluations: NOT RUN, no affected subsystem;
  no prompt, model, AI parser/gateway or native change.
- Exact-commit lane validation, independent Claude Opus review and separate
  technical acceptance: NOT RUN/pending coordinator-created commit. Working-tree
  lint is not exact-commit review. No commit exists for these changes yet.
- Clean pinned reinstallation: NOT RUN; installations/downloads were prohibited.
  Checks used the prepared existing dependency tree. CI still owes real root
  typecheck, lint, test, build, OpenAPI and every existing mandatory suite.

No migration, DB write/grant, persisted quarantine, evidence registration,
provider call, credentials/access/connector authority change, commercial action,
money rule, operational alert, application route, worker, UI or existing-file edit
was introduced. No Git mutation, commit, push, deployment or outward action was
performed. Source compatibility is not approval, authorization, verified evidence,
receipt or settlement. The separate opaque source reference is caller-supplied,
not verified provenance. Optional/nullable Zod wrappers' inert internal error maps
are distinguished from unsupported issue-producing error maps, as documented.

M5-4 remains incomplete: intake integration, persisted quarantine, alerts,
merchant capability evidence, alias handling, supplier identity resolution,
cross-channel deduplication/provenance reconciliation, provider conformance and
separately authorized ordering are outstanding. This library satisfies none of
those integration requirements. Real providers/data, spending, operational
activation, new access/connector authority, commercial decisions and outward
actions remain held for Ben and applicable release gates. AMBER requires one
independent Claude Opus verdict on the exact coordinator-created commit, followed
by a separate actor's acceptance. No release gate or approval was changed.
