import {expect,it,vi} from "vitest";
import type {Pool} from "pg";
import {BillingController} from "./billing.controller.js";
it("E6-30 Nest write refuses an untrusted origin before resolving any session",()=>{
 const controller=new BillingController({} as Pool);
 expect(()=>controller.write("unknown","export",undefined,"https://foreign.invalid",{})).toThrow();
});
it("E6-30 Nest reads share the finance application and return its typed refusal",async()=>{
 vi.stubEnv("JOBGUARD_ENV","pilot_no_charge");const c=new BillingController({} as Pool);
 await expect(c.read("unknown")).rejects.toMatchObject({status:403,response:{version:"contractor-billing-error.v1",code:"MODE_FORBIDDEN"}});vi.unstubAllEnvs();
});
