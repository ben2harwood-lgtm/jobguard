import { expect, type Page } from "@playwright/test";
/** Open the server-generated, session-owned saved v1 sample; never create a fresh capture. */
export async function openReview(page:Page){
 await page.goto("/");await page.getByRole("button",{name:"Start the demo",exact:true}).click();await page.getByRole("button",{name:"Skip tour",exact:true}).click();
 const response=await page.request.get("/api/jobs?tenantId=11111111-1111-4111-8111-111111111111");if(!response.ok)throw new Error("Saved v1 sample list unavailable");
 const body=await response.json();const jobs=body.jobs??body;const sample=jobs.find((j:{title:string})=>j.title==="Earlier proposed pricing (v1)");if(!sample)throw new Error("Saved v1 sample missing");
 await page.goto(`/jobs/${sample.id}`);await expect(page.getByRole("heading",{name:"Check the work items",exact:true})).toBeVisible();await page.getByRole("button",{name:"Save customer and site",exact:true}).click();await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
}
export async function openQuote(page:Page){
 await openReview(page);for(const name of["Protect room","Prepare walls","Paint walls","Finish trim","Clean site","Replace shelves"])await page.getByRole("button",{name:`Accept ${name}`,exact:true}).click();await page.getByLabel(/Answer Confirm disposal/u).fill("Builder will remove waste");await page.getByRole("button",{name:"Confirm scope",exact:true}).click();await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");await page.getByRole("button",{name:"Price the work",exact:true}).click();await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready","true");
}
/** From an already started demo session: open the saved v1 sample (never a fresh capture), take it live under the earlier pricing and leave its fee example on screen. */
export async function openSampleFeeExample(page:Page){
 await page.goto("/");
 const response=await page.request.get("/api/jobs?tenantId=11111111-1111-4111-8111-111111111111");if(!response.ok)throw new Error("Saved v1 sample list unavailable");
 const body=await response.json();const jobs=body.jobs??body;const sample=jobs.find((j:{title:string})=>j.title==="Earlier proposed pricing (v1)");if(!sample)throw new Error("Saved v1 sample missing");
 await page.goto(`/jobs/${sample.id}`);await expect(page.getByRole("heading",{name:"Check the work items",exact:true})).toBeVisible();await page.getByRole("button",{name:"Save customer and site",exact:true}).click();await expect(page.getByTestId("party-customer")).toHaveText("Practice Customer");
 for(const name of["Protect room","Prepare walls","Paint walls","Finish trim","Clean site","Replace shelves"])await page.getByRole("button",{name:`Accept ${name}`,exact:true}).click();await page.getByLabel(/Answer Confirm disposal/u).fill("Builder will remove waste");await page.getByRole("button",{name:"Confirm scope",exact:true}).click();await expect(page.getByTestId("job-status")).toHaveText("Quote being prepared");await page.getByRole("button",{name:"Price the work",exact:true}).click();await expect(page.locator(".quote-editor")).toHaveAttribute("data-quote-ready","true");
 for(const input of await page.getByLabel(/Unit rate/u).all())if(await input.inputValue()==="")await input.fill("100.00");
 for(const action of["Save draft revision","Preview immutable quote","Simulate sending this quote","Continue fake worker","Record practice acceptance"]){const button=page.getByRole("button",{name:action,exact:true});await expect(button).toBeVisible();await button.click();}
 await page.getByLabel("Practice activation scenario").selectOption("simulated_base_obligation");const start=page.getByRole("button",{name:"Start this practice job",exact:true});await expect(start).toBeVisible();await start.click();
}
