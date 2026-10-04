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
 await button(page,"Evidence assembled").click();
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
