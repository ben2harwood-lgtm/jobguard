import { utcDatetimeV1 } from "@jobguard/core";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { money, type CommercialIntegrityFact } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { PracticeAccessError, practiceOwnedJobsSql } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const reviewV1 = z.object({
  version: z.literal("commercial-integrity-review.v1"), commandId: z.guid({ error: "Invalid uuid" }),
  findingKey: z.string().min(1), explanation: z.string().trim().min(1).max(500),
  outcome: z.literal("dismissed_false_positive"),
}).strict();
const feedbackV1 = reviewV1.extend({ jobId: z.guid({ error: "Invalid uuid" }), recordedAt: utcDatetimeV1 });
const commandType = "commercial_integrity.review";

/** Existing operational receipts retain feedback; no Decision, authority or money is created. */
export class CommercialIntegrityApplicationRepository {
  constructor(private readonly pool: Pool) {}

  async read(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async db => {
      const row = (await db.$client.query<{
        accepted: string | null; cap: string | null; quoted: string | null; final: string | null;
        accepted_source: string | null; quoted_source: string | null; final_source: string | null;
        accepted_at: Date | null; activated_at: Date | null;
        activity_at: Date | null; discussed_at: Date | null; outside_at: Date | null; landing_at: Date | null;
      }>(`SELECT coalesce(j.accepted_net_value_pence,aq.net_value_pence,av.net_value_pence) accepted,
        j.recovery_cap_pence cap,coalesce(q.net_value_pence,aq.net_value_pence,qv.net_value_pence) quoted,
        coalesce(f.net_pence,fv.net_value_pence) final,
        coalesce(j.baseline_quote_version_id,j.accepted_quote_version_id,av.source_ref)::text accepted_source,
        coalesce(q.id,aq.id,qv.source_ref)::text quoted_source,coalesce(f.id,fv.source_ref)::text final_source,
        qa.accepted_at,ja.activated_at,a.activity_at,a.discussed_at,a.outside_at,l.landing_at
        FROM app.job j
        LEFT JOIN app.quote_version aq ON (aq.tenant_id,aq.job_id,aq.id)=(j.tenant_id,j.id,j.accepted_quote_version_id)
        LEFT JOIN LATERAL (SELECT v.id,(v.snapshot->>'netPence')::bigint net_value_pence FROM app.quote_send s
          JOIN app.quote_document_version v ON (v.tenant_id,v.job_id,v.id)=(s.tenant_id,s.job_id,s.document_id)
          WHERE s.tenant_id=j.tenant_id AND s.job_id=j.id ORDER BY s.issued_at DESC,s.id DESC LIMIT 1) q ON true
        LEFT JOIN app.final_account_draft fd ON (fd.tenant_id,fd.job_id)=(j.tenant_id,j.id)
        LEFT JOIN app.final_account_revision f ON (f.tenant_id,f.job_id,f.id)=(j.tenant_id,j.id,fd.current_revision_id)
        LEFT JOIN LATERAL (SELECT accepted_at FROM app.quote_acceptance WHERE tenant_id=j.tenant_id AND job_id=j.id
          AND document_id=j.accepted_quote_version_id ORDER BY accepted_at DESC,id DESC LIMIT 1) qa ON true
        LEFT JOIN app.job_activation ja ON (ja.tenant_id,ja.job_id)=(j.tenant_id,j.id)
        LEFT JOIN LATERAL (SELECT net_value_pence,source_ref FROM app.commercial_integrity_value_fact
          WHERE tenant_id=j.tenant_id AND job_id=j.id AND value_kind='accepted' AND synthetic
          ORDER BY occurred_at DESC,id DESC LIMIT 1) av ON true
        LEFT JOIN LATERAL (SELECT net_value_pence,source_ref FROM app.commercial_integrity_value_fact
          WHERE tenant_id=j.tenant_id AND job_id=j.id AND value_kind='quoted' AND synthetic
          ORDER BY occurred_at DESC,id DESC LIMIT 1) qv ON true
        LEFT JOIN LATERAL (SELECT net_value_pence,source_ref FROM app.commercial_integrity_value_fact
          WHERE tenant_id=j.tenant_id AND job_id=j.id AND value_kind='final' AND synthetic
          ORDER BY occurred_at DESC,id DESC LIMIT 1) fv ON true
        LEFT JOIN LATERAL (SELECT max(occurred_at) FILTER (WHERE activity_kind='site_activity') activity_at,
          max(occurred_at) FILTER (WHERE activity_kind='recovery_discussed') discussed_at,
          max(occurred_at) FILTER (WHERE activity_kind='outside_app_settlement') outside_at
          FROM app.commercial_integrity_activity_fact WHERE tenant_id=j.tenant_id AND job_id=j.id AND synthetic) a ON true
        LEFT JOIN LATERAL (SELECT max(created_at) landing_at FROM app.landing_allocation
          WHERE tenant_id=j.tenant_id AND job_id=j.id) l ON true
        WHERE j.tenant_id=$1 AND j.id=$2`, [context.tenantId, jobId])).rows[0];
      if (!row) throw new PracticeAccessError("NOT_FOUND");
      const sources: Record<string, string> = {};
      if (row.accepted_source) sources.accepted = `accepted:${row.accepted_source}`;
      if (row.quoted_source) sources.quoted = `quote:${row.quoted_source}`;
      if (row.final_source) sources.final = `final-account:${row.final_source}`;
      if (row.activity_at) sources.activity = `activity:${jobId}:${row.activity_at.toISOString()}`;
      if (row.outside_at) sources.outsideSettlement = `outside-settlement:${jobId}:${row.outside_at.toISOString()}`;
      const fact: CommercialIntegrityFact = {
        jobId, sources,
        ...(row.accepted !== null ? { acceptedNetValue: money(Number(row.accepted)) } : {}),
        ...(row.quoted !== null ? { quotedNetValue: money(Number(row.quoted)) } : {}),
        ...(row.final !== null ? { finalNetValue: money(Number(row.final)) } : {}),
        ...(row.accepted_at ? { acceptedAt: row.accepted_at.getTime() } : {}),
        ...(row.activated_at ? { startedAt: row.activated_at.getTime() } : {}),
        ...(row.activity_at ? { lastLiveActivityAt: row.activity_at.getTime() } : {}),
        ...(row.discussed_at ? { recoveryDiscussedAt: row.discussed_at.getTime() } : {}),
        ...(row.outside_at ? { outsideAppSettlementReportedAt: row.outside_at.getTime() } : {}),
        ...(row.landing_at ? { inAppLandingAt: row.landing_at.getTime() } : {}),
      };
      const feedback = (await db.$client.query<{ result: unknown }>(`SELECT result FROM app.command_receipt
        WHERE tenant_id=$1 AND command_type=$3 AND status='succeeded' AND result->>'jobId'=$2
        ORDER BY created_at,command_id`, [context.tenantId, jobId, commandType])).rows.map(x => feedbackV1.parse(x.result));
      return { facts: [fact], feedback,
        capBasisPence: row.accepted === null ? null : money(Number(row.accepted)).pence,
        acceptedCapPence: row.cap === null ? null : money(Number(row.cap)).pence };
    });
  }

  async review(context: VerifiedTenantContext, membershipId: string, jobId: string, raw: unknown, digest: string) {
    const input = reviewV1.parse(raw);
    const requestHash = createHash("sha256").update(JSON.stringify({ jobId, ...input })).digest("hex");
    return withTenant(this.pool, context, async db => {
      const member = (await db.$client.query(`SELECT id FROM app.membership WHERE tenant_id=$1 AND id=$2
        AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`,
      [context.tenantId, membershipId])).rows[0];
      const owned = (await db.$client.query(practiceOwnedJobsSql("$2") + " SELECT id FROM practice_owned_job WHERE id=$3",
        [context.tenantId, digest, jobId])).rows[0];
      if (!member || !owned) throw new PracticeAccessError("NOT_FOUND");
      // Complete receipt and feedback are one insert. A racing replay waits on
      // uniqueness; all business work precedes the audit head lock.
      const result = feedbackV1.parse({ jobId, ...input, recordedAt: new Date().toISOString() });
      const inserted = await db.$client.query(`INSERT INTO app.command_receipt
        (command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
        VALUES($1,$2,$3,$4,$5,'succeeded',$6::jsonb,$7,clock_timestamp()) ON CONFLICT DO NOTHING RETURNING command_id`,
      [input.commandId, context.tenantId, commandType, `${jobId}:${input.commandId}`, requestHash, JSON.stringify(result), membershipId]);
      if (!inserted.rowCount) {
        const prior = (await db.$client.query<{ request_hash: string; status: string; result: unknown }>(
          "SELECT request_hash,status,result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",
          [context.tenantId, input.commandId])).rows[0];
        if (!prior || prior.request_hash !== requestHash || prior.status !== "succeeded") throw new Error("IDEMPOTENCY_CONFLICT");
        return feedbackV1.parse(prior.result);
      }
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${membershipId}`,
        eventType: "commercial_integrity.reviewed", subjectType: "job", subjectRef: jobId,
        payload: { references: { jobId, commandId: input.commandId }, hashes: { requestHash },
          classifications: { action: "operational" } } }]);
      return result;
    });
  }
}
