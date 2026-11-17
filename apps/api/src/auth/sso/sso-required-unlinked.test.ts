import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { IdentityRepository, SsoRequiredRepository, ssoRequiredStateV1, ssoRequiredDetailV1 } from "@jobguard/db";
import { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { SsoRequiredApplication } from "./sso-required.application.js";
import { SsoRequiredController } from "./sso-required.controller.js";
import { SsoRequiredError, ssoRequiredCodes, ssoRequiredStatus, ssoRequiredDetailViewV1, ssoEmergencyV2 } from "./sso-required.contracts.js";
const origin="https://jobguard.invalid",tenant=randomUUID(),member=randomUUID(),user=randomUUID(),connection=randomUUID();
const raw={version:"sso-required-detail-view.v1",requested_tenant_id:tenant};
const unlinked={total:1,truncated:false,members:[{membershipId:randomUUID(),email:"unlinked@fixture.invalid",role:"finance",kind:"never_linked" as const}]};
const detail={version:"sso-required-detail.v1" as const,environment:"synthetic_demo" as const,tenantId:tenant,required:false,revision:0,emergencyWindow:null,unlinked,pendingInvitations:[]};
const command={version:"sso-required-command.v1",requested_tenant_id:tenant,required:true,expectedRevision:0,reason:"Synthetic owner enables SSO requirement"};
function fixture(mode:"synthetic_demo"|"pilot_no_charge"|"production"|undefined="synthetic_demo") {
 const auth=new PersistedAuthProvider(new IdentityRepository({} as Pool),"s".repeat(40)),repo=new SsoRequiredRepository(auth.repository.pool);
 const app=new SsoRequiredApplication(auth,repo,origin,mode as never),credentials={sessionToken:"t".repeat(43),csrfToken:"c".repeat(32),origin};
 vi.spyOn(app.provider,"authenticate").mockResolvedValue({sessionId:randomUUID(),identityUserId:user,csrfToken:credentials.csrfToken});
 vi.spyOn(app.provider,"findMembership").mockResolvedValue({id:member,identityUserId:user,tenantId:tenant,role:"owner",email:"owner@fixture.invalid"});
 vi.spyOn(repo.enterprise,"sessionScope").mockResolvedValue({tenantId:tenant,membershipId:member,connectionId:connection});
 const read=vi.spyOn(repo,"detail").mockResolvedValue(detail),refusal=vi.spyOn(repo,"refusal").mockResolvedValue(undefined);
 const write=vi.spyOn(repo,"command").mockRejectedValue(new Error("SSO_REQUIRED_UNLINKED_MEMBERS"));
 return {auth,repo,app,credentials,read,refusal,write,controller:new SsoRequiredController(()=>app)};
}
afterEach(()=>vi.restoreAllMocks());
describe("ENT-10e not-yet-linked projection",()=>{
 it("[L1] unlinked refusal reads detail once after rollback and refusal audit",async()=>{
  const f=fixture(),events:string[]=[];
  f.write.mockImplementation(async()=>{events.push("rolled back");throw new Error("SSO_REQUIRED_UNLINKED_MEMBERS");});
  f.refusal.mockImplementation(async()=>{events.push("audited");});f.read.mockImplementation(async()=>{events.push("detail");return detail;});
  const http=await f.controller.command(command,{headers:{cookie:`jobguard_session=${f.credentials.sessionToken}`,"x-csrf-token":f.credentials.csrfToken,origin}}).catch(e=>e);
  expect(http.getStatus()).toBe(409);expect(http.getResponse()).toEqual({code:"SSO_REQUIRED_UNLINKED_MEMBERS",unlinked});
  expect(events).toEqual(["rolled back","audited","detail"]);expect(f.read).toHaveBeenCalledTimes(1);
  expect(await f.app.detail(raw,f.credentials)).toEqual(detail);
 });
 it("[L3] role, wrong company, signed-out and ordinary required-session refusals list nothing",async()=>{
  for(const kind of ["no permission","other company","signed out","ordinary required session"]) {
   const f=fixture();
   if(kind==="no permission")f.read.mockRejectedValue(new Error("SSO_FORBIDDEN"));
   if(kind==="other company"||kind==="ordinary required session")vi.spyOn(f.app.provider,"findMembership").mockResolvedValue(undefined);
   if(kind==="signed out")vi.spyOn(f.app.provider,"authenticate").mockResolvedValue(undefined);
   const http=await f.controller.detail(raw,{headers:{cookie:`jobguard_session=${f.credentials.sessionToken}`,"x-csrf-token":f.credentials.csrfToken,origin}}).catch(e=>e);
   expect(http.getStatus()).toBe(403);expect(http.getResponse()).toEqual({code:"SSO_REQUIRED_FORBIDDEN"});expect(f.refusal).toHaveBeenCalledTimes(1);
  }
 });
 it("[L3] synthetic gate precedes authentication for all unavailable modes",async()=>{
  for(const mode of ["pilot_no_charge","production",undefined] as const) {
   const f=fixture();const app=new SsoRequiredApplication(f.auth,f.repo,origin,mode as never),authenticate=vi.spyOn(app.provider,"authenticate");
   await expect(app.detail(raw,{})).rejects.toMatchObject({code:"SSO_ROUTE_BLOCKED"});expect(authenticate).not.toHaveBeenCalled();expect(f.read).not.toHaveBeenCalled();
  }
 });
 it("[L6] failed detail preserves 409 code-only refusal, audited exactly once",async()=>{
  const f=fixture();f.read.mockRejectedValue(new Error("Detail unavailable"));
  const error=await f.app.command(command,f.credentials).catch(e=>e);
  expect(error.code).toBe("SSO_REQUIRED_UNLINKED_MEMBERS");expect(error.unlinked).toBeUndefined();expect(f.refusal).toHaveBeenCalledExactlyOnceWith(connection,error.code);
  const controller=new SsoRequiredController(()=>({command:async()=>{throw error;}} as unknown as SsoRequiredApplication));
  const http=await controller.command(command,{headers:{}}).catch(e=>e);expect(http.getStatus()).toBe(409);expect(http.getResponse()).toEqual({code:error.code});
  expect(f.write).toHaveBeenCalledTimes(1);expect(f.read).toHaveBeenCalledTimes(1);
 });
 it("[L6] every other code retains its sole status and code-only body",async()=>{
  for(const code of ssoRequiredCodes) {
   const error=new SsoRequiredError(code);const controller=new SsoRequiredController(()=>({command:async()=>{throw error;}} as unknown as SsoRequiredApplication));
   const http=await controller.command({}, {headers:{}}).catch(e=>e);expect(http.getStatus()).toBe(ssoRequiredStatus(error).status);expect(http.getResponse()).toEqual({code});
  }
 });
 it("[L7] strict schemas accept minimal inputs and refuse unknown keys; state retains exactly seven fields",()=>{
  const emergency={version:"sso-emergency.v2",requested_tenant_id:tenant,commandId:randomUUID(),email:"owner@fixture.invalid",code:"0".repeat(8),reason:command.reason};
  for(const [schema,input] of [[ssoRequiredDetailViewV1,raw],[ssoEmergencyV2,emergency],[ssoRequiredDetailV1,detail]] as const){expect(schema.safeParse(input).success).toBe(true);expect(schema.safeParse({...input,unknown:true}).success).toBe(false);}
  for(const changed of [{...detail,unlinked:{...unlinked,unknown:true}},{...detail,unlinked:{...unlinked,members:[{...unlinked.members[0],unknown:true}]}}])expect(ssoRequiredDetailV1.safeParse(changed).success).toBe(false);
  expect(Object.keys(ssoRequiredStateV1.shape).sort()).toEqual(["auditConnectionId","environment","required","revision","tenantId","unlinkedMembers","version"]);
 });
});
