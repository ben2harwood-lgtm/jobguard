# TESTS-POLICY-BOUNDARY-1 — current verification receipt (18 October 2026)

**PARK / incomplete RED review. No acceptance, merge, activation or deployment.** This section records the current Codex run; the inherited receipt below is historical and is not evidence of actions in this session. RED means the required two-model review lane; mutation failures are separate deterministic evidence.

## Starting state and scope

Started in the assigned worktree on `codex/sandbox/tests-policy-boundary-1`, with clean status at `d829296c939d4cc786ee319d80a69ea1117c7bff`. That commit already contains both tests, the requested lane JSON, ledger and receipt. The dependency `1bcd8db8` is an ancestor. Local `origin/main` was `b881f90be0a6d368838ca4392338147ef819bd3a`; this checkout was therefore an inherited task branch, not a newly created checkout of origin/main.

The no-existing-test-edits rule was applied: both existing tests and their expectations are unchanged. No product code, decision record, permission, policy version, approval status, package pin, migration or grant changed. Only this receipt and the task ledger change in this session. No Git writes, commit, push, outward action, browser, database, download or deletion was performed. The existing lane JSON already matches the order. No bootstrap or identity-database tests were added.

Installed runtime: Node `v24.17.0` (the inherited `.nvmrc` says `24.15.0`; no pin was changed). pnpm `10.28.1` came from its existing Corepack cache via `/private/tmp/jg-test-tests-policy-boundary-1/bin/pnpm` on PATH. The ordinary pnpm launcher stalled on `--version` and was interrupted; no install was attempted. This is an existing-install verification, not a clean pinned-install claim. Disk: 62 GB available, above the 33 GB floor. Tests used at most two workers.

## Deterministic execution evidence

Artifacts are under `/private/tmp/jg-test-tests-policy-boundary-1/`, including scratch trees, command logs, `check-results.json`, `mutation-results.json`, `initial-sha256.json` and `session-context.json`.

1. Copied the unchanged tests and gate into three independent scratch directories. Only each scratch gate was mutated; repository source was never changed or restored.
2. First removed `decision.id !== requiredId || `: exit 1; PG1 failed twice (wrong approved identity accepted; required-ID refusal missing), with six other tests passing. Log: `identity-removed.log`.
3. Separately replaced `decision.status !== "approved"` with `decision.status === "proposed"`: exit 1; the two superseded PG2 cases and PG3 denial-context case failed, with five other tests passing. Log: `status-proposed-only.log`.
4. Unchanged scratch source passed all 8 tests; then the exact requested repository test command passed both files, 8/8. Log: `unchanged.log`, `targeted-tests.log`.
5. SHA-256 checks confirm that the implementation, both tests, lane registration and captured pin files are unchanged from session entry.

PG1 proves the existing matching/wrong identity gate; PG2 rejects proposed and superseded records, including after a successful approved call; PG3 checks typed denial context and frozen fixture preservation. No policy-version-matching requirement or non-production behavior was introduced. Fixture approval is fictional and is never founder approval or release evidence. The source-review caveat below limits the immutability claim.

`LANE_BASE_REF=origin/main` was set for all checks. Root lint ran separately from package lint, preserving its actual checks. Logs are named below relative to the artifact directory.

| Command actually run | Result | Log |
|---|---|---|
| `pnpm --filter @jobguard/config exec vitest run --maxWorkers=2 src/policy-gates.decision-identity.test.ts src/policy-gates.superseded-replay.test.ts` | PASS | `targeted-tests.log` |
| `pnpm exec turbo run typecheck --force --concurrency=2` | PASS | `typecheck.log` |
| `pnpm exec turbo run lint --force --concurrency=2` | PASS | `lint-packages.log` |
| `node tools/lint.mjs` | PASS | `lint-root.log` |
| `pnpm lint:lanes` | PASS | `lint-lanes.log` |
| `pnpm build --force --concurrency=2` | PASS | `build.log` |
| `pnpm openapi:check` | FAILED (exit 1) | `openapi.log` |
| `git diff --check` | PASS | `diff-check.log` |

OpenAPI verification is **BLOCKED / NOT VERIFIED**: the prescribed `pnpm openapi:check` exited 1 because tsx could not bind its local IPC pipe (`listen EPERM`). No alternate runner, bypass or permission escalation was used. CI must run the normal command.

Typecheck, package lint and build each completed 7/7 tasks. Turbo emitted sandbox `Operation not permitted` cache-I/O warnings. The successful Next.js build also reported workspace-root inference, CSS/autoprefixer, cache-serialization and NestJS `file-type` export warnings; these unrelated files were not changed. See `build.log` for full import traces. A successful build is not a runtime integration claim.

## Independent recorded response

Model: gpt-6-sol; reasoning effort: high. Independent sub-agent /root/sol_review.

**Sol-high source-inspection verdict: PASS with a PG3 test-quality caveat**, bound to commit `d829296c939d4cc786ee319d80a69ea1117c7bff`. PG1 checks matching and wrong decision IDs. PG2 checks proposed and superseded records, including after an approved call. By inspection, removing the ID comparison or refusing only `proposed` would fail these tests. PG3 checks the denial’s required ID, mode, and supplied policy version.

The PG3 mutation test catches every exception and compares fixtures that are already frozen. It therefore gives weak evidence that the gate would leave a mutable input unchanged. The inspected implementation does not mutate its input. I ran no tests or mutants; the builder’s execution claims remain separate evidence.

SHA-256: implementation `fc84712246163ae958dccf03503ff6267df9213554c47d8be214e012c65c1875`; PG1 test `4bf5a83b1879d30ee419d5f0ea6f8f2298131dbfe3f16a504e49eb3f4763eb9b`; PG2/PG3 test `8b793b188232eaf4ebb6bbee6cf076637386c87491676898e2e00b6bd8edacf5`. This is an independent source review, not technical acceptance.


This review applies to the unchanged source/tests at the named commit, not to a later dispatcher commit containing these receipt updates. No Opus model was available through the provided agent interface, so the required Opus review was not run. Fresh exact-commit RED evidence and separate technical acceptance remain with the checker/dispatcher after any commit; the builder has not accepted its own work.

## Remaining gates and applicability

Full tests, PostgreSQL, migration suites, browser/e2e suites and CI commit-dependent lane checks were NOT RUN locally, as ordered; retain them in CI. Local `lint:lanes` was attempted as explicitly requested by the dispatcher, not substituted for CI. Any failed command above remains outstanding. No migration/rollback, backwards-compatibility impact or new operational alert applies; standard F and grants remain unchanged. No new AI behavior, prompt, provider integration or web workflow was introduced, so no live evaluation or browser claim is made.

Decision 74: BUILD-DON'T-MERGE, then PARK. No production gate or policy approval is supplied by these tests. Intended dispatcher commit subject: `test(policy): reject wrong and superseded decision approvals`; subject and body are in `/private/tmp/jg-msg-tests-policy-boundary-1.txt`.

---

## Inherited receipt (preserved historical text)

Built by Claude Sonnet (Codex stand-in), dispatcher 14

# TESTS-POLICY-BOUNDARY-1 — builder receipt

Branch `codex/sandbox/tests-policy-boundary-1`, base `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`. Check lane RED; BUILD-DON'T-MERGE (decision 74). No independent review is claimed. Per the coordinator's 17 Oct instruction the stand-in builder committed and pushed (replacing the order's "do not commit").

## What changed
- `packages/config/src/policy-gates.decision-identity.test.ts`: PG1 (matching approved identity passes; approved different decision refuses; refusal names the required decision).
- `packages/config/src/policy-gates.superseded-replay.test.ts`: PG2 (proposed and superseded refuse, including after an earlier approved call) and PG3 (refusal keeps decision id, mode, supplied policy version; frozen fixtures unmutated).
- `config/lanes/tests-policy-boundary-1.json`: lane registration exactly as the order gives.
- `docs/ledger/TESTS-POLICY-BOUNDARY-1.md`, this receipt.
No product code, decision record, policy version, status, pin or existing test touched. Fixture approval is not founder approval or release evidence.

## RED expectation
The order's RED is the mutation proof, not failing committed tests. Unchanged source: 2 files, 8 tests pass.
- Scratch mutation 1 (identity comparison removed): 2 fail, both PG1 ("refuses an approved record for a different decision", "refusal names the required decision, not the supplied one").
- Scratch mutation 2 (status check weakened to proposed-only): 3 fail: PG2 "refuses a superseded record", PG2 "refuses proposed and superseded ... after an earlier call passed", and PG3 "keeps required decision id, mode and supplied policy version" (it uses a superseded record).
`policy-gates.ts` restored byte for byte after each (git status shows it unmodified).

## Commands run
- `df -g /System/Volumes/Data`: 48 GB available (floor 33).
- vitest on the two files, `--maxWorkers=2`: pass (8/8) on unchanged source.
- `pnpm exec turbo run typecheck --force --concurrency=2`: 7/7 successful.
- `pnpm exec turbo run lint --force --concurrency=2` (LANE_BASE_REF=origin/main): 7/7 successful.
- `pnpm build --force --concurrency=2`: 7/7 successful.
- `git diff --check`: clean.

## NOT RUN
Full test suite, DB/migration/browser suites, commit-dependent lane-floor checks: CI/dispatcher. Opus and Sol-high RED checks not yet done. `/private/tmp/jg-test-tests-policy-boundary-1/` not created. Standard F: no new grants, migration none.
