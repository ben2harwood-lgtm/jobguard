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

Migration `0185_final_account_sources_and_pdf.sql` is necessary because S16/S17 execute inside controlled SQL routines. At the issued base, main's highest migration is 0164. The migration replaces three existing routine bodies and introduces **no signature, owner, grant, policy, role, trigger, business-table or accounting change**. The renderer is deliberately local to the two issuer bodies so it adds no callable helper or pinned catalogue identity. No changes to `packages/db/src/migrate.ts` or `packages/db/MIGRATIONS.md`; directory discovery applies it. See `packages/db/migration-notes/0185_final_account_sources_and_pdf.md` for upgrade/forward-fix details. Recheck/renumber against current main before dispatch if necessary.

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


## r2 — Test Q omits an approved source: case (b), stop (16 October 2026)

Dispatcher 13's last repair round for **SERIOUS-B5 / PR #229**, worktree `fixlater-5`, branch `codex/sandbox/serious-b5`, inspected HEAD `e57fb591d24d1be773d0034605165b9558dfb07c`. FIXLATER-5 is the worktree/task identifier only. Read AGENTS.md, the applicable BUILD_PLAN.md commercial-history and final-account-lock contracts (§§4 and 10.2.6 / SV-4), and the supplied failure excerpt `/Users/benharwood/.local/share/full-steam/jg-runs/serious-b5-ci-failed-e57fb59.txt` for GitHub CI run `38906307653`. The excerpt reports 1 failed / 1,811 passed API tests; this is supplied CI evidence, not a local reproduction.

**Disposition: (b).** Stop implementation repair: the merged test genuinely tries to lock a final account missing a subsequently approved extra. No guard, migration, test, expectation, pin, count, hash or fingerprint is changed in r2. Only this receipt changes. Weakening S16 to allow this setup would reintroduce the specific omission that SERIOUS-B5 must refuse.

**Precise source trace (source-inspected).**

- `apps/api/src/shadow-isolation.application.test.ts:289` calls `seedAccount(initial, DEMO_TENANT_ID, 100000)`. In `packages/db/test/final-account-lock.integration.test.ts:49–56`, this inserts revision **1**, source hash `"a".repeat(64)`, one **baseline** line of **100,000p**, and makes that revision current. There are zero variation lines in that revision.
- Test Q lines **333–338** propose, price and approve `extra.proposalId`: **Fictional captured tap**, quantity `1`, addition **12,000p**, scope `extra.scopeItemId`, immutable commercial revision `revision`, approval equal to the `approvalId` passed at line 338. `VariationApplication.command` writes the immutable approval and returns the variation view; it does not assemble a final account.
- The second extra at line **339** and final-review extra at line **352** are unpriced/unapproved. They do not enter the effective-approved-source set and are not the cause. Terms, dispositions and proof completion at lines 351–357 likewise do not assemble an account.
- Line **358** still sends `finalAccountRevisionId: a.revisionId, expectedRevision: 1`. No `app.finalAccount.build` or fixture rebuild occurs between approval and lock. Line **365** also retains that old revision and its seeded source hash for invoice issuance.
- In `packages/db/migrations/0185_final_account_sources_and_pdf.sql:32–47`, `effective` contains exactly the approved tap tuple `(revision, extra.scopeItemId, revision, approvalId, 12000, 'Fictional captured tap')` in column order `(source_id, scope_item_id, commercial_revision_id, approval_id, net_pence, description)`. `actual`, restricted to variation lines of `a.revisionId`, is empty. Therefore **`TABLE effective EXCEPT ALL TABLE actual` (`missing`, line 45)** yields that one row; the reverse `obsolete` branch is empty. This is a missing approved source, not an ordering, zero-value, omission, duplicate-revision or description-normalization mismatch.
- SQL raises `FINAL_ACCOUNT_SOURCE_CHANGED` at line **47**, before lock/receipt/audit writes. The supplied stack enters repository `typed()` (line 25), consistent with this SQL exception rather than the repository's later JavaScript snapshot-hash comparison. Test Q line **332** is only the `success()` wrapper; the offending lock invocation is line **358**.

**Exact minimal setup correction to hand back, not applied.** In Test Q's `replay()`, after proof completion at line **357** and before the lock at line **358**, create a fresh immutable **revision 2** of the existing fixture account, linked by `previous_revision_id` to `a.revisionId`. Copy its baseline line and existing proof; append exactly the approved tap line using the saved approval/revision fields above. Set the new snapshot's totals from those lines: **112,000p net, 22,400p tax, 134,400p total**, and a deterministic source hash derived from the rebuilt canonical source. Advance `a.draftId` to that new revision. Use the rebuilt ID and revision **2** in the lock at line **358**, and the same rebuilt ID and its source hash in the invoice input at line **365**. Keep the actual approval and both unpriced captures, every existing assertion, and the complete zero-versus-many comparison unchanged. Generate any new IDs through the replay's existing deterministic UUID machinery; both databases must receive the same public setup.

This is the same fixture-rebuild pattern already demonstrated by `rebuildFixture()` and the r1 approved-variation / S16 rejection-then-rebuild cases in `packages/db/test/serious-b5.integration.test.ts`, with Test Q's actual baseline and approved delta instead of that helper's fixed 10,000p + 5,000p example. Do not call that helper unchanged: its totals are specific to its own fixture. A bare call to the production assembler is also insufficient for Test Q's current fixture: `seedAccount` supplies a legacy `quote_version`, not the `quote_document_version` / `quote_line` baseline read by `FinalAccountCommandService.assemble`. The minimal correction stays within fixture preparation, preserving immutable revision 1 rather than editing its money or bypassing triggers. This proposal is source-inspected and requires the test owner's implementation and CI verification; no green Test Q result is claimed.

**Local validation environment.** Dependencies were supplied; no installation/download, Git write command, PostgreSQL startup or browser suite was run. Node 24.17.0, repository pin 24.15.0. Used the existing cached pnpm 10.28.1 wrapper with `PATH=/private/tmp/jg-migfix-2-bin:$PATH`, `npm_config_manage_package_manager_versions=false`, `COREPACK_ENABLE_NETWORK=0`; lint commands use `LANE_BASE_REF=origin/main`. Logs are ephemeral `/private/tmp/jg-serious-b5-r2-*.log` and command/result metadata is `/private/tmp/jg-serious-b5-r2-results.json`. Results follow; the standard OpenAPI CLI attempted an IPC listener and was refused by the sandbox, as recorded below.


| Command actually run | r2 result |
| --- | --- |
| `pnpm typecheck` | Exit 0; 7 tasks successful, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; all root boundary/purity and package lint checks passed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (initial run) | Exit 0; SERIOUS-B5 lane passed against supplied origin/main `66205cfa419f7ebee00dabaa4babb325aeb92472` and HEAD `e57fb591d24d1be773d0034605165b9558dfb07c`. Final recheck below failed against an externally advanced base. |
| `pnpm build` | Exit 0; 7 tasks successful, 2 cached, including Next production build. Shared-cache EPERM and dependency tracing warnings were non-fatal. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; core 2,601, config 1, storage 2 and AI 85 tests passed. Fixture AI evaluation only. |
| `pnpm --filter @jobguard/db exec vitest run src test/audit-api-file-final-account.test.ts --exclude 'test/*.integration.test.ts' --maxWorkers=1` | Exit 0; 14 files / 132 tests passed. Scripted SQL is not PostgreSQL verification. |
| API source unit subset: the exact command and nine exclusions printed in the r1 section above, unchanged | Exit 0; 78 files / 1,642 tests passed. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 39 files / 844 tests passed. No browser. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | Exit 0; 19 tests passed. |
| `pnpm openapi:check` | Exit 1; tsx CLI IPC listener refused with `listen EPERM`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same generator/check using the Node loader, without CLI IPC. No OpenAPI snapshot change. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (final recheck after receipt) | Exit 1; migration order: 0166 must be numbered above the base's highest migration, now 0166. No renumber or checker change made. |

Root `pnpm test` was not run because it includes PostgreSQL/listener suites and tool fixtures that write temporary Git repositories. Between the initial successful lane check and the final recheck, `origin/main` externally advanced to `0bbb5ddbd074b791ece740a1861a6b7cc2fd6577` (merge PR #213, migfix-5), which contains `0166_customer_billing_integrity.sql`. This worktree did not fetch or write Git refs. SERIOUS-B5's unmerged `0185_final_account_sources_and_pdf.sql` now collides with that base number. The initial root lint/lane passes are historical results against the earlier base; **current lane status is failed**. The dispatcher must coordinate the newly required renumber outside this case (b) implementation stop.

The three Git-writing tool suites (`agent-lane-boundary`, `agent-lane-boundary-train`, `merge-churn`) were excluded under the no-Git-write instruction; actual lane lint was run, with the initial pass and final migration-order failure distinguished above. Full PostgreSQL/migration/browser suites, including Test Q, remain mandatory in GitHub CI. No new regression test is added in case (b), because S16's existing rejection/rebuild regression already covers the exact omitted-approved-source condition, and the dispatcher explicitly prohibits editing this merged test in this disposition.

**Final scope and handoff.** Read-only `git diff --check` and HEAD-prefix comparison confirm the previous receipt is preserved and this r2 section is the sole tracked working-tree change; all implementation/migration/test bytes are unchanged from `e57fb591`. No Git write command was run. Intended conventional commit subject/body is written (overwritten) to `/private/tmp/jg-msg-fixlater-5.txt`. The dispatcher owns commit/push. **HOLD**: Test Q needs its owner's setup correction and a real CI run, and the newly advanced base requires migration renumber coordination; this receipt does not turn the supplied failing CI run into a pass. The reported prior Opus logic PASS is not a new exact-commit verdict or separate technical acceptance for r2. Existing independent-verdict, acceptance and production release gates remain in force.

## r3 (ruling 63)

Issued by dispatcher 14 on 16 October 2026 for SERIOUS-B5 / PR #229. Inspected branch `codex/sandbox/serious-b5`, HEAD `9d3084dbcc32584a6a49298c42b6b386157b4566`, supplied `origin/main` `d74fd66d684226a5150fe3d3576a853d58abcf31`; the working tree was clean. Read repository AGENTS.md, the applicable BUILD_PLAN.md final-account and SV-4 contracts, `docs/contracts/final-account-lock-v1.md`, and the previous receipt. Migration 0172 and renumber commit `926c80b9` are present. Dependencies were supplied; no install/download or Git write command was issued.

**STOP / HOLD at `apps/api/src/shadow-isolation.application.test.ts:339`.** The dispatcher explicitly requires a stop if a ruling assumption is false on current code. The r2 source trace and proposed baseline-copy rebuild assumed revision 1 contained only its 100,000p baseline after the tap approval. Current code has an intervening MIGFIX-5 fixture insert. Read-only `git blame` / `git show` identify commit `edee6ed34d50fbb2d41caf771e29808065ce1df7` (`test(shadow): Test Q account carries its approved variation before the lock (Ben decision 31)`), now included through main. No setup correction is applied in r3.

| Before: r2 snapshot `910af7c9` | After: current HEAD, left unchanged |
| --- | --- |
| After line 338's 12,000p tap approval, the next statement logs the unpriced extra. Revision 1 has only the baseline line. | Line 339 inserts a variation line directly into `a.revisionId` using the tap's source/scope/commercial-revision/approval identities, but literal description **`Fictional approved extra`**, **0p** and ordinal **2**. The unpriced extra is now line 340. |
| The old lock is at line 358 and invoice at line 365. | Those unchanged commands are now at lines 359 and 366: revision 1, source hash `"a".repeat(64)`. No revision 2 exists in this setup. |

The actual approved tuple still has description `Fictional captured tap` and net 12,000p. The source comparison in `0185_final_account_sources_and_pdf.sql:32–47` compares both description and signed amount: the inserted 0p tuple is not that approved tuple. A blind copy of revision 1 followed by appending the approved tap would retain the spurious line and duplicate its source identity. This is source inspection, not a reproduced PostgreSQL failure. The dispatcher needs to reconcile ruling 63 with the existing decision-31/MIGFIX-5 insert before a builder changes this setup. No assertion, expectation, test, pin, shared list, migration or implementation byte is changed; only this receipt section is appended. No independent checker verdict is claimed for an unapplied repair.

**Environment and validation.** Node 24.17.0 (repository pin 24.15.0); cached pnpm 10.28.1 via `PATH=/private/tmp/jg-migfix-2-bin:$PATH`, `npm_config_manage_package_manager_versions=false`, `COREPACK_ENABLE_NETWORK=0`. Logs are ephemeral `/private/tmp/jg-serious-b5-r3-*.log`. Test Q / its affected test file, PostgreSQL integration and migration suites, full root `pnpm test`, and browser/e2e suites are **NOT RUN**: the dispatcher's environment note prohibits PostgreSQL startup and localhost listeners. The file's global `beforeAll` at lines 102–104 requires both, including when selecting its pure tests. Three tool suites that write temporary Git repositories remain excluded under the no-Git-write instruction. Available headless checks and final scope verification are recorded below.

| Command actually run | r3 result |
| --- | --- |
| `pnpm typecheck` | Exit 0; 7 tasks successful, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; root checks and all 7 package tasks passed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0; SERIOUS-B5 lane against the base/HEAD above. Rechecked after the receipt append. |
| `pnpm build` | Exit 0; 7 tasks successful, 2 cached, including Next production build. Shared-cache EPERM and existing dependency/tracing warnings were non-fatal. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; core 2,674, config 1, storage 2, AI 85 tests passed. Fixture evaluation only. |
| `pnpm --filter @jobguard/db exec vitest run src test/audit-api-file-final-account.test.ts --exclude 'test/*.integration.test.ts' --maxWorkers=1` | Exit 1; 18 files passed, 1 failed; 145 tests passed and the existing C-OPS-1 operator-reachability test timed out at its unchanged 5-second limit. No PostgreSQL proof. |
| `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1` (after the other checks finished) | Exit 0; all 56 tests passed, 3.24 seconds overall. No source, assertion, timeout or configuration change. The initial broad-run failure remains recorded. |
| API source unit subset: exact r1 command and nine exclusions above, unchanged | Exit 0; 81 files / 1,656 tests passed. Listener/PostgreSQL exclusions remain mandatory in CI. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 40 files / 867 tests passed. No browser. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | Exit 0; all 19 tests passed. |
| `pnpm openapi:check` | Exit 1; sandbox refused tsx CLI IPC listener (`listen EPERM`). |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same generator/check via Node loader, without CLI IPC. No snapshot change. |
| Read-only `git diff --check` and Python byte-prefix/path comparison against HEAD | Exit 0; earlier receipt bytes preserved, only the r3 section appended, no other tracked working-tree change. |

**Handoff: HOLD.** This documents an explicit assumption-mismatch stop, not a completed Test Q repair or technical acceptance. Ruling 63's revision-2 setup and its two checker confirmations remain outstanding pending dispatcher reconciliation of line 339. Full mandatory PostgreSQL, migration and browser checks remain for GitHub CI; no production gate is lifted. No commit or push was performed. The intended conventional commit subject/body for this receipt-only handoff is written identically to both requested paths: `/private/tmp/jg-msg-serious-b5-r3.txt` and `/private/tmp/jg-msg-fixlater-5.txt`. Independent exact-commit verdict and separate acceptance remain required after dispatcher commit.


## r4 (ruling 73)

Issued by dispatcher 14 on 16 October 2026 for SERIOUS-B5 / PR #229, worktree `fixlater-5`, branch `codex/sandbox/serious-b5`. Inspected clean starting HEAD `128abc69981915314020bcd22ab7fa94f1ff1d71` and supplied `origin/main` `4c407a6c81bd714a6875b7adf995812381d0fe57`. Read AGENTS.md, applicable BUILD_PLAN.md commercial-history, command and final-account-lock contracts (§§5 and 10.2.6 / SV-4), `docs/contracts/final-account-lock-v1.md`, the prior receipt, and `docs/verdicts/SERIOUS-B5/TESTQ-PROPOSAL.md`. Read ruling 73 at `/Users/benharwood/.local/share/full-steam/handoffs/BEN-DECISIONS-2026-10-14.md:95`: it replaces ruling 63 and expressly adds the test and proposal paths to this piece's lane. The proposal's numbered source excerpts match starting HEAD; no assumption-mismatch stop was needed.

**Applied exactly the four proposal sites inside mutation Test Q.** Removed the old line-339 0p placeholder. Inserted the proposal's revision-2 block verbatim after old line 358: read only baseline lines from revision 1 and the actual immutable approved +12,000p `Fictional captured tap` revision/approval, assemble via the existing pure core function, hash its canonical source, insert the successor snapshot/lines/proof and advance the draft. The lock and invoice inputs now use that revision and its source hash. Expected fixture totals are 112,000p net / 22,400p candidate tax / 134,400p total; this is source-inspected, not a locally observed PostgreSQL invoice. Revision 1 and both unpriced captures are preserved. No shared fixture, schema, guard, production assembler or invoice path changed. No migration, operational alert, runtime compatibility or commercial-policy change arises from r4.

**Exact scope evidence.** The deterministic read-only check `/private/tmp/jg-serious-b5-r4-scope.py` reconstructs the expected file from HEAD and the proposal's three code blocks, checks equality, then reverses the four edits and recovers the original test bytes exactly. Every assertion, expectation, pin, timeout, normalizer, comparator and other test therefore remains byte-identical. The check also requires the proposal itself unchanged (SHA-256 `524cf3cef40d399995b864740dacf58404bccec4fccd616f1322bdfe32c8f2a9`), the historical receipt prefix unchanged, and no other tracked/untracked changes. `config/lanes/serious-b5.json` gains only `apps/api/src/shadow-isolation.application.test.ts` followed by `docs/verdicts/SERIOUS-B5/TESTQ-PROPOSAL.md`; all existing lane fields and pre-existing allow-list paths retain their contents and order. No shared lane list changes. This is a deterministic scope check, not either required independent checker confirmation.

**Environment.** Dependencies were already installed; no install/download or Git write command was issued. Node 24.17.0 (repository pin 24.15.0), cached pnpm 10.28.1 via `PATH=/private/tmp/jg-migfix-2-bin:$PATH`, `npm_config_manage_package_manager_versions=false`, `COREPACK_ENABLE_NETWORK=0`. Lint commands use `LANE_BASE_REF=origin/main`. Logs are ephemeral `/private/tmp/jg-serious-b5-r4-*.log`, not committed evidence artifacts.

| Command actually run | Result |
| --- | --- |
| `pnpm typecheck` | Exit 0; 7 tasks successful, 2 cached. Includes the edited API test file. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; root checks and 7 package tasks successful, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0; serious-b5 lane against the base/HEAD above; final receipt-inclusive recheck also passed. |
| `pnpm build` | Exit 0; 7 tasks successful, 2 cached; production Next build completed. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; core 2,696, config 1, storage 2, AI 113 tests passed. AI fixture evaluation only. |
| `pnpm --filter @jobguard/db exec vitest run src test/audit-api-file-final-account.test.ts --exclude 'test/*.integration.test.ts' --maxWorkers=1` | Exit 0; 21 files / 158 tests passed. No PostgreSQL execution. |
| API source unit subset, exact command below | Exit 0; 84 files / 1667 tests passed. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 40 files / 867 tests passed. No browser. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | Exit 0; 19 tests passed. |
| `pnpm openapi:check` | Exit 1; sandbox refused the tsx CLI IPC listener (`listen EPERM`). |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` (before build) | Exit 1; supplied stale DB build lacked the current `QuoteScopeRevisionError` export. No source repair made. |
| Same headless OpenAPI command after dependency/API builds | Exit 0; same generator/check without the CLI listener; committed OpenAPI unchanged. |
| `python3 /private/tmp/jg-serious-b5-r4-scope.py`; read-only `git diff --check` | Exit 0; exact four-site/scope/assertion/lane/append-only checks, including final receipt. |

Exact API subset command (the nine PostgreSQL/listener suites are excluded for this sandbox only; committed test configuration is unchanged):

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

**NOT RUN / CI hold.** Test Q and its affected file, SERIOUS-B5 PostgreSQL regressions, `pnpm test:db`, `pnpm test:migrations`, full root `pnpm test`, and browser/e2e suites were NOT RUN. The affected file's global `beforeAll` at lines 102–104 requires a localhost listener and PostgreSQL startup even when selecting one test; the dispatcher's sandbox note reserves those executions for GitHub CI. Full root tests also include three tool suites (`agent-lane-boundary`, `agent-lane-boundary-train`, `merge-churn`) that write temporary Git repositories; those were not run under the no-Git-write instruction. Unit subsets and green typechecks do not establish Test Q or database correctness. No mandatory CI suite is disabled or weakened.

**Handoff: HOLD for CI and independent review.** Ruling 73's two checker confirmations of the four-site-only diff, an independent verdict bound to the dispatcher's exact resulting commit and separate technical acceptance remain outstanding. All existing release gates remain closed. No commit or push was performed. Identical conventional-commit subject/body files are written at `/private/tmp/jg-msg-SERIOUS-B5-r4.txt` and `/private/tmp/jg-msg-fixlater-5.txt`; the dispatcher owns committing and pushing.


## r5 (ruling 86) — existing stale errors and MIGFIX-5 setup (17 October 2026)

Dispatcher 14's repair round for **SERIOUS-B5 / PR #229**, branch `codex/sandbox/serious-b5`, starting HEAD `73e64c70`. Read AGENTS.md, BUILD_PLAN.md scope/revision and command contracts, §10.2.6 and SV-4, migration 0185, the repository error mapping, both affected tests and this lane. GitHub run `38963077043` and its three reported MIGFIX-5 failures are dispatcher-supplied evidence, not a local database reproduction.

**Repair scope.** In this piece's unmerged `0185_final_account_sources_and_pdf.sql`, change only the source-mismatch exception literal from `FINAL_ACCOUNT_SOURCE_CHANGED` to the existing `STALE_OR_BLOCKED_FINAL_ACCOUNT`; retain SQLSTATE `40001` and the complete source guard. The existing repository mapping already returns `STALE_REVISION` for that SQL message and is untouched. Change only B5's three new error expectations: two repository expectations to `STALE_REVISION`, one direct SQL expectation to `STALE_OR_BLOCKED_FINAL_ACCOUNT`.

In merged `migfix-5.integration.test.ts`, change **only line 44's setup insert**: select the real immutable approval ID and approved-revision description, joined by tenant/job/revision. Preserve the existing parameters, amounts, revision identity and every assertion, including **3,440,000p net / 688,000p tax / 4,128,000p total**. The approval table's existing `(tenant_id, revision_id)` uniqueness makes the selected source unambiguous. Add only `packages/db/test/migfix-5.integration.test.ts` to this lane's allow list. No runtime source, historical migration, guard, API, schema, permission, commercial/tax policy, dependency, lockfile, grant, operational alert or historical receipt text changes.

**Deterministic scope evidence.** A read-only Python comparison to HEAD passed: the migration differs by exactly one exception literal; B5's test differs by exactly the three specified error expectations; MIGFIX-5 differs by exactly one removed/added setup line; its entire `describe` block and all assertion lines remain byte-identical. The original MIGFIX-5 file at HEAD also equals `origin/main` byte-for-byte. The lane differs by exactly the one added path. A supplemental check using `loadLanePolicy`, `selectLane` and `lanePathAllowed` confirms every changed path is permitted. These are deterministic checks, **not either required independent checker confirmation**.

**Environment.** Supplied dependencies, no install/download. Node 24.17.0 (repository pin 24.15.0), cached pnpm 10.28.1 via `PATH=/private/tmp/jg-migfix-2-bin:$PATH`, `npm_config_manage_package_manager_versions=false`, `COREPACK_ENABLE_NETWORK=0`. Logs are ephemeral `/private/tmp/jg-serious-b5-r5-*.log`. No Git write command, PostgreSQL startup, localhost server or browser was run.

| Command actually run | r5 result |
| --- | --- |
| `pnpm typecheck` | Exit 0; all 7 tasks successful, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1 after core purity passes: migration-order check requires this branch's 0185 above main's highest 0186. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1; same migration-order failure. No alternate base or bypass. |
| `pnpm exec turbo run lint` | Exit 0; all 7 package tasks successful, 2 cached. This does not replace official root lint. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Both exit 0. |
| `pnpm build` | Exit 0; all 7 tasks successful, 2 cached; production Next build completed. Existing shared-cache EPERM/dependency tracing warnings were non-fatal. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --esModuleInterop test/serious-b5.integration.test.ts test/serious-b5-upgrade.integration.test.ts test/migfix-5.integration.test.ts` | Exit 0; type-check only, no PostgreSQL execution. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; core 2,696, config 1, storage 2, AI 113 tests passed. AI fixture evaluation only. |
| `pnpm --filter @jobguard/db exec vitest run src test/audit-api-file-final-account.test.ts --exclude 'test/*.integration.test.ts' --maxWorkers=1` | Exit 0; 21 files / 158 tests passed. Scripted SQL tests do not prove PostgreSQL semantics. |
| API source unit subset (exact command below) | Exit 0; 84 files / 1,667 tests passed. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 40 files / 867 tests passed. No browser. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | Exit 0; 19 tests passed. |
| `pnpm openapi:check` | Exit 1; sandbox rejects tsx CLI IPC listener with `listen EPERM`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same OpenAPI validation through Node loader, no snapshot changes. |
| Read-only byte/scope comparison; `git diff --check` | Exit 0; only the five authorized paths differ, including this appended receipt. |

Exact API subset command (same nine sandbox-only exclusions as r4; committed test configuration unchanged):

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

**CI and dispatcher hold.** `origin/main` is `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4` and now contains `0185_evidence_pack_authority.sql` and `0186_recovery_eligibility_paid_interest.sql`; this supplied branch still has B5 at 0185. Official lint therefore fails pending dispatcher catch-up/renumbering. No renumbering is included in the ruling's “Nothing else” repair scope. No new migration or data backfill is introduced by r5; the existing migration note's forward-fix strategy remains applicable.

MIGFIX-5 and B5 PostgreSQL suites, full root `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and browser/e2e suites were NOT RUN under the dispatcher's service/browser prohibition. Full root tests also invoke three tool suites that write temporary Git repositories; those were excluded under the no-Git-write instruction. No mandatory CI suite was disabled or weakened. Run the affected real PostgreSQL tests and mandatory suites in GitHub CI after dispatch; local typechecks and unit subsets do not establish the migration's database behavior.

**Handoff: HOLD for CI and independent review.** Both required checker confirmations that only MIGFIX-5's setup line changed remain outstanding, as do the independent different-model exact-commit verdict and separate acceptance. All existing release gates remain closed. No commit or push performed. Identical conventional-commit subject/body files are written at `/private/tmp/jg-msg-serious-b5-r5.txt` and `/private/tmp/jg-msg-fixlater-5.txt`; the dispatcher owns committing and pushing.
