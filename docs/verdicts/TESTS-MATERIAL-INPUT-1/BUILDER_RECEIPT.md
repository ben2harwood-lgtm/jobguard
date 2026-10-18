Historical build record supplied in the starting commit (not this session's execution evidence):
Built by Claude Sonnet (Codex stand-in), dispatcher 14

# TESTS-MATERIAL-INPUT-1 — builder receipt

Branch `codex/sandbox/tests-material-input-1`, base `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`. Read AGENTS.md sections 2 and 5 and `apps/api/src/material.contracts.ts`. Status: HOLD for RED two-model check (Opus, Sol-high), then PARK (decision 74). No independent review is claimed.

## Changes
- `apps/api/src/material.contracts.boundary.test.ts` (new, 29 tests): MI1 price boundaries, MI2 calendar/interval boundaries, MI3 omitted end and retained fields.
- `config/lanes/tests-material-input-1.json` (new lane, order-specified), `docs/ledger/TESTS-MATERIAL-INPUT-1.md` (new), this receipt.
- No product code, existing test, pin or expectation changed.

## Red-first evidence (scratch copies, kept in /private/tmp/jg-test-tests-material-input-1/)
- Scratch copy of the contract without `.max(1_000_000_000_000)`: 2 failed / 27 passed (above-the-maximum, unsafe-integer prices accepted).
- Scratch copy without the `.refine` interval check: 1 failed / 28 passed (end-before-start accepted).
- Unchanged source: 29 passed.
Note: `pnpm --filter @jobguard/core build` was needed once so `@jobguard/core` resolves (dist is not tracked).

## Not run locally
Full tests, DB/migration/browser suites and commit-dependent lane checks: NOT RUN locally; CI retains them.

## Commands run (LANE_BASE_REF=origin/main)
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/material.contracts.boundary.test.ts`: 1 file, 29 passed.
- `pnpm exec turbo run typecheck --force --concurrency=2`: 7/7 successful.
- `pnpm exec turbo run lint --force --concurrency=2`: 7/7 successful.
- `pnpm build --force --concurrency=2`: 7/7 successful.
- `git diff --check`: clean. Free disk 52 GB (gate 33 GB per Ben decision 82).


## Codex continuation — 18 October 2026

This section records this session's execution; the earlier section is preserved historical evidence.

- Starting and retained HEAD: `dfa12b234d7270fceb011e378d6b7731a7ef860b` (already contains this task's test, lane, ledger and receipt). Original task base: `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`. Branch: `codex/sandbox/tests-material-input-1`. Initial `git status --short` was clean.
- Read repository AGENTS.md, BUILD_PLAN.md §5.4 and §11.3/M2-1, the material contract, existing boundary tests, and audit proposals 1–2. The referenced J6 pre-build check was not present in this checkout; READY is an order-supplied statement, not independently verified here.
- The intended test implementation and exact requested lane JSON already existed. No test, expectation, product code, schema, date policy, permission, price, package pin or lane file was changed in this session. Only this receipt and the task ledger are updated. Proposal 3 and LATER-B15 remain excluded.
- Cached dependencies were reused; no install was run. Runtime was Node `24.17.0` versus `.nvmrc` `24.15.0` (same approved major; this is not a clean pinned-runtime install claim). pnpm `10.28.1`, Vitest `4.1.11`, Turbo `2.10.12`.
- The default pnpm launcher emitted a v11 configuration warning and stalled on `--version`; it was interrupted. Subsequent commands use a temporary PATH shim executing the already-cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` with `/usr/local/bin/node`. No runner configuration or repository script was changed.
- `df -g /System/Volumes/Data`: 62 GB available at start and during checks, above the 33 GB floor. No cleanup or deletion was performed by the builder.

### Fresh red-first proof

Artifacts: `/private/tmp/jg-test-tests-material-input-1/codex-20261018/`. The scratch test files are byte-identical copies of the existing test. Each scratch contract differs by exactly the named omission; original source remained unchanged throughout. Scratch directories have a module package marker and a symlink to the existing API dependency directory. Both red runs completed before the green source run, with at most two Vitest workers and no concurrent test runs.

| Command (using cached pinned pnpm) | Result | Log |
| --- | --- | --- |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --root /private/tmp/jg-test-tests-material-input-1/codex-20261018/without-maximum material.contracts.boundary.test.ts` | Expected exit 1: 2 failed / 27 passed; above-maximum and unsafe-integer inputs accepted after removing `.max(1_000_000_000_000)` | `red-maximum.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 --root /private/tmp/jg-test-tests-material-input-1/codex-20261018/without-interval material.contracts.boundary.test.ts` | Expected exit 1: 1 failed / 28 passed; reversed interval accepted after removing the final interval refinement | `red-interval.log` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/material.contracts.boundary.test.ts` | Exit 0: 29 passed | `green-boundary.log` |

SHA-256 bindings (also in `input-hashes.json`):

- Contract: `b03f7e82776f63963e66d27928c327f64f32b46251789ad6f6487648f6cd6592`.
- Boundary test: `c3f450c9b9de8268056f560138775dc7b0f38eb693d6e73e35f3c3c8fb206102`.
- Lane: `3c2a51eebac6e2d5a23566266d790b63355b8d6dfcf659f2365d1fd84b2f36c4`.

MI1, MI2 and MI3 are test-executed. The two independent omissions are detected. This proves schema parsing behavior only, with no claim about current-rate selection, storage, tenant isolation or purchase-order execution. Relevant invariants are AGENTS.md §5.5 exact money and §2.7 versioned input schemas; neither is changed.


### Current local checks

All checks below used the cached pnpm shim described above and `LANE_BASE_REF=origin/main` (`origin/main` resolved to `b881f90be0a6d368838ca4392338147ef819bd3a`). Logs and exact exit codes are retained in the artifact directory, including `check-results.json`.

| Command | Result | Log |
| --- | --- | --- |
| `pnpm exec turbo run typecheck --force --concurrency=2` | PASS, 7/7 tasks | `typecheck.log` |
| `pnpm exec turbo run lint --force --concurrency=2` | PASS, 7/7 tasks | `turbo-lint.log` |
| `pnpm lint --force --concurrency=2` | PASS, repository checks and 7/7 workspace tasks | `lint.log` |
| `pnpm lint:lanes` | PASS, local merge-base plus working-tree scope check | `lint-lanes.log` |
| `pnpm build --force --concurrency=2` | PASS, 7/7 tasks, 41 static pages generated | `build.log` |
| `pnpm openapi:check` | BLOCKED, exit 1 before generator execution: tsx IPC socket `listen EPERM` under the sandbox | `openapi.log` |
| `git diff --check` | PASS | `diff-check.log` |

Turbo emitted nonfatal IO permission warnings; Next.js emitted workspace-root/multiple-lockfile and dynamic-dependency warnings. Their processes still returned success. No warning-driven source or pin changes were made. The OpenAPI runner was not bypassed; the standard check remains required in CI.

Full tests, PostgreSQL/database/migration suites, browser/e2e suites and CI event/commit-dependent lane checks were NOT RUN locally, as ordered. The dispatcher-requested local `lint:lanes` was run and is distinct from those CI checks. No AI schema/prompt change, so no eval run. No clean install was performed because the order requires cached dependencies and forbids downloads.

### Handoff and remaining gates

No migrations, grants, backwards-compatibility changes, operational alerts or external actions. No new Git writes, commit, push, merge, enablement or deployment were performed. Intended commit message is in `/private/tmp/jg-msg-tests-material-input-1.txt`, subject `test(material): cover price and rate-date boundaries`.

Decision 74: PARK. Technical acceptance remains held for complete RED review, final-commit binding and required CI evidence, including the blocked OpenAPI check. No Opus review is claimed: no callable Opus review capability is provided in this session. No builder acceptance or professional/commercial/security sign-off is inferred from passing local checks.


### Independent Sol-high verdict (recorded response)

The following is the independent `gpt-6.1-sol` high-effort reviewer response, preserved verbatim. It covers the existing commit and unchanged executable files, excludes this session's documentation edits, and does not replace the blocked standard OpenAPI check or any required suite. Opus and final-commit review remain outstanding.

> # TESTS-MATERIAL-INPUT-1 — independent RED review
>
> Date: 18 October 2026. Reviewer: independent Sol-high reviewer agent requested for this task. Verdict: **PASS for the reviewed test/schema scope; no blocking findings**. This is a review verdict, not technical acceptance, an Opus review, permission to merge, enable or deploy, or proof of the full definition of done. Decision 74 remains PARK after the required checks.
>
> Reviewed base: `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`.
> Reviewed commit: `dfa12b234d7270fceb011e378d6b7731a7ef860b`.
>
> SHA-256 of reviewed working files, confirmed unchanged from that commit:
>
> - `apps/api/src/material.contracts.ts`: `b03f7e82776f63963e66d27928c327f64f32b46251789ad6f6487648f6cd6592`
> - `apps/api/src/material.contracts.boundary.test.ts`: `c3f450c9b9de8268056f560138775dc7b0f38eb693d6e73e35f3c3c8fb206102`
>
> ## Source-inspected
>
> Read AGENTS.md, BUILD_PLAN.md §5.4 and M2-1, the base-to-commit diff, both material contract files, relevant core material definitions, package configuration, and existing receipt/ledger/lane configuration. `git diff --exit-code` confirmed no material schema change in base-to-commit and no working-file changes against the reviewed commit for the schema or added test. The only executable change in the reviewed diff is the new boundary test; no existing test or product/schema/policy source is changed.
>
> - MI1: explicitly accepts zero and the existing `1_000_000_000_000` upper bound; refuses negative, fractional, nonfinite, string/boolean/null/missing, above-limit and unsafe-integer prices. These boundaries match the existing schema and the plan's application money limit.
> - MI2: accepts a real leap day and equal endpoints; rejects malformed/non-calendar dates in both date positions and reversed intervals, including a year crossing. Tests inspect actual schema parsing rather than a reproduced validator.
> - MI3: checks both undefined value and absence of the omitted end key; checks retained price, unit, tax, start/end and expected-version fields after a successful parse. It also rejects unsupported unit/tax enum values. No fixture silently changes the existing policy.
>
> No blocker or required product/schema change was found. Broader persistence/controller/current-rate selection and purchase-order behavior are outside this narrow task; no such guarantee is inferred.
>
> ## Independently executed
>
> Executed a direct Node `v24.17.0`/tsx import of the actual `materialRateCommandV1` using:
>
> `node --import ./apps/api/node_modules/tsx/dist/loader.mjs --input-type=module`
>
> The inline probe used `node:assert/strict`; it passed ten refusal cases: non-leap century dates `1900-02-29` and `2100-02-29`, April 31, invalid optional end dates (non-leap February 29 and month zero), null end, false/string/bigint prices, and a fractional price above the maximum. Additional assertions passed for equal leap-day endpoints at `2000-02-29`, the maximum price, zero price, complete accepted-object equality including `each`, `unknown` and `packEachQuantity`, and absence of the omitted end key. Exit code 0.
>
> I did not start Vitest workers, run full suites, access a database/browser/network, install dependencies, or change tracked files. The independent execution above is a deterministic probe; this written review is the model assessment.
>
> ## Existing execution evidence inspected, not rerun by this reviewer
>
> Read `/private/tmp/jg-test-tests-material-input-1/codex-20261018/green-boundary.log`, `red-maximum.log`, and `red-interval.log`. They report 29/29 tests passing unchanged, 2 failing/27 passing after scratch removal of the maximum guard, and 1 failing/28 passing after scratch removal of the interval guard. These are useful regression-sensitivity evidence, but are builder-produced executions, not independently rerun Vitest results.
>
> The parent is refreshing the builder receipt and ledger after the reviewed commit. Those later documentation edits are excluded from this verdict. Preserve the test/schema hashes above when carrying this verdict forward; a changed executable diff requires renewed review. Required Opus review, exact final-commit review binding, technical acceptance by the separate actor, full checks and any release/merge authority remain separate evidence.
