# SERIOUS-B6 builder receipt

Builder: Codex, 16 October 2026. Branch `codex/sandbox/serious-b6`.
Issued base and unchanged HEAD: `66205cfa419f7ebee00dabaa4babb325aeb92472`. Initially `origin/main` matched it; the shared tracking ref later advanced externally to `0bbb5ddbd074b791ece740a1861a6b7cc2fd6577`. This task did not fetch, merge or write Git refs.
Issued by dispatcher 13 under FAST MODE rule 5; RED lane (money / access / data).
**Status: S19/S20 implemented; S18 STOPPED for coordinator ruling.** Working tree only; dispatcher commit, CI, different-model verdict and separate acceptance remain pending. This is a builder receipt, not acceptance or an independent verdict.

## Scope and authority

Read repository `AGENTS.md`, the relevant `BUILD_PLAN.md` supplier intake/matching/discrepancy contracts (M2-2/M2-4/M2-5, §11.3), synthetic task mapping (§7), and CH-2 live-job boundary (§8).
Scope is exactly Batch 6 of `/Users/benharwood/.local/share/full-steam/jg-orders/NIGHT-AUDIT-TRIAGE-SERIOUS-2026-10-16.md`:

| Item | Source aliases read | Disposition |
| --- | --- | --- |
| S18 | `dbsrc-16#3` | Reproduced; **STOPPED**: cumulative fix contradicts an existing browser expected value (details below). No S18 implementation remains. |
| S19 | `dbsrc-16#4`, `mig-0032-0035#5` | Reproduced before fixes; automatic allocation excludes zero accepted quantities while retaining receipt citations. |
| S20 | `api-file-things-to-check#3`, `dbsrc-04#5` | Reproduced before fixes; repeated evaluation audits the existing durable finding and stores the new command's first result. |

No item dropped. S19/S20 require no money-rule, access-policy, real-data or spending decision. Other batches and other findings in the source reports were not repaired.

## S18 STOP: exact assertion requiring coordinator ruling

The user instruction says: **“no change to any EXISTING expected value, refusal, count, pinned name, hash or fingerprint ... if the fix needs one, STOP on that item and report file, line, before, after.”**

- File: `apps/web/e2e/M2-2-S.spec.ts`, **line 2**.
- Existing assertion after **Record later delivery** and reload: `await V(page,"delivery-accepted","1 each")`.
- Required assertion for the cumulative acceptance display: `await V(page,"delivery-accepted","9 each")` (original eight plus later one).
- The existing assertion is **unchanged**. Browser/e2e was source-inspected only and was not run.

The reproduction first failed on the unchanged implementation: a one-unit later delivery reused the original eight-unit delivery's document ID, so matching treats it as replacement rather than addition. A draft fix added explicit later-delivery intent, separate immutable delivery identities and a cumulative workspace projection, retaining omitted-kind corrections. Subsequent inspection found the existing browser assertion above. At that point S18 was stopped and **all** its production/schema/UI changes were restored from unchanged HEAD using read-only `git show`; its newly written UI and integration additions were removed. No alternative display was introduced to work around the assertion.

The original red run is [regression-red.log](regression-red.log). The independently runnable S18 repository reproduction is preserved as [S18-reproduction.test.ts.txt](S18-reproduction.test.ts.txt), outside test discovery because this item is explicitly stopped. Copying it to `packages/db/src/serious-b6-s18.test.ts` and running `pnpm --filter @jobguard/db exec vitest run src/serious-b6-s18.test.ts --maxWorkers=1` reproduces the recorded failure. It does not represent a skipped existing test. The coordinator must rule on the existing browser expectation before this item's fix resumes.

## Before/fix/after evidence

The first implementation-related change was the new `packages/db/src/serious-b6.test.ts`. Before changing production code, this command exited **1**:

```sh
pnpm --filter @jobguard/db exec vitest run src/serious-b6.test.ts --maxWorkers=1
```

All four tests failed for the intended reasons. Raw run: [regression-red.log](regression-red.log).

- **S18:** the existing UI-shaped payload (`accepted: "1", rejected: "0", expectedRevision: 1`) reused the original delivery identity. Its distinct-identity assertion failed. It is held separately as described above.
- **S19:** mixed and entirely zero-accepted source sets attempted a zero allocation. The SQL double rejected the actual repository insertion with `supplier_match_allocation_quantity_decimal_check`, mirroring migration 0037's positive-quantity constraint. This is a repository reproduction, not an executed PostgreSQL constraint test.
- **S20:** two evaluations of unchanged sources with different command IDs produced an audited finding ID absent from the persisted identities. The zero-orphans assertion failed.

Final focused check (S19/S20 plus existing tests): **PASS**, 3 files / 28 tests, exit 0. Raw final run: [regression-green.log](regression-green.log).

```sh
pnpm --filter @jobguard/db exec vitest run src/serious-b6.test.ts src/supplier-match-repository.test.ts test/audit-api-file-supplier-document.test.ts --maxWorkers=1
```

### S19 implementation

Automatic matching retains every selected receipt ID in the proposal and immutable revision, including rejected receipts, but writes allocation rows only for positive accepted quantities. With no accepted quantity, the source match can still be recorded with zero received; discrepancy evaluation presents the full unreceived amount for human review. A source match does not assert accepted delivery or create a debt/fee. No matching digest/rule or existing expected money value was changed.

### S20 implementation

Under the existing per-job supplier-match and things-to-check locks, evaluation looks up its exact tenant/job/source-version/match-revision/rule identity before auditing. For unchanged sources it appends an evaluation audit referencing that existing finding ID, and atomically stores the no-op command result. New findings use the normal insert; the old `ON CONFLICT ... DO NOTHING` discard was removed, so an unexpected conflicting writer rolls the transaction back rather than committing an orphan audit reference. Different command IDs retain separate stored first results, and exact replay returns the original result after later reviews.

## Checks actually run

Supplied dependencies only; no install/download command. Node `v24.17.0` (repository `.nvmrc`: `24.15.0`); cached pinned pnpm `10.28.1` via `/private/tmp/jg-migfix-2-bin/pnpm`. Normal runs prepend that directory to PATH and set `npm_config_manage_package_manager_versions=false COREPACK_ENABLE_NETWORK=0` so nested scripts use the same cached launcher. No customer data, provider calls or spending.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | PASS, 7 tasks / 2 cached, after removing S18. |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS, core purity, lane, money/commercial guards and 7 package lint tasks; final run after the tracking ref advanced. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS for all 9 task paths against current origin/main, using the normal merge-base comparison. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | PASS, lane serious-b6, 9 paths. No override, alternate base or bypass. |
| `pnpm exec turbo run lint` | PASS, 7 tasks / 2 cached. The separate full lint and lane checks also pass. |
| `node tools/core-purity-lint.mjs` | PASS. |
| `node tools/money-arithmetic-lint.mjs` | PASS. |
| `node tools/commercial-boundary-lint.mjs` | PASS. |
| `node --test tools/*.test.mjs` | PASS, 100 tests. |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/ai --workspace-concurrency=1 -r exec vitest run src --maxWorkers=1` | PASS: core 94 files / 2,601 tests; config 1/1; storage 1/2; AI 6/85. |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | PASS, 39 files / 844 tests. No browser started. |
| `pnpm --filter @jobguard/db exec vitest run src --exclude 'test/**' --maxWorkers=1` | PASS, 11 files / 113 tests. |
| Focused DB command above | PASS, 3 files / 28 tests. |
| API source subset (exclusions below) | PASS, 78 files / 1,642 tests. |
| `pnpm build` | PASS, 7 tasks / 2 cached, after removing S18; production Next build completed. Existing dynamic-import/workspace-root warnings and restricted Turbo cache-write warnings remain. |
| `pnpm openapi:check` | BLOCKED / exit 1: tsx CLI's IPC listener gets EPERM in this sandbox. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS: same generator and snapshot assertion, without the CLI IPC listener. Snapshot unchanged. |
| `pnpm eval` | PASS, 6 files / 85 tests, fixture-only evaluation. No model/prompt change or live model run. Existing ENT-8a all-rule/production evaluation remains held. |
| `git diff --check` | PASS. |
| Read-only working-tree path validation via `loadLanePolicy`, `selectLane`, `lanePathAllowed` | PASS; covers added/untracked paths as well. A path check, not the refused committed-range lane check. |

API source subset command:

```sh
pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 \
  --exclude src/auth/sso/action-paths.test.ts \
  --exclude src/contractor/contractor-practice-session.http.test.ts \
  --exclude src/contractor/site-extra-pricing.http.test.ts \
  --exclude src/contractor/site-extra.http.test.ts \
  --exclude src/contractor/site-visit.http.test.ts \
  --exclude src/health.test.ts \
  --exclude src/shadow-isolation.application.test.ts \
  --exclude src/final-account-lock.isolation.test.ts \
  --exclude src/contractor/practice-worker-switch.http.test.ts
```

Those nine suites require HTTP listeners and/or PostgreSQL. No existing test/configuration was edited or waived for CI. Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and browser/e2e suites were not run in this sandbox. Browser/e2e was explicitly prohibited; PostgreSQL cannot start here.

Earlier attempts are not represented as green: the initial lane/full-lint checks refused self-comparison while HEAD equalled origin/main; they passed on the normal rerun after the tracking ref advanced externally. An additional direct-diff path diagnostic momentarily compared the newer main tree with this unchanged older HEAD and included reverse upstream changes; a HEAD-based working-tree inspection and the actual merge-base lane tool both confirmed the 9 task paths only. Other initial attempts: the first typecheck reached a nested non-cached launcher and was interrupted (130); subsequent typecheck/package lint/build found an optional-reference type error in the **new** test, fixed without changing expected values. An initial DB source run timed out in the unchanged operator-reachability test (5-second limit) during concurrent checks; its unchanged rerun passed. Initial API subset (5 failed files, 73 passed; 50 failed / 1,575 passed) and direct OpenAPI attempts ran before supplied stale DB artifacts were rebuilt, failing on missing `PracticeWorkerSwitchRepository`/`JobSourceRepository` exports; the rebuild and passing reruns supersede that attempt. Earlier successful checks of the draft S18 implementation are superseded by final handoff runs after its removal. Raw logs: `/private/tmp/jg-serious-b6-*.log`; committed red/green logs retain task-specific evidence.

## Dispatcher / CI handoff and remaining holds

- **S18 remains unfixed and blocked by the exact existing expected-value ruling above.** No S18 schema, UI, repository or active test change remains in this patch. Neither claiming Batch 6 complete nor merging as all-three-fixed is supported by this receipt.
- Commit S19/S20 only after the normal review path. Run full CI including the committed-range lane check, database/migration suites and mandatory browser suites. New `packages/db/test/serious-b6.integration.test.ts`: four cases covering all-rejected and independently seeded mixed receipts, cited zero sources/positive allocations, discrepancy review, concurrent repeated evaluation identity/stored replay, and audit/identity rollback on failed finding insertion. Its independent-delivery setup uses existing tables as synthetic test fixtures; it does not implement S18.
- Focused PostgreSQL command: `pnpm --filter @jobguard/db exec vitest run test/serious-b6.integration.test.ts test/supplier-matching.integration.test.ts test/things-replay.integration.test.ts --maxWorkers=1`. These tests were written, not executed here.
- Version-2 lane uses exact file paths and lists neither itself nor the lane register. No existing expected value/refusal/count/name/hash/fingerprint or pinned list changed; no existing test file changed, including `apps/api/src/auth/context-boundary.test.ts` and `apps/web/e2e/M2-2-S.spec.ts`.
- No migration, backfill, privilege/RLS change, migration-note or ledger amendment. Migration SQL, `packages/db/src/migrate.ts`, `packages/db/MIGRATIONS.md`, `BUILD_PLAN.md` and the lane register are untouched. No new API/schema/UI contract or old-data reinterpretation remains after stopping S18. No clean install was attempted because dependencies were supplied and downloads prohibited.
- Affected invariants: AGENTS §§5.1 (tenant/job scoping retained), 5.4 (atomic command/results and replay), 5.5 (positive allocations), 5.7 (audit references resolve). No new external action, fee/ledger effect, production capability or operational alert.
- Serialize overlapping edits to the supplier matching/discrepancy repositories during integration. No unrelated task bundled.
- Database/browser guarantees, different-model verdict bound to the dispatcher commit, and separate acceptance remain pending. The builder has not accepted its own work. G1/G2 and real-data/commercial release gates are unchanged.
- Work is uncommitted for the dispatcher. Intended commit message: `/private/tmp/jg-msg-serious-b6.txt`.
