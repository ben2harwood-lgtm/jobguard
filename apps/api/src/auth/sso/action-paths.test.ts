import { describe,expect,it,vi } from "vitest";
import { EnterpriseIdentityRepository, ssoRepositoryError } from "@jobguard/db";
import { HttpException } from "@nestjs/common";
import { SsoApplication, SsoAuthProvider } from "./sso.application.js";
import { SsoController } from "./sso.controller.js";
import { ssoStatus } from "./sso.contracts.js";
import type { PersistedAuthProvider } from "../persisted-auth-provider.js";
import type { IdentityApplication } from "../identity.application.js";
import { createWorkspaceApplication } from "../../workspace/application.js";
import type { Pool } from "pg";
const principal={identityUserId:"30000000-0000-4000-8000-000000000003",sessionId:"40000000-0000-4000-8000-000000000004",csrfToken:"a".repeat(32)};
const member={id:"50000000-0000-4000-8000-000000000005",identityUserId:principal.identityUserId,tenantId:"10000000-0000-4000-8000-000000000001",role:"read_only" as const,email:"site@fixture.invalid"};
function fixture() {
 const base={authenticate:vi.fn(async()=>principal),findMembership:vi.fn(async()=>member),memberships:vi.fn(async()=>[{...member,name:'Fictional'}]),requestCode:vi.fn(),verifyCode:vi.fn()} as unknown as PersistedAuthProvider;
 const repository={sessionScope:vi.fn(async()=>({tenantId:member.tenantId,membershipId:member.id}))} as unknown as EnterpriseIdentityRepository;
 return {provider:new SsoAuthProvider(base,repository),base,repository};
}
describe("ENT-10a AuthProvider web and worker session boundary",()=>{
 it("preserves unknown repository errors as causes without adding causes to recognised refusals",()=>{
  const databaseError=Object.assign(new Error('private PostgreSQL diagnostic'),{code:'42883'});
  const failure=ssoRepositoryError(databaseError);
  expect(failure.code).toBe('SSO_UNAVAILABLE');expect(failure.cause).toBe(databaseError);
  expect(ssoRepositoryError(failure)).toBe(failure);
  expect(ssoRepositoryError(null)).toMatchObject({code:'SSO_UNAVAILABLE',cause:null});
  for(const error of [new Error('DOMAIN_UNVERIFIED'),{code:'23505',constraint:'verified_domain_domain_key'}]) {
   expect(ssoRepositoryError(error).code).toMatch(/^DOMAIN_/u);
   expect(ssoRepositoryError(error)).not.toHaveProperty('cause');
  }
 });
 it.each(['raw','repository'] as const)("retains the original %s error through the application while HTTP exposes only code and status",async(kind)=>{
  const databaseError=Object.assign(new Error('private PostgreSQL diagnostic'),{code:'42883',detail:'private table details'});
  const client={query:vi.fn(async()=>({rows:[]})),release:vi.fn()};
  const repository=new EnterpriseIdentityRepository({connect:async()=>client} as unknown as Pool);
  vi.spyOn(repository,'connection').mockRejectedValue(kind==='raw'?databaseError:ssoRepositoryError(databaseError));
  const refusal=vi.spyOn(repository,'refusal').mockResolvedValue(undefined);
  const app=new SsoApplication({} as PersistedAuthProvider,repository,'https://jobguard.invalid');
  const id='60000000-0000-4000-8000-000000000006',body={version:'sso-start.v1',action:'signin'};
  const failure=await app.start(id,body,{origin:app.allowedOrigin}).catch(error=>error);
  expect(failure).toMatchObject({code:'SSO_UNAVAILABLE',cause:databaseError});
  expect(failure.cause).toBe(databaseError);
  expect(ssoStatus(failure)).toEqual({code:'SSO_UNAVAILABLE',status:503});
  expect(refusal).toHaveBeenCalledWith(id,'SSO_UNAVAILABLE');
  const controller=new SsoController(()=>app);
  const http=await controller.start(id,body,{headers:{origin:app.allowedOrigin}},{cookie:vi.fn(),clearCookie:vi.fn()}).catch(error=>error);
  expect(http).toBeInstanceOf(HttpException);
  expect(http.getStatus()).toBe(503);expect(http.getResponse()).toEqual({code:'SSO_UNAVAILABLE'});
  expect(JSON.stringify(http.getResponse())).not.toContain(databaseError.message);
  expect(JSON.stringify(http.getResponse())).not.toContain(databaseError.detail);
 });
 it("the real composition seam refuses pilot, production and missing mode before authentication",async()=>{
  const saved=process.env.JOBGUARD_ENV;
  try {
   for(const mode of ['pilot_no_charge','production',undefined]) {
    if(mode===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=mode;
    const pool={} as Pool;
    const identity={provider:{repository:{pool}},allowedOrigin:'https://jobguard.invalid'} as IdentityApplication;
    const application=createWorkspaceApplication({pool,identity}).sso!;
    const refusal=vi.spyOn(application.repository,'refusal').mockResolvedValue(undefined);
    await expect(application.view(member.tenantId,{})).rejects.toMatchObject({code:'SSO_ROUTE_BLOCKED'});
    expect(refusal).toHaveBeenCalledWith('admin','SSO_ROUTE_BLOCKED');
   }
  }finally{if(saved===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=saved;}
 });
 it("keeps code authentication delegated and restricts SAML sessions to their persisted tenant",async()=>{
  const f=fixture();expect(await f.provider.authenticate('opaque')).toEqual(principal);
  expect(await f.provider.findMembership(principal,member.tenantId)).toEqual(member);
  expect(await f.provider.findMembership(principal,'20000000-0000-4000-8000-000000000002')).toBeUndefined();
 });
 it("web rechecks membership revocation and session expiry without trusting an earlier principal",async()=>{
  const f=fixture();expect(await f.provider.authenticate('opaque')).toBeDefined();
  vi.mocked(f.repository.sessionScope).mockResolvedValue({tenantId:member.tenantId,membershipId:member.id,revoked:true});
  expect(await f.provider.authenticate('opaque')).toBeUndefined();expect(await f.provider.findMembership(principal,member.tenantId)).toBeUndefined();
  vi.mocked(f.base.authenticate).mockResolvedValue(undefined);expect(await f.provider.authenticate('opaque')).toBeUndefined();
 });
 it("preserves email-code membership behavior when there is no SAML binding",async()=>{
  const f=fixture();vi.mocked(f.repository.sessionScope).mockResolvedValue(null);
  expect(await f.provider.findMembership(principal,member.tenantId)).toEqual(member);
 });
});
