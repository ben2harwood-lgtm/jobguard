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
 "Accept the substitute"); see BUILDER_RECEIPT_repair6.md.
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
