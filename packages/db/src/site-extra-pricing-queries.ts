import type { OrderLineFact } from "@jobguard/core";
import type { TenantTransaction } from "./tenant-context.js";

/**
 * ENT-3c reads only. Every function takes the open tenant transaction and names the tenant in its statement; none decides who may do anything
 * (the access rule is the database routine called through SiteExtraRepository's pre-check), none writes, and no money column is ever selected.
 */
export type SorOrderFacts = {
  sorVersionId: string | null;
  item: { code: string; description: string; unit: string } | null;
  lines: OrderLineFact[];
};
const unique = <T>(rows: readonly T[]): T | undefined => rows.length === 1 ? rows[0] : undefined;

/** The job's price list is the SoR version stored on the CURRENT revision of the job's work order; this never chooses a version by date. */
export async function readOrderFacts(db: TenantTransaction, tenant: string, jobId: string, code: string | null): Promise<SorOrderFacts | undefined> {
  const revision = unique((await db.$client.query<{ revision_id: string; sor_version_id: string | null }>(
    `SELECT r.id AS revision_id,r.sor_version_id FROM app.work_order w
     JOIN app.work_order_current k ON(k.tenant_id,k.work_order_id)=(w.tenant_id,w.id)
     JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(k.tenant_id,k.work_order_id,k.revision_id)
     WHERE w.tenant_id=$1 AND w.job_id=$2`, [tenant, jobId])).rows);
  if (!revision) return undefined;
  const item = code !== null && revision.sor_version_id ? unique((await db.$client.query<{ code: string; description: string; unit: string }>(
    "SELECT code,description,unit FROM app.sor_item WHERE tenant_id=$1 AND version_id=$2 AND code=$3", [tenant, revision.sor_version_id, code])).rows) : undefined;
  const lines = (await db.$client.query<{ scope_item_id: string; sor_code: string; quantity: string; position: number }>(
    "SELECT scope_item_id,sor_code,quantity,position FROM app.work_order_line WHERE tenant_id=$1 AND revision_id=$2 ORDER BY position", [tenant, revision.revision_id])).rows
    .map(row => ({ scopeItemId: row.scope_item_id, sorCode: row.sor_code, quantity: row.quantity, position: row.position }));
  return { sorVersionId: revision.sor_version_id, item: item ?? null, lines };
}

/** Items of the job's price list whose code or description contains the text. Compared with position(), so no pattern character has a meaning. At most 50, with a flag. */
export async function searchItems(db: TenantTransaction, tenant: string, versionId: string, text: string): Promise<{ items: Array<{ code: string; description: string; unit: string }>; truncated: boolean }> {
  const rows = (await db.$client.query<{ code: string; description: string; unit: string }>(
    `SELECT code,description,unit FROM app.sor_item WHERE tenant_id=$1 AND version_id=$2
      AND (position(lower($3::text) in lower(code))>0 OR position(lower($3::text) in lower(description))>0)
     ORDER BY code COLLATE "C" LIMIT 51`, [tenant, versionId, text])).rows;
  return { items: rows.slice(0, 50), truncated: rows.length > 50 };
}

export type SorReplay = { revision?: { variationId: string; jobId: string; raisingMembershipId: string; requestHash: string }; receiptExists: boolean };
/** What the database already holds under a command id: the priced revision (if any) and whether any receipt, of any command, uses the id. */
export async function readReplay(db: TenantTransaction, tenant: string, commandId: string): Promise<SorReplay> {
  const revision = unique((await db.$client.query<{ variation_id: string; job_id: string; raising_membership_id: string; request_hash: string }>(
    "SELECT variation_id,job_id,raising_membership_id,request_hash FROM app.extra_sor_revision WHERE tenant_id=$1 AND command_id=$2", [tenant, commandId])).rows);
  const receiptExists = (await db.$client.query("SELECT 1 FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [tenant, commandId])).rowCount! > 0;
  return { ...(revision ? { revision: { variationId: revision.variation_id, jobId: revision.job_id, raisingMembershipId: revision.raising_membership_id, requestHash: revision.request_hash } } : {}), receiptExists };
}

export type StoredPriced = {
  variationId: string; jobId: string; coverage: "new" | "excess"; sorCode: string; unit: string; claimedQuantity: string; instructedQuantity: string | null; extraQuantity: string;
  orderLineScopeItemId: string | null; requestHash: string; raisingMembershipId: string; priceSource: string;
};
/** The stored first revision of an extra joined to its pricing-basis record. The price itself is deliberately not selected (Q7). */
export async function readStoredPriced(db: TenantTransaction, tenant: string, variationId: string): Promise<StoredPriced | undefined> {
  const row = unique((await db.$client.query<{ variation_id: string; job_id: string; coverage: "new" | "excess"; sor_code: string; unit: string; claimed_quantity: string; instructed_quantity: string | null; quantity: string; excess_of_scope_item_id: string | null; request_hash: string; raising_membership_id: string; pricing_basis: string }>(
    `SELECT r.variation_id,r.job_id,r.coverage,r.sor_code,r.unit,r.claimed_quantity,r.instructed_quantity,r.quantity,r.excess_of_scope_item_id,r.request_hash,r.raising_membership_id,b.pricing_basis
     FROM app.extra_sor_revision r JOIN app.extra_pricing_basis b ON(b.tenant_id,b.variation_id,b.revision)=(r.tenant_id,r.variation_id,r.revision)
     WHERE r.tenant_id=$1 AND r.variation_id=$2`, [tenant, variationId])).rows);
  if (!row) return undefined;
  return { variationId: row.variation_id, jobId: row.job_id, coverage: row.coverage, sorCode: row.sor_code, unit: row.unit, claimedQuantity: row.claimed_quantity, instructedQuantity: row.instructed_quantity, extraQuantity: row.quantity,
    orderLineScopeItemId: row.excess_of_scope_item_id, requestHash: row.request_hash, raisingMembershipId: row.raising_membership_id, priceSource: row.pricing_basis };
}
