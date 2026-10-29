import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepgramFixtureAdapter, DEEPGRAM_FIXTURE_ENDPOINT } from "@jobguard/ai";
import { syntheticSpeechAudio } from "@jobguard/core";
import { CaptureRepository, type VerifiedTenantContext } from "@jobguard/db";
import type { Pool } from "pg";
import { captureSourceResponseV1 } from "./contracts.js";
import { DeepgramFixtureCaptureService } from "./deepgram-fixture.service.js";
const tenantId="10000000-0000-4000-8000-000000000001",jobId="20000000-0000-4000-8000-000000000001";
const evidenceId="30000000-0000-4000-8000-000000000001",captureId="40000000-0000-4000-8000-000000000001";
const context={tenantId} as VerifiedTenantContext;
const bytes=syntheticSpeechAudio();
const record={contractVersion:"registered_speech_audio_v1",tenantId,jobId,evidenceId,state:"verified",
  environment:"synthetic_demo",evidenceType:"synthetic_speech_audio",contentType:"audio/wav",objectKey:"fixture/original",
  objectVersionId:"v1",sha256:createHash("sha256").update(bytes).digest("hex"),byteLength:46,
  serverVerifiedAt:"2026-10-29T00:00:00.000Z",bytes};
const raw={contractVersion:"deepgram_fixture_request_v1",captureId,jobId,evidenceId,fixtureId:"shelf",originalText:"Keep my text",timeoutMs:100};
function service(status="complete",read:()=>Promise<unknown>=async()=>record){
  const adapter=new DeepgramFixtureAdapter({contractVersion:"deepgram_fixture_config_v1",mode:"fixture",endpoint:DEEPGRAM_FIXTURE_ENDPOINT},
    {shelf:{contractVersion:"deepgram_fixture_response_v1",transcript:"Fit a fictional shelf",status}});
  return new DeepgramFixtureCaptureService(adapter,{read},new CaptureRepository({} as Pool));
}
afterEach(()=>vi.restoreAllMocks());
describe("dark capture entry point (not registered as a route)",()=>{
  it("persists the labelled source and provenance for normal repository replay checks",async()=>{
    const persist=vi.spyOn(CaptureRepository.prototype,"persistSpeechFixtureSource").mockResolvedValue({jobId} as never);
    const result=await service().capture(context,raw);
    expect(result).toMatchObject({status:"ready",originalText:raw.originalText,saved:{jobId}});
    if(result.status!=="ready")throw new Error("expected ready");
    expect(captureSourceResponseV1.safeParse({...result.source,version:1,audioByteLength:46}).success).toBe(true);
    expect(captureSourceResponseV1.safeParse({...result.source,version:1,audioByteLength:0}).success).toBe(false);
    expect(persist).toHaveBeenCalledWith(context,captureId,expect.objectContaining({kind:"deepgram_transcript",
      acquisition:expect.objectContaining({evidenceId,evidenceJobId:jobId,originalText:raw.originalText,audioByteLength:46})}));
  });
  it.each(["text","browser_local_transcript"])("preserves the zero-byte response rule for %s",kind=>{
    expect(captureSourceResponseV1.safeParse({kind,text:"Original",version:1,acquisition:null,audioByteLength:46}).success).toBe(false);
    expect(captureSourceResponseV1.safeParse({kind,text:"Original",version:1,acquisition:null,audioByteLength:0}).success).toBe(true);
  });
  it("keeps partial text for review and never automatically persists it",async()=>{
    const persist=vi.spyOn(CaptureRepository.prototype,"persistSpeechFixtureSource");
    expect(await service("partial").capture(context,raw)).toMatchObject({status:"partial",originalText:raw.originalText});
    expect(persist).not.toHaveBeenCalled();
  });
  it.each([null,{...record,tenantId:jobId},{...record,state:"pending"}])("never persists absent, pending or foreign audio",async audio=>{
    const persist=vi.spyOn(CaptureRepository.prototype,"persistSpeechFixtureSource");
    expect(await service("complete",async()=>audio).capture(context,raw)).toMatchObject({status:"recoverable",originalText:raw.originalText});
    expect(persist).not.toHaveBeenCalled();
  });
});
