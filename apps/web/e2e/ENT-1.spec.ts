import { expect, test, type Page } from '@playwright/test';
test.setTimeout(180_000);
const base='http://127.0.0.1:3000';
const B=(page:Page,name:string)=>page.getByRole('button',{name,exact:true});
async function view(page:Page){const response=await page.request.get('/api/contractor');expect(response.status()).toBe(200);return response.json();}
async function post(page:Page,fields:Record<string,unknown>,revision:number){return page.request.post('/api/contractor',{headers:{origin:base},data:{version:'contractor-command.v1',environment:'synthetic_demo',commandId:crypto.randomUUID(),id:crypto.randomUUID(),expectedRevision:revision,...fields}});}
test('admin organisation and immutable contracts persist across refresh, deep links and two browsers',async({page,browser})=>{
 await page.goto('/admin/contractor');await B(page,'Start generated contractor practice').click();await expect(page.getByTestId('contractor-revision')).toHaveText('0');
 const first=await view(page);expect(first.environment).toBe('synthetic_demo');expect(first.realExternalActions).toBe(0);
 await page.getByLabel('Unit name').fill('Fictional east region');await B(page,'Add unit').click();await expect(page.getByTestId('contractor-revision')).toHaveText('1');
 await page.getByLabel('Team name').fill('Fictional emergency team');await B(page,'Add team').click();await expect(page.getByTestId('contractor-revision')).toHaveText('2');
 await B(page,'Add fictional member').click();await expect(page.getByTestId('contractor-revision')).toHaveText('3');
 await B(page,'Add fictional client').click();await expect(page.getByTestId('contractor-revision')).toHaveText('4');
 await page.getByLabel('Proceed limit (£)').fill('250.00');await B(page,'Save contract version').click();await expect(page.getByTestId('contractor-revision')).toHaveText('5');
 let persisted=await view(page);expect(persisted.contracts).toHaveLength(1);const original=persisted.contracts[0];expect(original.rules.proceedLimit).toEqual({pence:25000,currency:'GBP'});expect(original.document.tenderedAdjustment).toEqual({numerator:'-35',denominator:'1000'});
 await page.getByLabel('Existing contract').selectOption(original.contract_id);await page.getByLabel('Proceed limit (£)').fill('300.00');await B(page,'Save contract version').click();await expect(page.getByTestId('contractor-revision')).toHaveText('6');
 // Malformed input remains an unsaved draft and receives focus; no success API is intercepted.
 await page.getByLabel('Approval rules draft').fill('{broken');await B(page,'Save contract version').click();await expect(page.getByRole('main').getByRole('alert')).toHaveText('INVALID_RULE_DOCUMENT');await expect(page.getByRole('main').getByRole('alert')).toBeFocused();expect((await view(page)).revision).toBe(6);
 await page.reload();await expect(page.getByTestId('contractor-revision')).toHaveText('6');persisted=await view(page);expect(persisted.contracts[0]).toEqual(original);expect(persisted.contracts[1].rules.proceedLimit.pence).toBe(30000);await expect(page.getByTestId('contract-version')).toHaveCount(2);
 await page.getByText('Details and source identity',{exact:true}).first().click();await expect(page.getByText(`Version ${original.id}`,{exact:true})).toBeVisible();await expect(page.getByText(`Rule version ${original.rule_version_id}`,{exact:true})).toBeVisible();
 const context=await browser.newContext();await context.addCookies(await page.context().cookies());const second=await context.newPage();await second.goto('/admin/contractor');await expect(second.getByTestId('contractor-revision')).toHaveText('6');expect((await view(second)).contracts).toEqual(persisted.contracts);
 const branch=persisted.teams[0].branch_id;
 const racing=await Promise.all([post(page,{kind:'team.create',branchId:branch,name:'Fictional racing A'},6),post(second,{kind:'team.create',branchId:branch,name:'Fictional racing B'},6)]);expect(racing.map(x=>x.status()).sort()).toEqual([200,409]);const stale=racing.find(x=>x.status()===409)!;expect((await stale.json()).code).toBe('STALE_REVISION');
 // Revoke a grant and a membership through real services, then reload the authoritative projection.
 let latest=await view(page);const member=latest.members.find((m:any)=>m.membership_id!==latest.membershipId);const grant=latest.grants.find((g:any)=>g.membership_id===member.membership_id);
 expect((await post(page,{kind:'grant.revoke',grantId:grant.id},latest.revision)).status()).toBe(200);latest=await view(page);expect((await post(page,{kind:'membership.revoke',membershipId:member.membership_id},latest.revision)).status()).toBe(200);await page.reload();await expect(page.getByText(`${member.email} · Revoked`,{exact:true})).toBeVisible();
 const forbidden=await page.request.get(`/api/contractor?tenantId=${crypto.randomUUID()}`);expect(forbidden.status()).toBe(404);expect((await forbidden.json()).code).toBe('NOT_FOUND');
 const unknown=await page.request.get(`/api/contractor?tenantId=${first.tenantId}&resource=contracts&id=${crypto.randomUUID()}`);expect(unknown.status()).toBe(404);
 const csrf=await page.request.post('/api/contractor',{data:{}});expect(csrf.status()).toBe(403);
 await expect(page.getByText('Practice sandbox — synthetic data; nothing is sent or charged',{exact:true})).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 const reload=B(page,'Reload persisted organisation');await reload.focus();await expect(reload).toBeFocused();expect(await reload.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');const box=await reload.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
 await page.getByRole('link',{name:'Back to Jobs',exact:true}).click();await page.getByRole('button',{name:'Skip tour',exact:true}).click();await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByRole('link',{name:'Contractor organisation practice',exact:true}).click();await expect(page.getByTestId('contractor-tenant')).toHaveText(first.tenantId);
 await page.screenshot({path:`test-results/ENT-1-${test.info().project.name}.png`,fullPage:true});await context.close();
});
test('generated contractor tenants are separate and malformed policies return typed errors',async({page,browser})=>{
 await page.goto('/admin/contractor');await B(page,'Start generated contractor practice').click();await expect(page.getByTestId('contractor-revision')).toHaveText('0');const a=await view(page);
 const otherContext=await browser.newContext();const other=await otherContext.newPage();await other.goto('/admin/contractor');await B(other,'Start generated contractor practice').click();await expect(other.getByTestId('contractor-revision')).toHaveText('0');const b=await view(other);expect(a.tenantId).not.toBe(b.tenantId);
 expect((await page.request.get(`/api/contractor?tenantId=${b.tenantId}`)).status()).toBe(404);
 const client=crypto.randomUUID();expect((await post(page,{kind:'client.create',id:client,branchId:a.teams[0].branch_id,name:'Fictional rules test',clientType:'insurer'},0)).status()).toBe(200);
 const malformed=await post(page,{kind:'contract.revise',clientId:client,contractId:crypto.randomUUID(),document:{},rules:{version:'approval-rules.v1'}},1);expect(malformed.status()).toBe(422);expect((await malformed.json()).code).toBe('INVALID_RULE_DOCUMENT');expect((await view(page)).contracts).toHaveLength(0);
 const forged=await post(page,{kind:'team.create',branchId:a.teams[0].branch_id,name:'Fictional',environment:'production_billing'},1);expect(forged.status()).toBe(422);
 await page.reload();await expect(page.getByTestId('contractor-revision')).toHaveText('1');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await otherContext.close();
});
