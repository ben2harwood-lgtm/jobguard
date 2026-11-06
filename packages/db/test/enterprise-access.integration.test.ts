/** RED CI proof: real PostgreSQL, fictional identities, no real provider. Not runnable in the builder sandbox. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EnterpriseIdentityRepository } from '../src/enterprise-identity-repository.js';
import { EnterpriseAccessRepository } from '../src/enterprise-access-repository.js';
import { EnterpriseAccessApplication } from '../../../apps/api/src/auth/sso/enterprise-access.application.js';
import { createScimHarness, fixture, person, auditRows, type ScimHarness, type ScimFixture } from './scim-fixtures.js';
import { testTenantContext } from './tenant-context-test-utils.js';
let h:ScimHarness,machine:Pool,repo:EnterpriseAccessRepository,app:EnterpriseAccessApplication;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const actor=(token:string,csrfToken:string)=>({sessionDigest:h.provider.digest(`session:${token}`),csrfToken});
const emergency=(f:ScimFixture,proof:ReturnType<typeof actor>,input:unknown)=>app.emergency(testTenantContext(f.principal.tenantId),proof,input);
const request=(requestId:string,operation:string,extra={})=>({version:'emergency.v1',operation,requestId,...extra});
beforeAll(async()=>{
 h=await createScimHarness('ent10-rest-');
 await h.admin.query('CREATE ROLE ent10_rest_machine LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_scim TO ent10_rest_machine');
 const credential=randomBytes(32).toString('hex');
 await h.admin.query(`ALTER ROLE ent10_rest_machine PASSWORD '${credential}'`);
 machine=new Pool({...h.admin.options,user:'ent10_rest_machine',password:credential,max:2});
 repo=new EnterpriseAccessRepository(h.identity,machine);app=new EnterpriseAccessApplication(repo,'synthetic_demo');
},120000);
afterAll(async()=>{await machine?.end();await h?.close();});
async function owner(f:ScimFixture) {
 const p=await person(f,'read_only');
 await h.admin.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,p.membershipId]);
 return {...p,proof:actor(p.ordinary.sessionToken,p.ordinary.csrfToken)};
}
async function machineFixture() {
 const f=await fixture(h),bindingId=randomUUID(),token=randomBytes(32).toString('base64url');
 await app.configure(testTenantContext(f.principal.tenantId),actor(f.ordinary.sessionToken,f.ordinary.csrfToken),
  {version:'scim2-config.v1',bindingId,connectionId:f.connectionId,enabled:true,tokenHash:hash(token)});
 const call=(input:Record<string,unknown>)=>app.scim(`Bearer ${token}`,{version:'scim2-request.v1',bindingId,...input});
 const create=(eventId=randomUUID())=>call({method:'POST',kind:'Users',eventId,body:{schemas:['urn:ietf:params:scim:schemas:core:2.0:User'],externalId:eventId,userName:`${eventId}@${f.domain}`,active:true}});
 return {f,bindingId,token,call,create};
}
describe('ENT-10-rest dual-owner emergency capability',()=>{
 it('requires two different other owners; denies self, duplicate, wrong tenant and forged actor; opens exactly one hour',async()=>{
  const f=await fixture(h),a=await owner(f),b=await owner(f),other=await fixture(h),id=randomUUID();
  const requester=actor(f.ordinary.sessionToken,f.ordinary.csrfToken);
  await emergency(f,requester,request(id,'request',{reasonHash:hash('fictional emergency')}));
  await expect(emergency(f,requester,request(id,'approve'))).rejects.toHaveProperty('code','ACCESS_REFUSED');
  await expect(emergency(f,a.proof,{...request(id,'approve'),actor:f.principal.membershipId})).rejects.toHaveProperty('code','INVALID_ACCESS_INPUT');
  await expect(emergency(other,a.proof,request(id,'approve'))).rejects.toHaveProperty('code','ACCESS_REFUSED');
  await emergency(f,a.proof,request(id,'approve'));
  await expect(emergency(f,a.proof,request(id,'approve'))).rejects.toThrow();
  await expect(emergency(f,requester,request(id,'open'))).rejects.toHaveProperty('code','ACCESS_REFUSED');
  await emergency(f,b.proof,request(id,'approve'));
  const {token}=await emergency(f,requester,request(id,'open')) as {token:string};
  const stored=(await h.admin.query('SELECT expires_at-opened_at duration FROM identity.emergency_session WHERE tenant_id=$1 AND request_id=$2',[f.principal.tenantId,id])).rows[0];
  expect(stored.duration.hours).toBe(1);
  await expect(emergency(f,requester,request(id,'open'))).rejects.toHaveProperty('code','ACCESS_REFUSED');
  await expect(emergency(f,a.proof,request(id,'inspect',{token}))).rejects.toHaveProperty('code','ACCESS_REFUSED');
  await expect(emergency(f,requester,request(id,'inspect',{token:'0'.repeat(64)}))).rejects.toHaveProperty('code','ACCESS_REFUSED');
  await emergency(f,requester,request(id,'inspect',{token}));
  await expect(emergency(f,requester,request(id,'revoke_member',{token,targetMembershipId:f.principal.membershipId}))).rejects.toHaveProperty('code','ACCESS_REFUSED');
  const identity=new EnterpriseIdentityRepository(h.identity);
  const before=await identity.view(testTenantContext(f.principal.tenantId),requester.sessionDigest);
  expect(before.events.map(e=>e.event_type)).toContain('sso.emergency.request');
  for(const proof of [requester,a.proof,b.proof]) {
   const notices=await emergency(f,proof,{version:'emergency.v1',operation:'notices'}) as {notices:unknown[]};
   expect(notices.notices).toHaveLength(5);
   const after=await identity.view(testTenantContext(f.principal.tenantId),requester.sessionDigest);
   expect(after.events).toEqual(before.events);
   expect(after.events.some(e=>e.event_type==='sso.emergency.notices')).toBe(false);
  }
  const audit=await auditRows(h,f.principal.tenantId);
  expect(audit.filter(r=>r.event_type==='sso.emergency.notices').map(r=>r.payload.references.membershipId).sort()).toEqual([f.principal.membershipId,a.membershipId,b.membershipId].sort());
  for(const operation of ['request','approve','open','inspect'])expect(audit.some(r=>r.event_type===`sso.emergency.${operation}`)).toBe(true);
  expect((await h.admin.query('SELECT count(*)::int n FROM identity.sso_emergency_window WHERE tenant_id=$1',[f.principal.tenantId])).rows[0].n).toBe(0);
 });
 it('expired request and expired session refuse; emergency access can revoke only a non-owner',async()=>{
  const f=await fixture(h),a=await owner(f),b=await owner(f),p=await person(f,'finance');
  const requester=actor(f.ordinary.sessionToken,f.ordinary.csrfToken),id=randomUUID(),token=randomBytes(32).toString('hex');
  await emergency(f,requester,request(id,'request',{reasonHash:hash('expired fixture')}));
  // Owner-only insertion represents a clock that has passed one hour. No trigger disabling or mutated history.
  await h.admin.query("INSERT INTO identity.emergency_session VALUES($1,$2,$3,transaction_timestamp()-interval '61 minutes',transaction_timestamp()-interval '1 minute')",[f.principal.tenantId,id,hash(token)]);
  await expect(emergency(f,requester,request(id,'inspect',{token}))).rejects.toHaveProperty('code','ACCESS_REFUSED');
  const expired=randomUUID();
  await h.admin.query("INSERT INTO identity.emergency_request VALUES($1,$2,$3,$4,transaction_timestamp()-interval '16 minutes',transaction_timestamp()-interval '1 minute')",[f.principal.tenantId,expired,f.principal.membershipId,hash('expired request')]);
  await expect(emergency(f,a.proof,request(expired,'approve'))).rejects.toHaveProperty('code','ACCESS_REFUSED');
  const fresh=randomUUID();await emergency(f,requester,request(fresh,'request',{reasonHash:hash('revoke compromised fictional member')}));
  await emergency(f,a.proof,request(fresh,'approve'));await emergency(f,b.proof,request(fresh,'approve'));
  const {token:freshToken}=await emergency(f,requester,request(fresh,'open')) as {token:string};
  await emergency(f,requester,request(fresh,'revoke_member',{token:freshToken,targetMembershipId:p.membershipId}));
  expect(await h.provider.findMembership((await h.provider.authenticate(p.ordinary.sessionToken))!,f.principal.tenantId)).toBeUndefined();
  await auditRows(h,f.principal.tenantId);
 });
});
describe('ENT-10-rest SCIM machine provisioning',()=>{
 it('is OFF without an enabled binding; machine cannot use human routines or tables',async()=>{
  await expect(app.scim(`Bearer ${'x'.repeat(43)}`,{version:'scim2-request.v1',bindingId:randomUUID(),method:'GET',kind:'Users'})).rejects.toHaveProperty('code','ACCESS_REFUSED');
  const executable=(await h.admin.query("SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='identity' AND has_function_privilege('jobguard_scim',p.oid,'EXECUTE') ORDER BY 1")).rows.map(r=>r.proname);
  expect(executable).toEqual(['scim2_machine']);
  await expect(machine.query('SELECT * FROM identity.scim2_binding')).rejects.toHaveProperty('code','42501');
  await expect(machine.query('SELECT identity.dark_emergency(NULL,NULL,NULL,NULL)')).rejects.toHaveProperty('code','42501');
 });
 it('restores caller tenant and binding settings on reads, writes, replay and refusal',async()=>{
  const m=await machineFixture(),client=await machine.connect();
  const tenant=randomUUID(),binding=randomUUID(),event=randomUUID();
  const read={version:'scim2-machine.v1',method:'GET',kind:'Groups'};
  const write={...read,method:'POST',id:event,eventId:event,document:{schemas:['urn:ietf:params:scim:schemas:core:2.0:Group'],displayName:'Fictional crew',members:[]}};
  const settings=async()=>expect((await client.query("SELECT current_setting('app.tenant_id',true) tenant, current_setting('app.scim2_binding',true) binding")).rows[0]).toEqual({tenant,binding});
  const call=(input:unknown,token=m.token)=>client.query('SELECT identity.scim2_machine($1,$2,$3::jsonb)',[m.bindingId,token,JSON.stringify(input)]);
  try {
   await client.query('BEGIN');
   await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.scim2_binding',$2,true)",[tenant,binding]);
   for(const input of [read,write,write]) {await call(input);await settings();}
   await client.query('SAVEPOINT refusal');
   await expect(call(read,'invalid-token')).rejects.toHaveProperty('code','42501');
   await client.query('ROLLBACK TO SAVEPOINT refusal');await settings();
  } finally {await client.query('ROLLBACK');client.release();}
 },120000);
 it('creates a user, replays idempotently, rejects changed replay, manages a group, revokes next request immediately',async()=>{
  const m=await machineFixture(),event=randomUUID();
  const created=await m.create(event) as {id:string};expect(created.id).toBe(event);expect(await m.create(event)).toEqual(created);
  const linked=await m.f.signin(`${event}@${m.f.domain}`,event,false,['admin']);
  expect(await h.provider.authenticate(linked.sessionToken)).not.toBeUndefined();
  await expect(m.call({method:'POST',kind:'Users',eventId:event,body:{schemas:['urn:ietf:params:scim:schemas:core:2.0:User'],externalId:event,userName:`${event}@${m.f.domain}`,active:false}})).rejects.toHaveProperty('code','SCIM_CONFLICT');
  const group=randomUUID();await m.call({method:'POST',kind:'Groups',eventId:group,body:{schemas:['urn:ietf:params:scim:schemas:core:2.0:Group'],displayName:'Fictional crew',members:[{value:event}]}});
  const list=await m.call({method:'GET',kind:'Groups'}) as {totalResults:number};expect(list.totalResults).toBe(1);
  await m.call({method:'PATCH',kind:'Users',id:event,eventId:randomUUID(),expectedRevision:1,body:{schemas:['urn:ietf:params:scim:api:messages:2.0:PatchOp'],Operations:[{op:'replace',path:'active',value:false}]}});
  expect(await h.provider.authenticate(linked.sessionToken)).toBeUndefined();
  const rows=await auditRows(h,m.f.principal.tenantId);const machineEvents=rows.filter(r=>r.actor_ref===`machine:scim:${m.bindingId}`);
  expect(machineEvents.length).toBeGreaterThan(0);
  for(const event of machineEvents) {
   expect(event.version).toBe('audit.v2');
   expect(event.payload.references.auditTrust).toBe('checked_operation');
  }
 });
 it('refuses cross-tenant members, forged owners, existing account linking, wrong bearer and last-owner mutation',async()=>{
  const m=await machineFixture(),n=await machineFixture(),event=randomUUID();await m.create(event);
  await expect(n.call({method:'GET',kind:'Users',id:event})).rejects.toHaveProperty('code','SCIM_NOT_FOUND');
  await expect(n.call({method:'POST',kind:'Groups',eventId:randomUUID(),body:{schemas:['urn:ietf:params:scim:schemas:core:2.0:Group'],displayName:'wrong tenant',members:[{value:event}]}})).rejects.toHaveProperty('code','ACCESS_REFUSED');
  await expect(app.scim(`Bearer ${n.token}`,{version:'scim2-request.v1',bindingId:m.bindingId,method:'GET',kind:'Users'})).rejects.toHaveProperty('code','ACCESS_REFUSED');
  await h.admin.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=(SELECT membership_id FROM identity.scim2_resource WHERE tenant_id=$1 AND id=$2)",[m.f.principal.tenantId,event]);
  // Owner-only fixture leaves the provisioned owner as the last active owner.
  await h.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[m.f.principal.tenantId,m.f.principal.membershipId]);
  await expect(m.call({method:'DELETE',kind:'Users',id:event,eventId:randomUUID(),expectedRevision:1})).rejects.toHaveProperty('code','ACCESS_REFUSED');
  await expect(m.call({method:'POST',kind:'Users',eventId:randomUUID(),body:{schemas:['urn:ietf:params:scim:schemas:core:2.0:User'],externalId:randomUUID(),userName:m.f.email,active:true}})).rejects.toHaveProperty('code','ACCESS_REFUSED');
 });
});

// Route-level proof uses the exact POST transport called by the Next action handler.
import { emergencyOwnerPost } from '../../../apps/api/src/auth/sso/enterprise-access.http.js';
import { SsoRequiredController } from '../../../apps/api/src/auth/sso/sso-required.controller.js';
import { canonicalRows, origin, type Credentials } from './scim-fixtures.js';
async function postEmergency(f:ScimFixture,credentials:Credentials,command:Record<string,unknown>,tenant=f.principal.tenantId) {
 const operation=String(command.operation);
 const response=await emergencyOwnerPost(new Request(origin+'/api/auth/sso-required/emergency-actions/'+operation,{
  method:'POST',body:JSON.stringify({version:'emergency-route.v1',requested_tenant_id:tenant,command}),
 }),operation,{...credentials,tenantHeader:tenant},h.provider,origin,'synthetic_demo');
 expect(response.headers.get('cache-control')).toBe('no-store');return response;
}
async function emergencyState(f:ScimFixture) {
 const result:unknown[]=[];
 for(const table of ['identity.emergency_request','identity.emergency_approval','identity.emergency_session','identity.emergency_action','app.audit_event','app.membership','app.role_grant_revocation'])
  result.push(await canonicalRows(h,table,'tenant_id=$1',[f.principal.tenantId]));
 return result;
}
async function refusedPost(f:ScimFixture,credentials:Credentials,command:Record<string,unknown>,tenant?:string) {
 const before=await emergencyState(f),response=await postEmergency(f,credentials,command,tenant);
 expect(response.status).toBe(403);expect(await response.json()).toEqual({code:'SSO_EMERGENCY_REFUSED'});
 expect(await emergencyState(f)).toEqual(before);
}
describe('ENT-10 emergency action routes, real database',()=>{
 it('requests, approves twice, opens, inspects and revokes through POST; refusals leave no effects',async()=>{
  const f=await fixture(h),a=await owner(f),b=await owner(f),other=await fixture(h),target=await person(f,'read_only');
  // Use already-live SSO sessions. Ordinary sessions cannot bypass a required SSO company.
  await f.enable();
  const proof=f.bound!,id=randomUUID();
  const input=(op:string,extra={})=>request(id,op,extra);
  expect((await postEmergency(f,proof,input('request',{reasonHash:hash('synthetic recovery')}))).status).toBe(200);
  await refusedPost(f,proof,input('approve'));
  await refusedPost(f,proof,input('open')); // one owner alone
  await refusedPost(f,a.bound,input('approve'),other.principal.tenantId);
  await refusedPost(f,{...a.bound,csrfToken:''},input('approve'));
  await refusedPost(f,{...a.bound,csrfToken:'wrong'},input('approve'));
  expect((await postEmergency(f,a.bound,input('approve'))).status).toBe(200);
  await refusedPost(f,a.bound,input('approve')); // repeated identity
  await refusedPost(f,proof,input('open')); // still only one other owner
  expect((await postEmergency(f,b.bound,input('approve'))).status).toBe(200);
  const opened=await postEmergency(f,proof,input('open'));expect(opened.status).toBe(200);
  const {token}=await opened.json();expect(token).toMatch(/^[a-f0-9]{64}$/u);
  await refusedPost(f,proof,input('open')); // immutable session replay
  const inspected=await postEmergency(f,proof,input('inspect',{token}));expect(inspected.status).toBe(200);
  expect(await inspected.json()).toHaveProperty('required',true);
  await refusedPost(f,a.bound,input('inspect',{token}));
  await refusedPost(f,proof,input('revoke_member',{token,targetMembershipId:a.membershipId}));
  expect((await postEmergency(f,proof,input('revoke_member',{token,targetMembershipId:target.membershipId}))).status).toBe(200);
  expect((await h.admin.query('SELECT revoked_at FROM app.membership WHERE tenant_id=$1 AND id=$2',[f.principal.tenantId,target.membershipId])).rows[0].revoked_at).not.toBeNull();
  for(const credentials of [proof,a.bound,b.bound]) {
   const notices=await h.required.emergencyNotices({requested_tenant_id:f.principal.tenantId},credentials) as {notices:{operation:string}[]};
   expect(notices.notices.map(n=>n.operation)).toEqual(['request','approve','approve','open','inspect','revoke_member']);
  }
  const audit=await auditRows(h,f.principal.tenantId);
  for(const op of ['request','approve','open','inspect','revoke_member','notices'])expect(audit.some(r=>r.event_type===`sso.emergency.${op}`)).toBe(true);
  // Removed owner and expired/revoked login sessions cannot even request another capability.
  await h.admin.query('UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2',[f.principal.tenantId,a.membershipId]);
  await refusedPost(f,a.bound,request(randomUUID(),'request',{reasonHash:hash('removed')}));
  await h.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 minute' WHERE token_digest=$1",[h.provider.digest(`session:${b.bound.sessionToken}`)]);
  await refusedPost(f,b.bound,request(randomUUID(),'request',{reasonHash:hash('expired login')}));
  await h.admin.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE token_digest=$1',[h.provider.digest(`session:${proof.sessionToken}`)]);
  await refusedPost(f,proof,input('inspect',{token}));
 });
 it('expired approval window and capability session refuse without writes',async()=>{
  const f=await fixture(h),a=await owner(f),id=randomUUID(),token=hash('expired route token');
  await h.admin.query("INSERT INTO identity.emergency_request VALUES($1,$2,$3,$4,transaction_timestamp()-interval '16 minutes',transaction_timestamp()-interval '1 minute')",[f.principal.tenantId,id,f.principal.membershipId,hash('expired window')]);
  await refusedPost(f,a.bound,request(id,'approve'));await refusedPost(f,f.bound!,request(id,'open'));
  await h.admin.query("INSERT INTO identity.emergency_session VALUES($1,$2,$3,transaction_timestamp()-interval '61 minutes',transaction_timestamp()-interval '1 minute')",[f.principal.tenantId,id,hash(token)]);
  await refusedPost(f,f.bound!,request(id,'inspect',{token}));
 });
 it('retired HTTP handlers refuse an otherwise valid mailbox code; SSO remains required and code remains usable',async()=>{
  const f=await fixture(h);await f.enable();
  const challenge=await h.provider.requestCode({email:f.email,purpose:'signin',ip:randomUUID()});
  const payload={version:'sso-emergency.v2',requested_tenant_id:f.principal.tenantId,commandId:randomUUID(),email:f.email,code:challenge.fixtureCode!,reason:'Synthetic identity provider outage'};
  const before=await canonicalRows(h,'identity.challenge','email=$1',[f.email]);
  const controller=new SsoRequiredController(()=>h.required);
  await expect(controller.emergency(payload,{headers:{origin}})).rejects.toHaveProperty('status',403);
  const path='../../../apps/web/app/api/auth/sso-required/emergency/route.ts';const {POST}=await import(new URL(path,import.meta.url).href);
  const response=await POST(new Request(origin,{method:'POST',body:JSON.stringify(payload)}));expect(response.status).toBe(403);
  expect(await response.json()).toEqual({code:'SSO_EMERGENCY_REFUSED'});expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await canonicalRows(h,'identity.challenge','email=$1',[f.email])).toEqual(before);
  expect(await h.required.view({version:'sso-required-view.v1',requested_tenant_id:f.principal.tenantId},f.bound!)).toHaveProperty('required',true);
  expect((await h.admin.query('SELECT count(*)::int n FROM identity.sso_emergency_window WHERE tenant_id=$1',[f.principal.tenantId])).rows[0].n).toBe(0);
  // Proves the unchanged application would have accepted this exact unconsumed mailbox proof.
  expect(await h.provider.proveEmergencyMailbox(f.email,challenge.fixtureCode!)).toBe(f.principal.identityUserId);
 });
});
