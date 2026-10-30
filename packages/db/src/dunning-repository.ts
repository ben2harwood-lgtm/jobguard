import type { Pool } from "pg";
import { z } from "zod";
import { buildDunningReminder, dunningInvoiceV1, DunningError, unpaidInvoiceWorkbench } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const id = z.guid();
const tick = z.number().int().safe().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const locator = z.object({ jobId: id, nowTick: tick }).strict();
const command = z.object({ version: z.literal("dunning-persist-command.v1"), commandId: id,
 invoiceId: id, snapshotHash: hash, nowTick: tick, decisionId: id.optional() }).strict();
const storedRow = z.object({ invoiceId: id, projection: z.unknown(), snapshotHash: hash }).strict();
const resultSchema = z.object({ decisionId: id, snapshotHash: hash, expiresAt: z.iso.datetime({ offset: true }),
 status: z.enum(["pending", "approved"]), executable: z.literal(false) }).strict();

/** Persisted synthetic preview only. The DB entry point authenticates the company
 * session on every read/command; callers never submit invoice or balance facts. */
export class DunningRepository {
 constructor(private readonly pool: Pool) {}
 private async guarded<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
   if (error instanceof DunningError) throw error;
   const message = error instanceof Error ? error.message : "";
   if (["INVALID_DUNNING_INPUT", "DUNNING_UNAVAILABLE", "DUNNING_CONFLICT", "DUNNING_DARK"].includes(message)) {
    throw new DunningError(message as DunningError["code"]);
   }
   throw new DunningError("DUNNING_UNAVAILABLE");
  }
 }
 async read(context: VerifiedTenantContext, digest: string, raw: unknown) {
  const input = locator.safeParse(raw);
  if (!input.success || !/^[a-f0-9]{64}$/u.test(digest)) throw new DunningError("INVALID_DUNNING_INPUT");
  return this.guarded(() => withTenant(this.pool, context, async db => {
   const scope = { version: "dunning-scope.v1", environment: "synthetic_demo", tenantId: context.tenantId,
    jobId: input.data.jobId, permission: "manage_dunning" };
   const rawRows: unknown = (await db.$client.query("SELECT app.dunning_workbench($1,$2,$3,'read','{}'::jsonb) result",
    [context.tenantId, digest, input.data.jobId])).rows[0]?.result;
   if (!Array.isArray(rawRows)) throw new DunningError("DUNNING_UNAVAILABLE");
   const parsed = rawRows.map(row => storedRow.safeParse(row));
   const invoices = parsed.map(row => {
    if (!row.success) return null;
    const invoice = dunningInvoiceV1.safeParse(row.data.projection);
    return invoice.success && invoice.data.invoiceId === row.data.invoiceId
     && invoice.data.tenantId === context.tenantId && invoice.data.jobId === input.data.jobId ? invoice.data : null;
   });
   const workbench = unpaidInvoiceWorkbench(scope, invoices, input.data.nowTick);
   return { ...workbench, invoices: workbench.invoices.map(row => {
    const index = invoices.findIndex(invoice => invoice?.invoiceId === row.invoiceId);
    const stored = parsed[index]!;
    if (!stored.success) throw new DunningError("DUNNING_UNAVAILABLE");
    return { ...row, snapshotHash: stored.data.snapshotHash,
     reminder: row.suppression ? null : buildDunningReminder(scope, invoices[index], input.data.nowTick) };
   }) };
  }));
 }
 async command(context: VerifiedTenantContext, digest: string, jobId: string, operation: "request" | "approve", raw: unknown) {
  const input = command.safeParse(raw);
  if (!input.success || !id.safeParse(jobId).success || !/^[a-f0-9]{64}$/u.test(digest)
   || !["request", "approve"].includes(operation)
   || (operation === "approve") !== (input.data.decisionId !== undefined)) throw new DunningError("INVALID_DUNNING_INPUT");
  // Reuse the complete core parser before any write. SQL locks and rechecks the
  // same snapshot hash, so a source change between these transactions fails closed.
  const current = await this.read(context, digest, { jobId, nowTick: input.data.nowTick });
  const row = current.invoices.find(invoice => invoice.invoiceId === input.data.invoiceId);
  if (!row || !row.reminder || row.snapshotHash !== input.data.snapshotHash) throw new DunningError("DUNNING_UNAVAILABLE");
  return this.guarded(() => withTenant(this.pool, context, async db => {
   const result = (await db.$client.query("SELECT app.dunning_workbench($1,$2,$3,$4,$5::jsonb) result",
    [context.tenantId, digest, jobId, operation, JSON.stringify(input.data)])).rows[0]?.result;
   return resultSchema.parse(result);
  }));
 }
}
