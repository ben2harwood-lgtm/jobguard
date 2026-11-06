# ENT-13a machine connection (RED, dark)

This batch reserves `0620_contractor_job_finish` then `0621_connector_machine`. Additive only; no fingerprinted
row changes, backfill, login, role membership, credential, endpoint or activation.
New connector control-plane tables are private, FORCE RLS, migration-role-only;
these are the same restricted identity lookup exception as connector.binding.
The new NOLOGIN machine role cannot execute legacy intake or any member routine.
The trusted in-process transport verifies HMAC before using the restricted SQL pool;
SQL separately authenticates a fictional binding token and rechecks current authority.
A compromised transport/SQL credential is outside the HMAC request trust boundary.

Connection lock precedes binding; command lock precedes both; nonce lock precedes
source namespace; audit head is last. Revocation/rotation take the connection update
lock, so a request ordered after them sees the new authority. Capability versions and
command receipts are immutable. Nonces persist at least ten minutes (no deletion);
reusing an expired nonce updates expiry after fresh timestamp/signature validation.
Keys are fixture labels only; raw signing bytes exist solely in injected test stores.
Rotation shortens every older key to at most 24 hours, never extending an older cutoff.

CI must run connector-machine.integration.test.ts (real PostgreSQL including immediate
predecessor upgrade, repeat migration, owner/tenant isolation, nonce concurrency,
capability/version, expiry, rotation, revoke/disconnect and rollback), existing
connector-intake.integration.test.ts, test:db, test:migrations, LP-0 grant freeze,
upgrade/context guards and required general suites. Local transport tests are not SQL
proof. Independent RED review at the exact pushed head is required before landing.
No browser flow changes: unregistered controller, no listener or module composition.
Forward fix: keep composition absent, preserve connections/receipts/audit and apply an
additive corrective migration. Do not drop historical evidence as rollback.
