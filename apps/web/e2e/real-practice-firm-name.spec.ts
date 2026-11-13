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
test("blank firm saves its name and issues an ordinary-words quote", async ({ page, browser }) => {
 test.setTimeout(300_000);
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto("/practice-company");
 await expect(page.getByRole("heading", { name: "Ready for your first job", exact: true })).toBeVisible();
 await saveName(page,name);
 await page.goto("/practice-company"); await click(page,"＋ Start a new job");
 await page.getByLabel("Work details").fill("Practice decorating. Protect room £200.00. Prepare walls £200.00. Paint walls £200.00. Finish trim £200.00. Clean site £100.00. Replace shelves");
 await click(page,"Make my draft"); await click(page,"Check and edit my draft");
 await click(page,"Save customer and site");
 for (const item of ["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"]) await click(page,`Accept ${item}`);
 await click(page,"Dismiss Replace shelves");
 await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this fictional job");
 await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
 await noOverflow(page); await click(page,"Confirm scope"); await click(page,"Price the work");
 const quote = page.locator(".quote-editor");
 await expect(quote).toHaveAttribute("data-quote-ready","true");
 const job = (await quote.getAttribute("data-job-id"))!;
 await click(page,"Save draft revision");
 await expect(page.getByTestId("quote-revision")).toHaveText("1");
 await click(page,"Preview immutable quote");
 await expect(page.getByRole("region",{name:"Quote preview"})).toContainText(name);
 const hash = await page.getByTestId("quote-artifact-hash").textContent();
 const downloading = page.waitForEvent("download"); await click(page,"Download runtime PDF");
 const download = await downloading, path = await download.path();
 expect(path).not.toBeNull();
 const bytes = await readFile(path!);
 expect(bytes.toString("utf8")).toContain(name);
 expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
 await click(page,"Simulate sending this quote"); await click(page,"Continue fake worker");
 await expect(page.getByTestId("quote-delivery")).toHaveText("Simulated delivery — nothing sent");
 await click(page,"Record practice acceptance");
 await expect(page.getByText(`Actor: ${name} (builder)`,{exact:true})).toBeVisible();
 await noOverflow(page); await page.reload();
 await expect(page.getByText(`Actor: ${name} (builder)`,{exact:true})).toBeVisible();
 await saveName(page,"Fictional Moonbrick Renamed");
 await page.goto(`/jobs/${job}#quote`);
 await expect(page.getByText(`Actor: ${name} (builder)`,{exact:true})).toBeVisible();
 await noOverflow(page);
 const separate = await browser.newContext({baseURL:new URL(page.url()).origin,viewport:{width:390,height:844}});
 try {
  const other = await separate.newPage(); await other.goto("/practice-company");
  await expect(other.getByRole("heading",{name:"Ready for your first job",exact:true})).toBeVisible();
  await other.goto("/firm-details");
  await expect(other.getByLabel("Trading name",{exact:true})).toHaveValue("A Builder Ltd");
  await saveName(other,"Fictional Other Workshop");
  const foreign = await other.request.get(`/api/jobs/${job}/quotes/acceptance`);
  expect(foreign.ok()).toBe(false);
  await page.goto("/firm-details");
  await expect(page.getByLabel("Trading name",{exact:true})).toHaveValue("Fictional Moonbrick Renamed");
  await noOverflow(other);
 } finally { await separate.close(); }
});
