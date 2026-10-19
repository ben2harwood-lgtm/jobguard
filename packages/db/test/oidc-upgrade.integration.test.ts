import { SsoRequiredApplication } from '../../../apps/api/src/auth/sso/sso-required.application.js';
import { afterAll,beforeAll,expect,it } from 'vitest';
import { migrate } from '../src/migrate.js';
import { createScimHarness,canonicalRows } from './oidc-fixtures.js';
import { fixture,person,deactivate,origin } from './scim-fixtures.js';
import { randomUUID } from 'node:crypto';
let h:Awaited<ReturnType<typeof createScimHarness>>;
beforeAll(async()=>{h=await createScimHarness('jg-oidc-upgrade-','0198_oidc_signin.sql');},120000);
afterAll(async()=>{if(h)await h.close();});
it('populated SAML/SCIM/emergency upgrade preserves historical rows and installs restricted OIDC routines/RLS',async()=>{
 const f=await fixture(h);
 const personFixture=await person(f);await deactivate(f,personFixture);
 await f.enable();
 const code=await h.provider.requestCode({email:f.email,purpose:'signin',ip:randomUUID()});
 await new SsoRequiredApplication(h.provider,h.required.repository,origin,'synthetic_demo',60).emergency({version:'sso-emergency.v2',requested_tenant_id:f.principal.tenantId,commandId:randomUUID(),email:f.email,code:code.fixtureCode!,reason:'Fictional owner tests historical emergency preservation'},origin);
 const tables=(await h.admin.query("SELECT schemaname||'.'||tablename name FROM pg_tables WHERE schemaname='identity' ORDER BY tablename")).rows.map(r=>r.name as string);
 const historicalAssertion=(await h.admin.query('SELECT assertion_id FROM identity.sso_assertion_use WHERE connection_id=$1 ORDER BY used_at LIMIT 1',[f.connectionId])).rows[0].assertion_id;
 const before=await Promise.all(tables.map(t=>canonicalRows(h,t)));
 await migrate(h.admin);await migrate(h.admin);
 expect(await Promise.all(tables.map(t=>canonicalRows(h,t)))).toEqual(before);
 expect(await h.provider.authenticate(f.bound!.sessionToken)).toBeDefined();
 const tablesState=(await h.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid IN('identity.oidc_request'::regclass,'identity.oidc_assertion_use'::regclass)")).rows;
 expect(tablesState).toHaveLength(2);for(const table of tablesState)expect(table).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:'jobguard_migration'});
 for(const role of ['jobguard_runtime','jobguard_identity','jobguard_infrastructure']) {
  for(const table of ['identity.oidc_request','identity.oidc_assertion_use'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])expect((await h.admin.query("SELECT has_table_privilege($1,$2,$3) allowed",[role,table,privilege])).rows[0].allowed).toBe(false);
 }
 const routines=(await h.admin.query("SELECT p.oid::regprocedure::text name,p.prosecdef,pg_get_userbyid(p.proowner) owner,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,has_function_privilege('jobguard_identity',p.oid,'EXECUTE') identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='identity' AND p.proname LIKE 'oidc_%' ORDER BY p.proname")).rows;
 expect(routines).toHaveLength(6);
 for(const r of routines){expect(r.owner).toBe('jobguard_migration');expect(r.prosecdef).toBe(true);expect(r.runtime).toBe(false);expect(r.identity).toBe(!r.name.startsWith('identity.oidc_link('));}
 expect((await h.admin.query('SELECT count(*)::int n FROM identity.oidc_request')).rows[0].n).toBe(0);
 const request=await h.sso.start(f.connectionId,{version:'sso-start.v1',action:'signin'},f.ordinary);
 await expect(h.sso.callback(f.connectionId,{version:'sso-callback.v1',relayState:request.relayState,SAMLResponse:f.idp.response({connection:f.connection,requestId:request.requestId,assertionId:historicalAssertion,subject:'historical-replay',email:`replay@${f.domain}`,groups:['admin']})},request.relayState)).rejects.toMatchObject({code:'ASSERTION_REPLAY'});
},120000);
