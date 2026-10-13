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
| BLOCKING 2 — rate validity | Both future and expired version-2 cases returned agreed **25,000p**, difference **−5,000p**, instead of 20,000p/zero | Bind `requiredDate` as the comparison date. Filter rates by inclusive `effective_from`/`effective_to`; filter pack conversions by effective date. Two unit and two PostgreSQL cases cover future and expired higher versions. |
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

