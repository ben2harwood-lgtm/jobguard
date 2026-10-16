# SERIOUS-B5 builder receipt

Issued 16 October 2026 by dispatcher 13, FAST MODE rule 5. RED lane (money/access/data). Branch `codex/sandbox/serious-b5`; inspected HEAD and origin/main both `760fe6f52cb1364540c72092c3c882532d9b9d27`. Working-tree delivery only: no git write, commit, push, browser/e2e run, PostgreSQL startup, real data, paid provider, spending or release. This is builder evidence, not an independent verdict or technical acceptance; both remain required on the dispatcher's exact commit.

## Scope and disposition

Read AGENTS.md, BUILD_PLAN.md §§5.1–5.3, 5.5–5.6, 10.2.6 and SV-4, and **only Batch 5's three items** as issued scope. Read every cited S15–S17 source alias/evidence paragraph, including the explicitly superseded suggestion in mig-0012-0015#1; that suggestion was not implemented. Other batches are untouched. All three paths remain present in the issued base. No item was dropped or stopped for a product decision or pinned-expectation change.

| Item | Regression written before its fix | Expected baseline failure / observed evidence | Correction |
| --- | --- | --- | --- |
| S15 | `serious-b5.integration.test.ts`: **S15 pending repricing retains the last approved revision, including an omission, until replacement approval** | Source-inspected: the base query requires approved mutable state/current revision. After approved +5,000p is repriced to pending +7,000p, baseline account returns 10,000p rather than asserted 15,000p. **PostgreSQL test execution not performed**; this is the expected failure, not an observed red run. | Select the greatest approved commercial revision per variation, regardless of the current unapproved proposal. Confirm replacement approval replaces, rather than adds to, prior money; signed omissions remain effective during further repricing. Pending proposals stay separately visible. |
| S16 | `serious-b5.integration.test.ts`: **S16 rejects approvals added after assembly with no lock, receipt or audit effects, then accepts a rebuilt account** | Source-inspected: base routine validates only the unchanged draft pointer before hashing current captures and old lines. The baseline call succeeds where the test expects typed `FINAL_ACCOUNT_SOURCE_CHANGED`. **PostgreSQL test execution not performed.** | Under existing job/variation locks, compare effective approved sources and final-account variation lines in both directions, including multiplicity, source/revision/scope, approval, description and signed amount. Refuse before receipt/lock/audit insertion. A rebuilt account locks; exact replay remains stable; pending repricing does not invalidate still-approved lines. Added a concurrent approval/wait regression. |
| S17 | `serious-b5.integration.test.ts`, parameterized for **legacy** and **lock-bound** issue: **S17 … issue stores a readable PDF whose bytes, authorization, outbox and receipt share the digest** | Source-inspected: both base writers concatenate `%PDF-1.4`, plain text and EOF without objects/xref/trailer. The independent strict subset reader fails `PDF needs a cross-reference trailer`. **PostgreSQL test execution not performed.** | Both controlled issuers render the exact selected immutable snapshot into deterministic, escaped, paginated PDF 1.4 objects/streams/xref/trailer, then hash and persist the finished artifact. Tests verify multiple pages, escaped text, invoice number, baseline, watermarks, byte offsets, stream lengths and every persisted hash binding. |

The dispatcher explicitly prohibits PostgreSQL startup here. These database-backed regressions were written first, before source/migration changes, under that exception. No failing PostgreSQL run or live PDF-generation run is claimed. CI must execute their expected-red baseline check and fixed-head tests; local source inspection is not database reproduction evidence. New tests and their helpers pass a separate strict TypeScript check.

## Change and invariant boundaries

Only one existing implementation file changes, `packages/db/src/final-account-repository.ts`. Existing tests, expected values/refusals/counts, names, hashes/fingerprints and pinned lists remain byte-for-byte untouched, including `apps/api/src/auth/context-boundary.test.ts`. Lane registration is the new standalone version-2 `config/lanes/serious-b5.json`, with exact file paths and no self/register grant. No shared exports, auth boundary, prompt/model, dependency, API shape, UI, fee/tax rule or commercial authorization policy changes.

Migration `0166_final_account_sources_and_pdf.sql` is necessary because S16/S17 execute inside controlled SQL routines. At the issued base, main's highest migration is 0164. The migration replaces three existing routine bodies and introduces **no signature, owner, grant, policy, role, trigger, business-table or accounting change**. The renderer is deliberately local to the two issuer bodies so it adds no callable helper or pinned catalogue identity. No changes to `packages/db/src/migrate.ts` or `packages/db/MIGRATIONS.md`; directory discovery applies it. See `packages/db/migration-notes/0166_final_account_sources_and_pdf.md` for upgrade/forward-fix details. Recheck/renumber against current main before dispatch if necessary.

Job-first and existing variation lock order are retained. The approval writer already locks its variation before writing approval; lock-time comparison runs in a fresh statement after variation waits, before audit allocation. New captures already participate in job serialization. Tenant/job keys qualify both sides. The change makes no broader claim about a compromised privileged connection.

Both PDF writers retain current invoice/tax calculations and sandbox-only behavior. Each page repeats synthetic/no-charge/not-a-tax-invoice text. The body uses a fixed-width Courier font, wraps 90 characters and paginates 54 content rows. Non-ASCII display characters use the existing quote-renderer's `?` fallback; immutable source snapshots retain original text. No professional invoice/tax approval is inferred.

Existing malformed invoice bytes/hashes and existing lock snapshots remain immutable: this fixes new issues/locks, with no silent historical rewrite. A historical document requiring replacement must follow the existing explicit correction/reissue path. No ledger note is needed: no journal, fee, settlement, accounting rule or ledger data changes. No new operational alert or external action is introduced.

## Commands and results

Dependencies were supplied, not freshly installed. Node installed: **24.17.0**; repository pin: **24.15.0**. Used the existing cached pnpm 10.28.1 wrapper at `/private/tmp/jg-migfix-2-bin/pnpm`, with `npm_config_manage_package_manager_versions=false COREPACK_ENABLE_NETWORK=0`. Initial nested invocations still found the global pnpm launcher, stalled and failed its automatic version/signature fetch. No install/download command was issued. Subsequent commands put `/private/tmp/jg-migfix-2-bin` first in PATH so nested scripts use the cached version; no package or lockfile changed. This launcher failure is not evidence of a compromised dependency or red main CI.

The final successful runs use the cached wrapper first in PATH as described above. Logs are local ephemeral files under `/private/tmp/jg-serious-b5-*.log`, not committed proof artifacts.

| Command actually run | Result |
| --- | --- |
| `pnpm typecheck` (cached-wrapper PATH) | Exit 0, 7 tasks successful, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1 after core purity passes: official lane refuses self-comparison because HEAD equals origin/main. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` and `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` (also repeated after final paths) | Exit 1, same explicit self-comparison refusal. No alternate base, bypass or changed checker. |
| `pnpm exec turbo run lint` (cached-wrapper PATH) | Exit 0, all 7 package lint tasks successful, 2 cached. Does not replace refused official lane lint. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Both exit 0. |
| `pnpm build` (cached-wrapper PATH) | Exit 0, 7 tasks successful, 2 cached; full Next production build completed. Turbo cannot write its shared cache (EPERM warning); existing Next/Nest dependency tracing warnings did not fail the build. |
| `node --test tools/*.test.mjs` | Exit 0, 100 passed. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 1: core 92 files/2,531 tests passed, one existing allocator test exceeded its unchanged 5-second timeout during concurrent checks; recursive execution stopped before later packages. |
| `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts --maxWorkers=1` | Exit 0, all 34 tests passed on isolated rerun. No timeout/assertion/config changes. |
| `pnpm --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; config 1 test, storage 2 tests, AI 85 tests. Fixture evaluation only, no live provider/model. |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'test/**' --maxWorkers=1` | Exit 1 in both broad attempts: existing operator-reachability test exceeded its unchanged 5-second timeout. Final broad run: 9 files/109 tests passed, 1 timed out. |
| `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1` | Exit 0, all 56 tests passed on isolated rerun (3.83 seconds test time). No assertion/config changes. |
| `pnpm --filter @jobguard/db exec vitest run test/audit-api-file-final-account.test.ts --maxWorkers=1` | Exit 0, all 3 existing scripted-SQL repository regressions passed. These do not prove PostgreSQL semantics. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0, 36 files/812 unit tests passed. No browser/e2e runner. |
| API source unit subset, exact exclusions below | Exit 0, 77 files/1,625 tests passed. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --esModuleInterop test/serious-b5.integration.test.ts test/serious-b5-upgrade.integration.test.ts` | Exit 0, initially and after concurrency/pagination test additions. Type-check only; no DB test execution. |
| `pnpm openapi:check` (cached-wrapper PATH) | Exit 1: tsx CLI IPC listener rejected with EPERM. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0 after dependencies built. Initial concurrent attempt failed against stale DB dist missing JobSourceRepository; regenerated dependency build resolved it. No source/snapshot edit. |
| Supplemental static working-tree path check using `loadLanePolicy`, `selectLane`, `lanePathAllowed` and `migrationOrderViolations` | Exit 0: all 8 exact paths are authorized and new migration is above the issued base. This is a static scope check, **not** an official committed-head lane pass. |
| `git diff --check`, new-file trailing whitespace and final path checks | Exit 0. Only one existing source file changed; all other paths are the seven new authorized files. |

API command: `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1`, with explicit `--exclude` arguments for `src/auth/sso/action-paths.test.ts`, `src/contractor/contractor-practice-session.http.test.ts`, `src/contractor/site-extra-pricing.http.test.ts`, `src/contractor/site-extra.http.test.ts`, `src/contractor/site-visit.http.test.ts`, `src/health.test.ts`, `src/shadow-isolation.application.test.ts`, and `src/final-account-lock.isolation.test.ts`. These listener/PostgreSQL suites remain mandatory in CI; their sources/configuration were untouched.

The broad core/DB timeout failures and initial package-launcher failures remain recorded failures. Successful isolated reruns establish their named tests passed subsequently; this receipt does not call the complete root `pnpm test` run green. Full `pnpm test`, database/migration and browser suites were not run because they require the sandbox-prohibited services. No claim about current remote main CI status is made.

## Required dispatcher/CI follow-through

Run `pnpm --filter @jobguard/db exec vitest run test/serious-b5.integration.test.ts test/serious-b5-upgrade.integration.test.ts --maxWorkers=1`, followed by full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, the official committed-head lane checks and required browser suites. The upgrade regression installs every pre-0165 migration, seeds a pre-fix invoice, then compares existing rows and routine/relation ACLs, owners, security settings and RLS policies before/after/replay; this is written evidence awaiting execution, not a successful rehearsal. Browser/e2e was not run as instructed. No live model evaluation applies.

Merge/release/technical acceptance is **HOLD** pending real PostgreSQL regressions and migration checks, all mandatory CI, and an independent different-model verdict plus separate acceptance bound to the exact commit. G1/production charging and other existing release gates remain closed. The intended conventional commit message is written to `/private/tmp/jg-msg-serious-b5.txt`; the dispatcher owns committing and pushing.

## r1 — CI SQL ambiguity repair (16 October 2026)

Dispatcher 13's repair round for **SERIOUS-B5 / PR #229**, executed in the `fixlater-5` worktree on `codex/sandbox/serious-b5`, starting at `949e4e04714f905337f9e2e2ca5dae9d17d39eb7`. FIXLATER-5 is the dispatch/worktree identifier only. Read the supplied failure excerpt for GitHub run `38903152774`: DW8 and Test Q both reach `FinalAccountLockRepository.lock` and fail with PostgreSQL `column reference "r.tenant_id" is ambiguous`. This is supplied CI evidence, not a local PostgreSQL reproduction. Read repository AGENTS.md and the applicable BUILD_PLAN.md scope/revision, command, money, final-account-lock and SV-4 contracts before editing.

**Cause and repair.** In 0166's `lock_final_account`, the `effective` CTE's variation-revision alias `r` collided with the enclosing PL/pgSQL final-account record variable `r`. Rename only that query alias and its references to `approved_revision`. Keep the record, source comparison, tenant/job predicates, locks, signature and security settings intact. Read every statement of all three replaced routines for alias/variable and OUT-parameter/column collisions: this collision was found in the lock routine; no additional collision was found in `issue_practice_customer_invoice` or `issue_lock_bound_customer_invoice`. Both issuer bodies remain byte-for-byte unchanged in r1. No earlier migration is edited; this is the explicitly authorized repair to unmerged 0166.

**Regression.** Add two cases to this piece's `serious-b5.integration.test.ts`: baseline-only and approved-variation accounts execute the real repository lock path, read the saved lock, replay exactly, and assert one lock, one command receipt and one lock audit event. The approved-variation case rebuilds from the immutable approval before locking. These cases require real PostgreSQL in CI; they were strictly type-checked locally, not executed here. No pre-r1 test statement, expectation, pin, count, hash or fingerprint was changed. A read-only comparison against HEAD verifies that removing only the added block recovers the original test file exactly; normalizing only the renamed SQL alias/comment recovers the original migration exactly, with all three routine headers unchanged.

**Paperwork.** Correct the migration note's heading and current migration reference to 0166. Its 0164/base-commit statement is explicitly labelled historical. The earlier receipt is preserved as historical builder evidence; the upgrade fixture discovers all migrations before **0166** dynamically (its old test title says 0164), and current-head execution is still required in CI.

**Environment.** Dependencies were already installed; no install/download was attempted. Node is 24.17.0 (repository pin 24.15.0). Commands below use cached pnpm 10.28.1 via `PATH=/private/tmp/jg-migfix-2-bin:$PATH`, `npm_config_manage_package_manager_versions=false`, `COREPACK_ENABLE_NETWORK=0`. Logs are ephemeral `/private/tmp/jg-serious-b5-r1-*.log`. No Git write command, PostgreSQL startup or browser was run. Three tool-test files that create/commit temporary Git repositories (`agent-lane-boundary`, `agent-lane-boundary-train`, `merge-churn`) were not run under the no-Git-write instruction; the official lane check itself did run and pass.

| Command actually run | r1 result |
| --- | --- |
| `pnpm typecheck` | Exit 0; 7 tasks successful, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; root boundary/purity checks and 7 package lint tasks passed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0; SERIOUS-B5 lane passed. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Exit 0; SERIOUS-B5 lane passed against supplied origin/main `66205cfa419f7ebee00dabaa4babb325aeb92472` and HEAD `949e4e04714f905337f9e2e2ca5dae9d17d39eb7`. Recheck the dispatcher's resulting commit in CI. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --esModuleInterop test/serious-b5.integration.test.ts test/serious-b5-upgrade.integration.test.ts` | Exit 0; type-check only. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; core 2,601, config 1, storage 2, AI 85 tests passed. Fixture AI evaluation only. |
| `pnpm --filter @jobguard/db exec vitest run src test/audit-api-file-final-account.test.ts --exclude 'test/*.integration.test.ts' --maxWorkers=1` | Exit 0; 14 files / 132 tests passed. Scripted SQL checks do not prove PostgreSQL semantics. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | Exit 0; 19 tests passed. |
| API source unit subset (exact command below), before build | Exit 1; 73 files passed, 5 failed; 1,576 tests passed, 49 failed plus one suite failed to load. All reported failures identify `PracticeWorkerSwitchRepository is not a constructor` from stale generated DB exports. No assertion or source change made in response; built workspace outputs and reran the same subset. |
| `pnpm build` | Exit 0; 7 tasks successful, 2 cached, including Next production build. Shared-cache EPERM and dependency tracing warnings were non-fatal. |
| Same API source unit subset, after build | Exit 0; all 78 files / 1,642 tests passed. The initial failure remains recorded above. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 39 files / 844 tests passed. No browser. |
| `pnpm openapi:check` | Exit 1; sandbox rejects the tsx CLI IPC listener with `listen EPERM`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same OpenAPI check through the Node loader without the CLI IPC listener. No snapshot change. |
| `git diff --check`; read-only HEAD comparison of routine headers, issuer bodies, normalized lock alias and existing test content | Exit 0; only the four authorized repair paths differ. |

API subset command (run before and after build):

```sh
pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 \
  --exclude src/auth/sso/action-paths.test.ts \
  --exclude src/contractor/contractor-practice-session.http.test.ts \
  --exclude src/contractor/site-extra-pricing.http.test.ts \
  --exclude src/contractor/site-extra.http.test.ts \
  --exclude src/contractor/site-visit.http.test.ts \
  --exclude src/contractor/practice-worker-switch.http.test.ts \
  --exclude src/health.test.ts \
  --exclude src/shadow-isolation.application.test.ts \
  --exclude src/final-account-lock.isolation.test.ts
```

These exclusions retain socket/PostgreSQL suites for CI; no existing suite/configuration is edited. Full root `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and browser suites were not run under the dispatcher's sandbox instructions. Required CI follow-through includes both new r1 cases, the existing S15–S17 and upgrade tests, DW8 and Test Q, and full mandatory database/migration checks. No PostgreSQL success is claimed. Production release gates remain unchanged; the previous Opus PASS belongs to the pre-r1 diff and is not a verdict for this working-tree repair. Independent exact-commit verdict and separate technical acceptance remain required. The dispatcher owns commit/push; intended commit text is `/private/tmp/jg-msg-fixlater-5.txt`.
