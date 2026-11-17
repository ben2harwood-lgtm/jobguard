# 0195 — CH-7-REST-A approved F21 explanation

Authority: issued 18 October 2026; coordinator ruling 108. Practice data only.
Depends on merged #269 (0188) and the current base 5284aa2c.

Replaces only app.guard_recovery_eligibility_v3() and app.require_recovery_eligibility_v3_effect(), sourced from 0188_practice_supplier_credit.sql. New F21 header and line reasons require the hash-pinned approved constant and false held flags. Zero Q, principal net 9000p, null source, existing policy labels and all non-F21 paths remain unchanged. No table, column, trigger, grant, owner, signature, RLS or historical-row changes; no backfill.

Installation is transactional. Installation failure rolls back; after installation use a reviewed forward fix retaining historical results and compatible readers. Do not restore older permissive guards. No new environment variables, provider or alert.

Own-upgrade proof seeds nonempty F21, F19 and v1 history before N, snapshots canonical PostgreSQL values/types/identities and security metadata, applies N alone, and compares. Only the two named bodies may differ, with an exact four-edit normalization check. Later migrations and a second runner pass preserve named original rows. Tests include corruption controls and legacy replay/new-review behavior. Fresh install and raw malformed runtime writes are covered by the two new integration files. Written first, PostgreSQL NOT RUN locally; CI must execute both explicitly. Migration number is dispatcher-renumberable at merge.
