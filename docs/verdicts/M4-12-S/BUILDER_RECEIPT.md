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
