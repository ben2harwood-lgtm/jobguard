// Browser interaction with synthetic API responses; DB proof is a separate suite.
import { randomUUID } from "node:crypto";
import { expect,test } from "@playwright/test";
import { openQuote } from "./helpers/v1-sample-job";
test("payment screen keeps exact approvals, persists opt-in/revoke and pauses during dispute",async({page})=>{
 const paymentId=randomUUID(),statementId=randomUUID(),hash="a".repeat(64);
 let state:"awaiting_approval"|"approved"|"disputed"="awaiting_approval";
 let standingAuthority:Record<string,unknown>|null=null;
 const writes:Record<string,unknown>[]=[];
 await page.route("**/api/jobs/*/payment-fees",async route=>{
  const request=route.request(),jobId=new URL(request.url()).pathname.split("/")[3]!;
  const statement={version:"payment-fee-statement.v1",statementId,jobId,paymentId,revision:1,statementHash:hash,sourceHash:"b".repeat(64),
   qualifyingNet:{numerator:"80000",denominator:"1"},priorQualifyingNet:{numerator:"0",denominator:"1"},paymentReceivedPence:4128000,feePence:8000,priorFeePence:0,cumulativeFeePence:8000,
   policyVersion:"reference_fee_policy_v3",environment:"synthetic_demo",productionEnabled:false,realExternalActions:0};
  if(request.method()==="POST"){
   const body=request.postDataJSON();writes.push(body);
   if(body.version==="payment-fee-authority-command.v1"){
    expect(body.expectedAuthorityId).toBe(standingAuthority?.authorityId??null);
    expect(body.cap).toBe("per_verified_receipt_fee");
    standingAuthority={version:"payment-fee-authority.v1",authorityId:body.commandId,state:body.action==="opt_in"?"active":"revoked",cap:body.cap,policyVersion:body.policyVersion,expiresAt:"2026-11-09T00:00:00+00:00",productionEnabled:false,realExternalActions:0};
    await route.fulfill({json:standingAuthority});return;
   }
   if(body.action==="approve")state="approved";
   if(body.action==="dispute")state="disputed";
   await route.fulfill({json:statement});
  }else await route.fulfill({json:{version:"payment-fee-view.v1",jobId,receipts:[paymentId],statements:[{statement,state}],standingAuthority,productionEnabled:false,realExternalActions:0}});
 });
 await openQuote(page);
 for(const input of await page.getByLabel(/Unit rate/u).all())if(await input.inputValue()==="")await input.fill("100.00");
 for(const action of ["Save draft revision","Preview immutable quote","Simulate sending this quote","Continue fake worker","Record practice acceptance"])await page.getByRole("button",{name:action,exact:true}).click();
 await page.getByLabel("Practice activation scenario").selectOption("simulated_base_obligation");
 await page.getByRole("button",{name:"Start this practice job",exact:true}).click();
 const panel=page.getByRole("region",{name:"Receipt fee statements"});
 await expect(panel.getByTestId("payment-received")).toHaveText("£41,280.00");
 await expect(panel.getByTestId("payment-qualifying-net")).toHaveText("£800.00");
 await expect(panel.getByTestId("payment-fee")).toHaveText("£80.00");
 await expect(panel.getByTestId("payment-yours-before-tax")).toHaveText("£720.00");
 await expect(panel.getByText("VAT not calculated in this simulation",{exact:true})).toBeVisible();
 await expect(panel.getByTestId("standing-authority-state")).toHaveText("Standing authority: off");
 await panel.getByRole("button",{name:"Approve this exact fee statement"}).click();
 await expect(panel.getByRole("status")).toHaveText("Approved for simulation");
 expect(writes[0]).toEqual({version:"payment-fee-command.v1",commandId:expect.any(String),action:"approve",statementId,statementHash:hash});
 await panel.getByRole("button",{name:"Dispute and pause"}).click();
 await expect(panel.getByRole("status")).toHaveText("Paused during dispute");
 await expect(panel.getByRole("button",{name:"Approve this exact fee statement"})).toHaveCount(0);
 await expect(panel.getByText(/capped at the fee on that verified receipt, never a fixed sum/)).toBeVisible();
 await panel.getByRole("button",{name:"Opt in to standing authority for simulation",exact:true}).click();
 await expect(panel.getByTestId("standing-authority-state")).toHaveText("Standing authority: active");
 await page.reload();
 await expect(panel.getByTestId("standing-authority-state")).toHaveText("Standing authority: active");
 await panel.getByRole("button",{name:"Revoke standing authority",exact:true}).click();
 await expect(panel.getByTestId("standing-authority-state")).toHaveText("Standing authority: revoked");
 await page.reload();
 await expect(panel.getByTestId("standing-authority-state")).toHaveText("Standing authority: revoked");
 await expect(panel.getByTestId("payment-fee")).toHaveText("£80.00");
 await expect(panel.getByTestId("payment-received")).toHaveText("£41,280.00");
 expect(writes.filter(w=>w.version==="payment-fee-authority-command.v1").map(w=>w.action)).toEqual(["opt_in","revoke"]);
});
