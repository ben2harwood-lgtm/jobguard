import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { assertTrialSynthetic, trialInput, trialFailure, trialCardRequestV1, trialCardAttemptV1 } from "./free-first-job-repository.js";
/** Only a checked setup request is available to runtime. Results are migration-owned fixture facts. */
export class FreeFirstJobCardRepository {
 constructor(private readonly pool:Pool){}
 async request(context:VerifiedTenantContext,digest:string,commandId:string,raw:unknown){
  assertTrialSynthetic();const input=trialInput(trialCardRequestV1,raw);
  trialInput(z.string().regex(/^[a-f0-9]{64}$/u),digest);trialInput(z.string().uuid(),commandId);
  try{return await withTenant(this.pool,context,async db=>{
   assertTrialSynthetic();const result=(await db.$client.query("SELECT app.mon3_request_card($1,$2,$3,$4::jsonb) result",[context.tenantId,digest,commandId,JSON.stringify(input)])).rows[0]?.result;
   assertTrialSynthetic();return trialInput(trialCardAttemptV1,result);
  });}catch(error){return trialFailure(error);}
 }
}
