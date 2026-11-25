import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { assertV2Recipient, captureV2Delivery } from "./v2-local-catcher.js";
import { WorkPlanRepository } from "./v2-work-plan-repository.js";
import { fridayCommandV1, fridayContentFromPlan, fridayContentV1, fridayMessage, fridayWeekDates,
  type FridayCommand, type FridaySnapshot } from "./v2-friday-update.js";

export class FridayUpdateError extends Error {
  constructor(readonly code: "NOT_FOUND" | "FRIDAY_CONFLICT" | "FRIDAY_STALE" | "FRIDAY_CONTACT_REQUIRED" | "FRIDAY_PREPARE_REQUIRED" | "SYNTHETIC_MODE_REQUIRED") { super(code); }
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const columns = `command_id AS "commandId", week::text, sequence, content_version AS "contentVersion", content,
  content_hash::text AS "contentHash", recipient, sent_at::text AS "sentAt", sent_by::text AS "sentBy"`;

export class FridayUpdateRepository {
  constructor(private readonly pool: Pool) {}
  private mode() {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") throw new FridayUpdateError("SYNTHETIC_MODE_REQUIRED");
  }
  async read(context: VerifiedTenantContext, jobId: string, week: string) {
    this.mode(); fridayWeekDates(week);
    return withTenant(this.pool, context, async db => {
      await this.contact(db, context.tenantId, jobId);
      return this.latest(db, context.tenantId, jobId, week);
    });
  }
  async command(context: VerifiedTenantContext, jobId: string, sessionId: string, raw: FridayCommand) {
    this.mode();
    const command = fridayCommandV1.parse(raw);
    fridayWeekDates(command.week);
    // Read only: never call c3's open/generate path, which creates plans.
    const prepared = command.action === "prepare" ? await this.planContent(context, jobId, command.week) : null;
    const result = await withTenant(this.pool, context, async db => {
      const client = db.$client;
      const actor = (await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id",
        [createHash("sha256").update(sessionId).digest("hex")])).rows[0]?.id;
      if (!actor) throw new FridayUpdateError("NOT_FOUND");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`friday:${context.tenantId}:${jobId}`]);
      const recipient = await this.contact(db, context.tenantId, jobId);
      const requestHash = hash({ jobId, actor, command });
      const replay = (await client.query<FridaySnapshot & { requestHash: string }>(`SELECT ${columns}, request_hash::text AS "requestHash"
        FROM app.v2_friday_update WHERE tenant_id=$1 AND command_id=$2`, [context.tenantId, command.commandId])).rows[0];
      if (replay) {
        if (replay.requestHash !== requestHash) throw new FridayUpdateError("FRIDAY_CONFLICT");
        const { requestHash: _requestHash, ...snapshot } = replay;
        return { snapshot, captured: false };
      }
      const prior = await this.latest(db, context.tenantId, jobId, command.week);
      if ((prior?.sequence ?? 0) !== command.expectedVersion) throw new FridayUpdateError("FRIDAY_STALE");
      if (command.action !== "prepare" && !prior) throw new FridayUpdateError("FRIDAY_PREPARE_REQUIRED");
      if (command.action === "send" && (prior!.sentAt || prior!.contentHash !== command.contentHash || prior!.recipient !== recipient))
        throw new FridayUpdateError("FRIDAY_STALE");
      const content = fridayContentV1.parse(command.action === "prepare" ? prepared : command.action === "edit" ? command.content : prior!.content);
      const sequence = (prior?.sequence ?? 0) + 1;
      const contentVersion = (prior?.contentVersion ?? 0) + Number(command.action !== "send");
      // The sent row is the durable local inbox message; no provider or evidence paths exist here.
      if (command.action === "send") assertV2Recipient(recipient);
      const snapshot = (await client.query<FridaySnapshot>(`INSERT INTO app.v2_friday_update
        (tenant_id, job_id, command_id, week, sequence, content_version, action, content, content_hash,
         recipient, actor_membership_id, request_hash, client_created_at, sent_at, sent_by, catcher_message)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
          CASE WHEN $7='send' THEN clock_timestamp() END, CASE WHEN $7='send' THEN $11::uuid END,$14)
        RETURNING ${columns}`, [context.tenantId, jobId, command.commandId, command.week, sequence, contentVersion,
        command.action, JSON.stringify(content), hash(content), recipient, actor, requestHash, command.clientCreatedAt,
        command.action === "send" ? fridayMessage({ content, week: command.week }) : null])).rows[0]!;
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
        eventType: `v2.friday_update.${command.action === "prepare" ? "prepared" : command.action === "edit" ? "edited" : "sent_to_catcher"}`,
        subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: command.commandId, updateSequence: String(sequence) },
          hashes: { content: snapshot.contentHash }, classifications: { action: "operational" } } }]);
      return { snapshot, captured: command.action === "send" };
    });
    if (result.captured) captureV2Delivery("v2.friday_update", result.snapshot.recipient);
    return result.snapshot;
  }
  private async contact(db: TenantTransaction, tenantId: string, jobId: string) {
    const row = (await db.$client.query<{ recipient: string | null }>(`SELECT s.snapshot->'customer'->>'email' AS recipient
      FROM app.job j LEFT JOIN app.job_party_current c ON (c.tenant_id,c.job_id)=(j.tenant_id,j.id)
      LEFT JOIN app.job_party_snapshot s ON (s.tenant_id,s.binding_id)=(c.tenant_id,c.binding_id)
      WHERE (j.tenant_id,j.id)=($1,$2)`, [tenantId, jobId])).rows[0];
    if (!row) throw new FridayUpdateError("NOT_FOUND");
    if (!row.recipient) throw new FridayUpdateError("FRIDAY_CONTACT_REQUIRED");
    assertV2Recipient(row.recipient);
    return row.recipient;
  }
  private async latest(db: TenantTransaction, tenantId: string, jobId: string, week: string) {
    return (await db.$client.query<FridaySnapshot>(`SELECT ${columns} FROM app.v2_friday_update
      WHERE (tenant_id,job_id,week)=($1,$2,$3::date) ORDER BY sequence DESC LIMIT 1`, [tenantId, jobId, week])).rows[0] ?? null;
  }
  private async planContent(context: VerifiedTenantContext, jobId: string, week: string) {
    const quoteRevisionId = await withTenant(this.pool, context, async db => (await db.$client.query<{ id: string }>(`
      SELECT quote_revision_id AS id FROM app.v2_work_plan WHERE (tenant_id,job_id)=($1,$2)
      ORDER BY created_at DESC,quote_revision_id LIMIT 1`, [context.tenantId, jobId])).rows[0]?.id);
    const plan = quoteRevisionId ? await new WorkPlanRepository(this.pool).read(context,
      { version: "work-plan-source.v1", jobId, quoteRevisionId }) : null;
    return fridayContentFromPlan(week, plan?.tasks ?? []);
  }
}
