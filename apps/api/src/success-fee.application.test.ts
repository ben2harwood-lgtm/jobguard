import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { PracticeAccessError } from "@jobguard/db";
import { SuccessFeeError } from "@jobguard/core";
import { SuccessFeeApplication,successFeeFailure } from "./success-fee.application.js";
const {job,view,command,statements,issueStatement,downloadStatement,collection,collect,reconcileMoney}=vi.hoisted(()=>({job:vi.fn(),view:vi.fn(),command:vi.fn(),statements:vi.fn(),issueStatement:vi.fn(),downloadStatement:vi.fn(),collection:vi.fn(),collect:vi.fn(),reconcileMoney:vi.fn()}));
vi.mock("./practice-access.js",()=>({PracticeAccess:class{job=job;}}));
vi.mock("@jobguard/db",async original=>({...await original<Record<string,unknown>>(),SimulationMoneyRunRepository:class{command=reconcileMoney;},SuccessFeeRepository:class{view=view;command=command;},SimulationFeeCollectionRepository:class{view=collection;command=collect;},SimulationFeeStatementRepository:class{view=statements;command=issueStatement;download=downloadStatement;}}));
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

it("statement commands authorize before deferred JSON and pass only verified job context",async()=>{
 const c={version:"simulation-fee-statement-command.v1",action:"issue",commandId:randomUUID()};
 const body=vi.fn().mockResolvedValue(c);
 await app().issueStatement(id,body);expect(issueStatement).toHaveBeenCalledWith(context,id,digest,c);
 await app().statements(id);expect(statements).toHaveBeenCalledWith(context,id,digest);
 const sid=randomUUID();await app().downloadStatement(id,sid);expect(downloadStatement).toHaveBeenCalledWith(context,id,digest,sid);
 vi.clearAllMocks();job.mockRejectedValue(new PracticeAccessError("NOT_FOUND"));
 await expect(app().issueStatement(id,body)).rejects.toThrow("NOT_FOUND");expect(body).not.toHaveBeenCalled();expect(issueStatement).not.toHaveBeenCalled();
});
it("statement reads, downloads and mutations reject production, tenant selection and unknown query keys",async()=>{
 for(const mode of ["production","pilot_no_charge"]){
  vi.stubEnv("JOBGUARD_ENV",mode);
  await expect(app().statements(id)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
  await expect(app().issueStatement(id,{})).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
  await expect(app().downloadStatement(id,randomUUID())).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
 }
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 await expect(app().statements(id,{tenantId:randomUUID()})).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 const body=vi.fn();await expect(app().issueStatement(id,body,{},true)).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");expect(body).not.toHaveBeenCalled();
 await expect(app().downloadStatement(id,randomUUID(),{},true)).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 expect(statements).not.toHaveBeenCalled();expect(issueStatement).not.toHaveBeenCalled();expect(downloadStatement).not.toHaveBeenCalled();
});

it("collection authorizes before deferred input and replay, passes the verified context, and refuses production/tenant claims",async()=>{
 const c={version:"simulation-fee-collection-command.v1",commandId:randomUUID(),action:"collect",statementId:randomUUID(),statementHash:"a".repeat(64),amountPence:28200};
 const body=vi.fn().mockResolvedValue(c);
 await app().collect(id,body);expect(collect).toHaveBeenCalledWith(context,id,digest,c);
 await app().collection(id);expect(collection).toHaveBeenCalledWith(context,id,digest);
 vi.clearAllMocks();
 await expect(app().collect(id,body,{},true)).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 await expect(app().collection(id,{tenantId:"foreign"})).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 expect(body).not.toHaveBeenCalled();expect(collect).not.toHaveBeenCalled();expect(collection).not.toHaveBeenCalled();
 job.mockRejectedValue(new PracticeAccessError("NOT_FOUND"));
 await expect(app().collect(id,body)).rejects.toThrow("NOT_FOUND");expect(body).not.toHaveBeenCalled();
 vi.stubEnv("JOBGUARD_ENV","production");
 await expect(app().collect(id,body)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
 await expect(app().collection(id)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
});

it("money checks authenticate before body access and use the current tenant, job and digest",async()=>{
 const body=vi.fn().mockResolvedValue({version:"simulation-money-command.v1",commandId:randomUUID(),action:"run"});
 job.mockRejectedValueOnce(new PracticeAccessError("UNAUTHENTICATED"));await expect(app().reconcileMoney(id,body)).rejects.toThrow("UNAUTHENTICATED");expect(body).not.toHaveBeenCalled();
 await expect(app().reconcileMoney(id,body,{},true)).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");expect(body).not.toHaveBeenCalled();
 await app().reconcileMoney(id,body);expect(reconcileMoney).toHaveBeenCalledWith(context,id,digest,await body());
});
