import type { Pool } from "pg";
import { z } from "zod";
import { jobWorkStateReadV1, JobWorkStateError } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export const workStateReadV1 = jobWorkStateReadV1;
/** Receives the existing stamp per call. Contains no context constructor or saved authority. */
export class JobWorkStateRepository {
 constructor(private readonly pool:Pool) {}
 async read(context:VerifiedTenantContext,jobId:string,digest:string) {
  if(!z.guid({ error: "Invalid uuid" }).safeParse(jobId).success || !/^[a-f0-9]{64}$/u.test(digest))throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
  return withTenant(this.pool,context,async db=>{
   try {
    const row=(await db.$client.query<{result:unknown}>("SELECT app.ch4_read_work_facts($1,$2,$3) result",[context.tenantId,jobId,digest])).rows[0];
    const parsed=workStateReadV1.safeParse(row?.result);if(!parsed.success)throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");return parsed.data;
   } catch(error) {if(error instanceof Error && error.message==="WORK_STATE_FORBIDDEN")throw new JobWorkStateError("WORK_STATE_FORBIDDEN");throw error;}
  });
 }
}
