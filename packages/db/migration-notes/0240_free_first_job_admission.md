# 0240 — MON-3-P-B disabled fictional foundation

Four new forced-RLS, migration-owned immutable business side tables: `trial_business_verification`, `trial_card_attempt`, `trial_card_result`, `trial_admission`. Ten tenant-qualified PK/unique indexes, four tenant policies, eight mutation/truncate guards. Five new routines; no existing table gains a column and no routine is replaced. No backfill or existing commercial-history rewrite.

Runtime EXECUTE only: `mon3_owner(uuid,text)` (checked session/owner plus tenant lock), `mon3_request_card(uuid,text,uuid,jsonb)` and the unconditionally disabled `mon3_admit(uuid,text,uuid,jsonb)`. All other new routines and all direct business-table privileges are revoked, including inherited default ACL grantees. Existing A helper grants remain unchanged. Synthetic session/active owner rechecked before replay and after tenant-lock wait. Business/receipt writes precede audit locks. No network call.

Requested card attempts and terminal results are separate immutable facts. The migration-only result fixture verifies the attempt/business binding; no browser reference/fingerprint fields are accepted. Unknown is nonqualifying and cannot silently become completed. No real provider, identity replacement, admin activation, support override or legacy-policy conversion.

Admission always raises before commercial writes. Its unreachable checked transaction body reuses `switch_job_live_v3` and A's snapshot insert trigger; C must supply clock/end/conversion and successful audit/result composition before admission becomes reachable. Do not remove the stop in operations or via a setting.

Install transaction rollback is the recovery for a failed application. Once installed, preserve verified fixture/key/attempt/result history and use a reviewed additive forward fix; do not drop tables, reset keys, edit facts or implement retention/deletion policy here.

Own upgrade proof installs all predecessors, snapshots populated named pre-existing columns with canonical `row_to_json` text, full types and PK identities, applies 0235 alone, compares, populates own setup facts, then applies later migrations twice. Rolled-back controls detect microsecond damage/retyping; added nullable columns, later function replacement and new rows pass. Admission has no populated success row because B deliberately cannot admit. PostgreSQL suites are NOT RUN locally; CI must establish actual fresh/upgrade/catalog/RLS/race behavior.

Shared tenancy/SERIOUS-B5/export integration is proposed in `/private/tmp/SHARED-MON-3-P-B.patch`; LP-0 needs actual migrated-catalog extraction and review. No shared inventory is edited in-place. See task receipt for local commands and holds.
