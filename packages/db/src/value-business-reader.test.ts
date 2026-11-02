// Scripted adapter tests only; grants and real writers run in PostgreSQL CI.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { ValueBusinessReader } from "./value-business-reader.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
function fixture(){
 const tenantId=randomUUID(),periodId=randomUUID(),statementId=randomUUID(),sourceId=randomUUID(),context=verifiedTenantContextForQueuedJob(tenantId);
 const period={tenant_id:tenantId,id:periodId,period_start:"2026-10-01",period_end:"2026-11-01",source_id:sourceId,principal_pence:6900,artifact_hash:"a".repeat(64)};
 const statement={tenant_id:tenantId,id:statementId,period_id:periodId,amount_pence:6900,currency:"GBP",hypothetical:true,namespace:"subscription.synthetic.v1",artifact_hash:period.artifact_hash};
 const line={tenant_id:tenantId,period_id:periodId,line_key:"base",amount_pence:6900};
 const billing={version:"subscription-persisted-read.v1",hypothetical:true,environment:"synthetic_demo",agreements:[],changes:[],changeOutcomes:[],periods:[period],statements:[statement],reviews:[],work:[],attempts:[],results:[],corrections:[],alerts:[],onboarding:[],periodLines:[line],placeBindings:[],places:[],statementLines:[{...line,statement_id:statementId}],operationsCards:[]};
 const query=vi.fn(async(sql:string):Promise<{rows:Array<{result:unknown}>}>=>({rows:sql.startsWith("SELECT app.read_value_business")?[{result:{billing,jobs:[]}}]:[]}));
 const connect=vi.fn(async()=>({query,release:vi.fn()}));
 return {billing,context,periodId,statementId,sourceId,query,connect,reader:new ValueBusinessReader({connect} as unknown as Pool)};
}
it("maps a source-reproduced period statement and keeps its cost out of job receipts",async()=>{
 const f=fixture(),result=await f.reader.readBusiness(f.context,"a".repeat(64),f.periodId);
 expect(result.subscription[0]).toMatchObject({periodId:f.periodId,statementId:f.statementId,sourceId:f.sourceId,amount:{pence:6900,currency:"GBP"}});
 expect(result.jobs).toEqual([]);expect(result.summary).not.toHaveProperty("subscription");
 expect(f.query).toHaveBeenCalledWith("SELECT app.read_value_business($1) result",["a".repeat(64)]);
});
it("rejects foreign period, invented period, mismatched hash/cost, duplicate or missing statement lines",async()=>{
 for(const corrupt of [
  (f:ReturnType<typeof fixture>)=>{f.billing.periods[0]!.tenant_id=randomUUID();},
  (f:ReturnType<typeof fixture>)=>{f.billing.statements[0]!.amount_pence=1;},
  (f:ReturnType<typeof fixture>)=>{f.billing.statements[0]!.artifact_hash="b".repeat(64);},
  (f:ReturnType<typeof fixture>)=>{f.billing.statementLines=[];},
  (f:ReturnType<typeof fixture>)=>{f.billing.statementLines.push(f.billing.statementLines[0]!);},
  (f:ReturnType<typeof fixture>)=>{f.billing.periodLines[0]!.amount_pence=6800;},
 ]){const f=fixture();corrupt(f);await expect(f.reader.readBusiness(f.context,"a".repeat(64))).rejects.toThrow();}
 const f=fixture();await expect(f.reader.readBusiness(f.context,"a".repeat(64),randomUUID())).rejects.toThrow("VALUE_PERIOD_UNAVAILABLE");
});
it("a copied tenant context fails before acquiring a connection",async()=>{
 const f=fixture();await expect(f.reader.readBusiness({...f.context},"a".repeat(64))).rejects.toThrow("verified tenant context");expect(f.connect).not.toHaveBeenCalled();
});
it("the company job adapter binds the returned tenant/job and keeps pre-lock absence incomplete",async()=>{
 const f=fixture(),jobId=randomUUID();let raw:unknown=null;
 f.query.mockImplementation(async sql=>({rows:sql.startsWith("SELECT app.read_value_job")?[{result:raw}]:[]}));
 expect(await f.reader.readJob(f.context,"a".repeat(64),jobId)).toBeNull();
 raw={tenantId:f.context.tenantId,jobId,lockId:randomUUID(),lockedRevisionId:randomUUID(),lockedAt:"2026-10-01T00:00:00Z",foundComplete:true,checkId:randomUUID(),checkedAt:"2026-10-02T00:00:00Z",checked:[],tracked:[],assessments:[]};
 expect((await f.reader.readJob(f.context,"a".repeat(64),jobId))?.sources.jobId).toBe(jobId);
 raw={...(raw as Record<string,unknown>),jobId:randomUUID()};
 await expect(f.reader.readJob(f.context,"a".repeat(64),jobId)).rejects.toThrow("VALUE_SCOPE_MISMATCH");
});
