import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { WatchdogError, claimCommandIdentity, requestHashFor, requireLiveJob } from "./watchdog.js";
import { CrewBriefRepository } from "./v2-crew-brief-repository.js";

const uuid = z.uuid().transform(value => value.toLowerCase());
export const progressPhotoStates = ["not_uploaded", "pending", "quarantined", "verified", "rejected"] as const;
const revision = z.number().int().min(0).max(2_147_483_646);
const commandFields = {
  version: z.literal("v2-brief-progress-command.v1"),
  commandId: uuid,
  trade: z.string().trim().min(1).max(100),
  briefVersion: revision.min(1),
  scopeItemId: uuid,
  taskKey: z.string().trim().min(1).max(200),
  expectedVersion: revision,
  kind: z.enum(["done", "blocked", "changed"]),
  note: z.string().trim().max(2000).refine(text => !text.includes("\0")),
};
const explained = (command: { kind: string; note: string }) => command.kind === "done" || command.note.length > 0;
export const briefProgressCommandV1 = z.strictObject(commandFields).refine(explained);
export const briefProgressCommandV2 = z.strictObject({ ...commandFields,
  version: z.literal("v2-brief-progress-command.v2"), photoId: uuid.optional(),
}).refine(explained);
export const briefProgressCommand = z.union([briefProgressCommandV1, briefProgressCommandV2]);
export const briefProgressPhotoCommandV1 = z.strictObject({
  version: z.literal("v2-brief-progress-photo-command.v1"), commandId: uuid, scopeItemId: uuid,
  fixture: z.enum(["completion-photo", "j3-drainage-photo"]),
});
export type BriefProgressCommand = z.infer<typeof briefProgressCommand>;
export type BriefProgress = Omit<BriefProgressCommand, "version" | "expectedVersion"> & {
  version: number; actorMembershipId: string; recordedAt: Date; photoReference: string | null;
  photoState: typeof progressPhotoStates[number]; thumbnail: string | null;
};
export class BriefProgressError extends Error {
  constructor(readonly code: "BRIEF_PROGRESS_INVALID_COMMAND" | "BRIEF_PROGRESS_EDITOR_REQUIRED" |
    "BRIEF_PROGRESS_COMMAND_CONFLICT" | "BRIEF_PROGRESS_VERSION_CONFLICT" | "BRIEF_PROGRESS_STALE_BRIEF" |
    "BRIEF_PROGRESS_REGENERATE" | "BRIEF_PROGRESS_TASK_NOT_FOUND") { super(code); }
}
const columns = `command_id AS "commandId", trade, brief_version + 1 AS "briefVersion",
  scope_item_id AS "scopeItemId", task_key AS "taskKey", expected_version + 1 AS version,
  kind, note, actor_membership_id AS "actorMembershipId", recorded_at AS "recordedAt",
  photo_reference AS "photoReference"`;

export class BriefProgressRepository {
  constructor(private readonly pool: Pool) {}

  read(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async ({ $client }) => {
      const job = await $client.query("SELECT 1 FROM app.job WHERE (tenant_id, id) = ($1, $2)", [context.tenantId, jobId]);
      if (!job.rowCount) throw new PracticeAccessError("NOT_FOUND");
      const rows = (await $client.query<BriefProgress>(`SELECT ${columns} FROM app.v2_brief_progress
        WHERE (tenant_id, job_id) = ($1, $2) ORDER BY recorded_at, command_id`, [context.tenantId, jobId])).rows;
      return Promise.all(rows.map(row => this.photo($client, context.tenantId, jobId, row)));
    });
  }

  private async photo(client: import("pg").PoolClient, tenantId: string, jobId: string, row: BriefProgress): Promise<BriefProgress> {
    if (!row.photoReference) return { ...row, photoState: "not_uploaded", thumbnail: null };
    const { rows: [photo] } = await client.query<{ state: BriefProgress["photoState"]; bytes: Buffer | null }>(`
      SELECT u.state, s.bytes FROM app.evidence_upload u
      LEFT JOIN app.synthetic_evidence_original s ON (s.tenant_id,s.job_id,s.upload_id,s.object_version_id) =
        (u.tenant_id,u.job_id,u.id,u.object_version_id) AND s.content_type='image/png'
        AND encode(sha256(s.bytes),'hex')=u.expected_sha256 AND octet_length(s.bytes)<=25000000
      WHERE (u.tenant_id,u.job_id,u.id)=($1,$2,$3)`, [tenantId,jobId,row.photoReference]);
    return { ...row, photoState: photo?.state ?? "not_uploaded",
      thumbnail: photo?.bytes && photo.state === "verified" ? `data:image/png;base64,${photo.bytes.toString("base64")}` : null };
  }

  async record(context: VerifiedTenantContext, jobId: string, sessionId: string, input: unknown) {
    const parsed = briefProgressCommand.safeParse(input);
    if (!parsed.success) throw new BriefProgressError("BRIEF_PROGRESS_INVALID_COMMAND");
    const command = parsed.data;
    const photoId = command.version === "v2-brief-progress-command.v2" ? command.photoId ?? null : null;
    return withTenant(this.pool, context, async database => {
      const { $client } = database;
      // Same job lock order as D4: live guard, quote draft, domain writes, audit last.
      await requireLiveJob(database, jobId);
      await $client.query("SELECT 1 FROM app.quote_draft WHERE (tenant_id, job_id) = ($1, $2) FOR UPDATE", [context.tenantId, jobId]);
      const digest = createHash("sha256").update(sessionId).digest("hex");
      const { rows: [actor] } = await $client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [digest]);
      if (!actor?.id) throw new BriefProgressError("BRIEF_PROGRESS_EDITOR_REQUIRED");
      const { rows: [prior] } = await $client.query<BriefProgress>(`SELECT ${columns} FROM app.v2_brief_progress
        WHERE (tenant_id, command_id) = ($1, $2)`, [context.tenantId, command.commandId]);
      if (prior) {
        const { rows: [binding] } = await $client.query<{ jobId: string }>(`SELECT job_id AS "jobId"
          FROM app.v2_brief_progress WHERE (tenant_id, command_id) = ($1, $2)`, [context.tenantId, command.commandId]);
        if (binding?.jobId !== jobId || prior.actorMembershipId !== actor.id || prior.version !== command.expectedVersion + 1 ||
          prior.trade !== command.trade || prior.briefVersion !== command.briefVersion || prior.scopeItemId !== command.scopeItemId ||
          prior.taskKey !== command.taskKey || prior.kind !== command.kind || prior.note !== command.note || prior.photoReference !== photoId) {
          throw new BriefProgressError("BRIEF_PROGRESS_COMMAND_CONFLICT");
        }
        return this.photo($client, context.tenantId, jobId, prior);
      }
      const { rows: [brief] } = await $client.query<{ briefVersion: number; content: { tasks: { scopeItemId: string; taskKey?: string }[] } }>(`
        SELECT expected_version + 1 AS "briefVersion", content FROM app.v2_crew_brief
        WHERE (tenant_id, job_id, trade) = ($1, $2, $3) ORDER BY expected_version DESC LIMIT 1`,
      [context.tenantId, jobId, command.trade]);
      if (!brief || brief.briefVersion !== command.briefVersion) throw new BriefProgressError("BRIEF_PROGRESS_STALE_BRIEF");
      if (brief.content.tasks.some(task => !task.taskKey)) throw new BriefProgressError("BRIEF_PROGRESS_REGENERATE");
      const tasks = brief.content.tasks.filter(task => task.scopeItemId === command.scopeItemId && task.taskKey === command.taskKey);
      if (tasks.length !== 1) throw new BriefProgressError("BRIEF_PROGRESS_TASK_NOT_FOUND");
      // A plan edit since the page loaded makes this brief outdated; recheck under the lock.
      if (!await new CrewBriefRepository(this.pool).isCurrentOn($client, context.tenantId, jobId, command.trade, command.briefVersion)) {
        throw new BriefProgressError("BRIEF_PROGRESS_REGENERATE");
      }
      // Codex P2 4705000559: claim the id in the shared watchdog namespace, so it can't also be another command's.
      await claimCommandIdentity(database, { tenantId: context.tenantId, commandId: command.commandId, jobId,
        kind: "v2.brief_progress.record", requestHash: requestHashFor("v2.brief_progress.record", jobId, command) }).catch(error => {
        throw error instanceof WatchdogError && error.code === "IDEMPOTENCY_CONFLICT" ? new BriefProgressError("BRIEF_PROGRESS_COMMAND_CONFLICT") : error;
      });
      const task = [context.tenantId, jobId, command.trade, command.scopeItemId, command.taskKey];
      const { rows: [head] } = await $client.query<{ current: number }>(`SELECT COALESCE(max(expected_version) + 1, 0) AS current
        FROM app.v2_brief_progress WHERE (tenant_id, job_id, trade, scope_item_id, task_key) = ($1, $2, $3, $4, $5)`, task);
      if (head?.current !== command.expectedVersion) throw new BriefProgressError("BRIEF_PROGRESS_VERSION_CONFLICT");
      const { rows: [saved] } = await $client.query<BriefProgress>(`INSERT INTO app.v2_brief_progress
        (tenant_id, job_id, trade, scope_item_id, task_key, command_id, brief_version, expected_version, kind, note, actor_membership_id, photo_reference)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${columns}`,
      [...task, command.commandId, command.briefVersion - 1, command.expectedVersion, command.kind, command.note, actor.id, photoId]);
      const result = await this.photo($client, context.tenantId, jobId, saved!);
      await appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor.id}`,
        eventType: `v2.progress.${command.kind}_recorded`, subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: command.commandId, scopeItemId: command.scopeItemId,
          ...(photoId && { photoId }), briefVersion: String(command.briefVersion), taskRevision: String(command.expectedVersion + 1) },
          hashes: { trade: createHash("sha256").update(command.trade).digest("hex"),
            taskKey: createHash("sha256").update(command.taskKey).digest("hex") },
          classifications: { action: "operational" } } }]);
      return result;
    });
  }
}
