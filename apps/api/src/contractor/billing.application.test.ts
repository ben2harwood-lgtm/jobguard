import {expect,it,vi} from "vitest";
import type {Pool} from "pg";
import {BillingApplication,billingHttpFailure} from "./billing.application.js";
it("E6-01 E6-04 forbidden mode refuses before resolving session or connecting",async()=>{vi.stubEnv("JOBGUARD_ENV","pilot_no_charge");const connect=vi.fn();const app=new BillingApplication({connect} as unknown as Pool);await expect(app.read(undefined,"bad")).rejects.toMatchObject({code:"MODE_FORBIDDEN"});expect(connect).not.toHaveBeenCalled();vi.unstubAllEnvs();});
it("E6-30 authority refusal has one stable status and body",()=>{expect(billingHttpFailure({code:"BILLING_FORBIDDEN"})).toEqual({status:403,body:{version:"contractor-billing-error.v1",code:"BILLING_FORBIDDEN"}});});
