# AUDIT-FIX-API-FILE-PURCHASE-ORDER — builder receipt

Issued 13 October 2026 by dispatcher 4; executed 14 October 2026 (Europe/London).
Check lane: **RED** (money and consequential authorization). Implementation is prepared in the working tree. Technical acceptance is **HOLD** for the dispatcher/CI checks below and an independent verdict bound to the eventual commit. This receipt is builder evidence, not independent review or acceptance.

Read: `AGENTS.md`, `BUILD_PLAN.md` §§2.2–2.4 and M2-1 (§11.3), and `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-purchase-order.md`.

Observed branch: `codex/sandbox/audit-fix-api-file-purchase-order`. Observed HEAD and `origin/main`: `c08a53784c05b54b18f7bfff87f4c7597032ca7e` (newer than the issued base `e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4`, which is an ancestor). No checkout, add, commit, push, merge, or other direct Git mutation was performed. Dependencies were preinstalled. Node was **24.17.0**, whereas `.nvmrc` records **24.15.0**; neither pin nor installation was changed. Checks used the already cached **pnpm 10.28.1** through a temporary `/private/tmp/jg-po-bin/pnpm` wrapper. The global pnpm shim's initial version probes could not verify a registry signature; no install command or package download was requested.

## Failing-first findings

All five initial cases were written before changing production code and run together with `pnpm --filter @jobguard/db exec vitest run test/purchase-order-audit.test.ts --maxWorkers=1`. Exit **1**, five expected assertion failures. The tests use a transaction-aware SQL double and execute the real repository, dispatcher, hashing and audit code. They do **not** establish PostgreSQL guarantees. Authentic SQL coverage is separately supplied in `purchase-order-audit.integration.test.ts` and remains unexecuted locally.

| Finding | Initial failure observed | Change and coverage |
| --- | --- | --- |
| BLOCKING 1 — pack agreement | Order 20,000p; agreed **200,000p**; difference **−180,000p**, instead of 20,000p/zero | Read the date-applicable pack conversion and reuse `normalizePackRate` before exact quantity multiplication. Unknown or inexact pack normalization fails closed. Unit and authenticated PostgreSQL regressions assert 20,000p/20,000p/zero. |
| BLOCKING 2 — rate validity | Both future and expired version-2 cases returned agreed **25,000p**, difference **−5,000p**, instead of 20,000p/zero | Bind server UTC today as the comparison date (corrected in repair r1 below). Filter rates by inclusive `effective_from`/`effective_to`; filter pack conversions by effective date. Two unit and two PostgreSQL cases cover future and expired higher versions. |
| BLOCKING 3 — superseded placement | Promise **resolved**, creating a placement/outbox, instead of rejecting | Placement takes revise's existing per-tenant/job `watchdog-command` advisory lock before command identity. Under that lock, require the requested revision to be the draft's latest revision. Assert `PURCHASE_ORDER_AUTHORITY_STALE` and unchanged effects after rollback. |
| BLOCKING 4 — changed-content reuse | Promise **resolved with `reused: true`**, returning revision 1's effect for revision 2 | Existing placement must also have the requested `revision_id`. Reject a fresh changed revision; preserve original placement revision/hash, authorization/audit/outbox counts, and successful receipt replay after later edits. |

**DROPPED: none — all four blocking findings reproduced with failing executable tests.**

After the production fix, the original five tests passed unchanged. Four additional new tests cover exact historical receipt replay, same-revision fresh approval with one effect, aggregate lock ordering before identity/revision/audit, and refusal of an unknown pack size. Final local regression run: **9/9 pass**. PostgreSQL test collection: **5/5 cases collect**, not a database execution.

## Scope and invariants

Exactly five allowed paths: the lane registry, purchase-order repository, two new test files, and this receipt. The lane was added as one compact line; no existing row was edited. C1: repair of an existing workflow, no new screen or route; preserve the existing `M2-1B-S` browser suite. Shared-file overlap: `config/agent-lane-assignments.json`, serialized by the dispatcher; no other shared registration file changed.

Touched invariants: exact money and explicit pack units (§5.5); exact current commercial authority (§5.3); consistent business-lock order, durable replay and rollback (§5.4); matching immutable effect/audit content (§5.7). Existing verified tenant context, tenant/job filters, runtime grants, RLS, synthetic-only recipients/adapters and no-charge boundary remain in use. No business network action was added.

**Migrations: none. Grants: none.** Standard F needs no new grant here. No database schema, tax policy, prompt/model, live provider, fee policy, operational alert or release gate changed. No real data, spending, sends or collection. Existing immutable revisions and placements are not rewritten or backfilled; new revisions use the corrected comparison. Changed-content fresh placement now refuses instead of claiming success; genuine prior receipt replays remain valid. Deployment/rollback is a code change only; rolling back restores the audited defects and should not be used as a behavioral remedy.

Existing tests, expected values, refusals, counts, pinned names and fingerprints were not edited. No premise-establishing setup was added to an existing test. Before/after catalogue entry: **absent → new `audit-fix-api-file-purchase-order` lane only**, for this new task. All fixtures and setup are in the new tests. `apps/api/src/auth/context-boundary.test.ts` is byte-identical to HEAD, SHA-256 `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`; it passed in the refreshed combined registry/context run (266 total assertions).

## Commands actually run

Commands below use the cached pinned pnpm wrapper in PATH unless stated otherwise. Logs are in `/private/tmp/jg-po-*.log` on this workstation; no logs containing secrets or fixture PII were committed.

| Command | Result |
| --- | --- |
| `pnpm --filter @jobguard/db exec vitest run test/purchase-order-audit.test.ts --maxWorkers=1` | Initial exit 1: five expected failures; then exit 0: five passes; final exit 0: nine passes. |
| `pnpm --filter @jobguard/db exec vitest list test/purchase-order-audit.integration.test.ts` | Exit 0: five cases collect. No hooks/database start executed. |
| `pnpm typecheck` | Exit 0: all seven package checks. Initial invocation through the global shim failed; cached-pnpm rerun passed. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1 at official lane checker: HEAD equals origin/main; “Missing branch or self-comparison range; refusing a misleading pass.” |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1, same self-comparison blocker. No check was weakened or substituted. |
| `pnpm turbo run lint` | Exit 0: all seven package lint/type checks. Does not represent a pass of the root lane gate. |
| `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | Each exit 0. |
| `node --test tools/*.test.mjs` | Exit 0: 85 passes. Tests use their own scratch Git fixtures; the shared repository was not mutated by direct Git commands. |
| `pnpm build` | Exit 0: seven package builds, including production Next build and 31 static pages. Existing CSS/inferred workspace-root warnings and sandbox IO telemetry warnings remain. |
| `pnpm openapi:check` | Exit 1: tsx CLI attempted its IPC pipe and received `listen EPERM`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | First exit 1 with stale preinstalled DB dist exports; after build refresh, exit 0. Same OpenAPI generator/check, without tsx CLI's IPC listener. OpenAPI unchanged. |
| `pnpm turbo run test --filter=@jobguard/core --filter=@jobguard/config --filter=@jobguard/storage --filter=@jobguard/ai --filter=@jobguard/web` | Exit 1. Storage 4, config 2, AI 80 passed. Core found generated dist tests (missing corresponding dist `.ts` paths) and timeout failures: 4,876 passed / 14 failed. Web was subsequently run directly. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | Exit 1: 2,444 passes / one unchanged receipt-allocation test timed out at 5s. |
| `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts --maxWorkers=1` | Exit 0 on unchanged retry after compiler contention eased: all 34 pass. No timeout adjustment. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` | Exit 0: 33 files, 784 passes. |
| `pnpm --filter @jobguard/db exec tsc -p tsconfig.json --noEmit` | Exit 0. |
| DB unit selection: `vitest run src test/purchase-order-audit.test.ts test/contractor-session-context.test.ts test/recovery-case-join.test.ts test/recovery-message-repository.test.ts test/site-extra-evidence-compatibility.test.ts test/audit-api-capture.test.ts test/verify-audit-export-cli.test.ts test/verify-evidence-pack-cli.test.ts --maxWorkers=1` | Exit 1: 156 pass / 14 fail. Audit export CLI used stale dist; unchanged retry after build passes 14/14. Audit checkpoint transitive-source inspection exceeded its unchanged 5s budget; final unchanged retry passes 56/56. |
| `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts src/auth/context-boundary.test.ts --maxWorkers=1` | Exit 0 after build refresh: two files, 266 passes. Protected test untouched. |
| Broad API selection excluding shadow-isolation only | Exit 1: 1,103 pass / 536 fail / one skip, plus two failed suites. Initial stale DB exports, socket-based HTTP tests, imported PostgreSQL isolation setup, and an unrelated incomplete recovery-follow-up mock prevented a full pass. No PostgreSQL server started. Repeat after dist refresh stopped with Ctrl-C (exit 130) when the additional socket/database dependencies were identified. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/shadow-isolation.application.test.ts --exclude src/final-account-lock.isolation.test.ts --exclude '**/*.http.test.ts' --exclude src/health.test.ts --exclude src/auth/sso/action-paths.test.ts --maxWorkers=1` | Exit 0 after dist refresh: 63 files, 1,551 passes. Earlier incomplete-mock/export failures did not recur. Listener/DB files remain mandatory in CI. |
| `git diff --check`; unchanged protected-file comparison; supplemental exact allow-list comparison | Exit 0. Supplemental path inspection is not the official lane verdict. |

## Dispatcher/CI checks and acceptance hold

No PostgreSQL or browser was started. Sandbox cannot bind listeners or launch PostgreSQL; collection and SQL doubles are not substitutes. Run on the dispatcher's Mac where those services are permitted, or GitHub CI after the dispatcher commits/pushes:

```sh
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm test
pnpm test:db
pnpm test:migrations
pnpm openapi:check
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/purchase-order-audit.integration.test.ts test/materials.integration.test.ts test/command-replay-contract.integration.test.ts test/watchdog-lock-order.integration.test.ts
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M2-1B-S.spec.ts
```

The full API suite includes `shadow-isolation.application.test.ts`, `final-account-lock.isolation.test.ts`, `health.test.ts`, SSO `action-paths.test.ts`, and contractor `*.http.test.ts`; these require services/listeners outside this sandbox. Preserve these mandatory checks. Rerun the full source suites in the clean CI environment, including files excluded here for listener/database dependencies. The earlier mock/export failures were absent from the final 1,551-test selection after the build refreshed dist. No fresh install was attempted because dependencies were already supplied and downloads were prohibited. No AI behavior changed; the fixture AI suite passed, and no live-model evaluation is claimed.

The dispatcher owns the actual commit, push, independent cross-model verdict and separate technical acceptance. Intended conventional commit subject/body written to `/private/tmp/jg-msg-audit-fix-api-file-purchase-order.txt`. No exact changed commit exists yet; bind independent review to the dispatcher's final commit. Live supplier delivery remains disabled; this repair does not grant production release approval.

## Report items retained for later only

- **LATER 5:** ordinary `STALE_PURCHASE_ORDER_REVISION` propagates as a plain error and becomes HTTP 500 instead of typed 409. Not changed.
- Report's five test-strengthening suggestions retained only: fractional/half-even/overflow core money cases; date/revision authority-field coverage; pack/future/expired agreement comparisons in the existing materials integration test; explicit successful second-click replay identity in `M2-1B-S`; genuine PostgreSQL replay-conflict cases instead of SQL doubles in the API registry. Existing tests unchanged; the new PostgreSQL file separately covers the issued blocking scenarios.



## Repair round r1 — 14 October 2026, dispatcher 5

Read the full independent Opus verdict at `/Users/benharwood/.local/share/full-steam/jg-runs/audit-fix-api-file-purchase-order-opus-14f5eb8.md`: **REPAIR**, source inspection only, bound to `14f5eb8a8268356d1087c43ab007e166870ba065`. B1 is repaired in this working tree; this is not a fresh independent verdict or technical acceptance. Observed `origin/main`: `bd959b01e857de0ba7cbd3588bab84add7d0f493`. Earlier command results above describe the original build, not this repair.

`PurchaseOrderRepository.revise` now defaults its optional server-side `asOf` argument to `new Date().toISOString().slice(0,10)`, matching `MaterialApplication.view`. The same date parameter still filters rate validity inclusively and pack-conversion effective dates. The delivery date remains part of the approved order artifact and is no longer used to choose the comparison rate. The optional argument is internal; no HTTP contract or client-controlled pricing date was added.

The two new audit test files now derive rate windows from their comparison date: a fixed future UTC date with an explicit repository argument for unit tests, and server UTC today for the authenticated application/PostgreSQL cases. Delivery dates and every existing assertion, refusal, expected money/count/hash and test name are unchanged. One additional unit test fakes only Date at 23:30 UTC and proves the default uses UTC today despite a delivery date years earlier. The updated ten-case unit file failed against the reviewed head before the repository change, then passed 10/10 after it. SQL doubles do not prove PostgreSQL behavior.

Scope remains the existing lane; this repair changes only the repository, its two new audit test files and this receipt. No lane registration edit, schema/migration, grant, tax/fee policy, provider, UI, release gate or operational alert change. `apps/api/src/auth/context-boundary.test.ts` remains untouched. Invariants affected: agreed-price date consistency and exact pack money (AGENTS §5.5); prior current-authority, replay, audit and lock guarantees are preserved (§§5.3, 5.4, 5.7). Existing revisions are not rewritten; rollback/forward-fix remains code-only. Opus later items L1–L6 are outside this authorized blocking repair.

Dependencies were supplied; no installation or download command was run. The global pnpm version probe hung and was stopped (exit 130); all substantive checks use the existing cached pnpm 10.28.1 wrapper with `COREPACK_ENABLE_NETWORK=0`. Node remains 24.17.0 versus the unchanged 24.15.0 repository pin. No Git write command, commit, push, merge or PR was performed.

Repair check results are recorded below. PostgreSQL, migration and browser suites remain mandatory in GitHub CI after dispatcher push because this sandbox cannot bind localhost or start PostgreSQL. The root `pnpm test` is not invoked here because it includes those suites; available source/unit checks run explicitly. No skip or timeout setting was changed. The dispatcher owns commit/push, a fresh independent verdict bound to the repair commit, and separate acceptance. The intended conventional commit message is written to `/private/tmp/jg-msg-audit-fix-api-file-purchase-order.txt`.


### Repair r1 executed checks

All substantive pnpm commands used the cached 10.28.1 wrapper and `COREPACK_ENABLE_NETWORK=0`. Logs: `/private/tmp/jg-po-r1-*.log`; check-status files: `/private/tmp/jg-po-r1-*.exit` where captured. No live provider or database/browser execution is claimed.

| Command | Repair result |
| --- | --- |
| `pnpm --filter @jobguard/db exec vitest run test/purchase-order-audit.test.ts --maxWorkers=1` | Before repository repair: exit 1, all ten fail on delivery-date lookup. After repair: exit 0, 10/10 pass. Existing nine assertions are preserved; the tenth case covers the UTC-today default. |
| `pnpm --filter @jobguard/db exec vitest list test/purchase-order-audit.integration.test.ts` | Exit 0; all five cases listed. Collection only, no hooks/database execution. |
| `pnpm typecheck` | Exit 0; all seven package checks pass. |
| `pnpm --filter @jobguard/db exec tsc -p /private/tmp/jg-po-r1-tests-tsconfig.json` | Exit 0; separately compiles both modified audit test files with the repository's strict settings, no emit. |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 0; root guards, actual lane check and all seven package lint checks pass. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 0; registered task branch, exact five-path lane and merge-base comparison against observed `origin/main`. |
| `node tools/core-purity-lint.mjs && node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs` | Exit 0. |
| `node --test tools/*.test.mjs` | Exit 0; 85/85 pass. These tests write only their scratch Git fixtures, not this repository's Git state. |
| `pnpm build` | Completed successfully: Turbo reports seven successful tasks; production Next build generated 31 pages. Existing CSS, inferred workspace-root and sandbox cache/telemetry IO warnings remain. A redundant second invocation to capture status was stopped with Ctrl-C, exit 130, after it began rebuilding rather than using cache; it is not counted as a second pass. |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC listener gets `listen EPERM` in this sandbox. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0: the same OpenAPI check without tsx CLI IPC. OpenAPI unchanged. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | Exit 0; 81 files, 2,445/2,445 pass. Source selection avoids generated dist test duplication. |
| `pnpm turbo run test --filter=@jobguard/config --filter=@jobguard/storage --filter=@jobguard/ai` | Exit 0; config 2, storage 4, AI fixture 80 pass (Turbo includes cached tasks). No live-model evaluation. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` | Exit 0; 33 files, 784/784 pass. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/shadow-isolation.application.test.ts --exclude src/final-account-lock.isolation.test.ts --exclude '**/*.http.test.ts' --exclude src/health.test.ts --exclude src/auth/sso/action-paths.test.ts --maxWorkers=1` | Exit 0; 63 files, 1,551/1,551 pass, including the unchanged protected context-boundary test. Listener/database files remain required in CI. |
| `pnpm --filter @jobguard/db exec vitest run src test/purchase-order-audit.test.ts test/contractor-session-context.test.ts test/recovery-case-join.test.ts test/recovery-case-outcome.test.ts test/recovery-message-repository.test.ts test/site-extra-evidence-compatibility.test.ts test/audit-api-capture.test.ts test/verify-audit-export-cli.test.ts test/verify-evidence-pack-cli.test.ts --maxWorkers=1` | Exit 1: 178/179 pass. Sole failure is unchanged `audit-checkpoint-handoff.test.ts` `[C-OPS-1]` transitive source-scan test exceeding its 5,000 ms timeout. Purchase-order cases pass. |
| `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1` | Two unchanged retries both exit 1: 55/56 pass each; same source-scan timeout. Final retry after other checks finished still takes about seven seconds. This remains an unresolved local check, not a pass. No assertion or timeout was changed. |
| `git diff --check`; read-only HEAD comparisons and assertion/filter preservation checks | Exit 0. Exactly four repair paths changed. Both protected context test and existing `M2-1B-S` browser spec are byte-identical to reviewed HEAD. All earlier audit-test assertions remain; SQL validity and pack filters are byte-identical. |

**Remaining hold:** full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, standard `pnpm openapi:check`, the four PostgreSQL regression files and `M2-1B-S` in both browser projects listed above must pass in GitHub CI after dispatcher push. The unchanged audit source-scan timeout must also pass or receive a separately authorized repair; this lane does not weaken or bypass it. The repaired commit needs a fresh independent recorded verdict and separate acceptance. No acceptance is claimed here.
