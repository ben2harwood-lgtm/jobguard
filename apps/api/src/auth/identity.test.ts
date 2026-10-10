import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { syntheticSessionAllowed } from "./synthetic-session.js";
import { FixtureIdentityEmail } from "./identity-email.js";
import { ApplicationAuthGuard } from "./application-auth.guard.js";
import { identityCookieOptions, identityStatus } from "./identity-http.js";
import { identityRequestV1, identityVerifyV1 } from "./identity.application.js";
import { parseIdentityEnvironment } from "@jobguard/config";

describe("M0-6L route, cookie and server composition boundaries",()=>{
 it("blocks every real recipient and every non-synthetic email route pending D04",async()=>{
  const adapter=new FixtureIdentityEmail();
  for(const mode of ["synthetic_demo","pilot_no_charge","production"])expect(()=>adapter.assertRecipient("person@example.com",mode)).toThrow("D04");
  for(const mode of ["pilot_no_charge","production",""])expect(()=>adapter.assertRecipient("person@practice.invalid",mode)).toThrow("D04");
  await expect(adapter.deliver({version:"identity-email.v1",category:"identity_challenge",environment:"synthetic_demo",challengeId:"10000000-0000-4000-8000-000000000001",email:"person@practice.invalid",code:"12345678"})).resolves.toEqual({environment:"synthetic_demo",externalActions:0});
  await expect(adapter.deliver({version:"identity-email.v1",category:"quote",environment:"synthetic_demo",challengeId:"10000000-0000-4000-8000-000000000001",email:"person@practice.invalid",code:"12345678"})).rejects.toThrow();
 });
 it("accepts neither elevated signup roles nor a business credential; cookies stay Secure on HTTP too",()=>{
  expect(identityCookieOptions).toMatchObject({secure:true,httpOnly:true,sameSite:"strict",path:"/"});
  expect(()=>identityRequestV1.parse({version:"identity-request.v1",email:"builder@practice.invalid",purpose:"signup",role:"admin"})).toThrow();
  expect(()=>identityVerifyV1.parse({version:"identity-verify.v1",email:"builder@practice.invalid",purpose:"signup",code:"12345678",requested_tenant_id:"10000000-0000-4000-8000-000000000001"})).toThrow();
  expect(()=>parseIdentityEnvironment({JOBGUARD_ENV:"synthetic_demo",IDENTITY_DATABASE_URL:"postgresql://jobguard_runtime:fixture@localhost/jobguard",AUTH_CODE_SECRET:"a".repeat(32),AUTH_ALLOWED_ORIGIN:"https://jobguard.invalid"})).toThrow();
  expect(identityStatus(new Error("a sensitive provider response"))).toEqual({code:"IDENTITY_UNAVAILABLE",status:503});
 });
 it("registers the Nest guard and refuses synthetic cookies in every other mode",async()=>{
  const module=await readFile(new URL("../app.module.ts",import.meta.url),"utf8");expect(module).toContain("provide:APP_GUARD,useClass:ApplicationAuthGuard");
  const guard=new ApplicationAuthGuard(()=>{throw new Error("identity configuration unavailable");});
  const request={path:"/jobs/capture",headers:{cookie:"jg_session=b690f3c7-0d23-4c83-bca2-5f60ce9a0f19"}};
  const context={switchToHttp:()=>({getRequest:()=>request})} as ExecutionContext;
  expect(syntheticSessionAllowed("b690f3c7-0d23-4c83-bca2-5f60ce9a0f19","synthetic_demo")).toBe(true);
  for(const mode of ["pilot_no_charge","production",undefined])expect(syntheticSessionAllowed("b690f3c7-0d23-4c83-bca2-5f60ce9a0f19",mode)).toBe(false);
  const saved=process.env.JOBGUARD_ENV;
  try {
   for(const mode of ["pilot_no_charge","production",""]){process.env.JOBGUARD_ENV=mode;await expect(guard.canActivate(context)).rejects.toMatchObject({status:401});}
   process.env.JOBGUARD_ENV="synthetic_demo";expect(await guard.canActivate(context)).toBe(true);
   request.headers.cookie="";await expect(guard.canActivate(context)).rejects.toMatchObject({status:401});
  }finally{if(saved===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=saved;}
 });
 it("keeps practice mode guards ahead of cookies, pools and authenticated workspace work",async()=>{
  const {runInNewContext}=await import("node:vm");
  const {transpileModule,ModuleKind}=await import("typescript");
  const pool=vi.fn(), authenticate=vi.fn(), workspace=vi.fn(), cookie=vi.fn(async()=>({get:()=>({value:"b690f3c7-0d23-4c83-bca2-5f60ce9a0f19"})}));
  const adapters:Record<string,unknown>={"server-only":{},"next/headers":{cookies:cookie},"next/server":{NextResponse:{json:Response.json}},"@jobguard/db":{authenticatePracticeSession:authenticate},"@jobguard/api/workspace":{createWorkspaceApplication:workspace},"pg":{Pool:pool}};
  const environment:Record<string,string|undefined>={DATABASE_URL:"postgresql://fixture.invalid/synthetic"};
  const load=async(path:string)=>{
   const exports:Record<string,any>={};
   const js=transpileModule(await readFile(new URL(`../../../web/app/${path}`,import.meta.url),"utf8"),{compilerOptions:{module:ModuleKind.CommonJS}}).outputText;
   runInNewContext(js,{exports,require:(id:string)=>{if(!(id in adapters))throw new Error(`Unexpected practice import: ${id}`);return adapters[id]},Response,process:{env:environment}});
   return exports;
  };
  const synthetic=await load("lib/synthetic-server.ts");
  adapters["./synthetic-server"]=synthetic;
  adapters["../../lib/synthetic-server"]=synthetic;
  const requestWorkspace=await load("lib/workspace-server.ts");
  const session=await load("api/session/route.ts");
  // Shape checks grant no authority. Actual adapters refuse this well-formed bearer in every non-practice mode.
  expect(synthetic.hasSyntheticSession("b690f3c7-0d23-4c83-bca2-5f60ce9a0f19")).toBe(true);
  for(const token of [undefined,"","not-a-session"])expect(synthetic.hasSyntheticSession(token)).toBe(false);
  for(const mode of ["pilot_no_charge","production",undefined,""]){
   environment.JOBGUARD_ENV=mode;
   expect(()=>synthetic.syntheticPool()).toThrow("Synthetic workflow is unavailable");
   await expect(synthetic.syntheticWorkspace()).rejects.toMatchObject({code:"UNAUTHENTICATED"});
   await expect(requestWorkspace.workspaceApplication()).rejects.toMatchObject({code:"UNAUTHENTICATED"});
   const response=await session.GET();
   expect(response.status).toBe(401);
   expect(await response.json()).toEqual({code:"UNAUTHENTICATED"});
   expect(cookie).not.toHaveBeenCalled();
   expect(pool).not.toHaveBeenCalled();
   expect(authenticate).not.toHaveBeenCalled();
   expect(workspace).not.toHaveBeenCalled();
  }
 });
 it("confines real identity context construction to the authenticated principal bridge",async()=>{
  const files=await readdir(new URL(".",import.meta.url));
  const callers=[];
  for(const file of files.filter(f=>f.endsWith(".ts")&&!f.endsWith(".test.ts"))) {
   const source=await readFile(new URL(file,import.meta.url),"utf8");
   expect(source).not.toMatch(/from\s+["'](?:next-auth|@auth\/)/u);
   if(/verifiedTenantContextFromMembership\s*\(/u.test(source)||/as\s+VerifiedTenantContext/u.test(source)||/effective_tenant_id\s*[:=]/u.test(source))callers.push(file);
  }
  expect(callers).toEqual(["principal-bridge.ts"]);
  const web=new URL("../../../web/app/lib/",import.meta.url);
  for(const file of ["identity-server.ts","synthetic-server.ts","workspace-server.ts"]){const source=await readFile(new URL(file,web),"utf8");expect(source).not.toMatch(/verifiedTenantContextFromMembership|as\s+VerifiedTenantContext/u);if(file!=="identity-server.ts")expect(source).toContain('process.env.JOBGUARD_ENV');}
 });
 it("keeps Auth.js adapter-only and MemoryAuthProvider construction test-only across the applications",async()=>{
  for(const root of [new URL("../",import.meta.url),new URL("../../../web/app/",import.meta.url)]) {
   for(const file of (await readdir(root,{recursive:true})).filter(name=>/\.tsx?$/u.test(name)&&!name.endsWith(".test.ts"))) {
    const source=await readFile(new URL(file,root),"utf8");
    if(/^[\s]*["']use client/u.test(source))expect(source,file).not.toMatch(/@jobguard\/api\/identity|@jobguard\/db/u);
    expect(source, file).not.toMatch(/new\s+MemoryAuthProvider\s*\(/u);
    if(!(root.pathname.endsWith("/apps/api/src/")&&file==="auth/authjs-adapter.ts"))expect(source,file).not.toMatch(/(?:from|import|require)\s*(?:\(\s*)?["'](?:next-auth|@auth\/)/u);
   }
  }
 });

});
