# M4-12-S — RED builder handoff

Built ahead on `codex/sandbox/m4-12-s-collect`, stacked on m4-10-s-issue and m4-9-s-posting. No commit, push, PR, merge or independent review performed by this sandbox. Router owns those steps.

Implemented additive migration 0491; immutable attempt/event/command records; exact statement and displayed principal approval; atomic reservation; pending/unknown/settled/definite-failure reconciliation; bounded refunds; fake-only HTTP and browser controls. Sources and locking reuse 0490. No existing migration or subscription routine was changed. LP inventories, SERIOUS-B5, entitlement and tenancy expectations are additive exact unions.

Local verification (installed runners; pnpm wrapper stalled before running scripts and was stopped):

- `node_modules/.bin/tsc -p packages/core/tsconfig.json` — PASS.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json` — PASS.
- `node_modules/.bin/tsc -p apps/api/tsconfig.json` — PASS.
- `node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` — PASS.
- Core Vitest: `src/simulation-fee-collection.test.ts src/issued-simulation-fee-statement.test.ts --maxWorkers=1` — 6 tests PASS.
- DB Vitest: `src/simulation-fee-collection-repository.test.ts test/simulation-fee-collection-catalog.test.ts --maxWorkers=1` — 5 tests PASS. Catalogue test is static inventory/source validation, not PostgreSQL execution.
- API Vitest: `src/success-fee.application.test.ts --maxWorkers=1` — 18 tests PASS.
- Web Vitest: `app/api/jobs/[id]/success-fees/collection/route.test.ts app/api/jobs/[id]/success-fees/statements/route.test.ts --maxWorkers=1` — 6 tests PASS.

- `node --import tsx src/generate-openapi.ts --check` from `apps/api` — PASS; source generator used because the tsx CLI's IPC socket is sandbox-blocked.
- Core purity, money arithmetic, commercial boundary and PL/pgSQL CASE lint — PASS.
- `git diff --check` — PASS.
- Full `node tools/lint.mjs` stops at lane lint: its main-based range includes the unmerged predecessor stack, which this piece correctly does not claim. A working-diff comparison using the existing exported `lanePathAllowed` verifies exactly the 28 paths in this piece, with no missing or extra allow entries. Router must land the base before opening this PR so full lane CI can run against current main. No lane rule was relaxed.

CI must execute PostgreSQL integration/upgrade tests and the browser journey. Database tests attack concurrent identical/new command IDs, redirect non-settlement, unknown outcome blocking/reconciliation, terminal transitions, over-refund, stale statements/amounts, cross-job/session access, FORCE RLS, denied direct table writes, audit rollback and migration replay. The browser transport fixture demonstrates £282 → refund due £250 → refunded £250, retained £32 using mocked transport. It does not prove PostgreSQL or a live provider. Local PostgreSQL and browser execution are unavailable because the sandbox cannot bind localhost/start PostgreSQL. Full pinned-install suites, CI against current main and fresh Claude RED review are still required.

Initial source review: LATER / SIMPLICITY — `packages/db/src/simulation-fee-collection-repository.ts` and `simulation-fee-statement-repository.ts` share SQL error mapping; a future focused change could reuse one bounded mapper to keep public errors consistent. Not part of this money change and not a blocker.

Complexity is limited to durable attempts, append-only state events and idempotent command receipts; each is needed to preserve reservations and unknown outcomes across retries. No generic payment orchestration or new worker framework was added.


Follow-up repair, 30 October 2026 (RED; router commits/pushes):

- Branch-own migration 0491 now derives a separate namespaced UUIDv8 for statement approval and refuses a replayed internal approval. A caller pre-claiming even the derived ID cannot bypass the current-source check. Collection-command replay still returns its own durable result before reaching this approval step.
- PostgreSQL regressions cover a current approval sharing the caller UUID, stale-source collisions with both the original and derived approval IDs, and the exact £282 collection → £250 refund due → £250 refunded → £32 retained journey. The latter uses genuine quote/variation, receipt/feed, allocation, attribution, posting and linked reversal writers. Fixture defaults preserve existing callers; no accounting rows are overridden.
- Edited only branch-own migration 0491; confirmed absent from local main with `git ls-tree main packages/db/migrations/0491_simulation_fee_collection.sql`. LP-0 and SERIOUS-B5 exact unions remain unchanged: this repair adds no routine, table, privilege, call or write target. The static catalogue test passes for both LP inventories.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — PASS.
- `node_modules/.bin/tsc -p /tmp/m4-12-s-collect-followup-tsconfig.json` — PASS; temporary config extends repository settings and includes all three affected integration/fixture files and their imports, with no emit.
- From `packages/db`: `node_modules/.bin/vitest run --maxWorkers=1 src/simulation-fee-collection-repository.test.ts test/simulation-fee-collection-catalog.test.ts` — 5 tests PASS.
- From `packages/db`: `node_modules/.bin/vitest list --maxWorkers=1 test/simulation-fee-collection.integration.test.ts` — all 11 tests discovered, including the four new cases. Discovery is not PostgreSQL execution.
- `node tools/plpgsql-case-in-if-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` — PASS.
- Existing `lanePathAllowed` against the union of the initial piece commit and this working diff — PASS, no missing or extra lane paths. `git diff --check` — PASS.
- PostgreSQL integration/upgrade, browser suites, whole-repository CI against current main and independent Claude RED review remain pending. No database/browser server was started and no git write command was run. Router owns commit, push, PR and review handoff.

Terminal-outcome follow-up, 30 October 2026 (RED; router commits/pushes):

- Session-facing application and repository reject `settle`/`fail` with `SUCCESS_FEE_FORBIDDEN`. OpenAPI and builder controls no longer offer either action. Redirect and unknown-outcome controls remain; refresh reads rail results.
- Branch-own migration 0491 checks `pg_has_role(session_user,'jobguard_migration','USAGE')` for terminal actions before looking up replay receipts. The SECURITY DEFINER owner and caller-supplied session/settings cannot promote a runtime login. Only the internal migration/operator connection can append terminal facts, still bound to the originating authenticated session/job and existing audit/idempotency/transition controls. No new grants, routines, roles, tables or write targets; both LP-0 inventories and SERIOUS-B5 exact unions are preserved unchanged. Migration 0491 is absent from local main (`git ls-tree main ...` returned no entry).
- Added application/repository regressions for both forbidden outcomes. PostgreSQL regressions explicitly exercise direct runtime SQL before and after operator reconciliation, with practice-material isolation set, and verify no settlement or release on refusal. Existing terminal-transition, duplicate/replay, refund-limit and GBP282/GBP250/GBP32 journey assertions are retained; terminal events now use the operator connection. Browser transport fixture receives the fake rail outcome outside builder POSTs, asserts no reconciliation buttons, then refreshes; all monetary assertions remain.
- Local installed-runner checks: DB Vitest `src/simulation-fee-collection-repository.test.ts test/simulation-fee-collection-catalog.test.ts --maxWorkers=1` — 7 PASS; API Vitest `src/success-fee.application.test.ts --maxWorkers=1` — 20 PASS; web Vitest `app/api/jobs/[id]/success-fees/collection/route.test.ts --maxWorkers=1` — 3 PASS. The catalogue check verifies both inventories against actual calls/writes; it is static validation.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`, API equivalent, and web equivalent with `--incremental false` — PASS. Temporary `/tmp/m4-12-s-collect-rail-tsconfig.json` extends repository settings and typechecks the integration suite and imports — PASS.
- `node --import tsx src/generate-openapi.ts` and `--check` from `apps/api` — PASS. PL/pgSQL CASE, money-arithmetic and commercial-boundary lints — PASS; `git diff --check` — PASS. Existing `lanePathAllowed` checked the complete piece diff from predecessor `cedb00ba`: exact 30-path union including its own lane, no missing/extra paths. No lane checks were weakened.
- Vitest list discovers all 13 PostgreSQL cases, including direct builder settle/fail refusal and the GBP282 journey. PostgreSQL integration/upgrade and browser execution were NOT RUN (sandbox cannot start PostgreSQL/bind localhost); required GitHub CI and fresh independent Claude RED review remain pending. No git write, provider or live-money action was performed.
