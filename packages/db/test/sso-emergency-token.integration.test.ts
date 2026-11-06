/** LATER-SAFETY-25 RED: real PostgreSQL regressions; fictional identities only. */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EnterpriseAccessRepository } from '../src/enterprise-access-repository.js';
import { createScimHarness, fixture, person, auditRows, type ScimHarness, type ScimFixture } from './scim-fixtures.js';
import { testTenantContext } from './tenant-context-test-utils.js';
let h:ScimHarness, repo:EnterpriseAccessRepository;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const request=(requestId:string,operation:string,extra={})=>({version:'emergency.v1',operation,requestId,...extra});
const proof=(token:string,csrfToken:string)=>({sessionDigest:h.provider.digest(`session:${token}`),csrfToken});
const requester=(f:ScimFixture)=>proof(f.ordinary.sessionToken,f.ordinary.csrfToken);
const call=(f:ScimFixture,actor:ReturnType<typeof proof>,input:unknown)=>repo.emergency(testTenantContext(f.principal.tenantId),actor,input);
async function owner(f:ScimFixture) {
 const p=await person(f,'read_only');
 await h.admin.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,p.membershipId]);
 return {...p,proof:proof(p.ordinary.sessionToken,p.ordinary.csrfToken)};
}
async function approved(count:number) {
 const f=await fixture(h),id=randomUUID(),actor=requester(f),owners=[];
 await call(f,actor,request(id,'request',{reasonHash:hash('Fictional recovery')}));
 for(let i=0;i<count;i++) {
  const o=await owner(f);owners.push(o);
  await call(f,o.proof,request(id,'approve'));
 }
 return {f,id,actor,owners};
}
beforeAll(async()=>{
 h=await createScimHarness('later-safety-25-');
 repo=new EnterpriseAccessRepository(h.identity,h.identity);
},120000);
afterAll(async()=>{await h?.close();});
describe('LATER-SAFETY-25 server-minted emergency capability',()=>{
 it.each([2,3])('%i other owners permit opening; only a hash persists and the raw token is returned once',async count=>{
  const {f,id,actor,owners}=await approved(count);
  await expect(call(f,actor,request(id,'open',{tokenHash:'a'.repeat(64)}))).rejects.toHaveProperty('code','22023');
  await expect(call(f,actor,request(id,'open',{token:'a'.repeat(64)}))).rejects.toHaveProperty('code','42501');
  await expect(call(f,owners[0]!.proof,request(id,'open'))).rejects.toHaveProperty('code','42501');
  await expect(call(f,{...actor,csrfToken:'wrong'},request(id,'open'))).rejects.toHaveProperty('code','42501');
  await expect(call(f,{...actor,sessionDigest:'0'.repeat(64)},request(id,'open'))).rejects.toHaveProperty('code','42501');
  const opened=await call(f,actor,request(id,'open')) as {token:string;expiresAt:string};
  expect(opened.token).toMatch(/^[a-f0-9]{64}$/u);
  const row=(await h.admin.query('SELECT token_hash,expires_at-opened_at duration FROM identity.emergency_session WHERE tenant_id=$1 AND request_id=$2',[f.principal.tenantId,id])).rows[0];
  expect(row.token_hash).toBe(hash(opened.token));expect(row.token_hash).not.toBe(opened.token);expect(row.duration.hours).toBe(1);
  await expect(call(f,actor,request(id,'open'))).rejects.toHaveProperty('code','42501');
  for(const operation of ['inspect','revoke_member']) {
   const extra=operation==='revoke_member'?{targetMembershipId:f.principal.membershipId}:{};
   await expect(call(f,actor,request(id,operation,{...extra,tokenHash:row.token_hash}))).rejects.toHaveProperty('code','22023');
   for(const token of ['0'.repeat(64),row.token_hash])
    await expect(call(f,actor,request(id,operation,{...extra,token}))).rejects.toHaveProperty('code','42501');
  }
  await expect(call(f,owners[0]!.proof,request(id,'inspect',{token:opened.token}))).rejects.toHaveProperty('code','42501');
  const result=await call(f,actor,request(id,'inspect',{token:opened.token}));
  expect(result).not.toHaveProperty('token');
  const member=await person(f,'finance');
  await call(f,actor,request(id,'revoke_member',{token:opened.token,targetMembershipId:member.membershipId}));
  expect((await h.admin.query('SELECT revoked_at IS NOT NULL revoked FROM app.membership WHERE tenant_id=$1 AND id=$2',[f.principal.tenantId,member.membershipId])).rows[0].revoked).toBe(true);
  const audit=await auditRows(h,f.principal.tenantId);
  for(const op of ['request','approve','open','inspect','revoke_member'])expect(audit.some(e=>e.event_type===`sso.emergency.${op}`)).toBe(true);
  expect(JSON.stringify(audit)).not.toContain(opened.token);
 });
 it('zero or one approval refuses; requester approval and duplicate approvals never count',async()=>{
  const {f,id,actor,owners}=await approved(1);
  await expect(call(f,actor,request(id,'approve'))).rejects.toHaveProperty('code','42501');
  await expect(call(f,owners[0]!.proof,request(id,'approve'))).rejects.toHaveProperty('code','23505');
  await expect(call(f,actor,request(id,'open'))).rejects.toHaveProperty('code','42501');
  // Privileged fixture injects a self-approval to prove the opening count independently excludes it.
  await h.admin.query('INSERT INTO identity.emergency_approval VALUES($1,$2,$3,$4)',[f.principal.tenantId,id,f.principal.membershipId,f.principal.identityUserId]);
  await expect(call(f,actor,request(id,'open'))).rejects.toHaveProperty('code','42501');
  const empty=await approved(0);
  await expect(call(empty.f,empty.actor,request(empty.id,'open'))).rejects.toHaveProperty('code','42501');
 });
 it.each(['revoked','expired','non-owner'])('a %s approver is no longer counted',async state=>{
  const {f,id,actor,owners}=await approved(2);
  const clause=state==='revoked'?"revoked_at=clock_timestamp()":state==='expired'?"expires_at=clock_timestamp()-interval '1 second'":"role='read_only'";
  await h.admin.query(`UPDATE app.membership SET ${clause} WHERE tenant_id=$1 AND id=$2`,[f.principal.tenantId,owners[0]!.membershipId]);
  await expect(call(f,actor,request(id,'open'))).rejects.toHaveProperty('code','42501');
 });
 it('expired requests and expired sessions still refuse',async()=>{
  const {f,actor}=await approved(0),expired=randomUUID(),session=randomUUID(),token='b'.repeat(64);
  await h.admin.query("INSERT INTO identity.emergency_request VALUES($1,$2,$3,$4,transaction_timestamp()-interval '16 minutes',transaction_timestamp()-interval '16 minutes'+interval '15 minutes')",[f.principal.tenantId,expired,f.principal.membershipId,hash('expired')]);
  await expect(call(f,actor,request(expired,'open'))).rejects.toHaveProperty('code','42501');
  await call(f,actor,request(session,'request',{reasonHash:hash('expired session')}));
  // Immutable fixtures use one timestamp for the exact one-hour constraint.
  await h.admin.query("INSERT INTO identity.emergency_session SELECT $1,$2,$3,t,t+interval '1 hour' FROM (SELECT transaction_timestamp()-interval '61 minutes' t) clock",[f.principal.tenantId,session,hash(token)]);
  await expect(call(f,actor,request(session,'inspect',{token}))).rejects.toHaveProperty('code','42501');
 });
});
