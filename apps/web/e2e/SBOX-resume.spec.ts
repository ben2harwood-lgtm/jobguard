import { expect, test, type Page } from "@playwright/test";
import { openReview } from "./helpers/capture-journey";

test.setTimeout(180_000);
const button=(page:Page,name:string)=>page.getByRole("button",{name,exact:true});
async function click(page:Page,name:string){await expect(button(page,name)).toBeVisible();await expect(button(page,name)).toBeEnabled();await button(page,name).click();}
async function confirmed(page:Page){
 await openReview(page);
 for(const name of["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await click(page,`Accept ${name}`);
 await click(page,"Dismiss Replace shelves");
 await page.getByLabel("Dismissal reason Replace shelves").fill("Not part of this fictional job");
 await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
 const response=page.waitForResponse(r=>r.url().endsWith("/confirm")&&r.request().method()==="POST");
 await click(page,"Confirm scope");const receipt=await response;expect(receipt.ok()).toBe(true);const saved=await receipt.json();
 await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");return saved.jobId as string;
}
async function savedQuote(page:Page){const jobId=await confirmed(page);await click(page,"Price the work");await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready","true");await click(page,"Save draft revision");await expect(page.getByText(/Draft revision 1 saved/u)).toBeVisible();return jobId;}
async function get(page:Page,url:string){const response=await page.request.get(url);expect(response.ok(),`${url}: ${response.status()}`).toBe(true);return response.json();}

test("reopens the same saved quote through its deep link and a second authorized context",async({page,browser})=>{
 const jobId=await savedQuote(page),before=await get(page,`/api/jobs/${jobId}/quotes`);
 await page.goto(`/jobs/${jobId}#quote`);
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready","true");
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-job-id",jobId);
 await expect(page.getByTestId("quote-revision")).toHaveText(String(before.draft.revision));
 const context=await browser.newContext({storageState:await page.context().storageState(),viewport:page.viewportSize()});
 try{const other=await context.newPage();await other.goto(`/jobs/${jobId}#quote`);await expect(other.locator(".quote-editor")).toHaveAttribute("data-quote-ready","true");await expect(other.locator(".quote-editor")).toHaveAttribute("data-job-id",jobId);expect((await get(other,`/api/jobs/${jobId}/quotes`)).revisions.at(-1)).toEqual(before.revisions.at(-1));}finally{await context.close();}
 await page.reload();await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready","true");
 expect((await get(page,`/api/jobs/${jobId}/quotes`)).revisions.at(-1)).toEqual(before.revisions.at(-1));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test("reopens accepted and active work without rewriting lifecycle or scope",async({page})=>{
 const jobId=await savedQuote(page);
 await click(page,"Preview immutable quote");await click(page,"Simulate sending this quote");await click(page,"Continue fake worker");await click(page,"Record practice acceptance");
 await page.goto(`/jobs/${jobId}`);await expect(page.getByTestId("job-status")).toHaveText("Customer said yes");await expect(button(page,"Save review")).toHaveCount(0);
 await page.getByRole("link",{name:"Quote",exact:true}).click();
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready","true");await click(page,"Start this practice job");await expect(page.getByTestId("job-status")).toHaveText("Work under way");
 const before=await get(page,`/api/jobs/${jobId}/proof`);
 await page.goto(`/jobs/${jobId}#work-proof`);await expect(page.locator("#work-proof")).toBeVisible();await expect(page.locator(".quote-editor")).toHaveAttribute("data-job-id",jobId);expect((await get(page,`/api/jobs/${jobId}/proof`)).scopeItemId).toBe(before.scopeItemId);
 await page.getByRole("link",{name:"Final account and invoices",exact:true}).click();await expect(page.getByRole("heading",{name:"Final account",exact:true})).toBeVisible();await expect(button(page,"Build final account")).toBeVisible();
 await page.getByRole("link",{name:"Scope",exact:true}).click();await expect(page.getByTestId("job-status")).toHaveText("Work under way");await expect(button(page,"Save review")).toHaveCount(0);await expect(page.getByText("Practice sandbox — synthetic data; nothing is sent or charged",{exact:true})).toBeVisible();
 expect((await get(page,`/api/jobs/${jobId}/proof`)).scopeItemId).toBe(before.scopeItemId);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test("does not expose saved job controls for a missing job",async({page})=>{
 await confirmed(page);await page.goto("/jobs/00000000-0000-4000-8000-000000000099#work-proof");
 await expect(page.getByRole("heading",{name:"You cannot open this job",exact:true})).toBeVisible();
 await expect(page.locator(".quote-editor")).toHaveCount(0);await expect(page.getByRole("navigation",{name:"Saved job sections"})).toHaveCount(0);
});
