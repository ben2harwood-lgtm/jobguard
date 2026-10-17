# ENT-6B — provisional 0181

Additive synthetic contractor billing persistence. No existing column, routine, policy or grant is changed. SQL bytes remain unchanged when the dispatcher renumbers this migration at landing.

Creates ten FORCE-RLS, append-only business tables; runtime receives SELECT only. Seventeen new `cb_` routines are migration-owned, pin `search_path=pg_catalog`, revoke PUBLIC, and expose ten checked entry points. Actor comes from the persisted contractor session, with an active finance tenant grant. No provider or fee activation.

Forward fix: keep all immutable facts and append a new checked derivation version/migration. Disable the billing API/executor while correcting an issue. Do not drop tables, alter historical artifacts, delete facts or turn uncertain deliveries into retries. A pre-deployment restore is an operational recovery choice, not an automatic rollback script.

Upgrade proof installs all migrations before this suffix, snapshots populated named columns/full types/row identities, applies this migration alone and compares existing schema/privileges/functions, then runs all later migrations twice. Controls detect a microsecond edit and type change, and permit later nullable columns, replaced functions and inserted rows. Database execution remains required in CI; source inspection is not a migration pass.
