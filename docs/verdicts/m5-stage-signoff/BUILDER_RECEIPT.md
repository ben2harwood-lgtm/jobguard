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

## NOPR catch-up — 1 November 2026

Resolved working-tree conflicts against the launcher's fetched main `e9d6c8b2bec984fb2edc604a1fe90005e67e7f0f` (matches MERGE_HEAD). Preserved customer variation routes, controllers, guards, OpenAPI entries, sign-in links, proxy restrictions, route classifications and shared upgrade expectations alongside stage signoff. Retained main's Next `proxy.ts` convention. No new product behavior, main migration edits, fetch, git-index writes, commit, push or PR creation.

Renamed only the migration stem to `0571_customer_stage_acknowledgement`; SQL bytes match the branch's original migration (SHA-256 `78d27fa4ee3e093fbee56f56ed55f6216a96305b9be878b85f9e4197a6e3fc99`). Added its strict proof fragment with seven LP-0 additions, explicit upgrade rows/routines/relations/policies and tenant posture. Moved stage allowances out of shared LP-0/tenancy/upgrade baselines into that fragment so they apply once. The fragment explicitly names PostgreSQL's 63-byte generated unique-index identity. Updated test lookup and lane paths; lane lists exactly the resulting changed paths. Protected `docs/contracts/lp-downstream-effects-v1.md` remains byte-identical to main.

Checks actually run in this catch-up:

- Existing installed `tsc -p tsconfig.json` in core, config, storage, db and ai: pass; API emit: pass. API and web `tsc -p tsconfig.json --noEmit`: pass.
- From `apps/api`, installed Vitest `run --maxWorkers=2 src/auth/customer-stages.test.ts src/auth/customer-signin.test.ts src/watchdog-registry.test.ts`: **163 passed**. `run --maxWorkers=2 src/auth/customer-variation.test.ts`: **13 passed**. Initial registry/variation failures came from stale compiled package exports; regenerated existing outputs, then reran successfully.
- From `apps/api`, `node --import tsx src/generate-openapi.ts --check`: pass after rebuilding workspace outputs.
- From `packages/db`, installed Vitest `run --maxWorkers=1 test/migration-proof-loader.test.ts -t '^(?!.*zero fragments)'`: **25 passed, one filtered**. The filtered test loads the complete migration registry and encounters main's known missing 0510 proof; that gap remains outside this piece.
- Isolated `loadMigrationProofs` using the committed legacy names plus 0571: schema validation, combined LP-0 parsing, upgrade projection (two routines/four relations/five policies) and tenancy projection pass. This validates proof structure and composition, not PostgreSQL catalogue execution.
- Working-tree paths checked through existing lane-validator exports: **25 changed paths**, no missing/extra lane allowance; migration order passes. `git diff --check`, PL/pgSQL CASE-in-IF lint and commercial-boundary lint: pass. All 13 conflict files have no remaining conflict markers.

READY for router staging and commit, NOPR. The index still has unmerged entries because `.git` is read-only here; the router must stage the resolved content and migration rename. PostgreSQL and browser suites remain for GitHub CI; the entire PostgreSQL suite and one independent exact-head RED review are required before merge. No stalled checks remain. No independent review or merge is claimed.

## m5-journey step 2 — union merge, 2 November 2026

Resolved all 11 working-tree conflict files as the union of the quote/message and stage-signoff sides. Retained every controller, provider, portal route, customer guard/session boundary, generic parser refusal, sign-in action, watchdog classification and upgrade expectation. Added no journey implementation. The combined browser test retains the stage link before leaving sign-in and follows that same URL after quote acceptance, since a fresh sign-in render clears the component's local job state; all quote, message and stage assertions remain.

Deterministic preservation checks confirm every OpenAPI route definition and every watchdog source line from both index sides is retained. SHA-256 comparisons against pre-edit bytes confirm migrations 0570, 0571 and 0572, their three proofs and `docs/contracts/lp-downstream-effects-v1.md` are unchanged. All 11 conflict files are free of merge markers; `git diff --check` passes.

Checks actually run using installed repository tools, without package downloads:

- Sequential `tsc -p tsconfig.json` in core/config/storage/db/ai and API: pass. API and web `tsc -p tsconfig.json --noEmit`: pass.
- API Vitest `run --maxWorkers=2 src/auth/customer-stages.test.ts src/auth/customer-signin.test.ts src/watchdog-registry.test.ts`: 178 passed after rebuilding stale compiled workspace outputs. The initial run had four failures from missing compiled stage exports/classifications; the successful rerun uses the merged outputs.
- API Vitest `run --maxWorkers=2 src/auth/customer-quote.test.ts src/auth/customer-message.test.ts src/auth/customer-variation.test.ts`: 33 passed.
- Web Vitest `run --maxWorkers=2 proxy.test.ts`: 33 passed.
- API `node --import tsx src/generate-openapi.ts --check`: pass.
- `turbo run typecheck --concurrency=2` stalled invoking pnpm after two cached checks and was stopped; the installed compiler checks above passed directly.

READY for router staging/commit, NOPR. RED: sign-in/session and customer authority boundaries. No git writes, fetch, commit, push or PR operations were run. The index remains unmerged until the router stages these resolutions. PostgreSQL and browser execution remain for GitHub CI; no independent review, merge or release is claimed.
