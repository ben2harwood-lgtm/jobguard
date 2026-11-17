# 0777 — M4-10 synthetic owner document read (RED)

Adds only app.platform_invoice_read(t uuid, digest text), owned by jobguard_migration with a pg_catalog search path. Runtime gets EXECUTE only. The routine delegates current synthetic company-session and tenant checks to mon1_company_actor, then requires the returned active membership to be an owner. It reads stored documents in issuer/sequence order; no financial state, audit rows or collection work is written. No table or existing routine changes.

Fresh/upgrade catalogue, RLS, grants, removed/revoked membership, foreign tenant and no-write assertions must run in CI. The explicit proof records the routine and runtime authority; no new relations or tenancy changes. Forward fix: remove runtime EXECUTE to disable reads, then replace this routine in a later migration if needed. No document rollback or deletion. D02 approval and live issuing remain closed.
