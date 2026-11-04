# 0746 — ENT-5 synthetic escalation discovery (RED)

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
sandbox cannot run PostgreSQL. Renumber 0746 at landing if required.

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
placeholder 0746, unchanged.

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
