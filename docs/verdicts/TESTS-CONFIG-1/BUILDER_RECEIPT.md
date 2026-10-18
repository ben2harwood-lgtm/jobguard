Built by Claude Sonnet (Codex stand-in), dispatcher 14

# TESTS-CONFIG-1 builder receipt

Test-only. No parser, default or existing test changed. Base 1bcd8db8. Decision 74: RED two-model check, then PARK.

## Changed
- packages/config/src/api-environment.boundaries.test.ts (CF1: ports 1/3001/65535 and omitted default pass; 0, 65536, -1, 1.5, non-numeric refuse)
- packages/config/src/identity-environment.database-boundary.test.ts (CF2: postgres/postgresql with jobguard_identity pass; mysql/http/redis and wrong users refuse)
- packages/config/src/identity-environment.required-settings.test.ts (CF3: each of the four settings omitted independently refuses)
- packages/config/src/identity-environment.secret-boundary.test.ts (CF4: 31 refuses; 32, 33, 64 pass)
- config/lanes/tests-config-1.json (lane as given in the order)
- docs/ledger/TESTS-CONFIG-1.md
All URLs and secrets are fictional, built at runtime; no real environment read.

## Scratch mutations (source restored after each; source diff is empty)
- remove .max(65535): fails "refuses explicit invalid port 65536"
- remove URL refinement: 7 failures (protocol and username refusals)
- make AUTH_ALLOWED_ORIGIN optional: fails "refuses when AUTH_ALLOWED_ORIGIN is omitted"
- min(32) to min(30): fails "refuses a 31-character synthetic secret"

## Commands run
- vitest (2 workers) on files 1+2: 18 passed; files 3+4: 9 passed
- turbo typecheck, lint (LANE_BASE_REF=origin/main), pnpm build, all --force --concurrency=2: 7/7 successful each
- git diff --check: clean. Disk about 51 GB free.

## NOT RUN
Full test suite, DB/migration/browser suites, commit-dependent lane checks (CI). Opus and Sol-high RED checks pending.

## Codex verification continuation — 18 October 2026

The preceding receipt is the prior builder's record, not commands executed by this continuation. This worktree started clean at `deb054f22a8bdc360dc4dbf1349adf441a9b9428`, which already contains the four test files, lane file, ledger and receipt; its parent is the issued base `1bcd8db8`. No tests, parsers, defaults, pins or existing expectations were edited. This continuation adds verification evidence only and makes no Git writes.

Inspected AGENTS.md, BUILD_PLAN.md §2 and M0-6L, the authentication-v1 contract, audit proposals 1–4 and the implementation diff. Proposal 7 remains excluded. The referenced `checks/J6-jobguard-next-orders-night4-check.md` is not present in this checkout; its READY verdict was supplied by the order and was not independently verified here.

### Runtime and scope

- Disk: 62 GiB available on `/System/Volumes/Data`, above the 33 GiB floor.
- Runtime: Node `v24.17.0`; `.nvmrc` remains `24.15.0`. This is an observed local runtime mismatch, not an approved pin change or evidence of a clean pinned install.
- Checks use the already cached pnpm `10.28.1` at `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`, exposed through `/private/tmp/jg-test-tests-config-1/bin/pnpm`. The default pnpm launcher warned about ignored `pnpm.overrides` and stalled on `--version`; it was interrupted (exit 130), and was not used for checks. No install/download command was run.
- Logs, isolated mutation copies, exact invocation records and source SHA-256 hashes are retained in `/private/tmp/jg-test-tests-config-1/`.
- All inputs are synthetic and supplied explicitly to the parsers. No real environment secret was read for test inputs, no identity connection was made, and no setting was approved for deployment. No migrations, grants, commercial policies, operational alerts or compatibility changes; standard F unchanged.

### Targeted tests and scratch mutation evidence

Both required targeted commands ran sequentially with `--maxWorkers=2` and exit 0:

```text
pnpm --filter @jobguard/config exec vitest run --maxWorkers=2 src/api-environment.boundaries.test.ts src/identity-environment.database-boundary.test.ts
pnpm --filter @jobguard/config exec vitest run --maxWorkers=2 src/identity-environment.required-settings.test.ts src/identity-environment.secret-boundary.test.ts
```

Results: 18/18 and 9/9 tests passed respectively (`targeted-1.log`, `targeted-2.log`). CF1–CF4 each have positive and independent negative controls.

Mutations ran only on separate small package copies under the scratch directory, using the existing dependency installation. Each mutated suite ran before its unchanged-source control. The worktree source was never mutated. The retained `run-mutations.py` and `mutation-results.json` record commands and directories; every invocation uses real Vitest with at most two workers.

| Scratch-only mutation | Expected assertion failure (exit 1) | Unchanged-source control (exit 0) |
| --- | --- | --- |
| Remove port `.max(65535)` | Explicit `65536` refusal; 1 failed, 8 passed | 9 passed |
| Remove database URL refinement | All 3 wrong protocols and 4 wrong usernames; 7 failed, 2 passed | 9 passed |
| Make `AUTH_ALLOWED_ORIGIN` optional | Independently omitted origin refusal; 1 failed, 4 passed | 5 passed |
| Lower secret minimum from 32 to 31 | 31-character secret refusal; 1 failed, 3 passed | 4 passed |

### Repository checks executed in this continuation

All pnpm checks used the cached pinned pnpm through the scratch `bin` PATH. Lint and subsequent checks ran with `LANE_BASE_REF=origin/main`; the observed local reference was `b881f90be0a6d368838ca4392338147ef819bd3a`, not a fetched or updated ref. No runner bypass was used.

| Command | Exit/result | Log under scratch directory |
| --- | --- | --- |
| `git rev-parse HEAD` | 0; `deb054f22a8bdc360dc4dbf1349adf441a9b9428` | Recorded above |
| `git status --short` | 0; clean at entry; only receipt and ledger modified at finish | `final-state.log` |
| `df -g /System/Volumes/Data` | 0; 62 GiB available at entry and after build | `final-state.log` |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0; 7/7 tasks successful | `typecheck.log` |
| `pnpm exec turbo run lint --force --concurrency=2` | 0; 7/7 tasks successful | `turbo-lint.log` |
| `node tools/lint.mjs` | 0; actual repository lint checks | `root-lint.log` |
| `pnpm lint:lanes` | 0; local lane check, no CI event simulation | `lint-lanes.log` |
| `pnpm build --force --concurrency=2` | 0; 7/7 tasks successful | `build.log` |
| `pnpm openapi:check` | 1; BLOCKED before assertions: `tsx` IPC socket creation denied with `listen EPERM` | `openapi.log` |
| `git diff --check` and `git diff HEAD^ HEAD --check` | 0; clean | `final-state.log` |

Turbo emitted `IO error: Operation not permitted` warnings but completed its actual typecheck, lint and build tasks successfully with zero cached tasks. OpenAPI remains unverified here; the sandbox socket restriction was not bypassed. Root lint was executed as its actual `node tools/lint.mjs` component alongside the forced package lint, rather than claiming a separate `pnpm lint` invocation. The order's full test, DB/migration and browser restrictions remain in force.

Final working-tree changes are this receipt and `docs/ledger/TESTS-CONFIG-1.md` only. The intended conventional commit subject and body are in `/private/tmp/jg-msg-tests-config-1.txt`; the dispatcher owns any commit. Source hashes in `source-hashes.json` were checked unchanged after all commands. No files were deleted, no dependency installation was performed, and no Git writes, push, merge, deployment or external business action occurred.

### Independent review and remaining gates

Fresh-context reviewer `/root/sol_review`, model `gpt-6-sol`, high reasoning effort, returned this response against implementation commit `deb054f22a8bdc360dc4dbf1349adf441a9b9428`:

> PASS — source review only for commit deb054f22a8bdc360dc4dbf1349adf441a9b9428. CF1–CF4 cover the requested parser boundaries, and the commit makes no parser, default, policy, or existing-test changes. I found no blocking source issue.
>
> I did not run tests or verify the builder receipt’s results. This is neither technical acceptance nor an Opus review; the decision 74 PARK restriction remains.

This is an actual independent source response, distinct from the builder-executed tests above. It does not cover the subsequent receipt-only update or a future dispatcher commit. Opus is unavailable in this session and its RED verdict remains pending; the dispatcher must obtain both required exact-final-commit reviews and separate acceptance. Full tests, DB/migration/browser suites and CI event/commit-specific lane checks remain NOT RUN locally under the order, retained for CI. No merge, push, enable or deploy: **PARK / RED review incomplete**.
