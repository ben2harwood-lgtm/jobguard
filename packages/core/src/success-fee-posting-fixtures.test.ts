import { expect, it } from "vitest";
import { calculateSuccessFeeProposal } from "./success-fee-posting.js";
// Reference arithmetic after qualification/allocation; not persisted category proof.
const fixtures:[string,string,string,number,number,number][]=[
 ["F1","80000","1",0,8000,8000],
 ["F2 first","40000","1",0,4000,4000],["F2 rest","80000","1",4000,8000,4000],
 ["F3","60000","1",8000,6000,-2000],
 ["F4","2000000","43",0,4651,4651],["F4b","80000","1",4651,8000,3349],
 ["F5","40000","1",0,4000,4000],["F6","0","1",0,0,0],
 ["F7","80000","1",0,8000,8000],["F8","0","1",0,0,0],
 ["F9 5p","5","1",0,0,0],["F9 15p","15","1",0,2,2],["F9 25p","25","1",0,2,2],["F9 two 5p","10","1",0,1,1],
 ["F10 first","32000","1",0,3200,3200],["F10 rest","282000","1",3200,28200,25000],
 ["F11","32000","1",28200,3200,-25000],["F12","0","1",0,0,0],
 ["F13","80000","1",0,8000,8000],["F14","30000","1",0,3000,3000],
 ["F15","0","1",0,0,0],["F16 partial","0","1",0,0,0],["F16 full","30000","1",0,3000,3000],
 ["F17 after opening","45000","1",0,4500,4500],["F17 at or before opening","0","1",0,0,0],
 ["F18","262000","1",0,26200,26200],["F19","250000","1",0,25000,25000],
 ["F20","0","1",0,0,0],["F21","0","1",0,0,0],["F22","0","1",0,0,0],["F23","80000","1",0,8000,8000],
 ["unchanged approval arithmetic","80000","1",8000,8000,0],
];
it.each(fixtures)("%s arithmetic only",(_label,numerator,denominator,prior,fee,delta)=>{
 const out=calculateSuccessFeeProposal({version:"success-fee-proposal.v1",environment:"synthetic_reference",qualifyingPrincipal:{numerator,denominator},priorPostedPrincipalPence:prior,compensatesDerivationId:delta<0?"10000000-0000-4000-8000-000000000001":null});
 expect(out.successFeePrincipal).toEqual({pence:fee,currency:"GBP"});expect(out.postingDelta).toEqual({pence:delta,currency:"GBP"});expect(out.priorPostedPrincipalPence).toBe(fee-delta);
});
