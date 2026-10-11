import { expect, test, type Page } from "@playwright/test";
import { openQuotingWatchdogJob } from "./helpers/capture-journey";
import { openQuote as openV1Quote } from "./helpers/v1-sample-job";
import { issueInvoice } from "./helpers/customer-invoice-journey";
const forbidden=/£79|\bcap\b|plan credit/iu;
const banner="Practice sandbox — synthetic data; nothing is sent or charged";
async function click(page:Page,name:string){const b=page.getByRole("button",{name,exact:true});await expect(b).toBeEnabled();await b.click();}
async function audit(page:Page){await expect(page.getByRole("heading",{name:"Extra work and omissions",exact:true})).toBeVisible();await expect(page.getByTestId("activation-policy")).toHaveText("reference_fee_policy_v3");expect(await page.locator("body").innerText()).not.toMatch(forbidden);await expect(page.getByText(banner,{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);}
test("CH-1 new job persists v3 terms across reload, Jobs and a second context",async({page,browser})=>{
 await openQuotingWatchdogJob(page);await page.getByLabel("Unit rate Clean site").fill("200.00");
 for(const name of["Save draft revision","Preview immutable quote","Simulate sending this quote","Continue fake worker","Record practice acceptance"])await click(page,name);
 const button=page.getByRole("button",{name:"Start this practice job",exact:true});await button.focus();await expect(button).toBeFocused();const box=await button.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.width).toBeGreaterThanOrEqual(44);await button.press("Enter");
 await audit(page);const jobId=(await page.locator(".quote-editor").getAttribute("data-job-id"))!,url=page.url(),path=`/api/jobs/${jobId}/quotes/activation`;
 const view=await(await page.request.get(path)).json();expect(view.terms).toMatchObject({acceptedNetPence:100000,smallJob:true,trialPlanContext:"none_recorded_pre_mon2a"});expect(view.effects).toMatchObject({activations:1,termsRows:1,capSnapshots:0,simulatedObligations:0,settlements:0,platformJournals:0});
 for(const extra of[{smallJob:false},{policyVersion:"reference_fee_policy_v1"},{commercialTrack:"contractor"},{terms:{smallJob:false}}])expect((await page.request.post(path,{data:{version:"practice-activation-command.v1",commandId:crypto.randomUUID(),scenario:"no_charge",...extra}})).status()).toBe(400);
 await page.reload();await click(page,"Price the work");await audit(page);
 await page.goto("/");await page.locator(`a[href="/jobs/${jobId}"]`).click();await click(page,"Price the work");await audit(page);
 const other=await browser.newContext({storageState:await page.context().storageState()});try{const second=await other.newPage();await second.goto(url);await click(second,"Price the work");await audit(second);expect((await(await second.request.get(path)).json()).terms).toEqual(view.terms);}finally{await other.close();}
 await page.screenshot({path:`test-results/CH-1-${test.info().project.name}.png`,fullPage:true});
});
test("CH-1 saved v1 sample retains labelled historic pricing",async({page})=>{
 await openV1Quote(page);for(const input of await page.getByLabel(/Unit rate/u).all())if(await input.inputValue()==="")await input.fill("100.00");
 for(const name of["Save draft revision","Preview immutable quote","Simulate sending this quote","Continue fake worker","Record practice acceptance","Start this practice job"])await click(page,name);
 await expect(page.getByRole("heading",{name:"Earlier proposed pricing (v1)",exact:true})).toBeVisible();await expect(page.getByTestId("recovery-cap")).toBeVisible();await expect(page.getByTestId("variation-cap")).toBeVisible();
});

test("CH-1 copy audit covers issued customer documents and stored projections",async({page})=>{
 const {jobId,invoiceId}=await issueInvoice(page);
 expect(await page.locator("body").innerText()).not.toMatch(forbidden);
 for(const suffix of["quotes/activation","quotes/acceptance","final-account","customer-invoices"]){const r=await page.request.get(`/api/jobs/${jobId}/${suffix}`);expect(r.ok()).toBe(true);expect(await r.text()).not.toMatch(forbidden);}
 const acceptance=await(await page.request.get(`/api/jobs/${jobId}/quotes/acceptance`)).json();
 for(const path of[`/api/jobs/${jobId}/quotes/artifacts/${acceptance.activeAcceptance.documentId}`,`/api/jobs/${jobId}/customer-invoices/${invoiceId}`]){const r=await page.request.get(path);expect(r.ok()).toBe(true);expect((await r.body()).toString("utf8")).not.toMatch(forbidden);}
 await page.goto(`/jobs/${jobId}/value`);await expect(page.getByRole("heading",{name:"How JobGuard helps protect your money",exact:true})).toBeVisible();expect(await page.locator("body").innerText()).not.toMatch(forbidden);
});
