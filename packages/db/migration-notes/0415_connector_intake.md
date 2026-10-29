# 0415 — ENT-13a slice 1, RED, dark connector intake

Adds the separate `connector` schema, `jobguard_connector` NOLOGIN role, two FORCE-RLS
tables and one SECURITY DEFINER intake routine. No existing table, function, privilege,
human membership, data or protected context bridge changes. The machine role receives
no app schema usage or table access. Migration provisions no bindings or login roles.

Only admin-provisioned expiring fake bindings can stage fictional source facts. The
binding is the narrowly reviewed identity/control-plane lookup exception; event RLS
uses its authenticated tenant. Raw caller tenant context cannot select the tenant.
Both new tables have tenant keys; events have a tenant-qualified binding foreign key.
No origin, price, approval, statement, hidden data, bill or ledger path is added.

The immutable event, first receipt and existing tenant audit chain commit atomically.
Lock order: binding SHARE, source-namespace advisory lock, audit head last. Revocation
and rotation wait for in-flight intake. No business locks follow the audit head.
Replaying after a lost acknowledgement returns the first result; revoked, expired or
rotated credentials are checked before replay. Reordered/reversed statuses are staged
facts with zero domain effects, never settlement overrides.

Forward fix only: preserve source receipts and audit history. If a defect is found,
revoke affected bindings, stop intake and ship a reviewed forward migration; do not
remove the schema, role or source rows. Real endpoints remain unregistered and G5 held.

CI test: `packages/db/test/connector-intake.integration.test.ts` applies all predecessor
migrations, preserves a populated account and its existing table metadata, applies 0415
alone, then runs the migration runner twice. It checks real role privileges, RLS,
concurrent duplicate identity, key/token rotation, revocation/expiry, changed payloads,
reordering, reversal facts, tenant spoofing, malformed/oversized input, forbidden
command types and statements/shadow access. Database/browser tests cannot run in this
sandbox and are not claimed executed here. No browser workflow changes.
