import { randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { Pool } from "pg";
import { z } from "zod";
import { sha256, type PrivateVersionedStorage, type StoredObject } from "@jobguard/storage";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const UUID = z.string().uuid();
const HASH = z.string().regex(/^[0-9a-f]{64}$/u);
export const beginEvidenceUploadSchema = z.object({
  id: UUID.optional(), jobId: UUID, scopeItemId: UUID.nullable().default(null), expectedSha256: HASH,
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), maximumBytes: z.number().int().positive().max(25_000_000),
  retentionClass: z.enum(["transient_upload", "standard_evidence"]).default("transient_upload"),
  deviceCapturedAt: z.coerce.date().nullable().default(null), expiresAt: z.coerce.date(),
});
export const finalizeEvidenceSchema = z.object({ uploadId: UUID, objectVersionId: z.string().min(1).max(1024),
  evidenceType: z.string().min(1).max(40) });
export const evidenceAccessSchema = z.object({ evidenceId: UUID, jobId: UUID, scopeItemId: UUID.nullable(), expiresInSeconds: z.number().int().min(1).max(900).default(300) });
export type EvidenceUpload = z.infer<typeof beginEvidenceUploadSchema> & { id: string; objectKey: string; serverReceivedAt: Date };

export class EvidenceError extends Error {
  constructor(readonly code: "UPLOAD_NOT_FOUND"|"UPLOAD_EXPIRED"|"OBJECT_INVALID"|"EVIDENCE_NOT_AUTHORIZED", message: string = code) {
    super(message); this.name = "EvidenceError";
  }
}

/** Rejects signatures/header-only files and structurally corrupt synthetic images. */
export function hasCompleteImage(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/png") {
    const b=Buffer.from(bytes); if(b.length<57||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return false;
    let offset=8,ihdr=false,iend=false;const compressed:Buffer[]=[];
    try{while(offset+12<=b.length){const length=b.readUInt32BE(offset);const type=b.toString("ascii",offset+4,offset+8);const end=offset+12+length;if(end>b.length)return false;const data=b.subarray(offset+8,offset+8+length);if(type==="IHDR")ihdr=length===13&&data.readUInt32BE(0)>0&&data.readUInt32BE(4)>0;if(type==="IDAT")compressed.push(data);if(type==="IEND"){iend=length===0&&end===b.length;break;}offset=end;}if(!ihdr||!iend||!compressed.length)return false;inflateSync(Buffer.concat(compressed));return true;}catch{return false;}
  }
  if(contentType==="image/jpeg")return bytes.length>4&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes.at(-2)===0xff&&bytes.at(-1)===0xd9;
  if(contentType==="image/webp")return bytes.length>12&&Buffer.from(bytes).toString("ascii",0,4)==="RIFF"&&Buffer.from(bytes).toString("ascii",8,12)==="WEBP";
  return false;
}

type UploadRow = { id:string; tenant_id:string; job_id:string; scope_item_id:string|null; object_key:string;
 expected_sha256:string; expected_content_type:string; maximum_bytes:string; retention_class:string; state:string;
 rejection_code:string|null; object_version_id:string|null; device_captured_at:Date|null; server_received_at:Date; server_verified_at:Date|null; expires_at:Date };

export class EvidenceService {
  constructor(private readonly pool: Pool, private readonly storage: PrivateVersionedStorage) {}

  async beginUpload(context: VerifiedTenantContext, raw: unknown): Promise<EvidenceUpload & { uploadUrl: string }> {
    const input = beginEvidenceUploadSchema.parse(raw); const id = input.id ?? randomUUID();
    const objectKey = `tenants/${context.tenantId}/uploads/${id}/original`;
    const result = await withTenant(this.pool, context, db => db.$client.query<UploadRow>(`INSERT INTO app.evidence_upload
      (id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,device_captured_at,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (tenant_id,id) DO UPDATE SET id=EXCLUDED.id
      RETURNING *`, [id,context.tenantId,input.jobId,input.scopeItemId,objectKey,input.expectedSha256,input.contentType,input.maximumBytes,input.retentionClass,input.deviceCapturedAt,input.expiresAt]));
    const row=result.rows[0]!;
    const uploadUrl=await this.storage.createUploadUrl({key:row.object_key,contentType:row.expected_content_type,expiresInSeconds:300});
    return {...input,id:row.id,objectKey:row.object_key,serverReceivedAt:row.server_received_at,uploadUrl};
  }

  async finalize(context: VerifiedTenantContext, raw: unknown) {
    const input=finalizeEvidenceSchema.parse(raw);
    const prepared=await withTenant(this.pool,context,async db=>{
      const existing=await db.$client.query(`SELECT * FROM app.evidence_object WHERE tenant_id=$1 AND upload_id=$2`,[context.tenantId,input.uploadId]);
      if(existing.rows[0]) return {existing:existing.rows[0] as Record<string,unknown>};
      const found=await db.$client.query<UploadRow>(`SELECT * FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[context.tenantId,input.uploadId]);
      const row=found.rows[0]; if(!row) throw new EvidenceError("UPLOAD_NOT_FOUND");
      if(row.expires_at.getTime()<=Date.now()) throw new EvidenceError("UPLOAD_EXPIRED");
      if(row.state==="rejected") throw new EvidenceError("OBJECT_INVALID",row.rejection_code ?? undefined);
      await db.$client.query(`UPDATE app.evidence_upload SET state='quarantined',object_version_id=$3 WHERE tenant_id=$1 AND id=$2`,[context.tenantId,input.uploadId,input.objectVersionId]);
      return {upload:row};
    });
    if("existing" in prepared) return prepared.existing;
    let object:StoredObject;
    try { object=await this.storage.readExactVersion(prepared.upload.object_key,input.objectVersionId); }
    catch { await this.reject(context,input.uploadId,"missing_version"); throw new EvidenceError("OBJECT_INVALID","missing_version"); }
    const rejection=object.versionId!==input.objectVersionId ? "missing_version" : object.byteLength>Number(prepared.upload.maximum_bytes) ? "size_exceeded" :
      object.contentType!==prepared.upload.expected_content_type ? "wrong_type" : sha256(object.bytes)!==prepared.upload.expected_sha256.trim() ? "wrong_hash" : !hasCompleteImage(object.bytes,object.contentType)?"corrupt_image":null;
    if(rejection){await this.reject(context,input.uploadId,rejection);throw new EvidenceError("OBJECT_INVALID",rejection);}
    return withTenant(this.pool,context,async db=>{
      const existing=await db.$client.query(`SELECT * FROM app.evidence_object WHERE tenant_id=$1 AND upload_id=$2`,[context.tenantId,input.uploadId]); if(existing.rows[0])return existing.rows[0];
      const locked=await db.$client.query<UploadRow>(`SELECT * FROM app.evidence_upload WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[context.tenantId,input.uploadId]); const row=locked.rows[0];
      if(!row || row.state==="rejected" || row.object_version_id!==input.objectVersionId) throw new EvidenceError("OBJECT_INVALID");
      const verified=new Date(); await db.$client.query(`UPDATE app.evidence_upload SET state='verified',server_verified_at=$3,rejection_code=NULL WHERE tenant_id=$1 AND id=$2`,[context.tenantId,input.uploadId,verified]);
      const inserted=await db.$client.query(`INSERT INTO app.evidence_object (id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,device_captured_at,server_received_at,server_verified_at)
       VALUES ($1,$2,$1,$3,$4,'original',$5,$6,$7,$8,$9,$10,'standard_evidence',$11,$12,$13) RETURNING *`,[input.uploadId,context.tenantId,row.job_id,row.scope_item_id,input.evidenceType,row.object_key,input.objectVersionId,sha256(object.bytes),object.byteLength,object.contentType,row.device_captured_at,row.server_received_at,verified]); return inserted.rows[0];
    });
  }

  private reject(context:VerifiedTenantContext,id:string,code:string){return withTenant(this.pool,context,db=>db.$client.query(`UPDATE app.evidence_upload SET state='rejected',rejection_code=$3 WHERE tenant_id=$1 AND id=$2`,[context.tenantId,id,code])).then(()=>undefined);}

  async linkAndAssertProof(context:VerifiedTenantContext,input:{id:string;evidenceId:string;jobId:string;scopeItemId:string|null;requiredEvidenceType:string}){
    return withTenant(this.pool,context,async db=>{const result=await db.$client.query(`INSERT INTO app.evidence_link(id,tenant_id,evidence_id,job_id,scope_item_id,required_evidence_type)
      SELECT $1::uuid,$2::uuid,e.id,$3::uuid,$4::uuid,$5::varchar FROM app.evidence_object e JOIN app.evidence_upload u ON (u.tenant_id,u.id)=(e.tenant_id,e.upload_id)
      WHERE e.tenant_id=$2 AND e.id=$6 AND e.job_id=$3 AND e.scope_item_id IS NOT DISTINCT FROM $4::uuid AND e.evidence_type=$5::varchar AND e.kind='original' AND u.state='verified' RETURNING *`,[input.id,context.tenantId,input.jobId,input.scopeItemId,input.requiredEvidenceType,input.evidenceId]);
      if(!result.rows[0])throw new EvidenceError("EVIDENCE_NOT_AUTHORIZED");return result.rows[0];});
  }

  async registerPreview(context: VerifiedTenantContext, raw: unknown) {
    const input=z.object({id:UUID,originalEvidenceId:UUID,objectKey:z.string().min(1).max(1024),objectVersionId:z.string().min(1).max(1024),contentType:z.enum(["image/jpeg","image/png","image/webp"]),maximumBytes:z.number().int().positive().max(5_000_000)}).parse(raw);
    const object=await this.storage.readExactVersion(input.objectKey,input.objectVersionId);
    if(object.versionId!==input.objectVersionId || object.contentType!==input.contentType || object.byteLength>input.maximumBytes)throw new EvidenceError("OBJECT_INVALID","invalid_preview");
    return withTenant(this.pool,context,async db=>{const original=(await db.$client.query<{job_id:string;scope_item_id:string|null;evidence_type:string;retention_class:string;device_captured_at:Date|null;server_received_at:Date}>(`SELECT job_id,scope_item_id,evidence_type,retention_class,device_captured_at,server_received_at FROM app.evidence_object WHERE tenant_id=$1 AND id=$2 AND kind='original'`,[context.tenantId,input.originalEvidenceId])).rows[0];if(!original)throw new EvidenceError("EVIDENCE_NOT_AUTHORIZED");const result=await db.$client.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,original_evidence_id,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,device_captured_at,server_received_at,server_verified_at) VALUES($1,$2,NULL,$3,$4,'preview',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,clock_timestamp()) RETURNING *`,[input.id,context.tenantId,original.job_id,original.scope_item_id,input.originalEvidenceId,original.evidence_type,input.objectKey,input.objectVersionId,sha256(object.bytes),object.byteLength,object.contentType,original.retention_class,original.device_captured_at,original.server_received_at]);return result.rows[0];});
  }

  async authorizedDownloadUrl(context:VerifiedTenantContext,raw:unknown){const input=evidenceAccessSchema.parse(raw);const row=await withTenant(this.pool,context,async db=>(await db.$client.query<{object_key:string;object_version_id:string}>(`SELECT object_key,object_version_id FROM app.evidence_object WHERE tenant_id=$1 AND id=$2 AND job_id=$3 AND scope_item_id IS NOT DISTINCT FROM $4 AND kind='original'`,[context.tenantId,input.evidenceId,input.jobId,input.scopeItemId])).rows[0]);if(!row)throw new EvidenceError("EVIDENCE_NOT_AUTHORIZED");return this.storage.createDownloadUrl({key:row.object_key,versionId:row.object_version_id,expiresInSeconds:input.expiresInSeconds});}

  async cleanupExpiredOrphans(context:VerifiedTenantContext,now=new Date()) { const rows=await withTenant(this.pool,context,async db=>(await db.$client.query<{id:string;object_key:string;object_version_id:string|null}>(`SELECT id,object_key,object_version_id FROM app.evidence_upload u WHERE tenant_id=$1 AND state IN ('pending','quarantined') AND retention_class='transient_upload' AND expires_at<$2 AND NOT EXISTS(SELECT 1 FROM app.evidence_object e WHERE (e.tenant_id,e.upload_id)=(u.tenant_id,u.id))`,[context.tenantId,now])).rows); for(const row of rows){if(row.object_version_id)await this.storage.deleteExactVersion(row.object_key,row.object_version_id);await this.reject(context,row.id,"orphan_expired");} return rows.length; }
}
