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
