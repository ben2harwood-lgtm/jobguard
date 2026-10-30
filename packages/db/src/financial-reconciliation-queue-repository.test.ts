import type { Pool } from "pg";
import { beforeEach, expect, it } from "vitest";
import { reconcileFinancialSnapshot } from "@jobguard/core";
import { FinancialReconciliationQueueRepository } from "./financial-reconciliation-queue-repository.js";
import { verifiedTenantContextForQueuedJob as testTenantContext } from "./tenant-context.js";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={tenantId:id(1),jobId:id(2)};
const snapshot={...scope,version:'financial-reconciliation-snapshot.v1',environment:'synthetic_demo',corrections:[],
 invoices:[{...scope,id:id(3),revision:id(4),net:100,vat:20,gross:120}],
 provider:[{...scope,id:id(5),effectId:id(6),invoiceId:id(3),kind:'payment',amount:120,parentId:null,late:true}],journals:[]};
const command={version:'financial-reconciliation-store.v1',commandId:id(7),trigger:'on_demand',day:'2026-10-30',snapshot};
function harness(){
 const calls:{sql:string;params:unknown[]|undefined}[]=[];
 let stored:unknown={id:id(7),snapshot,report:reconcileFinancialSnapshot(snapshot)};
 const client={query:async(sql:string,params?:unknown[])=>{calls.push({sql,params});return {rows:sql.includes('financial_reconciliation_queue')?[{result:stored}]:[]};},release:()=>{}};
 const pool={connect:async()=>client} as unknown as Pool;
 return {repo:new FinancialReconciliationQueueRepository(pool),calls,set:(value:unknown)=>{stored=value;}};
}
beforeEach(()=>{process.env.JOBGUARD_ENV='synthetic_demo';});
it('computes its report, binds SQL parameters and preserves input',async()=>{
 const h=harness(),before=structuredClone(command),result=await h.repo.run(testTenantContext(scope.tenantId),id(8),command);
 expect(command).toEqual(before);expect(result.report).toEqual(reconcileFinancialSnapshot(snapshot));
 expect(h.calls.map(c=>c.sql)).toEqual(['BEGIN',"SELECT set_config('app.tenant_id', $1, true)",'SELECT app.financial_reconciliation_queue($1,$2,$3::jsonb) result','COMMIT']);
 const params=h.calls[2]!.params!;expect(params.slice(0,2)).toEqual([id(8),scope.jobId]);
 expect(JSON.parse(params[2] as string)).toMatchObject({action:'run',report:result.report});
});
it('refuses production, tenant substitution, unsafe money and authority fields before SQL',async()=>{
 for(const invalid of [{...command,approved:true},{...command,snapshot:{...snapshot,environment:'production'}},{...command,snapshot:{...snapshot,tenantId:id(9)}},{...command,snapshot:{...snapshot,provider:[{...snapshot.provider[0],amount:0.1}]}}]){
  const h=harness();await expect(h.repo.run(testTenantContext(scope.tenantId),id(8),invalid)).rejects.toThrow();expect(h.calls).toEqual([]);
 }
 const h=harness();process.env.JOBGUARD_ENV='production';await expect(h.repo.run(testTenantContext(scope.tenantId),id(8),command)).rejects.toThrow('RECONCILIATION_DISABLED');expect(h.calls).toEqual([]);
});
it('rebuilds a stored run and refuses changed balances or changed source rows',async()=>{
 const h=harness(),ctx=testTenantContext(scope.tenantId);
 expect((await h.repo.read(ctx,id(8),scope.jobId,id(7)))?.report).toEqual(reconcileFinancialSnapshot(snapshot));
 h.set({id:id(7),snapshot,report:{...reconcileFinancialSnapshot(snapshot),balances:{}}});
 await expect(h.repo.read(ctx,id(8),scope.jobId,id(7))).rejects.toThrow('RECONCILIATION_CONFLICT');
 h.set({id:id(7),snapshot:{...snapshot,journals:[{...scope,id:id(20),invoiceId:id(3),kind:'payment',amount:120,sourceId:id(5)}]},report:reconcileFinancialSnapshot(snapshot)});
 await expect(h.repo.read(ctx,id(8),scope.jobId,id(7))).rejects.toThrow('RECONCILIATION_CONFLICT');
 h.set(null);expect(await h.repo.read(ctx,id(8),scope.jobId,id(7))).toBeNull();
});
it('proposals bind a persisted run; stale invoice revisions and new discrepancies never reach the writer',async()=>{
 const h=harness(),ctx=testTenantContext(scope.tenantId),adjustment={version:'financial-reconciliation-adjustment.v1',...scope,commandId:id(10),invoiceRevision:id(4),reportHash:reconcileFinancialSnapshot(snapshot).sourceHash,fact:{...scope,id:id(11),invoiceId:id(3),kind:'payment',amount:120,sourceId:id(5)}};
 const input={version:'financial-reconciliation-propose.v1',runId:id(7),adjustment};
 for(const bad of [{...adjustment,invoiceRevision:id(9)},{...adjustment,fact:{...adjustment.fact,amount:121}},{...adjustment,reportHash:'0'.repeat(64)}]){
  await expect(h.repo.propose(ctx,id(8),{...input,adjustment:bad})).rejects.toThrow('RECONCILIATION_CONFLICT');
 }
 expect(h.calls.filter(c=>c.sql.includes('financial_reconciliation_queue')).every(c=>JSON.parse(c.params![2] as string).action==='read')).toBe(true);
});

it('refuses a stored result for another tenant, job or run identity',async()=>{
 const h=harness(),ctx=testTenantContext(scope.tenantId);
 for(const changed of [{...scope,tenantId:id(99)},{...scope,jobId:id(99)}]){
  const foreign={...snapshot,...changed,invoices:[],provider:[]};
  h.set({id:id(7),snapshot:foreign,report:reconcileFinancialSnapshot(foreign)});
  await expect(h.repo.read(ctx,id(8),scope.jobId,id(7))).rejects.toThrow('RECONCILIATION_FORBIDDEN');
 }
 h.set({id:id(99),snapshot,report:reconcileFinancialSnapshot(snapshot)});
 await expect(h.repo.read(ctx,id(8),scope.jobId,id(7))).rejects.toThrow('RECONCILIATION_CONFLICT');
});
