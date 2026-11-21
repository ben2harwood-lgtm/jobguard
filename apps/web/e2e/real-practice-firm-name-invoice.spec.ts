import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const name = "Fictional Moonbrick Works";
async function click(page: Page, label: string) {
 const button = page.getByRole("button", { name: label, exact: true });
 await expect(button).toBeEnabled(); await button.click();
}
async function noOverflow(page: Page) {
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function saveName(page: Page, value: string) {
 await page.goto("/firm-details");
 await page.getByLabel("Trading name", { exact: true }).fill(value);
 await click(page,"Save firm details");
 await expect(page.getByRole("status")).toContainText("Firm details saved.");
 await noOverflow(page); await page.reload();
 await expect(page.getByLabel("Trading name", { exact: true })).toHaveValue(value);
 await noOverflow(page);
}

async function journey(page: Page, savedName: string | null) {
 const quoteName = savedName ?? "A Builder Ltd";
 await page.goto("/practice-company");
 await expect(page.getByRole("heading", { name: "Ready for your first job", exact: true })).toBeVisible();
 if (savedName) await saveName(page,savedName);
 await page.goto("/practice-company"); await click(page,"＋ Start a new job");
 await page.getByLabel("Work details").fill("Practice decorating. Protect room £200.00. Prepare walls £200.00. Paint walls £200.00. Finish trim £200.00. Clean site £100.00. Replace shelves");
 await click(page,"Make my draft"); await click(page,"Check and edit my draft");
 await click(page,"Save customer and site");
 await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
 await expect(page.getByRole("form",{name:"Customer and site details"}).getByText(/^Saved at /u)).toBeVisible();
 for (const item of ["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"]) await click(page,`Accept ${item}`);
 await click(page,"Dismiss Replace shelves");
 await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this fictional job");
 await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
 await noOverflow(page); await click(page,"Confirm scope"); await click(page,"Price the work");
 const quote = page.locator(".quote-editor");
 await expect(quote).toHaveAttribute("data-quote-ready","true");
 const job = (await quote.getAttribute("data-job-id"))!;
 // Open the saved Quote section explicitly; plain job URLs open Scope in page order v2.
 await page.goto(`/jobs/${job}#quote`);
 await expect(quote).toHaveAttribute("data-quote-ready","true");
 await click(page,"Save draft revision");
 await expect(page.getByTestId("quote-revision")).toHaveText("1");
 await click(page,"Preview this quote");
 await expect(page.getByRole("region",{name:"Quote preview"})).toContainText(quoteName);
 const hash = await page.getByTestId("quote-artifact-hash").textContent();
 const downloading = page.waitForEvent("download"); await click(page,"Download quote PDF");
 const download = await downloading, path = await download.path();
 expect(path).not.toBeNull();
 const bytes = await readFile(path!);
 expect(bytes.toString("utf8")).toContain(quoteName);
 expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
 // Own blank firms complete the fake send in the issue request on current main.
 const sending = page.waitForResponse(response => response.url().endsWith(`/jobs/${job}/quotes/delivery`) && response.request().method() === "POST");
 await click(page,"Simulate sending this quote");
 const sent = await sending;
 expect(sent.status(), await sent.text()).toBe(200);
 const approved = sent.request().postDataJSON();
 expect(approved.contentHash).toBe(hash);
 expect(await sent.json()).toMatchObject({ documentId: approved.documentId, contentHash: hash, recipient: approved.recipient,
  status: "simulated_delivery", attempts: 1, receiptCount: 1, effects: { platformDebt: 0, chargeAttempts: 0, realExternalActions: 0 } });
 await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
 await expect(page.getByRole("button", { name: "Continue fake worker", exact: true })).toHaveCount(0);
 const recording = page.waitForResponse(response => response.url().endsWith(`/jobs/${job}/quotes/acceptance`) && response.request().method() === "POST");
 await click(page,"Record practice acceptance");
 const recorded = await recording;
 expect(recorded.ok()).toBe(true);
 expect((await recorded.json()).activeAcceptance.actor).toBe(`${quoteName} (builder)`);
 await expect(page.getByText(`Actor: ${quoteName} (builder)`,{exact:true})).toBeVisible();
 await noOverflow(page); await page.reload();
 await expect(page.getByText(`Actor: ${quoteName} (builder)`,{exact:true})).toBeVisible();
 await click(page,"Start this practice job");
 await expect(page.getByRole("heading",{name:"Job started · agreed quote saved",exact:true})).toBeVisible();
 await page.goto(`/jobs/${job}/work#quote`);
 await click(page,"Finished on site");
 await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
 await click(page,"Build final account");
 await expect(page.getByTestId("lock-state")).toHaveText("Final account review");
 await click(page,"Attach generated practice image");
 await click(page,"Check file integrity"); await click(page,"Complete this stage");
 await expect(page.getByTestId("stage-status")).toHaveText("Complete");
 const panel = page.getByTestId("final-account-lock");
 const dispositions = panel.getByRole("combobox");
 await expect(dispositions).toHaveCount(5);
 for (let i=0;i<5;i++) {
  await dispositions.nth(i).selectOption("done");
  await expect(panel).toHaveAttribute("aria-busy","false");
 }
 await panel.getByRole("button",{name:"Accept final check terms",exact:true}).click();
 await expect(panel.getByText("Final check terms accepted.",{exact:true})).toBeVisible();
 const rebuilding = page.waitForResponse(r=>r.url().endsWith(`/api/jobs/${job}/final-account`)&&r.request().method()==="POST");
 await click(page,"Rebuild from approved sources");
 const rebuilt = await rebuilding; expect(rebuilt.ok(),await rebuilt.text()).toBe(true);
 expect((await rebuilt.json()).account.issueBlocked).toBe(false);
 await noOverflow(page);
 await click(page,"Complete final account");
 await expect(panel.getByTestId("lock-state")).toHaveText("Final account completed");
 const readCheck = async () => {
  const loaded = page.waitForResponse(r=>r.url().endsWith(`/api/jobs/${job}/final-check`)&&r.request().method()==="GET");
  await click(page,"Load the saved final check");
  const response = await loaded; expect(response.ok()).toBe(true);
  await expect(page.getByTestId("final-check-reveal")).toHaveAttribute("aria-busy","false");
  const check = await response.json(); expect(check.state).not.toBe("failed"); return check.state;
 };
 if (await readCheck() !== "completed") await click(page,"Run the final check (practice)");
 await expect.poll(readCheck,{timeout:180_000,intervals:[1000,3000]}).toBe("completed");
 await expect(page.getByTestId("final-check-status")).toHaveText("JobGuard's final check didn't spot anything missing from your bill. It looks for prices and agreed extras in your notes and messages and can miss other wording, so read them through before you send the bill.");
 const issuing = page.waitForResponse(r=>r.url().endsWith(`/api/jobs/${job}/customer-invoices`)&&r.request().method()==="POST");
 await click(page,"Issue and simulate this invoice");
 const issued = await issuing; expect(issued.ok(),await issued.text()).toBe(true);
 const view = await issued.json(); expect(view.invoices).toHaveLength(1);
 const invoice = view.invoices[0];
 await expect(page.getByTestId("invoice-gross")).toHaveText("GBP 1,080.00");
 const link = page.getByRole("link",{name:"Download synthetic invoice PDF",exact:true});
 await expect(link).toBeVisible();
 const invoiceDownload = page.waitForEvent("download"); await link.click();
 const file = await invoiceDownload, invoicePath = await file.path(); expect(invoicePath).not.toBeNull();
 const artifact = await readFile(invoicePath!);
 expect(artifact.toString("utf8")).toContain(`Issuer: ${savedName ?? "Fictional Builder Ltd"} [`);
 expect(createHash("sha256").update(artifact).digest("hex")).toBe(invoice.pdfSha256);
 await test.info().attach(savedName ? "named-invoice.pdf" : "separate-firm-invoice.pdf",{body:artifact,contentType:"application/pdf"});
 await expect(page.getByTestId("real-external-actions").first()).toHaveText("0");
 await noOverflow(page);
 if (!savedName) {
  expect(artifact.toString("utf8")).not.toContain(name);
  await expect(page.locator("body")).not.toContainText(name);
 }
 return {job,artifact};
}

test("blank firm’s ordinary-words job reaches an invoice bearing its saved name",async({page,browser})=>{
 test.setTimeout(720_000);
 if (test.info().project.name==="mobile-360") await page.setViewportSize({width:390,height:844});
 const first = await journey(page,name);
 const separate = await browser.newContext({baseURL:new URL(page.url()).origin,viewport:page.viewportSize()!});
 try {
  const other = await separate.newPage(); await journey(other,null);
  const foreign = await other.request.get(`/api/jobs/${first.job}/customer-invoices`);
  expect(foreign.ok()).toBe(false); expect(await foreign.text()).not.toContain(name);
 } finally {await separate.close();}
});
