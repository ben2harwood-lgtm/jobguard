import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { PrivateVersionedStorage } from "@jobguard/storage";
import { sha256 } from "@jobguard/storage";
import { syntheticSpeechAudio } from "@jobguard/core";
import { expect, it, vi } from "vitest";
import { EvidenceService } from "./evidence.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
it.each([false, true])("refuses fixture WAV for a non-synthetic or foreign job, replay included (resumable=%s)", async resumable => {
 const query=vi.fn(async(_sql:string)=>({rows:[],rowCount:0}));
 const pool={connect:async()=>({query,release(){}})} as unknown as Pool;
 const createUploadUrl=vi.fn();
 const service=new EvidenceService(pool,{createUploadUrl} as unknown as PrivateVersionedStorage,resumable);
 const input={id:randomUUID(),jobId:randomUUID(),expectedSha256:sha256(syntheticSpeechAudio()),contentType:"audio/wav",syntheticAudioFixture:true,maximumBytes:46,expiresAt:new Date("2099-01-01")};
 for(let replay=0;replay<2;replay++) await expect(service.beginUpload(verifiedTenantContextForQueuedJob(randomUUID()),input)).rejects.toMatchObject({code:"EVIDENCE_NOT_AUTHORIZED"});
 expect(createUploadUrl).not.toHaveBeenCalled();
 expect(query.mock.calls.some(([sql])=>String(sql).includes("INSERT"))).toBe(false);
});

it("refuses a pre-existing fixture WAV before finalization replay or storage on a non-synthetic job",async()=>{
 const job=randomUUID(),uploadId=randomUUID();
 const query=vi.fn(async(sql:string)=>({rows:sql.startsWith("SELECT job_id,")?[{job_id:job,expected_content_type:"audio/wav"}]:[],rowCount:0}));
 const pool={connect:async()=>({query,release(){}})} as unknown as Pool;
 const readExactVersion=vi.fn();
 const service=new EvidenceService(pool,{readExactVersion} as unknown as PrivateVersionedStorage);
 for(let replay=0;replay<2;replay++) await expect(service.finalize(verifiedTenantContextForQueuedJob(randomUUID()),{uploadId,objectVersionId:"fixture-v1",evidenceType:"synthetic_speech_audio"})).rejects.toMatchObject({code:"EVIDENCE_NOT_AUTHORIZED"});
 expect(readExactVersion).not.toHaveBeenCalled();
 expect(query.mock.calls.some(([sql])=>sql.includes("app.evidence_object")||sql.includes("UPDATE"))).toBe(false);
});
