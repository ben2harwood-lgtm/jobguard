import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { ModuleKind, transpileModule } from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import type { DeploymentMode } from '@jobguard/config';
import { ScimApplication } from './scim.application.js';
import { ScimController } from './scim.controller.js';
import { ScimError, scimBearerFor, scimStatus, scimUnparsedBody } from './scim.contracts.js';
const id=randomUUID(),raw=()=>({version:'scim-deactivation.v1',eventId:randomUUID(),subject:'fictional-subject',active:false});
async function nextRoute(application:()=>ScimApplication) {
 const source=await readFile(new URL('../../../../web/app/api/auth/scim/[connectionId]/deactivations/route.ts',import.meta.url),'utf8');
 const exports:Record<string,any>={};
 runInNewContext(transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS}}).outputText,{exports,require:(name:string)=>{
  if(name==='next/server')return {NextResponse:{json:(body:unknown,options:ResponseInit={})=>new Response(JSON.stringify(body),{...options,headers:{...options.headers,'Content-Type':'application/json'}})}};
  if(name==='@jobguard/api/workspace')return {createWorkspaceApplication:()=>({scim:application()}),scimStatus,scimUnparsedBody};
  if(name.endsWith('identity-server'))return {identityApplication:()=>({})};
  if(name.endsWith('synthetic-server'))return {syntheticPool:()=>({})};
  throw new Error('unexpected import');
 }});
 return exports.POST as (request:Request,context:{params:Promise<{connectionId:string}>})=>Promise<Response>;
}
const negatives=['missing','empty','Basic','lowercase','wrong','changed','trailing','trailing newline','second word','other connection','other seed','seed presented','invalid connection','unset','pilot','production','missing mode','owner cookie','admin cookie'] as const;
function setup(name:string) {
 const seed=randomBytes(32).toString('base64url'),bearer=scimBearerFor(seed,id);
 let header:string|undefined=['Bearer',bearer].join(' '),connectionId:string=id,mode:DeploymentMode='synthetic_demo',configured=seed;
 switch(name) {
 case 'missing':case 'owner cookie':case 'admin cookie':header=undefined;break;
 case 'empty':header='';break;
 case 'Basic':header=['Basic',bearer].join(' ');break;
 case 'lowercase':header=['bearer',bearer].join(' ');break;
 case 'wrong':header=['Bearer','x'.repeat(43)].join(' ');break;
 case 'changed':header=['Bearer',(bearer[0]==='x'?'y':'x')+bearer.slice(1)].join(' ');break;
 case 'trailing':header+=' ';break;
 case 'trailing newline':header+='\n';break;
 case 'second word':header+=' extra';break;
 case 'other connection':header=['Bearer',scimBearerFor(seed,randomUUID())].join(' ');break;
 case 'other seed':header=['Bearer',scimBearerFor(randomBytes(32).toString('base64url'),id)].join(' ');break;
 case 'seed presented':header=['Bearer',seed].join(' ');break;
 case 'invalid connection':connectionId='invalid';header=['Bearer',scimBearerFor(seed,connectionId)].join(' ');break;
 case 'unset':configured='unset';break;
 case 'pilot':mode='pilot_no_charge';break;
 case 'production':mode='production_billing';break;
 case 'missing mode':mode=undefined as unknown as DeploymentMode;break;
 }
 const repository={deactivate:vi.fn(),refusal:vi.fn().mockResolvedValue(undefined)};
 return {header,connectionId,repository,service:new ScimApplication(repository,mode,configured)};
}
function nestRequest(header:string|undefined) {return {headers:{authorization:header,cookie:['jobguard_session','c'.repeat(43)].join('='),origin:'https://unrelated.invalid','x-csrf-token':'c'.repeat(32),'x-tenant-id':randomUUID()}};}
describe('SCIM transports share the one application',()=>{
 it.each(negatives)('[A2] Nest %s returns only the identical refusal',async name=>{
  const f=setup(name),controller=new ScimController(()=>f.service),error=await controller.deactivate(f.connectionId,raw(),nestRequest(f.header)).catch(e=>e);
  expect(error.getResponse()).toEqual({code:'SCIM_REFUSED'});expect(error.getStatus()).toBe(403);
  expect(f.repository.deactivate).not.toHaveBeenCalled();expect(f.repository.refusal).toHaveBeenCalledTimes(1);expect(f.repository.refusal.mock.calls[0]?.[0]).toBe('scim');
 });
 it.each([...negatives,'not JSON'])('[A2] Next %s returns only the identical refusal with no cookie or challenge',async name=>{
  const f=setup(name==='not JSON'?'missing':name),route=await nextRoute(()=>f.service);
  // Supply the adapter-visible header exactly: Fetch Headers normalizes surrounding whitespace.
  const supplied=nestRequest(f.header).headers as Record<string,string|undefined>;
  const request={headers:{get:(name:string)=>supplied[name]??null},json:async()=>{if(name==='not JSON')throw new SyntaxError('invalid');return raw();}} as unknown as Request;
  const response=await route(request,{params:Promise.resolve({connectionId:f.connectionId})});
  expect(response.status).toBe(403);expect(await response.json()).toEqual({code:'SCIM_REFUSED'});expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Set-Cookie')).toBeNull();expect(response.headers.get('WWW-Authenticate')).toBeNull();
  expect(f.repository.deactivate).not.toHaveBeenCalled();expect(f.repository.refusal).toHaveBeenCalledTimes(1);expect(f.repository.refusal.mock.calls[0]?.[0]).toBe('scim');
 });
 it('[A2] both transports retain identical refusal when its insert fails',async()=>{
  const f=setup('missing');f.repository.refusal.mockRejectedValue(new Error('internal'));
  const error=await new ScimController(()=>f.service).deactivate(id,raw(),nestRequest(undefined)).catch(e=>e);
  const route=await nextRoute(()=>f.service),response=await route({headers:new Headers(),json:async()=>raw()} as unknown as Request,{params:Promise.resolve({connectionId:id})});
  expect(error.getResponse()).toEqual(await response.json());expect(response.status).toBe(error.getStatus());expect(f.repository.refusal).toHaveBeenCalledTimes(2);
 });
 it('[A5] Nest and Next pass only path, authorization and raw body',async()=>{
  const input=raw(),presented=['Bearer','x'.repeat(43)].join(' '),deactivate=vi.fn().mockResolvedValue({version:'scim-deactivation-result.v1'}),service={deactivate} as unknown as ScimApplication;
  await new ScimController(()=>service).deactivate(id,input,nestRequest(presented));
  const route=await nextRoute(()=>service);const response=await route({headers:new Headers(nestRequest(presented).headers as Record<string,string>),json:async()=>input} as unknown as Request,{params:Promise.resolve({connectionId:id})});
  expect(response.status).toBe(200);expect(deactivate.mock.calls).toEqual([[id,presented,input],[id,presented,input]]);
  expect(Reflect.getMetadata('__headers__',ScimController.prototype.deactivate)).toEqual([{name:'Cache-Control',value:'no-store'}]);
 });
 it('[A5] Next forwards invalid JSON sentinel through the proved service',async()=>{
  const f=setup('valid'),route=await nextRoute(()=>f.service),response=await route({headers:new Headers({authorization:f.header!}),json:async()=>{throw new SyntaxError('invalid');}} as unknown as Request,{params:Promise.resolve({connectionId:id})});
  expect(response.status).toBe(400);expect(await response.json()).toEqual({code:'INVALID_SCIM_INPUT'});expect(f.repository.refusal).toHaveBeenCalledExactlyOnceWith(id,'INVALID_SCIM_INPUT');
 });
 it.each([['SCIM_REFUSED',403],['INVALID_SCIM_INPUT',400],['SCIM_EVENT_CONFLICT',409],['SCIM_UNAVAILABLE',503]] as const)('[A5] both transports map %s to %s with code only',async(code,status)=>{
  const service={deactivate:async()=>{throw new ScimError(code);}} as unknown as ScimApplication;
  const error=await new ScimController(()=>service).deactivate(id,raw(),nestRequest(undefined)).catch(e=>e);
  const route=await nextRoute(()=>service),response=await route({headers:new Headers(),json:async()=>raw()} as unknown as Request,{params:Promise.resolve({connectionId:id})});
  expect(error.getStatus()).toBe(status);expect(error.getResponse()).toEqual({code});expect(response.status).toBe(status);expect(await response.json()).toEqual({code});
 });
 it('[A5] service-construction errors expose only the public refusal on either transport',async()=>{
  const build=()=>{throw new Error('PostgreSQL internal detail');};
  const error=await new ScimController(build).deactivate(id,raw(),nestRequest(undefined)).catch(e=>e);
  const route=await nextRoute(build),response=await route({headers:new Headers(),json:async()=>raw()} as unknown as Request,{params:Promise.resolve({connectionId:id})});
  expect(error.getStatus()).toBe(403);expect(error.getResponse()).toEqual({code:'SCIM_REFUSED'});expect(response.status).toBe(403);expect(await response.json()).toEqual({code:'SCIM_REFUSED'});
 });
});
