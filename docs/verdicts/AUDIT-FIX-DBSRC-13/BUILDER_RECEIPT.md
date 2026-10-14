# AUDIT-FIX-DBSRC-13 builder receipt

Status: implementation and local deterministic checks; HOLD for dispatcher-run PostgreSQL/browser/complete CI and a real independent RED verdict on the dispatcher’s exact commit. The builder has not accepted this work.

## Scope and baseline

Issued 13 October 2026 by dispatcher 4; source: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-13.md`. Read repository AGENTS.md, BUILD_PLAN.md §§2.4, 5.2–5.4 and M4-5-S, and the existing repositories/tests/schema. The issued base was `c08a53784c05b54b18f7bfff87f4c7597032ca7e`; the actual clean starting HEAD and local `origin/main` were both `bd959b01e857de0ba7cbd3588bab84add7d0f493` on `codex/sandbox/audit-fix-dbsrc-13`. No Git-writing command, installation, live provider, real data or spending was used. Node `v24.17.0`; pnpm `10.28.1`, invoked from the already cached installation through `/private/tmp/jg-audit-fix-dbsrc-13-bin/pnpm`. The default pnpm launcher stalled while resolving its version and was interrupted; no dependencies were installed or lockfile changed.

Path classification using the coordinator’s `lane-floor.py` matcher and jobguard map gives AMBER for the six code/registration/test paths and GREEN for this receipt; raised to **RED** for durable delivery history and audit effects. The matcher was applied to the working tree because there is no new commit. Exact-path scope was separately verified against the new lane entry; this is a deterministic check, not an independent verdict. C1: repairs to existing repository behavior; no new screen, HTTP contract or UI.

## Findings

- **1 DROPPED:** current source reproduction passes: quantity `2.5` × 101p writes 252p (`audit-api-capture.test.ts`); no code changed for this finding.
- **2 FIXED, PostgreSQL verification pending:** the new `reading an unclaimed retry does not consume the previous attempt result` test failed before the fix: history gained an erroneous second `retryable` while only attempt 1 existed. It now passes. A terminal execution result cannot close a `started` event until the corresponding attempt exists; cancellation may still block an unclaimed start. The new real-PostgreSQL case appended to `recovery-messages.integration.test.ts` gates the real second executor before claim, reads concurrently, releases it, and requires exact history, two attempts, one sink record and one success audit across repeated reads.
- **3 DROPPED:** current source reproduction rejects a substituted captured scope UUID with `REVIEW_REVISION_CONFLICT` before inserting a review or canonical revision (`audit-api-capture.test.ts`); no code changed for this finding.
- **4 DROPPED:** current source reproduction passes for dismissed human additions with null quantity/unit and with quantity present, without canonical revision or progress (`audit-api-capture.test.ts`); an initial stale core-dist failure disappeared after rebuilding the existing core source.
- **5 FIXED, PostgreSQL verification pending:** the new `reset preserves both archive and replacement creation history` test failed before the fix: the replacement had zero creation events because the archive consumed `(tenant_id, command_id)`. Reset now uses a deterministic internal archive-effect identity derived from original reset command and old run; the replacement creation retains the original command ID. Both effects receive audits in one batch after all mutations, each linking its event command identity to the original reset command via `payload.references.command`. The new PostgreSQL suite requires one archive, one replacement creation at index 1, both attributable to reset through those audit records, and unchanged events/audits on exact replay. Existing event indices, clock values, uniqueness constraints and schema remain unchanged. This does not backfill historical omissions.

The initial new scripted tests both failed before implementation, then both passed after implementation. These SQL doubles reproduce repository logic and do **not** establish PostgreSQL guarantees. Logs: `/private/tmp/jg-dbsrc-13-before.log`, `/private/tmp/jg-dbsrc-13-after.log`, `/private/tmp/jg-dbsrc-13-dropped.log`.

LATER, receipt only (no fixes): **6** mismatched review ID can overwrite another saved review; **7** landing-port schemas cannot accept the same complete payload; **8** sandbox changed-payload conflicts/advance replay are broken; **9** combined negative landing fixture masks independent guards. The report’s five weak-test suggestions remain later work: isolated landing negatives; sandbox replay/races/history; capture fractional prices/identity/lineage; real advance-boundary stale-claim refusal; PostgreSQL blocked-replay row comparisons.

## Checks actually run

All pnpm commands below used `PATH=/private/tmp/jg-audit-fix-dbsrc-13-bin:$PATH`. Dependencies were already installed; no clean install was attempted.

| Command | Exit / result |
| --- | --- |
| `pnpm --filter @jobguard/core build` | 0; refresh stale local output before capture reproductions |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-dbsrc-13.test.ts test/audit-api-capture.test.ts` (before fix) | 1; both new tests failed for the expected reasons; one existing test also failed from stale core output |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-api-capture.test.ts` (after core build, before db fixes) | 0; 14 unchanged tests; findings 1/3/4 dropped |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-dbsrc-13.test.ts test/recovery-message-repository.test.ts test/audit-api-capture.test.ts` | 0; 25 tests |
| `pnpm typecheck` | 0; all seven packages |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; `Missing branch or self-comparison range; refusing a misleading pass.` HEAD equals origin/main until dispatcher commits |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; same mandatory lane guard; core purity passed before it |
| `pnpm turbo run lint` | 0; all seven package lint checks, separately from the root lane refusal |
| `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | 0 each |
| `node --test` on all tool test files except the two Git-writing lane fixture suites | 0; 19 tests; excluded files listed below |
| `pnpm --filter @jobguard/db build` | 0; refresh stale DB exports |
| `pnpm --filter @jobguard/core exec vitest run src` | 0; 81 files, 2,445 tests |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --exclude '**/dist/**' --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'` | 0; 14 files, 171 tests |
| `pnpm --filter @jobguard/api exec vitest run src --exclude '**/*.http.test.ts' --exclude '**/health.test.ts' --exclude '**/shadow-isolation.application.test.ts' --exclude '**/auth/sso/action-paths.test.ts' --exclude '**/final-account-lock.isolation.test.ts'` | 0; 64 files, 1,555 tests |
| `pnpm --filter @jobguard/ai --filter @jobguard/storage --filter @jobguard/config exec vitest run src` | 0; AI 80, storage 2, config 1 tests |
| `pnpm openapi:check` | 1; tsx launcher IPC socket rejected by sandbox (`EPERM`) |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; same OpenAPI generator/check without the launcher IPC listener |
| `pnpm build` | 0; all seven packages, including production Next build |
| `pnpm --filter @jobguard/web test` after API rebuild | 0; 33 files, 784 tests |
| `git diff --check`; protected-file/registry/assertion preservation checks | 0; details below |

Earlier broad local attempts also retained truthful failures: `pnpm turbo run test --filter=@jobguard/core --filter=@jobguard/ai --filter=@jobguard/config --filter=@jobguard/storage --filter=@jobguard/web` exited 1 because generated core test copies looked for missing `dist/*.ts` source files. Two broad DB attempts included generated copies of the operator source-inspection test and timed out at its unchanged 5-second limit (2 failures/254 passes, then 1 failure/257 passes). Source-only DB selection excluding dist passed with the original timeout. An initial API selection before rebuilding DB exited 1 (18 failed files, 47 passed; 322 failed tests, 1,235 passed, 1 skipped), mostly missing stale exports; it also indirectly imported a PostgreSQL fixture and failed finding a localhost port, before PostgreSQL started. That file is excluded from the sandbox-only rerun. An initial web run before rebuilding API exited 1 (11 failed files, 22 passed; 322 failures, 462 passes) with stale API exports. No existing source, expected value or timeout was changed to address these environment/build-output failures. Temporary logs are `/private/tmp/jg-dbsrc-13-*.log`.

## Dispatcher / CI required checks

No PostgreSQL, MinIO or browser was started. Root `pnpm test`, database/migration/browser suites remain mandatory and are delegated to the Mac/CI environment allowed to run services. After committing and pushing, run:

- `LANE_BASE_REF=origin/main pnpm lint:lanes` and `LANE_BASE_REF=origin/main pnpm lint` with a real non-self commit range; run coordinator `lane-floor.py` and retain RED review.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-dbsrc-13.integration.test.ts test/recovery-messages.integration.test.ts test/sandbox.integration.test.ts test/audit-api-capture.integration.test.ts`.
- Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm typecheck`, `pnpm build`, `pnpm openapi:check` in clean pinned CI. Root test includes `tools/agent-lane-boundary.test.mjs` and `tools/agent-lane-boundary-train.test.mjs`, omitted here because their temporary fixtures execute Git writes prohibited by this work order. Source/generated test-copy problems above must not be mistaken for a passing root suite.
- Full `pnpm test:e2e`, including the existing sandbox reset and recovery delivery/retry journeys in mobile-360 and desktop. The omitted local API files named in the table require localhost (HTTP, PostgreSQL or both); DB `free-port.test.ts` also requires localhost.

No prompt/model/extraction/matching policy changed; no new live-model evaluation needed for this repair. Existing evaluation gates remain mandatory.

## Invariants, edits and review boundaries

Affected AGENTS invariants: §5.4 durable attempt history, §5.7 append-only audit with final audit lock, and BUILD_PLAN C5 retry/replay facts. No migration, rollback SQL, table/routine/grant/RLS/role or financial formula changes. Standard F grant evidence is inapplicable: no grant added or changed. Forward fix only; old dropped reset creation events remain a later data repair. No new external action, provider, secret, alert, wire schema or API compatibility change. Reset now adds the missing creation event and an archive audit; consumers may observe the complete history instead of its prior omission. The derived archive-effect ID is internal; caller reset command IDs and exact reset replay remain unchanged.

Standing-rule before/after: lane catalogue entry `audit-fix-dbsrc-13` was **absent**; now one compact entry with only the seven exact paths changed by this task. Every existing catalogue row is unchanged. No premise-establishing setup was inserted before an existing call. `recovery-messages.integration.test.ts`: **before** existing final line; **after** an appended independent describe/test, with no existing line deleted or edited. New test fixtures establish their own synthetic sessions/commands; they do not alter old fixtures or expected values.

Protected `apps/api/src/auth/context-boundary.test.ts` is byte-identical to HEAD; SHA-256 before/after: `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`. Existing expected values, refusals, counts, pinned names, fingerprints and lane entries are unchanged. No STOP-triggering protected edit was needed.

Shared files: lane registry and recovery integration suite serialize with the dispatcher; no concurrent editing was delegated. The audit’s capture repositories already contain the other task’s merged fixes and were untouched. No independent model verdict or separate acceptance exists for this uncommitted diff. Founder/dispatcher owns commit, push, review and merge. G0/G1 and fee/release gates remain pending; this synthetic repair grants no production authorization.

Intended commit message: `/private/tmp/jg-msg-audit-fix-dbsrc-13.txt`; dispatcher commits the working tree after this run.
