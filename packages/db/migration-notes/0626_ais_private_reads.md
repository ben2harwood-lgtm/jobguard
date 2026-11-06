# LATER-SAFETY-3: private AIS reads

RED: bank information and tenant/actor authorization.

Searching apps/api/src, apps/web and packages/db/src for app.ais_ found no direct runtime reader on origin/main at 108373dc9. DarkAisRepository uses app.dark_ais, which verifies the company actor and connection owner. Revoke SELECT on exactly ais_connection, ais_lifecycle, ais_observation and ais_page. No other privileges or policies change; the checked routine still executes as its migration owner.

The proof explicitly removes four SELECT entries, four same-schema owner entries and four LP-0 recorded RLS entries (that inventory records relation owners/RLS only when there is a non-owner grant). Actual forced RLS and tenancy expectations remain intact. Upgrade ACL expectations retain the owner's full table ACL. No baseline or scanner is changed.

Forward-only deployment; no data migration or deletion. Correct a regression with a reviewed forward migration, retaining checked actor access rather than restoring unrestricted reads.

Validation: source-only guard failed before migration creation. Added PostgreSQL checks for denied raw reads even in the owner's tenant and continued checked reads. Existing AIS tests attack swapped actors, tenant IDs, replay and races. CI must execute these and full migration/LP-0/tenancy checks. No database was available locally. Live providers, bank data and all gates stay closed.
