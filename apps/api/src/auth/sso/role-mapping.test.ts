import {describe,expect,it} from "vitest";
import {ssoAdminV1,requireSyntheticSso,ssoDeploymentMode} from "./sso.contracts.js";
const id="00000000-0000-4000-8000-000000000001";
describe("ENT-10a explicit group mappings and gate",()=>{
 it("composition does not default a pilot, production or missing environment to synthetic",()=>{
  expect(ssoDeploymentMode('synthetic_demo')).toBe('synthetic_demo');
  for(const raw of ['pilot_no_charge','production','production_billing',undefined,'unknown'])expect(()=>requireSyntheticSso(ssoDeploymentMode(raw),'in-process-test-idp',true)).toThrowError('SSO_ROUTE_BLOCKED');
 });
 it("requires an explicit role, scope, revision and enabled state for every grant",()=>{
  const raw={version:"sso-admin.v1",requested_tenant_id:id,action:"mapping.set",connectionId:id,group:"finance",role:"finance",scope:{kind:"tenant",id},expectedRevision:0,enabled:true};
  expect(ssoAdminV1.parse(raw)).toEqual(raw);
  for(const key of ['role','scope','expectedRevision','enabled']){const changed={...raw} as Record<string,unknown>;delete changed[key];expect(ssoAdminV1.safeParse(changed).success).toBe(false);}
  for(const role of ['owner','client_approver','estimator','foreman'])expect(ssoAdminV1.safeParse({...raw,role}).success).toBe(false);
 });
 it.each(['synthetic_demo','pilot_no_charge','provider_sandbox','production_billing'] as const)("refuses every non-test provider in %s even when enabled",mode=>{
  expect(()=>requireSyntheticSso(mode,'live-provider',true)).toThrowError('SSO_ROUTE_BLOCKED');
 });
 it("only initializes the local synthetic route; flags cannot approve a route",()=>{
  expect(()=>requireSyntheticSso('synthetic_demo','in-process-test-idp')).not.toThrow();
  expect(()=>requireSyntheticSso('synthetic_demo','in-process-test-idp',false)).toThrow();
  expect(()=>requireSyntheticSso('pilot_no_charge','in-process-test-idp',true)).toThrow();
 });
});
