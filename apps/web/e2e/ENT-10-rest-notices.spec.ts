import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { Pool } from 'pg';

// Persist fictional owner credentials and actions; the notices request uses the real route and PostgreSQL.
// Other identity panels are presentation fixtures so this journey isolates the notices boundary.
for (const owner of ['requester', 'first-approver', 'second-approver']) {
 test(`emergency notice is visible to ${owner} on the identity screen`, async ({ page, context }) => {
  const tenantId = randomUUID(), accountId = randomUUID(), requestId = randomUUID();
  const csrfToken = randomBytes(24).toString('base64url'), token = randomBytes(32).toString('base64url');
  const pool = new Pool({ host: '127.0.0.1', port: 55432, user: 'postgres', password: 'sbox-e2e-owner', database: 'jobguard_synthetic_demo', max: 1 });
  const people = ['requester', 'first-approver', 'second-approver'].map(name => ({
   name, userId: randomUUID(), membershipId: randomUUID(), email: `${name}-${randomUUID()}@fictional.invalid`,
  }));
  const viewer = people.find(person => person.name === owner)!;
  const requester = people[0]!;
  try {
   await pool.query('INSERT INTO control_plane.tenant(id) VALUES($1)', [tenantId]);
   await pool.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional contractor')", [accountId, tenantId]);
   for (const person of people) {
    await pool.query('INSERT INTO identity.identity_user(id) VALUES($1)', [person.userId]);
    await pool.query('INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)', [person.email, person.userId]);
    await pool.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [person.membershipId, tenantId, accountId, person.userId]);
    await pool.query('INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)', [person.userId, tenantId, person.membershipId]);
   }
   const digest = createHmac('sha256', 'sbox-only-identity-hmac-secret-32-bytes').update(`session:${token}`).digest('hex');
   await pool.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day')", [randomUUID(), viewer.userId, digest, csrfToken]);
   await pool.query("INSERT INTO identity.emergency_request VALUES($1,$2,$3,$4,transaction_timestamp(),transaction_timestamp()+interval '15 minutes')", [tenantId, requestId, requester.membershipId, 'a'.repeat(64)]);
   await pool.query("INSERT INTO identity.emergency_action(tenant_id,id,request_id,actor,operation) VALUES($1,$2,$3,$4,'open')", [tenantId, randomUUID(), requestId, requester.membershipId]);
   await context.addCookies([{ name: 'jobguard_session', value: token, url: 'http://127.0.0.1:3000', httpOnly: true, secure: true, sameSite: 'Strict' }]);
   await page.route('**/api/auth/session', route => route.fulfill({ json: { csrfToken, memberships: [{ id: viewer.membershipId, tenantId, name: 'Fictional contractor' }] } }));
   await page.route('**/api/auth/sso?*', route => route.fulfill({ json: { version: 'sso-admin-view.v1', environment: 'synthetic_demo', tenantId, connections: [], domains: [], mappings: [], events: [] } }));
   await page.route('**/api/auth/sso-required?*', route => route.fulfill({ status: 403, json: { code: 'SSO_REQUIRED_FORBIDDEN' } }));
   const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/sso-required/emergency-notices');
   await page.goto('/admin/contractor/identity');
   const notices = await response;
   expect(notices.status()).toBe(200);
   expect(notices.headers()['cache-control']).toBe('no-store');
   const notice = page.locator('main').getByRole('alert', { name: 'Emergency access activity' });
   await expect(notice).toContainText(requester.email);
   await expect(notice).toContainText('Access lasts one hour');
   await expect(notice).toContainText(requestId);
   const audit = await pool.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='sso.emergency.notices'", [tenantId]);
   expect(audit.rows.length).toBeGreaterThanOrEqual(1);
   for (const event of audit.rows) expect(event.payload.references.membershipId).toBe(viewer.membershipId);
  } finally { await pool.end(); }
 });
}
