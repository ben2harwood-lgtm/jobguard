import { expect, test, type Page } from "@playwright/test";
import { allocationPanel, approveRecoveryValueFee, post, readAllocations, readyAllocations, recovery18800Value, splitRecoveryValueReceipt } from "./helpers/recovery-allocation-journey";
// Real saved API data. Headless CI, mobile and desktop; no routes are mocked.
test.setTimeout(600_000);
const figures=async(page:Page,net:string,fee:string,yours:string)=>{
 await expect(page.getByTestId("withheld-recovered")).toHaveText(net);
 await expect(page.getByTestId("withheld-fee")).toHaveText(fee);
 await expect(page.getByTestId("withheld-yours-before-tax")).toHaveText(yours);
};
test("CH-9 saved recovery and compensation reproduce sources, windows and tenant refusals",async({page,browser,baseURL})=>{
 const x=await recovery18800Value(page),path=`/api/jobs/${x.jobId}/value/v3`;
 await page.goto(`/jobs/${x.jobId}/value`);
 await figures(page,"£2,820.00","£282.00","£2,538.00");
 const initial=await (await page.request.get(path)).json();
 expect(initial.receipt.version).toBe("mapped-value-receipt.v2");
 expect(initial.receipt.sources.withheld.balances.at(-1).allocationIds).toHaveLength(2);
 await page.reload();await figures(page,"£2,820.00","£282.00","£2,538.00");
 const saved=await readAllocations(page,x.jobId),second=x.cases[1]!;
 await post(page,`${x.receiptPath}/reversals`,{version:"practice-customer-receipt.reverse.v1",commandId:crypto.randomUUID(),invoiceId:x.invoiceId,paymentId:second.paymentId,reason:"Fictional CH-9 reversal"});
 await splitRecoveryValueReceipt(page,x.jobId,300000,true);
 await page.goto(`/jobs/${x.jobId}#recovery-allocations`);await readyAllocations(page);
 const allocation=saved.allocations.find(a=>a.caseId===second.caseId)!;
 await allocationPanel(page).locator(`[data-allocation-id="${allocation.id}"]`).getByRole("button",{name:"Review allocation reversal",exact:true}).click();
 await allocationPanel(page).getByRole("button",{name:"Approve exact allocation reversal",exact:true}).click();
 await expect(allocationPanel(page).getByTestId("eligible-net")).toHaveText("£320.00");
 await approveRecoveryValueFee(page,x.jobId,"£32.00");
 await page.goto(`/jobs/${x.jobId}/value`);await figures(page,"£320.00","£32.00","£288.00");
 await expect(page.getByTestId("withheld-movement").filter({hasText:"reversal"})).toHaveCount(1);
 const response=await page.request.get(path),all=await response.json();expect(response.ok()).toBe(true);
 const balances=all.receipt.sources.withheld.balances;
 expect(balances.at(-1).recovered.pence).toBe(all.receipt.withheld.recovered.pence);
 expect(balances.at(-1).fee.pence).toBe(all.receipt.withheld.fee.pence);
 const boundary=balances.at(-1).at;
 const windows=[{from:"2000-01-01T00:00:00Z",toExclusive:boundary},{from:boundary,toExclusive:"2100-01-01T00:00:00Z"}];
 const receipts=[];
 for(const window of windows){
  const query=new URLSearchParams(window).toString(),result=await page.request.get(`${path}?${query}`);
  expect(result.ok()).toBe(true);receipts.push((await result.json()).receipt);
 }
 for(const key of ["recovered","fee","yoursBeforeVatAndTax"])expect(receipts[0].withheld[key].pence+receipts[1].withheld[key].pence).toBe(all.receipt.withheld[key].pence);
 expect(receipts.flatMap(r=>r.withheld.movements).filter(m=>m.kind==="reversal")).toHaveLength(1);
 await page.goto(`/jobs/${x.jobId}/value?${new URLSearchParams(windows[1]).toString()}`);
 await figures(page,"−£2,500.00","−£250.00","−£2,250.00");
 await expect(page.getByTestId("withheld-movement")).toHaveCount(1);
 const foreign=await browser.newContext(baseURL?{baseURL}:{});
 try{
  expect((await foreign.request.post("/api/session")).ok()).toBe(true);
  const denied=await foreign.request.get(path);expect(denied.status()).toBe(404);
  expect(JSON.stringify(await denied.json())).not.toContain(x.jobId);
 }finally{await foreign.close();}
});
