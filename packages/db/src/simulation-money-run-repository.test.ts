import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { simulationMoneyHash } from "@jobguard/core";
import { SimulationMoneyRunRepository } from "./simulation-money-run-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
const job=randomUUID(),context=verifiedTenantContextForQueuedJob(randomUUID()),digest="a".repeat(64);
beforeEach(()=>vi.stubEnv("JOBGUARD_ENV","synthetic_demo"));afterEach(()=>vi.unstubAllEnvs());
function snapshot(){return {version:"simulation-money-snapshot.v1",tenantId:context.tenantId,jobId:job,liveFee:null,practice_feed_event:[],practice_feed_receipt_match:[],practice_feed_command:[],customer_invoice:[],customer_credit_note:[],customer_payment:[],customer_payment_reversal:[],receipt_allocation_fact_revision:[],receipt_allocation_fact_source:[],receipt_allocation_fact_line:[],stored_receipt_case_allocation:[],success_fee_derivation:[],success_fee_journal:[],success_fee_journal_line:[],platform_fee_statement:[],platform_fee_attempt:[],platform_fee_attempt_event:[],subscription_period:[],subscription_period_line:[],platform_statement:[],platform_statement_line:[],subscription_simulated_work:[],subscription_simulated_result:[]};}
function setup(result:unknown,error?:unknown){const query=vi.fn(async(sql:string)=>{if(sql.includes("app.simulation_money_run")&&error)throw error;return {rows:sql.includes("app.simulation_money_run")?[{result}]:[]};}),pool={connect:async()=>({query,release:vi.fn()})} as unknown as Pool;return {repo:new SimulationMoneyRunRepository(pool),query};}
it("validates the gathered snapshot hash and identity within the transaction; missing sources are review needed",async()=>{
 const s=snapshot(),c={version:"simulation-money-command.v1",commandId:randomUUID(),action:"run"},x=setup({runId:c.commandId,jobId:job,sourceHash:simulationMoneyHash(s),snapshot:s,paused:true});
 expect(await x.repo.command(context,job,digest,c)).toMatchObject({paused:true,report:{label:"Review needed",realExternalActions:0}});
 expect(x.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");expect(x.query.mock.calls.map(c=>c[0])).toContain("SELECT set_config('app.practice_material_digest', $1, true)");
});
it("rejects substituted tenant/job/run/hash and rolls back before returning financial data",async()=>{
 const s=snapshot(),c={version:"simulation-money-command.v1",commandId:randomUUID(),action:"run"},base={runId:c.commandId,jobId:job,sourceHash:simulationMoneyHash(s),snapshot:s,paused:true};
 for(const patch of [{jobId:randomUUID()},{runId:randomUUID()},{sourceHash:"0".repeat(64)},{snapshot:{...s,tenantId:randomUUID()}}]){
  const x=setup({...base,...patch});await expect(x.repo.command(context,job,digest,c)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");expect(x.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
 }
});
it("refuses invented facts and production before connecting",async()=>{
 const x=setup(null),c={version:"simulation-money-command.v1",commandId:randomUUID(),action:"run"};
 await expect(x.repo.command(context,job,digest,{...c,snapshot:snapshot()})).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
 vi.stubEnv("JOBGUARD_ENV","production");await expect(x.repo.command(context,job,digest,c)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");expect(x.query).not.toHaveBeenCalled();
});
it("maps bounded authorization/source conflicts and rolls back",async()=>{
 for(const [code,message] of [["42501","private SQL"],["40001","SUCCESS_FEE_SOURCE_CHANGED"],["0A000","SUCCESS_FEE_DEPENDENCY_BOUND"]]){
  const x=setup(null,Object.assign(new Error(message),{code}));await expect(x.repo.command(context,job,digest,{version:"simulation-money-command.v1",commandId:randomUUID(),action:"run"})).rejects.toThrow(code==="42501"?"SUCCESS_FEE_FORBIDDEN":message);expect(x.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
 }
});
