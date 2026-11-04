# 0760 — ENT-5 synthetic escalation discovery (RED)

Adds only `infrastructure.discover_extra_escalations()`, executable by the existing
`jobguard_infrastructure` role. No tables, roles, policies or business writes.
The definer is `jobguard_migration`, with a fixed pg_catalog search path. It iterates
`control_plane.tenant` and sets a function-local tenant context for each read, using
the existing FORCE RLS tenant policies rather than bypassing them. PostgreSQL restores
the caller's context at function exit, including errors. Only tenant IDs leave it.

The eligibility query mirrors the latest `app.xa_escalate()` (0158): priced latest
request, no outcome, current incomplete human company step, elapsed server-clock
wait, no escalation fact. It does not read advisory state. Discovery is a hint;
execution rechecks through the unchanged repository and routine. Unique fact keys
and the repository's transaction bind fact and audit across retries and crashes.

No backfill. Existing requests become discoverable when their deadlines elapse.
Synthetic database guard and synthetic worker registration keep production closed.
No delivery or notification is introduced. Forward fix by replacing this discovery
routine only; rollback by disabling these tasks then dropping this routine. Existing
facts and audit events must be retained.

Proof expectations are handwritten from this SQL. LP-0 records the new routine,
owner and worker grant. `upgrade: []` is explicit because the existing upgrade
snapshot covers app/identity/control_plane/audit_control, not infrastructure.
`tenancy: []` is explicit because no relation or policy changes. Integration tests
inspect the routine's grant/owner, discovery and context restoration in PostgreSQL.
CI must run fresh/upgrade, LP-0, tenancy and escalation integration suites; this
sandbox cannot run PostgreSQL. Renumber 0760 at landing if required.

## Landing preparation — 4 November 2026

RED, NOPR. Inspected against the launcher's merged `origin/main` at
`155a3eb0680e1e270bdf2ecfe1e381374b62c889`; local `main` is stale. No unfinished
merge or additional lane files are carried relative to that base. The ENT-5 lane
already lists exactly the eight changed non-lane paths and excludes itself.

No behaviour correction was needed from the landing checklist. This slice adds
no columns, tables, commands, HTTP routes, application services, web modules or
browser specs, and changes no older routine. It introduces no runtime writes to
command receipts, decision resolutions or action authorizations. No empty-table,
command-registry or upgrade-routine exceptions are therefore needed. The new
routine has no arguments or defaults. Its LP-0 owner entry remains required by
the current catalog's non-owner EXECUTE reachability rule: the infrastructure
worker has EXECUTE, while the business runtime does not. SQL and proof stay at
placeholder 0760, unchanged.

Local checks use installed Node 24.17.0, TypeScript 5.8.3 and Vitest 4.1.12, with
`--maxWorkers=2` and at most three named test files per invocation. The scheduling
and context-boundary tests passed together (149 tests); identity passed (7),
watchdog-registry passed (126), and migration-proof-loader passed (76). The first
watchdog run could not resolve the absent `@jobguard/ai/dist` entry; compiling
that dependency with the installed TypeScript runner allowed its unchanged test
to pass. No test weakening was needed. Lane boundary lint and `git diff --check`
passed. The global pnpm launcher stalled before executing checks and ultimately
refused its pinned-version switch after registry fetch/signature verification
failed; no packages were installed. Installed runners were invoked directly.
All seven workspace typechecks passed via `tsc -p <workspace>/tsconfig.json
--noEmit` (config, core, storage, AI, database, API and web).

CI must still prove real PostgreSQL fresh/upgrade catalogs, LP-0 effective
privileges, tenancy/context restoration, crash rollback, concurrent restart,
listed-alternate authority and advisory independence through the escalation
integration suite, plus the required full checks and browser journeys. Local
unit checks are not database or independent-review evidence. An independent RED
review of the exact landing head remains required. Production gates, timing,
proceed and other held policy items remain open; this does not finish ENT-5.

## Batch-c2 preparation — 4 November 2026

RED, NOPR. Base is the already available `origin/main` at `155a3eb06`;
local `main` is older. No fetch or Git write was run. The pending M3-4 merge
conflicted only in the core barrel: both additive exports are retained exactly.
The router must stage the working tree and complete that merge; the read-only
index still reports it as unmerged.

Present slices: ENT-5 escalation worker, ENT-13a staging, M3-3 device cache,
and the pending M3-4 client queue. M3-5 capture states, M4-4 hold alert,
ENT-14 fee mandate and SV-7B accounting are NOT merged; the router takes them next.
This preparation does not finish any aggregate plan piece. Native encrypted
storage/reconciliation/device evidence, live connectors, legal/mandate approval,
retention/provider evidence and release gates remain open as applicable.

Temporary migration stems are 0760 extra escalation discovery and 0761 connector
materials staging; both have proofs. SQL bytes are unchanged. The connector
replacement retains the latest main body (0554), verified by the source proof.
The hardening checklist requires no further product changes in the present slices:
no fingerprinted columns, new commands/routes, services/context constructors,
client DB imports, server modules, browser specs, empty app tables, runtime
commercial-authority writes or older app routine replacements were introduced.
Neither new migration reads command_lifecycle_claim. The discovery LP-0 owner
entry is tracked because its explicit infrastructure EXECUTE grant makes it
reachable under the catalog's existing rule; no owner-only object is added.

The batch lane replaces the four present pieces' lane files and lists exactly
the resulting non-lane paths against origin/main, excluding itself. Standard
lane lint was run and refused the old lane/migration paths still present in the
read-only index. A separate deterministic check using the same exported lane
selection/path/order functions PASSED for the projected working tree, including
exact path equality and migration order. The router must rerun standard lane lint
after staging/committing; the projected check is not that final gate.

Local checks (installed Node 24.17.0, TypeScript 5.8.3, Vitest 4.1.12):
- All seven workspace `tsc -p <workspace>/tsconfig.json --noEmit` checks passed.
  Local dependency dist output was first generated with installed tsc for core,
  config, storage, DB and AI. No package download/install was performed. The pnpm
  version probe stalled and was stopped; installed binaries ran the checks.
- Core `vitest run --maxWorkers=2 src/sync-device-cache.test.ts
  src/offline-client-queue.test.ts`: 78 passed.
- API `vitest run --maxWorkers=2 src/auth/context-boundary.test.ts
  src/auth/identity.test.ts src/watchdog-registry.test.ts`: 278 passed.
- API `vitest run --maxWorkers=2 src/extra-escalation-task.test.ts
  src/connectors/inbound.test.ts src/connectors/sftp.synthetic.test.ts`: 60 passed.
- API `vitest run --maxWorkers=2 src/offline-client-queue.compat.test.ts`: 1 passed.
- DB `vitest run --maxWorkers=2 test/migration-proof-loader.test.ts
  test/connector-intake-proof.test.ts`: 80 passed.
- Lane tool syntax and `git diff --check` passed; no conflict markers remain.

These 497 unit/guard tests do not prove PostgreSQL or device behavior. CI must
prove fresh/upgrade migrations, LP-0 privileges, fingerprinted row preservation,
RLS/tenancy, escalation restart/concurrency/rollback, connector populated upgrade
and adversarial intake, mandatory full checks and affected browser journeys.
Physical-device/native and live-provider gates remain separate. Independent RED
review must bind the exact eventual head. No PR before #549 and batch 10 land.

## Batch-c2 continuation — pending M3-5 merge, 4 November 2026

READY for router staging and completion of the pending merge. The core barrel now
keeps sync-device-cache, offline-client-queue and offline-capture exports as an
exact union, with no new behavior. M3-5 capture specimens and their existing
contract/tests are included. Its incoming lane file is removed; the batch lane
lists all 29 resulting changed non-lane paths against the available origin/main.
M4-4 hold alert, ENT-14 fee mandate and SV-7B accounting remain NOT merged; the
router takes those next. The native capture/storage/device obligations described
in resumable-evidence-v1.md remain open. This does not finish M3-5 or any aggregate
piece. Temporary migration stems/proofs remain 0760 and 0761 without SQL changes.

Reapplied all ten batch-9 hardening rules to the present slices. No new app table,
command, route, service, client DB import, web server module, browser spec,
fingerprinted row column or runtime authority write is introduced. Connector
intake's latest main body is preserved except its existing materials validation
extension, covered by the source test. The replaced connector routine is outside
the app/identity/control-plane/audit-control catalog captured by the plan-upgrade
test, so no exception is needed there. Neither migration reads
app.command_lifecycle_claim. LP-0 owner entries cover the infrastructure-reachable
discovery routine only. No test or guard was weakened.

Validation on this continuation (installed TypeScript 5.8.3, Vitest 4.1.12):
- All seven workspace typechecks passed using installed
  `node_modules/.bin/tsc -p <workspace>/tsconfig.json --noEmit` (core, config,
  storage, DB, AI, API, web). `pnpm typecheck` stalled without progress and was
  interrupted; no dependencies were downloaded.
- Core cache, queue and capture: 84 passed in one three-file invocation.
- API context boundary, identity and watchdog registry: 278 passed.
- DB migration proof loader and connector intake proof: 80 passed.
- API escalation worker, inbound and synthetic SFTP: 60 passed.
- API client queue compatibility: 1 passed. Total: 503 tests passed. Every
  Vitest invocation used explicit --maxWorkers=2 and at most three named files.
- Lane tool syntax and git diff --check passed. Standard lane lint was run and
  failed solely on config/lanes/m3-5-capture-states.json still in the read-only
  incoming merge index. A deterministic projected-working-tree check using the
  tool's exported policy, lane/path and migration-order functions passed. Router
  must stage the removal/export union and rerun standard lane lint after commit;
  the projected result is not that gate.

No Git writes, fetch, database or browser runs were performed. CI still owes the
full required checks, PostgreSQL fresh/upgrade/migration/catalog/privilege/RLS
proofs, escalation concurrency/restart/rollback, connector adversarial upgrade
coverage and affected browser journeys. Native device and real-provider evidence
remain separately held. Independent RED review must bind the eventual exact head.
NOPR until #549 and batch 10 land; no real data, providers, money or release.

## Batch-c2 M4-4 union handoff — 4 November 2026

RED, NOPR. Available origin/main remains 155a3eb06; local main is stale, no fetch.
Resolved the pending M4-4 merge's later-empty-tables conflict as the exact union.
Preserved both sides' behavior. WORM migration/proof stems now follow 0760/0761:
0762 durable commands, 0763 operator recovery, 0764 operator alerts. SQL bytes are
unchanged. The incoming piece lane is replaced by the batch lane. Expanded the
plan-entitlement-lifecycle-upgrade routine catalogue to include worm_control so
its strict successor-proof comparison also checks the newly added operator
routines; no exception or weaker assertion was introduced.

Applied all ten batch-9 hardening rules to the present slices: no fingerprinted
row additions; WORM mutations classified in watchdog; no new dispatcher command
types; no application-context minting, client DB import, new web server module or
browser spec; all three new empty app tables registered; proof arguments use
identity form, and LP-0 owners correspond to tracked objects (no owner entry for
owner-only worm_audit). No runtime command_receipt, decision_resolution or
action_authorization writes, no command_lifecycle_claim joins, and no re-created
older routine beyond connector.intake's latest available main body with the
approved kind-validation extension. No old app routine needs an entitlement
upgrade definition exception. No product behavior or tests weakened.

Validation performed here with installed TypeScript 5.8.3 / Vitest 4.1.12:
- All seven workspace typechecks passed via installed tsc --noEmit (core, config,
  storage, DB, AI, API, web). pnpm typecheck stalled with no progress after its
  startup warning and was interrupted. No packages downloaded.
- 563 focused tests passed: API watchdog/context/identity 278; DB proof loader,
  connector proof and WORM proofs 83; core cache/queue/capture 84; WORM repository
  22; storage WORM/timestamp 35; API escalation/inbound/SFTP 60; API queue
  compatibility 1. Each invocation names <=3 files and uses --maxWorkers=2.
- WORM repository initially failed four tests because local storage dist lacked
  the new exports. Rebuilt storage/core with installed tsc, then all 22 passed.
- Lane tool syntax and git diff --check pass. Standard lane lint was run and
  sees the removed incoming lane and old migration stems in the read-only merge
  index. Router must stage the full union/renames and rerun standard lane lint;
  the projected working-tree policy/path/order check is separate evidence.

LATER / SIMPLICITY (initial review):
packages/db/test/contractor-entitlement-upgrade.integration.test.ts emptySuccessors
repeats table names in the incoming change. A later dedicated cleanup can dedupe
that fixed list or reuse the shared empty-table registry where its historical
boundary matches, reducing maintenance drift. This does not block this union.

Still open per piece: ENT-5 aggregate timing/proceed-policy and production gates;
ENT-13a domain promotion, real endpoints, Q2/H1, Q3, Q4, Q7 and G5; M3-3 encrypted
native persistence, real PowerSync policy/deployment, D08/G3 and device evidence;
M3-4 durable encrypted queue, reconciliation UI and reconnect/reinstall evidence;
M3-5 encrypted native media/capture wiring and airplane-mode/restart/storage
acceptance; M4-4 D07, actual production object-store/RFC-3161 evidence and release
gates. ENT-14 fee mandate and SV-7B accounting branches are NOT merged; router
takes them next. ENT-14 legal/founder approval and mandate acceptance, and SV-7B
connector-specific contract/G1/D04/D12 evidence remain open.

CI must prove full required checks, fresh/upgrade PostgreSQL migrations and
fingerprint preservation, effective privileges/LP-0, RLS and tenant isolation,
escalation concurrency/restarts/rollback, connector adversarial upgrade tests,
WORM command/recovery/alert atomicity, bootstrap privilege checks and local MinIO
behavior, and affected browser journeys. No DB or browser suite ran here.
Independent RED review must bind the eventual exact head. NOPR until #549 and
batch 10 land. No real data, live providers, money, PR or release.


## Batch-c2 ENT-14 union handoff — 4 November 2026

READY, RED, NOPR. Resolved pending ENT-14 merge `653c52d7d` as an exact
working-tree union. Retained cache/queue/capture exports and added the mandate
export. Restored all nine platform-tax-invoice files byte-for-byte from HEAD;
the incoming older branch's deletions must not remove main's invoice behavior.
No new behavior or weakened tests. Router must stage ALL working-tree files,
including the restored untracked core invoice source/test, and complete the merge.
SV-7B accounting is NOT merged; router takes that branch next. ENT-14 is resolved
in the working tree but not merged until that router action.

Removed the ENT-14 piece lane; batch-c2 owns the exact 58 resulting non-lane
paths against available origin/main (`155a3eb06`). Local main is stale. The
projection compares file bytes with origin/main so the read-only index's deleted
but restored invoice files do not create false final changes. No fetch or Git
writes. Migration stems/proofs remain consecutive 0760 through 0764, in dependency
order; no new mandate migration. Landing renumbers them again.

Applied all ten batch-9 rules to the resulting union: no fingerprinted table
columns added; WORM methods remain classified, no new command types; no new
application context construction, client DB imports, web server modules or browser
specs; WORM empty tables remain registered; routine proof identities omit DEFAULT;
LP-0 owners cover tracked reachable objects; no runtime authority-table writes or
new command_lifecycle_claim reads. Connector replacement retains the latest main
body with only its intended validation widening. No additional routine exception
is needed. Existing guards are unchanged. The earlier initial-review LATER /
SIMPLICITY observation above remains the sole simplification observation.

Validation with installed TypeScript 5.8.3 and Vitest 4.1.12:
- All seven workspace tsc --noEmit checks passed (config, core, storage, db, ai,
  API, web). pnpm typecheck stalled after its wrapper warning and was stopped;
  the aggregate wrapper is not claimed as passing. No packages downloaded.
- 607 tests passed, each invocation --maxWorkers=2 and at most three named files:
  mandate/contractor-mandate/restored tax-invoice 44; context/identity/watchdog
  278; migration-proof-loader/connector proof/WORM proofs 83; cache/queue/capture
  84; escalation/inbound/SFTP 60; WORM repository 22; storage WORM/timestamp 35;
  API queue compatibility 1. An initial attempt at the root Vitest bin failed
  because no root bin exists; all actual runs used installed package-local bins.
- Core purity, money arithmetic, PL/pgSQL CASE lint, lane tool syntax and
  git diff origin/main --check passed. Working-tree lane paths and migration
  order/proof pairing were checked separately. Standard lane lint was run and
  fails on the removed incoming lane and restored invoice paths still in the
  read-only merge index. Router must stage the union and rerun the standard gate.

Still open: ENT-5 aggregate timing/proceed-policy, PostgreSQL and production gates;
ENT-13a domain promotion, real endpoints, Q2/H1, Q3, Q4, Q7 and G5; M3-3 encrypted
native persistence, actual PowerSync policy/deployment, device evidence and D08/G3;
M3-4 durable encrypted queue, reconciliation UI and reconnect/reinstall recovery;
M3-5 native encrypted capture/wiring and airplane-mode/restart/storage acceptance;
M4-4 D07, actual production object-store and RFC-3161/provider evidence; ENT-14
persisted mandate/collection integration, full acceptance, solicitor review,
contract set, notice process, D12/D16 and Ben's dated approval. SV-7B accounting
is absent; connector contract tests and G1/D04/D12 evidence remain open.

No database or browser execution here. CI owes full required checks,
fresh/upgrade PostgreSQL migrations, fingerprint preservation, effective
privileges/LP-0, RLS/tenant isolation, escalation concurrency/restart/rollback,
connector adversarial intake/upgrade, WORM authorization/recovery/alert atomicity,
bootstrap privileges, local MinIO and affected browser/contractor acceptance.
Independent RED review binds the eventual exact head. Production native/device,
provider and legal approvals are separate. NOPR until #549 and batch 10 land.
Made-up data only; no real money, provider execution, PR or release.


Batch-c2 final SV-7B union handoff — 4 Nov 2026

READY for the router to stage all working files and complete pending
origin/codex/sandbox/sv7b-accounting (3bd0f641db). The other seven named
slice tips are ancestors of HEAD. Both conflict files keep the exact union;
SV-7B adds its receipt without dropping existing migration notes or empty-table
entries. Its migration/proof stem is now 0580_accounting_observation_receipt;
0760–0765 are consecutive and paired with proofs. No Git writes or fetch ran.
The pieces' lane files are removed; the batch lane lists exactly 68 final
changed non-lane paths against the available origin/main (155a3eb06). Local
main is stale, so it is not used as the current integration baseline.

All ten batch-9 rules and both #549 additions checked for this scope. No new
fingerprinted-row columns, routes, client imports or web server modules are
introduced by the union. No new command registry entry is needed for the
synthetic receipt seam. Existing WORM method classifications remain intact.
Connector intake starts from main's latest 0554 body, retaining validation,
serialization and LP-4 audit sealing; only materials staging extends it. No
migration-owned routine joins command_lifecycle_claim. LP-0 tracks the new
receipt relation because shadow has non-owner SELECT/INSERT grants; its owner
entry is therefore retained. Proof identities have no DEFAULT expressions.
No product runtime writes to the three LP-5c protected tables are introduced.
Existing exact routine-upgrade handling remains unchanged. The initial-review
LATER / SIMPLICITY observation above is retained without adding another.

Validation actually executed in this run: direct installed TypeScript 5.8.3
tsc -p tsconfig.json --noEmit PASS in config/core/ai/storage/db/api/web.
pnpm typecheck produced only its wrapper warning, stalled and was interrupted;
its aggregate result is not a pass. Installed Vitest 4.1.12 with maxWorkers=2,
at most three named files per run: DB migration-proof-loader, accounting receipt
and WORM proofs 83; API context-boundary, identity and watchdog-registry 278;
API accounting connector, escalation and inbound 58; core device cache, queue
and capture 84; core enterprise fee mandate 11; DB WORM repository and connector
proofs 26. Total 540 passed. One supplied additional contractor mandate test
path matched no file; the actual core mandate file ran and passed. No tests
were weakened. Core purity (with existing computed-import notices), money
arithmetic, PL/pgSQL CASE lint and git diff origin/main --check PASS.
Standard lane lint executed and fails solely on the obsolete incoming lane,
0609 SQL and 0609 proof paths still present in the read-only merge index.
Projected final file-based lane comparison passes with 68 exact paths.
Router must stage all changes, finish the merge and rerun the standard gate.

SV-7B accounting now includes durable synthetic receipt tests and remains
server-disabled for live use; connector G1/D04/D12 approvals and real-data
acceptance stay open. All seven other pieces retain their open work listed
above. No database/browser suite ran. CI must prove fresh/upgrade migrations,
LP-0/catalogues/privileges/RLS, fingerprint preservation, accounting durable
replay/races/rollback/isolation, escalation and connector upgrade behavior,
WORM/MinIO and affected browser journeys, alongside required full checks.
Independent RED review must bind the eventual exact head. NOPR until #549 and
batch 10 land. Device/provider/legal approvals remain separate release gates.


Batch-c2 PR-opening handoff — 4 November 2026, current run

READY for the router to stage everything and complete the pending main merge
(MERGE_HEAD 620958206d30f85b467393cb40c9b92e6d4b47a4). This instruction supersedes
older NOPR/#549/batch-10 waiting notes above: the group's turn is now authorized.
The two remaining conflicts preserve both contract sections and the union of all
empty-table entries. No behavior was added. The previously removed SV-7B lane
file is restored byte-for-byte from origin/main, ready for staging, rather than
deleting another piece's registration. No git-writing command or fetch ran.

Landing stems, in existing dependency order: 0575_extra_escalation_discovery,
0576_connector_materials_stage, 0577_worm_durable_commands,
0578_worm_operator_recovery, 0579_worm_operator_alerts,
0580_accounting_observation_receipt. SQL bytes are unchanged; companion proofs,
notes and full-stem references follow the renames. Historical number-only notes
above describe earlier runs. The batch lane lists all 68 final changed non-lane
files against current origin/main and excludes itself.

Validation actually run here:
- pnpm typecheck and two pnpm test wrappers produced only a wrapper warning and
  stalled before the tools started; interrupted them. No aggregate pnpm PASS.
- Installed TypeScript 5.8.3: tsc -p <package>/tsconfig.json --noEmit PASS for
  config, core, storage, ai, db, api and web. Rebuilt core with the same compiler
  to refresh stale generated imports before rerunning watchdog coverage.
- Installed Vitest 4.1.12, --maxWorkers=2, <=3 named files per run: DB migration
  proof loader/WORM proofs/connector proof 83; API watchdog/context/identity 278;
  API accounting/escalation/inbound 58; API SFTP/queue compatibility 18; core
  device cache/queue/capture 84; core enterprise fee mandate 11; DB WORM
  repository/accounting receipts 26; storage WORM/timestamp 35. Total 593 PASS.
  The initial watchdog run failed on stale core dist; source already contained
  every classification, and rebuilding core made the unchanged guards pass.
- Commercial-integrity boundary and current-source guards PASS (90 roots, zero
  diagnostics, nine existing baselines); no new fingerprint allowances needed.
  PL/pgSQL CASE, core purity and money arithmetic guards PASS; core purity
  reports ten existing computed-import notices. git diff origin/main --check PASS.
- Standard lane lint executed and reports obsolete old-stem paths, the prior
  SV-7B lane deletion and incoming main paths from the unfinished merge index.
  This is not a gate PASS. Final worktree path comparison independently confirms
  all 68 paths match the lane exactly; the six consecutive migration stems all
  have proofs. Router must stage all changes, finish the merge and rerun standard
  lane lint against main. The read-only index still records the resolved conflicts.

All batch-9 hardening rules inspected for branch-owned scope. No fingerprinted
row was widened; no new route, dispatcher command, browser journey or web module
is introduced by this group. Existing WORM method classifications remain. No
migration-owned routine reads command_lifecycle_claim, no runtime entrypoint is
named ent5_%, and audit payloads follow existing references/hashes sealing.
The accounting trigger reuses an already recorded routine; there is no new
trigger routine needing a record. No runtime writes to LP-5c protected tables,
new client DB imports, DEFAULT-bearing proof identities or older app-routine
replacement requiring an upgrade exception are introduced. The existing initial
LATER / SIMPLICITY entry above remains the sole initial-review observation.

Still open for every counted piece (none is declared finished):
- ENT-5: aggregate timing/proceed-policy and held policy items, pack verification,
  PostgreSQL escalation restart/race/rollback evidence and production scheduling.
- ENT-13a: domain promotion, credential rotation, real endpoint/conformance and
  unknown-outcome evidence, held policy decisions and G5. This slice stages facts.
- M3-3: encrypted device persistence, deployed PowerSync policy/region, independent
  provider download authorization, physical-device evidence, D08 and G3.
- M3-4: durable encrypted native queue, upload wiring, reconciliation UI and
  reconnect/reinstall/device evidence. This slice supplies pure queue rules.
- M3-5: encrypted native capture/media transport, device restart/airplane-mode/
  low-storage evidence, gateway wiring and G3. This slice supplies capture states.
- M4-4: actual configured-store retention/hold evidence, production TSA route,
  approved D07 policy/operations and production release evidence. Local MinIO CI
  is separate from production S3 proof; this slice supplies hold alerts/recovery.
- ENT-14: persisted agreement/mandate authority and collection integration,
  full lifecycle acceptance, solicitor-reviewed contract set, notice process,
  D12/D16 and Ben's dated approval. The pure synthetic mandate enables no rail.
- SV-7B accounting: connector-specific G1/D04/D12 approvals, approved real route,
  immutable-source verification, durable downstream crash recovery and live
  acceptance. Receipts claim at most once; live connector stays disabled.

No database or browser ran in this sandbox. CI must prove all required checks,
fresh/upgrade migrations and rollback/forward-fix behavior, unchanged populated
fingerprints, LP-0/catalogues/privileges/RLS, accounting replay/races/rollback and
tenant/job isolation, escalation authorization/restarts, connector upgrade and
adversarial intake, WORM authorization/recovery/alert atomicity, local MinIO,
affected browser journeys and contractor acceptance. RED review must bind the
exact resulting head before merge. Real services, data, money, native-device and
legal approvals remain separate; made-up data only throughout this run.
