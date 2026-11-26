import type { Pool } from "pg";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/**
 * QW-6: whether a quote revision's quantities count as confirmed for a pack count.
 * A revision is confirmed once a document built from it was issued (sent) to the customer, which every
 * accepted quote also was, and that document has not since been declined or superseded.
 */
export class QuoteLinePackRepository {
  constructor(private readonly pool: Pool) {}

  async revisionConfirmed(context: VerifiedTenantContext, jobId: string, quoteRevisionId: string): Promise<boolean> {
    return withTenant(this.pool, context, async db => (await db.$client.query<{ confirmed: boolean }>(`
      SELECT EXISTS(SELECT 1 FROM app.quote_document_version d
        JOIN app.quote_send s ON (s.tenant_id,s.job_id,s.document_id,s.content_hash)=(d.tenant_id,d.job_id,d.id,d.content_hash)
        WHERE (d.tenant_id,d.job_id,d.quote_revision_id)=($1,$2,$3)
          AND NOT EXISTS(SELECT 1 FROM app.acceptance_event e
            WHERE (e.tenant_id,e.job_id,e.document_id)=(d.tenant_id,d.job_id,d.id) AND e.kind IN('declined','superseded'))) AS confirmed`,
      [context.tenantId, jobId, quoteRevisionId])).rows[0]?.confirmed === true);
  }
}
