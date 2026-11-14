import { expect, test, type Page } from "@playwright/test";
const pounds = (pence: number) => `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
async function click(page: Page, name: string) {
 const button=page.getByRole("button",{name,exact:true});
 await expect(button).toBeEnabled(); await button.click();
}
async function blankFirm(page: Page) {
  await page.goto("/today");
  await page.getByRole("link", { name: "Start my own practice firm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
  await click(page, "＋ Start a new job");
}
async function createJob(page: Page, text: string, net: number, customer: string, address: string) {
  await page.getByLabel("Work details").fill(text);
  await click(page, "Make my draft"); await click(page, "Check and edit my draft");
  await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
  const jobId = new URL(page.url()).pathname.split("/")[2]!;
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue(customer);
  await expect(page.getByLabel("Premises address", { exact: true })).toHaveValue(address);
  await page.getByLabel("Town", { exact: true }).fill("London");
  await page.getByLabel("UK postcode", { exact: true }).fill("SW1A 1AA");
  await click(page, "Save customer and site");
  await expect(page.getByTestId("party-customer")).toHaveText(customer);
  await expect(page.getByRole("form", { name: "Customer and site details" }).getByText(/^Saved at /u)).toBeVisible();
  const lines = page.locator(".review-line");
  for (let i = 0; i < await lines.count(); i++) {
    // Natural words leave one unsplit line without quantity or unit; scope confirmation requires both.
    await lines.nth(i).getByRole("textbox", { name: /^Quantity /u }).fill("1");
    await lines.nth(i).getByRole("textbox", { name: /^Unit /u }).fill("job");
    await lines.nth(i).getByRole("button", { name: /^Accept /u }).click();
  }
  const answers = page.getByRole("textbox", { name: /^Answer /u });
  for (let i = 0; i < await answers.count(); i++) await answers.nth(i).fill("Builder removes fictional waste; price is all in; timing agreed for this practice job.");
  await click(page, "Confirm scope"); await click(page, "Price the work");
  const quote = page.locator(".quote-editor");
  await expect(quote).toHaveAttribute("data-quote-ready", "true");
  // Enter exact net prices. Do not infer acceptance from this editable draft.
  const rates = quote.getByRole("textbox", { name: /^Unit rate /u });
  for (let i = 0; i < await rates.count(); i++) await rates.nth(i).fill(i === 0 ? String(net) : "0.00");
  await expect(page.getByTestId("quote-net")).toHaveText(`GBP ${net.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  await click(page, "Save draft revision"); await expect(page.getByTestId("quote-revision")).toHaveText("1");
  await click(page, "Preview immutable quote");
  await expect(page.getByRole("region", { name: "Quote preview" })).toContainText(pounds(net * 120));
  await click(page, "Simulate sending this quote");
  // The queued state renders the fake-worker control after the send returns; wait for it.
  await click(page, "Continue fake worker");
  await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
  await page.getByLabel("Stated customer", { exact: true }).fill(customer);
  await click(page, "Record practice acceptance"); await click(page, "Start this practice job");
  await expect(page.getByRole("heading", { name: "Live · baseline frozen", exact: true })).toBeVisible();
  await page.goto(`/jobs/${jobId}#quote`);
  return jobId;
}
async function completeAccount(page: Page, jobId: string): Promise<"failed" | "completed"> {
  await click(page, "Attach generated practice image"); await click(page, "Check file integrity"); await click(page, "Complete this stage");
  await expect(page.getByTestId("stage-status")).toHaveText("Complete");
  await click(page, "Finished on site"); await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
  await click(page, "Build final account");
  const panel = page.getByTestId("final-account-lock");
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
  const dispositions = panel.getByRole("combobox");
  for (let i = 0; i < await dispositions.count(); i++) {
    await dispositions.nth(i).selectOption("done"); await expect(panel).toHaveAttribute("aria-busy", "false");
  }
  const terms = panel.getByRole("button", { name: "Accept final check terms", exact: true });
  if (await terms.isEnabled()) await terms.click();
  await expect(panel).toHaveAttribute("aria-busy", "false");
  const complete = panel.getByRole("button", { name: "Complete final account", exact: true });
  if (!await complete.isEnabled()) await click(page, "Rebuild from approved sources");
  await expect(complete).toBeEnabled(); await complete.click();
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
  await click(page, "Load the saved final check");
  const check = page.getByTestId("final-check-reveal");
  await expect(check).toHaveAttribute("aria-busy", "false");
  let saved = "pending";
  const read = async () => {
    const response = await page.request.get(`/api/jobs/${jobId}/final-check`);
    expect(response.ok()).toBe(true);
    saved = (await response.json()).state as string;
    return saved;
  };
  if (await read() === "pending") await click(page, "Run the final check (practice)");
  await expect.poll(read, { timeout: 180_000, intervals: [1000, 3000, 5000] }).toMatch(/^(failed|completed)$/u);
  await click(page, "Load the saved final check");
  await expect(check).toHaveAttribute("aria-busy", "false");
  const response = await page.request.get(`/api/jobs/${jobId}/final-account/lock`);
  expect(response.ok()).toBe(true);
  const projection = await response.json();
  expect(projection.lock.jobId).toBe(jobId);
  expect(projection.checkStatus).toBe(saved);
  expect(projection.invoiceGuard).toBe(saved === "failed" ? "FINAL_CHECK_FAILED" : null);
  return saved as "failed" | "completed";
}

test("ordinary own job shows due, part paid and paid on the overview",async({page},info)=>{
 test.setTimeout(600_000);
 if(info.project.name==="mobile-360")await page.setViewportSize({width:390,height:844});
 await blankFirm(page);
 const jobId=await createJob(page,"Paint the hall and stairs for Mrs Example at 8 Fictional Lane, about 900 pounds, four days.",900,"Mrs Example","8 Fictional Lane");
 expect(await completeAccount(page,jobId)).toBe("completed");
 await click(page,"Issue and simulate this invoice");
 await expect(page.getByTestId("invoice-gross")).toHaveText("GBP 1,080.00");
 const overview=async(label:string,balance:string,status:string)=>{
  await page.goto("/practice-company");
  const card=page.locator(".job-card").filter({has:page.locator(`a[href="/jobs/${jobId}"]`)});
  await expect(card).toHaveCount(1);
  await expect(card.getByText(label,{exact:true})).toBeVisible();
  await expect(card.getByText("Open this job to check customer payment",{exact:true})).toHaveCount(0);
  await page.reload();
  await expect(card.getByText(label,{exact:true})).toBeVisible();
  await expect(card.getByText("Open this job to check customer payment",{exact:true})).toHaveCount(0);
  await page.goto(`/jobs/${jobId}#quote`);
  await expect(page.getByTestId("invoice-balance")).toHaveText(balance);
  await expect(page.getByTestId("customer-payment-status")).toHaveText(status);
  await page.reload();
  await expect(page.getByTestId("invoice-balance")).toHaveText(balance);
 };
 await overview("Customer payment is due","GBP 1,080.00","Unpaid");
 const receipt=async(amount:string,reference:string)=>{
  await page.getByTestId("uiwire12-receipt-amount").fill(amount);
  await page.getByTestId("uiwire12-receipt-reference").fill(reference);
  await click(page,"Record practice receipt");
 };
 await receipt("400.00","Fictional partial receipt");
 await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 680.00");
 await overview("Customer has paid some","GBP 680.00","Part paid");
 await receipt("680.00","Fictional remaining receipt");
 await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 0.00");
 await overview("Customer has paid","GBP 0.00","Paid");
 await page.getByTestId("uiwire12-receipt-history").filter({hasText:"Fictional remaining receipt"}).getByRole("button",{name:"Reverse this receipt",exact:true}).click();
 await expect(page.getByTestId("invoice-balance")).toHaveText("GBP 680.00");
 await overview("Customer has paid some","GBP 680.00","Part paid");
 await page.goto("/practice-company");
 const card=page.locator(".job-card").filter({has:page.locator(`a[href="/jobs/${jobId}"]`)});
 await expect(card.getByText("Customer has paid",{exact:true})).toHaveCount(0);
});
