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
