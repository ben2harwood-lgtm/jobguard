import{expect,test,type Page}from"@playwright/test";import{openReview}from"./helpers/capture-journey";
test.setTimeout(180_000);
const V=async(page:Page,id:string,value:string)=>expect.poll(async()=>page.getByTestId(id).textContent(),{timeout:45_000}).toBe(value);
const button=(page:Page,name:string)=>page.getByRole("button",{name,exact:true});
// C7: a keyboard user reaches the action and sees a real focus indicator (not outline:none with no replacement).
const expectVisibleKeyboardFocus=async(page:Page,name:string)=>{const target=button(page,name);await expect(target).toBeFocused();expect(await target.evaluate(el=>{const s=getComputedStyle(el);return el.matches(":focus-visible")&&((s.outlineStyle!=="none"&&parseFloat(s.outlineWidth)>0)||s.boxShadow!=="none")})).toBe(true)};
test("opens and manages evidence-linked recovery cases without inventing recovered money",async({page,context},testInfo)=>{
 await openReview(page);
 for(const n of["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await page.getByRole("button",{name:`Accept ${n}`,exact:true}).click();
 await page.getByRole("button",{name:"Dismiss Replace shelves",exact:true}).click();await page.getByLabel("Dismissal reason Replace shelves").fill("Not needed");await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");
 await page.getByRole("button",{name:"Confirm scope",exact:true}).click();
 const jobId=(await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
 // C7 keyboard path: Tab/Shift+Tab between the first actions (keyboard modality, so :focus-visible applies) and require a visible focus ring on each.
 await button(page,"Open materials-320 overcharge").focus();
 await page.keyboard.press("Tab");await expectVisibleKeyboardFocus(page,"Open £320 withheld payment");
 await page.keyboard.press("Shift+Tab");await expectVisibleKeyboardFocus(page,"Open materials-320 overcharge");
 // Merchant overcharge: supplier documents only, never customer debt.
 await button(page,"Open materials-320 overcharge").click();
 await V(page,"case-claimed-net","£320.00");await V(page,"case-landed-net","£0.00");await V(page,"case-state","Needs evidence");
 for(const source of["Supplier agreement AG-320","Delivery note DN-320","Supplier invoice INV-320"])await expect(page.getByRole("link",{name:source,exact:true})).toBeVisible();
 await expect(page.getByText("Generated customer invoice INV-18800",{exact:true})).toHaveCount(0);
 // A source link leads somewhere real: it moves focus to an in-page detail naming the kind of document and what is (not) attached (no hash change: the job workspace reloads on hashchange).
 await page.getByRole("link",{name:"Delivery note DN-320",exact:true}).click();
 const detail=page.locator("#source-delivery-note-dn-320");await expect(detail).toBeFocused();await expect(detail).toBeInViewport();await expect(detail).toContainText("Delivery note");await expect(detail).toContainText("no stored document file is attached");
 // recovery-18800 has TWO withheld-customer-payment claims against its generated customer invoice: open the £320 one too.
 await button(page,"Open £320 withheld payment").click();
 await V(page,"case-claimed-net","£320.00");await V(page,"case-book","Builder–customer");await V(page,"case-source-type","Customer invoice");await V(page,"case-state","Needs evidence");
 await expect(page.getByRole("link",{name:"Generated customer invoice INV-18800",exact:true})).toBeVisible();
 for(const source of["Supplier agreement AG-320","Delivery note DN-320","Supplier invoice INV-320"])await expect(page.getByRole("link",{name:source,exact:true})).toHaveCount(0);
 await button(page,"Open £2,500 withheld payment").click();
 await V(page,"case-claimed-net","£2,500.00");await V(page,"case-book","Builder–customer");await V(page,"case-source-type","Customer invoice");
 await button(page,"Evidence assembled").click();
 // Negative path: a receipt larger than the claim is refused, shown as an alert, and nothing is recorded.
 await page.getByLabel("Received (£)",{exact:true}).fill("2500.01");await button(page,"Record a landed recovery").click();
 await expect(page.locator("p[role=alert]")).toContainText("is not allowed");await V(page,"case-landed-net","£0.00");
 await page.getByLabel("Received (£)",{exact:true}).fill("1000.00");await button(page,"Record a landed recovery").click();
 await V(page,"case-landed-net","£1,000.00");await V(page,"case-outstanding-net","£1,500.00");await V(page,"case-fee","Not calculated here");
 await button(page,"Write off remainder").click();await expect(page.getByText("£1,500.00 written off",{exact:true})).toBeVisible();await expect(page.getByText("£2,500 recovered",{exact:true})).toHaveCount(0);
 await V(page,"case-outstanding-net","£0.00");
 await button(page,"Record prevention").click();
 await V(page,"case-state","Prevented before payment");await V(page,"case-fee","£0.00");await expect(button(page,"Record a landed recovery")).toBeDisabled();
 await page.reload();await V(page,"case-state","Prevented before payment");
 // C7 (partly): a second page reads the same persisted state via a deep link. It cannot "open the job from Jobs": the Jobs list
 // (readSyntheticDemo) deliberately excludes capture-created jobs, so this is an OPEN FOR BEN item in BUILDER_RECEIPT_repair2.md, not a pass.
 const second=await context.newPage();await second.goto(`/jobs/${jobId}#recovery-cases`);await V(second,"case-state","Prevented before payment");
 await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged",{exact:true})).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await page.screenshot({path:`test-results/M4-1-S-${testInfo.project.name}.png`,fullPage:true})
});
