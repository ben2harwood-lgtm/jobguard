import type { Pool } from "pg";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/** Demo-only guide helpers. Each SQL routine refuses outside the synthetic database and rechecks job ownership. */
export class ShadowDemoGuideRepository {
 constructor(private readonly pool: Pool) {}
 private async call(context: VerifiedTenantContext, sql: string, values: unknown[]) {
  return withTenant(this.pool, context, async db => (await db.$client.query<{ result: unknown }>(sql, values)).rows[0]?.result);
 }
 requestSourceHold(context: VerifiedTenantContext, jobId: string, digest: string) {
  return this.call(context, "SELECT app.demo_request_source_hold($1,$2,$3) result", [context.tenantId, jobId, digest]);
 }
 sourceHoldState(context: VerifiedTenantContext, jobId: string, digest: string) {
  return this.call(context, "SELECT app.demo_source_hold_state($1,$2,$3) result", [context.tenantId, jobId, digest]);
 }
 reviewInputs(context: VerifiedTenantContext, jobId: string, digest: string) {
  return this.call(context, "SELECT app.demo_shadow_review_inputs($1,$2,$3) result", [context.tenantId, jobId, digest]);
 }
 issueCustomerLink(context: VerifiedTenantContext, jobId: string, customerId: string, digest: string, linkDigest: string, reference: string) {
  return this.call(context, "SELECT app.demo_issue_customer_link($1,$2,$3,$4,$5,$6) result", [context.tenantId, jobId, customerId, digest, linkDigest, reference]);
 }
}
