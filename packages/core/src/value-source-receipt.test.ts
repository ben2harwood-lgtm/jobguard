import { expect, it } from "vitest";
import { fixture } from "./recovery-attribution-persistence.test.js";
import { mapValueReceipt, mapBusinessValueSummary, valueJobSourcesV1 } from "./value-source-receipt.js";
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function sources(){const d={...fixture(),previousAssessmentId:null as string|null};return {tenantId:d.tenantId,jobId:d.jobId,lockId:d.lockId,lockedRevisionId:id(1),lockedAt:"2026-10-01T00:00:00Z",foundComplete:true,checkId:id(2),checkedAt:"2026-10-02T00:00:00Z",checked:[id(3)],tracked:[{id:id(4),revisionId:id(1),sourceId:id(5),netPence:360000,invoiceId:id(6),checkId:id(8),at:"2026-10-03T00:00:00Z"}],assessments:[{document:d,current:true}]};}
it("maps source-backed tracked and found figures, with fee-free captures",()=>{
 const r=mapValueReceipt(sources());expect(r.checkedCount).toBe(1);expect(r.tracked.pence).toBe(360000);expect(r.trackedFee.pence).toBe(0);
 expect(r.found).toMatchObject({state:"mapped",recovered:{pence:80000},fee:{pence:8000},yoursBeforeVatAndTax:{pence:72000}});
});
it("reassessment replaces the balance; replay is rejected and reversal remains inspectable",()=>{
 const s=sources(),d=structuredClone(s.assessments[0]!.document);
 d.assessmentId=id(7);d.facts.revisionId=d.assessmentId;d.revision=2;d.previousAssessmentId=s.assessments[0]!.document.assessmentId;d.remainingPrincipal={numerator:"32000",denominator:"1"};
 s.assessments.push({document:d,current:true});
 const r=mapValueReceipt(s);expect(r.found.recovered?.pence).toBe(32000);expect(r.found.fee?.pence).toBe(3200);
 expect(r.found.movements[1]).toMatchObject({kind:"reversal",recovered:{pence:-48000},fee:{numerator:"-4800",denominator:"1"}});
 s.assessments.push(s.assessments[1]!);expect(()=>mapValueReceipt(s)).toThrow();
});
it.each([0,50000,282000])("uses the cumulative v3 kernel for %i pence",n=>{
 const s=sources();s.assessments[0]!.document.remainingPrincipal.numerator=String(n);
 if(n===0){s.assessments[0]!.document.assessmentOutcome="excluded";s.assessments[0]!.document.reasonCodes=["no_remaining_principal"];}
 const r=mapValueReceipt(s);expect(r.found.fee?.pence).toBe(n/10);expect(r.found.yoursBeforeVatAndTax?.pence).toBe(n-n/10);
});
it("stale sources and fractional pence refuse current figures",()=>{
 const s=sources();s.assessments[0]!.current=false;expect(mapValueReceipt(s).found.recovered).toBeNull();
 s.assessments[0]!.current=true;s.assessments[0]!.document.remainingPrincipal={numerator:"20000",denominator:"43"};expect(mapValueReceipt(s).found.recovered).toBeNull();
});
it("rejects cross-customer, wrong-lock, duplicate checked/line and non-locked revision sources",()=>{
 for(const mutate of [
  (s:ReturnType<typeof sources>)=>{s.assessments[0]!.document.jobId=id(9);},
  (s:ReturnType<typeof sources>)=>{s.assessments[0]!.document.tenantId=id(9);},
  (s:ReturnType<typeof sources>)=>{s.assessments[0]!.document.lockId=id(9);},
  (s:ReturnType<typeof sources>)=>{s.tracked[0]!.revisionId=id(9);},
  (s:ReturnType<typeof sources>)=>{s.tracked.push(s.tracked[0]!);},
  (s:ReturnType<typeof sources>)=>{s.checked.push(s.checked[0]!);},
 ]){const s=sources();mutate(s);expect(valueJobSourcesV1.safeParse(s).success).toBe(false);}
});

it("half-open windows count each immutable movement once, including negative corrections",()=>{
 const s=sources(),first=s.assessments[0]!.document;
 const next={...structuredClone(first),assessmentId:id(70),previousAssessmentId:first.assessmentId,revision:2,serverRecordedAt:"2026-10-24T00:00:00Z",remainingPrincipal:{numerator:"32000",denominator:"1"}};
 next.facts.revisionId=next.assessmentId;s.assessments.push({document:next,current:true});
 const before=mapValueReceipt(s,{from:"2026-10-23T00:00:00Z",toExclusive:"2026-10-24T00:00:00Z"});
 const after=mapValueReceipt(s,{from:"2026-10-24T00:00:00Z",toExclusive:"2026-10-25T00:00:00Z"});
 expect(before.found.movements).toHaveLength(1);expect(after.found.movements).toHaveLength(1);
 expect(before.found.recovered!.pence+after.found.recovered!.pence).toBe(32000);
 expect(after.found.recovered!.pence).toBe(-48000);expect(after.checkedCount).toBe(0);expect(after.tracked.pence).toBe(0);
});
it("unassessed catch cases refuse a definitive found balance",()=>{const s=sources();s.foundComplete=false;expect(mapValueReceipt(s).found.recovered).toBeNull();});

it("keeps PostgreSQL microsecond window boundaries exact",()=>{
 const s=sources();s.assessments[0]!.document.serverRecordedAt="2026-10-23T12:00:00.000100Z";
 const receipt=mapValueReceipt(s,{from:"2026-10-23T12:00:00.000099Z",toExclusive:"2026-10-23T12:00:00.000101Z"});
 expect(receipt.found.movements).toHaveLength(1);expect(receipt.found.recovered!.pence).toBe(80000);
});

it("business totals sum only distinct same-company job receipts and preserve unknowns",()=>{
 const first=mapValueReceipt(sources());expect(mapBusinessValueSummary([first])).toMatchObject({tracked:{pence:360000},trackedFee:{pence:0},recovered:{pence:80000},fee:{pence:8000}});
 expect(()=>mapBusinessValueSummary([first,first])).toThrow("VALUE_SUMMARY_SCOPE_MISMATCH");
 const unknown=sources();unknown.foundComplete=false;expect(mapBusinessValueSummary([mapValueReceipt(unknown)]).recovered).toBeNull();
});

function threeCatches(){
 const s=sources(),first=s.assessments[0]!.document;
 s.assessments=[101,105,105].map((n,i)=>{
  const d=structuredClone(first);
  d.assessmentId=id(100+i);d.caseId=id(110+i);d.workId=id(120+i);d.lineId=id(130+i);
  d.facts.workId=d.workId;d.facts.lineId=d.lineId;d.facts.revisionId=d.assessmentId;
  for(const fact of Object.values(d.facts.facts)){fact.workId=d.workId;fact.lineId=d.lineId;}
  d.remainingPrincipal={numerator:String(n),denominator:"1"};
  d.serverRecordedAt=`2026-10-${23+i}T12:00:00Z`;
  return {document:d,current:true};
 });
 return s;
}
it("rounds three catches once per job, preserving their unrounded fee shares",()=>{
 const r=mapValueReceipt(threeCatches());
 // Per-line half-even fees would be 10 + 10 + 10 = 30p; 311 / 10 rounds to 31p.
 expect(r.found).toMatchObject({recovered:{pence:311},fee:{pence:31},yoursBeforeVatAndTax:{pence:280}});
 expect(r.found.movements.map(m=>m.fee)).toEqual([
  {numerator:"101",denominator:"10"},{numerator:"21",denominator:"2"},{numerator:"21",denominator:"2"},
 ]);
 expect(r.found.movements[0]!.yoursBeforeVatAndTax).toEqual({numerator:"909",denominator:"10"});
 expect(mapBusinessValueSummary([r]).fee?.pence).toBe(31);
});
it("window fees reconcile cumulative job rounding and a full catch reversal",()=>{
 const s=threeCatches(),first=s.assessments[0]!.document;
 const reversal={...structuredClone(first),assessmentId:id(150),previousAssessmentId:first.assessmentId,revision:2,
  serverRecordedAt:"2026-10-26T12:00:00Z",remainingPrincipal:{numerator:"0",denominator:"1"},
  assessmentOutcome:"excluded",reasonCodes:["no_remaining_principal"]};
 reversal.facts.revisionId=reversal.assessmentId;s.assessments.push({document:reversal,current:true});
 const windows=[23,24,25,26].map(day=>mapValueReceipt(s,{from:`2026-10-${day}T00:00:00Z`,toExclusive:`2026-10-${day+1}T00:00:00Z`}));
 expect(windows.map(r=>r.found.fee!.pence)).toEqual([10,11,10,-10]);
 expect(windows.map(r=>r.found.recovered!.pence)).toEqual([101,105,105,-101]);
 expect(windows.reduce((n,r)=>n+r.found.fee!.pence,0)).toBe(mapValueReceipt(s).found.fee!.pence);
 expect(windows[3]!.found.movements[0]).toMatchObject({kind:"reversal",fee:{numerator:"-101",denominator:"10"}});
});
