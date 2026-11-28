# 0785 rate item includes text (CC-I1, Enterprise R1 F1)

Adds `app.sor_item_includes` and one runtime entry point, `app.import_sor_version_v2(uuid,jsonb)` (`sor-version-record.v2`). The table holds an optional "what this rate includes" text, 1 to 1,000 characters, for one rate item of one rate-list version, keyed `(tenant_id, version_id, code)` with a composite foreign key to `app.sor_item`. It has forced RLS with the LP-11 bound-tenant policy, is owned by `jobguard_migration`, gives the runtime SELECT only, and rejects UPDATE, DELETE and TRUNCATE. A CHECK binds `includes_sha256` to the text; the routine computes the hash itself.

The v2 routine is v1's latest body (0749: binding prologue, practice-database refusal, tenant lock, `contract.manage`, MON-8 `work_orders` feature, replay and conflict on the shared `sor_version.command_id`) plus the includes rows. The version still cannot commit without its `contractor.sor_version.imported` audit event (0110 deferred trigger); the v2 audit payload carries the document hash and an includes hash, never the text. `app.import_sor_version` (v1) is not changed. No existing table, column, grant, policy or row changes.

Upgrade: existing rate items have no includes row and read as having no text (`sor-item-includes.integration.test.ts` imports through v1 before 0785, applies it, and compares the items byte for byte). The proof is `test/migration-proofs/0785_sor_item_includes.proof.json`. The table is registered in `test/later-empty-tables.ts`, and `purchase-order-audit` defers 0785 with LP-11 because it uses the bound-tenant policy.

Forward fix only. To withdraw, ship a successor that revokes EXECUTE on (or drops) `app.import_sor_version_v2` and keeps the rows as history; v1 imports go on working. Made-up data only; Gate G1 stays closed.

Numbering: 0785 was reserved at dispatch. 0784 is reserved for CC-S1 on another branch, and this migration does not depend on it. The runner allows gaps between numbers, so this branch runs as it is.
