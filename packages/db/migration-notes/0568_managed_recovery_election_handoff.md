Batch-9 landing update, 4 November 2026. This update supersedes the historical
numbering and adapter-installation account below. Main fb61ec367 already includes
the complete 0566 election, registry, checked audit and strict result projection.
Its SQL and proof are retained byte-for-byte. The duplicate built-ahead base is
absorbed by main, rather than replayed or installed again. The remaining migration
stems are 0568 actor binding, 0569 pursuit guard, 0570 platform tax invoice,
0571 money-trail availability and 0572 reconciliation queue; 0567 is reserved
for #546. Those five SQL bodies are unchanged from the hardened batch.
The repository passes the session digest to the new overload and uses main's
stored state result; regressions retain the same exact identity/points assertions
on that state. The stale-approval fixture executes as the test owner, so it tests
the business refusal without bypassing runtime authority-write restrictions.
No original migration, fingerprint guard or product policy is changed.

Historical builder notes follow.

MON-9 persistence (RED money), BUILD_PLAN.md MON-9.

Adds tenant-qualified, forced-RLS election and permanent pursuit-start tables.
Only the owner command dispatcher can elect through the checked SQL routine;
source triggers serialize on the existing case advisory lock. Historical pursuit
messages/events and progressed legacy cases backfill start markers. No earlier migration is edited. Direct runtime writes are revoked. Existing
LP-0, tenancy and SERIOUS-B5 expectations are unioned through the explicit
0598_managed_recovery_election.proof.json fragment; the entitlement upgrade
retains its two exact empty-table additions.

The repository requires the server's opaque session digest alongside the verified
tenant context. mon9_session resolves identity from an active synthetic identity
session under a shared lock, applies the existing SSO membership bridge, and
restores the tenant context. A differing supplied identity or membership is refused.
The resolved identity drives the live owner check inside the transaction before
replay and preview; revoked, expired and unknown sessions fail closed. An election binds case/job, service/points, terms, command, actor,
server time and exact authorization, with the normal audit batch. Replays keep
one effect. Preview principal uses stored ordinary customer-recovery allocations,
net of reversals, with current approved policy, finalized evidence and settled,
identified receipts; invalidated proof, reversed payments and duplicate holds
fail closed. Manual landing records do not qualify. Missed-variation/shadow and
contractor cases are outside this synthetic boundary. The core computes the
unchanged success-fee illustration separately from the service-charge preview.

No service is offered or charged; no provider, invoice, ledger or fee writer is
introduced. Exact D01 terms, solicitor/DBA review, pilot evidence and live release
gates remain required. The base success-fee writer remains dependency-bound.

Forward fix: retain append-only election/start history and install a correcting
migration; disable the calling surface if needed. Never delete an opt-in or
pursuit marker to reverse this migration. No destructive rollback is supported.

Local validation on 1 November 2026: the managed-recovery repository, integration
and upgrade tests, migration-proof-loader, SERIOUS-B5 upgrade, LP-0 grant-freeze
and tenancy suites passed together (7 files, 81 tests) using real embedded
PostgreSQL 16 and at most two Vitest workers. Another 13 core tests and six contractor
entitlement-upgrade tests passed; core, storage and database builds passed.
The known main-side missing legacy
entry for 0510_read_value_job_combined_final.sql was added only in a scratch test
copy; the committed legacy list is unchanged. Proof expectations come from SQL
and reviewed source expectations, never from a database catalogue.

Catch-up, 3 November 2026: migration stems are now 0568–0570. Main already
contains the core managed-recovery implementation and exact sequential proof
validation; retain those copies. The four merge conflicts retain main's offline
export, audit-role fixture setup, proof loader and entitlement successor checks,
plus MON-9's export, alternate database fixture and two explicit empty tables.

LP-5 now requires command registration and stored-effect completion. Register
managed_recovery.elect and classify it alongside other recovery commands in the
watchdog inventory (classification grants no permission); its result adapter reads only the exact same-transaction
election for the command, actor, authorization and case. Repository results are
converted from that stored row through the existing core projection. The latest
0541 result adapter is renamed privately and delegated to for every other command;
its body, including late-source import and all earlier LP checks, is unchanged.
This small delegate avoids copying hundreds of lines of main's policy into MON-9
and keeps the original initial-migration no-replacement assertion. Both the
election audit and terminal receipt use app.lp4_seal_audit with checked trust.
The exact SELECT policy, grant and private delegate are listed in the proof.
No fee, entitlement, live-service or customer-separation policy is loosened.

LATER / SIMPLICITY — packages/db/src/managed-recovery-repository.ts authorize:
its session lookup and owner lookup both check membership. A future shared
session-authority result could remove that repeated query once its caller
contract covers expiry/revocation and SSO; this would reduce maintenance of
parallel authorization predicates. No authority check is removed in this catch-up.

Local catch-up validation, 3 November 2026 (Node 24.17.0, installed Vitest
4.1.12, each run --maxWorkers=1, at most two runs concurrently):
- packages/core: .bin/vitest run --maxWorkers=1 src/watchdog.test.ts
  src/managed-recovery.test.ts — 20 passed.
- packages/db: .bin/vitest run --maxWorkers=1
  test/managed-recovery-repository.test.ts test/migration-proof-loader.test.ts
  — 86 passed. The first attempt found an obsolete owner-lookup SQL double;
  teach the double main's SELECT 1 query, keeping every assertion unchanged.
- packages/db: .bin/vitest run --maxWorkers=1 test/lp-0-catalog.test.ts
  test/lp5-command-catalog.test.ts test/migration-proof-loader.test.ts — 114
  passed. Rebuilding stale core output resolved the initial catalogue failure.
- apps/api: .bin/vitest run --maxWorkers=1 src/watchdog-registry.test.ts
  — 126 passed, including extraction/classification of command literals.
  Initial imports required local builds of core/storage/db/config/ai; those
  builds succeeded. No packages were downloaded. No tests were skipped.
- Root node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit and
  -p packages/db/tsconfig.json --noEmit — passed. Core/storage/db/config/ai
  also compiled successfully to ignored local build output.
- node tools/plpgsql-case-in-if-lint.mjs — 218 migrations checked, passed.
- Lane list compared with MERGE_HEAD 111865cf65f5e68a28ce1891bd52aad0ac7a0f10;
  working files contain no conflict markers or obsolete migration stems.

The initial pnpm commands stalled before reaching their runners and were
interrupted; checks above use the installed package binaries directly. Git's
index remains unmerged by design: only working files were resolved, and the
router must stage them and complete the merge. No fetch, commit, push or PR.

Unproved here: real PostgreSQL compilation, migration upgrades/backfill,
concurrency, privileges/RLS and durable replay; browser journeys; full CI.
The new stored-effect refusal and checked-audit assertions await PostgreSQL CI.
Independent RED review and green CI at the exact resulting head remain required.

Batch-9 local landing validation, 4 November 2026:

- Installed tsc passed core, db, API and web with --noEmit; core, AI, db and API
  also compiled to ignored dist so unit imports used current package output.
- Installed Vitest 4.1.12, every run --maxWorkers=2, at most three named files:
  API watchdog-registry/context-boundary/identity: 278 passed; API fee-collection
  fake-adapter/recovery-message.application: 35 passed.
- DB migration-proof-loader/managed-recovery-repository/financial-reconciliation
  queue repository: 91 passed; proof-loader/managed-recovery/money-trail
  repositories: 94 passed. These are unit/source guards, not database execution.
- Core fee-collection/financial-reconciliation/platform-tax-invoice: 68 passed;
  money-trail-reconciliation/watchdog/managed-recovery: 39 passed.
- AI pursuit-draft: 24 passed. Web recovery-messages: 89 passed.
- PL/pgSQL CASE-in-IF, core purity, money arithmetic, commercial boundary and AI
  provider boundary lints passed. git diff --check MERGE_HEAD passed.
- Initial API watchdog and web UI runs found stale/missing compiled package
  exports; both passed after rebuilding local workspace output. No test weakened.
- Standard lane lint was run and reports incoming-main/stale index paths while
  the merge remains uncommitted. It must be rerun after router staging/completion.
  Direct resolved-tree comparison against MERGE_HEAD verifies the exact lane,
  unchanged main migration bytes, unchanged five successor SQL bodies and valid
  migration order. No config/lanes path is listed in the lane's allow array.

CI must prove fresh and predecessor upgrades, SQL compilation/backfill/replay,
catalog privileges and FORCE RLS, cross-tenant access refusal, LP-5c command
authority, fingerprinted-row-shape, final-account-lock-upgrade and recovery-
pursuit-terms-upgrade, election/collection/reconciliation concurrency, financial
integration and affected phone/desktop browser journeys. Full required CI and
an independent RED PASS at the exact final head remain merge requirements.
No database/browser suite, live provider, real money or release ran locally.
The router stages resolutions, completes the merge, commits, pushes and opens
the PR. This worker ran no git write or fetch command.
