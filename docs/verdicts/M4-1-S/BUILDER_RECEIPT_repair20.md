# M4-1-S-R — builder receipt, repair 20

7 October 2026. PR #103; branch `codex/sandbox/m4-1-s-repair`, lane `m4-1-s-repair`. Starting HEAD: `4514a2a81b03d047f67113842483d0d553d63400`. Addresses the Claude Opus delta review of that head (comment `6047526615`, P1-1) and CI run `37688438537`. Builder execution evidence only, not an independent verdict or technical acceptance.

## What was wrong

The repair 19 regression in `packages/db/test/recovery-cases.workbench.integration.test.ts` did `await import("@jobguard/db")` and loaded `apps/api/src/recovery-case.application.js` and `practice-errors.filter.js`. `@jobguard/db` resolves to `packages/db/dist`, which does not exist when the db package's own tests start in CI (`test` depends on `^build`, not the package's own build). The whole file therefore failed to load (41 tests), and CI stopped before `pnpm build` and the browser projects. The application import also needed db's `dist` at run time, so it raced the db build.

## Changes (product code untouched; tests and registry only)

1. **Workbench file:** the `@jobguard/db` self-import and both `apps/api` imports are gone. The PostgreSQL proof now uses `../src/index.js` only (plus the file's existing imports). It keeps the same fixture and a real control, then checks that: the plain repository refuses the session's own demo-tenant rate (`RECOVERY_SOURCE_NOT_RECOGNISED`); `new RecoveryCaseRepository(practiceMaterialPool(runtime, auth.digest))` opens the merchant case, `listForMember` and `eligibilityCommand` return `Supplier agreement Synthetic repair 19 agreement` with `recorded: true`, and the eligibility review stays `pending_review`; a repository on the stranger's digest is still refused; `authorizePracticeJob` for the stranger gives the identical `NOT_FOUND` for another session's job and for a job that does not exist; and the creator is authorised for their own job. Every other assertion in the other 40 tests is unchanged (the diff touches only the tail block added by repair 19).
2. **API unit tests** (`apps/api/src/recovery-case.application.test.ts`, three tests added, no existing test changed): a recording fake pool proves that list, command (and its reply read), a command with a deferred body reader, eligibility (and its reply read) and the eligibility session override each run every repository transaction with `set_config('app.practice_material_digest', <authorised digest>)` straight after `BEGIN`; that a refused target (another session's job or a nonexistent job) answers the identical 404 through the real `PracticeErrorsFilter`, never connects to the pool and never calls the deferred body reader; and that an authorised but unparseable body is a 400 `INVALID_COMMAND` before any transaction. Adapted from the reviewer's probe ideas, written fresh in this lane.
3. **Registry:** only the `m4-1-s-repair` lane's `receipt` value, now `docs/verdicts/M4-1-S/BUILDER_RECEIPT_repair20.md`. No new test path needed: both edited test files and the receipt directory are already allowed.

## Mutation check

With `RecoveryCaseApplication.repository()` temporarily changed to `new RecoveryCaseRepository(this.pool)` (the repair 18 bug), the new API test fails (`list: expected [ undefined ] to deeply equal [ Array(1) ]`). The file was restored byte for byte afterwards (`git status` showed only the intended files).

## Commands actually run

Node `24.17.0`, pnpm `10.28.1`. No install, download, delete or Git write other than the final commit. Logs in the session scratchpad.

| Command | Exit | Result |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 tasks. A first run failed once on my new test (`exactOptionalPropertyTypes` on a `values?` field); fixed the test type, no assertion changed. |
| `pnpm --filter @jobguard/db exec tsc -p <scratch tsconfig>` (workbench file, repo options) | 0 | Typechecks the edited integration file. `packages/db` typecheck does not include `test/`. |
| `pnpm --filter @jobguard/api exec vitest run src` | 0 | 20 files, 423 tests (420 before plus 3 new). |
| `pnpm --filter @jobguard/db exec vitest list test/recovery-cases.workbench.integration.test.ts` | 0 | 41 tests listed. |
| Import audit of the workbench file | n/a | Specifiers: `../src/index.js` (static and dynamic), `./pool-test-utils.js`, `@jobguard/core`, `embedded-postgres`, `pg`, `vitest`, `node:*`. No `@jobguard/db`, no `apps/api`. No file in `packages/db/src` or `packages/db/test` imports `@jobguard/db`. |
| Failure-mode control: old import line under a scratch package named `@jobguard/db` with no `dist` | 1 (expected) | Same error as CI: `Failed to resolve entry for package "@jobguard/db"`. Nothing in the repository was changed or removed for this. |
| `pnpm --filter @jobguard/db exec vitest run test/recovery-cases.workbench.integration.test.ts` (real embedded PostgreSQL) | 0 | **41 of 41 pass**, including the rewritten regression (also passed alone with `-t`). Embedded PostgreSQL did start on this Mac this time. |
| `pnpm --filter @jobguard/db exec vitest run` on `practice-session`, `recovery-cases`, `UIWIRE-12`, `demo-bootstrap` integration files | 0 | 4 files, 46 tests pass. |
| Lane lint with simulated pull-request event | see below | Run after the commit, on its SHA. |

## Scope

Migration `0097_recovery_case_current.sql` untouched (SHA-256 `84aef359c62455818e4eb66d26ca9d21c13c49ddd06af202fd107be3950d9375`). No `turbo.json`, Vitest config, alias, timeout, dependency, OpenAPI, schema or product-code change. No assertion weakened, skipped or deleted; no timeout added or lengthened. Synthetic data only.

## Remaining gates

Dispatcher push; green mandatory CI (including PostgreSQL, `pnpm build` and both browser projects `mobile-360` and `desktop`, which have not yet run on this PR); a fresh independent verdict bound to the resulting exact commit; separate technical acceptance; founder-owned merge in the existing migration order. P3-1 (renumbering notes after CH-3a and CH-2) and the other recorded follow-ups remain open. **Not independently verified or accepted.**
