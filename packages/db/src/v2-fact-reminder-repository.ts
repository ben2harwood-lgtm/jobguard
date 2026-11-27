import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch, type AuditEventInput } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { assertV2Recipient, captureV2Delivery } from "./v2-local-catcher.js";
import { reminderPlan } from "./v2-fact-reminder-policy.js";

export const factReminderCommandV1 = z.strictObject({
  version: z.literal("v2-fact-reminder-command.v1"),
  commandId: z.uuid().transform(value => value.toLowerCase()),
});
export type FactReminderCommand = z.input<typeof factReminderCommandV1>;

export class FactReminderError extends Error {
  constructor(readonly code: "REMINDER_INVALID_COMMAND" | "REMINDER_EDITOR_REQUIRED" | "REMINDER_COMMAND_CONFLICT" |
    "REMINDER_NOT_V2") {
    super(code);
  }
}

export type FactReminderRunResult = { reminded: string[]; unconfirmed: string[] };
export type FactReminderReceipt = FactReminderRunResult & { id: string; replayed: boolean };
export type FactReminderRow = { requestId: string; kind: "reminder" | "unconfirmed"; reason: "no_reply" | "link_expired" | null;
  dueAt: Date; recordedAt: Date };
export type FactReminderView = { reminders: FactReminderRow[] };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

type Candidate = { id: string; factId: string; factVersion: number; contactEmail: string; neededBy: string;
  requestedAt: Date; expiresAt: Date; replied: boolean; cancelled: boolean; current: boolean; factOpen: boolean;
  reminder: boolean; unconfirmed: boolean };

// Everything the timing rule reads, for the job's requests that still lack a row.
const candidates = `SELECT r.id, r.fact_id AS "factId", r.fact_version AS "factVersion", r.contact_email AS "contactEmail",
    f.needed_by::text AS "neededBy", r.requested_at AS "requestedAt", r.expires_at AS "expiresAt",
    EXISTS (SELECT FROM app.v2_fact_reply a WHERE (a.tenant_id, a.job_id, a.fact_id, a.fact_version)
      = (r.tenant_id, r.job_id, r.fact_id, r.fact_version)) AS replied,
    EXISTS (SELECT FROM app.v2_fact_reply_cancel c WHERE (c.tenant_id, c.job_id, c.request_id) = (r.tenant_id, r.job_id, r.id)) AS cancelled,
    app.v2_fact_reply_current(r) AS current,
    (SELECT c.status FROM app.v2_open_fact_change c WHERE (c.tenant_id, c.job_id, c.fact_id) = (r.tenant_id, r.job_id, r.fact_id)
      ORDER BY c.expected_version DESC LIMIT 1) = 'open' AS "factOpen",
    EXISTS (SELECT FROM app.v2_fact_reminder m WHERE (m.tenant_id, m.job_id, m.request_id, m.kind)
      = (r.tenant_id, r.job_id, r.id, 'reminder')) AS reminder,
    EXISTS (SELECT FROM app.v2_fact_reminder m WHERE (m.tenant_id, m.job_id, m.request_id, m.kind)
      = (r.tenant_id, r.job_id, r.id, 'unconfirmed')) AS unconfirmed
  FROM app.v2_fact_reply_request r
  JOIN app.v2_open_fact f ON (f.tenant_id, f.job_id, f.id) = (r.tenant_id, r.job_id, r.fact_id)
  WHERE (r.tenant_id, r.job_id) = ($1, $2) AND (SELECT count(*) FROM app.v2_fact_reminder m
    WHERE (m.tenant_id, m.job_id, m.request_id) = (r.tenant_id, r.job_id, r.id)) < 2`;

// V2-E7: at most one reminder per unanswered E2 request, to the local catcher
// only, and an "unconfirmed" flag from 08:00 London the day before it is needed.
export class FactReminderRepository {
  constructor(private readonly pool: Pool, private readonly clock: () => number = Date.now) {}

  async read(context: VerifiedTenantContext, jobId: string): Promise<FactReminderView> {
    return withTenant(this.pool, context, async ({ $client }) => {
      const { rows } = await $client.query<FactReminderRow>(`SELECT request_id AS "requestId", kind, reason,
        due_at AS "dueAt", recorded_at AS "recordedAt" FROM app.v2_fact_reminder
        WHERE (tenant_id, job_id) = ($1, $2) ORDER BY recorded_at, request_id, kind`, [context.tenantId, jobId]);
      return { reminders: rows };
    });
  }

  async run(context: VerifiedTenantContext, jobId: string, sessionId: string, input: FactReminderCommand): Promise<FactReminderReceipt> {
    const parsed = factReminderCommandV1.safeParse(input);
    if (!parsed.success) throw new FactReminderError("REMINDER_INVALID_COMMAND");
    const { commandId } = parsed.data;
    const digest = sha256(JSON.stringify({ jobId, input: { commandId, version: parsed.data.version } }));
    const tenantId = context.tenantId;
    const sends: string[] = [];
    const receipt = await withTenant(this.pool, context, async database => {
      const { $client } = database;
      // Practice only, and the same editor check as E2's builder commands.
      const { rows: [actor] } = await $client.query<{ id: string | null; v2: boolean }>(
        "SELECT app.v2_work_plan_editor($1) AS id, current_database() = 'jobguard_v2_local' AS v2", [sha256(sessionId)]);
      if (!actor?.v2) throw new FactReminderError("REMINDER_NOT_V2");
      if (!actor.id) throw new FactReminderError("REMINDER_EDITOR_REQUIRED");
      // E2's key space (hashtextextended(tenant:key, 2013)). Order: this job's runs, then the
      // job's recipients, then each fact ascending, then each request ascending. E2's recipient
      // correction takes only the recipient lock; apply takes fact then request; request, paste
      // and cancel take one of them; the link reply takes the request.
      const lock = (key: string) => $client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2013))", [`${tenantId}:${key}`]);
      await lock(`reminders:${jobId}`);
      // A recipient correction can't commit between the re-read below and this run's commit.
      await lock(`recipient:${jobId}`);
      const { rows: [prior] } = await $client.query<{ requestDigest: string; actor: string; result: FactReminderRunResult }>(
        `SELECT request_digest AS "requestDigest", actor_membership_id AS actor, result FROM app.v2_fact_reminder_run
        WHERE (tenant_id, job_id, id) = ($1, $2, $3)`, [tenantId, jobId, commandId]);
      if (prior) {
        if (prior.requestDigest !== digest || prior.actor !== actor.id) throw new FactReminderError("REMINDER_COMMAND_CONFLICT");
        return { id: commandId, replayed: true, ...prior.result };
      }
      const { rows: keys } = await $client.query<{ id: string; factId: string }>(
        `SELECT c.id, c."factId" FROM (${candidates}) c`, [tenantId, jobId]);
      for (const factId of [...new Set(keys.map(key => key.factId))].sort()) await lock(`fact:${factId}`);
      for (const requestId of keys.map(key => key.id).sort()) await lock(requestId);
      // Read again under the locks: a reply, cancel or newer request committed meanwhile is
      // seen. A request first seen now was not locked, so it waits for the next run.
      const locked = new Set(keys.map(key => key.id));
      const rows = (await $client.query<Candidate>(`${candidates} ORDER BY r.requested_at, r.id`, [tenantId, jobId])).rows
        .filter(row => locked.has(row.id));
      const now = this.clock();
      const due: { row: Candidate; kind: "reminder" | "unconfirmed"; reason: string | null; dueAt: number }[] = [];
      for (const row of rows) {
        const plan = reminderPlan({ neededBy: row.neededBy, requestedAt: row.requestedAt.getTime(), expiresAt: row.expiresAt.getTime(),
          replied: row.replied, cancelled: row.cancelled, current: row.current, factOpen: row.factOpen === true,
          has: { reminder: row.reminder, unconfirmed: row.unconfirmed } }, now);
        if (plan.remind) {
          // A recipient the catcher refuses gets no reminder, and nothing is recorded for it.
          let allowed = true;
          try { assertV2Recipient(row.contactEmail); } catch { allowed = false; }
          if (allowed) due.push({ row, kind: "reminder", reason: null, dueAt: plan.remind.dueAt });
        }
        if (plan.unconfirmed) due.push({ row, kind: "unconfirmed", reason: plan.unconfirmed.reason, dueAt: plan.unconfirmed.dueAt });
      }
      const result: FactReminderRunResult = {
        reminded: due.filter(entry => entry.kind === "reminder").map(entry => entry.row.id),
        unconfirmed: due.filter(entry => entry.kind === "unconfirmed").map(entry => entry.row.id),
      };
      const recordedAt = new Date(now);
      await $client.query(`INSERT INTO app.v2_fact_reminder_run (tenant_id, job_id, id, request_digest, result,
        actor_membership_id, recorded_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [tenantId, jobId, commandId, digest, JSON.stringify(result), actor.id, recordedAt]);
      const events: AuditEventInput[] = [];
      for (const entry of due) {
        await $client.query(`INSERT INTO app.v2_fact_reminder (tenant_id, job_id, request_id, kind, reason, due_at, recorded_at,
          recipient, run_id, actor_membership_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [tenantId, jobId, entry.row.id, entry.kind, entry.reason, new Date(entry.dueAt), recordedAt,
          entry.kind === "reminder" ? entry.row.contactEmail : null, commandId, actor.id]);
        // References only: no email, question or answer text enters the chain.
        events.push({ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor.id}`,
          eventType: entry.kind === "reminder" ? "v2.fact_reminder.sent" : "v2.fact_reminder.unconfirmed",
          subjectType: "job", subjectRef: jobId, payload: { references: { commandId, runId: commandId, requestId: entry.row.id,
            factId: entry.row.factId, factVersion: String(entry.row.factVersion), ...(entry.reason && { reason: entry.reason }) },
          hashes: { request: digest }, classifications: { action: "operational" } } });
        if (entry.kind === "reminder") sends.push(entry.row.contactEmail);
      }
      if (events.length) await appendAuditBatch(database, events);
      return { id: commandId, replayed: false, ...result };
    });
    // After commit only, once per new reminder: metadata to the local catcher. It
    // carries no new link (E2 keeps only the token hash) and no message body.
    for (const to of sends) captureV2Delivery("v2_fact_reminder", to);
    return receipt;
  }
}
