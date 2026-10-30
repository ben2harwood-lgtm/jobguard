import { expect,test } from "@playwright/test";
// Intercepted UI-contract evidence only; real source binding and refusal proofs
// belong to small-builder-trial-demo.integration.test.ts and MON-3 suites.
const tenant="11111111-1111-4111-8111-111111111111",run="22222222-2222-4222-8222-222222222222",first="33333333-3333-4333-8333-333333333333",second="44444444-4444-4444-8444-444444444444";
const target={acceptedDocumentId:run,acceptedDocumentVersion:1,acceptedDocumentHash:"a".repeat(64),expectedJobRevision:1};
test("guide calls existing trial commands, retains card setup on reload and reports missing start",async({page})=>{
 let card=false,started=false,attempt:string|null=null;
 const report=()=>({version:"trial-demo-report.v1",environment:"synthetic_demo",runId:run,archived:false,snapshotId:null,first:{jobId:first,start:started?{trialId:run}:null,timeline:null,target},second:{jobId:second,start:null,timeline:null,target},firstEligibility:{offerSkip:!card,cardGate:card?"completed":"optional_first"},secondEligibility:{offerSkip:false,cardGate:card?"completed":"add_card"},subscription:{agreements:[],periods:[],results:[]},deadlinePreview:null,status:"incomplete"});
 await page.route("**/api/auth/session",r=>r.fulfill({json:{csrfToken:"fictional-csrf",memberships:[{id:tenant,tenantId:tenant,name:"Fictional builder"}]}}));
 await page.route("**/api/small-builder-demo/trial",async r=>{
  const command=r.request().postDataJSON();expect(r.request().headers()["x-tenant-id"]).toBe(tenant);
  await r.fulfill({json:{...report(),snapshotId:command.action==="snapshot"?command.commandId:null}});
 });
 await page.route(`**/api/jobs/${first}/quotes/activation`,r=>r.fulfill({status:409,json:{code:"CAPACITY_ADMISSION_UNAVAILABLE"}}));
 await page.route(`**/api/jobs/${second}/quotes/activation`,r=>r.fulfill({status:409,json:{code:"TRIAL_COMPLETED_CARD_REQUIRED"}}));
 await page.route(`**/api/jobs/${first}/trial`,async r=>{
  const command=r.request().postDataJSON();
  if(command.kind==="request_card")attempt=command.commandId;
  if(command.kind==="simulate_card"){expect(command.commandId).toBe(attempt);card=true;}
  await r.fulfill({json:{hypothetical:true}});
 });
 await page.goto(`/demo-s/trial?tenantId=${tenant}&runId=${run}`);
 await page.getByRole("button",{name:"Skip for now",exact:true}).click();await expect(page.getByRole("alert")).toContainText("has not gone live");
 // Independently supplied source fixture: this does not claim the refused activation started a trial.
 started=true;await page.getByRole("button",{name:"Resume saved run"}).click();
 await page.getByRole("button",{name:"Try second job without a card"}).click();await expect(page.getByRole("alert")).toContainText("Add a card");
 await page.getByRole("button",{name:"Add a card",exact:true}).click();await page.reload();
 await page.getByRole("button",{name:"Complete fictional card setup"}).click();await expect(page.getByText("Simulated card on file.")).toBeVisible();
 await expect(page.getByRole("button",{name:"Skip for now",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Save source report"}).click();await expect(page).toHaveURL(/snapshotId=/);
 started=false;await page.reload();await expect(page.getByText(/Current outcome: No saved trial start/)).toBeVisible();
 await expect(page.getByText(/unavailable until a trial start is stored/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
