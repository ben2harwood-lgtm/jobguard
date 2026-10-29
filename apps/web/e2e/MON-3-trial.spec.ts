import { expect,test } from "@playwright/test";
// UI contract tests use intercepted synthetic responses. These do not claim
// PostgreSQL, capacity admission, provider integration or a successful activation.
const job='22222222-2222-4222-8222-222222222222',company='11111111-1111-4111-8111-111111111112';
const initial=()=>({version:'trial-screen.v1',start:null,timeline:null,target:{acceptedDocumentId:'33333333-3333-4333-8333-333333333333',acceptedDocumentVersion:1,acceptedDocumentHash:'a'.repeat(64),expectedJobRevision:3},eligibility:{offerSkip:true,cardGate:'optional_first',cardAction:null}});
test('first-only Skip, fictional card setup and clean capacity refusal survive refresh',async({page})=>{
 let card=false,attempt:string|null=null;
 await page.route('**/api/auth/session',route=>route.fulfill({json:{csrfToken:'fictional-csrf',memberships:[{tenantId:company,name:'Fictional builder',role:'owner'}]}}));
 await page.route(`**/api/jobs/${job}/trial`,async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{...initial(),eligibility:card?{offerSkip:false,cardGate:'completed',cardAction:null}:initial().eligibility}});
  const body=route.request().postDataJSON();expect(route.request().headers()['x-tenant-id']).toBe(company);
  if(body.kind==='request_card')attempt=body.commandId;
  if(body.kind==='simulate_card'){expect(body.commandId).toBe(attempt);card=true;}
  return route.fulfill({json:{hypothetical:true}});
 });
 await page.route(`**/api/jobs/${job}/quotes/activation`,route=>route.fulfill({status:409,json:{code:'CAPACITY_ADMISSION_UNAVAILABLE'}}));
 await page.goto(`/jobs/${job}/trial`);
 await expect(page.getByRole('main').getByRole('note')).toContainText('no real charges');
 const skip=page.getByRole('button',{name:'Skip for now',exact:true});await expect(skip).toBeVisible();await skip.focus();await expect(skip).toBeFocused();
 const bounds=await skip.boundingBox();expect(bounds!.height).toBeGreaterThanOrEqual(44);
 await skip.click();await expect(page.getByRole('alert')).toContainText('has not gone live');
 await page.getByRole('button',{name:'Add a card',exact:true}).click();await page.getByRole('button',{name:'Complete fictional card setup'}).click();
 await expect(skip).toHaveCount(0);await expect(page.getByText('Simulated card on file.')).toBeVisible();
 await page.reload();await expect(page.getByText('Simulated card on file.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('a second job without a card never offers Skip or switch-live',async({page})=>{
 await page.route('**/api/auth/session',route=>route.fulfill({json:{csrfToken:'fictional-csrf',memberships:[{tenantId:company,name:'Fictional builder',role:'owner'}]}}));
 await page.route(`**/api/jobs/${job}/trial`,route=>route.fulfill({json:{...initial(),eligibility:{offerSkip:false,cardGate:'add_card',cardAction:'Add a card'}}}));
 await page.goto(`/jobs/${job}/trial`);await expect(page.getByRole('button',{name:'Add a card',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Skip for now'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Switch this job live'})).toHaveCount(0);
});
