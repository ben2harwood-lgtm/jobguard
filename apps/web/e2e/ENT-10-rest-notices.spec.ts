import { expect, test } from '@playwright/test';
// Presentation-only fixture. Real owner/tenant/session authorization is tested by PostgreSQL integration tests.
for(const owner of ['requester','first-approver','second-approver'])test(`emergency notice is visible to ${owner} on the identity screen`,async({page})=>{
 const tenantId='11111111-1111-4111-8111-111111111111';
 await page.route('**/api/auth/session',route=>route.fulfill({json:{csrfToken:'fictional-csrf',memberships:[{id:owner,tenantId,name:'Fictional contractor'}]}}));
 await page.route('**/api/auth/sso?*',route=>route.fulfill({json:{version:'sso-admin-view.v1',environment:'synthetic_demo',tenantId,connections:[],domains:[],mappings:[],events:[]}}));
 await page.route('**/api/auth/sso-required?*',route=>route.fulfill({status:403,json:{code:'SSO_REQUIRED_FORBIDDEN'}}));
 await page.route('**/api/auth/sso-required/emergency-notices?*',route=>route.fulfill({json:{notices:[{
  id:'fixture-event',request_id:'fixture-request',actor:'fixture-owner',ownerName:'Fictional Owner',operation:'open',created_at:'2026-11-04T12:00:00Z',
 }]}}));
 await page.goto('/admin/contractor/identity');
 const notice=page.locator('main').getByRole('alert',{name:'Emergency access activity'});
 await expect(notice).toContainText('Fictional Owner');await expect(notice).toContainText('Access lasts one hour');
 await expect(notice).toContainText('fixture-request');
});
