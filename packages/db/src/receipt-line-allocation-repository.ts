import type { Pool } from "pg";
import { z } from "zod";
import { practiceMaterialPool } from "./practice-session.js";
import type { RecoveryAllocationActor } from "./recovery-allocation-repository.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export type ReceiptLineAllocationErrorCode = "RECEIPT_LINE_SYNTHETIC_ONLY" | "RECEIPT_LINE_FORBIDDEN" |
 "INVALID_RECEIPT_LINE_QUERY" | "RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED";
export class ReceiptLineAllocationError extends Error {
 constructor(readonly code: ReceiptLineAllocationErrorCode) { super(code); this.name = "ReceiptLineAllocationError"; }
}
const id = z.string().uuid();
const selectorV1 = z.object({ jobId: id, invoiceId: id.optional(), paymentId: id.optional() }).strict();
const queryV1 = z.object({ version: z.literal("receipt-line-allocation-query.v1"), commandId: id.optional() }).strict();
const expectedV1 = z.object({ revision: z.number().int().safe().positive(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
type Selector = z.infer<typeof selectorV1>;
type Scope = Readonly<{ context: VerifiedTenantContext; actor: RecoveryAllocationActor; sessionDigest: string }>;
function fail(code: ReceiptLineAllocationErrorCode): never { throw new ReceiptLineAllocationError(code); }

/**
 * Build-ahead access boundary ONLY. The issued base has no released neutral
 * source authority/locking port. Promise<never> is deliberate: no saved/current
 * snapshot or command result can be invented while that item is STOPped.
 * C0 exports are integrated; no public API/HTTP route is composed until the source handoff.
 */
export class RecoveryLineAllocationRepository {
 constructor(private readonly pool: Pool, private readonly environment = process.env.JOBGUARD_ENV ?? "unconfigured") {}
 private guard(actor: RecoveryAllocationActor, sessionDigest: string, jobId: string): void {
  if (this.environment !== "synthetic_demo") fail("RECEIPT_LINE_SYNTHETIC_ONLY");
  if (!/^[a-f0-9]{64}$/u.test(sessionDigest) || !id.safeParse(jobId).success ||
   !id.safeParse(actor?.membershipId).success || !id.safeParse(actor?.identityUserId).success) fail("RECEIPT_LINE_FORBIDDEN");
 }
 private async scope(db: TenantTransaction, scope: Scope, jobId: string): Promise<void> {
  this.guard(scope.actor, scope.sessionDigest, jobId);
  // The supplied scope must agree with this existing transaction's authenticated
  // tenant and digest. Never install/replace them on a caller-owned transaction.
  const found = await db.$client.query(`SELECT m.id FROM app.membership m
   JOIN app.authenticate_practice_session($4,$1) p ON(p.tenant_id,p.membership_id,p.identity_user_id)=(m.tenant_id,m.id,m.identity_user_id)
   JOIN app.job j ON(j.tenant_id,j.id)=(m.tenant_id,$5::uuid)
   WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3 AND m.role='owner'
   AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND j.practice_session_digest=$4
   AND current_setting('app.tenant_id',true)=$1::text AND current_setting('app.practice_material_digest',true)=$4 FOR SHARE OF m`,
   [scope.context.tenantId, scope.actor.membershipId, scope.actor.identityUserId, scope.sessionDigest, jobId]);
  if (found.rowCount !== 1) fail("RECEIPT_LINE_FORBIDDEN");
 }
 private async translate(work: () => Promise<unknown>): Promise<never> {
  try { await work(); }
  catch (error) {
   const message = error instanceof Error ? error.message : "";
   if (message === "RECEIPT_LINE_FORBIDDEN" || message === "RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED") fail(message);
   throw error; // Transport/commit ambiguity is not a definite domain refusal.
  }
  // Even a stale/misconfigured database returning JSON cannot enable the held adapter.
  fail("RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED");
 }
 async readCurrent(context: VerifiedTenantContext, actor: RecoveryAllocationActor, sessionDigest: string, selector: Selector): Promise<never> {
  this.guard(actor, sessionDigest, selector?.jobId);
  if (!selectorV1.safeParse(selector).success) fail("INVALID_RECEIPT_LINE_QUERY");
  return withTenant(practiceMaterialPool(this.pool, sessionDigest), context, db =>
   this.readCurrentInTransaction(db, { context, actor, sessionDigest }, selector));
 }
 async readCurrentInTransaction(db: TenantTransaction, scope: Scope, selector: Selector, expected?: z.infer<typeof expectedV1>): Promise<never> {
  this.guard(scope.actor, scope.sessionDigest, selector?.jobId);
  if (!selectorV1.safeParse(selector).success || (expected !== undefined && !expectedV1.safeParse(expected).success)) fail("INVALID_RECEIPT_LINE_QUERY");
  await this.scope(db, scope, selector.jobId);
  await db.$client.query("SELECT set_config('app.receipt_line_environment','synthetic_demo',true)");
  return this.translate(() => db.$client.query("SELECT app.read_receipt_allocation_facts($1,$2,$3,$4::jsonb,$5::jsonb)",
   [scope.context.tenantId, selector.jobId, scope.sessionDigest, JSON.stringify(selector), expected === undefined ? null : JSON.stringify(expected)]));
 }
 async view(context: VerifiedTenantContext, actor: RecoveryAllocationActor, sessionDigest: string, jobId: string, rawQuery?: unknown): Promise<never> {
  this.guard(actor, sessionDigest, jobId);
  if (!queryV1.safeParse(rawQuery === undefined ? { version: "receipt-line-allocation-query.v1" } : rawQuery).success) fail("INVALID_RECEIPT_LINE_QUERY");
  return this.readCurrent(context, actor, sessionDigest, { jobId });
 }
 async command(context: VerifiedTenantContext, actor: RecoveryAllocationActor, sessionDigest: string, jobId: string, raw: unknown): Promise<never> {
  this.guard(actor, sessionDigest, jobId);
  return withTenant(practiceMaterialPool(this.pool, sessionDigest), context, async db => {
   await this.scope(db, { context, actor, sessionDigest }, jobId);
   await db.$client.query("SELECT set_config('app.receipt_line_environment','synthetic_demo',true)");
   // No parsing/authority is inferred from raw: every possible command is held.
   // Do not forward arbitrary unbounded input into SQL while source authority remains held.
   void raw;
   return this.translate(() => db.$client.query("SELECT app.write_receipt_allocation_facts($1,$2,$3,NULL::jsonb,NULL::jsonb)", [context.tenantId, jobId, sessionDigest]));
  });
 }
}
