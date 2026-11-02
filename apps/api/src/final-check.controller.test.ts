import {afterEach,expect,it,vi} from "vitest";
import {Pool} from "pg";
import {FinalCheckController} from "./final-check.controller.js";
import {FinalCheckApplication} from "./final-check.application.js";
import {FinalCheckError} from "@jobguard/core";
afterEach(()=>vi.restoreAllMocks());
it("SV5-30 typed refusal preserves the same status/body without hidden detail",async()=>{
 vi.spyOn(FinalCheckApplication.prototype,"disposition").mockRejectedValue(new FinalCheckError("FINAL_CHECK_FORBIDDEN"));
 const controller=new FinalCheckController(new Pool());
 await expect(controller.disposition("unknown",{},undefined)).rejects.toMatchObject({status:403,response:{code:"FINAL_CHECK_FORBIDDEN"}});
});
it("SV5-29 controller exposes a fresh application read",async()=>{
 const spy=vi.spyOn(FinalCheckApplication.prototype,"get").mockResolvedValue({state:"completed",items:[],message:"JobGuard's final check found nothing missing from your bill."});
 expect((await new FinalCheckController(new Pool()).get("job")).state).toBe("completed");expect(spy).toHaveBeenCalledWith("job");
});
