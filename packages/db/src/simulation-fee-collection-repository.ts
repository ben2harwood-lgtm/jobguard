import type { Pool } from "pg";
import { z } from "zod";
import { simulationFeeCollectionCommandV1, simulationFeeCollectionViewV1, simulationFeeCollectionResultV1, SuccessFeeError } from "@jobguard/core";
import { practiceMaterialPool } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

function parseId(raw:string) {
 const parsed=z.string().uuid().safeParse(raw);
 if(!parsed.success) throw new SuccessFeeError();
 return parsed.data;
}

export class SimulationFeeCollectionRepository {
  constructor(private readonly pool: Pool) {}
  private async run<T>(context:VerifiedTenantContext,digest:string,work:Parameters<typeof withTenant<T>>[2]) {
    try { return await withTenant(practiceMaterialPool(this.pool,digest),context,work); }
    catch(error) {
      if(error instanceof Error && "code" in error) {
        if(error.code==="42501") throw new SuccessFeeError("SUCCESS_FEE_FORBIDDEN");
        if(["23514","40001","0A000"].includes(String(error.code)) && ["INVALID_SUCCESS_FEE_COMMAND","SUCCESS_FEE_STALE","SUCCESS_FEE_SOURCE_CHANGED","SUCCESS_FEE_DEPENDENCY_BOUND","SUCCESS_FEE_IDEMPOTENCY_CONFLICT"].includes(error.message))
          throw new SuccessFeeError(error.message as import("@jobguard/core").SuccessFeeErrorCode);
      }
      throw error;
    }
  }
  async view(context:VerifiedTenantContext,jobId:string,digest:string) {
    const job=parseId(jobId);
    return this.run(context,digest,async db=>{
      const row=(await db.$client.query<{result:unknown}>("SELECT app.read_platform_fee_collection($1,$2) result",[job,digest])).rows[0];
      const view=simulationFeeCollectionViewV1.parse(row?.result);
      if(view.jobId!==job) throw new SuccessFeeError("SUCCESS_FEE_FORBIDDEN");
      return view;
    });
  }
  async command(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown) {
    const parsed=simulationFeeCollectionCommandV1.safeParse(raw);
    if(!parsed.success) throw new SuccessFeeError();
    const command=parsed.data,job=parseId(jobId);
    return this.run(context,digest,async db=>{
      const row=(await db.$client.query<{result:unknown}>("SELECT app.write_platform_fee_collection($1,$2,$3::jsonb) result",[job,digest,command])).rows[0];
      const result=simulationFeeCollectionResultV1.parse(row?.result);
      if(result.commandId!==command.commandId || ("attemptId" in command && result.attemptId!==command.attemptId))
        throw new SuccessFeeError("SUCCESS_FEE_FORBIDDEN");
      return result;
    });
  }
}
