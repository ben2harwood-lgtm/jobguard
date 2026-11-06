# READY — LATER-SAFETY-28 landing catch-up (6 November 2026)

RED. Working files resolve the pending merge of main at 3f4fc1e95. Router must
stage the six resolved paths and finish the merge because .git is read-only here.
This handoff supersedes the historical ancestry/lane holds below. No Git write ran.

Main's migrations are all byte-identical. Main's latest three-argument routine is
0619_fee_store_authority.sql. Comparing its complete body to 0790 shows only the
inherited forward-payment checks, signed event-key checks and event audit additions;
no main lines are removed (apart from CREATE becoming CREATE OR REPLACE). Comparing
0790 to 0799 shows only the two invalid_text_representation handlers. No new
behaviour was added during this catch-up. Main's exact empty-table list already
contains this group's fixture-key row and both newly merged rows, so it is retained
unchanged. The lane now lists exactly all 11 changed paths from merged main outside
config/lanes, including inherited later-safety-14 files, and excludes itself.
The merged FEE-STORE-AUTHORITY receipt and all attack assertions are preserved.

Local checks using installed binaries, at most two Vitest workers and three named
files per run:
- apps/api: vitest run --maxWorkers=2 src/fee-collection/postgres-reservation-store.test.ts src/fee-collection/executor.test.ts src/fee-collection/fake-gocardless.test.ts — 118 passed.
- packages/db: vitest run --maxWorkers=2 test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts — 108 passed.
- Root: tsc -p apps/api/tsconfig.json --noEmit and tsc -p packages/db/tsconfig.json --noEmit — passed.
- packages/db: vitest list --maxWorkers=2 test/fee-reservation.integration.test.ts test/fee-reservation-archive-upgrade.integration.test.ts — 36 cases collected only.
- Money arithmetic, commercial boundary and PL/pgSQL CASE-in-IF lint — passed.
- Main migration byte comparison, exact lane membership and whitespace checks — passed.

CI must execute PostgreSQL/migration and all required suites after router push;
independent RED review must bind the final exact head. Database/browser execution
was not performed in this sandbox. No provider, real data, release or deployment.
The initial simplification observation remains in the inherited authority receipt;
no repeat review or new reporting machinery is introduced.

## Historical piece evidence

# LATER-SAFETY-28 — RED malformed synthetic fee proofs

0799 recreates the latest three-argument app.replace_fee_reservation_book body from 0790. The only body changes wrap each v_payload::jsonb cast in an invalid_text_representation handler and raise SQLSTATE 23514 with the existing path-specific refusal: authenticated fee result required, or authenticated fee event required. All other checks, signatures, grants, owners, RLS, table shapes and stored data remain identical. The explicit lp0, upgrade and tenancy proof sections are empty because no tracked catalog attributes or rows change. A source comparison verified exact predecessor-body preservation outside those two exception blocks.

The second reported fault is already fixed in the supplied later-safety-14 tip (154842328a6aee22baf2e90a936bd318deec28e6). The complete forged-release-history test already gives all four attacks their own withTenant transaction and exact 23514/42501 assertion, preserving its unchanged-history, blocked-second-collection and zero-release-audit checks. It is left unchanged by this piece. Removing any attack refusal permits that attack's own rejects assertion to fail; a later aborted-transaction error cannot satisfy the expected code.

The TypeScript store already maps 23514 to FeeCollectionError(COLLECTION_REFUSED), so no production TypeScript change is needed. Two additional adapter tests assert the actual error class and prove that one malformed signed synthetic store result does not abort the following valid item. The deterministic fake routine rejects before persistence; only the valid event fingerprint and settlement audit are saved. This is adapter-contract evidence, not a PostgreSQL execution claim or a live-provider protocol test.

Two real-PostgreSQL regressions target the attempt-change and event-only casts separately. Each reproduces 22P02 using the 0790 routine inside a rolled-back DDL transaction, then requires the installed forward routine to refuse the same signed malformed body with 23514 and the path-specific message. Raw book, complete archive and chained audit snapshots must remain identical, including after the predecessor reproduction. Each test uses an isolated fictional tenant; the fixture secret is synthetic only. The runtime still cannot read it.

Local verification (5 November 2026), using installed tools without downloads:
- node node_modules/typescript/bin/tsc -b packages/core packages/storage packages/db packages/config: passed.
- node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit: passed, including the changed API tests.
- In apps/api: node node_modules/vitest/vitest.mjs run --maxWorkers=2 src/fee-collection/postgres-reservation-store.test.ts src/fee-collection/executor.test.ts: 81 passed (17 store, 64 executor).
- In packages/db: node node_modules/vitest/vitest.mjs run --maxWorkers=2 test/migration-proof-loader.test.ts: 77 passed.
- Vitest list collected fee-reservation.integration.test.ts and fee-reservation-archive-upgrade.integration.test.ts, including both new regressions, without starting PostgreSQL.
- Money arithmetic, commercial boundary and PL/pgSQL CASE-in-IF lints passed. git diff --check passed. Exact source comparison confirmed inherited dependency files unchanged outside the two allowed test files; lane lists the five piece-owned paths and excludes itself.

Initial local test collection needed dependency builds. The first executed new batch test exposed a null proof on its final read; the test harness was corrected and the final named run passed. No real-PostgreSQL run or failing-first database execution is claimed locally: this environment cannot start PostgreSQL or bind localhost.

Named holds for landing:
- The final environment instructions forbid Git writes. Instead of the requested Git merge, the dependency delta from its merge base was applied with patch, preserving current-main changes and leaving Git metadata untouched. The router must reconcile/record the actual ancestry before committing; inherited files belong to #579/later-safety-14, not this piece. No fetch, commit, push or PR was performed here.
- Land/catch up after #579 and later-safety-14. Recheck that 0790 remains the latest routine body; renumber 0799 at landing by full filename stem only, keeping it later than the predecessor. Update the predecessor filename reference in the new regression if that stem is renumbered.
- The official lane checker refused its uncommitted/self-comparison range. Run it against the proper committed stacked base after the router records ancestry. No scanner, pin or allowance changes were made.
- CI must run the real PostgreSQL fee-reservation and unchanged archive-upgrade suites, fresh/upgrade migration and catalog/privilege/RLS checks, and all required checks. CI must demonstrate both predecessor 22P02 reproductions and post-migration 23514 refusals with unchanged history. Independent RED review at the exact final head and green CI remain required before merge.

Forward fix only: retain this migration and disable the dark executor if rollback is needed; repair through a later reviewed migration. No real rail, customer data, release or deployment is enabled. READY means ready for the router's NOPR handoff, not database-verified or merged.
