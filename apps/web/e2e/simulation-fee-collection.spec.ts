// Browser/transport demonstration with synthetic responses; SQL proof is separate.
import { randomUUID } from "node:crypto";
import { expect,test } from "@playwright/test";
import { openQuote } from "./helpers/v1-sample-job";

test("fake collection stays pending through redirects and unknown outcomes, then refunds £250 and retains £32",async({page})=>{
 const {canonicalSimulationFeeStatementJson,sha256}=await import("@jobguard/core");
 const id=randomUUID(),allocation=randomUUID(),hash="a".repeat(64),gbp=(pence:number)=>({pence,currency:"GBP"});
 let jobId="",corrected=false;const writes:Record<string,unknown>[]=[];
 function record(correction=false){
  const original={version:"issued-simulation-fee-statement.v1",statementId:id,jobId,number:"DEMO-FEE-000001",namespace:"success_fee.synthetic.v1",environment:"synthetic_demo",policyVersion:"reference_fee_policy_v3",
   qualifyingPrincipal:{numerator:"282000",denominator:"1"},cumulativeFeePrincipal:gbp(28200),documentPrincipal:gbp(28200),postingHistory:[{journalId:allocation,principal:gbp(28200)}],original:null as null|{statementId:string;documentHash:string},
   sourceSnapshot:{adjustments:{paymentReversalIds:[],creditNoteIds:[],evidenceInvalidationIds:[]},postingRevision:1,qualifyingPrincipal:{numerator:"282000",denominator:"1"},feePence:28200,derivations:[{derivationId:id,reviewId:id,authorizationId:id,statementHash:hash}],sources:[{assessmentId:id,currentAssessmentId:id,sourceHash:hash,reviewAuthorizationId:id,allocationIds:[allocation],remainingPrincipal:{numerator:"282000",denominator:"1"},reasonCodes:[]}]},
   settlementHistory:{state:"integration_unavailable",dependency:"M4-12-S"},warning:"Simulation statement — proposed policy, principal only; not a tax invoice or real amount due",vatLabel:"VAT not calculated",sandboxLabel:"Practice sandbox — synthetic data; nothing is sent or charged"};
  const originalHash=sha256(canonicalSimulationFeeStatementJson(original));
  const document=correction?{...original,statementId:allocation,number:"DEMO-FEE-000002",original:{statementId:id,documentHash:originalHash},qualifyingPrincipal:{numerator:"32000",denominator:"1"},cumulativeFeePrincipal:gbp(3200),documentPrincipal:gbp(-25000),sourceSnapshot:{...original.sourceSnapshot,qualifyingPrincipal:{numerator:"32000",denominator:"1"},feePence:3200,sources:original.sourceSnapshot.sources.map(s=>({...s,remainingPrincipal:{numerator:"32000",denominator:"1"},sourceHash:"b".repeat(64)}))}}:original;
  return {document,documentHash:sha256(canonicalSimulationFeeStatementJson(document))};
 }
 await page.route("**/api/jobs/*/success-fees",async route=>{jobId=new URL(route.request().url()).pathname.split("/")[3]!;await route.fulfill({json:{state:"catch_review_available"}});});
 let settled=0,refunded=0,state="",kind="collection",attemptId=randomUUID();
 await page.route("**/api/jobs/*/success-fees/collection",async route=>{
  jobId=new URL(route.request().url()).pathname.split("/")[3]!;
  if(route.request().method()==="POST"){
   const c=route.request().postDataJSON();writes.push(c);
   if(c.action==="collect"||c.action==="refund"){
    expect(c).toMatchObject({statementId:corrected?allocation:id,statementHash:record(corrected).documentHash,amountPence:corrected?25000:28200});
    state="pending";kind=c.action==="collect"?"collection":"refund";attemptId=randomUUID();
   }else if(c.action==="unknown")state="outcome_unknown";
   else if(c.action==="settle"){state="settled";if(kind==="collection")settled=28200;else refunded=25000;}
   await route.fulfill({json:{}});return;
  }
  await route.fulfill({json:{version:"simulation-fee-collection-view.v1",jobId,
   attempts:state?[{id:attemptId,statementId:corrected?allocation:id,kind,amountPence:kind==="collection"?28200:25000,state}]:[],
   settledPrincipal:settled,refundedPrincipal:refunded,retainedPrincipal:settled-refunded,outstandingPrincipal:settled?0:28200,refundDue:corrected?25000-refunded:0,
   collectionReserved:kind==="collection"&&state!=="settled"&&state?28200:0,refundReserved:kind==="refund"&&state!=="settled"?25000:0,unknownOutcome:state==="outcome_unknown"}});
 });
 await page.route("**/api/jobs/*/success-fees/statements",async route=>{
  jobId=new URL(route.request().url()).pathname.split("/")[3]!;
  if(route.request().method()==="POST"){
   const c=route.request().postDataJSON();writes.push(c);
   if(c.action==="approve"){await route.fulfill({status:409,json:{code:"SUCCESS_FEE_STALE"}});return;}
   corrected=true;await route.fulfill({json:{}});return;
  }
  await route.fulfill({json:{version:"simulation-fee-statement-view.v1",jobId,statements:[record(),...(corrected?[record(true)]:[])]}});
 });
 await page.route("**/api/jobs/*/success-fees/statements/*",async route=>{const r=record(route.request().url().endsWith(allocation));await route.fulfill({body:canonicalSimulationFeeStatementJson(r.document),headers:{"content-type":"application/json","content-disposition":`attachment; filename="${r.document.number}.v1.json"`,"x-content-sha256":r.documentHash}});});
 await openQuote(page);
 for(const input of await page.getByLabel(/Unit rate/u).all())if(await input.inputValue()==="")await input.fill("100.00");
 for(const action of ["Save draft revision","Preview immutable quote","Simulate sending this quote","Continue fake worker","Record practice acceptance"])await page.getByRole("button",{name:action,exact:true}).click();
 await page.getByLabel("Practice activation scenario").selectOption("simulated_base_obligation");await page.getByRole("button",{name:"Start this practice job",exact:true}).click();
 const panel=page.getByRole("region",{name:"Simulation fee statements"});
 await expect(panel.getByTestId("fee-statement-number")).toHaveText("DEMO-FEE-000001");await expect(panel.getByTestId("statement-success-fee-principal")).toHaveText("£282.00");
 await expect(panel.getByText(record().document.warning,{exact:true})).toBeVisible();await expect(panel.getByRole("link",{name:"£2,820.00",exact:true})).toBeVisible();expect(writes).toEqual([]);
 const originalHash=record().documentHash;
 const downloaded=page.waitForEvent("download");await panel.getByRole("link",{name:"Download DEMO-FEE-000001 (v1)"}).click();expect((await downloaded).suggestedFilename()).toBe("DEMO-FEE-000001.v1.json");expect(writes).toEqual([]);
 const money=panel.getByRole("region",{name:"Simulated fee collection"});
 await money.getByRole("button",{name:"Approve simulated collection of £282.00 principal",exact:true}).click();
 await expect(money.getByRole("status")).toHaveText("pending");
 await money.getByRole("button",{name:"Simulate redirect (no settlement)",exact:true}).click();
 await expect(money.getByTestId("fee-settled-principal")).toHaveText("£0.00");
 await money.getByRole("button",{name:"Simulate unknown outcome",exact:true}).click();
 await expect(money.getByRole("button",{name:"Approve simulated collection of £282.00 principal",exact:true})).toBeDisabled();
 await money.getByRole("button",{name:"Reconcile fake settled event",exact:true}).click();
 await expect(money.getByTestId("fee-settled-principal")).toHaveText("£282.00");
 await expect(money.getByTestId("fee-outstanding-principal")).toHaveText("£0.00");
 await panel.getByRole("button",{name:"Save current simulation statement or correction"}).click();
 await expect(panel.getByTestId("statement-document-principal").last()).toHaveText("−£250.00");await expect(panel.getByTestId("statement-success-fee-principal").last()).toHaveText("£32.00");
 await expect(panel.locator("article").first().getByText(originalHash,{exact:true})).toBeVisible();
 await expect(money.getByTestId("fee-refund-due")).toHaveText("£250.00");
 await money.getByRole("button",{name:"Approve simulated refund of £250.00 principal",exact:true}).click();
 await money.getByRole("button",{name:"Reconcile fake settled event",exact:true}).click();
 await expect(money.getByTestId("fee-refunded-principal")).toHaveText("£250.00");
 await expect(money.getByTestId("fee-retained-principal")).toHaveText("£32.00");
});
