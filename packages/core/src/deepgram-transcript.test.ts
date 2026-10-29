import { describe, expect, it } from "vitest";
import { captureRequestV1 } from "./capture.js";
import { deepgramTranscriptSourceV1, syntheticSpeechAudio } from "./deepgram-transcript.js";

const source={kind:"deepgram_transcript",text:"Fixture shelf",acquisition:{
  contractVersion:"deepgram_fixture_transcript_v1",environment:"synthetic_demo",provider:"deepgram_fixture",
  deployment:"deepgram-fixture.invalid",model:"fixture-stt-v1",
      schemaVersion:"deepgram_fixture_response_v1",evaluationVersion:"deepgram-fixture-contract-v1",fixtureId:"shelf",
  evidenceId:"30000000-0000-4000-8000-000000000001",evidenceJobId:"20000000-0000-4000-8000-000000000001",
  objectVersionId:"v1",sourceSha256:"a".repeat(64),audioByteLength:46,originalText:"Original note",
  rawTranscript:"Fixture shelf",status:"complete",humanEdited:false,
}};
describe("Deepgram transcript source boundary",()=>{
  it("labels a server-built fixture independently of browser dictation",()=>{
    expect(deepgramTranscriptSourceV1.parse(source).kind).toBe("deepgram_transcript");
    expect(captureRequestV1.safeParse({contractVersion:"job_capture_v1",requested_tenant_id:source.acquisition.evidenceJobId,
      captureId:source.acquisition.evidenceId,source,fixtureId:"shelf"}).success).toBe(false);
  });
  it.each([{environment:"production"},{provider:"deepgram"},{deployment:"global.invalid"},{audioByteLength:100},
    {objectVersionId:""},{evidenceId:"bad"},{sourceSha256:"bad"},{status:"pending"}])("rejects live or malformed acquisition facts",bad=>{
    expect(deepgramTranscriptSourceV1.safeParse({...source,acquisition:{...source.acquisition,...bad}}).success).toBe(false);
  });
  it("returns independent immutable-in-practice silent WAV fixture copies",()=>{
    const one=syntheticSpeechAudio(),two=syntheticSpeechAudio();
    expect(one.length).toBe(46);expect(new TextDecoder().decode(one.slice(0,4))).toBe("RIFF");
    one[45]=1;expect(two[45]).toBe(0);
  });
});
