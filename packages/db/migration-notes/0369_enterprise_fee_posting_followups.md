# 0369 enterprise fee posting follow-ups (ENT-7, RED)

Recreates only `app.ef_post_statement`, starting from its latest main definition
in 0337. Retains newest-first compensation splitting: each link consumes only the
uncompensated balance of a same-tenant, same-agreement accrual; insufficient
balance refuses the entire transaction. No historical migration or journal changes.

Restores 0322's `enterprise_fee.statement_post_replayed` event for a fresh command
key replaying a statement with journals, bound to actor, statement, command,
authorization and content hash. Retrying that key returns its durable result with
no further audit. All-zero statements retain a single statement-posted event and
append no replay event, even with fresh keys or racing requests. Journal count,
not net statement total, distinguishes these cases because positive and negative
sections can cancel. Fresh-key command receipts now include the journal count.

No new objects, grants, privileges, RLS policies, or routine identities: LP-0,
SERIOUS-B5, entitlement and privilege expectation unions are unchanged. The
existing upgrade test now starts before 0369 with populated accrual and zero
statements, verifies unchanged rows and security metadata, then migrates twice.
Regressions cover larger-than-latest compensation, repeated reversals, balanced
positive journal amounts, fresh/same-key replays, audit payloads and cross-tenant
refusals. Synthetic data only; production and pilot gates remain closed.

Forward fix only. Preserve existing journals, receipts and audit history; no
backfill of previously omitted replay events. If correction is needed after
installation, use another reviewed forward migration rather than editing history.
Database and browser suites require GitHub CI; this sandbox cannot start PostgreSQL
or bind localhost. Local commands and results are recorded in the commit message.
