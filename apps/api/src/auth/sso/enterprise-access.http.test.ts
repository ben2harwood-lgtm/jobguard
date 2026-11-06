import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { EnterpriseAccessRepository, IdentityRepository } from '@jobguard/db';
import type { Pool } from 'pg';
import { PersistedAuthProvider } from '../persisted-auth-provider.js';
import { emergencyOwnerPost } from './enterprise-access.http.js';
import { SsoRequiredController } from './sso-required.controller.js';
import type { SsoRequiredApplication } from './sso-required.application.js';
const tenant=randomUUID(),origin='https://jobguard.invalid',csrf='c'.repeat(32),token='s'.repeat(43);
const command={version:'emergency.v1',operation:'request',requestId:randomUUID(),reasonHash:'a'.repeat(64)};
function fixture() {
 const base=new PersistedAuthProvider(new IdentityRepository({} as Pool),'fictional-secret-longer-than-thirty-two');
 const authenticate=vi.spyOn(base,'authenticate').mockResolvedValue({identityUserId:randomUUID(),sessionId:randomUUID(),csrfToken:csrf});
 const memberships=vi.spyOn(base,'memberships').mockResolvedValue([{id:randomUUID(),identityUserId:randomUUID(),tenantId:tenant,role:'owner',email:'owner@fixture.invalid',name:'Fictional'}]);
 const emergency=vi.spyOn(EnterpriseAccessRepository.prototype,'emergency').mockResolvedValue({operation:'request'});
 const credentials={sessionToken:token,csrfToken:csrf,origin,tenantHeader:tenant};
 const call=(input:unknown={version:'emergency-route.v1',requested_tenant_id:tenant,command},proof=credentials,mode='synthetic_demo',operation='request')=>
  emergencyOwnerPost(new Request(origin+'/api/auth/sso-required/emergency-actions/'+operation,{method:'POST',body:JSON.stringify(input)}),operation,proof,base,origin,mode as 'synthetic_demo');
 return {base,authenticate,memberships,emergency,credentials,call};
}
describe('ENT-10 emergency owner POST boundary',()=>{
 it('binds verified owner context and actual proof; no-store on success',async()=>{
  const f=fixture();const response=await f.call();expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  expect(f.emergency).toHaveBeenCalledWith(expect.objectContaining({tenantId:tenant}),{sessionDigest:f.base.digest(`session:${token}`),csrfToken:csrf},command);vi.restoreAllMocks();
 });
 it.each(['missing-csrf','wrong-csrf','origin','tenant','expired-session','removed-member','non-owner','production','forged-command','notices','path-mismatch','version'])('refuses %s without calling emergency repository',async attack=>{
  const f=fixture();let proof={...f.credentials},mode='synthetic_demo',input:unknown={version:'emergency-route.v1',requested_tenant_id:tenant,command},operation='request';
  if(attack==='missing-csrf')proof.csrfToken='';if(attack==='wrong-csrf')proof.csrfToken='wrong';
  if(attack==='origin')proof.origin='https://other.invalid';if(attack==='tenant')proof.tenantHeader=randomUUID();
  if(attack==='expired-session')f.authenticate.mockResolvedValue(undefined);
  if(attack==='removed-member')f.memberships.mockResolvedValue([]);
  if(attack==='non-owner')f.memberships.mockResolvedValue([{id:randomUUID(),identityUserId:randomUUID(),tenantId:tenant,role:'admin',email:'admin@fixture.invalid',name:'Fictional'}]);
  if(attack==='production')mode='production';
  if(attack==='forged-command')input={version:'emergency-route.v1',requested_tenant_id:tenant,command:{...command,actor:randomUUID()}};
  if(attack==='notices')operation='notices';if(attack==='path-mismatch')operation='approve';if(attack==='version')input={version:'bad'};
  const response=await f.call(input,proof,mode,operation);expect(response.status).toBe(403);expect(await response.json()).toEqual({code:'SSO_EMERGENCY_REFUSED'});expect(response.headers.get('cache-control')).toBe('no-store');expect(f.emergency).not.toHaveBeenCalled();vi.restoreAllMocks();
 });
 it('retired Nest and Next handlers refuse without constructing an application or reading a body',async()=>{
  const factory=vi.fn(()=>{throw new Error('must never run');});
  const controller=new SsoRequiredController(factory as ()=>SsoRequiredApplication);
  await expect(controller.emergency(command,{headers:{origin}})).rejects.toHaveProperty('status',403);expect(factory).not.toHaveBeenCalled();
  const path='../../../../web/app/api/auth/sso-required/emergency/route.ts';
  const {POST}=await import(new URL(path,import.meta.url).href);
  const request=new Request(origin,{method:'POST',body:'not even JSON'}),read=vi.spyOn(request,'json');
  const response=await POST(request);expect(response.status).toBe(403);expect(await response.json()).toEqual({code:'SSO_EMERGENCY_REFUSED'});expect(response.headers.get('cache-control')).toBe('no-store');expect(read).not.toHaveBeenCalled();
 });
});
