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
