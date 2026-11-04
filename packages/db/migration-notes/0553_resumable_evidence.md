M3-5 server slice — RED, dark synthetic transfer only.

0419 adds append-only, tenant-qualified synthetic upload chunks. Existing upload,
object, proof and audit tables retain their contracts. There is no backfill.
RLS is forced; runtime receives SELECT/INSERT only. Inserts also require a pending,
unexpired upload on a server-labelled synthetic job. No provider is installed.

Forward fix: disable all callers (the service already defaults off); leave the
additive table in place. Do not remove existing upload/object history. No production
retention/deletion policy is implied by this synthetic implementation. Fresh install,
upgrade, real-role grants/RLS and lifecycle tests must run in CI; this sandbox cannot
start PostgreSQL. There is no PL/pgSQL conditional in this migration.
