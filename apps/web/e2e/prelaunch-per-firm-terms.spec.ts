import { expect, test, type Page } from "@playwright/test";
import { startWatchdogJob } from "./helpers/capture-journey";

const wording = "Practice wording only — this records this practice firm's choice to try Final Check with made-up job records. It is not legal terms, authorisation to charge, or permission to use real customer data.";
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
async function click(page: Page, name: string) { await expect(button(page,name)).toBeEnabled(); await button(page,name).click(); }
// Follow REAL-OWN-JOB-TO-PAID through the real screens. No database writes,
// response interception, acceptance seeds, locks or hidden-signal fixtures.
async function ownJob(page: Page) {
 await page.goto("/practice-company");
 await click(page,"＋ Start a new job");
 await page.getByLabel("Work details").fill("JOB: Fictional room\nITEM: Paint walls | £200.00");
 await click(page,"Make my draft"); await click(page,"Check and edit my draft");
 await click(page,"Save customer and site"); await click(page,"Accept Paint walls");
 await page.getByLabel(/Answer Confirm disposal/u).fill("Builder removes fictional waste");
 await click(page,"Confirm scope"); await click(page,"Price the work");
 await startWatchdogJob(page);
 const job=(await page.locator(".quote-editor").getAttribute("data-job-id"))!;
 await page.goto(`/jobs/${job}#quote`);
 await click(page,"Attach generated practice image"); await click(page,"Check file integrity"); await click(page,"Complete this stage");
 await expect(page.getByTestId("stage-status")).toHaveText("Complete");
 await click(page,"Finished on site"); await expect(page.getByTestId("work-state")).toHaveText("Finished on site");
 await click(page,"Build final account");
 const panel=page.getByTestId("final-account-lock");
 await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
 await panel.getByRole("combobox").selectOption("done");
 await expect(panel).toHaveAttribute("aria-busy","false");
 return job;
}
async function unaccepted(page: Page) {
 const panel=page.getByTestId("final-account-lock");
 await expect(panel.getByText(wording,{exact:true})).toBeVisible();
 await expect(button(page,"Accept final check terms")).toBeEnabled();
 await expect(panel.getByText("Press “Accept final check terms” before completing the final account.",{exact:true})).toBeVisible();
 await expect(button(page,"Complete final account")).toBeDisabled();
}
test("Final Check practice wording belongs to each blank firm, including after reset",async ({browser,baseURL})=>{
 test.setTimeout(600_000);
 const a=await browser.newContext({baseURL,viewport:{width:390,height:844}});
 const b=await browser.newContext({baseURL,viewport:{width:390,height:844}});
 try {
  const ap=await a.newPage(),bp=await b.newPage();
  const aj=await ownJob(ap),bj=await ownJob(bp);
  await unaccepted(ap); await unaccepted(bp);
  await click(ap,"Accept final check terms");
  await expect(ap.getByText("Final check terms accepted.",{exact:true})).toBeVisible();
  await bp.reload(); await unaccepted(bp);
  const refused=await bp.request.post(`/api/jobs/${aj}/final-account/terms`,{data:{version:"final-check-terms.accept.v1",commandId:crypto.randomUUID(),termsVersion:"synthetic_final_check_terms.v1"}});
  expect(refused.status()).toBe(404);
  await ownJob(ap);
  await expect(button(ap,"Accept final check terms")).toBeDisabled();
  await expect(ap.getByText("Final check terms accepted.",{exact:true})).toBeVisible();
  const oldCookies=await a.cookies();
  await ap.goto("/practice-company"); await click(ap,"Reset practice firm"); await click(ap,"Yes, reset practice firm");
  await expect(ap.getByRole("heading",{name:"Ready for your first job"})).toBeVisible();
  await ownJob(ap); await unaccepted(ap);
  // Temporarily present the revoked cookie in A's context to prove the old
  // session cannot replay acceptance; restore the new firm afterwards.
  const newCookies=await a.cookies(); await a.clearCookies(); await a.addCookies(oldCookies);
  const revoked=await ap.request.post(`/api/jobs/${aj}/final-account/terms`,{data:{version:"final-check-terms.accept.v1",commandId:crypto.randomUUID(),termsVersion:"synthetic_final_check_terms.v1"}});
  expect(revoked.ok()).toBe(false); expect((await revoked.json()).code).toBe("UNAUTHENTICATED");
  await a.clearCookies(); await a.addCookies(newCookies);
  await bp.goto(`/jobs/${bj}#quote`); await unaccepted(bp);
 } finally { await a.close(); await b.close(); }
});
