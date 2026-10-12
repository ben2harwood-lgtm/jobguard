import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { EnterpriseIdentityRepository, IdentityRepository, SsoRequiredRepository } from "@jobguard/db";
import type { Pool } from "pg";
import type { ExecutionContext } from "@nestjs/common";
import { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { createIdentityApplication, IdentityApplication } from "../identity.application.js";
import { IdentityController } from "../identity.controller.js";
import { ApplicationAuthGuard } from "../application-auth.guard.js";
import { identityStatus } from "../identity-http.js";
import { SsoApplication } from "./sso.application.js";
import { SsoRequiredApplication } from "./sso-required.application.js";
import { syntheticSsoMetadata } from "./sso.contracts.js";
import { generateTestIdentityProvider } from "./test-identity-provider.js";
const idp=generateTestIdentityProvider();
const a="10000000-0000-4000-8000-000000000001",b="20000000-0000-4000-8000-000000000002",u="30000000-0000-4000-8000-000000000003",s="40000000-0000-4000-8000-000000000004",m="50000000-0000-4000-8000-000000000005",c="60000000-0000-4000-8000-000000000006";
const origin="https://jobguard.invalid",secret="fixture-secret-longer-than-thirty-two",token="t".repeat(43),csrf="c".repeat(32);
function fixture(two=false) {
 const effects:string[]=[],client={query:async(sql:string,args:unknown[]=[])=>pool.query(sql,args),release:()=>undefined};
 const query=async(sql:string,args:unknown[]=[])=>{
  effects.push(sql);
  if(["BEGIN","COMMIT","ROLLBACK"].includes(sql)||sql.includes("set_config"))return {rows:[]};
  if(sql.includes("sso_session_scope"))return {rows:[{scope:null}]};
  if(sql.includes("SELECT id,user_id,csrf_token"))return {rows:[{id:s,user_id:u,csrf_token:csrf}]};
  if(sql.includes("sso_session_memberships"))return {rows:two?[{id:m,identity_user_id:u,tenant_id:b,role:"owner",email:"owner@fixture.invalid",name:"Ordinary company"}]:[]};
  if(sql.includes("sso_required_refusal_target"))return {rows:[{connection_id:args[1]===a?c:null}]};
  if(sql.includes("sso_load_connection"))return {rows:[{metadata:syntheticSsoMetadata(c,a,idp.idpCert,origin)}]};
  if(sql.includes("sso_invite_member"))return {rows:[{id:"70000000-0000-4000-8000-000000000007",connection_id:null}]};
  if(sql.includes("sso_action_allowed"))return {rows:[{allowed:false}]};
  if(sql.includes("sso_code_signin_allowed"))return {rows:[{allowed:two,connections:two?[]:[c]}]};
  if(sql.includes("sso_invitation_accept_allowed"))return {rows:[{allowed:false,connection_id:c}]};
  if(sql.includes("provision_verified_challenge"))return {rows:[{user_id:u}]};
  if(sql.includes("request_window"))return {rows:[{count:0}]};
  if(sql.includes("identity.session")||sql.includes("identity.challenge")||sql.includes("security_event")||sql.includes("sso_refusal_event")||sql.includes("pg_advisory"))return {rows:[]};
  throw new Error("Unexpected SQL: "+sql);
 };
 const pool={query,connect:async()=>client} as unknown as Pool;
 const repository=new IdentityRepository(pool),auth=new PersistedAuthProvider(repository,secret,undefined,"synthetic_demo",()=>1000000,()=>"12345678");
 const identity=new IdentityApplication(auth,origin),enterprise=new EnterpriseIdentityRepository(pool);
 vi.spyOn(EnterpriseIdentityRepository.prototype,"refusal").mockImplementation(async(_route,code)=>{effects.push("refusal:"+code);});
 const credentials={sessionToken:token,csrfToken:csrf,origin};
 return {effects,pool,repository,auth,identity,enterprise,credentials,sso:new SsoApplication(auth,enterprise,origin,"synthetic_demo"),required:new SsoRequiredApplication(auth,new SsoRequiredRepository(pool),origin,"synthetic_demo")};
}
describe("ENT-10d shared identity paths",()=>{
 it("[S1] requests have unchanged shape and SQL for required and unknown addresses; verification issues no session or event",async()=>{
  const f=fixture();vi.spyOn(f.repository,"latest").mockResolvedValue(undefined);
  const known=await f.identity.request({version:"identity-request.v1",email:"owner@fixture.invalid",purpose:"signin"},"fixture",origin),first=[...f.effects];f.effects.length=0;
  const unknown=await f.identity.request({version:"identity-request.v1",email:"unknown@fixture.invalid",purpose:"signin"},"fixture",origin);
  expect(known).toEqual(unknown);expect(f.effects).toEqual(first);
  for(const purpose of ["signin","signup"] as const) {
   const id="80000000-0000-4000-8000-000000000008";
   vi.spyOn(f.repository,"latest").mockResolvedValue({id,email:"owner@fixture.invalid",purpose,invitation_id:null,digest:createHmac("sha256",secret).update(id+":12345678").digest("hex"),requested_at:new Date(999000),expires_at:new Date(1100000),consumed_at:null,attempts:0});
   const error=await f.identity.verify({version:"identity-verify.v1",email:"owner@fixture.invalid",purpose,code:"12345678"},origin).catch(e=>e);
   expect(identityStatus(error)).toEqual({code:"INVALID_CODE",status:400});
  }
  expect(f.effects.some(x=>x.startsWith("INSERT INTO identity.session"))).toBe(false);
  expect(f.effects.some(x=>x.includes("'session.issued'"))).toBe(false);vi.restoreAllMocks();
 });
 it("[S2] Nest listing, controller invitation, global guard, merged SSO view/admin/link and new routes share one ordinary-session denial",async()=>{
  const f=fixture(),controller=new IdentityController(()=>f.identity),guard=new ApplicationAuthGuard(()=>f.identity);
  const req={path:"/jobs/capture",headers:{cookie:`jobguard_session=${token}`,origin,"x-csrf-token":csrf,"x-tenant-id":a}};
  expect((await controller.session(req)).memberships).toEqual([]);
  for(const call of [()=>controller.invite({version:"identity-invitation.v1",requested_tenant_id:a,email:"invite@fixture.invalid",role:"finance"},req),()=>guard.canActivate({switchToHttp:()=>({getRequest:()=>req})} as ExecutionContext)]) {
   const error=await call().catch(e=>e);expect(error.getResponse()).toEqual({code:"TENANT_FORBIDDEN"});expect(error.getStatus()).toBe(403);
  }
  for(const call of [()=>f.sso.view(a,f.credentials),()=>f.sso.admin({version:"sso-admin.v1",requested_tenant_id:a,action:"domain.verify",connectionId:c,domain:"fixture.invalid",proof:"synthetic"},f.credentials),()=>f.sso.start(c,{version:"sso-start.v1",action:"signin",linkExisting:true},f.credentials)])await expect(call()).rejects.toMatchObject({code:"SSO_FORBIDDEN"});
  await expect(f.required.view({version:"sso-required-view.v1",requested_tenant_id:a},f.credentials)).rejects.toMatchObject({code:"SSO_REQUIRED_FORBIDDEN"});
  await expect(f.required.command({version:"sso-required-command.v1",requested_tenant_id:a,required:false,expectedRevision:1,reason:"Synthetic test administrator reason"},f.credentials)).rejects.toMatchObject({code:"SSO_REQUIRED_FORBIDDEN"});
  expect(f.effects.filter(x=>x.includes("sso_session_memberships")).length).toBeGreaterThan(0);
  expect(f.effects.some(x=>x.includes("sso_required_command")||x.includes("sso_invite_member"))).toBe(false);expect(f.effects.filter(x=>x==="refusal:SSO_REQUIRED").length).toBeGreaterThan(0);vi.restoreAllMocks();
 });
 it("[S2] Next identity composition filters listings and contexts using the real repository membership query",async()=>{
  const source=await readFile(new URL("../../../../web/app/lib/identity-server.ts",import.meta.url),"utf8"),exports:Record<string,any>={};
  runInNewContext(transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS}}).outputText,{exports,process:{env:{JOBGUARD_ENV:"synthetic_demo",IDENTITY_DATABASE_URL:"postgresql://jobguard_identity:fixture@db.fixture.invalid/jobguard_synthetic_demo",AUTH_CODE_SECRET:secret,AUTH_ALLOWED_ORIGIN:origin}},require:(id:string)=>id==="@jobguard/api/identity"?{createIdentityApplication}:{}});
  const next=exports.identityApplication() as IdentityApplication,f=fixture();
  const spy=vi.spyOn(next.provider.repository.pool,"query").mockImplementation(f.pool.query.bind(f.pool));
  try {expect((await next.session(token)).memberships).toEqual([]);await expect(next.context({...f.credentials,requestedTenantId:a})).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});}
  finally{spy.mockRestore();await next.provider.repository.pool.end();vi.restoreAllMocks();}
 });
 it("[S2] worker execution refuses an ordinary session id and audits without any business effect",async()=>{
  const f=fixture(true),context=await f.identity.context({...f.credentials,requestedTenantId:b});
  await expect(f.sso.checkWorkerAction(context,{version:"sso-worker-action.v1",connectionId:c,sessionId:s,membershipId:m,permission:"organisation.manage",scopeId:b})).rejects.toMatchObject({code:"SSO_FORBIDDEN"});
  expect(f.effects).toContain("refusal:SSO_FORBIDDEN");expect(f.effects.some(sql=>sql.startsWith("INSERT")&&!sql.includes("sso_refusal_event"))).toBe(false);vi.restoreAllMocks();
 });
 it("[S3] A-required B-ordinary account lists, resolves and invites only B",async()=>{
  const f=fixture(true);expect((await f.identity.session(token)).memberships.map(x=>x.tenantId)).toEqual([b]);
  expect((await f.identity.context({...f.credentials,requestedTenantId:b})).tenantId).toBe(b);
  await expect(f.identity.context({...f.credentials,requestedTenantId:a})).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  await expect(f.identity.invite({version:"identity-invitation.v1",requested_tenant_id:b,email:"invite@fixture.invalid",role:"finance"},f.credentials)).resolves.toHaveProperty("id");vi.restoreAllMocks();
 });
 it("[S7] closed invitation consumes challenge without verified latch or provisioning",async()=>{
  const f=fixture(),id="80000000-0000-4000-8000-000000000008",invitation="90000000-0000-4000-8000-000000000009";
  vi.spyOn(f.repository,"latest").mockResolvedValue({id,email:"owner@fixture.invalid",purpose:"invitation",invitation_id:invitation,digest:f.auth.digest(id+":12345678"),requested_at:new Date(999000),expires_at:new Date(1100000),consumed_at:null,attempts:0});
  await expect(f.auth.verifyCode("owner@fixture.invalid","invitation","12345678",invitation)).rejects.toMatchObject({code:"INVALID_CODE"});
  expect(f.effects).toContain("UPDATE identity.challenge SET consumed_at=$2 WHERE id=$1");
  expect(f.effects.some(x=>x.includes("verified=true")||x.includes("provision_verified_challenge"))).toBe(false);vi.restoreAllMocks();
 });
 it.each([undefined,null,{}, {id:1},{id:"invalid"}])("[S7] missing or invalid invitation result %j is refused",async answer=>{
  const f=fixture(true),original=f.pool.query.bind(f.pool);
  vi.spyOn(f.pool,"query").mockImplementation(((sql:string,args:unknown[])=>sql.includes("sso_invite_member")?Promise.resolve({rows:answer===undefined?[]:[answer]}):original(sql,args)) as typeof f.pool.query);
  await expect(f.identity.invite({version:"identity-invitation.v1",requested_tenant_id:b,email:"invite@fixture.invalid",role:"finance"},f.credentials)).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  expect(f.effects).toContain("refusal:SSO_REQUIRED_INVITE_CLOSED");vi.restoreAllMocks();
 });
 it.each([undefined,null,{}, {allowed:"true"}])("[S1] missing or invalid code gate answer %j fails closed",async answer=>{
  const f=fixture(),id="80000000-0000-4000-8000-000000000008";
  vi.spyOn(f.repository,"latest").mockResolvedValue({id,email:"owner@fixture.invalid",purpose:"signin",invitation_id:null,digest:f.auth.digest(id+":12345678"),requested_at:new Date(999000),expires_at:new Date(1100000),consumed_at:null,attempts:0});
  const original=f.pool.query.bind(f.pool);
  vi.spyOn(f.pool,"query").mockImplementation(((sql:string,args:unknown[])=>sql.includes("sso_code_signin_allowed")?Promise.resolve({rows:answer===undefined?[]:[answer]}):original(sql,args)) as typeof f.pool.query);
  await expect(f.auth.verifyCode("owner@fixture.invalid","signin","12345678")).rejects.toMatchObject({code:"INVALID_CODE"});vi.restoreAllMocks();
 });
});
