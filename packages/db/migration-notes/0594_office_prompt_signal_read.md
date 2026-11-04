# 0594 office prompt signal read — ENT-8a (RED)

CREATE-only additive function; no table, trigger, existing routine, origin, fee, inbox or notification changes. Runtime EXECUTE only, migration ownership, SECURITY DEFINER with pg_catalog search path. It calls lp_authority(session, job, 'detail') before querying and uses transaction-local app.tenant_id. No business-table grants change.

Two required UUID arguments identify session and job. Optional limit (default 50, maximum 100) and after UUID support pagination, using (recorded_at, signal id) order. Cursor lookup is tenant/job scoped. Items contain exactly promptId, variationId, recordedAt; nextCursor is an opaque signal identity. Dismissed matches remain visible. No backfill; reads include existing signals.

Proof expectations are authored from this SQL, never derived from a database. LP-0 adds only the runtime entrypoint, owner and protection record; upgrade adds only this routine; tenancy changes are empty. CI must exercise fresh install, upgrade proof/catalogue comparisons, real authority/revocation and fee invariants, plus headless mobile-360 and desktop rendering. Local checks do not prove PostgreSQL behavior.

Forward fix with a new migration if needed; disable the additive route/page for application rollback. No destructive rollback. Existing gates G0–G5 remain closed. ENT-8a remains open: end-of-job check waits on Ben's card jobguard-ent-8a-completion-2026-11-03; Possible extras navigation is owned by ent-8a-inbox/router.
