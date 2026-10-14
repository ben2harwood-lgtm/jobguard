import { describe, expect, it, vi } from "vitest";
import { IdentityRepository, SsoRequiredRepository } from "@jobguard/db";
import type { Pool } from "pg";
import { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { SsoRequiredApplication } from "./sso-required.application.js";
import { SsoRequiredController } from "./sso-required.controller.js";
const tenant="10000000-0000-4000-8000-000000000001",user="30000000-0000-4000-8000-000000000003",origin="https://jobguard.invalid";
const input={version:"sso-emergency.v2",commandId:"90000000-0000-4000-8000-000000000009",requested_tenant_id:tenant,email:"owner@fixture.invalid",code:"12345678",reason:"Synthetic IdP unavailable for administrator"};
describe("ENT-10d emergency access",()=>{
 it.each(["no code","invalid code","unknown address","non-member","no permission","switch off","valid administrator"])("[S10a] %s has identical public refusal and issues no session",async kind=>{
  const auth=new PersistedAuthProvider(new IdentityRepository({} as Pool),"fixture-secret-longer-than-thirty-two");
  const mailbox=vi.spyOn(auth,"proveEmergencyMailbox").mockResolvedValue(["no code","invalid code","unknown address"].includes(kind)?undefined:user);
  const repo=new SsoRequiredRepository(auth.repository.pool),refusal=vi.spyOn(repo,"refusal").mockResolvedValue(undefined);
  const use=vi.spyOn(repo,"emergency").mockResolvedValue({used:false,cause:kind==="valid administrator"?"EMERGENCY_APPROVER_RULE_UNSET":"EMERGENCY_REFUSED"});
  const app=new SsoRequiredApplication(auth,repo,origin,"synthetic_demo"),controller=new SsoRequiredController(()=>app);
  const failure=await controller.emergency(kind==="no code"?{...input,code:undefined}:input,{headers:{origin}}).catch(e=>e);
  expect(failure.getStatus()).toBe(403);expect(failure.getResponse()).toEqual({code:"SSO_EMERGENCY_REFUSED"});
  if(kind!=="no code")expect(mailbox).toHaveBeenCalledWith(input.email,input.code);
  expect(refusal).toHaveBeenCalledWith("emergency",kind==="no code"?"EMERGENCY_INPUT_INVALID":["invalid code","unknown address"].includes(kind)?"EMERGENCY_MAILBOX_REFUSED":kind==="valid administrator"?"EMERGENCY_APPROVER_RULE_UNSET":"EMERGENCY_REFUSED");
  if(["no code","invalid code","unknown address"].includes(kind))expect(use).not.toHaveBeenCalled();else expect(use).toHaveBeenCalledWith(user,input);
 });
 it("[S10a] mailbox proof uses latest signin challenge limits and consumes only once without provisioning or verified latch",async()=>{
  const statements:string[]=[],id="80000000-0000-4000-8000-000000000008";
  const client={query:async(sql:string)=>{statements.push(sql);return {rows:sql.includes("identity.user_email")?[{user_id:user}]:[]};},release:()=>undefined};
  const repo=new IdentityRepository({connect:async()=>client} as unknown as Pool),auth=new PersistedAuthProvider(repo,"fixture-secret-longer-than-thirty-two",undefined,"synthetic_demo",()=>1000000);
  const challenge={id,email:input.email,purpose:"signin",invitation_id:null,digest:auth.digest(id+":12345678"),expires_at:new Date(1100000),requested_at:new Date(999000),attempts:0,consumed_at:null as Date|null};
  const latest=vi.spyOn(repo,"latest").mockResolvedValue(challenge);
  expect(await auth.proveEmergencyMailbox(input.email,input.code)).toBe(user);
  expect(statements).toContain("UPDATE identity.challenge SET consumed_at=$2 WHERE id=$1");
  expect(statements.some(sql=>sql.includes("verified")||sql.includes("provision")||sql.includes("identity.session"))).toBe(false);
  for(const changed of [{consumed_at:new Date(999999)},{attempts:5},{expires_at:new Date(1000000)}]){latest.mockResolvedValue({...challenge,...changed});expect(await auth.proveEmergencyMailbox(input.email,input.code)).toBeUndefined();}
  latest.mockResolvedValue(challenge);expect(await auth.proveEmergencyMailbox(input.email,"00000000")).toBeUndefined();
 });
 it("[S10a] bad origin and invalid JSON are uniformly refused before mailbox proof",async()=>{
  const auth=new PersistedAuthProvider(new IdentityRepository({} as Pool),"fixture-secret-longer-than-thirty-two");
  const mailbox=vi.spyOn(auth,"proveEmergencyMailbox"),repo=new SsoRequiredRepository(auth.repository.pool);
  vi.spyOn(repo,"refusal").mockResolvedValue(undefined);
  const app=new SsoRequiredApplication(auth,repo,origin,"synthetic_demo");
  await expect(app.emergency(input,"https://other.invalid")).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});
  await expect(app.emergency(undefined,origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(mailbox).not.toHaveBeenCalled();
 });
});
