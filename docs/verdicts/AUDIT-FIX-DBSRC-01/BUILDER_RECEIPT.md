# AUDIT-FIX-DBSRC-01 — builder receipt

Issued 13 October 2026 by dispatcher 4; built 14 October 2026. Branch `codex/sandbox/audit-fix-dbsrc-01`; uncommitted working tree based on `bd959b01e857de0ba7cbd3588bab84add7d0f493` (HEAD and origin/main). No git-writing commands, commit, push, package download, live provider, spending or real data. Dispatcher owns the commit. Independent exact-commit verdict and separate technical acceptance remain HOLD/pending; this is builder/test evidence only.

## Scope and evidence

Read AGENTS.md rev 3.0, BUILD_PLAN.md §2/C1–C8 and §5.3/§5.6, authentication-v1 contract, and `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-01.md`.

**Check lane: RED.** Existing command permission/tenant boundary is affected; raise the mechanical path floor for authorization. The lane registry adds exactly one compact row with five exact paths. C1: repair of the existing dispatcher; no new UI, HTTP route or workflow. Shared `commands.ts` and lane registry edits must serialize with coordinator/other active leaves (including CH-2/CH-3a). No migration, schema, grant, catalogue, package pin or existing test assertion changes. Standard F for grants is inapplicable because no grant is added, including in the new fixture (it uses the existing runtime role). Protected `apps/api/src/auth/context-boundary.test.ts` and its lists are unchanged.

**BLOCKING 1 — reproduced and fixed:** `dismissDecision refuses membership that expired after authentication` was written first in `packages/db/test/audit-dbsrc-01.test.ts`. Direct installed Vitest command `./node_modules/.bin/vitest run --maxWorkers=1 test/audit-dbsrc-01.test.ts` from packages/db exited **1** before the fix: “promise resolved … instead of rejecting”; actual result was `{ decisionId: '81000000-0000-4000-8000-000000000006', resolution: 'dismissed', authorizedAction: false }` instead of `FORBIDDEN`. The same unchanged regression exited **0** after the fix (1 test). A second pre-fix execution also failed identically after a relative-path edit command failed before making a change.

This local regression runs the real dispatcher/withTenant with scripted membership/finding SQL and a mocked audit append. It verifies refusal, no resolution/audit append, rollback rather than commit, and connection release. It is not PostgreSQL or durable rollback evidence.

Product change, `packages/db/src/commands.ts:100`, membership WHERE clause only:

- Before: `AND role='owner' AND revoked_at IS NULL`
- After: `AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`

This matches the expiry check already used by consequential dispatch, uses the database clock, preserves non-expiring membership, and refuses newly submitted dismissed/rejected resolutions after expiry. Existing idempotent replay behavior is unchanged. Receipt insertion stays in the same transaction, so refusal rolls it back. Affected invariants: AGENTS §5.1 current authority/tenant boundary, §5.4 atomic receipt/state/audit and §5.7 audit integrity. No new alert or backwards-compatibility/schema impact; newly submitted commands from expired owners now receive the existing typed `FORBIDDEN`.

New PostgreSQL companion `packages/db/test/audit-dbsrc-01.integration.test.ts`: seed unresolved findings and a future-expiring owner; lookup active membership and construct that owner's context; expire membership before dispatch; test both dismissal and rejection and unchanged resolution/receipt/audit/authorization counts. Positive controls cover future and NULL expiry for both outcomes. All jobs/identities are generated fictional fixtures. The existing synthetic-party setup is called before inserting a live fixture job. No existing call or fixture was edited: before there was no audit-dbsrc-01 fixture; after the new fixture installs `installLegacySyntheticPartyFixtures(admin)` before job creation. Test connections execute as existing `jobguard_runtime` via startup role, checked by `current_user`; the privileged infrastructure login means this is not proof against role escalation.

**DROPPED:** none; the sole BLOCKING finding reproduced.

## LATER — receipt only, unchanged

1. Successful semantic replay can leave the acknowledged new command ID reusable (report finding 2).
2. Concurrent identical captures can return raw PostgreSQL `23505` instead of the persisted identity (finding 3).
3. Commercial action amount boundary omits safe-integer and application-limit checks (finding 4).

Report's five later test-strengthening notes (no edits): commands aggregate-contention test lacks real row locking/blocking evidence; grant-refusal test lacks expired-grant/member setup; rollback test throws before a domain write; capture-idempotency test runs sequentially; audit-tampering cases should also use valid-shaped replacement values.

## Environment and execution

Node `v24.17.0`; pinned pnpm `10.28.1` found in the existing Corepack cache. Dependencies were already installed; no clean install was attempted. Global pnpm initially attempted version management and was interrupted (130); locally available pnpm 9 attempts refused the pinned version (1), with no dependency changes. Subsequent pnpm commands use `PATH=/private/tmp/jg-dbsrc-01-bin:$PATH` pointing to cached 10.28.1 and `LANE_BASE_REF=origin/main`. Turbo cache results are cache evidence, not a clean-install run. Temporary logs are `/private/tmp/jg-dbsrc-01-*.log`.

Root `pnpm lint` and `pnpm lint:lanes` both exit **1** because HEAD equals origin/main: “Missing branch or self-comparison range; refusing a misleading pass.” No lint rule was changed. Dispatcher must rerun after committing. Separate working-tree path validation uses the existing lane selector/matcher and reads git diff/untracked paths; it is not the full commit-range lane check.

Full `pnpm test` was not run: its tooling tests issue git-writing commands in temporary repositories, and its DB/API suites require forbidden PostgreSQL/listening sockets. Safe unit suites are run separately. An initial DB unit filter `src` accidentally matched the name `audit-dbsrc-01.integration.test.ts`: its setup failed at freePort (`no free port in 57000..57500`), all four integration tests skipped, and PostgreSQL never initialized or started. The unit rerun explicitly excludes all integration files. The attempted filter also recorded a 5-second timeout in the unchanged audit-checkpoint source-scan test.

`pnpm openapi:check` exits **1** because the tsx CLI tries to bind an IPC socket (`listen EPERM ... tsx-501/...pipe`). The same OpenAPI source check is additionally invoked with `node --import tsx src/generate-openapi.ts --check`, avoiding the CLI socket.

## Required dispatcher/Mac or GitHub CI checks

- `LANE_BASE_REF=origin/main pnpm lint` and `pnpm lint:lanes` after the dispatcher commit.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-dbsrc-01.integration.test.ts test/commands.integration.test.ts test/decision-inbox.integration.test.ts` for the new expiry regression and existing command/inbox guarantees.
- `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm test:e2e` (both mobile-360 and desktop) and standard root checks on a clean pinned CI install. No DB/browser guarantee is marked passed here.
- Any local check failures below must be resolved/rechecked before acceptance. No changed AI schema/prompt/model: no new live-model evaluation is applicable; AI fixture unit results are separate evidence.
- Independent RED verdict bound to the dispatcher's exact commit, then separate acceptance. No builder self-acceptance.

## Check results (commands actually run)

All pnpm commands below use cached pinned 10.28.1 and `LANE_BASE_REF=origin/main` unless explicitly noted above.

| Command | Exit/result |
| --- | --- |
| Direct installed Vitest new regression (before / after fix) | 1 expected refusal failure / 0, 1 passed |
| `pnpm lint` | 1, unchanged self-comparison guard |
| `pnpm lint:lanes` | 1, unchanged self-comparison guard |
| `node tools/money-arithmetic-lint.mjs` | 0 |
| `node tools/commercial-boundary-lint.mjs` | 0 |
| `tsc --noEmit --strict --skipLibCheck --esModuleInterop --module NodeNext --moduleResolution NodeNext --target ES2022 packages/db/test/audit-dbsrc-01.test.ts packages/db/test/audit-dbsrc-01.integration.test.ts` | 0 |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | 0, 19 tests passed |
| `pnpm turbo run test --filter=@jobguard/core --filter=@jobguard/ai --filter=@jobguard/config --filter=@jobguard/storage` | Interrupted (130); core also discovered generated dist tests and reported failures; AI 80, config 2 and storage 4 tests passed before interruption |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src` | 1; 2443 passed, 2 unchanged receipt-allocation tests timed out at 5000ms (2000 distinct amounts / denominator bound); no assertions/timeouts changed |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src test/audit-dbsrc-01.test.ts` | 1; 87 passed, existing audit-checkpoint scan timeout plus accidental new integration port-setup refusal (4 skipped) |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/ test/audit-dbsrc-01.test.ts --exclude '**/*.integration.test.ts'` | 1; 87 passed, 1 unchanged audit-checkpoint source-scan timeout at 5000ms |
| `pnpm --filter @jobguard/web test` before API rebuild | 1; 255 passed, 529 failed, 15 errors, including undefined built API schema exports; subsequent rebuild/rerun below |
| `pnpm openapi:check` | 1, tsx IPC socket EPERM |
| From apps/api: `node --import tsx src/generate-openapi.ts --check` | 0, same source/OpenAPI comparison without tsx CLI IPC |
| Read-only working-tree checks using `selectLane` / `matches`, git diff and git show | 0, five exact allowed paths; other lane entries and protected auth file unchanged; product diff exactly one SQL predicate |
| `git diff --check` | 0 |

The machine reported load averages 46.31 / 37.55 / 34.62 while checks ran. This is context, not proof that load caused the timeouts. Existing failures remain visible and must be rechecked in CI; no expectation or mandatory check was weakened.

| Additional completed command | Exit/result |
| --- | --- |
| `pnpm typecheck` | 0; 7 successful tasks, 4 cached |
| `pnpm turbo run lint` (package lints independently of the blocked root lane guard) | 0; 7 successful tasks, 4 cached |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` after API rebuild | 0; all 784 tests passed (33 files), resolves the initial stale-artifact failures |

| Final completed command | Exit/result |
| --- | --- |
| `pnpm build` | 0; 7 successful tasks, 4 cached, including API and Next production build; existing CSS/workspace-root and Turbo cache IO warnings |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1 src/receipt-allocation.test.ts` isolated retry | 0; all 34 passed at the original timeout, covering both earlier core timeout failures |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/audit-checkpoint-handoff.test.ts` isolated retry | 1; 55 passed, C-OPS-1 still exceeds its unchanged 5000ms timeout; dispatcher/CI recheck required |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=1 src --exclude src/health.test.ts --exclude src/shadow-isolation.application.test.ts --exclude src/auth/sso/action-paths.test.ts --exclude 'src/contractor/*.http.test.ts'` | 1; 1557 passed, 1 skipped, one suite failed before running its DB case because no free port (58400..58650); no assertion failures |

The API source scan excluded explicit HTTP/listener/PostgreSQL imports, but missed the dynamic database fixture in `final-account-lock.isolation.test.ts`. Its real-DB describe failed in port allocation before PostgreSQL initialization/start, while its two scripted application cases passed. The whole file belongs to Mac/CI execution. The protected context-boundary file ran as part of the API source units and was not edited. Future sandbox API runs must also exclude `src/final-account-lock.isolation.test.ts`; all excluded HTTP/DB suites remain mandatory in CI.

**Handoff status:** blocking product fix and failing-first local regression delivered; no schema migration needed. Typecheck, package lints, production build, direct-loader OpenAPI comparison, web units and core retry passed. Full root lint/lane and test acceptance remain HOLD: commit-range lane lint needs the dispatcher commit; real PostgreSQL/browser/tooling-with-git suites need Mac/CI; the unchanged DB operator source-scan timeout remains unresolved. No source assertion or timeout was modified to obtain a pass. Intended conventional commit message is `/private/tmp/jg-msg-audit-fix-dbsrc-01.txt`.
