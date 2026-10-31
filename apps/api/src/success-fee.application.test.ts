import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { PracticeAccessError } from "@jobguard/db";
import { SuccessFeeError } from "@jobguard/core";
import { SuccessFeeApplication,successFeeFailure } from "./success-fee.application.js";
const {job,view,command}=vi.hoisted(()=>({job:vi.fn(),view:vi.fn(),command:vi.fn()}));
vi.mock("./practice-access.js",()=>({PracticeAccess:class{job=job;}}));
vi.mock("@jobguard/db",async original=>({...await original<Record<string,unknown>>(),SuccessFeeRepository:class{view=view;command=command;}}));
const id=randomUUID(),context=Object.freeze({tenantId:randomUUID()}),digest="a".repeat(64);
const intent={version:"success-fee-command.v1",action:"review",commandId:randomUUID(),expectedPostingRevision:0};
const app=()=>new SuccessFeeApplication({} as Pool);
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","synthetic_demo");job.mockResolvedValue({context,digest});command.mockRejectedValue(new SuccessFeeError("SUCCESS_FEE_DEPENDENCY_BOUND"));view.mockResolvedValue({state:"dependency_bound"});});
afterEach(()=>vi.unstubAllEnvs());
it.each(["","pilot_no_charge","provider_sandbox","production_billing","production"])("refuses %s before authentication or body/source access",async mode=>{
 vi.stubEnv("JOBGUARD_ENV",mode);const body=vi.fn();
 await expect(app().view(id)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");await expect(app().command(id,body)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
 expect(job).not.toHaveBeenCalled();expect(body).not.toHaveBeenCalled();expect(view).not.toHaveBeenCalled();expect(command).not.toHaveBeenCalled();
});
it.each(["UNAUTHENTICATED","NOT_FOUND"] as const)("authorizes before deferred JSON or repeated intent: %s",async code=>{
 job.mockRejectedValue(new PracticeAccessError(code));const body=vi.fn();
 await expect(app().view(id)).rejects.toThrow(code);
 for(let n=0;n<2;n++)await expect(app().command(id,body)).rejects.toThrow(code);
 expect(body).not.toHaveBeenCalled();expect(view).not.toHaveBeenCalled();expect(command).not.toHaveBeenCalled();
});
it("rejects queries, tenant headers and client authority before the repository",async()=>{
 const body=vi.fn().mockResolvedValue(intent);
 await expect(app().command(id,body,{},true)).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");expect(body).not.toHaveBeenCalled();
 await expect(app().view(id,{},true)).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 await expect(app().view(id,{tenantId:randomUUID()})).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 await expect(app().command(id,intent,{source:"hidden"})).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 for(const field of ["tenantId","actorMembershipId","mode","Q","J","rate","qualifies","settlement","facts","approval"])
  await expect(app().command(id,{...intent,[field]:true})).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 expect(command).not.toHaveBeenCalled();expect(view).not.toHaveBeenCalled();
});
it("passes the same context whole and defers JSON until after authorization",async()=>{
 const body=vi.fn().mockImplementation(async()=>{expect(job).toHaveBeenCalledWith(id);return intent;});
 await expect(app().command(id,body)).rejects.toThrow("SUCCESS_FEE_DEPENDENCY_BOUND");
 expect(command).toHaveBeenCalledWith(context,id,digest,intent);expect(command.mock.calls[0]?.[0]).toBe(context);
 await app().view(id);expect(view).toHaveBeenCalledWith(context,id,digest);
});
it("maps malformed JSON after access to a typed error",async()=>{
 await expect(app().command(id,async()=>{throw new SyntaxError("private bytes");})).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");expect(command).not.toHaveBeenCalled();
});
it("bounds public errors without swallowing unknown failures",()=>{
 for(const [code,status] of [["INVALID_SUCCESS_FEE_COMMAND",400],["SUCCESS_FEE_DEPENDENCY_BOUND",503],["SUCCESS_FEE_FORBIDDEN",403]] as const)expect(successFeeFailure(new SuccessFeeError(code))).toEqual({status,body:{code}});
 expect(successFeeFailure(new Error("private SQL"))).toBeNull();
});

it.each(["SUCCESS_FEE_STALE","SUCCESS_FEE_SOURCE_CHANGED","SUCCESS_FEE_REVIEW_REQUIRED","SUCCESS_FEE_IDEMPOTENCY_CONFLICT"] as const)("returns bounded 409 for %s",code=>{
 expect(successFeeFailure(new SuccessFeeError(code))).toEqual({status:409,body:{code}});
});
