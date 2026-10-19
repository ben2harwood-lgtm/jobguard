# TESTS-CUSTOMER-RECEIPT-INPUT-2 — builder receipt

Status: working-tree implementation complete; local checks recorded below, with root lint/lanes and OpenAPI held for CI. RED; decision 74 PARK. Nothing committed or accepted by the builder.

Base: `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`. Branch: `codex/sandbox/tests-customer-receipt-input-2`.

Scope: two new reversal-input test files, exact lane registration, task ledger and this receipt. Shared contracts, product code, existing tests/expectations, permissions, prices, policies and pins unchanged. No migration, grants, persisted effects, external action or web workflow. Standard F unchanged.

RR1: eight independent forged fields (tenant, job, actor, permissions, environment, amount, recovery proof and platform settlement) each require rejection with an unrecognized-key issue. RR2: exact 3/240 endpoints and padded forms pass; trimmed 0/1/2 and 241 characters refuse. Interior spaces remain intact. RR3: normalization preserves all three distinct identities and the version, produces a separate parsed object and leaves the frozen source object unchanged. No INPUT-1 UUID/version matrix repeated.

Affected guarantees: BUILD_PLAN §2.4 C5, §7.2 M1-12; AGENTS §5.5, §5.13. These tests prove input parsing only; no persisted reversal/history, authentication, database tenant-isolation or provider guarantee is claimed. No data migration, operational alert, backwards-compatibility impact or new release permission. C1: test-only, no web workflow and no invented browser spec. No shared-file overlap with INPUT-1; contracts remain read-only.

Evidence directory: `/private/tmp/jg-test-tests-customer-receipt-input-2/`. Initial and later disk checks reported 52 GB and 50 GB available, both above the 33 GB floor. The prepared dependency installation was reused; no install, browser or database download command was run. Installed Node is `v24.17.0` (repository `.nvmrc`: `24.15.0`); pins were not changed. The default `pnpm --version` launcher exited 1 after its automatic version switch could not verify registry signatures due to fetch failure. Subsequent commands use the already cached pinned pnpm `10.28.1`, via a task-local symlink in the evidence directory's `bin/` and `PATH=/private/tmp/jg-test-tests-customer-receipt-input-2/bin:$PATH`. No package-manager setting, check, runner or permission was bypassed.

Commands actually run (exit codes):

| Command | Result | Evidence |
| --- | --- | --- |
| `git rev-parse HEAD`; `git status --short`; `df -g /System/Volumes/Data` | 0; initially clean, correct base and disk floor | Base/disk above |
| `pnpm --version` using cached pinned pnpm | 0; `10.28.1` | Existing local cache |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --root /private/tmp/jg-test-tests-customer-receipt-input-2/no-strict customer-receipt-input.reversal-authority.test.ts` | 1, intended red: 8 failed, 1 passed | `no-strict.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --root /private/tmp/jg-test-tests-customer-receipt-input-2/no-trim customer-receipt-input.reversal-reason.test.ts` | 1, intended red: 8 failed, 5 passed | `no-trim.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/customer-receipt-input.reversal-authority.test.ts src/customer-receipt-input.reversal-reason.test.ts` | 0; 2 files, 22 passed | `targeted.log` |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0; all 7 packages | `typecheck.log` |
| `pnpm exec turbo run lint --force --concurrency=2` | 0; all 7 packages | `turbo-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint --force --concurrency=2` | 1; core purity passed, lane checker refused HEAD/base self-comparison | `root-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same self-comparison refusal | `lanes.log` |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | 0 each; standalone supplemental checks, not root lint success | Command output |
| `pnpm build --force --concurrency=2` | 0; all 7 packages, web generated 41 static pages | `build.log` |
| `pnpm openapi:check` | 1; sandbox denied `tsx` IPC pipe listen (`EPERM`) before generation/check | `openapi.log` |
| `git diff --check` | 0 | Command output; repeated at handoff |

Scratch proof: only the reversal `.strict()` or reason `.trim()` was removed in separate copied schemas under the evidence directory; repository source was never mutated. Test copies match the delivered tests byte for byte. `reproduce-scratch.py` recreates these isolated copies when given the worktree path. `source-sha256.json` records test/lane/contract hashes. Read-only byte comparisons against `git show HEAD:<path>` confirmed the shared contract and existing test are unchanged; tracked diff is empty and the untracked list contains exactly the five authorized additions.

Full `pnpm test`, PostgreSQL, migration and browser/e2e suites: **NOT RUN locally**, per the issued resource/sandbox limits. Commit-dependent lane validation: **NOT RUN against a task commit** because the dispatcher owns committing; the actual local attempts above are failures, not passes. No runner bypass, alternate base, Git write, deletion, live provider, actual reversal or real data used. Turbo reported sandbox cache IO warnings; successful package check results above are recorded separately from those warnings.

Handoff: `/private/tmp/jg-msg-tests-customer-receipt-input-2.txt` contains the intended conventional commit subject and body. CI remains mandatory, including root lint/lanes after commit, OpenAPI and the full required suites. Opus and Sol-high independent RED verdicts against the dispatcher's exact resulting commit are **PENDING**, as is separate technical acceptance. No recorded review or acceptance is claimed. Decision 74: PARK; never merge, enable or deploy without Ben's button.
