import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import type { Pool } from "pg";
import type { VerifiedTenantContext } from "@jobguard/db";

/** A real, CRC-valid fictional PNG, registered through begin/finalize rather than forged verification rows. */
export async function taggedCompletionPhoto(db: typeof import("@jobguard/db"), runtime: Pool, context: VerifiedTenantContext, jobId: string, scopeItemId: string, tags: string[]) {
 const chunk=(name:string,data:Buffer)=>{
  const type=Buffer.from(name),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);type.copy(out,4);data.copy(out,8);
  let crc=0xffffffff;for(const byte of Buffer.concat([type,data])){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}out.writeUInt32BE((crc^0xffffffff)>>>0,data.length+8);return out;
 };
 const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=2;
 const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(Buffer.from([0,23,0,40]))),chunk("tEXt",Buffer.from(`jobguard:completion-work\0${JSON.stringify(tags)}`,"latin1")),chunk("IEND",Buffer.alloc(0))]);
 const sha256=createHash("sha256").update(bytes).digest("hex"),objectVersion="fictional-completion-v1";
 const storage:ConstructorParameters<typeof db.EvidenceService>[1]={
  createUploadUrl:async()=>"memory://fictional-upload",createDownloadUrl:async()=>"memory://fictional-download",
  readExactVersion:async(key,versionId)=>({key,versionId,bytes,byteLength:bytes.length,contentType:"image/png"}),deleteExactVersion:async()=>undefined,
 };
 const service=new db.EvidenceService(runtime,storage);
 const upload=await service.beginUpload(context,{jobId,scopeItemId,expectedSha256:sha256,contentType:"image/png",maximumBytes:10000,retentionClass:"standard_evidence",expiresAt:new Date(Date.now()+3600000)},async(tx,u)=>{
  await tx.$client.query("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo','image/png',$7)",[context.tenantId,u.id,jobId,scopeItemId,u.objectKey,objectVersion,bytes]);
 });
 await service.finalize(context,{uploadId:upload.id,objectVersionId:objectVersion,evidenceType:"completion_photo"});
 return {evidenceId:upload.id,sha256,objectVersion};
}
