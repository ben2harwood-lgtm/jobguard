# UIWIRE-7 builder receipt

- Lane: `UIWIRE-7`
- Branch: `codex/sandbox/uiwire-7`
- Base commit: `b108bc2df43facad4332868d556ec37853ad362c`
- Builder verdict: implementation complete; independent verdict is still required and is not claimed here.
- Environment: `JOBGUARD_ENV=synthetic_demo`; generated 2×2 PNG originals; real PostgreSQL 16 embedded harness; no real provider, mail, HTTP, bank or payment client.

## Contracts and invariants

Adds strict `practice-proof-command.v1` actions and a read projection through the shared API application seam. All proof originals are runtime-generated synthetic images in an append-only, forced-RLS, tenant/job/scope-qualified table whose environment constraint rejects non-synthetic values. Finalization checks exact object version, hash, media type and complete image structure. Completion remains an operational command, is idempotent, records audit history, resolves only its matching proof Decision, and invalidation appends rework plus a fresh mandatory Decision without rewriting completion. Production seed refusal and all policy gates remain unchanged.

## Commands run

- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/evidence.integration.test.ts` — PASS (12 tests; real embedded PostgreSQL 16).
- `pnpm --filter @jobguard/api exec vitest run src/proof/proof.application.test.ts` — PASS (2 tests).
- `pnpm typecheck` — PASS.
- `pnpm turbo run lint` — PASS. Root `pnpm lint` requires a committed comparison range and was therefore deferred until after this receipt commit.
- `pnpm build` — PASS.
- `pnpm openapi:check` — PASS.
- `CI=1 pnpm --filter @jobguard/web exec playwright test --project=mobile-360 --project=desktop UIWIRE-7.spec.ts` — PASS (4 tests). Screenshots were generated under ignored `test-results/`; no binary was committed.

## Migration

`0024_uiwire7_synthetic_evidence_bytes.sql` is expand-only. Roll forward for corrections; registered evidence and completion/rework history are immutable. Catalog and runtime-role tests cover ownership, forced RLS, forbidden mutation and tenant/job/scope foreign keys.

## Release gates

No gate was flipped. Independent cross-model verdict and separate technical acceptance remain HOLD prerequisites under AGENTS §5.13.
