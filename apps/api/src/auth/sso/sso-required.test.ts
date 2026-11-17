import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { EnterpriseIdentityRepository, IdentityRepository, SsoRequiredRepository } from "@jobguard/db";
import { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { createWorkspaceApplication } from "../../workspace/application.js";
import { IdentityApplication } from "../identity.application.js";
import { SsoRequiredApplication } from "./sso-required.application.js";
import { SsoRequiredController } from "./sso-required.controller.js";
import { SsoRequiredError, ssoRequiredCommandV1, ssoRequiredViewV1, ssoEmergencyV1, ssoRequiredCodes, ssoRequiredStatus } from "./sso-required.contracts.js";
const tenant="10000000-0000-4000-8000-000000000001", origin="https://jobguard.invalid";
const command={version:"sso-required-command.v1",requested_tenant_id:tenant,required:true,expectedRevision:0,reason:"Synthetic administrator switches SSO on"};
describe("ENT-10d contracts and administration",()=>{
 it("[S13] strict versioned inputs accept minimal valid values and reject every unknown key",()=>{
  for(const [schema,input] of [[ssoRequiredCommandV1,command],[ssoRequiredViewV1,{version:"sso-required-view.v1",requested_tenant_id:tenant}],[ssoEmergencyV1,{version:"sso-emergency.v1",requested_tenant_id:tenant,email:"owner@fixture.invalid",code:"12345678",reason:command.reason}]] as const) {
   expect(schema.safeParse(input).success).toBe(true);
   expect(schema.safeParse({...input,tenant_id:tenant}).success).toBe(false);
   expect(schema.safeParse({...input,version:"invalid"}).success).toBe(false);
  }
  for(const input of [{...command,reason:"short"},{...command,expectedRevision:-1},{...command,expectedRevision:0.5},{...command,required:"true"}])expect(ssoRequiredCommandV1.safeParse(input).success).toBe(false);
 });
 it("[S13] every closed error maps to exactly one HTTP status and controller bodies carry code only",async()=>{
  const expected=[400,403,409,409,409,409,403,403,503];
  for(const [index,code] of ssoRequiredCodes.entries()) {
   const error=new SsoRequiredError(code,{cause:new Error("private diagnostic")});
   expect(ssoRequiredStatus(error)).toEqual({code,status:expected[index]});
   const application={command:async()=>{throw error;}} as unknown as SsoRequiredApplication;
   const failure=await new SsoRequiredController(()=>application).command(command,{headers:{}}).catch(e=>e);
   expect(failure.getResponse()).toEqual({code});expect(failure.getStatus()).toBe(expected[index]);
  }
  expect(ssoRequiredStatus(new Error("private"))).toEqual({code:"SSO_REQUIRED_UNAVAILABLE",status:503});
 });
 it("[S6g] synthetic gate precedes authentication in view, command and emergency, including missing mode",async()=>{
  for(const mode of ["pilot_no_charge","production",undefined]) {
   const auth=new PersistedAuthProvider(new IdentityRepository({} as Pool),"fixture-secret-longer-than-thirty-two");
   const authenticate=vi.spyOn(auth,"authenticate"), mailbox=vi.spyOn(auth,"proveEmergencyMailbox");
   const repository=new SsoRequiredRepository(auth.repository.pool);
   vi.spyOn(repository,"refusal").mockResolvedValue(undefined);
   const app=new SsoRequiredApplication(auth,repository,origin,mode as never);
   await expect(app.view({version:"sso-required-view.v1",requested_tenant_id:tenant},{})).rejects.toMatchObject({code:"SSO_ROUTE_BLOCKED"});
   await expect(app.command(command,{})).rejects.toMatchObject({code:"SSO_ROUTE_BLOCKED"});
   await expect(app.emergency({},origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});
   expect(authenticate).not.toHaveBeenCalled();expect(mailbox).not.toHaveBeenCalled();
  }
 });
 it("[S6a] both composition seams register the same service with a required server mode",()=>{
  const saved=process.env.JOBGUARD_ENV;
  try {
   process.env.JOBGUARD_ENV="synthetic_demo";
   const pool={} as Pool, identity=new IdentityApplication(new PersistedAuthProvider(new IdentityRepository(pool),"fixture-secret-longer-than-thirty-two"),origin);
   expect(createWorkspaceApplication({pool,identity}).ssoRequired).toBeInstanceOf(SsoRequiredApplication);
  }finally{if(saved===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=saved;}
 });
 it.each(["SSO_REQUIRED_FORBIDDEN","SSO_REQUIRED_NEEDS_SSO_SESSION","SSO_REQUIRED_NO_CONNECTION","SSO_REQUIRED_UNLINKED_MEMBERS","STALE_SSO_REQUIRED"] as const)("[S6] SQL refusal %s rolls back work and audits the server-derived connection",async code=>{
  const principal={sessionId:"40000000-0000-4000-8000-000000000004",identityUserId:"30000000-0000-4000-8000-000000000003",csrfToken:"c".repeat(32)};
  const connection="60000000-0000-4000-8000-000000000006", effects:string[]=[];
  const pool={query:async(sql:string)=> {
   if(sql.includes("sso_session_scope"))return {rows:[{scope:{tenantId:tenant,membershipId:"50000000-0000-4000-8000-000000000005",connectionId:connection}}]};
   if(sql.includes("SELECT id,user_id,csrf_token"))return {rows:[{id:principal.sessionId,user_id:principal.identityUserId,csrf_token:principal.csrfToken}]};
   throw new Error(sql);
  }} as unknown as Pool;
  const auth=new PersistedAuthProvider(new IdentityRepository(pool),"fixture-secret-longer-than-thirty-two");
  vi.spyOn(auth.repository,"memberships").mockResolvedValue([{id:"50000000-0000-4000-8000-000000000005",identity_user_id:principal.identityUserId,tenant_id:tenant,role:"owner",email:"owner@fixture.invalid",name:"Synthetic"}]);
  const repo=new SsoRequiredRepository(pool);
  vi.spyOn(repo,"command").mockImplementation(async()=>{effects.push("rolled back");throw new Error(code);});
  const refusal=vi.spyOn(repo,"refusal").mockImplementation(async()=>{effects.push("audited");});
  const app=new SsoRequiredApplication(auth,repo,origin,"synthetic_demo");
  await expect(app.command(command,{sessionToken:"opaque-session-token-with-at-least-32",csrfToken:principal.csrfToken,origin})).rejects.toMatchObject({code});
  expect(effects).toEqual(["rolled back","audited"]);expect(refusal).toHaveBeenCalledWith(connection,code);
 });
});
