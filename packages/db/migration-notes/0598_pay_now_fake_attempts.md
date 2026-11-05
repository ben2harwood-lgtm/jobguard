# 0598_pay_now_fake_attempts — MON-6 synthetic fake attempt history

Adds one empty append-only FORCE-RLS table and one migration-owned fixed-search-path
routine. Runtime receives only EXECUTE on the routine; no new role, direct table
grant or existing invoice/financial table mutation. The routine preserves and
restores caller tenant settings, including failure paths. Stored facts are hashed
and tenant/job/invoice references are qualified. No legacy migration is edited.

Fresh and upgrade expectations are explicitly authored in the accompanying proof,
including exact indexes, routine identity, owner, ACL and policy. CI must execute
fresh/upgrade/tenancy/LP-0 catalogues and the real PostgreSQL attempt integration
test. This sandbox cannot start PostgreSQL; source inspection and local unit tests
do not prove those properties. Batch migration 0598_pay_now_fake_attempts must be reconciled at landing.

Forward fix preferred: disable the synthetic practice preview callers, retain
all observation history, and add a separately reviewed migration. Never delete
attempt rows to undo a fake payment: these rows never affected invoice balances.
Live MON-6 acceptance and provider sandbox evidence remain open.
