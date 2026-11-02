import type { Pool } from "pg";
import { z } from "zod";
import { projectMeterFixture } from "./meter-persistence.js";
import { withTenant,type VerifiedTenantContext } from "./tenant-context.js";
import { SubscriptionPersistenceError } from "./subscription-repository.js";
/** Fresh MON-1B input with accepted terms applied by checked SQL, never a cached computation or client price. */
export class SubscriptionMeterSource {
 constructor(private readonly pool:Pool){}
 async read(context:VerifiedTenantContext,digest:string,sourceId:string){
  if(!z.guid({ error: "Invalid uuid" }).safeParse(sourceId).success||!/^[a-f0-9]{64}$/u.test(digest))throw new SubscriptionPersistenceError("INVALID_SUBSCRIPTION_INPUT");
  try{return await withTenant(this.pool,context,async db=>{
   const raw=(await db.$client.query("SELECT app.mon2_source($1,$2,$3) result",[context.tenantId,digest,sourceId])).rows[0]?.result;
   return projectMeterFixture(context.tenantId,raw);
  });}catch{throw new SubscriptionPersistenceError("SUBSCRIPTION_UNAVAILABLE");}
 }
}
