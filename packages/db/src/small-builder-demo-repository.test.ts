import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { SmallBuilderDemoRepository } from "./small-builder-demo-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
const id="d1500000-0000-4000-8000-000000000001",digest="a".repeat(64);
const command={contractVersion:"small-builder-demo.create.v1",commandId:id,scenario:"core-1000"};
const run={version:"small-builder-demo-run.v1",environment:"synthetic_demo",runId:id,scenario:"core-1000",revision:1,status:"blocked",reason:"Journey bindings unavailable.",createdAt:"2026-10-28T00:00:00Z",archivedAt:null,predecessorId:null,successorId:null};
function fixture(result:unknown=run,error?:Error){
 const query=vi.fn(async(sql:string)=>{if(sql.startsWith("SELECT app.small_builder_demo")){if(error)throw error;return {rows:[{result}]};}return {rows:[]};});
 const release=vi.fn(),connect=vi.fn(async()=>({query,release}));
 return {query,connect,release,repo:new SmallBuilderDemoRepository({connect} as unknown as Pool),context:verifiedTenantContextForQueuedJob(id)};
}
describe("DEMO-I repository boundary (no PostgreSQL proof)",()=>{
 it("uses transaction-local verified context and parameterized commands",async()=>{
  const f=fixture();expect(await f.repo.execute(f.context,digest,"create",null,command)).toEqual(run);
  expect(f.query.mock.calls.map(x=>x[0])).toEqual(["BEGIN","SELECT set_config('app.tenant_id', $1, true)","SELECT app.small_builder_demo($1,$2,$3,$4,$5::jsonb) result","COMMIT"]);
  expect(f.query).toHaveBeenNthCalledWith(3,expect.any(String),[id,digest,"create",null,JSON.stringify(command)]);expect(f.release).toHaveBeenCalledOnce();
 });
 it.each(["tenantId","sessionId","facts","completed","amountPence","hidden","releaseTrialKey"])("rejects submitted %s before connecting",async key=>{
  const f=fixture();await expect(f.repo.execute(f.context,digest,"create",null,{...command,[key]:true})).rejects.toThrow("INVALID_DEMO_INPUT");expect(f.connect).not.toHaveBeenCalled();
 });
 it("rejects foreign-shaped locators, digest and snapshot flags",async()=>{
  const f=fixture();
  await expect(f.repo.execute(f.context,"invalid","create",null,command)).rejects.toThrow("INVALID_DEMO_INPUT");
  await expect(f.repo.execute(f.context,digest,"read","invalid",{})).rejects.toThrow("INVALID_DEMO_INPUT");
  await expect(f.repo.execute(f.context,digest,"read",id,{createSnapshot:true})).rejects.toThrow("INVALID_DEMO_INPUT");expect(f.connect).not.toHaveBeenCalled();
 });
 it.each(["METER_FORBIDDEN","DEMO_NOT_FOUND","DEMO_STALE_REVISION","DEMO_COMMAND_CONFLICT","DEMO_ARCHIVED","DEMO_SYNTHETIC_ONLY"])("rolls back %s and releases connection",async code=>{
  const f=fixture(undefined,new Error(code));await expect(f.repo.execute(f.context,digest,"create",null,command)).rejects.toThrow(code==="METER_FORBIDDEN"?"DEMO_FORBIDDEN":code);
  expect(f.query).toHaveBeenLastCalledWith("ROLLBACK");expect(f.release).toHaveBeenCalledOnce();
 });
 it("fails closed on invented completion fields and redacts database details",async()=>{
  const f=fixture({...run,status:"completed",pence:100});await expect(f.repo.execute(f.context,digest,"create",null,command)).rejects.toThrow("DEMO_UNAVAILABLE");
  const g=fixture(undefined,new Error("foreign company secret"));await expect(g.repo.execute(g.context,digest,"read",id,{})).rejects.toThrow("DEMO_UNAVAILABLE");
 });
 it("reads only an exact requested stored snapshot without accepting report facts",async()=>{
  const report={version:"small-builder-demo-report.v1",snapshotId:id,facts:run};const f=fixture(report);
  expect(await f.repo.execute(f.context,digest,"report",id,{snapshotId:id})).toEqual(report);
  await expect(f.repo.execute(f.context,digest,"report",id,{snapshotId:id,facts:run})).rejects.toThrow("INVALID_DEMO_INPUT");
 });
});
