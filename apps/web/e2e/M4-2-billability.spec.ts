import { test, expect } from "@playwright/test";
// Browser transport fixtures only. PostgreSQL route tests exercise actual source,
// tenancy, replay, stale revision and second-person checks; no provider is mocked as live.
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const path=`/jobs/${id(1)}/recovery-cases/${id(2)}/billability`;
const api=`**/api/jobs/${id(1)}/recovery-cases/${id(2)}/billability`;
const line={workId:id(3),lineId:id(4)};
const storedReview=(commandId:string)=>({version:"recovery-billability-review.v1",productionEnabled:false,
 command:{commandId,claimedEligiblePrincipalPence:80000,reasons:"Fictional reviewed evidence"},
 snapshot:{caseType:"missed_variation_final_account",builderCaptured:false,disclosedBeforeLock:false},
 assessment:{classification:"eligible_for_review",exclusions:[]}});

test("human review, lost-answer replay, stored second-person approval and accessible controls",async({page})=>{
 const requests:Record<string,unknown>[]=[];let loseFirst=true;let stored:ReturnType<typeof storedReview>|undefined;let approved=false;
 await page.route(api,async route=>{
  if(route.request().method()==="GET")return route.fulfill({json:{version:"recovery-billability-view.v1",caseId:id(2),caseRevision:2,lines:[line],reviews:stored?[{...line,review:stored,approved}]:[]}});
  const body=route.request().postDataJSON() as Record<string,unknown>;requests.push(body);
  if(body.action==="review"){
   stored=storedReview(String(body.commandId));
   if(loseFirst){loseFirst=false;return route.abort("failed");}
   return route.fulfill({json:stored});
  }
  approved=true;return route.fulfill({json:{version:"recovery-billability-approval.v1",productionEnabled:false,command:{commandId:body.commandId}}});
 });
 await page.goto(path);const main=page.getByRole("main");
 await expect(main.getByText(/Simulation only/)).toBeVisible();await expect(main.getByText(/Owner and adviser approval/)).toBeVisible();
 await main.getByLabel("Stored line").selectOption(`${line.workId}/${line.lineId}`);
 await main.getByLabel("Claimed eligible principal (whole pence)",{exact:true}).fill("80000");
 await main.getByLabel("Reasons for this review").fill("Fictional reviewed evidence");
 await main.getByRole("button",{name:"Record review",exact:true}).click();
 await expect(main.getByRole("alert")).toContainText("may already be saved");
 await page.reload();await main.getByRole("button",{name:"Retry same request"}).click();
 await expect(main.getByRole("alert")).toContainText("A different person must approve");
 expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);
 await expect(main.getByText("Claimed eligible principal: 80000 pence")).toBeVisible();
 await main.getByRole("button",{name:"Approve review",exact:true}).click();
 await expect(main.getByRole("alert")).toContainText("Simulation approval recorded");
 await expect(main.getByText(/Historical simulation approval recorded/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // Targeted serious WCAG checks without a downloaded browser audit dependency:
 // names, labels, page language/title, unique landmarks, heading and touch targets.
 await expect(page.getByRole("main")).toHaveCount(1);await expect(main.getByRole("heading",{level:1})).toHaveCount(1);
 expect(await page.title()).not.toBe("");expect(await page.locator("html").getAttribute("lang")).toBe("en-GB");
 const violations=await main.evaluate(root=>{
  const failures:string[]=[];
  for(const node of root.querySelectorAll<HTMLElement>("button,input,textarea,select")){
   const box=node.getBoundingClientRect();if(box.width<44||box.height<44)failures.push(`Small target: ${node.tagName}`);
   if(node instanceof HTMLButtonElement){if(!node.textContent?.trim()&&!node.getAttribute("aria-label"))failures.push("Unnamed button");}
   else if(!(node as HTMLInputElement).labels?.length&&!node.getAttribute("aria-label"))failures.push("Unlabelled field");
  }
  const ids=[...root.querySelectorAll("[id]")].map(node=>node.id);if(new Set(ids).size!==ids.length)failures.push("Duplicate field identifiers");
  return failures;
 });
 expect(violations).toEqual([]);
});

for(const refusal of ["pending cash","ordinary customer payment","duplicate claim","unapplied credit","prevented spend","unverified manual receipt","builder-captured item","catch disclosed before lock"]){
 test(`shows the server refusal for ${refusal}`,async({page})=>{
  await page.route(api,route=>route.fulfill({status:route.request().method()==="POST"?422:200,json:route.request().method()==="POST"
   ?{version:"recovery-billability-error.v1",code:"BILLABILITY_NOT_APPROVABLE",message:`Cannot approve: ${refusal}.`}
   :{version:"recovery-billability-view.v1",caseId:id(2),caseRevision:2,lines:[line],reviews:[{...line,review:storedReview(id(5)),approved:false}]}}));
  await page.goto(path);const main=page.getByRole("main");await main.getByRole("button",{name:"Approve review",exact:true}).click();
  await expect(main.getByRole("alert")).toHaveText(`Cannot approve: ${refusal}.`);
 });
}
