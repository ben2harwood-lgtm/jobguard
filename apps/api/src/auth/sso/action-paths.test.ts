import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";
import { describe,expect,it,vi } from "vitest";
import { EnterpriseIdentityRepository, IdentityRepository, ssoRepositoryError } from "@jobguard/db";
import { HttpException, type ExecutionContext } from "@nestjs/common";
import { IdentityController } from "../identity.controller.js";
import { ApplicationAuthGuard } from "../application-auth.guard.js";
import { SsoApplication, SsoAuthProvider } from "./sso.application.js";
import { SsoController, SSO_APPLICATION } from "./sso.controller.js";
import { SsoError, ssoStateCookieOptions, ssoStatus } from "./sso.contracts.js";
import { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { createIdentityApplication, IdentityApplication } from "../identity.application.js";
import { createWorkspaceApplication } from "../../workspace/application.js";
import type { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { CacheItem, CacheProvider } from "@node-saml/node-saml";
import { SamlAdapter, type SamlConnection } from "./saml.js";
import { generateTestIdentityProvider } from "./test-identity-provider.js";
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

// Port of independent-ent10a.test.ts cases 1–3: real shared services, stubbed database facts.
const boundTenantA="10000000-0000-4000-8000-000000000001", boundTenantB="20000000-0000-4000-8000-000000000002";
const boundaryOrigin="https://jobguard.invalid", boundaryToken="t".repeat(43);
function sharedIdentityFixture(bound=true) {
 const effects:{invitations:unknown[][];refusals:unknown[][]}={invitations:[],refusals:[]};
 const pool={query:async(sql:string,args:unknown[])=>{
  if(sql.includes('sso_session_scope'))return {rows:[{scope:bound?{tenantId:boundTenantA,membershipId:member.id}:null}]};
  if(sql.includes('SELECT id,user_id,csrf_token'))return {rows:[{id:principal.sessionId,user_id:principal.identityUserId,csrf_token:principal.csrfToken}]};
  if(sql.includes('invite_member')){effects.invitations.push(args);return {rows:[{id:'70000000-0000-4000-8000-000000000007'}]};}
  if(sql.includes('INSERT INTO identity.sso_refusal_event')){effects.refusals.push(args);return {rows:[]};}
  throw new Error('Unexpected SQL: '+sql);
 }} as unknown as Pool;
 const repository=new IdentityRepository(pool);
 repository.memberships=async()=>[boundTenantA,boundTenantB].map((tenantId,i)=>({id:i===0?member.id:'60000000-0000-4000-8000-000000000006',tenant_id:tenantId,identity_user_id:principal.identityUserId,role:'owner',email:'owner@fixture.invalid',name:'Fixture'}));
 const identity=new IdentityApplication(new PersistedAuthProvider(repository,'independent-test-key-at-least-thirty-two-characters'),boundaryOrigin);
 const saved=process.env.JOBGUARD_ENV;let sso:SsoApplication;
 try{process.env.JOBGUARD_ENV='synthetic_demo';sso=createWorkspaceApplication({pool,identity}).sso!;}
 finally{if(saved===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=saved;}
 const credentials={sessionToken:boundaryToken,csrfToken:principal.csrfToken,origin:boundaryOrigin};
 const invitation=(tenantId:string)=>({version:'identity-invitation.v1',requested_tenant_id:tenantId,email:'invited@fixture.invalid',role:'finance'});
 return {identity,sso,effects,credentials,invitation,pool};
}
describe("Round 1 / checker reproductions at the shared identity boundary",()=>{
 it("normal principal bridge refuses B for a persisted SAML session bound to A",async()=>{
  const {identity,sso,credentials}=sharedIdentityFixture();
  await expect(sso.provider.findMembership(principal,boundTenantB)).resolves.toBeUndefined();
  await expect(identity.context({...credentials,requestedTenantId:boundTenantB})).rejects.toMatchObject({code:'TENANT_FORBIDDEN'});
 });
 it("session endpoint exposes only A for an explicitly linked two-tenant account",async()=>{
  const {identity}=sharedIdentityFixture();
  expect((await identity.session(boundaryToken)).memberships.map(m=>m.tenantId)).toEqual([boundTenantA]);
 });
 it("existing invitation path refuses B and creates nothing with an A-only SAML session",async()=>{
  const {identity,credentials,invitation,effects}=sharedIdentityFixture();
  await expect(identity.invite(invitation(boundTenantB),credentials)).rejects.toMatchObject({code:'TENANT_FORBIDDEN'});
  expect(effects.invitations).toHaveLength(0);
 });
});

describe("Round 1 / identity HTTP and ordinary-session regressions",()=>{
 it("ordinary entered-code sessions list both tenants, resolve both and invite in the owned B tenant",async()=>{
  const {identity,credentials,invitation,effects}=sharedIdentityFixture(false);
  expect(await identity.session(boundaryToken)).toEqual({version:'identity-session.v1',environment:'synthetic_demo',principal:{id:principal.identityUserId,sessionId:principal.sessionId},csrfToken:principal.csrfToken,memberships:[
   {id:member.id,tenantId:boundTenantA,role:'owner',name:'Fixture'},
   {id:'60000000-0000-4000-8000-000000000006',tenantId:boundTenantB,role:'owner',name:'Fixture'},
  ]});
  for(const tenantId of [boundTenantA,boundTenantB])expect((await identity.context({...credentials,requestedTenantId:tenantId})).tenantId).toBe(tenantId);
  expect(await identity.invite(invitation(boundTenantB),credentials)).toEqual({version:'identity-invitation-response.v1',id:'70000000-0000-4000-8000-000000000007',environment:'synthetic_demo'});
  expect(effects.invitations).toHaveLength(1);expect(effects.refusals).toHaveLength(0);
 });
 it("bound sessions still list, resolve and create invitations normally inside A",async()=>{
  const {identity,credentials,invitation,effects}=sharedIdentityFixture();
  expect((await identity.session(boundaryToken)).memberships).toEqual([{id:member.id,tenantId:boundTenantA,role:'owner',name:'Fixture'}]);
  expect((await identity.context({...credentials,requestedTenantId:boundTenantA})).tenantId).toBe(boundTenantA);
  await expect(identity.invite(invitation(boundTenantA),credentials)).resolves.toHaveProperty('id');
  expect(effects.invitations).toHaveLength(1);expect(effects.refusals).toHaveLength(0);
 });
 it("the Nest session controller, tenant guard and invitation controller preserve typed HTTP outcomes for B",async()=>{
  const {identity,invitation,effects}=sharedIdentityFixture();
  const controller=new IdentityController(()=>identity),guard=new ApplicationAuthGuard(()=>identity);
  const request={path:'/jobs/capture',headers:{cookie:`jobguard_session=${boundaryToken}`,origin:boundaryOrigin,'x-csrf-token':principal.csrfToken,'x-tenant-id':boundTenantB}};
  expect((await controller.session(request)).memberships.map(m=>m.tenantId)).toEqual([boundTenantA]);
  const context={switchToHttp:()=>({getRequest:()=>request})} as ExecutionContext;
  for(const action of [()=>guard.canActivate(context),()=>controller.invite(invitation(boundTenantB),request)]) {
   const error=await action().catch(failure=>failure);
   expect(error).toBeInstanceOf(HttpException);
   expect(error.getStatus()).toBe(403);expect(error.getResponse()).toEqual({code:'TENANT_FORBIDDEN'});
  }
  expect(effects.invitations).toHaveLength(0);expect(effects.refusals).toHaveLength(2);
  expect(effects.refusals.every(args=>args[2]==='TENANT_FORBIDDEN')).toBe(true);
  await expect(controller.invite(invitation(boundTenantA),{...request,headers:{...request.headers,'x-tenant-id':boundTenantA}})).resolves.toHaveProperty('id');
 });
 it("the shared provider audits refusals against the persisted connection and enforces membership identity as well as tenant",async()=>{
  const {identity,credentials,invitation,effects}=sharedIdentityFixture();
  const connectionId='80000000-0000-4000-8000-000000000008';
  const scope=vi.spyOn(EnterpriseIdentityRepository.prototype,'sessionScope').mockResolvedValue({tenantId:boundTenantA,membershipId:'90000000-0000-4000-8000-000000000009',connectionId});
  const refusal=vi.spyOn(EnterpriseIdentityRepository.prototype,'refusal').mockResolvedValue(undefined);
  try {
   expect((await identity.session(boundaryToken)).memberships).toEqual([]);
   await expect(identity.invite(invitation(boundTenantA),credentials)).rejects.toMatchObject({code:'TENANT_FORBIDDEN'});
   expect(refusal).toHaveBeenCalledExactlyOnceWith(connectionId,'TENANT_FORBIDDEN');
   expect(effects.invitations).toHaveLength(0);
   scope.mockResolvedValue({tenantId:boundTenantA,membershipId:member.id,connectionId,revoked:true});
   await expect(identity.session(boundaryToken)).rejects.toMatchObject({code:'UNAUTHENTICATED'});
   await expect(identity.context({...credentials,requestedTenantId:boundTenantA})).rejects.toMatchObject({code:'UNAUTHENTICATED'});
   expect(await identity.provider.findMembership(principal,boundTenantA)).toBeUndefined();
  }finally{scope.mockRestore();refusal.mockRestore();}
 });
});

describe("Round 1 / shared Nest and Next factory composition",()=>{
 it("both server compositions use the binding-aware persisted provider even before the SSO service is constructed",async()=>{
  const environment={JOBGUARD_ENV:'synthetic_demo',IDENTITY_DATABASE_URL:'postgresql://jobguard_identity:fixture@db.fixture.invalid/jobguard_synthetic_demo',AUTH_CODE_SECRET:'factory-fixture-key-longer-than-thirty-two',AUTH_ALLOWED_ORIGIN:boundaryOrigin};
  // This is Nest's IDENTITY_APPLICATION factory; no connection or SSO service is needed.
  const module=await readFile(new URL('../../app.module.ts',import.meta.url),'utf8');
  expect(module).toContain('createIdentityApplication(process.env)');
  const nest=createIdentityApplication(environment);
  const source=await readFile(new URL('../../../../web/app/lib/identity-server.ts',import.meta.url),'utf8');
  const exports:Record<string,any>={};
  runInNewContext(transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS}}).outputText,{
   exports,process:{env:environment},require:(id:string)=>{
    if(id==='server-only'||id==='next/headers'||id==='next/server')return {};
    if(id==='@jobguard/api/identity')return {createIdentityApplication};
    throw new Error(`Unexpected Next identity import: ${id}`);
   },
  });
  const next=exports.identityApplication() as IdentityApplication;
  for(const app of [nest,next]) {
   const facts=sharedIdentityFixture();
   const query=vi.spyOn(app.provider.repository.pool,'query').mockImplementation(facts.pool.query.bind(facts.pool));
   const memberships=vi.spyOn(app.provider.repository,'memberships').mockImplementation(facts.identity.provider.repository.memberships);
   try {
    expect(app.provider).toBeInstanceOf(PersistedAuthProvider);
    expect((await app.session(boundaryToken)).memberships.map(m=>m.tenantId)).toEqual([boundTenantA]);
    await expect(app.context({...facts.credentials,requestedTenantId:boundTenantB})).rejects.toMatchObject({code:'TENANT_FORBIDDEN'});
    await expect(app.invite(facts.invitation(boundTenantB),facts.credentials)).rejects.toMatchObject({code:'TENANT_FORBIDDEN'});
    expect(facts.effects.invitations).toHaveLength(0);
   }finally{query.mockRestore();memberships.mockRestore();await app.provider.repository.pool.end();}
  }
 });
});

// Round 2: transport-level proof for the Nest controller, which is served at /auth/sso (no /api prefix).
// The application behind it is a thin double that does the real signed-SAML validation; what is under test is the
// HTTP transport: which cookie the controller sets and clears, and whether a browser would send it back to the callback.
class TransportRequestCache implements CacheProvider {
 readonly entries=new Map<string,string>();
 async saveAsync(key:string,value:string):Promise<CacheItem>{this.entries.set(key,value);return {value,createdAt:Date.now()};}
 async getAsync(key:string):Promise<string|null>{return this.entries.get(key)??null;}
 async removeAsync(key:string|null):Promise<string|null>{if(key===null)return null;const value=this.entries.get(key)??null;this.entries.delete(key);return value;}
}
/** RFC 6265 section 5.1.4 path-match plus the delete rules, so a cookie is only returned to a request path inside its Path. */
class PathHonouringJar {
 private readonly cookies=new Map<string,{name:string;value:string;path:string}>();
 store(setCookie:string[]|string|undefined) {
  for(const line of [setCookie??[]].flat()) {
   const [pair,...attributes]=line.split(';').map(part=>part.trim()),at=pair!.indexOf('='),name=pair!.slice(0,at),value=pair!.slice(at+1);
   const attribute=(key:string)=>attributes.find(part=>part.toLowerCase().startsWith(`${key}=`))?.slice(key.length+1);
   const path=attribute('path')??'/',maxAge=attribute('max-age'),expires=attribute('expires');
   const expired=(maxAge!==undefined&&Number(maxAge)<=0)||(expires!==undefined&&Date.parse(expires)<=Date.now());
   if(expired)this.cookies.delete(`${name};${path}`);else this.cookies.set(`${name};${path}`,{name,value,path});
  }
 }
 header(requestPath:string):string|undefined {
  const sent=[...this.cookies.values()].filter(({path})=>requestPath===path||(requestPath.startsWith(path)&&(path.endsWith('/')||requestPath[path.length]==='/')));
  return sent.length?sent.map(({name,value})=>`${name}=${value}`).join('; '):undefined;
 }
}
async function nestTransport() {
 const origin='https://jobguard.invalid',connectionId='70000000-0000-4000-8000-000000000007',idp=generateTestIdentityProvider();
 const connection:SamlConnection={id:connectionId,tenantId:member.tenantId,idpEntityId:'urn:jobguard:synthetic-idp',spEntityId:`urn:jobguard:sp:${connectionId}`,callbackUrl:`${origin}/auth/sso/${connectionId}/callback`,entryPoint:`${origin}/test-idp`,idpCert:idp.idpCert};
 const cache=new TransportRequestCache(),adapter=new SamlAdapter(connection,cache),requests=new Map<string,string>();
 const double={
  allowedOrigin:origin,
  repository:{refusal:vi.fn(async()=>undefined)},
  async start() {
   const authnRequestUrl=await adapter.start(),requestId=[...cache.entries.keys()].at(-1)!;
   const relayState=randomBytes(32).toString('base64url');requests.set(relayState,requestId);
   return {version:'sso-started.v1' as const,connectionId,requestId,relayState,authnRequestUrl};
  },
  async callback(_id:string,raw:unknown,browserState:string|undefined) {
   const input=raw as {SAMLResponse:string;relayState:string};
   if(!browserState||browserState!==input.relayState)throw new SsoError('REQUEST_REFUSED');
   await adapter.validate(input.SAMLResponse).catch(()=>{throw new SsoError('SAML_REFUSED');});
   return {sessionToken:randomBytes(32).toString('base64url'),sessionLimitSeconds:900,csrfToken:'c'.repeat(32),tenantId:member.tenantId};
  },
 };
 const module=await Test.createTestingModule({controllers:[SsoController],providers:[{provide:SSO_APPLICATION,useValue:()=>double}]}).compile();
 const app=module.createNestApplication();await app.init();
 return {app,origin,connectionId,connection,idp,startPath:`/auth/sso/${connectionId}/start`,callbackPath:`/auth/sso/${connectionId}/callback`};
}
describe("ENT-10a Nest SSO transport (round 2: state cookie path)",()=>{
 it("sets the state cookie on /auth/sso, carries it from start to a successful signed callback, and clears it on the same path",async()=>{
  const t=await nestTransport(),jar=new PathHonouringJar();
  try {
   const started=await request(t.app.getHttpServer()).post(t.startPath).set('Origin',t.origin).send({version:'sso-start.v1',action:'signin'}).expect(201);
   const stateCookie=[started.headers['set-cookie']].flat().find(line=>line?.startsWith('jobguard_sso_state='))!;
   expect(stateCookie).toContain(`jobguard_sso_state=${started.body.relayState}`);
   expect(stateCookie).toContain('Path=/auth/sso;');
   expect(stateCookie).not.toContain('/api/auth/sso');
   for(const unchanged of ['Max-Age=600','HttpOnly','Secure','SameSite=Strict'])expect(stateCookie).toContain(unchanged);
   jar.store(started.headers['set-cookie']);
   // A browser must send the state cookie to the Nest callback path (served without /api).
   const cookie=jar.header(t.callbackPath);expect(cookie).toBe(`jobguard_sso_state=${started.body.relayState}`);
   const SAMLResponse=t.idp.response({connection:t.connection,requestId:started.body.requestId,subject:'operative-1',email:'site@fixture.invalid',groups:['site']});
   const signedIn=await request(t.app.getHttpServer()).post(t.callbackPath).set('Origin',t.origin).set('Cookie',cookie!).send({version:'sso-callback.v1',SAMLResponse,relayState:started.body.relayState}).expect(201);
   expect(signedIn.body).toMatchObject({version:'sso-signed-in.v1',environment:'synthetic_demo',tenantId:member.tenantId});
   const lines=[signedIn.headers['set-cookie']].flat() as string[];
   expect(lines.find(line=>line.startsWith('jobguard_sso_state=;'))).toContain('Path=/auth/sso');
   const sessionCookie=lines.find(line=>line.startsWith('jobguard_session='))!;
   for(const attribute of ['Path=/;','Max-Age=900','HttpOnly','Secure','SameSite=Strict'])expect(sessionCookie).toContain(attribute);
   jar.store(signedIn.headers['set-cookie']);
   // The clear matched the cookie's own Path, so only the session cookie is left in the jar.
   expect(jar.header(t.callbackPath)).toMatch(/^jobguard_session=[^;]+$/u);
   expect(jar.header(t.callbackPath)).not.toContain('jobguard_sso_state');
  } finally {await t.app.close();}
 });
 it("does not send a state cookie scoped to /api/auth/sso to the Nest callback, so that callback is refused",async()=>{
  const t=await nestTransport(),jar=new PathHonouringJar();
  try {
   const started=await request(t.app.getHttpServer()).post(t.startPath).set('Origin',t.origin).send({version:'sso-start.v1',action:'signin'}).expect(201);
   jar.store(`jobguard_sso_state=${started.body.relayState}; Path=/api/auth/sso; Max-Age=600; HttpOnly; Secure; SameSite=Strict`);
   expect(jar.header(`/api/auth/sso/${t.connectionId}/callback`)).toBe(`jobguard_sso_state=${started.body.relayState}`);
   expect(jar.header(t.callbackPath)).toBeUndefined();
   const SAMLResponse=t.idp.response({connection:t.connection,requestId:started.body.requestId,subject:'operative-1',email:'site@fixture.invalid',groups:['site']});
   const refused=await request(t.app.getHttpServer()).post(t.callbackPath).set('Origin',t.origin).send({version:'sso-callback.v1',SAMLResponse,relayState:started.body.relayState}).expect(403);
   expect(refused.body).toEqual({code:'REQUEST_REFUSED'});
  } finally {await t.app.close();}
 });
 it("leaves the Next state-cookie contract on /api/auth/sso with every other attribute unchanged",()=>{
  expect(ssoStateCookieOptions).toEqual({httpOnly:true,secure:true,sameSite:'strict',path:'/api/auth/sso',maxAge:600_000});
 });
});
