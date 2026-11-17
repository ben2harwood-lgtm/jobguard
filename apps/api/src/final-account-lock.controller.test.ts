import "reflect-metadata";
import { afterEach,expect,it,vi } from "vitest";
import { HttpException } from "@nestjs/common";
import type { Pool } from "pg";
import { FinalAccountLockError } from "@jobguard/core";
import { FinalAccountLockApplication } from "./final-account-lock.application.js";
import { FinalAccountLockController } from "./final-account-lock.controller.js";
const job="18000000-0000-4000-8000-000000000002",lockId="18000000-0000-4000-8000-000000000003";
afterEach(()=>vi.restoreAllMocks());
it("preserves typed lock conflict and existing lock identity as HTTP 409",async()=>{
 vi.spyOn(FinalAccountLockApplication.prototype,"lock").mockRejectedValue(new FinalAccountLockError("FINAL_ACCOUNT_ALREADY_LOCKED",lockId));
 const controller=new FinalAccountLockController({} as Pool);
 try{await controller.lock(job,{},"jg_session=synthetic");throw new Error("unexpected success");}catch(error){expect(error).toBeInstanceOf(HttpException);expect((error as HttpException).getStatus()).toBe(409);expect((error as HttpException).getResponse()).toEqual({code:"FINAL_ACCOUNT_ALREADY_LOCKED",existingLockId:lockId});}
});
it.each(["FINAL_ACCOUNT_LOCK_REQUIRED","FINAL_CHECK_NOT_COMPLETE","FINAL_CHECK_FAILED"] as const)("surfaces %s fail closed on the new invoice path",async code=>{
 const issue=vi.spyOn(FinalAccountLockApplication.prototype,"issueInvoice").mockRejectedValue(new FinalAccountLockError(code));
 const oldLock=vi.spyOn(FinalAccountLockApplication.prototype,"lock");
 try{await new FinalAccountLockController({} as Pool).lock(job,{version:"lock-bound-invoice.issue.v1"});throw new Error("unexpected success");}catch(error){expect((error as HttpException).getStatus()).toBe(400);expect((error as HttpException).getResponse()).toEqual({code});}
 expect(issue).toHaveBeenCalledOnce();expect(oldLock).not.toHaveBeenCalled();
});
it("all four lock commands and read use the shared application",async()=>{
 const methods=["get","disposition","acceptTerms","reviewExtra"] as const;
 const mocks=methods.map(method=>vi.spyOn(FinalAccountLockApplication.prototype,method).mockResolvedValue({synthetic:true} as never));
 const controller=new FinalAccountLockController({} as Pool);
 await controller.get(job);await controller.disposition(job,{});await controller.terms(job,{});await controller.extra(job,{});
 mocks.forEach(mock=>expect(mock).toHaveBeenCalledOnce());
});
