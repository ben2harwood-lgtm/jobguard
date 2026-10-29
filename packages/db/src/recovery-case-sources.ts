import { describeRecoverySource, isRecordedSourceId, RecoverySourceError } from "@jobguard/core";
import type { TenantTransaction } from "./tenant-context.js";

export type RecoverySourceView = { ref: string; kind: string; label: string; recorded: boolean };
type SourceType = "supplier_documents" | "customer_invoice";
type Found = { kind: string; label: string };

/**
 * Each cited source is either a label from the closed practice catalogue or the id of a RECORDED source
 * that exists for the same tenant AND job and is the right kind for the case's source type. These are the
 * same predicates the M4-3-S-R evidence-pack loader applies, so a case that opens here can always be packed.
 * Anything else (free text, unknown id, another job's or tenant's record, a held or credit document,
 * a rate not used on the job, a customer invoice on a supplier case or the reverse) is refused.
 */
export async function resolveRecoverySources(db: TenantTransaction, tenantId: string, jobId: string, sourceType: SourceType, refs: readonly string[]): Promise<RecoverySourceView[]> {
  const resolved: RecoverySourceView[] = [];
  for (const ref of refs) {
    const practice = describeRecoverySource(ref);
    if (practice && practice.sourceType === sourceType) { resolved.push({ ref, kind: practice.kind, label: ref, recorded: false }); continue; }
    if (!isRecordedSourceId(ref)) throw new RecoverySourceError();
    const found = sourceType === "customer_invoice" ? await customerInvoice(db, tenantId, jobId, ref) : await supplierSource(db, tenantId, jobId, ref);
    if (!found) throw new RecoverySourceError();
    resolved.push({ ref, ...found, recorded: true });
  }
  return resolved;
}

async function customerInvoice(db: TenantTransaction, tenantId: string, jobId: string, ref: string): Promise<Found | undefined> {
  const row = (await db.$client.query<{ invoice_number: string }>(
    "SELECT invoice_number FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2 AND id=$3::uuid", [tenantId, jobId, ref])).rows[0];
  return row ? { kind: "Customer invoice", label: `Customer invoice ${row.invoice_number}` } : undefined;
}

async function supplierSource(db: TenantTransaction, tenantId: string, jobId: string, ref: string): Promise<Found | undefined> {
  const rate = (await db.$client.query<{ source_label: string }>(
    `SELECT r.source_label FROM app.material_rate_revision r
      WHERE r.tenant_id=$1 AND r.id=$3::uuid
        AND EXISTS(SELECT 1 FROM app.material_requirement m WHERE m.tenant_id=r.tenant_id AND m.sku_id=r.sku_id AND m.job_id=$2)`, [tenantId, jobId, ref])).rows[0];
  if (rate) return { kind: "Supplier agreement", label: `Supplier agreement ${rate.source_label}` };
  const document = (await db.$client.query<{ document_type: string; document_number: string | null }>(
    `SELECT d.document_type,d.document_number
       FROM app.supplier_document_version v JOIN app.supplier_document d ON(d.tenant_id,d.job_id,d.id)=(v.tenant_id,v.job_id,v.document_id)
      WHERE v.tenant_id=$1 AND v.job_id=$2 AND (v.id=$3::uuid OR d.id=$3::uuid)
        AND d.status='ready' AND d.document_type IN('invoice','delivery')
      ORDER BY v.version DESC LIMIT 1`, [tenantId, jobId, ref])).rows[0];
  if (!document) return undefined;
  const kind = document.document_type === "invoice" ? "Supplier invoice" : "Delivery note";
  return { kind, label: `${kind} ${document.document_number ?? "(unnumbered)"}` };
}

/** Resolve only already approved, public variation facts after lock. No shadow-table access. */
export async function resolveFinalCheckRecoverySources(db:TenantTransaction,tenantId:string,jobId:string,refs:readonly string[]):Promise<RecoverySourceView[]> {
 const variation=refs.find(ref=>ref.startsWith("variation:"))?.slice(10);
 const revision=refs.find(ref=>ref.startsWith("revision:"))?.slice(9);
 if(!variation||!revision||!isRecordedSourceId(variation)||!isRecordedSourceId(revision))throw new RecoverySourceError();
 const found=await db.$client.query(`SELECT r.id FROM app.variation_revision r
  JOIN app.variation_approval a ON(a.tenant_id,a.job_id,a.variation_id,a.revision_id)=(r.tenant_id,r.job_id,r.variation_id,r.id)
  WHERE r.tenant_id=$1 AND r.job_id=$2 AND r.variation_id=$3 AND r.id=$4
   AND EXISTS(SELECT 1 FROM app.final_account_lock l WHERE l.tenant_id=r.tenant_id AND l.job_id=r.job_id)`,[tenantId,jobId,variation,revision]);
 if(!found.rowCount)throw new RecoverySourceError();
 return refs.map(ref=>({ref,kind:ref.startsWith("variation:")?"Customer-approved variation":ref.startsWith("revision:")?"Approved commercial revision":"Final Check origin reference",
  label:ref,recorded:ref===`variation:${variation}`||ref===`revision:${revision}`}));
}
