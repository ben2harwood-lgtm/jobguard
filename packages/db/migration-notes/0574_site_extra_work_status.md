# 0574 — site extra work status (ENT-3, RED)

Adds an empty immutable `site_extra_work_status` table. No backfill: v1 and
free-text logs preserve their current behavior. The strict priced v2 boundary now
requires not_started, under_way or finished; no client actor, time, price or
permission is accepted.

`ent3_work_status` writes only during the still-processing LogSiteExtra's own
transaction, bound to its origin, operative and lifecycle claim. The log seam
records status after server pricing and before completion. A status audit event
uses lp4_seal_audit after all business writes. The existing request hash includes
status, so exact replay returns the original log and changed status conflicts.
Updates/deletes are refused, including by the table owner. Runtime has EXECUTE
only, with forced RLS, tenant-qualified references and scoped supervisor reads.
The existing supervisor-queries GET returns additive workStatuses for the existing
/site/extra list; no new endpoint, permission or status editing workflow.

`ent3_proceed_comparison` reads the work order's bound contract/rule version and
uses sor_line_net_pence and xa_requirement, matching submission. It returns only
within/above; NULL (unpriced) is above. The displayed preview may become stale;
submission still evaluates its own rules. Neither comparison nor statement grants
permission or supplies work timing, preapproval breach, approval, origin, fees or
meter data. Finished above the limit is accepted, and later approval preserves the
statement and requirement comparisons.

The proof file explicitly declares LP-0, upgrade and tenancy changes from reviewed
SQL, never a live catalogue. No existing routine body or migration is replaced.
At landing, renumber this reserved migration if needed. Forward fix any defect;
do not remove recorded statements. No production activation or provider calls.

Local unit/typecheck evidence is in the router commit-message receipt. Fresh and
upgrade PostgreSQL/catalogue/tenancy/privilege, real authorization/transaction,
audit and replay/concurrency tests, plus headless mobile-360/desktop ENT-3 browser
coverage, must run in CI. They cannot run in this sandbox. Independent RED review
must bind the exact head; all release gates remain closed.
