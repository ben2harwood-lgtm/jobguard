Built by Claude Sonnet 5.5, 18 October 2026. No independent review yet; no acceptance claimed.

# M3-3 builder receipt - partial (pure policy slice), lane RED

Base origin/main dc835c9a. M3-1 (#224) and M3-2 (#227) are merged as named partials; their holds are inherited.
New files: `packages/core/src/sync-download.ts`, `.test.ts`, the contract, ledger, this receipt, `config/lanes/m3-3.json`.
Changed: `packages/core/src/index.ts` (one export line). New GRANTs: NONE. No migration.

Tests first: with the test file present and the module absent, `vitest run src/sync-download.test.ts` failed
(file failed to load, no tests). After the module: 9 passed. Two assertions were later corrected in the test file
itself (a too-weak canary value and a regex that matched the claim name); the code did not change for them.
Not run: PostgreSQL, browser, provider engine (none exists/selected), whole-repo suites (CI).
