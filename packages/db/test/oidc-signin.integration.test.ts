import { generateTestIdentityProvider } from '../../../apps/api/src/auth/sso/test-identity-provider.js';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { oidcFixture,createScimHarness,auditRows } from './oidc-fixtures.js';
import { scimBearerFor } from '../../../apps/api/src/auth/sso/scim.contracts.js';
import { randomUUID } from 'node:crypto';
let h:Awaited<ReturnType<typeof createScimHarness>>;
beforeAll(async()=>{h=await createScimHarness('jg-oidc-signin-');},120000);
afterAll(async()=>{if(h)await h.close();});
describe('OIDC actual adapter/local issuer and PostgreSQL authority',()=>{
 it('requires verified fictional domain and explicitly links an existing email account',async()=>{
  const unverified=await oidcFixture(h,false);await expect(unverified.callback(await unverified.start())).rejects.toMatchObject({code:'OIDC_REFUSED'});
  const f=await oidcFixture(h);
  expect((await h.sso.view(f.principal.tenantId,f.ordinary)).connections).toEqual([]);
  f.issuer.claims.email=f.email;
  await expect(f.callback(await f.start())).rejects.toMatchObject({code:'OIDC_REFUSED'});
  const result=await f.callback(await f.start(true));expect((await h.provider.authenticate(result.sessionToken))?.identityUserId).toBe(f.principal.identityUserId);
  await auditRows(h,f.principal.tenantId);
 });
 it('creates only explicitly mapped grants, downgrades and commits no-group revocation',async()=>{
  const f=await oidcFixture(h);f.issuer.claims.groups=['finance','commercial_manager'];
  await expect(f.callback(await f.start())).rejects.toMatchObject({code:'OIDC_REFUSED'});
  await f.map('finance');await f.map('commercial_manager');
  const first=await f.callback(await f.start()),principal=(await h.provider.authenticate(first.sessionToken))!;
  expect(principal).toBeDefined();
  expect((await h.admin.query("SELECT role FROM app.role_grant WHERE tenant_id=$1 AND membership_id IN(SELECT id FROM app.membership WHERE tenant_id=$1 AND identity_user_id=$2) AND id NOT IN(SELECT grant_id FROM app.role_grant_revocation WHERE tenant_id=$1) ORDER BY role",[f.principal.tenantId,principal.identityUserId])).rows.map(r=>r.role)).toEqual(['commercial_manager','finance']);
  await f.map('read_only');f.issuer.claims.groups=['read_only'];const downgraded=await f.callback(await f.start());
  expect(await h.provider.authenticate(first.sessionToken)).toBeUndefined();
  expect((await h.admin.query("SELECT g.role FROM app.role_grant g WHERE g.tenant_id=$1 AND g.membership_id IN(SELECT id FROM app.membership WHERE tenant_id=$1 AND identity_user_id=$2) AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE r.tenant_id=g.tenant_id AND r.grant_id=g.id)",[f.principal.tenantId,principal.identityUserId])).rows.map(r=>r.role)).toEqual(['read_only']);
  f.issuer.claims.groups=[];await expect(f.callback(await f.start())).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(await h.provider.authenticate(downgraded.sessionToken)).toBeUndefined();
  expect((await h.admin.query("SELECT status FROM identity.oidc_request WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1",[f.principal.tenantId])).rows[0].status).toBe('refused');
 });
 it('preserves SCIM next-request denial with the existing subject hashing contract',async()=>{
  const f=await oidcFixture(h),signed=await f.callback(await f.start());
  expect(await h.provider.authenticate(signed.sessionToken)).toBeDefined();
  const result=await h.scim.deactivate(f.connectionId,'Bearer '+scimBearerFor(h.seed,f.connectionId),{version:'scim-deactivation.v1',eventId:randomUUID(),subject:f.issuer.claims.sub,active:false});
  expect(result.outcome).toBe('deactivated');expect(await h.provider.authenticate(signed.sessionToken)).toBeUndefined();
  await expect(f.callback(await f.start())).rejects.toMatchObject({code:'OIDC_REFUSED'});
 });
 it('refuses cross-tenant callback substitution and existing-account cross-tenant silent linking',async()=>{
  const a=await oidcFixture(h),b=await oidcFixture(h),s=await a.start();
  await expect(b.oidc.callback(b.connectionId,{version:'oidc-callback.v1',callback:s.callback},s.browser,b.ordinary.origin)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  b.issuer.claims.email=a.email;await expect(b.callback(await b.start())).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(await a.callback(s)).toHaveProperty('sessionToken');
 });
 it('refuses another company administrator registering or linking an OIDC connection',async()=>{
  const a=await oidcFixture(h),b=await oidcFixture(h);
  const before=await h.admin.query('SELECT count(*)::int n FROM identity.sso_connection');
  await expect(b.oidc.admin({version:'oidc-admin.v1',action:'connection.create',requested_tenant_id:a.principal.tenantId,connection:{...a.config,config:{...a.config.config,connectionId:randomUUID()}}},b.ordinary)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  await expect(b.oidc.start(a.connectionId,{version:'oidc-start.v1',action:'signin',linkExisting:true},b.ordinary)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect((await h.admin.query('SELECT count(*)::int n FROM identity.sso_connection')).rows).toEqual(before.rows);
  expect((await h.admin.query('SELECT count(*)::int n FROM identity.oidc_request WHERE connection_id=$1',[a.connectionId])).rows[0].n).toBe(0);
 });
 it('SSO-required retains bound session access while refusing ordinary email-code access',async()=>{
  const f=await oidcFixture(h);f.issuer.claims.email=f.email;
  const bound=await f.callback(await f.start(true));
  await h.required.command({version:'sso-required-command.v1',requested_tenant_id:f.principal.tenantId,required:true,expectedRevision:0,reason:'Fictional owner enables OIDC requirement'}, {sessionToken:bound.sessionToken,csrfToken:bound.csrfToken,origin:f.ordinary.origin});
  expect((await h.provider.memberships((await h.provider.authenticate(bound.sessionToken))!)).some(m=>m.tenantId===f.principal.tenantId)).toBe(true);
  expect((await h.provider.memberships((await h.provider.authenticate(f.ordinary.sessionToken))!)).some(m=>m.tenantId===f.principal.tenantId)).toBe(false);
 });
 it('same tenant/raw assertion/subject cannot collide across immutable SAML and OIDC connections',async()=>{
  const f=await oidcFixture(h),s=await f.start(),id=randomUUID(),domain=`${id}.saml.invalid`,idp=generateTestIdentityProvider();
  await h.sso.admin({version:'sso-admin.v1',action:'connection.create',requested_tenant_id:f.principal.tenantId,id,idpCert:idp.idpCert},f.ordinary);
  await h.sso.admin({version:'sso-admin.v1',action:'domain.verify',requested_tenant_id:f.principal.tenantId,connectionId:id,domain,proof:`synthetic-domain:${id}:${domain}`},f.ordinary);
  await h.sso.admin({version:'sso-admin.v1',action:'mapping.set',requested_tenant_id:f.principal.tenantId,connectionId:id,group:'admin',role:'admin',scope:{kind:'tenant',id:f.principal.tenantId},expectedRevision:0,enabled:true},f.ordinary);
  const saml=await h.sso.start(id,{version:'sso-start.v1',action:'signin'},f.ordinary);
  const connection={id,tenantId:f.principal.tenantId,idpEntityId:`urn:jobguard:test-idp:${id}`,spEntityId:`urn:jobguard:sp:${id}`,callbackUrl:`${f.ordinary.origin}/api/auth/sso/${id}/callback`,entryPoint:`${f.ordinary.origin}/api/auth/sso/${id}/start`,idpCert:idp.idpCert};
  const rawId=`oidc_${f.connectionId.replaceAll('-','_')}_${new URL(s.callback).searchParams.get('state')}`;
  const raw={version:'sso-callback.v1',relayState:saml.relayState,SAMLResponse:idp.response({connection,requestId:saml.requestId,assertionId:rawId,subject:String(f.issuer.claims.sub),email:`saml@${domain}`,groups:['admin']})};
  expect(await h.sso.callback(id,raw,saml.relayState)).toHaveProperty('sessionToken');
  expect(await f.callback(s)).toHaveProperty('sessionToken');
  await expect(h.sso.callback(id,raw,saml.relayState)).rejects.toBeDefined();
  const subjects=(await h.admin.query('SELECT connection_id,subject_hash FROM identity.sso_subject WHERE tenant_id=$1',[f.principal.tenantId])).rows;
  expect(subjects).toHaveLength(2);expect(subjects[0].subject_hash).toBe(subjects[1].subject_hash);
  const replays=(await h.admin.query('SELECT assertion_id FROM identity.sso_assertion_use WHERE tenant_id=$1 UNION ALL SELECT assertion_id FROM identity.oidc_assertion_use WHERE tenant_id=$1',[f.principal.tenantId])).rows;
  expect(replays).toHaveLength(2);expect(replays.every(r=>r.assertion_id===rawId)).toBe(true);
 });

 it('database expiry and browser substitution refuse before exchange; configuration remains immutable',async()=>{
  const f=await oidcFixture(h),s=await f.start();
  await expect(f.oidc.callback(f.connectionId,{version:'oidc-callback.v1',callback:s.callback},'x'.repeat(43),f.ordinary.origin)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  await h.admin.query("UPDATE identity.oidc_request SET expires_at=clock_timestamp()-interval '1 second' WHERE connection_id=$1",[f.connectionId]);
  await expect(f.callback(s)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(f.issuer.calls.filter(c=>c.endsWith('/token'))).toHaveLength(0);
  await expect(h.admin.query("UPDATE identity.sso_connection SET metadata=jsonb_set(metadata,'{revision}','2') WHERE id=$1",[f.connectionId])).rejects.toBeDefined();
 });

});
