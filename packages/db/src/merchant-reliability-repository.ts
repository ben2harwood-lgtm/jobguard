import type { Pool } from "pg";
import { z } from "zod";
import { merchantDeliveryRecord } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
export class MerchantReliabilityRepository {
 constructor(private readonly pool: Pool) {}
 async read(context: VerifiedTenantContext, digest: string, jobId: string) {
  z.guid().parse(jobId); z.string().regex(/^[a-f0-9]{64}$/u).parse(digest);
  return withTenant(this.pool,context,async db => {
   const raw: unknown = (await db.$client.query("SELECT app.merchant_delivery_record_read($1,$2,$3) result",[context.tenantId,digest,jobId])).rows[0]?.result;
   if (!Array.isArray(raw)) throw new Error("MERCHANT_RECORD_UNAVAILABLE");
   return merchantDeliveryRecord(context.tenantId,raw);
  });
 }
}
