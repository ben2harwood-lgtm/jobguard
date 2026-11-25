import type { Pool } from "pg";
import type { SiteDaySources, SiteDayWindow } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const iso = (value: Date) => value.toISOString();
/** QW-2: one job's recorded site activity inside a site-day window. Diary notes come from the checked job-source read. */
export class SiteDaySummaryRepository {
  constructor(private readonly pool: Pool) {}

  async sources(context: VerifiedTenantContext, jobId: string, window: SiteDayWindow): Promise<Omit<SiteDaySources, "notes">> {
    const keys = [context.tenantId, jobId, window.startsAt, window.closesAt];
    return withTenant(this.pool, context, async db => {
      const work = await db.$client.query<{ scopeItemId: string; description: string; stage: "in_progress" | "complete"; at: Date }>(`
        SELECT p.scope_item_id AS "scopeItemId",p.stage,p.updated_at AS at,coalesce(
          (SELECT l.description FROM app.quote_line l JOIN app.quote_revision q ON (q.tenant_id,q.job_id,q.id)=(l.tenant_id,l.job_id,l.quote_revision_id)
            WHERE (l.tenant_id,l.job_id,l.scope_item_id)=(p.tenant_id,p.job_id,p.scope_item_id) ORDER BY q.revision DESC,l.id DESC LIMIT 1),
          (SELECT v.description FROM app.variation v WHERE (v.tenant_id,v.job_id,v.scope_item_id)=(p.tenant_id,p.job_id,p.scope_item_id) ORDER BY v.created_at,v.id LIMIT 1),
          'Scope item') AS description
        FROM app.scope_progress p WHERE (p.tenant_id,p.job_id)=($1,$2) AND p.stage IN('in_progress','complete')
          AND p.updated_at>=$3 AND p.updated_at<$4`, keys);
      const issues = await db.$client.query<{ variationId: string; description: string; at: Date }>(`
        SELECT v.id AS "variationId",v.description,v.created_at AS at FROM app.variation v
        WHERE (v.tenant_id,v.job_id)=($1,$2) AND v.existing_scope_item_id IS NULL AND v.created_at>=$3 AND v.created_at<$4`, keys);
      // Goods receipts always point at a supplier document, so the delivery document is the one cited.
      // Only ready documents count: a held (quarantined) duplicate is under review, not another delivery.
      const deliveries = await db.$client.query<{ kind: "delivery_document"; sourceId: string; label: string; at: Date }>(`
        SELECT 'delivery_document' AS kind,d.id AS "sourceId",d.supplier_context||coalesce(' '||d.document_number,'') AS label,d.created_at AS at
        FROM app.supplier_document d WHERE (d.tenant_id,d.job_id)=($1,$2) AND d.document_type='delivery' AND d.status='ready' AND d.created_at>=$3 AND d.created_at<$4`, keys);
      const photos = await db.$client.query<{ evidenceId: string; evidenceType: string; scopeItemId: string | null; at: Date }>(`
        SELECT e.id AS "evidenceId",e.evidence_type AS "evidenceType",e.scope_item_id AS "scopeItemId",e.server_verified_at AS at
        FROM app.evidence_object e WHERE (e.tenant_id,e.job_id)=($1,$2) AND e.kind='original' AND e.content_type LIKE 'image/%'
          AND e.server_verified_at>=$3 AND e.server_verified_at<$4
          AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE (i.tenant_id,i.evidence_id)=(e.tenant_id,e.id))`, keys);
      return {
        workDone: work.rows.map(row => ({ ...row, at: iso(row.at) })),
        issues: issues.rows.map(row => ({ ...row, at: iso(row.at) })),
        deliveries: deliveries.rows.map(row => ({ ...row, at: iso(row.at) })),
        photos: photos.rows.map(row => ({ ...row, at: iso(row.at) })),
      };
    });
  }
}
