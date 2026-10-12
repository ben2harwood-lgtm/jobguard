import { test, expect } from "@playwright/test";
import { openReview } from "./helpers/capture-journey";
import { issueInvoice, recordThroughUi } from "./helpers/customer-invoice-journey";
test.setTimeout(360_000);
// First journey written before implementation; matching journey added during self-review. Database/browser execution belongs to CI and the integrator.
const amounts = [["receipt-12000","£12,000.00"],["receipt-14640","£14,640.00"],["supplier-payment-600","£600.00"],["supplier-payment-840","£840.00"],["receipt-interest-120","£120.00"],["receipt-compensation-70","£70.00"]] as const;
test("six extra facts persist, keep the merged panel separate, and show supplier invoice fully paid",async({page,browser,context},info)=>{
  await openReview(page);
  for(const name of ["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await page.getByRole("button",{name:`Accept ${name}`,exact:true}).click();
  await page.getByRole("button",{name:"Dismiss Replace shelves",exact:true}).click();await page.getByLabel("Dismissal reason Replace shelves").fill("Not needed");
  await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");await page.getByRole("button",{name:"Confirm scope",exact:true}).click();
  await expect(page.locator("#captured-job-workspace")).toBeVisible();const jobId=(await page.locator("#captured-job-workspace").getAttribute("data-job-id"))!;
  const feed=await page.request.post(`/api/jobs/${jobId}/practice-feed`,{data:{version:"practice-feed-command.v1",commandId:crypto.randomUUID(),expectedRevision:0,action:"connect"}});expect(feed.status()).toBe(200);
  // F18 additional interest/compensation receipts are settled AFTER opening the case. CH-7's £3,000 receipt is untouched.
  await page.getByRole("button",{name:"Open £320 withheld payment",exact:true}).click();await expect(page.getByRole("article",{name:"Selected recovery case"})).toBeVisible();
  const panel=page.locator("#practice-facts");await panel.getByRole("button",{name:"Load extra practice movements"}).click();await expect(panel).toHaveAttribute("aria-busy","false");
  const movement=panel.getByLabel("Extra generated movement",{exact:true}),event=panel.getByLabel("Extra generated event",{exact:true}),advance=panel.getByRole("button",{name:"Advance extra movement",exact:true});
  await movement.focus();await page.keyboard.press("Tab");await expect(event).toBeFocused();await page.keyboard.press("Tab");await expect(advance).toBeFocused();
  for(const [key,amount] of amounts){
    await movement.selectOption(key);await event.selectOption("pending");await advance.click();const card=panel.locator(`[data-testid="practice-fact"][data-movement-key="${key}"]`);await expect(card).toContainText(amount);await expect(card.getByTestId("practice-fact-state")).toHaveText("Pending — cannot qualify");
    await event.selectOption("settled");await advance.click();await expect(card.getByTestId("practice-fact-state")).toHaveText("Simulated settled movement");
  }
  await expect(panel.getByTestId("later-invoice-state")).toHaveText("Paid in full");await expect(panel.getByTestId("practice-fact")).toHaveCount(6);
  await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged",{exact:true})).toHaveCount(1);
  await expect(page.locator("#practice-receipts").getByTestId("practice-movement")).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  for(const control of await panel.locator("button:visible,select:visible").all()){const box=await control.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);}
  await page.reload();await expect(panel.getByTestId("practice-fact")).toHaveCount(6);
  await page.goto("/");await expect(page.getByRole("heading",{name:"Jobs",exact:true})).toBeVisible();await page.goto(`/jobs/${jobId}`);await expect(panel.getByTestId("practice-fact")).toHaveCount(6);
  const second=await browser.newContext({storageState:await context.storageState(),baseURL:info.project.use.baseURL??"http://127.0.0.1:3000",...(info.project.use.viewport?{viewport:info.project.use.viewport}:{})});
  try{const view=await second.newPage();await view.goto(`/jobs/${jobId}`);await expect(view.locator("#practice-facts").getByTestId("practice-fact")).toHaveCount(6);}finally{await second.close();}
});

test("both F5 receipts match on screen only after settlement and are absent from the merged panel",async({page})=>{
  const f=await issueInvoice(page);
  await recordThroughUi(page,"12000.00");await expect(page.getByTestId("uiwire12-receipt-history").filter({hasText:"GBP 12,000.00"})).toHaveCount(1);
  await recordThroughUi(page,"14640.00");await expect(page.getByTestId("uiwire12-receipt-history").filter({hasText:"GBP 14,640.00"})).toHaveCount(1);
  const connected=await page.request.post(`/api/jobs/${f.jobId}/practice-feed`,{data:{version:"practice-feed-command.v1",commandId:crypto.randomUUID(),expectedRevision:0,action:"connect"}});expect(connected.status()).toBe(200);
  await page.reload();const panel=page.locator("#practice-facts");await expect(panel).toHaveAttribute("aria-busy","false");
  // Before any match, the merged panel (loaded on mount only) lists exactly the two unmatched receipts.
  const merged=page.locator("#practice-receipts").getByTestId("attested-receipt");
  await expect(merged).toHaveCount(2);await expect(merged.filter({hasText:"£12,000.00"})).toHaveCount(1);await expect(merged.filter({hasText:"£14,640.00"})).toHaveCount(1);
  for(const [key,amount] of amounts.slice(0,2)){
    const match=panel.getByRole("button",{name:`Match ${amount} extra receipt`,exact:true});await expect(match).toBeDisabled();
    await panel.getByLabel("Extra generated movement").selectOption(key);await panel.getByLabel("Extra generated event").selectOption("settled");await panel.getByRole("button",{name:"Advance extra movement",exact:true}).click();await expect(match).toBeEnabled();await match.click();
    await expect(panel.getByTestId("extra-attested-receipt").filter({hasText:amount})).toContainText("Qualifies — verified by a simulated settled movement");
  }
  await expect(panel.getByTestId("extra-attested-receipt")).toHaveCount(2);
  // The merged panel does not refresh itself; after a reload it must list zero attested receipts and the new panel both as matched.
  await page.reload();await expect(panel.getByTestId("extra-attested-receipt").filter({hasText:"Qualifies"})).toHaveCount(2);
  await expect(page.locator("#practice-receipts").getByText("No builder-attested receipts are recorded on this job yet.")).toBeVisible();await expect(page.locator("#practice-receipts").getByTestId("attested-receipt")).toHaveCount(0);
});
