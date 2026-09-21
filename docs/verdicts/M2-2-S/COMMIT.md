# M2-2-S builder receipt

- Lane: `m2-2-s`
- Branch: `codex/m2-2-s`
- Base commit: `9a8241e224776b5a3263f76dc6a83192d4c65138`
- Builder verdict: implementation complete; independent verdict is still required and is not claimed here.
- Environment: `synthetic_demo`; generated text/PDF/image recipes and fixture-only mail alias; real embedded PostgreSQL 16; no mailbox, upload, OCR/AI, outbound provider, debt recognition, payment or fee.

## Contracts and invariants

Adds strict `supplier-document-intake.v1` and `goods-receipt.v1` boundaries through the shared Next/Nest application seam. Original content hashes and versions are append-only; multi-page children retain parent/page lineage. Duplicate bytes reuse one document identity and intake recognizes no debt. Invoice display numbers are constrained only by tenant, job, fictional supplier context and document type. Held fixtures retain explicit reasons. Goods receipts append and preserve ordered, delivered, accepted, rejected and missing quantities separately. All new tables are tenant/job-qualified, forced-RLS, migration-owned and runtime SELECT/INSERT-only. Intake and GRN mutations append audit events last in their transaction.

## Commands run

- `pnpm --filter './packages/*' build && cd apps/api && pnpm openapi:generate` — PASS; generated OpenAPI committed.
- `pnpm test` — PASS (including 139 DB tests and 252 core tests).
- `pnpm typecheck` — PASS.
- `LANE_BASE_REF=HEAD^ pnpm lint` — PASS, including the m2-2-s lane boundary.
- `pnpm test:db` — PASS (139 tests).
- `pnpm test:migrations` — PASS (11 tests).
- `pnpm openapi:check` — PASS.
- `pnpm build` — PASS.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/supplier-documents.integration.test.ts` — PASS (2 real-PostgreSQL tests).
- `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M2-2-S.spec.ts` — PASS (2 viewport tests; screenshots under ignored test results).
- `CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop` — PASS (140 tests against the production Next build).

## Migration

`0033_supplier_document_intake.sql` is expand-only. Originals, versions, intake attempts and GRNs are append-only; corrections roll forward as new versions/receipts. Catalog and runtime tests cover ownership, forced RLS, policies, grants, tenant denial and qualified foreign keys.

## Release gates

No gate was flipped. This is synthetic-only. Independent cross-model verdict and separate technical acceptance remain HOLD prerequisites under AGENTS §5.13.
