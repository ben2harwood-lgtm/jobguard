# AUDIT-FIX-API-FILE-SUPPLIER-MATCH — builder receipt

Issued 13 October 2026 by dispatcher 4. Builder work only; independent RED verdict and separate acceptance remain required against the dispatcher's eventual commit. No commit, staging, checkout, push, migration, grant, service startup, real data or spending performed.

Branch: `codex/sandbox/audit-fix-api-file-supplier-match`. HEAD/issued base: `e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4`. Local `origin/main` at validation: `c08a53784c05b54b18f7bfff87f4c7597032ca7e`; not rebased. Lane lint used `LANE_BASE_REF=origin/main` and its merge-base comparison. Check lane **RED**, raised for supplier discrepancy money inputs and correction provenance (the new lane row itself is additive).

Read `AGENTS.md`, BUILD_PLAN M2-2/M2-3/M2-4/M2-5 contracts and the supplied source-inspection audit. Report: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-supplier-match.md` (4 BLOCKING, 0 LATER).

## Failing-first evidence and changes

Created `packages/db/src/supplier-match-repository.test.ts` before changing the repository. Ran:

```sh
node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs --filter @jobguard/db exec vitest run src/supplier-match-repository.test.ts
```

Initial result: **4 tests failed**, exit 1, for the expected reasons below (Vitest 4.1.11, start 00:05:30 Europe/London 14 October). These are synthetic driver-double tests executing repository source selection/correction validation, not real PostgreSQL or transaction/RLS proofs. Four equivalent real-PostgreSQL tests were appended to the existing supplier-matching integration suite for CI.

| BLOCKING finding | Initial observed failure | Fix and regression |
| --- | --- | --- |
| 1. Delivery corrections counted twice | `matches only the current revision of each delivery`: two receipt version IDs returned instead of only revision 2. | Keep highest revision for each `(order_draft_id, document_id)` delivery; allocate only current versions. Regression checks 6 accepted and £50 price + £80 quantity = £130; PostgreSQL test checks `received: "6 each"` and stored six-unit allocation to revision 2. |
| 2. Unrelated order revision replaces B | `an unrelated order revision cannot replace a delivery's order`: returned A's version UUID rather than B's. | Load the order revision only from the receipts' recorded draft. Distinct delivered drafts fail with `MATCH_SOURCE_VERSION_CONFLICT` because the retained synthetic invoice has no explicit order reference. Regression checks B's order version and £50 + £40 = £90 after A reaches revision 3. |
| 3. Allocation outside declared sources | `rejects allocations outside the declared receipt versions`: promise resolved with revision 2/history `[1,2]` instead of rejecting. | Require every allocation receipt ID to be in the declared source list, which must already belong to the proposal. Driver test checks no revision/allocation/audit append; PostgreSQL test checks no new revision, allocation or audit event and unchanged view after refusal. |
| 4. Replacement proposal cannot be corrected | `a replacement proposal accepts correction at its returned revision`: threw `MATCH_REVISION_CONFLICT` at repository line 139 for expected revision 3 and one history row. | Compare `expectedRevision` with `coalesce(max(revision),0)`, preserving existing numbering and immutable history. Regression checks 3 → 4 and one extra history row; PostgreSQL test creates/corrects the original, confirms changed invoice facts, creates replacement and corrects it through returned revision. |

After the fixes, the same four tests passed (00:07:00, 4/4, exit 0). Added two further driver tests for separate deliveries remaining additive and refusing ambiguous delivered-order sets. No BLOCKING finding dropped.

No monetary formula, fee entitlement, source document history, command replay identity, tenant context or authorization path changed. New matches use current delivery facts; previous proposals, allocations, discrepancy snapshots and audit history remain immutable. No backfill or migration. Existing synthetic SKU/invoice conventions remain; this is not a new general merchant matching implementation or production release approval. No new operational alert, provider route or external action.

## Preservation and exact scope

Added one compact `audit-fix-api-file-supplier-match` lane row, with exactly these five allowed files:

- `config/agent-lane-assignments.json`
- `packages/db/src/supplier-match-repository.ts`
- `packages/db/src/supplier-match-repository.test.ts`
- `packages/db/test/supplier-matching.integration.test.ts`
- `docs/verdicts/AUDIT-FIX-API-FILE-SUPPLIER-MATCH/BUILDER_RECEIPT.md`

Verified with read-only `git show HEAD:<path>` and byte comparisons: original integration-test content is an unchanged prefix; every original expectation/refusal/count/name remains intact. Protected `apps/api/src/auth/context-boundary.test.ts` unchanged byte-for-byte, SHA-256 before/after `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`. No pinned list or fingerprint changed. Parsed lane registry before/after differs only by this new entry. Standard F: no SQL privilege grant added or altered; the lane allow list is limited to the issued repair's exact files.

Catalogue/setup changes: before, no audit lane or audit regression fixtures; after, one new lane for this NEW task plus isolated synthetic jobs/order/document setup for NEW tests. Existing catalogue entries and existing fixture setup are unchanged. No premise-establishing insertion before an existing test call. Integration setup reuses the existing runtime login/grant unchanged. Shared overlap: lane registry (own appended row only); supplier integration file (appended helper/tests only). No other lane's files changed.

## Validation

Existing dependencies reused; no install command run. Node `24.17.0`; pinned pnpm `10.28.1` invoked from its existing Corepack cache. For checks below, PATH begins with `/private/tmp/jg-pnpm-audit-file-match`, whose `pnpm` wrapper invokes that cached executable. The normal system pnpm version command stalled on version management; the pinned cached executable avoided it. No clean-install claim. Turbo may reuse existing local cache entries; actual DB checks were executed.

| Command | Result |
| --- | --- |
| `LANE_BASE_REF=origin/main pnpm typecheck` | PASS, 7 tasks (4 cached). |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS, root purity/money/commercial/lane checks plus 7 package tasks (4 cached). |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, exactly five changed files in own registered lane; run again after receipt added. |
| `pnpm build` | PASS, 7 tasks (4 cached); API and web built. Existing CSS compatibility/workspace-root warnings; Turbo cache persistence also warned `Operation not permitted`. |
| `pnpm --filter @jobguard/db exec vitest run src --maxWorkers=1` | PASS, 5 files / 91 tests, including all six new driver regressions. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | PASS, 81 files / 2,445 tests. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` | PASS, 33 files / 784 tests. |
| API source unit subset (command below) | PASS, 63 files / 1,551 tests, including the unchanged context-boundary suite. |
| `pnpm eval` | PASS, 5 AI fixture files / 80 tests. Synthetic fixture gate only; no live model run. |
| Filtered config/storage package tests | PASS, config 2 files / 2 tests; storage 2 files / 4 tests. |
| Safe root tool tests (command below) | PASS, 19 tests. |
| `pnpm openapi:check` | BLOCKED, `tsx` CLI tried to bind its IPC pipe and received `listen EPERM`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS, same source generator and committed OpenAPI comparison, using Node's loader without the CLI IPC listener. |
| `git diff --check` and preservation comparisons | PASS; read-only git commands. |

API subset command (all excluded suites are mandatory in capable CI):

```sh
pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude '**/*.http.test.ts' --exclude src/health.test.ts --exclude src/auth/sso/action-paths.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/final-account-lock.isolation.test.ts
```

Safe root tool command (the two git-writing fixture files are omitted):

```sh
node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs
```

Earlier runs and limitations retained, not counted as passes: the broad filtered package `-r test` command found generated core `dist` tests as well as source tests, failing with two missing `.ts` source paths in generated tests and source-scan/exact-arithmetic timeouts (4,881 passed / 9 failed). Core source-only with two workers initially timed out four tests; the two affected files later passed 39/39, then the entire source suite passed with one worker. DB source-only initially timed out the existing C-OPS-1 reachability scan (90 passed / 1 timeout), including the first one-worker attempts while other checks ran; isolated scan recheck passed 56/56, then full DB source-only passed 91/91. No timeout, expected value or test code was adjusted.

The first web unit run overlapped rebuilding API artifacts and reported `siteVisitHttpFailure is not a function` (684 passed / 100 failed); after API build, the unchanged suite passed all 784. The first API subset passed 63 files and 1,553 tests but included the dynamically imported real-PostgreSQL setup in `final-account-lock.isolation.test.ts`: its fixture failed with `no free port in 58400..58650` before PostgreSQL initialization/startup (one database test consequently skipped by failed setup). That whole file is explicitly deferred in the final sandbox subset; no test was edited or newly skipped in source. The failed setup attempt is not a database verification.

Logs: `/private/tmp/jg-audit-file-match-*.log`. The standard root test command remains unexecuted here; no full root-test or clean-install success claimed. No existing incorrect match/discrepancy snapshot was backfilled or rewritten; reviewing a new proposal from current sources and reevaluating uses the existing commands. Rollback is application-only; any later repair must preserve stored revisions and audit history.

## Dispatcher/CI checks still required

Sandbox prohibits PostgreSQL startup, localhost listeners and browsers. Run on the Mac or GitHub CI after committing/pushing:

```sh
LANE_BASE_REF=origin/main pnpm typecheck
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm test
pnpm build
pnpm openapi:check
pnpm test:db
pnpm test:migrations
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/supplier-matching.integration.test.ts test/match-inbox-replay.integration.test.ts test/supplier-documents.integration.test.ts
pnpm test:e2e
```

Focused browser paths: `M2-4-S.spec.ts` and `M2-5-S.spec.ts` on mobile-360 and desktop, plus all mandatory earlier journeys in the full e2e command. Root `pnpm test` was not run: it starts PostgreSQL and includes lane/train tool fixtures that invoke git-writing commands forbidden by this card. Direct database integration suites and browser suites were not run here; the API database setup attempt described above failed before PostgreSQL could start. API HTTP/listener/PostgreSQL tests are deferred as well. The real PostgreSQL regressions are authored, not yet executed. Technical acceptance remains held for dispatcher/CI evidence, independent exact-commit RED verdict and separate acceptance; existing production/pilot gates remain.

## Report follow-ups (receipt only)

LATER findings: **none** (report explicitly says 0).

The report's five weak-test suggestions were not separately marked BLOCKING or LATER and are listed here only; their existing assertions were not rewritten:

1. Core `covers credits, rate dates and discounts as exact version-bound inputs`: needs actual credit/discount/date fixtures.
2. Core `reproduces IDs and digests for partial and split/one-to-many inputs`: needs persisted receipt-allocation coverage.
3. DB `reproduces the match digest, preserves revisions and rejects stale/double allocations`: needs a meaningful changed-quantity correction and persisted £130 result.
4. Replay `correct: replays the view it first returned after later corrections; changed payload and another job conflict`: needs explicit 8/6 received checks on original responses and replays.
5. API `supplier-match-repository keeps replay identity conflicts typed`: needs real changed-allocation command reuse, typed 409 and unchanged persistence.

Intended conventional commit message is written to `/private/tmp/jg-msg-audit-fix-api-file-supplier-match.txt`. Dispatcher owns commit/push/merge; builder does not self-accept.
