import { createHash } from "node:crypto";
import { sha256, type EvidenceSource } from "@jobguard/core";
import type { TenantTransaction } from "./tenant-context.js";

type RecordRow = Record<string, unknown>;
type SourceRow = { id: string; version: number; record: RecordRow };
export type EvidencePackSources = { jobId: string; sources: EvidenceSource[]; omissions: string[] };
export class EvidencePackSourceError extends Error {
  constructor(readonly code: "EVIDENCE_PACK_CASE_NOT_FOUND" | "EVIDENCE_PACK_SOURCE_NOT_FOUND" | "EVIDENCE_PACK_SOURCE_CONTENT_MISMATCH", readonly sourceRef?: string) {
    super(code); this.name = "EvidencePackSourceError";
  }
}

/** A stable encoding of the stored row, never a reconstruction of its contents. */
function canonicalRecord(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalRecord).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalRecord(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

/**
 * Sources are tenant/job-qualified immutable database rows. Proof bytes, when
 * present, are read from their exact stored synthetic object version. Records
 * that store only original-file metadata are labelled as records, not files.
 * Missing referenced rows fail closed; optional absent categories are explicit.
 */
export async function loadEvidencePackSources(db: TenantTransaction, tenantId: string, caseId: string): Promise<EvidencePackSources> {
  const found = await db.$client.query<{ job_id: string; case_type: string; source_refs: string[] }>(
    "SELECT job_id,case_type,source_refs FROM app.recovery_case WHERE tenant_id=$1 AND id=$2", [tenantId, caseId],
  );
  const recoveryCase = found.rows[0];
  if (!recoveryCase) throw new EvidencePackSourceError("EVIDENCE_PACK_CASE_NOT_FOUND");
  const jobId = recoveryCase.job_id, sources: EvidenceSource[] = [], omissions: string[] = [];
  const add = (table: string, row: SourceRow, kind: EvidenceSource["kind"], label: string, extra?: RecordRow) => {
    const source: EvidenceSource = { sourceId: `${table}:${row.id}`, kind, version: Number(row.version), label, jobId, content: canonicalRecord({ recordType: table, record: row.record, ...extra }) };
    sources.push(source); return source;
  };
  const quotes = await db.$client.query<SourceRow & { acceptance_id: string; acceptance: RecordRow }>(`
    SELECT d.id,d.document_version version,to_jsonb(d) record,a.id acceptance_id,to_jsonb(a) acceptance
    FROM app.quote_acceptance a JOIN app.job j ON(j.tenant_id,j.id,j.accepted_quote_version_id)=(a.tenant_id,a.job_id,a.document_id)
    JOIN app.quote_document_version d
      ON(d.tenant_id,d.job_id,d.id,d.document_version,d.content_hash)=(a.tenant_id,a.job_id,a.document_id,a.document_version,a.document_hash)
    WHERE a.tenant_id=$1 AND a.job_id=$2
    ORDER BY a.accepted_at DESC,a.recorded_at DESC,a.id DESC LIMIT 1`, [tenantId, jobId]);
  for (const quote of quotes.rows) {
    add("quote_document_version", quote, "accepted_quote", "Accepted quote immutable record");
    add("quote_acceptance", { id: quote.acceptance_id, version: 1, record: quote.acceptance }, "approval", "Accepted quote approval record");
  }
  if (!quotes.rowCount) omissions.push("Accepted quote and approval unavailable");

  const proof = await db.$client.query<SourceRow & { bytes: Buffer | null; sha256: string; object_version_id: string }>(`
    SELECT e.id,1 version,to_jsonb(e) record,o.bytes,e.sha256,e.object_version_id
    FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id,u.job_id)=(e.tenant_id,e.upload_id,e.job_id)
    LEFT JOIN app.synthetic_evidence_original o ON(o.tenant_id,o.job_id,o.upload_id,o.object_key,o.object_version_id)=(e.tenant_id,e.job_id,e.upload_id,e.object_key,e.object_version_id)
    WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.kind='original' AND u.state='verified'
      AND u.object_version_id=e.object_version_id
      AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id)
    ORDER BY e.id`, [tenantId, jobId]);
  for (const object of proof.rows) {
    if (object.bytes && createHash("sha256").update(object.bytes).digest("hex") !== object.sha256.trim()) throw new EvidencePackSourceError("EVIDENCE_PACK_SOURCE_CONTENT_MISMATCH", object.id);
    const original = add("evidence_object", object, "proof", object.bytes ? "Relevant proof original" : "Verified proof record — original bytes unavailable", object.bytes ? { originalBytesBase64: object.bytes.toString("base64"), originalEncoding: "base64" } : { originalBytesAvailable: false });
    if (!object.bytes) omissions.push(`Original proof bytes unavailable: ${object.id}`);
    // This is a redacted metadata record, not a claim that photo pixels were redacted.
    sources.push({ sourceId: `evidence_object:${object.id}:redacted-metadata`, kind: "proof", version: 1, jobId, label: "Relevant proof — least-disclosure metadata copy", content: canonicalRecord({ recordType: "evidence_object_redacted_metadata.v1", record: { id: object.id, job_id: jobId, object_version_id: object.object_version_id, sha256: object.sha256.trim(), evidence_type: object.record.evidence_type, byte_length: object.record.byte_length, content_type: object.record.content_type }, omittedFields: ["original bytes", "object key", "capture metadata", "server timestamps", "upload identity", "tenant identity"] }), redactedFrom: { sourceId: original.sourceId, version: original.version, hash: sha256(original.content) } });
  }
  if (!proof.rowCount) omissions.push("Verified proof unavailable");

  const variations = await db.$client.query<SourceRow & { approval_id: string; approval: RecordRow }>(`
    SELECT r.id,r.revision version,to_jsonb(r) record,a.id approval_id,to_jsonb(a) approval
    FROM app.variation_revision r JOIN app.variation_approval a
      ON(a.tenant_id,a.job_id,a.revision_id,a.revision,a.content_hash)=(r.tenant_id,r.job_id,r.id,r.revision,r.content_hash)
    WHERE r.tenant_id=$1 AND r.job_id=$2 ORDER BY r.variation_id,r.revision`, [tenantId, jobId]);
  for (const variation of variations.rows) {
    add("variation_revision", variation, "variation", "Approved variation immutable revision");
    add("variation_approval", { id: variation.approval_id, version: 1, record: variation.approval }, "approval", "Variation approval record");
  }
  if (!variations.rowCount) omissions.push("Approved variations unavailable");

  const claims = await db.$client.query<SourceRow>("SELECT id,revision version,to_jsonb(r) record FROM app.recovery_claim_revision r WHERE tenant_id=$1 AND job_id=$2 AND case_id=$3 ORDER BY revision", [tenantId, jobId, caseId]);
  if (!claims.rowCount) throw new EvidencePackSourceError("EVIDENCE_PACK_SOURCE_NOT_FOUND", caseId);
  for (const row of claims.rows) add("recovery_claim_revision", row, "recovery_case", "Recovery case claim revision");
  const events = await db.$client.query<SourceRow>("SELECT id,sequence version,to_jsonb(e) record FROM app.recovery_case_event e WHERE tenant_id=$1 AND job_id=$2 AND case_id=$3 ORDER BY sequence", [tenantId, jobId, caseId]);
  for (const row of events.rows) add("recovery_case_event", row, "recovery_case", "Recovery case event record");

  const refs = recoveryCase.source_refs, mappedRefs = new Set<string>();
  if (recoveryCase.case_type === "merchant_overcharge") {
    const agreements = await db.$client.query<SourceRow>(`
      SELECT r.id,r.version,to_jsonb(r) record FROM app.material_rate_revision r
      WHERE r.tenant_id=$1 AND r.id::text=ANY($3::text[])
      AND EXISTS(SELECT 1 FROM app.material_requirement m WHERE m.tenant_id=r.tenant_id AND m.sku_id=r.sku_id AND m.job_id=$2)
      ORDER BY r.id`, [tenantId, jobId, refs]);
    for (const row of agreements.rows) { add("material_rate_revision", row, "supplier_agreement", "Supplier agreement rate record"); mappedRefs.add(row.id); }
    const documents = await db.$client.query<SourceRow & { document_id: string; document_type: string; document: RecordRow }>(`
      SELECT v.id,v.version,to_jsonb(v) record,d.id document_id,d.document_type,to_jsonb(d) document
      FROM app.supplier_document_version v JOIN app.supplier_document d ON(d.tenant_id,d.job_id,d.id)=(v.tenant_id,v.job_id,v.document_id)
      WHERE v.tenant_id=$1 AND v.job_id=$2 AND (v.id::text=ANY($3::text[]) OR d.id::text=ANY($3::text[]))
        AND d.status='ready' AND d.document_type IN('invoice','delivery')
      ORDER BY v.document_id,v.version`, [tenantId, jobId, refs]);
    for (const row of documents.rows) {
      add("supplier_document_version", row, row.document_type === "invoice" ? "supplier_invoice" : "supplier_delivery", row.document_type === "invoice" ? "Supplier invoice record snapshot — original bytes unavailable" : "Supplier delivery record snapshot — original bytes unavailable", { document: row.document, originalBytesAvailable: false });
      mappedRefs.add(row.id); mappedRefs.add(row.document_id);
    }
    if (!agreements.rowCount) omissions.push("Referenced supplier agreement unavailable");
    if (!documents.rows.some(row => row.document_type === "invoice")) omissions.push("Referenced supplier invoice unavailable");
    if (!documents.rows.some(row => row.document_type === "delivery")) omissions.push("Referenced supplier delivery unavailable");
  } else {
    const invoices = await db.$client.query<SourceRow & { pdf_bytes: Buffer; pdf_sha256: string }>(`
      SELECT i.id,1 version,to_jsonb(i)-'pdf_bytes' record,i.pdf_bytes,i.pdf_sha256
      FROM app.customer_invoice i WHERE i.tenant_id=$1 AND i.job_id=$2 AND i.id::text=ANY($3::text[]) ORDER BY i.id`, [tenantId, jobId, refs]);
    for (const row of invoices.rows) {
      if (createHash("sha256").update(row.pdf_bytes).digest("hex") !== row.pdf_sha256.trim()) throw new EvidencePackSourceError("EVIDENCE_PACK_SOURCE_CONTENT_MISMATCH", row.id);
      add("customer_invoice", row, "invoice", "Customer invoice immutable record", { originalBytesBase64: row.pdf_bytes.toString("base64"), originalEncoding: "base64" }); mappedRefs.add(row.id);
    }
    if (!invoices.rowCount) omissions.push("Referenced issued invoice unavailable");
  }
  for (const ref of refs) if (!mappedRefs.has(ref)) throw new EvidencePackSourceError("EVIDENCE_PACK_SOURCE_NOT_FOUND", ref);
  return { jobId, sources, omissions };
}
