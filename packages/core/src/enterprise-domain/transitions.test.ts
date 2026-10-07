import { describe, expect, it } from "vitest";
import { transitionExtra, EnterpriseDomainError, enterpriseStates, enterpriseCommands, enterpriseRoles } from "./index.js";
import { extra, actor, group, id, hash, revision, grant, approval, requirement, withKind } from "./origin.test.js";

function expectRefusal(input:unknown,code:EnterpriseDomainError["code"],label:string) {
 let error:unknown;
 try {transitionExtra(input);}catch(caught){error=caught;}
 expect(error,label).toBeInstanceOf(EnterpriseDomainError);expect(error,label).toHaveProperty("code",code);
}
// Independent normative rows from BUILD_PLAN §9.1.4; no implementation-generated expectation.
const edges: Record<string, { from: readonly string[]; roles: readonly string[]; to: string }> = {
 LogSiteExtra:{from:["absent"],roles:["operative","supervisor"],to:"logged"},
 ConfirmPrompt:{from:["absent"],roles:["supervisor","surveyor","commercial_manager"],to:"logged"},
 RecordOfficeExtra:{from:["absent"],roles:["supervisor","surveyor","commercial_manager","admin"],to:"logged"},
 RecordClientInstruction:{from:["absent"],roles:["surveyor","commercial_manager","connector"],to:"logged"},
 ImportOrderLine:{from:["absent"],roles:["surveyor","commercial_manager","connector"],to:"logged"},
 SubmitExtra:{from:["logged"],roles:["supervisor","surveyor","operative"],to:"awaiting_approval"},
 PriceExtra:{from:["logged"],roles:["supervisor","surveyor","operative"],to:"awaiting_approval"},
 ApproveExtraStep:{from:["awaiting_approval"],roles:["supervisor","surveyor","commercial_manager","client_approver"],to:"approved"},
 RejectExtra:{from:["awaiting_approval"],roles:["supervisor","surveyor","commercial_manager","client_approver"],to:"rejected"},
 WithdrawExtra:{from:["logged","awaiting_approval","approved"],roles:["operative","supervisor","surveyor","commercial_manager"],to:"withdrawn"},
 MarkDuplicate:{from:["logged","awaiting_approval","approved","rejected"],roles:["supervisor","surveyor","commercial_manager"],to:"duplicate"},
 ReviseExtra:{from:["approved","rejected"],roles:["supervisor","surveyor"],to:"awaiting_approval"},
 FinaliseExportBatch:{from:["approved"],roles:["finance","commercial_manager"],to:"exported"},
 ImportBillingStatus:{from:["exported","billed"],roles:["finance","connector"],to:"billed"},
};
export function request(command: string, state: string, role: string) {
 const e=extra(); e.state=state==="absent"?"logged":state as typeof e.state;
 e.revision.priceSource="server_sor";if(["logged","awaiting_approval","approved","rejected"].includes(state)) {e.exportLineId=null;e.exportedAt=null;e.billingFacts=[];} e.revision.approvals=["logged","awaiting_approval"].includes(state)?[]:[approval()];
 e.revision.requirement!.steps=[{role: ["surveyor","commercial_manager","client_approver"].includes(role)?role as "surveyor": "supervisor",alternates:[]}];
 if (!["logged","awaiting_approval"].includes(state)) e.revision.approvals=[approval({role:e.revision.requirement!.steps[0]!.role,grant:grant(e.revision.requirement!.steps[0]!.role)})];
 const kind=command==="ConfirmPrompt"?"jobguard_surfaced_confirmed":command==="RecordOfficeExtra"?"office_entry":["RecordClientInstruction","ImportOrderLine"].includes(command)?"client_instruction":"site_user";
 e.origin.origin={version:"variation-origin.v1",jobTrack:"contractor",kind};
 e.raisingCommand.type=command==="ConfirmPrompt"?"ConfirmPrompt":command==="RecordOfficeExtra"?"RecordOfficeExtra":["RecordClientInstruction","ImportOrderLine"].includes(command)?command as "RecordClientInstruction":"LogSiteExtra";
 const a=actor(role); if (command==="WithdrawExtra"&&role==="operative") a.membershipId=e.origin.raisingMembershipId;
 if(["SubmitExtra","PriceExtra"].includes(command)&&role==="operative") a.membershipId=e.origin.raisingMembershipId;
 if(state==="absent") {e.revision.approvals=[];e.exportLineId=null;e.exportedAt=null;e.billingFacts=[];e.origin.raisingRole=role;e.origin.raisingMembershipId=a.membershipId;e.raisingCommand.actorId=a.membershipId;e.raisingCommand.role=role as typeof e.raisingCommand.role;e.raisingCommand.grant=grant(role,{membershipId:a.membershipId});if(e.prompt)e.prompt.confirmedBy=a;}
 a.grants.forEach(g=>g.membershipId=a.membershipId);
 return {version:"enterprise-transition.v1" as const,command,extra:state==="absent"?null:e,creation:e,actor:a,
 expectedRevisionId:e.revision.id,expectedHash:e.revision.hash,reason:"raised_in_error",serverRecordedAt:"2026-10-06T00:00:00Z",newRevision:revision({id:id(50),hash:hash("b"),approvals:[]}),
 canonical:extra({id:id(9),origin:{...extra().origin,variationId:id(9)},exportLineId:null,exportedAt:null,billingFacts:[]}),group:group([e]),billing:{kind:"invoiced",matched:true,remainingBilledNetPence:15000,remainingSettledNetPence:0},exportLineId:id(70)};
}
describe("§9.1.4 independent state × command × role table",()=>{
 it.each(["absent",...enterpriseStates])("covers every legal and illegal edge from %s, with no owner/admin override",state=>{
  let count=0;
  for(const command of enterpriseCommands) for(const role of enterpriseRoles) {
   const input=request(command,state,role), before=structuredClone(input),row=edges[command]!;
   const legal=row.from.includes(state)&&row.roles.includes(role)&&!(command==="WithdrawExtra"&&role==="operative"&&state==="approved");
   if(legal) expect(transitionExtra(input).state,`${state}/${command}/${role}`).toBe(row.to);
   else {
    const outerBillingState=command==="ImportBillingStatus"&&["part_paid","paid"].includes(state);
    const code=(!row.from.includes(state)&&!outerBillingState)?"INVALID_TRANSITION":!row.roles.includes(role)||command==="WithdrawExtra"&&role==="operative"&&state==="approved"?"PERMISSION_DENIED":"INVALID_TRANSITION";
    expectRefusal(input,code,`${state}/${command}/${role}`);
   }
   expect(input).toEqual(before);count++;
  }
  expect(count).toBe(14*10);
 });
 it("requires covering grants, assignment on site capture, matching revision and hash",()=>{
  for(const command of enterpriseCommands) {const role=edges[command]!.roles[0]!, state=edges[command]!.from[0]!;
   for(const change of [ {actor:actor(role,{grants:[]})},{actor:actor(role,{grants:[grant(role,{jobId:id(99)})]})},
    {expectedRevisionId:id(99)},{expectedHash:hash("b")}]) expect(()=>transitionExtra({...request(command,state,role),...change})).toThrow(EnterpriseDomainError);
  }
  expect(()=>transitionExtra({...request("LogSiteExtra","absent","operative"),actor:actor("operative",{assigned:false})})).toThrow();
 });
 it("ordered distinct approvers, pending holder, raiser prohibition and immutable requirement snapshot",()=>{
  const r=request("ApproveExtraStep","awaiting_approval","supervisor");
  r.extra!.revision.requirement=requirement({steps:[{role:"supervisor",alternates:[]},{role:"surveyor",alternates:[]}]});
  expect(transitionExtra(r).state).toBe("awaiting_approval");
  expect(()=>transitionExtra({...r,actor:actor("surveyor")})).toThrow("PERMISSION_DENIED");
  expect(()=>transitionExtra({...r,actor:actor("supervisor",{membershipId:r.extra!.origin.raisingMembershipId})})).toThrow("SELF_APPROVAL");
  r.extra!.revision.approvals=[approval({actorId:r.actor.membershipId})];
  expect(()=>transitionExtra({...r,actor:actor("surveyor",{membershipId:r.actor.membershipId})})).toThrow("REUSED_APPROVER");
  for(const mutation of [{hash:hash("b")},{revisionId:id(8)},{ruleVersion:"other"},{netPence:2},{index:1}]) {
   r.extra!.revision.approvals=[approval(mutation)];expect(()=>transitionExtra({...r,actor:actor("surveyor")})).toThrow();
  }
  const reject=request("RejectExtra","awaiting_approval","supervisor");
  expect(()=>transitionExtra({...reject,reason:""})).toThrow();
  expect(()=>transitionExtra({...reject,actor:actor("finance")})).toThrow();
 });
 it("price, evidence, resident and withdrawal guards",()=>{
  for(const command of ["SubmitExtra","PriceExtra"]) for(const change of [{netPence:null},{priceConfirmed:false},{requirement:null}]) {
   const r=request(command,"logged","supervisor");Object.assign(r.extra!.revision,change);expect(()=>transitionExtra(r)).toThrow();
  }
  const r=request("SubmitExtra","logged","operative");r.extra!.revision.priceSource="surveyor_quoted";expect(()=>transitionExtra(r)).toThrow();
  r.extra!.revision.priceSource="server_sor";r.actor.membershipId=id(98);expect(()=>transitionExtra(r)).toThrow();
  for(const photo of ["pending","rejected","none"]) {const c=request("LogSiteExtra","absent","operative");c.creation.captureNote=null;c.creation.photo.status=photo as "pending";expect(()=>transitionExtra(c)).toThrow();}
  const c=request("LogSiteExtra","absent","operative");c.creation.residentCaptured=true;c.creation.residentConfirmationHash=null;expect(()=>transitionExtra(c)).toThrow();
  for(const reason of ["not_done","raised_in_error","resident_cancelled","already_on_order"]) expect(transitionExtra({...request("WithdrawExtra","logged","operative"),reason}).state).toBe("withdrawn");
  const w=request("WithdrawExtra","approved","operative");expect(()=>transitionExtra(w)).toThrow();
  expect(()=>transitionExtra({...request("WithdrawExtra","logged","supervisor"),reason:"other"})).toThrow();
 });
 it("revising voids approvals; duplicate/export/matched-import and full/partial credit/reversal guards",()=>{
  const r=request("ReviseExtra","approved","surveyor");r.newRevision.approvals=[approval()];expect(()=>transitionExtra(r)).toThrow();r.newRevision.approvals=[];
  expect(transitionExtra(r).revision.approvals).toEqual([]);
  r.newRevision.id=r.extra!.revision.id;expect(()=>transitionExtra(r)).toThrow();
  for(const c of [{id:id(1)},{jobId:id(88)},{state:"duplicate" as const}]) expect(()=>transitionExtra({...request("MarkDuplicate","logged","supervisor"),canonical:extra(c)})).toThrow();
  const ex=request("FinaliseExportBatch","approved","finance");ex.group.unresolvedCandidateIds=[id(90)];expect(()=>transitionExtra(ex)).toThrow();
  const bill=request("ImportBillingStatus","exported","finance");bill.billing.matched=false;expect(()=>transitionExtra(bill)).toThrow();bill.billing.matched=true;
  expect(transitionExtra({...bill,billing:{...bill.billing,kind:"rejected"}}).state).toBe("billing_rejected");
  for(const state of ["billed","part_paid","paid"]) {
   const input=request("ImportBillingStatus",state,"finance");
   expect(transitionExtra({...input,billing:{...input.billing,kind:"credited",remainingBilledNetPence:0}}).state).toBe("credited");
   expect(transitionExtra({...input,billing:{...input.billing,kind:"credited",remainingBilledNetPence:10000}}).state).toBe(state);
  }
  for(const state of ["part_paid","paid"]) for(const remaining of [0,1000]) {
   const input=request("ImportBillingStatus",state,"connector");
   expect(transitionExtra({...input,billing:{...input.billing,kind:"payment_reversed",remainingSettledNetPence:remaining}}).state).toBe(remaining===0?"billed":"part_paid");
  }
 });
});
it.each(enterpriseStates)("billing event × role from %s, terminal preservation and amount projections",state=>{
 const normative:Record<string,readonly string[]>={invoiced:["exported","billed"],credited:["billed","part_paid","paid"],paid:["billed","part_paid","paid"],payment_reversed:["part_paid","paid"],rejected:["exported"]};
 for(const event of ["invoiced","credited","paid","payment_reversed","rejected"] as const)for(const role of enterpriseRoles) {
  const input=request("ImportBillingStatus",state,role);input.billing={kind:event,matched:true,remainingBilledNetPence:event==="credited"?0:15000,remainingSettledNetPence:event==="paid"?15000:0};
  const before=structuredClone(input),legal=normative[event]!.includes(state)&&["finance","connector"].includes(role);
  if(legal)expect(transitionExtra(input).state).toBe(event==="credited"?"credited":event==="paid"?"paid":event==="rejected"?"billing_rejected":"billed");else {
   const code=!["exported","billed","part_paid","paid"].includes(state)?"INVALID_TRANSITION":!["finance","connector"].includes(role)?"PERMISSION_DENIED":"INVALID_TRANSITION";
   expectRefusal(input,code,`${state}/${event}/${role}`);
  }
  expect(input).toEqual(before);
 }
 const partial=request("ImportBillingStatus","part_paid","finance");partial.billing={kind:"credited",matched:true,remainingBilledNetPence:10000,remainingSettledNetPence:5000};
 expect(transitionExtra(partial)).toMatchObject({state:"part_paid",billingBalances:{billedNetPence:10000,settledNetPence:5000}});
});
it("supplied contract_rule approval, alternates, resident/photo requirement and step server timing",()=>{
 const rule=request("SubmitExtra","logged","supervisor");rule.extra!.revision.requirement!.steps=[{role:"contract_rule",alternates:[]}];rule.extra!.revision.approvals=[approval({role:"contract_rule",grant:null,actorId:id(42)})];
 expect(transitionExtra(rule).state).toBe("approved");
 const alternate=request("ApproveExtraStep","awaiting_approval","surveyor");alternate.extra!.revision.requirement!.steps=[{role:"supervisor",alternates:["surveyor"]}];alternate.extra!.workDone=true;
 expect(transitionExtra(alternate).revision.approvals[0]).toMatchObject({role:"surveyor",timing:"after_work",serverRecordedAt:alternate.serverRecordedAt});
 for(const field of ["photoRequired","residentRequired"] as const) {const r=request("SubmitExtra","logged","surveyor");r.extra!.revision.requirement![field]=true;expect(()=>transitionExtra(r)).toThrow();}
 const stale=request("FinaliseExportBatch","approved","finance");stale.group.members[0]!.revision.id=id(99);expect(()=>transitionExtra(stale)).toThrow();
});
it("covering grants belong to their actual actor, including raising and prior approval grants",()=>{
 const valid=request("ApproveExtraStep","awaiting_approval","supervisor");expect(transitionExtra(valid).state).toBe("approved");
 const forged=structuredClone(valid);forged.actor.grants[0]!.membershipId=id(99);expect(()=>transitionExtra(forged)).toThrow();
 const raising=request("LogSiteExtra","absent","operative");raising.creation.raisingCommand.grant.membershipId=id(99);expect(()=>transitionExtra(raising)).toThrow();
 const historical=request("FinaliseExportBatch","approved","finance");historical.extra!.revision.approvals[0]!.grant!.membershipId=id(99);expect(()=>transitionExtra(historical)).toThrow();
});
it("enterprise approval/export lifecycle cannot operate on a small-builder job",()=>{
 const input=request("SubmitExtra","logged","supervisor"),e=withKind("builder_logged","small_builder");e.state="logged";e.revision.approvals=[];e.exportLineId=null;e.exportedAt=null;e.billingFacts=[];
 input.extra=e;input.creation=e;input.group=group([e],{jobTrack:"small_builder"});expect(()=>transitionExtra(input)).toThrow(EnterpriseDomainError);
});

it.each(["paid","part_paid"])("round2 P2-3/P3-5 invoiced refuses %s with the exact transition code",state=>{
 const input=request("ImportBillingStatus",state,"finance"),before=structuredClone(input);
 expectRefusal(input,"INVALID_TRANSITION",state);expect(input).toEqual(before);
});
