import{expect,test,type Locator,type Page}from"@playwright/test";import{openReview}from"./helpers/capture-journey";
test.setTimeout(180_000);
const V=async(page:Page,id:string,value:string)=>expect.poll(async()=>page.getByTestId(id).textContent(),{timeout:45_000}).toBe(value);
const button=(page:Page,name:string)=>page.getByRole("button",{name,exact:true});
// C7: primary actions, inputs and links in the workbench are at least 44x44 CSS px.
const expectTouchTarget=async(target:Locator)=>{const box=await target.boundingBox();expect(box).not.toBeNull();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44)};
// C7: a keyboard user reaches the action and sees a real focus indicator (not outline:none with no replacement).
const expectVisibleKeyboardFocus=async(page:Page,name:string)=>{const target=button(page,name);await expect(target).toBeFocused();expect(await target.evaluate(el=>{const s=getComputedStyle(el);return el.matches(":focus-visible")&&((s.outlineStyle!=="none"&&parseFloat(s.outlineWidth)>0)||s.boxShadow!=="none")})).toBe(true)};
// CH-2 (rebase onto main): the proof stage on the same page now announces its own role=alert ("This proof record could not load") while a job is not live,
// so every workbench alert below is read inside the recovery workbench (#recovery-cases), where the text, focus and count assertions are unchanged.
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
 await expect(page.locator("#recovery-cases p[role=alert]")).toContainText("is not allowed");await expect(page.locator("#recovery-cases p[role=alert]")).toBeFocused();await V(page,"case-landed-net","£0.00");
 await page.getByLabel("Received (£)",{exact:true}).fill("1e3");await button(page,"Record a landed recovery").click();
 await expect(page.locator("#recovery-cases p[role=alert]")).toContainText("Enter a non-negative price in pounds");await expect(page.locator("#recovery-cases p[role=alert]")).toBeFocused();await V(page,"case-landed-net","£0.00");
 await page.getByLabel("Received (£)",{exact:true}).fill("1000.00");await button(page,"Record a landed recovery").click();
 await V(page,"case-landed-net","£1,000.00");await V(page,"case-outstanding-net","£1,500.00");await V(page,"case-fee","£0.00");await V(page,"case-fee-note","No approved qualifying landing yet, so no fee exists");
 await button(page,"Write off remainder").click();await expect(page.getByText("£1,500.00 written off",{exact:true})).toBeVisible();await expect(page.getByText("£2,500 recovered",{exact:true})).toHaveCount(0);
 await V(page,"case-outstanding-net","£0.00");
 await button(page,"Record prevention").click();
 await V(page,"case-state","Prevented before payment");await V(page,"case-fee","£0.00");await expect(button(page,"Record a landed recovery")).toBeDisabled();
 // The authoritative read before reload: every case with its id, revision, amounts and source identities.
 const persisted=await(await page.request.get(`/api/jobs/${jobId}/recovery-cases`)).json();expect(persisted.cases).toHaveLength(4);
 await page.reload();await V(page,"case-state","Prevented before payment");
 // C1/C7: a SECOND browser context reuses the authorized practice session and reads the same persisted cases and source identities.
 // It cannot "open the job from Jobs": the Jobs list (readSyntheticDemo) deliberately excludes capture-created jobs, so the job page is
 // reached by its URL (authorized second context, identical persisted data). Ben accepted this substitute (card jobguard-open-from-jobs-substitute-2026-10-03,
 // "Accept the substitute"); see BUILDER_RECEIPT_repair6.md.
 const second=await browser.newContext({storageState:await page.context().storageState()}),secondPage=await second.newPage();
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
 const alert=page.locator("#recovery-cases p[role=alert]"),received=page.getByLabel("Received (£)",{exact:true}),claim=page.getByLabel("New claimed amount (£)",{exact:true}),reversed=page.getByLabel("Reversed (£)",{exact:true});
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
 await expect(stalePage.locator("#recovery-cases p[role=alert]")).toContainText("changed since it was loaded");await expect(stalePage.locator("#recovery-cases p[role=alert]")).toBeFocused();
 await V(stalePage,"case-landed-net","£1,000.00");await stalePage.close();
 // Persisted results: the authoritative read, the reloaded page and a SECOND browser context agree, and the untouched newer case is unchanged.
 const persisted=await(await page.request.get(`/api/jobs/${jobId}/recovery-cases`)).json();
 expect(persisted.cases).toHaveLength(2);
 expect(persisted.cases[0]).toMatchObject({claimedNetPence:150000,landedNetPence:100000,outstandingNetPence:50000,writtenOffPence:0,state:"partially_landed"});
 expect(persisted.cases[1]).toMatchObject({claimedNetPence:32000,landedNetPence:0,state:"identified"});
 await page.reload();await V(page,"case-claimed-net","£320.00");
 await page.getByRole("button",{name:"withheld customer payment · £1,500.00",exact:true}).click();
 await V(page,"case-landed-net","£1,000.00");await V(page,"case-outstanding-net","£500.00");await V(page,"case-state","Partly received");
 const second=await browser.newContext({storageState:await page.context().storageState()}),secondPage=await second.newPage();
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
const signedInSecondPage=async(browser:import("@playwright/test").Browser,jobId:string,page:Page)=>{
 const context=await browser.newContext({storageState:await page.context().storageState()}),secondPage=await context.newPage();
 await secondPage.goto(`/jobs/${jobId}#recovery-cases`);
 return{context,secondPage}
};

// Sol P2-2 and P2-3: a case never strands after write-off, reversal and re-landing, and a fully received case can close again after a dispute.
test("a written-off case that is reversed and re-landed ends closed, and a fully received case closes again after a dispute",async({page},testInfo)=>{
 const jobId=await confirmedJob(page);
 const alert=page.locator("#recovery-cases p[role=alert]"),received=page.getByLabel("Received (£)",{exact:true}),claim=page.getByLabel("New claimed amount (£)",{exact:true}),reversed=page.getByLabel("Reversed (£)",{exact:true});
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
 const{context,secondPage}=await signedInSecondPage(browser,jobId,page);
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
 const readUrl=`**/api/jobs/${jobId}/recovery-cases`,alert=page.locator("#recovery-cases p[role=alert]"),empty=page.getByText("No recovery cases yet.",{exact:true});
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

// Repair 13 (Sol P2-2): a save whose answer never reaches the browser may or may not have happened, so it can never be answered with a second, different opening.
// The server really commits the first request; only the answer is lost. The retry must be the same command id, and the register must end with exactly one case.
test("a lost save answer cannot be turned into a duplicate case: the only retry re-sends the same command id",async({page})=>{
 const jobId=await confirmedJob(page);
 const url=`**/api/jobs/${jobId}/recovery-cases`,alert=page.locator("#recovery-cases p[role=alert]");
 const openNames=["Open materials-320 overcharge","Open £320 withheld payment","Open £2,500 withheld payment","Record prevention"];
 const commandIds:string[]=[];let lose=true;
 await page.route(url,async route=>{
  if(route.request().method()!=="POST")return route.continue();
  commandIds.push((route.request().postDataJSON() as{commandId:string}).commandId);
  if(lose){lose=false;await route.fetch();return route.abort("connectionreset")}
  return route.continue()
 });
 const persistedCases=async()=>((await(await page.request.get(`/api/jobs/${jobId}/recovery-cases`)).json()) as{cases:unknown[]}).cases;
 await expect(page.getByRole("status").filter({hasText:"Loading recovery cases"})).toHaveCount(0);
 await button(page,"Open £320 withheld payment").click();
 // The uncertainty is announced and focused; the register is not shown as if it were current; no new opening is possible.
 await expect(alert).toContainText("may or may not have been saved");await expect(alert).toBeFocused();
 await expect(page.getByTestId("case-claimed-net")).toHaveCount(0);
 for(const name of openNames)await expect(button(page,name)).toBeDisabled();
 await expectTouchTarget(button(page,"Try again"));
 // The server did commit the first request even though the browser never heard the answer.
 expect(await persistedCases()).toHaveLength(1);
 // The retry is the same request: it answers with the case the first request created, and nothing is created twice.
 await button(page,"Try again").click();
 await V(page,"case-claimed-net","£320.00");await V(page,"case-state","Needs evidence");await expect(alert).toHaveCount(0);
 expect(commandIds).toHaveLength(2);expect(commandIds[1]).toBe(commandIds[0]);
 expect(await persistedCases()).toHaveLength(1);
 for(const name of openNames)await expect(button(page,name)).toBeEnabled();
 // A later opening is a new attempt with a new command id, and adds a second case.
 await button(page,"Open £2,500 withheld payment").click();await V(page,"case-claimed-net","£2,500.00");
 expect(commandIds).toHaveLength(3);expect(commandIds[2]).not.toBe(commandIds[0]);
 expect(await persistedCases()).toHaveLength(2)
});

// Repair 15: real PostgreSQL fixture and real command routes; no fulfilled success APIs.
// The approval is synthetic reference-v1 test data, never a production Decision or provider fact.
test("approved £2,500 plus overlapping manual £1,000 remains received in full after recording and reversing the manual record", async ({page,browser}) => {
 const {Pool} = await import("pg");
 const {randomUUID} = await import("node:crypto");
 const jobId = await confirmedJob(page);
 await button(page,"Open £2,500 withheld payment").click(); await V(page,"case-claimed-net","£2,500.00");
 await button(page,"Evidence assembled").click(); await V(page,"case-state","Evidence assembled");
 const before = await (await page.request.get(`/api/jobs/${jobId}/recovery-cases`)).json();
 const c = before.cases[0] as {id:string;revision:number};
 const admin = new Pool({host:"127.0.0.1",port:55432,user:"postgres",password:"sbox-e2e-owner",database:"jobguard_synthetic_demo",max:1});
 try {
  const tenantId = (await admin.query("SELECT tenant_id FROM app.job WHERE id=$1",[jobId])).rows[0].tenant_id;
  const activation=randomUUID(),baseline=randomUUID(),upload=randomUUID(),evidence=randomUUID(),receipt=randomUUID(),eligibility=randomUUID(),landing=randomUUID();
  const db=await admin.connect();
  try {
   await db.query("BEGIN");
   await db.query("SET LOCAL session_replication_role=replica");
   await db.query("INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)VALUES($1,$2,$3,$4,1,repeat('a',64),'synthetic_demo','synthetic_demo_illustrative.v1','reference_fee_policy_v1',$5,now())",[activation,tenantId,jobId,baseline,randomUUID()]);
   await db.query("INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative)VALUES($1,$2,$3,$4,$5,1880000,'GBP',28200,'reference_fee_policy_v1',true)",[randomUUID(),tenantId,jobId,activation,baseline]);
   await db.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)VALUES($1,$2,$3,$4,repeat('b',64),'application/pdf',1,'standard_evidence','verified','synthetic-v1',now(),now()+interval '1 hour')",[upload,tenantId,jobId,`synthetic/${upload}`]);
   // CH-2: an evidence record is a watchdog input, accepted only for a LIVE job under that job's tenant. Move the job live with the real lifecycle
   // routine (never a direct status write), on the same fictional baseline as the activation and cap rows above.
   await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
   const lifecycle=(await db.query("SELECT status,revision FROM app.job WHERE tenant_id=$1 AND id=$2",[tenantId,jobId])).rows[0] as {status:string;revision:number};
   expect(lifecycle.status).toBe("quoting");
   const move=(expected:number,to:string,reason:string,live=false)=>db.query("SELECT app.transition_job($1,$2,$3,$4,$5,$6,$7,$8,$9)",[tenantId,jobId,expected,to,reason,baseline,live?1880000:null,live?"reference_fee_policy_v1":null,live?28200:null]);
   await move(lifecycle.revision,"accepted","accept_quote");await move(lifecycle.revision+1,"live","switch_live",true);
   // Restore normal constraints before recording verified evidence, settled synthetic cash and exact approvals.
   await db.query("SET LOCAL session_replication_role=origin");
   await db.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)VALUES($1,$2,$3,$4,'original','synthetic_bank_receipt',$5,'synthetic-v1',repeat('b',64),1,'application/pdf','standard_evidence',now(),now())",[evidence,tenantId,upload,jobId,`synthetic/${upload}`]);
   await db.query("INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at)VALUES($1::uuid,$2,$3,$1::text,$1::text,'settled',250000,'GBP',true,now())",[receipt,tenantId,jobId]);
   for(const [id,kind] of [[eligibility,"eligibility"],[landing,"landing"]]) await db.query("INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)VALUES($1,$2,$3,$4,$5,$6,'approved','reference_fee_policy_v1',now()+interval '1 hour',$7)",[id,tenantId,jobId,c.id,kind,c.revision,randomUUID()]);
   await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
   await db.query("SELECT app.approve_synthetic_landing($1::jsonb)",[{version:"recovery.landing.approve.v1",policyVersion:"reference_fee_policy_v1",jobId,caseId:c.id,expectedCaseRevision:c.revision,receiptId:receipt,evidenceId:evidence,eligibilityApprovalId:eligibility,landingApprovalId:landing,allocationId:randomUUID(),derivationId:randomUUID(),journalId:randomUUID(),grossPence:250000,eligibleNetPence:250000,currency:"GBP",netTaxBasis:"known_net",causationConfirmed:true}]);
   await db.query("COMMIT");
  } catch(error) {await db.query("ROLLBACK");throw error} finally {db.release()}
 } finally {await admin.end()}
 await page.reload(); await V(page,"case-landed-net","£2,500.00"); await V(page,"case-state","Evidence assembled");
 await page.getByLabel("Received (£)",{exact:true}).fill("1000.00"); await button(page,"Record a landed recovery").click();
 await V(page,"case-state","Received in full"); await V(page,"case-landed-net","£2,500.00"); await V(page,"case-outstanding-net","£0.00");
 await button(page,"Close as recovered").click(); await V(page,"case-state","Closed — recovered");
 await page.getByLabel("Reversed (£)",{exact:true}).fill("1000.00"); await button(page,"Reverse a landed recovery").click();
 await V(page,"case-state","Received in full"); await V(page,"case-landed-net","£2,500.00"); await V(page,"case-outstanding-net","£0.00");
 await expect(button(page,"Close as recovered")).toBeEnabled();
 const persisted = await (await page.request.get(`/api/jobs/${jobId}/recovery-cases`)).json();
 expect(persisted.cases[0]).toMatchObject({id:c.id,state:"landed",approvedLandedNetPence:250000,landedNetPence:250000,outstandingNetPence:0});
 await page.reload(); await V(page,"case-state","Received in full");
 const second = await signedInSecondPage(browser,jobId,page);
 try {await V(second.secondPage,"case-state","Received in full");expect(await (await second.secondPage.request.get(`/api/jobs/${jobId}/recovery-cases`)).json()).toEqual(persisted)} finally {await second.context.close()}
 await button(page,"Close as recovered").click(); await V(page,"case-state","Closed — recovered");
 await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged",{exact:true})).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

// Repair 17: transport failure leaves the first request queued, while every result
// and refusal below comes from the real application/PostgreSQL. No success API is fulfilled.
test("repair 17: a below-settled retry keeps a delayed £900 amendment held across an approved reversal and late execution", async ({page,browser}) => {
 const {Pool} = await import("pg"), {randomUUID} = await import("node:crypto");
 const jobId = await confirmedJob(page), path = `/api/jobs/${jobId}/recovery-cases`;
 await button(page,"Open £2,500 withheld payment").click(); await V(page,"case-claimed-net","£2,500.00");
 await button(page,"Evidence assembled").click(); await V(page,"case-state","Evidence assembled");
 const c = (await (await page.request.get(path)).json()).cases[0] as {id:string;revision:number};
 const admin = new Pool({host:"127.0.0.1",port:55432,user:"postgres",password:"sbox-e2e-owner",database:"jobguard_synthetic_demo",max:1});
 let release!:()=>void;
 const gate = new Promise<void>(resolve=>{release=resolve});
 let original:ReturnType<typeof page.request.post>|undefined;
 const sent:string[] = [];
 await page.route(`**${path}`,async route=>{
  if(route.request().method()!=="POST"){await route.continue();return}
  const body = route.request().postData()!; sent.push(body);
  if(sent.length===1){
   // Delay forwarding the original request and abort only its browser transport.
   // page.request uses the same authenticated cookies and bypasses route interception.
   original = gate.then(()=>page.request.post(route.request().url(),{data:JSON.parse(body)}));
   await route.abort("connectionfailed");
  } else await route.continue();
 });
 try {
  await page.getByLabel("New claimed amount (£)",{exact:true}).fill("900.00"); await button(page,"Amend claim").click();
  const alert = page.locator("#recovery-cases p[role=alert]");
  await expect(alert).toContainText("may or may not have been saved"); await expect(alert).toBeFocused();
  expect(sent).toHaveLength(1);
  const body = JSON.parse(sent[0]!) as {commandId:string;expectedRevision:number};
  expect(body).toMatchObject({action:"amend_claim",caseId:c.id,expectedRevision:c.revision,claimedNetPence:90000});
  const tenantId = (await admin.query("SELECT tenant_id FROM app.job WHERE id=$1",[jobId])).rows[0].tenant_id;
  const activation=randomUUID(),baseline=randomUUID(),upload=randomUUID(),evidence=randomUUID(),receipt=randomUUID(),eligibility=randomUUID(),landing=randomUUID(),allocation=randomUUID();
  const db=await admin.connect();
  try {
   await db.query("BEGIN");
   await db.query("SET LOCAL session_replication_role=replica");
   await db.query("INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)VALUES($1,$2,$3,$4,1,repeat('a',64),'synthetic_demo','synthetic_demo_illustrative.v1','reference_fee_policy_v1',$5,now())",[activation,tenantId,jobId,baseline,randomUUID()]);
   await db.query("INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative)VALUES($1,$2,$3,$4,$5,1880000,'GBP',28200,'reference_fee_policy_v1',true)",[randomUUID(),tenantId,jobId,activation,baseline]);
   await db.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)VALUES($1,$2,$3,$4,repeat('b',64),'application/pdf',1,'standard_evidence','verified','synthetic-v1',now(),now()+interval '1 hour')",[upload,tenantId,jobId,`synthetic/${upload}`]);
   // CH-2: an evidence record is a watchdog input, accepted only for a LIVE job under that job's tenant. Move the job live with the real lifecycle
   // routine (never a direct status write), on the same fictional baseline as the activation and cap rows above.
   await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
   const lifecycle=(await db.query("SELECT status,revision FROM app.job WHERE tenant_id=$1 AND id=$2",[tenantId,jobId])).rows[0] as {status:string;revision:number};
   expect(lifecycle.status).toBe("quoting");
   const move=(expected:number,to:string,reason:string,live=false)=>db.query("SELECT app.transition_job($1,$2,$3,$4,$5,$6,$7,$8,$9)",[tenantId,jobId,expected,to,reason,baseline,live?1880000:null,live?"reference_fee_policy_v1":null,live?28200:null]);
   await move(lifecycle.revision,"accepted","accept_quote");await move(lifecycle.revision+1,"live","switch_live",true);
   await db.query("SET LOCAL session_replication_role=origin");
   await db.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)VALUES($1,$2,$3,$4,'original','synthetic_bank_receipt',$5,'synthetic-v1',repeat('b',64),1,'application/pdf','standard_evidence',now(),now())",[evidence,tenantId,upload,jobId,`synthetic/${upload}`]);
   await db.query("INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at)VALUES($1::uuid,$2,$3,$1::text,$1::text,'settled',100000,'GBP',true,now())",[receipt,tenantId,jobId]);
   for(const [id,kind] of [[eligibility,"eligibility"],[landing,"landing"]]) await db.query("INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)VALUES($1,$2,$3,$4,$5,$6,'approved','reference_fee_policy_v1',now()+interval '1 hour',$7)",[id,tenantId,jobId,c.id,kind,c.revision,randomUUID()]);
   await db.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
   await db.query("SET LOCAL ROLE jobguard_runtime");
   await db.query("SELECT app.approve_synthetic_landing($1::jsonb)",[{version:"recovery.landing.approve.v1",policyVersion:"reference_fee_policy_v1",jobId,caseId:c.id,expectedCaseRevision:c.revision,receiptId:receipt,evidenceId:evidence,eligibilityApprovalId:eligibility,landingApprovalId:landing,allocationId:allocation,derivationId:randomUUID(),journalId:randomUUID(),grossPence:100000,eligibleNetPence:100000,currency:"GBP",netTaxBasis:"known_net",causationConfirmed:true}]);
   await db.query("COMMIT");
  } catch(error) {await db.query("ROLLBACK");throw error} finally {db.release()}
  const retryResponse = page.waitForResponse(r=>r.url().endsWith(path)&&r.request().method()==="POST");
  await button(page,"Try again").click();
  const refused = await retryResponse; expect(refused.status()).toBe(400); expect(await refused.json()).toMatchObject({code:"RECOVERY_CLAIM_BELOW_SETTLED"});
  expect(sent).toHaveLength(2); expect(sent[1]).toBe(sent[0]);
  await expect(alert).toContainText("may or may not have been saved"); await expect(alert).toBeFocused();
  for(const name of ["Open materials-320 overcharge","Open £320 withheld payment","Open £2,500 withheld payment","Record prevention"])await expect(button(page,name)).toBeDisabled();
  expect((await (await page.request.get(path)).json()).cases[0]).toMatchObject({revision:c.revision,approvedLandedNetPence:100000,claimedNetPence:250000});
  const reversed=await admin.connect();
  try {
   await reversed.query("BEGIN"); await reversed.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]); await reversed.query("SET LOCAL ROLE jobguard_runtime");
   await reversed.query("SELECT app.reverse_synthetic_landing($1,$2,$3,$4,$5,$6,$7)",[tenantId,randomUUID(),randomUUID(),randomUUID(),allocation,100000,"Practice receipt reversed"]);
   await reversed.query("COMMIT");
  } catch(error) {await reversed.query("ROLLBACK");throw error} finally {reversed.release()}
  expect((await (await page.request.get(path)).json()).cases[0]).toMatchObject({revision:c.revision,approvedLandedNetPence:0,claimedNetPence:250000});
  release(); expect(original).toBeDefined(); const late=await original!; expect(late.status()).toBe(200);
  expect((await late.json()).cases[0]).toMatchObject({id:c.id,claimedNetPence:90000,revision:c.revision+2});
  await expect(alert).toContainText("may or may not have been saved"); await expect(button(page,"Open £320 withheld payment")).toBeDisabled();
  await expectTouchTarget(button(page,"Try again"));
  await button(page,"Try again").click(); await V(page,"case-claimed-net","£900.00");
  expect(sent).toHaveLength(3); expect(sent[2]).toBe(sent[0]); await expect(alert).toHaveCount(0);
  await expect(button(page,"Open £320 withheld payment")).toBeEnabled();
  expect((await admin.query("SELECT count(*)::int n FROM app.recovery_case_event WHERE tenant_id=$1 AND command_id=$2",[tenantId,body.commandId])).rows[0].n).toBe(1);
  const persisted=await (await page.request.get(path)).json();
  expect(persisted.cases).toHaveLength(1); expect(persisted.cases[0]).toMatchObject({id:c.id,claimedNetPence:90000,revision:c.revision+2,landedNetPence:0});
  await page.reload(); await V(page,"case-claimed-net","£900.00");
  const second=await signedInSecondPage(browser,jobId,page);
  try {await V(second.secondPage,"case-claimed-net","£900.00");expect(await (await second.secondPage.request.get(path)).json()).toEqual(persisted)} finally {await second.context.close()}
  await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged",{exact:true})).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 } finally {release();if(original)await original;await admin.end()}
});
