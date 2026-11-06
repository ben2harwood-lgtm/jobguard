import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { VerifiedTenantContext } from '@jobguard/db';
import { EnterpriseAccessApplication } from './enterprise-access.application.js';
const context={tenantId:randomUUID()} as VerifiedTenantContext;
const actor={sessionDigest:'a'.repeat(64),csrfToken:'c'.repeat(32)};
const request=(operation:string,extra={})=>({version:'emergency.v1',requestId:randomUUID(),operation,...extra});
function fixture() {
 const emergency=vi.fn(async()=>({token:'b'.repeat(64)}));
 return {emergency,app:new EnterpriseAccessApplication({emergency,configure:vi.fn(),scim:vi.fn()},'synthetic_demo')};
}
describe('LATER-SAFETY-25 emergency API token boundary',()=>{
 it('opens without caller-chosen credentials and returns the server token',async()=>{
  const f=fixture(),raw=request('open');
  expect(await f.app.emergency(context,actor,raw)).toEqual({token:'b'.repeat(64)});
  expect(f.emergency).toHaveBeenCalledExactlyOnceWith(context,actor,raw);
 });
 it.each(['open','inspect','revoke_member'])('refuses caller-supplied tokenHash on %s before SQL',async operation=>{
  const f=fixture();
  await expect(f.app.emergency(context,actor,request(operation,{tokenHash:'a'.repeat(64),...(operation==='revoke_member'?{targetMembershipId:randomUUID()}:{})}))).rejects.toHaveProperty('code','INVALID_ACCESS_INPUT');
  expect(f.emergency).not.toHaveBeenCalled();
 });
 it.each(['inspect','revoke_member'])('passes raw token for %s with the existing session proof',async operation=>{
  const f=fixture(),raw=request(operation,{token:'b'.repeat(64),...(operation==='revoke_member'?{targetMembershipId:randomUUID()}:{})});
  await f.app.emergency(context,actor,raw);
  expect(f.emergency).toHaveBeenCalledExactlyOnceWith(context,actor,raw);
 });
 it('refuses a caller-selected token at open',async()=>{
  const f=fixture();
  await expect(f.app.emergency(context,actor,request('open',{token:'b'.repeat(64)}))).rejects.toHaveProperty('code','INVALID_ACCESS_INPUT');
  expect(f.emergency).not.toHaveBeenCalled();
 });
});
