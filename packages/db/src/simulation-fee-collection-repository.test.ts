import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { SimulationFeeCollectionRepository } from "./simulation-fee-collection-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
const job=randomUUID(),context=verifiedTenantContextForQueuedJob(randomUUID()),digest="a".repeat(64);
beforeEach(()=>vi.stubEnv("JOBGUARD_ENV","synthetic_demo"));
afterEach(()=>vi.unstubAllEnvs());
function setup(result:unknown,error?:unknown){
 const query=vi.fn(async(sql:string)=>{if(sql.includes("platform_fee_collection")&&error)throw error;return {rows:sql.includes("platform_fee_collection")?[{result}]:[]};});
 const release=vi.fn(),pool={connect:async()=>({query,release})} as unknown as Pool;
 return {repo:new SimulationFeeCollectionRepository(pool),query,release};
}
it("uses one transaction, verified tenant and practice digest, and returns an empty job-scoped read",async()=>{
 const view={version:"simulation-fee-collection-view.v1",jobId:job,attempts:[],settledPrincipal:0,refundedPrincipal:0,retainedPrincipal:0,outstandingPrincipal:0,refundDue:0,collectionReserved:0,refundReserved:0,unknownOutcome:false},x=setup(view);
 expect(await x.repo.view(context,job,digest)).toEqual(view);
 expect(x.query.mock.calls.map(c=>c[0])).toEqual(["BEGIN","SELECT set_config('app.practice_material_digest', $1, true)","SELECT set_config('app.tenant_id', $1, true)","SELECT app.read_platform_fee_collection($1,$2) result","COMMIT"]);
 expect(x.release).toHaveBeenCalledOnce();
});
it("strict command input refuses tenant/amount/provider authority before connecting",async()=>{
 const x=setup(null),c={version:"simulation-fee-collection-command.v1",commandId:randomUUID(),action:"collect",statementId:randomUUID(),statementHash:"a".repeat(64),amountPence:28200};
 for(const key of ["amountPence","tenantId","sourceHash","collected","provider"])
  await expect(x.repo.command(context,job,digest,{...c,[key]:true})).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 expect(x.query).not.toHaveBeenCalled();
});
it("rolls back a substituted attempt identity",async()=>{
 const c={version:"simulation-fee-collection-command.v1",commandId:randomUUID(),action:"settle",attemptId:randomUUID()};
 const x=setup({version:"simulation-fee-collection-result.v1",commandId:c.commandId,attemptId:randomUUID(),replayed:false});
 await expect(x.repo.command(context,job,digest,c)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 expect(x.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});
it("maps bounded SQL failures, and wrong-job reads roll back",async()=>{
 for(const [code,message,expected] of [["42501","private SQL","SUCCESS_FEE_FORBIDDEN"],["40001","SUCCESS_FEE_STALE","SUCCESS_FEE_STALE"],["0A000","SUCCESS_FEE_DEPENDENCY_BOUND","SUCCESS_FEE_DEPENDENCY_BOUND"]]){
  const x=setup(null,Object.assign(new Error(message),{code}));await expect(x.repo.view(context,job,digest)).rejects.toThrow(expected);
  expect(x.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
 }
 const x=setup({version:"simulation-fee-collection-view.v1",jobId:randomUUID(),attempts:[],settledPrincipal:0,refundedPrincipal:0,retainedPrincipal:0,outstandingPrincipal:0,refundDue:0,collectionReserved:0,refundReserved:0,unknownOutcome:false});
 await expect(x.repo.view(context,job,digest)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
});
