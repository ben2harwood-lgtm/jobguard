# LATER-SAFETY-10 — dark order session authority (RED)

Adds only `app.order_attestation_actor(uuid,text)`, migration-owned SECURITY
DEFINER with `search_path=pg_catalog`. Runtime receives EXECUTE on this read-only
wrapper; PUBLIC and infrastructure do not. The private identity bridge remains
ungranted to runtime. The wrapper checks the synthetic database, uses the existing
`app.mon1_company_actor` session/company bridge, then requires a current owner
membership (not revoked or expired). The repository invokes it under its existing
order lock before stored command identity/replay; stored request hashing is unchanged.
No table, column, row backfill, policy, or existing routine is changed. LP-0 grant,
owner, call-path and upgrade expectations are new named entries in this migration's
proof. No new policies exist, so no policy-role entries are needed.

The executor wraps the SQL live check in a savepoint so PostgreSQL refusals can
become one transactional cancellation/audit outcome. Only WatchdogError
JOB_NOT_LIVE/JOB_NOT_FOUND become false; other failures still throw for retry.

Forward fix: replace/revoke only this wrapper in a later reviewed migration;
never rewrite applied SQL or attestation/audit facts. Removing the wrapper while
this caller is installed fails closed. Existing order rows need no conversion.

Local evidence and pending CI are recorded in the router commit message. CI must
prove real session predicates, RLS/ACL/owner/search_path, upgrade/fresh install,
concurrent replay, and cancellation without an aborted transaction.

Named holds for landing: current reconciliation and CI gates are recorded in
0646_retention_timer_runtime_rules.md. Runtime
raw INSERT on the attestation table (hold 2) and production LP-5 lifecycle adapter
remain held. No HTTP route, real merchant/provider, fee store, D-decision or
G0–G5 change. Exact-head independent RED review and green CI are still required.
