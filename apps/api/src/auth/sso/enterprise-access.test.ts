import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { VerifiedTenantContext } from '@jobguard/db';
import { EnterpriseAccessApplication } from './enterprise-access.application.js';
const user={schemas:['urn:ietf:params:scim:schemas:core:2.0:User'],externalId:'fictional-subject',userName:'person@site.invalid',active:true};
const context={tenantId:randomUUID()} as VerifiedTenantContext;
const actor={sessionDigest:'a'.repeat(64),csrfToken:'c'.repeat(32)};
function fixture(mode:'synthetic_demo'|'pilot_no_charge'='synthetic_demo') {
 const repository={emergency:vi.fn(async()=>({})),configure:vi.fn(async()=>{}),scim:vi.fn(async(..._args:unknown[]):Promise<unknown>=>({}))};
 return {repository,app:new EnterpriseAccessApplication(repository,mode)};
}
const request=(extra={})=>({version:'scim2-request.v1',bindingId:randomUUID(),method:'POST',kind:'Users',eventId:randomUUID(),body:user,...extra});
describe('ENT-10-rest DARK boundaries',()=>{
 it('refuses live modes before any database access',async()=>{
  const f=fixture('pilot_no_charge');
  await expect(f.app.scim('Bearer '+'x'.repeat(43),request())).rejects.toHaveProperty('code','ACCESS_REFUSED');
  await expect(f.app.emergency(context,actor,{version:'emergency.v1',operation:'notices'})).rejects.toHaveProperty('code','ACCESS_REFUSED');
  expect(f.repository.scim).not.toHaveBeenCalled();expect(f.repository.emergency).not.toHaveBeenCalled();
 });
 it.each([{actor:randomUUID()},{tenantId:randomUUID()},{owner:true},{roles:['owner']}])('rejects forged SCIM authority %j',async extra=>{
  const f=fixture();await expect(f.app.scim('Bearer '+'x'.repeat(43),request({body:{...user,...extra}}))).rejects.toHaveProperty('code','INVALID_ACCESS_INPUT');
  expect(f.repository.scim).not.toHaveBeenCalled();
 });
 it.each([undefined,'Bearer bad','bearer '+'x'.repeat(43),'Bearer '+'x'.repeat(43)+'\n'])('rejects malformed bearer',async header=>{
  const f=fixture();await expect(f.app.scim(header,request())).rejects.toHaveProperty('code','ACCESS_REFUSED');expect(f.repository.scim).not.toHaveBeenCalled();
 });
 it('POST retries derive the same resource ID from the caller event ID',async()=>{
  const f=fixture(),input=request();await f.app.scim('Bearer '+'x'.repeat(43),input);await f.app.scim('Bearer '+'x'.repeat(43),input);
  expect(f.repository.scim.mock.calls[0]).toEqual(f.repository.scim.mock.calls[1]);
  expect(f.repository.scim.mock.calls[0]?.[2]).toMatchObject({id:input.eventId,kind:'Users'});
 });
 it('PATCH active false preserves the raw operation for atomic replay and version checking',async()=>{
  const f=fixture();f.repository.scim.mockResolvedValueOnce({...user,id:randomUUID(),meta:{version:'W/"1"'}});
  await f.app.scim('Bearer '+'x'.repeat(43),request({method:'PATCH',id:randomUUID(),expectedRevision:1,body:{schemas:['urn:ietf:params:scim:api:messages:2.0:PatchOp'],Operations:[{op:'replace',path:'active',value:false}]}}));
  expect(f.repository.scim.mock.calls[0]?.[2]).toMatchObject({method:'PATCH',expectedRevision:1,document:{Operations:[{op:'replace',path:'active',value:false}]}});
 });
 it('stale PATCH cannot overwrite newer provider state',async()=>{
  const f=fixture();f.repository.scim.mockRejectedValueOnce(new Error('SCIM_STALE'));
  await expect(f.app.scim('Bearer '+'x'.repeat(43),request({method:'PATCH',id:randomUUID(),expectedRevision:1,body:{schemas:['urn:ietf:params:scim:api:messages:2.0:PatchOp'],Operations:[{op:'replace',path:'active',value:false}]}}))).rejects.toHaveProperty('code','SCIM_STALE');
  expect(f.repository.scim).toHaveBeenCalledOnce();
 });
 it.each(['extend','set_owner','rewrite_journal'])('has no emergency %s command',async operation=>{
  const f=fixture();await expect(f.app.emergency(context,actor,{version:'emergency.v1',operation,requestId:randomUUID()})).rejects.toHaveProperty('code','INVALID_ACCESS_INPUT');expect(f.repository.emergency).not.toHaveBeenCalled();
 });
 it('preserves caller context and session proof; rejects forged actor fields',async()=>{
  const f=fixture(),input={version:'emergency.v1',operation:'approve',requestId:randomUUID()};
  await f.app.emergency(context,actor,input);expect(f.repository.emergency).toHaveBeenCalledWith(context,actor,input);
  await expect(f.app.emergency(context,actor,{...input,approver:randomUUID()})).rejects.toHaveProperty('code','INVALID_ACCESS_INPUT');
 });
 it('redacts driver and credential failures',async()=>{
  const f=fixture();f.repository.scim.mockRejectedValue(new Error('secret token email raw sql'));
  const error=await f.app.scim('Bearer '+'x'.repeat(43),request()).catch((e:unknown)=>e);
  expect(error).toHaveProperty('code','ACCESS_UNAVAILABLE');expect(JSON.stringify(error)).not.toContain('secret');
 });
});

import { Scim2Controller } from './scim2.controller.js';
describe('dark SCIM HTTP transport',()=>{
 it('maps Users creation to a SCIM response and ETag without registering a provider',async()=>{
  const f=fixture();f.repository.scim.mockResolvedValue({id:randomUUID(),meta:{version:'W/"1"'}});
  const response={status:vi.fn(),setHeader:vi.fn()},controller=new Scim2Controller(()=>f.app);
  const result=await controller.collection(randomUUID(),'Users',user,{method:'POST',url:'/scim/v2/fixture/Users',headers:{authorization:'Bearer '+'x'.repeat(43),'x-request-id':randomUUID()}},response as never);
  expect(result).toHaveProperty('meta.version','W/"1"');expect(response.status).toHaveBeenCalledWith(201);expect(response.setHeader).toHaveBeenCalledWith('Content-Type','application/scim+json');expect(response.setHeader).toHaveBeenCalledWith('ETag','W/"1"');
 });
 it('rejects resources outside Users/Groups and unsupported query syntax',async()=>{
  const f=fixture(),controller=new Scim2Controller(()=>f.app),response={status:vi.fn(),setHeader:vi.fn()};
  await expect(controller.collection(randomUUID(),'Owners',{}, {method:'GET',url:'/scim/v2/fixture/Owners',headers:{}},response as never)).rejects.toHaveProperty('status',404);
  await expect(controller.collection(randomUUID(),'Users',{}, {method:'GET',url:'/scim/v2/fixture/Users?filter=owner',headers:{}},response as never)).rejects.toHaveProperty('status',400);
  expect(f.repository.scim).not.toHaveBeenCalled();
 });
});
