import type { Pool } from "pg";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { MoneyTrailRepository } from "./money-trail-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
const tenant="10000000-0000-4000-8000-000000000001",job="10000000-0000-4000-8000-000000000002",digest="a".repeat(64);
const status={version:"money-trail-availability.v1",jobId:job,environment:"synthetic_demo",state:"dependency_bound",dependency:"accepted_money_trail_source_and_run_authority",productionEnabled:false,realExternalActions:0};
const context=verifiedTenantContextForQueuedJob(tenant); // Existing genuine stamped test context; SQL still authenticates.
function scripted(result:unknown=status,error?:Error){
 const query=vi.fn(async(sql:string,_values?:unknown[])=>{if(sql.includes('read_money_trail')){if(error)throw error;return {rows:[{result}]};}return {rows:[]};});
 const release=vi.fn(),pool={connect:vi.fn(async()=>({query,release}))} as unknown as Pool;
 return {query,release,pool,repo:new MoneyTrailRepository(pool)};
}
beforeEach(()=>vi.stubEnv("JOBGUARD_ENV","synthetic_demo"));afterEach(()=>vi.unstubAllEnvs());
it("[MT-09/14] availability passes the genuine context and persisted digest to one checked transaction; no source reads or writes",async()=>{
 const {repo,query,release}=scripted();expect(await repo.availability(context,job,digest)).toEqual(status);
 expect(query.mock.calls.map(c=>c[0])).toEqual(['BEGIN',"SELECT set_config('app.practice_material_digest', $1, true)","SELECT set_config('app.tenant_id', $1, true)","SELECT app.read_money_trail_availability($1,$2) result",'COMMIT']);expect(release).toHaveBeenCalledTimes(1);expect(query.mock.calls[1]?.[1]).toEqual([digest]);expect(query.mock.calls[2]?.[1]).toEqual([tenant]);expect(query.mock.calls[3]?.[1]).toEqual([job,digest]);
 expect(await new MoneyTrailRepository(scripted().pool).availability(context,job,digest)).toEqual(status);
});
it("[MT-16] projection rejects foreign job, malformed identity and forged completed/money state",async()=>{
 for(const result of [{...status,jobId:tenant},{...status,jobId:'invalid'},{...status,state:'complete'},{...status,balance:0},{...status,productionEnabled:true},{...status,realExternalActions:1}]){
  const {repo,query}=scripted(result);await expect(repo.availability(context,job,digest)).rejects.toThrow();expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
 }
 const {repo,query}=scripted();await expect(repo.availability(context,'invalid',digest)).rejects.toThrow();expect(query).not.toHaveBeenCalled();
});
it("[MT-13/17] forged context and non-synthetic deployment cannot reach checked SQL",async()=>{
 const {repo,query}=scripted();await expect(repo.availability({...context},job,digest)).rejects.toThrow();expect(query).not.toHaveBeenCalled();
 for(const mode of ['production','pilot_no_charge',undefined]){if(mode===undefined)vi.stubEnv('JOBGUARD_ENV',undefined);else vi.stubEnv('JOBGUARD_ENV',mode);await expect(repo.availability(context,job,digest)).rejects.toThrow();expect(query).not.toHaveBeenCalled();}
});
it("[MT-13] access refusal rolls back; infrastructure failure is not falsely mapped as a domain result",async()=>{
 const forbidden=Object.assign(new Error('private detail'),{code:'42501'});const {repo,query}=scripted(undefined,forbidden);
 await expect(repo.availability(context,job,digest)).rejects.toThrow('MONEY_TRAIL_FORBIDDEN');expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
 for(const error of [new Error('transport failed'),Object.assign(new Error('private detail'),{code:'0A000'})])await expect(scripted(undefined,error).repo.availability(context,job,digest)).rejects.toBe(error);
});
it("[MT-04/14] available sources are read in one statement after access, with exact stored allocations and explicit incompleteness",async()=>{
 const invoice={kind:'customer_invoice',id:job,tenantId:tenant,jobId:job,values:{finalAccountRevisionId:job,sourceHash:'a'.repeat(64),netPence:'100',taxPence:'20',grossPence:'120'}};
 const line={kind:'receipt_line_allocation',id:job,tenantId:tenant,jobId:job,values:{paymentId:job,invoiceId:job,lineId:job,allocationId:job,reversalId:null,reversesId:null,sourceId:job,rule:'pro_rata',sourceRef:'stored-rule-source',gross:{numerator:'120',denominator:'7'},net:{numerator:'100',denominator:'7'}}};
 const query=vi.fn(async(sql:string,_values?:unknown[])=>({rows:sql.includes('read_money_trail')?[{result:status}]:sql.includes('available_money_trail_sources')?[{sources:[invoice,line]}]:[]}));
 const repo=new MoneyTrailRepository({connect:async()=>({query,release:vi.fn()})} as unknown as Pool);
 const before=JSON.stringify([invoice,line]);const result=await repo.availableSources(context,job,digest);
 expect(result).toEqual({version:'money-trail-available-sources.v1',environment:'synthetic_demo',jobId:job,incomplete:true,realExternalActions:0,unavailableFamilies:['eligibility','fee_postings','fee_statements','fee_events','subscription'],sources:[invoice,line]});
 expect(JSON.stringify([invoice,line])).toBe(before);const calls=query.mock.calls;expect(calls).toHaveLength(6);expect(calls[4]?.[1]).toEqual([tenant,job]);
 const sql=calls[4]![0];expect(sql.match(/s.tenant_id=\$1 AND s.job_id=\$2/gu)).toHaveLength(10);expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b|shadow_|recovery_eligibility|practice_feed/u);
 for(const table of ['customer_invoice','customer_credit_note','customer_payment','customer_payment_reversal','recovery_allocation_review','recovery_allocation_line_source','recovery_case_allocation','recovery_case_allocation_reversal','receipt_line_allocation','recovery_allocation_command'])expect(sql).toContain(`FROM app.${table} s`);
 expect(sql).not.toContain('s.*');expect(sql).not.toMatch(/reason|recipient|pdf_bytes|reference\b/u);
});
it("[MT-13/16] source access, strict shapes, exact magnitude and per-row tenant/job binding fail closed",async()=>{
 const source={kind:'customer_payment',id:job,tenantId:tenant,jobId:job,values:{invoiceId:job,amountPence:'1'}};
 async function run(sources:unknown,access:unknown=status){
  const query=vi.fn(async(sql:string)=>({rows:sql.includes('read_money_trail')?[{result:access}]:sql.includes('available_money_trail_sources')?[{sources}]:[]}));
  const repo=new MoneyTrailRepository({connect:async()=>({query,release:vi.fn()})} as unknown as Pool);
  try{return await repo.availableSources(context,job,digest);}catch(error){expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');throw error;}
 }
 for(const row of [{...source,tenantId:job},{...source,jobId:tenant}])await expect(run([row])).rejects.toThrow('MONEY_TRAIL_FORBIDDEN');
 for(const row of [{...source,extra:1},{...source,id:'bad'},{...source,kind:'unknown'},{...source,values:{invoiceId:job,amountPence:'1000000000001'}},{...source,values:{invoiceId:job,amountPence:'-1000000000001'}},{...source,values:{invoiceId:job,amountPence:'0.1'}},{...source,values:{invoiceId:job,amountPence:'1',settled:true}}])await expect(run([row])).rejects.toThrow('MONEY_TRAIL_SOURCE_UNAVAILABLE');
 await expect(run(Array.from({length:10001},()=>source))).rejects.toThrow('MONEY_TRAIL_SOURCE_UNAVAILABLE');
 await expect(run([source],{...status,jobId:tenant})).rejects.toThrow('MONEY_TRAIL_FORBIDDEN');
 await expect(run([source],{...status,state:'complete'})).rejects.toThrow();
});
const envelope=(kind:string,values:Record<string,unknown>)=>({kind,id:job,tenantId:tenant,jobId:job,values});
function sourceFixtures(){
 const reference={numerator:'1',denominator:'3'};
 return [
  envelope('customer_invoice',{finalAccountRevisionId:job,sourceHash:'a'.repeat(64),netPence:'100',taxPence:'20',grossPence:'120'}),
  envelope('customer_credit_note',{invoiceId:job,amountPence:'10'}),envelope('customer_payment',{invoiceId:job,amountPence:'120'}),envelope('customer_payment_reversal',{paymentId:job}),
  envelope('recovery_allocation_review',{caseId:job,paymentId:job,allocationId:null,commandId:job,action:'allocate',approvalHash:'a'.repeat(64)}),
  envelope('recovery_allocation_line_source',{invoiceId:job,lineId:job,netPence:'100',grossPence:'120',rule:'explicit',sourceRef:'stored'}),
  envelope('recovery_case_allocation',{caseId:job,paymentId:job,invoiceId:job,reviewId:job,authorizationId:job,evidenceId:job,objectVersionId:'version',evidenceHash:'a'.repeat(64),movementId:job,movementHash:'b'.repeat(64),policyVersion:'existing-v3',grossPence:'120',netPence:'100',taxPence:'20'}),
  envelope('recovery_case_allocation_reversal',{allocationId:job,sourceKind:'payment_reversal',sourceId:job,grossPence:'120',netPence:'100',taxPence:'20'}),
  envelope('receipt_line_allocation',{paymentId:job,invoiceId:job,lineId:job,allocationId:job,reversalId:null,reversesId:null,sourceId:job,rule:'pro_rata',sourceRef:'stored',gross:reference,net:reference}),
  envelope('recovery_allocation_command',{caseId:job,payloadHash:'c'.repeat(64)}),
 ];
}
function sourcesRepo(sources:unknown){
 const query=vi.fn(async(sql:string)=>({rows:sql.includes('read_money_trail')?[{result:status}]:sql.includes('available_money_trail_sources')?[{sources}]:[]}));
 return {query,repo:new MoneyTrailRepository({connect:async()=>({query,release:vi.fn()})} as unknown as Pool)};
}
it("all ten named stored source shapes are strict; source data never becomes a completed report",async()=>{
 const fixtures=sourceFixtures(),{repo}=sourcesRepo(fixtures);expect((await repo.availableSources(context,job,digest)).sources).toEqual(fixtures);
 for(const source of fixtures){
  await expect(sourcesRepo([{...source,values:{...source.values,invented:true}}]).repo.availableSources(context,job,digest)).rejects.toThrow('MONEY_TRAIL_SOURCE_UNAVAILABLE');
  for(const key of Object.keys(source.values)){const values={...source.values};delete values[key];await expect(sourcesRepo([{...source,values}]).repo.availableSources(context,job,digest)).rejects.toThrow('MONEY_TRAIL_SOURCE_UNAVAILABLE');}
 }
 for(const [index,patch] of [[0,{sourceHash:'X'}],[4,{action:'approved'}],[5,{rule:'largest-fee'}],[5,{sourceRef:''}],[5,{sourceRef:'x'.repeat(301)}],[6,{objectVersionId:''}],[6,{objectVersionId:'x'.repeat(1025)}],[6,{policyVersion:''}],[6,{policyVersion:'x'.repeat(81)}],[7,{sourceKind:'arbitrary'}],[8,{sourceRef:''}],[8,{sourceRef:'x'.repeat(301)}],[8,{gross:{numerator:'1',denominator:'0'}}],[8,{net:{numerator:'1',denominator:'1',extra:true}}],[8,{gross:{numerator:'1000000000001',denominator:'1'}}],[8,{net:{numerator:'1000000000001',denominator:'1'}}]] as const){
  const source=fixtures[index]!;await expect(sourcesRepo([{...source,values:{...source.values,...patch}}]).repo.availableSources(context,job,digest)).rejects.toThrow('MONEY_TRAIL_SOURCE_UNAVAILABLE');
 }
});
it("source scope is authenticated before any source SQL, including synthetic-mode and forged-context refusals",async()=>{
 const {repo,query}=sourcesRepo([]);await expect(repo.availableSources(context,'invalid',digest)).rejects.toThrow();expect(query).not.toHaveBeenCalled();await expect(repo.availableSources({...context},job,digest)).rejects.toThrow();expect(query).not.toHaveBeenCalled();
 for(const mode of ['production','pilot_no_charge',undefined]){vi.stubEnv('JOBGUARD_ENV',mode);await expect(repo.availableSources(context,job,digest)).rejects.toThrow();expect(query).not.toHaveBeenCalled();}
});
