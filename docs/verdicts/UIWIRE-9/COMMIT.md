# UIWIRE-9 builder receipt

- Lane: `UIWIRE-9`
- Branch: `codex/sandbox/uiwire-9`
- Base: supplied repository snapshot (no local `main` ref was present).
- Review: builder implementation only; independent cross-model verdict and separate technical acceptance remain **HOLD**.

## Contracts and invariants

Adds strict `final-account.assemble.v1` and `final-account-response.v1` boundaries through the shared Nest/Next application seam. The authoritative PostgreSQL projection contains frozen accepted quote lines, exact approved variation revisions, exact evidence versions, pending changes, findings, revision and deterministic source hash. Rebuilds never read mutable working-scope prices. No provider, send, invoice, journal, charge or external action is introduced.

## Environment and commands

- Synthetic `core-1000` fixture; generated evidence only; real embedded PostgreSQL harness; no provider credentials.
- `pnpm --filter @jobguard/api openapi:generate` — PASS after building workspace dependencies; `apps/api/openapi.json` committed.
- `pnpm --filter @jobguard/api test` — PASS (7 files, 23 tests, OpenAPI check).
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/final-account.integration.test.ts` — PASS (3 real-PostgreSQL tests).
- `pnpm typecheck` — PASS (7 packages).
- `pnpm lint` — HOLD: lane checker requires an unavailable local comparison base (`main` is absent); core purity passed.
- `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop UIWIRE-9.spec.ts` — browser dependencies were installed; initial runs exposed and fixed loading/re-entry synchronization. Final result recorded in the PR receipt.

## Migrations and release gates

No migration was added; the existing immutable final-account schema and forced-RLS policies are reused. No release gate was changed. D02/D06/G1 and independent verdict/acceptance remain pending.
