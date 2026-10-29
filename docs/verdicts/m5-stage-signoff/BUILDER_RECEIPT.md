# MON-5 M5-STAGE — RED builder receipt

29 October 2026. Synthetic only. Branch `codex/sandbox/m5-stage-signoff`, stacked on M5-SIGNIN (PR #423).

Implemented exact acknowledgement of an existing recorded completion. The customer reviews the completion/scope/time and finalized original evidence type, hash and immutable version; the server hashes this complete snapshot plus the acknowledgement statement. An acknowledgement never changes completion, invoice, payment, certification or waiver state.

Migration 0390 adds a private FORCE-RLS acknowledgement table, immutable-update/delete trigger and two routines. Only the identity login can execute the checked entrypoint; runtime/identity/infrastructure have no table grants. Existing source policies and runtime privileges are retained, with migration-owner SELECT-only source policies added. The writer reuses `identity.customer_portal_use` in the transaction, the completion advisory lock and upload lock; it checks current authority again after waiting. Commands bind to the exact job/completion/hash and serialize by command identity. Authenticated replay returns the original acknowledgement; changed payload, invalidated or superseded completion refuses. Later invalidation preserves history and displays fresh review required. A verified successor requires a new explicit acknowledgement.

The original sign-in application and customer guard are unchanged. A narrow stage-envelope guard delegates to that guard; both transports share the stage application and SQL authority check. New routes and malformed-JSON refusals are registered in the existing Next/Nest boundaries. LP-0, tenancy, entitlement, SERIOUS-B5 and sign-in successor expectations are additive. Shared route registry, app module, auth export and sign-in UI need small catch-up merges with sibling MON-5 slices; preserve all sibling additions.

## Local verification

- Installed TypeScript compiler: emitted core/config/storage/db/ai and API; API and web typechecks pass. No package installation.
- Installed Vitest runner from `apps/api`: `vitest run --maxWorkers=2 src/auth/customer-stages.test.ts src/auth/customer-signin.test.ts src/watchdog-registry.test.ts`: **160 passed**.
- After adding explicit malformed-JSON parity coverage, reran `vitest run --maxWorkers=1 src/auth/customer-stages.test.ts`: **11 passed**; API typecheck remains green.
- `node --import tsx src/generate-openapi.ts --check` from `apps/api`: pass after regenerating OpenAPI.
- `node tools/plpgsql-case-in-if-lint.mjs`, `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs`: pass (core reports its existing computed-import notices).
- Vitest collection confirms the new PostgreSQL tests; Playwright `test --list customer-signin.spec.ts` registers mobile/desktop journeys. Collection is not execution.
- LP-0 comparator unit suite: `vitest run --maxWorkers=1 test/lp-0-catalog.test.ts`: **27 passed**.
- Working-tree lane check using the existing lane validator exports: exact changed paths and migration ordering pass against the stacked sign-in parent. The default main comparison includes PR #423 parent changes and refuses those parent-owned paths, as expected; merge/rebase the parent before the standalone main-based lane CI. No parent path was added to this piece's allowlist.
- Initial runs needed generated workspace outputs; after local compilation the API suite passes. The machine's pnpm shim stalled before invoking its runner; stopped it and used the installed repository binaries directly.

## CI and review still required

The sandbox cannot start PostgreSQL or bind localhost. PostgreSQL integration/migration/catalogue tests and browser journeys were **not executed locally**. CI must run them and the required full checks. The PostgreSQL suite covers nonexistent/unverified/invalidated/superseded stages, altered hash, other job/customer/tenant, forged/revoked session, concurrent replay, invalidation while waiting, immutable history, RLS and privileges. Fixtures use live synthetic jobs and explicit tenant transactions, preserving the existing proof source guards. The browser journey reviews the exact version, acknowledges once, then shows retained history and fresh review after invalidation.

Requires one independent Claude RED review against the exact pushed head. No independent review, acceptance, merge or release is claimed. Live G1/D06 v2/D12 v3/provider gates remain closed. No real data, delivery, payment or provider was used. No new operational alert; public refusals retain existing redaction. No existing migration or stored format was edited. Roll forward with an additive correction; retain acknowledgement rows and snapshots.

## Initial review — discovered later

LATER / SIMPLICITY — `apps/api/src/auth/customer-stages.ts`: a future shared typed customer-scope adapter in the sign-in owner lane could replace parsing the already-verified cookie again here and in later portal slices. It would centralize the credential shape and reduce drift without weakening per-command database revalidation. It is outside this bounded piece and does not block it.
