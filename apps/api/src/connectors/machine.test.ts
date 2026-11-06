import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ExecutionContext } from "@nestjs/common";
import { describe, it, expect, vi } from "vitest";
import { ApplicationAuthGuard } from "../auth/application-auth.guard.js";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { FictionalMachineConnection, MACHINE_PATH, machineSigningBytes, type MachineRequest, type MachineAuthority } from "./machine.js";
import { FictionalMachineController } from "./machine.controller.js";
const key = Buffer.alloc(32, 8), now = 1_794_000_000_000;
const body = Buffer.from(JSON.stringify({version:"connector-input.v1",eventId:"fixture:event",subject:"fixture:order",revision:1,kind:"work_order",document:"fixture:doc"}));
function fixture() {
  const tenantId = randomUUID(), connectionId = randomUUID();
  const authority: MachineAuthority = {tenantId,environment:"synthetic_demo",clientContract:"fixture:client",machineActor:randomUUID(),capabilityVersion:1,capabilities:["work_order"],keyRefs:["fixture:key"]};
  const h: MachineRequest = {version:"connector-machine-signature.v1",connectionId,tenantId,environment:"synthetic_demo",clientContract:"fixture:client",keyRef:"fixture:key",timestamp:String(now/1000),nonce:"fictional_nonce_0001",signature:""};
  const sign = (bytes = body) => { h.signature = createHmac("sha256",key).update(machineSigningBytes(h,bytes)).digest("hex"); return h; };
  const store = {authority:vi.fn(async()=>authority),stage:vi.fn(async()=>({state:"staged",domainEffects:0}))};
  const service = new FictionalMachineConnection(store,{token:async()=>"fictional-db-token",key:async()=>key},()=>now);
  return {authority,h,sign,store,service};
}
describe("ENT-13a machine transport attacks",()=>{
  it("accepts a signed fixture through the persisted authority/stage boundary",async()=>{
    const f=fixture(); await expect(f.service.receive("POST",MACHINE_PATH,f.sign(),body)).resolves.toEqual({state:"staged",domainEffects:0});
    expect(f.store.stage).toHaveBeenCalledOnce();
  });
  it.each(["signature","old","tenant","environment","contract","capability","body","oversize","method","path","nonce_newline","timestamp_newline"])("refuses %s before staging",async attack=>{
    const f=fixture(); f.sign(); let bytes=body,method="POST",path=MACHINE_PATH;
    if(attack==="nonce_newline"){f.h.nonce+="\n";f.sign();}
    if(attack==="timestamp_newline"){f.h.timestamp+="\n";f.sign();}
    if(attack==="signature")f.h.signature="0".repeat(64);
    if(attack==="old"){f.h.timestamp=String(now/1000-301);f.sign();}
    if(attack==="tenant"){f.h.tenantId=randomUUID();f.sign();}
    if(attack==="environment")Object.assign(f.h,{environment:"production"});
    if(attack==="contract"){f.h.clientContract="fixture:other";f.sign();}
    if(attack==="capability")f.authority.capabilities=["billing_status"];
    if(attack==="body")bytes=Buffer.from("{}");
    if(attack==="oversize")bytes=Buffer.alloc(1_048_577);
    if(attack==="method")method="GET";
    if(attack==="path")path+="?alias=1";
    await expect(f.service.receive(method,path,f.h,bytes)).rejects.toMatchObject({code:"CONNECTOR_INPUT_REFUSED"});
    expect(f.store.stage).not.toHaveBeenCalled();
  });
  it.each([-300,300])("accepts inclusive clock boundary %s",async offset=>{
    const f=fixture();f.h.timestamp=String(now/1000+offset);
    await expect(f.service.receive("POST",MACHINE_PATH,f.sign(),body)).resolves.toMatchObject({state:"staged"});
  });
  it.each(["revoked","expired","replay"])("sanitises persisted %s refusal",async reason=>{
    const f=fixture(); if(reason==="replay")f.store.stage.mockRejectedValue(new Error("secret database detail"));
    else f.store.authority.mockRejectedValue(new Error("secret database detail"));
    await expect(f.service.receive("POST",MACHINE_PATH,f.sign(),body)).rejects.toThrow("Connector input refused");
  });
  it("controller requires raw bytes and exact path without opening a listener",async()=>{
    const f=fixture(),controller=new FictionalMachineController(f.service);
    await expect(controller.intake({method:"POST",originalUrl:MACHINE_PATH,headers:{"x-connector-machine":JSON.stringify(f.sign())},rawBody:body})).resolves.toMatchObject({state:"staged"});
    await expect(controller.intake({method:"POST",originalUrl:MACHINE_PATH,headers:{}})).rejects.toThrow();
  });
  it("refuses machine credentials on every documented route even with a practice cookie",async()=>{
    const paths=JSON.parse(readFileSync(new URL("../../openapi.json",import.meta.url),"utf8")).paths as Record<string,Record<string,unknown>>;
    const application=vi.fn(); const guard=new ApplicationAuthGuard(application);
    for(const [path,operations] of Object.entries(paths))for(const method of Object.keys(operations)){
      if(!["get","post","put","patch","delete"].includes(method))continue;
      const req={path,method:method.toUpperCase(),headers:{"x-connector-machine":"{}",cookie:`jg_session=${randomUUID()}`}};
      const context={switchToHttp:()=>({getRequest:()=>req})} as ExecutionContext;
      await expect(guard.canActivate(context)).rejects.toThrow();
      await expect(new TenantAuthGuard({} as never,"https://fixture.invalid").canActivate(context)).rejects.toThrow();
    }
    expect(application).not.toHaveBeenCalled();
  });
});
