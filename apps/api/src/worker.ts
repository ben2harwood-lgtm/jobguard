import { ActionExecutor, type OutboundAdapter, type SafeTelemetry, type VerifiedTenantContext } from "@jobguard/db";
import { run, type TaskList } from "graphile-worker";
import { Pool } from "pg";
import { z } from "zod";

const environmentSchema=z.object({GRAPHILE_DATABASE_URL:z.string().url(),RUNTIME_DATABASE_URL:z.string().url()}).strict();
const environment=environmentSchema.parse({GRAPHILE_DATABASE_URL:process.env.GRAPHILE_DATABASE_URL,RUNTIME_DATABASE_URL:process.env.RUNTIME_DATABASE_URL});
const runtimePool=new Pool({connectionString:environment.RUNTIME_DATABASE_URL,application_name:"jobguard-business-worker"});
const fakeAdapter:OutboundAdapter={name:"fake_capture",supportsProviderDeduplication:false,async deliver(action){return {kind:"succeeded",providerReference:`synthetic:${action.providerEffectKey}`};},async reconcile(){return "unknown";}};
const telemetry:SafeTelemetry={emit(name,fields){console.info(JSON.stringify({component:"outbox",name,...fields}));}};
const executor=new ActionExecutor(runtimePool,new Map([[fakeAdapter.name,fakeAdapter]]),telemetry);
const tasks:TaskList={
 async discover_outbox(_payload,helpers){const rows=await helpers.withPgClient(client=>client.query<{action_id:string;tenant_id:string}>(`SELECT action_id,tenant_id FROM infrastructure.outbox_signal ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`));for(const row of rows.rows){await helpers.addJob("execute_outbox",{actionId:row.action_id,tenantId:row.tenant_id},{jobKey:`outbox:${row.action_id}`,jobKeyMode:"preserve_run_at"});}},
 async execute_outbox(payload){const parsed=z.object({actionId:z.string().uuid(),tenantId:z.string().uuid()}).strict().parse(payload);await executor.execute({tenantId:parsed.tenantId} as VerifiedTenantContext,parsed.actionId);},
};
const runner=await run({connectionString:environment.GRAPHILE_DATABASE_URL,taskList:tasks,crontab:"*/1 * * * * discover_outbox"});
for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,async()=>{await runner.stop();await runtimePool.end();});
