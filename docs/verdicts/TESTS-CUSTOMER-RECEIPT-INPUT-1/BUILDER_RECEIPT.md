# TESTS-CUSTOMER-RECEIPT-INPUT-1 — builder receipt

17 October 2026. **RED / PARK — BUILD-DON’T-MERGE, decision 74.**
Base and unchanged HEAD: `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`.
Branch: `codex/sandbox/tests-customer-receipt-input-1`.
No commit, staging, checkout, push, PR, merge, enablement or deployment performed. The dispatcher owns committing this working-tree change; Ben’s button remains required.

## Scope and acceptance evidence

Added three input-contract test files, the exact task lane registration, the task ledger and this receipt. The existing parser/contracts, money rules, invoice writer, existing tests/expectations, permissions, prices, policies, package pins and lockfile are unchanged. No migrations or grants; standard F unchanged. No new operational alerts, provider routes or backwards-compatibility impacts. No shared product-file overlap; the checker/dispatcher owns the later exact-commit verdicts.

- **RI1:** five independent cases check `0.1` → 10, `0.5` → 50, `1.2` → 120, `9999999999.9` → 999,999,999,990 and `9999999999.99` → 999,999,999,999 pence through both the pounds parser and record schema.
- **RI2:** valid integer pence, including 1 and the 1,000,000,000,000 limit, is preserved. Strings, booleans, null/undefined, arrays, objects, nonfinite, negative, zero, fractional, over-limit and unsafe values fail without coercion.
- **RI3:** exact record/reversal versions and each applicable command/invoice/payment UUID are tested with all other fields valid. Each field is separately omitted; malformed/type-invalid identities and sibling/future versions are independently rejected. Distinct valid synthetic IDs are preserved.

These assertions concern input meaning only. They do not prove settlement, posting, authorization, idempotent execution, tenant isolation or database guarantees. Affected invariants: AGENTS §§5.3 and 5.5; BUILD_PLAN §§5.3 and 5.4, merged M1-12/UIWIRE-12 boundaries. Read the current contracts, existing receipt tests and the supplied audit proposals 1–3 at `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-customer-receipt-input.tests.md`. The referenced J6 pre-build check file was not found at the supplied relative path or under the inspected full-steam checks path; its supplied READY status is not an implementation verdict.

## Tests first: isolated mutation evidence

Before the green-source run, `python3 /private/tmp/jg-test-tests-customer-receipt-input-1/run-mutations.py` exited 0 after verifying that each separate scratch-source mutation exited 1 for an intended assertion:

| Scratch mutation | Intended failure | Failed tests |
| --- | --- | --- |
| `fraction.padEnd(2, "0")` → `fraction.padStart(2, "0")` | `0.1` returned 1 instead of 10; the other single-digit cases also failed | 4 |
| shared `z.number()` → `z.coerce.number()` | Numeric strings, true and populated numeric/string arrays were wrongly admitted | 5 |
| shared `z.string().uuid()` → `z.string()` | Malformed strings were admitted for each record/reversal identity | 15 |

Each scratch directory holds its own copied contract, unchanged new test, minimal Vitest discovery config and link to the existing installed dependencies. Each run used Vitest 4.1.11 with `--maxWorkers=2`. Logs show assertion failures, with no failed import/suite. Product source was never mutated. Scratch copies and runner are retained; nothing was deleted.

The requested three-file unchanged-source command exited 0: `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/customer-receipt-input.fractions.test.ts src/customer-receipt-input.amount-types.test.ts src/customer-receipt-input.command-identity.test.ts` — **83/83 tests, 3/3 files passed**. Then the existing suite was included: **121/121 tests, 4/4 files passed**.

## Commands actually run

Initial `git rev-parse HEAD` and `git status --short` exited 0; the checkout started clean at the requested base. `git rev-parse origin/main` also returned that base. `df -g /System/Volumes/Data` exited 0: initially 53 GB available; 51 GB during build, above the 33 GB floor.

Used Node `v24.17.0`, installed Vitest `4.1.11`, and the existing cached pnpm `10.28.1`. The shell’s default pnpm points to a different launcher; its initial version probe was interrupted. No package installation or download command was run. The actual checks used a temporary PATH wrapper invoking `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. Existing prepared dependencies were reused; no fresh install is claimed.

All broad checks used `LANE_BASE_REF=origin/main`, `NEXT_TELEMETRY_DISABLED=1`, `TURBO_TELEMETRY_DISABLED=1`; task concurrency was 2. No test run exceeded two workers.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/customer-receipt-input.test.ts src/customer-receipt-input.fractions.test.ts src/customer-receipt-input.amount-types.test.ts src/customer-receipt-input.command-identity.test.ts` | 0 | 121 tests / 4 files passed, including the unchanged existing receipt suite. |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0 | 7/7 packages passed; 0 cached. |
| `pnpm exec turbo run lint --force --concurrency=2` | 0 | 7/7 packages passed; 0 cached. |
| `pnpm lint --force --concurrency=2` | 1 | Core purity passed; lane check stopped at self-comparison (HEAD equals origin/main). Later root lint stages did not run. |
| `pnpm lint:lanes` | 1 | Stopped at self-comparison before lane file/path verification. Commit-dependent lane evidence remains NOT RUN locally. |
| `pnpm build --force --concurrency=2` | 0 | 7/7 packages passed; 0 cached. Next compiled and generated static pages. |
| `pnpm openapi:check` | 1 | Blocked before generator execution: tsx IPC pipe listen EPERM. No alternate runner or bypass used. |
| `git diff --check` | 0 | Passed; also checked all new files separately after writing this receipt. |

Turbo emitted sandbox `IO error: Operation not permitted` warnings while the typecheck/lint/build tasks nevertheless completed successfully. Build also reported CSS autoprefixer and framework warnings; no product or configuration edits were made to address them. A supplemental whitespace-check harness initially treated `git diff --no-index --check /dev/null <new-file>` exit 1 as a failure; this status indicates the new-file difference. Rechecked every addition accepting that status only with empty diagnostics: all six passed. Root lint and lane checks are not passes: the checker intentionally refuses `HEAD == origin/main`. No older base, runner bypass, policy weakening or Git write was used. OpenAPI is not verified locally because `tsx` could not listen on its local IPC pipe; CI must run the normal script.

Full tests, PostgreSQL/database/migration suites, browser/e2e suites and commit-dependent lane checks: **NOT RUN locally**, per the work order and sandbox constraints; CI obligations remain. No AI prompt/model/schema changes were made, so no eval was run. No posting, provider integration or commercial send was exercised.

## Independent source review — not technical acceptance

Requested Sol-high review was performed by a separate `gpt-6-sol` agent at high reasoning effort (`/root/sol_high_review`), reading only the three additions, existing contract/tests and scratch evidence. Recorded response:

> Sol-high source review: PASS for RI1–RI3. No blocking findings in the three new tests. The inspected mutation logs show the intended failures for fractional padding, numeric coercion, and removed UUID validation. I did not run tests; this is source inspection, not exact-commit technical acceptance. Opus review remains outstanding.

Reviewed file SHA-256 values (also independently reproduced by the builder):

| Test file suffix | SHA-256 |
| --- | --- |
| `fractions.test.ts` | `2c43bd931d0c5ff5f36e4e70586bd81b381f7037d3087c33b9684ecd037fdd08` |
| `amount-types.test.ts` | `d39dbdc4c4eaf6f5ddddac449fd652d3561eb79fe86b7e0e01d703dd80e32c7b` |
| `command-identity.test.ts` | `cba070b0888edc81f89f6d6bcffb86bea6f8f89f9d3d0949a852df8ce860c8a1` |

Opus is unavailable through the exposed review capabilities; it was not substituted or claimed complete. This is a hash-bound source review of the tests, not a verdict on a new commit or the entire final documentation diff. **HOLD for the required RED Opus and Sol-high exact-commit verdicts after dispatcher commit, separate acceptance, CI checks and Ben’s button.** The builder does not accept its own work.

Logs, mutation source copies, command exit summaries and hashes: `/private/tmp/jg-test-tests-customer-receipt-input-1/` (`targeted-tests.log`, `receipt-regressions.log`, `mutation-*.log`, `mutations.json`, `checks.json`, check-specific logs, `test-sha256.json`). Intended commit message: `/private/tmp/jg-msg-tests-customer-receipt-input-1.txt`.
