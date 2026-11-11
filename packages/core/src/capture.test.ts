import { describe,expect,it } from "vitest";
import { captureRequestV1,jobRecordProposalV1 } from "./capture.js";
describe("proposal boundary",()=>{it("rejects extracted values without a versioned span",()=>{expect(jobRecordProposalV1.safeParse({title:{value:"x",provenance:{kind:"extracted"}},lines:[],materials:[],questions:[]}).success).toBe(false);});});
describe("browser-local capture boundary",()=>{it("requires explicit local-only acquisition facts",()=>{const input={contractVersion:"job_capture_v1",requested_tenant_id:"10000000-0000-4000-8000-000000000001",captureId:"20000000-0000-4000-8000-000000000001",fixtureId:"fixture",source:{kind:"browser_local_transcript",text:"Test",acquisition:{contractVersion:"browser_local_dictation_v1",language:"en-GB",processLocally:true,audioUploaded:false,audioStored:false,rawFinalText:"Test",humanEdited:false}}};expect(captureRequestV1.safeParse(input).success).toBe(true);expect(captureRequestV1.safeParse({...input,source:{...input.source,acquisition:{...input.source.acquisition,processLocally:false}}}).success).toBe(false)})});

describe("party clause text suggestions", () => {
  it("returns exact Unicode source offsets and stops before work details", async () => {
    const { suggestCapturePartyClause } = await import("./capture.js");
    for (const detail of [", two coats, woodwork in gloss", ". Rip out the suite", " and paint walls", ", about £900", " two coats", " four days", " in gloss"]) {
      const text = `🧱 Paint for Mr Éxample at 9 Notreal Road${detail}`;
      const suggestion = suggestCapturePartyClause(text)!;
      expect(suggestion.customer.text).toBe("Mr Éxample");
      expect(suggestion.site.text).toBe("9 Notreal Road");
      for (const field of [suggestion.customer, suggestion.site]) expect(text.slice(field.start, field.end)).toBe(field.text);
      expect(text.slice(suggestion.start, suggestion.end)).toBe("for Mr Éxample at 9 Notreal Road");
    }
  });
  it("refuses ambiguous, multiple and misleading clauses", async () => {
    const { suggestCapturePartyClause } = await import("./capture.js");
    for (const text of ["Paint for £900 at four days", "Fit for purpose at a good price", "Paint for Mr Example or Mrs Sample at 9 Notreal Road", "Paint for Mr Example at 9 Notreal Road and 4 Madeup Lane", "for Mr Example at 9 Notreal Road; for Mrs Sample at 4 Madeup Lane", "for <script>alert(1)</script> at 9 Notreal Road", "for name@example.invalid at 9 Notreal Road"]) {
      expect(suggestCapturePartyClause(text), text).toBeNull();
    }
  });
});
