M5-8 registry — RED (key custody / tenant isolation)

0486 adds append-only tenant_key_version and tenant_key_revocation metadata. No
private key bytes, external KMS references, live provider or business runtime
capabilities are introduced. Both tables have tenant-qualified keys and forced
RLS; only the migration/assurance role can access them. The immutable helper is
private. Existing SQL routines and migrations are unchanged.

SyntheticTenantKeyRegistry is dark and explicitly enabled only against
jobguard_synthetic_demo; production is refused. It requires a server-verified
tenant context and an assurance connection. No service configuration is changed.
Lifecycle commands and synchronous fake crypto share a per-tenant transaction
lock. Key status is read on every use. Older unrevoked versions can verify/unwrap;
only the newest can sign/wrap. Revocation blocks every use, including verification.
A replay returns its original version but cannot make that version usable again.
Command conflicts fail; audit and lifecycle writes commit together. Fingerprints
cannot be registered to another tenant. Callbacks are trusted fake local crypto,
not a live provider or an authentication boundary. Existing standalone in-memory
KMS and audit-export signing remain separate synthetic harnesses; this piece does
not claim to migrate or enable those application paths.

No data backfill. Forward fix only: preserve all registry and audit rows, disable
composition if necessary, and apply a later migration. Do not remove revocations
or decrement versions. A restored backup must preserve the latest revocation
registry before any key use is enabled; an older backup cannot establish current
key authority. Restore stale data into a quarantined environment and reconcile
with authoritative registry state. Loss of the latest revocations is a hold, not
permission to use old material. Retain fake custody material independently of
registry metadata to decrypt permitted retained fixtures after rotation.

Local checks and limitations are in the issued commit message. The PostgreSQL
integration suite covers populated upgrade, idempotent migration, new pools after
revocation, rotation, wrong keys, cross-tenant access, concurrent command replay,
append-only enforcement and runtime refusal. It must execute in CI: this sandbox
cannot start PostgreSQL. This registry slice does not complete all M5-8 topology,
live KMS, backup/restore or commercial acceptance requirements.
