# M4-1-S-R — builder receipt, repair 19

7 October 2026. PR #103; branch `codex/sandbox/m4-1-s-repair`, lane `m4-1-s-repair`. Starting HEAD: `d0860d1a7ad48d3b2e6f7f6e56a4d4862e91d65f`. Addresses Claude Opus delta review comment `6046627960` and CI run `37683305315`. Working-tree changes only; the dispatcher commits. This is builder execution evidence, not an independent verdict or technical acceptance.

## Changes and coverage

**P1-1:** `RecoveryCaseApplication` constructs each recovery repository with `practiceMaterialPool(this.pool, practice.digest)` after `PracticeAccess` authorizes the requested job. Command execution, eligibility execution, repository post-commit reads, application reply reads and ordinary list reads all use the authorized digest. Eligibility's explicit session override supplies that operation's principal and digest. Membership verification, current-state replay, affected-case identity and unknown post-commit outcomes remain intact.

Added a regression to the existing lane-owned `packages/db/test/recovery-cases.workbench.integration.test.ts`, using its real PostgreSQL fixture and non-owner runtime role. It seeds only fictional demo-tenant identities, issues two actual practice sessions, creates a session-owned supplier rate and a linked material requirement, and proves that the plain repository refuses that rate. The application then opens a merchant case and resolves the supplier agreement in the command reply, list and eligibility-review reply. The eligibility call explicitly overrides a stranger application's session with the creator's session. A repository using the stranger's material digest still refuses the rate. Actual stranger job ownership and a globally nonexistent job are independently established; both target refusals map to the identical `NOT_FOUND`/404 before repository methods or a deferred body reader run. The eligibility fixture remains `pending_review`; it grants no approval or fee entitlement. This regression was collected and typechecked locally; PostgreSQL execution remains for CI. Main's `practice-session.integration.test.ts` is byte-identical to `origin/main`.

**P3-1:** removed the appended ` (MEMBERSHIP_FORBIDDEN)` diagnostic. The mode error message is exactly SBOX's `SYNTHETIC_MODE_REQUIRED`. Changed the single authorized existing assertion to check that exact message and code; added checks through the real practice filter for the same 403 status and code. Other existing assertions remain.

**P3-2:** the Nest and Next transport regressions now use generated session-token SHA-256 digests and distinct persisted-job lookup fixtures: a stranger owns a different job, while the nonexistent UUID has no row. The real `PracticeAccess` positively authorizes the stranger's own job as a control. Existing missing-session 401, identical target 404/code, no-store and no-repository assertions remain. Nest checks that neither command schema parser runs. Next checks that `Request.json` never runs for denied targets. To enforce this last condition, Next passes a deferred JSON reader into the authorized application boundary; authorized malformed JSON still maps to the existing `INVALID_COMMAND`/400 refusal. Existing success, malformed-JSON and uncertain-outcome route tests pass.

**Registry:** only this lane's `receipt` value changes to `docs/verdicts/M4-1-S/BUILDER_RECEIPT_repair19.md`; exact compact JSON formatting and every other registry byte are preserved. Test doubles now provide valid authenticated digests and explicitly select synthetic mode, without weakening their assertions.

Ben's documented design and repairs 1–18 remain. No durable refusal redesign, commercial policy, financial posting, approval authority or browser workbench behavior changes.

## Commands actually run

Used provided dependencies, Node `24.17.0`, pinned pnpm `10.28.1` via `PATH=/private/tmp/jg-repair18-bin:$PATH`. No package installation or download. Logs: `/private/tmp/jg-repair19-*.log`.

| Command | Exit | Result |
|---|---:|---|
| `pnpm typecheck` | 0 | All 7 package tasks pass; 4 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Boundary checks and all 7 package tasks pass; 4 cached. No self-comparison refusal. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Correct lane and allowed paths, including the repair 19 receipt; repeated after writing the final receipt. |
| `pnpm build` | 0 | All 7 package tasks pass; 4 cached. Next compilation, type checks, static pages and build traces completed. |
| `pnpm openapi:check` | 1 | The `tsx` CLI IPC listener is blocked by sandbox `EPERM`; the generator did not run through this launcher. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same generator without the listener; committed OpenAPI matches. |
| `pnpm --filter @jobguard/api test --maxWorkers=1` | 1 | 419 passed, 1 unchanged health test failed on socket-binding `listen EPERM`, with one associated unhandled error. This script appends the argument to its chained OpenAPI command, so the API run used default workers. The chained command did not run after the health failure. |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-case.application.test.ts src/recovery-case.command.application.test.ts src/recovery-case.controller.test.ts --maxWorkers=1` | 0 final | All 86 recovery API tests pass. Initial run: 78 passed, 8 failed because command-test doubles did not select synthetic mode; fixed test setup, retaining every assertion, then reran. |
| `pnpm --filter @jobguard/web test --maxWorkers=1` | 0 | All 335 tests across 17 files pass. |
| `pnpm --filter @jobguard/db exec vitest run test/recovery-case-outcome.test.ts test/verify-evidence-pack-cli.test.ts --maxWorkers=1` | 0 | All 8 unit tests pass; these do not prove PostgreSQL behavior. |
| `pnpm --filter @jobguard/db exec vitest list test/recovery-cases.workbench.integration.test.ts` | 0 | Includes the new demo-session RLS regression; collection only, not execution. Repeated after the final regression edit. |
| `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-repair19-regression-tsconfig.json` | 0 | Typechecks the integration file and imported application code under the repository's strict options, with Nest decorators enabled and no output. Temporary config is outside the repository. |
| `node --test tools/*.test.mjs` | 0 | 42/42 pass. |
| `git diff --check`; byte comparisons and SHA-256; parsed/exact registry comparisons | 0 | No whitespace errors; preserved migration and main test; exact receipt-only registry substitution. |

Turbo reported cache-write `Operation not permitted` warnings, but completed the checks above. Next emitted its existing multiple-lockfile workspace-root warning. Neither was a failed check.

## Scope and remaining gates

Migration `0097_recovery_case_current.sql` is byte-identical to HEAD and `96f0587`, SHA-256 `84aef359c62455818e4eb66d26ca9d21c13c49ddd06af202fd107be3950d9375`. No migration, backfill, rollback strategy, schema or migration-order change in this repair. No OpenAPI artifact change, provider destination, dependency, operational alert or expanded lane grant. Shared registration ownership is limited to this lane's receipt field.

Affected invariants: verified practice-session/job ownership, transaction-local material RLS context, membership-checked reads, authorization before parsing, stable refusal status/code, source resolution and honest unknown write outcomes. Wire schemas and existing command payloads remain unchanged; the deferred reader is an internal server adapter. No assertion was weakened, skipped or deleted beyond the expressly authorized message expectation change; no timeout was added or extended.

Full root `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and browser suites were not run: this sandbox cannot start PostgreSQL or bind localhost. Required PostgreSQL/migration and browser execution remains in GitHub CI after the dispatcher pushes, including the unchanged SBOX practice-session test and the new regression. No clean reinstall was attempted because dependencies were supplied. No live provider, spending, real data/send, production execution, decision approval, deployment, Git write command, push, merge or PR creation occurred.

Intended conventional commit subject and body are written to `/private/tmp/jg-msg-m4-1-s-repair.txt`:

`fix(recovery): scope practice recovery sources to the authorized session`

Remaining gates: dispatcher commit/push; green mandatory CI, including locally blocked checks; a fresh independent verdict bound to the resulting exact commit; separate technical acceptance; founder-owned merge/release in the existing migration order. Prior deferred follow-ups remain deferred, not waived. **Not independently verified or accepted.**
