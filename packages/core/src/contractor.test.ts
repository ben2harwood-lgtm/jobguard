import { describe, expect, it } from "vitest";
import { approvalRulesV1, clientContractDocumentV1, contractorCommandV1, contractorPermissionMatrix, contractorPermissions, contractorPermits, contractorRoles, referenceApprovalRulesV1, roleAllowedOnTrack, type ContractorGrant, type ContractorTarget } from "./contractor.js";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const target:ContractorTarget={tenantId:id(1),regionId:id(2),branchId:id(3),teamId:id(4),clientId:id(5),contractId:id(6),assigned:true,awaitingClientDecision:true};
describe('contractor permission × role × scope conformance',()=>{
 for(const role of contractorRoles) for(const permission of contractorPermissions) for(const scope of ['tenant','region','branch','team','client'] as const) {
  it(`${role} ${permission} ${scope}: in scope and other team/branch/region`,()=>{
   const grant:ContractorGrant={role,scope:{kind:scope,id:scope==='tenant'?id(1):scope==='region'?id(2):scope==='branch'?id(3):scope==='team'?id(4):id(5)}};
   const expected=contractorPermissionMatrix[role].includes(permission)&&(role==='client_approver'?scope==='client':scope!=='client'&&(role!=='finance'||scope==='tenant'));
   expect(contractorPermits([grant],permission,target)).toBe(expected);
   expect(contractorPermits([grant],permission,{...target,teamId:id(40)})).toBe(expected&&scope!=='team');
   expect(contractorPermits([grant],permission,{...target,branchId:id(30),teamId:id(40)})).toBe(expected&&!['branch','team'].includes(scope));
   expect(contractorPermits([grant],permission,{...target,regionId:id(20),branchId:id(30),teamId:id(40)})).toBe(expected&&!['region','branch','team'].includes(scope));
  });
 }
 it('denies administrative approval, unassigned operative work and every client read outside its contract',()=>{
  expect(contractorPermits([{role:'admin',scope:{kind:'tenant',id:id(1)}}],'extra.approve',target)).toBe(false);
  for(const permission of ['extra.approve','extra.price','data.export','data.import','statement.read'] as const) expect(contractorPermits([{role:'operative',scope:{kind:'team',id:id(4)}}],permission,target)).toBe(false);
  expect(contractorPermits([{role:'operative',scope:{kind:'team',id:id(4)}}],'job.read',{...target,assigned:false})).toBe(false);
  const client:ContractorGrant={role:'client_approver',scope:{kind:'client',id:id(5)},contractId:id(6)};
  for(const permission of contractorPermissions) expect(contractorPermits([client],permission,{...target,clientId:id(55)})).toBe(false);
  expect(contractorPermits([client],'contract.read',{...target,contractId:id(60)})).toBe(false);
  expect(contractorPermits([client],'extra.approve',{...target,awaitingClientDecision:false})).toBe(false);
 });
 it('denies unknown track roles',()=>{
  for(const role of ['estimator','foreman','superuser'])expect(roleAllowedOnTrack(role,'contractor')).toBe(false);
  for(const role of ['supervisor','surveyor','commercial_manager','client_approver'])expect(roleAllowedOnTrack(role,'small_builder')).toBe(false);
 });
});
describe('versioned immutable contract documents',()=>{
 it('preserves exact ratios and integer pence and rejects malformed policy',()=>{
  expect(approvalRulesV1.parse(referenceApprovalRulesV1)).toEqual(referenceApprovalRulesV1);
  for(const pence of [-1,0.5,1_000_000_000_001,Number.MAX_SAFE_INTEGER])expect(approvalRulesV1.safeParse({...referenceApprovalRulesV1,proceedLimit:{pence,currency:'GBP'}}).success).toBe(false);
  expect(approvalRulesV1.safeParse({...referenceApprovalRulesV1,bands:[{upToPence:25000,steps:[]}]}).success).toBe(false);
  expect(approvalRulesV1.safeParse({...referenceApprovalRulesV1,bands:[{upToPence:null,steps:[]},{upToPence:0,steps:[]}]}).success).toBe(false);
  expect(approvalRulesV1.safeParse({...referenceApprovalRulesV1,bands:[{upToPence:30000,steps:[]},{upToPence:20000,steps:[]},{upToPence:null,steps:[]}]}).success).toBe(false);
  expect(approvalRulesV1.safeParse({...referenceApprovalRulesV1,unknown:'field'}).success).toBe(false);
  expect(approvalRulesV1.safeParse({...referenceApprovalRulesV1,bands:[{upToPence:null,steps:[{role:'operative',timeLimitMinutes:0,escalationRole:'admin',alternateRoles:[]}]}]}).success).toBe(false);
 });
 it('rejects real invitation recipients, wrong environment and cross-track roles',()=>{
  const invite={version:'contractor-command.v1',environment:'synthetic_demo',kind:'member.invite',commandId:id(1),id:id(2),expectedRevision:0,email:'site@fictional.invalid',role:'operative',clientId:null,contractId:null,scope:{kind:'team',id:id(4)}};
  expect(contractorCommandV1.safeParse(invite).success).toBe(true);
  for(const edit of [{email:'real@example.com'},{role:'foreman'},{environment:'pilot_no_charge'},{expectedRevision:-1},{tenantId:id(9)}])expect(contractorCommandV1.safeParse({...invite,...edit}).success).toBe(false);
  const document={version:'client-contract.v1',reference:'FICTIONAL',startsOn:'2026-10-01',endsOn:null,sorVersionIds:[],tenderedAdjustment:{numerator:'-35',denominator:'1000'},photoRule:'required',vatCode:'synthetic-unreviewed'};
  expect(clientContractDocumentV1.parse(document).exportedNotBilledAlertDays).toBe(30);
  expect(clientContractDocumentV1.safeParse({...document,tenderedAdjustment:{numerator:'-0.035',denominator:'1'}}).success).toBe(false);
  expect(clientContractDocumentV1.safeParse({...document,tenderedAdjustment:{numerator:'-35',denominator:'0'}}).success).toBe(false);
 });
});
