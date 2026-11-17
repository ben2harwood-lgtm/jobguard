import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { IdentityRepository, SsoRequiredRepository } from "@jobguard/db";
import { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { SsoRequiredApplication } from "./sso-required.application.js";
import { SsoRequiredController } from "./sso-required.controller.js";
import { ssoEmergencyV2, ssoEmergencyWindowMinutes } from "./sso-required.contracts.js";
const origin="https://jobguard.invalid",tenant=randomUUID(),user=randomUUID();
const input=()=>({version:"sso-emergency.v2",requested_tenant_id:tenant,commandId:randomUUID(),email:"owner@fixture.invalid",code:"0".repeat(8),reason:"Synthetic owner requests emergency access"});
function fixture(minutes?:number|"invalid") {
 const auth=new PersistedAuthProvider(new IdentityRepository({} as Pool),"s".repeat(40));
 const mailbox=vi.spyOn(auth,"proveEmergencyMailbox").mockResolvedValue(user);
 const repo=new SsoRequiredRepository(auth.repository.pool);
 const refusal=vi.spyOn(repo,"refusal").mockResolvedValue(undefined);
 const emergency=vi.spyOn(repo,"emergency").mockResolvedValue({used:false,cause:"EMERGENCY_NOT_OWNER"});
 const app=new SsoRequiredApplication(auth,repo,origin,"synthetic_demo",minutes);
 return {auth,mailbox,repo,refusal,emergency,app,controller:new SsoRequiredController(()=>app)};
}
afterEach(()=>vi.restoreAllMocks());
describe("ENT-10e owner emergency boundary",()=>{
 it("[T1] setting defaults, bounds and invalid values are exact",()=>{
  for(const raw of [undefined,""])expect(ssoEmergencyWindowMinutes(raw)).toBe(60);
  for(const raw of ["15","60","240"])expect(ssoEmergencyWindowMinutes(raw)).toBe(Number(raw));
  for(const raw of ["14","241","0","-60","60.5","1e2"," 60","060 ","forever","Infinity","1000",60,null,{},true])expect(ssoEmergencyWindowMinutes(raw)).toBe("invalid");
  expect(ssoEmergencyV2.safeParse({...input(),windowMinutes:60}).success).toBe(false);
 });
 it.each([undefined,"invalid"] as const)("[T1] service setting %s sends null through the real repository",async minutes=>{
  const f=fixture(minutes),payloads:unknown[]=[];
  const query=vi.fn(async(sql:string,params?:unknown[])=>{if(sql.includes("sso_emergency_use")){payloads.push(JSON.parse(params![1] as string));return {rows:[{result:{used:false,cause:"EMERGENCY_WINDOW_INVALID"}}]};}return {rows:[]};});
  f.emergency.mockRestore();
  const repo=new SsoRequiredRepository({connect:async()=>({query,release:()=>undefined})} as unknown as Pool);
  vi.spyOn(repo,"refusal").mockResolvedValue(undefined);
  const app=new SsoRequiredApplication(f.auth,repo,origin,"synthetic_demo",minutes),raw=input();
  await expect(app.emergency(raw,origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});
  expect(payloads).toEqual([{version:raw.version,requested_tenant_id:tenant,commandId:raw.commandId,windowMinutes:null,reason:raw.reason}]);
 });
 it.each(["admin","operative","supervisor","surveyor","commercial_manager","finance","read_only","client_approver"])("[E1] %s receives the identical refusal for database non-owner facts",async()=>{
  const f=fixture(60),http=await f.controller.emergency(input(),{headers:{origin}}).catch(e=>e);
  expect(http.getStatus()).toBe(403);expect(http.getResponse()).toEqual({code:"SSO_EMERGENCY_REFUSED"});
  expect(f.refusal).toHaveBeenCalledExactlyOnceWith("emergency","EMERGENCY_NOT_OWNER");
 });
 it("[E3] owner success returns the recorded closing time and minutes without a session",async()=>{
  const f=fixture(60),closesAt="2026-10-13T21:00:00.123456Z";
  f.emergency.mockResolvedValue({used:true,cause:"EMERGENCY_USED",connectionId:randomUUID(),actorMembershipId:randomUUID(),eventId:randomUUID(),windowMinutes:60,closesAt});
  const raw=input();
  expect(await f.app.emergency(raw,origin)).toEqual({version:"sso-emergency-response.v2",environment:"synthetic_demo",required:false,requiredAgainAt:closesAt,windowMinutes:60});
  expect(f.emergency).toHaveBeenCalledExactlyOnceWith(user,raw,60);expect(f.refusal).not.toHaveBeenCalled();
 });
 it("[E5] single-use mailbox proof refuses the second command before SQL",async()=>{
  const f=fixture(60);f.mailbox.mockResolvedValueOnce(user).mockResolvedValueOnce(undefined);
  const raw=input();await expect(f.app.emergency(raw,origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});
  await expect(f.app.emergency(raw,origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});
  expect(f.emergency).toHaveBeenCalledTimes(1);expect(f.refusal).toHaveBeenLastCalledWith("emergency","EMERGENCY_MAILBOX_REFUSED");
 });
 it("[E9] every cause, retired v1 input and failed refusal audit have one code-only public answer",async()=>{
  for(const kind of ["no code","invalid code","unknown address","non-member","not owner","switch off","window open","replayed","invalid setting","retired v1","audit failure"]) {
   const f=fixture(kind==="invalid setting"?"invalid":60),raw=input();
   if(["invalid code","unknown address"].includes(kind))f.mailbox.mockResolvedValue(undefined);
   if(kind==="audit failure")f.refusal.mockRejectedValue(new Error("Audit unavailable"));
   const body=kind==="no code"?{...raw,code:undefined}:kind==="retired v1"?{...raw,version:"sso-emergency.v1"}:raw;
   f.emergency.mockResolvedValue({used:false,cause:kind==="replayed"?"EMERGENCY_COMMAND_REPLAYED":kind==="window open"?"EMERGENCY_ALREADY_USED":kind==="switch off"?"EMERGENCY_SWITCH_OFF":kind==="invalid setting"?"EMERGENCY_WINDOW_INVALID":"EMERGENCY_NOT_OWNER"});
   const http=await f.controller.emergency(body,{headers:{origin}}).catch(e=>e);
   expect(http.getStatus()).toBe(403);expect(http.getResponse()).toEqual({code:"SSO_EMERGENCY_REFUSED"});
   if(["no code","retired v1"].includes(kind))expect(f.mailbox).not.toHaveBeenCalled();
  }
 });
 it("[T1] repository refuses incomplete or extra success fields and accepts exact v2 result",async()=>{
  const raw=input(),valid={used:true,cause:"EMERGENCY_USED",connectionId:randomUUID(),actorMembershipId:randomUUID(),eventId:randomUUID(),windowMinutes:60,closesAt:"2026-10-13T21:00:00.000001Z"};
  for(const result of [{...valid,eventId:undefined},{...valid,closesAt:undefined},{...valid,windowMinutes:undefined},{...valid,unknown:true},{used:false,cause:"EMERGENCY_REFUSED",eventId:randomUUID()}]){
   const query=async(sql:string)=>({rows:sql.includes("sso_emergency_use")?[{result}]:[]});
   const repo=new SsoRequiredRepository({connect:async()=>({query,release:()=>undefined})} as unknown as Pool);
   await expect(repo.emergency(user,raw,60)).rejects.toThrow();
  }
 });
});
