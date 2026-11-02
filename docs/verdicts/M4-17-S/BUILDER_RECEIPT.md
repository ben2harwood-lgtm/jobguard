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


<!-- Preserved branch history from the NOPR catch-up. -->

# M4-17-S builder receipt

**Server portion only, Q2 review portion held.** Independent reference comparison,
available-source reading and authenticated dependency availability built. Full
server task, counted end-to-end money-chain execution and the complete plan card
remain **INCOMPLETE / DEPENDENCY-BOUND**. No independent verdict or acceptance is
claimed.

## Session

- Builder: Codex, 24 October 2026; worktree `.worktrees/m4-17-s`, branch
  `codex/sandbox/m4-17-s`.
- Ordered/inspected HEAD: `b3b322aa6827c8dfbea50050ee8c6b00c12b37a7` (accepted
  partial M4-12-S, containing accepted partial M4-10-S/M4-9-S and SV-6 stack).
  Inspected `origin/main`: `cdd1b29b75fcdc206e43e66dbd68d9f03c9b38fe`.
  Decision 74 authorizes preparation ahead; acceptance of partial dependency
  work does not supply missing authoritative contracts or establish their merge.
- Authoritative order read in full:
  `/Users/benharwood/.local/share/full-steam/jg-runs/draft-finish-m4-17-s-20261013T173557.md`.
  AGENTS.md and applicable BUILD_PLAN.md §10.2.8, §10.3.1/2, task/dependency and
  statement/allocator ownership contracts inspected. Dispatch overrides the
  historical merge-only gate and migration placeholder; held policy stays held.
- First edit: own `config/lanes/m4-17-s.json`, exact paths only. The legacy
  `config/agent-lane-assignments.json` is untouched. Shared BUILD_PLAN.md ledger,
  plan card and parked V(...) assertions are untouched; C262 comes from dispatch.
- Migration **0222** is used, not 0080, historical 0092, SV-7A's placeholder or
  another lane's reservation. Directory discovery registers it; no change to
  the closed historical migration list is needed.
- Runtime actually used: Node `v24.17.0`, versus `.nvmrc`/order `24.15.0`;
  cached pnpm `10.28.1` via `PATH=/private/tmp/jg-sv6-bin:$PATH`. No install,
  download, package/pin/lockfile/script change or clean pinned-install proof.
- Synthetic generated/reference facts only. No customer data, real provider,
  fee execution, localhost listener, PostgreSQL startup, browser, deployment or
  release. Unit/tool tests use disposable temporary fixtures.
- All heavy checks are serial, Turbo `--concurrency=1`, direct Vitest
  `--maxWorkers=2` and at most three files. Drivers wait when one-minute load
  exceeds 20; observed spot readings stayed below 20.
- No shared-repository git add/checkout/commit/push/merge or other git write.
  Founder/dispatcher owns committing and pushing. Intended message is saved to
  `/private/tmp/jg-msg-m4-17-s.txt`. No final commit exists in this session;
  different-model exact-commit verdict and separate actor acceptance remain due.

## Delivered behavior

`packages/core/src/money-trail-reconciliation.ts` supplies a strict versioned
reference-data comparison, typed failures, exact signed arithmetic, shared
cumulative half-even 10% kernel, separate company subscription periods,
nonmonetary event differences and reproducible source/difference/report hashes.
No allocator, eligibility decision, posting, fee VAT, compensation or external
action is created. Match labels always accompany `referenceOnly: true` and
`authoritativeSourceVerification: false`. They do not represent stored facts.
The £320/£22,176/£32/£250 supplied example is arithmetic only, not MT-01's
command-built collection/reversal/refund trajectory.

`MoneyTrailRepository.availableSources` authenticates through the accepted
boundary, then reads ten named existing customer/M4-8-S source tables in one
runtime SQL snapshot with tenant/job filters, unchanged RLS/SELECT privileges
and strict kind-specific/per-row identity validation. It preserves raw stored
amounts, exact fractions, rules, source and reversal links without reallocating
or qualifying anything. It excludes unrelated customer text, media, command
payloads, hidden shadow sources and ownership-claiming feed reads. The internal
versioned envelope is always incomplete and names missing eligibility, fee
posting/statement/event and subscription adapters. It never computes a balance,
source/report hash, qualified Q or completed run from those rows. MON-2A's unsafe
shared-practice company path is not used.

`MoneyTrailRepository.availability` and migration 0222 add exactly one checked
read-only routine, `app.read_money_trail_availability(uuid,text)`. It delegates
the accepted 0218 current persisted session/current owner/exact owned synthetic
small-builder v3 job read check and exposes constant dependency metadata only.
That existing read scope is not a new run permission. No application/controller,
Next adapter, OpenAPI operation, watchdog mutation classification, run intent,
review intent, writer, command/audit claim, reservation or executor is installed.

0222 creates no table, column, row, policy, type, role, existing-routine change,
backfill or existing grant change. Runtime receives EXECUTE on the one exact
signature; PUBLIC/infrastructure/shadow receive none, ownership is migration-only,
search_path is pg_catalog. No new table exists to require a FORCE-RLS policy or
new tenancy/contractor table catalogue row. Existing source-table FORCE RLS and
SELECT grants are retained. This scope does not protect against stolen privileged
credentials or a falsely selected authenticated tenant context.

The authorised catalogue delta is exact: two LP-0 ACL/owner keys, one routine
protection record, appended existing recovery-money authority-path evidence,
and one serious-B5 routine identity (plus its comment). No earlier catalogue
key, responsibility, classification, routine record, pin, fingerprint, source
bridge, merged migration or test assertion is weakened or removed. Tenancy and
contractor-entitlement catalogues correctly gain zero table rows. Generic
LP-0/authority-path guards consume the added JSON row; no freeze is loosened.
Only the expressly authorised serious-B5 catalogue addition touches an existing
merged test. Every other existing test is unchanged.

Shared paths serialize: core/db barrel exports, LP-0 inventory, serious-B5
catalogue and DB migration notes. No other lane's registration is edited, no
parallel agent wrote them, and the dispatcher must retain all stacked entries.

Contracts and restore limits are recorded in
`docs/contracts/money-trail-reconciliation-v1.md` and
`docs/operations/money-trail-synthetic-restore.md`. Forward fix by additive
migration/versioned run once authority and sources exist; never enable money
operations by deleting the hold, rewriting history or substituting v1 money.
No new operational alert, provider route, credential, environment option,
AI/model/prompt/parser/matching change, native capability or release authority.

## Actual prerequisite handoff / holds

- M4-8-S owns `RecoveryAllocationRepository` and 0136's six persisted allocator
  tables. This work reads their named facts only and builds no second allocator.
- SV-6 migration 0213 has stored attribution history but its assessment always
  refuses `RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND`; private stored JSON is not
  source-backed qualification. SV-5's completion/reveal/disposition source chain
  remains unavailable to this piece. No fake completion, attribution or waived
  invoice guard is used.
- M4-9-S's `write_success_fee_v3` always refuses dependency-bound. Persisted v3
  posted derivations, compensations, exact approval/source locks do not exist.
- M4-10-S's `simulationFeeStatementDocumentV1` is a pure representation, with
  `settlementHistory.state = integration_unavailable`. No immutable issued v3
  statement/correction/family-balance interface is callable.
- M4-12-S is pure reference collection/refund arithmetic and fake-event validation.
  There are no durable approved attempts, reservations, collections or refunds;
  its reserved 0220 migration was not created. No guessed table/foreign key or
  owner-seeded payment replaces these missing facts.
- MON-2A-P migration 0195 and `SubscriptionRepository`/`mon2_read` provide actual
  company subscription records. Its shared-practice company summaries remain
  refused. A job/practice-safe adapter is held rather than selecting another
  practice session's company facts or allocating subscriptions to the job.
- Q2 supplies neither a new run permission nor any review permission/action.
  No approved existing run authority was found. The entire run entrypoint and
  its authority-dependent positive tests/persistence stay unbuilt. No proposed
  owner-specific permission, review table/helper/grant, acknowledgement,
  dismissal, tolerance, override, route or schema is implemented.
- Missing non-catch qualification authority and negative-compensation execution
  remain unbuilt. No job runs, original/refund selection policy, standing
  authority, auto-reassessment, worker or commercial send is created.
- UI and all exact V(...) labels/IDs/amounts remain parked. No page, component,
  CSS, navigation or browser journey. The whole card stays open.
- Full rebuild/cold-backup/checkpoint restore and paused restored execution
  remain dependency-bound. Reference hash recomputation is not MT-20. No global
  kill switch or rehearsal release is invented, and no restore success claimed.

## Acceptance disposition

| IDs | Evidence / remaining obligation |
| --- | --- |
| MT-01 | DEPENDENCY-BOUND in full: command-built immutable qualifying/refund trajectory absent. Supplied arithmetic is not persisted success. |
| MT-02 | Reference family/version/read-failure completeness gates tested; source-reading envelope is always incomplete. Actual complete stored zero-difference run held. |
| MT-03 | Separate reference books, F23 £69/£80 and per-company-period discrepancies tested. Actual no-offset/source-chain integration held, including unsafe subscription adapter. |
| MT-04 | Available-source reader preserves stored exact fractions, rule/source and reversal links; scripted tests plus unrun empty-source runtime SQL test. Full populated allocator/deposit/reversal comparison remains dependency-bound; no second allocator. |
| MT-05 | Four separately named reference orphan/duplicate/late/unknown cases and both Q3 late cases tested with exact rows/hashes; durable event/replay identity integration held. |
| MT-06 | Reference state/settlement and original-refund constraints tested; no persisted restart/reconciliation proof. |
| MT-07 | Signed reference differences, no clamping, unchanged supplied input and read-only source queries tested. Actual source preservation test authored, not executed. Review assertion Q2-held. |
| MT-08 | Reference ordering, normalized exact values, optional-field encoding and source/result hashes tested. Persisted run/rebuild assertions held. |
| MT-09 | Scripted independent read-only availability/source calls tested; actual SQL test authored. Original persisted-run/process/GET assertions held. |
| MT-10/11 | Run command identity, races, source-bound recording, no mixed snapshot and audit-lock acceptance unbuilt; no guessed run authority or privileged positive fixture. Independent available source reading uses one SQL statement, never claims a completed run. |
| MT-12 | Narrow routine/actual catalogue tests authored; local exact additive inventory delta inspected. No new tables or writers. PostgreSQL execution pending. |
| MT-13 | Scripted genuine-context/pass-through, foreign projection and per-row scope refusal tested; actual session/membership/context/practice access tests authored. Direct run-writer cases held. |
| MT-14 | Scripted source SQL filters/exclusion tested; connection-scoped actual runtime query evidence and routine dependency inspection authored, NOT RUN. Completed report/shadow/subscription noninterference acceptance held with missing adapters. |
| MT-15 | Whole command/run/source/difference/audit transaction assertions held; no placeholder command or audit write. Read transaction rollback tested. Review atomicity Q2-held. |
| MT-16 | Strict reference, availability and internal source schema/refusal tests only. Nest/Next command/query/Origin/global-guard parity and review transports unbuilt with the whole entrypoint held. |
| MT-17 | Reference and repository synthetic-mode/forgery refusal and zero external ports tested. Actual SQL inherited mode boundary authored; runnable workflow remains held. |
| MT-18 | Q2-HELD IN FULL; no review implementation or positive assertion. |
| MT-19 | Own 0222 fresh/upgrade/runtime catalogue proof authored, NOT RUN. Exact predecessor row/type/privilege preservation, mutation controls and repeat successors remain CI obligations. |
| MT-20 | DEPENDENCY-BOUND: no authoritative stored trajectory/run to rebuild/restore. Operational document retains complete cold backup, independent checkpoint/evidence, paused execution and unknown/completed preservation requirements. |
| MT-21 | Working-tree receipt/check evidence only. Exact-commit different-model verdict, separate acceptance and real CI DB/browser evidence outstanding. Full server/UI/card completion not claimed. |

## Migration and PostgreSQL test evidence

New tests: `packages/db/test/money-trail-security.integration.test.ts` and
`packages/db/test/money-trail-upgrade.integration.test.ts`, authored for actual
PostgreSQL 16 reviewer/CI execution. **NOT RUN**: sandbox cannot bind localhost
or start PostgreSQL. Scripted pool queries and source inspection are not these
proofs. No SQLite/mock database is presented as PostgreSQL evidence.

Security tests cover actual runtime access, revoked/expired session/membership,
malformed/missing/foreign tenant, same-tenant wrong job, another practice session,
constant availability, exact grants/owner/search_path, no new run/review objects,
role assumption refusal, connection-scoped no-shadow query evidence, read-only
empty-source SQL execution, source preservation, delegated-access guard mutation
and PUBLIC-EXECUTE/owner drift controls. LP-0 tests use a separate pristine cluster
so disposable fixture roles are never added to the reviewed global inventory.

Upgrade proof installs all predecessors, seeds actual synthetic parent records,
snapshots named columns/rows/types and relation/routine/policy catalogues, applies
0222 alone, admits only its exact new routine, and runs all successors twice.
It uses `proofBefore`, `proofColumns`, `proofDifferences`, `rolledBack` and
`scratchReplaceFunction`; mutation/deletion/type and permitted later added-column/
row/function controls use the same comparator. Parent fixtures do not fake a
qualifying fee trajectory. No new fingerprint or previous migration rewrite.

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

## Commands and results

Actual local logs/driver manifests are under `/private/tmp/jg-m417-*`; they are
scratch evidence, not independent review. Exact unit batch commands and mutation
results are appended below after the final checks. The mandatory root `pnpm test`,
`pnpm test:db`, `pnpm test:migrations`, browser/restore suites and clean pinned
install remain NOT RUN here and required in reviewer/CI. No scripts are made
optional. Selected bounded local results are not a full root-suite pass.

| Command | Final observed result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | Exit 0. Seven tasks pass. Log `jg-m417-final-check-typecheck.log`. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1. Stops at inherited stack lane violations before package lint; not green. Log `jg-m417-final-check-lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1. Inherited M4-12-S/M4-10-S/M4-9-S/SV-6 stack paths outside this lane; no widening. Log `jg-m417-final-check-lanes.log`. |
| `pnpm exec turbo run lint --concurrency=1` | Exit 0. Seven package tasks pass. Log `jg-m417-final-check-package-lint.log`. |
| `node tools/money-arithmetic-lint.mjs` | Exit 0. Exact-money source guard passes. Log `jg-m417-final-check-money-lint.log`. |
| `node tools/commercial-boundary-lint.mjs` | Exit 0. Commercial boundary guard passes. Log `jg-m417-final-check-commercial-lint.log`. |
| `pnpm openapi:check` | Exit 1. tsx CLI IPC listener fails with sandbox EPERM; wrapper not green. Log `jg-m417-final-check-openapi.log`. |
| `node --import tsx src/generate-openapi.ts --check (API cwd)` | Exit 0. Same check source without the CLI IPC listener passes; no OpenAPI diff. Log `jg-m417-final-check-openapi-loader.log`. |
| `node --test --test-concurrency=1 tools/*.test.mjs` | Exit 0. 122 tooling tests pass, including migration-order/lane checks without PostgreSQL. Log `jg-m417-final-check-tools.log`. |
| `git diff --check` | Exit 0. No whitespace errors. Log `jg-m417-final-check-diff.log`. |
| `pnpm build --concurrency=1` | Exit 0, seven tasks including Next production build on final implementation. Log `jg-m417-build-final.log`. |
| Final serial bounded unit driver | 125 batches / 367 files; **6,768 passed**, all exit 0. Driver `jg-m417-final-units.py`, exact command/file/log manifest `jg-m417-final-unit-summary.json`; full list below. |
| `python3 /private/tmp/jg-m417-working-tree-check.py` | Exit 0: exactly 16 own paths; all other existing files unchanged from HEAD. Exact additive export, LP-0, serious-B5 and migration-note deltas checked; this is not an official lane or PostgreSQL pass. |

Initial reference test run was red before the module existed. Initial complete
unit selection had 55 failed batches from absent local build outputs/imports or
compiled CLI dependencies; after building, all 55 retry batches passed. Final
125-batch execution uses the built final implementation and has no failures.
These runs never justify weakening a test or calling an import failure a pass.

The first source-reader unit run found a decimal-string BigInt exception;
validation now finishes before conversion via Zod pipeline. An intermediate
source-reader typecheck found cross-package Zod type incompatibility; the existing
repository custom-schema pattern wrapping shared exact validation resolves it.
Final typecheck/build and all source-reader tests pass. Source mutation testing
also exposed a test helper whose rollback assertion could itself satisfy a generic
rejection expectation; the helper now verifies rollback only after a real operation
failure. Reference family/state checks gained independent cases where other
failures initially masked the missing guard. Only this lane's new tests changed.

Final new suites contain 18 core reference tests and 8 scripted repository tests.
All direct Vitest invocations used `--maxWorkers=2`; no invocation exceeded three
files. The selected API attribution HTTP suite excludes its existing actual
PostgreSQL/socket test with the named `-t` expression below. Existing API suites
that require unavailable PostgreSQL/listeners and DB `test/free-port.test.ts`
remain unrun, as do all database integration/browser suites. No broad root-suite
pass is claimed. Turbo emitted sandbox telemetry IO warnings; Next emitted the
existing multiple-lockfile root warning while build still exited 0.

Mandatory CI gates remain `pnpm test`, `pnpm test:db`, `pnpm test:migrations`,
existing browser/restore suites and clean pinned installation. No AI change was
made, so a new live-model evaluation or native device suite is not applicable.
No dispatcher-push CI URL, exact final commit, independent model response or
separate acceptance exists in this builder session.

## Guard mutation evidence

`jg-m417-mutations.py` and `jg-m417-source-mutations.py` mutate one new implementation
at a time, run its own focused unit suite, and restore original bytes after every
case and in `finally`. Final **72/72** base and **34/34** source/control mutants
are killed by executed failing tests (exit 1, not import/compile failures).
One source-hash control is repeated across the drivers. No shared Money kernel,
existing test, pin, migration or authorization bridge is mutated by these drivers.
The source string resource-bound control deliberately makes its bound too strict;
its magnitude/encoding controls separately remove the acceptance constraints.
The following are deterministic local results, not independent review.

Actual SQL delegation and privilege/owner mutation tests are authored in the new
security suite but NOT RUN; these remain PostgreSQL reviewer/CI obligations.
Reused upstream session, membership and RLS guards are unchanged, and their
existing real-PostgreSQL adversarial suites remain mandatory.

| Mutation | Exit / observed oracle |
| --- | --- |
| `base:core-strict-1` | 1, executed test failure; source restored. |
| `base:core-strict-2` | 1, executed test failure; source restored. |
| `base:core-strict-3` | 1, executed test failure; source restored. |
| `base:core-strict-4` | 1, executed test failure; source restored. |
| `base:core-strict-5` | 1, executed test failure; source restored. |
| `base:core-strict-6` | 1, executed test failure; source restored. |
| `base:core-boolean-1` | 1, executed test failure; source restored. |
| `base:core-boolean-2` | 1, executed test failure; source restored. |
| `base:core-family-array-bound-1` | 1, executed test failure; source restored. |
| `base:core-uuid-1` | 1, executed test failure; source restored. |
| `base:core-uuid-2` | 1, executed test failure; source restored. |
| `base:core-uuid-3` | 1, executed test failure; source restored. |
| `base:core-integer-1` | 1, executed test failure; source restored. |
| `base:core-nonempty-1` | 1, executed test failure; source restored. |
| `base:core-key-bound-1` | 1, executed test failure; source restored. |
| `base:core-array-bound-1` | 1, executed test failure; source restored. |
| `base:core-array-bound-2` | 1, executed test failure; source restored. |
| `base:core-money-bound-1` | 1, executed test failure; source restored. |
| `base:core-positive-1` | 1, executed test failure; source restored. |
| `base:core-hash-1` | 1, executed test failure; source restored. |
| `base:core-literal-1` | 1, executed test failure; source restored. |
| `base:core-literal-2` | 1, executed test failure; source restored. |
| `base:core-literal-3` | 1, executed test failure; source restored. |
| `base:core-literal-4` | 1, executed test failure; source restored. |
| `base:core-literal-5` | 1, executed test failure; source restored. |
| `base:core-literal-6` | 1, executed test failure; source restored. |
| `base:core-literal-7` | 1, executed test failure; source restored. |
| `base:core-literal-8` | 1, executed test failure; source restored. |
| `base:core-literal-9` | 1, executed test failure; source restored. |
| `base:core-enum-1` | 1, executed test failure; source restored. |
| `base:core-enum-2` | 1, executed test failure; source restored. |
| `base:core-enum-3` | 1, executed test failure; source restored. |
| `base:family-duplicate` | 1, executed test failure; source restored. |
| `base:fact-duplicate` | 1, executed test failure; source restored. |
| `base:period-binding` | 1, executed test failure; source restored. |
| `base:negative-nonposting` | 1, executed test failure; source restored. |
| `base:whole-pence` | 1, executed test failure; source restored. |
| `base:collection-original-binding` | 1, executed test failure; source restored. |
| `base:conflicting-replay` | 1, executed test failure; source restored. |
| `base:replay-dedup` | 1, executed test failure; source restored. |
| `base:family-missing` | 1, executed test failure; source restored. |
| `base:family-status` | 1, executed test failure; source restored. |
| `base:family-version` | 1, executed test failure; source restored. |
| `base:customer-overpayment` | 1, executed test failure; source restored. |
| `base:fee-comparison` | 1, executed test failure; source restored. |
| `base:duplicate-observation` | 1, executed test failure; source restored. |
| `base:orphan-source` | 1, executed test failure; source restored. |
| `base:after-checkpoint` | 1, executed test failure; source restored. |
| `base:causal-predecessor` | 1, executed test failure; source restored. |
| `base:unknown-state` | 1, executed test failure; source restored. |
| `base:pending-state` | 1, executed test failure; source restored. |
| `base:accepted-state` | 1, executed test failure; source restored. |
| `base:settled-only` | 1, executed test failure; source restored. |
| `base:blocked-excluded` | 1, executed test failure; source restored. |
| `base:collection-kind` | 1, executed test failure; source restored. |
| `base:refund-kind` | 1, executed test failure; source restored. |
| `base:refund-original` | 1, executed test failure; source restored. |
| `base:refund-bound` | 1, executed test failure; source restored. |
| `base:invalid-refund-excluded` | 1, executed test failure; source restored. |
| `base:period-comparison` | 1, executed test failure; source restored. |
| `base:period-scope` | 1, executed test failure; source restored. |
| `base:difference-sign` | 1, executed test failure; source restored. |
| `base:source-hash-content` | 1, executed test failure; source restored. |
| `base:report-hash-content` | 1, executed test failure; source restored. |
| `base:exact-normalization` | 1, executed test failure; source restored. |
| `base:difference-order` | 1, executed test failure; source restored. |
| `base:requested-job-binding` | 1, executed test failure; source restored. |
| `base:db-access-code` | 1, executed test failure; source restored. |
| `base:projection-schema` | 1, executed test failure; source restored. |
| `base:job-schema` | 1, executed test failure; source restored. |
| `base:material-session` | 1, executed test failure; source restored. |
| `base:optional-canonical-field` | 1, executed test failure; source restored. |
| `source:source-hash-content` | 1, executed test failure; source restored. |
| `source:source-strict-1` | 1, executed test failure; source restored. |
| `source:source-strict-2` | 1, executed test failure; source restored. |
| `source:source-uuid-1` | 1, executed test failure; source restored. |
| `source:source-uuid-2` | 1, executed test failure; source restored. |
| `source:source-uuid-3` | 1, executed test failure; source restored. |
| `source:source-nonempty-1` | 1, executed test failure; source restored. |
| `source:source-nonempty-2` | 1, executed test failure; source restored. |
| `source:source-nonempty-3` | 1, executed test failure; source restored. |
| `source:source-nonempty-4` | 1, executed test failure; source restored. |
| `source:source-ref-bound-1` | 1, executed test failure; source restored. |
| `source:source-ref-bound-2` | 1, executed test failure; source restored. |
| `source:source-object-version-bound-1` | 1, executed test failure; source restored. |
| `source:source-policy-bound-1` | 1, executed test failure; source restored. |
| `source:source-array-bound-1` | 1, executed test failure; source restored. |
| `source:source-resource-bound-1` | 1, executed test failure; source restored. |
| `source:source-hash-1` | 1, executed test failure; source restored. |
| `source:source-enum-1` | 1, executed test failure; source restored. |
| `source:source-enum-2` | 1, executed test failure; source restored. |
| `source:source-enum-3` | 1, executed test failure; source restored. |
| `source:source-integer-encoding` | 1, executed test failure; source restored. |
| `source:source-kind` | 1, executed test failure; source restored. |
| `source:source-auth-binding` | 1, executed test failure; source restored. |
| `source:source-auth-projection` | 1, executed test failure; source restored. |
| `source:source-tenant-binding` | 1, executed test failure; source restored. |
| `source:source-job-binding` | 1, executed test failure; source restored. |
| `source:source-schema-refusal` | 1, executed test failure; source restored. |
| `source:source-lower-money-bound` | 1, executed test failure; source restored. |
| `source:source-upper-money-bound` | 1, executed test failure; source restored. |
| `source:source-exact-validation` | 1, executed test failure; source restored. |
| `source:source-tenant-sql` | 1, executed test failure; source restored. |
| `source:source-job-sql` | 1, executed test failure; source restored. |
| `source:source-incomplete-flag` | 1, executed test failure; source restored. |
| `source:source-unavailable-family` | 1, executed test failure; source restored. |

## Reviewer/CI commands still required (NOT RUN here)

Run separately, with real PostgreSQL 16 and at most three files per invocation.
New task-specific suites:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/money-trail-security.integration.test.ts test/money-trail-upgrade.integration.test.ts
```

Preserve and execute the exact existing prerequisite/catalogue regression files,
in sequential batches of no more than three:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/fingerprinted-row-shape.integration.test.ts test/tenancy.integration.test.ts test/demo-bootstrap.integration.test.ts
```

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/recovery-allocation.integration.test.ts test/recovery-line-allocation.integration.test.ts test/recovery-allocation-races.integration.test.ts
```

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/recovery-allocation-upgrade.integration.test.ts test/UIWIRE-12.integration.test.ts
```

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lp-0-grant-freeze.integration.test.ts test/lp-0-authority-paths.integration.test.ts test/serious-b5-upgrade.integration.test.ts
```

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/contractor-entitlement-upgrade.integration.test.ts test/success-fee-access.integration.test.ts test/success-fee-upgrade.integration.test.ts
```

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/recovery-attribution.integration.test.ts test/recovery-attribution-access.integration.test.ts test/recovery-attribution-replay.integration.test.ts
```

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/recovery-attribution-upgrade.integration.test.ts test/recovery-attribution-figures.integration.test.ts
```

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/subscription-authority.integration.test.ts test/subscription-persistence.integration.test.ts test/subscription-statements.integration.test.ts
```

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/subscription-replay.integration.test.ts test/subscription-upgrade.integration.test.ts test/restore-rehearsal.integration.test.ts
```

These are future reviewer commands, not execution evidence. The full mandatory
root suites and existing browser checks remain required as well. Missing
source-dependent task tests (the full money-trail journey/events/races/restore
and API run/review transports) are deliberately not fabricated or represented
as pending executable passing tests; their implementation itself remains held.

## Final bounded unit command manifest

Each row executes `pnpm exec vitest run --maxWorkers=2 <files>` from the named
package directory, one row at a time. `core/config/storage/ai/db` use `packages/`;
`api/web` use `apps/`. All final rows exited 0. API attribution's exact extra
filter is recorded in its row. Batch logs are `jg-m417-final-unit-<package>-NNN.log`
and the scratch JSON manifest records the exact path for each invocation.

| Package | Exact files / extra flags | Exit |
| --- | --- | --- |
| core | `src/acceptance.test.ts src/activation-v3.test.ts src/activation.test.ts` | 0 |
| core | `src/allocation.test.ts src/capture.test.ts src/commercial-integrity.test.ts` | 0 |
| core | `src/contractor-billing-ordering.test.ts src/contractor-billing.test.ts src/contractor-entitlement-authority.test.ts` | 0 |
| core | `src/contractor-parties.test.ts src/contractor-practice-session.test.ts src/contractor.test.ts` | 0 |
| core | `src/cumulative-fee.test.ts src/customer-billing.test.ts src/decision-checks-later.test.ts` | 0 |
| core | `src/decision-checks.test.ts src/discrepancy-audit-fix.test.ts src/discrepancy.test.ts` | 0 |
| core | `src/enterprise-baseline.property.test.ts src/enterprise-baseline.test.ts src/enterprise-dashboard-billing.test.ts` | 0 |
| core | `src/enterprise-dashboard.test.ts src/enterprise-domain/boundaries.test.ts src/enterprise-domain/duplicate-unlink-roles.test.ts` | 0 |
| core | `src/enterprise-domain/fee-both.test.ts src/enterprise-domain/fee-pins.test.ts src/enterprise-domain/fee.test.ts` | 0 |
| core | `src/enterprise-domain/later-explicit-refund.test.ts src/enterprise-domain/origin.test.ts src/enterprise-domain/transitions.test.ts` | 0 |
| core | `src/enterprise-fee-statement.test.ts src/enterprise-live-prompt-contracts.test.ts src/enterprise-live-prompt-persistence.test.ts` | 0 |
| core | `src/enterprise-live-prompts.test.ts src/enterprise-signal.test.ts src/evidence-pack.test.ts` | 0 |
| core | `src/extra-approval.test.ts src/extra-client-approval.test.ts src/extra-evidence-pack.test.ts` | 0 |
| core | `src/extra-origin.test.ts src/extra-persistence.test.ts src/extra-unlink.test.ts` | 0 |
| core | `src/fee-collection.test.ts src/fee-statement.test.ts src/fee-what-if.test.ts` | 0 |
| core | `src/fee.test.ts src/final-account-lock.test.ts src/final-account.test.ts` | 0 |
| core | `src/free-first-job-keys.test.ts src/free-first-job-period.test.ts src/free-first-job.test.ts` | 0 |
| core | `src/inbox-relevance.test.ts src/index.test.ts src/job-import.test.ts` | 0 |
| core | `src/job-parties.test.ts src/job-sources.test.ts src/job-work-state.test.ts` | 0 |
| core | `src/job.test.ts src/jobs-on-the-go-pricing.test.ts src/jobs-on-the-go.test.ts` | 0 |
| core | `src/later-review-boundary.test.ts src/materials.test.ts src/mobile-auth.test.ts` | 0 |
| core | `src/mobile-device-lifecycle.test.ts src/money-trail-reconciliation.test.ts src/money.test.ts` | 0 |
| core | `src/observation.test.ts src/offline-contract.properties.test.ts src/offline-contract.test.ts` | 0 |
| core | `src/plan-entitlements.test.ts src/practice-facts.test.ts src/practice-feed.test.ts` | 0 |
| core | `src/practice-supplier-credit.test.ts src/practice-worker-switch.test.ts src/prevention-checks.test.ts` | 0 |
| core | `src/proof.test.ts src/purchase-order.test.ts src/quantity.test.ts` | 0 |
| core | `src/quote-document.test.ts src/quote-rounding.test.ts src/quote.test.ts` | 0 |
| core | `src/readiness.test.ts src/receipt-allocation.test.ts src/recovery-allocation.test.ts` | 0 |
| core | `src/recovery-attribution-persistence.test.ts src/recovery-attribution-persistence.type.test.ts src/recovery-case-terms.test.ts` | 0 |
| core | `src/recovery-case.test.ts src/recovery-eligibility-v3.test.ts src/recovery-eligibility.test.ts` | 0 |
| core | `src/recovery-fee-illustration.test.ts src/recovery-fee-illustration.type.test.ts src/recovery-follow-up.test.ts` | 0 |
| core | `src/recovery-message.test.ts src/recovery-payment-payer.test.ts src/recovery.test.ts` | 0 |
| core | `src/review.test.ts src/shadow-detection.test.ts src/shadow-domain/architecture.test.ts` | 0 |
| core | `src/shadow-domain/attribution.test.ts src/shadow-domain/capture.test.ts src/shadow-domain/eligibility.test.ts` | 0 |
| core | `src/shadow-domain/evaluation.test.ts src/shadow-domain/lock.test.ts src/shadow-domain/must-surface.test.ts` | 0 |
| core | `src/shadow-domain/signal.test.ts src/shadow-domain/success-fee.test.ts src/shadow-domain/type-contracts.test.ts` | 0 |
| core | `src/simulation-fee-statement.test.ts src/site-extra-evidence.test.ts src/site-extra-pricing.test.ts` | 0 |
| core | `src/site-extra-v2.test.ts src/site-extra.test.ts src/site-visit.test.ts` | 0 |
| core | `src/sor-pricing.test.ts src/subscription-allocation.test.ts src/subscription-architecture.test.ts` | 0 |
| core | `src/subscription-period.test.ts src/subscription-persistence.test.ts src/subscription-track-review.test.ts` | 0 |
| core | `src/subscription.test.ts src/success-fee-posting-fixtures.test.ts src/success-fee-posting.test.ts` | 0 |
| core | `src/supplier-documents.test.ts src/supplier-facts.test.ts src/supplier-matching.test.ts` | 0 |
| core | `src/sync-download.test.ts src/tax.test.ts src/variation.test.ts` | 0 |
| core | `src/watchdog.test.ts src/work-order.test.ts` | 0 |
| config | `src/connector-environment.test.ts src/index.test.ts src/policy-gates.decision-identity.test.ts` | 0 |
| config | `src/policy-gates.superseded-replay.test.ts` | 0 |
| storage | `src/index.test.ts` | 0 |
| ai | `src/capture-evaluation.test.ts src/capture.test.ts src/enterprise-ai-evaluation.test.ts` | 0 |
| ai | `src/enterprise-ai-prompts.test.ts src/enterprise-live-prompt-evaluation.test.ts src/enterprise-live-prompt-persisted-evaluation.test.ts` | 0 |
| ai | `src/gateway.test.ts src/later-capture-evaluation.test.ts src/later-gateway.test.ts` | 0 |
| ai | `src/later-shadow-evaluation.test.ts src/later-shadow-proposal.test.ts src/shadow-evaluation.test.ts` | 0 |
| ai | `src/shadow-proposal.test.ts src/sor-suggestion-evaluation.test.ts src/sor-suggestion.test.ts` | 0 |
| db | `src/audit-checkpoint-handoff.test.ts src/audit-fix-dbsrc-08.test.ts src/decision-adoption.test.ts` | 0 |
| db | `src/demo-seed.determinism.test.ts src/demo-seed.test.ts src/evidence-finalization-race.test.ts` | 0 |
| db | `src/later-money-boundaries.test.ts src/later-outbox.test.ts src/later-sso-refusal.test.ts` | 0 |
| db | `src/meter-persistence.test.ts src/meter-repository.test.ts src/migrate-discovery.test.ts` | 0 |
| db | `src/money-trail-repository.test.ts src/northside-settings.test.ts src/outbox.test.ts` | 0 |
| db | `src/practice-invoice-later.test.ts src/practice-invoice-repository.test.ts src/proof-replacement.test.ts` | 0 |
| db | `src/recovery-allocation-serious-b9.test.ts src/recovery-attribution-repository.test.ts src/recovery-legacy-later.test.ts` | 0 |
| db | `src/serious-b10.test.ts src/serious-b7.test.ts src/serious-b8.test.ts` | 0 |
| db | `src/subscription-simulated-payment-adapter.test.ts src/success-fee-repository.test.ts src/supplier-match-repository.test.ts` | 0 |
| db | `src/tenant-context.test.ts test/audit-api-capture.test.ts test/audit-api-file-final-account.test.ts` | 0 |
| db | `test/audit-api-file-supplier-document.test.ts test/audit-api-variation.test.ts test/audit-dbsrc-01.test.ts` | 0 |
| db | `test/audit-dbsrc-03.test.ts test/audit-export-privilege-comparator.test.ts test/audit-fix-dbsrc-04.test.ts` | 0 |
| db | `test/contractor-session-context.test.ts test/job-work-state-syntax.test.ts test/lock-order-1.test.ts` | 0 |
| db | `test/lp-0-catalog.test.ts test/proof-invalidation.test.ts test/purchase-order-audit.test.ts` | 0 |
| db | `test/recovery-case-join.test.ts test/recovery-case-outcome.test.ts test/recovery-eligibility-v3-interest.test.ts` | 0 |
| db | `test/recovery-message-repository.test.ts test/site-extra-evidence-compatibility.test.ts test/sor-suggestion-confirmation.test.ts` | 0 |
| db | `test/verify-audit-export-cli.test.ts test/verify-evidence-pack-cli.test.ts` | 0 |
| api | `src/audit-export/audit-export.application.test.ts src/audit-export/audit-export.context.test.ts src/auth/auth.test.ts` | 0 |
| api | `src/auth/context-boundary.test.ts src/auth/identity.test.ts src/auth/sso/later-sso-resource.test.ts` | 0 |
| api | `src/auth/sso/linking.test.ts src/auth/sso/oidc.contracts.test.ts src/auth/sso/oidc.test.ts` | 0 |
| api | `src/auth/sso/role-mapping.test.ts src/auth/sso/saml-fixlater-6.test.ts src/auth/sso/saml.test.ts` | 0 |
| api | `src/auth/sso/scim-paths.test.ts src/auth/sso/scim.test.ts src/auth/sso/sso-emergency-owner.test.ts` | 0 |
| api | `src/auth/sso/sso-emergency.test.ts src/auth/sso/sso-required-disclosure.test.ts src/auth/sso/sso-required-paths.test.ts` | 0 |
| api | `src/auth/sso/sso-required-unlinked.test.ts src/auth/sso/sso-required.test.ts src/capture/capture-state.test.ts` | 0 |
| api | `src/commercial-integrity.application.test.ts src/commercial-integrity.audit.test.ts src/contractor/billing.adapters.test.ts` | 0 |
| api | `src/contractor/contractor-parties.application.test.ts src/contractor/contractor-parties.controller.test.ts src/contractor/contractor-parties.privacy.test.ts` | 0 |
| api | `src/contractor/contractor-practice-session.application.test.ts src/contractor/contractor.application.test.ts src/contractor/contractor.projection.test.ts` | 0 |
| api | `src/contractor/enterprise-baseline.application.test.ts src/contractor/enterprise-dashboard.application.test.ts src/contractor/enterprise-dashboard.boundaries.test.ts` | 0 |
| api | `src/contractor/enterprise-fee.application.test.ts src/contractor/enterprise-fee.executor.test.ts src/contractor/enterprise-live-prompt-boundaries.test.ts` | 0 |
| api | `src/contractor/enterprise-live-prompt.application.test.ts src/contractor/enterprise-live-prompt.http.test.ts src/contractor/full-demo-package-baseline.test.ts` | 0 |
| api | `src/contractor/full-demo-package-sales.test.ts src/contractor/full-demo-package.application.test.ts src/contractor/offline-risk.application.test.ts` | 0 |
| api | `src/contractor/practice-worker-switch.application.test.ts src/contractor/site-extra-evidence.application.test.ts src/contractor/site-extra-pricing.application.test.ts` | 0 |
| api | `src/contractor/site-extra.application.test.ts src/contractor/site-visit.application.test.ts src/contractor/work-order.application.test.ts` | 0 |
| api | `src/customer-receipt-input.amount-types.test.ts src/customer-receipt-input.command-identity.test.ts src/customer-receipt-input.fractions.test.ts` | 0 |
| api | `src/customer-receipt-input.reversal-authority.test.ts src/customer-receipt-input.reversal-reason.test.ts src/customer-receipt-input.test.ts` | 0 |
| api | `src/decisions/decisions-later.test.ts src/effects/policy-gates.test.ts src/evidence-pack.application.test.ts` | 0 |
| api | `src/evidence-pack.controller.test.ts src/evidence-pack.errors.test.ts src/fee-collection-fake-adapter.test.ts` | 0 |
| api | `src/final-account-lock.application.test.ts src/final-account-lock.controller.test.ts src/final-account.application.test.ts` | 0 |
| api | `src/free-first-job-card.adapter.test.ts src/free-first-job.application.test.ts src/health-database-independence.test.ts` | 0 |
| api | `src/inbox-relevance.boundary-missing.test.ts src/inbox-relevance.session.test.ts src/job-parties.application.test.ts` | 0 |
| api | `src/job-source.application.test.ts src/job-source.controller.test.ts src/job-work-state.application.test.ts` | 0 |
| api | `src/job-work-state.controller.test.ts src/job-work-state.http.test.ts src/job-work-state.isolation.test.ts` | 0 |
| api | `src/later-shadow-detection.worker.test.ts src/material.application.test.ts src/material.contracts.boundary.test.ts` | 0 |
| api | `src/plan-entitlements.application.test.ts src/plan-entitlements.boundary.test.ts src/practice-errors.redaction.test.ts` | 0 |
| api | `src/practice-facts.application.test.ts src/practice-facts.controller.test.ts src/practice-feed.application.test.ts` | 0 |
| api | `src/practice-feed.controller.test.ts src/practice-session.test.ts src/practice-supplier-credit.application.test.ts` | 0 |
| api | `src/practice-supplier-credit.http.test.ts src/practice-transports.test.ts src/prevention-check.application.test.ts` | 0 |
| api | `src/proof/proof-adopted-original.test.ts src/proof/proof.application.test.ts src/quote/serious-b3-preview.test.ts` | 0 |
| api | `src/readiness.later.test.ts src/readiness.payload-preservation.test.ts src/recovery-allocation.application.test.ts` | 0 |
| api | `src/recovery-allocation.controller.test.ts src/recovery-allocation.credit.test.ts src/recovery-attribution.application.test.ts` | 0 |
| api | `src/recovery-attribution.controller.test.ts src/recovery-attribution.http.test.ts src/recovery-case-terms.application.test.ts -t ^(?!.*PostgreSQL actual HTTP)` | 0 |
| api | `src/recovery-case.application.test.ts src/recovery-case.command.application.test.ts src/recovery-case.controller.test.ts` | 0 |
| api | `src/recovery-eligibility-v3.application.test.ts src/recovery-follow-up.application.test.ts src/recovery-follow-up.controller.test.ts` | 0 |
| api | `src/recovery-message.application.test.ts src/recovery-message.controller.test.ts src/recovery-message.errors.test.ts` | 0 |
| api | `src/recovery-payment-payer.application.test.ts src/shadow-detection-lock-race.test.ts src/shadow-detection.worker.test.ts` | 0 |
| api | `src/subscription-boundaries.test.ts src/subscription.application.test.ts src/success-fee.application.test.ts` | 0 |
| api | `src/success-fee.http.test.ts src/value/value.application.test.ts src/variation/variation.application.test.ts` | 0 |
| api | `src/watchdog-registry.test.ts src/watchdog.filter.privacy.test.ts src/workspace/fee-illustration-later.test.ts` | 0 |
| api | `src/workspace/fee-illustration.application.test.ts src/workspace/workspace.service.test.ts` | 0 |
| web | `app/admin/contractor/audit-exports/page.test.tsx app/admin/contractor/contractor-admin.test.tsx app/api/contractor/jobs/[id]/order-check/route.test.ts` | 0 |
| web | `app/api/contractor/jobs/[id]/order-lines/route.test.ts app/api/contractor/jobs/[id]/site-extras/route-v2.test.ts app/api/contractor/jobs/[id]/site-extras/route.evidence.test.ts` | 0 |
| web | `app/api/contractor/jobs/[id]/site-extras/route.test.ts app/api/contractor/jobs/[id]/site-extras/sor/route.test.ts app/api/contractor/jobs/[id]/site-visits/[visitId]/complete/route.test.ts` | 0 |
| web | `app/api/contractor/jobs/[id]/site-visits/start/route.test.ts app/api/contractor/jobs/[id]/sor-items/route.test.ts app/api/contractor/origin.test.ts` | 0 |
| web | `app/api/contractor/practice/acting-as/end/route.test.ts app/api/contractor/practice/acting-as/route.test.ts app/api/contractor/practice/session/revoke/route.test.ts` | 0 |
| web | `app/api/contractor/practice/workers/[workerId]/acting-as/route.test.ts app/api/contractor/route.test.ts app/api/contractor/site/jobs/route.test.ts` | 0 |
| web | `app/api/jobs/[id]/customer-messages/route.test.ts app/api/jobs/[id]/diary/route.test.ts app/api/jobs/[id]/success-fees/route.test.ts` | 0 |
| web | `app/api/northside/routes.test.ts app/lib/audit-pkg-lib-86.test.ts app/lib/invoice-payment-state.test.ts` | 0 |
| web | `app/lib/receipt-http-error.test.ts app/lib/recovery-case-requests.test.ts app/lib/recovery-case-routes.test.ts` | 0 |
| web | `app/lib/recovery-case-selection.test.ts app/lib/recovery-fee-note.test.ts app/page.test.tsx` | 0 |
| web | `app/ui/job-parties-draft.test.ts app/ui/job-parties.test.tsx app/ui/materials-command.test.ts` | 0 |
| web | `app/ui/practice-receipts-state.test.ts app/ui/purchase-order-state.test.ts app/ui/recovery-cases.behaviour.test.ts` | 0 |
| web | `app/ui/recovery-cases.test.ts app/ui/recovery-eligibility-command.test.ts app/ui/recovery-messages.test.tsx` | 0 |
| web | `app/ui/supplier-fact-editor.test.ts app/ui/workspace-lifecycle.test.ts` | 0 |

No acceptance action follows these deterministic checks. Founder creates the
commit; a different model must record a verdict bound to that exact commit,
then a separate actor records technical acceptance. PostgreSQL/browser/restore
and held product authority gates remain open.

## 28 October 2026 — RED catch-up on M4-12-S

Plan piece: **M4-17-S — Reconcile the synthetic money trail**, finish-list row 20.
This catch-up preserves the built reference/read-only portion and its dependency-bound
run authority. It adds no product behavior and does not complete the held full task.

Resolved both merge conflicts by retaining the M4-17-S availability routine and
M4-12-S's migration references. The LP-0 recovery-money path is one record, with
both the base fee source and money-trail evidence. The base's 0277 attribution and
0302 success-fee migrations supersede the absent older copies.

Used `planRenumber` from `tools/migration-renumber.mjs` for the reserved 0310
migration, then applied its filesystem rename without staging (the tool's normal
`--write` writes the read-only git index). SQL bytes were compared directly and
remain identical: SHA-256
`a67fead829fe896aa8a0ba0dd665c1d4ac5155602d9ab724f5f38f63b5f4027e`.
Updated the upgrade test, inventory, documentation and lane references.
No attribution/allocation writer or proof helper is added or changed by this
piece, so the #368 locked-revision, #356 line-cap/unique-line and #346 feed-job
writer conditions remain intact without widening this catch-up.

Local checks actually run (installed tools only, at most two Vitest workers):

- Cached pnpm 10.28.1: core `src/money-trail-reconciliation.test.ts` — 18 passed;
  database `src/money-trail-repository.test.ts` — 8 passed. Includes duplicate/replay,
  refund limits, signed discrepancies, exact arithmetic, tenant/job source binding,
  denied access, strict source shapes and incomplete-result assertions.
- `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json --noEmit`
  and the equivalent database check — both passed (also the package lint commands).
- `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`,
  `node tools/commercial-boundary-lint.mjs` — passed; purity reported existing
  computed-module-name notices.
- `git diff --check` — passed. Filesystem conflict-marker, lane-path, inventory
  uniqueness and SQL identity checks — passed.

The default pnpm launcher stalled before tests; stopped it and used the cached
pinned launcher. A Turbo typecheck also selected that default launcher and was
stopped; the direct installed TypeScript checks above completed successfully.
No dependency downloads, git writes, PostgreSQL startup, localhost binding, real
customer data, providers, money actions or releases. PostgreSQL upgrade/security,
browser and full CI checks remain for GitHub CI after the router pushes; RED
review remains the loop owner's gate against the resulting exact head.

## 28 October 2026 main-merge conflict catch-up

Catch-up only for RED M4-17-S; no new behavior or completion of the
dependency-bound full task. Resolved the workspace/core export conflicts by
retaining both sides, and unioned LP-0 entries/routines with main. All main
routine definitions, including its updated evidence-pack routine, remain exact.
Main's shared upgrade expectations remain in order with the branch's three
additive routine identities retained. The lane adds the workspace export path.

All 133 migration files already on origin/main are byte-identical to main and
therefore drop out of the branch diff. The inherited 0302 prerequisite remains.
Own migration 0310 is byte-identical to HEAD, SHA-256
`a67fead829fe896aa8a0ba0dd665c1d4ac5155602d9ab724f5f38f63b5f4027e`.

Checks actually run, using Node v24.17.0 and the cached pinned pnpm 10.28.1
launcher (no package downloads):

- Core Vitest `src/money-trail-reconciliation.test.ts`: 18 passed.
- Database Vitest `src/money-trail-repository.test.ts`: 8 passed.
  Both invoked via `pnpm --filter <package> exec vitest run --maxWorkers=2`
  with one named file per run; runs were serial.
- Installed TypeScript `tsc -p <package>/tsconfig.json --noEmit` for
  `packages/core`, `packages/db` and `apps/api`: all passed.
- Core-purity, money-arithmetic and commercial-boundary tools: passed;
  core purity reports existing computed-module-name notices.
- `git diff --check`: passed. Filesystem conflict-marker, export preservation,
  exact inventory union, main upgrade-expectation preservation, migration byte
  identity and lane path checks: passed.

No git writes: the router must stage the resolved files to clear the read-only
index's unmerged entries, commit, push and open the PR. PostgreSQL, migration
execution, browser and full CI checks remain for GitHub CI after push. One
independent RED review against the resulting exact head remains required.

## M4-17 report NOPR catch-up — 2 November 2026

READY for router staging/commit on `codex/sandbox/m4-17-report`; RED (money).
Resolved the six conflict contents as a union, retaining main's newer simulation
collection/run work and branch-only dark reference reconciliation/report work.
The Git index still carries the merge's unmerged entries because this sandbox
prohibits Git writes; the router must stage the resolved files to clear them.
No fetch, commit, push, PR, PostgreSQL, browser, provider or release action ran.

Main has no `read_money_trail_availability` or `financial_reconciliation_queue`
definition. Retained their unique additive migrations under the claimed stems
`0593_money_trail_reconciliation` and `0594_financial_reconciliation_queue`.
A byte comparison against HEAD's original migrations passes for both SQL files;
all main migration files remain byte-identical to origin/main. Added explicit
proof fragments for LP-0, upgrade and tenancy; restored main's protected LP-0,
serious-B5 and tenancy baselines without losing their prior assertions. Main's
`0512_simulation_money_trail_run.sql` and the demo journey files are unchanged.
The lane file enumerates exactly the extant branch paths differing from main.

Actual local validation (installed Vitest 4.1.12, `--maxWorkers=1`, at most three
named files per invocation):

- `./node_modules/.bin/vitest run --maxWorkers=1 src/financial-reconciliation.test.ts src/money-trail-reconciliation.test.ts src/fee-collection.test.ts` from packages/core: 78 passed.
- `./node_modules/.bin/vitest run --maxWorkers=1 src/financial-reconciliation-queue-repository.test.ts src/money-trail-repository.test.ts test/migration-proof-loader.test.ts` from packages/db: 13 repository tests passed; proof-loader initially failed to load missing built @jobguard/storage output.
- Re-ran `test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts` with the installed db Vitest, `--maxWorkers=1 --config /tmp/m4-17-vitest.config.mjs`: 55 passed, including loading the actual proof fragments into the reviewed inventory. The temporary configuration aliases installed workspace packages to their existing source; repository configuration and test assertions are unchanged. A first temporary config attempt used an incorrect source root and failed module resolution; corrected before the passing run.
- Installed web Vitest, `--maxWorkers=1 app/ui/financial-reconciliation-report.test.tsx 'app/api/jobs/[id]/reconciliation/[runId]/route.test.ts'`: 7 passed.
- Installed API Vitest, `--maxWorkers=1 --config /tmp/m4-17-vitest.config.mjs src/fee-collection-fake-adapter.test.ts`: 10 passed.
- Installed root `tsc -p <package>/tsconfig.json --noEmit` for packages/core, packages/db, apps/web, apps/api, packages/config, packages/storage and packages/ai: all seven passed. The pnpm typecheck wrapper stalled before launching tasks and was stopped; direct installed TypeScript completed these same package typechecks without downloading or building dependencies.
- `git diff --check`, conflict-marker scan, explicit protected-baseline comparisons, migration SQL byte comparisons and lane/path comparison: passed.

163 unit tests passed in total. Initial wrapper/module-resolution attempts are
not claimed as passes. Real PostgreSQL fresh/upgrade/migration/security tests,
browser suites, green CI against current main and an independent exact-head RED
review remain outstanding. This is a NOPR catch-up, not production acceptance;
G0–G5 remain closed. No new operational alert or live capability is introduced.
