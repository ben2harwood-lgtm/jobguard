# M4-17-S — RED builder receipt

Latest scoped handoff (31 October): ready for coordinator PostgreSQL validation on `codex/sandbox/m4-17-s-run`, caught up through incoming `18ed3f74`; retained migrations 0489 and 0492 await router renumbering at merge. The earlier blocked catch-up findings are superseded by the reconciliation below. Router owns commit/push/PR and the independent Claude review. This receipt is implementation evidence, not independent acceptance.

Implemented server-gathered immutable reconciliation snapshots, authenticated replay/read, exact-source review acknowledgement, checkpoint hash verification and paused checkpoint restoration. Reports label the customer, success-fee and subscription books separately, retain specific difference rows and do not mutate their sources. Workspace UI and route expose the run and review actions. No provider adapters or external actions exist in this change. The existing 0374 subscription issuer and every predecessor migration are unchanged. LP inventories and the tenancy/SERIOUS-B5/entitlement expectation sets are extended for exactly the installed objects.

The deliberately small design stores one canonical source snapshot, rather than a second writable balance ledger or adjustment executor. Reports and report hashes are rebuilt deterministically from the saved rows. The coarse source table fence is synthetic-only and deliberately makes no production throughput claim.

## Target journey remains incomplete at the statement-source adapter

Repair 1 incorporates the coordinator's merged 0489 compensation and 0491 collection fixes. The original missing-compensation diagnosis is superseded: 0489 now posts linked negative journals. No routine is defined in more than one of 0489, 0490, 0491 and 0492. In particular, `write_success_fee_v3`, `check_success_fee_journal` and `check_success_fee_derivation` retain their latest 0489 definitions through 0492. No later stale body replaces them.

The remaining step is the current withheld-payment source adapter for 0490's `platform_fee_statement_sources`. That routine expects `assessmentId` catch sources, while the latest writer emits `recoveryAllocationId` withheld-payment sources. 0492 now names `withheld_payment_statement_source_adapter` as an explicit unavailable dependency before attempting the catch loader. It does not manufacture an assessment, reuse stale posted eligibility or invent collection/refund facts. The PostgreSQL regression drives the real recovery fixture through both allocations, reversal and approved compensation, asserts £32 posted and zero external actions, and asserts `Review needed` plus that exact remaining dependency. It does not assert £250 refunded, £288 or zero differences without their chain.

The recovery fixture uses genuine writers but includes prerequisite F5 activity; it is not the complete fresh £18,800 demo. The complete target journey, adapter integration and physical PostgreSQL restore remain unverified. Checkpoint restoration here verifies saved reconciliation rows and starts that run paused; it is not an application-wide payment kill switch.

## Repair 1 changes

Copied the exact `success_fee_tenant` policy line from 0491 into 0492. Scanned every dynamic SQL format string in 0492; the new static regression decodes those strings and checks the full policy expression, including the empty-string `nullif` arguments and quoted setting/type literals. No other malformed format-string quoting was found. No predecessor migration on main was edited.

The journal duplicate key now uses its validated `side`, with a test proving distinct debit/credit rows without optional account metadata are not classified as duplicates. LP-0 has no new routines, calls, writes or grants to union in this repair; both recorded inventories still match the actual migration scan. Existing policy metadata now describes the repaired identical predecessor policy.

## Validation

Local results (Node v24.17.0, installed dependencies; direct repository `.bin` runners after the pnpm launcher stalled and was stopped):

- `packages/core/node_modules/.bin/vitest run --maxWorkers=1 src/simulation-money-run.test.ts src/simulation-fee-collection.test.ts src/simulation-fee-statement.test.ts` from packages/core: 62 passed.
- `packages/db/node_modules/.bin/vitest run --maxWorkers=1 src/simulation-money-run-repository.test.ts test/simulation-money-run-catalog.test.ts test/lp-0-catalog.test.ts` from packages/db: 32 passed. These are unit/static checks, not PostgreSQL execution.
- `apps/api/node_modules/.bin/vitest run --maxWorkers=1 src/success-fee.application.test.ts` from apps/api: 19 passed.
- `apps/web/node_modules/.bin/vitest run --maxWorkers=1 'app/api/jobs/[id]/success-fees/money-check/route.test.ts' 'app/api/jobs/[id]/success-fees/collection/route.test.ts'` from apps/web: 5 passed.
- Root `./node_modules/.bin/tsc -p <package>/tsconfig.json --noEmit`: core, db, API and web passed. The standard TypeScript builds for core, storage, db, config, AI and API were also run to supply workspace import artifacts. Initial API/web/static test imports failed before those local artifacts existed, then passed after the normal builds; no aliases or checks were changed.
- `git diff --check`: passed. A read-only diff/untracked-path comparison verifies the lane lists exactly this change's paths (own lane implicitly owned).
- `node tools/lint.mjs`: core purity passed. Lane lint remains blocked against current main because this built-ahead branch carries the unmerged predecessor changes outside this piece's lane. The configured base is currently identical to HEAD, so forcing that comparison would be refused by the existing checker. The router must re-run the unchanged lane check after the base merges; the lane was not expanded to claim inherited changes. No full lint/CI success is claimed.

PostgreSQL, upgrade, tenant/catalog integration and browser suites are authored for GitHub CI because this sandbox cannot start PostgreSQL or bind localhost. The browser test is a transport/render test using synthetic responses, not a completed persisted recovery journey. New SQL integration tests exercise actual source collection, replay, cross-job/tenant access, audit rollback, stale restore/review, unknown collections, and incoming feed anomalies through the existing fake producer. A genuine predecessor upgrade test is included. No independent RED review has occurred.

No package downloads, git writes, live provider calls, real data or real money were used. No CI, database, browser, physical-restore or release pass is claimed.

## Repair 1 validation

- Installed core Vitest runner, `--maxWorkers=1 src/simulation-money-run.test.ts`: 10 passed.
- Installed DB Vitest runner, `--maxWorkers=1 test/simulation-money-run-catalog.test.ts src/simulation-money-run-repository.test.ts test/lp-0-catalog.test.ts`: 34 passed, including the quoting and migration-order regressions. These are static/unit checks, not PostgreSQL execution.
- `./node_modules/.bin/tsc -p packages/core/tsconfig.json`, `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`, and `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`: passed after the dependency-union narrowing fix. `git diff --check`: passed.
- PostgreSQL suites, including the added real compensation/incomplete-adapter regression, remain CI-only. No database, browser, complete target journey or renewed independent RED-review pass is claimed.

## 31 October catch-up: contents resolved, not ready to commit

This section supersedes the earlier current-state claims for the new incoming
M4-12-S head `18ed3f74`. No DEMO-S or ENT-11b journey pass is claimed.

All ten conflicted file contents are resolved. The M4-9-S receipt and contract
and M4-10-S migration 0490 match incoming exactly, including `v_source_hash`,
`s.` aliases and the private source fence. API collection schema validation and
session refusal of fake-rail settle/fail survive alongside M4-17-S's method and
authorization test. Core exports include both incoming and reconciliation.
Tenancy and entitlement expectations union only the two reconciliation tables;
the tenancy lists are in PostgreSQL byte order (review before run).

Both LP snapshots start from incoming and add only this piece's three capability
entries, two routine records, two policies and two triggers. Every incoming row
and all other metadata remain unchanged. No stale owner entry for
`lock_success_fee_sources` is added. The private helper call is recorded only in
this piece's routine's staticCalls. Its two definitionSha256 values remain null;
capture the exact PostgreSQL definitions after the migration run. The downstream
snapshot deliberately omits later dependency objects: this piece's scanner uses
the live inventory's routine-name set while still checking both snapshots'
actual own calls/writes, without copying dependency rows into the frozen snapshot.

0492 delegates the protected source lock batch to incoming's private
`app.lock_success_fee_sources()` after the closed availability/input checks and
before advisory/audit locks. Its remaining public source fences are retained.
The runtime routine body contains no executable-shadow-helper catalogue pattern;
a static regression checks that boundary and the lock position. JSON extraction
expressions are bracketed. No main migration was edited.

Two unresolved findings prevent a ready commit:

1. Branch history includes 0489 and related compensation/schema/test changes
   merged from `m4-9-s-compensate`. Incoming 18ed3f74 does not contain them.
   0489 replaces the reviewed 0406 writer and its two guards and directly locks
   shadow tables in its runtime-executable writer, undoing incoming's boundary.
   The incoming-first rule and preserving this inherited compensation behavior
   cannot both hold. These files are left untouched pending the coordinator's
   answer on archiving the stale M4-9-S additions versus retaining/holding them.
   The earlier receipt's description of 0489 as merged is not a current-main claim.
2. The unchanged incoming `simulation-fee-collection-catalog.test.ts` fails its
   downstream staticCalls comparison: `platform_fee_statement_sources` is recorded
   as a 0491 call, but the frozen snapshot intentionally excludes 0490 routines,
   so its known-name set omits that call. The test is byte-identical to incoming.
   It was not weakened and dependency inventory rows were not copied across.

Local validation with installed runners, at most two workers:

- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=2 test/simulation-money-run-catalog.test.ts src/simulation-money-run-repository.test.ts test/lp-0-catalog.test.ts`: 34 passed. The final parenthesis-only SQL edit was followed by a separate rerun of simulation-money-run-catalog.test.ts: 3 passed.
- From packages/core: `./node_modules/.bin/vitest run --maxWorkers=2 src/simulation-money-run.test.ts src/simulation-fee-collection.test.ts src/simulation-fee-statement.test.ts`: 64 passed.
- From apps/api: `./node_modules/.bin/vitest run --maxWorkers=2 src/success-fee.application.test.ts`: 21 passed.
- From apps/web: `./node_modules/.bin/vitest run --maxWorkers=2 'app/api/jobs/[id]/success-fees/money-check/route.test.ts' 'app/api/jobs/[id]/success-fees/collection/route.test.ts'`: 5 passed.
- From packages/db: the three money-run/statement/collection catalogue files: 5 passed, 1 failed with finding 2 above; money-run and statement passed.
- Root installed `tsc -p <path>/tsconfig.json --noEmit` for packages/core, packages/db and apps/api: passed.
- Read-only assertions: both snapshots preserve every incoming row and metadata with only own additions; no stale lock-helper owner entry; tenancy arrays equal the byte-ordered incoming/own union; incoming-owned receipt/contract/0490 exact; no listed reserved-word declaration in 0492. `git diff --check`: passed.

PostgreSQL, browser journeys, CI and independent RED review remain for the
coordinator/reviewer. No git write was performed, so the index still contains
unmerged stages until the router stages the resolved contents. The requested
commit-message file says `do not commit` with these blockers.

## 31 October coordinator-authorized reconciliation: ready for PostgreSQL validation

The coordinator explicitly directed retaining and reconciling 0489 and repairing
the downstream snapshot. This supersedes both blockers in the preceding section.
It is a scoped code handoff, not a DEMO-S or ENT-11b journey pass.

0489 now extends the reviewed 0405 guards and 0406 writer with the retained
withheld-payment qualification and linked compensation. Read-only comparison
verified those base files are byte-identical to origin/main. The new catalogue
regression compares the authentication/validation prefix and the complete
case-lock, replay and catch-source path against 0406, allowing only JSON
parentheses. The sole stale source-fence hunk was replaced by the reviewed
`PERFORM app.lock_success_fee_sources()` at the same lock-order position.
Additional locks cover only the existing compensation source adapter. No public
writer locks protected shadow tables directly. Existing compensation schemas,
proof/allocator checks, cumulative arithmetic, source limits, original-journal
bounds, signed authorizations, replay and audit behavior remain. No schema or
compensation test was removed, and 0489's number is unchanged. All SQL string
literals are unchanged. JSON extractions and the source-membership predicate
are bracketed; no reserved identifier or function-prefixed local is introduced.

The unchanged collection catalogue test exposed three missing called dependency
records in the downstream snapshot: `platform_fee_statement_sources`,
`write_platform_fee_statement` and `lock_success_fee_sources`. Their exact live
routine records are now included. The two retained compensation guards are also
recorded, and the existing `write_success_fee_v3` record now has its actual final
0489 calls/writes in both inventories. The original M4-17-S records remain.
No grants, table capabilities or lock-helper owner entry are added. The separate
statement snapshot test now asserts exactly the two called 0490 routine records,
the source helper's private/invoker status and the continued absence of statement
capability entries, table policies and triggers. The collection test itself is
byte-identical to incoming and passes.

Regenerated `lp-downstream-effects-v1.md` using the existing Python tool, then
ran its `--check`. Relative to the prior generated file, added relation rows are
platform_fee_attempt, platform_fee_attempt_event, platform_fee_collection_command,
simulation_money_review and simulation_money_run. Added routine rows are
check_success_fee_derivation, check_success_fee_journal, lock_success_fee_sources,
platform_fee_statement_sources, read_platform_fee_collection,
simulation_money_run, simulation_money_sources, write_platform_fee_collection
and write_platform_fee_statement. The write_success_fee_v3 row is refreshed.
These include the previously unregenerated M4-12-S/M4-17-S snapshot rows; no
unrelated source cutoff, generator rule or authority group changed.

Routine definitionSha256 is null, never a digest of raw migration text. Existing
live rows already had null values. Both snapshots explicitly record the final
0489 routines with null digests pending the coordinator's PostgreSQL capture.
Capture SHA-256 over UTF-8 pg_get_functiondef, as packages/db/test/lp-0-catalog.ts
does, for write_success_fee_v3(uuid,text,jsonb,jsonb), check_success_fee_journal(),
check_success_fee_derivation(), simulation_money_run(uuid,text,jsonb) and
simulation_money_sources(uuid,uuid,uuid). No PostgreSQL result is fabricated.

Checks run after this reconciliation (installed runners; Vitest maxWorkers=2):

- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=2 test/success-fee-recovery-compensation-catalog.test.ts test/simulation-fee-collection-catalog.test.ts test/simulation-fee-statement-catalog.test.ts`: 5 passed. A final rerun of the compensation catalogue after the source-membership parentheses: 2 passed.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=2 test/simulation-money-run-catalog.test.ts src/simulation-money-run-repository.test.ts test/lp-0-catalog.test.ts`: 34 passed.
- From packages/core: `./node_modules/.bin/vitest run --maxWorkers=2 src/success-fee-catch-posting.test.ts src/simulation-money-run.test.ts src/simulation-fee-collection.test.ts`: 19 passed, including signed compensation/zero/unlinked-negative validation.
- Root `python3 tools/lp-downstream-inventory.py` and `python3 tools/lp-downstream-inventory.py --check`: passed; syntax compilation to /tmp passed.
- Root `node --test tools/lp-downstream-inventory.test.mjs`: 5 passed.
- Root `node tools/plpgsql-case-in-if-lint.mjs`: 170 migrations passed, no historical exceptions.
- Read-only assertions: incoming collection test/0490/receipt/contract and main 0405/0406 unchanged; 0489 string literals unchanged; reserved identifiers absent; no function-prefixed locals; `git diff --check`: passed.

The coordinator runs PostgreSQL next, including compensation/reversal/replay,
upgrade, tenant/grant, shadow catalogue and money-run suites. Independent RED
review and CI remain gates. The withheld-payment statement adapter and full
recovery-18800 target were not added by this repair and remain journey work.
No database, browser, full journey, restore or release pass is claimed. No git
write occurred; router staging still resolves the index's unmerged entries.


## 1 November C261 main catch-up: READY for router staging and CI

Plan piece: M4-17-S-RUN-CATCHUP, RED. This section supersedes the historical
catch-up status above. The router had already started merging origin/main
`c6d3c2d8da709c40de428c77c24f7ef2eb01ff9f` (also MERGE_HEAD). No fetch or git
write was run here; the router must stage the resolved files and renames to
clear the index's unmerged stages and finish its merge.

Resolved the three working-file conflicts by retaining the money-check panel
and main's labelled statement error, both DB exports, and the exact main/branch
union of LP-0 capability entries. Main's tenancy, B5 and entitlement additions
remain, including byte-identical mobileAuthStoreAdditions and
keyRegistryAdditions helpers and their single invocations. Relative to main,
these lists add only this piece's existing two reconciliation tables and helper.
No test assertion or product behaviour was changed.

Main's 0509_simulation_fee_collection replaces the branch's duplicate 0519 copy.
The two remaining branch migrations retain their existing order:

- 0521_simulation_money_trail_run -> 0515_simulation_money_trail_run
- 0522_success_fee_recovery_compensation -> 0516_success_fee_recovery_compensation

Only full migration filename stems were replaced in references and lane files;
no bare-number substitution was used. Read-only assertions prove both renamed
SQL files equal their original HEAD bytes and all 174 main migrations remain
byte-identical. Reservations 0510–0514 were not used. The existing generated
lp-downstream-effects-v1.md contained five collection rows absent from the merged
frozen snapshot; regeneration with the unchanged generator removes those stale
document rows, preserving main's snapshot boundary without adding inventory facts.
The initial generator check and three of its five Node tests failed on that stale
document; all passed after regeneration.

Validation used installed runners, no downloads, at most two workers and at most
three named Vitest files per invocation:

- packages/db: vitest run --maxWorkers=2 test/lp-0-catalog.test.ts test/simulation-money-run-catalog.test.ts src/simulation-money-run-repository.test.ts — 35 passed.
- packages/db: vitest run --maxWorkers=2 test/success-fee-recovery-compensation-catalog.test.ts test/simulation-fee-collection-catalog.test.ts test/simulation-fee-statement-catalog.test.ts — 6 passed.
- packages/db: vitest run --maxWorkers=2 src/migrate-discovery.test.ts test/audit-export-privilege-comparator.test.ts src/stored-receipt-migration.test.ts — 23 passed.
- packages/core: vitest run --maxWorkers=2 src/simulation-money-run.test.ts src/success-fee-catch-posting.test.ts src/simulation-fee-collection.test.ts — 20 passed.
- apps/api: vitest run --maxWorkers=2 src/success-fee.application.test.ts — 21 passed.
- apps/web: vitest run --maxWorkers=2 'app/api/jobs/[id]/success-fees/money-check/route.test.ts' 'app/api/jobs/[id]/success-fees/collection/route.test.ts' app/ui/simulation-fee-statements.test.ts — 12 passed.
- Root installed tsc -p <package>/tsconfig.json --noEmit, with at most two processes: core, storage, config, AI, DB, API and web all passed. The pnpm --version shim stalled and was interrupted; no pnpm suite pass is claimed.
- python3 tools/lp-downstream-inventory.py --check — passed after regeneration.
- node --test tools/lp-downstream-inventory.test.mjs — 5 passed after regeneration.
- node tools/plpgsql-case-in-if-lint.mjs — 176 migrations passed, zero historical exceptions.
- git diff --check and git diff --cached --check — passed. The index remains router-owned.

These are deterministic local checks, not independent review. PostgreSQL and
browser suites cannot run in this sandbox and remain for GitHub CI after the
router commits and pushes. No journey, CI, database, independent RED review,
restore, provider, real-money or release pass is claimed.


## 1 November PR #500 RED-failure repair at 77f0c43f

READY for router commit/push and PostgreSQL CI; no renewed independent PASS
or real-PostgreSQL success is claimed. Scope is the three reported failures.

1. Renamed only the withheld-payment terms authorization alias in 0516 from
   `a` to `terms_auth`. The writer declares `a record` for catch attribution,
   so qualifying `a.tenant_id` was ambiguous in PL/pgSQL. The terms membership,
   authorization identity and revocation predicates are unchanged. The existing
   compensation catalogue test now also rejects that conflicting writer alias.
2. Corrected successFeeCatchAdditions' exact index list: remove the journal's
   former derivation UNIQUE index and include both new partial journal indexes
   and both source allocation UNIQUE indexes, including PostgreSQL's truncated
   recovery-allocation name. The test still compares the full catalogue exactly;
   no assertion was skipped or loosened. Static checks agree with 0516's DDL
   and the requested names. A fresh real-schema diff remains CI-only here.
3. Removed only the stale simulation_money_sources owner capability from the
   live LP-0 inventory and its recorded downstream input. deriveFacts in
   test/lp-0-catalog.ts emits a routine owner fact only if another principal has
   an ACL or the owner differs from the schema owner. This helper has neither:
   it belongs to jobguard_migration (also app's owner), with every non-owner
   grant revoked by 0515. Its recorded private routine facts remain unchanged.
   No grants, exposure, comparator or inventory format changed. The unchanged
   downstream generator check still passes without regenerating the document.

Available origin/main is c6d3c2d8; it contains no migration-proofs directory or
#499 proof system. Therefore the requested existing B5 and inventory corrections
were used. No new merge conflicts were present. All 174 main SQL migrations
remain byte-identical; 0516 is not on that main ref. No fetch or git write ran.

Checks actually run with installed dependencies:

- From packages/db: ./node_modules/.bin/vitest run --maxWorkers=2 test/success-fee-recovery-compensation-catalog.test.ts test/simulation-money-run-catalog.test.ts test/lp-0-catalog.test.ts — 33 passed.
- Root ./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit — passed.
- node tools/plpgsql-case-in-if-lint.mjs — 176 migrations passed.
- python3 tools/lp-downstream-inventory.py --check — passed.
- Read-only assertions verify only the stale owner entry was removed from each inventory, unchanged private routine records, the four requested B5 index names and removed predecessor name, and byte-identical main SQL.
- git diff --check — passed.

The sandbox cannot start PostgreSQL. The router/CI must run the unmodified
success-fee-recovery-compensation.integration.test.ts,
simulation-money-run.integration.test.ts, serious-b5-upgrade.integration.test.ts
and lp-0-grant-freeze.integration.test.ts on real PostgreSQL (at most two workers),
including confirmation of the schema diff. These suites were not run locally.
The £320 -> £2,820 -> -£250 -> £32 path remains unverified after this repair until
those results arrive. No browser, complete journey, live provider, real money,
CI or release pass is claimed.
