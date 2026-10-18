# TESTS-INBOX-INPUT-1 — current builder receipt, 18 October 2026

**BUILD-DON'T-MERGE, decision 74: PARK / technical acceptance HOLD.**
No commit, Git write, push, merge, enablement or deployment was performed.

## Starting state and scope

- Actual starting HEAD: `3d4a3a3c49abc421e926733f8d8d1ff9547ff153`, branch
  `codex/sandbox/tests-inbox-input-1`, clean working tree. This checkout already
  contained the earlier task implementation, whose parent is `1bcd8db8`.
  It was not an empty task checkout. Local `origin/main` resolves to
  `b881f90be0a6d368838ca4392338147ef819bd3a`; no fetch was performed.
- Read AGENTS.md, BUILD_PLAN.md §2.4 C5 and M2-7, contracts/application/session
  tests, and audit proposals 1–3. The referenced `checks/J6-jobguard-next-orders-night4-check.md`
  is absent here; its READY status is user-supplied, not independently verified.
- Added nine cases to the existing 25 boundary tests, preserving every original
  expectation byte-for-byte from `const owner` onward. The suite now has 34 tests.
  New coverage checks typed envelope refusal, all repository arguments for valid
  commands and 0/100 budgets, and separate ownership barriers for every action.
  B completes while A remains blocked; both calls retain their job, session,
  context, membership, digest, command and decision identities. No repository
  call is permitted while both ownership lookups are pending.
- Changed only the permitted test file, ledger and this receipt. The lane file
  already matches the order verbatim and remains unchanged. No product code,
  schema, budget limit, controller, repository, policy, permission, price, pin,
  existing expectation, grant or migration changed. Standard F unchanged.
- Affected guarantees: AGENTS §§5.1, 5.3 and input-boundary validation;
  BUILD_PLAN.md §2.4 C5. Synthetic doubles prove application orchestration only,
  not PostgreSQL tenant isolation, actual authentication or persistence behavior.
  No backwards-compatibility impact, new operational alert or release enablement.

## Environment and reproducible evidence

All retained artifacts are in `/private/tmp/jg-test-tests-inbox-input-1/`.
The default pnpm 11 launcher stalled and was interrupted; no install or download
was requested. Subsequent commands used the already cached **pnpm 10.28.1** via
`PATH=/private/tmp/jg-test-tests-inbox-input-1/bin:$PATH` (a symlink to
`/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`).
Existing Node is **24.17.0**; `.nvmrc` says 24.15.0. No runtime or pin was changed.
Existing dependencies were reused; a clean pinned install was NOT run.
Disk: 62 GB free initially, 61 GB during checks, above the 33 GB floor.

Scratch copies contained only the application, contracts, access bridge and test,
with a link to existing API dependencies. Repository product source was never
mutated. Each command was a real Vitest run with `--maxWorkers=2 --root <variant>`;
runs were serial. `mutations.json` records results; each variant has its own log.
All eight mutation runs happened before the green unchanged-source run.

| Scratch omission | Exit | Failing tests |
| --- | --- | --- |
| Remove seed strictness | 1 | 2 |
| Remove budget strictness | 1 | 2 |
| Remove dismiss strictness | 1 | 2 |
| Raise max budget from 100 to 101 | 1 | 2 |
| Replace view ownership job | 1 | 2 |
| Replace seed ownership job | 1 | 3 |
| Replace budget ownership job | 1 | 5 |
| Replace dismiss ownership job | 1 | 3 |

`source-integrity.json` verifies unchanged product-source hashes, an empty
protected-source diff and preservation of the original 25 tests. No scratch
files were deleted. These are deterministic mutation results, not model review.

## Commands actually run

| Command | Result / artifact |
| --- | --- |
| `git rev-parse HEAD`, `git status --short`, `df -g /System/Volumes/Data` | Starting state above; no Git writes |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/inbox-relevance.boundary-missing.test.ts src/inbox-relevance.session.test.ts` | PASS, 2 files / 38 tests; `unit-green.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/inbox-relevance.boundary-missing.test.ts` | PASS, 34 tests after build; `boundary-final.log` |
| `pnpm exec turbo run typecheck --force --concurrency=2` | PASS, 7/7 tasks, no cache hits; `typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS, root invariants and 7/7 package tasks (5 cached); `lint.log` |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force --concurrency=2` | PASS, 7/7 tasks, no cache hits; `lint-forced.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, local working-tree mode; `lint-lanes.log` |
| `pnpm build --force --concurrency=2` | PASS, 7/7 tasks, no cache hits; `build.log` |
| `pnpm openapi:check` | FAILED (exit 1): sandbox denied tsx IPC socket with `listen EPERM`; `openapi-check.log`. No runner bypass or escalation used |
| `git diff --check` | PASS; repeated at handoff |

Turbo emitted sandbox cache IO warnings; Next emitted dynamic dependency warnings.
Neither prevented successful typecheck, lint or build completion.
Full tests, PostgreSQL, migration suites, browser/e2e, live-provider evaluation,
clean install and CI event/commit-dependent lane checks: **NOT RUN locally**.
CI retains these gates; no check was disabled. OpenAPI needs a permitted CI rerun.

## Independent review and remaining holds

The requested fresh-context **gpt-6.1-sol / high** reviewer returned preliminary
**source-inspected PASS, no concrete defects**. Its actual response is retained
in `sol-high-review.txt`; it checked preservation of existing assertions, exact
routing, session binding, controlled B-before-A completion and source scope.
It ran `git diff --check`, but no tests and no Git writes. This is not an Opus
review, executable verification by the reviewer, or technical acceptance.

Review binding: base HEAD above plus test SHA-256
`24cc0a341a59b0468c57c57a797332a3ba4c88022565e24c166bb62e9c2b9d10`.
The current diff is uncommitted, so no exact-commit verdict is claimed.
Opus is not available through the configured agent models; no outward CLI/API
review was invoked under this order's no-outward-actions limit. The dispatcher
must obtain Opus review, bind/rebind RED verdicts to the final commit, retain CI
checks and obtain separate acceptance. Ben's button remains required for merge,
enablement or deployment. **PARK; RED review is incomplete.**

Intended commit subject/body: `/private/tmp/jg-msg-tests-inbox-input-1.txt`.
The dispatcher, not this builder, commits.

---

## Historical receipt inherited from starting HEAD

The following receipt is preserved as historical evidence only. Its earlier
commands and results are not claimed as executions by this continuation.

Built by Claude Sonnet (Codex stand-in), dispatcher 14

# TESTS-INBOX-INPUT-1 builder receipt

Base 1bcd8db8; branch codex/sandbox/tests-inbox-input-1. Test-only; decision 74 BUILD-DON'T-MERGE.

## Changed
- apps/api/src/inbox-relevance.boundary-missing.test.ts (new, 25 tests): IB1 strict commands (extra tenantId/membershipId/digest/context/jobId refused; valid input reaches its own repo method), IB2 budget 0/100 pass, 101/1000/-1/fractions/strings/null/NaN/Infinity/boolean/missing refused with no repo call, IB3 barrier-interleaved applications keep own job/context/membership/digest for seed/budget/dismiss/view, IB4 invalid body -> no repo call and access denial wins over validation error.
- config/lanes/tests-inbox-input-1.json (lane from order, verbatim)
- docs/ledger/TESTS-INBOX-INPUT-1.md, this receipt.

## Scratch mutations (each reverted from backups; source unchanged, `git status` shows only the new files)
- Remove `.strict()`: 3 fail (IB1 seed/budget/dismiss).
- budget max 100 -> 101: 2 fail (IB2 101, IB4 invalid budget).
- Budget ownership lookup uses another request's job: 1 fail (IB3).
- Validate before authority in budget: 1 fail (IB4 access-denial order).

## RED note
Against unchanged source all 25 new tests PASS (the behaviour already exists; they are missing-coverage tests). "RED" refers to the check lane, not failing tests. The failing runs are the scratch mutations above.

## Commands run
- df -g: 48 GB free.
- `pnpm --filter @jobguard/db... build` first (needed for @jobguard/db resolution in vitest; dist not committed).
- vitest boundary-missing + session tests (--maxWorkers=2): 2 files, 29 passed.
- turbo typecheck --force --concurrency=2: 7/7. turbo lint (LANE_BASE_REF=origin/main): 7/7. pnpm build --force --concurrency=2: 7/7. git diff --check: clean.

## NOT RUN
Full test suite, DB/migration/browser suites, commit-dependent lane checks (CI). No PostgreSQL used.
