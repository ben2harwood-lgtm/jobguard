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
 expect(data.view.reference).toBe(data.document.reference);
 expect(data.document.cancellationKit?.reference).toBe(data.document.reference);
 return data;
}

test("two runtime previews use one firm sequence and a revised quote retains its reference", async ({ page }, info) => {
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
 // The editor heading is deliberately deferred to real-quote-firm-sequence-screen.
});
