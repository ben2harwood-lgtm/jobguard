# READY — LATER-SAFETY-28 landing union (6 November 2026)

RED. Working files resolve the pending merge of origin/main at
46530fdbcfdcd693b91e80d1a8d0ead436d1f8e3. No new behaviour beyond the checked
malformed-proof fix. Router must stage resolutions and complete the merge;
.git is read-only here. No Git writes, push or PR were performed.

Migration comparison against main:
- 0790 was byte-identical to main's 0651; removed its SQL, note and proof.
- 0799 was renumbered by stem to 0656, for number-order landing.
- All 319 main migrations remain byte-identical. Main's latest three-argument
  replace_fee_reservation_book body is 0651. The complete 0656 definition differs
  only in its comment and the two reviewed invalid_text_representation handlers.
- No new table, grant, routine identity, owner, RLS policy or SET app.* clause.
- migfix-7 and plan-entitlement pin the complete 0656 body; predecessor regression
  reads main's 0651. All existing attack assertions remain intact.
- Both conflicted files retain main's content; archive-upgrade now equals main.
  The lane lists exactly seven changed paths outside config/lanes and excludes itself.

Local checks with installed tools (each Vitest invocation capped at two workers):
- API store, executor and fake-gocardless: 118 passed across three named files.
- DB migration-proof-loader and lp-0-catalog: 108 passed across two named files.
- API and DB TypeScript --noEmit: passed.
- DB reservation and archive-upgrade: 36 tests collected only.
- Money arithmetic, commercial boundary and PL/pgSQL CASE-in-IF lint: passed.
- Exact latest-body comparison, main migration byte preservation, working-tree
  lane membership and git diff --check: passed.
- Official lane lint executed and refused the unfinished merge's historical/index
  paths, including incoming main files. Do not widen the lane. Router must rerun
  after recording the merge ancestry and staging the final tree. pnpm's wrapper
  stalled; the installed node entry point produced this refusal directly.
- Initial root Vitest list used the wrong binary location and failed to load;
  corrected packages/db invocation collected all 36 cases successfully.

CI must prove real PostgreSQL fresh/upgrade, reservation/archive, migfix-7,
plan-entitlement and mandatory catalog/privilege/RLS checks, including predecessor
22P02 and new 23514 refusals with unchanged financial history and legitimate
webhook processing. Whole DB suite and browser suites were not run here: this
sandbox cannot start PostgreSQL or bind localhost. No web source changes over main.
Existing independent pre-check PASS covers 96712905, not this final tree; retain
that evidence and obtain the exact-head landing check and green CI before merge.
No provider, real data, money, release or deployment. READY is router handoff only.

The initial simplification observation stays in the inherited authority receipt;
no repeat review or additional reporting document is introduced. Historical holds
below describe earlier stages; this landing union supersedes their numbering and
ancestry instructions.

## Historical piece evidence

# LATER-SAFETY-28 — RED malformed synthetic fee proofs

0656 recreates the latest three-argument app.replace_fee_reservation_book body from 0651. The only body changes wrap each v_payload::jsonb cast in an invalid_text_representation handler and raise SQLSTATE 23514 with the existing path-specific refusal: authenticated fee result required, or authenticated fee event required. All other checks, signatures, grants, owners, RLS, table shapes and stored data remain identical. The explicit lp0, upgrade and tenancy proof sections are empty because no tracked catalog attributes or rows change. A source comparison verified exact predecessor-body preservation outside those two exception blocks.

The second reported fault is already fixed in the supplied later-safety-14 tip (154842328a6aee22baf2e90a936bd318deec28e6). The complete forged-release-history test already gives all four attacks their own withTenant transaction and exact 23514/42501 assertion, preserving its unchanged-history, blocked-second-collection and zero-release-audit checks. It is left unchanged by this piece. Removing any attack refusal permits that attack's own rejects assertion to fail; a later aborted-transaction error cannot satisfy the expected code.

The TypeScript store already maps 23514 to FeeCollectionError(COLLECTION_REFUSED), so no production TypeScript change is needed. Two additional adapter tests assert the actual error class and prove that one malformed signed synthetic store result does not abort the following valid item. The deterministic fake routine rejects before persistence; only the valid event fingerprint and settlement audit are saved. This is adapter-contract evidence, not a PostgreSQL execution claim or a live-provider protocol test.

Two real-PostgreSQL regressions target the attempt-change and event-only casts separately. Each reproduces 22P02 using the 0651 routine inside a rolled-back DDL transaction, then requires the installed forward routine to refuse the same signed malformed body with 23514 and the path-specific message. Raw book, complete archive and chained audit snapshots must remain identical, including after the predecessor reproduction. Each test uses an isolated fictional tenant; the fixture secret is synthetic only. The runtime still cannot read it.

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
- Land/catch up after #579 and later-safety-14. Recheck that 0651 remains the latest routine body; renumber 0656 at landing by full filename stem only, keeping it later than the predecessor. Update the predecessor filename reference in the new regression if that stem is renumbered.
- The official lane checker refused its uncommitted/self-comparison range. Run it against the proper committed stacked base after the router records ancestry. No scanner, pin or allowance changes were made.
- CI must run the real PostgreSQL fee-reservation and unchanged archive-upgrade suites, fresh/upgrade migration and catalog/privilege/RLS checks, and all required checks. CI must demonstrate both predecessor 22P02 reproductions and post-migration 23514 refusals with unchanged history. Independent RED review at the exact final head and green CI remain required before merge.

Forward fix only: retain this migration and disable the dark executor if rollback is needed; repair through a later reviewed migration. No real rail, customer data, release or deployment is enabled. READY means ready for the router's NOPR handoff, not database-verified or merged.
