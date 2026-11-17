import { BadRequestException, type ArgumentsHost } from "@nestjs/common";
import { BaseExceptionFilter, type HttpAdapterHost } from "@nestjs/core";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { OidcController, OidcParseExceptionFilter } from "./oidc.controller.js";
import type { OidcApplication } from "./oidc.application.js";
import { oidcBrowserCookie, oidcCookieOptions } from "./oidc-persistence.contracts.js";
function fixture() {
 const app={start:vi.fn(async()=>({version:'oidc-started.v1',browser:'b'.repeat(43),callback:'https://app.invalid/oidc/callback?state=fixture'})),
  callback:vi.fn(async()=>({sessionToken:'opaque',csrfToken:'csrf',tenantId:'tenant',sessionLimitSeconds:60})),refuseInput:vi.fn(async()=>{throw new Error('refused');})};
 const response={cookie:vi.fn(),setHeader:vi.fn()};return {app,response};
}
async function next(which:string,app:ReturnType<typeof fixture>['app']) {
 const source=await readFile(new URL(`../../../../web/app/api/auth/oidc/[connectionId]/${which}/route.ts`,import.meta.url),'utf8'),exports:Record<string,any>={};
 const json=(body:unknown,options:unknown)=>({body,options,cookies:{set:vi.fn()}});
 runInNewContext(transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS}}).outputText,{exports,URL,require:(id:string)=>{
  if(id==='next/server')return {NextResponse:{json}};
  if(id==='@jobguard/api/workspace')return {createWorkspaceApplication:()=>({oidc:app}),oidcBrowserCookie,oidcCookieOptions};
  if(id.includes('identity-server'))return {identityApplication:()=>({}),identityCredentials:async()=>({origin:'https://jobguard.invalid',csrfToken:'csrf',sessionToken:'opaque'})};
  if(id.includes('synthetic-server'))return {syntheticPool:()=>({})};throw new Error(id);
 }});return exports.POST;
}
describe('actual Nest controller and Next route handlers (in-process, no HTTP listener)',()=>{
 it('Nest keeps binding HttpOnly on the correct path, uses milliseconds, hides token and disables caching',async()=>{
  const f=fixture(),controller=new OidcController(()=>f.app as unknown as OidcApplication),request={headers:{origin:'https://jobguard.invalid',cookie:'jobguard_oidc_state='+ 'b'.repeat(43)}};
  const result=await controller.start('id',{},request,f.response);expect(result).not.toHaveProperty('browser');
  expect(f.response.cookie).toHaveBeenCalledWith('jobguard_oidc_state','b'.repeat(43),{...oidcCookieOptions,path:'/auth/oidc',maxAge:300000});
  expect(await controller.callback('id',{},request,f.response)).not.toHaveProperty('sessionToken');
  expect(f.response.cookie).toHaveBeenCalledWith('jobguard_session','opaque',{...oidcCookieOptions,path:'/',maxAge:60000});
  expect(f.response.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
 });
 it('Next passes real headers to application, uses seconds and clears the exact cookie path',async()=>{
  const f=fixture(),start=await next('start',f.app),callback=await next('callback',f.app),params={params:Promise.resolve({connectionId:'id'})};
  const req=new Request('https://jobguard.invalid/api/auth/oidc/id/start',{method:'POST',headers:{origin:'https://jobguard.invalid',cookie:'jobguard_oidc_state='+ 'b'.repeat(43)},body:'{}'});
  const result=await start(req.clone(),params);expect(result.body).not.toHaveProperty('browser');
  expect(result.cookies.set).toHaveBeenCalledWith('jobguard_oidc_state','b'.repeat(43),oidcCookieOptions);
  const done=await callback(req,params);expect(done.body).not.toHaveProperty('sessionToken');
  expect(done.cookies.set).toHaveBeenCalledWith('jobguard_session','opaque',{...oidcCookieOptions,path:'/',maxAge:60});
  expect(done.cookies.set).toHaveBeenCalledWith('jobguard_oidc_state','',{...oidcCookieOptions,maxAge:0});
  expect(f.app.callback).toHaveBeenCalledWith('id',{},'b'.repeat(43),'https://jobguard.invalid');
 });
 it('both redact failures and Next parse refusals remain no-store',async()=>{
  const f=fixture();f.app.start.mockRejectedValue(new Error('raw token secret'));
  const error=await new OidcController(()=>f.app as unknown as OidcApplication).start('id',{}, {headers:{}},f.response).catch(e=>e);
  expect(error.getResponse()).toEqual({version:'oidc-error.v1',code:'OIDC_REFUSED'});
  const post=await next('start',f.app),result=await post(new Request('https://jobguard.invalid',{method:'POST',body:'{'}),{params:Promise.resolve({connectionId:'id'})});
  expect(result.body).toEqual({version:'oidc-error.v1',code:'OIDC_REFUSED'});expect(result.options).toEqual({status:403,headers:{'Cache-Control':'no-store'}});
 });
 it('duplicate cookies cannot select a browser binding',()=>{expect(oidcBrowserCookie('jobguard_oidc_state=a; jobguard_oidc_state=b')).toBeUndefined();});
 it('redacts and audits Nest parser errors that occur before the controller',async()=>{
  const f=fixture(),json=vi.fn(),response={setHeader:vi.fn(),status:vi.fn(()=>({json}))};
  const filter=new OidcParseExceptionFilter(()=>f.app as unknown as OidcApplication,{} as HttpAdapterHost);
  const host={switchToHttp:()=>({getRequest:()=>({path:'/auth/oidc/id/callback'}),getResponse:()=>response})} as unknown as ArgumentsHost;
  await filter.catch(new BadRequestException('raw parser secret'),host);
  expect(f.app.refuseInput).toHaveBeenCalledWith('id');expect(response.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
  expect(json).toHaveBeenCalledWith({version:'oidc-error.v1',code:'OIDC_REFUSED'});
 });

 it('keeps the existing Nest handling for non-OIDC parser failures',async()=>{
  const f=fixture(),error=new BadRequestException('existing response');
  const forward=vi.spyOn(BaseExceptionFilter.prototype,'catch').mockImplementation(()=>{});
  const host={switchToHttp:()=>({getRequest:()=>({path:'/auth/sso/id/callback'})})} as unknown as ArgumentsHost;
  try {await new OidcParseExceptionFilter(()=>f.app as unknown as OidcApplication,{} as HttpAdapterHost).catch(error,host);expect(forward).toHaveBeenCalledWith(error,host);expect(f.app.refuseInput).not.toHaveBeenCalled();}
  finally{forward.mockRestore();}
 });

});
