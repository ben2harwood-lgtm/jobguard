import type { Pool } from "pg";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { SuccessFeeRepository } from "./success-fee-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
const tenant="10000000-0000-4000-8000-000000000001",job="10000000-0000-4000-8000-000000000002",digest="a".repeat(64);
const status={version:"success-fee-availability.v1",jobId:job,environment:"synthetic_demo",state:"dependency_bound",dependency:"accepted_attribution_source_adapter",productionEnabled:false,realExternalActions:0};
const intent={version:"success-fee-command.v1",action:"review",commandId:job,expectedPostingRevision:0};
// Genuine existing constructor for this scripted transaction test only; no actor proof.
const context=verifiedTenantContextForQueuedJob(tenant);
function scripted(failure?:Error,result:unknown=status){
 const query=vi.fn(async(sql:string)=>{
  if(sql.includes('write_success_fee_v3')&&failure)throw failure;
  return {rows:sql.includes('read_success_fee_v3')?[{result}]:[]};
 });
 const release=vi.fn(),pool={connect:async()=>({query,release})} as unknown as Pool;
 return {query,release,repo:new SuccessFeeRepository(pool)};
}
beforeEach(()=>vi.stubEnv("JOBGUARD_ENV","synthetic_demo"));afterEach(()=>vi.unstubAllEnvs());
it("passes through the transaction boundary and authenticates the material pool before routine access",async()=>{
 const {repo,query,release}=scripted();expect(await repo.view(context,job,digest)).toEqual(status);
 expect(query.mock.calls.map(c=>c[0])).toEqual(['BEGIN',"SELECT set_config('app.practice_material_digest', $1, true)","SELECT set_config('app.tenant_id', $1, true)","SELECT app.read_success_fee_v3($1,$2) result",'COMMIT']);
 expect(release).toHaveBeenCalledTimes(1);
});
it("refusal rolls back and maps only the exact bounded database failure",async()=>{
 for(const [message,code,expected] of [['SUCCESS_FEE_DEPENDENCY_BOUND','0A000','SUCCESS_FEE_DEPENDENCY_BOUND'],['private SQL','42501','SUCCESS_FEE_FORBIDDEN']] as const){
  const {repo,query}=scripted(Object.assign(new Error(message),{code}));await expect(repo.command(context,job,digest,intent)).rejects.toThrow(expected);expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');expect(query.mock.calls.some(c=>c[0]==='COMMIT')).toBe(false);
 }
 const privateError=Object.assign(new Error('private SQL'),{code:'0A000'}),{repo}=scripted(privateError);await expect(repo.command(context,job,digest,intent)).rejects.toBe(privateError);
});
it("unexpected writer return is refused inside the transaction",async()=>{
 const {repo,query}=scripted();await expect(repo.command(context,job,digest,intent)).rejects.toThrow('SUCCESS_FEE_DEPENDENCY_BOUND');expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
});
it("rejects a foreign or malformed projection and client authority",async()=>{
 for(const result of [{...status,jobId:tenant},{...status,productionEnabled:true},{...status,hiddenCount:1}]){
  const {repo,query}=scripted(undefined,result);await expect(repo.view(context,job,digest)).rejects.toThrow();expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
 }
 const {repo,query}=scripted();await expect(repo.command(context,job,digest,{...intent,Q:'1'})).rejects.toThrow('INVALID_SUCCESS_FEE_COMMAND');expect(query).not.toHaveBeenCalled();
});
