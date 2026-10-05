import { describe, expect, it } from "vitest";
import { allocateEnterpriseReceipt, deriveEnterpriseReferenceStatement, deriveEnterpriseStatement, statementLines, EnterpriseDomainError } from "./index.js";
import type { EnterpriseAgreement, EnterpriseStatementInput, EnterpriseGroup } from "./index.js";
import { extra,group,id,hash,exact,approval,revision,at,withKind } from "./origin.test.js";
import { exactPence, serializeExactPence, addExactPence } from "../cumulative-fee.js";
import type { ReceiptAllocationInput } from "../receipt-allocation.js";
export const agreement=(version="v1",rate="10",effectiveFrom="2026-01-01T00:00:00Z"):EnterpriseAgreement=>({version:"enterprise-agreement.v1",id:version,tenantId:id(20),hash:hash(),effectiveFrom,rate:{version:"fee-rate.v1",policyVersion:version,numerator:rate,denominator:"100"},basis:"on_payment",minimumCommitment:null,onboardingFee:null,volumeBands:null});
const line=(name:string,net:number,gross:number)=>({id:name,invoiceId:"generated-invoice",existedAt:"2026-10-01T00:00:00Z",outstandingGross:exact(gross),netPence:net,grossPence:gross});
export const receipt=(gross:number,lines:ReceiptAllocationInput["lines"]):ReceiptAllocationInput=>({version:"receipt-allocation.v1",sourceRef:"generated-receipt",receiptGross:exact(gross),effectiveAt:at,direction:"receipt",invoiceId:"generated-invoice",separateInvoiceId:null,explicit:null,lines});
function paid(net=15000,invoiced=net,gross=18000,received=gross,kind="site_user",extraNumber=1,receiptTime=at,originTime=at,agreementVersionId="v1"):EnterpriseGroup {
 const e=withKind(kind as "site_user","contractor"),previous=e.billingFacts;
 const invoiceId=extraNumber===1?"generated-invoice":`generated-invoice-${extraNumber}`,lineId=extraNumber===1?"extra":`extra-${extraNumber}`,sourceRef=extraNumber===1?"generated-receipt":`generated-receipt-${extraNumber}`;
 e.id=id(extraNumber);e.origin.variationId=e.id;e.origin.serverRecordedAt=originTime;e.exportedAt=receiptTime;
 if(extraNumber!==1){e.scopeItemId=id(2200+extraNumber);e.exportLineId=id(700+extraNumber);e.origin.commandId=id(300+extraNumber);e.raisingCommand.id=e.origin.commandId;}
 const revisionId=extraNumber===1?id(2):id(200+extraNumber);
 e.revision=revision({id:revisionId,serverRecordedAt:originTime,netPence:net,approvals:[approval({revisionId,netPence:net,serverRecordedAt:receiptTime})]});e.billingFacts=[];e.state="exported";
 const allocation=allocateEnterpriseReceipt({version:"enterprise-receipt.v1",tenantId:e.tenantId,jobId:e.jobId,compositionComplete:true,
  receipt:{...receipt(received,[{...line(lineId,invoiced,gross),invoiceId,existedAt:receiptTime}]),invoiceId,sourceRef,effectiveAt:receiptTime},
  bindings:[{lineId,extraId:e.id,exportLineId:e.exportLineId!,revisionId:e.revision.id,revisionHash:e.revision.hash}],groups:[group([e],{agreementVersionId})],original:null});
 const identity={tenantId:e.tenantId,jobId:e.jobId,scopeItemId:e.scopeItemId,revisionId,revisionHash:e.revision.hash,exportLineId:e.exportLineId!,invoiceId,invoiceLineId:lineId,recordedAt:receiptTime,effectiveAt:receiptTime};
 e.billingFacts=[{...previous[0]!,...identity,net:exact(invoiced),sourceRef:extraNumber===1?"fictional-invoice":`fictional-invoice-${extraNumber}`},
 {...previous[1]!,...identity,sourceRef,net:serializeExactPence(allocation[0]?.net??exactPence(0n)),allocationRule:allocation[0]?.rule??"pro_rata"}];
 e.state=received===0?"billed":received===gross?"paid":"part_paid";
 return group([e],{agreementVersionId});
}
export const statement=(groups:EnterpriseGroup[],prior=0,previousQ:EnterpriseStatementInput["prior"][number]["contributions"]=[],patch:Partial<EnterpriseStatementInput>={}):EnterpriseStatementInput=>({version:"enterprise-statement.v1",tenantId:id(20),period:"2026-10",statementId:id(100),inputFactsHash:hash(),recordedCutoff:"2026-11-01T00:00:00Z",mode:"synthetic_demo",feeGate:false,groups,agreements:[agreement()],prior:[{agreementVersionId:"v1",priorPolicyVersion:"v1",priorNetPostedPence:prior,derivationId:prior?id(101):null,contributions:previousQ}],...patch});
const section=(input:EnterpriseStatementInput)=>deriveEnterpriseReferenceStatement(input).sections[0]!;
const q=(input:EnterpriseStatementInput)=>section(input).qualifyingPrincipal;
const f=(input:EnterpriseStatementInput)=>section(input).cumulativeFee.pence;
const delta=(input:EnterpriseStatementInput)=>section(input).postingDelta.pence;
describe("generated ENT-F1–ENT-F12 via enterprise qualification and shared allocation",()=>{
 it("ENT-F1, F3, F4, F5 and F6: caps, credits and original receipt reversal",()=>{
  const g=paid();expect(q(statement([g]))).toEqual(exactPence(15000n));expect(f(statement([g]))).toBe(1500);expect(delta(statement([g]))).toBe(1500);
  const credit=structuredClone(g);credit.members[0]!.billingFacts.push({...g.members[0]!.billingFacts[0]!,kind:"credited",sourceRef:"generated-credit",net:exact(5000)});
  const prior=[{extraId:g.canonicalId,qualifyingPrincipal:exact(15000)}];expect(f(statement([credit],1500,prior))).toBe(1000);expect(delta(statement([credit],1500,prior))).toBe(-500);
  const input=receipt(18000,[line("extra",15000,18000)]);
  const reversed=allocateEnterpriseReceipt({version:"enterprise-receipt.v1",tenantId:g.tenantId,jobId:g.jobId,compositionComplete:true,receipt:{...input,direction:"reversal",sourceRef:"generated-reversal"},bindings:[{lineId:"extra",extraId:g.canonicalId,exportLineId:id(7),revisionId:id(2),revisionHash:hash()}],groups:[g],original:{sourceRef:"generated-receipt",receipt:input,remainingGross:[{lineId:"extra",gross:exact(18000)}]}});
  expect(reversed[0]!.net).toEqual(exactPence(-15000n));
  const reversal=structuredClone(g);reversal.members[0]!.billingFacts.push({...g.members[0]!.billingFacts[1]!,kind:"reversed",sourceRef:"generated-reversal",originalSourceRef:"generated-receipt",net:exact(15000)});
  const result=section(statement([reversal],1500,prior));expect(result.qualifyingPrincipal.numerator).toBe(0n);expect(result.postingDelta.pence).toBe(-1500);expect(result.kind).toBe("linked_compensation");expect(result.compensatesDerivationId).toBe(id(101));
  expect(f(statement([paid(15000,20000,24000)]))).toBe(1500);expect(f(statement([paid(15000,12000,14400)]))).toBe(1200);
 });
 it("ENT-F2: whole blended composition, 250000/31 exact, then +1594",()=>{
  const g=paid(24000,24000,28800), lines=[line("order",100000,120000),line("extra",24000,28800)];
  const envelope={version:"enterprise-receipt.v1",tenantId:g.tenantId,jobId:g.jobId,compositionComplete:true,receipt:receipt(50000,lines),bindings:[{lineId:"order",extraId:null,exportLineId:null,revisionId:null,revisionHash:null},{lineId:"extra",extraId:g.canonicalId,exportLineId:id(7),revisionId:id(2),revisionHash:hash()}],groups:[g],original:null};
  const a=allocateEnterpriseReceipt(envelope);expect(a.find(l=>l.lineId==="extra")!.net).toEqual(exactPence(250000n,31n));
  g.members[0]!.billingFacts[1]!.net=serializeExactPence(a.find(l=>l.lineId==="extra")!.net);expect(f(statement([g]))).toBe(806);
  const remaining=lines.map(l=>({...l,outstandingGross:serializeExactPence(addExactPence(exactPence(BigInt(l.grossPence)),exactPence(-a.find(v=>v.lineId===l.id)!.gross.numerator,a.find(v=>v.lineId===l.id)!.gross.denominator)))}));
  const b=allocateEnterpriseReceipt({...envelope,receipt:receipt(98800,remaining)});const firstQ=g.members[0]!.billingFacts[1]!.net;
  g.members[0]!.billingFacts[1]!.net=serializeExactPence(addExactPence(a.find(l=>l.lineId==="extra")!.net,b.find(l=>l.lineId==="extra")!.net));
  expect(q(statement([g],806,[{extraId:g.canonicalId,qualifyingPrincipal:firstQ}]))).toEqual(exactPence(24000n));expect(delta(statement([g],806,[{extraId:g.canonicalId,qualifyingPrincipal:firstQ}]))).toBe(1594);
 });
 it("ENT-F7/F8: duplicates counted once; office/client/order money excluded",()=>{
  const g=paid(),d=extra({id:id(8),state:"duplicate",duplicateOf:g.canonicalId});d.origin.variationId=d.id;d.origin.raisingMembershipId=id(40);d.origin.commandId=id(41);d.raisingCommand.actorId=id(40);d.raisingCommand.id=id(41);d.raisingCommand.grant.membershipId=id(40);d.raisingCommand.grant.id=id(42);g.members.push(d);
  expect(f(statement([g]))).toBe(1500);expect(section(statement([g])).lines).toHaveLength(1);
  const office=paid(50000,50000,60000,60000,"office_entry"),client=paid(80000,80000,96000,96000,"client_instruction",8);
  expect(f(statement([office,client]))).toBe(0);expect(section(statement([office,client])).kind).toBe("zero_result");
 });
 it("ENT-F9: origin binds agreement, credit retains v1",()=>{
  const x=paid(15000,15000,18000,18000,"site_user",1,"2026-11-20T00:00:00Z","2026-11-10T00:00:00Z","v1"),y=paid(15000,15000,18000,18000,"site_user",8,"2026-11-20T00:00:00Z","2026-11-16T00:00:00Z","v2");
  const patch={period:"2026-11",recordedCutoff:"2026-12-01T00:00:00Z",agreements:[agreement(),agreement("v2","8","2026-11-15T00:00:00Z")]};
  const input=statement([x,y],0,[],patch);expect(deriveEnterpriseReferenceStatement(input).sections.map(s=>s.cumulativeFee.pence)).toEqual([1500,1200]);
  const c=structuredClone(x);c.members[0]!.billingFacts.push({...c.members[0]!.billingFacts[0]!,kind:"credited",sourceRef:"later-credit",net:exact(5000),recordedAt:"2026-11-22T00:00:00Z"});
  expect(delta(statement([c],1500,[{extraId:c.canonicalId,qualifyingPrincipal:exact(15000)}],patch))).toBe(-500);
  expect(()=>section(statement([{...x,agreementVersionId:"v2"}],0,[],patch))).toThrow("AGREEMENT_VERSION_MISMATCH");
 });
 it("ENT-F10/F11: cumulative half-even ties and stable statement pennies",()=>{
  const groups=[1,8,9].map(n=>paid(5,5,6,6,"site_user",n));const s=section(statement(groups));expect(s.cumulativeFee.pence).toBe(2);expect(s.lines.map(l=>l.fee.pence)).toEqual([1,1,0]);
  for(const [net,fee] of [[5,0],[15,2],[25,2]] as const)expect(f(statement([paid(net,net,net,net)]))).toBe(fee);
  const g=paid(10,10,12,6);expect(f(statement([g]))).toBe(0);g.members[0]!.billingFacts.push({...g.members[0]!.billingFacts[1]!,sourceRef:"second-5p-net"});expect(f(statement([g]))).toBe(1);
 });
 it("ENT-F12: recorded cutoff freezes October; earlier-effective November credit compensates next month",()=>{
  const g=paid();const octoberInput=statement([g]);const october=deriveEnterpriseReferenceStatement(octoberInput),before=structuredClone(october);
  g.members[0]!.billingFacts.push({...g.members[0]!.billingFacts[0]!,kind:"credited",net:exact(5000),sourceRef:"november-recorded-credit",effectiveAt:"2026-10-20T00:00:00Z",recordedAt:"2026-11-02T00:00:00Z"});
  expect(deriveEnterpriseReferenceStatement(octoberInput)).toEqual(before);expect(october).toEqual(before);
  const november=statement([g],1500,[{extraId:g.canonicalId,qualifyingPrincipal:exact(15000)}],{period:"2026-11",recordedCutoff:"2026-12-01T00:00:00Z",inputFactsHash:hash("b")});expect(delta(november)).toBe(-500);
  expect(section(november)).toMatchObject({period:"2026-11",inputFactsHash:hash("b"),recordedCutoff:"2026-12-01T00:00:00Z"});
 });
});
describe("allocation and fee adversarial/property cases",()=>{
 it("receipt splits/merges/permutations update outstanding balances; identical F, telescoping deltas",()=>{
  for(const parts of [[148800],[50000,98800],[98800,50000],[100,40000,108700],[108700,100,40000]]) {
   const g=paid(24000,24000,28800),initial=[line("order",100000,120000),line("extra",24000,28800)];let lines=initial,paidNet=exactPence(0n),previous=0,totalDelta=0;
   for(const amount of parts) {
    const a=allocateEnterpriseReceipt({version:"enterprise-receipt.v1",tenantId:id(20),jobId:id(21),compositionComplete:true,receipt:receipt(amount,lines),bindings:[{lineId:"order",extraId:null,exportLineId:null,revisionId:null,revisionHash:null},{lineId:"extra",extraId:g.canonicalId,exportLineId:id(7),revisionId:id(2),revisionHash:hash()}],groups:[g],original:null});
    const oldQ=paidNet;paidNet=addExactPence(paidNet,a.find(l=>l.lineId==="extra")!.net);g.members[0]!.billingFacts[1]!.net=serializeExactPence(paidNet);
    const s=section(statement([g],previous,[{extraId:g.canonicalId,qualifyingPrincipal:serializeExactPence(oldQ)}]));totalDelta+=s.postingDelta.pence;previous=s.cumulativeFee.pence;
    lines=lines.map(l=>({...l,outstandingGross:serializeExactPence(addExactPence({numerator:BigInt(l.outstandingGross.numerator),denominator:BigInt(l.outstandingGross.denominator)},exactPence(-a.find(v=>v.lineId===l.id)!.gross.numerator,a.find(v=>v.lineId===l.id)!.gross.denominator)))}));
   }expect(paidNet).toEqual(exactPence(24000n));expect(previous).toBe(2400);expect(totalDelta).toBe(2400);
  }
 });
 it("explicit/separate/pro-rata precedence, own ratios, temporal cutoff and fail-closed composition",()=>{
  const g=paid(),base={version:"enterprise-receipt.v1",tenantId:id(20),jobId:id(21),compositionComplete:true,receipt:receipt(60,[line("order",100,100),line("extra",100,120)]),bindings:[{lineId:"order",extraId:null,exportLineId:null,revisionId:null,revisionHash:null},{lineId:"extra",extraId:g.canonicalId,exportLineId:id(7),revisionId:id(2),revisionHash:hash()}],groups:[g],original:null};
  expect(allocateEnterpriseReceipt({...base,receipt:{...base.receipt,separateInvoiceId:"generated-invoice",explicit:[{lineId:"extra",gross:exact(60)}]}})[0]).toMatchObject({net:exactPence(50n),rule:"explicit"});
  expect(allocateEnterpriseReceipt({...base,receipt:{...base.receipt,separateInvoiceId:"generated-invoice"}})[0]!.rule).toBe("separate_invoice");
  expect(allocateEnterpriseReceipt(base).map(a=>a.net)).toEqual([exactPence(300n,11n),exactPence(300n,11n)]);
  for(const change of [{compositionComplete:false},{bindings:base.bindings.slice(1)},{tenantId:id(90)},{receipt:{...base.receipt,receiptGross:exact(221)}}])expect(()=>allocateEnterpriseReceipt({...base,...change})).toThrow(EnterpriseDomainError);
  const future={...base,receipt:{...base.receipt,lines:base.receipt.lines.map(l=>l.id==="extra"?{...l,existedAt:"2026-10-06T00:00:00Z"}:l)}};expect(allocateEnterpriseReceipt(future).map(l=>l.lineId)).toEqual(["order"]);
  expect(()=>allocateEnterpriseReceipt({...base,receipt:{...base.receipt,direction:"reversal"}})).toThrow();
 });
 it("mode/gate/reference distinction, formula refusal, prior version, zero and typed overflow",()=>{
  const input=statement([paid()]);expect(section(input).kind).toBe("proposal");expect(deriveEnterpriseStatement(input).sections[0]!.cumulativeFee.pence).toBe(0);expect(deriveEnterpriseReferenceStatement({...input,mode:"pilot_no_charge"}).label).toBe("Illustration — no charge");
  for(const mode of ["synthetic_demo","pilot_no_charge","production_billing"] as const) for(const gate of [false,true]) {const v=statement([group(input.groups[0]!.members,{mode,feeGate:gate})],0,[],{mode,feeGate:gate});expect(deriveEnterpriseStatement(v).sections[0]!.cumulativeFee.pence).toBe(mode==="production_billing"&&gate?1500:0);}
  for(const bad of [{basis:"on_invoice_with_true_up"},{minimumCommitment:1},{onboardingFee:1},{volumeBands:[]}])expect(()=>section({...input,agreements:[{...agreement(),...bad} as EnterpriseAgreement]})).toThrow();
  expect(()=>section({...input,prior:[{...input.prior[0]!,priorPolicyVersion:"v2"}]})).toThrow();
  expect(()=>section(statement([paid(1_000_000_000_001)]))).toThrow();
  const enormous=paid();enormous.members[0]!.billingFacts[1]!.net={numerator:"1".repeat(260214),denominator:"1"};expect(()=>section(statement([enormous]))).toThrow(EnterpriseDomainError);
  expect(()=>section(statement([paid(1_000_000_000_000,1_000_000_000_000,1_000_000_000_000),paid(1_000_000_000_000,1_000_000_000_000,1_000_000_000_000,1_000_000_000_000,"site_user",8)]))).toThrow(EnterpriseDomainError);
  expect(()=>section({...statement([paid()],1500,[{extraId:id(1),qualifyingPrincipal:exact(15000)}]),groups:[paid(10000)],prior:[{agreementVersionId:"v1",priorPolicyVersion:"v1",priorNetPostedPence:1500,derivationId:null,contributions:[{extraId:id(1),qualifyingPrincipal:exact(15000)}]}]})).toThrow();
 });
 it("largest remainder signed compensation, mixed signs, zero, ties and permutation conservation",()=>{
  const changes=[{extraId:id(1),change:exactPence(5n,10n)},{extraId:id(8),change:exactPence(5n,10n)},{extraId:id(9),change:exactPence(5n,10n)}];
  for(const rows of [changes,[...changes].reverse()]) expect(statementLines(2,rows).map(l=>l.fee.pence)).toEqual([1,1,0]);
  expect(statementLines(-2,changes.map(r=>({...r,change:exactPence(-r.change.numerator,r.change.denominator)}))).map(l=>l.fee.pence)).toEqual([-1,-1,0]);
  for(const [deltaValue,rows] of [[1,[{extraId:id(1),change:exactPence(16n,10n)},{extraId:id(8),change:exactPence(-6n,10n)}]],[0,[{extraId:id(1),change:exactPence(5n,10n)},{extraId:id(8),change:exactPence(-5n,10n)}]]] as const) for(const order of [rows,[...rows].reverse()])expect(statementLines(deltaValue,order).reduce((n,l)=>n+l.fee.pence,0)).toBe(deltaValue);
  expect(statementLines(0,[])).toEqual([]);
 });
});
it("reversal facts retain original line identity, ratios and remaining settlement limit",()=>{
 const g=paid(),initial=receipt(18000,[line("extra",15000,18000)]);
 const base={version:"enterprise-receipt.v1",tenantId:id(20),jobId:id(21),compositionComplete:true,receipt:{...initial,direction:"reversal",sourceRef:"partial-refund",receiptGross:exact(6000),lines:[{...initial.lines[0]!,outstandingGross:exact(9000)}]},bindings:[{lineId:"extra",extraId:g.canonicalId,exportLineId:id(7),revisionId:id(2),revisionHash:hash()}],groups:[g],original:{sourceRef:"generated-receipt",receipt:initial,remainingGross:[{lineId:"extra",gross:exact(9000)}]}};
 expect(allocateEnterpriseReceipt(base)[0]!.net).toEqual(exactPence(-5000n));
 for(const changed of [{...base.receipt,lines:[{...base.receipt.lines[0]!,netPence:10000}]},{...base.receipt,effectiveAt:"2026-10-06T00:00:00Z"},{...base.receipt,receiptGross:exact(9001)},{...base.receipt,lines:[{...base.receipt.lines[0]!,outstandingGross:exact(18000)}]}])expect(()=>allocateEnterpriseReceipt({...base,receipt:changed})).toThrow();
 expect(()=>allocateEnterpriseReceipt({...base,original:{...base.original,remainingGross:[{lineId:"extra",gross:exact(18001)}]}})).toThrow();
});
it("mixed-sign group changes derive conserved lines and exact prior net postings after compensation",()=>{
 const x=paid(10000),y=paid(10000,10000,12000,12000,"site_user",8);
 const input=statement([x,y],1500,[{extraId:x.canonicalId,qualifyingPrincipal:exact(15000)},{extraId:y.canonicalId,qualifyingPrincipal:exact(0)}]);
 const s=section(input);expect(s.postingDelta.pence).toBe(500);expect(s.lines.map(l=>l.fee.pence)).toEqual([-500,1000]);
 const afterCompensation=statement([x],1000,[{extraId:x.canonicalId,qualifyingPrincipal:exact(10000)}]);expect(delta(afterCompensation)).toBe(0);expect(section(afterCompensation).kind).toBe("zero_result");
 const before=structuredClone(input);deriveEnterpriseReferenceStatement(input);expect(input).toEqual(before);
});
it("approval, revision and export recorded after cutoff cannot enter an earlier statement",()=>{
 for(const target of ["revision","approval","export"] as const) {const g=paid();const e=g.members[0]!;
  if(target==="revision")e.revision.serverRecordedAt="2026-11-02T00:00:00Z";else if(target==="approval")e.revision.approvals[0]!.serverRecordedAt="2026-11-02T00:00:00Z";else e.exportedAt="2026-11-02T00:00:00Z";
  expect(f(statement([g]))).toBe(0);
 }
 const g=paid();g.members[0]!.billingFacts[1]!.invoiceLineId="unmatched";expect(()=>section(statement([g]))).toThrow();
});
it("statement lines retain exact Q change and immutable source/rule/revision references",()=>{
 const g=paid(),s=section(statement([g]));expect(s.lines[0]).toMatchObject({currentQualifyingPrincipal:exactPence(15000n),priorQualifyingPrincipal:exactPence(0n),qualifyingChange:exactPence(15000n),originExtraId:g.canonicalId,originKind:"site_user",orderRevisionId:id(5),revisionId:id(2),exportLineId:id(7),billingReferences:[{sourceRef:"fictional-invoice",invoiceLineId:"extra",allocationRule:null},{sourceRef:"generated-receipt",invoiceLineId:"extra",allocationRule:"pro_rata"}]});
});
it("zero exact rate, ratio bounds, invalid rationals and fractional agreement instants",()=>{
 expect(section(statement([paid()],0,[],{agreements:[agreement("v1","0")]})).kind).toBe("zero_result");
 for(const rate of [{numerator:"101",denominator:"100"},{numerator:"8",denominator:"0"},{numerator:"8.0",denominator:"100"},{numerator:"8",denominator:"1"+"0".repeat(100)}])expect(()=>section(statement([paid()],0,[],{agreements:[{...agreement(),rate:{...agreement().rate,...rate}}]}))).toThrow();
 for(const net of [{numerator:"1",denominator:"0"},{numerator:"1000000000001",denominator:"1"},{numerator:"1",denominator:"1"+"0".repeat(260213)}]){const g=paid();g.members[0]!.billingFacts[1]!.net=net;expect(()=>section(statement([g]))).toThrow(EnterpriseDomainError);}
 const g=paid();g.members[0]!.origin.serverRecordedAt="2026-10-05T12:00:00.000000002Z";g.agreementVersionId="v2";
 expect(deriveEnterpriseReferenceStatement(statement([g],0,[],{agreements:[agreement("v1","10","2026-10-05T12:00:00.000000001Z"),agreement("v2","8","2026-10-05T12:00:00.000000002Z")]})).sections.find(s=>s.agreementVersionId==="v2")!.cumulativeFee.pence).toBe(1200);
});
it("generated approved/invoiced/paid/credit caps keep Q exact and nonnegative",()=>{
 for(const approved of [1,5,15000])for(const invoiced of [1,5,20000])for(const received of [0,1,invoiced])for(const credit of [0,1,invoiced,invoiced+1]) {
  const g=paid(approved,invoiced,invoiced,received);
  if(credit)g.members[0]!.billingFacts.push({...g.members[0]!.billingFacts[0]!,kind:"credited",sourceRef:"generated-cap-credit",net:exact(credit)});
  const minimum=[BigInt(approved),BigInt(invoiced)-BigInt(credit),BigInt(received)].reduce((a,b)=>a<b?a:b);
  const principal=q(statement([g]));expect(principal).toEqual(exactPence(minimum<0n?0n:minimum));expect(principal.numerator).toBeGreaterThanOrEqual(0n);
 }
});
it("mixed signed lines conserve cumulative half-even carry at a zero delta",()=>{
 const x=paid(15,15,18);x.members[0]!.billingFacts.push({...x.members[0]!.billingFacts[0]!,kind:"credited",sourceRef:"generated-half-even-credit",net:exact(10)});
 const y=paid(20,20,24,24,"site_user",8);
 // Old exact fee 1.5p -> 2p; new exact fee 2.5p -> 2p.
 // Exact changes -1p/+2p require a -1p cumulative rounding carry.
 const s=section(statement([x,y],2,[{extraId:x.canonicalId,qualifyingPrincipal:exact(15)},{extraId:y.canonicalId,qualifyingPrincipal:exact(0)}]));
 expect(s.kind).toBe("zero_result");expect(s.postingDelta.pence).toBe(0);expect(s.lines.map(l=>l.fee.pence)).toEqual([-2,2]);expect(s.lines.reduce((sum,l)=>sum+l.fee.pence,0)).toBe(0);
 for(const rows of [[{extraId:id(1),change:exactPence(-1n)},{extraId:id(8),change:exactPence(2n)}],[{extraId:id(8),change:exactPence(2n)},{extraId:id(1),change:exactPence(-1n)}]])expect(statementLines(0,rows).map(l=>l.fee.pence)).toEqual([-2,2]);
});
it("generated signed changes including half-even carries conserve pennies under permutations",()=>{
 const round=(n:bigint)=>{const whole=n/10n,remainder=n%10n;return whole+(remainder>5n||(remainder===5n&&whole%2n===1n)?1n:0n);};
 for(const oldX of [0n,5n,15n,25n])for(const oldY of [0n,5n,15n,25n])for(const newX of [0n,5n,15n,25n])for(const newY of [0n,5n,15n,25n]) {
  const deltaValue=Number(round(newX+newY)-round(oldX+oldY)),changes=[{extraId:id(1),change:exactPence(newX-oldX,10n)},{extraId:id(8),change:exactPence(newY-oldY,10n)}];
  const forward=statementLines(deltaValue,changes),reverse=statementLines(deltaValue,[...changes].reverse());expect(forward).toEqual(reverse);expect(forward.reduce((sum,l)=>sum+BigInt(l.fee.pence),0n)).toBe(BigInt(deltaValue));
 }
});
it("one exported/billed line cannot be attributed to two canonical extras",()=>{
 const x=paid(),y=paid(15000,15000,18000,18000,"site_user",8);
 const exportCollision=structuredClone(y);exportCollision.members[0]!.exportLineId=x.members[0]!.exportLineId;exportCollision.members[0]!.billingFacts.forEach(f=>f.exportLineId=x.members[0]!.exportLineId!);
 expect(()=>section(statement([x,exportCollision]))).toThrow(EnterpriseDomainError);
 const billedCollision=structuredClone(y);billedCollision.members[0]!.billingFacts.forEach(f=>{f.invoiceId=x.members[0]!.billingFacts[0]!.invoiceId;f.invoiceLineId=x.members[0]!.billingFacts[0]!.invoiceLineId;});
 expect(()=>section(statement([x,billedCollision]))).toThrow(EnterpriseDomainError);
});
