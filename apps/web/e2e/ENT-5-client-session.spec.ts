import { expect, test } from "@playwright/test";
// Both configured widths exercise the actual server, with no fixture session or actor switch.
test("ENT-5 refuses anonymous and builder-only approval access",async({page})=>{
 const job="10000000-0000-4000-8000-000000000001";
 await page.goto(`/customer/extra-approvals?jobId=${job}`);
 await expect(page.getByRole("main").getByRole("alert")).toContainText("Access refused");
 await expect(page.getByRole("main").getByRole("button",{name:"Approve this exact revision and net"})).toHaveCount(0);
 const response=await page.request.post("/api/customer-portal/extra-approvals",{headers:{Origin:"http://127.0.0.1:3000"},data:{version:"extra-customer.v1",action:"queue",jobId:job}});
 expect(response.status()).toBe(401);expect(await response.json()).toEqual({code:"CUSTOMER_REFUSED"});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
