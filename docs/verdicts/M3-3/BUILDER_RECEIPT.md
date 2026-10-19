Built by Claude Sonnet 5.5, 18 October 2026. No independent review yet; no acceptance claimed.

# M3-3 builder receipt - partial (pure policy slice), lane RED

Base origin/main dc835c9a. M3-1 (#224) and M3-2 (#227) are merged as named partials; their holds are inherited.
New files: `packages/core/src/sync-download.ts`, `.test.ts`, the contract, ledger, this receipt, `config/lanes/m3-3.json`.
Changed: `packages/core/src/index.ts` (one export line). New GRANTs: NONE. No migration.

Tests first: with the test file present and the module absent, `vitest run src/sync-download.test.ts` failed
(file failed to load, no tests). After the module: 9 passed. Two assertions were later corrected in the test file
itself (a too-weak canary value and a regex that matched the claim name); the code did not change for them.
Not run: PostgreSQL, browser, provider engine (none exists/selected), whole-repo suites (CI).

## Repair round 1 (after two Opus FAIL verdicts on 199fd61d)
Fixed: cross-tenant test now uses an assigned id on a T2 row plus a same-id T1/T2 pair; with the tenant clause deleted, S03 fails (checked, then restored).
Missing/undefined/malformed authority is `authority_required` with cleanup required. Duplicate permitted jobIds refuse as `source_invalid`; reconcile dedupes delivered.
`source_invalid` carries `admittedJobIds` and cleanup required, so removed assignments are still tombstoned. `iat`/`exp` are seconds. Decisions are consistency-checked at the reconcile boundary.
Core suite (2 workers) 2914 passed; core typecheck clean.
Stage-end sweep (not fixed): token lifetime upper bound and no "now" check; lower-case id normalisation; inherited-property reads in Zod; exact-multiple paging boundary test; keyset convergence rule for the provider slice.
