import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { supplierFixtures, purchaseOrderAuthorityContent, purchaseOrderNet } from "@jobguard/core";
import type { FinalCheckManifest } from "./final-check-repository.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const supplier = z.object({ content_hash: sha }).passthrough();
const order = z.object({ quantity_decimal: z.enum(["10", "40"]), unit_price_pence: z.union([z.literal(2000), z.literal(2500)]),
  order_net_pence: z.number().int(), agreed_net_pence: z.union([z.literal(20000), z.literal(80000)]), recipient: z.string().endsWith(".invalid"),
  required_date: z.string().date(), revision: z.number().int().positive(), authority_hash: sha }).passthrough();
const materialFixtures = ["materials-B-delivery", "materials-B-invoice", "materials-B-revised-invoice", "materials-320-invoice", "materials-B-credit"] as const;

/** These exact fictional material documents describe quantities/prices, with no extra-work assertion.
 * This is a deliberately bounded practice decoder, not inference that an arbitrary supplier bill has no extras.
 * No evidence identity is fabricated and no commercial fact or signal is created from these rows. */
export function decodePracticeStructuredSource(kind: string, input: unknown, document: unknown): { text: string } | null {
  if (kind === "unlinked_purchase_order") {
    const parsed = order.safeParse(input);
    if (!parsed.success) return null;
    const r = parsed.data;
    if (purchaseOrderNet(r.quantity_decimal, 2000) !== r.agreed_net_pence ||
      purchaseOrderNet(r.quantity_decimal, r.unit_price_pence) !== r.order_net_pence || hash(purchaseOrderAuthorityContent({
      quantity: r.quantity_decimal, unitPricePence: r.unit_price_pence, recipient: r.recipient,
      requiredDate: r.required_date, revision: r.revision })) !== r.authority_hash) return null;
    // Generated DR-02 and merchant-recovery orders contain material quantities/prices, not extra customer work.
    return { text: purchaseOrderAuthorityContent({ quantity: r.quantity_decimal, unitPricePence: r.unit_price_pence,
      recipient: r.recipient, requiredDate: r.required_date, revision: r.revision }) };
  }
  if (!["unlinked_supplier_version", "unlinked_supplier_document"].includes(kind)) return null;
  const row = supplier.safeParse(input), doc = z.object({ supplier_context: z.literal("fictional-merchant"),
    status: z.literal("ready"), document_type: z.string(), document_number: z.string(), content_hash: sha }).passthrough().safeParse(document);
  if (!row.success || !doc.success) return null;
  for (const id of materialFixtures) {
    const fixture = supplierFixtures[id], digest = hash(fixture.bytes);
    if (row.data.content_hash !== digest || doc.data.content_hash !== digest || doc.data.document_type !== fixture.type || doc.data.document_number !== fixture.number) continue;
    if (kind === "unlinked_supplier_version") {
      const version = z.object({ media_type: z.literal(fixture.media), byte_length: z.literal(Buffer.byteLength(fixture.bytes)),
        page_count: z.literal(fixture.pages), version: z.literal(1), parent_version_id: z.null(), page_from: z.null(), page_to: z.null() }).passthrough().safeParse(input);
      if (!version.success) return null;
    }
    return { text: fixture.bytes };
  }
  return null;
}

/** Called only by the shadow worker's ports. Ordinary source reads use the separate runtime login. */
export async function readPracticeStructuredSource(pool: Pool, context: VerifiedTenantContext, m: FinalCheckManifest, s: FinalCheckManifest["sources"][number]) {
  if (m.comparisons.tenantId !== context.tenantId || s.evidenceId !== null || !s.processable) return null;
  const table = s.sourceKind === "unlinked_supplier_version" ? "supplier_document_version"
    : s.sourceKind === "unlinked_supplier_document" ? "supplier_document" : s.sourceKind === "unlinked_purchase_order" ? "purchase_order_revision" : null;
  if (!table) return null;
  return withTenant(pool, context, async db => {
    const lockedScopeIds = [...m.comparisons.baselineItemIds, ...m.comparisons.lines.map(line => line.scopeItemId)];
    // A fresh source/track check also makes direct port calls fail closed outside synthetic practice.
    const row = (await db.$client.query<{ input: unknown; document: unknown }>(`SELECT to_jsonb(v) input,
      ${table === "supplier_document_version" ? "(SELECT to_jsonb(d) FROM app.supplier_document d WHERE d.tenant_id=v.tenant_id AND d.job_id=v.job_id AND d.id=v.document_id)" : "to_jsonb(v)"} document
      FROM app.${table} v JOIN app.job j ON(j.tenant_id,j.id)=(v.tenant_id,v.job_id)
      JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(j.tenant_id,j.id)
      WHERE v.tenant_id=$1 AND v.job_id=$2 AND v.id=$3 AND to_jsonb(v)=$4::jsonb AND v.created_at<=$5::timestamptz
       ${table === "purchase_order_revision" ? "AND EXISTS(SELECT 1 FROM app.purchase_order_draft pd JOIN app.material_requirement mr ON(mr.tenant_id,mr.job_id,mr.id)=(pd.tenant_id,pd.job_id,pd.requirement_id) WHERE pd.tenant_id=v.tenant_id AND pd.job_id=v.job_id AND pd.id=v.draft_id AND mr.scope_item_id=ANY($6::uuid[]))" : "AND $6::uuid[] IS NOT NULL"}
       AND j.practice_session_digest IS NOT NULL AND j.provenance<>'imported' AND tr.job_track='small_builder' AND tr.environment='synthetic_demo'`,
    [context.tenantId, m.comparisons.jobId, s.sourceRef, JSON.stringify(s.input), m.cutoff, lockedScopeIds])).rows[0];
    return row ? decodePracticeStructuredSource(s.sourceKind, row.input, row.document) : null;
  });
}
