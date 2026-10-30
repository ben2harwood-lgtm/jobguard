import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { inboxMetricEventV1, inboxOutcomeMetrics, InboxMetricsError, type InboxMetricEvent } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.guid().transform(value => value.toLowerCase());
const recordV1 = z.object({ version: z.literal("inbox-metric-record.v1"),
  environment: z.literal("synthetic_demo"), jobId: uuid, receiptId: uuid, event: z.unknown() }).strict();
const scopeV1 = z.object({ version: z.literal("inbox-metrics.v1"), environment: z.literal("synthetic_demo"),
  jobId: uuid, asOf: z.iso.datetime() }).strict();
type Receipt = { job_id: string; request_hash: string; rejection: string | null; event: InboxMetricEvent | null };
const payload = (event: InboxMetricEvent) => JSON.stringify(inboxMetricEventV1.parse(event));
const allTime = "9999-12-31T23:59:59Z";
const scope = (tenantId: string, jobId: string, asOf = allTime) =>
  ({ version: "inbox-metrics.v1", environment: "synthetic_demo", tenantId, jobId, asOf });
const invalid = () => new InboxMetricsError("INVALID_METRICS_INPUT");

/** Dark synthetic metadata only. No public endpoint, provider, hidden source or commercial writes.
 * Invalid event bodies are hashed, never retained. Invalid envelopes have no trusted job/receipt and throw.
 * Serialize per tenant so command/event collisions across jobs and concurrent reference checks agree.
 */
export class InboxMetricsRepository {
  constructor(private readonly pool: Pool) {}

  async record(context: VerifiedTenantContext, raw: unknown) {
    const parsed = recordV1.safeParse(raw);
    if (!parsed.success) throw invalid();
    const input = parsed.data;
    const eventResult = inboxMetricEventV1.safeParse(input.event);
    const event = eventResult.success ? eventResult.data : null;
    let requestHash: string;
    try {
      requestHash = createHash("sha256").update(JSON.stringify({ jobId: input.jobId,
        event: event ?? input.event })).digest("hex");
    } catch { throw invalid(); }
    return withTenant(this.pool, context, async db => {
      if ((await db.$client.query("SELECT current_database() name")).rows[0].name !== "jobguard_synthetic_demo") throw invalid();
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,487))", [context.tenantId.toLowerCase()]);
      const prior = (await db.$client.query<Receipt>(
        "SELECT job_id,request_hash,rejection,event FROM app.inbox_metric_receipt WHERE tenant_id=$1 AND receipt_id=$2",
        [context.tenantId, input.receiptId])).rows[0];
      if (prior) {
        if (prior.job_id !== input.jobId || prior.request_hash !== requestHash) throw new InboxMetricsError("IDEMPOTENCY_CONFLICT");
        return { status: prior.rejection ? "rejected" as const : "accepted" as const, replay: true, rejection: prior.rejection };
      }
      // Do not manufacture a job or persist a cross-tenant body under its supplied tenant.
      if (!(await db.$client.query("SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2", [context.tenantId, input.jobId])).rowCount) throw invalid();
      let rejection: InboxMetricsError["code"] | null = null;
      if (!event || event.tenantId !== context.tenantId.toLowerCase() || event.jobId !== input.jobId) rejection = "INVALID_METRICS_INPUT";
      else {
        const duplicate = (await db.$client.query<Receipt>(
          "SELECT job_id,request_hash,rejection,event FROM app.inbox_metric_receipt WHERE tenant_id=$1 AND (event_id=$2 OR command_id=$3)",
          [context.tenantId, event.eventId, event.commandId])).rows;
        if (duplicate.length) {
          if (duplicate.length === 1 && duplicate[0]!.event && payload(duplicate[0]!.event!) === payload(event)) {
            return { status: "accepted" as const, replay: true, rejection: null };
          }
          rejection = "IDEMPOTENCY_CONFLICT";
        } else {
          const stored = (await db.$client.query<{ event: InboxMetricEvent }>(
            "SELECT event FROM app.inbox_metric_receipt WHERE tenant_id=$1 AND job_id=$2 AND rejection IS NULL",
            [context.tenantId, input.jobId])).rows.map(row => row.event);
          try { inboxOutcomeMetrics(scope(context.tenantId, input.jobId), [...stored, event]); }
          catch (error) {
            if (!(error instanceof InboxMetricsError)) throw error;
            rejection = error.code;
          }
        }
      }
      const audit = await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1",
        actorRef: "system:synthetic-inbox-metrics", eventType: "inbox.metrics_recorded", subjectType: "job", subjectRef: input.jobId,
        payload: { references: { jobId: input.jobId, receiptId: input.receiptId }, hashes: { requestHash },
          classifications: { action: "operational" } } }]);
      await db.$client.query(`INSERT INTO app.inbox_metric_receipt
        (tenant_id,job_id,receipt_id,request_hash,event_id,command_id,event,rejection,audit_event_id)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`, [context.tenantId, input.jobId, input.receiptId, requestHash,
        rejection ? null : event!.eventId, rejection ? null : event!.commandId,
        rejection ? null : payload(event!), rejection, audit[0]!.id]);
      return { status: rejection ? "rejected" as const : "accepted" as const, replay: false, rejection };
    });
  }

  async read(context: VerifiedTenantContext, raw: unknown) {
    const parsed = scopeV1.safeParse(raw);
    if (!parsed.success) throw invalid();
    return withTenant(this.pool, context, async db => {
      if ((await db.$client.query("SELECT current_database() name")).rows[0].name !== "jobguard_synthetic_demo") throw invalid();
      const rows = (await db.$client.query<{ event: InboxMetricEvent | null; rejection: string | null }>(
        "SELECT event,rejection FROM app.inbox_metric_receipt WHERE tenant_id=$1 AND job_id=$2", [context.tenantId, parsed.data.jobId])).rows;
      return { ...inboxOutcomeMetrics(scope(context.tenantId, parsed.data.jobId, parsed.data.asOf),
        rows.flatMap(row => row.event ? [row.event] : [])),
        // Receipt counters are lifetime ingestion counts; asOf applies only to business event metrics.
        ingestion: { accepted: rows.filter(row => !row.rejection).length, rejected: rows.filter(row => row.rejection).length } };
    });
  }
}
