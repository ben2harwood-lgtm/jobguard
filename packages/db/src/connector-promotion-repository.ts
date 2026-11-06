import type { Pool } from "pg";
import { z } from "zod";
import { WorkOrderError } from "@jobguard/core";
import { contractorSessionContext } from "./contractor-session-context.js";
import { ContractorRepository } from "./contractor-repository.js";
import { EnterpriseLivePromptRepository } from "./enterprise-live-prompt-repository.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { WorkOrderRepository, derivedUuid, workOrderFailure } from "./work-order-repository.js";
import { generateWorkOrderSample, type WorkOrderDemo } from "./work-order-fixtures.js";

const ref = z.string().regex(/^fixture:[a-z0-9_-]{1,112}$(?![\s\S])/u);
export const connectorPromotionV1 = z.object({ version: z.literal("connector-promotion.v1"), namespace: ref, eventId: ref }).strict();
const staged = z.object({ namespace: ref, eventId: ref, kind: z.enum(["work_order", "materials_issue", "billing_status"]), subject: ref,
  revision: z.number().int().positive(), document: ref.nullable(), result: z.record(z.string(), z.unknown()).nullable(), hold: z.string().nullable() }).strict();
export type StagedPromotionEvent = z.infer<typeof staged>;

/** Human session only. The SQL boundary rechecks permission before list, replay and record. */
export class ConnectorPromotionRepository {
  constructor(private readonly pool: Pool) {}
  private async events(db: TenantTransaction, sessionId: string, namespace: string | null, eventId: string | null) {
    const value = (await db.$client.query<{ value: unknown }>("SELECT app.connector_promotion($1,$2,$3,NULL,NULL) value", [sessionId, namespace, eventId])).rows[0]!.value;
    return z.array(z.unknown()).parse(value).flatMap(row => {
      const parsed = staged.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  }
  async list(sessionId: string) {
    try {
      const context: VerifiedTenantContext = await contractorSessionContext(this.pool, sessionId);
      return await withTenant(this.pool, context, db => this.events(db, sessionId, null, null));
    } catch (error) { throw workOrderFailure(error); }
  }
  async promote(sessionId: string, raw: unknown) {
    const parsed = connectorPromotionV1.safeParse(raw);
    if (!parsed.success) throw new WorkOrderError("INVALID_COMMAND");
    try {
      const context: VerifiedTenantContext = await contractorSessionContext(this.pool, sessionId);
      const principal = await new ContractorRepository(this.pool).resolveSession(sessionId);
      return await withTenant(this.pool, context, async db => {
        const input = parsed.data;
        const event = (await this.events(db, sessionId, input.namespace, input.eventId))[0]!;
        if (event.kind === "billing_status") throw new WorkOrderError("INVALID_COMMAND");
        if (event.result) return event.result;
        const commandId = derivedUuid(`${context.tenantId}:${event.namespace}:${event.eventId}`);
        let result: Record<string, unknown>;
        if (event.kind === "work_order") {
          const sample = event.document === "fixture:starter_orders" && event.revision === 1 ? "starter_orders"
            : event.document === "fixture:revised_orders" && event.revision === 2 ? "revised_orders" : null;
          if (!sample || event.subject !== "fixture:demo-orders") throw new WorkOrderError("INVALID_COMMAND");
          const demo = await this.demo(db, context.tenantId);
          result = await new WorkOrderRepository(this.pool).importCsvInTransaction(db, principal,
            { commandId, name: `generated: ${sample}`, kind: "generated", csv: generateWorkOrderSample(sample, demo) });
          if ((result.counts as { rejected: number }).rejected) throw new WorkOrderError("INVALID_COMMAND");
        } else {
          if (event.document !== "fixture:door-materials" || event.subject !== "fixture:demo-order-1" || event.revision !== 1) throw new WorkOrderError("INVALID_COMMAND");
          const job = (await db.$client.query<{ id: string }>(`SELECT w.job_id id FROM app.work_order w JOIN app.client_organisation c ON(c.tenant_id,c.id)=(w.tenant_id,w.client_id)
            WHERE w.tenant_id=$1 AND c.name='Fictional Housing Association' AND w.reference='WO-DEMO-0001'`, [context.tenantId])).rows[0];
          if (!job) throw new WorkOrderError("NOT_FOUND");
          result = await new EnterpriseLivePromptRepository(this.pool).importMaterialsInTransaction(db, sessionId, {
            version: "materials-issue.v1", commandId, jobId: job.id, sourceId: event.namespace, eventId: event.eventId,
            workIdentity: "REPAIR-DOOR", unit: "each", quantity: "2", occurredAtMicros: "1792310400000000", kind: "issue",
          });
        }
        return (await db.$client.query<{ value: Record<string, unknown> }>("SELECT app.connector_promotion($1,$2,$3,$4,$5::jsonb) value",
          [sessionId, event.namespace, event.eventId, commandId, JSON.stringify(result)])).rows[0]!.value;
      });
    } catch (error) { throw workOrderFailure(error); }
  }
  /** Read existing fictional ENT-2 setup. No setup transaction or guessed identifiers. */
  private async demo(db: TenantTransaction, tenant: string): Promise<WorkOrderDemo> {
    const c = db.$client;
    const row = (await c.query<{ clientId: string; contractId: string; contractVersionId: string; teamId: string; branchId: string; document: { sorVersionIds: string[]; tenderedAdjustment: WorkOrderDemo["adjustment"] } }>(`
      SELECT cl.id "clientId",v.contract_id "contractId",v.id "contractVersionId",tm.id "teamId",tm.branch_id "branchId",v.document
      FROM app.client_organisation cl JOIN app.client_contract_version v ON(v.tenant_id,v.client_id)=(cl.tenant_id,cl.id)
      JOIN app.team tm ON tm.tenant_id=cl.tenant_id AND tm.branch_id=cl.branch_id
      WHERE cl.tenant_id=$1 AND cl.name='Fictional Housing Association' ORDER BY v.revision DESC,tm.id LIMIT 1`, [tenant])).rows[0];
    const sites = (await c.query<{ id: string; address: string }>("SELECT id,payload->'addressLines'->>0 address FROM app.site_revision WHERE tenant_id=$1 AND payload->'addressLines'->>0 LIKE '% Fictional Demo Street'", [tenant])).rows;
    sites.sort((a,b) => a.address.localeCompare(b.address,"en",{numeric:true}) || a.id.localeCompare(b.id));
    const operative = (await c.query<{ id: string }>("SELECT membership_id id FROM app.contractor_member WHERE tenant_id=$1 AND email='demo.operative@fictional.invalid'", [tenant])).rows[0];
    if (!row || !operative || sites.length === 0 || !row.document.sorVersionIds[0]) throw new WorkOrderError("NOT_FOUND");
    return { ...row, siteRevisionIds: sites.map(s => s.id), operativeMembershipId: operative.id, sorVersionId: row.document.sorVersionIds[0],
      scheduleId: row.document.sorVersionIds[0], adjustment: row.document.tenderedAdjustment, issuedOn: "2026-10-08" };
  }
}
