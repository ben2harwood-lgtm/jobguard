import{expect,test,type Page}from"@playwright/test";
import{prepareCurrentInvoiceFinalCheck}from"./helpers/customer-invoice-journey";
import{openReview}from"./helpers/v1-sample-job";
test.setTimeout(240_000);const tenant="11111111-1111-4111-8111-111111111111",B=(p:Page,n:string)=>p.getByRole("button",{name:n,exact:true});async function click(p:Page,n:string){await expect(B(p,n)).toBeVisible();
await expect(B(p,n)).toBeEnabled();
await B(p,n).click()}
async function enterQuote(page:Page){const button=B(page,"Price the work"),heading=page.getByRole("heading",{name:"Price the work",exact:true});
await Promise.race([button.waitFor({state:"visible",timeout:30_000}),heading.waitFor({state:"visible",timeout:30_000})]);if(await button.isVisible())await click(page,"Price the work");
await expect(heading).toBeVisible({timeout:30_000})}
async function enterLive(page:Page){await openReview(page);for(const n of["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await click(page,`Accept ${n}`);
await click(page,"Dismiss Replace shelves");
await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this practice quote");
await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
await click(page,"Confirm scope");
await enterQuote(page);
await click(page,"Save draft revision");
await expect(page.getByText("Rate confirmations are recorded once; nothing was sent or billed.",{exact:false})).toBeVisible();
await page.getByLabel("Unit rate Clean site").fill("200.00");
await expect(page.getByTestId("quote-net")).toHaveText("GBP 1,000.00");
await click(page,"Save draft revision");
await expect(page.getByText("Rate confirmations are recorded once; nothing was sent or billed.",{exact:false})).toBeVisible();
await expect(page.getByTestId("quote-net")).toHaveText("GBP 1,000.00");
await click(page,"Preview immutable quote");
await click(page,"Simulate sending this quote");
await click(page,"Continue fake worker");
await click(page,"Record practice acceptance");
await page.getByLabel("Practice activation scenario").selectOption("simulated_base_obligation");
await click(page,"Start this practice job");
await expect(page.getByRole("heading",{name:"Final account",exact:true})).toBeVisible();
await expect(page.locator(".variation-entry")).toBeVisible({timeout:30_000});return(await page.locator(".quote-editor").getAttribute("data-job-id"))!}
async function add(page:Page,description:string,amount:string,direction:"addition"|"omission"){const form=page.locator(".variation-entry");
await expect(form).toBeVisible();
await form.getByLabel("Description",{exact:true}).fill(description);
await form.getByLabel("Change type").selectOption(direction);
await form.getByLabel("Variation price (£, optional)").fill(amount);const button=form.getByRole("button",{name:"Add proposed variation",exact:true});for(let attempt=0;attempt<4;attempt++){await expect(button).toBeEnabled({timeout:45_000});
await button.click();try{await expect(form.getByLabel("Description",{exact:true})).toHaveValue("",{timeout:5_000});return}catch{if(attempt===3)throw new Error("variation proposal did not persist after poll-retry")}}}
import type { Route } from "@playwright/test";
async function recoveryAccess(page:Page){
 const journey=page.getByTestId("uiwire15-journey");
 await expect(page.getByRole("note",{name:"Practice sandbox notice",exact:true})).toHaveText("Practice sandbox — synthetic data; nothing is sent or charged");
 await expect(page.getByRole("note",{name:"Practice sandbox notice",exact:true})).toBeVisible();
 const retry=journey.getByRole("button",{name:"Try checking saved progress again",exact:true});
 await expect(retry).toBeVisible();
 // Enter keyboard modality before checking the visible focus ring.
 await retry.focus();
await page.keyboard.press("Tab");
await page.keyboard.press("Shift+Tab");
await expect(retry).toBeFocused();
 expect(await retry.evaluate(element=>getComputedStyle(element).outlineStyle)).not.toBe("none");
 const box=await retry.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
}
async function reopen(page:Page,jobId:string){
 await page.goto("/");
 const link=page.locator(`a[href="/jobs/${jobId}"]`).first();
await expect(link).toBeVisible();
await link.click();
 await expect(page.getByTestId("workspace-job-id")).toHaveAttribute("data-job-id",jobId);
}
test("initial pending and faulty reads never publish a zero projection; real GET recovery persists",async({page})=>{
 await openReview(page);
 const jobId=(await page.getByTestId("workspace-job-id").getAttribute("data-job-id"))!;
 const proposalResponse=await page.request.get(`/api/jobs/${jobId}/proposal`);expect(proposalResponse.ok()).toBe(true);
 const source=await proposalResponse.json();expect(source.jobId).toBe(jobId);
 const journey=page.getByTestId("uiwire15-journey"),endpoint=`**/api/jobs/${jobId}/customer-invoices`;
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve});
 let started!:()=>void;const requested=new Promise<void>(resolve=>{started=resolve});
 await page.route(endpoint,async route=>{started();
await held;
await route.abort("failed").catch(()=>{})});
 await page.reload();
await requested;
 await expect(journey.getByRole("status")).toContainText("Checking saved progress");
 await expect(journey.getByTestId("journey-customer-balance")).toHaveCount(0);
 await expect(journey.getByTestId("uiwire15-continue")).toHaveCount(0);
 release();
await expect(journey.getByRole("alert")).toContainText("could not be checked");
await recoveryAccess(page);
 await page.unroute(endpoint);
 // Explicitly faulty HTTP/JSON/schema and wrong-job responses, never success fixtures.
 const faults:Array<(route:Route)=>Promise<void>>=[
 route=>route.fulfill({status:500,json:{code:"UNAVAILABLE"}}),
 route=>route.fulfill({status:401,json:{code:"UNAUTHENTICATED"}}),
 route=>route.fulfill({status:403,json:{code:"FORBIDDEN"}}),
 route=>route.fulfill({status:404,json:{code:"NOT_FOUND"}}),
 route=>route.fulfill({status:400,json:{code:"NOT_FOUND"}}),
 route=>route.fulfill({status:200,contentType:"application/json",body:"{"}),
 route=>route.fulfill({status:200,json:null}),
 route=>route.fulfill({status:200,json:{version:1,invoices:[]}}),
 async route=>{const response=await route.fetch();const data=await response.json();
await route.fulfill({response,json:{...data,jobId:crypto.randomUUID()}})},
 ];
 for(const fault of faults){
  await page.route(endpoint,fault);
await journey.getByRole("button",{name:"Try checking saved progress again",exact:true}).click();
  await expect(journey.getByRole("alert")).toBeVisible();
await expect(journey.getByRole("heading",{name:"Saved progress could not be checked",exact:true})).toBeFocused();
await expect(journey.getByTestId("journey-customer-balance")).toHaveCount(0);
await page.unroute(endpoint,fault);
 }
 // The sample is still draft: real proof NOT_FOUND, variation ACTIVATION_REQUIRED,
 // and fee NOT_FOUND are lifecycle absences; invoices authoritatively returns [].
 const proof=await page.request.get(`/api/jobs/${jobId}/proof`);expect(proof.status()).toBe(404);expect(await proof.json()).toEqual({code:"NOT_FOUND"});
 const fee=await page.request.get(`/api/jobs/${jobId}/fee-illustration`);expect(fee.status()).toBe(404);expect(await fee.json()).toEqual({code:"NOT_FOUND"});
 // Near-miss optional endpoint responses must remain errors, even before activation.
 for(const [name,status,code] of [["fee-illustration",404,"DATABASE_UNAVAILABLE"],["fee-illustration",400,"NOT_FOUND"],["proof",404,"JOB_NOT_FOUND"],["variations",400,"DATABASE_UNAVAILABLE"]] as const){
  const faultPath=`**/api/jobs/${jobId}/${name}`;
  await page.route(faultPath,route=>route.fulfill({status,json:{code}}));
  await journey.getByRole("button",{name:"Try checking saved progress again",exact:true}).click();
  await expect(journey.getByRole("alert")).toBeVisible();
await page.unroute(faultPath);
 }
 const writes:string[]=[];page.on("request",request=>{if(request.url().includes("/api/")&&request.method()!=="GET")writes.push(request.method())});
 await journey.getByRole("button",{name:"Try checking saved progress again",exact:true}).press("Enter");
 await expect(journey.getByTestId("uiwire15-continue")).toHaveText("Review and confirm the captured work");
 await expect(journey.getByTestId("journey-customer-balance")).toHaveText("GBP 0.00");expect(writes).toEqual([]);
 // An older failed request must not replace the newer real response.
 let oldDone!:()=>void;const oldFinished=new Promise<void>(resolve=>{oldDone=resolve});
 let releaseOld!:()=>void;const oldHeld=new Promise<void>(resolve=>{releaseOld=resolve});
 let oldStarted!:()=>void;const oldRequested=new Promise<void>(resolve=>{oldStarted=resolve});
 const oldFault=async(route:Route)=>{oldStarted();
await oldHeld;
await route.fulfill({status:500,json:{code:"UNAVAILABLE"}}).catch(()=>{});oldDone()};
 await page.route(endpoint,oldFault);
await journey.getByRole("button",{name:"Check saved progress",exact:true}).click();
await oldRequested;
 await expect(journey.getByTestId("journey-customer-balance")).toHaveCount(0);
 await page.unroute(endpoint,oldFault);
await journey.getByRole("button",{name:"Check saved progress",exact:true}).click();
 await expect(journey.getByTestId("uiwire15-continue")).toBeVisible();releaseOld();
await oldFinished;
 await expect(journey.getByRole("alert")).toHaveCount(0);
await expect(journey.getByTestId("uiwire15-continue")).toBeVisible();
 await page.reload();
await expect(journey.getByTestId("uiwire15-continue")).toBeVisible();
 await reopen(page,jobId);
await expect(journey.getByTestId("uiwire15-continue")).toBeVisible();
 await expect(page.locator("details.source pre")).toHaveText(source.source.text);
 const reopenedResponse=await page.request.get(`/api/jobs/${jobId}/proposal`);expect(reopenedResponse.ok()).toBe(true);
 const reopened=await reopenedResponse.json();expect(reopened.captureId).toBe(source.captureId);expect(reopened.proposalId).toBe(source.proposalId);
 expect(reopened.proposal.lines.map((line:{scopeItemId:string})=>line.scopeItemId)).toEqual(source.proposal.lines.map((line:{scopeItemId:string})=>line.scopeItemId));
 expect(writes).toEqual([]);
});
test("refresh failure hides a previously completed real practice job and recovers with GETs",async({page})=>{const jobId=await enterLive(page);
await add(page,"Extra preparation","125.00","addition");
await add(page,"Omit cabinet painting","25.00","omission");
await add(page,"Pending trim repair","50.00","addition");
await B(page,"Approve exact revision").nth(0).click();
await expect(page.getByTestId("approved-additions")).toHaveText("£125.00");
await B(page,"Approve exact revision").nth(0).click();
await expect(page.getByTestId("approved-omissions")).toHaveText("−£25.00");
await page.request.post("/api/decisions",{data:{version:"finding-evaluation-command.v1",commandId:crypto.randomUUID(),tenantId:tenant,jobId}});
await click(page,"Build final account");
await expect(page.getByText("Finish the required proof before issuing this bill",{exact:true})).toBeVisible();
await expect(page.getByTestId("final-baseline")).toHaveText("£1,000.00");
await expect(page.getByTestId("final-variation-net")).toHaveText("£100.00");
await expect(page.getByTestId("final-net")).toHaveText("£1,100.00");
await expect(page.getByTestId("final-vat")).toHaveText("£220.00");
await expect(page.getByTestId("final-gross")).toHaveText("£1,320.00");
await expect(page.getByRole("region",{name:"Not included — approval needed"}).getByText("Pending trim repair · £50.00",{exact:true})).toBeVisible();const firstHash=await page.getByTestId("final-source-hash").textContent();
await click(page,"Rebuild from approved sources");
await expect(page.getByTestId("final-source-hash")).toHaveText(firstHash!);const proofPost=(body:Record<string,unknown>)=>page.request.post(`/api/jobs/${jobId}/proof`,{data:{version:"practice-proof-command.v1",commandId:crypto.randomUUID(),...body}});const proofGet=async()=>(await page.request.get(`/api/jobs/${jobId}/proof`)).json();const pv1=await proofGet();
await proofPost({action:"select_generated",scopeItemId:pv1.scopeItemId,fixture:"completion-photo"});const pv2=await proofGet();
await proofPost({action:"finalize",uploadId:pv2.upload.id,objectVersionId:pv2.upload.objectVersionId});
await expect.poll(async()=>(await proofGet()).upload?.state,{timeout:45_000,message:"proof upload verified"}).toBe("verified");
await expect.poll(async()=>{const pv=await proofGet();if(pv.completion?.id)return pv.completion.id;if(pv.upload?.evidenceId){const r=await proofPost({action:"complete",evidenceId:pv.upload.evidenceId,scopeItemId:pv.scopeItemId});if(!r.ok())return null;}return null;},{timeout:45_000,message:"proof completion committed"}).not.toBeNull();
await click(page,"Rebuild from approved sources");
await expect(page.getByText("Finish the required proof before issuing this bill",{exact:true})).toHaveCount(0);
await expect(page.getByTestId("final-source-hash")).not.toHaveText(firstHash!);
await expect(B(page,"Issue and simulate this invoice")).toBeVisible();
await prepareCurrentInvoiceFinalCheck(page,jobId);
await click(page,"Issue and simulate this invoice");
await expect(page.getByTestId("customer-invoice-number")).toHaveText(/^DEMO-CUST-\d{6}$/);
await expect(page.getByTestId("invoice-gross")).toHaveText("GBP 1,320.00");
await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 1,320.00");
await expect(page.getByTestId("invoice-delivery")).toHaveText("Simulated delivery — nothing sent");const invoiceNumber=await page.getByTestId("customer-invoice-number").textContent();const artifactHash=await page.getByTestId("invoice-artifact-hash").textContent();
await page.reload();
await enterQuote(page);
await expect(page.getByRole("heading",{name:"Final account",exact:true})).toBeVisible();
await expect(page.getByTestId("final-gross")).toHaveText("£1,320.00");
await expect(page.getByTestId("invoice-artifact-hash")).toHaveText(artifactHash!);
await expect(page.getByTestId("customer-invoice-number")).toHaveText(invoiceNumber!);
await expect(page.getByRole("note",{name:"Practice sandbox notice",exact:true})).toHaveText("Practice sandbox — synthetic data; nothing is sent or charged");
 await expect(page.getByRole("note",{name:"Practice sandbox notice",exact:true})).toBeVisible();
// The receipt UI records exact component-format GBP values: partial £500 then the £820 remainder.
await page.getByTestId("uiwire12-receipt-amount").fill("500.00");
await click(page,"Record practice receipt");
await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 820.00",{timeout:45_000});
await expect(page.getByTestId("customer-payment-status")).toHaveText("Part paid");
await page.reload();
await enterQuote(page);
await expect(page.getByRole("heading",{name:"Continue this job",exact:true})).toBeVisible();
await expect(page.getByTestId("uiwire15-continue")).toContainText("payment");
await page.getByTestId("uiwire12-receipt-amount").fill("820.00");
await click(page,"Record practice receipt");
await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00",{timeout:45_000});
const prepare=B(page,"Prepare recovery-18800 illustration");if(await prepare.isVisible())await prepare.click();
await expect(page.locator(".fee-statement").getByTestId("additional-fee")).toHaveText("£203.00",{timeout:45_000});
await click(page,"Check saved progress");
await expect(page.getByRole("heading",{name:"You finished this practice job",exact:true})).toBeVisible({timeout:45_000});
await expect(page.getByTestId("journey-customer-balance")).toHaveText("GBP 0.00");
await expect(page.getByTestId("journey-real-external-actions")).toHaveText("0");

// Fault injection only: no successful business response is mocked.
const journey=page.getByTestId("uiwire15-journey");
const endpoint=`**/api/jobs/${jobId}/customer-invoices`;
await page.route(endpoint,route=>route.abort("failed"));
await journey.getByRole("button",{name:"Check saved progress",exact:true}).click();
await expect(journey.getByRole("alert")).toContainText("could not be checked");
await expect(journey.getByText("You finished this practice job",{exact:true})).toHaveCount(0);
await expect(journey.getByTestId("journey-customer-balance")).toHaveCount(0);
await expect(journey.getByTestId("uiwire15-continue")).toHaveCount(0);
await recoveryAccess(page);
const writes:string[]=[];page.on("request",request=>{if(request.url().includes("/api/")&&request.method()!=="GET")writes.push(`${request.method()} ${request.url()}`)});
await page.unroute(endpoint);
await journey.getByRole("button",{name:"Try checking saved progress again",exact:true}).press("Enter");
await expect(journey.getByText("You finished this practice job",{exact:true})).toBeVisible();
await expect(journey.getByTestId("journey-customer-balance")).toHaveText("GBP 0.00");
expect(writes).toEqual([]);
for(const name of ["proof","variations","fee-illustration"]){
 const faultPath=`**/api/jobs/${jobId}/${name}`;
 // All are deliberate faulty responses: live proof cannot be absent; JSON null
 // is never a prepared fee or a valid variations collection.
 await page.route(faultPath,route=>name==="proof"?route.fulfill({status:404,json:{code:"NOT_FOUND"}}):route.fulfill({status:200,json:null}));
 await journey.getByRole("button",{name:"Check saved progress",exact:true}).click();
await expect(journey.getByRole("alert")).toBeVisible();
 await expect(journey.getByTestId("journey-customer-balance")).toHaveCount(0);
 await page.unroute(faultPath);
await journey.getByRole("button",{name:"Try checking saved progress again",exact:true}).click();
 await expect(journey.getByText("You finished this practice job",{exact:true})).toBeVisible();
}
await page.reload();
await enterQuote(page);
await expect(journey.getByText("You finished this practice job",{exact:true})).toBeVisible();
await expect(page.getByTestId("invoice-artifact-hash")).toHaveText(artifactHash!);
await reopen(page,jobId);
await expect(journey.getByText("You finished this practice job",{exact:true})).toBeVisible();
await enterQuote(page);
await expect(page.getByTestId("invoice-artifact-hash")).toHaveText(artifactHash!);
await expect(page.getByTestId("customer-invoice-number")).toHaveText(invoiceNumber!);
});

// Regression for the actual M4-1-S focus failure: late proof errors must leave
// the recovery workbench's keyboard target alone. Business reads remain real;
// only proof GETs are held and explicitly failed.
test("late background and abandoned requested checks preserve workbench focus",async({page})=>{
 let releaseProof!:()=>void;
 const proofGate=new Promise<void>(resolve=>{releaseProof=resolve});
 let gate=proofGate;
 await page.route("**/api/jobs/*/proof",async route=>{
  if(route.request().method()!=="GET")return route.continue();
  await gate;await route.fulfill({status:503,json:{code:"PROOF_UNAVAILABLE"}});
 });
 await openReview(page);
 for(const name of ["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await click(page,`Accept ${name}`);
 await click(page,"Dismiss Replace shelves");await page.getByLabel("Dismissal reason Replace shelves").fill("Not needed");
 await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");await click(page,"Confirm scope");
 await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
 const journey=page.getByTestId("uiwire15-journey"),workbench=B(page,"Open £320 withheld payment");
 await expect(workbench).toBeEnabled();await B(page,"Open materials-320 overcharge").focus();await page.keyboard.press("Tab");
 await expect(workbench).toBeFocused();
 releaseProof();
 await expect(page.locator("#work-proof").getByRole("alert")).toHaveText("This proof record could not load. Try again.");
 await expect(journey.getByRole("alert")).toContainText("could not be checked");await expect(workbench).toBeFocused();
 expect(await workbench.evaluate(element=>element.matches(":focus-visible")&&getComputedStyle(element).outlineStyle!=="none")).toBe(true);
 await recoveryAccess(page);
 const writes:string[]=[];page.on("request",request=>{if(request.url().includes("/api/")&&request.method()!=="GET")writes.push(request.method())});
 // A keyboard-requested retry that fails still focuses its own error.
 await journey.getByRole("button",{name:"Try checking saved progress again",exact:true}).press("Enter");
 await expect(journey.getByRole("heading",{name:"Saved progress could not be checked",exact:true})).toBeFocused();
 // If the user moves away while that requested read is pending, preserve the
 // newer focus choice too, rather than treating the old click as permanent ownership.
 let releaseRetry!:()=>void;gate=new Promise<void>(resolve=>{releaseRetry=resolve});
 await journey.getByRole("button",{name:"Try checking saved progress again",exact:true}).press("Enter");
 await expect(journey.getByRole("status")).toContainText("Checking saved progress");
 await B(page,"Open materials-320 overcharge").focus();await page.keyboard.press("Tab");await expect(workbench).toBeFocused();
 releaseRetry();await expect(journey.getByRole("alert")).toContainText("could not be checked");await expect(workbench).toBeFocused();
 expect(writes).toEqual([]);
});
