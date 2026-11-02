import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({job:vi.fn(),read:vi.fn(),command:vi.fn()}));
vi.mock("./practice-access.js",()=>({PracticeAccess:class{job=mocks.job;}}));
vi.mock("@jobguard/db",async original=>({...await original<typeof import("@jobguard/db")>(),PaymentFeeRepository:class{read=mocks.read;command=mocks.command;}}));
import { PaymentFeeApplication,paymentFeeFailure } from "./payment-fee.application.js";
import { PaymentFeeStatementError } from "@jobguard/core";
const environment=process.env.JOBGUARD_ENV,id=randomUUID();
beforeEach(()=>{vi.clearAllMocks();process.env.JOBGUARD_ENV="synthetic_demo";mocks.job.mockResolvedValue({context:{tenantId:randomUUID()},digest:"a".repeat(64)});mocks.read.mockResolvedValue({statements:[]});});
afterEach(()=>{if(environment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=environment;});
it("reauthenticates read, writes and attempted replays, carrying the unchanged stamped context/session",async()=>{
 const app=new PaymentFeeApplication({} as Pool),p={version:"payment-fee-command.v1",action:"prepare",commandId:randomUUID(),paymentId:randomUUID()};
 await app.get(id);await app.command(id,p);await app.command(id,p);
 expect(mocks.job).toHaveBeenCalledTimes(3);
 const auth=await mocks.job.mock.results[0]!.value;
 expect(mocks.command).toHaveBeenCalledWith(auth.context,id,auth.digest,p);
});
it("forbids production, forged money and unexpected read switches without writing",async()=>{
 const app=new PaymentFeeApplication({} as Pool);
 await expect(app.command(id,{version:"payment-fee-command.v1",action:"prepare",commandId:randomUUID(),paymentId:randomUUID(),feePence:8000})).rejects.toThrow("INVALID_PAYMENT_FEE_COMMAND");
 await expect(app.get(id,{tenantId:randomUUID()})).rejects.toThrow("INVALID_PAYMENT_FEE_COMMAND");
 process.env.JOBGUARD_ENV="production";await expect(app.get(id)).rejects.toThrow();
 expect(mocks.command).not.toHaveBeenCalled();expect(mocks.read).not.toHaveBeenCalled();
});
it("maps pauses and stale bindings to explicit conflicts without converting unknown failures into success",()=>{
 for(const code of ["PAYMENT_FEE_PAUSED","PAYMENT_FEE_APPROVAL_CHANGED","PAYMENT_FEE_SOURCE_CHANGED","PAYMENT_FEE_SOURCE_REQUIRED","PAYMENT_FEE_ATTRIBUTION_REQUIRED","PAYMENT_FEE_REASSESSMENT_REQUIRED","PAYMENT_FEE_IDEMPOTENCY_CONFLICT"])
  expect(paymentFeeFailure(new Error(code))).toEqual({status:409,body:{code}});
 expect(paymentFeeFailure(new PaymentFeeStatementError())).toEqual({status:400,body:{code:"INVALID_PAYMENT_FEE_COMMAND"}});
 expect(paymentFeeFailure(new Error("FINAL_CHECK_FORBIDDEN"))).toEqual({status:404,body:{code:"NOT_FOUND"}});
 expect(paymentFeeFailure(new Error("unknown"))).toBeNull();
});
