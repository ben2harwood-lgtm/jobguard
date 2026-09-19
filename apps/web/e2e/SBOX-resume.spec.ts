import { expect, test, type Page } from "@playwright/test";
import { openReview } from "./helpers/capture-journey";

test.setTimeout(180_000);
const button=(page:Page,name:string)=>page.getByRole("button",{name,exact:true});
async function click(page:Page,name:string){await expect(button(page,name)).toBeVisible();await expect(button(page,name)).toBeEnabled();await button(page,name).click();}
async function confirmed(page:Page){
 await openReview(page);
 for(const name of ["Protect room","Prepare walls","Paint walls","Finish trim","Clean site"])await click(page,`Accept ${name}`);
 await click(page,"Dismiss Replace shelves");await page.getByLabel("Dismissal reason Replace shelves").fill("Not in this practice quote");
 await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes waste");await click(page,"Confirm scope");await click(page,"Price the work");
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready","true");
 const jobId=(await page.locator(".quote-editor").getAttribute("data-job-id"))!;
 const scopeIds=(await page.locator(".quote-editor").getAttribute("data-scope-lineage"))!;
 await click(page,"Save draft revision");await expect(page.getByTestId("quote-revision")).toHaveText("1");
 return {jobId,scopeIds};
}

test("opens a saved quote directly and preserves source identity after reload",async({page})=>{
 const {jobId,scopeIds}=await confirmed(page);
 await page.goto(`/jobs/${jobId}#quote`);
 await expect(page.getByRole("heading",{name:"Price the work",exact:true})).toBeVisible();
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready","true");
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-job-id",jobId);
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-scope-lineage",scopeIds);
 await expect(page.getByTestId("quote-revision")).toHaveText("1");
 await page.reload();
 await expect(page.getByRole("heading",{name:"Price the work",exact:true})).toBeVisible();
 await expect(page.getByTestId("quote-revision")).toHaveText("1");
 await click(page,"← Scope review");
 await expect(page.getByRole("heading",{name:"Scope confirmed",exact:true})).toBeVisible();
 await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");
});

test("reopens accepted and active work without rewriting lifecycle or scope",async({page})=>{
 const {jobId,scopeIds}=await confirmed(page);
 await click(page,"Preview immutable quote");await click(page,"Simulate sending this quote");await click(page,"Continue fake worker");await click(page,"Record practice acceptance");
 await page.goto(`/jobs/${jobId}#quote`);
 await expect(page.getByTestId("job-status")).toHaveText("Customer said yes");
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-scope-lineage",scopeIds);
 await click(page,"Start this practice job");
 await page.goto(`/jobs/${jobId}#work-proof`);
 await expect(page.getByTestId("job-status")).toHaveText("Work under way");
 await expect(page.locator("#work-proof")).toBeVisible();
 await expect(page.locator(".quote-editor")).toHaveAttribute("data-scope-lineage",scopeIds);
 const proof=await(await page.request.get(`/api/jobs/${jobId}/proof`)).json();
 const workspace=await(await page.request.get(`/api/jobs/${jobId}`)).json();
 expect(workspace.job.scopeIdentityIds).toContain(proof.scopeItemId);
 await click(page,"← Scope review");
 await expect(page.getByTestId("job-status")).toHaveText("Work under way");
 await expect(button(page,"Confirm scope")).toHaveCount(0);
 await expect(page.locator(".confirmed-scope")).toBeVisible();await expect(page.getByRole("note",{name:"Practice sandbox notice",exact:true})).toHaveText("Practice sandbox — synthetic data; nothing is sent or charged");
});
