import type { Pool } from "pg";
import { z } from "zod";
import { simulationMoneyCommandV1,simulationMoneySnapshotV1,simulationMoneyHash,reconcileSimulationMoney,SuccessFeeError } from "@jobguard/core";
import { practiceMaterialPool } from "./practice-session.js";
import { withTenant,type VerifiedTenantContext } from "./tenant-context.js";
const saved=z.object({runId:z.string().uuid(),jobId:z.string().uuid(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/u),snapshot:simulationMoneySnapshotV1,paused:z.literal(true)}).strict();
/** SQL gathers and persists the exact rows. The report is reproduced from those rows on every read. */
export class SimulationMoneyRunRepository {
 constructor(private readonly pool:Pool){}
 async command(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown){
  if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new SuccessFeeError("SUCCESS_FEE_FORBIDDEN");
  const parsed=simulationMoneyCommandV1.safeParse(raw),job=z.string().uuid().safeParse(jobId);
  if(!parsed.success||!job.success)throw new SuccessFeeError();
  const command=parsed.data;
  try{return await withTenant(practiceMaterialPool(this.pool,digest),context,async db=>{
   const row=(await db.$client.query<{result:unknown}>("SELECT app.simulation_money_run($1,$2,$3::jsonb) result",[job.data,digest,command])).rows[0];
   const result=saved.parse(row?.result);
   if(result.jobId!==job.data||result.snapshot.jobId!==job.data||result.snapshot.tenantId!==context.tenantId||simulationMoneyHash(result.snapshot)!==result.sourceHash
    ||result.runId!==(command.action==="read"||command.action==="review"?command.runId:command.commandId))throw new SuccessFeeError("SUCCESS_FEE_FORBIDDEN");
   return {...result,report:reconcileSimulationMoney(result.snapshot)};
  });}catch(error){
   if(error instanceof Error&&"code" in error){
    if(error.code==="42501")throw new SuccessFeeError("SUCCESS_FEE_FORBIDDEN");
    if(["SUCCESS_FEE_SOURCE_CHANGED","SUCCESS_FEE_IDEMPOTENCY_CONFLICT","SUCCESS_FEE_DEPENDENCY_BOUND","INVALID_SUCCESS_FEE_COMMAND"].includes(error.message))throw new SuccessFeeError(error.message as import("@jobguard/core").SuccessFeeErrorCode);
   }throw error;
  }
 }
}
