// V2-G8: one polite review request a week after the handover release (G3), only when the builder
// switched it on for that job, never repeated, none while the final invoice is unpaid or a recovery
// case is open. The rule lives in app.v2_review_request_due (migration 2085); the insert guard enforces it.
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { assertV2Recipient, captureV2Delivery } from "./v2-local-catcher.js";

export const reviewRequestSwitchV1 = z.strictObject({ version: z.literal("v2-review-request-switch.v1"), commandId: z.guid(),
  enabled: z.boolean() });
export const reviewRequestSendV1 = z.strictObject({ version: z.literal("v2-review-request-send.v1"), commandId: z.guid() });
export type ReviewRequestSwitch = z.input<typeof reviewRequestSwitchV1>;
export type ReviewRequestSend = z.input<typeof reviewRequestSendV1>;

export type ReviewRequestState = "off" | "no_release" | "recipient_changed" | "open_dispute" | "unpaid_invoice" | "too_soon" | "due" | "sent";
export type ReviewRequestView = { enabled: boolean; state: ReviewRequestState; dueAt: string | null; sentAt: string | null;
  recipient: string | null };

export class ReviewRequestError extends Error {
  constructor(readonly code: "REVIEW_REQUEST_INVALID_COMMAND" | "REVIEW_REQUEST_NOT_FOUND" | "REVIEW_REQUEST_COMMAND_CONFLICT" |
    "REVIEW_REQUEST_NOT_DUE" | "REVIEW_REQUEST_ALREADY_SENT", readonly state?: ReviewRequestState) { super(code); }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
type Client = { query: Pool["query"] };
type Due = { state: Exclude<ReviewRequestState, "sent">; enabled: boolean; releaseId: string | null; recipient: string | null; dueAt: string | null };

export class ReviewRequestRepository {
  constructor(private readonly pool: Pool) {}

  private async view(client: Client, tenantId: string, jobId: string): Promise<ReviewRequestView> {
    const due = (await client.query<{ due: Due }>("SELECT app.v2_review_request_due($1, $2) AS due", [tenantId, jobId])).rows[0]!.due;
    const sent = (await client.query<{ sentAt: string; recipient: string }>(`SELECT sent_at::text AS "sentAt", recipient_email AS recipient
      FROM app.v2_review_request WHERE (tenant_id, job_id) = ($1, $2)`, [tenantId, jobId])).rows[0];
    if (sent) return { enabled: due.enabled, state: "sent", dueAt: null, sentAt: sent.sentAt, recipient: sent.recipient };
    return { enabled: due.enabled, state: due.state, dueAt: due.dueAt ? new Date(due.dueAt).toISOString() : null, sentAt: null,
      recipient: due.recipient };
  }

  /** Builder: the switch, whether the request is due, and why not. */
  read(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async ({ $client }) => {
      if (!(await $client.query("SELECT 1 FROM app.job WHERE (tenant_id, id) = ($1, $2)", [context.tenantId, jobId])).rowCount)
        throw new ReviewRequestError("REVIEW_REQUEST_NOT_FOUND");
      return this.view($client, context.tenantId, jobId);
    });
  }

  /** Builder: switch on or off, or send the one request now. A replay returns the stored result and delivers nothing. */
  async command(context: VerifiedTenantContext, jobId: string, sessionId: string, raw: unknown) {
    const send = (raw as { version?: unknown } | null)?.version === "v2-review-request-send.v1";
    const parsed = send ? reviewRequestSendV1.safeParse(raw) : reviewRequestSwitchV1.safeParse(raw);
    if (!parsed.success) throw new ReviewRequestError("REVIEW_REQUEST_INVALID_COMMAND");
    const command = parsed.data;
    const result = await withTenant(this.pool, context, async db => {
      const client = db.$client;
      const actor = (await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [sha256(sessionId)])).rows[0]?.id;
      if (!actor) throw new ReviewRequestError("REVIEW_REQUEST_NOT_FOUND");
      // G2's handover lock: a send never interleaves with a release, a link stop or a save of the same job.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2043))", [`handover:${jobId}`]);
      const requestHash = sha256(JSON.stringify({ jobId, actor, command }));
      const table = send ? "app.v2_review_request" : "app.v2_review_request_switch";
      const prior = (await client.query<{ jobId: string; requestHash: string }>(`SELECT job_id AS "jobId", request_hash AS "requestHash"
        FROM ${table} WHERE (tenant_id, command_id) = ($1, $2)`, [context.tenantId, command.commandId])).rows[0];
      if (prior) {
        if (prior.jobId !== jobId || prior.requestHash !== requestHash) throw new ReviewRequestError("REVIEW_REQUEST_COMMAND_CONFLICT");
        return { view: await this.view(client, context.tenantId, jobId), recipient: null, replayed: true };
      }
      const view = await this.view(client, context.tenantId, jobId);
      if (!send) {
        const enabled = (command as z.output<typeof reviewRequestSwitchV1>).enabled;
        await client.query(`INSERT INTO app.v2_review_request_switch (tenant_id, job_id, id, enabled, command_id, request_hash, actor_membership_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)`, [context.tenantId, jobId, randomUUID(), enabled, command.commandId, requestHash, actor]);
        await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`, eventType: "v2.review_request.switched",
          subjectType: "job", subjectRef: jobId, payload: { references: { commandId: command.commandId, enabled: String(enabled) },
            hashes: { request: requestHash }, classifications: { action: "operational" } } }]);
        return { view: await this.view(client, context.tenantId, jobId), recipient: null, replayed: false };
      }
      if (view.state === "sent") throw new ReviewRequestError("REVIEW_REQUEST_ALREADY_SENT", "sent");
      if (view.state !== "due") throw new ReviewRequestError("REVIEW_REQUEST_NOT_DUE", view.state);
      const due = (await client.query<{ due: Due }>("SELECT app.v2_review_request_due($1, $2) AS due", [context.tenantId, jobId])).rows[0]!.due;
      const recipient = due.recipient!;
      assertV2Recipient(recipient);
      try {
        await client.query(`INSERT INTO app.v2_review_request (tenant_id, job_id, release_id, recipient_email, command_id, request_hash, actor_membership_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)`, [context.tenantId, jobId, due.releaseId, recipient, command.commandId, requestHash, actor]);
      } catch (error) {
        if (/V2_REVIEW_REQUEST_NOT_DUE/u.test((error as Error).message)) throw new ReviewRequestError("REVIEW_REQUEST_NOT_DUE");
        throw error;
      }
      // References only: no email and no message text.
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`, eventType: "v2.review_request.sent",
        subjectType: "job", subjectRef: jobId, payload: { references: { commandId: command.commandId, releaseId: due.releaseId! },
          hashes: { request: requestHash, recipient: sha256(recipient) }, classifications: { action: "operational" } } }]);
      return { view: await this.view(client, context.tenantId, jobId), recipient, replayed: false };
    });
    // After commit, once per new request: the local catcher only (metadata, never a message body).
    if (result.recipient) captureV2Delivery("v2_review_request", result.recipient);
    return { ...result.view, replayed: result.replayed };
  }
}
