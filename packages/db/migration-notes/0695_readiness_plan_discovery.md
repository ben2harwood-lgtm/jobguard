# 0695 readiness plan discovery — M2-6, RED, synthetic only

Adds only `infrastructure.discover_readiness_plans()` and its EXECUTE grant to
`jobguard_infrastructure`. It emits at most 100 tenant/job/task identifier triples
for latest confirmed plan revisions, never actors or fact payloads. No table,
role, existing routine, programme or commercial record changes.

The definer uses the existing migration owner's tenant-specific policy with
FORCE RLS still active, iterating control-plane tenants and saving/restoring the
caller's `app.tenant_id` through `set_config`, including the exception path.
No function-level app setting is installed. Business reads and proposals still
use the runtime pool and the existing worker queueContext.

Forward fix: add a later migration. To disable this synthetic path, stop its
practice discovery schedule; retain stored plans and proposals. No data deletion.

CI must prove fresh/upgrade catalogue equality from the explicit proof fragment,
EXECUTE-only access, RLS and caller-context restoration, and the new real-database
worker-task regression. No database was available in this sandbox.

The authorized 4 November scheduler repair evaluates on the preceding workday
at the configured local time, skipping weekends and the plan's calendar holidays.
The timer acceptance regression is unchanged. This migration does not finish M2-6. Real providers,
held-out evaluation, G2 and all live gates remain closed.
