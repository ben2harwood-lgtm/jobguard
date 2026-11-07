# 0658: LP-6b effective contractor session actor

Forward repair of `app.lp6_session_authority(text,text,uuid)`. The contractor
branch resolves `app.contractor_session` exactly as the session bridge does,
then validates that effective member's tenant, identity, expiry and revocation.
The base session member must also retain its prior active/revocation checks.
Real and home-practice branches, session-row share lock, home deadline,
credential-kind checks and refusal codes retain their prior behavior.

No new routine, role, privilege, schema usage, column or caller setting is added.
The existing helper remains owned by `jobguard_migration`, private to
`jobguard_binding_owner`, with `search_path=pg_catalog,pg_temp`. Its changed
static call set is classified in the migration proof. No fingerprinted table is
altered. Originally 0584, then 0596, renumbered by stem to 0609, then 0619 after origin/main occupied 0606–0618. Now reserved as 0658 by the router on 6 Nov; 0655–0657 are reserved for #610/#611/#612 in coordinator/MIGRATIONS.txt. Main is incorporated through b0ae55c4686861e61af7b6b2b759ecdcb425205e. SQL bytes are unchanged.

`lp6b-effective-actor-upgrade.integration.test.ts` installs predecessors, proves
the original mismatch, applies this migration alone, compares populated rows,
types and helper attributes, then proves switched/owner success and stale or
foreign context refusal. The migrator is replayed twice. Failed installation
rolls back atomically; after successful installation use another reviewed forward
migration instead of restoring incorrect actor selection.

Binding does not grant a revoked member business authority. Existing session
control behavior after membership revocation remains a separately reported
compatibility issue wherever binding prevents a session-only operation.
