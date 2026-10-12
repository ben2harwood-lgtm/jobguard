import { describe, expect, it } from "vitest";
import { transitionExtra, EnterpriseDomainError, enterpriseStates, enterpriseCommands, enterpriseRoles } from "./index.js";
import { extra, actor, group, id, hash, revision, grant, approval, requirement, withKind } from "./origin.test.js";
import { siteOriginated, qualifyingPrincipal, feeBearing } from "./index.js";

function expectRefusal(input:unknown,code:EnterpriseDomainError["code"],label:string) {
 let error:unknown;
 try {transitionExtra(input);}catch(caught){error=caught;}
 expect(error,label).toBeInstanceOf(EnterpriseDomainError);expect(error,label).toHaveProperty("code",code);
}
// Independent hand-written rows, never generated from the implementation: BUILD_PLAN §9.1.4, except the roles of LogSiteExtra, RecordOfficeExtra and RecordClientInstruction, which follow the founder's answer of 11 Oct 2026 (card jobguard-ent4b-who-records-extras-2026-10-11).
const edges: Record<string, { from: readonly string[]; roles: readonly string[]; to: string }> = {
 LogSiteExtra:{from:["absent"],roles:["operative","supervisor","surveyor"],to:"logged"},
 ConfirmPrompt:{from:["absent"],roles:["supervisor","surveyor","commercial_manager"],to:"logged"},
 RecordOfficeExtra:{from:["absent"],roles:["finance","admin","owner"],to:"logged"},
 RecordClientInstruction:{from:["absent"],roles:["commercial_manager","admin","owner"],to:"logged"},
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

describe("ENT-4a-ALIGN: who may record each kind of extra (founder, 11 Oct 2026)", () => {
 const recordingRows = [
  {command:"LogSiteExtra",kind:"site_user",role:"operative",permitted:true},
  {command:"LogSiteExtra",kind:"site_user",role:"supervisor",permitted:true},
  {command:"LogSiteExtra",kind:"site_user",role:"surveyor",permitted:true},
  {command:"LogSiteExtra",kind:"site_user",role:"commercial_manager",permitted:false},
  {command:"LogSiteExtra",kind:"site_user",role:"finance",permitted:false},
  {command:"LogSiteExtra",kind:"site_user",role:"admin",permitted:false},
  {command:"LogSiteExtra",kind:"site_user",role:"owner",permitted:false},
  {command:"LogSiteExtra",kind:"site_user",role:"read_only",permitted:false},
  {command:"LogSiteExtra",kind:"site_user",role:"client_approver",permitted:false},
  {command:"LogSiteExtra",kind:"site_user",role:"connector",permitted:false},
  {command:"RecordOfficeExtra",kind:"office_entry",role:"operative",permitted:false},
  {command:"RecordOfficeExtra",kind:"office_entry",role:"supervisor",permitted:false},
  {command:"RecordOfficeExtra",kind:"office_entry",role:"surveyor",permitted:false},
  {command:"RecordOfficeExtra",kind:"office_entry",role:"commercial_manager",permitted:false},
  {command:"RecordOfficeExtra",kind:"office_entry",role:"finance",permitted:true},
  {command:"RecordOfficeExtra",kind:"office_entry",role:"admin",permitted:true},
  {command:"RecordOfficeExtra",kind:"office_entry",role:"owner",permitted:true},
  {command:"RecordOfficeExtra",kind:"office_entry",role:"read_only",permitted:false},
  {command:"RecordOfficeExtra",kind:"office_entry",role:"client_approver",permitted:false},
  {command:"RecordOfficeExtra",kind:"office_entry",role:"connector",permitted:false},
  {command:"RecordClientInstruction",kind:"client_instruction",role:"operative",permitted:false},
  {command:"RecordClientInstruction",kind:"client_instruction",role:"supervisor",permitted:false},
  {command:"RecordClientInstruction",kind:"client_instruction",role:"surveyor",permitted:false},
  {command:"RecordClientInstruction",kind:"client_instruction",role:"commercial_manager",permitted:true},
  {command:"RecordClientInstruction",kind:"client_instruction",role:"finance",permitted:false},
  {command:"RecordClientInstruction",kind:"client_instruction",role:"admin",permitted:true},
  {command:"RecordClientInstruction",kind:"client_instruction",role:"owner",permitted:true},
  {command:"RecordClientInstruction",kind:"client_instruction",role:"read_only",permitted:false},
  {command:"RecordClientInstruction",kind:"client_instruction",role:"client_approver",permitted:false},
  {command:"RecordClientInstruction",kind:"client_instruction",role:"connector",permitted:false},
 ] as const;

 it("[AL-2] the hand-written table covers every role exactly once for each kind", () => {
  expect(recordingRows).toHaveLength(3 * enterpriseRoles.length);
  expect(recordingRows).toHaveLength(30);
  for (const kind of ["site_user","office_entry","client_instruction"] as const) {
   const rows = recordingRows.filter(row => row.kind === kind);
   expect(rows).toHaveLength(enterpriseRoles.length);
   for (const role of enterpriseRoles) expect(rows.filter(row => row.role === role)).toHaveLength(1);
  }
 });

 it.each(recordingRows)("[AL-2] $command / $role permitted=$permitted", ({command,kind,role,permitted}) => {
  const input = request(command,"absent",role), before = structuredClone(input);
  if (permitted) {
   const result = transitionExtra(input);
   expect(result.state).toBe("logged");
   expect(result.origin.origin.kind).toBe(kind);
   expect(result.origin.raisingRole).toBe(role);
   expect(result.raisingCommand.role).toBe(role);
  } else expectRefusal(input,"PERMISSION_DENIED",`${command}/${role}`);
  expect(input).toEqual(before);
 });

 const permittedPairs = [
  {command:"LogSiteExtra",role:"operative"},
  {command:"LogSiteExtra",role:"supervisor"},
  {command:"LogSiteExtra",role:"surveyor"},
  {command:"RecordOfficeExtra",role:"finance"},
  {command:"RecordOfficeExtra",role:"admin"},
  {command:"RecordOfficeExtra",role:"owner"},
  {command:"RecordClientInstruction",role:"commercial_manager"},
  {command:"RecordClientInstruction",role:"admin"},
  {command:"RecordClientInstruction",role:"owner"},
 ] as const;
 it.each(permittedPairs)("[AL-3] $command / $role requires a covering grant", ({command,role}) => {
  expect(transitionExtra(request(command,"absent",role)).state).toBe("logged");
  for (const person of [
   actor(role,{grants:[]}),
   actor(role,{grants:[grant(role,{jobId:id(99)})]}),
   actor(role,{grants:[grant(role,{tenantId:id(98)})]}),
   actor(role,{grants:[grant(role,{membershipId:id(99)})]}),
  ]) {
   const input = {...request(command,"absent",role),actor:person}, before = structuredClone(input);
   expectRefusal(input,"PERMISSION_DENIED",`${command}/${role}`);
   expect(input).toEqual(before);
  }
 });

 it.each(["owner","admin"])("[AL-4] %s has no blanket override across states and commands", role => {
  const successes: {state:string;command:string}[] = [];
  for (const state of ["absent",...enterpriseStates]) for (const command of enterpriseCommands) {
   const input = request(command,state,role);
   if (state === "absent" && ["RecordOfficeExtra","RecordClientInstruction"].includes(command)) {
    expect(transitionExtra(input).state).toBe("logged");
    successes.push({state,command});
   } else expect(() => transitionExtra(input)).toThrow(EnterpriseDomainError);
  }
  expect(successes).toEqual([
   {state:"absent",command:"RecordOfficeExtra"},
   {state:"absent",command:"RecordClientInstruction"},
  ]);
 });
 it.each([
  {role:"operative",permitted:false},
  {role:"supervisor",permitted:false},
  {role:"surveyor",permitted:true},
  {role:"commercial_manager",permitted:true},
  {role:"finance",permitted:false},
  {role:"admin",permitted:false},
  {role:"owner",permitted:false},
  {role:"read_only",permitted:false},
  {role:"client_approver",permitted:false},
  {role:"connector",permitted:true},
 ])("[AL-4] ImportOrderLine / $role permitted=$permitted", ({role,permitted}) => {
  const input = request("ImportOrderLine","absent",role), before = structuredClone(input);
  if (permitted) expect(transitionExtra(input).state).toBe("logged");
  else expectRefusal(input,"PERMISSION_DENIED",`ImportOrderLine/${role}`);
  expect(input).toEqual(before);
 });

 // Merged guard at transitions.ts line 21, unchanged by ENT-4a-ALIGN. For supervisor and surveyor it is stricter than the database rule of ENT-3a, which requires only an operative to be named on the job. Not a founder rule; see the receipt, residual R1.
 it.each(["operative","supervisor","surveyor"])("[AL-5] site capture by %s not named on the job is refused", role => {
  const input = {...request("LogSiteExtra","absent",role),actor:actor(role,{assigned:false})};
  expectRefusal(input,"INVALID_TRANSITION",role);
 });
 it("[AL-5] surveyor site capture without a note or verified photo is refused", () => {
  const input = request("LogSiteExtra","absent","surveyor");
  input.creation.captureNote = null;
  input.creation.photo.status = "pending";
  expectRefusal(input,"INVALID_TRANSITION","surveyor capture");
 });

 // Fee rule for a site extra, by who logged it. Rows 3 to 5 follow the founder's answer of 12 Oct 2026 ('charge on both', card jobguard-fee-on-surveyor-extras-2026-10-12), built by FEE-BOTH-1: a surveyor's, and a supervisor's not named on the job, now count. Rows 1, 2 and 6 are as ENT-4a-ALIGN wrote them. Hand-written literals, never read from the implementation.
 it.each([
  {role:"operative",assigned:true,site:true,principal:{numerator:15000n,denominator:1n},fee:true},
  {role:"supervisor",assigned:true,site:true,principal:{numerator:15000n,denominator:1n},fee:true},
  {role:"surveyor",assigned:true,site:true,principal:{numerator:15000n,denominator:1n},fee:true},
  {role:"surveyor",assigned:false,site:true,principal:{numerator:15000n,denominator:1n},fee:true},
  {role:"supervisor",assigned:false,site:true,principal:{numerator:15000n,denominator:1n},fee:true},
  {role:"operative",assigned:false,site:false,principal:{numerator:0n,denominator:1n},fee:false},
 ] as const)("[AL-6] merged fee rule / $role named=$assigned", ({role,assigned,site,principal,fee}) => {
  const e = extra();
  e.origin.raisingRole = role;
  e.raisingCommand.role = role;
  e.raisingCommand.grant = grant(role,{membershipId:e.origin.raisingMembershipId});
  e.raisingCommand.assigned = assigned;
  expect(siteOriginated(group([e]))).toBe(site);
  expect(qualifyingPrincipal(group([e]),{reference:true})).toEqual(principal);
  expect(feeBearing(group([e],{mode:"production_billing",feeGate:true}))).toBe(fee);
 });
});
