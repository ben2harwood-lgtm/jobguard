# 0610 — retained synthetic rate acceptances

Adds only `app.read_rate_suggestion_acceptances(text,uuid)`: pinned search path,
migration owner, runtime EXECUTE, no PUBLIC access or direct table grant.
The tenant context and persisted human session must agree; the existing current
small-builder owner membership covers the job. Other tracks and tenants fail closed.
Returns immutable acceptance identity, actor membership ID, timestamp, hashes,
policy and source observation/revision provenance. No commercial writes.

Forward fix: replace this routine with a reviewed migration. Rollback: revoke
runtime EXECUTE and drop this routine; retained observations are preserved.
CI must prove fresh/upgrade catalogs, RLS/privileges, session refusals and row
preservation. No PostgreSQL execution was possible in the local sandbox.
