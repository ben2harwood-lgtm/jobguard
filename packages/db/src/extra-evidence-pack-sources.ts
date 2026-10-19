import { createHash } from "node:crypto";
import { z } from "zod";
import { extraOriginHashV1, extraSorRevisionHashV1, residentConfirmationDocumentV1, residentConfirmationStatementV1, siteExtraContentSha256V1, sha256, type EvidenceSource } from "@jobguard/core";
import type { TenantTransaction } from "./tenant-context.js";

export class ExtraSourceError extends Error {
  constructor(readonly code: "EXTRA_SOURCE_NOT_FOUND" | "EXTRA_SOURCE_INVALID" | "EXTRA_PACK_MIGRATION_REQUIRED") { super(code); this.name = "ExtraSourceError"; }
}
export const extraSourceQueryV1 = z.object({ version: z.literal("extra-source-query.v1"), jobId: z.string().uuid(), extraId: z.string().uuid() }).strict();
export function extraSourceQuery(raw: unknown) {
  const result = extraSourceQueryV1.safeParse(raw);
  if (!result.success) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
  return result.data;
}
type NamedRecord = { content: string; record: Record<string, unknown> };
const text = (r: Record<string, unknown>, field: string): string => {
  const value = r[field]; if (typeof value !== "string" && typeof value !== "number") throw new ExtraSourceError("EXTRA_SOURCE_INVALID"); return String(value);
};
const nullableText = (r: Record<string, unknown>, field: string) => r[field] === null ? null : text(r, field);
const originColumns = "tenant_id,job_id,variation_id,job_track,kind,command_id,command_type,raising_membership_id,raising_role,raising_grant_id,raiser_assigned,server_recorded_at,device_id,device_captured_at,client_capture_id,work_order_id,work_order_revision_id,site_visit_id,evidence_id,evidence_hash,resident_confirmation_evidence_id,provenance,source_capture_kind,source_capture_hash,origin_hash";
const sorColumns = "tenant_id,id,job_id,variation_id,revision,work_order_id,work_order_revision_id,sor_version_id,sor_code,unit,rate_pence,adjustment_numerator,adjustment_denominator,coverage,excess_of_scope_item_id,instructed_quantity,claimed_quantity,quantity,net_pence,content_hash,request_hash,command_id,raising_membership_id,server_recorded_at";
const basisColumns = "tenant_id,id,job_id,variation_id,revision,pricing_basis,revision_content_hash,command_id,actor_membership_id,server_recorded_at";
const evidenceColumns = "tenant_id,id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at";
/** Named canonical PostgreSQL JSON text; columns are internal constants, never request data. */
async function record(db: TenantTransaction, table: string, columns: string, where: string, values: unknown[]): Promise<NamedRecord | undefined> {
  const result = await db.$client.query<{ content: string }>(`SELECT row_to_json(t)::text content FROM (SELECT ${columns} FROM app.${table} WHERE ${where}) t`, values);
  if (result.rows.length > 1) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
  const content = result.rows[0]?.content;
  return content === undefined ? undefined : { content, record: JSON.parse(content) as Record<string, unknown> };
}
export type ExtraOriginalReference = { sourceId: string; key: string; versionId: string; sha256: string; byteLength: number; contentType: string };
export type ExtraEvidenceSources = { jobId: string; extraId: string; sources: EvidenceSource[]; omissions: string[]; originalObjects: ExtraOriginalReference[] };

/** Internal read adapter only. Context is the existing withTenant transaction; no approval/client access or writer is supplied here. */
export async function loadExtraEvidenceSources(db: TenantTransaction, raw: unknown): Promise<ExtraEvidenceSources> {
  const input = extraSourceQuery(raw);
  const schema = (await db.$client.query<{ present: boolean }>("SELECT to_regclass('app.extra_evidence_pack') IS NOT NULL present")).rows[0];
  if (!schema?.present) throw new ExtraSourceError("EXTRA_PACK_MIGRATION_REQUIRED");
  const tenant = (await db.$client.query<{ tenant: string | null }>("SELECT nullif(current_setting('app.tenant_id',true),'')::uuid::text tenant")).rows[0]?.tenant;
  if (!tenant) throw new ExtraSourceError("EXTRA_SOURCE_NOT_FOUND");
  const values = [tenant, input.jobId, input.extraId];
  const origin = await record(db, "extra_origin", originColumns, "tenant_id=$1 AND job_id=$2 AND variation_id=$3 AND job_track='contractor' AND provenance='command'", values);
  if (!origin) throw new ExtraSourceError("EXTRA_SOURCE_NOT_FOUND");
  const o = origin.record;
  const times = (await db.$client.query<{ server_text: string; device_text: string | null }>(`SELECT to_char(server_recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') server_text,to_char(device_captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') device_text FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2 AND variation_id=$3`, values)).rows[0]!;
  if (typeof o.raiser_assigned !== "boolean" && o.raiser_assigned !== null) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
  const originHash = extraOriginHashV1({ tenantId: tenant, jobId: input.jobId, variationId: input.extraId, jobTrack: text(o, "job_track"), kind: text(o, "kind"), provenance: text(o, "provenance"), commandId: nullableText(o, "command_id"), commandType: nullableText(o, "command_type"), raisingMembershipId: nullableText(o, "raising_membership_id"), raisingRole: text(o, "raising_role"), raisingGrantId: nullableText(o, "raising_grant_id"), raiserAssigned: o.raiser_assigned,
    serverRecordedAt: times.server_text, deviceId: nullableText(o, "device_id"), deviceCapturedAt: times.device_text, clientCaptureId: nullableText(o, "client_capture_id"), workOrderId: nullableText(o, "work_order_id"), workOrderRevisionId: nullableText(o, "work_order_revision_id"), siteVisitId: nullableText(o, "site_visit_id"), evidenceId: nullableText(o, "evidence_id"), evidenceHash: nullableText(o, "evidence_hash"), residentConfirmationEvidenceId: nullableText(o, "resident_confirmation_evidence_id"), sourceCaptureKind: text(o, "source_capture_kind"), sourceCaptureHash: text(o, "source_capture_hash") });
  if (originHash !== text(o, "origin_hash")) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
  const capture = await record(db, "variation", "tenant_id,id,job_id,scope_item_id,capture_kind,capture_text,description", "tenant_id=$1 AND job_id=$2 AND id=$3", values);
  if (!capture || sha256(text(capture.record, "capture_text")) !== text(o, "source_capture_hash")) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
  const sources: EvidenceSource[] = [], omissions: string[] = [], originalObjects: ExtraOriginalReference[] = [];
  const add = (table: string, id: string, row: NamedRecord, kind: EvidenceSource["kind"], label: string, version = 1) => sources.push({ sourceId: `${table}:${id}`, version, kind, label, jobId: input.jobId, content: row.content });
  add("extra_origin", input.extraId, origin, "variation", "Persisted immutable extra origin");
  add("extra_origin_capture", input.extraId, { record: {}, content: text(capture.record, "capture_text") }, "variation", "Capture text verified against immutable origin hash; price and quantity excluded");
  const photoId = nullableText(o, "evidence_id"), confirmationId = nullableText(o, "resident_confirmation_evidence_id");
  for (const [id, type] of [[photoId, "site_photo"], [confirmationId, "resident_confirmation"]] as const) {
    if (id === null) { omissions.push(type === "site_photo" ? "Optional photo absent" : "Optional confirmation absent"); continue; }
    const object = await record(db, "evidence_object", evidenceColumns, `tenant_id=$1 AND job_id=$2 AND id=$3 AND kind='original' AND evidence_type=$4
      AND EXISTS(SELECT 1 FROM app.evidence_upload u WHERE (u.tenant_id,u.job_id,u.id)=(evidence_object.tenant_id,evidence_object.job_id,evidence_object.upload_id) AND u.state='verified' AND u.object_version_id=evidence_object.object_version_id)
      AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(evidence_object.tenant_id,evidence_object.id))`, [tenant, input.jobId, id, type]);
    if (!object) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
    const e = object.record;
    if (e.scope_item_id !== null && e.scope_item_id !== capture.record.scope_item_id) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
    let bytes: Uint8Array | undefined;
    if (type === "resident_confirmation") {
      const contentSha256 = siteExtraContentSha256V1({ jobId: input.jobId, description: text(capture.record, "description"), note: text(capture.record, "capture_text"), photoSha256: nullableText(o, "evidence_hash") });
      if (text(e, "object_version_id") !== "resident-confirmation.v1") throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
      bytes = Buffer.from(residentConfirmationDocumentV1({ tenantId: tenant, jobId: input.jobId, confirmationId: id, contentSha256 }), "utf8");
    } else {
      if (text(e, "sha256") !== nullableText(o, "evidence_hash")) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
      originalObjects.push({ sourceId: `evidence_object:${id}`, key: text(e, "object_key"), versionId: text(e, "object_version_id"), sha256: text(e, "sha256"), byteLength: Number(e.byte_length), contentType: text(e, "content_type") });
    }
    if (bytes && (createHash("sha256").update(bytes).digest("hex") !== text(e, "sha256") || bytes.length !== Number(e.byte_length))) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
    add("evidence_object", id, { ...object, content: bytes ? JSON.stringify({ record: object.content, originalBytesBase64: Buffer.from(bytes).toString("base64") }) : object.content }, "proof", type === "site_photo" ? "Verified photo exact original version" : `${residentConfirmationStatementV1}; capture only, excludes quantity and price`);
  }
  const sor = await record(db, "extra_sor_revision", sorColumns, "tenant_id=$1 AND job_id=$2 AND variation_id=$3", values);
  const basis = await record(db, "extra_pricing_basis", basisColumns, "tenant_id=$1 AND job_id=$2 AND variation_id=$3 AND revision=1", values);
  if (sor) {
    const r = sor.record;
    const computed = extraSorRevisionHashV1({ tenantId: tenant, jobId: input.jobId, variationId: input.extraId, revision: text(r, "revision"), originHash, workOrderId: text(r, "work_order_id"), workOrderRevisionId: text(r, "work_order_revision_id"), sorVersionId: text(r, "sor_version_id"), sorCode: text(r, "sor_code"), unit: text(r, "unit"), ratePence: text(r, "rate_pence"), adjustmentNumerator: text(r, "adjustment_numerator"), adjustmentDenominator: text(r, "adjustment_denominator"), coverage: text(r, "coverage"), excessOfScopeItemId: nullableText(r, "excess_of_scope_item_id"), instructedQuantity: nullableText(r, "instructed_quantity"), claimedQuantity: text(r, "claimed_quantity"), quantity: text(r, "quantity"), netPence: text(r, "net_pence") });
    if (computed !== text(r, "content_hash") || !basis || text(basis.record, "revision_content_hash") !== computed || text(basis.record, "pricing_basis") !== "server_sor" || text(basis.record, "command_id") !== text(r, "command_id") || text(basis.record, "actor_membership_id") !== text(r, "raising_membership_id")) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
    add("extra_sor_revision", text(r, "id"), sor, "variation", "Origin-bound server SoR price; no repricing", Number(r.revision));
    add("extra_pricing_basis", text(basis.record, "id"), basis, "variation", "Persisted server_sor pricing basis");
  } else {
    if (basis) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
    omissions.push("Confirmed price absent; no commercial approval authority");
  }
  return { jobId: input.jobId, extraId: input.extraId, sources, omissions, originalObjects };
}
