import { test, expect } from "@playwright/test";
import { mapValueReceipt } from "../../../packages/core/src/value-source-receipt";
const id=(n:number)=>`40000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
// Transport fixture for browser rendering only; PostgreSQL source truth is tested
// independently in value-source.integration.test.ts. No provider or live money.
test("mapped receipt sources and separate billing periods render and clear on an unavailable refresh",async({page,context})=>{
 const receipt=mapValueReceipt({tenantId:id(1),jobId:id(2),lockId:id(3),lockedRevisionId:id(4),lockedAt:"2026-10-01T00:00:00Z",foundComplete:true,checkId:id(5),checkedAt:"2026-10-02T00:00:00Z",checked:[id(6)],tracked:[{id:id(7),sourceId:id(8),revisionId:id(4),netPence:360000,invoiceId:id(9),checkId:id(13),at:"2026-10-03T00:00:00Z"}],assessments:[]});
 let available=true;
 await page.route("**/api/value",route=>route.fulfill({status:available?200:503,contentType:"application/json",body:JSON.stringify(available?{version:"business-value-result.v1",state:"mapped",tenantId:id(1),label:"mapped, inspectable",environment:"synthetic_demo",jobs:[{version:"job-value.v3",environment:"synthetic_demo",jobId:id(2),status:"mapped",receipt}],subscription:[{periodId:id(10),from:"2026-10-01",toExclusive:"2026-11-01",sourceId:id(11),statementId:id(12),policyVersion:"subscription_pricing_policy_v4",derivationVersion:"MON-1/MON-2A",amount:{pence:6900,currency:"GBP"},lines:[]}]}:{version:"business-value-result.v1",state:"unavailable",code:"BUSINESS_VALUE_UNAVAILABLE"})}));
 await page.goto("/value");await expect(page.getByTestId("business-value-status")).toHaveText("mapped, inspectable");
 await expect(page.getByText("£3,600.00 net · Fee £0.00")).toBeVisible();await expect(page.getByText(/£69.00 · Hypothetical/)).toBeVisible();
 await page.getByText("Inspect receipt sources",{exact:true}).click();await expect(page.locator("pre").filter({hasText:id(3)})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await context.addCookies([{name:"jobguard_session",value:"synthetic-browser-transport-fixture",url:new URL(page.url()).origin}]);
 await page.route(`**/api/jobs/${id(2)}/value/v3`,route=>route.fulfill({contentType:"application/json",body:JSON.stringify({version:"job-value.v3",environment:"synthetic_demo",jobId:id(2),status:"mapped",receipt})}));
 await page.getByRole("link",{name:`Job ${id(2)}`,exact:true}).click();
 await expect(page.getByTestId("tracked-captured-net")).toHaveText("£3,600.00");
 await page.getByRole("link",{name:"Back to business value",exact:true}).click();
 await expect(page.getByTestId("business-value-status")).toHaveText("mapped, inspectable");
 available=false;await page.getByRole("button",{name:"Refresh availability"}).click();
 await expect(page.getByTestId("business-value-status")).toContainText("Value is unavailable");await expect(page.getByText("£3,600.00 net · Fee £0.00")).toHaveCount(0);
});

// v2 remains a rendering test here; CH-9-recovery.spec.ts uses the saved API.
test("v2 business sections show mapped sources and keep the subscription per period",async({page})=>{
 const {mapValueReceiptV2,mapCurrentBusinessValueSummary}=await import("../../../packages/core/src/value-source-receipt-v2.js");
 const money=(pence:number)=>({pence,currency:"GBP" as const});
 const receipt=mapValueReceiptV2({base:{tenantId:id(1),jobId:id(2),lockId:id(3),lockedRevisionId:id(4),lockedAt:"2026-10-01T00:00:00Z",foundComplete:true,checkId:id(5),checkedAt:"2026-10-02T00:00:00Z",checked:[],tracked:[],assessments:[]},supplier:{reason:"No approved supplier derivation",balances:[]},withheld:{reason:null,balances:[{tenantId:id(1),jobId:id(2),derivationId:id(6),revision:1,at:"2026-10-03T00:00:00Z",recovered:money(282000),fee:money(28200),allocationIds:[id(7)],statementHash:"a".repeat(64)}]}});
 await page.route("**/api/value",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({state:"mapped",summary:mapCurrentBusinessValueSummary([receipt]),jobs:[{jobId:id(2),status:"mapped",receipt}],subscription:[{periodId:id(8),from:"2026-10-01",toExclusive:"2026-11-01",policyVersion:"subscription_pricing_policy_v4",amount:money(6900)}]})}));
 await page.goto("/value");
 await expect(page.getByTestId("business-withheld-recovered")).toHaveText("£2,820.00");
 await expect(page.getByTestId("business-withheld-fee")).toHaveText("£282.00");
 await expect(page.getByTestId("business-withheld-yours-before-tax")).toHaveText("£2,538.00");
 await expect(page.getByTestId("business-supplier-recovered")).toHaveText("Unavailable");
 await expect(page.getByText(/£69.00 · Hypothetical/u)).toBeVisible();
});
