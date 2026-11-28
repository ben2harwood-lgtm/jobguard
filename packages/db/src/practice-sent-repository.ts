import type { Pool } from "pg";
import { practiceOwnedJobsSql } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/**
 * V2-SQ-A: what this firm's practice workspace has "sent", newest first. Read only, from the delivery records that
 * already exist (quote sends and their outbox action). Only jobs this practice session owns are listed: a shared
 * practice tenant holds other sessions' jobs, so tenant visibility alone is not enough (practiceOwnedJobsSql).
 */
export type PracticeSentItem = { kind: "quote"; sendId: string; jobId: string; jobTitle: string; documentId: string;
  reference: string; documentVersion: number; contentHash: string; recipients: string[]; sentAt: string;
  status: "queued" | "simulated_delivery" | "outcome_unknown" | "cancelled"; practice: true };

export class PracticeSentRepository {
  constructor(private readonly pool: Pool) {}

  list(context: VerifiedTenantContext, ownerDigest: string, limit = 100): Promise<PracticeSentItem[]> {
    return withTenant(this.pool, context, async ({ $client }) => (await $client.query<Omit<PracticeSentItem, "kind" | "practice" | "status"> & { outbox: string | null }>(`${practiceOwnedJobsSql("$2")}
      SELECT s.id AS "sendId", j.id AS "jobId", j.title AS "jobTitle", d.id AS "documentId", d.reference,
        d.document_version AS "documentVersion", s.content_hash AS "contentHash",
        ARRAY(SELECT coalesce(r->>'email', r #>> '{}') FROM jsonb_array_elements(s.recipients) r) AS recipients,
        to_char(s.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "sentAt", o.status AS outbox
      FROM app.quote_send s
      JOIN app.job j ON (j.tenant_id, j.id) = (s.tenant_id, s.job_id)
      JOIN app.quote_document_version d ON (d.tenant_id, d.id, d.content_hash) = (s.tenant_id, s.document_id, s.content_hash)
      LEFT JOIN app.action_outbox o ON (o.tenant_id, o.id) = (s.tenant_id, s.outbox_action_id)
      WHERE s.tenant_id = $1 AND s.job_id IN (SELECT id FROM practice_owned_job)
      ORDER BY s.issued_at DESC, s.id DESC LIMIT $3`, [context.tenantId, ownerDigest, limit])).rows
      .map(({ outbox, ...row }) => ({ kind: "quote" as const, ...row, practice: true as const,
        status: outbox === "succeeded" ? "simulated_delivery" as const : outbox === "outcome_unknown" ? "outcome_unknown" as const
          : outbox === "cancelled" ? "cancelled" as const : "queued" as const })));
  }
}
