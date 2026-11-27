# 2028 (reserved as 2017) — V2-K2A builder calendar link (RED)

Local V2 only: the migration is a no-op outside jobguard_v2_local or without
2001's v2_practice_firm policy. Bootstrap applies it after 2020 (before the 2025, 2027 and 2047 lines; it depends on none of them). Numbered above the base by tools/migration-renumber.mjs; the merge renumbers it again if needed.

One append-only table, `app.v2_calendar_feed_revision`. Version 1 creates a
link and stores only the SHA-256 of a 256-bit server-made token. Refresh rows
save a new copy of the plan's dated tasks; a revoke row ends the link for good.
The copy holds task title, trade, date, duration, assignee text as written and
the job address. No prices, notes, photos or findings are read or stored.

Runtime: SELECT and INSERT only, FORCE RLS, the 2002 to 2020 tenant and job
visibility predicate (so the second practice firm sees nothing through 2001's
restrictive job policy). No UPDATE, DELETE or TRUNCATE.
The table also carries its own restrictive `v2_practice_firm` policy (FOR ALL,
jobguard_runtime only, one mandatory join to app.job on (tenant_id, job_id)), so
the V2-FL guard (2047) counts it as firm-locked.

One owner-run reader, `app.v2_calendar_feed_read(token_hash)`, finds a live link
by hash before any tenant binding exists (a calendar app has no session). It
reads this table only, never a job, quote or plan table, and returns only the
feed id, the saved copy and its time. Unknown, malformed or revoked: NULL. The
owner policy that lets it find the row is SELECT-only and covers this table only.

Design choice (Ben, 25 Nov 2026 20:02 UTC): a saved copy updated by the builder,
rather than a live anonymous read, so no access path to business tables is added.

Expand-only. Restart bootstrap is safe. Forward fix preferred. To roll back,
remove the Work tab mount and the feed route; keep the rows and audit history.

The copy comes from the same signed-in plan read as the Work tab. Plan creation
on that path is c3's and appends its own `v2_work_plan.generated` event.
No c2/c3 source is changed.
