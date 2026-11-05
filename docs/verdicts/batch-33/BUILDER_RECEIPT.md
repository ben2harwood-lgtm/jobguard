# Batch 33: M2-1 practice order screen and M2-2 later delivery

READY for router staging and CI; RED. No PR, commit, push or index mutation performed.

## Scope and merge

Compared with incoming main `62081c68933d0b953e7dd75a8cbd7b3a2fb4f304` (MERGE_HEAD). Local `main` is older and is not the comparison baseline. Preserve the incoming main merge, then stage the resolved working files: the read-only index still reports conflicts until the router stages them.

M2-1 database behavior is wholly on main: purchase-order action, manual attestation, audit/replay, command registry and migration proof. Only its practice screen/API bridge and route classification remain here. M2-2 retains cumulative accepted/rejected quantities when recording later delivery and exposes later-delivered quantity, with regression coverage. Live merchant/intake routes remain gated by the plan; this is fictional practice only.

## Migration reconciliation

- Removed branch `0980_dark_merchant_order.sql`: byte-identical to main `0606_dark_merchant_order.sql`, 41,703 bytes, SHA-256 `4e4d32559295db2e10c8a0fa03e3986d49dcdd1c8263191731bd6a8630a2158f`.
- Removed its obsolete `0980` proof; retained main's exact `0606` proof (branch proof used a different migration name and upgrade row ordering).
- No branch-only migration notes remain. All migration SQL, proof and note paths now match incoming main. Nothing remains to number from 1200.
- No routine is re-created by this group. In particular main's latest `lp5_command_result`, including `purchase_order.send.dark`, remains untouched.
- Restored main's later-empty-tables, M2-1 migration proof test, plan-entitlement upgrade test and purchase-order action test verbatim; removed duplicate command keys from the merged registry, retaining only the new route classification.
- Scoped the browser test's edited order fields to `#purchase-orders`; no assertions removed or weakened.

## Validation

Executed the installed repository binaries directly; the global pnpm 11 launcher stalled before dispatch (three attempts interrupted), so no package installation or download was attempted.

- `packages/core: ./node_modules/.bin/tsc -p tsconfig.json`: PASS.
- `packages/config: ./node_modules/.bin/tsc -p tsconfig.json`: PASS.
- `packages/db: ./node_modules/.bin/tsc -p tsconfig.json`: PASS.
- `apps/web: ./node_modules/.bin/vitest run --maxWorkers=2 app/ui/merchant-order.test.ts app/ui/supplier-documents.test.tsx app/lib/merchant-order-server.test.mts`: PASS, 3 files / 10 tests.
- `packages/core: ./node_modules/.bin/vitest run --maxWorkers=2 src/watchdog.test.ts`: PASS, 1 file / 7 tests.
- `apps/api: ./node_modules/.bin/vitest run --maxWorkers=2 src/merchant-order.application.test.ts src/watchdog-registry.test.ts`: PASS, 2 files / 131 tests.
- `apps/api: ./node_modules/.bin/tsc -p tsconfig.json --noEmit`: PASS.
- `packages/db: ./node_modules/.bin/vitest run --maxWorkers=2 test/m2-1-migration-proof.test.ts test/migration-proof-loader.test.ts`: PASS, 2 files / 80 tests (source checks, no PostgreSQL).
- `apps/web: ./node_modules/.bin/tsc -p tsconfig.json --noEmit`: PASS.
- Total targeted Vitest result: 228 tests passed across 8 files; each invocation used at most 2 workers and 3 named files.
- `git diff --check MERGE_HEAD`: PASS. Exact lane-path comparison, marker scan, migration byte comparison and recursive proof row-order comparison: PASS.
- Source-inspected the React components using the React best-practices checklist: type-only client contract import, authenticated server bridge, event-driven requests, bounded busy controls and accessible status/error output retained. This is not an independent review.

No PostgreSQL instance or browser server was started. These source/unit checks do not prove database or browser behavior.

## Named holds for landing

- Router must stage conflict resolutions and removed duplicate files; .git is read-only here.
- Exact-head green CI: pinned install, typecheck, lint, test and production build. PostgreSQL integration/migration suites must establish fresh and upgrade success, unchanged command/replay/privilege guarantees, and supplier-documents cumulative quantity, replay, isolation and match allocations.
- Production-build browser CI must pass `M2-1-order-screen.spec.ts` and `M2-2-S.spec.ts` on phone and desktop, at most two workers. The earlier pre-check browser run never reached this code.
- One independent RED review at the exact final head before merge. No independent-review or live-provider claim is made here.

## Carried later points

Pre-check follow-ups remain outside this merge repair: merchant route error allow-list, deployed-origin verification, practice panel visibility outside synthetic mode, stale repository comment, and delivered/rejected quantity semantics. No live service or customer-data activation is authorized by this group.
