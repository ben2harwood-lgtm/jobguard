// V2-G9: after the handover release (G3), one check-up offer at 6 months and one at 12, only when the
// builder switched aftercare on for that job. Each is sent once. The rule lives in app.v2_aftercare_due
// (migration 2086); the insert guard enforces it.
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { assertV2Recipient, captureV2Delivery } from "./v2-local-catcher.js";

export const aftercareSwitchV1 = z.strictObject({ version: z.literal("v2-aftercare-switch.v1"), commandId: z.guid(), enabled: z.boolean() });
export const aftercareSendV1 = z.strictObject({ version: z.literal("v2-aftercare-send.v1"), commandId: z.guid() });
export type AftercareSwitch = z.input<typeof aftercareSwitchV1>;
export type AftercareSend = z.input<typeof aftercareSendV1>;

export type AftercareState = "off" | "no_release" | "recipient_changed" | "too_soon" | "due" | "done";
export type AftercareView = { enabled: boolean; state: AftercareState; months: 6 | 12 | null; nextAt: string | null;
  offers: { months: 6 | 12; sentAt: string }[] };

export class AftercareError extends Error {
  constructor(readonly code: "AFTERCARE_INVALID_COMMAND" | "AFTERCARE_NOT_FOUND" | "AFTERCARE_COMMAND_CONFLICT" | "AFTERCARE_NOT_DUE",
    readonly state?: AftercareState) { super(code); }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
type Client = { query: Pool["query"] };
type Due = { state: AftercareState; enabled: boolean; releaseId: string | null; recipient: string | null; months: 6 | 12 | null; nextAt: string | null };

export class AftercareRepository {
  constructor(private readonly pool: Pool) {}

  private async due(client: Client, tenantId: string, jobId: string) {
    return (await client.query<{ due: Due }>("SELECT app.v2_aftercare_due($1, $2) AS due", [tenantId, jobId])).rows[0]!.due;
  }

  private async view(client: Client, tenantId: string, jobId: string): Promise<AftercareView> {
    const due = await this.due(client, tenantId, jobId);
    const offers = (await client.query<{ months: 6 | 12; sentAt: string }>(`SELECT at_months AS months, sent_at::text AS "sentAt"
      FROM app.v2_aftercare_offer WHERE (tenant_id, job_id) = ($1, $2) ORDER BY at_months`, [tenantId, jobId])).rows;
    return { enabled: due.enabled, state: due.state, months: due.months, nextAt: due.nextAt ? new Date(due.nextAt).toISOString() : null, offers };
  }

  /** Builder: the switch, which offer is due, and when the next one is. */
  read(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async ({ $client }) => {
      if (!(await $client.query("SELECT 1 FROM app.job WHERE (tenant_id, id) = ($1, $2)", [context.tenantId, jobId])).rowCount)
        throw new AftercareError("AFTERCARE_NOT_FOUND");
      return this.view($client, context.tenantId, jobId);
    });
  }

  /** Builder: switch on or off, or send the offer that is due now. A replay returns the stored result and delivers nothing. */
  async command(context: VerifiedTenantContext, jobId: string, sessionId: string, raw: unknown) {
    const send = (raw as { version?: unknown } | null)?.version === "v2-aftercare-send.v1";
    const parsed = send ? aftercareSendV1.safeParse(raw) : aftercareSwitchV1.safeParse(raw);
    if (!parsed.success) throw new AftercareError("AFTERCARE_INVALID_COMMAND");
    const command = parsed.data;
    const result = await withTenant(this.pool, context, async db => {
      const client = db.$client;
      const actor = (await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [sha256(sessionId)])).rows[0]?.id;
      if (!actor) throw new AftercareError("AFTERCARE_NOT_FOUND");
      // G2's handover lock: a send never interleaves with a release, a link stop or a save of the same job.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2043))", [`handover:${jobId}`]);
      const requestHash = sha256(JSON.stringify({ jobId, actor, command }));
      const table = send ? "app.v2_aftercare_offer" : "app.v2_aftercare_switch";
      const prior = (await client.query<{ jobId: string; requestHash: string }>(`SELECT job_id AS "jobId", request_hash AS "requestHash"
        FROM ${table} WHERE (tenant_id, command_id) = ($1, $2)`, [context.tenantId, command.commandId])).rows[0];
      if (prior) {
        if (prior.jobId !== jobId || prior.requestHash !== requestHash) throw new AftercareError("AFTERCARE_COMMAND_CONFLICT");
        return { view: await this.view(client, context.tenantId, jobId), recipient: null, replayed: true };
      }
      if (!send) {
        const enabled = (command as z.output<typeof aftercareSwitchV1>).enabled;
        await client.query(`INSERT INTO app.v2_aftercare_switch (tenant_id, job_id, id, enabled, command_id, request_hash, actor_membership_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)`, [context.tenantId, jobId, randomUUID(), enabled, command.commandId, requestHash, actor]);
        await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`, eventType: "v2.aftercare.switched",
          subjectType: "job", subjectRef: jobId, payload: { references: { commandId: command.commandId, enabled: String(enabled) },
            hashes: { request: requestHash }, classifications: { action: "operational" } } }]);
        return { view: await this.view(client, context.tenantId, jobId), recipient: null, replayed: false };
      }
      const due = await this.due(client, context.tenantId, jobId);
      if (due.state !== "due") throw new AftercareError("AFTERCARE_NOT_DUE", due.state);
      const recipient = due.recipient!;
      assertV2Recipient(recipient);
      try {
        await client.query(`INSERT INTO app.v2_aftercare_offer (tenant_id, job_id, at_months, release_id, recipient_email, command_id, request_hash,
          actor_membership_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [context.tenantId, jobId, due.months, due.releaseId, recipient, command.commandId, requestHash, actor]);
      } catch (error) {
        if (/V2_AFTERCARE_NOT_DUE/u.test((error as Error).message)) throw new AftercareError("AFTERCARE_NOT_DUE");
        throw error;
      }
      // References only: no email and no message text.
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`, eventType: "v2.aftercare.offered",
        subjectType: "job", subjectRef: jobId, payload: { references: { commandId: command.commandId, releaseId: due.releaseId!, months: String(due.months) },
          hashes: { request: requestHash, recipient: sha256(recipient) }, classifications: { action: "operational" } } }]);
      return { view: await this.view(client, context.tenantId, jobId), recipient, replayed: false };
    });
    // After commit, once per new offer: the local catcher only (metadata, never a message body).
    if (result.recipient) captureV2Delivery("v2_aftercare_offer", result.recipient);
    return { ...result.view, replayed: result.replayed };
  }
}
