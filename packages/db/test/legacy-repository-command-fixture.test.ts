import type { Pool } from "pg";
import { practiceMaterialPool } from "../src/practice-session.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { expect,it,vi } from "vitest";
import type { TenantTransaction } from "../src/tenant-context.js";
import { historicalRepositorySchema,legacyRepositoryCommandModule } from "./legacy-repository-command-fixture.js";
it("uses the historical protocol only when every LP-5 lifecycle marker is absent",async()=>{
 for(let mask=0;mask<32;mask++){
  const row=Object.fromEntries(["begin_installed","complete_installed","claims_installed","registry_installed","guard_installed"].map((key,i)=>[key,!!(mask&(1<<i))]));
  const client={query:async()=>({rows:[row]})} as unknown as TenantTransaction["$client"];
  expect(await historicalRepositorySchema(client),`schema markers ${mask}`).toBe(mask===0);
 }
});
it("current and damaged schemas keep production refusal instead of falling back to raw receipt SQL",async()=>{
 for(const row of [{begin_installed:true,complete_installed:true,claims_installed:true,registry_installed:true,guard_installed:true},
  {begin_installed:false,complete_installed:false,claims_installed:false,registry_installed:false,guard_installed:true}]){
  const query=vi.fn(async()=>({rows:[row]})),failure=new Error("production refuses damaged schema");
  const begin=vi.fn(async()=>{throw failure;}),complete=vi.fn(async()=>{throw failure;});
  const actual={beginRepositoryCommand:begin,completeRepositoryCommand:complete} as unknown as typeof import("../src/repository-command.js");
  const routed=legacyRepositoryCommandModule(actual),db={$client:{query}} as unknown as TenantTransaction;
  await expect(routed.beginRepositoryCommand(db,{tenantId:"t",actorMembershipId:"a",commandId:"c",commandType:"unknown",semanticKey:"s",jobId:"j",legacyJson:"{}"})).rejects.toBe(failure);
  await expect(routed.completeRepositoryCommand(db,"c")).rejects.toBe(failure);
  expect(begin).toHaveBeenCalledOnce();expect(complete).toHaveBeenCalledOnce();
  expect(query.mock.calls).toHaveLength(2);
 }
});

it.each([["COMMIT",false],["ROLLBACK",false],["COMMIT",true],["ROLLBACK",true]] as const)("keeps the physical query intact and restores the transaction handle after %s (throws=%s)",async(terminal,throws)=>{
 const original=vi.fn(async(sql:string)=>{
  if(sql.includes("AS begin_installed"))return {rows:[{begin_installed:false,complete_installed:false,claims_installed:false,registry_installed:false,guard_installed:false}]};
  if(sql.startsWith("SELECT 1 FROM app.membership"))return {rows:[{}],rowCount:1};
  if(sql.startsWith("INSERT INTO app.command_receipt"))return {rows:[{command_id:"c"}],rowCount:1};
  if(sql===terminal&&throws)throw new Error("synthetic terminal failure");
  return {rows:[],rowCount:0};
 });
 const client={query:original},db={$client:client} as unknown as TenantTransaction;
 const actual={beginRepositoryCommand:vi.fn(),completeRepositoryCommand:vi.fn()} as unknown as typeof import("../src/repository-command.js");
 const routed=legacyRepositoryCommandModule(actual);
 expect(await routed.beginRepositoryCommand(db,{tenantId:"t",actorMembershipId:"a",commandId:"c",commandType:"LogSiteExtra",semanticKey:"s",jobId:"j",legacyJson:"{}"})).toEqual({kind:"claim"});
 expect(client.query).toBe(original);
 expect(db.$client).not.toBe(client);
 expect(db.$client.query).not.toBe(original);
 if(throws)await expect(db.$client.query(terminal)).rejects.toThrow("synthetic terminal failure");else await db.$client.query(terminal);
 expect(client.query).toBe(original);
 expect(db.$client).toBe(client);
 expect(actual.beginRepositoryCommand).not.toHaveBeenCalled();
});

it("observes checked results once through the actual practice pool across pooled transactions without recursion",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const result={requestId:"fictional-request",state:"awaiting_approval"};
 const original=vi.fn(async(sql:string)=>{
  if(sql.includes("AS begin_installed"))return {rows:[{begin_installed:false,complete_installed:false,claims_installed:false,registry_installed:false,guard_installed:false}]};
  if(sql.startsWith("SELECT 1 FROM app.membership"))return {rows:[{}],rowCount:1};
  if(sql.startsWith("INSERT INTO app.command_receipt"))return {rows:[{}],rowCount:1};
  if(sql.startsWith("SELECT app.xa_submit("))return {rows:[{r:result}],rowCount:1};
  return {rows:[],rowCount:0};
 });
 const physical={query:original,release:vi.fn()},pool={connect:async()=>physical} as unknown as Pool;
 const scoped=practiceMaterialPool(pool,"a".repeat(64));
 const actual={beginRepositoryCommand:vi.fn(),completeRepositoryCommand:vi.fn()} as unknown as typeof import("../src/repository-command.js");
 const routed=legacyRepositoryCommandModule(actual),context=testTenantContext("11111111-1111-4111-8111-111111111111");
 try{
  for(let transaction=0;transaction<2;transaction++)await withTenant(scoped,context,async db=>{
   let observer:unknown;
   for(const commandId of ["first","second"]){
    expect(await routed.beginRepositoryCommand(db,{tenantId:context.tenantId,actorMembershipId:"a",commandId,commandType:"SubmitExtra",semanticKey:commandId,jobId:"j",legacyJson:"{}"})).toEqual({kind:"claim"});
    if(observer)expect(db.$client.query).toBe(observer);observer=db.$client.query;
    expect(physical.query).toBe(original);
    await db.$client.query("SELECT app.xa_submit($1,$2,$3,$4) r",["j","v",commandId,"a"]);
    expect(await routed.completeRepositoryCommand(db,commandId)).toEqual(result);
   }
  });
  expect(physical.query).toBe(original);expect(physical.release).toHaveBeenCalledTimes(2);
  expect(original.mock.calls.filter(([sql])=>sql==="BEGIN")).toHaveLength(2);
  expect(original.mock.calls.filter(([sql])=>sql==="COMMIT")).toHaveLength(2);
  expect(original.mock.calls.filter(([sql])=>sql.includes("app.practice_material_digest"))).toHaveLength(2);
  expect(original.mock.calls.filter(([sql])=>sql.startsWith("SELECT app.xa_submit("))).toHaveLength(4);
  expect(actual.beginRepositoryCommand).not.toHaveBeenCalled();
 }finally{vi.unstubAllEnvs();}
});
