# RECOVER-TESTS-CONFIG-1 — READY

Plan piece: M0-6L/config, BUILD_PLAN.md §11.1. RED: identity/sign-in configuration boundaries.

Recovered only the four boundary test files from `origin/codex/sandbox/tests-config-1`
(`deb054f22a8bdc360dc4dbf1349adf441a9b9428`). The branch-audit entry was read using
`git show origin/codex/sandbox/branch-audit:docs/review/unmerged-branches-2026-11-05.md`.
At inspection, HEAD and origin/main were `62081c68933d0b953e7dd75a8cbd7b3a2fb4f304`.
The four files and their boundary coverage were missing there; local main was older.
Current exported parsers support the recovered tests unchanged.

Coverage: API default and valid/invalid port limits; PostgreSQL identity credential
and protocol restrictions; each required identity setting; secret length 31 rejected
and lengths 32, 33 and 64 accepted. All inputs are fictional. No product changes,
migrations, new dependencies, operational alerts or compatibility changes.
Affected invariants: typed environment validation and separate identity credentials
(AGENTS.md §§2.8, 5.1 and 5.11). No worthwhile simplification identified on initial review.

## Local verification

From `packages/config`, using the installed package test runner directly (the package
test script is `vitest run`), with at most two workers and three named files per run:

- `./node_modules/.bin/vitest run --maxWorkers=2 src/api-environment.boundaries.test.ts src/identity-environment.database-boundary.test.ts src/index.test.ts`
  — 3 files, 19 tests passed.
- `./node_modules/.bin/vitest run --maxWorkers=2 src/identity-environment.required-settings.test.ts src/identity-environment.secret-boundary.test.ts src/auth-url.test.ts`
  — 3 files, 54 tests passed.

From the repository root:

- `./node_modules/.bin/tsc -p packages/config/tsconfig.json --noEmit` — passed
  (the config package uses this same command for typecheck and lint).
- `git diff --check` — passed for tracked changes; new test files match the original
  branch bytes exactly.
- `node tools/agent-lane-boundary-lint.mjs` — refused the self-comparison because
  uncommitted HEAD equals origin/main. This is not a lane PASS.
- A direct check using the lane tool's exported policy loader, selector and path
  validator passed for all six untracked files; the allow list exactly matches
  all five non-lane paths. New-file whitespace checks passed, and all four test
  files were verified byte-identical to the old branch. An initial scratch
  whitespace expression matched newlines; corrected to spaces/tabs before rerun.

27 recovered tests and 46 existing tests passed. No weakened assertions or product
defects found. No database/browser suites run: this sandbox cannot start PostgreSQL
or bind localhost, and the change is confined to pure configuration unit tests.

## Named holds for landing

- Router must commit and push the NOPR branch; no commit, push or PR was made here.
- Independent RED review against the exact eventual head remains required.
- CI must prove lane boundaries and the full required typecheck, lint, test and build
  checks against current main. Any mandatory database/migration/browser checks run
  in CI, not this sandbox. These unit tests do not establish live identity-provider
  operation, database privilege isolation or release approval.
