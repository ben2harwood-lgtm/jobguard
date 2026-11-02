import type { Pool } from "pg";
import { z } from "zod";
import { parsePaymentFeeCommand, paymentFeeStatementV1, paymentFeeViewV1 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { PracticeAccessError } from "./practice-session.js";
const id=z.string().uuid(),digest=z.string().regex(/^[a-f0-9]{64}$/u);
export class PaymentFeeRepository {
 constructor(private readonly pool:Pool){}
 async read(context:VerifiedTenantContext,jobId:string,session:string){
  const job=id.parse(jobId),token=digest.parse(session);
  return withTenant(this.pool,context,async db=>{
   const row=(await db.$client.query<{result:unknown}>("SELECT app.read_payment_fees($1,$2) result",[job,token])).rows[0];
   const result=paymentFeeViewV1.parse(row?.result);
   if(result.jobId!==job)throw new PracticeAccessError("NOT_FOUND");
   return result;
  });
 }
 async command(context:VerifiedTenantContext,jobId:string,session:string,raw:unknown){
  const job=id.parse(jobId),token=digest.parse(session),command=parsePaymentFeeCommand(raw);
  return withTenant(this.pool,context,async db=>{
   const row=(await db.$client.query<{result:unknown}>("SELECT app.write_payment_fee($1,$2,$3::jsonb) result",[job,token,command])).rows[0];
   const result=paymentFeeStatementV1.parse(row?.result);
   if(result.jobId!==job || (command.action==="prepare"?result.paymentId!==command.paymentId:result.statementId!==command.statementId))throw new PracticeAccessError("NOT_FOUND");
   return result;
  });
 }
}
