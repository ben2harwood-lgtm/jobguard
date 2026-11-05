import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { syntheticSpeechAudio } from "@jobguard/core";
import { DEEPGRAM_FIXTURE_ENDPOINT, DeepgramFixtureAdapter } from "./deepgram.js";

const tenantId="10000000-0000-4000-8000-000000000001";
const jobId="20000000-0000-4000-8000-000000000001";
const evidenceId="30000000-0000-4000-8000-000000000001";
const captureId="40000000-0000-4000-8000-000000000001";
const bytes=syntheticSpeechAudio();
const hash=createHash("sha256").update(bytes).digest("hex");
const record={contractVersion:"registered_speech_audio_v1",tenantId,jobId,evidenceId,state:"verified",
  environment:"synthetic_demo",evidenceType:"synthetic_speech_audio",contentType:"audio/wav",
  objectKey:"synthetic/original",objectVersionId:"version-1",sha256:hash,byteLength:46,
  serverVerifiedAt:"2026-10-29T00:00:00.000Z",bytes};
const input={contractVersion:"deepgram_fixture_request_v1",captureId,jobId,evidenceId,fixtureId:"fictional",
  originalText:"Keep these typed words.",timeoutMs:1000};
const config={contractVersion:"deepgram_fixture_config_v1",mode:"fixture",endpoint:DEEPGRAM_FIXTURE_ENDPOINT};
const response={contractVersion:"deepgram_fixture_response_v1",transcript:"Fit a fictional shelf",status:"complete"};
const make=(reply:unknown=response)=>new DeepgramFixtureAdapter(config,{fictional:reply});
const reader=(override:Record<string,unknown>={})=>({read:vi.fn(async()=>({...record,...override}))});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});

describe("dark Deepgram fixture adapter",()=>{
  it("reads verified audio first, produces a distinct cited proposal and preserves original text on replay",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    const audio=reader(),adapter=make();
    const first=await adapter.capture(tenantId,input,audio);
    expect(first.status).toBe("ready");
    if(first.status!=="ready")throw new Error("expected ready");
    expect(first.source).toMatchObject({kind:"deepgram_transcript",text:response.transcript,
      acquisition:{originalText:input.originalText,sourceSha256:hash,evidenceId,audioByteLength:46,objectVersionId:"version-1"}});
    expect(first.proposal.lines[0]?.description.provenance).toMatchObject({kind:"extracted",span:{sourceId:captureId}});
    expect(first.proposal.lines[0]?.unitPricePence.value).toBeNull();
    expect(await adapter.capture(tenantId,input,audio)).toEqual(first);
    expect(audio.read).toHaveBeenCalledWith(tenantId,jobId,evidenceId);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([undefined,{}, {...config,mode:"live"},{...config,endpoint:"https://global.invalid/listen"},
    {...config,endpoint:undefined},{...config,apiKey:"forbidden"}])("refuses unconfigured, live, fallback and credential-bearing paths",bad=>{
    expect(()=>new DeepgramFixtureAdapter(bad,{})).toThrow("LIVE_DISABLED");
  });
  it.each([{tenantId:jobId},{jobId:tenantId},{evidenceId:captureId},{state:"pending"},
    {environment:"production"},{objectVersionId:""},{byteLength:0},{sha256:"0".repeat(64)},
    {bytes:new Uint8Array([1])},{evidenceType:"site_photo"}])("refuses wrong scope or unfinished/mismatched evidence",async override=>{
    expect(await make().capture(tenantId,input,reader(override))).toEqual({status:"recoverable",originalText:input.originalText,code:"AUDIO_NOT_VERIFIED"});
  });
  it("refuses arbitrary audio even when its supplied hash and byte length match",async()=>{
    const changed=bytes.slice();changed[45]=1;
    expect(await make().capture(tenantId,input,reader({bytes:changed,sha256:createHash("sha256").update(changed).digest("hex")})))
      .toMatchObject({status:"recoverable",code:"AUDIO_NOT_VERIFIED"});
  });
  it("retains input on missing upload, unavailable provider and malformed/empty response",async()=>{
    for(const audio of [{read:async()=>null},{read:async()=>{throw new Error("private storage error")}}])
      expect(await make().capture(tenantId,input,audio)).toEqual({status:"recoverable",originalText:input.originalText,code:"AUDIO_NOT_VERIFIED"});
    expect(await make().capture(tenantId,{...input,fixtureId:"not-registered"},reader())).toMatchObject({status:"recoverable",originalText:input.originalText,code:"PROVIDER_UNAVAILABLE"});
    for(const reply of [{...response,transcript:" "},{...response,status:"unknown"},{...response,extra:"invalid"}])
      expect(await make(reply).capture(tenantId,input,reader())).toMatchObject({status:"recoverable",originalText:input.originalText,code:"INVALID_RESPONSE"});
  });
  it("returns partial text separately for review without replacing the original",async()=>{
    const result=await make({...response,status:"partial"}).capture(tenantId,input,reader());
    expect(result).toMatchObject({status:"partial",originalText:input.originalText,source:{text:response.transcript,acquisition:{status:"partial",originalText:input.originalText}}});
  });
  it("bounds a hung lookup and ignores late completion",async()=>{
    vi.useFakeTimers();let complete!:(value:unknown)=>void;
    const result=make().capture(tenantId,{...input,timeoutMs:10},{read:()=>new Promise(resolve=>{complete=resolve})});
    await vi.advanceTimersByTimeAsync(10);
    expect(await result).toEqual({status:"recoverable",code:"TIMEOUT",originalText:input.originalText});
    complete(record);await vi.runAllTimersAsync();
    expect(await result).toMatchObject({status:"recoverable"});
  });
  it.each([{...input,captureId:"bad"},{...input,timeoutMs:0},{...input,originalText:"x".repeat(50_001)},
    {...input,endpoint:"override"},{...input,fixtureId:"__proto__"}])("rejects bad input or unregistered special keys",async bad=>{
    const audio=reader();
    if(bad.fixtureId==="__proto__")expect(await make().capture(tenantId,bad,audio)).toMatchObject({code:"PROVIDER_UNAVAILABLE"});
    else{await expect(make().capture(tenantId,bad,audio)).rejects.toMatchObject({code:"INVALID_REQUEST"});expect(audio.read).not.toHaveBeenCalled()}
  });
  it("snapshots fixture responses so callers cannot alter a replay",async()=>{
    const fixtures={fictional:{...response}};const adapter=new DeepgramFixtureAdapter(config,fixtures);
    fixtures.fictional.transcript="Changed";
    expect(await adapter.capture(tenantId,input,reader())).toMatchObject({source:{text:response.transcript}});
  });
});
