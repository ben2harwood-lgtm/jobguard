import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { syntheticSpeechAudio } from "@jobguard/core";
import { FixtureSpeechAudioReader } from "./speech-audio.js";
import { EvidenceService } from "./evidence.js";
import type { VerifiedTenantContext } from "./tenant-context.js";

const context={tenantId:"10000000-0000-4000-8000-000000000001"} as VerifiedTenantContext;
const bytes=syntheticSpeechAudio();
const hash=createHash("sha256").update(bytes).digest("hex");
describe("speech fixture upload boundary (no database)",()=>{
  it("returns a typed scope error before any SQL or storage access",async()=>{
    const connect=vi.fn(),readExactVersion=vi.fn();
    const reader=new FixtureSpeechAudioReader({connect} as unknown as Pool,{readExactVersion} as never,context);
    await expect(reader.read("20000000-0000-4000-8000-000000000001","job","evidence"))
      .rejects.toMatchObject({code:"AUDIO_NOT_VERIFIED"});
    expect(connect).not.toHaveBeenCalled();expect(readExactVersion).not.toHaveBeenCalled();
  });
  it.each([{syntheticAudioFixture:undefined},{expectedSha256:"0".repeat(64)},{maximumBytes:47}])("refuses arbitrary audio before storage or SQL",async change=>{
    const connect=vi.fn(),createUploadUrl=vi.fn();
    const evidence=new EvidenceService({connect} as unknown as Pool,{createUploadUrl} as never);
    await expect(evidence.beginUpload(context,{jobId:"20000000-0000-4000-8000-000000000001",contentType:"audio/wav",
      expectedSha256:hash,maximumBytes:46,syntheticAudioFixture:true,expiresAt:new Date("2099-01-01"),...change})).rejects.toThrow("synthetic_audio_only");
    expect(connect).not.toHaveBeenCalled();expect(createUploadUrl).not.toHaveBeenCalled();
  });
});
