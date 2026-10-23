import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { expect, test, type BrowserContext } from "@playwright/test";
import { Pool } from "pg";
import { appendAuditBatch } from "../../../packages/db/src/audit";
import { withTenant } from "../../../packages/db/src/tenant-context";
import { testTenantContext } from "../../../packages/db/test/tenant-context-test-utils";
import { TestOidcIssuer } from "../../api/src/auth/sso/test-oidc-issuer";
// NOT RUN locally. Both actual transports and persisted sessions use the CI synthetic PostgreSQL database.
// Typed imports below come from source or the package's exported entries, so typecheck needs no build output. The one exception is the
// decorated Nest controller: apps/web has no experimentalDecorators, so importing its source here fails typecheck (TS1206). It is loaded
// natively from the built package after `pnpm build`, the way global-setup.ts loads @jobguard/db.
const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;
async function owner(context: BrowserContext) {
  const tenantId = randomUUID(), userId = randomUUID(), membershipId = randomUUID(), accountId = randomUUID(), assignmentId = randomUUID();
  const email = `admin-${randomUUID()}@fictional.invalid`, token = randomBytes(32).toString("base64url"), csrfToken = randomBytes(24).toString("base64url");
  const pool = new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", password: "sbox-e2e-owner", database: "jobguard_synthetic_demo", max: 1 });
  try {
    await withTenant(pool, testTenantContext(tenantId), async db => {
      await db.$client.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
      await db.$client.query("INSERT INTO identity.identity_user(id) VALUES($1)", [userId]);
      await db.$client.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [email, userId]);
      await db.$client.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional SAML contractor')", [accountId, tenantId]);
      await db.$client.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [membershipId, tenantId, accountId, userId]);
      await db.$client.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [userId, tenantId, membershipId]);
      await db.$client.query("SELECT app.assign_commercial_track($1,$2,'contractor',$3,0,'ENT-10a:e2e-fixture')", [tenantId, assignmentId, `synthetic-agreement:${randomUUID()}`]);
      await db.$client.query("INSERT INTO app.org_unit(tenant_id,id,kind,name) VALUES($1,$1,'tenant','Fictional SAML contractor')", [tenantId]);
      await db.$client.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,$3)", [tenantId, membershipId, email]);
      await db.$client.query("INSERT INTO app.role_grant(tenant_id,id,membership_id,role,scope_kind,scope_id) VALUES($1,$2,$3,'owner','tenant',$1)", [tenantId, randomUUID(), membershipId]);
      const digest = createHmac("sha256", "sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
      await db.$client.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day')", [randomUUID(), userId, digest, csrfToken]);
      await appendAuditBatch(db,[{id:assignmentId,version:"audit.v1",actorRef:"ENT-10a:e2e-fixture",eventType:"commercial_track.assigned",subjectType:"tenant",subjectRef:tenantId,payload:{references:{assignment:assignmentId,environment:"synthetic_demo"},classifications:{action:"security"}}}]);
    });
  } finally { await pool.end(); }
  await context.addCookies([{ name: "jobguard_session", value: token, url: "http://127.0.0.1:3000", httpOnly: true, secure: true, sameSite: "Strict" }]);
  return { tenantId, csrfToken };
}
// Nest: the test injects the fictional issuer, so the whole persisted sign-in can run. Next: the deployed server is another process in production
// composition, which configures no issuer and can be given none, so the same anonymous visitor must be refused (access-control repair B1).
for(const transport of ['Next','Nest'] as const) test(transport==='Nest'?'Nest persisted local OIDC sign-in with a test-injected issuer, replay refusal and next-request revocation':'Next refuses OIDC sign-in without a configured issuer, even to a visitor who knows the connection id',async({page})=>{
 const account=await owner(page.context()),id=randomUUID(),origin='http://127.0.0.1:3000';
 let nest:{close:()=>Promise<void>}|undefined;
 let root=origin,path='/api/auth/oidc';
 if(transport==='Nest') {
  // Load the actual built controller, without a second application implementation.
  const requireApi=createRequire(join(__dirname,'../../api/package.json'));
  const {NestFactory,APP_FILTER}=requireApi('@nestjs/core');const {Module}=requireApi('@nestjs/common');
  const {OidcController,OidcParseExceptionFilter,OIDC_APPLICATION}=await nativeImport(pathToFileURL(join(__dirname,'../../api/dist/auth/sso/oidc.controller.js')).href);
  const {createIdentityApplication}=await import('@jobguard/api/identity');
  const {OidcApplication}=await import('@jobguard/api/workspace');
  const {OidcRepository}=await import('@jobguard/db');
  const identity=createIdentityApplication({JOBGUARD_ENV:'synthetic_demo',IDENTITY_DATABASE_URL:'postgresql://jobguard_identity:sbox-e2e-identity@127.0.0.1:55432/jobguard_synthetic_demo',AUTH_CODE_SECRET:'sbox-only-identity-hmac-secret-32-bytes',AUTH_ALLOWED_ORIGIN:origin});
  // The fictional issuer approves anyone, so only a test may supply it: the test process injects it here and no deployed route can.
  const issuer=new TestOidcIssuer();issuer.claims={sub:`fictional-${id}`,email:`person@${id}.oidc.invalid`,groups:['site']};
  class FixtureModule {}
  Module({controllers:[OidcController],providers:[{provide:APP_FILTER,useClass:OidcParseExceptionFilter},{provide:OIDC_APPLICATION,useValue:()=>new OidcApplication(identity.provider,new OidcRepository(identity.provider.repository.pool),origin,'synthetic_demo',issuer)}]})(FixtureModule);
  const app=await NestFactory.create(FixtureModule,{logger:false});await app.listen(0,'127.0.0.1');
  root=await app.getUrl();path='/auth/oidc';nest={close:async()=>{await app.close();await identity.provider.repository.pool.end();}};
 }
 const post=(url:string,data:unknown)=>page.request.post(url,{headers:{origin,'x-csrf-token':account.csrfToken},data});
 try {
  const config={version:'oidc-connection.v1',protocol:'oidc',revision:1,sessionLimitSeconds:900,config:{version:'oidc-config.v1',mode:'synthetic_demo',provider:'in-process-test-idp',tenantId:account.tenantId,connectionId:id,issuer:'https://issuer.invalid',clientId:'jobguard-practice',redirectUri:'https://app.invalid/oidc/callback'}};
  expect((await post(`${root}${path}/${id}/start`,{version:'oidc-admin.v1',action:'connection.create',requested_tenant_id:account.tenantId,connection:config})).ok()).toBe(true);
  const domain=`${id}.oidc.invalid`;
  for(const command of [{action:'domain.verify',domain,proof:`synthetic-domain:${id}:${domain}`},{action:'mapping.set',group:'site',role:'read_only',scope:{kind:'tenant',id:account.tenantId},expectedRevision:0,enabled:true}]) {
   expect((await post(`${origin}/api/auth/sso/${id}/start`,{version:'sso-admin.v1',requested_tenant_id:account.tenantId,connectionId:id,...command})).ok()).toBe(true);
  }
  await page.context().clearCookies();
  const malformed=await page.request.post(`${root}${path}/${id}/callback`,{headers:{origin,'content-type':'application/json'},data:'{raw-secret'});expect(malformed.status()).toBe(403);expect(malformed.headers()['cache-control']).toBe('no-store');expect(await malformed.json()).toEqual({version:'oidc-error.v1',code:'OIDC_REFUSED'});
  if(transport==='Next') {
   const refused=await post(`${root}${path}/${id}/start`,{version:'oidc-start.v1',action:'signin'});
   expect(refused.status()).toBe(403);expect(refused.headers()['cache-control']).toBe('no-store');expect(await refused.json()).toEqual({version:'oidc-error.v1',code:'OIDC_REFUSED'});
   expect((await page.context().cookies()).filter(c=>c.name==='jobguard_oidc_state'||c.name==='jobguard_session')).toEqual([]);
   expect((await page.request.get(`${origin}/api/auth/session`)).status()).toBeGreaterThanOrEqual(400);
   return;
  }
  const started=await post(`${root}${path}/${id}/start`,{version:'oidc-start.v1',action:'signin'});expect(started.ok()).toBe(true);expect(started.headers()['cache-control']).toBe('no-store');
  const payload=await started.json();expect(payload.verifier).toBeUndefined();expect(payload.browser).toBeUndefined();
  const state=(await page.context().cookies()).find(c=>c.name==='jobguard_oidc_state')!;
  expect(state).toMatchObject({httpOnly:true,secure:true,sameSite:'Strict',path});
  const raw={version:'oidc-callback.v1',callback:payload.callback},callback=await post(`${root}${path}/${id}/callback`,raw);expect(callback.ok()).toBe(true);
  expect((await callback.json()).sessionToken).toBeUndefined();
  const session=await page.request.get(`${origin}/api/auth/session`);expect(session.ok()).toBe(true);
  expect((await session.json()).memberships.map((m:{tenantId:string})=>m.tenantId)).toEqual([account.tenantId]);
  expect((await post(`${root}${path}/${id}/callback`,raw)).status()).toBe(403);
  const pool=new Pool({host:'127.0.0.1',port:55432,user:'postgres',password:'sbox-e2e-owner',database:'jobguard_synthetic_demo'});
  try {await pool.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND role='read_only'",[account.tenantId]);}finally{await pool.end();}
  const after=await page.request.get(`${origin}/api/auth/session`);
  expect(after.status()).toBeGreaterThanOrEqual(400);
 } finally {await nest?.close();}
});
