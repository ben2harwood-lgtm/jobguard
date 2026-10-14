// Written before the v3 workbench UI. NOT RUN in the builder sandbox.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { confirmCapturedScope } from "./helpers/capture-journey";
import { get, post } from "./helpers/recovery-sources";
const banner="Practice sandbox — synthetic data; nothing is sent or charged";
for(const [name,button,movement,q,reason] of [
 ["F15","Open materials-320 overcharge",null,"£0.00","Credit note below the £250 minimum"],
 ["F17","Open duplicate supplier payment","supplier-refund-540","£450.00",null],
 ["F18","Open £2,500 withheld payment","receipt-3000","£2,620.00","Fixed statutory compensation is not part of the fee base"],
 ["F19","Open £2,500 withheld payment","receipt-3000","£2,500.00","Fixed statutory compensation is not part of the fee base"],
 ["F20","Open £320 withheld payment","receipt-384","£0.00","Paid before you opened this case"],
 ["F21","Open materials-320 overcharge",null,"£0.00",null],
 ["F22","Record prevention",null,"£0.00","Prevented spending is not recovered cash"],
] as const){
 test(`${name} persists candidate Q, exact available reason and source across contexts`,async({page,browser,context},testInfo)=>{
  await confirmCapturedScope(page);const jobId=(await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
  const path=`/api/jobs/${jobId}/practice-feed`;let feed=await post(page,path,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:0,action:"connect"});
  const settle=async()=>{feed=await post(page,path,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:feed.revision,action:"advance",movement,step:"settled"});};
  if(name==="F20")await settle();
  await page.getByRole("button",{name:button,exact:true}).click();
  await expect(page.getByRole("article",{name:"Selected recovery case"})).toBeVisible();
  if(movement&&name!=="F20")await settle();
  const control=page.getByRole("button",{name:`Review v3 ${name}`,exact:true});await expect(control).toBeEnabled();
  const box=await control.boundingBox();expect(box?.width).toBeGreaterThanOrEqual(44);expect(box?.height).toBeGreaterThanOrEqual(44);
  await control.focus();await expect(control).toBeFocused();expect(await control.evaluate(el=>{const css=getComputedStyle(el);return css.outlineStyle!=="none"&&parseFloat(css.outlineWidth)>0;})).toBe(true);await page.keyboard.press("Enter");
  const verify=async(view:Page)=>{
   await expect(view.getByTestId("v3-qualifying-principal")).toHaveText(q);
   await expect(view.getByTestId("v3-outcome")).toHaveText(q==="£0.00"?"Excluded":"Eligible for review");
   if(reason)await expect(view.getByTestId("v3-reason")).toHaveText(reason);
   if(name==="F19")await expect(view.getByTestId("v3-line-statutory_interest")).toContainText("£0.00");
   if(name==="F19")await expect(view.getByTestId("v3-line-statutory_interest")).toContainText("Late-payment interest only counts when a business paid it. This customer is a private individual, so this interest isn’t counted as recovered money and there’s no fee on it.");
   if(name==="F21")await expect(view.getByTestId("v3-reason")).toHaveCount(0);
   await expect(view.getByText(banner,{exact:true})).toHaveCount(1);
   expect(await view.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  };
  await verify(page);const saved=(await get(page,`/api/jobs/${jobId}/recovery-cases`)).cases.at(-1);
  expect(saved.eligibilityV3.result.qualifyingPrincipal.pence).toBe(name==="F17"?45000:name==="F18"?262000:name==="F19"?250000:0);
  expect(saved.eligibilityV3.result.productionEnabled).toBe(false);expect(saved.landedNetPence).toBe(0);expect(saved.feeJobLiabilityPence).toBe(0);
  await page.reload();await verify(page);
  // Captured jobs are not listed by the existing home projection. Navigate through Jobs, then the saved job's URL.
  await page.goto("/");await expect(page.getByRole("heading",{name:"Jobs",exact:true})).toBeVisible();await page.goto(`/jobs/${jobId}#recovery-cases`);await verify(page);
  const cookies=(await context.cookies()).filter(c=>c.name==="jg_session"),second=await browser.newContext({...(testInfo.project.use.baseURL?{baseURL:testInfo.project.use.baseURL}:{}),...(testInfo.project.use.viewport?{viewport:testInfo.project.use.viewport}:{}),storageState:{cookies,origins:[]}});
  try{const reply=await second.request.get(`/api/jobs/${jobId}/recovery-cases`);expect(reply.ok()).toBe(true);expect((await reply.json()).cases.find((c:{id:string})=>c.id===saved.id).eligibilityV3).toEqual(saved.eligibilityV3);const view=await second.newPage();await view.goto(`/jobs/${jobId}#recovery-cases`);await verify(view);}finally{await second.close();}
 });
}
test("v3 refuses injected authority, missing settlement, and changed replay payload",async({page})=>{
 await confirmCapturedScope(page);const jobId=(await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
 await page.getByRole("button",{name:"Open £2,500 withheld payment",exact:true}).click();await expect(page.getByRole("article",{name:"Selected recovery case"})).toBeVisible();const c=(await get(page,`/api/jobs/${jobId}/recovery-cases`)).cases.at(-1);
 const path=`/api/jobs/${jobId}/recovery-cases/eligibility`,raw={version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:c.id,expectedCaseRevision:c.revision,expectedReviewRevision:0,fixture:"F18"};
 const missing=await page.request.post(path,{data:raw});expect(missing.status()).toBe(400);expect(await missing.json()).toMatchObject({code:"ELIGIBILITY_SOURCE_REQUIRED"});
 for(const fields of [{Q:262000},{debtorType:"business"},{settlement:"settled"},{termsStatus:"approved"}])expect((await page.request.post(path,{data:{...raw,...fields}})).status()).toBe(400);
 expect((await get(page,`/api/jobs/${jobId}/recovery-cases`)).cases.at(-1).eligibilityV3).toBeNull();
 const feedPath=`/api/jobs/${jobId}/practice-feed`;
 const connected=await post(page,feedPath,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:0,action:"connect"});
 await post(page,feedPath,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:connected.revision,action:"advance",movement:"receipt-3000",step:"settled"});
 const saved=await post(page,path,raw),replay=await post(page,path,raw);expect(replay.cases.find((x:{id:string})=>x.id===c.id).eligibilityV3).toEqual(saved.cases.find((x:{id:string})=>x.id===c.id).eligibilityV3);expect(replay.eligibilityV3CommandResult).toEqual(saved.eligibilityV3CommandResult);expect(saved.eligibilityV3CommandResult.id).toBe(saved.cases.find((x:{id:string})=>x.id===c.id).eligibilityV3.id);
 const conflict=await page.request.post(path,{data:{...raw,fixture:"F19"}});expect(conflict.status()).toBe(409);expect(await conflict.json()).toMatchObject({code:"IDEMPOTENCY_PAYLOAD_CONFLICT"});
});
test("a duplicate-payment case offers no v1 review controls and refuses a v1 command",async({page})=>{
 await confirmCapturedScope(page);const jobId=(await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
 await page.getByRole("button",{name:"Open duplicate supplier payment",exact:true}).click();
 await expect(page.getByRole("article",{name:"Selected recovery case"})).toBeVisible();
 await expect(page.getByRole("button",{name:"Review v3 F17",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Review evidence-backed claim",exact:true})).toHaveCount(0);
 await expect(page.getByRole("button",{name:/^Review: /})).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Approve this eligibility review",exact:true})).toHaveCount(0);
 const c=(await get(page,`/api/jobs/${jobId}/recovery-cases`)).cases.at(-1);
 const refused=await page.request.post(`/api/jobs/${jobId}/recovery-cases/eligibility`,{data:{version:"recovery-eligibility-command.v1",action:"review",commandId:randomUUID(),caseId:c.id,expectedCaseRevision:c.revision,scenario:"evidence_backed_withheld_payment",evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1}});
 expect(refused.status()).toBe(400);expect(await refused.json()).toMatchObject({code:"ELIGIBILITY_FIXTURE_MISMATCH"});
 expect((await get(page,`/api/jobs/${jobId}/recovery-cases`)).cases.at(-1).eligibility).toBeNull();
});

test("F17 refund settled before opening shows the existing timing exclusion through Review v3 F17",async({page})=>{
 await confirmCapturedScope(page);const jobId=(await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
 const path=`/api/jobs/${jobId}/practice-feed`;
 const feed=await post(page,path,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:0,action:"connect"});
 await post(page,path,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:feed.revision,action:"advance",movement:"supplier-refund-540",step:"settled"});
 await page.getByRole("button",{name:"Open duplicate supplier payment",exact:true}).click();
 await page.getByRole("article",{name:"Selected recovery case"}).waitFor();
 await page.getByRole("button",{name:"Review v3 F17",exact:true}).click();
 await expect(page.getByTestId("v3-reason")).toHaveText("Paid before you opened this case");
});


test("[A1 A6 Browser] insurer-paid F18 uses its own exclusion reason and survives reload",async({page})=>{
 await confirmCapturedScope(page);const jobId=(await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
 const partiesPath=`/api/jobs/${jobId}/parties`,before=await get(page,partiesPath);
 const insurer=await post(page,partiesPath,{version:"job-parties-command.v1",commandId:randomUUID(),action:"create_customer",customer:{version:"customer.v1",name:"Fictional insurer",type:"insurer"}});
 await post(page,partiesPath,{version:"job-parties-command.v1",commandId:randomUUID(),action:"bind",expectedJobRevision:before.jobRevision,parties:{version:"job-parties.v1",customerRevisionId:before.current.customerRevisionId,siteRevisionId:before.current.siteRevisionId,payingPartyRevisionId:insurer.revisionId}});
 await page.getByRole("button",{name:"Open £2,500 withheld payment",exact:true}).click();
 await expect(page.getByRole("article",{name:"Selected recovery case"})).toBeVisible();
 const path=`/api/jobs/${jobId}/practice-feed`,feed=await post(page,path,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:0,action:"connect"});
 await post(page,path,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:feed.revision,action:"advance",movement:"receipt-3000",step:"settled"});
 await page.getByRole("button",{name:"Review v3 F18",exact:true}).click();
 const verify=async()=>{await expect(page.getByTestId("v3-qualifying-principal")).toHaveText("£0.00");await expect(page.getByTestId("v3-outcome")).toHaveText("Excluded");await expect(page.getByTestId("v3-reason")).toHaveText("Insurer proceeds never qualify");};
 await verify();await page.reload();await verify();
});
