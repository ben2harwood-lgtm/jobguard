import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

type Preview = { view: { documentId: string; reference: string; documentVersion: number; contentHash: string }; document: { reference: string; cancellationKit?: { reference: string } } };
const click = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();
async function createQuote(page: Page, title: string) {
 await click(page, "＋ Start a new job");
 await page.getByLabel("Work details").fill(`JOB: ${title}\nITEM: Protect room | £200.00\nITEM: Prepare walls | £200.00\nITEM: Paint walls | £200.00\nITEM: Finish trim | £200.00\nITEM: Clean site | £100.00\nITEM: Replace shelves`);
 await click(page, "Make my draft"); await click(page, "Check and edit my draft");
 await expect(page.getByRole("heading", { name: "Check the work items", exact: true })).toBeVisible();
 const jobId = new URL(page.url()).pathname.split("/").at(-1)!;
 await click(page, "Save customer and site");
 await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
 for (const name of ["Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site"]) await click(page, `Accept ${name}`);
 await click(page, "Dismiss Replace shelves");
 await page.getByLabel("Dismissal reason Replace shelves").fill("Outside this fictional quote");
 await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
 await click(page, "Confirm scope"); await click(page, "Price the work");
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
 await click(page, "Save draft revision");
 await expect(page.getByTestId("quote-revision")).toHaveText("1");
 return jobId;
}
async function preview(page: Page): Promise<Preview> {
 const response = page.waitForResponse(r => r.url().endsWith("/quotes/preview") && r.request().method() === "POST");
 await click(page, "Preview immutable quote");
 const result = await response; expect(result.ok(), await result.text()).toBe(true);
 const data = await result.json() as Preview;
 await expect(page.getByRole("region", {name:"Quote preview"}).getByRole("heading")).toHaveText(`Quote ${data.document.reference}`);
 await expect(page.getByRole("region", {name:"Quote preview"})).toContainText(`Document version ${data.view.documentVersion}`);
 expect(data.view.reference).toBe(data.document.reference);
 expect(data.document.cancellationKit?.reference).toBe(data.document.reference);
 return data;
}

test("two own jobs keep their references across revision and reload", async ({ page, browser }, info) => {
 test.setTimeout(240_000);
 if (info.project.name === "mobile-360") await page.setViewportSize({ width: 390, height: 844 });
 await page.goto("/practice-company");
 await expect(page.getByRole("heading", { name: "Ready for your first job" })).toBeVisible();
 const firstId = await createQuote(page, "Fictional first decorating job"), first = await preview(page);
 expect(first.document.reference).toBe("Q-0001");
 async function download(p: Preview, name: string) {
  const waiting = page.waitForEvent("download"); await click(page, "Download runtime PDF");
  const file = await waiting, path = info.outputPath(name); await file.saveAs(path);
  const bytes = await readFile(path);
  expect(bytes.toString()).toContain(`Quote ${p.document.reference} | Document version ${p.view.documentVersion}`);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(p.view.contentHash);
  await info.attach(name, { path, contentType: "application/pdf" });
 }
 await download(first, "first.pdf");
 await page.goto("/classic");
 const secondId = await createQuote(page, "Fictional second decorating job"), second = await preview(page);
 expect(secondId).not.toBe(firstId); expect(second.document.reference).toBe("Q-0002");
 await download(second, "second.pdf");
 await click(page,"Simulate sending this quote");
 await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
 await click(page,"Record practice acceptance");
 await expect(page.getByTestId("accepted-revision")).toContainText("Quote Q-0002");
 await page.reload();
 await expect(page.getByRole("region",{name:"Saved quote"})).toContainText("Quote Q-0002");
 await expect(page.getByTestId("accepted-revision")).toContainText("Quote Q-0002");
 await page.goto(`/jobs/${firstId}#quote`);
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
 await page.getByLabel(/Unit rate/u).first().fill("210.00");
 await click(page, "Save draft revision");
 await expect(page.getByTestId("quote-revision")).toHaveText("2");
 const revised = await preview(page);
 expect(revised.document.reference).toBe("Q-0001"); expect(revised.view.documentVersion).toBe(2);
 await download(revised, "first-revised.pdf");
 await page.reload();
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready", "true");
 const reloaded = await page.request.get(`/api/jobs/${firstId}/quotes/delivery`);
 expect(reloaded.ok()).toBe(true);
 expect(await reloaded.json()).toMatchObject({ documentId: revised.view.documentId, reference: "Q-0001", documentVersion: 2, quoteRevision: 2 });
 await expect(page.getByRole("region",{name:"Saved quote"})).toContainText("Quote Q-0001");
 await expect(page.getByRole("region",{name:"Saved quote"})).toContainText("Document version 2");
 // Historical immutable bytes keep the original reference after a revision.
 const original=await page.request.get(`/api/jobs/${firstId}/quotes/artifacts/${first.view.documentId}`);
 expect(original.ok()).toBe(true);expect((await original.body()).toString()).toContain("Quote Q-0001 | Document version 1");
 expect(createHash("sha256").update(await original.body()).digest("hex")).toBe(first.view.contentHash);
 const again=await preview(page);expect(again.view.documentId).toBe(revised.view.documentId);
 await click(page,"Simulate sending this quote");
 await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
 await expect(page.locator(".quote-notice")).toHaveText("Simulated delivery — nothing real was sent.");
 await click(page,"Get practice customer link");
 const link=await page.getByLabel("Practice customer link — nothing emailed or texted").inputValue();
 const customer=await browser.newContext({baseURL:new URL(page.url()).origin,viewport:info.project.name==="mobile-360"?{width:390,height:844}:{width:1280,height:900}});
 try{
  const portal=await customer.newPage();await portal.goto(link);
  await portal.getByRole("button",{name:"Sign in",exact:true}).click();
  await portal.getByRole("link",{name:"Review your quote",exact:true}).click();
  await expect(portal.getByRole("heading",{name:/Q-0001/})).toBeVisible();
  await expect(portal.getByRole("heading",{name:"Q-0001 · revision 2",exact:true})).toBeVisible();
  await expect(portal.getByRole("region",{name:"Domestic cancellation-notice kit"})).toContainText("Q-0001");
  await portal.getByRole("button",{name:"Accept this quote",exact:true}).click();
  await expect(portal.getByText("You accepted this quote.",{exact:true})).toBeVisible();
 }finally{await customer.close();}
 await page.bringToFront();await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await expect(page.getByTestId("accepted-revision")).toContainText("Quote Q-0001");
 await page.reload();
 await expect(page.getByTestId("accepted-revision")).toContainText("Quote Q-0001");
 await expect(page.getByRole("region",{name:"Accepted terms"})).toContainText("Document v2");
 const history=page.locator("details").filter({has:page.locator("summary",{hasText:"Quote history"})}).first();
 await history.locator(":scope > summary").click();
 await expect(history).not.toHaveAttribute("open", "");
 const start=page.locator("#practice-start-job");await expect(start).toBeVisible();await expect(start).toBeEnabled();await start.click();
 await expect(page.getByRole("heading",{name:"Live · baseline frozen",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Attach generated practice image",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Attach generated practice image",exact:true}).click();
 await expect(page.getByTestId("proof-state")).toHaveText("Uploading");
 await expect(history.getByRole("button",{name:"Attach generated practice image",exact:true})).toHaveCount(0);
 await expect(history.locator('[aria-label="Accepted terms"]')).toHaveCount(1);
 await history.locator(":scope > summary").click();await expect(page.getByTestId("accepted-revision")).toBeVisible();
 await history.locator(":scope > summary").click();await expect(page.getByRole("button",{name:"Attach generated practice image",exact:true})).toBeVisible();
});
