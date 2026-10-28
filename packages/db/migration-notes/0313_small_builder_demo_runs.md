# 0313 — DEMO-S / DEMO-I lifecycle metadata (RED)

Adds three tenant-qualified, FORCE-RLS tables for run attempts, immutable command receipts and report snapshots. Runtime has no direct table privileges. One closed routine reuses `mon1_company_actor` to verify the persisted synthetic company session, current membership and tenant context before every read/replay, including after its company lock wait. Run ownership additionally binds membership and the exact session digest. Practice-cookie authority is insufficient. Database must be `jobguard_synthetic_demo`.

Every family currently creates a blocked attempt with a plain persisted reason. No domain job or isolated company is bootstrapped, no source completion facts are accepted, no hidden relations are queried and no money or trial outcomes are recorded. Reset archives only this metadata and creates one same-company successor; it does not cancel work, alter bills, remove history or release consumed trial keys. Historical receipts and snapshots stay intact. Metadata mutations append hash-only command audit events in the same transaction; audit head is the final contending lock.

No backfill or predecessor changes. Migration discovery already includes numbered files after 0164. Fresh-install/adversarial suite: `test/small-builder-demo.integration.test.ts`; populated own-step and repeated-runner suite: `test/small-builder-demo-upgrade.integration.test.ts`. PostgreSQL execution is deferred to CI because the issued sandbox cannot start PostgreSQL or bind ports.

Forward fix: keep these rows and identifiers; repair with a later migration. Disable application composition if necessary. Do not drop tables or rewrite snapshots/receipts. There are no provider, environment configuration or production release changes.
