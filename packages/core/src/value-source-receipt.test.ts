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
 expect(r.found.movements[1]).toMatchObject({kind:"reversal",recovered:{pence:-48000},fee:{pence:-4800}});
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
