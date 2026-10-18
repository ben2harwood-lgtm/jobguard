import { describe, expect, it, vi } from "vitest";
import type { OidcRepository } from "@jobguard/db";
import type { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { OidcApplication } from "./oidc.application.js";
import { TestOidcIssuer, fixtureConfig } from "./test-oidc-issuer.js";
function harness() {
 const issuer=new TestOidcIssuer(),trace:string[]=[];
 let stored:unknown,claimed=false,held=false;
 const config={version:"oidc-connection.v1",protocol:"oidc",revision:1,sessionLimitSeconds:900,config:fixtureConfig};
 const transport=issuer.transport;
 Object.defineProperty(issuer,"transport",{value:async(...args:Parameters<typeof transport>)=>{expect(held).toBe(false);trace.push(args[0].endsWith('/token')?'exchange':'discovery');return transport(...args);}});
 const repository={load:vi.fn(async()=>config),refusal:vi.fn(async()=>{}),save:vi.fn(async(_id:string,request:unknown)=>{stored=request;}),
  claim:vi.fn(async()=>{if(claimed)throw new Error('consumed');claimed=true;trace.push('claim-committed');return {connection:config,request:stored,linkSessionId:null};}),
  fail:vi.fn(async()=>{}),transaction:vi.fn(async(work:(c:unknown)=>Promise<unknown>)=>{held=true;try{return await work({});}finally{held=false;}}),
  finish:vi.fn(async():Promise<{tenantId:string;membershipId:string}|{code:string}>=>({tenantId:fixtureConfig.tenantId,membershipId:'member'})),audit:vi.fn(async()=>{})};
 const app=new OidcApplication({digest:(s:string)=>s} as PersistedAuthProvider,repository as unknown as OidcRepository,'https://jobguard.invalid','synthetic_demo',issuer);
 return {app,repository,issuer,trace};
}
const input={version:'oidc-start.v1',action:'signin'};
async function started(h:ReturnType<typeof harness>) {return h.app.start(fixtureConfig.connectionId,input,{origin:h.app.allowedOrigin});}
async function callback(h:ReturnType<typeof harness>,s:Awaited<ReturnType<typeof started>>) {return h.app.callback(fixtureConfig.connectionId,{version:'oidc-callback.v1',callback:s.callback},s.browser,h.app.allowedOrigin);}
describe('OIDC orchestration (repository double, not PostgreSQL evidence)',()=>{
 it('claims before actual adapter exchange without a held transaction; refuses replay',async()=>{
  const h=harness(),s=await started(h);expect(await callback(h,s)).toHaveProperty('sessionToken');
  expect(h.trace.indexOf('claim-committed')).toBeLessThan(h.trace.indexOf('exchange'));
  await expect(callback(h,s)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(h.trace.filter(x=>x==='exchange')).toHaveLength(1);
 });
 it('records unknown outcome and never retries exchange',async()=>{
  const h=harness(),s=await started(h);h.issuer.altered=true;
  await expect(callback(h,s)).rejects.toMatchObject({message:'OIDC_REFUSED'});
  expect(h.repository.fail).toHaveBeenCalledOnce();expect(h.repository.finish).not.toHaveBeenCalled();
  await expect(callback(h,s)).rejects.toMatchObject({message:'OIDC_REFUSED'});
  expect(h.trace.filter(x=>x==='exchange')).toHaveLength(1);
 });
 it('redacts commit-time authority failure',async()=>{
  const h=harness(),s=await started(h);h.repository.finish.mockRejectedValueOnce(new Error('private authority detail'));
  await expect(callback(h,s)).rejects.toMatchObject({message:'OIDC_REFUSED'});expect(h.repository.fail).toHaveBeenCalledOnce();
 });
 it('commits the no-group refusal audit before refusing sign-in',async()=>{
  const h=harness(),s=await started(h);h.repository.finish.mockResolvedValueOnce({code:'NO_MAPPED_GRANTS'});
  await expect(callback(h,s)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(h.repository.audit).toHaveBeenCalledWith({},fixtureConfig.connectionId,'sso.oidc.signin.refused','identity:oidc','OIDC_REFUSED');
 });
 it('refuses wrong origin and missing link authority before exchange',async()=>{
  const h=harness();await expect(h.app.start(fixtureConfig.connectionId,input,{origin:'https://other.invalid'})).rejects.toMatchObject({code:'OIDC_REFUSED'});
  await expect(h.app.start(fixtureConfig.connectionId,{...input,linkExisting:true},{origin:h.app.allowedOrigin})).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(h.repository.claim).not.toHaveBeenCalled();expect(h.trace).toEqual([]);
 });
});
