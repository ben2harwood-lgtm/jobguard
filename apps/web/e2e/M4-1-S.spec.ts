import{expect,test,type Locator,type Page}from"@playwright/test";import{openReview}from"./helpers/capture-journey";
test.setTimeout(180_000);
const V=async(page:Page,id:string,value:string)=>expect.poll(async()=>page.getByTestId(id).textContent(),{timeout:45_000}).toBe(value);
const button=(page:Page,name:string)=>page.getByRole("button",{name,exact:true});
// C7: primary actions, inputs and links in the workbench are at least 44x44 CSS px.
const expectTouchTarget=async(target:Locator)=>{const box=await target.boundingBox();expect(box).not.toBeNull();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44)};
// C7: a keyboard user reaches the action and sees a real focus indicator (not outline:none with no replacement).
const expectVisibleKeyboardFocus=async(page:Page,name:string)=>{const target=button(page,name);await expect(target).toBeFocused();expect(await target.evaluate(el=>{const s=getComputedStyle(el);return el.matches(":focus-visible")&&((s.outlineStyle!=="none"&&parseFloat(s.outlineWidth)>0)||s.boxShadow!=="none")})).toBe(true)};
test("opens and manages evidence-linked recovery cases without inventing recovered money",async({page,browser},testInfo)=>{
 await openReview(page);
 for(const n of["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await page.getByRole("button",{name:`Accept ${n}`,exact:true}).click();
 await page.getByRole("button",{name:"Dismiss Replace shelves",exact:true}).click();await page.getByLabel("Dismissal reason Replace shelves").fill("Not needed");await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
 await page.getByRole("button",{name:"Confirm scope",exact:true}).click();
 const jobId=(await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
 // C7 keyboard path: Tab/Shift+Tab between the first actions (keyboard modality, so :focus-visible applies) and require a visible focus ring on each.
 await button(page,"Open materials-320 overcharge").focus();
 await page.keyboard.press("Tab");await expectVisibleKeyboardFocus(page,"Open £320 withheld payment");
 await page.keyboard.press("Shift+Tab");await expectVisibleKeyboardFocus(page,"Open materials-320 overcharge");
 for(const name of["Open materials-320 overcharge","Open £320 withheld payment","Open £2,500 withheld payment","Record prevention"])await expectTouchTarget(button(page,name));
 // Merchant overcharge: supplier documents only, never customer debt.
 await button(page,"Open materials-320 overcharge").click();
 await V(page,"case-claimed-net","£320.00");await V(page,"case-landed-net","£0.00");await V(page,"case-state","Needs evidence");
 for(const source of["Supplier agreement AG-320","Delivery note DN-320","Supplier invoice INV-320"])await expect(page.getByRole("link",{name:source,exact:true})).toBeVisible();
 await expect(page.getByText("Generated customer invoice INV-18800",{exact:true})).toHaveCount(0);
 // A source link leads somewhere real: it moves focus to an in-page detail naming the kind of document and what is (not) attached (no hash change: the job workspace reloads on hashchange).
 await expectTouchTarget(page.getByRole("link",{name:"Delivery note DN-320",exact:true}));
 await page.getByRole("link",{name:"Delivery note DN-320",exact:true}).click();
 const detail=page.locator("#source-delivery-note-dn-320");await expect(detail).toBeFocused();await expect(detail).toBeInViewport();await expect(detail).toContainText("Delivery note");await expect(detail).toContainText("no stored document file is attached");
 // recovery-18800 has TWO withheld-customer-payment claims against its generated customer invoice: open the £320 one too.
 await button(page,"Open £320 withheld payment").click();
 await V(page,"case-claimed-net","£320.00");await V(page,"case-book","Builder–customer");await V(page,"case-source-type","Customer invoice");await V(page,"case-state","Needs evidence");
 await expect(page.getByRole("link",{name:"Generated customer invoice INV-18800",exact:true})).toBeVisible();
 for(const source of["Supplier agreement AG-320","Delivery note DN-320","Supplier invoice INV-320"])await expect(page.getByRole("link",{name:source,exact:true})).toHaveCount(0);
 await button(page,"Open £2,500 withheld payment").click();
 await V(page,"case-claimed-net","£2,500.00");await V(page,"case-book","Builder–customer");await V(page,"case-source-type","Customer invoice");
 for(const name of["Evidence assembled","Record a landed recovery","Write off remainder","Record dispute"])await expectTouchTarget(button(page,name));
 await expectTouchTarget(page.getByLabel("Received (£)",{exact:true}));
 // Repair 12 (Sol P2-3 control): the server refuses a dispute on a case that is only identified, so the control is off until evidence has been assembled.
 await V(page,"case-state","Needs evidence");await expect(button(page,"Record dispute")).toBeDisabled();
 await button(page,"Evidence assembled").click();
 await V(page,"case-state","Evidence assembled");await expect(button(page,"Record dispute")).toBeEnabled();
 // Negative paths: each rejected command is announced in an alert that takes focus, and nothing is recorded.
 // (a) a receipt larger than the claim is refused by the server; (b) float-style input such as 1e3 is refused before any command is sent.
 await page.getByLabel("Received (£)",{exact:true}).fill("2500.01");await button(page,"Record a landed recovery").click();
 await expect(page.locator("p[role=alert]")).toContainText("is not allowed");await expect(page.locator("p[role=alert]")).toBeFocused();await V(page,"case-landed-net","£0.00");
 await page.getByLabel("Received (£)",{exact:true}).fill("1e3");await button(page,"Record a landed recovery").click();
 await expect(page.locator("p[role=alert]")).toContainText("Enter a non-negative price in pounds");await expect(page.locator("p[role=alert]")).toBeFocused();await V(page,"case-landed-net","£0.00");
 await page.getByLabel("Received (£)",{exact:true}).fill("1000.00");await button(page,"Record a landed recovery").click();
 await V(page,"case-landed-net","£1,000.00");await V(page,"case-outstanding-net","£1,500.00");await V(page,"case-fee","£0.00");await V(page,"case-fee-note","No approved qualifying landing yet, so no fee exists");
 await button(page,"Write off remainder").click();await expect(page.getByText("£1,500.00 written off",{exact:true})).toBeVisible();await expect(page.getByText("£2,500 recovered",{exact:true})).toHaveCount(0);
 await V(page,"case-outstanding-net","£0.00");
 await button(page,"Record prevention").click();
 await V(page,"case-state","Prevented before payment");await V(page,"case-fee","£0.00");await expect(button(page,"Record a landed recovery")).toBeDisabled();
 // The authoritative read before reload: every case with its id, revision, amounts and source identities.
 const persisted=await(await page.request.get(`/api/jobs/${jobId}/recovery-cases`)).json();expect(persisted.cases).toHaveLength(4);
 await page.reload();await V(page,"case-state","Prevented before payment");
 // C1/C7: a SECOND browser context (own cookies, own storage) signs in and reads the same persisted cases and source identities.
 // It cannot "open the job from Jobs": the Jobs list (readSyntheticDemo) deliberately excludes capture-created jobs, so the job page is
 // reached by its URL (fresh sign-in, second context, identical persisted data). Ben accepted this substitute (card jobguard-open-from-jobs-substitute-2026-10-03,
 // "Accept the substitute"); see BUILDER_RECEIPT_repair6.md.
 const second=await browser.newContext(),secondPage=await second.newPage();
 await secondPage.goto("/");await secondPage.getByRole("button",{name:"Start the demo"}).click();const skip=secondPage.getByRole("button",{name:"Skip tour"});await skip.waitFor({state:"visible"});await skip.click();
 await secondPage.goto(`/jobs/${jobId}#recovery-cases`);await V(secondPage,"case-state","Prevented before payment");
 expect(await(await secondPage.request.get(`/api/jobs/${jobId}/recovery-cases`)).json()).toEqual(persisted);
 await secondPage.getByRole("button",{name:"merchant overcharge · £320.00",exact:true}).click();
 await V(secondPage,"case-claimed-net","£320.00");await V(secondPage,"case-state","Needs evidence");
 for(const source of["Supplier agreement AG-320","Delivery note DN-320","Supplier invoice INV-320"])await expect(secondPage.getByRole("link",{name:source,exact:true})).toBeVisible();
 await secondPage.getByRole("button",{name:"withheld customer payment · £2,500.00",exact:true}).click();
 await V(secondPage,"case-landed-net","£1,000.00");await V(secondPage,"case-outstanding-net","£0.00");await expect(secondPage.getByText("£1,500.00 written off",{exact:true})).toBeVisible();
 await expect(secondPage.getByRole("link",{name:"Generated customer invoice INV-18800",exact:true})).toBeVisible();
 await second.close();
 await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged",{exact:true})).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await page.screenshot({path:`test-results/M4-1-S-${testInfo.project.name}.png`,fullPage:true})
});

// M4-1-S-R repair 10 (Sol P2): the workbench is a complete vertical slice. A claim can be amended, received in full, closed as recovered and
// reversed to reopen, with pounds input, current revisions, announced and focused errors and persisted results; updating an OLDER case never
// moves the selection to a newer one.
test("amends a claim to what was received, closes it as recovered and reverses it to reopen, always on the case the user chose",async({page,browser},testInfo)=>{
 await openReview(page);
 for(const n of["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await page.getByRole("button",{name:`Accept ${n}`,exact:true}).click();
 await page.getByRole("button",{name:"Dismiss Replace shelves",exact:true}).click();await page.getByLabel("Dismissal reason Replace shelves").fill("Not needed");await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
 await page.getByRole("button",{name:"Confirm scope",exact:true}).click();
 const jobId=(await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
 const alert=page.locator("p[role=alert]"),received=page.getByLabel("Received (£)",{exact:true}),claim=page.getByLabel("New claimed amount (£)",{exact:true}),reversed=page.getByLabel("Reversed (£)",{exact:true});
 const refuse=async(text:string)=>{await expect(alert).toContainText(text);await expect(alert).toBeFocused()};
 // The OLDER case (£2,500) is opened and part-received first; the NEWER case (£320) is opened afterwards and is selected on opening.
 await button(page,"Open £2,500 withheld payment").click();await V(page,"case-claimed-net","£2,500.00");
 await button(page,"Evidence assembled").click();await V(page,"case-state","Evidence assembled");
 await received.fill("1000.00");await button(page,"Record a landed recovery").click();await V(page,"case-landed-net","£1,000.00");await V(page,"case-state","Partly received");
 await button(page,"Open £320 withheld payment").click();await V(page,"case-claimed-net","£320.00");await V(page,"case-state","Needs evidence");
 // A second page in the same session, loaded now, will hold a STALE revision of the older case.
 const stalePage=await page.context().newPage();await stalePage.goto(`/jobs/${jobId}#recovery-cases`);
 await stalePage.getByRole("button",{name:"withheld customer payment · £2,500.00",exact:true}).click();await V(stalePage,"case-landed-net","£1,000.00");
 // Updating the older case keeps THAT case selected: its own amounts stay visible and the newer £320 case is not shown or touched.
 await page.getByRole("button",{name:"withheld customer payment · £2,500.00",exact:true}).click();await V(page,"case-claimed-net","£2,500.00");
 await received.fill("500.00");await button(page,"Record a landed recovery").click();
 await V(page,"case-landed-net","£1,500.00");await V(page,"case-claimed-net","£2,500.00");await V(page,"case-outstanding-net","£1,000.00");await V(page,"case-state","Partly received");
 await expect(button(page,"Close as recovered")).toBeDisabled();
 for(const target of[button(page,"Amend claim"),button(page,"Close as recovered"),button(page,"Reverse a landed recovery"),claim,reversed])await expectTouchTarget(target);
 // Amendment errors: each is announced in an alert that takes focus, and nothing is recorded.
 await claim.fill("");await button(page,"Amend claim").click();await refuse("Enter the new claimed amount in pounds");
 await claim.fill("1e3");await button(page,"Amend claim").click();await refuse("Enter a non-negative price in pounds");
 await claim.fill("1499.99");await button(page,"Amend claim").click();await refuse("cannot be lower than the money already received");
 await V(page,"case-claimed-net","£2,500.00");await V(page,"case-state","Partly received");
 // Amending down to exactly what was received records it as received in full, on the same (older) case, and it can then close as recovered.
 const revisionBefore=Number(await page.getByTestId("case-revision").textContent());
 await claim.fill("1500.00");await button(page,"Amend claim").click();
 await V(page,"case-claimed-net","£1,500.00");await V(page,"case-landed-net","£1,500.00");await V(page,"case-outstanding-net","£0.00");await V(page,"case-state","Received in full");
 expect(Number(await page.getByTestId("case-revision").textContent())).toBeGreaterThan(revisionBefore);
 await expect(button(page,"Close as recovered")).toBeEnabled();await expect(button(page,"Record a landed recovery")).toBeDisabled();
 await button(page,"Close as recovered").click();await V(page,"case-state","Closed — recovered");await V(page,"case-outstanding-net","£0.00");
 // A closed case cannot be quietly enlarged: the user is told to record a dispute first.
 await claim.fill("1600.00");await button(page,"Amend claim").click();await refuse("Record a dispute");await V(page,"case-claimed-net","£1,500.00");
 // Reversal: more than was received is refused; a valid reversal reopens the closed case with the reversed money outstanding again.
 await reversed.fill("1500.01");await button(page,"Reverse a landed recovery").click();await refuse("is not allowed");await V(page,"case-landed-net","£1,500.00");await V(page,"case-state","Closed — recovered");
 await reversed.fill("500.00");await button(page,"Reverse a landed recovery").click();
 await V(page,"case-state","Partly received");await V(page,"case-landed-net","£1,000.00");await V(page,"case-outstanding-net","£500.00");await V(page,"case-claimed-net","£1,500.00");
 await expect(button(page,"Record a landed recovery")).toBeEnabled();await expect(button(page,"Close as recovered")).toBeDisabled();
 // The stale page still holds the old revision: its action is refused with a plain message, focus on the alert, and nothing changes.
 await stalePage.getByLabel("Received (£)",{exact:true}).fill("1.00");await stalePage.getByRole("button",{name:"Record a landed recovery",exact:true}).click();
 await expect(stalePage.locator("p[role=alert]")).toContainText("changed since it was loaded");await expect(stalePage.locator("p[role=alert]")).toBeFocused();
 await V(stalePage,"case-landed-net","£1,000.00");await stalePage.close();
 // Persisted results: the authoritative read, the reloaded page and a SECOND browser context agree, and the untouched newer case is unchanged.
 const persisted=await(await page.request.get(`/api/jobs/${jobId}/recovery-cases`)).json();
 expect(persisted.cases).toHaveLength(2);
 expect(persisted.cases[0]).toMatchObject({claimedNetPence:150000,landedNetPence:100000,outstandingNetPence:50000,writtenOffPence:0,state:"partially_landed"});
 expect(persisted.cases[1]).toMatchObject({claimedNetPence:32000,landedNetPence:0,state:"identified"});
 await page.reload();await V(page,"case-claimed-net","£320.00");
 await page.getByRole("button",{name:"withheld customer payment · £1,500.00",exact:true}).click();
 await V(page,"case-landed-net","£1,000.00");await V(page,"case-outstanding-net","£500.00");await V(page,"case-state","Partly received");
 const second=await browser.newContext(),secondPage=await second.newPage();
 await secondPage.goto("/");await secondPage.getByRole("button",{name:"Start the demo"}).click();const skip=secondPage.getByRole("button",{name:"Skip tour"});await skip.waitFor({state:"visible"});await skip.click();
 await secondPage.goto(`/jobs/${jobId}#recovery-cases`);
 expect(await(await secondPage.request.get(`/api/jobs/${jobId}/recovery-cases`)).json()).toEqual(persisted);
 await secondPage.getByRole("button",{name:"withheld customer payment · £1,500.00",exact:true}).click();
 await V(secondPage,"case-claimed-net","£1,500.00");await V(secondPage,"case-landed-net","£1,000.00");await V(secondPage,"case-state","Partly received");
 await second.close();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await page.screenshot({path:`test-results/M4-1-S-amend-${testInfo.project.name}.png`,fullPage:true})
});

// M4-1-S-R repair 11. Each journey below starts from a freshly captured, scope-confirmed job, exactly like the journeys above.
const confirmedJob=async(page:Page)=>{
 await openReview(page);
 for(const n of["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await page.getByRole("button",{name:`Accept ${n}`,exact:true}).click();
 await page.getByRole("button",{name:"Dismiss Replace shelves",exact:true}).click();await page.getByLabel("Dismissal reason Replace shelves").fill("Not needed");await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
 await page.getByRole("button",{name:"Confirm scope",exact:true}).click();
 return(await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!
};
const signedInSecondPage=async(browser:import("@playwright/test").Browser,jobId:string)=>{
 const context=await browser.newContext(),secondPage=await context.newPage();
 await secondPage.goto("/");await secondPage.getByRole("button",{name:"Start the demo"}).click();const skip=secondPage.getByRole("button",{name:"Skip tour"});await skip.waitFor({state:"visible"});await skip.click();
 await secondPage.goto(`/jobs/${jobId}#recovery-cases`);
 return{context,secondPage}
};

// Sol P2-2 and P2-3: a case never strands after write-off, reversal and re-landing, and a fully received case can close again after a dispute.
test("a written-off case that is reversed and re-landed ends closed, and a fully received case closes again after a dispute",async({page},testInfo)=>{
 const jobId=await confirmedJob(page);
 const alert=page.locator("p[role=alert]"),received=page.getByLabel("Received (£)",{exact:true}),claim=page.getByLabel("New claimed amount (£)",{exact:true}),reversed=page.getByLabel("Reversed (£)",{exact:true});
 // P2-2: claim 2,500.00 -> receive 1,000.00 -> write off 1,500.00 -> reverse 1,000.00 -> receive 1,000.00 again.
 await button(page,"Open £2,500 withheld payment").click();await V(page,"case-claimed-net","£2,500.00");
 await button(page,"Evidence assembled").click();await V(page,"case-state","Evidence assembled");
 await received.fill("1000.00");await button(page,"Record a landed recovery").click();await V(page,"case-landed-net","£1,000.00");await V(page,"case-state","Partly received");
 await button(page,"Write off remainder").click();await V(page,"case-state","Closed — no further recovery");await V(page,"case-outstanding-net","£0.00");await expect(page.getByText("£1,500.00 written off",{exact:true})).toBeVisible();
 await reversed.fill("1000.00");await button(page,"Reverse a landed recovery").click();
 await V(page,"case-state","Evidence assembled");await V(page,"case-landed-net","£0.00");await V(page,"case-outstanding-net","£1,000.00");
 await received.fill("1000.00");await button(page,"Record a landed recovery").click();
 await V(page,"case-state","Closed — no further recovery");await V(page,"case-landed-net","£1,000.00");await V(page,"case-outstanding-net","£0.00");await expect(page.getByText("£1,500.00 written off",{exact:true})).toBeVisible();
 // Nothing is outstanding, so no further receipt, write-off or recovered closure is offered; the explicit reopen paths remain.
 for(const name of["Record a landed recovery","Write off remainder","Close as recovered"])await expect(button(page,name)).toBeDisabled();
 await expect(button(page,"Record dispute")).toBeEnabled();await expect(button(page,"Reverse a landed recovery")).toBeEnabled();
 const midway=await(await page.request.get(`/api/jobs/${jobId}/recovery-cases`)).json();
 expect(midway.cases[0]).toMatchObject({claimedNetPence:250000,landedNetPence:100000,writtenOffPence:150000,outstandingNetPence:0,state:"closed_no_recovery"});
 // The partial reversal and re-landing still balance: reverse 400.00 (400.00 outstanding), receive it again, closed again.
 await reversed.fill("400.00");await button(page,"Reverse a landed recovery").click();await V(page,"case-state","Partly received");await V(page,"case-outstanding-net","£400.00");
 await received.fill("400.00");await button(page,"Record a landed recovery").click();await V(page,"case-state","Closed — no further recovery");await V(page,"case-outstanding-net","£0.00");
 // P2-3: a fully received case, closed as recovered, disputed, then closed as recovered again with no new money event.
 await button(page,"Open £320 withheld payment").click();await V(page,"case-claimed-net","£320.00");
 await button(page,"Evidence assembled").click();await V(page,"case-state","Evidence assembled");
 await received.fill("320.00");await button(page,"Record a landed recovery").click();await V(page,"case-state","Received in full");
 await button(page,"Close as recovered").click();await V(page,"case-state","Closed — recovered");
 await button(page,"Record dispute").click();await V(page,"case-state","In dispute / negotiation");await V(page,"case-landed-net","£320.00");await V(page,"case-outstanding-net","£0.00");
 await expect(button(page,"Close as recovered")).toBeEnabled();
 const revisionBefore=Number(await page.getByTestId("case-revision").textContent());
 await button(page,"Close as recovered").click();await V(page,"case-state","Closed — recovered");await V(page,"case-landed-net","£320.00");await V(page,"case-outstanding-net","£0.00");
 expect(Number(await page.getByTestId("case-revision").textContent())).toBe(revisionBefore+1);
 // The guard against closing with principal outstanding holds: dispute again, raise the claim, and the case cannot close until the rest is received.
 await button(page,"Record dispute").click();await V(page,"case-state","In dispute / negotiation");
 await claim.fill("400.00");await button(page,"Amend claim").click();await V(page,"case-claimed-net","£400.00");await V(page,"case-outstanding-net","£80.00");
 await expect(button(page,"Close as recovered")).toBeDisabled();
 await received.fill("80.00");await button(page,"Record a landed recovery").click();await V(page,"case-state","Received in full");
 await button(page,"Close as recovered").click();await V(page,"case-state","Closed — recovered");await V(page,"case-claimed-net","£400.00");await V(page,"case-landed-net","£400.00");
 await expect(alert).toHaveCount(0);
 const persisted=await(await page.request.get(`/api/jobs/${jobId}/recovery-cases`)).json();
 expect(persisted.cases[0]).toMatchObject({claimedNetPence:250000,landedNetPence:100000,writtenOffPence:150000,outstandingNetPence:0,state:"closed_no_recovery"});
 expect(persisted.cases[1]).toMatchObject({claimedNetPence:40000,landedNetPence:40000,outstandingNetPence:0,state:"closed_recovered"});
 await page.reload();await V(page,"case-state","Closed — recovered");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await page.screenshot({path:`test-results/M4-1-S-lifecycle-${testInfo.project.name}.png`,fullPage:true})
});

// Sol P2-5: two browsers open cases at the same moment; each one selects exactly the case its own command opened.
test("two browsers opening cases at the same time each select the case they opened",async({page,browser})=>{
 const jobId=await confirmedJob(page);
 const{context,secondPage}=await signedInSecondPage(browser,jobId);
 // Both workbenches have finished their first read (an empty register), so neither has seen the other's cases.
 await expect(page.getByText("No recovery cases yet.",{exact:true})).toBeVisible();await expect(secondPage.getByText("No recovery cases yet.",{exact:true})).toBeVisible();
 const open=(target:Page,name:string)=>button(target,name).click();
 // Three rounds with different cases, each round fired together from both browsers.
 const rounds:Array<[string,string,string,string]>=[["Open £320 withheld payment","£320.00","Open £2,500 withheld payment","£2,500.00"],["Open £2,500 withheld payment","£2,500.00","Open £320 withheld payment","£320.00"],["Open £320 withheld payment","£320.00","Open £2,500 withheld payment","£2,500.00"]];
 for(const[firstName,firstAmount,secondName,secondAmount]of rounds){
  await Promise.all([open(page,firstName),open(secondPage,secondName)]);
  await V(page,"case-claimed-net",firstAmount);await V(secondPage,"case-claimed-net",secondAmount);
 }
 // The authoritative list holds all six cases, and a case opened later is never mistaken for the one that was just opened.
 expect((await(await page.request.get(`/api/jobs/${jobId}/recovery-cases`)).json()).cases).toHaveLength(6);
 await context.close()
});

// Sol P3-8: a case list that is still loading, or that could not be read, is never presented as an empty register.
test("an unread case list is shown as loading or failed, never as empty, and the failure can be retried",async({page})=>{
 const jobId=await confirmedJob(page);
 const readUrl=`**/api/jobs/${jobId}/recovery-cases`,alert=page.locator("p[role=alert]"),empty=page.getByText("No recovery cases yet.",{exact:true});
 const isRead=(route:import("@playwright/test").Route)=>route.request().method()==="GET";
 // Loading: the first read is held open, and nothing claims the register is empty meanwhile.
 let release:()=>void=()=>undefined;const gate=new Promise<void>(resolve=>{release=resolve});
 await page.route(readUrl,async route=>{if(!isRead(route))return route.continue();await gate;await route.continue()});
 await page.reload();
 await expect(page.getByRole("status").filter({hasText:"Loading recovery cases"})).toBeVisible();await expect(empty).toHaveCount(0);await expect(alert).toHaveCount(0);
 // Repair 12 (Sol P2-1): nothing can be opened until the first read has settled, so no command can race it.
 const openNames=["Open materials-320 overcharge","Open £320 withheld payment","Open £2,500 withheld payment","Record prevention"];
 for(const name of openNames)await expect(button(page,name)).toBeDisabled();
 release();await expect(empty).toBeVisible();await expect(page.getByRole("status").filter({hasText:"Loading recovery cases"})).toHaveCount(0);
 for(const name of openNames)await expect(button(page,name)).toBeEnabled();
 await page.unroute(readUrl);
 // Transport failure: the read is aborted. The failure is announced and focused, the empty claim is not made, and Try again works once the read can succeed.
 await page.route(readUrl,route=>isRead(route)?route.abort("failed"):route.continue());
 await page.reload();
 await expect(alert).toContainText("could not be loaded");await expect(alert).toBeFocused();await expect(empty).toHaveCount(0);
 await expect(button(page,"Try again")).toBeVisible();await expectTouchTarget(button(page,"Try again"));
 await button(page,"Try again").click();await expect(alert).toContainText("could not be loaded");await expect(alert).toBeFocused();await expect(empty).toHaveCount(0);
 await page.unroute(readUrl);
 await button(page,"Try again").click();
 await expect(empty).toBeVisible();await expect(alert).toHaveCount(0);await expect(button(page,"Try again")).toHaveCount(0);
 // With a case on file, a later failed read still does not show an empty register or last session's numbers as current.
 await button(page,"Open £320 withheld payment").click();await V(page,"case-claimed-net","£320.00");
 await page.route(readUrl,route=>isRead(route)?route.abort("failed"):route.continue());
 await page.reload();
 await expect(alert).toContainText("could not be loaded");await expect(alert).toBeFocused();await expect(empty).toHaveCount(0);await expect(page.getByTestId("case-claimed-net")).toHaveCount(0);
 await page.unroute(readUrl);
 await button(page,"Try again").click();await V(page,"case-claimed-net","£320.00");await expect(alert).toHaveCount(0)
});
