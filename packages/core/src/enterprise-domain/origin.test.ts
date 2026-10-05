import { describe, expect, it } from "vitest";
import { effectiveOrigin, siteOriginated, feeBearing, qualifyingPrincipal, assertDuplicateGroup, assertDuplicateRepair, coalescePrompt, originForCommand, assertOriginUnchanged } from "./index.js";
import type { EnterpriseActor, EnterpriseExtra, EnterpriseGroup, EnterpriseRevision, EnterpriseGrant, EnterpriseApproval, EnterpriseRequirement } from "./index.js";
export const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
export const hash=(c="a")=>c.repeat(64);
export const at="2026-10-05T12:00:00Z";
export const exact=(n:number|string,d="1")=>({numerator:String(n),denominator:d});
export const grant=(role:string,patch:Partial<EnterpriseGrant>={}):EnterpriseGrant=>({id:id(30),tenantId:id(20),jobId:id(21),membershipId:id(31),role:role as EnterpriseGrant["role"],...patch});
export const actor=(role:string,patch:Partial<EnterpriseActor>={}):EnterpriseActor=>({membershipId:id(31),tenantId:id(20),assigned:true,grants:[grant(role,{membershipId:patch.membershipId??id(31)})],...patch});
export const requirement=(patch:Partial<EnterpriseRequirement>={}):EnterpriseRequirement=>({ruleVersion:"rules.v1",steps:[{role:"supervisor",alternates:[]}],photoRequired:false,residentRequired:false,...patch});
export const approval=(patch:Partial<EnterpriseApproval>={}):EnterpriseApproval=>({index:0,revisionId:id(2),hash:hash(),netPence:15000,ruleVersion:"rules.v1",actorId:id(31),grant:grant("supervisor"),role:"supervisor",timing:"before_work",serverRecordedAt:at,...patch});
export const revision=(patch:Partial<EnterpriseRevision>={}):EnterpriseRevision=>({id:id(2),hash:hash(),serverRecordedAt:at,netPence:15000,priceConfirmed:true,priceSource:"surveyor_quoted",requirement:requirement(),approvals:[approval()],...patch});
export const extra=(patch:Partial<EnterpriseExtra>={}):EnterpriseExtra=>({
 id:id(1),tenantId:id(20),jobId:id(21),scopeItemId:id(22),state:"paid",duplicateOf:null,
 billingBalances:{billedNetPence:15000,settledNetPence:15000},workDone:false,exportedAt:at,revision:revision(),origin:{version:"extra-origin.v1",tenantId:id(20),jobId:id(21),variationId:id(1),origin:{version:"variation-origin.v1",jobTrack:"contractor",kind:"site_user"},commandId:id(3),raisingMembershipId:id(4),raisingRole:"operative",serverRecordedAt:at,deviceId:"generated-device",deviceCapturedAt:"2026-10-01T00:00:00Z",evidenceHash:hash()},
 raisingCommand:{id:id(3),type:"LogSiteExtra",actorId:id(4),role:"operative",grant:grant("operative",{membershipId:id(4)}),assigned:true},
 orderAtOrigin:{revisionId:id(5),hash:hash(),coverage:"new"},captureNote:"Generated fictional extra",photo:{status:"none",evidenceId:null,hash:null,tenantId:null,jobId:null,scopeItemId:null,objectVersionId:null},residentCaptured:false,residentConfirmationHash:null,
 prompt:{id:id(6),surfacedAt:"2026-10-05T11:00:00Z",confirmedBy:actor("supervisor")},exportLineId:id(7),
 billingFacts:[{tenantId:id(20),jobId:id(21),scopeItemId:id(22),revisionId:id(2),revisionHash:hash(),exportLineId:id(7),invoiceId:"fictional-invoice",invoiceLineId:"fictional-line",sourceRef:"fictional-invoice",kind:"invoiced",net:exact(15000),recordedAt:at,effectiveAt:at,allocationRule:null,originalSourceRef:null,status:"finalized"},
 {tenantId:id(20),jobId:id(21),scopeItemId:id(22),revisionId:id(2),revisionHash:hash(),exportLineId:id(7),invoiceId:"fictional-invoice",invoiceLineId:"fictional-line",sourceRef:"fictional-receipt",kind:"settled",net:exact(15000),recordedAt:at,effectiveAt:at,allocationRule:"explicit",originalSourceRef:null,status:"finalized"}],...patch});
export const group=(members:EnterpriseExtra[]=[extra()],patch:Partial<EnterpriseGroup>={}):EnterpriseGroup=>({version:"enterprise-group.v1",tenantId:id(20),jobId:id(21),jobTrack:"contractor",currency:"GBP",mode:"synthetic_demo",feeGate:false,canonicalId:members[0]!.id,members,unresolvedCandidateIds:[],agreementVersionId:"v1",...patch});
export const kinds=["builder_logged","final_review","jobguard_catch","site_user","jobguard_surfaced_confirmed","office_entry","client_instruction"] as const;
export const commands={builder_logged:"LogBuilderExtra",final_review:"AddFinalReviewExtra",jobguard_catch:"ConfirmJobGuardCatch",site_user:"LogSiteExtra",jobguard_surfaced_confirmed:"ConfirmPrompt",office_entry:"RecordOfficeExtra",client_instruction:"RecordClientInstruction"} as const;
export function withKind(kind:typeof kinds[number],track:"contractor"|"small_builder") {
 const e=extra();e.origin.origin={version:"variation-origin.v1",jobTrack:track,kind} as EnterpriseExtra["origin"]["origin"];
 e.raisingCommand.type=commands[kind];
 const role=kind==="jobguard_surfaced_confirmed"?"supervisor":kind==="office_entry"||kind==="client_instruction"?"surveyor":"operative";
 e.origin.raisingRole=role;e.raisingCommand.role=role;e.raisingCommand.grant=grant(role,{membershipId:e.origin.raisingMembershipId});if(e.prompt){e.prompt.confirmedBy.membershipId=e.origin.raisingMembershipId;e.prompt.confirmedBy.grants.forEach(g=>g.membershipId=e.origin.raisingMembershipId);}
 return e;
}
if (/\/origin\.test\.(?:ts|js)$/u.test(expect.getState().testPath??"")) describe("track-qualified origin and full conjunction",()=>{
 it("generated exhaustive property matrix and typed refusals for cross-track kinds",()=>{
  let cases=0;
  for(const kind of kinds) for(const track of ["contractor","small_builder"] as const) for(const coverage of ["new","excess","fully_instructed"] as const)
  for(const evidence of ["note","verified","pending","rejected"] as const) for(const resident of ["absent","confirmed","missing"] as const)
  for(const approved of [false,true]) for(const billed of [false,true]) for(const paid of [false,true]) for(const mode of ["synthetic_demo","pilot_no_charge","production_billing"] as const) for(const gate of [false,true]) {
   const e=withKind(kind,track);e.orderAtOrigin.coverage=coverage;e.captureNote=evidence==="note"?"Generated":null;
   if(evidence!=="note") e.photo={status:evidence,evidenceId:id(60),hash:hash(),tenantId:id(20),jobId:id(21),scopeItemId:id(22),objectVersionId:"generated-immutable-version"};
   e.residentCaptured=resident!=="absent";e.residentConfirmationHash=resident==="confirmed"?hash():null;
   e.revision.approvals=approved?[approval()]:[];e.state=billed?"paid":"approved";e.exportLineId=billed?id(7):null;e.billingFacts=billed?e.billingFacts:[];
   if(!paid)e.billingFacts=e.billingFacts.filter(f=>f.kind!=="settled");
   const g=group([e],{jobTrack:track,mode,feeGate:gate});const valid=(track==="contractor")===(["site_user","jobguard_surfaced_confirmed","office_entry","client_instruction"].includes(kind));
   if(!valid) expect(()=>feeBearing(g)).toThrow();else {
    const site=track==="contractor"&&["site_user","jobguard_surfaced_confirmed"].includes(kind)&&coverage!=="fully_instructed"&&["note","verified"].includes(evidence)&&resident!=="missing";
    expect(siteOriginated(g)).toBe(site);
    expect(feeBearing(g)).toBe(site&&approved&&billed&&paid&&mode==="production_billing"&&gate);
    if(!site||!approved||!billed||!paid)expect(qualifyingPrincipal(g,{reference:true})).toEqual({numerator:0n,denominator:1n});
   }cases++;
  }
  expect(cases).toBe(7*2*3*4*3*2*2*2*3*2);
 },30000);
 it("stable effective origin by exact instant then ID; canonical and device clocks do not order entitlement",()=>{
  const a=extra(),b=extra({id:id(8),duplicateOf:a.id,state:"duplicate"});b.origin={...b.origin,variationId:b.id,serverRecordedAt:"2026-10-05T13:00:00+01:00",deviceCapturedAt:"2020-01-01T00:00:00Z"};
  for(const members of [[a,b],[b,a]]) expect(effectiveOrigin(group(members,{canonicalId:a.id})).id).toBe(a.id);
  const g=group([a,b]);const swapped=structuredClone(g);swapped.canonicalId=b.id;swapped.members[0]!.duplicateOf=b.id;swapped.members[0]!.state="duplicate";swapped.members[1]!.duplicateOf=null;swapped.members[1]!.state="paid";
  expect(effectiveOrigin(swapped).id).toBe(effectiveOrigin(g).id);
  b.origin.serverRecordedAt="2026-10-05T12:00:00.000000001Z";expect(effectiveOrigin(group([b,a],{canonicalId:a.id})).id).toBe(a.id);
  a.origin.serverRecordedAt="2026-10-05T12:00:00.000000002Z";expect(effectiveOrigin(group([a,b])).id).toBe(b.id);
 });
 it("all §9.1.11 exclusions and prompt/evidence/requirements/matched-line exclusions",()=>{
  for(const state of ["withdrawn","rejected","billing_rejected","logged","awaiting_approval","approved","exported","credited","duplicate"] as const) {
   const e=extra({state});if(state==="duplicate")e.duplicateOf=id(99);
   try{expect(qualifyingPrincipal(group([e]),{reference:true}).numerator).toBe(0n);}catch(error){expect(error).toHaveProperty("code");}
  }
  for(const mutate of [
   (e:EnterpriseExtra)=>{e.revision.netPence=0;},(e:EnterpriseExtra)=>{e.revision.approvals=[];},
   (e:EnterpriseExtra)=>{e.revision.approvals[0]!.hash=hash("b");},(e:EnterpriseExtra)=>{e.revision.requirement!.photoRequired=true;},
   (e:EnterpriseExtra)=>{e.billingFacts[1]!.status="pending";},(e:EnterpriseExtra)=>{e.billingFacts[1]!.net=exact(0);},
   (e:EnterpriseExtra)=>{e.billingFacts.push({...e.billingFacts[0]!,kind:"credited",sourceRef:"credit"});},
   (e:EnterpriseExtra)=>{e.billingFacts.push({...e.billingFacts[1]!,kind:"reversed",sourceRef:"reversal",originalSourceRef:"fictional-receipt"});},
  ]) {const e=extra();mutate(e);expect(qualifyingPrincipal(group([e]),{reference:true}).numerator).toBe(0n);}
  const p=withKind("jobguard_surfaced_confirmed","contractor");p.prompt=null;expect(siteOriginated(group([p]))).toBe(false);
  for(const role of ["operative","finance","admin","owner","read_only","connector","client_approver"]) {const e=withKind("jobguard_surfaced_confirmed","contractor");e.prompt!.confirmedBy=actor(role);expect(siteOriginated(group([e]))).toBe(false);}
  const p2=withKind("jobguard_surfaced_confirmed","contractor");p2.prompt!.surfacedAt=at;expect(siteOriginated(group([p2]))).toBe(false);
 });
 it("origin/command/actor provenance and immutable origin refusal",()=>{
  for(const kind of kinds) {const track=["builder_logged","final_review","jobguard_catch"].includes(kind)?"small_builder":"contractor";expect(originForCommand(commands[kind],track).kind).toBe(kind);expect(()=>originForCommand(commands[kind],track==="contractor"?"small_builder":"contractor")).toThrow();}
  expect(originForCommand("ImportOrderLine","contractor").kind).toBe("client_instruction");
  const e=extra();for(const change of [{actorId:id(98)},{type:"RecordOfficeExtra"},{id:id(98)}])expect(()=>siteOriginated(group([{...e,raisingCommand:{...e.raisingCommand,...change} as typeof e.raisingCommand}]))).toThrow();
  expect(()=>assertOriginUnchanged(e,{...e,origin:{...e.origin,serverRecordedAt:"2026-11-01T00:00:00Z"}})).toThrow();
  expect(assertOriginUnchanged(e,{...e,state:"billed"})).toBeUndefined();
 });
 it("one canonical, no self-links/cycles/cross-job groups, unresolved export and authorized repairs",()=>{
  const a=extra(),b=extra({id:id(8),duplicateOf:a.id,state:"duplicate"});b.origin.variationId=b.id;const g=group([a,b]);expect(assertDuplicateGroup(g)).toBeUndefined();
  for(const mutate of [(v:EnterpriseGroup)=>{v.members[1]!.jobId=id(90);},(v:EnterpriseGroup)=>{v.members[1]!.duplicateOf=null;},(v:EnterpriseGroup)=>{v.members[0]!.duplicateOf=b.id;},(v:EnterpriseGroup)=>{v.members[1]!.duplicateOf=b.id;}]) {const v=structuredClone(g);mutate(v);expect(()=>assertDuplicateGroup(v)).toThrow();}
  for(const role of ["supervisor","surveyor","commercial_manager"]) expect(assertDuplicateRepair({...g,members:g.members.map(e=>({...e,exportLineId:null,billingFacts:[]}))},actor(role),{kind:"unlink",reason:"generated correction",reconciliationId:null,inputFactsHash:hash(),authorization:null})).toBeUndefined();
  expect(()=>assertDuplicateRepair(g,actor("supervisor"),{kind:"unlink",reason:"why",reconciliationId:null,inputFactsHash:hash(),authorization:null})).toThrow();
  expect(assertDuplicateRepair(g,actor("finance"),{kind:"reconcile",reason:"generated correction",reconciliationId:id(80),inputFactsHash:hash(),authorization:{version:"enterprise-reconciliation-authorization.v1",decisionId:id(81),action:"ReconcileExportedDuplicate",tenantId:g.tenantId,jobId:g.jobId,canonicalId:g.canonicalId,actorId:id(31),contentHash:hash(),resolution:"approved",current:true,expired:false}})).toBeUndefined();
  expect(()=>assertDuplicateRepair(g,actor("owner"),{kind:"reconcile",reason:"why",reconciliationId:id(80),inputFactsHash:hash(),authorization:{version:"enterprise-reconciliation-authorization.v1",decisionId:id(81),action:"ReconcileExportedDuplicate",tenantId:g.tenantId,jobId:g.jobId,canonicalId:g.canonicalId,actorId:id(31),contentHash:hash(),resolution:"approved",current:true,expired:false}})).toThrow();
  const before=structuredClone(g);expect(coalescePrompt(g,{tenantId:g.tenantId,jobId:g.jobId,matchingExtraId:a.id})).toEqual({canonicalId:a.id,createsOrigin:false});expect(g).toEqual(before);
 });
});
if (/\/origin\.test\.(?:ts|js)$/u.test(expect.getState().testPath??"")) it("approval/export/match dimensions, prompt predating all members and origin-order revision binding",()=>{
 for(const approvalState of ["valid","stale_revision","stale_hash","missing_step","missing_requirement","photo_required"] as const)for(const exported of [false,true])for(const matched of [false,true])for(const mode of ["synthetic_demo","pilot_no_charge","production_billing"] as const)for(const gate of [false,true]) {
  const e=extra();if(approvalState==="stale_revision")e.revision.approvals[0]!.revisionId=id(99);if(approvalState==="stale_hash")e.revision.approvals[0]!.hash=hash("b");if(approvalState==="missing_step")e.revision.approvals=[];if(approvalState==="missing_requirement")e.revision.requirement=null;if(approvalState==="photo_required")e.revision.requirement!.photoRequired=true;
  if(!exported){e.exportLineId=null;e.billingFacts=[];}if(!matched&&exported)e.billingFacts[0]!.exportLineId=id(99);
  const g=group([e],{mode,feeGate:gate});if(!matched&&exported)expect(()=>feeBearing(g)).toThrow();else expect(feeBearing(g)).toBe(approvalState==="valid"&&exported&&mode==="production_billing"&&gate);
 }
 const p=withKind("jobguard_surfaced_confirmed","contractor"),office=withKind("office_entry","contractor");office.id=id(8);office.origin.variationId=office.id;office.duplicateOf=p.id;office.state="duplicate";office.origin.serverRecordedAt="2026-10-05T10:00:00Z";
 expect(siteOriginated(group([p,office]))).toBe(false);
 const before=extra(),after=structuredClone(before);after.orderAtOrigin.revisionId=id(99);expect(()=>assertOriginUnchanged(before,after)).toThrow();
});
if (/\/origin\.test\.(?:ts|js)$/u.test(expect.getState().testPath??"")) it("post-export reconciliation requires an exact current approved authorization fact",()=>{
 const g=group(),a=actor("finance"),authorization={version:"enterprise-reconciliation-authorization.v1",decisionId:id(81),action:"ReconcileExportedDuplicate",tenantId:g.tenantId,jobId:g.jobId,canonicalId:g.canonicalId,actorId:a.membershipId,contentHash:hash(),resolution:"approved",current:true,expired:false};
 const repair={kind:"reconcile",reason:"generated authorized repair",reconciliationId:id(80),inputFactsHash:hash(),authorization};
 for(const patch of [{resolution:"rejected"},{resolution:"dismissed"},{current:false},{expired:true},{tenantId:id(99)},{jobId:id(99)},{canonicalId:id(99)},{actorId:id(99)},{contentHash:hash("b")}])expect(()=>assertDuplicateRepair(g,a,{...repair,authorization:{...authorization,...patch}})).toThrow();
});
