# MON-3C-CAL builder receipt

```yaml
session:
  task: MON-3C-CAL
  date: 2026-10-25
  role: builder
  model: GPT-6 (Codex)
  model_variant: not exposed by this session
  branch: codex/sandbox/mon-3c-cal
  worktree: /Users/benharwood/Claude/Projects/my-new-project/.worktrees/mon-3c-cal
  inspected_head: 01f040d6a714ef1a7b12606e648a33624428b246
  review_requirement: one independent check (JobGuard fast lane)
  independent_verdict: pending dispatcher-created exact commit
  acceptance: pending separate actor
```

Builder implementation evidence only; this is not an independent verdict or acceptance.
No git write, commit, push, merge, deployment or runtime enablement was performed.

Read AGENTS.md, BUILD_PLAN.md §10.1.7/MON-3, the issued CAL draft in the
25 October order, and the accepted contract at `05feb4fb` using `git show`.
The inspected HEAD and origin/main were both `01f040d6a714ef1a7b12606e648a33624428b246`;
`28416d1e` is an ancestor. Initial working tree was clean. Installed Node is
24.17.0, TypeScript 5.8.3 and Vitest 4.1.12. Dependencies were already installed;
no install or package download was requested.

The global pnpm launcher stalled before running commands and was interrupted.
Checks use the already cached pinned pnpm 10.28.1 through a temporary PATH wrapper
at `/private/tmp/jg-cal-bin/pnpm`; nested pnpm calls use that same launcher.
An initial direct Vitest run caught one inconsistent conflict fixture; initial
typecheck caught a missing `unknown` cast in a deliberately malformed test input.
Both were corrected before final checks.

## Change and bounds

Two new pure-core files implement the C279 synthetic-only policy constant,
strict versioned schemas, typed invalid-input/policy-hold/source-conflict errors,
London calendar +90 midnight and exclusive as-of end projection. Date is used
only for calendar conversion/validation, never to compare source times; canonical
six-digit UTC strings preserve exact microseconds. Policy alternatives, including
spring-gap/autumn-overlap wall-clock requests, fail with a typed policy hold.

Server adapters must supply checked successful source facts: a schema cannot
prove database provenance. No `success` flag is accepted. Foreign tenants,
pre-start facts, recording before effective time, conflicting source IDs and
same-job second activation refuse. Other-job lock/close facts cannot end the
trial. Facts with future effective or recorded times are not visible until as-of.
Equal source IDs deduplicate; all co-earliest IDs sort lexically for display,
with no financial precedence. A deadline tie separately records that the deadline
was reached, without inventing a source ID. Late earlier facts shorten the result;
there is no reopen/reset action. The owner of immutable persistence must retain
the original start and end source history; this pure kernel cannot authenticate
inputs or enforce retention across calls.

CAL-01 covers March/October transitions, deadlines on transition dates, leap
February and month/year boundaries. CAL-02 tests one microsecond before/at/after
the exclusive deadline and precise explicit-source ordering. CAL-03 tests UTC
sources on both sides of the spring gap and both occurrences of the autumn
clock, plus held non-midnight policies. CAL-04 covers all permutations of three
co-earliest sources, duplicates and conflicts. CAL-05 covers each end independently,
foreign-job sources and invalid source bindings. CAL-06 rejects failed and
non-end kinds and success flags. CAL-07 rejects reopen/reset and changed start
with an old deadline, preserving earlier ends on later projections. CAL-08 runs
the original preview/period tests unchanged; byte-identity verification is below.

The lane permits only the two source files and this evidence directory (its own
JSON is implicitly allowed). Core barrel/export registration is left to the
coordinator: add `export * from "./free-first-job-calendar.js";` in the serialized
shared-file window if required by later consumers. No existing source file,
legacy lane register, price calculator, migration, transport or UI was edited.

## Executed checks

All commands ran sequentially. Each `pnpm` command used the temporary PATH
wrapper described above; each Vitest invocation used `--maxWorkers=2`.

| Command | Observed result | Evidence |
| --- | --- | --- |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/free-first-job-calendar.test.ts src/free-first-job.test.ts src/free-first-job-period.test.ts` | PASS: 3 files, 58 tests (44 new calendar tests) | `unit-calendar.log` |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/free-first-job-keys.test.ts src/subscription-period.test.ts src/subscription-architecture.test.ts` | PASS: 3 files, 26 tests | `unit-regressions.log` |
| `pnpm typecheck` | PASS: all 7 workspace tasks; run with no dist directories after removing only this run's generated outputs | `typecheck-no-dist.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL at lane comparison: HEAD equals origin/main, checker refuses a self-comparison; core purity passes first | `lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL for the same equal-ref reason | `lint-lanes.log` |
| `node tools/money-arithmetic-lint.mjs` | PASS, exit 0 | `lint-money.log` |
| `node tools/commercial-boundary-lint.mjs` | PASS, exit 0, no output | `lint-commercial.log` |
| `pnpm turbo run lint` | PASS: all 7 workspace tasks | `lint-workspaces.log` |
| `pnpm build` | PASS: all 7 workspace tasks including Next production build | `build.log` |
| `pnpm openapi:check` | FAIL before generator execution: tsx CLI IPC socket `listen EPERM` | `openapi.log` |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | PASS: same source generator and committed-schema comparison, without tsx CLI IPC | `openapi-node-import.log` (empty, exit 0) |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src` | PASS: 130 files, 3,051 tests | `unit-core.log` |
| Git HEAD byte comparison of protected files | PASS: source, preview tests, period tests and legacy register byte-identical | `byte-identity.log` |
| Supplementary uncommitted path audit using existing lane policy functions | PASS: only issued paths; this is not the root lane comparison check | `uncommitted-allowlist.log` |
| `git diff --check` | PASS; new source files separately inspected | No output, exit 0 |

The final no-dist typecheck, workspace lint, narrow calendar tests and build
include the defensive local-year/era boundary check. Root tests requiring DB or
browser infrastructure were not run. Full core tests preserve all earlier core
acceptance tests. Turbo reported sandbox cache I/O warnings; Next reported the
existing outer-workspace lockfile/root warning and dependency warnings. Neither
changed the successful exit statuses.

No lane tool or base ref was weakened to obtain a pass. The dispatcher must
commit the candidate and rerun root lint and lane lint with the real distinct
base/head comparison. Normal OpenAPI CLI execution also remains a CI check;
the fallback result is recorded separately, not presented as a passing normal
command.

Intended conventional commit subject/body is written to
`/private/tmp/jg-msg-mon-3c-cal.txt`. Source hashes are in `source-sha256.log`;
there is no builder-created commit SHA. All durable evidence is in this worktree.

## Release and review holds

C279 resolves only the synthetic London trial clock. H-CONVERSION remains HELD;
no conversion billing date, terms, money, subscription obligation, source
materialization, provider operation or public trial path is enabled. Inherited
predecessor/source/practice/enablement and live release gates remain with their
owners; source inspection does not claim their independent acceptance.

No DB, migration, browser or live-model subsystem changes: their suites are
inapplicable to this pure leaf. Sandbox PostgreSQL/browser suites and complete
root required CI remain for GitHub CI after dispatcher push. One independent
check (JobGuard fast lane), exact-commit separate acceptance and founder merge
remain pending. The dispatcher alone creates the commit after builder exit.
