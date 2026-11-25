# 2014 · V2-E3 stock position (RED)

V2 bootstrap applies this after D3 (2006). Like 2002–2006, it is inert unless
both the dedicated jobguard_v2_local database and V2 firm policy exist. No
backfill: jobs begin with no deliveries. Ordinary fresh/upgrade databases gain
no table, policy or grants. The purchase-order audit suite asserts this.

Delivery snapshots append to app.v2_stock_delivery, with SELECT/INSERT only,
FORCE RLS, job visibility, migration ownership and tenant-qualified foreign
keys to the precise D3 line revision. As in D3, the existing v2_work_plan_editor
helper verifies the editor: the real identity membership belongs to the
owner's real tenant, while practice rows belong to the shared practice tenant;
there is deliberately no false same-tenant membership foreign key. Commands bind the verified
editor, server time, job, delivery version and exact replay body. Job-scoped
transaction advisory locking serializes delivery commands; the tenant audit
head remains the final lock. Replay returns its original snapshot without a
new row or event. Audit payloads hold references only, never supplier text.

The existing goodsReceiptV1 path requires a supplier document from fixture
intake and does not identify D3 material lines. Reusing it would require edits
outside E3's ownership. This separate table records no order or supplier bill.
The stock projection reuses D3's inputs and gross pack calculation per stable
(scope_item_id, line_key); it does not merge products by their display name.
Forecasts and confirmed dates contribute zero stock. Receipts are positive
increments; stored snapshots carry the cumulative quantity (up to the expected
packs), with the most recent receiver and server receipt time. Older receipt
snapshots retain all earlier receiver/time facts. Partial receipts can be
recorded directly against a forecast; dates cannot change after receipt.
D3 reads and delivery reads use separate authenticated read transactions;
this is a current projection, not a commercially frozen stock snapshot.

Correction strategy: forward-fix through a separately allocated migration;
never rewrite receipt history. To rehearse the previous code, provision its
separate V2 state and retain this database. No rollback drops user data.

Proofs are appended to the full tools/v2/seed.integration.test.mjs suite: real
application/read API, forecast exclusion, partial/full receipts, multiple
suppliers, replay conflicts, stale/concurrent versions, audit append/replay and
forced rollback for each command, runtime grants/FORCE RLS, second-firm
SELECT/INSERT/UPDATE/DELETE denial and outbox non-effects. These PostgreSQL
proofs require the CI rehearsal environment; they are not local test results.
