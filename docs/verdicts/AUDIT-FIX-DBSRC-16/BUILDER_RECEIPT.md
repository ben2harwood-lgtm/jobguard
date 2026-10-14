# AUDIT-FIX-DBSRC-16 — builder receipt

Issued 13 October 2026 by dispatcher 4. Builder: Codex. Source report: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-16.md`. Synthetic data only. **RED / technical acceptance HOLD** pending dispatcher PostgreSQL/browser CI, an independent cross-model verdict on the committed diff, and separate acceptance. This is a builder run receipt, not an independent verdict.

Branch: `codex/sandbox/audit-fix-dbsrc-16`; issued base and unchanged HEAD: `c08a53784c05b54b18f7bfff87f4c7597032ca7e`. No Git write commands, migration, grant, provider call, real data or spending. The dispatcher commits and pushes. Path classification reused the actual `lane-floor.py` matcher and external jobguard lane map over working-tree paths (AMBER); raised to RED for money and source authorization under the issued rule. Commit-to-commit lane-floor remains a dispatcher check after committing.

Read AGENTS.md and BUILD_PLAN.md §§2, 5 (quantity/money and source contracts), 7 (existing synthetic supplier work), CH-2, and M2-2 through M2-5. Relevant guarantees: AGENTS §§5.1, 5.4, 5.5, 5.7–5.9, 5.13. No live release gate is relaxed.

## Blocking findings: reproduction first, then fix

`packages/db/test/audit-dbsrc-16.test.ts` was written and executed against unchanged production sources before any fix. Command: `packages/db/node_modules/.bin/vitest run --root packages/db test/audit-dbsrc-16.test.ts`. All **7 tests failed for the expected reasons**, representing all six BLOCKING findings (finding 2 has two cases). Raw initial output: `/private/tmp/jg-dbsrc16-red.log`. These are scripted SQL repository tests; they exercise the actual repository commands and transaction wrapper but do not prove PostgreSQL guarantees. No blocking finding was DROPPED.

| Finding | Expected initial failure actually observed | Fix and PostgreSQL regression |
| --- | --- | --- |
| 1: unrelated order | Inserted match order revision was C, while the receipt belonged to B. | Source selection uses the receipt's immutable `order_draft_id`, then the latest revision **within that order**. Multiple receipt orders refuse rather than guessing. New PostgreSQL test creates B at 2,000p and C revision 2 at 100p through repositories and asserts B's match and 9,000p discrepancy. |
| 2: fractional money | Both `0.29 × 100 → 29p` and `0.5 × 101 → 50p` rejected with `ARITHMETIC_MISMATCH`. | Parse decimal strings into bigint numerator/denominator; reuse core `divideRounded(..., "half_even")` and bounded `moneyFromBigInt`. PostgreSQL cases assert stored facts and reject a net one penny wrong. |
| 3: later receipt totals | Workspace reported accepted `1`, missing `9`, instead of accepted `9`, missing `1`. | Project exact PostgreSQL sums over immutable delivery rows for the latest receipt's tenant/job/order. Preserve original receipt and per-delivery quantities, so matching counts each delivery once. PostgreSQL test checks ordered 10, delivered 11, accepted 9, missing 1 and unchanged original row. |
| 4: rejected receipt | Creation attempted zero allocation and failed the simulated `supplier_match_allocation_quantity_decimal_check`. | Retain every receipt version in evidence declarations but allocate only positive accepted quantities. PostgreSQL test checks both receipt IDs and the sole eight-unit allocation. |
| 5: undeclared allocation | Correction using undeclared R2 resolved instead of refusing. | Require every allocation ID in the correction's declared receipt IDs, which must themselves belong to the proposal. PostgreSQL test checks refusal and unchanged revision/allocation/audit/result/identity counts. Additional unit test covers R2 in the proposal but omitted from this correction declaration. |
| 6: wrong correction response | Correcting P1 returned newer P2 with revision 1. | Bind final response/storage to the command's proposal and written revision; bind creation and existing-digest responses to their own proposals too. PostgreSQL test changes P1 allocation to seven units after P2 exists and checks P1 revision 2, persisted response and identical retry. |

No migration is needed for the tested receipt workspace correction: the existing row CHECK `missing_quantity = ordered_quantity - accepted_quantity` remains intact. A later row still stores its delivery delta (accepted 1, row-local missing 9); the workspace now derives the order's cumulative outstanding quantity (accepted 9, missing 1). This repair does **not** claim cumulative values were written into historical/delta rows. New PostgreSQL regression code is added but not executed successfully in this sandbox.

Final focused command: `pnpm --filter @jobguard/db exec vitest run test/audit-dbsrc-16.test.ts`: **9/9 PASS** (the original seven plus two adversarial source-declaration/order cases). Log: `/private/tmp/jg-dbsrc16-regression-final.log`.

## Scope and unchanged expectations

Only the two supplier repositories, two new regression files, this receipt and one compact lane row are changed. Existing lane rows are byte-preserved; JSON comparison after removing the new row equals HEAD. No existing test, expected value, refusal, count, pinned name or fingerprint is edited. Protected `apps/api/src/auth/context-boundary.test.ts` is byte-identical to HEAD; SHA-256 `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`. No catalogue rows or premise-establishing modifications to existing tests were required: before = unchanged; after = unchanged. No standard-F grant review is triggered: zero new or changed grants.

Before/after changes to new test setup only: previously no audit-specific fixtures; now independent synthetic tenant/job/order/document fixtures are created through existing helpers/repositories. The new PostgreSQL suite sets its connections to the existing `jobguard_runtime` role; it creates no new role and issues no grant. No network action or audit payload expansion. Commands keep their live-job guard, identity claim, tenant transaction, rollback and stored-result contract. API schemas and OpenAPI output are unchanged. Existing already-stored wrong replay responses are not rewritten; a historical data repair would be a separate task.

## Verification

Completed checks (exit 0 unless stated otherwise):

- `pnpm typecheck`: 7/7 tasks successful (4 cache hits); `/private/tmp/jg-dbsrc16-typecheck.log`.
- `LANE_BASE_REF=origin/main pnpm lint`: purity, exact lane boundary, money/commercial boundaries and 7/7 package lint tasks successful (4 cache hits); `/private/tmp/jg-dbsrc16-lint.log`.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: PASS; `/private/tmp/jg-dbsrc16-lanes.log`.
- Extra TypeScript check for both new regression files: `node_modules/.bin/tsc -p /private/tmp/jg-dbsrc16-tests-tsconfig.json`: PASS. This config extends the repository's strict settings; `/private/tmp/jg-dbsrc16-tests-typecheck.log`.
- `pnpm --filter @jobguard/ai test`: 80/80 PASS; `pnpm --filter @jobguard/config test`: 2/2 PASS; `pnpm --filter @jobguard/storage test`: 4/4 PASS. Logs `/private/tmp/jg-dbsrc16-{ai,config,storage}-final.log`.
- `node --test tools/policy-gate-sites.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs`: 19/19 PASS; `/private/tmp/jg-dbsrc16-tool-units.log`.
- `pnpm openapi:check`: exit 1, tsx CLI's IPC socket denied with EPERM. Equivalent check without the CLI listener, `node --import tsx src/generate-openapi.ts --check` from apps/api: PASS after package builds; `/private/tmp/jg-dbsrc16-openapi-fallback-final.log`.
- `git diff --check`: PASS; all changed/untracked paths fit the exact new lane.

- `pnpm build`: PASS, 7/7 tasks successful (4 cache hits). Next 15.5.27 compiled, typechecked and generated pages. Existing CSS/root warnings and sandbox cache IO warnings were nonfatal; `/private/tmp/jg-dbsrc16-build.log`.
- `pnpm eval`: PASS, 80 fixture tests; `/private/tmp/jg-dbsrc16-eval.log`. No model, prompt, parser or provider route changes and no live-model run.
- Post-build lane rerun including the receipt: PASS; `/private/tmp/jg-dbsrc16-lanes-final.log`.

Broader unit evidence (including final rechecks):

- First package runs before all dependency builds finished saw missing compiled exports and timeouts (all logs retained under `/private/tmp/jg-dbsrc16-*-final.log`): core 18 failed/4,872 passed, API 364 failed/1,189 passed/1 existing skip, web 322 failed/462 passed. They are failed runs, not evidence of acceptance; the subsequent results determine the current source-test status.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --exclude '**/*.integration.test.ts' --exclude 'test/free-port.test.ts'`: exit 1, 206 PASS / 1 FAIL. The unrelated existing audit-checkpoint C-OPS-1 source scan timed out at its unchanged 5-second deadline. `/private/tmp/jg-dbsrc16-db-final.log`.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1` after builds: exit 1, 4,888 PASS / 2 FAIL. Both failures are generated **dist** tests looking for nonexistent `dist/recovery-allocation.ts` or `dist/site-extra-pricing.ts` via `import.meta.url`; corresponding source tests passed. No test or test discovery configuration was edited. `/private/tmp/jg-dbsrc16-core-recheck.log`.
- `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1`: PASS, **2,445/2,445** source tests; `/private/tmp/jg-dbsrc16-core-source.log`.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` after API builds: PASS, **784/784**; `/private/tmp/jg-dbsrc16-web-recheck.log`.
- `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/health.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --exclude 'src/contractor/*.http.test.ts'` after builds: **1,553 PASS / 1 existing SKIP**, exit 1 due one database-backed beforeAll in `src/final-account-lock.isolation.test.ts` (`no free port in 58400..58650`). That file imports a PostgreSQL fixture under a unit-style name; no database was initialized/started. All 63 other source test files passed. `/private/tmp/jg-dbsrc16-api-recheck.log`. Other database/HTTP suites were deliberately excluded because localhost is unavailable, not made optional in repository scripts.
- Isolated recheck `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1`: PASS, **56/56**, with the original timeout unchanged; `/private/tmp/jg-dbsrc16-checkpoint-recheck.log`. All other selected DB unit tests passed in the prior run; the isolated recheck resolves its single timeout, without claiming that the prior exit was zero.
- Root `pnpm test` was not invoked because its tools wildcard includes Git-writing fixtures and its full DB suites bind/start PostgreSQL. All such mandatory suites remain dispatcher CI requirements, not optional checks. Commands use the cached pinned `pnpm 10.28.1` through `/private/tmp/jg-dbsrc16-bin/pnpm`; Node is `v24.17.0`. No package installation/download was intentionally run. Initial global pnpm launcher stalled; an installed pnpm 9 probe refused the pin/engine, so it was replaced with the cached required version before canonical checks. Existing dependencies were reused; a clean pinned install was not performed.

Initial lane check with `LANE_BASE_REF=origin/main` refused self-comparison when origin/main equalled HEAD. The mutable origin/main ref subsequently became `bd959b01e857de0ba7cbd3588bab84add7d0f493` outside this task; the canonical lane check then passed. This builder did not change Git refs. Separate exact allow-list inspection also passed.

Exploratory direct Vitest runs with `--root` had working-directory/stale compiled-export failures and performance timeouts. One overly broad `src` filter also matched the new `dbsrc` integration filename: its free-port probe failed before PostgreSQL initialization/start. The accidentally included free-port tests returned `listen EPERM`; the API isolation hook also failed its free-port probe. No browser or PostgreSQL was started. The final DB unit command explicitly excludes integration suites and free-port tests. Tool unit tests that issue Git writes in temporary repos were not run under the no-Git-write instruction. These attempts are not passing evidence.

## Dispatcher checks on Mac / GitHub CI

Run a clean pinned install in CI and `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm test`, `pnpm build`, `pnpm openapi:check`, `pnpm eval`. Run `pnpm test:db` and `pnpm test:migrations` against real PostgreSQL (including the new `test/audit-dbsrc-16.integration.test.ts`, existing supplier document/matching/replay/lock-order suites), and `pnpm test:e2e` (particularly M2-2-S through M2-5-S on both browser projects). The no-localhost sandbox cannot establish database or browser results. No migrations changed; normal existing migration/catalog/RLS checks remain required. Run the actual lane-floor command on the final commit and record a RED independent verdict and separate acceptance; builder self-acceptance is prohibited.

## LATER — receipt only; no fixes

- Report 7: excess quantity precision can round to zero in `numeric(20,6)` while retaining net/hash.
- Report 8: initial match creation accepts a stale expected revision, then correction uses row count.
- Report's test-strengthening suggestions: immutable supplier originals and cumulative totals; changing allocations/history sources; independent wrong-job/cross-tenant document references; independent matching source FKs/declarations; transaction rollback/release/reused tenant-context failure paths. Existing tests are untouched.

## Operational and compatibility notes

No new operational alert, external destination, commercial policy, grant, schema or migration. Existing delta rows and command schemas remain compatible. Workspace receipt figures become cumulative per order; ambiguous multiple-order receipts now fail closed. Fixed response identity applies to newly executed commands; stored historical results remain immutable. Full multi-order/invoice mapping is outside this synthetic repair and remains behind the live supplier/matching release gates. Technical acceptance stays HOLD until the dispatcher and independent checker supply the missing evidence.

## Working-tree artifact hashes (before dispatcher commit)

- `config/agent-lane-assignments.json`: SHA-256 `3944ab461b31367a107e5937dfa55247f41b888bd3ddff9fbeae41b11186aa2c`
- `packages/db/src/supplier-document-repository.ts`: SHA-256 `c07146783458f061db875e78b016bea85cd6803ff255cb90a41d424d82418850`
- `packages/db/src/supplier-match-repository.ts`: SHA-256 `e70692812964d379b175caf2207f129e8f1683aae4b574316fceaf677d2b74f9`
- `packages/db/test/audit-dbsrc-16.test.ts`: SHA-256 `b9e6e81b6b9808ed447e266d58a08351050243710657c1e474d994521f904e02`
- `packages/db/test/audit-dbsrc-16.integration.test.ts`: SHA-256 `a4e7ac75baa3d80978837779876b6f3c65c94dcd82321ce7aecc8c57655505ec`

## Round 2 (14 Oct): decision 4 test change, merge of origin/main 59e8e504, STOPPED before push

Commit f059c251, "Ben, 14 Oct, coordinator chat, decision 4". Only changed line, `apps/web/e2e/M2-2-S.spec.ts`:
before `await page.reload();await V(page,"delivery-accepted","1 each")` -> after `await page.reload();await V(page,"delivery-accepted","9 each")` (8 accepted + 1 later = 9 running total; derived from the fixed view query). Nothing else in that test changed.

Merge of origin/main (twice; lane-union.py for the registry). Hand-resolved: `supplier-document-repository.ts` (took main's exact-decimal + CH-4 guard code, re-applied this branch's cumulative-total query in `view`), `supplier-match-repository.ts` (took main's per-delivery sources and allocation check). Lane path for M2-2-S.spec.ts added (own commit).

Results after merge (core `dist` rebuilt, it was stale): lane lint, `lint`, `typecheck`, `lint:lanes` pass. `audit-dbsrc-16.test.ts` and `.integration.test.ts`: 8 failures (of the 16 runs). Not pushed, no PR. M2-2-S browser spec not run. Not independently verified, not accepted.
