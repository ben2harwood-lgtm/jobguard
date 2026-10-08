import { expect, test, type Page } from "@playwright/test";
import { openQuote, openReview } from "./helpers/capture-journey";
test.setTimeout(240_000);
const B=(page:Page,name:string)=>page.getByRole("button",{name,exact:true});
const read=async(page:Page,id:string)=>{const r=await page.request.get(`/api/jobs/${id}/prevention-checks`);expect(r.ok(),await r.text()).toBe(true);return r.json();};
async function quote(page:Page){await openQuote(page);return (await page.locator(".quote-editor").getAttribute("data-job-id"))!;}
async function panel(page:Page,id:string){await page.goto(`/jobs/${id}#quote`);const price=B(page,"Price the work");if(await price.isVisible())await price.click();await expect(page.getByTestId("prevention-panel")).toBeVisible();}
test("MON-7a cited property facts persist for a homeowner across reload, Jobs and a returning browser",async({page,browser})=>{
  const id=await quote(page);
  await expect(page.getByTestId("prevention-company-eligibility")).toHaveText("not run — not a registered company");
  await expect(B(page,"Check company register")).toHaveCount(0);
  await expect(page.getByTestId("prevention-paying-party")).toContainText("Practice Customer");
  await B(page,"Check property registers").focus();await page.keyboard.press("Shift+Tab");await page.keyboard.press("Tab");
  await expect(B(page,"Check property registers")).toBeFocused();
  expect(await B(page,"Check property registers").evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe("none");
  const box=await B(page,"Check property registers").boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
  await B(page,"Check property registers").click();
  await expect(page.getByTestId("prevention-article_4-status")).toHaveText("unknown");
  await expect(page.getByTestId("prevention-flood-status")).toHaveText("unknown");
  const before=await read(page,id);expect(before.property).toHaveLength(5);expect(before.realExternalActions).toBe(0);
  const personCommand={version:"prevention-command.v1",commandId:crypto.randomUUID(),action:"company",expectedBindingId:before.parties.bindingId,scenarioNow:"2026-10-07T13:00:00.000Z",fixture:"mixed"};
  const denied=await page.request.post(`/api/jobs/${id}/prevention-checks/company`,{data:personCommand});expect(denied.status()).toBe(400);expect((await denied.json()).code).toBe("NOT_REGISTERED_COMPANY");
  const forged=await page.request.post(`/api/jobs/${id}/prevention-checks/company`,{data:{...personCommand,commandId:crypto.randomUUID(),customerType:"business",isIndividual:false}});expect(forged.status()).toBe(400);
  for(const fact of before.property){const card=page.getByTestId(`prevention-${fact.kind}`);await expect(card).toContainText(fact.source.id);await expect(card).toContainText(fact.source.name);await expect(card).toContainText(fact.retrievedAt);}
  await page.reload();await panel(page,id);await expect(page.getByTestId("prevention-article_4-status")).toHaveText("unknown");expect((await read(page,id)).property).toEqual(before.property);
  await page.goto("/");await page.locator(`a[href="/jobs/${id}"]`).first().click();await panel(page,id);
  expect((await read(page,id)).property).toEqual(before.property);
  const returning=await browser.newContext({baseURL:"http://127.0.0.1:3000",viewport:page.viewportSize()!,storageState:await page.context().storageState()});
  const stranger=await browser.newContext({baseURL:"http://127.0.0.1:3000"});const missing=await browser.newContext({baseURL:"http://127.0.0.1:3000"});
  try{
    const second=await returning.newPage();await panel(second,id);await expect(second.getByTestId("prevention-flood-status")).toHaveText("unknown");expect((await read(second,id)).property).toEqual(before.property);
    await stranger.request.post("/api/session");
    for(const target of [id,crypto.randomUUID()]){
      expect((await stranger.request.get(`/api/jobs/${target}/prevention-checks`)).status()).toBe(404);
      expect((await stranger.request.post(`/api/jobs/${target}/prevention-checks/property`,{data:{}})).status()).toBe(404);
    }
    expect((await missing.request.get(`/api/jobs/${id}/prevention-checks`)).status()).toBe(401);
    expect((await missing.request.post(`/api/jobs/${id}/prevention-checks/property`,{data:{}})).status()).toBe(401);
  }finally{await returning.close();await stranger.close();await missing.close();}
  await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
test("MON-7a free company and opted-in feeds remain advisory, stale and missing remain unknown",async({page})=>{
  const id=await quote(page);
  await page.getByLabel("Customer type").selectOption("business");
  await page.getByLabel("Company number (optional)").fill("ZZ000001");
  await B(page,"Save customer and site").click();
  await expect(page.getByTestId("prevention-company-eligibility")).toHaveText("eligible");
  await expect(page.getByTestId("prevention-watch-state")).toHaveText("Off — not watching");
  await B(page,"Check company register").click();await expect(page.getByTestId("prevention-company-status")).toHaveText("clear");
  await B(page,"Watch this customer").click();await expect(page.getByTestId("prevention-watch-state")).toHaveText("On — explicitly requested");
  await B(page,"Check watched feeds").click();await expect(page.getByTestId("prevention-gazette_feed-status")).toHaveText("advisory");
  for(const fixture of ["stale","missing"]){
    await page.getByLabel("Generated register scenario").selectOption(fixture);
    await B(page,"Check property registers").click();for(const kind of ["listed_building","conservation_area","article_4","planning_history","flood"])await expect(page.getByTestId(`prevention-${kind}-status`)).toHaveText("unknown");
    await B(page,"Check company register").click();await expect(page.getByTestId("prevention-company-status")).toHaveText("unknown");
    await B(page,"Check watched feeds").click();for(const kind of ["companies_house_feed","gazette_feed"])await expect(page.getByTestId(`prevention-${kind}-status`)).toHaveText("unknown");
  }
  const view=await read(page,id);for(const fact of [view.company,...view.watch.results]){const card=page.getByTestId(`prevention-${fact.kind}`);await expect(card).toContainText(fact.source.name);await expect(card).toContainText(fact.retrievedAt);}
  await page.reload();await panel(page,id);await expect(page.getByTestId("prevention-company-status")).toHaveText("unknown");
  await B(page,"Stop watching this customer").click();await expect(page.getByTestId("prevention-watch-state")).toHaveText("Off — not watching");
  await expect(page.getByTestId("prevention-gazette_feed")).toHaveCount(0);expect((await read(page,id)).realExternalActions).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
test("MON-7a leaves VALUE-1 and saved fee illustration figures unchanged",async({page})=>{
  await openReview(page);
  await page.getByLabel("Customer type").selectOption("business");await page.getByLabel("Company number (optional)").fill("ZZ000001");await B(page,"Save customer and site").click();
  await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
  const reviewId=new URL(page.url()).pathname.split("/").pop()!;
  await expect.poll(async()=>{const response=await page.request.get(`/api/jobs/${reviewId}/parties`);return response.ok()?(await response.json()).current?.customer.companyNumber:null;}).toBe("ZZ000001");
  for(const name of ["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await B(page,`Accept ${name}`).click();
  await B(page,"Dismiss Replace shelves").click();await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this fictional quote");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Fictional builder removes waste");await B(page,"Confirm scope").click();await B(page,"Price the work").click();
  await B(page,"Save draft revision").click();await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await page.getByLabel("Unit rate Clean site").fill("200.00");await B(page,"Save draft revision").click();await expect(page.getByTestId("quote-revision")).toHaveText("2");
  await B(page,"Preview immutable quote").click();await B(page,"Simulate sending this quote").click();await B(page,"Continue fake worker").click();
  await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");await B(page,"Record practice acceptance").click();await B(page,"Start this practice job").click();
  await expect(page.getByRole("heading",{name:"Live · baseline frozen",exact:true})).toBeVisible();
  const id=(await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  // Establish a nonzero VALUE-1 figure through the existing explicit variation path.
  const proposalId=crypto.randomUUID();
  const proposed=await page.request.post(`/api/jobs/${id}/variations`,{data:{version:"variation-command.v1",action:"propose",proposalId,scopeItemId:crypto.randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:null,description:"Fictional captured extra preparation",captureText:"Builder logged this fictional extra",price:{quantity:"1",unit:"item",unitRatePence:12500,direction:"addition"}}});
  expect(proposed.ok(),await proposed.text()).toBe(true);const proposedView=await proposed.json();const variation=proposedView.variations.find((row:{id:string})=>row.id===proposalId);
  const approved=await page.request.post(`/api/jobs/${id}/variations`,{data:{version:"variation-command.v1",action:"approve",variationId:proposalId,revisionId:variation.currentRevisionId,approvalId:crypto.randomUUID(),attestation:"Builder-recorded practice acceptance — not an authenticated customer signature"}});expect(approved.ok(),await approved.text()).toBe(true);
  // Existing illustration remains read-only to prevention; its explicit setup is separate.
  const prepared=await page.request.post(`/api/jobs/${id}/fee-illustration`,{data:{version:"fee-illustration-source.v1",commandId:crypto.randomUUID(),fixture:"recovery-18800"}});expect(prepared.ok(),await prepared.text()).toBe(true);
  const feeBefore=await prepared.json();
  await panel(page,id);
  await expect(page.locator(".fee-statement").getByTestId("additional-fee")).toHaveText("£203.00");
  const feeFiguresBefore=await page.locator(".statement-facts dd").allTextContents();
  await page.goto(`/jobs/${id}/value`);await expect(page.getByTestId("value-invoiced-gross")).toBeVisible();await expect(page.getByTestId("value-approved-extras")).toHaveText("£125.00");const valueBefore=await page.locator(".value-card").allTextContents();
  // Evaluate every prevention action after recording the financial baselines.
  const view=await read(page,id);
  const input={version:"prevention-command.v1",commandId:crypto.randomUUID(),action:"property",expectedBindingId:view.parties.bindingId,scenarioNow:"2026-10-07T13:00:00.000Z",fixture:"mixed"};
  const results=await Promise.all([page.request.post(`/api/jobs/${id}/prevention-checks/property`,{data:input}),page.request.post(`/api/jobs/${id}/prevention-checks/property`,{data:input})]);
  for(const result of results)expect(result.ok(),await result.text()).toBe(true);expect(await results[0]!.json()).toEqual(await results[1]!.json());
  const conflict=await page.request.post(`/api/jobs/${id}/prevention-checks/property`,{data:{...input,fixture:"fresh"}});expect(conflict.status()).toBe(409);
  for(const action of ["company","start_watch","evaluate_watch","stop_watch"]){
    const response=await page.request.post(`/api/jobs/${id}/prevention-checks/${action}`,{data:{...input,commandId:crypto.randomUUID(),action,...(action==="company"?{}:{expectedWatchRevision:action==="start_watch"?0:1})}});
    expect(response.ok(),await response.text()).toBe(true);
  }
  await panel(page,id);
  await expect(page.locator(".fee-statement").getByTestId("additional-fee")).toHaveText("£203.00");
  expect(await page.locator(".statement-facts dd").allTextContents()).toEqual(feeFiguresBefore);
  const feeAfter=await page.request.get(`/api/jobs/${id}/fee-illustration`);expect(await feeAfter.json()).toEqual(feeBefore);
  await page.goto(`/jobs/${id}/value`);await expect(page.getByTestId("value-invoiced-gross")).toBeVisible();expect(await page.locator(".value-card").allTextContents()).toEqual(valueBefore);
});
