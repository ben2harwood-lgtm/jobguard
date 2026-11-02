// PostgreSQL fixtures; execution belongs to CI, never the restricted builder sandbox.
import { randomUUID, createHash } from "node:crypto";
import { visitFixture, type Cluster, type Actor } from "./site-visit-fixtures.js";
export { cluster, ownerTx, invite, moveOffLive, secondJob, smallTrack } from "./site-visit-fixtures.js";
export async function promptSession(c: Cluster, actor: Actor): Promise<string> {
 const token = randomUUID();
 await c.admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
 VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '6 days')`, [randomUUID(),actor.member.tenantId,actor.member.membershipId,actor.member.identityUserId,createHash("sha256").update(token).digest("hex")]);
 return token;
}
export async function promptFixture(c: Cluster) {
 const f = await visitFixture(c);
 const sessions: Record<string,string> = {};
 for (const [role,actor] of Object.entries(f.members)) sessions[role] = await promptSession(c,actor);
 sessions.named = await promptSession(c,f.named);
 return {...f,sessions};
}
export type PromptFixture = Awaited<ReturnType<typeof promptFixture>>;
export const materialsInput = (f: PromptFixture, overrides: Record<string,unknown> = {}) => ({version:"materials-issue.v1",commandId:randomUUID(),jobId:f.jobId,sourceId:"fictional-store",eventId:randomUUID(),workIdentity:"REPAIR-DOOR",unit:"each",quantity:"100",occurredAtMicros:"1792310400000000",kind:"issue",...overrides});
export const evaluateInput = (f: PromptFixture, overrides: Record<string,unknown> = {}) => ({version:"evaluate-live-prompts.v1",commandId:randomUUID(),jobId:f.jobId,...overrides});
export const listInput = (f: PromptFixture) => ({version:"live-prompt-list.v1",jobId:f.jobId});

/** Existing synthetic image upload/finalize commands, using an actual CRC-valid PNG tEXt chunk. */
export async function completionPhoto(c: Cluster, f: PromptFixture, tags: string[]) {
 const { EvidenceService } = await import('../src/evidence.js');
 const { MemoryStorage, pngBytes } = await import('./site-extra-evidence-fixtures.js');
 const original=Buffer.from(pngBytes(23));
 const payload=Buffer.concat([Buffer.from('jobguard:completion-work','latin1'),Buffer.from([0]),Buffer.from(JSON.stringify(tags),'latin1')]);
 const kind=Buffer.from('tEXt'), chunk=Buffer.alloc(payload.length+12); chunk.writeUInt32BE(payload.length);kind.copy(chunk,4);payload.copy(chunk,8);
 let crc=0xffffffff; for(const byte of Buffer.concat([kind,payload])){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}chunk.writeUInt32BE((crc^0xffffffff)>>>0,payload.length+8);
 const bytes=Buffer.concat([original.subarray(0,original.length-12),chunk,original.subarray(original.length-12)]), sha256=createHash('sha256').update(bytes).digest('hex'), storage=new MemoryStorage(), service=new EvidenceService(c.runtime,storage), objectVersion='completion-photo-v1';
 const scopeId=(await c.admin.query('SELECT l.scope_item_id FROM app.work_order_line l JOIN app.work_order_current w ON(w.tenant_id,w.revision_id)=(l.tenant_id,l.revision_id) WHERE l.tenant_id=$1 AND l.job_id=$2 ORDER BY l.position LIMIT 1',[f.p.tenantId,f.jobId])).rows[0]!.scope_item_id as string;
 const upload=await service.beginUpload(f.ctx,{jobId:f.jobId,scopeItemId:scopeId,expectedSha256:sha256,contentType:'image/png',maximumBytes:10000,retentionClass:'standard_evidence',expiresAt:new Date(Date.now()+3600000)},async(db,u)=>{
  await db.$client.query("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$7,$4,$5,'synthetic_demo','image/png',$6)",[f.p.tenantId,u.id,f.jobId,u.objectKey,objectVersion,bytes,scopeId]);
 });
 storage.put(upload.objectKey,objectVersion,bytes);
 await service.finalize(f.ctx,{uploadId:upload.id,objectVersionId:objectVersion,evidenceType:'completion_photo'});
 return {evidenceId:upload.id,sha256,objectVersion};
}
