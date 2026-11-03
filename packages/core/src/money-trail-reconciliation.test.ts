import { expect, it } from "vitest";
import { reconcileMoneyTrailReference, moneyTrailFamilies, moneyTrailAvailabilityV1, moneyTrailReferenceV1 } from "./money-trail-reconciliation.js";
const id="10000000-0000-4000-8000-000000000001";
const value=(n:string,d="1")=>({numerator:n,denominator:d});
const fact=(key:string,kind:string,n:string,extra={})=>({id:key,revision:"1",hash:"a".repeat(64),kind,amount:value(n),...extra});
const fixture=()=>({version:"money-trail-reference.v1",environment:"synthetic_demo",tenantId:id,jobId:id,
 families:moneyTrailFamilies.map(family=>({family,version:"reference.v1",status:"available"})),
 facts:[fact("invoice","invoice","3360000"),fact("receipt","receipt","1394400"),fact("reversed","receipt_reversal","252000"),
 fact("q","eligible_net","32000"),fact("j","fee_posting","3200"),
 fact("line","subscription_line","6900",{periodId:"company-period"}),fact("sub-paid","subscription_settlement","6900",{periodId:"company-period"})],
 events:[{id:"col",effectKey:"movement-1",kind:"collection",state:"settled",principal:{pence:28200,currency:"GBP"},sourceId:"j",originalCollectionId:null,receivedAfterCheckpoint:false,awaitingPredecessor:false},
 {id:"ref",effectKey:"movement-2",kind:"refund",state:"settled",principal:{pence:25000,currency:"GBP"},sourceId:"j",originalCollectionId:"col",receivedAfterCheckpoint:false,awaitingPredecessor:false}]});
it("[MT-02/03/07] reference comparison keeps signed balances and company books separate; never represents stored verification",()=>{
 const r=reconcileMoneyTrailReference(fixture());
 expect(r).toMatchObject({referenceOnly:true,authoritativeSourceVerification:false,realExternalActions:0,complete:true,label:"Records match within this simulation",unresolvedDifferenceCount:0,
 customer:{invoiceBalance:{pence:2217600,currency:"GBP"}},successFee:{eligibleNet:value("32000"),postedPrincipal:{pence:3200,currency:"GBP"},refundedPrincipal:{pence:25000,currency:"GBP"}},subscription:{chargedPrincipal:{pence:6900,currency:"GBP"},settledPrincipal:{pence:6900,currency:"GBP"},periodIds:["company-period"]}});
 expect(JSON.stringify(r)).not.toMatch(/baseCredit|basePrincipal|capPence/u);
 const f=fixture();f.facts.find(x=>x.id==="q")!.amount=value("80000");f.facts.find(x=>x.id==="j")!.amount=value("8000");f.events=[];
 expect(reconcileMoneyTrailReference(f)).toMatchObject({successFee:{expectedPrincipal:{pence:8000}},subscription:{chargedPrincipal:{pence:6900},settledPrincipal:{pence:6900}}});
});
it("[MT-02] every required family and supported version is necessary; absent is never zero",()=>{
 for(const family of moneyTrailFamilies){
  for(const status of ["missing","read_failed","unsupported"]){const f=fixture();f.families=f.families.map(x=>x.family===family?{...x,status}:x) as typeof f.families;const r=reconcileMoneyTrailReference(f);expect(r.complete).toBe(false);expect(r.label).toBe("Review needed");expect(r.differences.some(d=>d.code==="SOURCE_UNAVAILABLE"&&d.sourceRefs.includes(family))).toBe(true);}
  const f=fixture();f.families=f.families.filter(x=>x.family!==family);expect(reconcileMoneyTrailReference(f).complete).toBe(false);
 }
 const f=fixture();f.families[0]!.version="v999";expect(reconcileMoneyTrailReference(f).complete).toBe(false);
});
it("[MT-07] discrepancies keep their sign; overpayment is retained and input is unchanged",()=>{
 const f=fixture();f.facts.find(x=>x.id==="receipt")!.amount=value("4000000");f.facts.find(x=>x.id==="j")!.amount=value("3300");const before=JSON.stringify(f);const r=reconcileMoneyTrailReference(f);
 expect(r.customer.invoiceBalance.pence).toBe(-388000);expect(r.differences.find(x=>x.code==="CUSTOMER_OVERPAYMENT")?.difference).toEqual(value("-388000"));
 expect(r.differences.find(x=>x.code==="FEE_POSTING_MISMATCH")?.difference).toEqual(value("100"));expect(JSON.stringify(f)).toBe(before);
 f.facts.find(x=>x.id==="j")!.amount=value("3100");expect(reconcileMoneyTrailReference(f).differences.find(x=>x.code==="FEE_POSTING_MISMATCH")?.difference).toEqual(value("-100"));
});
it("[MT-08] canonical source/result hashes and stable difference identities survive reorder and equivalent exact fractions",()=>{
 const f=fixture();f.events[0]!.state="outcome_unknown";const r=reconcileMoneyTrailReference(f);
 expect(r.differences.map(d=>d.differenceHash)).toEqual(r.differences.map(d=>d.differenceHash).sort());
 const reordered=fixture();reordered.events=f.events.toReversed();reordered.families.reverse();reordered.facts.reverse();reordered.facts.find(x=>x.id==="q")!.amount=value("64000","2");
 expect(reconcileMoneyTrailReference(reordered)).toEqual(r);
 const changed=fixture();changed.facts[0]!.hash="b".repeat(64);expect(reconcileMoneyTrailReference(changed).sourceHash).not.toBe(r.sourceHash);
 expect(reconcileMoneyTrailReference(changed).reportHash).not.toBe(r.reportHash);
});
it("[MT-05] orphan event names its missing source and never becomes cash",()=>{
 const f=fixture();f.events[0]!.sourceId="missing-statement";const r=reconcileMoneyTrailReference(f);
 expect(r.label).toBe("Review needed");expect(r.differences).toEqual(expect.arrayContaining([expect.objectContaining({code:"ORPHAN_EVENT",sourceRefs:["col","missing-statement"]})]));expect(r.successFee.collectedPrincipal.pence).toBe(0);
});
it("[MT-05] duplicate movements report specific observations; exact delivery replay does not count twice",()=>{
 const f=fixture();f.events.push({...f.events[0]!,id:"col-observation"});const r=reconcileMoneyTrailReference(f);
 expect(r.label).toBe("Review needed");expect(r.differences.find(d=>d.code==="DUPLICATE_EVENT")?.sourceRefs).toEqual(["col","col-observation"]);expect(r.successFee.collectedPrincipal.pence).toBe(0);
 const replay=fixture();replay.events.push({...replay.events[0]!});expect(reconcileMoneyTrailReference(replay)).toEqual(reconcileMoneyTrailReference(fixture()));
});
it("[MT-05] both late cases require recomputation without inventing a deadline",()=>{
 for(const field of ["receivedAfterCheckpoint","awaitingPredecessor"] as const){const f=fixture();f.events[0]![field]=true;const r=reconcileMoneyTrailReference(f);expect(r.label).toBe("Review needed");expect(r.differences.find(d=>d.code===(field==="receivedAfterCheckpoint"?"LATE_AFTER_CHECKPOINT":"AWAITING_PREDECESSOR"))?.sourceRefs).toEqual(["col"]);}
});
it("[MT-05/06] pending, accepted and unknown are never settled; unknown survives independent recomputation",()=>{
 for(const state of ["pending","accepted","outcome_unknown","definite_failure"]){const f=fixture();f.events[0]!.state=state;const a=reconcileMoneyTrailReference(f);expect(a.successFee.collectedPrincipal.pence).toBe(0);expect(a.successFee.refundedPrincipal.pence).toBe(0);expect(a.label).toBe("Review needed");if(state!=="definite_failure")expect(a.differences.some(d=>d.code===(state==="outcome_unknown"?"OUTCOME_UNKNOWN":"UNSETTLED_EVENT"))).toBe(true);expect(reconcileMoneyTrailReference(JSON.parse(JSON.stringify(f)))).toEqual(a);}
});
it("[MT-06/07] refunds require one settled original and cannot exceed its principal",()=>{
 for(const change of [{originalCollectionId:"missing"},{originalCollectionId:"ref"},{principal:{pence:28201,currency:"GBP"}}]){const f=fixture();Object.assign(f.events[1]!,change);const r=reconcileMoneyTrailReference(f);expect(r.successFee.refundedPrincipal.pence).toBe(0);expect(r.label).toBe("Review needed");expect(r.differences.some(d=>d.code==="INVALID_REFUND")).toBe(true);}
 const f=fixture();f.events.push({...f.events[1]!,id:"ref-2",effectKey:"movement-3",principal:{pence:4000,currency:"GBP"}});expect(reconcileMoneyTrailReference(f).successFee.refundedPrincipal.pence).toBe(0);
});
it("[MT-03] company period discrepancies cannot cancel each other or a fee discrepancy",()=>{
 const f=fixture();f.facts.push(fact("another-line","subscription_line","100",{periodId:"another-period"}));f.facts.push(fact("extra-paid","subscription_settlement","100",{periodId:"company-period"}));const r=reconcileMoneyTrailReference(f);
 expect(r.subscription.chargedPrincipal).toEqual(r.subscription.settledPrincipal);expect(r.differences.filter(d=>d.code==="SUBSCRIPTION_MISMATCH")).toHaveLength(2);expect(r.successFee.postedPrincipal.pence).toBe(3200);
});
it("[MT-04] cumulative exact Q uses the shared kernel once, including half-even ties; no allocation",()=>{
 for(const [n,d,fee] of [["5","1",0],["15","1",2],["45","1",4],["91","2",5]] as const){const f=fixture();f.facts.find(x=>x.id==="q")!.amount=value(n,d);expect(reconcileMoneyTrailReference(f).successFee.expectedPrincipal.pence).toBe(fee);}
 const f=fixture();f.facts.find(x=>x.id==="q")!.amount=value("15","2");f.facts.push(fact("q2","eligible_net","15",{}));f.facts.at(-1)!.amount=value("15","2");expect(reconcileMoneyTrailReference(f).successFee.expectedPrincipal.pence).toBe(2);
});
it("[MT-16/17] strict reference boundaries refuse client authority, wrong modes, invalid currency, overflow and ambiguity",()=>{
 for(const raw of [{...fixture(),environment:"production"},{...fixture(),environment:"pilot_no_charge"},{...fixture(),environment:undefined},{...fixture(),actorId:id},{...fixture(),settled:true},{...fixture(),runId:id},{...fixture(),version:"v999"}])expect(()=>reconcileMoneyTrailReference(raw)).toThrow("INVALID_MONEY_TRAIL_REFERENCE");
 for(const patch of [{amount:value("1","0")},{amount:value("1000000000001")},{periodId:"wrong"},{hash:"X"},{id:""},{money:1}]){const f=fixture();Object.assign(f.facts[0]!,patch);expect(()=>reconcileMoneyTrailReference(f)).toThrow("INVALID_MONEY_TRAIL_REFERENCE");}
 for(const pence of [-1,0,1.1,Number.MAX_SAFE_INTEGER]){const f=fixture();f.events[0]!.principal.pence=pence;expect(()=>reconcileMoneyTrailReference(f)).toThrow("INVALID_MONEY_TRAIL_REFERENCE");}
 for(const change of [{currency:"USD"},{extra:true}]){const f=fixture();Object.assign(f.events[0]!.principal,change);expect(()=>reconcileMoneyTrailReference(f)).toThrow("INVALID_MONEY_TRAIL_REFERENCE");}
 const f=fixture();f.events.push({...f.events[0]!,state:"accepted"});expect(()=>reconcileMoneyTrailReference(f)).toThrow("INVALID_MONEY_TRAIL_REFERENCE");
 const duplicate=fixture();duplicate.facts.push({...duplicate.facts[0]!});expect(()=>reconcileMoneyTrailReference(duplicate)).toThrow("INVALID_MONEY_TRAIL_REFERENCE");
 const family=fixture();family.families.push({...family.families[0]!});expect(()=>reconcileMoneyTrailReference(family)).toThrow("INVALID_MONEY_TRAIL_REFERENCE");
 const negative=fixture();negative.facts.find(x=>x.id==="q")!.amount=value("-1");expect(()=>reconcileMoneyTrailReference(negative)).toThrow("INVALID_MONEY_TRAIL_REFERENCE");
 const overflow=fixture();overflow.facts[0]!.amount=value("1000000000000");overflow.facts.push(fact("large","invoice","1"));expect(()=>reconcileMoneyTrailReference(overflow)).toThrow("INVALID_MONEY_TRAIL_REFERENCE");
});
it("availability never carries amounts, a completed run or a forged environment",()=>{
 const status={version:"money-trail-availability.v1",jobId:id,environment:"synthetic_demo",state:"dependency_bound",dependency:"accepted_money_trail_source_and_run_authority",productionEnabled:false,realExternalActions:0};
 expect(moneyTrailAvailabilityV1.parse(status)).toEqual(status);
 for(const patch of [{balance:0},{state:"complete"},{environment:"production"},{productionEnabled:true},{realExternalActions:1}])expect(moneyTrailAvailabilityV1.safeParse({...status,...patch}).success).toBe(false);
});
it("reference guard boundaries reject malformed family, fact, event and availability fields",()=>{
 for(const patch of [{id:'x'.repeat(201)},{revision:''},{revision:'x'.repeat(201)},{kind:'unknown'},{amount:value('1','2')}]){const f=fixture();Object.assign(f.facts[0]!,patch);expect(()=>reconcileMoneyTrailReference(f)).toThrow('INVALID_MONEY_TRAIL_REFERENCE');}
 for(const patch of [{periodId:undefined},{periodId:''}]){const f=fixture();Object.assign(f.facts.find(x=>x.id==='line')!,patch);expect(()=>reconcileMoneyTrailReference(f)).toThrow('INVALID_MONEY_TRAIL_REFERENCE');}
 for(const patch of [{id:''},{id:'x'.repeat(201)},{effectKey:''},{kind:'other'},{state:'redirect'},{sourceId:''},{originalCollectionId:'col'},{receivedAfterCheckpoint:1},{awaitingPredecessor:null},{extra:true}]){const f=fixture();Object.assign(f.events[0]!,patch);expect(()=>reconcileMoneyTrailReference(f)).toThrow('INVALID_MONEY_TRAIL_REFERENCE');}
 const refund=fixture();refund.events[1]!.originalCollectionId=null;expect(()=>reconcileMoneyTrailReference(refund)).toThrow('INVALID_MONEY_TRAIL_REFERENCE');
 for(const patch of [{family:'unknown'},{status:'complete'},{extra:true},{version:''}]){const f=fixture();Object.assign(f.families[0]!,patch);expect(()=>reconcileMoneyTrailReference(f)).toThrow('INVALID_MONEY_TRAIL_REFERENCE');}
 for(const field of ['tenantId','jobId'])expect(()=>reconcileMoneyTrailReference({...fixture(),[field]:'invalid'})).toThrow('INVALID_MONEY_TRAIL_REFERENCE');
 const many=fixture();many.facts=Array.from({length:10001},(_,i)=>fact(`z${i}`,'invoice','0'));expect(()=>reconcileMoneyTrailReference(many)).toThrow('INVALID_MONEY_TRAIL_REFERENCE');
 const manyEvents=fixture();manyEvents.events=Array.from({length:10001},()=>({...fixture().events[0]!}));expect(()=>reconcileMoneyTrailReference(manyEvents)).toThrow('INVALID_MONEY_TRAIL_REFERENCE');
 const status={version:"money-trail-availability.v1",jobId:id,environment:"synthetic_demo",state:"dependency_bound",dependency:"accepted_money_trail_source_and_run_authority",productionEnabled:false,realExternalActions:0};
 for(const patch of [{version:'other'},{jobId:'invalid'},{dependency:'ready'}])expect(moneyTrailAvailabilityV1.safeParse({...status,...patch}).success).toBe(false);
});
it("exact balance and discrepancy bounds refuse overflow instead of truncating or clamping",()=>{
 const f=fixture();f.facts.find(x=>x.id==='j')!.amount=value('-1000000000000');expect(()=>reconcileMoneyTrailReference(f)).toThrow('INVALID_MONEY_TRAIL_REFERENCE');
 const f2=fixture();f2.events[0]!.principal.pence=1000000000000;f2.events.push({...f2.events[0]!,id:'large-col',effectKey:'large-movement'});expect(()=>reconcileMoneyTrailReference(f2)).toThrow('INVALID_MONEY_TRAIL_REFERENCE');
});

it("event kinds and source-book bindings cannot be substituted",()=>{
 const f=fixture();Object.assign(f.events[1]!,{kind:'other'});expect(()=>reconcileMoneyTrailReference(f)).toThrow('INVALID_MONEY_TRAIL_REFERENCE');
 const other=fixture();other.events[0]!.sourceId='invoice';expect(reconcileMoneyTrailReference(other).differences.some(d=>d.code==='ORPHAN_EVENT')).toBe(true);
});

it("schema money limits are enforced before arithmetic; duplicate families and negative customer amounts are independently refused",()=>{
 for(const pence of [1.1,1000000000001]){const f=fixture();f.events[0]!.principal.pence=pence;expect(moneyTrailReferenceV1.safeParse(f).success).toBe(false);}
 const duplicate=fixture();duplicate.families[1]={...duplicate.families[0]!};expect(()=>reconcileMoneyTrailReference(duplicate)).toThrow('INVALID_MONEY_TRAIL_REFERENCE');
 const tooMany=fixture();tooMany.families.push({...tooMany.families[0]!});expect(moneyTrailReferenceV1.safeParse(tooMany).success).toBe(false);
 const negative=fixture();negative.facts[0]!.amount=value('-1');expect(()=>reconcileMoneyTrailReference(negative)).toThrow('INVALID_MONEY_TRAIL_REFERENCE');
});

it("optional absent reference fields have one canonical encoding",()=>{
 const f=fixture();Object.assign(f.facts[0]!,{periodId:undefined});expect(reconcileMoneyTrailReference(f)).toEqual(reconcileMoneyTrailReference(fixture()));
});


it("M4-17 bound policy version selects the reference rate; unknown or caller-overridden policies refuse",()=>{
 const f=fixture(); const legacy=reconcileMoneyTrailReference(f);
 expect(reconcileMoneyTrailReference({...f,policyVersion:"reference_fee_policy_v3"})).toEqual(legacy);
 expect(()=>reconcileMoneyTrailReference({...f,policyVersion:"unknown"})).toThrow("INVALID_MONEY_TRAIL_REFERENCE");
 expect(()=>reconcileMoneyTrailReference({...f,policyVersion:"reference_fee_policy_v3",rate:{numerator:"1",denominator:"2"}})).toThrow("INVALID_MONEY_TRAIL_REFERENCE");
});
