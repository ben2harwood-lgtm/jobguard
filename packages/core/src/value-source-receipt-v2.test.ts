import { expect, it } from "vitest";
import { mapValueReceiptV2, mapCurrentBusinessValueSummary } from "./value-source-receipt-v2.js";
import { mappedValueReceiptV1 } from "./value-source-receipt.js";
const id=(n:number)=>`60000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const gbp=(pence:number)=>({pence,currency:"GBP" as const});
function sources(){
 return {base:{tenantId:id(1),jobId:id(2),lockId:id(3),lockedRevisionId:id(4),lockedAt:"2026-10-01T00:00:00Z",foundComplete:true,checkId:id(5),checkedAt:"2026-10-02T00:00:00Z",checked:[],tracked:[],assessments:[]},
 supplier:{reason:"No approved supplier derivation",balances:[]},withheld:{reason:null as string|null,balances:[
  {tenantId:id(1),jobId:id(2),derivationId:id(6),revision:1,at:"2026-10-03T00:00:00.000100Z",recovered:gbp(282000),fee:gbp(28200),allocationIds:[id(7),id(8)],statementHash:"a".repeat(64)},
  {tenantId:id(1),jobId:id(2),derivationId:id(9),revision:2,at:"2026-10-04T00:00:00.000100Z",recovered:gbp(32000),fee:gbp(3200),allocationIds:[id(7),id(8)],statementHash:"b".repeat(64)},
 ]}};
}
it("maps stored v3 balances and an explicit reversal without changing v1",()=>{
 const s=sources();const original=mapValueReceiptV2({...s,withheld:{reason:null,balances:s.withheld.balances.slice(0,1)}});
 expect(original.withheld).toMatchObject({recovered:gbp(282000),fee:gbp(28200),yoursBeforeVatAndTax:gbp(253800)});
 const r=mapValueReceiptV2(s);
 expect(r.withheld).toMatchObject({recovered:gbp(32000),fee:gbp(3200),yoursBeforeVatAndTax:gbp(28800)});
 expect(r.withheld.movements[1]).toMatchObject({kind:"reversal",recovered:gbp(-250000),fee:gbp(-25000)});
 expect(r.supplier).toMatchObject({state:"unavailable",recovered:null,fee:null});
 expect(mappedValueReceiptV1.safeParse(r).success).toBe(false);
});
it("adjacent microsecond windows count every event once and reconcile stored fee rounding",()=>{
 const s=sources(),boundary=s.withheld.balances[1]!.at;
 const first=mapValueReceiptV2(s,{from:"2026-10-01T00:00:00Z",toExclusive:boundary});
 const second=mapValueReceiptV2(s,{from:boundary,toExclusive:"2026-10-05T00:00:00Z"});
 const total=mapValueReceiptV2(s);
 expect(first.withheld.movements).toHaveLength(1);expect(second.withheld.movements).toHaveLength(1);
 expect(second.withheld.movements[0]?.kind).toBe("reversal");
 for(const key of ["recovered","fee","yoursBeforeVatAndTax"] as const)expect(first.withheld[key]!.pence+second.withheld[key]!.pence).toBe(total.withheld[key]!.pence);
});
it("uses the saved fee rather than a second fee calculation",()=>{
 const s=sources();s.withheld.balances=s.withheld.balances.slice(0,1);s.withheld.balances[0]!.fee=gbp(28199);
 expect(mapValueReceiptV2(s).withheld.fee).toEqual(gbp(28199));
});
it("missing or stale sources are unavailable, never zero",()=>{
 const s=sources();s.withheld.reason="Changed allocation needs approval";
 expect(mapValueReceiptV2(s).withheld).toMatchObject({state:"unavailable",recovered:null,fee:null,yoursBeforeVatAndTax:null});
 s.withheld.balances=[];s.withheld.reason=null;expect(()=>mapValueReceiptV2(s)).toThrow();
});
it.each(["duplicate","gap","allocation","tenant","job","order","fee"])("rejects invalid %s source histories",attack=>{
 const s=sources(),last=s.withheld.balances[1]!;
 if(attack==="duplicate")last.derivationId=s.withheld.balances[0]!.derivationId;
 if(attack==="gap")last.revision=3;
 if(attack==="allocation")last.allocationIds.push(last.allocationIds[0]!);
 if(attack==="tenant")last.tenantId=id(99);
 if(attack==="job")last.jobId=id(99);
 if(attack==="order")last.at="2026-10-01T00:00:00Z";
 if(attack==="fee")last.fee=gbp(999999);
 expect(()=>mapValueReceiptV2(s)).toThrow();
});
it("business sections sum receipts only, preserving unavailable categories and scope checks",()=>{
 const r=mapValueReceiptV2(sources()),summary=mapCurrentBusinessValueSummary([r]);
 expect(summary).toMatchObject({withheld:{recovered:gbp(32000),fee:gbp(3200)},supplier:{recovered:null}});
 expect(()=>mapCurrentBusinessValueSummary([r,r])).toThrow("VALUE_SUMMARY_SCOPE_MISMATCH");
});
it("cannot count an allocation under both recovery categories",()=>{
 const s=sources();
 const supplier={reason:null,balances:[{...s.withheld.balances[0]!,derivationId:id(90)}]};
 expect(()=>mapValueReceiptV2({...s,supplier})).toThrow("Allocation counted in multiple categories");
});
