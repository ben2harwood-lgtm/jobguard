import type { TenantTransaction } from "./tenant-context.js";
import { requireLiveJob, WatchdogError } from "./watchdog.js";
import { merchantOrderV1, merchantOrderContent, orderContentHash, readMerchantOrder, requireSyntheticOrders,
  PurchaseOrderActionError } from "./purchase-order-action.js";

/** Common executor preflight, while the effect is still pending. No provider call here. */
export async function darkOrderStillAuthorized(db: TenantTransaction, tenantId: string, content: string, hash: string) {
  try {
    requireSyntheticOrders();
    const order = merchantOrderV1.parse(JSON.parse(content));
    if (order.tenantId !== tenantId) return false;
    // A refused SQL live check aborts the transaction. Recover it before the
    // executor records cancellation in that same transaction.
    await db.$client.query("SAVEPOINT dark_order_live_check");
    try { await requireLiveJob(db, order.jobId); }
    catch (error) {
      await db.$client.query("ROLLBACK TO SAVEPOINT dark_order_live_check");
      await db.$client.query("RELEASE SAVEPOINT dark_order_live_check");
      throw error;
    }
    await db.$client.query("RELEASE SAVEPOINT dark_order_live_check");
    // Same lock as revise; the NEW revision trigger refuses edits once this claim commits.
    await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${tenantId}:${order.jobId}:watchdog-command`]);
    // Read after obtaining the job lock, so a final lock committed while waiting is visible.
    if ((await db.$client.query("SELECT 1 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [tenantId, order.jobId])).rowCount) return false;
    const current = await readMerchantOrder(db, tenantId, order.jobId, order.revisionId);
    return hash === orderContentHash(merchantOrderContent(current));
  } catch (error) {
    if (error instanceof WatchdogError && (error.code === "JOB_NOT_LIVE" || error.code === "JOB_NOT_FOUND")) return false;
    if (error instanceof PurchaseOrderActionError || error instanceof SyntaxError || (error as { name?: string }).name === "ZodError") return false;
    throw error;
  }
}
