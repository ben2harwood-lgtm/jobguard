import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { Pool } from 'pg';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { seedActiveContractorAgreement } from '../../../packages/db/test/contractor-agreement-test-fixture';
const origin='http://127.0.0.1:3000';
// Playwright loads specs as CommonJS; the workspace database package exposes ESM only.
const database=()=> (new Function('specifier','return import(specifier)') as (s:string)=>Promise<typeof import('@jobguard/db')>)(pathToFileURL(join(process.cwd(),'../../packages/db/dist/index.js')).href);
// Real routes/PostgreSQL; fictional identities only. Both configured projects run this at 360px and desktop.
async function seed() {
 const pool=new Pool({host:'127.0.0.1',port:55432,user:'postgres',password:'sbox-e2e-owner',database:'jobguard_synthetic_demo',max:1});
 try {
  // The audited synthetic bootstrap creates the contractor assignment and initial owner grant.
  // Approvers use owner memberships, as in enterprise-access.integration.test.ts.
  // Ordinary grant.create deliberately refuses owner grants.
  const {ContractorRepository}=await database();
  const principal=await new ContractorRepository(pool).startPractice(randomUUID());
  const {tenantId}=principal;
  await seedActiveContractorAgreement(pool,tenantId);
  const account=(await pool.query('SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2',[tenantId,principal.membershipId])).rows[0].account_id;
  const actors=Array.from({length:4},(_,i)=>({membershipId:i===0?principal.membershipId:randomUUID(),userId:i===0?principal.identityUserId:randomUUID(),sessionId:randomUUID(),
   email:`emergency-${i}-${randomUUID()}@fixture.invalid`,token:randomBytes(32).toString('base64url'),csrf:randomBytes(24).toString('base64url'),role:i===3?'read_only':'owner'}));
  await pool.query('BEGIN');
  for(const [i,a] of actors.entries()) {
   if(i!==0) {
    await pool.query('INSERT INTO identity.identity_user(id) VALUES($1)',[a.userId]);
    await pool.query('INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,$5)',[a.membershipId,tenantId,account,a.userId,a.role]);
    await pool.query('INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,$3)',[tenantId,a.membershipId,a.email]);
   }
   await pool.query('INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)',[a.email,a.userId]);
   await pool.query('INSERT INTO identity.membership_locator VALUES($1,$2,$3)',[a.userId,tenantId,a.membershipId]);
   const digest=createHmac('sha256','sbox-only-identity-hmac-secret-32-bytes').update(`session:${a.token}`).digest('hex');
   await pool.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day')",[a.sessionId,a.userId,digest,a.csrf]);
  }
  await pool.query('COMMIT');return {tenantId,actors};
 }finally{await pool.end();}
}
async function signIn(context:BrowserContext,token:string) {
 await context.addCookies([{name:'jobguard_session',value:token,url:origin,httpOnly:true,sameSite:'Strict'}]);
}
async function screen(page:Page) {
 await page.goto('/admin/contractor/identity');
 return page.getByRole('region',{name:'Restricted emergency access'});
}
test('dual-owner request to revocation, notices and retired-route refusal',async({browser,page})=>{
 const f=await seed(),[requester,a,b,target]=f.actors;
 await signIn(page.context(),requester!.token);let controls=await screen(page);
 await controls.getByLabel('Emergency reason').fill('Fictional compromised non-owner account');
 await controls.getByRole('button',{name:'Request emergency access',exact:true}).click();
 await expect(controls.getByRole('status')).toHaveText('request recorded.');
 const id=await controls.getByLabel('Emergency request ID').inputValue();expect(id).toMatch(/^[a-f0-9-]{36}$/);
 await controls.getByRole('button',{name:'Open emergency access',exact:true}).click();
 await expect(controls.getByRole('status')).toContainText('refused');
 for(const approver of [a!,b!]) {
  const context=await browser.newContext({viewport:page.viewportSize()!});
  try {
   await signIn(context,approver.token);const tab=await context.newPage(),approval=await screen(tab);
   await approval.getByLabel('Emergency request ID').fill(id);
   await approval.getByRole('button',{name:'Approve emergency request',exact:true}).click();
   await expect(approval.getByRole('status')).toHaveText('approve recorded.');
   await expect(approval.getByRole('alert',{name:'Emergency access activity'})).toContainText(requester!.email);
  }finally{await context.close();}
 }
 await controls.getByRole('button',{name:'Open emergency access',exact:true}).click();
 await expect(controls.getByRole('status')).toContainText('open recorded');
 await controls.getByRole('button',{name:'Inspect sign-in requirement',exact:true}).click();
 await expect(controls.getByRole('status')).toHaveText('Single sign-on required: Off');
 await controls.getByLabel('Non-owner membership ID').fill(target!.membershipId);
 await controls.getByRole('button',{name:'Revoke non-owner access',exact:true}).click();
 await expect(controls.getByRole('status')).toHaveText('revoke_member recorded.');
 const notice=controls.getByRole('alert',{name:'Emergency access activity'});
 await expect(notice).toContainText('revoke_member');await expect(notice).toContainText(a!.email);await expect(notice).toContainText(b!.email);
 const refused=await page.request.post('/api/auth/sso-required/emergency',{data:{version:'sso-emergency.v2',requested_tenant_id:f.tenantId}});
 expect(refused.status()).toBe(403);expect(await refused.json()).toEqual({code:'SSO_EMERGENCY_REFUSED'});expect(refused.headers()['cache-control']).toBe('no-store');
 const pool=new Pool({host:'127.0.0.1',port:55432,user:'postgres',password:'sbox-e2e-owner',database:'jobguard_synthetic_demo',max:1});
 try {
  expect((await pool.query('SELECT revoked_at FROM app.membership WHERE tenant_id=$1 AND id=$2',[f.tenantId,target!.membershipId])).rows[0].revoked_at).not.toBeNull();
  const events=(await pool.query("SELECT event_type FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'sso.emergency.%'",[f.tenantId])).rows.map(r=>r.event_type);
  for(const op of ['request','approve','open','inspect','revoke_member','notices'])expect(events).toContain(`sso.emergency.${op}`);
 }finally{await pool.end();}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('emergency-owner revocation keeps company single sign-on required',async({browser,page})=>{
 const f=await seed(),[requester,a,b,target]=f.actors;
 const pool=new Pool({host:'127.0.0.1',port:55432,user:'postgres',password:'sbox-e2e-owner',database:'jobguard_synthetic_demo',max:1});
 try {
  // Owner fixture writes only: model existing SSO sessions before requiring company SSO.
  // Ordinary email-code sessions are correctly excluded once the requirement is on.
  const connectionId=randomUUID();
  await pool.query('BEGIN');
  await pool.query('INSERT INTO identity.sso_connection(tenant_id,id,metadata) VALUES($1,$2,$3::jsonb)',[
   f.tenantId,connectionId,JSON.stringify({version:'sso-metadata.v1',protocol:'saml2',provider:'in-process-test-idp',id:connectionId,tenantId:f.tenantId})]);
  for(const actor of [requester!,a!,b!]) {
   const subjectHash=randomBytes(32).toString('hex'),emailHash=randomBytes(32).toString('hex');
   await pool.query('INSERT INTO identity.sso_subject(tenant_id,connection_id,subject_hash,email_hash,user_id,membership_id) VALUES($1,$2,$3,$4,$5,$6)',[
    f.tenantId,connectionId,subjectHash,emailHash,actor.userId,actor.membershipId]);
   await pool.query('INSERT INTO identity.sso_session_binding(tenant_id,connection_id,subject_hash,session_id) VALUES($1,$2,$3,$4)',[
    f.tenantId,connectionId,subjectHash,actor.sessionId]);
  }
  await pool.query("INSERT INTO identity.sso_required_event(tenant_id,id,revision,required,connection_id,actor_membership_id,actor_kind,reason) VALUES($1,$2,1,true,$3,$4,'admin','Fictional company requires single sign-on')",[
   f.tenantId,randomUUID(),connectionId,requester!.membershipId]);
  await pool.query('COMMIT');
 }finally{await pool.end();}
 await signIn(page.context(),requester!.token);const controls=await screen(page);
 await controls.getByLabel('Emergency reason').fill('Fictional compromised non-owner account with company SSO required');
 await controls.getByRole('button',{name:'Request emergency access',exact:true}).click();
 await expect(controls.getByRole('status')).toHaveText('request recorded.');
 const id=await controls.getByLabel('Emergency request ID').inputValue();expect(id).toMatch(/^[a-f0-9-]{36}$/);
 for(const approver of [a!,b!]) {
  const context=await browser.newContext({viewport:page.viewportSize()!});
  try {
   await signIn(context,approver.token);const tab=await context.newPage(),approval=await screen(tab);
   await approval.getByLabel('Emergency request ID').fill(id);
   await approval.getByRole('button',{name:'Approve emergency request',exact:true}).click();
   await expect(approval.getByRole('status')).toHaveText('approve recorded.');
  }finally{await context.close();}
 }
 await controls.getByRole('button',{name:'Open emergency access',exact:true}).click();
 await expect(controls.getByRole('status')).toContainText('open recorded');
 await controls.getByRole('button',{name:'Inspect sign-in requirement',exact:true}).click();
 await expect(controls.getByRole('status')).toHaveText('Single sign-on required: On');
 await controls.getByLabel('Non-owner membership ID').fill(target!.membershipId);
 await controls.getByRole('button',{name:'Revoke non-owner access',exact:true}).click();
 await expect(controls.getByRole('status')).toHaveText('revoke_member recorded.');
 await controls.getByRole('button',{name:'Inspect sign-in requirement',exact:true}).click();
 await expect(controls.getByRole('status')).toHaveText('Single sign-on required: On');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
