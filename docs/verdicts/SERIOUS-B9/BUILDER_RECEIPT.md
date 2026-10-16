# SERIOUS-B9 — builder receipt

Issued 16 October 2026, dispatcher 13, FAST MODE rule 5; RED lane. Baseline HEAD and supplied `origin/main`: `760fe6f52cb1364540c72092c3c882532d9b9d27`. Branch: `codex/sandbox/serious-b9`. Working-tree delivery only; dispatcher owns commit/push. No fetch, repository Git mutation, real data, spending, external send, browser run or PostgreSQL startup was performed. Installed dependencies were reused.

**Disposition: S28–S32 implemented, awaiting PostgreSQL/CI and independent review. S26 and S27 STOPPED. Nothing DROPPED. This is not technical acceptance or an independent verdict.**

Read AGENTS.md, Batch 9 in the external triage order, all its source aliases below, BUILD_PLAN.md SH-1 / §§10.3.2–10.3.3 / M4-8-S and the eligibility/allocation contracts. Other batches were not changed. Both stopped reproductions are preserved in [STOPPED_REPRODUCTIONS.md](STOPPED_REPRODUCTIONS.md).

## Findings and first failing evidence

The five initial reader regressions were written and run before the allocation fix: **5 failed** (`/private/tmp/jg-b9-red.log`). Refined behavioral tests were also run against a temporary unchanged baseline reader obtained by read-only `git show 760fe6f52cb1364540c72092c3c882532d9b9d27:packages/db/src/recovery-allocation-repository.ts`: **5 failed**, with the exact audit fraction for S31. See [reader-before.log](reader-before.log). Temporary baseline/test copies were removed. Final reader suite: **6 passed** (adds supplementary-rule provenance coverage). No existing test assertion, refusal, count, name, hash or fingerprint was edited.

| Item and source aliases | First reproduced failure | Disposition / correction |
| --- | --- | --- |
| S26 — dbsrc-12#1; mig-0112-0120#1 | Principal-only F18 persisted 262000p instead of 250000p. Mocked repository reproduction failed for that exact amount after rebuilding stale installed core output. [stopped-before.log](stopped-before.log). | **STOPPED**: correcting it requires an existing test expectation to change; details below. Eligibility implementation is untouched. |
| S27 — dbsrc-11#3 | Baseline reader refused signed 100000p +12500p −2500p composition with `ALLOCATION_SOURCE_REQUIRED`. [stopped-before.log](stopped-before.log). | **STOPPED**: the shared allocator and stored line-source contract require positive balances; the treatment of an unlinked omission needs the money ruling below. No signed allocation rule was invented. |
| S28 — dbsrc-11#4; mig-0133-0136#3 | 16001p/15999p lines threw `FRACTIONAL_CASE_SPLIT` before allocation. | Reader and guard use saved invoice-line net/gross facts. Historical unbound synthetic invoices reconstruct the already-issued group tax with the existing 0132 display allocation rule: absolute net weights, largest remainder, line-ID ties. No new VAT rate/rounding policy or group-tax calculation. No fractional case split refusal is relaxed. |
| S29 — mig-0133-0136#4 | Loading cumulative account lines outside the issued subset refused a valid receipt with `ALLOCATION_SOURCE_REQUIRED`. | Shared SQL read function loads `final_account_invoiced_line` for bound invoices; both reader and writer validate issued net and gross totals. A recorded supplementary binding produces `separate_invoice`; line count alone never chooses the rule. |
| S30 — mig-0133-0136#1 | Omitting recorded remittance returned `pro_rata` rather than the saved explicit source. | Resolve saved positive-allocation review sources server-side on every review/approval. Serialize by receipt before the snapshot; SQL independently refuses bypass. Conflicting/ambiguous or invalidated sources fail closed; no source is chosen to maximize a fee. |
| S31 — mig-0133-0136#2 | Later catch credit changed earlier receipt share to `17625000/133` net, expected `125000/1`. | Reader and guard compare original PostgreSQL timestamps, retaining only line settlements/reversal sources effective by that receipt. Reversals remain separately linked facts. Reversal commands use current remaining original balances. |
| S32 — mig-0133-0136#5 | Invalid original remittance caused reversal to throw `ALLOCATION_SOURCE_REQUIRED`. | With no fresh item-specific source, reverse the original saved line balances with the verified reversal/credit source. Do not reread/requalify original remittance. Fresh explicit reversal evidence still receives normal verification. |

## Coordinator rulings required

**S26 existing expected value:** `packages/db/test/recovery-eligibility-v3.integration.test.ts:99`, F18 row: **before `262000`; required after `250000`** when only `receipt-3000` has settled (the setup at line 100 settles no interest). The reason assertion at line 102 may also need the approved component-aware result. No edit was made. The current SQL guard independently encodes 262000 at `packages/db/migrations/0130_recovery_eligibility_v3_f17_timing.sql:60`; correcting that requires a later migration, never an edit to historical SQL. Coordinator must authorize the conflicting expectation change before an S26 implementation. Component-specific settlement evidence is still missing; no full S26 pass is claimed.

**S27 money rule:** BUILD_PLAN.md §10.3.2 spreads receipts over positive outstanding gross; it does not identify which work an unlinked negative omission reduces. `packages/core/src/receipt-allocation.ts:30` requires nonnegative line net and positive gross; `packages/db/migrations/0136_recovery_allocation.sql:18–19` imposes the same stored constraints. **Before:** standalone signed omission has no target linkage and cannot enter this positive-balance model. **After:** needs an approved choice of attribution/linkage or a specified signed-allocation contract. Spreading its reduction across all positive lines, charging it to baseline, or permitting negative settlement shares would change deemed catch money differently. These are money decisions, not interchangeable code details. The existing refusal remains; no core/schema relaxation was made. The reader/guard still fail closed for an unreconciled signed composition.

## Migration, compatibility and invariants

Added `0167_recovery_allocation_sources.sql`, following main's 0165 practice worker switch, with [migration notes](../../../packages/db/migration-notes/0167_recovery_allocation_sources.md). Directory discovery applies it; `packages/db/src/migrate.ts` and `packages/db/MIGRATIONS.md` were not edited. It adds an invoker/RLS-protected read function and replaces the existing controlled writer under the same owner/signature/grants. No business table, existing row, posted money, invoice, review, allocation, audit event or evidence is rewritten/backfilled. No ledger policy/note was needed.

Preserves AGENTS §§5.1 (tenant trust boundary), 5.3–5.6 (exact authority, idempotency and money), 5.7–5.8 (immutable provenance/evidence), 5.10 (synthetic/no production fee authority). Public command/artifact versions and the held fractional case-money rule are unchanged. Previously reviewed artifacts whose derived sources differ require a new review hash; replay returns persisted results. No external action, operational alert, credential or provider route was added. Proposed commercial policy, production release, restore and independent-verdict gates remain outstanding. Use the documented forward fix; never edit immutable financial history.

## Commands and actual results

Node **24.17.0** (repository pin 24.15.0), cached pnpm **10.28.1**. Successful final checks used `PATH=/private/tmp/jg-migfix-2-bin:$PATH npm_config_manage_package_manager_versions=false COREPACK_ENABLE_NETWORK=0` so child processes used the installed package manager without version switching. No install/download command was issued. This is a supplied-dependency check, not a clean pinned install.

| Command actually run | Result |
| --- | --- |
| `pnpm typecheck` | **Exit 0**, 7 tasks, 2 cached; final log `/private/tmp/jg-b9-typecheck-complete.log`. |
| `LANE_BASE_REF=origin/main pnpm lint` | **Exit 1**: core purity passed; lane guard refuses “Missing branch or self-comparison range; refusing a misleading pass.” HEAD equals origin/main before dispatcher commit. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **Exit 1**, same self-comparison refusal. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | **Exit 1**, same refusal. No alternate base/bypass was used. |
| `pnpm exec turbo run lint` | **Exit 0**, 7 package checks, 2 cached; `/private/tmp/jg-b9-package-lint-complete.log`. This is not a passing formal lane check. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | **Exit 0** for both. |
| `pnpm build` | **Exit 0**, 7 tasks, 2 cached; production Next build completed; `/private/tmp/jg-b9-build-complete.log`. Turbo cache-write permission warnings retained. |
| `node --test tools/*.test.mjs` | **Exit 0**, 100 passed. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | **Exit 0**: core 2532, config 1, storage 2, AI 85 passed. Fixture evaluation only; no AI behavior changed or live model called. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | **Exit 0**, 36 files / 812 passed. Unit/source tests, no browser. |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'test/**' --maxWorkers=1` | Final **exit 0**, 11 files / 116 passed, including 6 new reader regressions; `/private/tmp/jg-b9-db-source-complete.log`. No PostgreSQL guarantee. |
| API `vitest run src --maxWorkers=1` with eight listener/database source suites excluded | **Exit 0**, 77 files / 1625 passed; exact exclusions below. |
| `pnpm --filter @jobguard/db exec vitest list test/serious-b9.integration.test.ts --json` | **Exit 0**, seven cases collected; **hooks/tests not executed**. `/private/tmp/jg-b9-integration-collection.log`. |
| `pnpm openapi:check` | **Exit 1**, tsx CLI IPC socket cannot bind (`EPERM`). |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | **Exit 0**, same generator/snapshot check without tsx CLI listener. |
| `git diff --check` | **Exit 0**. |
| Read-only lane-policy/path and migration-order inspection | No outside paths; no migration-order violations. Exact allow list in `config/lanes/serious-b9.json`, which lists neither itself nor the register. This inspection does not substitute for the refused formal lane check. |

Earlier attempts are not hidden: initial typecheck/build child processes tried automatic pnpm version metadata resolution and failed on unreachable signature metadata; the installed-pnpm environment above succeeded. An initial direct OpenAPI check encountered stale core `dist` exports and succeeded after rebuilding. The first DB source run had **114 passed / 1 timeout** in unchanged `audit-checkpoint-handoff.test.ts` (5000ms limit under concurrent build/test load); unchanged reruns passed, including the final 116-test run. No timeout or expected result was edited. Initial stopped-test diagnostics used stale core build output and failed with `INVALID_COMMAND`; after rebuilding, the preserved stopped log shows the expected 262000-versus-250000 failure. Logs remain `/private/tmp/jg-b9-*.log`.

API exclusions: `src/auth/sso/action-paths.test.ts`, `src/contractor/contractor-practice-session.http.test.ts`, `src/contractor/site-extra-pricing.http.test.ts`, `src/contractor/site-extra.http.test.ts`, `src/contractor/site-visit.http.test.ts`, `src/health.test.ts`, `src/shadow-isolation.application.test.ts`, `src/final-account-lock.isolation.test.ts`. No configuration or existing test was disabled/edited; CI must execute all required suites.

## Dispatcher / CI holds

Do not accept this batch as seven completed fixes. Rule on S26/S27 first. Run `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, the existing allocation/line/upgrade/race suites and `packages/db/test/serious-b9.integration.test.ts` in PostgreSQL-capable CI. New cases cover legacy/bound penny tax, issued subset composition, remittance omission/direct forgery, later-credit cutoff, invalidated-remittance cancellation and helper RLS/ACLs. The S29 integration uses an isolated invoice-subset binding rather than replaying the entire Final Check/F7 issuance journey; supplementary rule provenance also has a reader unit test. Run the formal lint/lane check against the dispatcher commit; browser/e2e was explicitly not run here. Migration execution, upgrade/catalog guarantees, complete journeys and the different-model verdict bound to the eventual commit are **missing**, never inferred from source tests.

Intended conventional commit message written (overwritten) to `/private/tmp/jg-msg-serious-b9.txt`. Builder records no acceptance and performs no merge/push/release.

## Repair r1

16 October 2026; dispatcher 13; task **SERIOUS-B9**, PR #230. `FIXLATER-6` is only the worktree/dispatcher alias. Repair HEAD: `5a3f9472edb10acb81be21b93bf8ed0a36312542`; branch `codex/sandbox/serious-b9`. At this repair, supplied `origin/main` is `66205cfa419f7ebee00dabaa4babb325aeb92472`, and its merge-base with HEAD is `5746f7b15c88db3fe279a0d4adce4dfb37491731`. These distinguish the current review range from the original dispatch baseline recorded above.

Read the independent Opus REPAIR verdict at `/Users/benharwood/.local/share/full-steam/jg-runs/d13-serious-b9-opus-5a3f947.md` and reference commit `c2bfa554`. This repair addresses B1 only, with the requested migration-number paperwork corrections. It is builder evidence, not an independent verdict or technical acceptance. S26 and S27 remain untouched and stopped; S26 belongs to its separate order and S27 waits for Ben.

### Additive inventory repair

`docs/contracts/lp-0-effective-privileges-v1.json` gains exactly three rows, with zero existing rows removed or changed:

```text
acl|routine|function:app.recovery_allocation_invoice_lines(uuid,uuid,uuid)|jobguard_runtime|EXECUTE|- -> a-exec-recovery-money
owner|routine|function:app.recovery_allocation_invoice_lines(uuid,uuid,uuid)|jobguard_migration -> a-owner-routines
recorded.routines: function:app.recovery_allocation_invoice_lines(uuid,uuid,uuid)
```

The new routine record has owner `jobguard_migration`, SECURITY INVOKER (`securityDefiner=false`), `search_path=pg_catalog, app`, reachable/runtimeExecute true, PUBLIC EXECUTE false, no other-role EXECUTE, no extension or trigger return, and empty staticWrites/staticCalls. Its new definition SHA-256 is `b549729fa079d3486d1b23ceaad8aea73edb3d59989d5d11dcbcf60962884c00`.

The digest uses the source-derived `pg_get_functiondef` formatting method used by `c2bfa554`: canonical PostgreSQL header, expanded `timestamp with time zone` return type, STABLE attribute, quoted search-path entries, exact migration body, `$function$` delimiter and terminal newline; SHA-256 over UTF-8. Source-level controls reproduce the unchanged recorded hashes of `contractor_session(uuid)`, `contractor_practice_session_guard()` and the STABLE table-returning `practice_company_made_up(uuid)`. This is source inspection, not a migrated-database result. The unchanged LP-0 static scanner matches both empty lists. Actual PostgreSQL catalogue/ACL verification remains for CI; the held LP0-13 mechanism is unchanged.

Added only the inventory path to the lane allow list. Corrected the lane note, migration-note heading/context and receipt migration context to identify file 0166 following the 0165 practice worker switch. The existing migration SQL, application source, tests, expectations, counts, pins, hashes, fingerprints, inventory groups/paths/base metadata and held checks are unchanged. No new migration, data/backfill, external action, alert, credential, provider route or compatibility change is introduced by r1. Earlier invariants and commercial/real-data release gates remain in force.

### r1 commands and observed evidence

Installed dependencies reused; no install or download. Node `v24.17.0` (repository pin `24.15.0`), cached pnpm `10.28.1`. pnpm invocations used `PATH=/private/tmp/jg-migfix-2-bin:$PATH npm_config_manage_package_manager_versions=false COREPACK_ENABLE_NETWORK=0`. These are supplied-dependency checks, not a clean pinned install. Logs and temporary validation scripts are under `/private/tmp/jg-b9-r1-*`.

| Command actually run | Result |
| --- | --- |
| `pnpm typecheck --force` | Exit 0; all 7 tasks executed. `typecheck.log`. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | Exit 0; root guards and all 7 package checks. `lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0. `lint-lanes.log`. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Passed; serious-b9 lane, merge-base comparison, including working-tree paths. `lane-direct.log`. |
| `pnpm build --concurrency=2 --force` | Exit 0; all 7 tasks executed, including Next production build. `build.log`. |
| `node --test tools/*.test.mjs` | Exit 0; 100 passed. `tools-unit.log`. |
| `pnpm --filter @jobguard/db exec vitest run test/lp-0-catalog.test.ts --maxWorkers=1` | Exit 0; 26 passed. Pure catalogue/comparator unit tests, no PostgreSQL. `catalog-unit.log`. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | Exit 0; core 2601, config 1, storage 2, AI 85 passed. Fixtures only; no live model evaluation. `domain-unit.log`. |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'test/**' --maxWorkers=1` | Exit 0; 11 files / 116 passed, including all 6 SERIOUS-B9 reader regressions. `db-source-unit.log`. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0; 39 files / 844 passed. Unit/source checks, no browser. `web-unit.log`. |
| API `vitest run src --maxWorkers=1` with the original eight listener/database source suites excluded | Exit 1; 78 files / 1642 tests passed, while 21 tests in `src/contractor/practice-worker-switch.http.test.ts` failed with sandbox `listen EPERM` and secondary null-port errors. `api-unit.log`. |
| Same API command with `--exclude src/contractor/practice-worker-switch.http.test.ts` added | Exit 0; 78 files / 1642 passed. `api-unit-available.log`. The nine excluded paths are the eight listed in the original receipt plus this HTTP suite; all remain mandatory in CI. |
| `pnpm openapi:check` | Exit 1; TSX CLI IPC listener refused with `listen EPERM`. `openapi.log`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same generator/snapshot check without the TSX CLI listener; artifact unchanged. `openapi-node.log`. |
| `pnpm --filter @jobguard/api exec node --import tsx /private/tmp/jg-b9-r1-inventory-check.mts` | Final exit 0; strict inventory parsing, authority-path completeness, exact two added capability keys, new routine metadata and actual unchanged static scanner. `inventory-check.log`. |
| `python3 /private/tmp/jg-b9-r1-inventory.py` | Exit 0; three unchanged hash controls matched, new digest derived, exactly three new inventory lines generated. |
| `python3 /private/tmp/jg-b9-r1-preservation.py` | Exit 0; exactly +3/-0 inventory lines, all prior parsed rows/hash/pin/metadata unchanged, one allowed path added, exactly four authorized files edited; all source/tests/migration SQL/S26/S27 untouched. `preservation.log`. |
| `git diff --check` | Exit 0. |

Final available unit/source checks total **5417 passed**, counting each successful suite once. The initial static inventory import encountered stale installed core output (`PracticeWorkerSwitchError` export missing); after the forced build, the same check passed. No source or dependency was changed to resolve it. Turbo emitted sandbox cache IO warnings; successful task results above remain actual executions. Build warnings are retained in the log. Neither the standard OpenAPI failure nor the HTTP listener restriction is an automatic approval-review rejection. No existing test/configuration was edited or disabled to obtain a pass.

CI must run the complete API suite, `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, both `lp-0-grant-freeze.integration.test.ts` and `lp-0-authority-paths.integration.test.ts`, and the SERIOUS-B9 allocation/upgrade/race/integration checks against real PostgreSQL. Browser/e2e remains for CI as instructed. No local PostgreSQL startup or browser run was attempted. This receipt does not claim migrated grants, upgrade correctness, complete journeys or production readiness. Dispatcher owns commit/push; a different-model verdict bound to the eventual commit and separate acceptance remain outstanding. No Git write command was run against this repository.

The intended conventional commit message is overwritten at `/private/tmp/jg-msg-fixlater-6.txt` for dispatcher use; the original message-file reference above describes the original delivery only.
