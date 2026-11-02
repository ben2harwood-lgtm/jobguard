import { Pool } from 'pg';
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { OidcRepository } from '../src/oidc-repository.js';
import { OidcApplication } from '../../../apps/api/src/auth/sso/oidc.application.js';
import { oidcFixture,createScimHarness,origin } from './oidc-fixtures.js';
let h:Awaited<ReturnType<typeof createScimHarness>>;
beforeAll(async()=>{h=await createScimHarness('jg-oidc-race-');},120000);
afterAll(async()=>{if(h)await h.close();});
describe('durable OIDC concurrency and unknown outcomes',()=>{
 it('separate pool clients race one callback: one exchange/session and losing refusal audit',async()=>{
  const f=await oidcFixture(h),s=await f.start();
  // pg-pool keeps `password` non-enumerable, so a plain spread of `options` would drop it and the second client could not authenticate.
  const otherPool=new Pool({...h.identity.options,password:h.identity.options.password,max:1});
  try {
  const other=new OidcApplication(h.provider,new OidcRepository(otherPool),origin,'synthetic_demo',f.issuer);
  const result=await Promise.allSettled([f.callback(s),f.callback(s,other)]);
  expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(f.issuer.calls.filter(c=>c.endsWith('/token'))).toHaveLength(1);
  expect((await h.admin.query("SELECT count(*)::int n FROM identity.sso_session_binding WHERE connection_id=$1",[f.connectionId])).rows[0].n).toBe(1);
  expect((await h.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='sso.refused'",[f.principal.tenantId])).rows[0].n).toBeGreaterThan(0);
  } finally {await otherPool.end();}
 });
 it('releases every identity pool client before the actual token exchange',async()=>{
  const f=await oidcFixture(h),s=await f.start(),transport=f.issuer.transport;
  const spy=vi.spyOn(f.issuer,'transport').mockImplementation(async(...args)=>{
   if(args[0].endsWith('/token')){expect(h.identity.waitingCount).toBe(0);expect(h.identity.idleCount).toBe(h.identity.totalCount);}
   return transport(...args);
  });
  try {expect(await f.callback(s)).toHaveProperty('sessionToken');}finally{spy.mockRestore();}
 });
 it('crash after durable claim is refused by a new application/repository without exchange',async()=>{
  const f=await oidcFixture(h),s=await f.start(),state=new URL(s.callback).searchParams.get('state')!;
  await f.repository.claim(f.connectionId,state,s.browser);
  const restarted=new OidcApplication(h.provider,new OidcRepository(h.identity),origin,'synthetic_demo',f.issuer);
  await expect(f.callback(s,restarted)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(f.issuer.calls.filter(c=>c.endsWith('/token'))).toHaveLength(0);
  expect(await f.callback(await f.start(),restarted)).toHaveProperty('sessionToken');
 });
 it('rechecks linking session and mapping after exchange; rollback cannot recreate a claim',async()=>{
  const f=await oidcFixture(h);f.issuer.claims.email=f.email;const s=await f.start(true);
  const original=f.repository.finish.bind(f.repository);
  const spy=vi.spyOn(f.repository,'finish').mockImplementation(async(...args)=>{
   await h.admin.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1',[f.sessionId]);return original(...args);
  });
  await expect(f.callback(s)).rejects.toMatchObject({code:'OIDC_REFUSED'});spy.mockRestore();
  expect((await h.admin.query("SELECT status FROM identity.oidc_request WHERE connection_id=$1",[f.connectionId])).rows[0].status).toBe('outcome_unknown');
  await expect(f.callback(s)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect((await h.admin.query("SELECT count(*)::int n FROM identity.sso_session_binding WHERE connection_id=$1",[f.connectionId])).rows[0].n).toBe(0);
 });
 it('current mapping revocation wins over an already-issued request',async()=>{
  const f=await oidcFixture(h),s=await f.start();
  await h.sso.admin({version:'sso-admin.v1',action:'mapping.set',requested_tenant_id:f.principal.tenantId,connectionId:f.connectionId,group:'admin',role:'admin',scope:{kind:'tenant',id:f.principal.tenantId},enabled:false,expectedRevision:1},f.ordinary);
  await expect(f.callback(s)).rejects.toMatchObject({code:'OIDC_REFUSED'});
 });
 it('audit failure rolls back session effects but leaves the earlier durable claim unusable',async()=>{
  const f=await oidcFixture(h),s=await f.start(),audit=f.repository.audit.bind(f.repository);
  const spy=vi.spyOn(f.repository,'audit').mockImplementation(async(...args)=>{if(args[2]==='sso.oidc.signin.completed')throw new Error('synthetic audit failure');return audit(...args);});
  await expect(f.callback(s)).rejects.toMatchObject({code:'OIDC_REFUSED'});spy.mockRestore();
  expect((await h.admin.query("SELECT count(*)::int n FROM identity.sso_session_binding WHERE connection_id=$1",[f.connectionId])).rows[0].n).toBe(0);
  await expect(f.callback(s)).rejects.toMatchObject({code:'OIDC_REFUSED'});
 });
});
