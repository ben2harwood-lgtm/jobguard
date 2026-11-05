# M1-15S stored financial check (synthetic, dark)

`ShadowPilotFinancialReader.report(context, jobIds, observations, access)` is the
DB-backed report entry point. Tenant identity comes from `VerifiedTenantContext`.
It rejects supplied `financialEffects` and `financialRecord` fields and reads the
selected jobs and their books in one PostgreSQL statement/snapshot. No HTTP route,
screen, provider action or pilot activation is added.

The offline connection must already have the existing `jobguard_migration` role's
SELECT permissions. Builder runtime access stays denied. No new grants, routine,
stored table or migration is needed. Never attach migration credentials to a web
handler. Explicit tenant predicates supplement FORCE RLS; a privileged connection
alone does not demonstrate RLS isolation. The PostgreSQL test explicitly switches
to the non-superuser, non-BYPASSRLS migration role and also tests unfiltered reads.

The financial record binds the tenant, sorted complete requested job set, source
table, job and row IDs, per-row SHA-256 and aggregate SHA-256. Counts are derived
from these source rows: legacy `recovery_fee_journal` and current
`success_fee_journal` for accruals; `platform_fee_statement` for issued SME fee
documents; `platform_fee_attempt` for collection/refund attempts. All rows count,
including compensations, credit documents, pending, failed and refunded attempts;
there is no netting away earlier activity. Any source row makes report generation
refuse with its table, job and row ID. Missing/invisible requested jobs fail closed.
Customer invoices/payments and hypothetical illustrations are not platform fees.
Tenant-level subscriptions and contractor books are outside this SME job check.

The returned snapshot is cloned and frozen. Hashes bind reproducibility at read
time, not authenticity or absence of later writes. The pure core remains a
synthetic fixture seam: it validates the record shape, binding and digest, but a
hash is not a database signature. Operational callers must use the DB-backed
entry point and re-read for each report; no cached/caller financial claim is used.
Existing observation/measurement inputs remain synthetic fixture snapshots. This
change does not claim that human observations have been collected from storage.

The real pilot, G1, approved D12/D13 scope, fairness responses from people and
report review before G4-S remain OPEN. G0–G5 remain closed for this dark slice.
No human, legal or provider result or approval is supplied by this change.

Validation evidence belongs in the commit receipt. PostgreSQL integration tests
are written for CI; this sandbox cannot start PostgreSQL or bind localhost.

Landing preparation, 4 November 2026 (RED, NOPR): inspected the clean merge at
`a2876841b` against its merged `origin/main` base `155a3eb06`. No compatibility
code changes or migrations were needed. The lane contains exactly this slice's
eight non-lane paths; no other piece's lane is added relative to that base.

Local validation used Node 24.17.0 and installed Vitest 4.1.12, with explicit
`--maxWorkers=2` and at most three named files per invocation:

- Each of the seven workspace packages/apps passed its existing
  `node_modules/.bin/tsc -p <workspace>/tsconfig.json --noEmit` equivalent.
- Core `shadow-pilot-report.test.ts` and `shadow-pilot-measurement.test.ts`:
  47 tests passed.
- API `auth/context-boundary.test.ts` and `auth/identity.test.ts`: 152 tests
  passed; `watchdog-registry.test.ts`: 126 tests passed.
- DB `migration-proof-loader.test.ts`: 76 tests passed.
- `node tools/agent-lane-boundary-lint.mjs` and
  `git diff --check origin/main HEAD` passed.

The initial `pnpm typecheck` and filtered unit command stalled before starting
checks and were interrupted. Direct installed binaries completed the checks.
Initial guard imports lacked workspace `dist` outputs; compiling the existing
config, core, storage, DB and AI packages with their existing TypeScript configs
resolved those imports, and the affected guards then passed. No dependencies
were downloaded or test expectations changed.

CI must still prove PostgreSQL stored-row reads, gross accrual/invoice/collection
refusal and tenant isolation through `shadow-pilot-financial.integration.test.ts`,
plus the required full lint, test, build, migration and browser suites. No database
or browser was started locally. Independent RED review at the final head and
green CI remain required before landing; the real pilot and G4-S remain open.
