// Browser transport/render proof only. The independent DB suite gathers real persisted source rows.
import { randomUUID } from "node:crypto";
import { expect,test } from "@playwright/test";
import { openQuote } from "./helpers/v1-sample-job";
test("money review keeps the three books and unresolved source rows visible; restore stays paused",async({page})=>{
 const {reconcileSimulationMoney,simulationMoneyHash}=await import("@jobguard/core");
 await page.route("**/api/jobs/*/success-fees",route=>route.fulfill({json:{state:"catch_review_available"}}));
 await page.route("**/api/jobs/*/success-fees/statements",route=>route.fulfill({json:{version:"simulation-fee-statement-view.v1",jobId:new URL(route.request().url()).pathname.split("/")[3],statements:[]}}));
 const actions:string[]=[],tenantId=randomUUID();
 await page.route("**/api/jobs/*/success-fees/money-check",async route=>{
  const command=route.request().postDataJSON();actions.push(command.action);
  const snapshot:Record<string,unknown>={version:"simulation-money-snapshot.v1",tenantId,jobId:new URL(route.request().url()).pathname.split("/")[3],liveFee:null};
  for(const key of ["practice_feed_event","practice_feed_receipt_match","practice_feed_command","customer_invoice","customer_credit_note","customer_payment","customer_payment_reversal","receipt_allocation_fact_revision","receipt_allocation_fact_source","receipt_allocation_fact_line","stored_receipt_case_allocation","success_fee_derivation","success_fee_journal","success_fee_journal_line","platform_fee_statement","platform_fee_attempt","platform_fee_attempt_event","subscription_period","subscription_period_line","platform_statement","platform_statement_line","subscription_simulated_work","subscription_simulated_result"])snapshot[key]=[];
  await route.fulfill({json:{runId:command.runId??command.commandId,jobId:snapshot.jobId,sourceHash:simulationMoneyHash(snapshot),snapshot,paused:true,report:reconcileSimulationMoney(snapshot)}});
 });
 await openQuote(page);
 const panel=page.getByRole("region",{name:"Simulation money check"});await panel.getByRole("button",{name:"Run money check",exact:true}).click();
 await expect(panel.getByTestId("money-check-state")).toHaveText("Review needed");
 for(const label of ["Customer book","Success-fee book","Subscription book"])await expect(panel.getByRole("heading",{name:label,exact:true})).toBeVisible();
 await expect(panel.getByText(/CURRENT_ELIGIBILITY_UNAVAILABLE/)).toBeVisible();
 await panel.getByRole("button",{name:"Record review of these source rows"}).click();await expect(panel.getByTestId("money-check-state")).toHaveText("Review needed");
 await panel.getByRole("button",{name:"Verify checkpoint and restore paused run"}).click();await expect(panel.getByText(/Execution paused. External actions: 0/)).toBeVisible();
 expect(actions).toEqual(["run","review","restore"]);
});
